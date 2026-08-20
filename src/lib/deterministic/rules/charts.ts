import type { ChartResult, EngineData, ScoresOutput } from "../types";
import {
  chart,
  gini,
  mean,
  ok,
  oauthOnly,
  ratio,
  round,
  unavailable,
  withStatus,
} from "./shared";

type ChartRule = (data: EngineData, scores?: ScoresOutput) => ChartResult;

const punchMatrix = (data: EngineData) => {
  const matrix = Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => ({ day, hour, count: 0 })));
  for (const cards of Object.values(data.punchCards)) {
    for (const [day, hour, count] of cards) {
      if (day >= 0 && day <= 6 && hour >= 0 && hour <= 23 && matrix[day]?.[hour]) {
        matrix[day][hour].count += count;
      }
    }
  }
  return matrix;
};

const languageTotals = (data: EngineData) => {
  const totals: Record<string, number> = {};
  for (const languages of Object.values(data.languages)) for (const [language, bytes] of Object.entries(languages)) {
    totals[language] = (totals[language] ?? 0) + bytes;
  }
  return totals;
};

// WeakMap memoizes languageTotals: same EngineData object → computed once.
const languageTotalsCache = new WeakMap<EngineData, Record<string, number>>();
const cachedLanguageTotals = (data: EngineData): Record<string, number> => {
  if (!languageTotalsCache.has(data)) languageTotalsCache.set(data, languageTotals(data));
  return languageTotalsCache.get(data)!;
};

// O(n log b) binary-search histogram replaces O(n×b) filter-per-bucket.
const histogram = (values: number[], edges: number[]) => {
  const bucketCount = edges.length - 1;
  const counts = new Array<number>(bucketCount).fill(0);
  for (const v of values) {
    // Binary search for the correct bucket.
    let lo = 0;
    let hi = bucketCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v < edges[mid + 1]!) hi = mid;
      else lo = mid + 1;
    }
    if (lo < bucketCount && v >= edges[lo]! && v < edges[lo + 1]!) counts[lo]++;
  }
  return edges.slice(0, -1).map((min, i) => ({ min, max: edges[i + 1]!, count: counts[i]! }));
};

const sampledChart = <T>(
  id: string,
  name: string,
  kind: ChartResult["kind"],
  value: T,
  description: string,
  source: string,
  size: number,
  caveat: string,
  cost: "moderate" | "expensive" = "moderate",
) => chart(withStatus(id, name, "sampled", value, description, source, cost, caveat, size), kind);

export const rule4_1ContributionCalendar: ChartRule = (data) => {
  if (!data.graphql.calendar || !data.graphql.calendar.length) {
    return chart(
      unavailable("4.1", "Contribution calendar", "GraphQL contribution calendar data was unavailable or restricted.", "GraphQL contributionCalendar", "cheap"),
      "heatmap",
    );
  }
  let currentWeek = 0;
  const days = data.graphql.calendar.map((day, index) => {
    if (index > 0 && day.weekday === 0) {
      currentWeek += 1;
    }
    return {
      date: day.date,
      count: day.contributionCount,
      weekday: day.weekday,
      week: currentWeek,
    };
  });
  return chart(
    ok("4.1", "Contribution calendar", days, "Daily public contributions for the last calendar year.", "GraphQL contributionCalendar"),
    "heatmap",
  );
};

export const rule4_2CommitActivity: ChartRule = (data) => {
  const weeks = new Map<number, number>();
  for (const items of Object.values(data.commitActivity)) for (const item of items) weeks.set(item.week, (weeks.get(item.week) ?? 0) + item.total);
  return sampledChart("4.2", "Commit activity over time", "line", [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([week, commits]) => ({ week: new Date(week * 1_000).toISOString(), commits })), "Aggregated 52-week commit activity from sampled repositories.", "stats/commit_activity", Object.keys(data.commitActivity).length, "Stats exclude merge commits and cover the last 52 weeks.");
};

export const rule4_3CodeFrequency: ChartRule = (data) => {
  const weeks = new Map<number, { additions: number; deletions: number }>();
  for (const items of Object.values(data.codeFrequency)) for (const [week, additions, deletions] of items) {
    const current = weeks.get(week) ?? { additions: 0, deletions: 0 };
    current.additions += additions;
    current.deletions += deletions;
    weeks.set(week, current);
  }
  return sampledChart("4.3", "Additions vs deletions", "diverging-bar", [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([week, value]) => ({ week: new Date(week * 1_000).toISOString(), ...value })), "Weekly additions and deletions across sampled repositories.", "stats/code_frequency", Object.keys(data.codeFrequency).length, "Repositories with 10,000+ commits can return 422 and are omitted as unavailable.");
};

export const rule4_4PunchCard: ChartRule = (data) =>
  sampledChart("4.4", "Punch card", "heatmap", punchMatrix(data).flat(), "Day-of-week by UTC hour activity matrix.", "stats/punch_card", Object.keys(data.punchCards).length, "GitHub does not document the exact stats cache window; label as approximately the last year.");

export const rule4_5LanguageDistribution: ChartRule = (data) => {
  const totals = cachedLanguageTotals(data);
  const total = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  const values = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([language, bytes]) => ({ language, bytes, share: round(ratio(bytes, total), 4) }));
  return sampledChart("4.5", "Language distribution", "donut", values, "Aggregated language bytes across sampled repositories.", "languages endpoint", Object.keys(data.languages).length, "Top 10 repositories only.");
};

export const rule4_6RepoSizeStars: ChartRule = (data) => chart(ok("4.6", "Repository size vs stars", data.repos.map((repo) => ({
  repository: repo.full_name,
  sizeKb: repo.size,
  stars: repo.stargazers_count,
  logSize: round(Math.log10(repo.size + 1), 3),
  logStars: round(Math.log10(repo.stargazers_count + 1), 3),
  fork: repo.fork,
})), "Log-ready repository size and star scatter points.", "GET /users/{u}/repos"), "scatter");

// O(n) index-variable approach replaces O(n²) indexOf() inside loop.
const streakSegments = (data: EngineData) => {
  const days = [...data.graphql.calendar].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return [];
  const segments: Array<{ active: boolean; start: string; end: string; days: number }> = [];
  let start = days[0]!.date;
  let active = days[0]!.contributionCount > 0;
  let count = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const next = day.contributionCount > 0;
    if (next !== active) {
      // days[i - 1] is the last day of the current segment.
      segments.push({ active, start, end: days[Math.max(0, i - 1)]!.date, days: count });
      start = day.date;
      active = next;
      count = 0;
    }
    count += 1;
  }
  segments.push({ active, start, end: days.at(-1)!.date, days: count });
  return segments;
};

export const rule4_7StreakTimeline: ChartRule = (data) =>
  chart(ok("4.7", "Streak timeline", streakSegments(data), "Contiguous active and inactive contribution-calendar spans.", "GraphQL contributionCalendar"), "timeline");

export const rule4_8BurstOverlay: ChartRule = (data) => {
  const counts = data.graphql.calendar.map((day) => day.contributionCount);
  const rolling = counts.map((_, index) => counts.slice(Math.max(0, index - 6), index + 1).reduce((sum, count) => sum + count, 0));
  const average = mean(rolling);
  const deviation = Math.sqrt(mean(rolling.map((value) => (value - average) ** 2)));
  return chart(ok("4.8", "Burst annotation overlay", data.graphql.calendar.map((day, index) => ({
    date: day.date,
    count: day.contributionCount,
    rolling7: rolling[index]!,
    z: round(deviation ? (rolling[index]! - average) / deviation : 0, 3),
    burst: deviation ? (rolling[index]! - average) / deviation > 3 : false,
  })), "Contribution calendar with rolling seven-day z-score annotations.", "GraphQL contributionCalendar"), "line");
};

export const rule4_9PrIssueFunnel: ChartRule = (data) => chart(ok("4.9", "PR and issue funnel", [
  { stage: "PRs opened", value: data.search.prsOpened },
  { stage: "PRs reviewed", value: data.graphql.totalPullRequestReviewContributions },
  { stage: "PRs merged", value: data.search.prsMerged },
  { stage: "Issues opened", value: data.search.issuesOpened },
  { stage: "Issues closed", value: data.search.issuesClosed },
], "Opened, reviewed, merged and closed contribution counts.", "Search API + GraphQL"), "funnel");

export const rule4_10CollaboratorNetwork: ChartRule = (data) => {
  const nodes = new Map<string, number>();
  const edges: Array<{ source: string; target: string; weight: number }> = [];
  nodes.set(data.username, 1);
  for (const [repository, contributors] of Object.entries(data.contributors)) {
    for (const contributor of contributors.slice(0, 15)) {
      if (!contributor.login || contributor.login.toLowerCase() === data.username.toLowerCase()) continue;
      nodes.set(contributor.login, (nodes.get(contributor.login) ?? 0) + contributor.contributions);
      edges.push({ source: data.username, target: contributor.login, weight: contributor.contributions });
      edges.push({ source: contributor.login, target: repository, weight: contributor.contributions });
    }
  }
  const topNodes = [...nodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const allowed = new Set(topNodes.map(([id]) => id));
  return sampledChart("4.10", "Collaborator network", "network", {
    nodes: topNodes.map(([id, weight]) => ({ id, weight })),
    edges: edges.filter((edge) => allowed.has(edge.source) && (allowed.has(edge.target) || edge.target.includes("/"))),
  }, "Top collaborator network from sampled contributor lists.", "contributors endpoint", data.topRepos.length, "GitHub contributor data is cached and may lag.");
};

export const rule4_11RepoCreationTimeline: ChartRule = (data) => chart(ok("4.11", "Repository creation timeline", data.repos.map((repo) => ({
  repository: repo.full_name,
  createdAt: repo.created_at,
  fork: repo.fork,
  stars: repo.stargazers_count,
})).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), "Repository creation dates with fork and star context.", "GET /users/{u}/repos"), "timeline");

export const rule4_12WeekendSplit: ChartRule = (data) => {
  const matrix = punchMatrix(data);
  const weekend = [...matrix[0]!, ...matrix[6]!].reduce((sum, item) => sum + item.count, 0);
  const weekday = matrix.slice(1, 6).flat().reduce((sum, item) => sum + item.count, 0);
  return sampledChart("4.12", "Weekday vs weekend split", "donut", [{ label: "Weekend", value: weekend }, { label: "Weekday", value: weekday }], "Punch-card split between weekend and weekday activity.", "stats/punch_card", Object.keys(data.punchCards).length, "Approximate recent-year stats window.");
};

export const rule4_13ScoreRadar: ChartRule = (_data, scores) => {
  if (!scores) return chart(unavailable("4.13", "Score breakdown radar", "Scores were not supplied to the chart rule.", "Section 2 scoring", "cheap"), "radar");
  const values = Object.values(scores.breakdown).filter((result) => result.id !== "2.7").map((result) => ({
    id: result.id,
    label: result.name.replace(" score", ""),
    value: typeof result.value === "number" ? result.value : 0,
    weight: scores.weights[result.id] ?? 0,
  }));
  return chart(ok("4.13", "Score breakdown radar", values, "All additive sub-scores with published weights.", "Section 2 scoring"), "radar");
};

export const rule4_14LeaderboardPercentiles: ChartRule = () =>
  chart(unavailable("4.14", "Leaderboard percentile bars", "Leaderboard persistence and population distributions are explicitly out of scope for this token-pool engine.", "Internal leaderboard distribution", "cheap"), "bar");

export const rule4_15CumulativeStars: ChartRule = (data) => {
  const totalStargazers = Object.values(data.stargazers).reduce((sum, arr) => sum + arr.length, 0);
  if (totalStargazers === 0) {
    return chart(
      unavailable("4.15", "Cumulative star history", "No star history timestamps found or stargazer sampling was skipped.", "stargazers star+json", "expensive"),
      "line",
    );
  }
  const series = Object.entries(data.stargazers).map(([repository, events]) => ({
    repository,
    points: [...events].sort((a, b) => a.starred_at.localeCompare(b.starred_at)).map((event, index) => ({ at: event.starred_at, cumulative: index + 1 })),
  }));
  return sampledChart("4.15", "Cumulative star history", "line", series, "Sampled cumulative star timestamps for top repositories.", "stargazers star+json", totalStargazers, "Top three repositories and first 100 stargazers each.", "expensive");
};

export const rule4_16StarVelocity: ChartRule = (data) => {
  const allStars = Object.values(data.stargazers).flat();
  if (!allStars.length) {
    return chart(
      unavailable("4.16", "Star velocity", "No star event history available across sampled repositories.", "stargazers star+json", "expensive"),
      "bar",
    );
  }
  const months = new Map<string, number>();
  for (const event of allStars) {
    const month = event.starred_at.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  return sampledChart("4.16", "Star velocity", "bar", [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, stars]) => ({ month, stars })), "Sampled stars per month.", "stargazers star+json", allStars.length, "Top three repositories and first 100 stargazers each.", "expensive");
};

export const rule4_17PrMergeHistogram: ChartRule = (data) => {
  const hours = data.graphql.pullRequests.flatMap((pr) => pr.mergedAt ? [(new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / 3_600_000] : []);
  return chart(ok("4.17", "PR merge-time histogram", histogram(hours, [0, 1, 6, 24, 72, 168, 720, Number.POSITIVE_INFINITY]), "Open-to-merge duration buckets for recent pull requests.", "GraphQL user.pullRequests"), "histogram");
};

export const rule4_18IssueResponseHistogram: ChartRule = (data) => {
  const hours = [...Object.values(data.issues).flatMap((item) => item.responseHours), ...data.authoredIssueResponseHours];
  return sampledChart("4.18", "Issue first-response latency", "histogram", histogram(hours, [0, 1, 6, 24, 72, 168, 720, Number.POSITIVE_INFINITY]), "First-comment latency across sampled maintainer and authored issues.", "GraphQL issue batches", hours.length, "Recent 25 owner issues per repo plus up to 25 authored issues.");
};

export const rule4_19CommitSizeHistogram: ChartRule = (data) => {
  const sizes = Object.values(data.commitDetails).flatMap((commit) => commit.stats ? [commit.stats.total] : []);
  return sampledChart("4.19", "Commit-size distribution", "histogram", histogram(sizes, [0, 3, 10, 30, 100, 300, 1_000, Number.POSITIVE_INFINITY]), "Log-oriented changed-line buckets.", "per-commit stats", sizes.length, "At most 100 commits across top repositories.", "expensive");
};

export const rule4_20ContributionSplit: ChartRule = (data) =>
  chart(ok("4.20", "Contribution split by repository", [...data.graphql.contributionsByRepo].sort((a, b) => b.count - a.count), "Ranked public commit contributions by repository for the calendar window.", "GraphQL commitContributionsByRepository"), "bar");

export const rule4_21CommitHourUtcAware: ChartRule = () =>
  chart(unavailable("4.21", "Commit hour-of-day", "GitHub REST timestamps are normalized and do not reliably expose original UTC offsets, so an offset-aware chart would be a false claim.", "commit author dates", "moderate"), "bar");

export const rule4_22EventMix: ChartRule = (data) => {
  const counts: Record<string, number> = {};
  for (const event of data.events) counts[event.type] = (counts[event.type] ?? 0) + 1;
  return chart(ok("4.22", "Event type mix", Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, value]) => ({ type, value })), "Public GitHub event mix for the last 30 days only.", "GET /users/{u}/events/public"), "donut");
};

export const rule4_23FollowerGrowth: ChartRule = (data) => data.snapshots.length < 2
  ? chart(unavailable("4.23", "Follower growth line", "GitHub exposes no follower history; at least two in-memory analysis snapshots are needed.", "Internal snapshots", "cheap"), "line")
  : chart(ok("4.23", "Follower growth line", data.snapshots.map((snapshot) => ({ at: snapshot.at, followers: snapshot.followers, stars: snapshot.stars })), "Follower and star snapshots captured by this running process.", "Internal snapshots"), "line");

export const rule4_24ReleaseStarOverlay: ChartRule = (data) => {
  const releases = Object.entries(data.releases).flatMap(([repository, items]) => items.flatMap((release) => release.published_at ? [{ repository, at: release.published_at, tag: release.tag_name }] : []));
  const stars = Object.entries(data.stargazers).flatMap(([repository, items]) => items.map((event) => ({ repository, at: event.starred_at })));
  return sampledChart("4.24", "Release timeline and star overlay", "timeline", { releases, stars }, "Release markers over sampled star events.", "releases + stargazers", releases.length + stars.length, "Release data is top-10; star data is top-three and capped.");
};

export const rule4_25TrafficViews: ChartRule = () =>
  chart(oauthOnly("4.25", "Traffic views vs unique viewers", "GET /repos/{o}/{r}/traffic/views"), "line");

export const rule4_26TrafficReferrers: ChartRule = () =>
  chart(oauthOnly("4.26", "Top referrers and paths", "GET /repos/{o}/{r}/traffic/popular/*"), "bar");

const ecosystemFromPurl = (value: string) => {
  const match = value.match(/^pkg:([^/]+)/);
  return match?.[1] ?? "unknown";
};

export const rule4_27DependencyEcosystems: ChartRule = (data) => {
  const counts: Record<string, number> = {};
  for (const security of Object.values(data.security)) for (const pkg of security.sbomPackages) {
    const purl = pkg.externalRefs?.find((reference) => reference.referenceType?.toLowerCase().includes("purl"))?.referenceLocator;
    const ecosystem = purl ? ecosystemFromPurl(purl) : "unknown";
    counts[ecosystem] = (counts[ecosystem] ?? 0) + 1;
  }
  return sampledChart("4.27", "Dependency ecosystems", "donut", Object.entries(counts).map(([ecosystem, value]) => ({ ecosystem, value })), "SPDX SBOM packages grouped by package URL ecosystem.", "dependency-graph/sbom", Object.keys(data.security).length, "Top repositories only; SBOM packages are a current snapshot.");
};

export const rule4_28SecuritySeverities: ChartRule = (data) => {
  const codeScanning: Record<string, number> = {};
  const dependabot: Record<string, number> = {};
  for (const item of Object.values(data.security)) {
    for (const alert of item.codeScanning ?? []) {
      const severity = alert.rule?.security_severity_level ?? "unknown";
      codeScanning[severity] = (codeScanning[severity] ?? 0) + 1;
    }
    for (const alert of item.dependabot ?? []) {
      const severity = alert.security_advisory?.severity ?? "unknown";
      dependabot[severity] = (dependabot[severity] ?? 0) + 1;
    }
  }
  return sampledChart("4.28", "Security alert severities", "donut", { codeScanning, dependabot }, "Current alert severities; feature-absent repositories are reported separately from zero alerts.", "code-scanning + Dependabot", Object.keys(data.security).length, "Top repositories only.");
};

// Single filter+collect pass instead of .filter().map().sort() triple pass.
export const rule4_29LorenzCurve: ChartRule = (data) => {
  const stars: number[] = [];
  for (const repo of data.repos) if (!repo.fork) stars.push(repo.stargazers_count);
  stars.sort((a, b) => a - b);
  const total = stars.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const points = [{ populationShare: 0, starShare: 0 }, ...stars.map((value, index) => {
    cumulative += value;
    return { populationShare: round((index + 1) / Math.max(stars.length, 1), 4), starShare: round(ratio(cumulative, total), 4) };
  })];
  return chart(ok("4.29", "Star inequality Lorenz curve", { points, gini: round(gini(stars), 4) }, "Cumulative repository share versus cumulative star share.", "GET /users/{u}/repos"), "lorenz");
};

export const rule4_30RepoLifetimeGantt: ChartRule = (data) =>
  chart(ok("4.30", "Repository lifetime Gantt", data.repos.map((repo) => ({
    repository: repo.full_name,
    start: repo.created_at,
    end: repo.pushed_at ?? repo.updated_at,
    dormant: !repo.pushed_at || (data.now.getTime() - new Date(repo.pushed_at).getTime()) / 86_400_000 > 365,
    archived: repo.archived,
  })).sort((a, b) => a.start.localeCompare(b.start)), "Repository creation-to-last-push lifetimes.", "GET /users/{u}/repos"), "gantt");

export const rule4_31LanguageRepoHeatmap: ChartRule = (data) => {
  const totals = cachedLanguageTotals(data);
  const topLanguages = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([language]) => language);
  const topRepos = data.topRepos.slice(0, 10);
  const cells = topLanguages.flatMap((language) => topRepos.map((repo) => ({
    language,
    repository: repo.full_name,
    bytes: data.languages[repo.full_name]?.[language] ?? 0,
  })));
  return sampledChart("4.31", "Language by repository heatmap", "matrix", { languages: topLanguages, repositories: topRepos.map((repo) => repo.full_name), cells }, "Top language byte counts by top repository.", "languages endpoint", Object.keys(data.languages).length, "Top 10 languages by top 10 repositories.");
};

export const rule4_32OrgTimeline: ChartRule = (data) => {
  if (data.snapshots.length < 2) return chart(unavailable("4.32", "Organization membership timeline", "GitHub exposes only current public memberships; at least two local snapshots are required to infer joins or leaves.", "public orgs + internal snapshots", "cheap"), "timeline");
  const events = data.snapshots.slice(1).flatMap((snapshot, index) => {
    const previous = new Set(data.snapshots[index]!.orgs);
    const current = new Set(snapshot.orgs);
    return [
      ...[...current].filter((org) => !previous.has(org)).map((org) => ({ at: snapshot.at, organization: org, action: "joined" })),
      ...[...previous].filter((org) => !current.has(org)).map((org) => ({ at: snapshot.at, organization: org, action: "left" })),
    ];
  });
  return chart(ok("4.32", "Organization membership timeline", events, "Best-effort public organization membership changes between local analyses.", "public orgs + internal snapshots"), "timeline");
};

export const chartRules: ChartRule[] = [
  rule4_1ContributionCalendar,
  rule4_2CommitActivity,
  rule4_3CodeFrequency,
  rule4_4PunchCard,
  rule4_5LanguageDistribution,
  rule4_6RepoSizeStars,
  rule4_7StreakTimeline,
  rule4_8BurstOverlay,
  rule4_9PrIssueFunnel,
  rule4_10CollaboratorNetwork,
  rule4_11RepoCreationTimeline,
  rule4_12WeekendSplit,
  rule4_13ScoreRadar,
  rule4_14LeaderboardPercentiles,
  rule4_15CumulativeStars,
  rule4_16StarVelocity,
  rule4_17PrMergeHistogram,
  rule4_18IssueResponseHistogram,
  rule4_19CommitSizeHistogram,
  rule4_20ContributionSplit,
  rule4_21CommitHourUtcAware,
  rule4_22EventMix,
  rule4_23FollowerGrowth,
  rule4_24ReleaseStarOverlay,
  rule4_25TrafficViews,
  rule4_26TrafficReferrers,
  rule4_27DependencyEcosystems,
  rule4_28SecuritySeverities,
  rule4_29LorenzCurve,
  rule4_30RepoLifetimeGantt,
  rule4_31LanguageRepoHeatmap,
  rule4_32OrgTimeline,
];

export const runChartRules = (data: EngineData, scores: ScoresOutput) =>
  Object.fromEntries(chartRules.map((rule) => {
    const result = rule(data, scores);
    return [result.id, result];
  })) as Record<string, ChartResult>;
