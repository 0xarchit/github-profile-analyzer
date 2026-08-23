import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
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

const username = process.argv[2];
if (!username) {
  console.error("Usage: npx tsx scripts/quota-audit.mts <username>");
  process.exit(1);
}

const CF_TOTAL_LIMIT = 50;
const REPO_LIMIT = 10;
const FORK_COMPARE_LIMIT = 5;
const CI_PROFILE_REPOS = 5;

let restUsed = 0;
let gqlUsed = 0;
const ledger: Array<{ bucket: string; label: string; ms: number; kb: number; ok: boolean }> = [];

async function rest<T>(url: string, label: string): Promise<T | null> {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "gitscore-quota-audit" },
  });
  const text = await res.text();
  restUsed += 1;
  const kb = Math.round(Buffer.byteLength(text) / 102.4) / 10;
  let json: unknown = null;
  try { json = JSON.parse(text); } catch {}
  ledger.push({ bucket: "REST", label, ms: Date.now() - t0, kb, ok: res.ok });
  console.log(`  [REST #${restUsed}] ${label}: ${res.status} ${Date.now() - t0}ms ${kb}KB`);
  if (!res.ok) console.log(`    !! ${String(text).slice(0, 160)}`);
  return res.ok ? (json as T) : null;
}

async function gql<T>(query: string, variables: Record<string, unknown>, label: string): Promise<{ data: Partial<T> | null; errors: string[] }> {
  const t0 = Date.now();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "gitscore-quota-audit" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  gqlUsed += 1;
  const kb = Math.round(Buffer.byteLength(text) / 102.4) / 10;
  let body: { data?: T; errors?: Array<{ message: string }> };
  try { body = JSON.parse(text); } catch { body = {}; }
  const errors = (body.errors ?? []).map((e) => e.message.slice(0, 200));
  ledger.push({ bucket: "GQL", label, ms: Date.now() - t0, kb, ok: !errors.length && res.ok });
  console.log(`  [GQL  #${gqlUsed}] ${label}: ${res.status} ${Date.now() - t0}ms ${kb}KB${errors.length ? ` · ERRORS: ${errors.length}` : ""}`);
  for (const err of errors.slice(0, 4)) console.log(`    !! ${err}`);
  return { data: body.data ?? null, errors };
}

interface RepoLite { name: string; ownerLogin: string; stars: number; forks: number; pushedAt: string; isFork: boolean; }

async function probeRepoList(): Promise<{ repos: RepoLite[]; pagesUsed: number }> {
  console.log("\n[repo-list] paginated GraphQL repository discovery");
  const repos: RepoLite[] = [];
  let cursor: string | null = null;
  let pagesUsed = 0;
  for (let page = 1; page <= 3; page += 1) {
    const gqlRes = await gql<{ user: null | { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<null | { name: string; owner: { login: string }; stargazerCount: number; forkCount: number; pushedAt: string; isFork: boolean; isPrivate?: boolean }> } } | null }>(
      `query($login:String!,$cursor:String) {
        user(login:$login) {
          repositories(first:100, after:$cursor, ownerAffiliations:[OWNER], orderBy:{field:PUSHED_AT, direction:DESC}) {
            pageInfo { hasNextPage endCursor }
            nodes { name owner { login } stargazerCount forkCount pushedAt isFork isPrivate }
          }
        }
      }`,
      { login: username, cursor },
      `repo-list-p${page}`,
    );
    const data = gqlRes.data as { user: null | { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<null | { name: string; owner: { login: string }; stargazerCount: number; forkCount: number; pushedAt: string; isFork: boolean; isPrivate?: boolean }> } | null } | null };
    pagesUsed = page;
    const conn = data?.user?.repositories;
    if (!conn) break;
    for (const n of conn.nodes) {
      if (n && !n.isFork && !n.isPrivate) repos.push({ name: n.name, ownerLogin: n.owner.login, stars: n.stargazerCount, forks: n.forkCount, pushedAt: n.pushedAt, isFork: Boolean(n.isFork) });
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return { repos: repos.slice(0, REPO_LIMIT), pagesUsed };
}

async function probeProfileCoreV3(): Promise<void> {
  console.log("\n[profile-core-v3] main user query + ALL tier-A aliases + previous-year alias (tier B free)");
  const now = new Date();
  const to = now.toISOString();
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const twoYearsAgo = new Date(now.getTime() - 730 * 86_400_000).toISOString();
  const { data } = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!,$prevFrom:DateTime!) {
      user(login:$login) {
        login name createdAt followers { totalCount } following { totalCount }
        followersList: followers(first:100) { nodes { login } }
        followingList: following(first:100) { nodes { login } }
        pinnedItems(first:6, types:[REPOSITORY]) { nodes { ... on Repository { nameWithOwner stargazerCount owner { login } } } }
        starredRepositories { totalCount }
        sponsoring(first:10) { totalCount nodes { ... on User { login } } }
        repositoriesContributedTo(first:1, includeUserRepositories:false) { totalCount }
        pullRequests(first:100, orderBy:{field:CREATED_AT, direction:DESC}) {
          nodes { createdAt mergedAt mergedBy { login } repository { nameWithOwner owner { login } } }
        }
        recent: contributionsCollection(from:$from, to:$to) {
          totalCommitContributions restrictedContributionsCount contributionYears
          totalPullRequestReviewContributions totalPullRequestContributions totalIssueContributions
          contributionCalendar { totalContributions weeks { contributionDays { date contributionCount weekday } } }
          commitContributionsByRepository(maxRepositories:100) { repository { nameWithOwner } contributions { totalCount } }
          pullRequestReviewContributions(first:100) { nodes { occurredAt pullRequest { title repository { nameWithOwner owner { login } } } } }
        }
        previousYear: contributionsCollection(from:$prevFrom, to:$from) {
          totalCommitContributions
          contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
        }
      }
      rateLimit { cost remaining }
    }`,
    { login: username, from: yearAgo, to, prevFrom: twoYearsAgo },
    "profile-core-v3",
  );
  const u = (data as { user?: null | {
    sponsoring?: { totalCount: number; nodes?: Array<{ login?: string } | null> };
    recent?: { pullRequestReviewContributions?: { nodes?: Array<{ pullRequest?: { repository?: { nameWithOwner: string } } | null } | null> } };
    previousYear?: { contributionCalendar?: { totalContributions: number } };
    followersList?: { nodes?: Array<{ login: string } | null> };
  } })?.user;
  if (!u) return;
  const sponsorLogins = (u.sponsoring?.nodes ?? []).filter(Boolean).map((n) => n!.login).filter(Boolean);
  const reviewsWithRepo = (u.recent?.pullRequestReviewContributions?.nodes ?? []).filter((n) => n?.pullRequest?.repository?.nameWithOwner).length;
  const reviewTotal = (u.recent?.pullRequestReviewContributions?.nodes ?? []).length;
  console.log(`    tier-B previousYear calendar: ${u.previousYear?.contributionCalendar?.totalContributions ?? "?"} contributions (2nd year, FREE alias)`);
  console.log(`    tier-A sponsoring logins: [${sponsorLogins.join(",")}] (${u.sponsoring?.totalCount ?? 0} total)`);
  console.log(`    tier-A review-repo attribution: ${reviewsWithRepo}/${reviewTotal} reviews have repository`);
}

async function probeRepoEnrichment(repos: RepoLite[]): Promise<void> {
  console.log(`\n[repo-enrichment] batches of 4 x ${Math.ceil(repos.length / 4)} requests incl. tier-A fields`);
  for (let off = 0; off < repos.length; off += 4) {
    const batch = repos.slice(off, off + 4);
    const q = `query {
      rateLimit { cost remaining }
      ${batch.map((r, i) => `
      repo_${off + i}: repository(owner:"${r.ownerLogin}", name:"${r.name}") {
        description homepageUrl createdAt pushedAt updatedAt
        isFork isArchived isTemplate isEmpty isDisabled isPrivate
        hasIssuesEnabled hasWikiEnabled hasDiscussionsEnabled
        licenseInfo { spdxId } repositoryTopics(first:10) { nodes { topic { name } } }
        stargazerCount forkCount watchers { totalCount }
        openIssues: issues(states:OPEN) { totalCount } closedIssues: issues(states:CLOSED) { totalCount }
        openPRs: pullRequests(states:OPEN) { totalCount } mergedPRs: pullRequests(states:MERGED) { totalCount }
        discussions(first:1) { totalCount } milestones(first:1) { totalCount }
        latestRelease { tagName publishedAt }
        languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name } } }
        releases(first:10, orderBy:{field:CREATED_AT, direction:DESC}) { nodes { tagName publishedAt isPrerelease description releaseAssets(first:10) { nodes { downloadCount } } } }
        tags: refs(refPrefix:"refs/tags/", first:10) { totalCount nodes { name } }
        readme: object(expression:"HEAD:README.md") { ... on Blob { byteSize text } }
        rootTree: object(expression:"HEAD:") { ... on Tree { entries { name type } } }
        githubDir: object(expression:"HEAD:.github") { ... on Tree { entries { name } } }
        contributing: object(expression:"HEAD:CONTRIBUTING.md") { ... on Blob { byteSize } }
        codeOfConduct: object(expression:"HEAD:CODE_OF_CONDUCT.md") { ... on Blob { byteSize } }
        securityPolicy: object(expression:"HEAD:SECURITY.md") { ... on Blob { byteSize } }
        funding: object(expression:"HEAD:.github/FUNDING.yml") { ... on Blob { byteSize } }
        templates: object(expression:"HEAD:.github/ISSUE_TEMPLATE") { ... on Tree { entries { name } } }
        workflows: object(expression:"HEAD:.github/workflows") { ... on Tree { entries { name } } }
        docsDir: object(expression:"HEAD:docs") { ... on Tree { entries { name } } }
        recentForks: forks(first:30, orderBy:{field:CREATED_AT, direction:DESC}) { nodes { name pushedAt stargazerCount forkCount createdAt updatedAt } }
        defaultBranchRef { target { ... on Commit {
          statusCheckRollup { state }
          history(first:100) {
            totalCount
            nodes { oid committedDate authoredDate messageHeadline additions deletions changedFiles author { user { login } } signature { isValid } parents(first:1) { totalCount } }
          }
        } } }
      }`).join("\n")}
    }`;
    const gqlRes = await gql<Record<string, unknown>>(q, {}, `enrich-batch-${off}`);
    const first = (gqlRes.data as Record<string, unknown> | null)?.[`repo_${off}`] as null | { defaultBranchRef?: { target?: { statusCheckRollup?: { state?: string }; history?: { nodes?: unknown[] } } } } | null;
    if (first) {
      console.log(`    tier-A HEAD CI state: ${first.defaultBranchRef?.target?.statusCheckRollup?.state ?? "none"} · commits: ${(first.defaultBranchRef?.target?.history?.nodes ?? []).length}`);
    }
  }
}

async function probeSearchMegaV3(): Promise<void> {
  console.log("\n[search-mega-v3] all counters + external acceptance + resonance + discussions answered");
  const { data } = await gql(
    `query($a:String!,$b:String!,$c:String!,$d:String!,$e:String!,$f:String!,$g:String!,$h:String!,$i:String!,$j:String!) {
      prs: search(query:$a, type:ISSUE, first:1) { issueCount }
      prsMerged: search(query:$b, type:ISSUE, first:1) { issueCount }
      prsExternalMerged: search(query:$c, type:ISSUE, first:1) { issueCount }
      prsExternalOpened: search(query:$d, type:ISSUE, first:1) { issueCount }
      issuesAuthored: search(query:$e, type:ISSUE, first:1) { issueCount }
      issuesClosed: search(query:$f, type:ISSUE, first:1) { issueCount }
      discussionsAuthored: search(query:$g, type:DISCUSSION, first:1) { issueCount }
      discussionsAnswered: search(query:$h, type:DISCUSSION, first:1) { issueCount }
      commenterEvents: search(query:$i, type:ISSUE, first:1) { issueCount }
      highResonance: search(query:$j, type:ISSUE, first:1) { issueCount }
    }`,
    {
      a: `author:${username} type:pr`,
      b: `author:${username} type:pr is:merged`,
      c: `author:${username} type:pr is:merged -user:${username}`,
      d: `author:${username} type:pr -user:${username}`,
      e: `author:${username} type:issue`,
      f: `author:${username} type:issue is:closed`,
      g: `author:${username} type:discussion`,
      h: `author:${username} type:discussion is:answered`,
      i: `commenter:${username} -author:${username}`,
      j: `author:${username} type:issue reactions:>2`,
    },
    "search-mega-v3",
  );
  const d = data as null | Record<string, { issueCount?: number } | undefined>;
  if (d) {
    const extOpen = d.prsExternalOpened?.issueCount ?? 0;
    const extMerged = d.prsExternalMerged?.issueCount ?? 0;
    console.log(`    tier-A external acceptance: ${extMerged}/${extOpen} = ${extOpen ? Math.round((extMerged / extOpen) * 100) : 0}%`);
    console.log(`    tier-A resonance (issues w/ >2 reactions): ${d.highResonance?.issueCount ?? "?"}`);
    console.log(`    tier-A discussions answered: ${d.discussionsAnswered?.issueCount ?? "?"}/${d.discussionsAuthored?.issueCount ?? "?"}`);
    console.log(`    tier-A commenter events: ${d.commenterEvents?.issueCount ?? "?"}`);
  }
}

async function probeIssueBatch(repos: RepoLite[]): Promise<void> {
  console.log("\n[issue-batch] response latency + labels (tier A) in ONE request");
  const vars: Record<string, unknown> = {};
  const fields = repos
    .map((r, i) => {
      vars[`o${i}`] = r.ownerLogin;
      vars[`n${i}`] = r.name;
      return `
    r${i}: repository(owner:$o${i}, name:$n${i}) {
      open: issues(states:OPEN) { totalCount }
      closed: issues(states:CLOSED) { totalCount }
      discussions { totalCount }
      recent: issues(first:25, orderBy:{field:CREATED_AT, direction:DESC}) {
        nodes { createdAt labels(first:5) { nodes { name } } comments(first:1) { nodes { createdAt } } }
      }
    }`;
    })
    .join("\n");
  const decls = repos.map((_, i) => `$o${i}: String!, $n${i}: String!`).join(", ");
  await gql(`query IssueBatch(${decls}) { ${fields} }`, vars, "issue-batch-all-repos");
}

async function probeAuthoredIssueResponses(searchResult: { issuesAuthored?: number }): Promise<void> {
  console.log("\n[authored-issue-responses] one batched request (up to 25 aliases)");
  const { data } = await gql<{ searchIssues?: { nodes?: Array<{ number: number; repository: { nameWithOwner: string } }> } }>(
    `query($q:String!) { searchIssues: search(query:$q, type:ISSUE, first:25) { nodes { ... on Issue { number repository { nameWithOwner } } } } }`,
    { q: `author:${username} type:issue` },
    "authored-issues-fetch",
  );
  void searchResult;
  const items = (data?.searchIssues?.nodes ?? []).slice(0, 25);
  if (!items.length) return;
  const vars: Record<string, unknown> = {};
  const fields = items
    .map((item, i) => {
      const [owner, repo] = item.repository.nameWithOwner.split("/");
      vars[`o${i}`] = owner;
      vars[`n${i}`] = repo;
      vars[`num${i}`] = item.number;
      return `i${i}: repository(owner:$o${i}, name:$n${i}) { issue(number:$num${i}) { createdAt comments(first:1) { nodes { createdAt } } } }`;
    })
    .join("\n");
  const decls = items.map((_, i) => `$o${i}: String!, $n${i}: String!, $num${i}: Int!`).join(", ");
  await gql(`query AuthoredIssueResponses(${decls}) { ${fields} }`, vars, "authored-issue-responses");
}

async function probePinnedEnrichment(): Promise<string[]> {
  console.log("\n[pinned-enrichment] tier B: showcase repos in ONE aliased request");
  const { data } = await gql<{ user?: { pinnedItems?: { nodes?: Array<{ nameWithOwner?: string; owner?: { login: string } } | null> } } }>(
    `query($login:String!) { user(login:$login) { pinnedItems(first:6, types:[REPOSITORY]) { nodes { ... on Repository { nameWithOwner owner { login } } } } } }`,
    { login: username },
    "pinned-names",
  );
  const pinned = (data?.user?.pinnedItems?.nodes ?? []).filter((n): n is { nameWithOwner: string; owner: { login: string } } => Boolean(n?.nameWithOwner));
  if (!pinned.length) return [];
  const q = `query {
    ${pinned.map((p, i) => `
    pin_${i}: repository(owner:"${p.owner.login}", name:"${p.nameWithOwner.split("/")[1]}") {
      description primaryLanguage { name } stargazerCount forkCount pushedAt
      readme: object(expression:"HEAD:README.md") { ... on Blob { byteSize } }
      licenseInfo { spdxId }
      languages(first:5, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name } } }
    }`).join("\n")}
  }`;
  await gql(q, {}, "pinned-enrichment-batch");
  return pinned.map((p) => p.nameWithOwner);
}

async function probeRestAddons(repos: RepoLite[], forks: RepoLite[]): Promise<number> {
  console.log("\n[rest-addons] events window, subscriptions, orgs, community profiles, actions runs, fork compares");
  await rest(`https://api.github.com/users/${username}/events/public?per_page=100`, "events p1");
  await rest(`https://api.github.com/users/${username}/events/public?per_page=100&page=2`, "events p2 (tier B)");
  await rest(`https://api.github.com/users/${username}/events/public?per_page=100&page=3`, "events p3 (tier B)");
  await rest(`https://api.github.com/users/${username}/subscriptions?per_page=100`, "subscriptions");
  await rest(`https://api.github.com/users/${username}/orgs?per_page=100`, "public orgs");
  await rest(`https://api.github.com/users/${username}/gists?per_page=100`, "public gists (REST - PAT-safe)");

  for (let i = 0; i < Math.min(CI_PROFILE_REPOS, repos.length); i++) {
    await rest(`https://api.github.com/repos/${repos[i]!.ownerLogin}/${repos[i]!.name}/community/profile`, `community-profile ${repos[i]!.name} (tier C)`);
  }
  for (let i = 0; i < Math.min(CI_PROFILE_REPOS, repos.length); i++) {
    await rest(`https://api.github.com/repos/${repos[i]!.ownerLogin}/${repos[i]!.name}/actions/runs?per_page=20`, `actions-runs ${repos[i]!.name} (tier C)`);
  }
  let forkReqUsed = 0;
  for (const fork of forks.slice(0, FORK_COMPARE_LIMIT)) {
    await rest(`https://api.github.com/repos/${fork.ownerLogin}/${fork.name}/compare/main...${username}:main`, `fork-compare ${fork.name}`);
    forkReqUsed += 1;
  }
  return forkReqUsed;
}

async function main() {
  console.log(`\n=== GitScore QUOTA AUDIT :: ${username} ===\n`);

  await rest("https://api.github.com/rate_limit", "rate-limit probe");
  const { repos, pagesUsed } = await probeRepoList();
  console.log(`  -> ${repos.length} non-fork repos sampled (${pagesUsed} page request(s))\n`);

  await probeProfileCoreV3();
  await probeRepoEnrichment(repos);
  await probeSearchMegaV3();
  await probeIssueBatch(repos);
  await probePinnedEnrichment();
  await probeAuthoredIssueResponses({});

  const forksOfOwn = repos.filter((r) => r.forks > 0).sort((a, b) => b.forks - a.forks);
  const forkReqUsed = await probeRestAddons(repos, forksOfOwn);

  const totalThisRun = restUsed + gqlUsed;
  const unspentRepoPages = Math.max(0, 3 - pagesUsed);
  const unspentForkCompares = Math.max(0, FORK_COMPARE_LIMIT * 2 - forkReqUsed);
  const worstCase = totalThisRun + unspentRepoPages + unspentForkCompares;

  console.log(`\n══════════════ QUOTA AUDIT ══════════════`);
  console.log(`  This run:           REST ${restUsed} + GQL ${gqlUsed} = ${totalThisRun}`);
  console.log(`  Worst-case proj.:   +${unspentRepoPages} extra repo pages, +${unspentForkCompares} fork-compare calls = ${worstCase}`);
  console.log(`  Cloudflare cap:     ${CF_TOTAL_LIMIT} subrequests/request`);
  console.log(`  VERDICT:            ${worstCase <= CF_TOTAL_LIMIT ? "✅ PASS — full Tier A+B+C fits" : `❌ OVER by ${worstCase - CF_TOTAL_LIMIT} — trim Tier C first`}`);
  console.log(`  Slowest calls:      ${[...ledger].sort((a, b) => b.ms - a.ms).slice(0, 3).map((l) => `${l.label} ${l.ms}ms`).join(" · ")}`);
  const failed = ledger.filter((l) => !l.ok);
  console.log(`  Failed probes:      ${failed.length}${failed.length ? ` → ${failed.map((l) => l.label).join(", ")}` : ""}`);
  console.log(`══════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
