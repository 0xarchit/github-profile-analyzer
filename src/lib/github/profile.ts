/**
 * GitHub profile data domain.
 *
 * Responsibilities:
 *  - Fetch the full `ProfileSummary` for a given username via GraphQL
 *  - Calculate contribution streaks (daily + weekly)
 *  - Build trophies and rank metadata
 *  - Resolve GitHub achievement badges (with Redis-backed caching)
 */

import {
  ProfileSummary,
  ContributionWeek,
  ContributionDay,
  GithubRepoNode,
} from "@/types";
import { getCachedData, setCachedData } from "@/lib/redis";
import { sendTelegramAlert } from "@/lib/telegram-alert";
import {
  getFallbackToken,
  fetchGitHubGraphQL,
  githubFetchWithTimeout,
} from "./http";

// ---------------------------------------------------------------------------
// Achievement badges
// ---------------------------------------------------------------------------

const ACHIEVEMENT_CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

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

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Checks whether a GitHub user has unlocked a specific achievement badge.
 * Results are cached in Redis for `ACHIEVEMENT_CACHE_TTL_SECONDS`.
 */
async function checkAchievementStatus(
  username: string,
  slug: string,
): Promise<string | null> {
  const cacheKey = `achievement:${normalizeUsername(username)}:${slug}`;

  const cached = await getCachedData<string>(cacheKey);
  if (cached !== null && cached !== undefined) {
    return cached === "__NONE__" ? null : cached;
  }

  const url = `https://github.com/${encodeURIComponent(username)}?tab=achievements&achievement=${slug}`;
  try {
    const res = await githubFetchWithTimeout(url, {
      method: "HEAD",
      headers: { "User-Agent": "GitScore/1.1" },
    });
    const value = res.status === 200 ? slug : null;
    await setCachedData(cacheKey, value === null ? "__NONE__" : value, ACHIEVEMENT_CACHE_TTL_SECONDS);
    return value;
  } catch {
    await setCachedData(cacheKey, "__NONE__", ACHIEVEMENT_CACHE_TTL_SECONDS);
    return null;
  }
}


// ---------------------------------------------------------------------------
// Rank / trophy helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

/**
 * Given the contribution weeks from the GitHub API, computes:
 *  - `daily_streak`  — current consecutive active days (from today backwards)
 *  - `daily_best`    — longest consecutive active-day run ever
 *  - `weekly_streak` — current consecutive active weeks
 *  - `weekly_best`   — longest consecutive active-week run ever
 */
export function calculateDetailedStreaks(weeks: ContributionWeek[]) {
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

// ---------------------------------------------------------------------------
// Profile summary
// ---------------------------------------------------------------------------

/**
 * Fetches the full `ProfileSummary` for `username` via the GitHub GraphQL API.
 *
 * @param username  The GitHub login to fetch (case-insensitive).
 * @param userToken Optional OAuth token belonging to the **viewer** (logged-in user).
 *                  When provided, it is used first to benefit from that user's rate limit.
 *                  Falls back to the shared GITHUB_TOKENS pool on 401/403.
 * @throws `Error("INVALID_USERNAME")` if the username is blank or literally "undefined".
 * @throws `Error("USER_NOT_FOUND")` if GitHub returns no user for that login.
 * @throws `Error("GITHUB_AUTH_FAILED")` if both the viewer token and a fallback token fail auth.
 */
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
    throw new Error("INVALID_USERNAME");
  }
  const token = userToken || getFallbackToken();
  console.log("[GITHUB_API] Using token", { hasUserToken: !!userToken });
  const query = `
    query($login: String!, $after: String) {
      user(login: $login) {
        avatarUrl, login, name, bio, followers { totalCount }, following { totalCount }
        contributionsCollection {
          totalCommitContributions, totalPullRequestContributions, totalIssueContributions, totalPullRequestReviewContributions, totalRepositoryContributions
          contributionCalendar {
            totalContributions
            weeks { contributionDays { contributionCount, date, color } }
          }
        }
        repositories(first: 100, after: $after, ownerAffiliations: [OWNER], orderBy: {field: STARGAZERS, direction: DESC}) {
          totalCount
          pageInfo { hasNextPage, endCursor }
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

  const pageQuery = `
    query($login: String!, $after: String) {
      user(login: $login) {
        repositories(first: 100, after: $after, ownerAffiliations: [OWNER], orderBy: {field: STARGAZERS, direction: DESC}) {
          pageInfo { hasNextPage, endCursor }
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
    return fetchGitHubGraphQL(authToken, query, { login: username, after: null });
  };

  let successfulToken = token;
  let res = await requestSummary(token);
  console.log("[GITHUB_API] Initial profile request completed", {
    status: res.status,
  });
  if (res.status === 401 || res.status === 403) {
    console.log("[GITHUB_API] Auth failed, retrying with fallback token");
    const retryToken = getFallbackToken();
    res = await requestSummary(retryToken);
    successfulToken = retryToken;
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
    throw new Error("USER_NOT_FOUND");
  }
  console.log("[GITHUB_API] User data parsed successfully", {
    username: user.login,
    repos: user.repositories.nodes.length,
  });

  const coll = user.contributionsCollection;
  const initialRepos = user.repositories.nodes || [];
  let allRepos: GithubRepoNode[] = [...initialRepos];

  let hasNext = user.repositories.pageInfo.hasNextPage;
  let cursor = user.repositories.pageInfo.endCursor;
  let pageCount = 1;

  while (hasNext && cursor && pageCount < 10) {
    console.log("[GITHUB_API] Fetching next page of repositories", { cursor, pageCount });
    const pageRes = await fetchGitHubGraphQL(successfulToken, pageQuery, { login: username, after: cursor });
    if (!pageRes.ok) {
      console.warn("[GITHUB_API] Failed to fetch next page of repositories, continuing with collected repos");
      break;
    }
    const pageBody = await pageRes.json();
    if (pageBody.errors || !pageBody.data?.user?.repositories) {
      console.warn("[GITHUB_API] GraphQL errors in page, continuing with collected repos", pageBody.errors);
      break;
    }
    const repoData = pageBody.data.user.repositories;
    allRepos.push(...(repoData.nodes || []));
    hasNext = repoData.pageInfo.hasNextPage;
    cursor = repoData.pageInfo.endCursor;
    pageCount++;
  }

  const allAuthoredRepos = allRepos.filter((r: GithubRepoNode) => !r.isFork);

  let total_stars = 0;
  allAuthoredRepos.forEach(
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
  })(allAuthoredRepos);

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
      val: allAuthoredRepos.length,
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
    public_repo_count: user.repositories.totalCount,
    total_stars,
    original_repos: allAuthoredRepos.slice(0, 60).reduce(
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
