import type { GraphQLSummary, GitHubRepo, RepoIssueSummary } from "../types";
import { hoursBetween } from "../rules/shared";
import { GitHubClient, UserNotFoundError } from "./client";

export const emptyGraphQLSummary = (): GraphQLSummary => ({
  totalContributions: 0,
  restrictedContributionsCount: 0,
  totalCommitContributions: 0,
  totalPullRequestReviewContributions: 0,
  totalPullRequestContributions: 0,
  totalIssueContributions: 0,
  totalDiscussionCommentContributions: 0,
  contributionYears: [],
  calendar: [],
  contributionsByRepo: [],
  pinnedItems: [],
  starredRepositoriesCount: 0,
  sponsoringCount: 0,
  sponsorCount: 0,
  repositoriesContributedToCount: 0,
  pullRequests: [],
  reviews: [],
  graphqlCost: 0,
  graphqlRemaining: 0,
});

const MAIN_QUERY = `
query DeterministicProfile($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    name
    company
    location
    bio
    websiteUrl
    twitterUsername
    createdAt
    updatedAt
    avatarUrl
    url
    followers { totalCount }
    following { totalCount }
    repositories { totalCount }
    gists(privacy: PUBLIC) { totalCount }
    followersList: followers(first: 100) { nodes { login } }
    followingList: following(first: 100) { nodes { login } }
    gistList: gists(first: 100, privacy: PUBLIC) {
      nodes { id createdAt updatedAt comments(first: 1) { totalCount } }
    }
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
      totalCommitContributions
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
  profileReadmeRepo: repository(owner: $login, name: $login) {
    readme: object(expression: "HEAD:README.md") { ... on Blob { byteSize text } }
  }
  rateLimit { cost remaining resetAt }
}`;

interface MainResponse {
  user: null | {
    login: string;
    name: string | null;
    company: string | null;
    location: string | null;
    bio: string | null;
    websiteUrl: string | null;
    twitterUsername: string | null;
    createdAt: string;
    updatedAt: string;
    avatarUrl: string;
    url: string;
    followers: { totalCount: number };
    following: { totalCount: number };
    repositories: { totalCount: number };
    gists: { totalCount: number };
    followersList: { nodes: Array<{ login: string } | null> };
    followingList: { nodes: Array<{ login: string } | null> };
    gistList: { nodes: Array<{ id: string; createdAt: string; updatedAt: string; comments: { totalCount: number } } | null> };
    pinnedItems: { nodes: Array<{ nameWithOwner: string; stargazerCount: number } | null> };
    starredRepositories: { totalCount: number };
    sponsoring: { totalCount: number };
    sponsors: { totalCount: number };
    repositoriesContributedTo: { totalCount: number };
    pullRequests: { nodes: Array<GraphQLSummary["pullRequests"][number] | null> };
    contributionsCollection: {
      totalCommitContributions: number;
      totalPullRequestReviewContributions: number;
      totalPullRequestContributions: number;
      totalIssueContributions: number;
      restrictedContributionsCount: number;
      contributionYears: number[];
      contributionCalendar: { totalContributions: number; weeks: Array<{ contributionDays: GraphQLSummary["calendar"] }> };
      commitContributionsByRepository: Array<{ repository: { nameWithOwner: string }; contributions: { totalCount: number } }>;
      pullRequestReviewContributions: { nodes: Array<{ occurredAt: string; pullRequest: { title: string } | null } | null> };
    };
  };
  profileReadmeRepo: null | { readme: null | { byteSize: number; text: string } };
  rateLimit: { cost: number; remaining: number; resetAt: string };
}

export interface ProfileCoreResult {
  user: import("../types").GitHubUser;
  gists: Array<{ id: string; created_at: string; updated_at: string; comments: number }>;
  followers: string[];
  following: string[];
  summary: GraphQLSummary;
  profileReadme: { present: boolean; bytes: number; text: string };
}

export async function fetchProfileCore(client: GitHubClient, username: string, now: Date): Promise<ProfileCoreResult> {
  const to = now.toISOString();
  const from = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const response = await client.graphql<MainResponse>(MAIN_QUERY, { login: username, from, to }, "profile core batch");
  if (!response.user) throw new UserNotFoundError(username);
  const u = response.user;
  const collection = u.contributionsCollection;
  const calendarDays: GraphQLSummary["calendar"] = collection.contributionCalendar.weeks.flatMap(
    (week, weekIndex) =>
      week.contributionDays.map((day) => ({
        ...day,
        week: weekIndex,
      })),
  );
  const summary: GraphQLSummary = {
    totalContributions: collection.contributionCalendar.totalContributions,
    restrictedContributionsCount: collection.restrictedContributionsCount,
    totalCommitContributions: collection.totalCommitContributions,
    totalPullRequestReviewContributions: collection.totalPullRequestReviewContributions,
    totalPullRequestContributions: collection.totalPullRequestContributions,
    totalIssueContributions: collection.totalIssueContributions,
    totalDiscussionCommentContributions: 0,
    contributionYears: collection.contributionYears,
    calendar: calendarDays,
    contributionsByRepo: collection.commitContributionsByRepository.map((item) => ({ repository: item.repository.nameWithOwner, count: item.contributions.totalCount })),
    pinnedItems: u.pinnedItems.nodes.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    starredRepositoriesCount: u.starredRepositories.totalCount,
    sponsoringCount: u.sponsoring.totalCount,
    sponsorCount: u.sponsors.totalCount,
    repositoriesContributedToCount: u.repositoriesContributedTo.totalCount,
    pullRequests: u.pullRequests.nodes.filter((node): node is NonNullable<typeof node> => Boolean(node)),
    reviews: collection.pullRequestReviewContributions.nodes
      .filter((node): node is { occurredAt: string; pullRequest: { title: string } } => node !== null && node !== undefined && node.pullRequest !== null && node.pullRequest !== undefined)
      .map((node) => ({ occurredAt: node.occurredAt, title: node.pullRequest.title })),
    graphqlCost: response.rateLimit.cost,
    graphqlRemaining: response.rateLimit.remaining,
  };
  const user: import("../types").GitHubUser = {
    login: u.login,
    name: u.name,
    avatar_url: u.avatarUrl,
    html_url: u.url,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
    followers: u.followers.totalCount,
    following: u.following.totalCount,
    public_repos: u.repositories.totalCount,
    public_gists: u.gists.totalCount,
    hireable: null,
    blog: u.websiteUrl ?? "",
    location: u.location,
    company: u.company,
    bio: u.bio,
    twitter_username: u.twitterUsername,
  };
  const readmeBlob = response.profileReadmeRepo?.readme ?? null;
  return {
    user,
    gists: u.gistList.nodes.filter((item): item is NonNullable<typeof item> => Boolean(item)).map((gist) => ({
      id: gist.id,
      created_at: gist.createdAt,
      updated_at: gist.updatedAt,
      comments: gist.comments?.totalCount ?? 0,
    })),
    followers: u.followersList.nodes.filter((item): item is { login: string } => Boolean(item)).map((item) => item.login),
    following: u.followingList.nodes.filter((item): item is { login: string } => Boolean(item)).map((item) => item.login),
    summary,
    profileReadme: {
      present: Boolean(readmeBlob),
      bytes: readmeBlob?.byteSize ?? 0,
      text: readmeBlob?.text ?? "",
    },
  };
}

export async function fetchRepoIssueSummaries(client: GitHubClient, repos: GitHubRepo[]): Promise<Record<string, RepoIssueSummary>> {
  if (!repos.length) return {};
  const variableDecls: string[] = [];
  const variables: Record<string, unknown> = {};
  const fields = repos
    .map((repo, index) => {
      variableDecls.push(`$owner${index}: String!`, `$name${index}: String!`);
      variables[`owner${index}`] = repo.owner.login;
      variables[`name${index}`] = repo.name;
      return `
    r${index}: repository(owner: $owner${index}, name: $name${index}) {
      open: issues(states: OPEN) { totalCount }
      closed: issues(states: CLOSED) { totalCount }
      discussions { totalCount }
      recent: issues(first: 25, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes { createdAt comments(first: 1) { nodes { createdAt } } }
      }
    }`;
    })
    .join("\n");

  const query = `query RepoIssueSummaries(${variableDecls.join(", ")}) { ${fields} }`;
  const response = await client.graphql<Record<string, {
    open: { totalCount: number };
    closed: { totalCount: number };
    discussions: { totalCount: number };
    recent: { nodes: Array<{ createdAt: string; comments: { nodes: Array<{ createdAt: string }> } }> };
  } | null>>(query, variables, "repository issue summary batch");

  const entries: Array<[string, RepoIssueSummary]> = [];
  repos.forEach((repo, index) => {
    const item = response[`r${index}`];
    if (!item) return; // Skip inaccessible or null repository aliases
    const responseHours =
      item.recent?.nodes?.flatMap((issue) =>
        issue.comments?.nodes?.[0]
          ? [hoursBetween(issue.createdAt, issue.comments.nodes[0].createdAt)]
          : [],
      ) ?? [];
    entries.push([
      repo.full_name,
      {
        open: item.open?.totalCount ?? 0,
        closed: item.closed?.totalCount ?? 0,
        discussions: item.discussions?.totalCount ?? 0,
        responseHours,
      },
    ]);
  });
  return Object.fromEntries(entries);
}

export async function fetchAuthoredIssueResponseHours(
  client: GitHubClient,
  items: Array<{ repository: string; number: number; createdAt: string }>,
): Promise<number[]> {
  const sampled = items.slice(0, 25);
  if (!sampled.length) return [];
  const variableDecls: string[] = [];
  const variables: Record<string, unknown> = {};
  const fields = sampled
    .map((item, index) => {
      const [owner, repo] = item.repository.split("/");
      variableDecls.push(`$owner${index}: String!`, `$name${index}: String!`, `$num${index}: Int!`);
      variables[`owner${index}`] = owner ?? "";
      variables[`name${index}`] = repo ?? "";
      variables[`num${index}`] = item.number;
      return `i${index}: repository(owner: $owner${index}, name: $name${index}) {
      issue(number: $num${index}) { createdAt comments(first: 1) { nodes { createdAt } } }
    }`;
    })
    .join("\n");

  const query = `query AuthoredIssueResponses(${variableDecls.join(", ")}) { ${fields} }`;
  const response = await client.graphql<Record<string, { issue: null | { createdAt: string; comments: { nodes: Array<{ createdAt: string }> } } } | null>>(
    query,
    variables,
    "authored issue response batch",
  );
  return sampled.flatMap((_item, index) => {
    const issue = response[`i${index}`]?.issue;
    const comment = issue?.comments?.nodes?.[0];
    return issue && comment ? [hoursBetween(issue.createdAt, comment.createdAt)] : [];
  });
}
