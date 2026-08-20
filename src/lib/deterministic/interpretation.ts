import type {
  BudgetSnapshot,
  ChartResult,
  EngineData,
  InterpretationArchetype,
  InterpretationConfidence,
  InterpretationDataQuality,
  InterpretationEvidenceTrace,
  InterpretationGrade,
  InterpretationMomentum,
  InterpretationQualityProfile,
  InterpretationRepositoryQuality,
  InterpretationRoleProfile,
  InterpretationTag,
  InterpretationOutput,
  InterpretationPortfolio,
  InterpretationWorkRhythm,
  InterpretationWorkStyleAxis,
  LetterGrade,
  RuleResult,
  ScoresOutput,
  SignalResult,
} from "./types";
import { clamp, ratio, round, weightedAverage } from "./rules/shared";

export interface InterpretationInput {
  data: EngineData;
  baseline: Record<string, RuleResult>;
  scores: ScoresOutput;
  signals: Record<string, SignalResult>;
  charts: Record<string, ChartResult>;
  budget: BudgetSnapshot;
  warnings: string[];
}

const gradeBands: Array<{ minimum: number; grade: LetterGrade; tier: string }> = [
  { minimum: 95, grade: "A+", tier: "Exceptional public evidence" },
  { minimum: 85, grade: "A", tier: "Excellent public evidence" },
  { minimum: 70, grade: "B", tier: "Strong public evidence" },
  { minimum: 55, grade: "C", tier: "Established public evidence" },
  { minimum: 40, grade: "D", tier: "Developing public evidence" },
  { minimum: 0, grade: "F", tier: "Limited public evidence" },
];

const scoreValue = (scores: ScoresOutput, id: string) => {
  const value = scores.breakdown[id]?.value;
  return typeof value === "number" && Number.isFinite(value) ? clamp(value) : 0;
};

export const gradeForScore = (
  id: string,
  label: string,
  value: number,
  sourceIds: string[],
): InterpretationGrade => {
  const score = round(clamp(value), 2);
  const band = gradeBands.find((item) => score >= item.minimum) ?? gradeBands[gradeBands.length - 1]!;
  return {
    id,
    label,
    score,
    grade: band.grade,
    tier: band.tier,
    description: label + " is " + score + "/100 under the fixed absolute grade rubric.",
    evidence: [label + " score: " + score],
    sourceIds,
  };
};

export function interpretE1Grades(scores: ScoresOutput) {
  const grades = Object.values(scores.breakdown)
    .filter((item) => item.id !== "2.7" && typeof item.value === "number")
    .map((item) => gradeForScore(item.id, item.name.replace(/ score$/i, ""), item.value as number, [item.id]))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const overall = gradeForScore(
    "overall",
    "Overall deterministic score",
    scores.finalScore,
    Object.keys(scores.weights),
  );
  overall.evidence = [
    "Weighted score before multiplier: " + scores.weightedBeforeMultiplier,
    "Authenticity multiplier: " + scores.authenticityMultiplier,
    "Final score: " + scores.finalScore,
  ];
  return { overall, grades };
}

interface ArchetypeDefinition {
  id: string;
  label: string;
  description: string;
  weights: Record<string, number>;
}

const archetypeDefinitions: ArchetypeDefinition[] = [
  {
    id: "builder",
    label: "Product builder",
    description: "Public activity emphasizes shipping repositories with visible usage and breadth.",
    weights: { "2.1": 0.25, "2.4": 0.25, "2.5": 0.15, "2.9": 0.15, "2.8": 0.1, "2.6": 0.1 },
  },
  {
    id: "maintainer",
    label: "Maintainer",
    description: "Public activity emphasizes repository upkeep, community handling, and operational hygiene.",
    weights: { "2.8": 0.3, "2.11": 0.2, "2.10": 0.15, "2.6": 0.15, "2.9": 0.1, "2.12": 0.1 },
  },
  {
    id: "collaborator",
    label: "Collaborator",
    description: "Public activity emphasizes reviews, shared repositories, and participation beyond owned projects.",
    weights: { "2.3": 0.4, "2.11": 0.25, "2.13": 0.25, "2.14": 0.1 },
  },
  {
    id: "explorer",
    label: "Explorer",
    description: "Public activity spans technologies, topics, and varied repository work.",
    weights: { "2.5": 0.45, "2.1": 0.15, "2.4": 0.15, "2.10": 0.1, "2.6": 0.15 },
  },
  {
    id: "release-engineer",
    label: "Release engineer",
    description: "Public activity emphasizes repeatable releases, consistency, and repository operations.",
    weights: { "2.9": 0.4, "2.6": 0.2, "2.8": 0.15, "2.12": 0.15, "2.2": 0.1 },
  },
  {
    id: "community-contributor",
    label: "Community contributor",
    description: "Public activity emphasizes external contribution, collaboration, and community response.",
    weights: { "2.13": 0.35, "2.3": 0.25, "2.11": 0.25, "2.10": 0.15 },
  },
  {
    id: "documentation-advocate",
    label: "Documentation advocate",
    description: "Public activity emphasizes documentation coverage and maintainable project communication.",
    weights: { "2.10": 0.55, "2.6": 0.2, "2.11": 0.15, "2.8": 0.1 },
  },
  {
    id: "security-conscious",
    label: "Security-conscious",
    description: "Public repositories expose security and operational hygiene signals.",
    weights: { "2.12": 0.55, "2.6": 0.2, "2.8": 0.15, "2.14": 0.1 },
  },
];

export function interpretE2Archetypes(
  scores: ScoresOutput,
  confidence: InterpretationConfidence,
): InterpretationArchetype[] {
  return archetypeDefinitions
    .map((definition) => {
      const components = Object.entries(definition.weights).map(([id, weight]) => ({
        id,
        weight,
        value: scoreValue(scores, id),
        label: scores.breakdown[id]?.name ?? id,
      }));
      const value = weightedAverage(components.map((component) => [component.value, component.weight]));
      const evidence = [...components]
        .sort((a, b) => b.weight * b.value - a.weight * a.value)
        .slice(0, 4)
        .map((component) => component.label.replace(/ score$/i, "") + " " + round(component.value, 1));
      return {
        id: definition.id,
        label: definition.label,
        score: round(value, 2),
        rank: 0,
        description: definition.description,
        evidence,
        sourceIds: components.map((component) => component.id),
        confidence: round(clamp(confidence.score + 3), 1),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function interpretE3WorkRhythm(data: EngineData): InterpretationWorkRhythm {
  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  const dailyCounts = Array.from({ length: 7 }, () => 0);

  for (const items of Object.values(data.punchCards)) {
    for (const [day, hour, rawCount] of items) {
      const count = Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0;
      if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
        dailyCounts[day] = (dailyCounts[day] ?? 0) + count;
        hourlyCounts[hour] = (hourlyCounts[hour] ?? 0) + count;
      }
    }
  }

  const total = hourlyCounts.reduce((sum, count) => sum + count, 0);
  const hourly = hourlyCounts.map((count, hour) => ({ hour, count, share: round(ratio(count, total), 4) }));
  const daily = dailyCounts.map((count, day) => ({ day, label: dayLabels[day]!, count, share: round(ratio(count, total), 4) }));
  const bucketDefinitions = [
    { id: "night", label: "Night", startHour: 0, endHour: 5 },
    { id: "morning", label: "Morning", startHour: 6, endHour: 11 },
    { id: "afternoon", label: "Afternoon", startHour: 12, endHour: 17 },
    { id: "evening", label: "Evening", startHour: 18, endHour: 23 },
  ];
  const buckets = bucketDefinitions.map((bucket) => {
    const count = hourlyCounts.slice(bucket.startHour, bucket.endHour + 1).reduce((sum, value) => sum + value, 0);
    return { ...bucket, count, share: round(ratio(count, total), 4) };
  });
  const rankedBuckets = [...buckets].sort((a, b) => b.share - a.share);
  const dominant = rankedBuckets[0]!;
  const runnerUp = rankedBuckets[1]!;
  const label = total === 0
    ? "No sampled UTC rhythm"
    : dominant.share >= 0.3 && dominant.share - runnerUp.share >= 0.05
      ? "UTC " + dominant.id + "-heavy"
      : "UTC distributed schedule";
  const chronotypeTag: InterpretationWorkRhythm["chronotypeTag"] = total < 20
    ? "Insufficient sample"
    : dominant.share < 0.3 || dominant.share - runnerUp.share < 0.05
      ? "Mixed-hours builder"
      : dominant.id === "night"
        ? "Night owl"
        : dominant.id === "morning"
          ? "Early bird"
          : dominant.id === "afternoon"
            ? "Day worker"
            : "Evening builder";
  const chronotypeDescription = total < 20
    ? "Fewer than 20 sampled commits were available, so no UTC work-time tag is assigned."
    : chronotypeTag === "Mixed-hours builder"
      ? "No six-hour UTC window leads by at least five percentage points in the sampled commits."
      : chronotypeTag + " signal: " + Math.round(dominant.share * 100) + "% of sampled commits landed in the " + dominant.label.toLowerCase() + " UTC window.";
  const weekendShare = ratio(dailyCounts[0]! + dailyCounts[6]!, total);
  const weekLabel = total === 0
    ? "No sampled weekly rhythm"
    : weekendShare >= 0.45
      ? "Weekend-heavy"
      : weekendShare <= 0.25
        ? "Weekday-focused"
        : "Balanced weekday/weekend mix";
  const peakHour = hourly.reduce((best, item) => item.count > best.count ? item : best, hourly[0]!);
  const peakDay = daily.reduce((best, item) => item.count > best.count ? item : best, daily[0]!);
  const confidence = total === 0
    ? 0
    : round(clamp(45 + Math.min(30, data.topRepos.length * 3) + Math.min(20, total / 25) - 15), 1);

  return {
    timezone: "UTC",
    label,
    chronotypeTag,
    chronotypeDescription,
    weekLabel,
    caveat: "GitHub punch-card hours are UTC and sampled from top repositories; they cannot establish a local chronotype without a user-supplied timezone.",
    confidence,
    totalSamples: total,
    peakHourUtc: peakHour.hour,
    peakDayUtc: peakDay.label,
    hourly,
    daily,
    buckets,
  };
}

const styleLabel = (value: number, left: string, right: string) =>
  value < 40 ? left : value > 60 ? right : "Balanced";

export function interpretE4WorkStyle(
  scores: ScoresOutput,
  signals: Record<string, SignalResult>,
): InterpretationWorkStyleAxis[] {
  const selfMergeValue = signals["3.23"]?.value;
  const selfMergeRatio = selfMergeValue && typeof selfMergeValue === "object"
    && typeof (selfMergeValue as Record<string, unknown>).ratio === "number"
    ? clamp((selfMergeValue as { ratio: number }).ratio, 0, 1)
    : 0.5;
  const burstSteadiness = signals["3.2"]?.flagged ? 20 : 80;
  const axis = (
    id: string,
    left: string,
    right: string,
    value: number,
    evidence: string[],
    sourceIds: string[],
  ): InterpretationWorkStyleAxis => {
    const position = round(clamp(value), 1);
    return { id, left, right, value: position, label: styleLabel(position, left, right), evidence, sourceIds };
  };

  const collaboration = weightedAverage([
    [scoreValue(scores, "2.3"), 0.35],
    [scoreValue(scores, "2.11"), 0.25],
    [scoreValue(scores, "2.13"), 0.25],
    [(1 - selfMergeRatio) * 100, 0.15],
  ]);
  const lifecycle = weightedAverage([
    [scoreValue(scores, "2.8"), 0.65],
    [scoreValue(scores, "2.9"), 0.35],
  ]);
  const ecosystem = weightedAverage([
    [scoreValue(scores, "2.3"), 0.25],
    [scoreValue(scores, "2.11"), 0.25],
    [scoreValue(scores, "2.13"), 0.3],
    [scoreValue(scores, "2.10"), 0.2],
  ]);
  const steadiness = weightedAverage([
    [scoreValue(scores, "2.2"), 0.8],
    [burstSteadiness, 0.2],
  ]);

  return [
    axis("collaboration", "Solo shipper", "Ecosystem collaborator", collaboration, [
      "Collaboration " + round(scoreValue(scores, "2.3"), 1),
      "Self-merge ratio " + round(selfMergeRatio * 100, 1) + "%",
    ], ["2.3", "2.11", "2.13", "3.23"]),
    axis("breadth", "Specialist", "Generalist", scoreValue(scores, "2.5"), [
      "Breadth " + round(scoreValue(scores, "2.5"), 1),
    ], ["2.5"]),
    axis("lifecycle", "Experimenter", "Maintainer", lifecycle, [
      "Maintenance " + round(scoreValue(scores, "2.8"), 1),
      "Release discipline " + round(scoreValue(scores, "2.9"), 1),
    ], ["2.8", "2.9"]),
    axis("ecosystem", "Code-first", "Ecosystem-first", ecosystem, [
      "Community " + round(scoreValue(scores, "2.11"), 1),
      "Giving-back " + round(scoreValue(scores, "2.13"), 1),
    ], ["2.3", "2.10", "2.11", "2.13"]),
    axis("cadence", "Burst-driven", "Steady cadence", steadiness, [
      "Consistency " + round(scoreValue(scores, "2.2"), 1),
      "Burst flag " + (signals["3.2"]?.flagged ? "present" : "not present"),
    ], ["2.2", "3.2"]),
  ];
}

const repoLifecycle = (pushedAt: string | null, archived: boolean, now: Date) => {
  if (archived) return "archived";
  if (!pushedAt) return "dormant";
  const days = Math.max(0, (now.getTime() - new Date(pushedAt).getTime()) / 86_400_000);
  if (days <= 90) return "active";
  if (days <= 365) return "maintained";
  return "dormant";
};

export function interpretE5Portfolio(data: EngineData): InterpretationPortfolio {
  const username = data.username.toLowerCase();
  const owned = data.repos.filter((repo) => repo.owner.login.toLowerCase() === username && !repo.fork);
  const lifecycleCounts = { active: 0, maintained: 0, dormant: 0, archived: 0 };
  for (const repo of owned) lifecycleCounts[repoLifecycle(repo.pushed_at, repo.archived, data.now) as keyof typeof lifecycleCounts] += 1;

  const sampledOwned = data.topRepos.filter((repo) => !repo.fork && repo.owner.login.toLowerCase() === username);
  const readinessFor = (repo: EngineData["topRepos"][number]) => {
    const quality = data.qualities[repo.full_name];
    let value = 0;
    if (repo.license) value += 25;
    if ((quality?.readmeBytes ?? 0) >= 800) value += 20;
    if (quality?.testsPresent) value += 20;
    if (quality?.ciPresent) value += 20;
    if ((data.releases[repo.full_name]?.length ?? 0) > 0) value += 15;
    return value;
  };
  const productionReadyRepositories = sampledOwned.filter((repo) => readinessFor(repo) >= 60).length;
  const flagships = sampledOwned.slice(0, 5).map((repo) => {
    const pushedDaysAgo = repo.pushed_at
      ? round(Math.max(0, (data.now.getTime() - new Date(repo.pushed_at).getTime()) / 86_400_000), 1)
      : null;
    return {
      repository: repo.full_name,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      pushedDaysAgo,
      releases: data.releases[repo.full_name]?.length ?? 0,
      readinessScore: readinessFor(repo),
      lifecycle: repoLifecycle(repo.pushed_at, repo.archived, data.now),
    };
  });
  const lifecycle = [
    { id: "active", label: "Active <=90d", count: lifecycleCounts.active },
    { id: "maintained", label: "Maintained 91-365d", count: lifecycleCounts.maintained },
    { id: "dormant", label: "Dormant >365d", count: lifecycleCounts.dormant },
    { id: "archived", label: "Archived", count: lifecycleCounts.archived },
  ].map((item) => ({ ...item, share: round(ratio(item.count, owned.length), 4) }));

  return {
    totalRepositories: data.repos.length,
    ownedRepositories: owned.length,
    activeRepositories: lifecycleCounts.active,
    maintainedRepositories: lifecycleCounts.maintained,
    dormantRepositories: lifecycleCounts.dormant,
    archivedRepositories: lifecycleCounts.archived,
    productionReadyRepositories,
    productionReadyRatio: round(ratio(productionReadyRepositories, sampledOwned.length), 4),
    lifecycle,
    flagships,
    sourceIds: ["1.8", "1.9", "2.6", "2.8", "2.9"],
  };
}

const weekStart = (dateValue: string) => {
  const date = new Date(dateValue + "T00:00:00Z");
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
};

export function interpretE6Momentum(data: EngineData): InterpretationMomentum {
  const now = Date.UTC(data.now.getUTCFullYear(), data.now.getUTCMonth(), data.now.getUTCDate());
  const currentStart = now - 89 * 86_400_000;
  const previousStart = currentStart - 90 * 86_400_000;
  const currentDays = data.graphql.calendar.filter((day) => {
    const time = new Date(day.date + "T00:00:00Z").getTime();
    return time >= currentStart && time <= now;
  });
  const previousDays = data.graphql.calendar.filter((day) => {
    const time = new Date(day.date + "T00:00:00Z").getTime();
    return time >= previousStart && time < currentStart;
  });
  const totalFor = (days: typeof data.graphql.calendar) => days.reduce((sum, day) => sum + day.contributionCount, 0);
  const current90 = totalFor(currentDays);
  const previous90 = totalFor(previousDays);
  const currentActiveDays = currentDays.filter((day) => day.contributionCount > 0).length;
  const previousActiveDays = previousDays.filter((day) => day.contributionCount > 0).length;
  const deltaPercent = previous90 > 0 ? round((current90 - previous90) / previous90 * 100, 1) : current90 > 0 ? null : 0;
  const label = deltaPercent === null
    ? "Newly active"
    : deltaPercent >= 25
      ? "Accelerating"
      : deltaPercent >= 8
        ? "Building"
        : deltaPercent <= -25
          ? "Cooling"
          : deltaPercent <= -8
            ? "Easing"
            : "Stable";

  const weeklyMap = new Map<string, number>();
  for (const day of data.graphql.calendar) {
    const time = new Date(day.date + "T00:00:00Z").getTime();
    if (time < previousStart || time > now) continue;
    const key = weekStart(day.date);
    weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + day.contributionCount);
  }
  const weekly = [...weeklyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({
      week,
      count,
      period: new Date(week + "T00:00:00Z").getTime() >= currentStart ? "current" as const : "previous" as const,
    }));

  const comparison = deltaPercent === null ? "with no prior-window baseline" : (deltaPercent >= 0 ? "+" : "") + deltaPercent + "% versus the preceding window";
  return {
    label,
    description: current90 + " contributions in the latest 90 days, " + comparison + ".",
    current90,
    previous90,
    currentActiveDays,
    previousActiveDays,
    deltaPercent,
    weekly,
    sourceIds: ["1.10", "2.1", "2.2", "4.1"],
  };
}

export function interpretE7Evidence(grades: InterpretationGrade[]) {
  const strengths = [...grades].sort((a, b) => b.score - a.score).slice(0, 3);
  const focusAreas = [...grades].sort((a, b) => a.score - b.score).slice(0, 3);
  return { strengths, focusAreas };
}

export function interpretE9Tags(
  data: EngineData,
  scores: ScoresOutput,
  signals: Record<string, SignalResult>,
  rhythm: InterpretationWorkRhythm,
  workStyle: InterpretationWorkStyleAxis[],
  portfolio: InterpretationPortfolio,
  confidence: InterpretationConfidence,
): InterpretationTag[] {
  const score = (id: string) => scoreValue(scores, id);
  const axis = (id: string) => workStyle.find((item) => item.id === id)?.value ?? 50;
  const weekendShare = ratio((rhythm.daily[0]?.count ?? 0) + (rhythm.daily[6]?.count ?? 0), rhythm.totalSamples);
  const issueTotal = data.search.issuesOpened + data.search.issuesClosed;
  const issueCloseRatio = ratio(data.search.issuesClosed, issueTotal);
  const reviewCount = data.graphql.totalPullRequestReviewContributions;
  const externalMerges = data.search.prsMergedExternal;
  const languageCount = new Set(Object.values(data.languages).flatMap((items) => Object.keys(items))).size;
  const securityRepos = Object.values(data.security);
  const securityCoverage = ratio(securityRepos.filter((item) => item.codeScanningEnabled || item.dependabotEnabled).length, Math.max(1, securityRepos.length));
  const activeAlerts = securityRepos.reduce((sum, item) => sum + (item.codeScanning?.length ?? 0) + (item.dependabot?.length ?? 0), 0);
  const cadence = axis("cadence");
  const collaboration = axis("collaboration");
  const tag = (
    id: string,
    label: string,
    active: boolean,
    value: number,
    description: string,
    evidence: string[],
    sourceIds: string[],
  ): InterpretationTag => ({
    id,
    label,
    active,
    score: round(clamp(value), 1),
    confidence: round(clamp(confidence.score - (active ? 0 : 8)), 1),
    description,
    evidence,
    sourceIds,
  });
  return [
    tag("weekend-contributor", "Weekend contributor", rhythm.totalSamples >= 20 && weekendShare >= 0.45, weekendShare * 100, "A large share of sampled UTC activity lands on Saturday or Sunday.", [Math.round(weekendShare * 100) + "% weekend activity", rhythm.totalSamples + " punch-card samples"], ["4.4", "4.12"]),
    tag("burst-worker", "Burst worker", Boolean(signals["3.2"]?.flagged) || cadence < 40, 100 - cadence, "Contribution cadence is concentrated into bursts rather than evenly distributed weeks.", ["Cadence axis " + round(cadence, 1), "Burst signal " + (signals["3.2"]?.flagged ? "flagged" : "not flagged")], ["2.2", "3.2"]),
    tag("steady-contributor", "Steady contributor", rhythm.totalSamples >= 20 && cadence >= 60 && !signals["3.2"]?.flagged, cadence, "The sampled contribution pattern is comparatively consistent and the burst signal is clear.", ["Cadence axis " + round(cadence, 1), "Burst signal not flagged"], ["2.2", "3.2"]),
    tag("shipper", "Shipper", score("2.1") >= 60 || score("2.9") >= 60 || data.search.prsMerged >= 5, Math.max(score("2.1"), score("2.9")), "Public evidence shows repeatable delivery through contribution volume, releases, or merged pull requests.", ["Volume " + score("2.1"), "Release discipline " + score("2.9"), data.search.prsMerged + " merged PRs"], ["2.1", "2.9", "4.9"]),
    tag("reviewer", "Reviewer", reviewCount >= 5, Math.min(100, reviewCount / 50 * 100), "The public contribution record contains a meaningful number of pull-request reviews.", [reviewCount + " pull-request reviews"], ["2.3", "3.25", "4.9"]),
    tag("issue-closer", "Issue closer", issueTotal >= 5 && issueCloseRatio >= 0.65, issueCloseRatio * 100, "Authored issue activity shows a high observed close share in the bounded search sample.", [data.search.issuesClosed + " closed / " + issueTotal + " opened-or-closed issues"], ["1.12", "4.18"]),
    tag("documentation-first", "Documentation-first", score("2.10") >= 65, score("2.10"), "Documentation coverage scores strongly across the sampled public repositories.", ["Documentation score " + score("2.10")], ["2.10", "1.19"]),
    tag("security-minded", "Security-minded", score("2.12") >= 65 && securityRepos.length > 0 && securityCoverage > 0, score("2.12"), "Security hygiene and security feature coverage are visible on the sampled repositories.", ["Security hygiene " + score("2.12"), Math.round(securityCoverage * 100) + "% sampled repos with security features", activeAlerts + " current alerts"], ["2.12", "1.36", "4.28"]),
    tag("polyglot-builder", "Polyglot builder", languageCount >= 4 || score("2.5") >= 65, Math.max(score("2.5"), Math.min(100, languageCount / 8 * 100)), "The sampled repositories span multiple detected language ecosystems.", [languageCount + " detected languages", "Breadth score " + score("2.5")], ["2.5", "4.5", "4.31"]),
    tag("open-source-collaborator", "Open-source collaborator", externalMerges > 0 || collaboration >= 60, Math.max(collaboration, Math.min(100, externalMerges / 10 * 100)), "Public evidence shows participation beyond exclusively owned repositories.", [externalMerges + " externally merged PRs", "Collaboration axis " + round(collaboration, 1)], ["2.3", "2.13", "4.10"]),
    tag("solo-builder", "Solo builder", collaboration <= 40 && portfolio.ownedRepositories > 0 && externalMerges === 0, 100 - collaboration, "The observed contribution mix is concentrated on owned repositories with little external merge evidence.", ["Collaboration axis " + round(collaboration, 1), portfolio.ownedRepositories + " owned repositories"], ["2.3", "2.13", "4.20"]),
    tag("experimental-portfolio", "Experimental portfolio", portfolio.ownedRepositories >= 3 && axis("lifecycle") < 45 && portfolio.productionReadyRatio < 0.5, 100 - portfolio.productionReadyRatio * 100, "The portfolio contains several owned projects with limited readiness signals or uneven maintenance.", [portfolio.ownedRepositories + " owned repositories", Math.round(portfolio.productionReadyRatio * 100) + "% readiness proxy", "Lifecycle axis " + round(axis("lifecycle"), 1)], ["2.6", "2.8", "2.9"]),
    tag("flagship-maintainer", "Flagship maintainer", Boolean(portfolio.flagships[0] && portfolio.flagships[0].readinessScore >= 60 && ["active", "maintained"].includes(portfolio.flagships[0].lifecycle)), portfolio.flagships[0]?.readinessScore ?? 0, "At least one high-impact sampled repository combines maintenance and repository hygiene signals.", [portfolio.flagships[0] ? portfolio.flagships[0].repository + " readiness " + portfolio.flagships[0].readinessScore : "No sampled flagship"], ["2.6", "2.8", "2.9", "4.30"]),
  ];
}

export function interpretE10RoleProfile(
  scores: ScoresOutput,
  archetypes: InterpretationArchetype[],
): InterpretationRoleProfile {
  const dimensions = [
    { id: "shipping", label: "Shipping", score: scoreValue(scores, "2.1"), evidence: ["Volume score " + scoreValue(scores, "2.1"), "Release discipline " + scoreValue(scores, "2.9")], sourceIds: ["2.1", "2.9"] },
    { id: "maintenance", label: "Maintenance", score: weightedAverage([[scoreValue(scores, "2.8"), 0.65], [scoreValue(scores, "2.9"), 0.35]]), evidence: ["Maintenance " + scoreValue(scores, "2.8"), "Release discipline " + scoreValue(scores, "2.9")], sourceIds: ["2.8", "2.9"] },
    { id: "collaboration", label: "Collaboration", score: weightedAverage([[scoreValue(scores, "2.3"), 0.5], [scoreValue(scores, "2.11"), 0.25], [scoreValue(scores, "2.13"), 0.25]]), evidence: ["Collaboration " + scoreValue(scores, "2.3"), "Community " + scoreValue(scores, "2.11")], sourceIds: ["2.3", "2.11", "2.13"] },
    { id: "documentation", label: "Documentation", score: scoreValue(scores, "2.10"), evidence: ["Documentation score " + scoreValue(scores, "2.10")], sourceIds: ["2.10"] },
    { id: "security", label: "Security hygiene", score: scoreValue(scores, "2.12"), evidence: ["Security hygiene score " + scoreValue(scores, "2.12")], sourceIds: ["2.12"] },
  ].map((item) => ({ ...item, score: round(item.score, 1) }));
  const sorted = [...dimensions].sort((a, b) => b.score - a.score);
  return { primary: archetypes[0]?.label ?? "Mixed public activity", secondary: archetypes[1]?.label ?? "No secondary archetype", dimensions: sorted };
}

export function interpretE11QualityProfile(data: EngineData): InterpretationQualityProfile {
  const repos = data.topRepos.filter((repo) => !repo.fork && repo.owner.login.toLowerCase() === data.username.toLowerCase());
  const repositories: InterpretationRepositoryQuality[] = repos.map((repo) => {
    const quality = data.qualities[repo.full_name];
    const security = data.security[repo.full_name];
    const activeAlerts = (security?.codeScanning?.length ?? 0) + (security?.dependabot?.length ?? 0);
    return {
      repository: repo.full_name,
      readinessScore: [repo.license ? 25 : 0, (quality?.readmeBytes ?? 0) >= 800 ? 20 : 0, quality?.testsPresent ? 20 : 0, quality?.ciPresent ? 20 : 0, (data.releases[repo.full_name]?.length ?? 0) > 0 ? 15 : 0].reduce((sum, value) => sum + value, 0),
      documentation: (quality?.readmeBytes ?? 0) >= 800,
      license: Boolean(repo.license),
      tests: Boolean(quality?.testsPresent),
      ci: Boolean(quality?.ciPresent),
      releases: data.releases[repo.full_name]?.length ?? 0,
      securityCoverage: security?.codeScanningEnabled || security?.dependabotEnabled ? 100 : 0,
      activeAlerts,
    };
  });
  const denominator = Math.max(1, repositories.length);
  const documentationCoverage = ratio(repositories.filter((repo) => repo.documentation).length, denominator);
  const licenseCoverage = ratio(repositories.filter((repo) => repo.license).length, denominator);
  const testCoverage = ratio(repositories.filter((repo) => repo.tests).length, denominator);
  const ciCoverage = ratio(repositories.filter((repo) => repo.ci).length, denominator);
  const releaseCoverage = ratio(repositories.filter((repo) => repo.releases > 0).length, denominator);
  const securityCoverage = ratio(repositories.filter((repo) => repo.securityCoverage > 0).length, denominator);
  const score = round(weightedAverage([[documentationCoverage * 100, 0.2], [licenseCoverage * 100, 0.2], [testCoverage * 100, 0.15], [ciCoverage * 100, 0.15], [releaseCoverage * 100, 0.15], [securityCoverage * 100, 0.15]]), 1);
  return {
    score,
    grade: gradeForScore("quality", "Repository hygiene", score, ["2.6", "2.10", "2.12"]).grade,
    documentationCoverage: round(documentationCoverage, 4),
    licenseCoverage: round(licenseCoverage, 4),
    testCoverage: round(testCoverage, 4),
    ciCoverage: round(ciCoverage, 4),
    releaseCoverage: round(releaseCoverage, 4),
    securityCoverage: round(securityCoverage, 4),
    repositories,
    sourceIds: ["1.15", "2.6", "2.10", "2.12", "4.27", "4.28"],
  };
}

export function interpretE12EvidenceTrace(
  tags: InterpretationTag[],
  rhythm: InterpretationWorkRhythm,
  quality: InterpretationQualityProfile,
  confidence: InterpretationConfidence,
): InterpretationEvidenceTrace[] {
  return [
    { id: "overall", label: "Overall score", value: confidence.score + "/100 evidence confidence", status: "derived", confidence: confidence.score, freshness: "analysis-time aggregate", sourceIds: ["1.1-4.32"] },
    { id: "chronotype", label: rhythm.chronotypeTag, value: rhythm.totalSamples + " UTC punch-card samples", status: rhythm.totalSamples >= 20 ? "sampled" : "unavailable", confidence: rhythm.confidence, freshness: "recent stats window", sourceIds: ["4.4", "4.12"] },
    { id: "quality", label: "Repository hygiene", value: quality.score + "/100", status: quality.repositories.length ? "sampled" : "unavailable", confidence: quality.repositories.length ? 75 : 0, freshness: "current repository snapshot", sourceIds: quality.sourceIds },
    ...tags.filter((item) => item.active).slice(0, 12).map((item) => ({ id: item.id, label: item.label, value: item.score + "/100", status: "derived" as const, confidence: item.confidence, freshness: "derived from current run", sourceIds: item.sourceIds })),
  ];
}

export function interpretE13DataQuality(
  confidence: InterpretationConfidence,
  warnings: string[],
  rhythm: InterpretationWorkRhythm,
  quality: InterpretationQualityProfile,
): InterpretationDataQuality {
  const ruleCoverage = confidence.coveragePercent;
  const sampleDepth = round(clamp(100 - confidence.sampledRules / Math.max(1, confidence.availableRules + confidence.sampledRules) * 45), 1);
  const freshness = round(clamp(72 + (rhythm.totalSamples >= 20 ? 10 : 0) + (quality.repositories.length ? 8 : 0) - Math.min(20, warnings.length)), 1);
  const sourceReliability = round(clamp(100 - warnings.length * 1.5 - confidence.unavailableRules * 0.2), 1);
  const score = round(weightedAverage([[ruleCoverage, 0.45], [sampleDepth, 0.2], [freshness, 0.2], [sourceReliability, 0.15]]), 1);
  return { score, label: score >= 85 ? "strong" : score >= 65 ? "usable" : "limited", ruleCoverage, sampleDepth, freshness, sourceReliability, caveats: warnings.slice(0, 6) };
}

export function interpretE8Confidence(
  sections: Array<Record<string, RuleResult>>,
  warnings: string[],
  budget: BudgetSnapshot,
): InterpretationConfidence {
  const rules = sections.flatMap((section) => Object.values(section));
  const okRules = rules.filter((rule) => rule.status === "ok").length;
  const sampledRules = rules.filter((rule) => rule.status === "sampled").length;
  const unavailableRules = rules.filter((rule) => rule.status === "unavailable").length;
  const skippedRules = rules.filter((rule) => rule.status === "skipped" || rule.status === "requires_oauth").length;
  const applicable = Math.max(1, rules.length - skippedRules);
  const availableRules = okRules + sampledRules;
  const coveragePercent = round(ratio(availableRules, applicable) * 100, 1);
  const evidencePercent = ratio(okRules + sampledRules * 0.55, applicable) * 100;
  const warningPenalty = round(Math.min(12, warnings.length * 0.25), 1);
  const budgetPenalty = (["rest", "graphql", "search"] as const)
    .reduce((penalty, bucket) => penalty + (budget[bucket].remaining === 0 ? 4 : 0), 0);
  const sourceHealth = clamp(100 - warningPenalty - budgetPenalty);
  const score = round(clamp(evidencePercent * 0.55 + coveragePercent * 0.25 + sourceHealth * 0.2), 1);
  const label = score >= 90 ? "high" : score >= 72 ? "medium" : "low";

  return {
    score,
    label,
    coveragePercent,
    availableRules,
    sampledRules,
    unavailableRules,
    skippedRules,
    warningPenalty,
    budgetPenalty,
    caveat: "Confidence measures public evidence coverage and sampling quality, not career level or personal capability.",
  };
}

export function runInterpretation(input: InterpretationInput): InterpretationOutput {
  const confidence = interpretE8Confidence(
    [input.baseline, input.scores.breakdown, input.signals, input.charts],
    input.warnings,
    input.budget,
  );
  const { overall, grades } = interpretE1Grades(input.scores);
  const archetypes = interpretE2Archetypes(input.scores, confidence);
  const workRhythm = interpretE3WorkRhythm(input.data);
  const workStyle = interpretE4WorkStyle(input.scores, input.signals);
  const portfolio = interpretE5Portfolio(input.data);
  const momentum = interpretE6Momentum(input.data);
  const { strengths, focusAreas } = interpretE7Evidence(grades);
  const tags = interpretE9Tags(input.data, input.scores, input.signals, workRhythm, workStyle, portfolio, confidence);
  const roleProfile = interpretE10RoleProfile(input.scores, archetypes);
  const qualityProfile = interpretE11QualityProfile(input.data);
  const evidenceTrace = interpretE12EvidenceTrace(tags, workRhythm, qualityProfile, confidence);
  const dataQuality = interpretE13DataQuality(confidence, input.warnings, workRhythm, qualityProfile);
  const primary = archetypes[0]?.label ?? "Mixed public activity";
  const headline = primary + " profile with " + workRhythm.label.toLowerCase() + " activity and " + momentum.label.toLowerCase() + " momentum.";

  return {
    headline,
    overall,
    grades,
    archetypes,
    workRhythm,
    workStyle,
    portfolio,
    momentum,
    strengths,
    focusAreas,
    confidence,
    tags,
    roleProfile,
    qualityProfile,
    evidenceTrace,
    dataQuality,
  };
}
