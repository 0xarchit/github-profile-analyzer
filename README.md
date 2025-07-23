# GitHub Profile Analyzer

GitHub Profile Analyzer is a serverless web app (Cloudflare Worker) that provides deep insights into any GitHub user's activity, achievements, and contribution patterns. It exposes a set of robust API endpoints for badge detection, contribution heatmaps, rate-limit aggregation, and AI-powered analysis, all in a single deployable file (`worker.js`).

---

## Important Highlights

- **Local Storage Caching:** All API responses are cached in the browser's local storage for 1 hour, minimizing redundant requests and improving performance for repeat visits.
- **Repository Limit:** Only the first 100 repositories (sorted by GitHub's default order) are processed for contribution and badge analysis, ensuring fast response times.
- **Fork Filtering:** For forked repositories, only those in which the user has made at least one commit are included in the analysis. This ensures the stats and graphs reflect the user's actual contributions, not just forks with no activity.
- **Permanent Page URLs:** Each analyzed profile can be accessed via a unique, shareable URL, allowing you to revisit or share the analysis page at any time.
- **Download & Print to PDF:** The analysis page can be downloaded or saved as a PDF (using your browser's "Print to PDF" feature) for offline viewing or sharing.

## Features (Detailed)

### 1. **GitHub API Rate-Limit Aggregation**
- Rotates through multiple GitHub API tokens to maximize available requests.
- Aggregates and exposes the current rate-limit status for all tokens via a single endpoint.
- Ensures high reliability for heavy/automated usage.

### 2. **Contribution Calendar SVG Heatmap**
- Fetches a user's public contribution data using the GitHub GraphQL API.
- Generates a responsive SVG heatmap, visually representing daily contributions with intensity-based coloring.
- Output is suitable for direct embedding in dashboards or web UIs.

### 3. **Achievement Badge Detection**
- Maintains a complete, up-to-date list of all official GitHub achievement badges and their asset URLs.
- Uses efficient HTTP HEAD requests to check which badges a user has unlocked (no scraping or login required).
- Returns badge status as JSON for easy integration.

### 4. **CORS & Security**
- All endpoints are CORS-protected, allowing only requests from a configurable frontend origin.
- Supports secure deployment and integration with any frontend or automation tool.

### 5. **Built-in Caching**
- Caches API responses for improved performance and reduced API usage.
- Smart cache invalidation ensures up-to-date data without excessive requests.

### 6. **AI-Powered Analysis (Cerebras Llama 4)**
- Integrates with Cerebras Llama 4 LLM for advanced, contextual analysis of user contribution patterns.
- Provides natural language summaries and insights about a user's GitHub activity.

### 7. **Unified API**
- All features are accessible via a single Cloudflare Worker (`worker.js`).
- Simple, RESTful endpoints for frontend, automation, or data analysis use.

---

## Complete Workflow & How It Works

1. **Request Handling**
    - The Cloudflare Worker listens for all incoming HTTP requests.
    - Each request is routed based on its path:
        - `/` : Serves a built-in HTML frontend (for demo/testing).
        - `/rate_limit` : Aggregates and returns the rate-limit status for all GitHub tokens.
        - `/contributions?user=USERNAME` : Fetches and returns the SVG heatmap for the specified user.
        - `/api?user=USERNAME` : Returns a complete JSON object with badges, contributions, and profile data for the user.

2. **Badge Detection**
    - For each known GitHub achievement badge, the worker issues a HEAD request to the badge's achievement URL for the target user.
    - If the badge is unlocked, the response is 200 OK; otherwise, it's a 404.
    - The worker compiles a list of unlocked badges and their asset URLs.

3. **Contribution Heatmap Generation**
    - The worker queries the GitHub GraphQL API for the user's public contribution calendar.
    - It processes the data and generates a responsive SVG heatmap, with color intensity mapped to contribution count.

4. **Rate-Limit Aggregation**
    - The worker rotates through all configured GitHub tokens, querying the rate-limit endpoint for each.
    - It aggregates the remaining/used limits and exposes the data as a single JSON object.

5. **AI Analysis (Optional)**
    - If enabled and API keys are provided, the worker sends contribution data to the Cerebras Llama 4 LLM.
    - The LLM returns a natural language summary or insight about the user's activity.

6. **CORS & Caching**
    - All responses include CORS headers, allowing only the configured frontend origin.
    - Frequently requested data is cached for performance and API efficiency.

---

## API Endpoints (Summary)

| Endpoint                | Description                                                      |
|-------------------------|------------------------------------------------------------------|
| `/`                     | Serves the built-in HTML frontend                                |
| `/rate_limit`           | Returns GitHub API rate-limit status for all tokens              |
| `/contributions?user=`  | Returns SVG heatmap of the user's contributions                  |
| `/api?user=`            | Returns JSON with badges, contributions, and profile data        |

---

## Setup (Quick Start)

1. **Copy `worker.js` to your Cloudflare Worker project.**
2. **Open `worker.js` and fill in your GitHub API tokens and Cerebras API keys:**
    - Replace the `githubTokens` and `cerebrasKeys` arrays with your actual keys.
    - Set the `FRONTEND_ORIGIN` variable to your frontend's URL.
3. **Deploy the worker using Cloudflare's dashboard or Wrangler CLI.**

---

## License

See [LICENSE](LICENSE) file.