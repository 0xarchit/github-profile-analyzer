// standalone worker.js file

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const badgeAssets = {
  "pull-shark": "https://github.githubassets.com/assets/pull-shark-default-498c279a747d.png",
  "starstruck": "https://github.githubassets.com/assets/starstruck-default--light-medium-65b31ef2251e.png",
  "pair-extraordinaire": "https://github.githubassets.com/assets/pair-extraordinaire-default-579438a20e01.png",
  "galaxy-brain": "https://github.githubassets.com/assets/galaxy-brain-default-847262c21056.png",
  "yolo": "https://github.githubassets.com/assets/yolo-default-be0bbff04951.png",
  "quickdraw": "https://github.githubassets.com/assets/quickdraw-default--light-medium-5450fadcbe37.png",
  "highlight": "https://github.githubassets.com/assets/highlight-default--light-medium-30e41ef7e6e7.png",
  "community": "https://github.githubassets.com/assets/community-default-4c5bc57b9b55.png",
  "deep-diver": "https://github.githubassets.com/assets/deep-diver-default--light-medium-a7be3c095c3d.png",
  "arctic-code-vault-contributor": "https://github.githubassets.com/assets/arctic-code-vault-contributor-default-f5b6474c6028.png",
  "public-sponsor": "https://github.githubassets.com/assets/public-sponsor-default-4e30fe60271d.png",
  "heart-on-your-sleeve": "https://github.githubassets.com/assets/heart-on-your-sleeve-default-28aa2b2f7ffb.png",
  "open-sourcerer": "https://github.githubassets.com/assets/open-sourcerer-default-64b1f529dcdb.png"
};
const githubTokens = ["api_keys"];
const cerebrasKeys = ["api_keys"];
const FRONTEND_ORIGIN = 'deployemnt_link';

async function checkAchievementStatus(username, slug) {
  const url = `https://github.com/${encodeURIComponent(username)}?tab=achievements&achievement=${slug}`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Cloudflare-Worker/1.0',
        'Accept': '*/*'
      }
    });
    return res.status === 200 ? slug : null;
  } catch {
    return null;
  }
}

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return new Response(getFrontendHTML(), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    if (url.pathname === '/rate_limit') {
      let total = 0, used = 0, remaining = 0;
      const rateLimitUrl = "https://api.github.com/rate_limit";
      for (const token of githubTokens) {
        const headers = {
          "Authorization": `token ${token}`,
          "User-Agent": "Cloudflare-Worker",
          "Accept": "application/vnd.github.v3+json"
        };
        const resp = await fetch(rateLimitUrl, { headers, cf: { timeout: 60000 } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const r = data.rate;
        total += r.limit;
        used += r.used;
        remaining += r.remaining;
      }
      return new Response(JSON.stringify({ rate: { "limit": total, "used": used, "remaining": remaining } }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/contributions') {
      const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
      if (!origin.startsWith(FRONTEND_ORIGIN)) {
        return new Response(JSON.stringify({ error: "Cross-origin requests are not allowed" }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const username = url.searchParams.get('username');
      if (!username) {
        return new Response(JSON.stringify({ error: 'Username parameter is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const cacheKey = new Request(request.url, request);
      const cache = caches.default;
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      const idx = Math.floor(Math.random() * githubTokens.length);
      const token = githubTokens[idx];
      const query = `
        {
          user(login: "${username}") {
            contributionsCollection {
              contributionCalendar {
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
            }
          }
        }
      `;
      const graphResp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker',
        },
        body: JSON.stringify({ query }),
      });
      if (!graphResp.ok) {
        const errorText = await graphResp.text();
        return new Response(JSON.stringify({ error: `GitHub API error: ${graphResp.status} - ${errorText}` }), {
          status: graphResp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const result = await graphResp.json();
      const weeks = result.data.user.contributionsCollection.contributionCalendar.weeks || [];
      const cellSize = 10, cellMargin = 2, daysCount = 7;
      const width = weeks.length * (cellSize + cellMargin) + cellMargin;
      const height = daysCount * (cellSize + cellMargin) + cellMargin;
      let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
      svg += '<rect width="100%" height="100%" fill="#1a1a1a"/>';
      const maxContrib = Math.max(1, ...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
      weeks.forEach((week, wi) => {
        week.contributionDays.forEach((day, di) => {
          const x = wi * (cellSize + cellMargin);
          const y = di * (cellSize + cellMargin);
          const intensity = Math.min(day.contributionCount / maxContrib, 1);
          const fill = day.contributionCount === 0 ? '#2f3727' : `rgba(0,255,0,${0.2 + intensity * 0.8})`;
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}"/>`;
        });
      });
      svg += '</svg>';
      const responseSvg = new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
        },
      });
      await cache.put(cacheKey, responseSvg.clone());
      return responseSvg;
    }
    if (url.pathname !== '/api') {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
    if (!origin.startsWith(FRONTEND_ORIGIN)) {
      return new Response(JSON.stringify({ error: "Cross-origin requests are not allowed" }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const username = url.searchParams.get('username');
    if (!username) {
      return new Response(JSON.stringify({ error: "Username parameter is required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const index = Math.floor(Math.random() * githubTokens.length);
    const token = githubTokens[index];
    const cerebrasIndex = Math.floor(Math.random() * cerebrasKeys.length);
    const cerebrasKey = cerebrasKeys[cerebrasIndex];

    const headers = {
      "Authorization": `token ${token}`,
      "User-Agent": "Cloudflare-Worker",
      "Accept": "application/vnd.github.v3+json"
    };

    const rateLimitUrl = "https://api.github.com/rate_limit";
    const rateLimitResp = await fetch(rateLimitUrl, { headers, cf: { timeout: 60000 } });
    if (!rateLimitResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to check rate limit" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const rateLimitData = await rateLimitResp.json();
    if (rateLimitData.rate.remaining === 0) {
      return new Response(JSON.stringify({ error: "GitHub API rate limit exceeded" }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const starredUrl = `https://api.github.com/users/${username}/starred?per_page=1000&page=1`;
    const starredResp = await fetch(starredUrl, { headers, cf: { timeout: 60000 } });
    if (!starredResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch starred repositories" }), {
        status: starredResp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const starredData = await starredResp.json();
    const hasStarred = starredData.some(repo => repo.full_name === "0xarchit/github-profile-analyzer");
    if (!hasStarred) {
      return new Response(JSON.stringify({ error: "You have not starred the 0xarchit/github-profile-analyzer repository", showPopup: true }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    async function userHasCommits(repoName) {
      const commitsUrl = `https://api.github.com/repos/${username}/${repoName}/commits?per_page=100`;
      const commitsResp = await fetch(commitsUrl, { headers, cf: { timeout: 60000 } });
      if (!commitsResp.ok) return false;
      const commitsData = await commitsResp.json();
      for (const commit of commitsData) {
        const author = commit.author || {};
        if (author.login === username) return true;
      }
      return false;
    }

    const userUrl = `https://api.github.com/users/${username}`;
    const userResp = await fetch(userUrl, { headers, cf: { timeout: 60000 } });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch user data" }), {
        status: userResp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const userData = await userResp.json();

    const reposUrl = `https://api.github.com/users/${username}/repos?per_page=100&page=1`;
    const reposResp = await fetch(reposUrl, { headers, cf: { timeout: 60000 } });
    if (!reposResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch repositories" }), {
        status: reposResp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const reposData = await reposResp.json();

    const originalRepos = {};
    const authoredForks = {};

    for (const repo of reposData) {
      const repoName = repo.name;
      const isFork = repo.fork || false;

      const repoFields = {
        description: repo.description || null,
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        issues: repo.open_issues || 0,
        watchers: repo.watchers || 0,
        primary_lang: repo.language || null,
        has_issues: repo.has_issues || false,
        has_projects: repo.has_projects || false,
        has_wiki: repo.has_wiki || false,
        has_pages: repo.has_pages || false,
        has_downloads: repo.has_downloads || false,
        has_discussions: repo.has_discussions || false,
        license: repo.license || {},
        topics: repo.topics || []
      };

      if (!isFork) {
        originalRepos[repoName] = repoFields;
      } else if (isFork && await userHasCommits(repoName)) {
        authoredForks[repoName] = repoFields;
      }
    }

    const profileSummary = {
      avatar: userData.avatar_url || null,
      username: userData.login || null,
      name: userData.name || null,
      company: userData.company || null,
      location: userData.location || null,
      blog: userData.blog || null,
      bio: userData.bio || null,
      email: userData.email || null,
      twitter: userData.twitter_username || null,
      followers: userData.followers || 0,
      following: userData.following || 0,
      public_repo_count: userData.public_repos || 0,
      original_repos: originalRepos,
      authored_forks: authoredForks
    };

    const slugs = Object.keys(badgeAssets);
    const unlockedBadges = await Promise.all(slugs.map(slug => checkAchievementStatus(username, slug)));
    const badges = {};
    unlockedBadges.filter(Boolean).forEach(slug => {
      badges[slug] = badgeAssets[slug];
    });
    profileSummary.badges = badges;

    const cerebrasResponse = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cerebrasKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content: `You are a JSON generator that strictly evaluates a user's public GitHub profile data and returns a detailed analysis report in the following structure:

{
  "score": <integer between 0 and 100 representing overall GitHub profile strength>,
  "detailed_analysis": "<an insightful summary based on key metrics such as user popularity, repository quality, biography clarity, profile backlinks, and presence of web pages>",
  "improvement_areas": [
    "<brief, specific suggestions for improving weak areas such as adding repository descriptions, refining bio, increasing stars or followers, etc.>"
  ],
  "diagnostics": [
    "<additional observations such as number of licensed repositories, archived projects, or usage of pinned repos that do not directly impact score but are useful for awareness>"
  ],
  "project_ideas": {
    "project_idea_1": {
      "title": "<a short title for the project idea>",
      "description": "<a detailed description of the project idea>",
      "tech stack": [],
    "project_idea_2": {
      "title": "<a short title for the project idea>",
      "description": "<a detailed description of the project idea>",
      "tech stack": [],
    ... unique generic project ideas based on person skills upto 3 only if no skill then suggest basic level projects
  },
  "tag": {
  tag_name: <tag name>,
  description: a line why give this tag.
  ... a sarcastic/funny tag given based on user profile
  },
    developer_type: <based on user tech stack and projects and activeness give hime a developer type. example tech explorer, geek, frontned dev, backend dev, fullstack dev, etc>
  }

Requirements:
- Use logical thresholds and weighted scoring to determine each subcomponent.
- Keep tone constructive, data-driven, and user-friendly.
- Avoid repetition or overly generic feedback.
- Return valid JSON output, all fields populated unless no data is available.`
          },
          {
            role: 'user',
            content: JSON.stringify(profileSummary)
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!cerebrasResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch AI analysis" }), {
        status: cerebrasResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cerebrasData = await cerebrasResponse.json();
    const aiAnalysis = JSON.parse(cerebrasData.choices[0].message.content);
    const responseData = Object.assign({}, profileSummary, aiAnalysis);
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: `Worker error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="google-site-verification" content="dHMBieXdOHmVBKYMO3BKUtVtEarad3beBlC6Nd65BAo" />
  <link rel="icon" href="https://i.postimg.cc/cLSGtFfZ/Gemini-Generated-Image-kszdpvkszdpvkszd.png">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="title" content="GitHub Profile Analyzer Tool With AI">
  <meta name="description" content="This tool analyzes a GitHub user's public profile and generates a detailed strength score, insightful analysis, and improvement suggestions and display profile with several charts and graphs">
  <meta name="keywords" content="Github Profile Analyzer, Github Profile Analyser, Github, Profile analyser, 0xarchit">
  <meta property="og:url" content="https://git.0xcloud.workers.dev">
  <meta name="robots" content="index, follow">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="language" content="English">
  <meta name="revisit-after" content="7 days">
  <meta name="author" content="0xArchit">
  <title>GitHub Profile Analyzer</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    * {
      user-drag: none;
      -webkit-user-drag: none;
      user-select: none;
      -moz-user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
    }
    :root {
      --progress-bar-width: 180px;
      --progress-bar-height: 180px;
      --font-size: 1.5rem;
    }
    .glassmorphism {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .animate-slideIn {
      animation: slideIn 0.5s ease-out forwards;
    }
    .popup {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      padding: 20px;
      width: 300px;
      text-align: center;
    }
    .popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999;
    }
    .loader {
      border: 4px solid rgba(255, 255, 255, 0.2);
      border-top: 4px solid #3b82f6;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .circular-progress {
      width: var(--progress-bar-width);
      height: var(--progress-bar-height);
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .inner-circle {
      position: absolute;
      width: calc(var(--progress-bar-width) - 30px);
      height: calc(var(--progress-bar-height) - 30px);
      border-radius: 50%;
      background-color: rgba(0, 0, 0, 0.8);
    }
    .percentage {
      position: relative;
      font-size: var(--font-size);
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
    }
    @media screen and (max-width: 800px) {
      :root {
        --progress-bar-width: 150px;
        --progress-bar-height: 150px;
        --font-size: 1.3rem;
      }
    }
    @media screen and (max-width: 500px) {
      :root {
        --progress-bar-width: 120px;
        --progress-bar-height: 120px;
        --font-size: 1rem;
      }
    }
    @media print {
      @page {
        margin: 0 !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
      }
      #rate-limit-widget,
      footer,
      #copy-url,
      #download-report,
      #username,
      #analyze,
      #loading,
      #username-box,
      h1,
      h4 {
        display: none !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body class="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 pb-16">  
  <!-- Rate Limit Widget -->
  <div id="rate-limit-widget" style="user-select:none; position:fixed; top:10px; left:10px; background:rgba(0,0,0,0.7); color:#fff; padding:10px; border-radius:5px; cursor:move; z-index:1001; font-size:0.9rem;">
    <strong>Rate Limit Per Hour</strong>
    <div>Total: <span id="rl-total">--</span></div>
    <div>Used: <span id="rl-used">--</span></div>
    <div>Remaining: <span id="rl-remaining">--</span></div>
  </div>
  <div class="w-full max-w-2xl">
    <h1 class="text-3xl font-bold mb-6 text-center animate-slideIn">GitHub Profile Analyzer</h1>
    <h4 class="text-base font-bold mb-6 text-center animate-slideIn">
  This Analysis is based on your first 100 repos including your original repos and only those forks in which you have contributed
</h4>
    <div id="username-box" class="mb-6 glassmorphism p-4 animate-slideIn">
      <input id="username" type="text" placeholder="Enter GitHub username" class="w-full p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 mb-2">
  <button id="analyze" class="w-full text-white font-bold py-2 px-4 rounded" style="background-color:#0455C9;" onmouseover="this.style.backgroundColor='#03408F'" onmouseout="this.style.backgroundColor='#0455C9'">Analyze Profile</button>
    </div>
    <div id="loading" class="hidden glassmorphism p-4 mb-4">
      <div class="loader"></div>
      <p class="text-center mt-2">Analyzing...</p>
    </div>
    <div id="result" class="mt-6 hidden">
      <div class="flex flex-wrap justify-center items-start gap-6 mb-4">
        <div id="profile-card" class="glassmorphism p-4 w-full sm:w-1/2 md:w-1/2" style="display:none; position:relative;">
        <div id="profile-contrib" style="position:absolute; top:0; left:0; width:100%; height:60px; background-size:contain; background-position:center; background-repeat:no-repeat; border-radius:10px 10px 0 0;"></div>
          <img id="profile-avatar" src="" alt="avatar" class="w-16 h-16 rounded-full border-2 border-blue-500" style="position:relative; z-index:1; margin-top:20px;" />
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-bold text-lg" id="profile-username"></span>
            </div>
            <div class="text-sm text-gray-300" id="profile-name"></div>
            <div class="text-sm text-gray-400" id="profile-bio"></div>
            <div class="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
              <span id="profile-email"></span>
              <span id="profile-company"></span>
            </div>
            <div class="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
              <span>Followers: <span id="profile-followers"></span></span>
              <span>Following: <span id="profile-following"></span></span>
              <span>Public Repos: <span id="profile-repos"></span></span>
              <span>Original Repos: <span id="profile-original-repos"></span></span>
              <span>Authored Forks: <span id="profile-authored-forks"></span></span>
            </div>
            <div class="flex flex-wrap gap-2 mt-2" id="profile-badges"></div>
          </div>
        </div>
        <div id="score-wrapper" class="glassmorphism p-4 flex justify-center items-center w-full sm:w-1/2 md:w-1/3">
          <div class="circular-progress content-center" id="score-progress" data-inner-circle-color="rgba(0, 0, 0, 0.8)" data-percentage="0" data-progress-color="#0455C9" data-bg-color="rgba(255, 255, 255, 0.2)">
            <div class="inner-circle"></div>
            <p class="percentage" id="score-text">0/100</p>
          </div>
        </div>
      </div>
      <div class="flex justify-end mb-4">
        <button id="copy-url" class="hidden glassmorphism px-4 py-2 text-white font-bold rounded">Copy Page URL</button>
        <button id="download-report" class="hidden glassmorphism px-4 py-2 text-white font-bold rounded ml-2">Save Report</button>
      </div>
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Detailed Analysis</h3>
        <p id="detailed-analysis"></p>
      </div>
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Improvement Areas</h3>
        <ul id="improvement-areas" class="list-disc list-inside"></ul>
      </div>
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Diagnostics</h3>
        <ul id="diagnostics" class="list-disc list-inside"></ul>
      </div>
      <!-- Project Ideas Section -->
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Project Ideas</h3>
        <div id="project-ideas-list"></div>
      </div>
      <!-- Developer Type Section -->
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Developer Type</h3>
        <p id="developer-type"></p>
      </div>
      <!-- Tag Section -->
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Tag</h3>
        <div id="tag-section" style="display:none;"></div>
      </div>
      <div class="glassmorphism p-4 mb-4">
        <h3 class="text-lg font-medium">Badges</h3>
        <div id="badges" class="flex flex-wrap gap-2"></div>
      </div>
      <div class="mb-6 glassmorphism p-4 animate-slideIn">
      <h3 class="text-lg font-medium">Stats</h3>
      <div id="graphs" class="mt-6 flex flex-wrap gap-4 justify-center hidden animate-slideIn">
        <img id="stats-graph" height="150" alt="stats graph" />
        <img id="langs-graph" height="150" alt="languages graph" />
        <img id="streak-graph-daily" height="150" alt="daily streak graph" />
        <img id="streak-graph-weekly" height="150" alt="weekly streak graph" />
        <img id="trophy-graph" height="150" alt="trophy graph" />
        <img id="activity-graph" height="300" alt="activity graph" />
      </div>
      </div>
    </div>
  </div>
  <div id="popup-overlay" class="popup-overlay hidden"></div>
  <div id="popup" class="popup hidden">
    <button id="popup-close" class="absolute top-2 right-2 text-white">✖</button>
    <p id="popup-message" class="mb-4"></p>
    <a id="star-button" href="https://github.com/0xarchit/github-profile-analyzer" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded hidden">Star Now</a>
  </div>
  <script>
    const elements = {
      username: document.getElementById('username'),
      result: document.getElementById('result'),
      graphs: document.getElementById('graphs'),
      scoreProgress: document.getElementById('score-progress'),
      scoreText: document.getElementById('score-text'),
      detailedAnalysis: document.getElementById('detailed-analysis'),
      improvementAreas: document.getElementById('improvement-areas'),
      diagnostics: document.getElementById('diagnostics'),
      projectIdeasList: document.getElementById('project-ideas-list'),
      developerType: document.getElementById('developer-type'),
      tagSection: document.getElementById('tag-section'),
      popup: document.getElementById('popup'),
      popupOverlay: document.getElementById('popup-overlay'),
      popupMessage: document.getElementById('popup-message'),
      starButton: document.getElementById('star-button'),
      statsGraph: document.getElementById('stats-graph'),
      langsGraph: document.getElementById('langs-graph'),
      streakGraphDaily: document.getElementById('streak-graph-daily'),
      streakGraphWeekly: document.getElementById('streak-graph-weekly'),
      trophyGraph: document.getElementById('trophy-graph'),
      activityGraph: document.getElementById('activity-graph'),
      analyze: document.getElementById('analyze'),
      popupClose: document.getElementById('popup-close'),
      loading: document.getElementById('loading'),
      copyUrl: document.getElementById('copy-url'),
      downloadReport: document.getElementById('download-report'),
      profileCard: document.getElementById('profile-card'),
      profileContrib: document.getElementById('profile-contrib'),
      profileAvatar: document.getElementById('profile-avatar'),
      profileUsername: document.getElementById('profile-username'),
      profileName: document.getElementById('profile-name'),
      profileBio: document.getElementById('profile-bio'),
      profileEmail: document.getElementById('profile-email'),
      profileCompany: document.getElementById('profile-company'),
      profileFollowers: document.getElementById('profile-followers'),
      profileFollowing: document.getElementById('profile-following'),
      profileRepos: document.getElementById('profile-repos'),
      profileOriginalRepos: document.getElementById('profile-original-repos'),
      profileAuthoredForks: document.getElementById('profile-authored-forks'),
      profileBadges: document.getElementById('profile-badges'),
      badges: document.getElementById('badges')
    };

    elements.analyze.addEventListener('click', async function() {
      const username = elements.username.value.trim();
      if (!username) {
        showPopup('Please enter a GitHub username', false);
        return;
      }

      const cacheKey = 'analysis_' + username;
      elements.loading.classList.remove('hidden');
      try {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          let parsedData;
          try {
            parsedData = JSON.parse(cachedData);
          } catch (e) {
            console.error('Failed to parse cached data:', e);
            localStorage.removeItem(cacheKey);
          }
          if (parsedData && parsedData.data && parsedData.timestamp) {
            if (Date.now() - parsedData.timestamp < 3600000) {
              elements.loading.classList.add('hidden');
              displayResult(parsedData.data, username);
              (async () => {
                try {
                  const resp = await fetch('/rate_limit');
                  if (!resp.ok) return;
                  const { rate } = await resp.json();
                  document.getElementById('rl-total').textContent = rate.limit;
                  document.getElementById('rl-used').textContent = rate.used;
                  document.getElementById('rl-remaining').textContent = rate.remaining;
                } catch (e) {
                  console.error('Rate limit refresh error', e);
                }
              })();
              return;
            }
          }
        }
      } catch (e) {
        console.error('LocalStorage error:', e);
        elements.loading.classList.add('hidden');
        showPopup('Error accessing local storage', false);
        return;
      }

      elements.result.classList.add('hidden');
      elements.graphs.classList.add('hidden');
      try {
        const response = await fetch('/api?username=' + encodeURIComponent(username));
        const data = await response.json();
        elements.loading.classList.add('hidden');
        if (response.status !== 200) {
          showPopup(data.error || 'An error occurred', data.showPopup || false);
          return;
        }
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: data,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.error('Failed to save to localStorage:', e);
        }
        displayResult(data, username);
        (async () => {
          try {
            const resp = await fetch('/rate_limit');
            if (!resp.ok) return;
            const { rate } = await resp.json();
            document.getElementById('rl-total').textContent = rate.limit;
            document.getElementById('rl-used').textContent = rate.used;
            document.getElementById('rl-remaining').textContent = rate.remaining;
          } catch (e) {
            console.error('Rate limit refresh error', e);
          }
        })();
      } catch (error) {
        elements.loading.classList.add('hidden');
        showPopup('Error fetching analysis', false);
      }
    });

    function displayResult(data, username) {
      elements.result.classList.remove('hidden');
      elements.graphs.classList.remove('hidden');
      if (data && data.username) {
        elements.profileCard.style.display = '';
        elements.profileAvatar.src = data.avatar || data.avatar_url || '';
        elements.profileContrib.style.backgroundImage = "url('/contributions?username=" + username + "')";
        elements.profileCard.style.backgroundSize = 'cover';
        elements.profileUsername.textContent = data.username || '';
        elements.profileName.textContent = data.name || '';
        elements.profileBio.textContent = data.bio || '';
        elements.profileEmail.textContent = data.email ? 'Email: ' + data.email : '';
        elements.profileCompany.textContent = data.company ? 'Company: ' + data.company : '';
        elements.profileFollowers.textContent = data.followers || '0';
        elements.profileFollowing.textContent = data.following || '0';
        elements.profileRepos.textContent = data.public_repo_count || '0';
        elements.profileOriginalRepos.textContent = data.original_repos ? Object.keys(data.original_repos).length : '0';
        elements.profileAuthoredForks.textContent = data.authored_forks ? Object.keys(data.authored_forks).length : '0';
        elements.profileBadges.innerHTML = '';
        Object.keys(data.badges || {}).forEach(slug => {
          const img = document.createElement('img');
          img.src = data.badges[slug];
          img.alt = slug;
          img.className = 'w-8 h-8 rounded-full';
          elements.profileBadges.appendChild(img);
        });
      } else {
        elements.profileCard.style.display = 'none';
      }
      const score = data.score || 0;
      elements.scoreText.textContent = score + '/100';
      elements.scoreProgress.setAttribute('data-percentage', score);
      const progressBar = elements.scoreProgress;
      const progressValue = elements.scoreText;
      const innerCircle = progressBar.querySelector('.inner-circle');
      let startValue = 0;
      const endValue = score;
      const speed = 50;
      const progressColor = progressBar.getAttribute('data-progress-color');
      const progress = setInterval(function() {
        startValue++;
        progressValue.textContent = startValue + '/100';
        progressValue.style.color = progressColor;
        innerCircle.style.backgroundColor = progressBar.getAttribute('data-inner-circle-color');
        progressBar.style.background = 'conic-gradient(' + progressColor + ' ' + (startValue * 3.6) + 'deg,' + progressBar.getAttribute('data-bg-color') + ' 0deg)';
        if (startValue >= endValue) {
          clearInterval(progress);
        }
      }, speed);
      elements.detailedAnalysis.textContent = data.detailed_analysis || 'No analysis provided';
      elements.improvementAreas.innerHTML = '';
      (data.improvement_areas || []).forEach(function(item) {
        const li = document.createElement('li');
        li.textContent = item;
        elements.improvementAreas.appendChild(li);
      });
      elements.diagnostics.innerHTML = '';
      (data.diagnostics || []).forEach(function(item) {
        const li = document.createElement('li');
        li.textContent = item;
        elements.diagnostics.appendChild(li);
      });
      elements.projectIdeasList.innerHTML = '';
      (data.project_ideas ? Object.values(data.project_ideas) : []).forEach(idea => {
        const div = document.createElement('div');
        div.className = 'mb-2';
        const techs = idea.tech_stack || idea['tech stack'] || [];
        div.innerHTML = '<strong>' + idea.title + '</strong><p>' + idea.description + '</p><p><em>Tech Stack:</em> ' + techs.join(', ') + '</p>';
        elements.projectIdeasList.appendChild(div);
      });
      elements.developerType.textContent = data.developer_type || '';
      if (data.tag) {
        let name = '', desc = '';
        if (data.tag.tag_name && data.tag.description) {
          name = data.tag.tag_name;
          desc = data.tag.description;
        } else {
          const keys = Object.keys(data.tag);
          if (keys.length) {
            name = keys[0];
            desc = data.tag[name] || '';
          }
        }
        elements.tagSection.innerHTML = '<strong>' + name + '</strong>: ' + desc;
        elements.tagSection.style.display = name ? '' : 'none';
      } else {
        elements.tagSection.style.display = 'none';
      }
      elements.badges.innerHTML = '';
      const badges = data.badges || {};
      Object.keys(badges).forEach(function(slug) {
        const img = document.createElement('img');
        img.src = badges[slug];
        img.alt = slug;
        img.className = 'w-12 h-12 rounded-full';
        elements.badges.appendChild(img);
      });
      elements.statsGraph.src = 'https://github-readme-stats.vercel.app/api?username=' + encodeURIComponent(username) + '&hide_title=false&hide_rank=false&show_icons=true&include_all_commits=true&count_private=true&disable_animations=false&theme=transparent&locale=en&hide_border=false&order=1';
      elements.langsGraph.src = 'https://github-readme-stats.vercel.app/api/top-langs?username=' + encodeURIComponent(username) + '&locale=en&hide_title=false&layout=compact&card_width=320&langs_count=5&theme=transparent&hide_border=false&order=2';
      elements.streakGraphDaily.src = 'https://streak-stats.demolab.com?user=' + encodeURIComponent(username) + '&locale=en&mode=daily&theme=transparent&hide_border=false&border_radius=5&order=3';
      elements.streakGraphWeekly.src = 'https://streak-stats.demolab.com?user=' + encodeURIComponent(username) + '&locale=en&mode=weekly&theme=transparent&hide_border=false&border_radius=5&order=4';
      elements.trophyGraph.src = 'https://github-profile-trophy.vercel.app?username=' + encodeURIComponent(username) + '&no-bg=true&column=-1&row=1&margin-w=8&margin-h=8&no-frame=false&order=5';
      elements.activityGraph.src = 'https://github-readme-activity-graph.vercel.app/graph?username=' + encodeURIComponent(username) + '&bg_color=ffffff00&color=006aff&line=006aff&point=ffffff&area=true&hide_border=false';
      elements.copyUrl.classList.remove('hidden');
      elements.copyUrl.onclick = function() {
        const permanentUrl = window.location.origin + '/?username=' + encodeURIComponent(username);
        navigator.clipboard.writeText(permanentUrl).then(() => {
          showPopup('Profile URL copied to clipboard', false);
          setTimeout(() => {
            elements.popup.classList.add('hidden');
            elements.popupOverlay.classList.add('hidden');
          }, 3000);
        });
      };
      elements.downloadReport.classList.remove('hidden');
      elements.downloadReport.onclick = async () => {
        showPopup('Your report is rendering for download; this is a beta feature and may be unstable.', false);
        setTimeout(() => {
          elements.popup.classList.add('hidden');
          elements.popupOverlay.classList.add('hidden');
        }, 5000);
        await new Promise(resolve => setTimeout(resolve, 5000));
        try {
          window.print();
        } catch (err) {
          console.error('Print error', err);
          showPopup('Failed to print report', false);
        }
      };
    }

    function showPopup(message, showStarButton) {
      elements.popupMessage.innerHTML = message.includes('starred')
        ? 'Please star the <a href="https://github.com/0xarchit/github-profile-analyzer" target="_blank" class="text-blue-400 underline">0xarchit/github-profile-analyzer</a> repository to proceed. This is important to avoid false users'
        : message;
      elements.popup.classList.remove('hidden');
      elements.popupOverlay.classList.remove('hidden');
      elements.starButton.classList.toggle('hidden', !showStarButton);
    }

    elements.popupClose.addEventListener('click', function() {
      elements.popup.classList.add('hidden');
      elements.popupOverlay.classList.add('hidden');
    });

      window.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const initialUsername = urlParams.get('username');
      if (initialUsername) {
        elements.username.value = initialUsername;
        elements.analyze.click();
      }
    });
    document.addEventListener('DOMContentLoaded', function() {
      const widget = document.getElementById('rate-limit-widget');
      let isDragging = false, offsetX = 0, offsetY = 0;
      widget.addEventListener('mousedown', function(e) {
        isDragging = true;
        offsetX = e.clientX - widget.offsetLeft;
        offsetY = e.clientY - widget.offsetTop;
      });
      widget.addEventListener('touchstart', function(e) {
        e.preventDefault();
        isDragging = true;
        const touch = e.touches[0];
        offsetX = touch.clientX - widget.offsetLeft;
        offsetY = touch.clientY - widget.offsetTop;
      });
      document.addEventListener('mousemove', function(e) {
        if (isDragging) {
          widget.style.left = (e.clientX - offsetX) + 'px';
          widget.style.top = (e.clientY - offsetY) + 'px';
        }
      });
      document.addEventListener('touchmove', function(e) {
        if (isDragging) {
          e.preventDefault();
          const touch = e.touches[0];
          widget.style.left = (touch.clientX - offsetX) + 'px';
          widget.style.top = (touch.clientY - offsetY) + 'px';
        }
      }, { passive: false });
      document.addEventListener('mouseup', function() {
        isDragging = false;
      });
      document.addEventListener('touchend', function() {
        isDragging = false;
      });
      async function fetchRateLimit() {
        try {
          const res = await fetch('/rate_limit');
          if (!res.ok) return;
          const rate = (await res.json()).rate;
          document.getElementById('rl-total').textContent = rate.limit;
          document.getElementById('rl-used').textContent = rate.used;
          document.getElementById('rl-remaining').textContent = rate.remaining;
        } catch (err) {
          console.error('Rate limit fetch error', err);
        }
      }
      fetchRateLimit();
    });
  </script>
  <footer class="fixed bottom-0 w-full text-center p-2 bg-gray-800 text-white">
    © <a href="https://github.com/0xarchit" class="underline">0xarchit</a> 2025
  </footer>
</body>
</html>`;
}