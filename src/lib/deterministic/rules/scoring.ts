import type { EngineData, RuleResult, SignalResult } from "../types";
import {
  clamp,
  coefficientOfVariation,
  daysBetween,
  mean,
  median,
  ok,
  ratio,
  round,
  saturatingScore,
  weightedAverage,
} from "./shared";

type ScoreRule = (data: EngineData, signals?: Record<string, SignalResult>) => RuleResult<number | Record<string, unknown>>;

const score = (id: string, name: string, value: number, description: string, source: string, details: Record<string, unknown> = {}) =>
  ok(id, name, round(clamp(value)), description, source, "cheap", details) as RuleResult<number | Record<string, unknown>>;

const reposWith = (data: EngineData) => data.repos.filter((repo) => !repo.fork && !repo.mirror_url);
const allTopics = (data: EngineData) => new Set(data.repos.flatMap((repo) => repo.topics));

export const rule2_1VolumeScore: ScoreRule = (data) => {
  const repoCommitCaps = data.repos.map((repo) => Math.min((data.commits[repo.full_name] ?? []).length, 30));
  const raw = data.graphql.totalContributions + data.search.prsOpened * 2 + data.search.issuesOpened + repoCommitCaps.reduce((sum, count) => sum + count, 0);
  return score("2.1", "Volume score", saturatingScore(raw, 0.012), "Log-scaled contribution volume with a per-repository cap.", "GraphQL calendar + Search API", { raw, repoContributionCap: 30 });
};

export const rule2_2ConsistencyScore: ScoreRule = (data) => {
  const weekly = Object.values(data.commitActivity).flatMap((weeks) => weeks.map((week) => week.total));
  // Count active days and compute longest streak in one sorted pass.
  const sorted = [...data.graphql.calendar].sort((a, b) => a.date.localeCompare(b.date));
  let activeDays = 0;
  let longest = 0;
  let running = 0;
  for (const day of sorted) {
    if (day.contributionCount > 0) { activeDays++; running++; }
    else { running = 0; }
    if (running > longest) longest = running;
  }
  const activeRatio = ratio(activeDays, data.graphql.calendar.length);
  const cv = weekly.length ? coefficientOfVariation(weekly) : 0;
  const pairs: Array<[number, number]> = [
    [saturatingScore(longest, 0.08), 0.35],
    [activeRatio * 100, 0.4],
  ];
  if (weekly.length > 0) {
    pairs.push([clamp(100 - cv * 35), 0.25]);
  }
  const consistency = weightedAverage(pairs);
  return score("2.2", "Consistency score", consistency, "Combines streak length, active-day ratio, and inverse weekly commit variance.", "GraphQL contributionCalendar + stats/commit_activity", { longestStreak: longest, activeDaysRatio: activeRatio, weeklyCoefficientOfVariation: cv });
};

export const rule2_3CollaborationScore: ScoreRule = (data) => {
  const mergeRate = ratio(data.search.prsMergedExternal, Math.max(data.search.prsOpened, 1));
  const issueResolution = ratio(data.search.issuesClosed, Math.max(data.search.issuesOpened, 1));
  const reviewRate = saturatingScore(data.graphql.totalPullRequestReviewContributions, 0.06);
  return score("2.3", "Collaboration score", weightedAverage([[mergeRate * 100, 0.4], [issueResolution * 100, 0.2], [reviewRate, 0.4]]), "Rewards merged work in other repositories, resolved issues, and review participation.", "Search API + GraphQL", { externalMergedPrs: data.search.prsMergedExternal, mergeRate, issueResolution, reviews: data.graphql.totalPullRequestReviewContributions });
};

export const rule2_4ImpactScore: ScoreRule = (data) => {
  const values = reposWith(data).map((repo) => {
    const recency = repo.pushed_at ? Math.exp(-daysBetween(repo.pushed_at, data.now) / 1_095) : 0.1;
    return (Math.log1p(repo.stargazers_count) * 8 + Math.log1p(repo.forks_count) * 5) * recency;
  });
  return score("2.4", "Impact score", saturatingScore(values.reduce((sum, value) => sum + value, 0), 0.055), "Recency-weighted stars and forks from non-fork repositories.", "GET /users/{u}/repos", { repositories: values.length });
};

export const rule2_5BreadthScore: ScoreRule = (data) => {
  const languages = new Set(Object.keys(data.languages).flatMap((key) => Object.keys(data.languages[key] ?? {}))).size;
  const topics = allTopics(data).size;
  return score("2.5", "Breadth score", weightedAverage([[saturatingScore(languages, 0.18), 0.55], [saturatingScore(topics, 0.12), 0.45]]), "Log-scaled language and topic diversity.", "languages + repository topics", { languages, topics });
};

export const rule2_6CodeQualityProxy: ScoreRule = (data) => {
  const values = Object.values(data.qualities).map((quality) => {
    const image = /!\[|<img/i.test(quality.readmeText);
    const install = /(^|\n)#{1,4}\s*(install|setup|usage)\b/i.test(quality.readmeText);
    return (
      Number(quality.licensePresent) * 30 +
      Number(quality.readmeBytes > 300) * 30 +
      Number(quality.ciPresent) * 30 +
      Number(image) * 5 +
      Number(install) * 5
    );
  });
  return score("2.6", "Code quality proxy", mean(values), "Deterministic repository hygiene flags: license, README size, CI workflows, images, and install instructions.", "contents API + repository metadata", { sampledRepositories: values.length });
};

// Module-level Set for O(1) .has() lookup instead of O(k) .includes() per signal.
const AUTHENTICITY_SIGNAL_IDS = new Set([
  "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.9",
  "3.19", "3.22", "3.28", "3.29", "3.31", "3.34", "3.35",
]);

const suspiciousCount = (signals?: Record<string, SignalResult>) =>
  Object.values(signals ?? {}).filter((signal) => signal.flagged && AUTHENTICITY_SIGNAL_IDS.has(signal.id)).length;

export const rule2_7AuthenticityMultiplier: ScoreRule = (_data, signals) => {
  const flagged = suspiciousCount(signals);
  const multiplier = clamp(1 - flagged * 0.06, 0.4, 1);
  return score("2.7", "Authenticity multiplier", multiplier, `${flagged} flag-only anomaly signals affect the damping multiplier; no signal is a verdict.`, "Section 3 signals", { flaggedSignals: flagged, minimum: 0.4 });
};

// Single reduce pass computes pushed90, pushed180, medianAge inputs, and archivedCount together.
export const rule2_8MaintenanceScore: ScoreRule = (data) => {
  const repos = reposWith(data);
  let pushed90 = 0;
  let pushed180 = 0;
  let archived = 0;
  const ageDays: number[] = [];
  for (const repo of repos) {
    if (repo.archived) archived++;
    if (repo.pushed_at) {
      const days = daysBetween(repo.pushed_at, data.now);
      ageDays.push(days);
      if (days <= 90) pushed90++;
      if (days <= 180) pushed180++;
    }
  }
  const medianAge = ageDays.length ? median(ageDays) : null;
  const pairs: Array<[number, number]> = [
    [ratio(pushed90, repos.length) * 100, 0.4],
    [ratio(pushed180, repos.length) * 100, 0.25],
    [(1 - ratio(archived, repos.length)) * 100, 0.1],
  ];
  if (medianAge !== null) {
    pairs.push([clamp(100 - medianAge / 3), 0.25]);
  }
  return score("2.8", "Maintenance score", weightedAverage(pairs), "Recency and archived-ratio maintenance curve.", "GET /users/{u}/repos", { pushedWithin90Days: pushed90, pushedWithin180Days: pushed180, medianDaysSincePush: medianAge });
};

export const rule2_9ReleaseDisciplineScore: ScoreRule = (data) => {
  const releases = Object.values(data.releases).flat();
  const semver = releases.filter((release) => /^v?\d+\.\d+\.\d+$/.test(release.tag_name)).length;
  const latest = releases.flatMap((release) => release.published_at ? [daysBetween(release.published_at, data.now)] : []);
  const medianAge = latest.length ? median(latest) : null;
  const pairs: Array<[number, number]> = [
    [saturatingScore(releases.length, 0.22), 0.45],
    [ratio(semver, releases.length) * 100, 0.3],
  ];
  if (medianAge !== null) {
    pairs.push([clamp(100 - medianAge / 3), 0.25]);
  }
  return score("2.9", "Release discipline score", weightedAverage(pairs), "Release count, semver-tag ratio, and latest-release recency.", "GET /repos/{o}/{r}/releases", { releases: releases.length, semver, medianDaysSinceRelease: medianAge });
};

export const rule2_10DocumentationScore: ScoreRule = (data) => {
  const qualities = Object.values(data.qualities);
  const repoDocs = qualities.map((quality) => Number(quality.readmeBytes > 300) * 40 + Number(Boolean(quality.readmeText)) * 25);
  const featureDocs = data.repos.map((repo) => Number(repo.has_wiki) * 10 + Number(repo.has_pages) * 10 + Number(/!\[|<img/i.test(data.qualities[repo.full_name]?.readmeText ?? "")) * 15);
  const profile = data.profileReadme.present ? 100 : 0;
  return score("2.10", "Documentation score", mean([...repoDocs, ...featureDocs, profile]), "Regex-only documentation and profile README coverage.", "README contents + repository metadata", { sampledRepositories: qualities.length, profileReadme: data.profileReadme.present });
};

export const rule2_11CommunityScore: ScoreRule = (data) => {
  const response = Object.values(data.issues).flatMap((item) => item.responseHours);
  const latency = response.length ? clamp(100 - median(response) * 2) : 0;
  const mergeRate = ratio(data.search.prsMerged, Math.max(data.search.prsOpened, 1)) * 100;
  const review = saturatingScore(data.graphql.totalPullRequestReviewContributions, 0.06);
  const discussions = saturatingScore(Object.values(data.issues).reduce((sum, item) => sum + item.discussions, 0), 0.08);
  return score("2.11", "Community score", weightedAverage([[latency, 0.3], [mergeRate, 0.25], [review, 0.25], [discussions, 0.2]]), "Maintainer response, merge rate, reviews, and discussions.", "GraphQL repository issue batch + Search API", { responseSamples: response.length, medianResponseHours: median(response), discussions: Object.values(data.issues).reduce((sum, item) => sum + item.discussions, 0) });
};

export const rule2_12SecurityHygieneScore: ScoreRule = (data) => {
  const values = Object.values(data.security).map((security) => {
    const sbomScore = Number(security.sbomPackages.length > 0) * 50;
    const checksScore = Number(security.checks.length > 0) * 50;
    return clamp(sbomScore + checksScore);
  });
  return score("2.12", "Security hygiene score", mean(values), "Public repository security posture: verified dependency graph SBOM and automated CI check runs.", "SBOM + GitHub check runs", { sampledRepositories: values.length });
};

export const rule2_13GivingBackScore: ScoreRule = (data) => {
  const externalIssues = data.search.authoredIssues.filter((item) => !item.repository.toLowerCase().startsWith(`${data.username.toLowerCase()}/`)).length;
  return score("2.13", "Giving-back score", weightedAverage([[saturatingScore(data.search.prsMergedExternal, 0.08), 0.35], [saturatingScore(externalIssues, 0.12), 0.2], [saturatingScore(data.graphql.repositoriesContributedToCount, 0.1), 0.25], [saturatingScore(data.graphql.sponsoringCount, 0.2), 0.2]]), "Cross-repository merged PRs, third-party issues, contributed repositories, and sponsoring.", "Search + GraphQL", { externalIssues, externalMergedPrs: data.search.prsMergedExternal, contributedRepositories: data.graphql.repositoriesContributedToCount });
};

// Reuse the active-day count computed in rule2_2; here we need activeRatio for rule2_14 only.
// Both rules run independently so we compute it directly (single filter pass).
export const rule2_14LongevityScore: ScoreRule = (data) => {
  const accountYears = daysBetween(data.user.created_at, data.now) / 365.25;
  const activeYears = data.graphql.contributionYears.length;
  let activeDays = 0;
  for (const day of data.graphql.calendar) if (day.contributionCount > 0) activeDays++;
  const activeRatio = ratio(activeDays, data.graphql.calendar.length);
  return score("2.14", "Longevity score", weightedAverage([[saturatingScore(accountYears, 0.22), 0.4], [saturatingScore(activeYears, 0.45), 0.3], [activeRatio * 100, 0.3]]), "Log-scaled account age, active years, and consistency.", "User profile + contributionsCollection", { accountYears, activeYears, activeRatio });
};

export const scoringRules: ScoreRule[] = [
  rule2_1VolumeScore,
  rule2_2ConsistencyScore,
  rule2_3CollaborationScore,
  rule2_4ImpactScore,
  rule2_5BreadthScore,
  rule2_6CodeQualityProxy,
  rule2_7AuthenticityMultiplier,
  rule2_8MaintenanceScore,
  rule2_9ReleaseDisciplineScore,
  rule2_10DocumentationScore,
  rule2_11CommunityScore,
  rule2_12SecurityHygieneScore,
  rule2_13GivingBackScore,
  rule2_14LongevityScore,
];

export const SCORE_WEIGHTS: Record<string, number> = {
  "2.1": 0.10,
  "2.2": 0.08,
  "2.3": 0.10,
  "2.4": 0.10,
  "2.5": 0.06,
  "2.6": 0.07,
  "2.8": 0.10,
  "2.9": 0.06,
  "2.10": 0.08,
  "2.11": 0.06,
  "2.12": 0.05,
  "2.13": 0.07,
  "2.14": 0.07,
};

export function runScoringRules(data: EngineData, signals: Record<string, SignalResult>): {
  breakdown: Record<string, RuleResult<number | Record<string, unknown>>>;
  weights: Record<string, number>;
  authenticityMultiplier: number;
  weightedBeforeMultiplier: number;
  finalScore: number;
} {
  const breakdown = Object.fromEntries(scoringRules.map((rule) => {
    const result = rule(data, signals);
    return [result.id, result];
  })) as Record<string, RuleResult<number | Record<string, unknown>>>;
  const weightedBeforeMultiplier = Object.entries(SCORE_WEIGHTS).reduce((sum, [id, weight]) => {
    const value = typeof breakdown[id]?.value === "number" ? breakdown[id]!.value : 0;
    return sum + value * weight;
  }, 0);
  const authenticityMultiplier = typeof breakdown["2.7"]?.value === "number" ? breakdown["2.7"].value : 1;
  return {
    breakdown,
    weights: { ...SCORE_WEIGHTS, "2.7": 0 },
    authenticityMultiplier,
    weightedBeforeMultiplier: round(weightedBeforeMultiplier),
    finalScore: round(weightedBeforeMultiplier * authenticityMultiplier),
  };
}
