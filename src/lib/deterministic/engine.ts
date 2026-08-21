import { GITHUB_API_VERSION, GitHubClient, TokenUnavailableError, computeTokenFingerprintSync } from "./fetchers/client";
import { collectEngineData } from "./fetchers/collect";
import { runBaselineRules } from "./rules/baseline";
import { runChartRules } from "./rules/charts";
import { runScoringRules } from "./rules/scoring";
import { runSignalRules } from "./rules/signals";
import { runInterpretation } from "./interpretation";
import { getFallbackToken } from "@/lib/github/http";
import { getCachedData, setCachedData } from "@/lib/redis";
import { GITHUB_USERNAME_REGEX } from "@/lib/validation";
import type { AnalysisMode, AnalysisModeProfile, AnalysisProgressCallback, AnalysisProgressEvent, BudgetSnapshot, EngineResult, RuleResult } from "./types";

export const ANALYSIS_MODE_PROFILES: Record<AnalysisMode, AnalysisModeProfile> = {
  quick: {
    id: "quick",
    label: "Quick",
    description: "Fast public snapshot with two enriched repositories and batched GraphQL.",
    expectedCalls: { minimum: 8, maximum: 18 },
    budget: { rest: 20, graphql: 4, search: 4 },
    repositoryLimit: 2,
    forkLimit: 0,
    starRepositoryLimit: 0,
    commitDetailLimit: 0,
  },
  standard: {
    id: "standard",
    label: "Standard",
    description: "Balanced dashboard run with four enriched repositories and batched GraphQL.",
    expectedCalls: { minimum: 15, maximum: 30 },
    budget: { rest: 30, graphql: 4, search: 4 },
    repositoryLimit: 4,
    forkLimit: 1,
    starRepositoryLimit: 2,
    commitDetailLimit: 30,
  },
  deep: {
    id: "deep",
    label: "Deep",
    description: "Full deterministic pass with top-6 repositories, batched GraphQL, and statistical sampling.",
    expectedCalls: { minimum: 25, maximum: 44 },
    budget: { rest: 42, graphql: 6, search: 4 },
    repositoryLimit: 6,
    forkLimit: 2,
    starRepositoryLimit: 2,
    commitDetailLimit: 60,
  },
};

const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes Redis cache

const emptyBudget = (profile: AnalysisModeProfile = ANALYSIS_MODE_PROFILES.deep): BudgetSnapshot => ({
  rest: { used: 0, limit: profile.budget.rest, remaining: profile.budget.rest },
  graphql: { used: 0, limit: profile.budget.graphql, remaining: profile.budget.graphql },
  search: { used: 0, limit: profile.budget.search, remaining: profile.budget.search },
});

export const getAnalysisModeProfile = (mode: AnalysisMode = "deep") => ANALYSIS_MODE_PROFILES[mode] ?? ANALYSIS_MODE_PROFILES.deep;

export interface AnalyzeOptions {
  bypassCache?: boolean;
  mode?: AnalysisMode;
  token?: string;
  onProgress?: AnalysisProgressCallback;
  signal?: AbortSignal;
}

const normalizeUsername = (value: string) => {
  const username = value.trim();
  if (username.length < 1 || username.length > 39 || !GITHUB_USERNAME_REGEX.test(username)) {
    throw new Error("Invalid GitHub username. Use 1-39 letters, numbers, or single hyphens.");
  }
  return username;
};

const annotateRuleEvidence = (sections: Array<Record<string, RuleResult>>, asOf: string) => {
  for (const rule of sections.flatMap((section) => Object.values(section))) {
    const statusConfidence = rule.status === "ok" ? 94 : rule.status === "sampled" ? 72 : 0;
    const sampleAdjustment = rule.status === "sampled" && (rule.sampleSize ?? 0) < 5 ? -12 : 0;
    rule.confidence = Math.max(0, statusConfidence + sampleAdjustment);
    const source = rule.source.toLowerCase();
    const freshness = rule.status === "unavailable" || rule.status === "skipped" || rule.status === "requires_oauth"
      ? { score: 0, label: "unavailable" as const, window: "No usable source response", asOf }
      : source.includes("event")
        ? { score: 86, label: "recent" as const, window: "Last 30 days", asOf }
        : source.includes("stargazer") || source.includes("commit") || source.includes("stats/")
          ? { score: 74, label: "historical" as const, window: rule.caveat ?? "Bounded historical sample", asOf }
          : source.includes("snapshot")
            ? { score: 65, label: "snapshot" as const, window: "Local process snapshots", asOf }
            : { score: 96, label: "live" as const, window: "Current GitHub API snapshot", asOf };
    rule.freshness = freshness;
  }
};

const collectStatuses = (sections: Array<Record<string, RuleResult>>) => {
  const all = sections.flatMap((section) => Object.values(section));
  return {
    skippedRules: all.filter((rule) => rule.status === "skipped" || rule.status === "requires_oauth").map((rule) => ({
      id: rule.id,
      reason: rule.caveat ?? rule.description,
    })),
    unavailableRules: all.filter((rule) => rule.status === "unavailable").map((rule) => ({
      id: rule.id,
      reason: rule.caveat ?? rule.description,
    })),
    sampledRules: all.filter((rule) => rule.status === "sampled").map((rule) => ({
      id: rule.id,
      sampleSize: rule.sampleSize ?? 0,
      note: rule.caveat ?? rule.description,
    })),
  };
};

export async function analyzeGitHubProfile(input: string, options: AnalyzeOptions = {}): Promise<EngineResult> {
  const startedAt = Date.now();
  const mode = options.mode ?? "deep";
  const profile = getAnalysisModeProfile(mode);
  const emit = (
    kind: AnalysisProgressEvent["kind"],
    phase: string,
    message: string,
    budget: BudgetSnapshot = emptyBudget(),
  ) => options.onProgress?.({
    kind,
    phase,
    message,
    timestamp: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - startedAt),
    budget,
  });

  const username = normalizeUsername(input);
  const rawToken = options.token?.trim() ?? "";
  const hasUserToken = Boolean(rawToken);
  const authTier = hasUserToken ? "USER-OAUTH" : "TOKEN-POOL";
  const tokenOrProvider = hasUserToken
    ? rawToken
    : () => {
        try {
          return getFallbackToken();
        } catch {
          throw new TokenUnavailableError();
        }
      };

  // Derive non-reversible token fingerprint to prevent OAuth cross-caller cache leaks
  const tokenFingerprint = hasUserToken ? `oauth:${computeTokenFingerprintSync(rawToken)}` : "pool";
  const redisCacheKey = `analysed:det:${username.toLowerCase()}:${mode}:${tokenFingerprint}`;

  if (!options.bypassCache) {
    try {
      const cached = await getCachedData<EngineResult>(redisCacheKey);
      if (cached) {
        emit("cache", "cache", `Serving cached ${profile.label.toLowerCase()} deterministic result for @${username}.`, emptyBudget(profile));
        return { ...cached, meta: { ...cached.meta, cache: { ...cached.meta.cache, resultHit: true } } };
      }
    } catch {
      // Soft cache-miss on Redis failure
    }
  }

  emit("phase", "initializing", `Starting ${profile.label.toLowerCase()} deterministic analysis for @${username}; ${authTier.toLowerCase()} mode.`, emptyBudget(profile));
  const client = new GitHubClient(tokenOrProvider, profile.budget, {
    onProgress: options.onProgress,
    startedAt,
    signal: options.signal,
  });
  const { data, meta: collectionMeta } = await collectEngineData(client, username, {
    profile,
    authTier,
    onProgress: options.onProgress,
    startedAt,
    signal: options.signal,
  });
  emit("phase", "rule-evaluation", "Collection complete; evaluating baseline, signal, score, and chart rules.", client.budget.snapshot());
  const baseline = runBaselineRules(data);
  const signals = runSignalRules(data);
  const scores = runScoringRules(data, signals);
  const charts = runChartRules(data, scores);
  annotateRuleEvidence([baseline, scores.breakdown, signals, charts], data.now.toISOString());
  const statuses = collectStatuses([baseline, scores.breakdown, signals, charts]);
  const sourceFailures = Object.entries(data.unavailable).map(([source, reason]) => `${source}: ${reason}`);
  const warnings = [
    ...collectionMeta.warnings,
    ...data.search.caps,
    ...sourceFailures.slice(0, 40),
    ...(sourceFailures.length > 40 ? [`${sourceFailures.length - 40} additional source failures omitted from this response.`] : []),
  ];
  const budget = client.budget.snapshot();
  emit("phase", "interpretation", "Building evidence-backed developer interpretations; this pass makes zero API calls.", budget);
  const interpretation = runInterpretation({ data, baseline, scores, signals, charts, budget, warnings });

  const result: EngineResult = {
    profile: {
      login: data.user.login,
      name: data.user.name,
      avatarUrl: data.user.avatar_url,
      url: data.user.html_url,
    },
    baseline,
    scores,
    signals,
    charts,
    interpretation,
    meta: {
      authTier,
      analysisMode: mode,
      apiVersion: GITHUB_API_VERSION,
      timestamp: data.now.toISOString(),
      durationMs: Date.now() - startedAt,
      budget,
      budgetPreview: profile,
      cache: {
        resultHit: false,
        endpointHits: client.cacheStats.hits,
        endpointMisses: client.cacheStats.misses,
        ttlSeconds: CACHE_TTL_SECONDS,
      },
      githubRateLimit: collectionMeta.githubRateLimit,
      ...statuses,
      warnings,
      dataWindows: {
        contributionCalendar: "One year ending at analysis time; public-visible contributions only.",
        events: "Last 30 days, maximum 300 public events.",
        stats: "52 weeks for documented stats endpoints; punch-card exact window is undocumented and labeled approximately one year.",
        stargazers: "All-time endpoint, sampled to top three repositories and first 100 stargazers each.",
        commits: "Default-branch history, at most 100 authored commits per sampled repository.",
        traffic: "Requires user OAuth and repository write access; unavailable in this token-pool engine.",
        snapshots: "In-memory for the current server process only; GitHub does not expose historical follower or organization membership data.",
      },
    },
  };

  // Cache in Upstash Redis for 15 minutes
  await setCachedData(redisCacheKey, result, CACHE_TTL_SECONDS).catch(() => null);

  emit("complete", "complete", `Analysis complete: ${budget.rest.used + budget.graphql.used + budget.search.used} API calls, ${Math.round((Date.now() - startedAt) / 100) / 10}s elapsed.`, budget);
  return result;
}

export default analyzeGitHubProfile;
