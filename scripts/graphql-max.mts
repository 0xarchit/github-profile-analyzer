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

async function gqlRaw(
  query: string,
  variables: Record<string, unknown> = {},
  label: string,
): Promise<{ data: QueryResult; kb: number }> {
  fetchCount += 1;
  const t0 = Date.now();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "gitscore-max-probe",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  const kb = Math.round((Buffer.byteLength(text) / 1024) * 10) / 10;
  const ms = Date.now() - t0;
  let json: { data?: QueryResult; errors?: Array<{ message: string; path?: unknown[] }> };
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`  [${label}] HTTP ${res.status}, non-JSON (${kb}KB)`);
    return { data: {}, kb };
  }
  const errs = json.errors ?? [];
  console.log(`  [${label}] HTTP ${res.status} ${ms}ms · ${kb}KB${errs.length ? ` · ERRORS(${errs.length}): ${errs.slice(0, 3).map((e) => `${(e.path ?? []).join(".") || "root"}: ${e.message}`).join(" || ")}` : ""}`);
  return { data: json.data ?? {}, kb };
}

const username = process.argv[2];
if (!username) {
  console.error("Usage: npx tsx scripts/graphql-max.mts <username>");
  process.exit(1);
}
console.log(`\n=== GitScore MAX-DATA Probe :: ${username} ===\n`);

interface RepoLite {
  name: string;
  owner: { login: string };
  stargazerCount: number;
  forkCount: number;
  pushedAt: string;
  isFork: boolean;
}

async function getTopRepos(): Promise<RepoLite[]> {
  const { data } = await gqlRaw(
    `query($login:String!) {
      rateLimit { cost remaining }
      user(login:$login) {
        repositories(first:100, ownerAffiliations:[OWNER, COLLABORATOR], orderBy:{field:PUSHED_AT, direction:DESC}) {
          totalCount
          nodes { name owner { login } stargazerCount forkCount pushedAt isFork }
        }
      }
    }`,
    { login: username },
    "repo-list",
  );
  const user = data.user as { repositories?: { nodes?: RepoLite[] } } | undefined;
  return user?.repositories?.nodes ?? [];
}

const USER_CORE = `query($login:String!) {
  rateLimit { cost remaining }
  user(login:$login) {
    login name company location bio websiteUrl twitterUsername createdAt updatedAt
    followers { totalCount } following { totalCount }
    organizations(first:20) { totalCount nodes { login } }
    pinnedItems(first:6, types:[REPOSITORY]) { totalCount nodes { ... on Repository { nameWithOwner stargazerCount } } }
    contributionsCollection {
      totalCommitContributions totalIssueContributions totalPullRequestContributions
      totalPullRequestReviewContributions totalRepositoryContributions restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount weekday } } }
    }
    gists(first:1, privacy:PUBLIC) { totalCount }
  }
}`;

const REPO_ENRICH_BATCH = (repos: RepoLite[], offset: number) => `query {
  rateLimit { cost remaining }
  ${repos
    .map(
      (r, i) => `
  repo_${offset + i}: repository(owner:"${r.owner.login}", name:"${r.name}") {
    description homepageUrl createdAt pushedAt updatedAt
    isFork isArchived isTemplate isEmpty isDisabled
    hasIssuesEnabled hasWikiEnabled hasDiscussionsEnabled
    licenseInfo { spdxId } repositoryTopics(first:10) { nodes { topic { name } } }
    stargazerCount forkCount watchers { totalCount }
    openIssues: issues(states:OPEN) { totalCount } closedIssues: issues(states:CLOSED) { totalCount }
    openPRs: pullRequests(states:OPEN) { totalCount } mergedPRs: pullRequests(states:MERGED) { totalCount }
    discussions(first:1) { totalCount } milestones(first:1) { totalCount }
    latestRelease { tagName publishedAt }
    languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name } } }
    releases(first:10, orderBy:{field:CREATED_AT, direction:DESC}) { nodes { tagName publishedAt isPrerelease releaseAssets(first:10) { nodes { downloadCount } } } }
    readme: object(expression:"HEAD:README.md") { ... on Blob { byteSize text } }
    githubDir: object(expression:"HEAD:.github") { ... on Tree { entries { name } } }
    contributing: object(expression:"HEAD:CONTRIBUTING.md") { ... on Blob { byteSize } }
    coc: object(expression:"HEAD:CODE_OF_CONDUCT.md") { ... on Blob { byteSize } }
    security: object(expression:"HEAD:SECURITY.md") { ... on Blob { byteSize } }
    funding: object(expression:"HEAD:.github/FUNDING.yml") { ... on Blob { byteSize } }
    templates: object(expression:"HEAD:.github/ISSUE_TEMPLATE") { ... on Tree { entries { name } } }
    workflows: object(expression:"HEAD:.github/workflows") { ... on Tree { entries { name } } }
    docsDir: object(expression:"HEAD:docs") { ... on Tree { entries { name } } }
    defaultBranchRef { target { ... on Commit {
      history(first:100) {
        totalCount
        nodes {
          oid committedDate messageHeadline
          additions deletions changedFiles
          author { user { login } }
          signature { isValid }
        }
      }
    } } }
  }`,
    )
    .join("\n")}
}`;

interface EnrichedRepo {
  defaultBranchRef?: { target?: { history?: { nodes?: Array<{ additions?: number; deletions?: number; changedFiles?: number; signature?: { isValid?: boolean } | null }> } } };
  readme?: { text?: string; byteSize?: number } | null;
  licenseInfo?: { spdxId?: string } | null;
  hasWikiEnabled?: boolean;
  hasDiscussionsEnabled?: boolean;
  workflows?: { entries?: unknown[] } | null;
  docsDir?: { entries?: unknown[] } | null;
  contributing?: { byteSize?: number } | null;
  coc?: { byteSize?: number } | null;
  securityPolicy?: { byteSize?: number } | null;
}

async function probe1AllInOne(repos: RepoLite[]) {
  console.log("[1] USER-CORE + REPO-BATCH(4): enriched repos incl. readme text + history(100) + commit sizes + signatures");
  const picks = repos.filter(() => true).slice(0, 8);
  if (picks.length === 0) return;
  await gqlRaw(USER_CORE, { login: username }, "user-core");
  for (let off = 0; off < picks.length; off += 4) {
    const batch = picks.slice(off, off + 4);
    const { data } = await gqlRaw(REPO_ENRICH_BATCH(batch, off), {}, `repo-batch-${off}`);
    for (let j = 0; j < batch.length; j++) {
      const node = data[`repo_${off + j}`] as EnrichedRepo | undefined;
      if (!node) continue;
      const hist = node.defaultBranchRef?.target?.history?.nodes ?? [];
      const withSize = hist.filter((n) => typeof n.additions === "number").length;
      const signed = hist.filter((n) => n.signature?.isValid).length;
      const totalAdd = hist.reduce((a, n) => a + (n.additions ?? 0), 0);
      const community = [node.contributing ? "CONTRIB" : null, node.coc ? "COC" : null, node.securityPolicy ? "SEC" : null].filter(Boolean);
      console.log(`    ${batch[j].name}: license=${node.licenseInfo?.spdxId ?? "-"} wiki=${node.hasWikiEnabled ? "y" : "n"} readme=${node.readme?.byteSize ?? 0}B ci=${node.workflows ? "y" : "n"} docsDir=${node.docsDir ? "y" : "n"} community=[${community.join(",")}]`);
      console.log(`      history: ${hist.length} commits · size-fields ${withSize} · signed ${signed} · +${totalAdd} lines`);
    }
  }
}

async function probe2SearchMega() {
  console.log("\n[2] SEARCH-MEGA: every global counter in one query");
  const q = `query($qPrs:String!,$qMerged:String!,$qExt:String!,$qIss:String!,$qIssC:String!,$qDisc:String!,$qDep:String!) {
  rateLimit { cost remaining }
  prs: search(query:$qPrs, type:ISSUE, first:1) { issueCount }
  prsMerged: search(query:$qMerged, type:ISSUE, first:1) { issueCount }
  prsExternal: search(query:$qExt, type:ISSUE, first:1) { issueCount }
  issuesAuthored: search(query:$qIss, type:ISSUE, first:1) { issueCount }
  issuesClosed: search(query:$qIssC, type:ISSUE, first:1) { issueCount }
  discussionsAuthored: search(query:$qDisc, type:DISCUSSION, first:1) { issueCount }
  reposUsingTheirCode: search(query:$qDep, type:REPOSITORY, first:1) { issueCount }
}`;
  const { data } = await gqlRaw(
    q,
    {
      qDisc: `author:${username} type:discussion`,
      qPrs: `author:${username} type:pr`,
      qMerged: `author:${username} type:pr is:merged`,
      qExt: `author:${username} type:pr is:merged -user:${username}`,
      qIss: `author:${username} type:issue`,
      qIssC: `author:${username} type:issue is:closed`,
      qDep: `dependents:repo-${username}/placeholder-not-real`,
    },
    "search-mega",
  );
  const counts = Object.entries(data)
    .filter(([k]) => k !== "rateLimit")
    .map(([k, v]) => `${k}=${(v as { issueCount?: number })?.issueCount ?? "?"}`)
    .join(" ");
  console.log(`    ${counts}`);
}

async function probe3LatencyBatch(repos: RepoLite[]) {
  console.log("\n[3] LATENCY-BATCH: maintainer-response + self-merge samples for 8 repos in ONE query");
  const picks = repos.slice(0, 8);
  if (picks.length === 0) return;
  const q = `query {
  rateLimit { cost remaining }
  ${picks
    .map(
      (r, i) => `
  repo_${i}: repository(owner:"${r.owner.login}", name:"${r.name}") {
    recentIssues: issues(states:OPEN, first:10, orderBy:{field:CREATED_AT, direction:DESC}) {
      nodes { number createdAt comments(last:1) { nodes { createdAt author { login } } } }
    }
    mergedSample: pullRequests(states:MERGED, first:15, orderBy:{field:UPDATED_AT, direction:DESC}) {
      nodes { number createdAt closedAt author { login } mergedBy { login } }
    }
  }`,
    )
    .join("\n")}
}`;
  const { data } = await gqlRaw(q, {}, "latency-batch");
  const first = data.repo_0 as
    | {
        mergedSample?: { nodes?: Array<{ closedAt: string; createdAt: string; author?: { login: string }; mergedBy?: { login: string } | null }> } | null;
        recentIssues?: { nodes?: Array<{ comments?: { nodes?: Array<{ createdAt: string }> } }> } | null;
      }
    | undefined;
  if (!first?.mergedSample?.nodes?.length) return;
  const merges = first.mergedSample.nodes.map((n) => ({
    days: Math.round((Date.parse(n.closedAt) - Date.parse(n.createdAt)) / 86400000),
    selfMerge: n.author?.login && n.mergedBy?.login ? n.author.login === n.mergedBy.login : null,
  }));
  const med = merges.map((m) => m.days).sort((a, b) => a - b)[Math.floor(merges.length / 2)];
  const selfPct = Math.round((merges.filter((m) => m.selfMerge).length / merges.length) * 100);
  const lastIssueComment = first.recentIssues?.nodes?.find((n) => n.comments?.nodes?.length)?.comments?.nodes?.[0]?.createdAt;
  console.log(`    merge-latency median=${med}d over ${merges.length} PRs · self-merge=${selfPct}% · last-issue-comment=${lastIssueComment ?? "-"}`);
}

async function probe4RestAddons(repos: RepoLite[]) {
  console.log("\n[4] REST-ADDONS: what still genuinely requires REST");
  async function rest(url: string, label: string): Promise<number> {
    fetchCount += 1;
    const t0 = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "gitscore-max-probe" },
    });
    const text = await res.text();
    const kb = Math.round((Buffer.byteLength(text) / 1024) * 10) / 10;
    console.log(`    [${label}] HTTP ${res.status} ${Date.now() - t0}ms · ${kb}KB · x-ratelimit-remaining=${res.headers.get("x-ratelimit-remaining")}`);
    return res.status;
  }
  await rest(`https://api.github.com/users/${username}/events/public?per_page=100`, "events p1 (event-type-mix patterns)");
  await rest(`https://api.github.com/users/${username}/events/public?per_page=100&page=2`, "events p2");
  const top = repos.find((r) => r.forkCount > 0);
  if (top) {
    await rest(`https://api.github.com/repos/${top.owner.login}/${top.name}/compare/main...fork-branch-nonexistent`, "compare probe (fork divergence)");
  }
}

async function main() {
  const repos = await getTopRepos();
  const nonForks = repos.filter((r) => !r.isFork);
  console.log(`  repo pool: ${repos.length} fetched (non-forks: ${nonForks.length})\n`);

  await probe1AllInOne(nonForks.length ? nonForks : repos);
  await probe2SearchMega();
  await probe3LatencyBatch(nonForks.length ? nonForks : repos);
  await probe4RestAddons(repos);

  console.log(`\n=== done: ${fetchCount} HTTP requests this run ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
