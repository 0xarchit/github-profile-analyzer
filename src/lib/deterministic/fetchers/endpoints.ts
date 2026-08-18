import type { GitHubCommit, GitHubEvent, GitHubRepo, GitHubUser, ReleaseInfo, StargazerEvent } from "../types";
import { GitHubClient } from "./client";

const encode = encodeURIComponent;

export const fetchRateLimit = (client: GitHubClient) => client.rest<Record<string, unknown>>("/rate_limit", { label: "rate-limit probe" });
export const fetchUser = (client: GitHubClient, username: string) => client.rest<GitHubUser>(`/users/${encode(username)}`, { label: "user profile" });
export const fetchUserReposPage = (client: GitHubClient, username: string, page: number) =>
  client.rest<GitHubRepo[]>(`/users/${encode(username)}/repos?per_page=100&page=${page}&sort=updated`, { label: `repo list page ${page}` });
export const fetchRepo = (client: GitHubClient, owner: string, repo: string) => client.rest<GitHubRepo>(`/repos/${encode(owner)}/${encode(repo)}`, { label: `${owner}/${repo} detail` });
export const fetchCommits = (client: GitHubClient, owner: string, repo: string, author?: string, perPage = 100) =>
  client.rest<GitHubCommit[]>(`/repos/${encode(owner)}/${encode(repo)}/commits?per_page=${perPage}${author ? `&author=${encode(author)}` : ""}`, { label: `${owner}/${repo} commits` });
export const fetchCommit = (client: GitHubClient, owner: string, repo: string, sha: string) =>
  client.rest<GitHubCommit>(`/repos/${encode(owner)}/${encode(repo)}/commits/${encode(sha)}`, { label: `${owner}/${repo} commit detail` });
export const fetchCommitPulls = (client: GitHubClient, owner: string, repo: string, sha: string) =>
  client.rest<Array<{ number: number }>>(`/repos/${encode(owner)}/${encode(repo)}/commits/${encode(sha)}/pulls`, { label: `${owner}/${repo} commit pulls` });
export const compareRefs = (client: GitHubClient, owner: string, repo: string, base: string, head: string) =>
  client.rest<{ ahead_by: number; behind_by: number; total_commits: number }>(`/repos/${encode(owner)}/${encode(repo)}/compare/${encode(base)}...${encode(head)}`, { label: `${owner}/${repo} compare` });
export const fetchCommitActivity = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<{ week: number; total: number; days: number[] }>>(`/repos/${encode(owner)}/${encode(repo)}/stats/commit_activity`, { label: `${owner}/${repo} commit activity`, retries: 4 });
export const fetchCodeFrequency = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<[number, number, number]>>(`/repos/${encode(owner)}/${encode(repo)}/stats/code_frequency`, { label: `${owner}/${repo} code frequency`, retries: 4 });
export const fetchParticipation = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<{ all: number[]; owner: number[] }>(`/repos/${encode(owner)}/${encode(repo)}/stats/participation`, { label: `${owner}/${repo} participation`, retries: 4 });
export const fetchPunchCard = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<[number, number, number]>>(`/repos/${encode(owner)}/${encode(repo)}/stats/punch_card`, { label: `${owner}/${repo} punch card`, retries: 4 });
export const fetchContributors = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<{ login?: string; contributions: number }>>(`/repos/${encode(owner)}/${encode(repo)}/contributors?per_page=100`, { label: `${owner}/${repo} contributors` });
export const fetchStargazers = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<StargazerEvent[]>(`/repos/${encode(owner)}/${encode(repo)}/stargazers?per_page=100`, { label: `${owner}/${repo} stargazers`, headers: { Accept: "application/vnd.github.star+json" } });
export const fetchPublicEventsPage = (client: GitHubClient, username: string, page: number) =>
  client.rest<GitHubEvent[]>(`/users/${encode(username)}/events/public?per_page=100&page=${page}`, { label: `public events page ${page}` });
export const searchIssues = (client: GitHubClient, query: string, perPage = 1) =>
  client.rest<{ total_count: number; items: Array<{ number: number; created_at: string; repository_url: string }> }>(`/search/issues?q=${encode(query)}&per_page=${perPage}`, { bucket: "search", label: `search: ${query}` });
export const fetchLanguages = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Record<string, number>>(`/repos/${encode(owner)}/${encode(repo)}/languages`, { label: `${owner}/${repo} languages` });
export const fetchReleases = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<ReleaseInfo[]>(`/repos/${encode(owner)}/${encode(repo)}/releases?per_page=100`, { label: `${owner}/${repo} releases` });
export const fetchBranches = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<{ name: string; protected: boolean }>>(`/repos/${encode(owner)}/${encode(repo)}/branches?per_page=100`, { label: `${owner}/${repo} branches` });
export const fetchCheckRuns = (client: GitHubClient, owner: string, repo: string, ref: string) =>
  client.rest<{ check_runs: Array<{ conclusion: string | null; status: string }> }>(`/repos/${encode(owner)}/${encode(repo)}/commits/${encode(ref)}/check-runs?per_page=100`, { label: `${owner}/${repo} check runs` });
export const fetchGists = (client: GitHubClient, username: string) =>
  client.rest<Array<{ id: string; created_at: string; updated_at: string; comments: number }>>(`/users/${encode(username)}/gists?per_page=100`, { label: "public gists" });
export const fetchUserStarred = (client: GitHubClient, username: string) =>
  client.rest<Array<{ starred_at: string; repo: GitHubRepo }>>(`/users/${encode(username)}/starred?per_page=100`, { label: "user starred repos", headers: { Accept: "application/vnd.github.star+json" } });
export const fetchSubscriptions = async (client: GitHubClient, username: string) => {
  const response = await client.rest<Array<{ full_name: string }> | null>(
    `/users/${encode(username)}/subscriptions?per_page=100`,
    { label: "subscriptions" },
  );
  return { ...response, data: response.data ?? [] };
};
export const fetchFollowersPage = (client: GitHubClient, username: string, page: number) =>
  client.rest<Array<{ login: string }>>(`/users/${encode(username)}/followers?per_page=100&page=${page}`, { label: `followers page ${page}` });
export const fetchFollowingPage = (client: GitHubClient, username: string, page: number) =>
  client.rest<Array<{ login: string }>>(`/users/${encode(username)}/following?per_page=100&page=${page}`, { label: `following page ${page}` });
export const fetchPublicOrgs = (client: GitHubClient, username: string) =>
  client.rest<Array<{ login: string; avatar_url: string }>>(`/users/${encode(username)}/orgs?per_page=100`, { label: "public orgs" });
export const fetchSbom = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<{ sbom?: { packages?: Array<{ name?: string; externalRefs?: Array<{ referenceType?: string; referenceLocator?: string }> }> } }>(`/repos/${encode(owner)}/${encode(repo)}/dependency-graph/sbom`, { label: `${owner}/${repo} SBOM` });
export const fetchCodeScanningAlerts = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<{ state: string; rule?: { security_severity_level?: string } }>>(`/repos/${encode(owner)}/${encode(repo)}/code-scanning/alerts?per_page=100`, { label: `${owner}/${repo} code scanning` });
export const fetchDependabotAlerts = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<{ state: string; security_advisory?: { severity?: string } }>>(`/repos/${encode(owner)}/${encode(repo)}/dependabot/alerts?per_page=100`, { label: `${owner}/${repo} dependabot` });
export const fetchForks = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<GitHubRepo[]>(`/repos/${encode(owner)}/${encode(repo)}/forks?sort=newest&per_page=100`, { label: `${owner}/${repo} forks` });
export const fetchReadme = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<{ content: string; encoding: string; size: number }>(`/repos/${encode(owner)}/${encode(repo)}/readme`, { label: `${owner}/${repo} README` });
export const fetchContentPath = (client: GitHubClient, owner: string, repo: string, path: string) =>
  client.rest<unknown>(`/repos/${encode(owner)}/${encode(repo)}/contents/${path.split("/").map(encode).join("/")}`, { label: `${owner}/${repo} content ${path}` });
export const fetchPullReviewComments = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<Array<{ user: { login: string } | null; body: string; created_at: string; pull_request_url: string }>>(`/repos/${encode(owner)}/${encode(repo)}/pulls/comments?per_page=100`, { label: `${owner}/${repo} pull review comments` });
