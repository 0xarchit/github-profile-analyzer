import {
  ProfileSummary,
  ContributionWeek,
  ContributionDay,
  GithubRepoNode,
} from "@/types";
import { getCachedData, setCachedData } from "@/lib/redis";
import { sendTelegramAlert } from "@/lib/telegram-alert";

const GITHUB_TOKENS = (process.env.GITHUB_TOKENS || "")
  .split(",")
  .filter(Boolean);

if (GITHUB_TOKENS.length === 0) {
  throw new Error("GITHUB_TOKENS environment variable is required");
}

const ACHIEVEMENT_CACHE_TTL_MS = 10 * 60 * 1000;
const achievementCache = new Map<
  string,
  { value: string | null; expiresAt: number }
>();

const badgeAssets: Record<string, string> = {
  "pull-shark":
    "https://github.githubassets.com/assets/pull-shark-default-498c279a747d.png",
  starstruck:
    "https://github.githubassets.com/assets/starstruck-default--light-medium-65b31ef2251e.png",
  "pair-extraordinaire":
    "https://github.githubassets.com/assets/pair-extraordinaire-default-579438a20e01.png",
  "galaxy-brain":
    "https://github.githubassets.com/assets/galaxy-brain-default-847262c21056.png",
  yolo: "https://github.githubassets.com/assets/yolo-default-be0bbff04951.png",
  quickdraw:
    "https://github.githubassets.com/assets/quickdraw-default--light-medium-5450fadcbe37.png",
};

function getRank(val: number, thresholds: number[]): string {
  if (val >= thresholds[3]) return "SS";
  if (val >= thresholds[2]) return "S";
  if (val >= thresholds[1]) return "A";
  if (val >= thresholds[0]) return "B";
  return "C";
}

function getRankColor(rank: string): string {
  switch (rank) {
    case "SS":
      return "#ff0055";
    case "S":
      return "#facc15";
    case "A":
      return "#a78bfa";
    case "B":
      return "#60a5fa";
    default:
      return "#94a3b8";
  }
}

function getFallbackToken(): string {
  const token = GITHUB_TOKENS[Math.floor(Math.random() * GITHUB_TOKENS.length)];
  if (!token) throw new Error("GITHUB_TOKENS environment variable is required");
  return token;
}

const GITHUB_FETCH_TIMEOUT_MS = 10_000;

async function githubFetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = GITHUB_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildGitHubGraphQLHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "GitScore/1.1",
  };
}

async function fetchGitHubGraphQL(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = GITHUB_FETCH_TIMEOUT_MS,
): Promise<Response> {
  console.log("[GITHUB_API] GraphQL request starting", {
    timeoutMs,
    variables: JSON.stringify(variables).slice(0, 100),
  });
  try {
    const response = await githubFetchWithTimeout(
      "https://api.github.com/graphql",
      {
        method: "POST",
        headers: buildGitHubGraphQLHeaders(token),
        body: JSON.stringify({ query, variables }),
      },
      timeoutMs,
    );
    console.log("[GITHUB_API] GraphQL response received", {
      status: response.status,
      statusText: response.statusText,
    });
    return response;
  } catch (err) {
    console.error("[GITHUB_API] GraphQL request failed", {
      error: err instanceof Error ? err.message : String(err),
      variables: JSON.stringify(variables).slice(0, 100),
    });
    throw err;
  }
}

async function checkAchievementStatus(username: string, slug: string) {
  const cacheKey = `${normalizeUsername(username)}:${slug}`;
  const now = Date.now();
  const cached = achievementCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const url = `https://github.com/${encodeURIComponent(username)}?tab=achievements&achievement=${slug}`;
  try {
    const res = await githubFetchWithTimeout(url, {
      method: "HEAD",
      headers: { "User-Agent": "GitScore/1.1" },
    });
    const value = res.status === 200 ? slug : null;
    achievementCache.set(cacheKey, {
      value,
      expiresAt: now + ACHIEVEMENT_CACHE_TTL_MS,
    });
    return value;
  } catch {
    achievementCache.set(cacheKey, {
      value: null,
      expiresAt: now + ACHIEVEMENT_CACHE_TTL_MS,
    });
    return null;
  }
}

function calculateDetailedStreaks(weeks: ContributionWeek[]) {
  const days = weeks.flatMap((w) => w.contributionDays);
  let daily_streak = 0,
    daily_best = 0,
    tmp_daily = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) daily_streak++;
    else if (i === days.length - 1) continue;
    else break;
  }
  days.forEach((d) => {
    if (d.contributionCount > 0) {
      tmp_daily++;
      if (tmp_daily > daily_best) daily_best = tmp_daily;
    } else tmp_daily = 0;
  });
  const weekActivity = weeks.map((w) =>
    w.contributionDays.some((d: ContributionDay) => d.contributionCount > 0),
  );
  let weekly_streak = 0,
    weekly_best = 0,
    tmp_weekly = 0;
  for (let i = weekActivity.length - 1; i >= 0; i--) {
    if (weekActivity[i]) weekly_streak++;
    else if (i === weekActivity.length - 1) continue;
    else break;
  }
  weekActivity.forEach((active) => {
    if (active) {
      tmp_weekly++;
      if (tmp_weekly > weekly_best) weekly_best = tmp_weekly;
    } else tmp_weekly = 0;
  });
  return { daily_streak, daily_best, weekly_streak, weekly_best };
}

export async function getProfileSummary(
  username: string,
  userToken?: string,
): Promise<ProfileSummary> {
  console.log("[GITHUB_API] getProfileSummary starting", {
    username,
    hasUserToken: !!userToken,
  });
  if (!username || username.toLowerCase() === "undefined") {
    console.error("[GITHUB_API] Invalid username", { username });
    await sendTelegramAlert({
      source: "GITHUB_PROFILE_SUMMARY",
      message: "Invalid username supplied",
      error: new Error("INVALID_USERNAME"),
      context: { username },
    });
    throw new Error("INVALID_USERNAME");
  }
  const token = userToken || getFallbackToken();
  console.log("[GITHUB_API] Using token", { hasUserToken: !!userToken });
  const query = `
    query($login: String!) {
      user(login: $login) {
        avatarUrl, login, name, bio, followers { totalCount }, following { totalCount }
        contributionsCollection {
          totalCommitContributions, totalPullRequestContributions, totalIssueContributions, totalPullRequestReviewContributions, totalRepositoryContributions
          contributionCalendar {
            totalContributions
            weeks { contributionDays { contributionCount, date, color } }
          }
        }
        repositories(first: 60, ownerAffiliations: [OWNER], orderBy: {field: STARGAZERS, direction: DESC}) {
          nodes {
            name, description, stargazerCount, forkCount, isFork, primaryLanguage { name }
            openIssues: issues(states: OPEN) { totalCount }
            watchers { totalCount }
            repositoryTopics(first: 5) { nodes { topic { name } } }
          }
        }
        repositoriesContributedTo(first: 40, includeUserRepositories: true, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW]) {
          nodes {
            name, description, stargazerCount, forkCount, isFork, primaryLanguage { name }
            openIssues: issues(states: OPEN) { totalCount }
            watchers { totalCount }
            repositoryTopics(first: 5) { nodes { topic { name } } }
          }
        }
      }
    }
  `;

  const requestSummary = async (authToken: string) => {
    console.log("[GITHUB_API] Sending profile summary request", { username });
    return fetchGitHubGraphQL(authToken, query, { login: username });
  };

  let res = await requestSummary(token);
  console.log("[GITHUB_API] Initial profile request completed", {
    status: res.status,
  });
  if (res.status === 401 || res.status === 403) {
    console.log("[GITHUB_API] Auth failed, retrying with fallback token");
    const retryToken = getFallbackToken();
    res = await requestSummary(retryToken);
    console.log("[GITHUB_API] Retry request completed", { status: res.status });
    if (res.status === 401 || res.status === 403) {
      console.error("[GITHUB_API] Both auth attempts failed");
      await sendTelegramAlert({
        source: "GITHUB_PROFILE_SUMMARY",
        message: "GitHub auth failed for profile summary",
        error: new Error("GITHUB_AUTH_FAILED"),
        context: { username, status: res.status },
      });
      throw new Error("GITHUB_AUTH_FAILED");
    }
  }

  if (!res.ok) {
    console.error("[GITHUB_API] Profile request failed", {
      status: res.status,
    });
    await sendTelegramAlert({
      source: "GITHUB_PROFILE_SUMMARY",
      message: "Profile request failed",
      error: new Error(`GitHub API error: HTTP ${res.status}`),
      context: { username, status: res.status },
    });
    throw new Error(`GitHub API error: HTTP ${res.status}`);
  }

  console.log("[GITHUB_API] Parsing profile response");
  const body = await res.json();
  if (body.errors) {
    console.error("[GITHUB_API] GraphQL errors in response", {
      errors: body.errors,
    });
    if (body.errors[0]?.message.includes("Could not resolve to a User")) {
      console.error("[GITHUB_API] User not found in GitHub", { username });
      await sendTelegramAlert({
        source: "GITHUB_PROFILE_SUMMARY",
        message: "User not found in GitHub",
        error: new Error("USER_NOT_FOUND"),
        context: { username },
      });
      throw new Error("USER_NOT_FOUND");
    }
    await sendTelegramAlert({
      source: "GITHUB_PROFILE_SUMMARY",
      message: "GraphQL error while fetching profile",
      error: new Error(body.errors[0]?.message || "graphql_error"),
      context: { username },
    });
    throw new Error(`GitHub API error: ${body.errors[0].message}`);
  }
  const user = body.data?.user;
  if (!user) {
    console.error("[GITHUB_API] No user data in response", { username });
    await sendTelegramAlert({
      source: "GITHUB_PROFILE_SUMMARY",
      message: "No user data in response",
      error: new Error("USER_NOT_FOUND"),
      context: { username },
    });
    throw new Error("USER_NOT_FOUND");
  }
  console.log("[GITHUB_API] User data parsed successfully", {
    username: user.login,
    repos: user.repositories.nodes.length,
  });

  const coll = user.contributionsCollection;
  const ownedNodes = user.repositories.nodes || [];

  const authoredRepos = ownedNodes.filter((r: GithubRepoNode) => !r.isFork);

  let total_stars = 0;
  authoredRepos.forEach(
    (r: GithubRepoNode) => (total_stars += r.stargazerCount),
  );

  const detailedStreaks = calculateDetailedStreaks(
    coll.contributionCalendar.weeks,
  );

  const langs = (function (nodes: GithubRepoNode[]) {
    const l: Record<string, number> = {};
    nodes.forEach((n) => {
      if (n.primaryLanguage)
        l[n.primaryLanguage.name] =
          (l[n.primaryLanguage.name] || 0) +
          Math.sqrt(n.stargazerCount + 1) +
          1;
    });
    const entries = Object.entries(l)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const total = entries.reduce((acc, [, v]) => acc + v, 0) || 1;
    const cols = [
      "#facc15",
      "#fb923c",
      "#4ade80",
      "#f472b6",
      "#60a5fa",
      "#a78bfa",
    ];
    return entries.map(([n, v], i) => ({
      name: n,
      value: (v / total) * 100,
      color: cols[i % cols.length],
    }));
  })(authoredRepos);

  const t_configs = [
    { name: "Stars", val: total_stars, th: [10, 100, 500, 1000] },
    {
      name: "Commits",
      val: coll.totalCommitContributions,
      th: [100, 500, 1000, 5000],
    },
    {
      name: "PRs",
      val: coll.totalPullRequestContributions,
      th: [10, 50, 100, 500],
    },
    { name: "Issues", val: coll.totalIssueContributions, th: [5, 20, 50, 100] },
    {
      name: "Reviews",
      val: coll.totalPullRequestReviewContributions,
      th: [5, 20, 50, 100],
    },
    {
      name: "Followers",
      val: user.followers.totalCount,
      th: [10, 50, 100, 500],
    },
    {
      name: "Authored Repos",
      val: authoredRepos.length,
      th: [10, 30, 50, 100],
    },
  ];

  const trophies = t_configs.map((c) => {
    const rank = getRank(c.val, c.th);
    return {
      name: c.name,
      rank,
      color: getRankColor(rank),
      value: c.val.toString(),
    };
  });

  const slugs = Object.keys(badgeAssets);
  console.log("[GITHUB_API] Checking achievement badges", {
    badgeCount: slugs.length,
  });
  const unlocked = await Promise.all(
    slugs.map((s) => {
      console.log("[GITHUB_API] Checking achievement", { slug: s });
      return checkAchievementStatus(username, s);
    }),
  );
  const badges: Record<string, string> = {};
  const unlockedBadges = unlocked.filter(Boolean);
  console.log("[GITHUB_API] Achievement check complete", {
    unlockedCount: unlockedBadges.length,
  });
  unlockedBadges.forEach((s) => {
    if (s) badges[s] = badgeAssets[s];
  });

  console.log("[GITHUB_API] Assembling profile summary", {
    username: user.login,
    total_stars,
    followers: user.followers.totalCount,
  });
  return {
    avatar: user.avatarUrl,
    username: user.login,
    name: user.name,
    bio: user.bio,
    followers: user.followers.totalCount,
    following: user.following.totalCount,
    public_repo_count: authoredRepos.length,
    total_stars,
    original_repos: authoredRepos.reduce(
      (
        acc: Record<
          string,
          {
            n: string;
            description: string | null;
            stars: number;
            forks: number;
            issues: number;
            watchers: number;
            primary_lang: string | null;
            topics: string[];
          }
        >,
        r: GithubRepoNode,
      ) => ({
        ...acc,
        [r.name]: {
          n: r.name,
          description: r.description,
          stars: r.stargazerCount,
          forks: r.forkCount,
          issues: r.openIssues.totalCount,
          watchers: r.watchers.totalCount,
          primary_lang: r.primaryLanguage?.name || null,
          topics: r.repositoryTopics.nodes.map((t) => t.topic.name),
        },
      }),
      {},
    ),
    career_stats: {
      total_contributions: coll.contributionCalendar.totalContributions,
      total_commits: coll.totalCommitContributions,
      total_prs: coll.totalPullRequestContributions,
      total_issues: coll.totalIssueContributions,
      total_reviews: coll.totalPullRequestReviewContributions,
      daily_streak: detailedStreaks.daily_streak,
      daily_best: detailedStreaks.daily_best,
      weekly_streak: detailedStreaks.weekly_streak,
      weekly_best: detailedStreaks.weekly_best,
      top_languages: langs,
      commit_activity: (function (weeks: ContributionWeek[]) {
        const m: Record<string, number> = {};
        weeks.forEach((w) =>
          w.contributionDays.forEach((d: ContributionDay) => {
            const date = new Date(d.date);
            const key = `${date.getUTCFullYear()}-${String(
              date.getUTCMonth() + 1,
            ).padStart(2, "0")}`;
            m[key] = (m[key] || 0) + d.contributionCount;
          }),
        );
        return Object.entries(m)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({ month, count }));
      })(coll.contributionCalendar.weeks),
      trophies,
    },
    calendar_data: coll.contributionCalendar,
    badges,
  };
}

const STAR_PAGE_SIZE = 100;
const STAR_QUICK_LIMIT = 6;
const STAR_DEEP_LIMIT = 120;
const STAR_REST_LIMIT = 250;
const STAR_CACHE_TTL = 900;
const STAR_GATE_DEBUG = process.env.STAR_GATE_DEBUG === "1";

interface PageInfo {
  hasNextPage?: boolean;
  endCursor?: string | null;
  hasPreviousPage?: boolean;
  startCursor?: string | null;
}

interface StarredRepoNode {
  nameWithOwner: string;
}

interface StargazerNode {
  login: string;
}

interface RestStargazerNode {
  login?: string;
}

interface RestStarredRepoNode {
  full_name?: string;
}

function starGateLog(event: string, payload: Record<string, unknown>): void {
  if (!STAR_GATE_DEBUG) return;
  console.info(`[star-gate] ${event}`, payload);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function buildGitHubRestHeaders(token?: string): HeadersInit {
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "GitScore/1.1",
    };
  }
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "GitScore/1.1",
  };
}

async function fetchGitHubRest(url: string, token?: string): Promise<Response> {
  const first = await githubFetchWithTimeout(url, {
    headers: buildGitHubRestHeaders(token),
  });
  if ((first.status === 401 || first.status === 403) && token) {
    starGateLog("rest_retry_without_token", { url, status: first.status });
    return githubFetchWithTimeout(url, {
      headers: buildGitHubRestHeaders(),
    });
  }
  return first;
}

function hasNextPageFromLink(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  return linkHeader.includes('rel="next"');
}

function extractGraphQLErrorMessage(body: unknown): string | null {
  const errors =
    typeof body === "object" && body !== null
      ? (body as { errors?: Array<{ message?: string }> }).errors
      : undefined;
  if (!errors?.length) return null;
  return errors[0]?.message || "graphql_error";
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

async function cacheVerifiedStar(
  username: string,
  targetRepo: string,
): Promise<void> {
  const normalized = normalizeUsername(username);
  const cacheKey = `repo:stargazers:${targetRepo}`;
  const cached = (await getCachedData<string[]>(cacheKey)) || [];
  if (cached.some((s) => normalizeUsername(s) === normalized)) {
    return;
  }
  cached.push(normalized);
  await setCachedData(cacheKey, cached, STAR_CACHE_TTL);
}

export async function checkStarStatus(
  username: string,
  userToken?: string,
): Promise<boolean> {
  console.log("[GITHUB_API] checkStarStatus starting", {
    username,
    hasUserToken: !!userToken,
  });
  const normalizedUsername = normalizeUsername(username || "");
  if (
    !normalizedUsername ||
    normalizedUsername === "undefined" ||
    normalizedUsername === "null"
  ) {
    console.log("[GITHUB_API] Invalid username for star check", { username });
    return false;
  }
  const targetRepo = "0xarchit/github-profile-analyzer";

  starGateLog("check_start", {
    username: normalizedUsername,
    hasUserToken: Boolean(userToken),
  });

  if (userToken) {
    try {
      const res = await githubFetchWithTimeout(
        `https://api.github.com/user/starred/${targetRepo}`,
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "GitScore/1.1",
          },
        },
      );
      if (res.status === 204) {
        await cacheVerifiedStar(normalizedUsername, targetRepo);
        starGateLog("check_pass_user_token", { username: normalizedUsername });
        return true;
      }
      starGateLog("check_user_token_miss", {
        username: normalizedUsername,
        status: res.status,
      });
    } catch (e) {
      console.error("REST star check failed:", e);
    }
  }

  const cacheKey = `repo:stargazers:${targetRepo}`;

  try {
    const cachedStargazers = await getCachedData<string[]>(cacheKey);
    if (
      cachedStargazers?.some((u) => normalizeUsername(u) === normalizedUsername)
    ) {
      starGateLog("check_pass_cache", { username: normalizedUsername });
      return true;
    }

    const isVerified = await executeBidirectionalStarCheck(normalizedUsername);
    if (isVerified) {
      await cacheVerifiedStar(normalizedUsername, targetRepo);
      starGateLog("check_pass_deep", { username: normalizedUsername });
    } else {
      starGateLog("check_fail_deep", { username: normalizedUsername });
    }
    return isVerified;
  } catch (err) {
    console.error("Optimized star check error:", err);
    await sendTelegramAlert({
      source: "STAR_CHECK",
      message: "Optimized star check error",
      error: err,
      context: { username: normalizedUsername },
    });
    starGateLog("check_error", {
      username: normalizedUsername,
      message: toErrorMessage(err),
    });
    return false;
  }
}

export async function verifyAndInjectStar(username: string): Promise<boolean> {
  const normalizedUsername = normalizeUsername(username || "");
  if (
    !normalizedUsername ||
    normalizedUsername === "undefined" ||
    normalizedUsername === "null"
  )
    return false;
  starGateLog("verify_guest_start", { username: normalizedUsername });
  const isVerified = await executeBidirectionalStarCheck(normalizedUsername);
  if (isVerified) {
    await cacheVerifiedStar(
      normalizedUsername,
      "0xarchit/github-profile-analyzer",
    );
    starGateLog("verify_guest_pass", { username: normalizedUsername });
  } else {
    starGateLog("verify_guest_fail", { username: normalizedUsername });
  }
  return isVerified;
}

export async function getRepoStarCount(): Promise<number | null> {
  const url = "https://api.github.com/repos/0xarchit/github-profile-analyzer";
  const token = GITHUB_TOKENS[0] || "";
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "GitScore/1.1",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await githubFetchWithTimeout(url, { headers });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { stargazers_count?: number };
    return typeof payload.stargazers_count === "number"
      ? payload.stargazers_count
      : null;
  } catch {
    return null;
  }
}

async function executeBidirectionalStarCheck(
  username: string,
): Promise<boolean> {
  const targetOwner = "0xarchit";
  const targetName = "github-profile-analyzer";
  const token = getFallbackToken();
  if (!token) return false;

  const countQuery = `
    query($owner: String!, $name: String!, $user: String!) {
      repository(owner: $owner, name: $name) { stargazerCount }
      user(login: $user) { starredRepositories { totalCount } }
    }
  `;

  try {
    const resCount = await fetchGitHubGraphQL(token, countQuery, {
      owner: targetOwner,
      name: targetName,
      user: username,
    });
    if (!resCount.ok) {
      starGateLog("graphql_count_http_error", {
        username,
        status: resCount.status,
      });
      return executeRestFallbackStarCheck(
        username,
        targetOwner,
        targetName,
        token,
      );
    }
    const countBody = await resCount.json();
    const countError = extractGraphQLErrorMessage(countBody);
    if (countError) {
      starGateLog("graphql_count_error", {
        username,
        message: countError,
      });
    }
    const repoStars = Number(countBody.data?.repository?.stargazerCount || 0);
    const userStars = Number(
      countBody.data?.user?.starredRepositories?.totalCount || 0,
    );

    const userPages = Math.min(
      Math.ceil(userStars / STAR_PAGE_SIZE),
      STAR_DEEP_LIMIT,
    );
    const repoPages = Math.min(
      Math.ceil(repoStars / STAR_PAGE_SIZE),
      STAR_DEEP_LIMIT,
    );

    starGateLog("graphql_count", {
      username,
      repoStars,
      userStars,
      repoPages,
      userPages,
    });

    let graphVerified = false;

    if (userStars <= repoStars) {
      graphVerified = await scanUserStarsBidirectional(
        username,
        targetOwner,
        targetName,
        token,
        userPages,
      );
      if (!graphVerified) {
        graphVerified = await scanRepoStarsBidirectional(
          targetOwner,
          targetName,
          username,
          token,
          repoPages,
        );
      }
    } else {
      graphVerified = await scanRepoStarsBidirectional(
        targetOwner,
        targetName,
        username,
        token,
        repoPages,
      );
      if (!graphVerified) {
        graphVerified = await scanUserStarsBidirectional(
          username,
          targetOwner,
          targetName,
          token,
          userPages,
        );
      }
    }

    if (graphVerified) {
      starGateLog("graphql_scan_pass", { username });
      return true;
    }

    starGateLog("graphql_scan_miss", { username });
    const restVerified = await executeRestFallbackStarCheck(
      username,
      targetOwner,
      targetName,
      token,
      repoStars,
      userStars,
    );
    if (restVerified) {
      starGateLog("rest_scan_pass", { username });
    } else {
      starGateLog("rest_scan_miss", { username });
    }
    return restVerified;
  } catch (e) {
    console.error("Bidirectional check failed", e);
    starGateLog("graphql_scan_exception", {
      username,
      message: toErrorMessage(e),
    });
    return executeRestFallbackStarCheck(
      username,
      targetOwner,
      targetName,
      token,
    );
  }
}

async function executeRestFallbackStarCheck(
  username: string,
  targetOwner: string,
  targetName: string,
  token: string,
  repoStars = 0,
  userStars = 0,
): Promise<boolean> {
  const targetRepo = `${targetOwner}/${targetName}`.toLowerCase();
  const repoPages = Math.max(
    1,
    Math.min(
      Math.ceil((repoStars > 0 ? repoStars : STAR_PAGE_SIZE) / STAR_PAGE_SIZE),
      STAR_REST_LIMIT,
    ),
  );
  const userPages = Math.max(
    1,
    Math.min(
      Math.ceil((userStars > 0 ? userStars : STAR_PAGE_SIZE) / STAR_PAGE_SIZE),
      STAR_REST_LIMIT,
    ),
  );

  if (
    await scanRepoStargazersRest(
      username,
      targetOwner,
      targetName,
      token,
      repoPages,
    )
  ) {
    return true;
  }
  return scanUserStarredRest(username, targetRepo, token, userPages);
}

async function scanRepoStargazersRest(
  username: string,
  targetOwner: string,
  targetName: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  const targetUser = normalizeUsername(username);
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/repos/${encodeURIComponent(targetOwner)}/${encodeURIComponent(targetName)}/stargazers?per_page=100&page=${page}`;
    const res = await fetchGitHubRest(url, token);
    if (!res.ok) {
      starGateLog("rest_repo_page_error", {
        username: targetUser,
        page,
        status: res.status,
      });
      return false;
    }
    const body = (await res.json()) as RestStargazerNode[];
    if (
      body.some((item) => normalizeUsername(item.login || "") === targetUser)
    ) {
      starGateLog("rest_repo_page_hit", { username: targetUser, page });
      return true;
    }
    const hasNext = hasNextPageFromLink(res.headers.get("link"));
    if (!hasNext || body.length < STAR_PAGE_SIZE) {
      break;
    }
  }
  return false;
}

async function scanUserStarredRest(
  username: string,
  targetRepo: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  const targetUser = normalizeUsername(username);
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/users/${encodeURIComponent(targetUser)}/starred?per_page=100&page=${page}`;
    const res = await fetchGitHubRest(url, token);
    if (!res.ok) {
      starGateLog("rest_user_page_error", {
        username: targetUser,
        page,
        status: res.status,
      });
      return false;
    }
    const body = (await res.json()) as RestStarredRepoNode[];
    if (
      body.some((item) => (item.full_name || "").toLowerCase() === targetRepo)
    ) {
      starGateLog("rest_user_page_hit", { username: targetUser, page });
      return true;
    }
    const hasNext = hasNextPageFromLink(res.headers.get("link"));
    if (!hasNext || body.length < STAR_PAGE_SIZE) {
      break;
    }
  }
  return false;
}

async function scanUserStarsBidirectional(
  username: string,
  targetOwner: string,
  targetName: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  if (maxPages <= 0) return false;
  const quickPages = Math.min(STAR_QUICK_LIMIT, maxPages);
  const targetFullName = `${targetOwner}/${targetName}`.toLowerCase();

  const [quickNewest, quickOldest] = await Promise.all([
    paginateUserStarsForward(username, targetFullName, token, quickPages),
    paginateUserStarsBackward(username, targetFullName, token, quickPages),
  ]);
  if (quickNewest || quickOldest) return true;

  if (maxPages <= quickPages) return false;

  if (
    await paginateUserStarsBackward(username, targetFullName, token, maxPages)
  )
    return true;
  return paginateUserStarsForward(username, targetFullName, token, maxPages);
}

async function scanRepoStarsBidirectional(
  targetOwner: string,
  targetName: string,
  username: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  if (maxPages <= 0) return false;
  const quickPages = Math.min(STAR_QUICK_LIMIT, maxPages);
  const targetUser = username.toLowerCase();

  const [quickNewest, quickOldest] = await Promise.all([
    paginateRepoStarsForward(
      targetOwner,
      targetName,
      targetUser,
      token,
      quickPages,
    ),
    paginateRepoStarsBackward(
      targetOwner,
      targetName,
      targetUser,
      token,
      quickPages,
    ),
  ]);
  if (quickNewest || quickOldest) return true;

  if (maxPages <= quickPages) return false;

  if (
    await paginateRepoStarsBackward(
      targetOwner,
      targetName,
      targetUser,
      token,
      maxPages,
    )
  )
    return true;
  return paginateRepoStarsForward(
    targetOwner,
    targetName,
    targetUser,
    token,
    maxPages,
  );
}

async function paginateUserStarsForward(
  username: string,
  targetFullName: string,
  token: string,
  pagesLeft: number,
  cursor: string | null = null,
): Promise<boolean> {
  if (pagesLeft <= 0) return false;
  const query = `
    query($user: String!, $after: String) {
      user(login: $user) {
        starredRepositories(first: 100, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes { nameWithOwner }
        }
      }
    }
  `;

  const githubRes = await fetchGitHubGraphQL(token, query, {
    user: username,
    after: cursor,
  });
  if (!githubRes.ok) {
    starGateLog("graphql_user_forward_http_error", {
      username,
      status: githubRes.status,
    });
    return false;
  }
  const githubBody = await githubRes.json();
  const graphError = extractGraphQLErrorMessage(githubBody);
  if (graphError) {
    starGateLog("graphql_user_forward_error", {
      username,
      message: graphError,
    });
    return false;
  }

  const starred = githubBody.data?.user?.starredRepositories as
    | { pageInfo?: PageInfo; nodes?: StarredRepoNode[] }
    | undefined;
  if (!starred) return false;

  const nodes = starred.nodes || [];
  if (nodes.some((n) => n.nameWithOwner.toLowerCase() === targetFullName))
    return true;

  if (!starred.pageInfo?.hasNextPage || !starred.pageInfo.endCursor)
    return false;
  return paginateUserStarsForward(
    username,
    targetFullName,
    token,
    pagesLeft - 1,
    starred.pageInfo.endCursor,
  );
}

async function paginateUserStarsBackward(
  username: string,
  targetFullName: string,
  token: string,
  pagesLeft: number,
  cursor: string | null = null,
): Promise<boolean> {
  if (pagesLeft <= 0) return false;
  const query = `
    query($user: String!, $before: String) {
      user(login: $user) {
        starredRepositories(last: 100, before: $before, orderBy: {field: STARRED_AT, direction: DESC}) {
          pageInfo { hasPreviousPage startCursor }
          nodes { nameWithOwner }
        }
      }
    }
  `;

  const githubRes = await fetchGitHubGraphQL(token, query, {
    user: username,
    before: cursor,
  });
  if (!githubRes.ok) {
    starGateLog("graphql_user_backward_http_error", {
      username,
      status: githubRes.status,
    });
    return false;
  }
  const githubBody = await githubRes.json();
  const graphError = extractGraphQLErrorMessage(githubBody);
  if (graphError) {
    starGateLog("graphql_user_backward_error", {
      username,
      message: graphError,
    });
    return false;
  }

  const starred = githubBody.data?.user?.starredRepositories as
    | { pageInfo?: PageInfo; nodes?: StarredRepoNode[] }
    | undefined;
  if (!starred) return false;

  const nodes = starred.nodes || [];
  if (nodes.some((n) => n.nameWithOwner.toLowerCase() === targetFullName))
    return true;

  if (!starred.pageInfo?.hasPreviousPage || !starred.pageInfo.startCursor)
    return false;
  return paginateUserStarsBackward(
    username,
    targetFullName,
    token,
    pagesLeft - 1,
    starred.pageInfo.startCursor,
  );
}

async function paginateRepoStarsForward(
  targetOwner: string,
  targetName: string,
  targetUser: string,
  token: string,
  pagesLeft: number,
  cursor: string | null = null,
): Promise<boolean> {
  if (pagesLeft <= 0) return false;
  const query = `
    query($owner: String!, $name: String!, $after: String) {
      repository(owner: $owner, name: $name) {
        stargazers(first: 100, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes { login }
        }
      }
    }
  `;

  const githubRes = await fetchGitHubGraphQL(token, query, {
    owner: targetOwner,
    name: targetName,
    after: cursor,
  });
  if (!githubRes.ok) {
    starGateLog("graphql_repo_forward_http_error", {
      username: targetUser,
      status: githubRes.status,
    });
    return false;
  }
  const githubBody = await githubRes.json();
  const graphError = extractGraphQLErrorMessage(githubBody);
  if (graphError) {
    starGateLog("graphql_repo_forward_error", {
      username: targetUser,
      message: graphError,
    });
    return false;
  }

  const stargazers = githubBody.data?.repository?.stargazers as
    | { pageInfo?: PageInfo; nodes?: StargazerNode[] }
    | undefined;
  if (!stargazers) return false;

  const nodes = stargazers.nodes || [];
  if (nodes.some((n) => n.login.toLowerCase() === targetUser)) return true;

  if (!stargazers.pageInfo?.hasNextPage || !stargazers.pageInfo.endCursor)
    return false;
  return paginateRepoStarsForward(
    targetOwner,
    targetName,
    targetUser,
    token,
    pagesLeft - 1,
    stargazers.pageInfo.endCursor,
  );
}

async function paginateRepoStarsBackward(
  targetOwner: string,
  targetName: string,
  targetUser: string,
  token: string,
  pagesLeft: number,
  cursor: string | null = null,
): Promise<boolean> {
  if (pagesLeft <= 0) return false;
  const query = `
    query($owner: String!, $name: String!, $before: String) {
      repository(owner: $owner, name: $name) {
        stargazers(last: 100, before: $before, orderBy: {field: STARRED_AT, direction: DESC}) {
          pageInfo { hasPreviousPage startCursor }
          nodes { login }
        }
      }
    }
  `;

  const githubRes = await fetchGitHubGraphQL(token, query, {
    owner: targetOwner,
    name: targetName,
    before: cursor,
  });
  if (!githubRes.ok) {
    starGateLog("graphql_repo_backward_http_error", {
      username: targetUser,
      status: githubRes.status,
    });
    return false;
  }
  const githubBody = await githubRes.json();
  const graphError = extractGraphQLErrorMessage(githubBody);
  if (graphError) {
    starGateLog("graphql_repo_backward_error", {
      username: targetUser,
      message: graphError,
    });
    return false;
  }

  const stargazers = githubBody.data?.repository?.stargazers as
    | { pageInfo?: PageInfo; nodes?: StargazerNode[] }
    | undefined;
  if (!stargazers) return false;

  const nodes = stargazers.nodes || [];
  if (nodes.some((n) => n.login.toLowerCase() === targetUser)) return true;

  if (!stargazers.pageInfo?.hasPreviousPage || !stargazers.pageInfo.startCursor)
    return false;
  return paginateRepoStarsBackward(
    targetOwner,
    targetName,
    targetUser,
    token,
    pagesLeft - 1,
    stargazers.pageInfo.startCursor,
  );
}
