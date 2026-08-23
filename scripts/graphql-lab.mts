import { readFileSync } from "fs";
import { resolve } from "path";

type QueryResult = Record<string, unknown>;

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {}
  }
}

function pickToken(): string {
  const direct = process.env.GITHUB_TOKEN?.trim();
  if (direct) return direct;
  for (const key of ["GITHUB_TOKENS", "GITHUB_PAT_TOKENS"]) {
    const first = (process.env[key] || "")
      .split(",")
      .map((t) => t.trim())
      .find(Boolean);
    if (first) return first;
  }
  console.error("No token found. Set GITHUB_TOKEN or GITHUB_TOKENS in .env");
  process.exit(1);
}

loadEnv();
const token = pickToken();
let fetchCount = 0;

async function gql(query: string, variables: Record<string, unknown> = {}, label: string): Promise<QueryResult> {
  fetchCount += 1;
  const t0 = Date.now();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "gitscore-graphql-lab",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: QueryResult; errors?: Array<{ message: string }> };
  const ms = Date.now() - t0;
  if (json.errors?.length) {
    console.error(`  [${label}] GraphQL errors:`, json.errors.map((e) => e.message).join(" | "));
  }
  const rateLimit = (json.data?.rateLimit ?? {}) as { cost?: number; remaining?: number };
  console.log(`  [${label}] HTTP ${res.status} in ${ms}ms · gql-cost=${rateLimit.cost ?? "?"} · remaining=${rateLimit.remaining ?? "?"}`);
  return json.data ?? {};
}

const username = process.argv[2];
if (!username) {
  console.error("Usage: npx tsx scripts/graphql-lab.mts <username> [--repos A,B,C] [--skip-user] [--skip-batch] [--skip-issues]");
  process.exit(1);
}
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const manualRepos = arg("--repos");

console.log(`\n=== GitScore GraphQL Lab :: ${username} ===\n`);

async function getUserRepoList(): Promise<Array<{ owner: string; name: string; stars: number; pushedAt: string }>> {
  if (manualRepos) {
    return manualRepos.split(",").map((full) => {
      const [owner, name] = full.trim().split("/");
      return { owner, name, stars: 0, pushedAt: "" };
    });
  }
  const data = await gql(
    `query($login:String!) {
      rateLimit { cost remaining }
      user(login:$login) {
        repositories(first:100, ownerAffiliations:OWNER, orderBy:{field:PUSHED_AT, direction:DESC}) {
          nodes { name owner { login } stargazerCount pushedAt isFork }
        }
      }
    }`,
    { login: username },
    "repo-list",
  );
  const user = data.user as { repositories?: { nodes?: Array<{ name: string; owner: { login: string }; stargazerCount: number; pushedAt: string; isFork: boolean }> } } | undefined;
  return (user?.repositories?.nodes ?? [])
    .filter((r) => !r.isFork)
    .slice(0, 8)
    .map((r) => ({ owner: r.owner.login, name: r.name, stars: r.stargazerCount, pushedAt: r.pushedAt }));
}

const USER_V2 = `query($login:String!) {
  rateLimit { cost remaining spent }
  user(login:$login) {
    login name company location bio websiteUrl twitterUsername createdAt updatedAt
    avatarUrl url
    followers { totalCount }
    following { totalCount }
    organizations(first:20) { totalCount nodes { login } }
    pinnedItems(first:6, types:[REPOSITORY]) {
      totalCount
      nodes { ... on Repository { nameWithOwner stargazerCount } }
    }
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount weekday } } }
      latestRestrictedContributionDate
    }
    gists(first:100, privacy:PUBLIC) { totalCount }
    repositories(first:1, ownerAffiliations:OWNER, orderBy:{field:STARGAZERS, direction:DESC}) { totalCount }
  }
}`;

const REPO_BATCH_V2 = (repos: Array<{ owner: string; name: string }>, offset: number) => `query {
  rateLimit { cost remaining }
  ${repos
    .map(
      (r, i) => `
    repo_${offset + i}: repository(owner:"${r.owner}", name:"${r.name}") {
      description homepageUrl
      createdAt pushedAt updatedAt
      isFork isArchived isTemplate isEmpty isDisabled isPrivate
      hasIssuesEnabled hasWikiEnabled hasDiscussionsEnabled hasPullRequestsEnabled
      licenseInfo { spdxId name }
      repositoryTopics(first:10) { nodes { topic { name } } }
      stargazerCount forkCount watchers { totalCount }
      openIssues: issues(states:OPEN) { totalCount }
      closedIssues: issues(states:CLOSED) { totalCount }
      openPRs: pullRequests(states:OPEN) { totalCount }
      mergedPRs: pullRequests(states:MERGED) { totalCount }
      discussions(first:1) { totalCount }
      milestones(first:1) { totalCount }
      latestRelease { tagName publishedAt }
      languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name } } }
      releases(first:10, orderBy:{field:CREATED_AT, direction:DESC}) {
        nodes { tagName name publishedAt isPrerelease releaseAssets(first:10) { nodes { name downloadCount } } }
      }
      readme: object(expression:"HEAD:README.md") { ... on Blob { byteSize text } }
      githubDir: object(expression:"HEAD:.github") { ... on Tree { entries { name type } } }
      contributing: object(expression:"HEAD:CONTRIBUTING.md") { ... on Blob { byteSize } }
      codeOfConduct: object(expression:"HEAD:CODE_OF_CONDUCT.md") { ... on Blob { byteSize } }
      securityPolicy: object(expression:"HEAD:SECURITY.md") { ... on Blob { byteSize } }
      funding: object(expression:"HEAD:.github/FUNDING.yml") { ... on Blob { byteSize } }
      issueTemplates: object(expression:"HEAD:.github/ISSUE_TEMPLATE") { ... on Tree { entries { name } } }
      workflows: object(expression:"HEAD:.github/workflows") { ... on Tree { entries { name } } }
      docsDir: object(expression:"HEAD:docs") { ... on Tree { entries { name } } }
      defaultBranchRef {
        name target {
          ... on Commit {
            history(first:100) {
              totalCount
              nodes {
                oid committedDate
                messageHeadline
                author { user { login } }
                signature { isValid }
              }
            }
          }
        }
      }
    }`,
    )
    .join("\n")}
}`;

const ISSUE_BATCH_V2 = (repos: Array<{ owner: string; name: string }>, offset: number) => `query {
  rateLimit { cost remaining }
  ${repos
    .map(
      (r, i) => `
    repo_${offset + i}: repository(owner:"${r.owner}", name:"${r.name}") {
      recentIssues: issues(states:OPEN, first:15, orderBy:{field:CREATED_AT, direction:DESC}) {
        nodes { number createdAt comments(first:1) { totalCount } }
      }
      mergedPRSample: pullRequests(states:MERGED, first:10, orderBy:{field:UPDATED_AT, direction:DESC}) {
        nodes { number createdAt closedAt author { login } mergedBy { login } }
      }
    }`,
    )
    .join("\n")}
}`;

interface HistoryNode {
  committedDate: string;
  messageHeadline: string;
  author?: { user?: { login: string | null } | null };
}

interface RepoBatchNode {
  defaultBranchRef?: { target?: { history?: { nodes?: HistoryNode[] } } };
  readme?: { byteSize?: number } | null;
  workflows?: { entries?: unknown[] } | null;
  contributing?: { byteSize?: number } | null;
  githubDir?: { entries?: Array<{ name?: string }> } | null;
  securityPolicy?: { byteSize?: number } | null;
  licenseInfo?: { spdxId: string } | null;
  discussions?: { totalCount?: number } | null;
}

function deriveStats(historyNodes: HistoryNode[]) {
  const weekly = new Map<string, number>();
  const punch = new Map<string, number>();
  const authors = new Map<string, number>();
  const messages = new Set<string>();
  for (const n of historyNodes) {
    if (!n.committedDate) continue;
    const d = new Date(n.committedDate);
    const week = d.toISOString().slice(0, 10);
    weekly.set(week, (weekly.get(week) ?? 0) + 1);
    const pk = `${d.getUTCDay()}:${d.getUTCHours()}`;
    punch.set(pk, (punch.get(pk) ?? 0) + 1);
    const login = n.author?.user?.login ?? "unknown";
    authors.set(login, (authors.get(login) ?? 0) + 1);
    messages.add(n.messageHeadline.toLowerCase().trim());
  }
  return {
    commits: historyNodes.length,
    distinctAuthors: authors.size,
    topAuthor: [...authors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-",
    messageDiversity: messages.size / Math.max(1, historyNodes.length),
    punchCells: punch.size,
    activeWeeks: weekly.size,
  };
}

async function main() {
  const repos = await getUserRepoList();
  console.log(`  top repos: ${repos.map((r) => `${r.owner}/${r.name}`).join(", ") || "(none)"}\n`);

  if (!process.argv.includes("--skip-user")) {
    console.log("[1/3] USER_V2 (replaces REST /users/{u} + /users/{u}/gists + partial orgs/starred)");
    await gql(USER_V2, { login: username }, "user-v2");
  }

  if (!process.argv.includes("--skip-batch") && repos.length > 0) {
    console.log("\n[2/3] REPO_BATCH_V2 (aliased enrichment + community files, one request per 4 repos)");
    const derived: ReturnType<typeof deriveStats>[] = [];
    for (let i = 0; i < repos.length; i += 4) {
      const batch = repos.slice(i, i + 4);
      const data = await gql(REPO_BATCH_V2(batch, i), {}, `repo-batch-${i}`);
      for (let j = 0; j < batch.length; j++) {
        const node = data[`repo_${i + j}`] as RepoBatchNode | undefined;
        if (!node) continue;
        const hist = node.defaultBranchRef?.target?.history?.nodes ?? [];
        derived.push(deriveStats(hist));
        const community = [
          node.contributing ? "CONTRIBUTING" : null,
          node.securityPolicy ? "SECURITY" : null,
          node.githubDir ? undefined : null,
        ].filter(Boolean);
        console.log(`   ${batch[j].owner}/${batch[j].name}: license=${node.licenseInfo?.spdxId ?? "-"} readme=${node.readme?.byteSize ?? 0}B ci=${node.workflows ? "y" : "n"} community=[${community.join(",")}] discussions=${node.discussions?.totalCount ?? "?"}`);
      }
    }
    if (!process.argv.includes("--skip-derived") && derived.length > 0) {
      console.log("\n[derived] stats computed from already-fetched history (replaces /stats/* REST calls):");
      for (let i = 0; i < derived.length; i++) {
        const d = derived[i];
        console.log(`   ${repos[i]?.name ?? i}: commits=${d.commits} authors=${d.distinctAuthors} top=${d.topAuthor} msgDiv=${d.messageDiversity.toFixed(2)} weeks=${d.activeWeeks} punchCells=${d.punchCells}`);
      }
    }
  }

  if (!process.argv.includes("--skip-issues") && repos.length > 0) {
    console.log("\n[3/3] ISSUE_BATCH_V2 (response-latency samples for all repos, one request per batch)");
    for (let i = 0; i < repos.length; i += 4) {
      await gql(ISSUE_BATCH_V2(repos.slice(i, i + 4), i), {}, `issue-batch-${i}`);
    }
  }

  console.log(`\n=== done: ${fetchCount} HTTP requests this run ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
