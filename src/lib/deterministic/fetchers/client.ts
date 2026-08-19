import type { AnalysisProgressCallback, BudgetSnapshot } from "../types";

export const GITHUB_API_VERSION = "2026-03-10";

type Bucket = "rest" | "graphql" | "search";

export class UserNotFoundError extends Error {
  constructor(public readonly username: string) {
    super(`GitHub user @${username} was not found.`);
    this.name = "UserNotFoundError";
  }
}

export class BudgetExceededError extends Error {
  constructor(public readonly bucket: Bucket, public readonly label: string) {
    super(`${bucket} call budget exhausted before ${label}`);
  }
}

export class GitHubRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly responseBody: unknown,
  ) {
    super(message);
  }
}

export class CallBudget {
  private used = { rest: 0, graphql: 0, search: 0 };

  constructor(private readonly limits = { rest: 240, graphql: 8, search: 10 }) {}

  take(bucket: Bucket, label: string) {
    if (this.used[bucket] >= this.limits[bucket]) throw new BudgetExceededError(bucket, label);
    this.used[bucket] += 1;
  }

  snapshot(): BudgetSnapshot {
    return {
      rest: { used: this.used.rest, limit: this.limits.rest, remaining: this.limits.rest - this.used.rest },
      graphql: { used: this.used.graphql, limit: this.limits.graphql, remaining: this.limits.graphql - this.used.graphql },
      search: { used: this.used.search, limit: this.limits.search, remaining: this.limits.search - this.used.search },
    };
  }
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const ENDPOINT_CACHE_TTL_MS = 10 * 60 * 1_000;
const endpointCache = new Map<string, { expiresAt: number; data: unknown; headers: Array<[string, string]> }>();

const readEndpointCache = <T>(key: string) => {
  const cached = endpointCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) endpointCache.delete(key);
    return null;
  }
  return { data: structuredClone(cached.data) as T, headers: new Headers(cached.headers) };
};

const writeEndpointCache = (key: string, data: unknown, headers: Headers) => {
  endpointCache.set(key, { expiresAt: Date.now() + ENDPOINT_CACHE_TTL_MS, data: structuredClone(data), headers: [...headers.entries()] });
};

interface GitHubClientOptions {
  onProgress?: AnalysisProgressCallback;
  startedAt?: number;
}

type RequestStatus = "request-start" | "request-complete" | "retry" | "warning" | "cache";

export class GitHubClient {
  readonly budget: CallBudget;
  readonly cacheStats = { hits: 0, misses: 0 };

  private readonly onProgress?: AnalysisProgressCallback;
  private readonly startedAt: number;
  private currentToken: string;
  private readonly tokenProvider?: () => string;

  constructor(
    tokenOrProvider: string | (() => string),
    limits?: { rest: number; graphql: number; search: number },
    options: GitHubClientOptions = {},
  ) {
    if (typeof tokenOrProvider === "function") {
      this.tokenProvider = tokenOrProvider;
      this.currentToken = tokenOrProvider();
    } else {
      this.currentToken = tokenOrProvider;
    }
    if (!this.currentToken) throw new Error("Missing required GitHub access token.");
    this.budget = new CallBudget(limits);
    this.onProgress = options.onProgress;
    this.startedAt = options.startedAt ?? Date.now();
  }

  private rotateToken(): string {
    if (this.tokenProvider) {
      this.currentToken = this.tokenProvider();
    }
    return this.currentToken;
  }

  private emit(
    kind: RequestStatus,
    phase: string,
    message: string,
    details: {
      bucket?: Bucket;
      label?: string;
      method?: string;
      attempt?: number;
      statusCode?: number;
      retryAfterMs?: number;
    } = {},
  ) {
    this.onProgress?.({
      kind,
      phase,
      message,
      timestamp: new Date().toISOString(),
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      budget: this.budget.snapshot(),
      ...details,
    });
  }

  private headers(extra?: HeadersInit) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.currentToken}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "github-deterministic-preview",
      ...extra,
    };
  }

  async rest<T>(path: string, options: RequestInit & { bucket?: Bucket; label?: string; retries?: number } = {}): Promise<{ data: T; headers: Headers }> {
    const bucket = options.bucket ?? (path.startsWith("/search/") ? "search" : "rest");
    const label = options.label ?? path;
    const retries = options.retries ?? 3;
    const url = `https://api.github.com${path}`;

    const { bucket: _bucket, label: _label, retries: _retries, ...requestInit } = options;
    const method = (requestInit.method ?? "GET").toUpperCase();
    const accept = new Headers(this.headers(options.headers)).get("accept") ?? "";
    const cacheKey = `rest:${method}:${accept}:${url}`;
    const cacheable = method === "GET" && path !== "/rate_limit";
    if (cacheable) {
      const cached = readEndpointCache<T>(cacheKey);
      if (cached) {
        this.cacheStats.hits += 1;
        this.emit("cache", "endpoint-cache", `Reused cached response for ${label}`, { bucket, label, method });
        return cached;
      }
      this.cacheStats.misses += 1;
    }
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const attemptLabel = attempt === 0 ? label : `${label} retry ${attempt}`;
      try {
        this.budget.take(bucket, attemptLabel);
      } catch (error) {
        this.emit("warning", "budget", `Skipped ${label}: call budget exhausted.`, {
          bucket,
          label,
          method: requestInit.method ?? "GET",
          attempt: attempt + 1,
        });
        throw error;
      }

      this.emit("request-start", bucket === "search" ? "public-activity" : "github-request", `Calling ${bucket.toUpperCase()} ${label}`, {
        bucket,
        label,
        method: requestInit.method ?? "GET",
        attempt: attempt + 1,
      });
      const response = await fetch(url, { ...requestInit, headers: this.headers(options.headers) });
      this.emit("request-complete", bucket === "search" ? "public-activity" : "github-request", `${bucket.toUpperCase()} ${label} returned ${response.status}`, {
        bucket,
        label,
        method: requestInit.method ?? "GET",
        attempt: attempt + 1,
        statusCode: response.status,
      });

      if (response.status === 202 || response.status === 403 || response.status === 429) {
        const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? "1");
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        if (attempt < retries && (response.status === 202 || remaining > 0 || retryAfter > 0 || response.status === 403 || response.status === 429)) {
          // If rate limited, rotate token from pool for next attempt
          if (response.status === 403 || response.status === 429) {
            this.rotateToken();
          }
          const delayMs = Math.max(retryAfter * 1_000, 600 * 2 ** attempt);
          this.emit("retry", "github-retry", `${label} returned ${response.status}; backing off ${delayMs}ms before retry ${attempt + 1}/${retries}`, {
            bucket,
            label,
            method: requestInit.method ?? "GET",
            attempt: attempt + 1,
            statusCode: response.status,
            retryAfterMs: delayMs,
          });
          await sleep(delayMs);
          continue;
        }
      }

      if (response.status === 202) {
        const body = await response.text();
        let parsed: unknown = body;
        try { parsed = JSON.parse(body); } catch {}
        throw new GitHubRequestError(`GitHub request did not settle for ${label}`, response.status, url, parsed);
      }

      if (!response.ok) {
        const body = await response.text();
        let parsed: unknown = body;
        try { parsed = JSON.parse(body); } catch {}
        throw new GitHubRequestError(`GitHub request failed (${response.status}) for ${label}`, response.status, url, parsed);
      }

      if (response.status === 204) {
        if (cacheable) writeEndpointCache(cacheKey, null, response.headers);
        return { data: null as T, headers: response.headers };
      }
      const data = await response.json() as T;
      if (cacheable) writeEndpointCache(cacheKey, data, response.headers);
      return { data, headers: response.headers };
    }

    throw new GitHubRequestError(`GitHub request did not settle for ${label}`, 202, url, null);
  }

  async graphql<T>(query: string, variables: Record<string, unknown>, label: string): Promise<T> {
    const cacheKey = `graphql:${query}:${JSON.stringify(variables)}`;
    const cached = readEndpointCache<T>(cacheKey);
    if (cached) {
      this.cacheStats.hits += 1;
      this.emit("cache", "endpoint-cache", `Reused cached GraphQL response for ${label}`, { bucket: "graphql", label, method: "POST" });
      return cached.data;
    }
    this.cacheStats.misses += 1;
    try {
      this.budget.take("graphql", label);
    } catch (error) {
      this.emit("warning", "budget", `Skipped ${label}: GraphQL call budget exhausted.`, {
        bucket: "graphql",
        label,
        method: "POST",
      });
      throw error;
    }
    this.emit("request-start", "graphql", `Calling GRAPHQL ${label}`, {
      bucket: "graphql",
      label,
      method: "POST",
      attempt: 1,
    });
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query, variables }),
    });
    this.emit("request-complete", "graphql", `GRAPHQL ${label} returned ${response.status}`, {
      bucket: "graphql",
      label,
      method: "POST",
      attempt: 1,
      statusCode: response.status,
    });
    const body = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (!response.ok || body.errors?.length || !body.data) {
      throw new GitHubRequestError(
        body.errors?.map((error) => error.message).join("; ") || `GraphQL request failed (${response.status})`,
        response.status,
        "https://api.github.com/graphql",
        body,
      );
    }
    writeEndpointCache(cacheKey, body.data, response.headers);
    return body.data;
  }
}

export const isUnavailableStatus = (error: unknown, statuses = [404, 409, 422]) =>
  error instanceof GitHubRequestError && statuses.includes(error.status);
