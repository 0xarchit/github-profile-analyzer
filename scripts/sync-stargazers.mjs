import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const GITHUB_REPO = '0xarchit/github-profile-analyzer';
const DB_NAME = process.env.CLOUDFLARE_DATABASE_NAME;

if (!DB_NAME) {
  console.error("Error: CLOUDFLARE_DATABASE_NAME environment variable is required.");
  process.exit(1);
}

function runWrangler(command) {
  try {
    const output = execSync(`npx wrangler d1 execute ${DB_NAME} --remote --command "${command.replace(/"/g, '\\"')}" --json`, {
      env: { ...process.env },
      encoding: 'utf-8'
    });
    return JSON.parse(output);
  } catch (err) {
    console.error(`Wrangler execution failed for query: ${command}`, err.message);
    throw err;
  }
}

async function fetchGitHubStarCount() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'GitScore-Sync-Script',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.stargazers_count;
}

async function fetchAllStargazers() {
  let stargazers = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/stargazers?per_page=100&page=${page}`;
    const headers = {
      'Accept': 'application/vnd.github.v3.star+json',
      'User-Agent': 'GitScore-Sync-Script',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error at page ${page}: ${await res.text()}`);
    }
    const data = await res.json();
    if (data.length === 0) break;
    
    stargazers.push(...data.map(item => ({
      username: item.user.login.toLowerCase(),
      starred_at: item.starred_at
    })));
    
    const link = res.headers.get('link');
    if (!link || !link.includes('rel="next"')) {
      break;
    }
    page++;
  }
  return stargazers;
}

async function main() {
  try {
    console.log("Checking star counts...");
    const githubCount = await fetchGitHubStarCount();
    console.log(`GitHub repository star count: ${githubCount}`);

    const d1Result = runWrangler("SELECT COUNT(*) as count FROM stargazers");
    const d1Count = d1Result[0]?.results?.[0]?.count ?? 0;
    console.log(`D1 database stargazers count: ${d1Count}`);

    if (githubCount === d1Count) {
      console.log("Database count matches GitHub count. Sync is not required.");
      process.exit(0);
    }

    console.log("Counts mismatch! Initiating full synchronization...");
    const stargazers = await fetchAllStargazers();
    console.log(`Fetched ${stargazers.length} stargazers from GitHub API.`);

    if (stargazers.length === 0) {
      console.log("No stargazers found. Clearing D1 stargazers table...");
      runWrangler("DELETE FROM stargazers");
      console.log("Sync complete.");
      process.exit(0);
    }

    const sqlFile = path.join(process.cwd(), 'sync_temp.sql');
    let sqlContent = 'BEGIN TRANSACTION;\nDELETE FROM stargazers;\n';
    
    for (const sg of stargazers) {
      const escapedUser = sg.username.replace(/'/g, "''");
      sqlContent += `INSERT INTO stargazers (username, created_at) VALUES ('${escapedUser}', '${sg.starred_at}');\n`;
    }
    
    sqlContent += 'COMMIT;\n';
    fs.writeFileSync(sqlFile, sqlContent);

    console.log("Applying batch SQL file to Cloudflare D1...");
    try {
      execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=sync_temp.sql`, {
        env: { ...process.env },
        stdio: 'inherit'
      });
      console.log("Cloudflare D1 sync completed successfully!");
    } finally {
      if (fs.existsSync(sqlFile)) {
        fs.unlinkSync(sqlFile);
      }
    }

  } catch (err) {
    console.error("Synchronization failed:", err);
    process.exit(1);
  }
}

main();
