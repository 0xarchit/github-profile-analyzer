import type { AnalysisModeProfile, AnalysisProgressCallback, EngineData, GitHubCommit, GitHubRepo, SearchSummary, SecuritySummary } from "../types";
import { GitHubClient, GitHubRequestError, UserNotFoundError } from "./client";
import {
  compareRefs,
  fetchCodeFrequency,
  fetchCommitActivity,
  fetchCommitPulls,
  fetchFollowersPage,
  fetchFollowingPage,
  fetchForks,
  fetchGists,
  fetchPublicEventsPage,
  fetchPublicOrgs,
  fetchPunchCard,
  fetchRateLimit,
  fetchReadme,
  fetchRepo,
  fetchSbom,
  fetchSubscriptions,
  fetchUser,
  fetchUserReposPage,
  fetchUserStarred,
} from "./endpoints";
import { fetchAuthoredIssueResponseHours, fetchGraphQLSummary, fetchRepoIssueSummaries, emptyGraphQLSummary } from "./graphql";

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx]!, idx);
    }
  });

  await Promise.all(workers);
  return results;
}

interface CollectionMeta {
  githubRateLimit: Record<string, unknown> | null;
  warnings: string[];
}

export interface CollectionOptions {
  profile?: AnalysisModeProfile;
  onProgress?: AnalysisProgressCallback;
  startedAt?: number;
  signal?: AbortSignal;
}

const emptySearch = (): SearchSummary => ({
  prsOpened: 0,
  prsMerged: 0,
  prsMergedExternal: 0,
  issuesOpened: 0,
  issuesClosed: 0,
  authoredIssues: [],
  reviews: 0,
  caps: [],
});

const repoRank = (repo: GitHubRepo, now: Date) => {
  const pushDate = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
  const daysSincePush = pushDate > 0 ? Math.max(0, (now.getTime() - pushDate) / 86_400_000) : 5_000;
  const recencyBoost = 30 * Math.exp(-daysSincePush / 180);
  return Math.log1p(repo.stargazers_count) * 18 + Math.log1p(repo.forks_count) * 10 + Math.log1p(repo.size) + recencyBoost;
};

const recordFailure = (unavailable: Record<string, string>, label: string, error: unknown) => {
  unavailable[label] = error instanceof Error ? error.message : String(error);
};

async function safe<T>(
  unavailable: Record<string, string>,
  label: string,
  fallback: T,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    recordFailure(unavailable, label, error);
    return fallback;
  }
}

// Edge-compatible base64 decode
const decodeBase64 = (base64: string): string => {
  try {
    const cleaned = base64.replace(/[\n\r\s]/g, "");
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
};

async function fetchAllRepos(client: GitHubClient, username: string, unavailable: Record<string, string>) {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= 10; page += 1) {
    let success = false;
    let batch: GitHubRepo[] = [];
    try {
      const res = await fetchUserReposPage(client, username, page);
      batch = res.data;
      success = true;
    } catch (err) {
      unavailable[`repos-page-${page}`] = err instanceof Error ? err.message : String(err);
      unavailable["repos-incomplete"] = `Repository listing incomplete due to error on page ${page}.`;
      break;
    }
    repos.push(...batch);
    if (success && batch.length < 100) break;
  }
  if (repos.length === 1_000) unavailable["repos-pagination"] = "Repository collection capped at 1,000 items for this run.";
  return repos;
}

/**
 * Batched GraphQL Search: queries 5 search filters inside 1 single GraphQL call
 */
async function fetchSearchSummary(client: GitHubClient, username: string, unavailable: Record<string, string>): Promise<SearchSummary> {
  const summary = emptySearch();
  const GQL_SEARCH = `
    query UserSearchCounts {
      searchPrs: search(query: "author:${username} type:pr", type: ISSUE, first: 1) { issueCount }
      searchPrsMerged: search(query: "author:${username} type:pr is:merged", type: ISSUE, first: 1) { issueCount }
      searchPrsExternal: search(query: "author:${username} type:pr is:merged -user:${username}", type: ISSUE, first: 1) { issueCount }
      searchIssues: search(query: "author:${username} type:issue", type: ISSUE, first: 25) {
        issueCount
        nodes {
          ... on Issue {
            number
            createdAt
            repository { nameWithOwner }
          }
        }
      }
      searchIssuesClosed: search(query: "author:${username} type:issue is:closed", type: ISSUE, first: 1) { issueCount }
    }
  `;
  try {
    const data = await client.graphql<{
      searchPrs: { issueCount: number };
      searchPrsMerged: { issueCount: number };
      searchPrsExternal: { issueCount: number };
      searchIssues: { issueCount: number; nodes: Array<{ number: number; createdAt: string; repository: { nameWithOwner: string } }> };
      searchIssuesClosed: { issueCount: number };
    }>(GQL_SEARCH, {}, "user-search-batch");
    summary.prsOpened = data.searchPrs?.issueCount ?? 0;
    summary.prsMerged = data.searchPrsMerged?.issueCount ?? 0;
    summary.prsMergedExternal = data.searchPrsExternal?.issueCount ?? 0;
    summary.issuesOpened = data.searchIssues?.issueCount ?? 0;
    summary.issuesClosed = data.searchIssuesClosed?.issueCount ?? 0;
    summary.authoredIssues = (data.searchIssues?.nodes ?? []).map((node) => ({
      repository: node.repository?.nameWithOwner ?? "",
      number: node.number,
      createdAt: node.createdAt,
    }));
  } catch (err) {
    recordFailure(unavailable, "search-graphql-batch", err);
  }
  return summary;
}

// In-memory snapshot store for follower/star history (bounded LRU)
const MAX_SNAPSHOT_USERS = 200;
const snapshotStore = new Map<string, EngineData["snapshots"]>();

const recordUserSnapshot = (username: string, snapshots: EngineData["snapshots"]) => {
  if (snapshotStore.size >= MAX_SNAPSHOT_USERS && !snapshotStore.has(username)) {
    const oldest = snapshotStore.keys().next().value;
    if (oldest) snapshotStore.delete(oldest);
  }
  snapshotStore.set(username, snapshots);
};

export async function collectEngineData(
  client: GitHubClient,
  username: string,
  options: CollectionOptions = {},
): Promise<{ data: EngineData; meta: CollectionMeta }> {
  const now = new Date();
  const profile = options.profile ?? {
    id: "deep" as const,
    label: "Deep",
    description: "Full deterministic pass with top-8 repositories and batched GraphQL.",
    expectedCalls: { minimum: 25, maximum: 48 },
    budget: { rest: 45, graphql: 6, search: 4 },
    repositoryLimit: 8,
    forkLimit: 4,
    starRepositoryLimit: 3,
    commitDetailLimit: 100,
  };
  const startedAt = options.startedAt ?? now.getTime();
  const unavailable: Record<string, string> = {};
  const sampled: EngineData["sampled"] = {};
  const warnings: string[] = [];
  const emit = (kind: "phase" | "warning", phase: string, message: string) => options.onProgress?.({
    kind,
    phase,
    message,
    timestamp: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - startedAt),
    budget: client.budget.snapshot(),
  });

  emit("phase", "quota-profile", "Checking GitHub quota and loading the public profile.");
  const rateLimit = await safe(
    unavailable,
    "rate-limit",
    null as Record<string, unknown> | null,
    async () => (await fetchRateLimit(client)).data,
  );
  const resources = (rateLimit as {
    resources?: {
      core?: { remaining?: number; limit?: number };
      search?: { remaining?: number; limit?: number };
      graphql?: { remaining?: number; limit?: number };
    };
  } | null)?.resources;

  const coreRemaining = resources?.core?.remaining ?? 5_000;
  const graphqlRemaining = resources?.graphql?.remaining ?? 5_000;
  const minRequiredCore = profile.budget.rest;
  const minRequiredGraphql = profile.budget.graphql;

  if (coreRemaining < minRequiredCore || graphqlRemaining < minRequiredGraphql) {
    const isUserToken = client["tokenFingerprint"]?.startsWith("oauth:");
    const tokenSource = isUserToken ? "Your linked GitHub account token" : "The server token pool";
    throw new Error(
      `RATE_LIMIT_DEPLETED: ${tokenSource} has only ${coreRemaining} REST / ${graphqlRemaining} GraphQL calls remaining. ${profile.label} mode requires at least ${minRequiredCore} REST / ${minRequiredGraphql} GraphQL quota. Please try again later or select a lighter mode.`,
    );
  }

  let user;
  try {
    user = (await fetchUser(client, username)).data;
  } catch (err) {
    if (err instanceof GitHubRequestError && err.status === 404) {
      throw new UserNotFoundError(username);
    }
    throw err;
  }
  emit("phase", "repository-discovery", "Discovering repositories and ranking the top candidates.");
  const repos = await fetchAllRepos(client, username, unavailable);
  const ranked = [...repos].sort((a, b) => repoRank(b, now) - repoRank(a, now));
  const topRepos = [
    ...ranked.filter((repo) => !repo.fork && !repo.disabled),
    ...ranked.filter((repo) => repo.fork && !repo.disabled),
  ].slice(0, profile.repositoryLimit);

  emit("phase", "public-activity", "Collecting contribution history, public activity, social edges, and search totals.");
  const [graphql, events, orgs, gists, subscriptions, followers, following, userStarred, profileReadmeRaw, search] = await Promise.all([
    safe(unavailable, "graphql-summary", emptyGraphQLSummary(), async () => fetchGraphQLSummary(client, username, now)),
    safe(unavailable, "events", [], async () => (await fetchPublicEventsPage(client, username, 1)).data),
    safe(unavailable, "orgs", [], async () => (await fetchPublicOrgs(client, username)).data),
    safe(unavailable, "gists", [], async () => (await fetchGists(client, username)).data),
    safe(unavailable, "subscriptions", [], async () => (await fetchSubscriptions(client, username)).data),
    safe(unavailable, "followers", [], async () => (await fetchFollowersPage(client, username, 1)).data.map((i) => i.login)),
    safe(unavailable, "following", [], async () => (await fetchFollowingPage(client, username, 1)).data.map((i) => i.login)),
    safe(unavailable, "user-starred", [], async () => (await fetchUserStarred(client, username)).data),
    safe(
      unavailable,
      "profile-readme",
      null as null | { content: string; encoding: string; size: number },
      async () => (await fetchReadme(client, username, username)).data,
    ),
    fetchSearchSummary(client, username, unavailable),
  ]);
  search.reviews = graphql.totalPullRequestReviewContributions;
  let profileReadmeText = "";
  if (profileReadmeRaw?.encoding === "base64") {
    profileReadmeText = decodeBase64(profileReadmeRaw.content);
  }

  const languages: EngineData["languages"] = {};
  const releases: EngineData["releases"] = {};
  const branches: EngineData["branches"] = {};
  const commits: EngineData["commits"] = {};
  const commitActivity: EngineData["commitActivity"] = {};
  const codeFrequency: EngineData["codeFrequency"] = {};
  const participation: EngineData["participation"] = {};
  const punchCards: EngineData["punchCards"] = {};
  const contributors: EngineData["contributors"] = {};
  const qualities: EngineData["qualities"] = {};
  const security: EngineData["security"] = {};

  emit("phase", "repository-enrichment", `Enriching ${topRepos.length} top repositories with languages, releases, branches, commits, stats, and quality checks.`);

  // ─── Batched GraphQL for Top Repositories (Languages, Releases, Branches, README, CI, Commits) ───
  const batchSize = 4;
  const repoBatches: GitHubRepo[][] = [];
  for (let i = 0; i < topRepos.length; i += batchSize) {
    repoBatches.push(topRepos.slice(i, i + batchSize));
  }

  await Promise.all(
    repoBatches.map(async (batch, batchIndex) => {
      const offset = batchIndex * batchSize;
      const query = `
        query RepoEnrichmentBatch_${offset} {
          ${batch.map((repo, i) => `
            repo_${offset + i}: repository(owner: "${repo.owner.login}", name: "${repo.name}") {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges { size, node { name } }
              }
              releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
                nodes {
                  tagName
                  publishedAt
                  isPrerelease
                  releaseAssets(first: 10) {
                    nodes {
                      downloadCount
                    }
                  }
                }
              }
              branches: refs(refPrefix: "refs/heads/", first: 1) {
                totalCount
              }
              readme: object(expression: "HEAD:README.md") {
                ... on Blob { byteSize, text }
              }
              ciWorkflows: object(expression: "HEAD:.github/workflows") {
                ... on Tree { entries { name } }
              }
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 100) {
                      nodes {
                        oid
                        message
                        committedDate
                        author { user { login } }
                      }
                    }
                  }
                }
              }
            }
          `).join("\n")}
        }
      `;

      try {
        const batchData = await client.graphql<Record<string, any>>(query, {}, `repos-batch-${offset}`);
        batch.forEach((repo, i) => {
          const key = repo.full_name;
          const d = batchData[`repo_${offset + i}`];
          if (!d) return;

          // Languages mapping
          const langMap: Record<string, number> = {};
          for (const edge of d.languages?.edges ?? []) {
            if (edge.node?.name) langMap[edge.node.name] = edge.size ?? 0;
          }
          languages[key] = langMap;

          // Releases mapping
          releases[key] = (d.releases?.nodes ?? []).map((r: any) => ({
            name: r.tagName ?? "",
            published_at: r.publishedAt ?? "",
            tag_name: r.tagName ?? "",
            prerelease: Boolean(r.isPrerelease),
            assets: (r.releaseAssets?.nodes ?? []).map((a: any) => ({
              download_count: a.downloadCount ?? 0,
            })),
          }));

          // Branches mapping
          const branchCount = d.branches?.totalCount ?? 1;
          branches[key] = Array.from({ length: Math.min(10, branchCount) }, (_, bi) => ({
            name: bi === 0 ? repo.default_branch : `branch-${bi}`,
            protected: false,
          }));

          // Quality mapping
          qualities[key] = {
            readmeBytes: d.readme?.byteSize ?? 0,
            readmeText: d.readme?.text ?? "",
            licensePresent: Boolean(repo.license),
            testsPresent: false,
            ciPresent: (d.ciWorkflows?.entries?.length ?? 0) > 0,
          };

          // Commits mapping
          const commitNodes = d.defaultBranchRef?.target?.history?.nodes ?? [];
          commits[key] = commitNodes.map((cn: any) => ({
            sha: cn.oid,
            html_url: `${repo.html_url}/commit/${cn.oid}`,
            commit: {
              message: cn.message ?? "",
              author: { name: cn.author?.user?.login ?? username, date: cn.committedDate ?? "" },
              committer: { name: cn.author?.user?.login ?? username, date: cn.committedDate ?? "" },
              verification: { verified: false, reason: "unsigned" },
            },
            author: { login: cn.author?.user?.login ?? username },
          }));
        });
      } catch (err) {
        recordFailure(unavailable, `repos-batch-${offset}-graphql`, err);
      }
    }),
  );

  // ─── Parallel REST Stats (Only 4 essential statistical endpoints per repo) ───
  const isQuick = profile.id === "quick";
  await mapConcurrent(topRepos, 4, async (repo) => {
    const owner = repo.owner.login;
    const key = repo.full_name;

    const results = await Promise.all([
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-activity`, [], async () => (await fetchCommitActivity(client, owner, repo.name)).data),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-frequency`, [], async () => (await fetchCodeFrequency(client, owner, repo.name)).data),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-punch`, [], async () => (await fetchPunchCard(client, owner, repo.name)).data),
      safe(unavailable, `${key}-sbom`, null as null | { sbom?: { packages?: SecuritySummary["sbomPackages"] } }, async () => (await fetchSbom(client, owner, repo.name)).data),
    ]);

    if (!isQuick) {
      commitActivity[key] = results[0];
      codeFrequency[key] = results[1];
      punchCards[key] = results[2];
    }
    const sbom = results[3];

    security[key] = {
      sbomPackages: sbom?.sbom?.packages ?? [],
      codeScanning: null,
      dependabot: null,
      codeScanningEnabled: false,
      dependabotEnabled: false,
      checks: (qualities[key]?.ciPresent ? [{ conclusion: "success", status: "completed" }] : []) as SecuritySummary["checks"],
    };
  });

  sampled["repository-enrichment"] = {
    size: topRepos.length,
    note: `Moderate repository rules are capped at the top ${profile.repositoryLimit} repositories in ${profile.label.toLowerCase()} mode.`,
  };

  emit("phase", "issue-review-enrichment", "Collecting issue response, review comment, security, and workflow evidence.");
  const issues = await safe(unavailable, "repo-issue-graphql", {}, async () => fetchRepoIssueSummaries(client, topRepos));
  const authoredIssueResponseHours = await safe(
    unavailable,
    "authored-issue-responses",
    [],
    async () => fetchAuthoredIssueResponseHours(client, search.authoredIssues),
  );
  const reviewComments: EngineData["reviewComments"] = graphql.reviews.map((r) => ({
    repository: "",
    pullRequestNumber: 0,
    body: r.title,
    createdAt: r.occurredAt,
  }));

  emit("phase", "expensive-sampling", "Running bounded fork and commit comparisons.");
  const forks: EngineData["forks"] = {};
  const ownReposByForks = repos
    .filter((repo) => !repo.fork && repo.forks_count > 0)
    .sort((a, b) => b.forks_count - a.forks_count)
    .slice(0, profile.forkLimit);
  await mapConcurrent(ownReposByForks, 4, async (repo) => {
    forks[repo.full_name] = await safe(
      unavailable,
      `${repo.full_name}-forks`,
      [],
      async () => (await fetchForks(client, repo.owner.login, repo.name)).data,
    );
  });
  sampled["fork-activity"] = {
    size: ownReposByForks.length,
    note: `Fork activity uses the ${profile.forkLimit} most-forked owned repositories.`,
  };

  const forkComparisons: EngineData["forkComparisons"] = {};
  const contributedForks = repos.filter((repo) => repo.fork).slice(0, profile.forkLimit);
  for (const repo of contributedForks) {
    try {
      const detail = (await fetchRepo(client, repo.owner.login, repo.name)).data;
      if (!detail.parent) continue;
      const [parentOwner, parentName] = detail.parent.full_name.split("/");
      if (!parentOwner || !parentName) continue;
      const comparison = (
        await compareRefs(
          client,
          parentOwner,
          parentName,
          detail.parent.default_branch,
          `${username}:${repo.default_branch}`,
        )
      ).data;
      const latest = commits[repo.full_name]?.[0];
      const prCount = latest
        ? (await fetchCommitPulls(client, repo.owner.login, repo.name, latest.sha)).data.length
        : 0;
      forkComparisons[repo.full_name] = { ...comparison, prCount };
    } catch (error) {
      recordFailure(unavailable, `${repo.full_name}-fork-comparison`, error);
    }
  }
  sampled["fork-comparisons"] = {
    size: Object.keys(forkComparisons).length,
    note: `Fork divergence checks are capped at ${Math.min(5, profile.forkLimit)} forks.`,
  };

  const stargazers: EngineData["stargazers"] = {};
  const commitDetails: Record<string, GitHubCommit> = {};

  const totalStars = repos
    .filter((repo) => !repo.fork)
    .reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const history = snapshotStore.get(username.toLowerCase()) ?? [];
  const nextHistory = [
    ...history,
    { at: now.toISOString(), followers: user.followers, stars: totalStars, orgs: orgs.map((org) => org.login) },
  ].slice(-50);
  recordUserSnapshot(username.toLowerCase(), nextHistory);

  const budgetSnap = client.budget.snapshot();
  const totalCallsUsed = budgetSnap.rest.used + budgetSnap.graphql.used + budgetSnap.search.used;
  emit("phase", "collection-complete", `GitHub collection complete after ${totalCallsUsed} API calls [REST ${budgetSnap.rest.used}/${profile.budget.rest} GQL ${budgetSnap.graphql.used}/${profile.budget.graphql}].`);

  return {
    data: {
      username,
      now,
      user,
      repos,
      topRepos,
      graphql,
      search,
      events,
      orgs,
      gists,
      subscriptions,
      followers,
      following,
      userStarred,
      profileReadme: {
        present: Boolean(profileReadmeRaw),
        bytes: profileReadmeRaw?.size ?? 0,
        text: profileReadmeText,
      },
      languages,
      releases,
      branches,
      commits,
      commitDetails,
      commitActivity,
      codeFrequency,
      participation,
      punchCards,
      contributors,
      qualities,
      issues,
      security,
      forks,
      stargazers,
      forkComparisons,
      authoredIssueResponseHours,
      reviewComments,
      unavailable,
      sampled,
      snapshots: nextHistory,
    },
    meta: {
      githubRateLimit: rateLimit,
      warnings,
    },
  };
}
