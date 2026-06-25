/**
 * Shared low-level HTTP utilities for all GitHub API calls.
 *
 * Provides:
 *  - A token pool sourced from GITHUB_TOKENS env var
 *  - `getFallbackToken()` — random pick from the pool
 *  - `githubFetchWithTimeout()` — fetch wrapper with AbortController timeout
 *  - `fetchGitHubGraphQL()` — POST to the GraphQL endpoint with logging
 *  - `fetchGitHubRest()` — GET to the REST API with automatic token-drop retry
 *  - Header builders for GraphQL and REST
 */

export const GITHUB_TOKENS = (process.env.GITHUB_TOKENS || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

export const GITHUB_FETCH_TIMEOUT_MS = 10_000;

/**
 * Returns a random token from the GITHUB_TOKENS pool.
 * Throws if the pool is empty (guards against runtime env misconfiguration).
 */
export function getFallbackToken(): string {
  if (GITHUB_TOKENS.length === 0) {
    throw new Error("GITHUB_TOKENS environment variable is required");
  }
  const token = GITHUB_TOKENS[Math.floor(Math.random() * GITHUB_TOKENS.length)];
  if (!token) throw new Error("GITHUB_TOKENS environment variable is required");
  return token;
}

/**
 * Wraps `fetch` with an AbortController-based timeout.
 * The timeout fires after `timeoutMs` milliseconds and aborts the request.
 */
export async function githubFetchWithTimeout(
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

export function buildGitHubGraphQLHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "GitScore/1.1",
  };
}

export function buildGitHubRestHeaders(token?: string): HeadersInit {
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

/**
 * POST a GraphQL query to the GitHub GraphQL API.
 * Logs the request start and response status.
 * Throws on network/timeout errors; callers must check `response.ok`.
 */
export async function fetchGitHubGraphQL(
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

/**
 * GET a GitHub REST API endpoint.
 * If the first attempt returns 401/403 and a token was provided,
 * retries once without the token (public endpoint fallback).
 */
export async function fetchGitHubRest(
  url: string,
  token?: string,
): Promise<Response> {
  const first = await githubFetchWithTimeout(url, {
    headers: buildGitHubRestHeaders(token),
  });
  if ((first.status === 401 || first.status === 403) && token) {
    return githubFetchWithTimeout(url, {
      headers: buildGitHubRestHeaders(),
    });
  }
  return first;
}

/** Extract the first GraphQL error message from a parsed response body, or null. */
export function extractGraphQLErrorMessage(body: unknown): string | null {
  const errors =
    typeof body === "object" && body !== null
      ? (body as { errors?: Array<{ message?: string }> }).errors
      : undefined;
  if (!errors?.length) return null;
  return errors[0]?.message || "graphql_error";
}

/** Returns true if the Link header contains rel="next". */
export function hasNextPageFromLink(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  return linkHeader.includes('rel="next"');
}
