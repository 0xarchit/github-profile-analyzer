import type { AnalysisModeProfile, AnalysisProgressCallback, EngineData, GitHubCommit, GitHubRepo, RepoQuality, SearchSummary, SecuritySummary } from "../types";
import { BudgetExceededError, GitHubClient, GitHubRequestError, isUnavailableStatus } from "./client";
import {
  compareRefs,
  fetchBranches,
  fetchCheckRuns,
  fetchCodeFrequency,
  fetchCodeScanningAlerts,
  fetchCommit,
  fetchCommitActivity,
  fetchCommitPulls,
  fetchCommits,
  fetchContentPath,
  fetchContributors,
  fetchDependabotAlerts,
  fetchFollowersPage,
  fetchFollowingPage,
  fetchForks,
  fetchGists,
  fetchLanguages,
  fetchParticipation,
  fetchPublicEventsPage,
  fetchPublicOrgs,
  fetchPullReviewComments,
  fetchPunchCard,
  fetchRateLimit,
  fetchReadme,
  fetchReleases,
  fetchRepo,
  fetchSbom,
  fetchStargazers,
  fetchSubscriptions,
  fetchUser,
  fetchUserReposPage,
  fetchUserStarred,
  searchIssues,
} from "./endpoints";
import { fetchAuthoredIssueResponseHours, fetchGraphQLSummary, fetchRepoIssueSummaries } from "./graphql";

interface CollectionMeta {
  githubRateLimit: Record<string, unknown> | null;
  warnings: string[];
}

interface CollectionOptions {
  profile?: AnalysisModeProfile;
  onProgress?: AnalysisProgressCallback;
  startedAt?: number;
}

const emptySearch = (): SearchSummary => ({
  prsOpened: 0,
  prsMerged: 0,
  prsMergedExternal: 0,
  issuesOpened: 0,
  issuesClosed: 0,
  reviews: 0,
  authoredIssues: [],
  caps: [],
});

const repoRank = (repo: GitHubRepo, now: Date) => {
  const daysSincePush = repo.pushed_at ? Math.max(0, (now.getTime() - new Date(repo.pushed_at).getTime()) / 86_400_000) : 5_000;
  return Math.log1p(repo.stargazers_count) * 18
    + Math.log1p(repo.forks_count) * 10
    + Math.log1p(repo.size)
    + 30 * Math.exp(-daysSincePush / 180);
};

const parseRepoFromApiUrl = (url: string) => {
  const parts = url.split("/");
  return `${parts.at(-2) ?? ""}/${parts.at(-1) ?? ""}`;
};

const recordFailure = (unavailable: Record<string, string>, label: string, error: unknown) => {
  if (error instanceof BudgetExceededError) unavailable[label] = error.message;
  else if (error instanceof GitHubRequestError) unavailable[label] = `${error.status}: ${error.message}`;
  else unavailable[label] = error instanceof Error ? error.message : String(error);
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
    recordFailure(unavailable, label, error);
    return fallback;
  }
}

// Edge-compatible base64 decode (replaces node:buffer)
const decodeBase64 = (base64: string): string => {
  try {
    // Remove newlines and whitespace
    const cleaned = base64.replace(/[\n\r\s]/g, "");
    // Use atob which is available in Edge runtime
    const binary = atob(cleaned);
    // Convert to UTF-8 string
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
    const batch = await safe(unavailable, `repos-page-${page}`, [] as GitHubRepo[], async () =>
      (await fetchUserReposPage(client, username, page)).data,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  if (repos.length === 1_000) unavailable["repos-pagination"] = "Repository collection capped at 1,000 items for this run.";
  return repos;
}

async function fetchThreePages<T>(
  operation: (page: number) => Promise<{ data: T[] }>,
  unavailable: Record<string, string>,
  label: string,
) {
  const all: T[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await safe(unavailable, `${label}-page-${page}`, [] as T[], async () => (await operation(page)).data);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function fetchSearchSummary(client: GitHubClient, username: string, unavailable: Record<string, string>): Promise<SearchSummary> {
  const summary = emptySearch();
  const queries = await Promise.all([
    safe(unavailable, "search-prs", { total_count: 0, items: [] }, async () =>
      (await searchIssues(client, `author:${username} type:pr`, 1)).data,
    ),
    safe(unavailable, "search-prs-merged", { total_count: 0, items: [] }, async () =>
      (await searchIssues(client, `author:${username} type:pr is:merged`, 1)).data,
    ),
    safe(unavailable, "search-prs-external", { total_count: 0, items: [] }, async () =>
      (await searchIssues(client, `author:${username} type:pr is:merged -user:${username}`, 1)).data,
    ),
    safe(unavailable, "search-issues", { total_count: 0, items: [] }, async () =>
      (await searchIssues(client, `author:${username} type:issue`, 100)).data,
    ),
    safe(unavailable, "search-issues-closed", { total_count: 0, items: [] }, async () =>
      (await searchIssues(client, `author:${username} type:issue is:closed`, 1)).data,
    ),
  ]);
  summary.prsOpened = queries[0].total_count;
  summary.prsMerged = queries[1].total_count;
  summary.prsMergedExternal = queries[2].total_count;
  summary.issuesOpened = queries[3].total_count;
  summary.issuesClosed = queries[4].total_count;
  summary.authoredIssues = queries[3].items.map((item) => ({
    repository: parseRepoFromApiUrl(item.repository_url),
    number: item.number,
    createdAt: item.created_at,
  }));
  if (summary.prsOpened >= 1_000) summary.caps.push("PR search reached GitHub's 1,000-result cap.");
  if (summary.issuesOpened >= 1_000) summary.caps.push("Issue search reached GitHub's 1,000-result cap.");
  return summary;
}

async function pathExists(
  client: GitHubClient,
  owner: string,
  repo: string,
  paths: string[],
  unavailable: Record<string, string>,
) {
  for (const path of paths) {
    try {
      await fetchContentPath(client, owner, repo, path);
      return true;
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        recordFailure(unavailable, `${owner}/${repo}-content-budget`, error);
        return false;
      }
      if (!isUnavailableStatus(error)) recordFailure(unavailable, `${owner}/${repo}-content-${path}`, error);
    }
  }
  return false;
}

async function fetchQuality(client: GitHubClient, repo: GitHubRepo, unavailable: Record<string, string>): Promise<RepoQuality> {
  const owner = repo.owner.login;
  const readme = await safe(
    unavailable,
    `${repo.full_name}-readme`,
    null as null | { content: string; encoding: string; size: number },
    async () => (await fetchReadme(client, owner, repo.name)).data,
  );
  const [testsPresent, ciPresent] = await Promise.all([
    pathExists(client, owner, repo.name, ["test", "tests", "__tests__", "spec"], unavailable),
    pathExists(client, owner, repo.name, [".github/workflows"], unavailable),
  ]);
  let readmeText = "";
  if (readme?.content && readme.encoding === "base64") {
    readmeText = decodeBase64(readme.content);
  }
  return {
    readmeBytes: readme?.size ?? 0,
    readmeText,
    licensePresent: Boolean(repo.license),
    testsPresent,
    ciPresent,
  };
}

async function fetchSecurity(client: GitHubClient, repo: GitHubRepo, unavailable: Record<string, string>): Promise<SecuritySummary> {
  const owner = repo.owner.login;
  const sbom = await safe(
    unavailable,
    `${repo.full_name}-sbom`,
    null as null | { sbom?: { packages?: SecuritySummary["sbomPackages"] } },
    async () => (await fetchSbom(client, owner, repo.name)).data,
  );
  let codeScanning: SecuritySummary["codeScanning"] = null;
  let dependabot: SecuritySummary["dependabot"] = null;
  let codeScanningEnabled = false;
  let dependabotEnabled = false;
  try {
    codeScanning = (await fetchCodeScanningAlerts(client, owner, repo.name)).data;
    codeScanningEnabled = true;
  } catch (error) {
    if (!isUnavailableStatus(error, [403, 404])) recordFailure(unavailable, `${repo.full_name}-code-scanning`, error);
  }
  try {
    dependabot = (await fetchDependabotAlerts(client, owner, repo.name)).data;
    dependabotEnabled = true;
  } catch (error) {
    if (!isUnavailableStatus(error, [403, 404])) recordFailure(unavailable, `${repo.full_name}-dependabot`, error);
  }
  const checks = await safe(
    unavailable,
    `${repo.full_name}-checks`,
    [] as SecuritySummary["checks"],
    async () => (await fetchCheckRuns(client, owner, repo.name, repo.default_branch)).data.check_runs,
  );
  return {
    sbomPackages: sbom?.sbom?.packages ?? [],
    codeScanning,
    dependabot,
    codeScanningEnabled,
    dependabotEnabled,
    checks,
  };
}

// In-memory snapshot store for follower/star history
const snapshotStore = new Map<string, EngineData["snapshots"]>();

export async function collectEngineData(
  client: GitHubClient,
  username: string,
  options: CollectionOptions = {},
): Promise<{ data: EngineData; meta: CollectionMeta }> {
  const now = new Date();
  const profile = options.profile ?? {
    id: "deep" as const,
    label: "Deep",
    description: "Full deterministic pass.",
    expectedCalls: { minimum: 110, maximum: 350 },
    budget: { rest: 350, graphql: 8, search: 10 },
    repositoryLimit: 10,
    forkLimit: 5,
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
    resources?: { core?: { remaining?: number }; search?: { remaining?: number } };
  } | null)?.resources;
  const allowExpensive = profile.commitDetailLimit > 0 && (resources?.core?.remaining ?? 5_000) >= 200;
  const allowSearch = (resources?.search?.remaining ?? 30) >= 5;
  if (!allowExpensive) {
    const reason = profile.commitDetailLimit === 0
      ? `${profile.label} mode disables expensive Phase C history sampling.`
      : "Core quota is below 200; Phase C sampling was skipped.";
    warnings.push(reason);
    emit("warning", "quota-profile", reason);
  }
  if (!allowSearch) {
    warnings.push("Search quota is below 5; search-derived rules were degraded.");
    emit("warning", "quota-profile", "Search quota is below 5; search-derived rules will be degraded.");
  }

  const user = (await fetchUser(client, username)).data;
  emit("phase", "repository-discovery", "Discovering repositories and ranking the top candidates.");
  const repos = await fetchAllRepos(client, username, unavailable);
  const ranked = [...repos].sort((a, b) => repoRank(b, now) - repoRank(a, now));
  const topRepos = [
    ...ranked.filter((repo) => !repo.fork && !repo.disabled),
    ...ranked.filter((repo) => repo.fork && !repo.disabled),
  ].slice(0, profile.repositoryLimit);

  emit("phase", "public-activity", "Collecting contribution history, public activity, social edges, and search totals.");
  const [graphql, events, orgs, gists, subscriptions, followers, following, userStarred, profileReadmeRaw, search] = await Promise.all([
    fetchGraphQLSummary(client, username, now),
    fetchThreePages((page) => fetchPublicEventsPage(client, username, page), unavailable, "events"),
    safe(unavailable, "orgs", [], async () => (await fetchPublicOrgs(client, username)).data),
    safe(unavailable, "gists", [], async () => (await fetchGists(client, username)).data),
    safe(unavailable, "subscriptions", [], async () => (await fetchSubscriptions(client, username)).data),
    fetchThreePages(
      async (page) => ({ data: (await fetchFollowersPage(client, username, page)).data.map((item) => item.login) }),
      unavailable,
      "followers",
    ),
    fetchThreePages(
      async (page) => ({ data: (await fetchFollowingPage(client, username, page)).data.map((item) => item.login) }),
      unavailable,
      "following",
    ),
    safe(unavailable, "user-starred", [], async () => (await fetchUserStarred(client, username)).data),
    safe(
      unavailable,
      "profile-readme",
      null as null | { content: string; encoding: string; size: number },
      async () => (await fetchReadme(client, username, username)).data,
    ),
    allowSearch ? fetchSearchSummary(client, username, unavailable) : Promise.resolve(emptySearch()),
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
  await Promise.all(topRepos.map(async (repo) => {
    const owner = repo.owner.login;
    const key = repo.full_name;
    const isQuick = profile.id === "quick";
    const results = await Promise.all([
      safe(unavailable, `${key}-languages`, {}, async () => (await fetchLanguages(client, owner, repo.name)).data),
      safe(unavailable, `${key}-releases`, [], async () => (await fetchReleases(client, owner, repo.name)).data),
      safe(unavailable, `${key}-branches`, [], async () => (await fetchBranches(client, owner, repo.name)).data),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-commits`, [], async () => (await fetchCommits(client, owner, repo.name, username, 100)).data),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-activity`, [], async () => (await fetchCommitActivity(client, owner, repo.name)).data),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-frequency`, [], async () => (await fetchCodeFrequency(client, owner, repo.name)).data),
      isQuick
        ? Promise.resolve({ all: [], owner: [] })
        : safe(
            unavailable,
            `${key}-participation`,
            { all: [], owner: [] },
            async () => (await fetchParticipation(client, owner, repo.name)).data,
          ),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-punch`, [], async () => (await fetchPunchCard(client, owner, repo.name)).data),
      isQuick
        ? Promise.resolve([])
        : safe(unavailable, `${key}-contributors`, [], async () => (await fetchContributors(client, owner, repo.name)).data),
      fetchQuality(client, repo, unavailable),
    ]);
    languages[key] = results[0];
    releases[key] = results[1];
    branches[key] = results[2];
    commits[key] = results[3];
    commitActivity[key] = results[4];
    codeFrequency[key] = results[5];
    participation[key] = results[6];
    punchCards[key] = results[7];
    contributors[key] = results[8];
    qualities[key] = results[9];
  }));
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
  const reviewComments = (await Promise.all(topRepos.map(async (repo) => {
    const comments = await safe(
      unavailable,
      `${repo.full_name}-review-comments`,
      [],
      async () => (await fetchPullReviewComments(client, repo.owner.login, repo.name)).data,
    );
    return comments
      .filter((comment) => comment.user?.login.toLowerCase() === username.toLowerCase())
      .map((comment) => ({
        repository: repo.full_name,
        pullRequestNumber: Number(comment.pull_request_url.split("/").at(-1) ?? 0),
        body: comment.body,
        createdAt: comment.created_at,
      }));
  }))).flat();

  await Promise.all(topRepos.map(async (repo) => {
    security[repo.full_name] = await fetchSecurity(client, repo, unavailable);
  }));

  emit("phase", "expensive-sampling", "Running bounded fork, stargazer, and per-commit detail sampling; this is the slowest phase.");
  const forks: EngineData["forks"] = {};
  const ownReposByForks = repos
    .filter((repo) => !repo.fork && repo.forks_count > 0)
    .sort((a, b) => b.forks_count - a.forks_count)
    .slice(0, profile.forkLimit);
  await Promise.all(ownReposByForks.map(async (repo) => {
    forks[repo.full_name] = await safe(
      unavailable,
      `${repo.full_name}-forks`,
      [],
      async () => (await fetchForks(client, repo.owner.login, repo.name)).data,
    );
  }));
  sampled["fork-activity"] = {
    size: ownReposByForks.length,
    note: "Fork activity uses the five most-forked owned repositories.",
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
    note: "Fork divergence checks are capped at five forks.",
  };

  const stargazers: EngineData["stargazers"] = {};
  const starRepos = ranked.filter((repo) => !repo.fork && repo.stargazers_count > 0).slice(0, profile.starRepositoryLimit);
  if (allowExpensive) {
    await Promise.all(starRepos.map(async (repo) => {
      stargazers[repo.full_name] = await safe(
        unavailable,
        `${repo.full_name}-stargazers`,
        [],
        async () => (await fetchStargazers(client, repo.owner.login, repo.name)).data,
      );
    }));
  } else {
    unavailable["stargazers-phase-c"] = profile.starRepositoryLimit === 0
      ? `${profile.label} mode skips stargazer history.`
      : "Skipped because live core quota was below 200.";
  }
  sampled["stargazers"] = {
    size: Object.values(stargazers).reduce((sum, items) => sum + items.length, 0),
    note: "Star history uses at most the first 100 stargazers on the top three repositories.",
  };

  const commitDetails: Record<string, GitHubCommit> = {};
  if (allowExpensive) {
    const detailCandidates = starRepos
      .flatMap((repo) => (commits[repo.full_name] ?? []).map((commit) => ({ repo, commit })))
      .slice(0, profile.commitDetailLimit);
    for (const { repo, commit } of detailCandidates) {
      try {
        commitDetails[commit.sha] = (await fetchCommit(client, repo.owner.login, repo.name, commit.sha)).data;
      } catch (error) {
        recordFailure(unavailable, `${repo.full_name}-commit-${commit.sha.slice(0, 7)}`, error);
        if (error instanceof BudgetExceededError) break;
      }
    }
  } else {
    unavailable["commit-details-phase-c"] = "Skipped because live core quota was below 200.";
  }
  sampled["commit-details"] = {
    size: Object.keys(commitDetails).length,
    note: "Per-commit diff signals use at most 100 commits across the top three repositories.",
  };

  const totalStars = repos
    .filter((repo) => !repo.fork)
    .reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const history = snapshotStore.get(username.toLowerCase()) ?? [];
  const nextHistory = [
    ...history,
    { at: now.toISOString(), followers: user.followers, stars: totalStars, orgs: orgs.map((org) => org.login) },
  ].slice(-50);
  snapshotStore.set(username.toLowerCase(), nextHistory);
  emit("phase", "collection-complete", `GitHub collection complete after ${client.budget.snapshot().rest.used + client.budget.snapshot().graphql.used + client.budget.snapshot().search.used} API calls.`);

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
    meta: { githubRateLimit: rateLimit, warnings },
  };
}
