import type { GitHubEvent } from "../types";
import { GitHubClient } from "./client";

const encode = encodeURIComponent;

export const fetchPublicOrgs = (client: GitHubClient, username: string) =>
  client.rest<Array<{ login: string; avatar_url: string }>>(`/users/${encode(username)}/orgs?per_page=100`, { label: "public orgs" });

export const fetchPublicGists = (client: GitHubClient, username: string) =>
  client.rest<Array<{ id: string; created_at: string; updated_at: string; comments: number }>>(`/users/${encode(username)}/gists?per_page=100`, { label: "public gists" });

export const fetchRateLimit = (client: GitHubClient) => client.rest<Record<string, unknown>>("/rate_limit", { label: "rate-limit probe" });

export const fetchPublicEventsPage = (client: GitHubClient, username: string, page: number) =>
  client.rest<GitHubEvent[]>(`/users/${encode(username)}/events/public?per_page=100&page=${page}`, { label: `public events page ${page}` });

export const fetchSubscriptions = async (client: GitHubClient, username: string) => {
  const response = await client.rest<Array<{ full_name: string }> | null>(
    `/users/${encode(username)}/subscriptions?per_page=100`,
    { label: "subscriptions" },
  );
  return { ...response, data: response.data ?? [] };
};

export const compareRefs = (client: GitHubClient, owner: string, repo: string, base: string, head: string) =>
  client.rest<{ ahead_by: number; behind_by: number; total_commits: number }>(`/repos/${encode(owner)}/${encode(repo)}/compare/${encode(base)}...${encode(head)}`, { label: `${owner}/${repo} compare` });

export const fetchCommitPulls = (client: GitHubClient, owner: string, repo: string, sha: string) =>
  client.rest<Array<{ number: number }>>(`/repos/${encode(owner)}/${encode(repo)}/commits/${encode(sha)}/pulls`, { label: `${owner}/${repo} commit pulls` });

export const fetchCommunityProfile = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<{ health_percentage?: number; files?: Record<string, unknown> }>(`/repos/${encode(owner)}/${encode(repo)}/community/profile`, { label: `${owner}/${repo} community profile` });

export const fetchActionsRuns = (client: GitHubClient, owner: string, repo: string) =>
  client.rest<{ workflow_runs?: Array<{ conclusion?: string | null }> }>(`/repos/${encode(owner)}/${encode(repo)}/actions/runs?per_page=30`, { label: `${owner}/${repo} actions runs` });
