<div align="center">
  <img src="./public/github-profile-analyzer.webp" alt="GitHub Profile Analyzer" width="300" />
</div>

# GitHub Profile Analyzer

A deterministic GitHub profile analyzer that scores developer profiles across 14 weighted categories, detects authenticity anomalies, and produces fully explainable reports. No black boxes: every score shows exactly which factors earned or lost points, and every claim links back to real GitHub data.

<p align="center">
  <a href="https://github.0xarchit.is-a.dev/"><strong>Try it live</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/0xarchit/github-profile-analyzer">Repository</a>
</p>

<p align="center">
  <a href="https://github.com/0xarchit/github-profile-analyzer/stargazers"><img src="https://img.shields.io/github/stars/0xarchit/github-profile-analyzer?style=flat-square&color=yellow" alt="Stars" /></a>
  <a href="https://github.com/0xarchit/github-profile-analyzer/network/members"><img src="https://img.shields.io/github/forks/0xarchit/github-profile-analyzer?style=flat-square" alt="Forks" /></a>
  <a href="https://github.com/0xarchit/github-profile-analyzer/issues"><img src="https://img.shields.io/github/issues/0xarchit/github-profile-analyzer?style=flat-square" alt="Issues" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square" alt="Next.js 16" />
</p>

## Why this project is different

Most profile analyzers either show raw numbers with no context or hide behind an LLM that invents a different story on every run. This project takes a third path:

- **Deterministic by design.** The same profile always produces the same scores. 43 sampled rules evaluate account age, contribution patterns, repository quality, release discipline, security posture, community health, and more.
- **Explainable scores.** Hovering any score reveals its factor breakdown: what was measured, how many repositories were sampled, points earned versus possible, and concrete remediation steps when a score is low.
- **Anomaly detection without accusations.** 45 signals flag statistical patterns such as burst contributions, self-merge ratios, fork abandonment, and commit monotony. Flags are presented as context with caveats, never as verdicts.
- **Honest about limits.** Rules that cannot be computed truthfully from public data (branch protection, follower history) report themselves as unavailable instead of guessing.

## How the engine works

A single deep-dive pass collects everything in about 30 GitHub API requests, well inside the Cloudflare Workers subrequest budget:

1. One batched GraphQL query loads the profile core: contribution calendar, social graph, gists, pinned items, and two years of contribution history.
2. Repository discovery runs through paginated GraphQL, then top repositories are enriched in batches of four with languages, releases, community files, dependency manifests, CI status, and per-commit statistics including additions, deletions, and signature validity.
3. Weekly activity, punch cards, participation splits, contributor rankings, and churn series are derived from already-fetched data instead of extra REST calls.
4. Search aggregators compute global counters such as external PR acceptance rate, discussion answers, and issue resonance in one request.
5. Community health profiles and Actions run histories add authoritative documentation coverage and live CI pass rates for the top five repositories.

All results stream to the dashboard over Server-Sent Events so you can watch each phase complete.

## Features

**Analysis**
- Deterministic scoring across 14 categories with published weights
- 38 baseline metrics, from GPG signature ratio to release cadence
- 45 anomaly signals with sampling caveats and confidence ratings
- Year-over-year momentum, work rhythm, archetype, and portfolio interpretation

**Transparency**
- Per-factor score breakdowns with earned-versus-max bars
- Remediation hints attached to low scores
- Sampling windows and data-source labels on every metric

**Platform**
- GitHub OAuth login plus verified-star guest access
- Server-side rate limiting and encrypted session handling
- Snapshot history with side-by-side comparison
- PDF report export
- Responsive retro-styled dashboard with dark mode

## Tech Stack

- **Framework**: Next.js 16 with React 19 (App Router)
- **Language**: TypeScript
- **Database**: Neon serverless PostgreSQL
- **Caching and rate limiting**: Upstash Redis
- **Sessions**: JWT via jose, AES-256-GCM encrypted tokens
- **PDF generation**: react-pdf
- **Styling**: Tailwind CSS v4
- **Validation**: Zod
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 22+ (npm)
- A GitHub OAuth application (client id and secret)
- GitHub personal access tokens for the analysis pool
- Neon PostgreSQL database
- Upstash Redis instance

### Installation

```bash
git clone https://github.com/0xarchit/github-profile-analyzer.git
cd github-profile-analyzer
npm install
```

### Environment Variables

Create a `.env.local` file:

| Variable | Purpose |
|---|---|
| `GITHUB_TOKENS` | Comma-separated token pool used for analysis |
| `GITHUB_PAT_TOKENS` | Optional secondary PAT pool |
| `DATABASE_WRITE` | Neon PostgreSQL connection string |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth application credentials |
| `JWT_SECRET` | Session signing key |
| `ENCRYPTION_SECRET` | AES-256-GCM encryption key |
| `UPSTASH_URL` / `UPSTASH_TOKEN` | Redis caching and rate limiting |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the deployment |

### Development

```bash
npm run dev
```

Server runs on http://localhost:3000

### Testing

```bash
npm run test
```

### Production Build

```bash
npm run build
npm run start
```

## API Routes

| Route | Description |
|---|---|
| `GET /api/analyze/deterministic/stream` | Run the deterministic engine with SSE progress streaming |
| `GET /api/analyze/deterministic` | Run the deterministic engine and return JSON |
| `POST /api/analyze` | Legacy AI-assisted analysis |
| `GET /api/contributions` | Fetch contribution data |
| `GET /api/scans/[id]` | Retrieve a stored scan |
| `GET /api/star-status` | Verify repository-star access |
| `POST /api/auth/github` | Initiate GitHub OAuth |
| `GET /api/auth/github/callback` | OAuth callback handler |
| `GET /api/auth/me` | Current session identity |
| `POST /api/auth/logout` | End session |
| `GET /api/users/settings` | Fetch user settings |
| `POST /api/users/settings` | Update user settings |

## Project Structure

```text
src/
├── app/                 # App Router pages and API routes
├── components/          # Dashboard UI and charts
├── lib/
│   └── deterministic/   # Scoring engine
│       ├── fetchers/    # Batched GraphQL and REST collection
│       ├── rules/       # Baseline, signal, score, and chart rules
│       └── types.ts     # Engine contracts
└── types/               # Shared TypeScript types
scripts/                 # Smoke tests and GraphQL experiment harnesses
```

## Supporting the Project

If this project helped you, here are two ways to give back:

- Give the repository a [star](https://github.com/0xarchit/github-profile-analyzer/stargazers). Stars help other developers discover the tool and guide which features get built next.
- [Sponsor the maintainer](https://github.com/sponsors/0xarchit) to support ongoing development, token costs for the public instance, and future features.

[![Star the repo](https://img.shields.io/badge/Give%20a%20Star-yellow?style=for-the-badge&logo=github)](https://github.com/0xarchit/github-profile-analyzer/stargazers)
[![Sponsor](https://img.shields.io/badge/Sponsor-pink?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/0xarchit)

## Community

<div align="center">

<table>
  <tr>
    <th>Contributing</th>
    <th>Security</th>
    <th>License</th>
  </tr>
  <tr>
    <td><a href="https://github.com/0xarchit/github-profile-analyzer/blob/main/CONTRIBUTING.md">Guidelines</a></td>
    <td><a href="https://github.com/0xarchit/github-profile-analyzer/blob/main/SECURITY.md">Policy</a></td>
    <td><a href="https://github.com/0xarchit/github-profile-analyzer/blob/main/LICENSE">MIT</a></td>
  </tr>
</table>

Issues and pull requests are welcome.

</div>

## StarMapper

<a href="https://starmapper.bruniaux.com/0xarchit/github-profile-analyzer?utm_source=map-embed&utm_medium=readme&utm_campaign=stargazer-map">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://starmapper.bruniaux.com/api/map-image/0xarchit/github-profile-analyzer?theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://starmapper.bruniaux.com/api/map-image/0xarchit/github-profile-analyzer?theme=light" />
    <img alt="StarMapper" src="https://starmapper.bruniaux.com/api/map-image/0xarchit/github-profile-analyzer" />
  </picture>
</a>

## Star History

<a href="https://star-history.dera.page/#0xarchit/github-profile-analyzer&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=0xarchit/github-profile-analyzer&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=0xarchit/github-profile-analyzer&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=0xarchit/github-profile-analyzer&type=date&legend=top-left" />
 </picture>
</a>
