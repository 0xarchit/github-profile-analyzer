import type { EngineData, SignalResult } from "../types";
import {
  coefficientOfVariation,
  daysBetween,
  entropy,
  hoursBetween,
  jaccard,
  mean,
  median,
  ok,
  ratio,
  round,
  sampled,
  signal,
  tokenize,
  unavailable,
  withStatus,
} from "./shared";

type SignalRule = (data: EngineData) => SignalResult;

// WeakMap memoizes allCommits so rules 3.4, 3.5, 3.7, 3.35 each share one flatMap.
const allCommitsCache = new WeakMap<EngineData, Array<{ repository: string; commit: EngineData["commits"][string][number] }>>();
const allCommits = (data: EngineData) => {
  if (!allCommitsCache.has(data)) {
    allCommitsCache.set(
      data,
      Object.entries(data.commits).flatMap(([repository, commits]) => commits.map((commit) => ({ repository, commit }))),
    );
  }
  return allCommitsCache.get(data)!;
};

const punchBuckets = (data: EngineData) => {
  const buckets = Array.from({ length: 168 }, () => 0);
  for (const cards of Object.values(data.punchCards)) {
    for (const [day, hour, count] of cards) {
      if (typeof day === "number" && day >= 0 && day <= 6 && typeof hour === "number" && hour >= 0 && hour <= 23) {
        buckets[day * 24 + hour] = (buckets[day * 24 + hour] ?? 0) + (typeof count === "number" ? count : 0);
      }
    }
  }
  return buckets;
};

const sampledSignal = <T>(
  id: string,
  name: string,
  value: T,
  description: string,
  source: string,
  flagged: boolean,
  sampleSize: number,
  caveat: string,
  cost: "moderate" | "expensive" = "moderate",
) => signal(withStatus(id, name, "sampled", value, description, source, cost, caveat, sampleSize), flagged);

// WeakMap memoizes rollingBursts so rules 3.2 and 3.3 each share one O(n log n + n) computation.
const rollingBurstsCache = new WeakMap<EngineData, Array<{ date: string; count: number; rolling7: number; z: number }>>();
const rollingBursts = (data: EngineData) => {
  if (!rollingBurstsCache.has(data)) {
    const values = [...data.graphql.calendar].sort((a, b) => a.date.localeCompare(b.date));
    const rolling = values.map((_, index) => values.slice(Math.max(0, index - 6), index + 1).reduce((sum, day) => sum + day.contributionCount, 0));
    const average = mean(rolling);
    const deviation = Math.sqrt(mean(rolling.map((value) => (value - average) ** 2)));
    rollingBurstsCache.set(
      data,
      values
        .map((day, index) => ({ date: day.date, count: day.contributionCount, rolling7: rolling[index]!, z: deviation ? (rolling[index]! - average) / deviation : 0 }))
        .filter((item) => item.z > 3),
    );
  }
  return rollingBurstsCache.get(data)!;
};

export const rule3_1CommitHourEntropy: SignalRule = (data) => {
  const buckets = punchBuckets(data);
  const value = { entropyBits: round(entropy(buckets), 3), normalized: round(ratio(entropy(buckets), Math.log2(168)), 4), commits: buckets.reduce((sum, count) => sum + count, 0) };
  return signal(ok("3.1", "Commit-hour entropy", value, `Normalized hour entropy is ${value.normalized}; low values mean activity is concentrated in few weekly time slots.`, "derived from GraphQL commit timestamps"), value.commits >= 30 && value.normalized < 0.3);
};

export const rule3_2BurstDetection: SignalRule = (data) => {
  const bursts = rollingBursts(data);
  return signal(ok("3.2", "Contribution burst detection", bursts, `${bursts.length} rolling seven-day windows exceed z > 3.`, "GraphQL contributionCalendar"), bursts.length > 0);
};

export const rule3_3DormancyThenBurst: SignalRule = (data) => {
  const days = [...data.graphql.calendar].sort((a, b) => a.date.localeCompare(b.date));
  const burstDates = new Set(rollingBursts(data).map((item) => item.date));
  let dormant = 0;
  const matches: Array<{ date: string; dormantDays: number }> = [];
  for (const day of days) {
    if (day.contributionCount === 0) dormant += 1;
    else {
      if (dormant > 60 && burstDates.has(day.date)) matches.push({ date: day.date, dormantDays: dormant });
      dormant = 0;
    }
  }
  return signal(ok("3.3", "Dormancy followed by burst", matches, `${matches.length} long-dormancy-to-burst transitions found; this is context, never an accusation.`, "GraphQL contributionCalendar"), matches.length > 0);
};

export const rule3_4TimestampRegularity: SignalRule = (data) => {
  const groups = new Map<string, number[]>();
  for (const { repository, commit } of allCommits(data)) {
    const date = commit.commit.author?.date;
    if (!date) continue;
    const key = `${repository}:${date.slice(0, 10)}`;
    // Mutable push: O(1) per insertion instead of spread-append O(n).
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(new Date(date).getTime());
  }
  const commits = allCommits(data);
  const candidates = [...groups.entries()].flatMap(([group, values]) => {
    if (values.length < 4) return [];
    values.sort((a, b) => a - b);
    const intervals = values.slice(1).map((value, index) => (value - values[index]!) / 1_000);
    return [{ group, commits: values.length, intervalCv: round(coefficientOfVariation(intervals), 4), medianSeconds: round(median(intervals), 1) }];
  });
  const flagged = candidates.filter((item) => item.intervalCv < 0.05 && item.medianSeconds > 0);
  return sampledSignal("3.4", "Timestamp regularity", candidates, `${flagged.length} sampled repo-day groups have near-constant intervals.`, "GET /repos/{o}/{r}/commits", flagged.length > 0, commits.length, "Default-branch history can be rewritten by merge and rebase workflows.");
};

export const rule3_5CommitMessageDiversity: SignalRule = (data) => {
  const messages = allCommits(data).map(({ commit }) => commit.commit.message.trim().toLowerCase());
  const distinct = new Set(messages).size;
  const value = { messages: messages.length, distinct, distinctRatio: round(ratio(distinct, messages.length), 4) };
  return sampledSignal("3.5", "Commit message diversity", value, `${distinct} distinct messages among ${messages.length} sampled commits.`, "GET /repos/{o}/{r}/commits", messages.length >= 20 && value.distinctRatio <= 0.1, messages.length, "At most 100 authored commits per sampled repository.");
};

export const rule3_6TrivialCommitRatio: SignalRule = (data) => {
  const commits = Object.values(data.commitDetails);
  const trivial = commits.filter((commit) => (commit.stats?.total ?? Number.POSITIVE_INFINITY) < 3).length;
  const value = { trivial, sampled: commits.length, ratio: round(ratio(trivial, commits.length), 4) };
  if (!commits.length) return signal(unavailable("3.6", "Empty or trivial commit ratio", "Per-commit diff samples were unavailable or skipped by budget.", "GET /repos/{o}/{r}/commits/{sha}", "expensive"), false);
  return signal(sampled("3.6", "Empty or trivial commit ratio", value, `${trivial} of ${commits.length} sampled commits change fewer than three lines.`, "GET /repos/{o}/{r}/commits/{sha}", commits.length, "At most 100 commits across the top three repositories."), value.ratio > 0.5 && commits.length >= 10);
};

export const rule3_7AuthoredCommittedGap: SignalRule = (data) => {
  const gaps = allCommits(data).flatMap(({ commit }) => {
    const author = commit.commit.author?.date;
    const committer = commit.commit.committer?.date;
    const merge = (commit.parents?.length ?? 0) > 1;
    return author && committer && !merge ? [hoursBetween(author, committer)] : [];
  });
  const large = gaps.filter((gap) => gap > 24 * 7).length;
  const value = { sampled: gaps.length, medianHours: round(median(gaps), 2), overSevenDaysRatio: round(ratio(large, gaps.length), 4) };
  return sampledSignal("3.7", "Authored vs committed date gap", value, "Best-effort date-gap signal after excluding visible merge commits.", "GET /repos/{o}/{r}/commits", gaps.length >= 20 && value.overSevenDaysRatio > 0.5, gaps.length, "Squash, rebase, force-push, and rewritten history can create normal large gaps.");
};

export const rule3_8ForkOnlyContributor: SignalRule = (data) => {
  const forks = data.repos.filter((repo) => repo.fork).length;
  const contributed = Object.values(data.forkComparisons).filter((item) => item.ahead_by > 0).length;
  const weightedLines = Object.entries(data.forkComparisons).map(([repository, comparison]) => ({ repository, uniqueCommits: comparison.ahead_by }));
  const value = { forks, sampledComparisons: Object.keys(data.forkComparisons).length, contributed, contributedRatio: round(ratio(contributed, forks), 4), weightedLines };
  const forkLimit = data.sampled["fork-activity"]?.size ?? 5;
  return sampledSignal("3.8", "Fork-only contribution pattern", value, `${contributed} sampled forks contain commits ahead of upstream.`, "compare endpoint + commit details", forks >= 5 && contributed === 0, Object.keys(data.forkComparisons).length, `Fork comparison is capped at ${forkLimit} repositories.`, "expensive");
};

export const rule3_9RepoCreationClustering: SignalRule = (data) => {
  const dates = data.repos
    .map((repo) => ({ repository: repo.full_name, time: new Date(repo.created_at).getTime() }))
    .sort((a, b) => a.time - b.time);
  let maxCluster: typeof dates = [];
  let left = 0;
  const windowMs = 3 * 86_400_000;
  for (let right = 0; right < dates.length; right += 1) {
    while (dates[right]!.time - dates[left]!.time > windowMs) {
      left += 1;
    }
    const currentLen = right - left + 1;
    if (currentLen > maxCluster.length) {
      maxCluster = dates.slice(left, right + 1);
    }
  }
  return signal(
    ok("3.9", "Repository creation clustering", { maxThreeDayCluster: maxCluster.length, repositories: maxCluster.map((item) => item.repository) }, `Largest three-day creation cluster contains ${maxCluster.length} repositories.`, "GET /users/{u}/repos"),
    maxCluster.length >= 10,
  );
};

export const rule3_10MutualStarCluster: SignalRule = () =>
  signal(
    unavailable("3.10", "Mutual star cluster", "Timestamped stargazer events are restricted by GitHub API without fine-grained repository permissions.", "stargazers API", "cheap"),
    false,
  );

export const rule3_11FollowerContentCorrelation: SignalRule = (data) => {
  if (data.snapshots.length < 2) return signal(unavailable("3.11", "Follower growth vs content correlation", "Historical follower counts do not exist in GitHub's API; at least two in-memory analysis snapshots are required.", "Internal analysis snapshots", "cheap"), false);
  const changes = data.snapshots.slice(1).map((snapshot, index) => {
    const previous = data.snapshots[index]!;
    return { at: snapshot.at, followerDelta: snapshot.followers - previous.followers, starDelta: snapshot.stars - previous.stars };
  });
  const flagged = changes.filter((item) => item.followerDelta >= 100 && item.starDelta <= 0);
  return signal(ok("3.11", "Follower growth vs content correlation", changes, `${flagged.length} stored intervals show follower growth without star growth.`, "Internal analysis snapshots"), flagged.length > 0);
};

export const rule3_12PushWithoutContent: SignalRule = (data) => {
  const repos = data.topRepos.filter((repo) => repo.pushed_at && daysBetween(repo.pushed_at, data.now) <= 30 && (data.commits[repo.full_name] ?? []).length === 0).map((repo) => repo.full_name);
  return sampledSignal("3.12", "Push without authored content", repos, `${repos.length} recently pushed sampled repositories contain no commits authored by the analyzed user in the fetched branch window.`, "repo pushed_at + commits", repos.length > 0, data.topRepos.length, "Can result from other contributors, force-pushes, rebases, or branch selection.");
};

export const rule3_13GhostRepos: SignalRule = (data) => {
  const repos = data.topRepos.filter((repo) => repo.size <= 20 && (data.commits[repo.full_name] ?? []).length <= 1).map((repo) => repo.full_name);
  const value = { repositories: repos, ratio: round(ratio(repos.length, data.topRepos.length), 4) };
  return sampledSignal("3.13", "Ghost repository detection", value, `${repos.length} sampled repositories are tiny and have at most one visible authored commit.`, "repo metadata + commits", value.ratio > 0.3 && data.topRepos.length >= 5, data.topRepos.length, "Top 10 repositories only.");
};

// Single pass over buckets using index arithmetic replaces slice().concat() intermediate arrays.
export const rule3_14WeekendRatio: SignalRule = (data) => {
  const buckets = punchBuckets(data);
  let weekend = 0;
  let total = 0;
  for (let i = 0; i < buckets.length; i++) {
    const count = buckets[i]!;
    total += count;
    // Weekend = Sunday (0–23) or Saturday (144–167).
    if (i < 24 || i >= 144) weekend += count;
  }
  return signal(ok("3.14", "Weekend vs weekday ratio", { weekend, weekday: total - weekend, weekendRatio: round(ratio(weekend, total), 4) }, `${round(ratio(weekend, total) * 100, 1)}% of sampled punch-card activity is on weekends.`, "derived from GraphQL commit timestamps"), false);
};

export const rule3_15PeakProductivityWindow: SignalRule = (data) => {
  const buckets = punchBuckets(data);
  const peak = buckets.reduce((best, count, index) => count > best.count ? { index, count } : best, { index: 0, count: 0 });
  return signal(ok("3.15", "Peak productivity window", { day: Math.floor(peak.index / 24), hour: peak.index % 24, commits: peak.count }, `Peak sampled slot is day ${Math.floor(peak.index / 24)}, hour ${peak.index % 24} UTC.`, "derived from GraphQL commit timestamps"), false);
};

export const rule3_16CollaboratorNetwork: SignalRule = (data) => {
  const collaborators = new Map<string, { repositories: Set<string>; contributions: number }>();
  for (const [repository, contributors] of Object.entries(data.contributors)) {
    for (const contributor of contributors) {
      if (!contributor.login || contributor.login.toLowerCase() === data.username.toLowerCase()) continue;
      const item = collaborators.get(contributor.login) ?? { repositories: new Set<string>(), contributions: 0 };
      item.repositories.add(repository);
      item.contributions += contributor.contributions;
      collaborators.set(contributor.login, item);
    }
  }
  const nodes = [...collaborators.entries()].map(([login, item]) => ({ login, repositories: [...item.repositories], contributions: item.contributions })).sort((a, b) => b.contributions - a.contributions).slice(0, 15);
  return sampledSignal("3.16", "Cross-repo collaborator network", nodes, `${nodes.length} top collaborators found in sampled contributor lists.`, "GET /repos/{o}/{r}/contributors", false, data.topRepos.length, "Contributor lists are cached by GitHub and sampled from top repositories.");
};

export const rule3_17MaintainerResponseLatency: SignalRule = (data) => {
  const hours = Object.values(data.issues).flatMap((item) => item.responseHours);
  const value = { samples: hours.length, medianHours: round(median(hours), 2), p90Hours: round([...hours].sort((a, b) => a - b)[Math.max(0, Math.ceil(hours.length * 0.9) - 1)] ?? 0, 2) };
  return sampledSignal("3.17", "Maintainer issue response latency", value, hours.length ? `Median first response is ${value.medianHours} hours.` : "No first-response samples were available.", "GraphQL repository issues batch", hours.length >= 5 && value.medianHours > 168, hours.length, "Recent 25 issues per sampled repository.");
};

export const rule3_18LicenseReadmeCompleteness: SignalRule = (data) => {
  const repos = Object.entries(data.qualities).map(([repository, quality]) => {
    const image = /!\[|<img/i.test(quality.readmeText);
    const install = /(^|\n)#{1,4}\s*(install|setup|usage)\b/i.test(quality.readmeText);
    const score = Number(quality.licensePresent) * 25 + Number(quality.readmeBytes > 300) * 35 + Number(image) * 20 + Number(install) * 20;
    return { repository, score, license: quality.licensePresent, readmeBytes: quality.readmeBytes, image, install };
  });
  const average = mean(repos.map((repo) => repo.score));
  return sampledSignal("3.18", "License and README completeness", { average: round(average), repositories: repos }, `Average deterministic completeness is ${round(average)} / 100.`, "contents API", repos.length >= 3 && average < 40, repos.length, "Top 10 repositories only.");
};

export const rule3_19CoordinatedStarBursts: SignalRule = () =>
  signal(
    unavailable("3.19", "Coordinated star bursts", "Timestamped stargazer events are restricted by GitHub API without fine-grained repository permissions.", "stargazers API", "cheap"),
    false,
  );

// for...of over the Set directly avoids spreading Set to array for filtering.
export const rule3_20MutualFollowRatio: SignalRule = (data) => {
  const followers = new Set(data.followers.map((login) => login.toLowerCase()));
  const following = new Set(data.following.map((login) => login.toLowerCase()));
  const mutual: string[] = [];
  for (const login of followers) if (following.has(login)) mutual.push(login);
  const value = { followersSampled: followers.size, followingSampled: following.size, mutual: mutual.length, ratio: round(ratio(mutual.length, Math.min(followers.size, following.size)), 4) };
  return sampledSignal("3.20", "Mutual-follow ratio", value, `${mutual.length} mutual follows in capped lists.`, "followers + following", Math.min(followers.size, following.size) >= 100 && value.ratio > 0.8, followers.size + following.size, "Each list is capped at 300 accounts.");
};

export const rule3_21TimezoneInstability: SignalRule = () =>
  signal(unavailable("3.21", "Commit timezone instability", "GitHub REST commit timestamps are normalized ISO timestamps and do not reliably preserve the original git timezone offset; the research assumption cannot be implemented truthfully from this API response.", "GET /repos/{o}/{r}/commits", "moderate"), false);

export const rule3_22UniformDailyOutput: SignalRule = (data) => {
  const days = [...data.graphql.calendar].sort((a, b) => a.date.localeCompare(b.date));
  let activeRun: number[] = [];
  const runs: number[][] = [];
  for (const day of days) {
    if (day.contributionCount > 0) activeRun.push(day.contributionCount);
    else {
      if (activeRun.length >= 30) runs.push(activeRun);
      activeRun = [];
    }
  }
  if (activeRun.length >= 30) runs.push(activeRun);
  const uniform = runs.filter((run) => coefficientOfVariation(run) < 0.1);
  return signal(ok("3.22", "Suspiciously uniform daily output", { qualifyingRuns: runs.length, uniformRuns: uniform.map((run) => ({ days: run.length, coefficientOfVariation: round(coefficientOfVariation(run), 4) })) }, `${uniform.length} active runs of 30+ days have near-zero output variance.`, "GraphQL contributionCalendar"), uniform.length > 0);
};

export const rule3_23SelfMergeRatio: SignalRule = (data) => {
  const merged = data.graphql.pullRequests.filter((pr) => pr.mergedAt);
  const self = merged.filter((pr) => pr.mergedBy?.login.toLowerCase() === data.username.toLowerCase()).length;
  const value = { merged: merged.length, selfMerged: self, ratio: round(ratio(self, merged.length), 4) };
  return signal(ok("3.23", "Self-merge ratio", value, `${self} of ${merged.length} sampled merged PRs were merged by the author; this often describes a solo workflow.`, "GraphQL user.pullRequests"), merged.length >= 10 && value.ratio >= 0.9);
};

export const rule3_24PrMergeLatency: SignalRule = (data) => {
  const merged = data.graphql.pullRequests.filter((pr) => pr.mergedAt);
  const hours = merged.map((pr) => hoursBetween(pr.createdAt, pr.mergedAt!));
  const self = merged.filter((pr) => pr.mergedBy?.login.toLowerCase() === data.username.toLowerCase()).length;
  const value = { samples: hours.length, medianHours: round(median(hours), 2), selfMergeRatio: round(ratio(self, merged.length), 4) };
  return signal(ok("3.24", "Pull request merge latency", value, `Median sampled PR merge latency is ${value.medianHours} hours.`, "GraphQL user.pullRequests"), hours.length >= 10 && value.medianHours < 0.25 && value.selfMergeRatio > 0.8);
};

export const rule3_25ReviewDepth: SignalRule = (data) => {
  const reviewed = new Set(data.graphql.reviews.map((review) => review.title)).size;
  const commentedPrs = new Set(data.reviewComments.map((comment) => `${comment.repository}#${comment.pullRequestNumber}`)).size;
  const value = {
    reviewContributions: data.graphql.reviews.length,
    reviewedPullRequestsApprox: reviewed,
    reviewComments: data.reviewComments.length,
    commentedPullRequests: commentedPrs,
    commentsPerReviewedPr: round(ratio(data.reviewComments.length, reviewed), 3),
    averageCommentLength: round(mean(data.reviewComments.map((comment) => comment.body.trim().length)), 1),
  };
  return sampledSignal("3.25", "Review depth", value, `${data.reviewComments.length} authored review comments across ${commentedPrs} sampled pull requests.`, "GraphQL review contributions + REST pull review comments", reviewed >= 10 && value.commentsPerReviewedPr < 0.25, data.reviewComments.length, "Review contributions cover the calendar year; comment fetches cover first 100 comments on top repositories.");
};

export const rule3_26ForkAndForget: SignalRule = (data) => {
  const matches = Object.entries(data.forkComparisons).filter(([, item]) => item.ahead_by > 0 && item.prCount === 0).map(([repository, item]) => ({ repository, aheadBy: item.ahead_by }));
  const forkLimit = data.sampled["fork-activity"]?.size ?? 5;
  return signal(sampled("3.26", "Fork and forget", matches, `${matches.length} sampled forks are ahead of upstream with no PR associated with the latest sampled commit.`, "compare + commit pulls", Object.keys(data.forkComparisons).length, `Capped at ${forkLimit} forks; latest-commit PR association is a best-effort proxy.`), matches.length > 0);
};

export const rule3_27AuthoredIssueResponse: SignalRule = (data) => {
  const hours = data.authoredIssueResponseHours;
  if (!hours.length) return signal(unavailable("3.27", "Authored issue first-response latency", "No authored-issue first-comment sample was available.", "GraphQL issue batch", "moderate"), false);
  const value = { samples: hours.length, medianHours: round(median(hours), 2) };
  return sampledSignal("3.27", "Authored issue first-response latency", value, `Median community response to sampled authored issues is ${value.medianHours} hours.`, "GraphQL issue batch", hours.length >= 5 && value.medianHours > 168, hours.length, "At most 25 authored issues from the first 100 search results.");
};

const MAX_REPOS_FOR_PAIRWISE = 100;

export const rule3_28TopicSpam: SignalRule = (data) => {
  const repos = data.repos.filter((repo) => repo.topics.length > 0).slice(0, MAX_REPOS_FOR_PAIRWISE);
  const topicSets = repos.map((repo) => new Set(repo.topics));
  const pairs: Array<{ a: string; b: string; overlap: number }> = [];
  for (let a = 0; a < repos.length; a += 1) {
    for (let b = a + 1; b < repos.length; b += 1) {
      const overlap = jaccard(topicSets[a]!, topicSets[b]!);
      if (overlap >= 0.8) pairs.push({ a: repos[a]!.full_name, b: repos[b]!.full_name, overlap: round(overlap, 3) });
    }
  }
  return sampledSignal("3.28", "Topic and keyword overlap", pairs.slice(0, 50), `${pairs.length} repository pairs share at least 80% of their topic sets.`, "GET /users/{u}/repos", pairs.length >= 5, repos.length, "Pairwise analysis is capped at 100 repositories.");
};

export const rule3_29RepoSimilarity: SignalRule = (data) => {
  const sampledRepos = data.repos.slice(0, MAX_REPOS_FOR_PAIRWISE);
  const tokenSets = sampledRepos.map((repo) => tokenize(`${repo.name} ${repo.description ?? ""}`));
  const pairs: Array<{ a: string; b: string; similarity: number }> = [];
  for (let a = 0; a < sampledRepos.length; a += 1) {
    for (let b = a + 1; b < sampledRepos.length; b += 1) {
      const similarity = jaccard(tokenSets[a]!, tokenSets[b]!);
      if (similarity >= 0.8) pairs.push({ a: sampledRepos[a]!.full_name, b: sampledRepos[b]!.full_name, similarity: round(similarity, 3) });
    }
  }
  return sampledSignal("3.29", "Repository name and description similarity", pairs.slice(0, 50), `${pairs.length} near-duplicate repository pairs were found by token Jaccard similarity.`, "GET /users/{u}/repos", pairs.length >= 5, sampledRepos.length, "Pairwise analysis is capped at 100 repositories.");
};

export const rule3_30LanguageDabblerRatio: SignalRule = (data) => {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const languages of Object.values(data.languages)) for (const [language, bytes] of Object.entries(languages)) {
    totals[language] = (totals[language] ?? 0) + bytes;
    counts[language] = (counts[language] ?? 0) + 1;
  }
  const totalBytes = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  const dabblers = Object.keys(totals).filter((language) => counts[language] === 1 && ratio(totals[language]!, totalBytes) < 0.05);
  const value = { dabblerLanguages: dabblers, ratio: round(ratio(dabblers.length, Object.keys(totals).length), 4) };
  return sampledSignal("3.30", "Language dabbler ratio", value, `${dabblers.length} sampled languages appear once and contribute under 5% of bytes.`, "languages endpoint", Object.keys(totals).length >= 5 && value.ratio > 0.6, Object.keys(data.languages).length, "Top 10 repositories only.");
};

export const rule3_31CommitSizeSkew: SignalRule = (data) => {
  const sizes = Object.values(data.commitDetails).flatMap((commit) => commit.stats ? [commit.stats.total] : []);
  if (!sizes.length) return signal(unavailable("3.31", "Commit-size skew", "Per-commit stats were unavailable or skipped by budget.", "GET /repos/{o}/{r}/commits/{sha}", "expensive"), false);
  const average = mean(sizes);
  const middle = median(sizes);
  const value = { samples: sizes.length, median: round(middle, 1), mean: round(average, 1), meanMedianRatio: round(average / Math.max(middle, 1), 2) };
  return signal(sampled("3.31", "Commit-size skew", value, `Sample median is ${value.median} changed lines; mean is ${value.mean}.`, "commit detail stats", sizes.length, "At most 100 commits across top repositories."), sizes.length >= 20 && middle < 5 && value.meanMedianRatio > 10);
};

export const rule3_32EventTypeMix: SignalRule = (data) => {
  const counts: Record<string, number> = {};
  for (const event of data.events) counts[event.type] = (counts[event.type] ?? 0) + 1;
  const pushRatio = ratio(counts.PushEvent ?? 0, data.events.length);
  return signal(ok("3.32", "Event type mix", { total: data.events.length, counts, pushRatio: round(pushRatio, 4) }, `${round(pushRatio * 100, 1)}% of public events in the last 30 days are pushes.`, "GET /users/{u}/events/public"), data.events.length >= 10 && pushRatio > 0.9);
};

export const rule3_33DormantRepoRatio: SignalRule = (data) => {
  const dormant = data.repos.filter((repo) => !repo.pushed_at || daysBetween(repo.pushed_at, data.now) > 365).length;
  const value = { dormant, total: data.repos.length, ratio: round(ratio(dormant, data.repos.length), 4) };
  return signal(ok("3.33", "Dormant repository ratio", value, `${dormant} repositories have no push in the last 12 months.`, "GET /users/{u}/repos"), data.repos.length >= 5 && value.ratio > 0.7);
};

export const rule3_34StarFollowerAnomaly: SignalRule = (data) => {
  const originals = data.repos.filter((repo) => !repo.fork).sort((a, b) => b.stargazers_count - a.stargazers_count);
  const top = originals[0];
  const otherStarred = originals.slice(1).filter((repo) => repo.stargazers_count >= 100).length;
  const flagged = Boolean(top && top.stargazers_count >= 1_000 && data.user.followers < 50 && otherStarred === 0);
  return signal(ok("3.34", "Star-to-follower anomaly", { followers: data.user.followers, topRepository: top?.full_name ?? null, topStars: top?.stargazers_count ?? 0, otherReposOver100Stars: otherStarred }, flagged ? "One repository has high stars relative to a small follower base; surface for context only." : "No configured star-to-follower outlier threshold was crossed.", "user + repository metadata"), flagged);
};

export const rule3_35CommitMessageMonotony: SignalRule = (data) => {
  const messages = allCommits(data).map(({ commit }) => commit.commit.message.trim().toLowerCase()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message, (counts.get(message) ?? 0) + 1);
  const dominant = Math.max(0, ...counts.values());
  const oneWord = messages.filter((message) => message.split(/\s+/).length === 1).length;
  const value = { samples: messages.length, dominantRatio: round(ratio(dominant, messages.length), 4), averageCharacters: round(mean(messages.map((message) => message.length)), 1), oneWordRatio: round(ratio(oneWord, messages.length), 4) };
  return sampledSignal("3.35", "Commit message monotony", value, `Dominant message ratio is ${round(value.dominantRatio * 100, 1)}%.`, "GET /repos/{o}/{r}/commits", messages.length >= 20 && (value.dominantRatio > 0.9 || value.oneWordRatio > 0.7), messages.length, "At most 100 authored commits per sampled repository.");
};

export const rule3_36ContributionConcentration: SignalRule = (data) => {
  const total = data.graphql.contributionsByRepo.reduce((sum, item) => sum + item.count, 0);
  const top = [...data.graphql.contributionsByRepo].sort((a, b) => b.count - a.count)[0];
  const value = { topRepository: top?.repository ?? null, topCount: top?.count ?? 0, total, ratio: round(ratio(top?.count ?? 0, total), 4) };
  return signal(ok("3.36", "Contribution concentration", value, `${round(value.ratio * 100, 1)}% of repository commit contributions are in the top repository.`, "GraphQL commitContributionsByRepository"), total >= 20 && value.ratio > 0.9);
};

export const rule3_37RestrictedContributionRatio: SignalRule = (data) => {
  const total = data.graphql.totalContributions;
  const restricted = data.graphql.restrictedContributionsCount;
  const value = { restricted, total, ratio: round(ratio(restricted, Math.max(total, 1)), 4) };
  return sampledSignal("3.37", "Restricted contribution ratio", value, `${restricted} of ${total} contributions are private/restricted and only visible to the authenticated account.`, "GraphQL restrictedContributionsCount", false, total, "Counts include private contributions visible to the token; public viewers may see fewer.");
};

export const rule3_38MirrorRepos: SignalRule = (data) => {
  const repositories = data.repos.filter((repo) => repo.mirror_url).map((repo) => ({ repository: repo.full_name, mirrorUrl: repo.mirror_url }));
  return signal(ok("3.38", "Mirror repository flag", repositories, `${repositories.length} mirrored repositories are labeled for exclusion from original-work math.`, "GET /users/{u}/repos"), repositories.length > 0);
};

export const rule3_39OpenSourceCitizenship: SignalRule = (data) => {
  const external = data.search.authoredIssues.filter((item) => !item.repository.toLowerCase().startsWith(`${data.username.toLowerCase()}/`));
  return signal(ok("3.39", "Open-source citizenship", { sampledExternalIssues: external.length, totalAuthoredIssues: data.search.issuesOpened, recentSampleShare: round(ratio(external.length, data.search.authoredIssues.length), 4) }, `${external.length} third-party issue reports appear in the first 100 authored-issue results.`, "GET /search/issues"), external.length > 0);
};

export const rule3_40DiscussionParticipation: SignalRule = (data) => {
  const discussions = data.search.discussionsAuthored;
  return signal(ok("3.40", "Discussions participation", { authoredDiscussions: discussions }, `${discussions} authored GitHub Discussions found via the search index.`, "GraphQL search (type: DISCUSSION)"), false);
};

export const rule3_41ExternalPrAcceptance: SignalRule = (data) => {
  const openedExternal = data.search.prsOpenedExternal;
  const mergedExternal = data.search.prsMergedExternal;
  const value = { openedExternal, mergedExternal, acceptanceRate: round(ratio(mergedExternal, Math.max(openedExternal, 1)), 4) };
  return signal(ok("3.41", "External PR acceptance rate", value, `${value.acceptanceRate * 100}% of PRs opened against repositories you don't own were merged.`, "GraphQL search (author + is:merged qualifiers)"), false);
};

export const rule3_42ConventionalCommitRatio: SignalRule = (data) => {
  const messages = allCommits(data).map(({ commit }) => commit.commit.message.trim().toLowerCase()).filter(Boolean);
  const conventional = messages.filter((message) => /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style)(\(|:)/.test(message)).length;
  const value = { sampled: messages.length, conventional, ratio: round(ratio(conventional, messages.length), 4) };
  return sampledSignal("3.42", "Conventional commit adherence", value, `${conventional} of ${messages.length} sampled commits follow Conventional Commits prefixes.`, "GraphQL default-branch history", false, messages.length, "At most 100 commits per sampled repository.");
};

export const rule3_43MergeCommitRatio: SignalRule = (data) => {
  const commits = allCommits(data);
  const merges = commits.filter(({ commit }) => (commit.parents?.length ?? 0) > 1).length;
  const value = { sampled: commits.length, mergeCommits: merges, ratio: round(ratio(merges, commits.length), 4) };
  return sampledSignal("3.43", "Merge-commit ratio", value, `${merges} of ${commits.length} sampled commits are merge commits; high values suggest a branch-and-merge workflow.`, "GraphQL default-branch history", false, commits.length, "Default branch only; squashed-repo workflows show near-zero merge commits.");
};

export const rule3_44CommitFocusProfile: SignalRule = (data) => {
  const sizes = Object.values(data.commitDetails).flatMap((commit) => (commit.stats ? [commit.stats.total] : []));
  if (!sizes.length) return signal(unavailable("3.44", "Commit focus profile", "Per-commit changed-file counts were unavailable.", "GraphQL history nodes"), false);
  const focused = sizes.filter((size) => size > 0 && size <= 200).length;
  const sprawling = sizes.filter((size) => size > 1000).length;
  const value = { sampled: sizes.length, focused, sprawling, focusedRatio: round(ratio(focused, sizes.length), 4) };
  return signal(sampled("3.44", "Commit focus profile", value, `${Math.round(value.focusedRatio * 100)}% of sampled commits are focused changes of at most 200 lines.`, "GraphQL additions/deletions per commit", sizes.length, "Derived from the most recent 100 commits per sampled repository."), false);
};

export const rule3_45ForkAbandonment: SignalRule = (data) => {
  const forks = data.repos.filter((repo) => repo.fork);
  const abandoned = forks
    .filter((repo) => Boolean(repo.created_at && repo.pushed_at))
    .map((repo) => ({ name: repo.full_name, createdAt: repo.created_at as string, pushedAt: repo.pushed_at as string }))
    .filter((repo) => daysBetween(repo.createdAt, repo.pushedAt) < 7 && daysBetween(repo.createdAt, data.now) > 30)
    .map((repo) => repo.name);
  const value = { forks: forks.length, createdAndUntouched: abandoned.length, repositories: abandoned.slice(0, 10) };
  return sampledSignal("3.45", "Fork abandonment pattern", value, `${abandoned.length} forks were created and never pushed to after creation week.`, "repository metadata", forks.length >= 5 && abandoned.length / Math.max(forks.length, 1) > 0.8, forks.length, "Forks created for reading or issue-filing legitimately show no pushes.");
};

export const signalRules: SignalRule[] = [
  rule3_1CommitHourEntropy,
  rule3_2BurstDetection,
  rule3_3DormancyThenBurst,
  rule3_4TimestampRegularity,
  rule3_5CommitMessageDiversity,
  rule3_6TrivialCommitRatio,
  rule3_7AuthoredCommittedGap,
  rule3_8ForkOnlyContributor,
  rule3_9RepoCreationClustering,
  rule3_10MutualStarCluster,
  rule3_11FollowerContentCorrelation,
  rule3_12PushWithoutContent,
  rule3_13GhostRepos,
  rule3_14WeekendRatio,
  rule3_15PeakProductivityWindow,
  rule3_16CollaboratorNetwork,
  rule3_17MaintainerResponseLatency,
  rule3_18LicenseReadmeCompleteness,
  rule3_19CoordinatedStarBursts,
  rule3_20MutualFollowRatio,
  rule3_21TimezoneInstability,
  rule3_22UniformDailyOutput,
  rule3_23SelfMergeRatio,
  rule3_24PrMergeLatency,
  rule3_25ReviewDepth,
  rule3_26ForkAndForget,
  rule3_27AuthoredIssueResponse,
  rule3_28TopicSpam,
  rule3_29RepoSimilarity,
  rule3_30LanguageDabblerRatio,
  rule3_31CommitSizeSkew,
  rule3_32EventTypeMix,
  rule3_33DormantRepoRatio,
  rule3_34StarFollowerAnomaly,
  rule3_35CommitMessageMonotony,
  rule3_36ContributionConcentration,
  rule3_37RestrictedContributionRatio,
  rule3_38MirrorRepos,
  rule3_39OpenSourceCitizenship,
  rule3_40DiscussionParticipation,
  rule3_41ExternalPrAcceptance,
  rule3_42ConventionalCommitRatio,
  rule3_43MergeCommitRatio,
  rule3_44CommitFocusProfile,
  rule3_45ForkAbandonment,
];

export const runSignalRules = (data: EngineData) =>
  Object.fromEntries(
    signalRules.map((rule, idx) => {
      try {
        const result = rule(data);
        return [result.id, result];
      } catch (err) {
        const ruleId = `3.${idx + 1}`;
        return [
          ruleId,
          signal(
            unavailable(
              ruleId,
              `Signal ${ruleId}`,
              err instanceof Error ? err.message : "Signal rule evaluation failed",
              "derived",
            ),
            false,
          ),
        ];
      }
    }),
  ) as Record<string, SignalResult>;
