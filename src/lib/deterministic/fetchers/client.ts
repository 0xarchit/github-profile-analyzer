import type { AnalysisProgressCallback, AnalysisProgressEvent, BudgetSnapshot } from "../types";

export const GITHUB_API_VERSION = "2026-03-10";

type Bucket = "rest" | "graphql" | "search";

export class UserNotFoundError extends Error {
  constructor(public readonly username: string) {
    super(`GitHub user @${username} was not found.`);
    this.name = "UserNotFoundError";
  }
}

export class TokenUnavailableError extends Error {
  constructor(message = "GitHub API tokens are currently saturated. Please try again shortly.") {
    super(message);
    this.name = "TokenUnavailableError";
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

const sleep = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

const ENDPOINT_CACHE_TTL_MS = 10 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;
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
  if (endpointCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = endpointCache.keys().next().value;
    if (firstKey) endpointCache.delete(firstKey);
  }
  endpointCache.set(key, { expiresAt: Date.now() + ENDPOINT_CACHE_TTL_MS, data: structuredClone(data), headers: [...headers.entries()] });
};

export function computeTokenFingerprintSync(token: string): string {
  if (!token) return "anon";
  let h1 = 0x811c9dc5, h2 = 0x84222325, h3 = 0xcbf29ce4, h4 = 0x67452301;
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code + i), 0x5bd1e995);
    h3 = Math.imul(h3 ^ ((code << 4) | (code >>> 4)), 0x27d4eb2f);
    h4 = Math.imul(h4 ^ (code * 31), 0x165667b1);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`;
}

function combineSignals(timeoutMs: number, callerSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutSignal, callerSignal]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  timeoutSignal.addEventListener("abort", onAbort, { once: true });
  callerSignal.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export class GitHubClient {
  readonly budget: CallBudget;
  readonly cacheStats = { hits: 0, misses: 0 };
  private readonly tokenOrProvider: string | (() => string);
  private currentToken: string;
  private tokenFingerprint: string;
  private readonly onProgress?: AnalysisProgressCallback;
  private readonly startedAt: number;
  readonly signal?: AbortSignal;

  constructor(
    tokenOrProvider: string | (() => string),
    budgetLimits?: { rest: number; graphql: number; search: number },
    options: { onProgress?: AnalysisProgressCallback; startedAt?: number; signal?: AbortSignal } = {},
  ) {
    this.tokenOrProvider = tokenOrProvider;
    this.currentToken = typeof tokenOrProvider === "function" ? tokenOrProvider() : tokenOrProvider;
    this.tokenFingerprint = computeTokenFingerprintSync(this.currentToken);
    this.budget = new CallBudget(budgetLimits);
    this.onProgress = options.onProgress;
    this.startedAt = options.startedAt ?? Date.now();
    this.signal = options.signal;
  }

  rotateToken(): void {
    if (typeof this.tokenOrProvider === "function") {
      this.currentToken = this.tokenOrProvider();
      this.tokenFingerprint = computeTokenFingerprintSync(this.currentToken);
    }
  }

  private headers(extra: HeadersInit = {}): Headers {
    const headers = new Headers(extra);
    headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);
    headers.set("User-Agent", "GitScore-Deterministic-Analyzer/2.0");
    if (this.currentToken) {
      headers.set("Authorization", `Bearer ${this.currentToken}`);
    }
    return headers;
  }

  private emit(
    kind: "phase" | "warning" | "retry" | "cache" | "request-start" | "request-complete",
    phase: string,
    message: string,
    meta?: Partial<AnalysisProgressEvent>,
  ) {
    if (this.signal?.aborted) return;
    this.onProgress?.({
      kind,
      phase,
      message,
      timestamp: new Date().toISOString(),
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      budget: this.budget.snapshot(),
      ...meta,
    });
  }

  async rest<T>(
    path: string,
    options: {
      bucket?: Bucket;
      label?: string;
      headers?: HeadersInit;
      cache?: boolean;
      retries?: number;
    } = {},
  ): Promise<{ data: T; headers: Headers; cached: boolean }> {
    if (this.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const bucket = options.bucket ?? "rest";
    const label = options.label ?? path;
    const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
    const requestHeaders = new Headers(options.headers);
    const acceptHeader = requestHeaders.get("accept") ?? "application/json";
    const cacheKey = `rest:${this.tokenFingerprint}:${acceptHeader}:${url}`;
    const useCache = options.cache ?? true;

    if (useCache) {
      const cached = readEndpointCache<T>(cacheKey);
      if (cached) {
        this.cacheStats.hits += 1;
        this.emit("cache", "cache", `Served ${label} from endpoint cache`, { bucket, label });
        return { data: cached.data, headers: cached.headers, cached: true };
      }
    }
    this.cacheStats.misses += 1;

    const retries = options.retries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (this.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        this.budget.take(bucket, label);
      } catch (error) {
        this.emit("warning", "budget", `Skipped ${label}: ${bucket.toUpperCase()} call budget exhausted.`, {
          bucket,
          label,
          method: "GET",
        });
        throw error;
      }
      this.emit("request-start", bucket === "search" ? "public-activity" : "github-request", `Calling ${bucket.toUpperCase()} ${label}`, {
        bucket,
        label,
        method: "GET",
        attempt: attempt + 1,
      });

      const effectiveSignal = combineSignals(15_000, this.signal);
      const response = await fetch(url, { headers: this.headers(options.headers), signal: effectiveSignal });
      this.emit("request-complete", bucket === "search" ? "public-activity" : "github-request", `${bucket.toUpperCase()} ${label} returned ${response.status}`, {
        bucket,
        label,
        method: "GET",
        attempt: attempt + 1,
        statusCode: response.status,
      });

      if (response.status === 202 || response.status === 403 || response.status === 429) {
        const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? "1");
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const shouldRetry403 = response.status === 403 && (remaining === 0 || retryAfter > 0);
        const shouldRetry = response.status === 202 || response.status === 429 || shouldRetry403;

        if (attempt < retries && shouldRetry) {
          if (response.status === 403 || response.status === 429) {
            this.rotateToken();
          }
          const delayMs = Math.max(retryAfter * 1_000, 600 * 2 ** attempt);
          this.emit("retry", "github-retry", `${label} returned ${response.status}; backing off ${delayMs}ms before retry ${attempt + 1}/${retries}`, {
            bucket,
            label,
            method: "GET",
            attempt: attempt + 1,
            statusCode: response.status,
            retryAfterMs: delayMs,
          });
          await sleep(delayMs, this.signal);
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
        throw new GitHubRequestError(
          `GitHub ${response.status} from ${url}: ${typeof parsed === "object" && parsed !== null && "message" in parsed ? String((parsed as { message: unknown }).message) : body}`,
          response.status,
          url,
          parsed,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const data = (isJson ? await response.json() : await response.text()) as T;
      if (useCache) writeEndpointCache(cacheKey, data, response.headers);
      return { data, headers: response.headers, cached: false };
    }
    throw new GitHubRequestError(`Exhausted retries for ${label}`, 500, url, null);
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}, label = "GraphQL batch"): Promise<T> {
    if (this.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const retries = typeof this.tokenOrProvider === "function" ? 2 : 1;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const cacheKey = `graphql:${this.tokenFingerprint}:${JSON.stringify({ query, variables })}`;
      const cached = readEndpointCache<T>(cacheKey);
      if (cached) {
        this.cacheStats.hits += 1;
        this.emit("cache", "cache", `Served ${label} from endpoint cache`, { bucket: "graphql", label });
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
        attempt: attempt + 1,
      });
      const effectiveSignal = combineSignals(15_000, this.signal);
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query, variables }),
        signal: effectiveSignal,
      });
      this.emit("request-complete", "graphql", `GRAPHQL ${label} returned ${response.status}`, {
        bucket: "graphql",
        label,
        method: "POST",
        attempt: attempt + 1,
        statusCode: response.status,
      });

      if (response.status === 202 || response.status === 403 || response.status === 429) {
        const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? "1");
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const shouldRetry403 = response.status === 403 && (remaining === 0 || retryAfter > 0);
        const shouldRetry = response.status === 202 || response.status === 429 || shouldRetry403;

        if (attempt < retries && shouldRetry) {
          if (response.status === 403 || response.status === 429) {
            this.rotateToken();
          }
          const delayMs = Math.max(retryAfter * 1_000, 600 * 2 ** attempt);
          this.emit("retry", "github-retry", `${label} returned ${response.status}; backing off ${delayMs}ms before retry ${attempt + 1}/${retries}`, {
            bucket: "graphql",
            label,
            method: "POST",
            attempt: attempt + 1,
            statusCode: response.status,
            retryAfterMs: delayMs,
          });
          await sleep(delayMs, this.signal);
          continue;
        }
      }

      if (!response.ok) {
        let errBody: unknown = null;
        try {
          errBody = await response.json();
        } catch {
          /* ignore */
        }
        throw new GitHubRequestError(
          `GraphQL request failed with HTTP ${response.status}`,
          response.status,
          "https://api.github.com/graphql",
          errBody,
        );
      }

      let body: { data?: T; errors?: Array<{ message: string }> };
      try {
        body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
      } catch (jsonErr) {
        throw new GitHubRequestError(
          "Failed to parse GraphQL response JSON",
          response.status,
          "https://api.github.com/graphql",
          jsonErr,
        );
      }

      if (!body.data) {
        throw new GitHubRequestError(
          body.errors?.map((error) => error.message).join("; ") || `GraphQL request returned no data (${response.status})`,
          response.status,
          "https://api.github.com/graphql",
          body,
        );
      }
      if (!body.errors || body.errors.length === 0) {
        writeEndpointCache(cacheKey, body.data, response.headers);
      }
      return body.data;
    }
    throw new GitHubRequestError(`GraphQL ${label} failed after retries`, 503, "https://api.github.com/graphql", null);
  }
}

export const isUnavailableStatus = (error: unknown, statuses = [404, 409, 422]) =>
  error instanceof GitHubRequestError && statuses.includes(error.status);
