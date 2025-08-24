# GitHub Profile Analyzer

> AI Powered Github Profile analyzer and reviewer tool. Gives review based on first 100 repos and only includes those forks in which user has contributions to avoid fake results

Serverless GitHub profile analytics you can deploy in minutes. This project ships:

- A single, production-ready Cloudflare Worker (`worker.js`) that powers the UI and APIs
- Two demo Workers for standalone usage: `contri-graph.js` (SVG contribution heatmap) and `badge.js` (achievement badges)

This README documents every API, parameters, responses, configuration, and how the system works end-to-end.

---

## Contents

- [Overview and architecture](#overview-and-architecture)
- [Important Highlight](#important-highlights)
- [Configuration (tokens, origins, env)](#configuration-tokens-origins-env)
- [API reference: worker.js (all-in-one)](#api-reference-workerjs-all-in-one)
- [API reference: contri-graph.js (demo)](#api-reference-contri-graphjs-demo)
- [API reference: badge.js (demo)](#api-reference-badgejs-demo)
- [Caching, rate limits, and security](#caching-rate-limits-and-security)
- [Examples and embeds](#examples-and-embeds)
- [Deploy with Cloudflare Workers](#deploy-with-cloudflare-workers)
- [Troubleshooting](#troubleshooting)

---

## Overview and architecture

`worker.js` handles:

- GET `/` — serves a built-in Tailwind UI that calls the APIs
- GET `/rate_limit` — aggregates GitHub REST API rate limits across multiple tokens
- GET `/contributions?username=<user>` — returns an SVG heatmap of public contributions
- GET `/api?username=<user>` — returns a unified JSON: profile, repos, authored forks, badges, and an AI analysis

Additionally, the UI embeds third‑party stat images (readme-stats, streaks, trophies) and provides print/save features. The Worker enforces CORS for sensitive endpoints and uses both CDN and browser caching to reduce API load.

Demo Workers:

- `contri-graph.js`: minimal, tokenized SVG generator for contribution heatmaps
- `badge.js`: minimal badge resolver that returns unlocked GitHub achievements and their image URLs

---

## Important Highlights

- **Local Storage Caching:** All API responses are cached in the browser's local storage for 1 hour, minimizing redundant requests and improving performance for repeat visits.
- **Repository Limit:** Only the first 100 repositories (sorted by GitHub's default order) are processed for contribution and badge analysis, ensuring fast response times.
- **Fork Filtering:** For forked repositories, only those in which the user has made at least one commit are included in the analysis. This ensures the stats and graphs reflect the user's actual contributions, not just forks with no activity.
- **Permanent Page URLs:** Each analyzed profile can be accessed via a unique, shareable URL, allowing you to revisit or share the analysis page at any time.
- **Download & Print to PDF:** The analysis page can be downloaded or saved as a PDF (using your browser's "Print to PDF" feature) for offline viewing or sharing.

## Configuration

Open `worker.js` and customize:

- `const githubTokens = ["api_keys"];`
    - Array of one or more GitHub personal access tokens (classic or fine‑grained) with public repo read permissions.
    - Used for REST and GraphQL calls; one is randomly chosen per request.

- `const cerebrasKeys = ["api_keys"];`
    - Array of Cerebras API keys, used to call `https://api.cerebras.ai/v1/chat/completions` for the AI section.
    - If unavailable, the `/api` route will fail at the AI step. Provide a key or adjust the code to disable AI.

- `const FRONTEND_ORIGIN = 'deployemnt_link';`
    - Only requests where the Origin/Referer starts with this string are allowed for `/api` and `/contributions`.
    - Example: `https://git.yourdomain.workers.dev` or `https://your-frontend.example.com`.

Other noteworthy constants and behavior:

- Badge slugs checked: pull-shark, starstruck, pair-extraordinaire, galaxy-brain, yolo, quickdraw, highlight, community, deep-diver, arctic-code-vault-contributor, public-sponsor, heart-on-your-sleeve, open-sourcerer
- Achievements are validated via a cheap `HEAD` probe to `https://github.com/<user>?tab=achievements&achievement=<slug>`
- Star gating: `/api` checks if the user has starred `0xarchit/github-profile-analyzer` and returns 403 otherwise. You can change this repo string inside `worker.js` if needed.

---

## API reference: worker.js (all-in-one)

Base URL: your Cloudflare Worker URL (for development examples we’ll use `https://<your-worker>.workers.dev`).

Security and CORS:

- `/api` and `/contributions` require the request Origin or Referer to start with `FRONTEND_ORIGIN`.
- `/rate_limit` and `/` do not enforce this CORS check.

Common errors:

- 403 Cross-origin requests are not allowed — Origin/Referer mismatch for protected routes
- 403 You have not starred the repository — star-gating rule in `/api`
- 429 GitHub API rate limit exceeded — aggregate remaining is 0 across selected token
- 500 Worker error — unexpected runtime error

### GET `/`

Serves the built-in UI. Supports `?username=<user>` to pre-fill and auto-run.

### GET `/rate_limit`

Aggregates GitHub rate-limit across all tokens defined in `githubTokens`.

Response 200 application/json:

```
{
    "rate": { "limit": number, "used": number, "remaining": number }
}
```

Notes:

- Calls `https://api.github.com/rate_limit` once per token and sums fields from `data.rate`.

### GET `/contributions?username=<user>`

Returns an SVG heatmap representing the user’s public contributions. Internally uses GitHub GraphQL API.

Parameters:

- `username` (required): GitHub login

Behavior:

- Queries `contributionsCollection.contributionCalendar.weeks[].contributionDays[]`
- Computes a max intensity, renders a 7×N grid (weeks×days)
- Colors: `#2f3727` for zero; `rgba(0,255,0, alpha)` for >0 with alpha scaled by intensity
- CDN caching: `Cache-Control: public, max-age=3600` and saved in `caches.default` by URL

Responses:

- 200 image/svg+xml — SVG content
- 400 application/json — `{ error: "Username parameter is required" }`
- 403 application/json — CORS blocked (`FRONTEND_ORIGIN` mismatch)
- 4xx/5xx application/json — GitHub API errors forwarded with message

Embed example (HTML):

```html
<img src="https://<your-worker>.workers.dev/contributions?username=octocat" alt="octocat contributions"/>
```

### GET `/api?username=<user>`

Returns a unified JSON combining public profile, repositories, authored forks, unlocked badges, and an AI analysis.

Parameters:

- `username` (required)

Request pre-checks:

- CORS: Origin/Referer must start with `FRONTEND_ORIGIN`
- Rate limit: queries `https://api.github.com/rate_limit`; if `remaining` is 0 returns 429
- Star gating: fetches `GET /users/<user>/starred?per_page=1000&page=1` and checks presence of `0xarchit/github-profile-analyzer`. If missing, returns 403 with `{ showPopup: true }` to instruct the UI to show a “Star this repo” prompt

Collection logic:

- Profile via `GET /users/<user>`
- Repositories via `GET /users/<user>/repos?per_page=100&page=1`
    - Only first 100 repos considered
    - Two buckets are returned:
        - `original_repos`: non-forks
        - `authored_forks`: forks where the user has at least one commit (checked with `GET /repos/<user>/<repo>/commits?per_page=100` and matching `author.login === <user>`)
- Badges via achievement `HEAD` checks for known slugs
- AI via Cerebras chat completions with a JSON-only system prompt; model `llama-4-scout-17b-16e-instruct`

Response 200 application/json (shape):

```
{
    "avatar": string | null,
    "username": string | null,
    "name": string | null,
    "company": string | null,
    "location": string | null,
    "blog": string | null,
    "bio": string | null,
    "email": string | null,
    "twitter": string | null,
    "followers": number,
    "following": number,
    "public_repo_count": number,
    "original_repos": {
        "<repoName>": {
            "description": string | null,
            "stars": number,
            "forks": number,
            "issues": number,
            "watchers": number,
            "primary_lang": string | null,
            "has_issues": boolean,
            "has_projects": boolean,
            "has_wiki": boolean,
            "has_pages": boolean,
            "has_downloads": boolean,
            "has_discussions": boolean,
            "license": object,
            "topics": string[]
        },
        ...
    },
    "authored_forks": { ...same shape as above... },
    "badges": { "<slug>": "<imageUrl>", ... },

    // AI section (from Cerebras)
    "score": number,                 // 0..100
    "detailed_analysis": string,
    "improvement_areas": string[],
    "diagnostics": string[],
    "project_ideas": {
        "project_idea_1": { "title": string, "description": string, "tech stack"?: string[], "tech_stack"?: string[] },
        "project_idea_2": { ... },
        "project_idea_3"?: { ... }
    },
    "tag"?: { "tag_name"?: string, "description"?: string, ... },
    "developer_type"?: string
}
```

Error responses:

- 400 `{ error: "Username parameter is required" }`
- 403 `{ error: "Cross-origin requests are not allowed" }`
- 403 `{ error: "You have not starred the 0xarchit/github-profile-analyzer repository", showPopup: true }`
- 429 `{ error: "GitHub API rate limit exceeded" }`
- 4xx/5xx `{ error: "Failed to fetch ..." }`

Notes and limitations:

- Commit check for authored forks examines up to 100 latest commits per repo; earlier commits may be missed
- Only public data is analyzed; private repos and private contributions are invisible
- If Cerebras call fails, the route returns an error; you may opt to try/catch and continue without AI

---

## API reference: contri-graph.js (demo)

This is a minimal Worker that returns an SVG heatmap. It expects you to set a single GitHub token inside the file.

Route: GET `/?username=<user>`

Parameters:

- `username` (required)

Behavior and differences vs `worker.js`:

- No CORS check
- Requires `const token = "<YOUR_GITHUB_TOKEN>"` to be set
- Returns SVG with the same visual logic (7×N grid, intensity scaling)

Responses:

- 200 image/svg+xml — heatmap
- 400 `{ error: "Username is required" }`
- 500 `{ error: "GitHub token not configured" }` or forwarded API errors

---

## API reference: badge.js (demo)

This is a minimal Worker that resolves GitHub achievement badges for a user.

Route: GET `/?username=<user>`

Parameters:

- `username` (required)

Behavior:

- Issues `HEAD` probes to each known achievement URL
- If 200, includes the badge slug and its official image URL in the response

Response 200 application/json:

```
{
    "pull-shark": "https://...png",
    "starstruck": "https://...png",
    ...
}
```

Errors:

- 500 `{ error: "No username provided" }` or network errors

---

## Caching, rate limits, and security

- Cloudflare cache: `/contributions` responses cached for 1 hour (`Cache-Control: public, max-age=3600`) keyed by URL
- Browser cache: the UI stores `/api` responses in `localStorage` for 1 hour per username key
- Token rotation: each server call picks a random token from `githubTokens`
- CORS: `/api` and `/contributions` enforce `FRONTEND_ORIGIN` via Origin/Referer check

---

## Examples and embeds

PowerShell (Windows) examples:

```
# Rate limit
irm "https://<your-worker>.workers.dev/rate_limit" | ConvertTo-Json

# Contributions SVG (save to file)
irm "https://<your-worker>.workers.dev/contributions?username=octocat" -OutFile contrib.svg

# Unified analysis JSON
irm "https://<your-worker>.workers.dev/api?username=octocat" | ConvertTo-Json
```

HTML embed for heatmap:

```html
<img src="https://<your-worker>.workers.dev/contributions?username=octocat" alt="octocat contributions heatmap" />
```

---

## Deploy with Cloudflare Workers

1) Add your tokens in `worker.js`:

- `githubTokens`: at least one GitHub token
- `cerebrasKeys`: one Cerebras key (or adjust code to skip AI)
- `FRONTEND_ORIGIN`: your site origin that’s permitted to call the protected endpoints

2) Deploy

- Via dashboard: create a Worker, paste `worker.js`, deploy
- Via Wrangler: create a project and set `main` to `worker.js`, then `wrangler deploy`

3) (Optional) Bind D1 and deploy `count.js` separately if you want counters

---

## Troubleshooting

- 403 Cross-origin requests are not allowed
    - Ensure your request Origin/Referer starts with `FRONTEND_ORIGIN`

- 403 You have not starred the repository
    - Star `https://github.com/0xarchit/github-profile-analyzer`
    - Or edit the repository name string inside `worker.js`

- 429 GitHub API rate limit exceeded
    - Add more tokens to `githubTokens` or wait for reset

- Blank/low data
    - Private repos and private contributions aren’t visible; only public data is analyzed
    - Authored-forks detection checks only the last 100 commits per repo

---

## License

See [LICENSE](LICENSE).

[Back to top](#github-profile-analyzer)