/**
 * Star-gate domain — verifies whether a GitHub user has starred the target repo.
 *
 * Strategy (in order):
 *  1. User's own OAuth token → direct REST `GET /user/starred/:repo` (204 = starred)
 *  2. Redis cache of previously verified stargazers
 *  3. Bidirectional GraphQL scan (user's starred list ↔ repo's stargazer list)
 *  4. REST fallback scan (paginated stargazer/starred lists)
 *
 * All public functions guard against blank/invalid usernames and return `false`
 * rather than throwing, so callers don't need extra try/catch.
 */

import { getCachedData, setCachedData } from "@/lib/redis";
import { sendTelegramAlert } from "@/lib/telegram-alert";
import {
  getFallbackToken,
  fetchGitHubGraphQL,
  fetchGitHubRest,
  extractGraphQLErrorMessage,
  hasNextPageFromLink,
  githubFetchWithTimeout,
} from "./http";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAR_PAGE_SIZE = 100;
const STAR_QUICK_LIMIT = 6;
const STAR_DEEP_LIMIT = 120;
const STAR_REST_LIMIT = 250;
const STAR_CACHE_TTL = 900;
const STAR_GATE_DEBUG = process.env.STAR_GATE_DEBUG === "1";

const TARGET_OWNER = "0xarchit";
const TARGET_NAME = "github-profile-analyzer";
const TARGET_REPO = `${TARGET_OWNER}/${TARGET_NAME}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function starGateLog(event: string, payload: Record<string, unknown>): void {
  if (!STAR_GATE_DEBUG) return;
  console.info(`[star-gate] ${event}`, payload);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

async function saveStarToD1(username: string): Promise<void> {
  if (!process.env.DB) return;
  try {
    await process.env.DB.prepare(
      "INSERT OR IGNORE INTO stargazers (username) VALUES (?)"
    )
      .bind(username)
      .run();
  } catch (err) {
    console.error("[D1] Failed to save stargazer to D1:", err);
  }
}

async function cacheVerifiedStar(username: string): Promise<void> {
  const normalized = normalizeUsername(username);
  const cacheKey = `repo:stargazers:${TARGET_REPO}`;
  
  // Save to Cloudflare D1 if available
  await saveStarToD1(normalized);

  const cached = (await getCachedData<string[]>(cacheKey)) || [];
  if (cached.some((s) => normalizeUsername(s) === normalized)) {
    return;
  }
  cached.push(normalized);
  await setCachedData(cacheKey, cached, STAR_CACHE_TTL);
}

// ---------------------------------------------------------------------------
// Generic cursor-walk paginator (replaces 4 near-identical recursive fns)
// ---------------------------------------------------------------------------

type ForwardPage<T> = {
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
} | null;

type BackwardPage<T> = {
  nodes: T[];
  pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
} | null;

async function paginateForward<T>(
  fetchPage: (cursor: string | null) => Promise<ForwardPage<T>>,
  match: (node: T) => boolean,
  pagesLeft: number,
  cursor: string | null = null,
): Promise<boolean> {
  if (pagesLeft <= 0) return false;
  const page = await fetchPage(cursor);
  if (!page) return false;
  if (page.nodes.some(match)) return true;
  if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return false;
  return paginateForward(fetchPage, match, pagesLeft - 1, page.pageInfo.endCursor);
}

async function paginateBackward<T>(
  fetchPage: (cursor: string | null) => Promise<BackwardPage<T>>,
  match: (node: T) => boolean,
  pagesLeft: number,
  cursor: string | null = null,
): Promise<boolean> {
  if (pagesLeft <= 0) return false;
  const page = await fetchPage(cursor);
  if (!page) return false;
  if (page.nodes.some(match)) return true;
  if (!page.pageInfo.hasPreviousPage || !page.pageInfo.startCursor) return false;
  return paginateBackward(fetchPage, match, pagesLeft - 1, page.pageInfo.startCursor);
}

// ---------------------------------------------------------------------------
// GraphQL page fetchers
// ---------------------------------------------------------------------------

async function fetchUserStarsPageForward(
  token: string,
  username: string,
  cursor: string | null,
): Promise<ForwardPage<StarredRepoNode>> {
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
  const res = await fetchGitHubGraphQL(token, query, { user: username, after: cursor });
  if (!res.ok) {
    starGateLog("graphql_user_forward_http_error", { username, status: res.status });
    return null;
  }
  const body = await res.json();
  if (extractGraphQLErrorMessage(body)) {
    starGateLog("graphql_user_forward_error", { username, message: extractGraphQLErrorMessage(body) });
    return null;
  }
  const sr = body.data?.user?.starredRepositories as
    | { pageInfo?: PageInfo; nodes?: StarredRepoNode[] }
    | undefined;
  if (!sr) return null;
  return {
    nodes: sr.nodes || [],
    pageInfo: {
      hasNextPage: sr.pageInfo?.hasNextPage ?? false,
      endCursor: sr.pageInfo?.endCursor ?? null,
    },
  };
}

async function fetchUserStarsPageBackward(
  token: string,
  username: string,
  cursor: string | null,
): Promise<BackwardPage<StarredRepoNode>> {
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
  const res = await fetchGitHubGraphQL(token, query, { user: username, before: cursor });
  if (!res.ok) {
    starGateLog("graphql_user_backward_http_error", { username, status: res.status });
    return null;
  }
  const body = await res.json();
  if (extractGraphQLErrorMessage(body)) {
    starGateLog("graphql_user_backward_error", { username, message: extractGraphQLErrorMessage(body) });
    return null;
  }
  const sr = body.data?.user?.starredRepositories as
    | { pageInfo?: PageInfo; nodes?: StarredRepoNode[] }
    | undefined;
  if (!sr) return null;
  return {
    nodes: sr.nodes || [],
    pageInfo: {
      hasPreviousPage: sr.pageInfo?.hasPreviousPage ?? false,
      startCursor: sr.pageInfo?.startCursor ?? null,
    },
  };
}

async function fetchRepoStarsPageForward(
  token: string,
  cursor: string | null,
): Promise<ForwardPage<StargazerNode>> {
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
  const res = await fetchGitHubGraphQL(token, query, {
    owner: TARGET_OWNER,
    name: TARGET_NAME,
    after: cursor,
  });
  if (!res.ok) {
    starGateLog("graphql_repo_forward_http_error", { status: res.status });
    return null;
  }
  const body = await res.json();
  if (extractGraphQLErrorMessage(body)) {
    starGateLog("graphql_repo_forward_error", { message: extractGraphQLErrorMessage(body) });
    return null;
  }
  const sg = body.data?.repository?.stargazers as
    | { pageInfo?: PageInfo; nodes?: StargazerNode[] }
    | undefined;
  if (!sg) return null;
  return {
    nodes: sg.nodes || [],
    pageInfo: {
      hasNextPage: sg.pageInfo?.hasNextPage ?? false,
      endCursor: sg.pageInfo?.endCursor ?? null,
    },
  };
}

async function fetchRepoStarsPageBackward(
  token: string,
  cursor: string | null,
): Promise<BackwardPage<StargazerNode>> {
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
  const res = await fetchGitHubGraphQL(token, query, {
    owner: TARGET_OWNER,
    name: TARGET_NAME,
    before: cursor,
  });
  if (!res.ok) {
    starGateLog("graphql_repo_backward_http_error", { status: res.status });
    return null;
  }
  const body = await res.json();
  if (extractGraphQLErrorMessage(body)) {
    starGateLog("graphql_repo_backward_error", { message: extractGraphQLErrorMessage(body) });
    return null;
  }
  const sg = body.data?.repository?.stargazers as
    | { pageInfo?: PageInfo; nodes?: StargazerNode[] }
    | undefined;
  if (!sg) return null;
  return {
    nodes: sg.nodes || [],
    pageInfo: {
      hasPreviousPage: sg.pageInfo?.hasPreviousPage ?? false,
      startCursor: sg.pageInfo?.startCursor ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Bidirectional GraphQL scans
// ---------------------------------------------------------------------------

async function scanUserStarsBidirectional(
  username: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  if (maxPages <= 0) return false;
  const quickPages = Math.min(STAR_QUICK_LIMIT, maxPages);
  const targetFullName = TARGET_REPO.toLowerCase();
  const matchRepo = (n: StarredRepoNode) =>
    n.nameWithOwner.toLowerCase() === targetFullName;

  const [quickNewest, quickOldest] = await Promise.all([
    paginateForward(
      (cursor) => fetchUserStarsPageForward(token, username, cursor),
      matchRepo,
      quickPages,
    ),
    paginateBackward(
      (cursor) => fetchUserStarsPageBackward(token, username, cursor),
      matchRepo,
      quickPages,
    ),
  ]);
  if (quickNewest || quickOldest) return true;
  if (maxPages <= quickPages) return false;

  if (
    await paginateBackward(
      (cursor) => fetchUserStarsPageBackward(token, username, cursor),
      matchRepo,
      maxPages,
    )
  )
    return true;
  return paginateForward(
    (cursor) => fetchUserStarsPageForward(token, username, cursor),
    matchRepo,
    maxPages,
  );
}

async function scanRepoStarsBidirectional(
  username: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  if (maxPages <= 0) return false;
  const quickPages = Math.min(STAR_QUICK_LIMIT, maxPages);
  const targetUser = username.toLowerCase();
  const matchUser = (n: StargazerNode) => n.login.toLowerCase() === targetUser;

  const [quickNewest, quickOldest] = await Promise.all([
    paginateForward(
      (cursor) => fetchRepoStarsPageForward(token, cursor),
      matchUser,
      quickPages,
    ),
    paginateBackward(
      (cursor) => fetchRepoStarsPageBackward(token, cursor),
      matchUser,
      quickPages,
    ),
  ]);
  if (quickNewest || quickOldest) return true;
  if (maxPages <= quickPages) return false;

  if (
    await paginateBackward(
      (cursor) => fetchRepoStarsPageBackward(token, cursor),
      matchUser,
      maxPages,
    )
  )
    return true;
  return paginateForward(
    (cursor) => fetchRepoStarsPageForward(token, cursor),
    matchUser,
    maxPages,
  );
}

// ---------------------------------------------------------------------------
// REST fallback scans
// ---------------------------------------------------------------------------

async function scanRepoStargazersRest(
  username: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  const targetUser = normalizeUsername(username);
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/repos/${encodeURIComponent(TARGET_OWNER)}/${encodeURIComponent(TARGET_NAME)}/stargazers?per_page=100&page=${page}`;
    const res = await fetchGitHubRest(url, token);
    if (!res.ok) {
      starGateLog("rest_repo_page_error", { username: targetUser, page, status: res.status });
      return false;
    }
    const body = (await res.json()) as RestStargazerNode[];
    if (body.some((item) => normalizeUsername(item.login || "") === targetUser)) {
      starGateLog("rest_repo_page_hit", { username: targetUser, page });
      return true;
    }
    const hasNext = hasNextPageFromLink(res.headers.get("link"));
    if (!hasNext || body.length < STAR_PAGE_SIZE) break;
  }
  return false;
}

async function scanUserStarredRest(
  username: string,
  token: string,
  maxPages: number,
): Promise<boolean> {
  const targetUser = normalizeUsername(username);
  const targetRepo = TARGET_REPO.toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/users/${encodeURIComponent(targetUser)}/starred?per_page=100&page=${page}`;
    const res = await fetchGitHubRest(url, token);
    if (!res.ok) {
      starGateLog("rest_user_page_error", { username: targetUser, page, status: res.status });
      return false;
    }
    const body = (await res.json()) as RestStarredRepoNode[];
    if (body.some((item) => (item.full_name || "").toLowerCase() === targetRepo)) {
      starGateLog("rest_user_page_hit", { username: targetUser, page });
      return true;
    }
    const hasNext = hasNextPageFromLink(res.headers.get("link"));
    if (!hasNext || body.length < STAR_PAGE_SIZE) break;
  }
  return false;
}

async function executeRestFallbackStarCheck(
  username: string,
  token: string,
  repoStars = 0,
  userStars = 0,
): Promise<boolean> {
  const limitPages = Math.ceil(STAR_REST_LIMIT / STAR_PAGE_SIZE);
  const repoPages = repoStars > 0
    ? Math.max(1, Math.min(Math.ceil(repoStars / STAR_PAGE_SIZE), limitPages))
    : limitPages;
  const userPages = userStars > 0
    ? Math.max(1, Math.min(Math.ceil(userStars / STAR_PAGE_SIZE), limitPages))
    : limitPages;

  if (await scanRepoStargazersRest(username, token, repoPages)) return true;
  return scanUserStarredRest(username, token, userPages);
}

// ---------------------------------------------------------------------------
// Core bidirectional check
// ---------------------------------------------------------------------------

async function executeBidirectionalStarCheck(username: string): Promise<boolean> {
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
      owner: TARGET_OWNER,
      name: TARGET_NAME,
      user: username,
    });
    if (!resCount.ok) {
      starGateLog("graphql_count_http_error", { username, status: resCount.status });
      return executeRestFallbackStarCheck(username, token);
    }
    const countBody = await resCount.json();
    const countError = extractGraphQLErrorMessage(countBody);
    if (countError) {
      starGateLog("graphql_count_error", { username, message: countError });
    }
    const repoStars = Number(countBody.data?.repository?.stargazerCount || 0);
    const userStars = Number(
      countBody.data?.user?.starredRepositories?.totalCount || 0,
    );

    const userPages = Math.min(Math.ceil(userStars / STAR_PAGE_SIZE), STAR_DEEP_LIMIT);
    const repoPages = Math.min(Math.ceil(repoStars / STAR_PAGE_SIZE), STAR_DEEP_LIMIT);

    starGateLog("graphql_count", { username, repoStars, userStars, repoPages, userPages });

    let graphVerified = false;

    if (userStars <= repoStars) {
      graphVerified = await scanUserStarsBidirectional(username, token, userPages);
      if (!graphVerified) {
        graphVerified = await scanRepoStarsBidirectional(username, token, repoPages);
      }
    } else {
      graphVerified = await scanRepoStarsBidirectional(username, token, repoPages);
      if (!graphVerified) {
        graphVerified = await scanUserStarsBidirectional(username, token, userPages);
      }
    }

    if (graphVerified) {
      starGateLog("graphql_scan_pass", { username });
      return true;
    }

    starGateLog("graphql_scan_miss", { username });
    const restVerified = await executeRestFallbackStarCheck(
      username,
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
    starGateLog("graphql_scan_exception", { username, message: toErrorMessage(e) });
    return executeRestFallbackStarCheck(username, token);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether `username` has starred the `0xarchit/github-profile-analyzer` repo.
 *
 * @param username   The GitHub login to check.
 * @param userToken  Optional OAuth token for the viewer (used for a direct, authoritative REST check).
 * @returns `true` if the user has starred the repo, `false` otherwise (never throws).
 */
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

  starGateLog("check_start", {
    username: normalizedUsername,
    hasUserToken: Boolean(userToken),
  });

  // Strategy 0: Cloudflare D1 local database (O(1) lookups)
  if (process.env.DB) {
    try {
      const stmt = process.env.DB.prepare(
        "SELECT 1 FROM stargazers WHERE username = ? LIMIT 1"
      );
      const res = await stmt.bind(normalizedUsername).first();
      if (res) {
        starGateLog("check_pass_d1", { username: normalizedUsername });
        return true;
      }
      starGateLog("check_d1_miss", { username: normalizedUsername });
    } catch (err) {
      console.error("[D1] Database query failed, falling back:", err);
      void sendTelegramAlert({
        source: "STAR_CHECK_D1",
        message: "D1 database query failed, falling back",
        error: err,
        context: { username: normalizedUsername },
      }).catch(() => null);
    }
  }

  // Strategy 1: viewer's own token (direct, most reliable)
  if (userToken) {
    try {
      const res = await githubFetchWithTimeout(
        `https://api.github.com/user/starred/${TARGET_REPO}`,
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "GitScore/1.1",
          },
        },
      );
      if (res.status === 204) {
        await cacheVerifiedStar(normalizedUsername);
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

  // Strategy 2: Redis cache
  const cacheKey = `repo:stargazers:${TARGET_REPO}`;
  try {
    const cachedStargazers = await getCachedData<string[]>(cacheKey);
    if (
      cachedStargazers?.some((u) => normalizeUsername(u) === normalizedUsername)
    ) {
      starGateLog("check_pass_cache", { username: normalizedUsername });
      return true;
    }

    // Strategy 3 & 4: bidirectional GraphQL + REST fallback
    const isVerified = await executeBidirectionalStarCheck(normalizedUsername);
    if (isVerified) {
      await cacheVerifiedStar(normalizedUsername);
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

/**
 * Verifies a guest user's star and injects them into the Redis stargazer cache.
 * Used by the `/api/auth/verify-guest` route.
 *
 * @returns `true` if the star was verified, `false` otherwise.
 */
export async function verifyAndInjectStar(username: string): Promise<boolean> {
  const normalizedUsername = normalizeUsername(username || "");
  if (
    !normalizedUsername ||
    normalizedUsername === "undefined" ||
    normalizedUsername === "null"
  )
    return false;
  starGateLog("verify_guest_start", { username: normalizedUsername });

  // Strategy 0: Cloudflare D1 local database (O(1) lookups)
  if (process.env.DB) {
    try {
      const stmt = process.env.DB.prepare(
        "SELECT 1 FROM stargazers WHERE username = ? LIMIT 1"
      );
      const res = await stmt.bind(normalizedUsername).first();
      if (res) {
        starGateLog("verify_guest_pass_d1", { username: normalizedUsername });
        return true;
      }
    } catch (err) {
      console.error("[D1] Database query failed in verifyAndInjectStar:", err);
    }
  }

  const isVerified = await executeBidirectionalStarCheck(normalizedUsername);
  if (isVerified) {
    await cacheVerifiedStar(normalizedUsername);
    starGateLog("verify_guest_pass", { username: normalizedUsername });
  } else {
    starGateLog("verify_guest_fail", { username: normalizedUsername });
  }
  return isVerified;
}

/**
 * Returns the current stargazer count for the `0xarchit/github-profile-analyzer` repo.
 * Returns `null` on any error.
 */
export async function getRepoStarCount(): Promise<number | null> {
  const url = `https://api.github.com/repos/${TARGET_REPO}`;
  const token = getFallbackToken();
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "GitScore/1.1",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    const response = await githubFetchWithTimeout(url, { headers });
    if (!response.ok) return null;
    const payload = (await response.json()) as { stargazers_count?: number };
    return typeof payload.stargazers_count === "number"
      ? payload.stargazers_count
      : null;
  } catch {
    return null;
  }
}
