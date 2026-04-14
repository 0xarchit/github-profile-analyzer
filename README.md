<div align="center">
  <img src="./public/github-profile-analyzer.webp" alt="GitHub Profile Analyzer" width="300" />
</div>

# GitHub Profile Analyzer

Comprehensive GitHub profile analysis tool with AI-powered scoring, real-time metrics, and exportable reports.

## Features

**Profile Analysis**
- AI-driven GitHub profile evaluation with detailed scoring
- Language detection and proficiency analysis
- Repository analysis and contribution metrics
- Developer type classification

**Authentication & Security**
- GitHub OAuth 2.0 integration
- JWT-based session management
- AES-256-GCM encryption for sensitive data
- Rate limiting and abuse prevention
- SQL injection and XSS protection

**Data & Export**
- Real-time contribution calendar parsing
- Contribution streak calculation
- PDF report generation with profile snapshots
- Encrypted data storage
- Analysis history and snapshots

**Performance**
- Response caching with Upstash Redis
- Optimized database queries
- Concurrent request handling
- Content compression

**User Experience**
- GitHub authentication required
- Star verification for access control
- Guest session support
- User settings and preferences
- Responsive design with Tailwind CSS
- Dark mode support

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript
- **Database**: Neon PostgreSQL
- **Authentication**: JWT with jose
- **Caching**: Upstash Redis
- **Rate Limiting**: Upstash Rate Limit
- **PDF Generation**: react-pdf
- **Styling**: Tailwind CSS with custom UI components
- **Validation**: Zod schemas
- **Runtime**: Bun

## Getting Started

### Prerequisites

- Bun runtime
- GitHub OAuth application credentials
- Neon PostgreSQL database
- Upstash Redis instance

### Installation

```bash
git clone https://github.com/0xarchit/github-profile-analyzer.git
cd github-profile-analyzer
bun install
```

### Environment Variables

Create a `.env.local` file:

```
GITHUB_TOKENS=
NEXT_PUBLIC_APP_URL=
GITHUB_PAT_TOKENS=
GITHUB_MODEL=
DATABASE_WRITE=
DATABASE_READ=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
JWT_SECRET=
UPSTASH_TOKEN=
UPSTASH_URL=
ENCRYPTION_SECRET=
```

### Development

```bash
bun run dev
```

Server runs on http://localhost:3000

### Production Build

```bash
bun run build
bun run start
```

## API Routes

- `POST /api/analyze` - Analyze GitHub profile
- `GET /api/contributions` - Fetch contribution data
- `GET /api/star-status` - Verify star status
- `GET /api/scans/[id]` - Retrieve scan results
- `POST /api/auth/github` - Initiate GitHub OAuth
- `GET /api/auth/github/callback` - OAuth callback handler
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user
- `GET /api/users/settings` - Fetch user settings
- `POST /api/users/settings` - Update user settings

## Project Structure

```
src/
├── app/                 # Next.js app router
├── components/          # React components
├── lib/                 # Utilities and helpers
├── types/               # TypeScript types
```

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

Open an issue for bug reports or feature requests.
