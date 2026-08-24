import type { EngineData, RuleResult, ScoreFactor, SignalResult } from "../types";
import {
  clamp,
  coefficientOfVariation,
  daysBetween,
  median,
  ok,
  ratio,
  round,
  saturatingScore,
} from "./shared";

type ScoreRule = (data: EngineData, signals?: Record<string, SignalResult>) => RuleResult<number | Record<string, unknown>>;

const factor = (label: string, detail: string, earned: number, max: number): ScoreFactor => ({
  label,
  detail,
  earned: round(earned),
  max,
});

const finishScore = (
  id: string,
  name: string,
  description: string,
  source: string,
  factors: ScoreFactor[],
  remediation?: string,
  details: Record<string, unknown> = {},
): RuleResult<number | Record<string, unknown>> =>
  ({
    ...ok(id, name, round(clamp(factors.reduce((sum, item) => sum + item.earned, 0))), description, source, "cheap", details),
    ...(factors.length ? { factors } : {}),
    ...(remediation ? { remediation } : {}),
  }) as RuleResult<number | Record<string, unknown>>;

const reposWith = (data: EngineData) => data.repos.filter((repo) => !repo.fork && !repo.mirror_url);
const allTopics = (data: EngineData) => new Set(data.repos.flatMap((repo) => repo.topics));

export const rule2_1VolumeScore: ScoreRule = (data) => {
  const repoCommitCaps = data.repos.map((repo) => Math.min((data.commits[repo.full_name] ?? []).length, 30));
  const calendarPoints = saturatingScore(data.graphql.totalContributions, 0.012);
  const prPoints = saturatingScore(data.search.prsOpened * 2, 0.012);
  const issuePoints = saturatingScore(data.search.issuesOpened, 0.012);
  const commitPoints = saturatingScore(repoCommitCaps.reduce((sum, count) => sum + count, 0), 0.012);
  return finishScore(
    "2.1",
    "Volume score",
    "Log-scaled contribution volume with a per-repository cap.",
    "GraphQL calendar + Search API",
    [
      factor("Contribution events", `${data.graphql.totalContributions} in the last year`, calendarPoints / 4, 25),
      factor("Pull requests opened", `${data.search.prsOpened} PRs (double weight)`, prPoints / 4, 25),
      factor("Issues opened", `${data.search.issuesOpened} issues`, issuePoints / 4, 25),
      factor("Sampled commits", `up to 30 counted per repository`, commitPoints / 4, 25),
    ],
    undefined,
    { raw: data.graphql.totalContributions + data.search.prsOpened * 2 + data.search.issuesOpened + repoCommitCaps.reduce((sum, count) => sum + count, 0), repoContributionCap: 30 },
  );
};

export const rule2_2ConsistencyScore: ScoreRule = (data) => {
  const weekly = Object.values(data.commitActivity).flatMap((weeks) => weeks.map((week) => week.total));
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
  const streakPoints = saturatingScore(longest, 0.08) * 0.35;
  const activeDaysPoints = activeRatio * 100 * 0.4;
  const stabilityPoints = weekly.length > 0 ? clamp(100 - cv * 35) * 0.25 : 25;
  return finishScore(
    "2.2",
    "Consistency score",
    "Combines streak length, active-day ratio, and inverse weekly commit variance.",
    "GraphQL contributionCalendar + derived weekly commits",
    [
      factor("Longest streak", `${longest} consecutive active days (35%)`, streakPoints, 35),
      factor("Active days", `${round(activeRatio * 100, 1)}% of the last year active (40%)`, activeDaysPoints, 40),
      factor("Weekly stability", weekly.length ? `commit variance across ${weekly.length} sampled weeks (25%)` : "no weekly sample; full credit by default (25%)", stabilityPoints, 25),
    ],
    longest < 7 ? "Build a longer unbroken contribution streak; even small daily contributions extend it." : undefined,
    { longestStreak: longest, activeDaysRatio: activeRatio, weeklyCoefficientOfVariation: cv },
  );
};

export const rule2_3CollaborationScore: ScoreRule = (data) => {
  const mergeRate = ratio(data.search.prsMergedExternal, Math.max(data.search.prsOpenedExternal, 1));
  const issueResolution = ratio(data.search.issuesClosed, Math.max(data.search.issuesOpened, 1));
  const reviewRate = saturatingScore(data.graphql.totalPullRequestReviewContributions, 0.06);
  return finishScore(
    "2.3",
    "Collaboration score",
    "Rewards merged work in other repositories, resolved issues, and review participation.",
    "Search API + GraphQL",
    [
      factor("External merged PRs", `${data.search.prsMergedExternal} merged outside own repos (40%)`, mergeRate * 40, 40),
      factor("Issue resolution", `${data.search.issuesClosed}/${data.search.issuesOpened} authored issues closed (20%)`, issueResolution * 20, 20),
      factor("PR reviews", `${data.graphql.totalPullRequestReviewContributions} review contributions (40%)`, reviewRate * 0.4, 40),
    ],
    data.search.prsMergedExternal === 0 ? "Contribute to repositories you don't own; even small merged PRs raise this score." : undefined,
    { externalMergedPrs: data.search.prsMergedExternal, mergeRate, issueResolution, reviews: data.graphql.totalPullRequestReviewContributions },
  );
};

export const rule2_4ImpactScore: ScoreRule = (data) => {
  const values = reposWith(data).map((repo) => {
    const recency = repo.pushed_at ? Math.exp(-daysBetween(repo.pushed_at, data.now) / 1_095) : 0.1;
    return (Math.log1p(repo.stargazers_count) * 8 + Math.log1p(repo.forks_count) * 5) * recency;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  const value = saturatingScore(total, 0.055);
  const ranked = reposWith(data)
    .map((repo, index) => ({ repo, points: values[index] ?? 0 }))
    .sort((a, b) => b.points - a.points);
  return finishScore(
    "2.4",
    "Impact score",
    "Recency-weighted stars and forks from non-fork repositories.",
    "GET /users/{u}/repos",
    ranked.slice(0, 5).map(({ repo, points }) =>
      factor(`${repo.name}`, `${repo.stargazers_count} stars · ${repo.forks_count} forks`, value * ratio(points, Math.max(total, Number.MIN_VALUE)), 100),
    ),
    total === 0 ? "Earn stars by publishing useful, well-documented projects and sharing them." : undefined,
    { repositories: values.length, rawImpact: round(total, 3) },
  );
};

export const rule2_5BreadthScore: ScoreRule = (data) => {
  const languages = new Set(Object.keys(data.languages).flatMap((key) => Object.keys(data.languages[key] ?? {}))).size;
  const topics = allTopics(data).size;
  const languagePoints = saturatingScore(languages, 0.18) * 0.55;
  const topicPoints = saturatingScore(topics, 0.12) * 0.45;
  return finishScore(
    "2.5",
    "Breadth score",
    "Log-scaled language and topic diversity.",
    "languages + repository topics",
    [
      factor("Languages used", `${languages} distinct languages (55%)`, languagePoints, 55),
      factor("Repository topics", `${topics} distinct topics (45%)`, topicPoints, 45),
    ],
    languages < 3 ? "Explore additional languages, or add topic labels to existing repositories to surface diversity." : undefined,
    { languages, topics },
  );
};

export const rule2_6CodeQualityProxy: ScoreRule = (data) => {
  const qualities = Object.values(data.qualities);
  const share = (predicate: (quality: (typeof qualities)[number]) => boolean) => ratio(qualities.filter(predicate).length, Math.max(qualities.length, 1));
  const licenseShare = share((quality) => quality.licensePresent);
  const readmeShare = share((quality) => quality.readmeBytes > 300);
  const ciShare = share((quality) => quality.ciPresent);
  const testsShare = share((quality) => quality.testsPresent);
  const imageShare = share((quality) => /!\[|<img/i.test(quality.readmeText));
  const installShare = share((quality) => /(^|\n)#{1,4}\s*(install|setup|usage)\b/i.test(quality.readmeText));
  return finishScore(
    "2.6",
    "Code quality proxy",
    "Deterministic repository hygiene flags: license, README size, CI workflows, tests, images, and install instructions.",
    "GraphQL repository batch + derived tree scan",
    [
      factor("License file", `${Math.round(licenseShare * qualities.length)} of ${qualities.length} repositories (30%)`, licenseShare * 30, 30),
      factor("Substantial README", `${Math.round(readmeShare * qualities.length)} of ${qualities.length} repositories over 300 bytes (30%)`, readmeShare * 30, 30),
      factor("CI workflows", `${Math.round(ciShare * qualities.length)} of ${qualities.length} repositories (20%)`, ciShare * 20, 20),
      factor("Tests detected", `${Math.round(testsShare * qualities.length)} of ${qualities.length} repositories (10%)`, testsShare * 10, 10),
      factor("Images & install docs", `${Math.round(((imageShare + installShare) / 2) * qualities.length)} of ${qualities.length} repositories average (10%)`, ((imageShare + installShare) / 2) * 10, 10),
    ],
    readmeShare < 0.5 ? "Add or expand READMEs (install + usage sections) in repositories under 300 bytes." : undefined,
    { sampledRepositories: qualities.length },
  );
};

// Module-level Set for O(1) .has() lookup instead of O(k) .includes() per signal.
const AUTHENTICITY_SIGNAL_IDS = new Set([
  "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.9",
  "3.19", "3.22", "3.28", "3.29", "3.31", "3.34", "3.35",
]);

export const rule2_7AuthenticityMultiplier: ScoreRule = (_data, signals) => {
  const flaggedIds = Object.values(signals ?? {}).filter((signalItem) => signalItem.flagged && AUTHENTICITY_SIGNAL_IDS.has(signalItem.id)).map((signalItem) => signalItem.id);
  const flagged = flaggedIds.length;
  const multiplier = clamp(1 - flagged * 0.06, 0.4, 1);
  return {
    ...ok("2.7", "Authenticity multiplier", round(multiplier), `${flagged} flag-only anomaly signals affect the damping multiplier; no signal is a verdict.`, "Section 3 signals", "cheap", { flaggedSignals: flagged, minimum: 0.4 }),
    factors: [factor("Signals flagged", flagged ? flaggedIds.join(", ") : "none", multiplier * 100, 100)],
    remediation: flagged > 0 ? "Review the flagged anomaly signals on the Signals tab; most have innocent explanations." : undefined,
  } as unknown as RuleResult<number | Record<string, unknown>>;
};

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
  const weightSum = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  const dormantRepos = repos
    .filter((repo) => repo.pushed_at && daysBetween(repo.pushed_at, data.now) > 365)
    .slice(0, 3)
    .map((repo) => repo.name);
  return finishScore(
    "2.8",
    "Maintenance score",
    "Recency and archived-ratio maintenance curve.",
    "GraphQL repository list",
    [
      factor("Pushed within 90 days", `${pushed90}/${repos.length} repositories (40%)`, (pairs[0]![0] / 100) * (0.4 / weightSum) * 100, 40),
      factor("Pushed within 180 days", `${pushed180}/${repos.length} repositories (25%)`, (pairs[1]![0] / 100) * (0.25 / weightSum) * 100, 25),
      factor("Not archived", `${archived} archived (10%)`, (pairs[2]![0] / 100) * (0.1 / weightSum) * 100, 10),
      ...(medianAge !== null ? [factor("Median push age", `${Math.round(medianAge)} days since last push (25%)`, (clamp(100 - medianAge / 3) / 100) * (0.25 / weightSum) * 100, 25)] : []),
    ],
    dormantRepos.length ? `Archive or refresh dormant repositories: ${dormantRepos.join(", ")}.` : undefined,
    { pushedWithin90Days: pushed90, pushedWithin180Days: pushed180, medianDaysSincePush: medianAge },
  );
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
  const weightSum = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  const noReleaseRepos = Object.entries(data.releases).filter(([, items]) => items.length === 0).map(([key]) => key.split("/")[1] ?? key).slice(0, 3);
  return finishScore(
    "2.9",
    "Release discipline score",
    "Release count, semver-tag ratio, and latest-release recency.",
    "GraphQL releases batch",
    [
      factor("Release count", `${releases.length} releases across sampled repositories (45%)`, (pairs[0]![0] / 100) * (0.45 / weightSum) * 100, 45),
      factor("Semver tags", `${semver}/${releases.length || 1} follow vMAJOR.MINOR.PATCH (30%)`, (pairs[1]![0] / 100) * (0.3 / weightSum) * 100, 30),
      ...(medianAge !== null ? [factor("Release freshness", `median release is ${Math.round(medianAge)} days old (25%)`, (clamp(100 - medianAge / 3) / 100) * (0.25 / weightSum) * 100, 25)] : []),
    ],
    noReleaseRepos.length ? `Tag GitHub releases for: ${noReleaseRepos.join(", ")}.` : undefined,
    { releases: releases.length, semver, medianDaysSinceRelease: medianAge },
  );
};

export const rule2_10DocumentationScore: ScoreRule = (data) => {
  const qualities = Object.entries(data.qualities);
  const count = Math.max(qualities.length, 1);
  const share = (predicate: ([, quality]: [string, (typeof qualities)[number][1]]) => boolean) => qualities.filter(predicate).length / count;

  const readmeShare = share(([, quality]) => quality.readmeBytes > 300);
  const installShare = share(([, quality]) => /(^|\n)#{1,4}\s*(install|setup|usage)\b/i.test(quality.readmeText));
  const imageShare = share(([, quality]) => /!\[|<img/i.test(quality.readmeText));
  const contributingShare = share(([, quality]) => quality.contributingPresent);
  const cocShare = share(([, quality]) => quality.codeOfConductPresent);
  const securityShare = share(([, quality]) => quality.securityPolicyPresent);
  const templatesShare = share(([, quality]) => quality.issueTemplatesPresent);
  const docsDirShare = share(([, quality]) => quality.docsDirectoryPresent);

  const missingReadme = qualities
    .filter(([, quality]) => !(quality.readmeBytes > 300))
    .map(([key]) => key.split("/")[1] ?? key)
    .slice(0, 3);

  const factors: ScoreFactor[] = [
    factor("README (>300B)", `${Math.round(readmeShare * count)} of ${count} repositories`, readmeShare * 40, 40),
    factor("Install/usage section", `${Math.round(installShare * count)} of ${count} READMEs`, installShare * 15, 15),
    factor("Screenshots or badges", `${Math.round(imageShare * count)} of ${count} READMEs`, imageShare * 10, 10),
    factor("CONTRIBUTING.md", `${Math.round(contributingShare * count)} of ${count} repositories`, contributingShare * 10, 10),
    factor("Code of conduct", `${Math.round(cocShare * count)} of ${count} repositories`, cocShare * 5, 5),
    factor("Security policy", `${Math.round(securityShare * count)} of ${count} repositories`, securityShare * 5, 5),
    factor("Issue templates", `${Math.round(templatesShare * count)} of ${count} repositories`, templatesShare * 5, 5),
    factor("docs/ directory", `${Math.round(docsDirShare * count)} of ${count} repositories`, docsDirShare * 5, 5),
    factor("Profile README", data.profileReadme.present ? "present" : "missing (create username/username repo)", data.profileReadme.present ? 5 : 0, 5),
  ];

  const remediationParts: string[] = [];
  if (missingReadme.length) remediationParts.push(`Write real READMEs for: ${missingReadme.join(", ")}`);
  if (!data.profileReadme.present) remediationParts.push("Add a profile README via the special username/username repository");
  if (contributingShare === 0) remediationParts.push("Drop a short CONTRIBUTING.md into your main project");

  return finishScore(
    "2.10",
    "Documentation score",
    "Per-repository documentation coverage: README depth, community files, docs directory, and profile README.",
    "GraphQL README blobs + community-file probes",
    factors,
    remediationParts.length ? remediationParts.join("; ") + "." : undefined,
    { sampledRepositories: qualities.length, profileReadme: data.profileReadme.present },
  );
};

export const rule2_11CommunityScore: ScoreRule = (data) => {
  const response = Object.values(data.issues).flatMap((item) => item.responseHours);
  const latency = response.length ? clamp(100 - median(response) * 2) : 60;
  const mergeRate = ratio(data.search.prsMerged, Math.max(data.search.prsOpened, 1)) * 100;
  const review = saturatingScore(data.graphql.totalPullRequestReviewContributions, 0.06);
  const discussionsTotal = Object.values(data.issues).reduce((sum, item) => sum + item.discussions, 0);
  const discussions = saturatingScore(discussionsTotal, 0.08);
  const labeledValues = Object.values(data.issues).map((item) => item.labeledRatio).filter((value): value is number => typeof value === "number");
  const labeledMedian = labeledValues.length ? median(labeledValues) : null;
  return finishScore(
    "2.11",
    "Community score",
    "Maintainer response, merge rate, reviews, discussions, and issue triage.",
    "GraphQL repository issue batch + Search API",
    [
      factor("Issue response time", response.length ? `median first reply ${round(median(response), 1)}h across ${response.length} samples (30%)` : "no samples; neutral baseline credited (30%)", latency * 0.3, 30),
      factor("Own-PR merge rate", `${data.search.prsMerged}/${data.search.prsOpened} merged (25%)`, mergeRate * 0.25, 25),
      factor("Reviews written", `${data.graphql.totalPullRequestReviewContributions} review contributions (25%)`, review * 0.25, 25),
      factor("Discussions enabled", `${discussionsTotal} discussions across sampled repositories (20%)`, discussions * 0.2, 20),
      ...(labeledMedian !== null ? [factor("Issue triage (labels)", `median ${Math.round(labeledMedian * 100)}% of recent issues carry labels`, 0, 100)] : []),
    ],
    response.length === 0 || median(response) > 48 ? "Reply to open issues on your repositories; unanswered issues lower this score." : undefined,
    { responseSamples: response.length, medianResponseHours: median(response), discussions: discussionsTotal },
  );
};

export const rule2_12SecurityHygieneScore: ScoreRule = (data) => {
  const qualities = Object.entries(data.qualities);
  const count = Math.max(qualities.length, 1);
  const securityShare = qualities.filter(([, quality]) => quality.securityPolicyPresent).length / count;
  const ciEntries = Object.values(data.security).filter((entry) => entry.headCiState || entry.actionsRuns);
  const ciPassingShare = ciEntries.length
    ? ciEntries.filter((entry) =>
        entry.headCiState ? entry.headCiState === "SUCCESS" : (entry.actionsRuns?.total ?? 0) > 0 && entry.actionsRuns!.success === entry.actionsRuns!.total,
      ).length / ciEntries.length
    : null;
  const ciPresenceShare = qualities.filter(([, quality]) => quality.ciPresent).length / count;
  const licenseShare = qualities.filter(([, quality]) => quality.licensePresent).length / count;
  const ciEarned = ciPassingShare === null ? ciPresenceShare * 35 : (ciPresenceShare * 15) + (ciPassingShare * 20);
  return finishScore(
    "2.12",
    "Security hygiene score",
    "Public security posture: SECURITY.md policy, CI presence and pass rate, and license clarity.",
    "GraphQL statusCheckRollup + community probes + Actions runs",
    [
      factor("SECURITY.md policy", `${Math.round(securityShare * count)} of ${count} repositories`, securityShare * 40, 40),
      factor(
        "CI workflows",
        ciPassingShare === null
          ? `${Math.round(ciPresenceShare * count)} of ${count} repositories run workflows`
          : `${Math.round(ciPresenceShare * count)} of ${count} run CI · HEAD state passing on ${Math.round(ciPassingShare * ciEntries.length)} of ${ciEntries.length}`,
        ciEarned,
        35,
      ),
      factor("Clear licensing", `${Math.round(licenseShare * count)} of ${count} repositories`, licenseShare * 25, 25),
    ],
    securityShare === 0 ? "Add a SECURITY.md describing how to report vulnerabilities privately." : undefined,
    { sampledRepositories: count },
  );
};

export const rule2_13GivingBackScore: ScoreRule = (data) => {
  const externalIssues = data.search.authoredIssues.filter((item) => !item.repository.toLowerCase().startsWith(`${data.username.toLowerCase()}/`)).length;
  const externalPrPoints = saturatingScore(data.search.prsMergedExternal, 0.08) * 35;
  const externalIssuePoints = saturatingScore(externalIssues, 0.12) * 20;
  const contributedPoints = saturatingScore(data.graphql.repositoriesContributedToCount, 0.1) * 25;
  const sponsorPoints = saturatingScore(data.graphql.sponsoringCount, 0.2) * 20;
  return finishScore(
    "2.13",
    "Giving-back score",
    "Cross-repository merged PRs, third-party issues, contributed repositories, and sponsoring.",
    "Search + GraphQL",
    [
      factor("Merged PRs elsewhere", `${data.search.prsMergedExternal} merged in others' repos (35%)`, externalPrPoints, 35),
      factor("Issues filed elsewhere", `${externalIssues} third-party issues (20%)`, externalIssuePoints, 20),
      factor("Repositories contributed to", `${data.graphql.repositoriesContributedToCount} (25%)`, contributedPoints, 25),
      factor("Sponsoring maintainers", `${data.graphql.sponsoringCount} sponsorships (20%)`, sponsorPoints, 20),
    ],
    data.search.prsMergedExternal === 0 && externalIssues === 0 ? "Open at least one issue or PR against a project you use." : undefined,
    { externalIssues, externalMergedPrs: data.search.prsMergedExternal, contributedRepositories: data.graphql.repositoriesContributedToCount },
  );
};

export const rule2_14LongevityScore: ScoreRule = (data) => {
  const accountYears = daysBetween(data.user.created_at, data.now) / 365.25;
  const activeYears = data.graphql.contributionYears.length;
  let activeDays = 0;
  for (const day of data.graphql.calendar) if (day.contributionCount > 0) activeDays++;
  const activeRatio = ratio(activeDays, data.graphql.calendar.length);
  const previousYearTotal = data.graphql.previousYearTotalContributions;
  const yoyDeltaPercentValue = previousYearTotal !== null && previousYearTotal > 0
    ? Math.round(((data.graphql.totalContributions - previousYearTotal) / previousYearTotal) * 100)
    : null;
  const factors: ScoreFactor[] = yoyDeltaPercentValue === null
    ? [
        factor("Account age", `${Math.round(accountYears * 10) / 10} years`, saturatingScore(accountYears, 0.22) * 40, 40),
        factor("Active years", `${activeYears} years with contributions`, saturatingScore(activeYears, 0.45) * 30, 30),
        factor("Year-round activity", `${round(activeRatio * 100, 1)}% of days active`, activeRatio * 100 * 30, 30),
      ]
    : [
        factor("Account age", `${Math.round(accountYears * 10) / 10} years`, saturatingScore(accountYears, 0.22) * 28, 28),
        factor("Active years", `${activeYears} years with contributions`, saturatingScore(activeYears, 0.45) * 22, 22),
        factor("Year-round activity", `${round(activeRatio * 100, 1)}% of days active`, activeRatio * 100 * 20, 20),
        factor("Year-over-year momentum", `${data.graphql.totalContributions} vs ${previousYearTotal} (${yoyDeltaPercentValue >= 0 ? "+" : ""}${yoyDeltaPercentValue}%)`, clamp(50 + yoyDeltaPercentValue / 2) * 0.3, 30),
      ];
  return finishScore(
    "2.14",
    "Longevity score",
    "Log-scaled account age, active years, consistency, and year-over-year trajectory.",
    "User profile + contributionsCollection (current & previous year)",
    factors,
    undefined,
    { accountYears, activeYears, activeRatio, yoyDeltaPercent: yoyDeltaPercentValue },
  );
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
