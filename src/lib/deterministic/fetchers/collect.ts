interface RepoBatchGqlNode {
  languages?: { edges?: Array<{ size?: number; node?: { name?: string } }> };
  releases?: {
    nodes?: Array<{
      tagName?: string;
      publishedAt?: string;
      isPrerelease?: boolean;
      releaseAssets?: { nodes?: Array<{ downloadCount?: number }> };
    }>;
  };
  readme?: { byteSize?: number; text?: string } | null;
  rootTree?: { entries?: Array<{ name?: string; type?: string }> } | null;
  githubDir?: { entries?: Array<{ name?: string }> } | null;
  contributing?: { byteSize?: number } | null;
  codeOfConduct?: { byteSize?: number } | null;
  securityPolicy?: { byteSize?: number } | null;
  funding?: { byteSize?: number } | null;
  issueTemplates?: { entries?: Array<{ name?: string }> } | null;
  ciWorkflows?: { entries?: Array<{ name?: string }> } | null;
  docsDir?: { entries?: Array<{ name?: string }> } | null;
  recentForks?: {
    nodes?: Array<{
      name?: string;
      owner?: { login?: string } | null;
      pushedAt?: string | null;
      stargazerCount?: number;
      forkCount?: number;
      createdAt?: string;
      updatedAt?: string;
    }>;
  } | null;
  defaultBranchRef?: {
    name?: string;
    target?: {
      statusCheckRollup?: { state?: string } | null;
      history?: {
        totalCount?: number;
        nodes?: HistoryNodeLite[];
      };
    };
  };
}

import type { AnalysisModeProfile, AnalysisProgressCallback, EngineData, GitHubCommit, GitHubRepo, SearchSummary, SecuritySummary } from "../types";
import { GitHubClient, GitHubRequestError, UserNotFoundError } from "./client";
import {
  compareRefs,
  fetchCommitPulls,
  fetchPublicEventsPage,
  fetchCommunityProfile,
  fetchActionsRuns,
  fetchPublicGists,
  fetchPublicOrgs,
  fetchRateLimit,
  fetchSubscriptions,
} from "./endpoints";
import { fetchAuthoredIssueResponseHours, fetchProfileCore, fetchRepoIssueSummaries, type ProfileCoreResult } from "./graphql";

// ─── Derived statistics computed from GraphQL commit history (replaces /stats/* REST endpoints) ───

interface HistoryNodeLite {
  oid?: string;
  messageHeadline?: string;
  committedDate?: string;
  authoredDate?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  author?: { user?: { login?: string } | null } | null;
  signature?: { isValid?: boolean } | null;
  parents?: { totalCount?: number } | null;
}

const weekStartSec = (iso: string): number | null => {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  const sundayUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - date.getUTCDay() * 86_400_000;
  return sundayUtc / 1_000;
};

function deriveWeeklySeries(commits: HistoryNodeLite[], ownerLogin: string) {
  const weekly = new Map<number, { total: number; days: number[]; owner: number }>();
  const frequency = new Map<number, { additions: number; deletions: number }>();
  for (const commit of commits) {
    if (!commit.committedDate) continue;
    const week = weekStartSec(commit.committedDate);
    if (week === null) continue;
    const entry = weekly.get(week) ?? { total: 0, days: [0, 0, 0, 0, 0, 0, 0], owner: 0 };
    const day = new Date(commit.committedDate).getUTCDay();
    entry.total += 1;
    entry.days[day] = (entry.days[day] ?? 0) + 1;
    if ((commit.author?.user?.login ?? "").toLowerCase() === ownerLogin.toLowerCase()) {
      entry.owner += 1;
    }
    weekly.set(week, entry);
    const freq = frequency.get(week) ?? { additions: 0, deletions: 0 };
    freq.additions += Math.max(0, commit.additions ?? 0);
    freq.deletions += Math.abs(commit.deletions ?? 0);
    frequency.set(week, freq);
  }
  const sortedWeeks = [...weekly.keys()].sort((a, b) => a - b);
  const commitActivity = sortedWeeks.map((week) => ({ week, total: weekly.get(week)!.total, days: weekly.get(week)!.days }));
  const codeFrequency = sortedWeeks.map((week) => [week, frequency.get(week)!.additions, frequency.get(week)!.deletions] as [number, number, number]);
  const last52 = sortedWeeks.slice(-52);
  const participation = {
    all: last52.map((week) => weekly.get(week)!.total),
    owner: last52.map((week) => weekly.get(week)!.owner),
  };
  return { commitActivity, codeFrequency, participation };
}

function derivePunchCard(commits: HistoryNodeLite[]): Array<[number, number, number]> {
  const buckets = new Map<number, number>();
  for (const commit of commits) {
    if (!commit.committedDate) continue;
    const date = new Date(commit.committedDate);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.getUTCDay() * 24 + date.getUTCHours();
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([slot, count]) => [Math.floor(slot / 24), slot % 24, count] as [number, number, number]);
}

function deriveContributors(commits: HistoryNodeLite[], username: string): Array<{ login?: string; contributions: number }> {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const login = commit.author?.user?.login ?? username;
    counts.set(login, (counts.get(login) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([login, contributions]) => ({ login: login === username ? username : login, contributions }))
    .sort((a, b) => b.contributions - a.contributions)
    .slice(0, 100);
}

interface CollectionMeta {
  githubRateLimit: Record<string, unknown> | null;
  warnings: string[];
}

export interface CollectionOptions {
  profile?: AnalysisModeProfile;
  authTier?: "USER-OAUTH" | "TOKEN-POOL";
  onProgress?: AnalysisProgressCallback;
  startedAt?: number;
  signal?: AbortSignal;
}

const emptySearch = (): SearchSummary => ({
  prsOpened: 0,
  prsMerged: 0,
  prsMergedExternal: 0,
  prsOpenedExternal: 0,
  issuesOpened: 0,
  issuesClosed: 0,
  authoredIssues: [],
  reviews: 0,
  discussionsAuthored: 0,
  discussionsAnswered: 0,
  commenterEvents: 0,
  highResonanceIssues: 0,
  caps: [],
});

const repoRank = (repo: GitHubRepo, now: Date) => {
  const pushDate = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
  const daysSincePush = pushDate > 0 ? Math.max(0, (now.getTime() - pushDate) / 86_400_000) : 5_000;
  const recencyBoost = 30 * Math.exp(-daysSincePush / 180);
  return Math.log1p(repo.stargazers_count) * 18 + Math.log1p(repo.forks_count) * 10 + Math.log1p(repo.size) + recencyBoost;
};


interface PinnedItem { nameWithOwner: string }

async function fetchPinnedEnrichment(client: GitHubClient, pinnedItems: PinnedItem[]): Promise<Record<string, unknown>> {
  if (!pinnedItems.length) return {};
  const q = `query {
    ${pinnedItems
      .map((p, i) => {
        const [owner, name] = p.nameWithOwner.split("/");
        return `
    pin_${i}: repository(owner:"${owner}", name:"${name}") {
      description primaryLanguage { name } stargazerCount forkCount pushedAt
      readme: object(expression:"HEAD:README.md") { ... on Blob { byteSize } }
      licenseInfo { spdxId }
      repositoryTopics(first:10) { nodes { topic { name } } }
    }`;
      })
      .join("\n")}
  }`;
  return client.graphql(q, {}, "pinned-enrichment");
}

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

const DEPENDENCY_MANIFEST_MATCHERS: Array<[RegExp, string]> = [
  [/^package\.json$|^yarn\.lock$|^pnpm-lock\.yaml$|^package-lock\.json$/i, "npm"],
  [/^requirements.*\.txt$|^pyproject\.toml$|^setup\.py$|^Pipfile$|^poetry\.lock$/i, "pip"],
  [/^go\.(mod|sum|work)$/i, "Go modules"],
  [/^Cargo\.(toml|lock)$/i, "Cargo"],
  [/^pom\.xml$|^build\.gradle(\.kts)?$|^gradle\.properties$/i, "Maven/Gradle"],
  [/^composer\.json$/i, "Packagist"],
  [/^Gemfile$|\.gemspec$/i, "RubyGems"],
  [/\.csproj$|\.fsproj$|^nuget\.config$/i, "NuGet"],
  [/^Package\.swift$|^Podfile$/i, "Swift"],
  [/^mix\.exs$/i, "Hex"],
  [/^pubspec\.yaml$/i, "Pub"],
];

const hashNodeId = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

interface RepoListGqlNode {
  id?: string;
  name?: string;
  description?: string | null;
  isFork?: boolean;
  diskUsage?: number | null;
  createdAt?: string;
  updatedAt?: string;
  pushedAt?: string | null;
  isArchived?: boolean;
  isDisabled?: boolean;
  isTemplate?: boolean;
  isPrivate?: boolean;
  homepageUrl?: string | null;
  hasIssuesEnabled?: boolean;
  hasWikiEnabled?: boolean;
  hasDiscussionsEnabled?: boolean;
  mirrorUrl?: string | null;
  stargazerCount?: number;
  forkCount?: number;
  watchers?: { totalCount?: number };
  issuesStatesOpen?: { totalCount?: number };
  primaryLanguage?: { name?: string } | null;
  licenseInfo?: { spdxId?: string; name?: string } | null;
  defaultBranchRef?: { name?: string } | null;
  parent?: { nameWithOwner?: string; defaultBranchRef?: { name?: string } } | null;
  repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } }> };
}

const mapRepoListNode = (node: RepoListGqlNode, ownerLogin: string): GitHubRepo | null => {
  if (!node.name || node.isPrivate) return null;
  const fullName = `${ownerLogin}/${node.name}`;
  return {
    id: hashNodeId(node.id ?? fullName),
    name: node.name,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: node.description ?? null,
    fork: Boolean(node.isFork),
    forks_count: node.forkCount ?? 0,
    stargazers_count: node.stargazerCount ?? 0,
    watchers_count: node.watchers?.totalCount ?? 0,
    size: node.diskUsage ?? 0,
    language: node.primaryLanguage?.name ?? null,
    topics: (node.repositoryTopics?.nodes ?? []).map((t) => t.topic?.name ?? "").filter(Boolean),
    created_at: node.createdAt ?? "",
    updated_at: node.updatedAt ?? "",
    pushed_at: node.pushedAt ?? null,
    archived: Boolean(node.isArchived),
    disabled: Boolean(node.isDisabled),
    homepage: node.homepageUrl ?? null,
    has_wiki: Boolean(node.hasWikiEnabled),
    has_pages: false,
    has_discussions: Boolean(node.hasDiscussionsEnabled),
    is_template: Boolean(node.isTemplate),
    open_issues_count: node.issuesStatesOpen?.totalCount ?? 0,
    default_branch: node.defaultBranchRef?.name ?? "main",
    license: node.licenseInfo ? { spdx_id: node.licenseInfo.spdxId ?? "", name: node.licenseInfo.name ?? "" } : null,
    mirror_url: node.mirrorUrl ?? null,
    owner: { login: ownerLogin },
    ...(node.parent ? { parent: { full_name: node.parent.nameWithOwner ?? "", default_branch: node.parent.defaultBranchRef?.name ?? "main" } } : {}),
  };
};

const REPO_LIST_PAGE = `
query RepoListPage($login: String!, $cursor: String) {
  user(login: $login) {
    login
    repositories(first: 100, after: $cursor, ownerAffiliations: [OWNER], orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id name description isFork diskUsage createdAt updatedAt pushedAt
        isArchived isDisabled isTemplate isPrivate homepageUrl mirrorUrl
        hasIssuesEnabled hasWikiEnabled hasDiscussionsEnabled
        stargazerCount forkCount watchers { totalCount }
        issuesStatesOpen: issues(states: OPEN) { totalCount }
        primaryLanguage { name }
        licenseInfo { spdxId name }
        defaultBranchRef { name }
        parent { nameWithOwner defaultBranchRef { name } }
        repositoryTopics(first: 20) { nodes { topic { name } } }
      }
    }
  }
}`;

async function fetchAllRepos(client: GitHubClient, username: string, unavailable: Record<string, string>) {
  const repos: GitHubRepo[] = [];
  const maxPages = 3;
  let cursor: string | null = null;
  let hasNext = true;
  for (let page = 1; page <= maxPages && hasNext; page += 1) {
    try {
      const data: {
        user: null | {
          login: string;
          repositories: {
            totalCount: number;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<RepoListGqlNode | null>;
          } | null;
        };
      } = await client.graphql(REPO_LIST_PAGE, { login: username, cursor }, `repo-list-page-${page}`);
      const connection = data.user?.repositories;
      if (!connection) break;
      for (const node of connection.nodes) {
        if (!node) continue;
        const mapped = mapRepoListNode({ ...node }, username);
        if (mapped) {
          repos.push(mapped);
        }
      }
      hasNext = connection.pageInfo.hasNextPage;
      cursor = connection.pageInfo.endCursor;
      if (hasNext && page === maxPages) {
        unavailable["repos-pagination"] = `Repository listing capped at ${repos.length} items for this run.`;
      }
    } catch (err) {
      unavailable[`repos-page-${page}`] = err instanceof Error ? err.message : String(err);
      unavailable["repos-incomplete"] = `Repository listing incomplete due to error on page ${page}.`;
      break;
    }
  }
  return repos;
}

/**
 * Batched GraphQL Search: queries 7 search filters inside 1 single GraphQL call
 */
async function fetchSearchSummary(client: GitHubClient, username: string, unavailable: Record<string, string>): Promise<SearchSummary> {
  const summary = emptySearch();
  const GQL_SEARCH = `
    query UserSearchCounts(
      $prsQuery: String!
      $prsMergedQuery: String!
      $prsExternalMergedQuery: String!
      $prsExternalOpenedQuery: String!
      $issuesQuery: String!
      $issuesClosedQuery: String!
      $discussionsQuery: String!
      $discussionsAnsweredQuery: String!
      $commenterQuery: String!
      $resonanceQuery: String!
    ) {
      searchPrs: search(query: $prsQuery, type: ISSUE, first: 1) { issueCount }
      searchPrsMerged: search(query: $prsMergedQuery, type: ISSUE, first: 1) { issueCount }
      searchPrsExternalMerged: search(query: $prsExternalMergedQuery, type: ISSUE, first: 1) { issueCount }
      searchPrsExternalOpened: search(query: $prsExternalOpenedQuery, type: ISSUE, first: 1) { issueCount }
      searchIssues: search(query: $issuesQuery, type: ISSUE, first: 25) {
        issueCount
        nodes {
          ... on Issue {
            number
            createdAt
            repository { nameWithOwner }
          }
        }
      }
      searchIssuesClosed: search(query: $issuesClosedQuery, type: ISSUE, first: 1) { issueCount }
      searchDiscussions: search(query: $discussionsQuery, type: DISCUSSION, first: 1) { issueCount }
      searchDiscussionsAnswered: search(query: $discussionsAnsweredQuery, type: DISCUSSION, first: 1) { issueCount }
      searchCommenter: search(query: $commenterQuery, type: ISSUE, first: 1) { issueCount }
      searchResonance: search(query: $resonanceQuery, type: ISSUE, first: 1) { issueCount }
    }
  `;
  try {
    const data = await client.graphql<{
      searchPrs: { issueCount: number };
      searchPrsMerged: { issueCount: number };
      searchPrsExternalMerged: { issueCount: number };
      searchPrsExternalOpened: { issueCount: number };
      searchIssues: { issueCount: number; nodes: Array<{ number: number; createdAt: string; repository: { nameWithOwner: string } }> };
      searchIssuesClosed: { issueCount: number };
      searchDiscussions: { issueCount: number };
      searchDiscussionsAnswered: { issueCount: number };
      searchCommenter: { issueCount: number };
      searchResonance: { issueCount: number };
    }>(
      GQL_SEARCH,
      {
        prsQuery: `author:${username} type:pr`,
        prsMergedQuery: `author:${username} type:pr is:merged`,
        prsExternalMergedQuery: `author:${username} type:pr is:merged -user:${username}`,
        prsExternalOpenedQuery: `author:${username} type:pr -user:${username}`,
        issuesQuery: `author:${username} type:issue`,
        issuesClosedQuery: `author:${username} type:issue is:closed`,
        discussionsQuery: `author:${username} type:discussion`,
        discussionsAnsweredQuery: `author:${username} type:discussion is:answered`,
        commenterQuery: `commenter:${username} -author:${username}`,
        resonanceQuery: `author:${username} type:issue reactions:>2`,
      },
      "user-search-batch",
    );
    summary.prsOpened = data.searchPrs?.issueCount ?? 0;
    summary.prsMerged = data.searchPrsMerged?.issueCount ?? 0;
    summary.prsMergedExternal = data.searchPrsExternalMerged?.issueCount ?? 0;
    summary.prsOpenedExternal = data.searchPrsExternalOpened?.issueCount ?? 0;
    summary.issuesOpened = data.searchIssues?.issueCount ?? 0;
    summary.issuesClosed = data.searchIssuesClosed?.issueCount ?? 0;
    summary.discussionsAuthored = data.searchDiscussions?.issueCount ?? 0;
    summary.discussionsAnswered = data.searchDiscussionsAnswered?.issueCount ?? 0;
    summary.commenterEvents = data.searchCommenter?.issueCount ?? 0;
    summary.highResonanceIssues = data.searchResonance?.issueCount ?? 0;
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
    label: "Deep dive",
    description: "Single full-depth deterministic pass built on batched GraphQL.",
    expectedCalls: { minimum: 10, maximum: 16 },
    budget: { rest: 12, graphql: 9, search: 2 },
    repositoryLimit: 8,
    forkLimit: 3,
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
    const isUserToken = options.authTier === "USER-OAUTH";
    const tokenSource = isUserToken ? "Your linked GitHub account token" : "The server token pool";
    throw new Error(
      `RATE_LIMIT_DEPLETED: ${tokenSource} has only ${coreRemaining} REST / ${graphqlRemaining} GraphQL calls remaining. Deep dive mode requires at least ${minRequiredCore} REST / ${minRequiredGraphql} GraphQL quota. Please try again later.`,
    );
  }

  emit("phase", "profile-core", "Loading profile core, contribution calendar, social edges, and search totals in one batched GraphQL call.");
  let core: ProfileCoreResult;
  try {
    core = await fetchProfileCore(client, username, now);
  } catch (err) {
    if (err instanceof GitHubRequestError && err.status === 404) {
      throw new UserNotFoundError(username);
    }
    throw err;
  }
  emit("phase", "repository-discovery", "Discovering repositories via paginated GraphQL and ranking the top candidates.");
  const repos = await fetchAllRepos(client, username, unavailable);
  const ranked = [...repos].sort((a, b) => repoRank(b, now) - repoRank(a, now));
  const topRepos = [
    ...ranked.filter((repo) => !repo.fork && !repo.disabled),
    ...ranked.filter((repo) => repo.fork && !repo.disabled),
  ].slice(0, profile.repositoryLimit);

  emit("phase", "public-activity", "Collecting up to 300 public events from the last 30 days, plus organizations, gists, subscriptions, and search totals.");
  const [eventsP1, eventsP2, eventsP3, orgs, gists, subscriptions, search] = await Promise.all([
    safe(unavailable, "events", [], async () => (await fetchPublicEventsPage(client, username, 1)).data),
    safe(unavailable, "events-page-2", [], async () => (await fetchPublicEventsPage(client, username, 2)).data),
    safe(unavailable, "events-page-3", [], async () => (await fetchPublicEventsPage(client, username, 3)).data),
    safe(unavailable, "orgs", [] as Array<{ login: string; avatar_url: string }>, async () => (await fetchPublicOrgs(client, username)).data),
    safe(unavailable, "gists", [] as Array<{ id: string; created_at: string; updated_at: string; comments: number }>, async () => (await fetchPublicGists(client, username)).data),
    safe(unavailable, "subscriptions", [], async () => (await fetchSubscriptions(client, username)).data),
    fetchSearchSummary(client, username, unavailable),
  ]);
  const events = [...eventsP1, ...eventsP2, ...eventsP3].slice(0, 300);
  const { user, followers, following, summary: graphql, profileReadme } = core;
  search.reviews = graphql.totalPullRequestReviewContributions;

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
  const commitDetails: Record<string, GitHubCommit> = {};
  const forks: EngineData["forks"] = {};

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
                  description
                  releaseAssets(first: 10) {
                    nodes {
                      downloadCount
                    }
                  }
                }
              }
              tags: refs(refPrefix: "refs/tags/", first: 10) {
                totalCount
              }
              branches: refs(refPrefix: "refs/heads/", first: 1) {
                totalCount
              }
              readme: object(expression: "HEAD:README.md") {
                ... on Blob { byteSize, text }
              }
              rootTree: object(expression: "HEAD:") {
                ... on Tree { entries { name type } }
              }
              githubDir: object(expression: "HEAD:.github") {
                ... on Tree { entries { name } }
              }
              contributing: object(expression: "HEAD:CONTRIBUTING.md") { ... on Blob { byteSize } }
              codeOfConduct: object(expression: "HEAD:CODE_OF_CONDUCT.md") { ... on Blob { byteSize } }
              securityPolicy: object(expression: "HEAD:SECURITY.md") { ... on Blob { byteSize } }
              funding: object(expression: "HEAD:.github/FUNDING.yml") { ... on Blob { byteSize } }
              issueTemplates: object(expression: "HEAD:.github/ISSUE_TEMPLATE") { ... on Tree { entries { name } } }
              ciWorkflows: object(expression: "HEAD:.github/workflows") {
                ... on Tree { entries { name } }
              }
              docsDir: object(expression: "HEAD:docs") { ... on Tree { entries { name } } }
              recentForks: forks(first: 30, orderBy: {field: CREATED_AT, direction: DESC}) {
                nodes { name owner { login } pushedAt stargazerCount forkCount createdAt updatedAt }
              }
              defaultBranchRef {
                target {
                  ... on Commit {
                    statusCheckRollup { state }
                    history(first: 100) {
                      totalCount
                      nodes {
                        oid
                        messageHeadline
                        committedDate
                        authoredDate
                        additions
                        deletions
                        changedFiles
                        author { user { login } }
                        signature { isValid }
                        parents(first: 1) { totalCount }
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
        const batchData = await client.graphql<Record<string, RepoBatchGqlNode | undefined>>(query, {}, `repos-batch-${offset}`);
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
          releases[key] = (d.releases?.nodes ?? []).map((r) => ({
            name: r.tagName ?? "",
            published_at: r.publishedAt ?? "",
            tag_name: r.tagName ?? "",
            prerelease: Boolean(r.isPrerelease),
            assets: (r.releaseAssets?.nodes ?? []).map((a) => ({
              download_count: a.downloadCount ?? 0,
            })),
          }));

          // Branches mapping: map authentic default branch without fabricating dummy branches
          branches[key] = [{
            name: repo.default_branch || "main",
            protected: false,
          }];

          const rootEntries = d.rootTree?.entries ?? [];
          const hasDirEntry = (needle: RegExp) => rootEntries.some((entry) => needle.test(entry.name ?? ""));
          const testsPresent = hasDirEntry(/^(tests?|__tests__|spec)$/i) ||
            hasDirEntry(/\.(test|spec)\.[jt]sx?$/i) ||
            hasDirEntry(/^(jest|vitest|karma|cypress|playwright)\.config\./i);
          const githubDirNames = (d.githubDir?.entries ?? []).map((e) => (e.name ?? "").toLowerCase());
          qualities[key] = {
            readmeBytes: d.readme?.byteSize ?? 0,
            readmeText: d.readme?.text ?? "",
            licensePresent: Boolean(repo.license),
            testsPresent,
            ciPresent: (d.ciWorkflows?.entries?.length ?? 0) > 0,
            contributingPresent: Boolean(d.contributing) || githubDirNames.some((name) => name.startsWith("contributing")),
            codeOfConductPresent: Boolean(d.codeOfConduct) || githubDirNames.some((name) => name.startsWith("code_of_conduct")),
            securityPolicyPresent: Boolean(d.securityPolicy) || githubDirNames.some((name) => name.startsWith("security")),
            fundingPresent: Boolean(d.funding),
            issueTemplatesPresent: (d.issueTemplates?.entries?.length ?? 0) > 0 || githubDirNames.some((name) => name.startsWith("issue_template")),
            docsDirectoryPresent: (d.docsDir?.entries?.length ?? 0) > 0,
          };

          const commitNodes = d.defaultBranchRef?.target?.history?.nodes ?? [];
          const toCommit = (cn: HistoryNodeLite): GitHubCommit => ({
            sha: cn.oid ?? "",
            html_url: `${repo.html_url}/commit/${cn.oid}`,
            commit: {
              message: cn.messageHeadline ?? "",
              author: { name: cn.author?.user?.login ?? username, date: cn.authoredDate ?? cn.committedDate ?? "" },
              committer: { name: cn.author?.user?.login ?? username, date: cn.committedDate ?? "" },
              verification: { verified: Boolean(cn.signature?.isValid), reason: cn.signature?.isValid ? "valid signature" : "unsigned" },
            },
            author: { login: cn.author?.user?.login ?? username },
            stats: { additions: cn.additions ?? 0, deletions: cn.deletions ?? 0, total: (cn.additions ?? 0) + (cn.deletions ?? 0) },
            parents: Array.from({ length: Math.min(cn.parents?.totalCount ?? 1, 10) }, (_, idx) => ({ sha: `${cn.oid}-p${idx}` })),
          });
          commits[key] = commitNodes.map(toCommit);

          const detailLimit = Math.min(commitNodes.length, profile.commitDetailLimit || 40);
          for (let ci = 0; ci < detailLimit; ci++) {
            const cn = commitNodes[ci];
            if (!cn?.oid) continue;
            commitDetails[`${key}:${cn.oid}`] = toCommit(cn);
          }

          const derived = deriveWeeklySeries(commitNodes, username);
          commitActivity[key] = derived.commitActivity;
          codeFrequency[key] = derived.codeFrequency;
          participation[key] = derived.participation;
          punchCards[key] = derivePunchCard(commitNodes);
          contributors[key] = deriveContributors(commitNodes, username);

          forks[key] = (d.recentForks?.nodes ?? []).map((fork) => ({
            id: hashNodeId(`${key}:${fork.name}`),
            name: fork.name ?? "",
            full_name: `${fork.owner?.login ?? key.split("/")[0]}/${fork.name}`,
            html_url: `https://github.com/${fork.owner?.login ?? key.split("/")[0]}/${fork.name}`,
            description: null,
            fork: true,
            forks_count: fork.forkCount ?? 0,
            stargazers_count: fork.stargazerCount ?? 0,
            watchers_count: 0,
            size: 0,
            language: null,
            topics: [],
            created_at: fork.createdAt ?? "",
            updated_at: fork.updatedAt ?? "",
            pushed_at: fork.pushedAt ?? null,
            archived: false,
            disabled: false,
            homepage: null,
            has_wiki: false,
            has_pages: false,
            has_discussions: false,
            is_template: false,
            open_issues_count: 0,
            default_branch: "main",
            license: null,
            mirror_url: null,
            owner: { login: fork.owner?.login ?? key.split("/")[0] ?? "" },
          }));

          security[key] = {
            sbomPackages: [],
            codeScanning: null,
            dependabot: null,
            codeScanningEnabled: false,
            dependabotEnabled: false,
            headCiState: d.defaultBranchRef?.target?.statusCheckRollup?.state ?? null,
            checks: [] as SecuritySummary["checks"],
            dependencyManifests: rootEntries.reduce<Record<string, number>>((counts, entry) => {
              const name = entry.name ?? "";
              for (const [pattern, ecosystem] of DEPENDENCY_MANIFEST_MATCHERS) {
                if (pattern.test(name)) {
                  counts[ecosystem] = (counts[ecosystem] ?? 0) + 1;
                  break;
                }
              }
              return counts;
            }, {}),
          };
        });
      } catch (err) {
        recordFailure(unavailable, `repos-batch-${offset}-graphql`, err);
      }
    }),
  );

  sampled["repository-enrichment"] = {
    size: topRepos.length,
    note: `Moderate repository rules sample the top ${profile.repositoryLimit} repositories ranked by activity and impact.`,
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

  emit("phase", "showcase-integrity", "Enriching pinned repositories and collecting community health plus CI run history for top repositories.");
  await safe(unavailable, "pinned-enrichment", null as null | Record<string, unknown>, async () => fetchPinnedEnrichment(client, graphql.pinnedItems));

  const ciRepos = topRepos.slice(0, 5);
  await Promise.all(ciRepos.map(async (repo) => {
    const communityProfile = await safe(unavailable, `${repo.full_name}-community-profile`, null as null | { health_percentage?: number; files?: { pull_request_template?: unknown; code_of_conduct?: unknown; contributing?: unknown; issue_template?: unknown; license?: unknown; readme?: unknown } }, async () => (await fetchCommunityProfile(client, repo.owner.login, repo.name)).data);
    if (!security[repo.full_name]) security[repo.full_name] = { sbomPackages: [], codeScanning: null, dependabot: null, codeScanningEnabled: false, dependabotEnabled: false, checks: [] };
    if (communityProfile) {
      security[repo.full_name]!.communityHealth = typeof communityProfile.health_percentage === "number" ? communityProfile.health_percentage : null;
      security[repo.full_name]!.pullRequestTemplatePresent = Boolean(communityProfile.files?.pull_request_template);
      if (qualities[repo.full_name]) {
        qualities[repo.full_name]!.contributingPresent = qualities[repo.full_name]!.contributingPresent || Boolean(communityProfile.files?.contributing);
        qualities[repo.full_name]!.codeOfConductPresent = qualities[repo.full_name]!.codeOfConductPresent || Boolean(communityProfile.files?.code_of_conduct);
        qualities[repo.full_name]!.issueTemplatesPresent = qualities[repo.full_name]!.issueTemplatesPresent || Boolean(communityProfile.files?.issue_template);
        if (!qualities[repo.full_name]!.licensePresent && communityProfile.files?.license) qualities[repo.full_name]!.licensePresent = true;
      }
    }
    const runs = await safe(unavailable, `${repo.full_name}-actions-runs`, null as null | { workflow_runs?: Array<{ conclusion?: string | null }> }, async () => (await fetchActionsRuns(client, repo.owner.login, repo.name)).data);
    if (runs?.workflow_runs) {
      const completed = runs.workflow_runs.filter((run) => run.conclusion);
      security[repo.full_name]!.actionsRuns = {
        total: completed.length,
        success: completed.filter((run) => run.conclusion === "success").length,
      };
    }
  }));

  emit("phase", "expensive-sampling", "Running bounded fork divergence comparisons.");

  const forkComparisons: EngineData["forkComparisons"] = {};
  const contributedForks = repos.filter((repo) => repo.fork).slice(0, profile.forkLimit);
  for (const repo of contributedForks) {
    try {
      if (!repo.parent) continue;
      const [parentOwner, parentName] = repo.parent.full_name.split("/");
      if (!parentOwner || !parentName) continue;
      const comparison = (
        await compareRefs(
          client,
          parentOwner,
          parentName,
          repo.parent.default_branch,
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
      profileReadme,
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
