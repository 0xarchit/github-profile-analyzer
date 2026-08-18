import type { GraphQLSummary, GitHubRepo, RepoIssueSummary } from "../types";
import { hoursBetween } from "../rules/shared";
import { GitHubClient } from "./client";

const MAIN_QUERY = `
query DeterministicProfile($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    pinnedItems(first: 6, types: [REPOSITORY]) {
      nodes { ... on Repository { nameWithOwner stargazerCount } }
    }
    starredRepositories { totalCount }
    sponsoring(first: 1) { totalCount }
    sponsors(first: 1) { totalCount }
    repositoriesContributedTo(first: 1, includeUserRepositories: false) { totalCount }
    pullRequests(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { createdAt mergedAt mergedBy { login } repository { nameWithOwner owner { login } } }
    }
    contributionsCollection(from: $from, to: $to) {
      totalPullRequestReviewContributions
      totalPullRequestContributions
      totalIssueContributions
      restrictedContributionsCount
      contributionYears
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday color } }
      }
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      pullRequestReviewContributions(first: 100) {
        nodes { occurredAt pullRequest { title } }
      }
    }
  }
  rateLimit { cost remaining resetAt }
}`;

interface MainResponse {
  user: null | {
    pinnedItems: { nodes: Array<{ nameWithOwner: string; stargazerCount: number } | null> };
    starredRepositories: { totalCount: number };
    sponsoring: { totalCount: number };
    sponsors: { totalCount: number };
    repositoriesContributedTo: { totalCount: number };
    pullRequests: { nodes: GraphQLSummary["pullRequests"] };
    contributionsCollection: {
      totalPullRequestReviewContributions: number;
      totalPullRequestContributions: number;
      totalIssueContributions: number;
      restrictedContributionsCount: number;
      contributionYears: number[];
      contributionCalendar: { totalContributions: number; weeks: Array<{ contributionDays: GraphQLSummary["calendar"] }> };
      commitContributionsByRepository: Array<{ repository: { nameWithOwner: string }; contributions: { totalCount: number } }>;
      pullRequestReviewContributions: { nodes: Array<{ occurredAt: string; pullRequest: { title: string } }> };
    };
  };
  rateLimit: { cost: number; remaining: number; resetAt: string };
}

export async function fetchGraphQLSummary(client: GitHubClient, username: string, now: Date): Promise<GraphQLSummary> {
  const to = now.toISOString();
  const from = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const response = await client.graphql<MainResponse>(MAIN_QUERY, { login: username, from, to }, "profile GraphQL summary");
  if (!response.user) throw new Error(`GitHub user ${username} was not found.`);
  const collection = response.user.contributionsCollection;
  return {
    totalContributions: collection.contributionCalendar.totalContributions,
    restrictedContributionsCount: collection.restrictedContributionsCount,
    totalPullRequestReviewContributions: collection.totalPullRequestReviewContributions,
    totalPullRequestContributions: collection.totalPullRequestContributions,
    totalIssueContributions: collection.totalIssueContributions,
    totalDiscussionCommentContributions: 0,
    contributionYears: collection.contributionYears,
    calendar: collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays),
    contributionsByRepo: collection.commitContributionsByRepository.map((item) => ({ repository: item.repository.nameWithOwner, count: item.contributions.totalCount })),
    pinnedItems: response.user.pinnedItems.nodes.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    starredRepositoriesCount: response.user.starredRepositories.totalCount,
    sponsoringCount: response.user.sponsoring.totalCount,
    sponsorCount: response.user.sponsors.totalCount,
    repositoriesContributedToCount: response.user.repositoriesContributedTo.totalCount,
    pullRequests: response.user.pullRequests.nodes,
    reviews: collection.pullRequestReviewContributions.nodes.map((node) => ({ occurredAt: node.occurredAt, title: node.pullRequest.title })),
    graphqlCost: response.rateLimit.cost,
    graphqlRemaining: response.rateLimit.remaining,
  };
}

const graphqlString = (value: string) => JSON.stringify(value);

export async function fetchRepoIssueSummaries(client: GitHubClient, repos: GitHubRepo[]): Promise<Record<string, RepoIssueSummary>> {
  if (!repos.length) return {};
  const fields = repos.map((repo, index) => `
    r${index}: repository(owner: ${graphqlString(repo.owner.login)}, name: ${graphqlString(repo.name)}) {
      open: issues(states: OPEN) { totalCount }
      closed: issues(states: CLOSED) { totalCount }
      discussions { totalCount }
      recent: issues(first: 25, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes { createdAt comments(first: 1) { nodes { createdAt } } }
      }
    }`).join("\n");
  const response = await client.graphql<Record<string, {
    open: { totalCount: number };
    closed: { totalCount: number };
    discussions: { totalCount: number };
    recent: { nodes: Array<{ createdAt: string; comments: { nodes: Array<{ createdAt: string }> } }> };
  } | null>>(`query { ${fields} }`, {}, "repository issue summary batch");
  return Object.fromEntries(repos.map((repo, index) => {
    const item = response[`r${index}`];
    const responseHours = item?.recent.nodes.flatMap((issue) => issue.comments.nodes[0] ? [hoursBetween(issue.createdAt, issue.comments.nodes[0].createdAt)] : []) ?? [];
    return [repo.full_name, { open: item?.open.totalCount ?? 0, closed: item?.closed.totalCount ?? 0, discussions: item?.discussions.totalCount ?? 0, responseHours }];
  }));
}

export async function fetchAuthoredIssueResponseHours(
  client: GitHubClient,
  items: Array<{ repository: string; number: number; createdAt: string }>,
): Promise<number[]> {
  const sampled = items.slice(0, 25);
  if (!sampled.length) return [];
  const fields = sampled.map((item, index) => {
    const [owner, repo] = item.repository.split("/");
    return `i${index}: repository(owner: ${graphqlString(owner ?? "")}, name: ${graphqlString(repo ?? "")}) {
      issue(number: ${item.number}) { createdAt comments(first: 1) { nodes { createdAt } } }
    }`;
  }).join("\n");
  const response = await client.graphql<Record<string, { issue: null | { createdAt: string; comments: { nodes: Array<{ createdAt: string }> } } } | null>>(
    `query { ${fields} }`, {}, "authored issue response batch",
  );
  return sampled.flatMap((_item, index) => {
    const issue = response[`i${index}`]?.issue;
    const comment = issue?.comments.nodes[0];
    return issue && comment ? [hoursBetween(issue.createdAt, comment.createdAt)] : [];
  });
}
