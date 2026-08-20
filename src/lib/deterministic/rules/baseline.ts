import type { EngineData, RuleResult } from "../types";
import {
  daysBetween,
  gini,
  mean,
  median,
  ok,
  oauthOnly,
  ratio,
  round,
  sampled,
  sortedStats,
  unavailable,
  withStatus,
} from "./shared";

type BaselineRule = (data: EngineData) => RuleResult;

const allCommits = (data: EngineData) => Object.values(data.commits).flat();
const aggregateLanguages = (data: EngineData) => {
  const totals: Record<string, number> = {};
  for (const languages of Object.values(data.languages)) {
    for (const [language, bytes] of Object.entries(languages)) totals[language] = (totals[language] ?? 0) + bytes;
  }
  return totals;
};
const moderateSample = <T>(
  id: string,
  name: string,
  value: T,
  description: string,
  source: string,
  size: number,
  caveat = "Capped at the top 10 repositories by activity and impact.",
): RuleResult<T> => withStatus(id, name, "sampled", value, description, source, "moderate", caveat, size);

export const rule1_1AccountAge: BaselineRule = (data) => {
  const days = Math.floor(daysBetween(data.user.created_at, data.now));
  return ok("1.1", "Account age", { days, years: round(days / 365.25, 2) }, `Account created ${days.toLocaleString()} days ago.`, "GET /users/{u}");
};

export const rule1_2PublicRepoCount: BaselineRule = (data) =>
  ok("1.2", "Public repository count", data.user.public_repos, `${data.user.public_repos} public repositories reported by GitHub.`, "GET /users/{u}");

export const rule1_3OriginalForkRatio: BaselineRule = (data) => {
  const originals = data.repos.filter((repo) => !repo.fork).length;
  return ok("1.3", "Original vs fork ratio", {
    original: originals,
    forks: data.repos.length - originals,
    originalRatio: round(ratio(originals, data.repos.length), 4),
  }, `${originals} of ${data.repos.length} fetched repositories are original repositories.`, "GET /users/{u}/repos");
};

export const rule1_4ContributedForkFilter: BaselineRule = (data) => {
  const kept = Object.entries(data.forkComparisons)
    .filter(([, comparison]) => comparison.ahead_by > 0)
    .map(([repository, comparison]) => ({ repository, uniqueCommits: comparison.ahead_by }));
  if (!Object.keys(data.forkComparisons).length && data.repos.some((repo) => repo.fork)) {
    return unavailable("1.4", "Contributed-fork filter", "Fork compare data was unavailable or exhausted the call budget.", "GET /repos/{o}/{r}/compare/{base}...{head}", "expensive");
  }
  const forkLimit = data.sampled["fork-activity"]?.size ?? 5;
  return sampled("1.4", "Contributed-fork filter", kept, `${kept.length} sampled forks contain commits ahead of upstream.`, "GET /repos/{o}/{r}/compare/{base}...{head}", Object.keys(data.forkComparisons).length, `Capped at ${forkLimit} fork comparisons.`);
};

// Rules 1.5 and 1.6 share a single filter pass over non-fork repos.
export const rule1_5TotalStars: BaselineRule = (data) => {
  const total = data.repos.filter((repo) => !repo.fork).reduce((sum, repo) => sum + repo.stargazers_count, 0);
  return ok("1.5", "Total stars earned", total, `${total.toLocaleString()} stars across non-fork repositories.`, "GET /users/{u}/repos");
};

export const rule1_6TotalForks: BaselineRule = (data) => {
  const total = data.repos.filter((repo) => !repo.fork).reduce((sum, repo) => sum + repo.forks_count, 0);
  return ok("1.6", "Total forks of own repos", total, `${total.toLocaleString()} forks across original repositories.`, "GET /users/{u}/repos");
};

export const rule1_7FollowerFollowingRatio: BaselineRule = (data) => {
  const raw = data.user.followers / Math.max(data.user.following, 1);
  return ok("1.7", "Followers/following ratio", {
    raw: round(raw, 3),
    capped: round(Math.min(raw, 20), 3),
    cap: 20,
  }, `Ratio is ${round(raw, 2)}; scoring uses a published cap of 20.`, "GET /users/{u}");
};

// Rules 1.8 and 1.9 call aggregateLanguages once each (they run independently as BaselineRules;
// a shared pre-computation would require changing the runner signature, so we keep the existing
// pattern but cache the repeated Object.keys(totals).length call inside each rule).
export const rule1_8LanguageBreadth: BaselineRule = (data) => {
  const totals = aggregateLanguages(data);
  const distinctCount = Object.keys(totals).length;
  const totalBytes = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  const shares = totalBytes > 0 ? Object.values(totals).map((bytes) => ratio(bytes, totalBytes)) : [];
  const sumSquares = shares.reduce((sum, share) => sum + share ** 2, 0);
  const effectiveDiversity = sumSquares > 0 ? 1 / sumSquares : 0;
  return moderateSample("1.8", "Language breadth", {
    distinct: distinctCount,
    effectiveDiversity: round(effectiveDiversity, 2),
    totalBytes,
  }, `${distinctCount} languages appear in the sampled repositories.`, "GET /repos/{o}/{r}/languages", Object.keys(data.languages).length);
};

export const rule1_9LanguageMastery: BaselineRule = (data) => {
  const totals = aggregateLanguages(data);
  const totalBytes = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  const top = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([language, bytes]) => ({ language, bytes, share: round(ratio(bytes, totalBytes), 4) }));
  return moderateSample("1.9", "Language mastery", top, top.length ? `${top[0]!.language} is the largest sampled language by bytes.` : "No language bytes were available.", "GET /repos/{o}/{r}/languages", Object.keys(data.languages).length);
};

export const rule1_10TotalPublicContributions: BaselineRule = (data) =>
  ok("1.10", "Public contributions", data.graphql.totalContributions, `${data.graphql.totalContributions.toLocaleString()} public contributions in the last calendar year; this includes contribution types beyond commits.`, "GraphQL contributionsCollection");

const searchStatus = (data: EngineData) => Object.keys(data.unavailable).some((key) => key.startsWith("search-"));

export const rule1_11PullRequests: BaselineRule = (data) => searchStatus(data)
  ? unavailable("1.11", "Pull requests opened/merged", "Search quota or GitHub Search data was unavailable.", "GET /search/issues", "cheap")
  : ok("1.11", "Pull requests opened/merged", { opened: data.search.prsOpened, merged: data.search.prsMerged }, `${data.search.prsMerged} of ${data.search.prsOpened} authored pull requests are merged.`, "GET /search/issues", "cheap");

export const rule1_12Issues: BaselineRule = (data) => searchStatus(data)
  ? unavailable("1.12", "Issues opened/closed", "Search quota or GitHub Search data was unavailable.", "GET /search/issues", "cheap")
  : ok("1.12", "Issues opened/closed", { opened: data.search.issuesOpened, closed: data.search.issuesClosed }, `${data.search.issuesClosed} of ${data.search.issuesOpened} authored issues are closed.`, "GET /search/issues", "cheap");

export const rule1_13ReviewCount: BaselineRule = (data) =>
  ok("1.13", "Pull request review count", data.graphql.totalPullRequestReviewContributions, `${data.graphql.totalPullRequestReviewContributions} public review contributions in the GraphQL window.`, "GraphQL totalPullRequestReviewContributions");

const streaks = (data: EngineData) => {
  const days = [...data.graphql.calendar].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let running = 0;
  for (const day of days) {
    running = day.contributionCount > 0 ? running + 1 : 0;
    longest = Math.max(longest, running);
  }
  let current = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index]!.contributionCount <= 0) break;
    current += 1;
  }
  return { longest, current };
};

export const rule1_14Streaks: BaselineRule = (data) => {
  const value = streaks(data);
  return ok("1.14", "Longest and current contribution streak", value, `Longest active-contribution streak: ${value.longest} days; current: ${value.current} days.`, "GraphQL contributionCalendar");
};

export const rule1_15ActiveDaysRatio: BaselineRule = (data) => {
  const active = data.graphql.calendar.filter((day) => day.contributionCount > 0).length;
  return ok("1.15", "Active days ratio", {
    activeDays: active,
    observedDays: data.graphql.calendar.length,
    ratio: round(ratio(active, data.graphql.calendar.length), 4),
  }, `${active} active contribution days in the observed year.`, "GraphQL contributionCalendar");
};

// sortedStats sorts once and returns median + p25 + p75 + p90 in a single pass.
export const rule1_16RepoSizeDistribution: BaselineRule = (data) => {
  const sizes = data.repos.map((repo) => repo.size);
  const stats = sortedStats(sizes);
  return ok("1.16", "Repository size distribution", {
    medianKb: round(stats.median, 1),
    p25Kb: stats.p25,
    p75Kb: stats.p75,
    p90Kb: stats.p90,
  }, `Median repository size is ${round(stats.median, 1).toLocaleString()} KB.`, "GET /users/{u}/repos");
};

export const rule1_17FirstCommitDelay: BaselineRule = (data) => {
  const values = data.topRepos.flatMap((repo) => {
    const commits = data.commits[repo.full_name] ?? [];
    const oldest = commits.at(-1)?.commit.author?.date;
    return oldest ? [{ repository: repo.full_name, days: round(daysBetween(repo.created_at, oldest), 2) }] : [];
  });
  // Cache the mapped days array and mean so the description string doesn't recompute.
  const days = values.map((item) => item.days);
  const avgDays = round(mean(days), 2);
  return moderateSample("1.17", "Time to first commit after repo creation", {
    averageDays: avgDays,
    repositories: values,
  }, `Best-effort average is ${round(avgDays, 1)} days.`, "GET /repos/{o}/{r}/commits", values.length, "Uses the oldest commit inside each fetched 100-commit window; rewritten history can distort the result.");
};

export const rule1_18OrgMemberships: BaselineRule = (data) =>
  ok("1.18", "Public organization memberships", { count: data.orgs.length, organizations: data.orgs.map((org) => org.login) }, `${data.orgs.length} public organization memberships are visible.`, "GET /users/{u}/orgs");

export const rule1_19ProfileReadme: BaselineRule = (data) =>
  ok("1.19", "Profile README presence", { present: data.profileReadme.present, bytes: data.profileReadme.bytes }, data.profileReadme.present ? `Profile README is present (${data.profileReadme.bytes.toLocaleString()} bytes).` : "No public profile README was found.", "GET /repos/{u}/{u}/readme");

export const rule1_20PinnedRepositories: BaselineRule = (data) => {
  const stars = data.graphql.pinnedItems.reduce((sum, item) => sum + item.stargazerCount, 0);
  return ok("1.20", "Pinned repositories", { count: data.graphql.pinnedItems.length, totalStars: stars, items: data.graphql.pinnedItems }, `${data.graphql.pinnedItems.length} pinned repositories with ${stars} combined stars.`, "GraphQL user.pinnedItems");
};

// O(n) max-find replaces the O(n log n) sort-to-find-max.
export const rule1_21PublicGists: BaselineRule = (data) => {
  const latest = data.gists.length
    ? data.gists.reduce((max, g) => (g.updated_at > max.updated_at ? g : max), data.gists[0]!)
    : undefined;
  return moderateSample("1.21", "Public gists", {
    apiCount: data.user.public_gists,
    fetched: data.gists.length,
    latestUpdatedAt: latest?.updated_at ?? null,
    comments: data.gists.reduce((sum, gist) => sum + gist.comments, 0),
  }, `${data.user.public_gists} public gists reported by GitHub.`, "GET /users/{u}/gists", data.gists.length, "The detail sample is capped at 100 public gists.");
};

export const rule1_22StarredCount: BaselineRule = (data) =>
  ok("1.22", "Starred repository count", data.graphql.starredRepositoriesCount, `${data.graphql.starredRepositoriesCount} repositories starred.`, "GraphQL user.starredRepositories");

export const rule1_23WatchingCount: BaselineRule = (data) => {
  const value = { fetched: data.subscriptions.length, lowerBound: data.subscriptions.length === 100 };
  return data.subscriptions.length === 100
    ? moderateSample("1.23", "Watching count", value, "At least 100 watched repositories; the collection hit the per-run page cap.", "GET /users/{u}/subscriptions", 100, "Only the first page is fetched.")
    : ok("1.23", "Watching count", value, `${data.subscriptions.length} watched repositories.`, "GET /users/{u}/subscriptions");
};

export const rule1_24ProfileCompleteness: BaselineRule = (data) => {
  const fields = {
    blog: Boolean(data.user.blog),
    location: Boolean(data.user.location),
    company: Boolean(data.user.company),
    bio: Boolean(data.user.bio),
    twitter: Boolean(data.user.twitter_username),
    hireable: data.user.hireable === true,
  };
  const count = Object.values(fields).filter(Boolean).length;
  return ok("1.24", "Profile completeness", { count, total: 6, fields }, `${count} of 6 public profile fields are populated or enabled.`, "GET /users/{u}");
};

export const rule1_25ReleaseCadence: BaselineRule = (data) => {
  const repoValues = Object.entries(data.releases).map(([repository, releases]) => {
    const dates = releases.flatMap((release) => release.published_at ? [new Date(release.published_at).getTime()] : []).sort((a, b) => a - b);
    const intervals = dates.slice(1).map((value, index) => (value - dates[index]!) / 86_400_000);
    return {
      repository,
      count: releases.length,
      medianCadenceDays: round(median(intervals), 1),
      latestRelease: dates.length ? new Date(dates.at(-1)!).toISOString() : null,
    };
  });
  return moderateSample("1.25", "Release count and cadence", repoValues, `${repoValues.reduce((sum, item) => sum + item.count, 0)} releases across the sampled repositories.`, "GET /repos/{o}/{r}/releases", repoValues.length);
};

export const rule1_26ReleaseDownloads: BaselineRule = (data) => {
  const byRepo = Object.entries(data.releases).map(([repository, releases]) => ({
    repository,
    downloads: releases.flatMap((release) => release.assets).reduce((sum, asset) => sum + asset.download_count, 0),
  }));
  return moderateSample("1.26", "Release asset downloads", {
    total: byRepo.reduce((sum, item) => sum + item.downloads, 0),
    repositories: byRepo,
  }, `${byRepo.reduce((sum, item) => sum + item.downloads, 0).toLocaleString()} sampled release-asset downloads.`, "GET /repos/{o}/{r}/releases", byRepo.length);
};

export const rule1_27IssueBacklogHealth: BaselineRule = (data) => {
  const byRepo = Object.entries(data.issues).map(([repository, item]) => ({
    repository,
    open: item.open,
    closed: item.closed,
    openClosedRatio: round(item.open / Math.max(item.closed, 1), 3),
  }));
  return moderateSample("1.27", "Issue backlog health", byRepo, `Issue-only backlog ratios computed for ${byRepo.length} repositories.`, "GraphQL repository.issues", byRepo.length);
};

// Single reduce pass accumulates both archived and disabled counts.
export const rule1_28ArchivedDisabledRatio: BaselineRule = (data) => {
  let archived = 0;
  let disabled = 0;
  for (const repo of data.repos) {
    if (repo.archived) archived++;
    if (repo.disabled) disabled++;
  }
  return ok("1.28", "Archived and disabled ratio", {
    archived,
    disabled,
    archivedRatio: round(ratio(archived, data.repos.length), 4),
    disabledRatio: round(ratio(disabled, data.repos.length), 4),
  }, `${archived} archived and ${disabled} disabled repositories.`, "GET /users/{u}/repos");
};

export const rule1_29TemplateRepos: BaselineRule = (data) => {
  const repos = data.repos.filter((repo) => repo.is_template).map((repo) => repo.full_name);
  return ok("1.29", "Template repositories", { count: repos.length, repositories: repos }, `${repos.length} repositories are marked as templates.`, "GET /users/{u}/repos");
};

export const rule1_30HomepageRatio: BaselineRule = (data) => {
  const count = data.repos.filter((repo) => Boolean(repo.homepage?.trim())).length;
  return ok("1.30", "Repository homepage ratio", { count, ratio: round(ratio(count, data.repos.length), 4) }, `${count} repositories expose a homepage or docs link.`, "GET /users/{u}/repos");
};

export const rule1_31YearsActive: BaselineRule = (data) => {
  const years = [...data.graphql.contributionYears].sort((a, b) => a - b);
  const span = years.length ? years.at(-1)! - years[0]! + 1 : 0;
  return ok("1.31", "Years active", { years, activeYearCount: years.length, span }, `${years.length} contribution years across a ${span}-year span.`, "GraphQL contributionsCollection.contributionYears");
};

export const rule1_32SponsorCounts: BaselineRule = (data) =>
  ok("1.32", "Sponsor counts", { sponsoring: data.graphql.sponsoringCount, sponsors: data.graphql.sponsorCount }, `Sponsors ${data.graphql.sponsoringCount}; publicly visible sponsors: ${data.graphql.sponsorCount}.`, "GraphQL user.sponsoring and user.sponsors");

export const rule1_33OrgRoleDepth: BaselineRule = () =>
  oauthOnly("1.33", "Organization role depth", "GET /user/memberships/orgs");

// Single reduce pass accumulates wiki, pages, and discussions counts.
export const rule1_34CommunityFeatures: BaselineRule = (data) => {
  const total = data.repos.length;
  let wiki = 0;
  let pages = 0;
  let discussions = 0;
  for (const repo of data.repos) {
    if (repo.has_wiki) wiki++;
    if (repo.has_pages) pages++;
    if (repo.has_discussions) discussions++;
  }
  const value = {
    wikiRatio: round(ratio(wiki, total), 4),
    pagesRatio: round(ratio(pages, total), 4),
    discussionsRatio: round(ratio(discussions, total), 4),
  };
  return ok("1.34", "Wiki, Pages and Discussions enabled", value, "Repository documentation and community feature ratios.", "GET /users/{u}/repos");
};

export const rule1_35GpgRatio: BaselineRule = (data) => {
  const commits = allCommits(data);
  const verified = commits.filter((commit) => commit.commit.verification.verified).length;
  return moderateSample("1.35", "GPG signature ratio", {
    verified,
    sampledCommits: commits.length,
    ratio: round(ratio(verified, commits.length), 4),
  }, `${verified} of ${commits.length} sampled commits are verified.`, "GET /repos/{o}/{r}/commits", commits.length, "Uses at most 100 authored commits per sampled repository.");
};

export const rule1_36BranchProtection: BaselineRule = (data) => {
  const values = data.topRepos.map((repo) => {
    const branch = (data.branches[repo.full_name] ?? []).find((item) => item.name === repo.default_branch);
    return { repository: repo.full_name, defaultBranch: repo.default_branch, protected: branch?.protected ?? false, available: Boolean(branch) };
  });
  const available = values.filter((item) => item.available);
  const protectedCount = available.filter((item) => item.protected).length;
  return moderateSample("1.36", "Default branch protection", {
    protected: protectedCount,
    checked: available.length,
    ratio: round(ratio(protectedCount, available.length), 4),
    repositories: values,
  }, `${protectedCount} of ${available.length} available default branches are protected.`, "GET /repos/{o}/{r}/branches", available.length);
};

export const rule1_37StarGini: BaselineRule = (data) => {
  const value = round(gini(data.repos.filter((repo) => !repo.fork).map((repo) => repo.stargazers_count)), 4);
  return ok("1.37", "Star concentration (Gini)", value, `Star-distribution Gini coefficient is ${value}.`, "GET /users/{u}/repos");
};

// Single iteration with for-of avoids the intermediate flattened array from .flat().flatMap().
export const rule1_38ForkActivity: BaselineRule = (data) => {
  const pushed: string[] = [];
  for (const repos of Object.values(data.forks)) {
    for (const repo of repos) {
      if (repo.pushed_at) pushed.push(repo.pushed_at);
    }
  }
  const ages = pushed.map((date) => daysBetween(date, data.now));
  const medianAge = median(ages);
  const forkLimit = data.sampled["fork-activity"]?.size ?? 5;
  return moderateSample("1.38", "Fork activity of own repos", {
    sampledForks: pushed.length,
    medianDaysSincePush: round(medianAge, 1),
    medianPushedAt: pushed.length ? new Date(data.now.getTime() - medianAge * 86_400_000).toISOString() : null,
  }, pushed.length ? `Median sampled fork was pushed ${round(medianAge, 1)} days ago.` : "No fork activity timestamps were available.", "GET /repos/{o}/{r}/forks", pushed.length, `Uses forks from the ${forkLimit} most-forked owned repositories.`);
};

export const baselineRules: BaselineRule[] = [
  rule1_1AccountAge,
  rule1_2PublicRepoCount,
  rule1_3OriginalForkRatio,
  rule1_4ContributedForkFilter,
  rule1_5TotalStars,
  rule1_6TotalForks,
  rule1_7FollowerFollowingRatio,
  rule1_8LanguageBreadth,
  rule1_9LanguageMastery,
  rule1_10TotalPublicContributions,
  rule1_11PullRequests,
  rule1_12Issues,
  rule1_13ReviewCount,
  rule1_14Streaks,
  rule1_15ActiveDaysRatio,
  rule1_16RepoSizeDistribution,
  rule1_17FirstCommitDelay,
  rule1_18OrgMemberships,
  rule1_19ProfileReadme,
  rule1_20PinnedRepositories,
  rule1_21PublicGists,
  rule1_22StarredCount,
  rule1_23WatchingCount,
  rule1_24ProfileCompleteness,
  rule1_25ReleaseCadence,
  rule1_26ReleaseDownloads,
  rule1_27IssueBacklogHealth,
  rule1_28ArchivedDisabledRatio,
  rule1_29TemplateRepos,
  rule1_30HomepageRatio,
  rule1_31YearsActive,
  rule1_32SponsorCounts,
  rule1_33OrgRoleDepth,
  rule1_34CommunityFeatures,
  rule1_35GpgRatio,
  rule1_36BranchProtection,
  rule1_37StarGini,
  rule1_38ForkActivity,
];

export const runBaselineRules = (data: EngineData) =>
  Object.fromEntries(baselineRules.map((rule) => {
    const result = rule(data);
    return [result.id, result];
  }));
