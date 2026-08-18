export type RuleStatus = "ok" | "sampled" | "unavailable" | "skipped" | "requires_oauth";
export type CostTier = "cheap" | "moderate" | "expensive" | "oauth";
export type AnalysisMode = "quick" | "standard" | "deep";

export interface AnalysisModeProfile {
  id: AnalysisMode;
  label: string;
  description: string;
  expectedCalls: { minimum: number; maximum: number };
  budget: { rest: number; graphql: number; search: number };
  repositoryLimit: number;
  forkLimit: number;
  starRepositoryLimit: number;
  commitDetailLimit: number;
}

export type ChartKind =
  | "heatmap"
  | "line"
  | "diverging-bar"
  | "donut"
  | "scatter"
  | "timeline"
  | "funnel"
  | "network"
  | "radar"
  | "bar"
  | "histogram"
  | "lorenz"
  | "gantt"
  | "matrix";

export interface RuleResult<T = unknown> {
  id: string;
  name: string;
  status: RuleStatus;
  value: T | null;
  description: string;
  source: string;
  cost: CostTier;
  sampleSize?: number;
  caveat?: string;
  confidence?: number;
  freshness?: {
    score: number;
    label: "live" | "recent" | "historical" | "snapshot" | "unavailable";
    window: string;
    asOf: string;
  };
}

export interface SignalResult<T = unknown> extends RuleResult<T> {
  flagged: boolean;
}

export interface ChartResult<T = unknown> extends RuleResult<T> {
  kind: ChartKind;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  followers: number;
  following: number;
  public_repos: number;
  public_gists: number;
  hireable: boolean | null;
  blog: string;
  location: string | null;
  company: string | null;
  bio: string | null;
  twitter_username: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  size: number;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  archived: boolean;
  disabled: boolean;
  homepage: string | null;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  is_template: boolean;
  open_issues_count: number;
  default_branch: string;
  license: { spdx_id: string; name: string } | null;
  mirror_url: string | null;
  owner: { login: string };
  parent?: { full_name: string; default_branch: string };
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
    committer: { name: string; date: string } | null;
    verification: { verified: boolean; reason: string };
  };
  author: { login: string } | null;
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{ filename: string; additions: number; deletions: number; changes: number }>;
  parents?: Array<{ sha: string }>;
}

export interface CalendarDay {
  date: string;
  contributionCount: number;
  weekday: number;
  color?: string;
}

export interface PullRequestNode {
  createdAt: string;
  mergedAt: string | null;
  mergedBy: { login: string } | null;
  repository: { nameWithOwner: string; owner: { login: string } };
}

export interface GraphQLSummary {
  totalContributions: number;
  restrictedContributionsCount: number;
  totalPullRequestReviewContributions: number;
  totalPullRequestContributions: number;
  totalIssueContributions: number;
  totalDiscussionCommentContributions: number;
  contributionYears: number[];
  calendar: CalendarDay[];
  contributionsByRepo: Array<{ repository: string; count: number }>;
  pinnedItems: Array<{ nameWithOwner: string; stargazerCount: number }>;
  starredRepositoriesCount: number;
  sponsoringCount: number;
  sponsorCount: number;
  repositoriesContributedToCount: number;
  pullRequests: PullRequestNode[];
  reviews: Array<{ occurredAt: string; title: string }>;
  graphqlCost: number;
  graphqlRemaining: number;
}

export interface SearchSummary {
  prsOpened: number;
  prsMerged: number;
  prsMergedExternal: number;
  issuesOpened: number;
  issuesClosed: number;
  reviews: number;
  authoredIssues: Array<{ repository: string; number: number; createdAt: string }>;
  caps: string[];
}

export interface RepoQuality {
  readmeBytes: number;
  readmeText: string;
  licensePresent: boolean;
  testsPresent: boolean;
  ciPresent: boolean;
}

export interface RepoIssueSummary {
  open: number;
  closed: number;
  discussions: number;
  responseHours: number[];
}

export interface ReleaseInfo {
  tag_name: string;
  published_at: string | null;
  prerelease: boolean;
  assets: Array<{ download_count: number }>;
}

export interface SecuritySummary {
  sbomPackages: Array<{ name?: string; externalRefs?: Array<{ referenceType?: string; referenceLocator?: string }> }>;
  codeScanning: Array<{ state: string; rule?: { security_severity_level?: string } }> | null;
  dependabot: Array<{ state: string; security_advisory?: { severity?: string } }> | null;
  codeScanningEnabled: boolean;
  dependabotEnabled: boolean;
  checks: Array<{ conclusion: string | null; status: string }>;
}

export interface StargazerEvent {
  starred_at: string;
  user: { login: string };
}

export interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, unknown>;
}

export interface EngineData {
  username: string;
  now: Date;
  user: GitHubUser;
  repos: GitHubRepo[];
  topRepos: GitHubRepo[];
  graphql: GraphQLSummary;
  search: SearchSummary;
  events: GitHubEvent[];
  orgs: Array<{ login: string; avatar_url: string }>;
  gists: Array<{ id: string; created_at: string; updated_at: string; comments: number }>;
  subscriptions: Array<{ full_name: string }>;
  followers: string[];
  following: string[];
  userStarred: Array<{ starred_at: string; repo: GitHubRepo }>;
  profileReadme: { present: boolean; bytes: number; text: string };
  languages: Record<string, Record<string, number>>;
  releases: Record<string, ReleaseInfo[]>;
  branches: Record<string, Array<{ name: string; protected: boolean }>>;
  commits: Record<string, GitHubCommit[]>;
  commitDetails: Record<string, GitHubCommit>;
  commitActivity: Record<string, Array<{ week: number; total: number; days: number[] }>>;
  codeFrequency: Record<string, Array<[number, number, number]>>;
  participation: Record<string, { all: number[]; owner: number[] }>;
  punchCards: Record<string, Array<[number, number, number]>>;
  contributors: Record<string, Array<{ login?: string; contributions: number }>>;
  qualities: Record<string, RepoQuality>;
  issues: Record<string, RepoIssueSummary>;
  security: Record<string, SecuritySummary>;
  forks: Record<string, GitHubRepo[]>;
  stargazers: Record<string, StargazerEvent[]>;
  forkComparisons: Record<string, { ahead_by: number; behind_by: number; total_commits: number; prCount: number }>;
  authoredIssueResponseHours: number[];
  reviewComments: Array<{ repository: string; pullRequestNumber: number; body: string; createdAt: string }>;
  unavailable: Record<string, string>;
  sampled: Record<string, { size: number; note: string }>;
  snapshots: Array<{ at: string; followers: number; stars: number; orgs: string[] }>;
}

export interface BudgetSnapshot {
  rest: { used: number; limit: number; remaining: number };
  graphql: { used: number; limit: number; remaining: number };
  search: { used: number; limit: number; remaining: number };
}

export type AnalysisProgressKind =
  | "phase"
  | "request-start"
  | "request-complete"
  | "retry"
  | "warning"
  | "cache"
  | "complete";

export interface AnalysisProgressEvent {
  kind: AnalysisProgressKind;
  phase: string;
  message: string;
  timestamp: string;
  elapsedMs: number;
  budget: BudgetSnapshot;
  bucket?: "rest" | "graphql" | "search";
  label?: string;
  method?: string;
  attempt?: number;
  statusCode?: number;
  retryAfterMs?: number;
}

export type AnalysisProgressCallback = (event: AnalysisProgressEvent) => void;

export type AnalysisStreamMessage =
  | { type: "progress"; event: AnalysisProgressEvent }
  | { type: "result"; result: EngineResult }
  | { type: "error"; error: string };

export interface EngineMeta {
  authTier: "TOKEN-POOL";
  analysisMode: AnalysisMode;
  apiVersion: string;
  timestamp: string;
  budget: BudgetSnapshot;
  budgetPreview: AnalysisModeProfile;
  cache: {
    resultHit: boolean;
    endpointHits: number;
    endpointMisses: number;
    ttlSeconds: number;
  };
  githubRateLimit: Record<string, unknown> | null;
  skippedRules: Array<{ id: string; reason: string }>;
  unavailableRules: Array<{ id: string; reason: string }>;
  sampledRules: Array<{ id: string; sampleSize: number; note: string }>;
  warnings: string[];
  dataWindows: Record<string, string>;
}

export interface ScoresOutput {
  breakdown: Record<string, RuleResult<number | Record<string, unknown>>>;
  weights: Record<string, number>;
  authenticityMultiplier: number;
  weightedBeforeMultiplier: number;
  finalScore: number;
}

export type LetterGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface InterpretationGrade {
  id: string;
  label: string;
  score: number;
  grade: LetterGrade;
  tier: string;
  description: string;
  evidence: string[];
  sourceIds: string[];
}

export interface InterpretationArchetype {
  id: string;
  label: string;
  score: number;
  rank: number;
  description: string;
  evidence: string[];
  sourceIds: string[];
  confidence: number;
}

export interface InterpretationWorkRhythm {
  timezone: "UTC";
  label: string;
  chronotypeTag: "Night owl" | "Early bird" | "Day worker" | "Evening builder" | "Mixed-hours builder" | "Insufficient sample";
  chronotypeDescription: string;
  weekLabel: string;
  caveat: string;
  confidence: number;
  totalSamples: number;
  peakHourUtc: number;
  peakDayUtc: string;
  hourly: Array<{ hour: number; count: number; share: number }>;
  daily: Array<{ day: number; label: string; count: number; share: number }>;
  buckets: Array<{ id: string; label: string; startHour: number; endHour: number; count: number; share: number }>;
}

export interface InterpretationWorkStyleAxis {
  id: string;
  left: string;
  right: string;
  value: number;
  label: string;
  evidence: string[];
  sourceIds: string[];
}

export interface InterpretationPortfolio {
  totalRepositories: number;
  ownedRepositories: number;
  activeRepositories: number;
  maintainedRepositories: number;
  dormantRepositories: number;
  archivedRepositories: number;
  productionReadyRepositories: number;
  productionReadyRatio: number;
  lifecycle: Array<{ id: string; label: string; count: number; share: number }>;
  flagships: Array<{
    repository: string;
    stars: number;
    forks: number;
    language: string | null;
    pushedDaysAgo: number | null;
    releases: number;
    readinessScore: number;
    lifecycle: string;
  }>;
  sourceIds: string[];
}

export interface InterpretationMomentum {
  label: string;
  description: string;
  current90: number;
  previous90: number;
  currentActiveDays: number;
  previousActiveDays: number;
  deltaPercent: number | null;
  weekly: Array<{ week: string; count: number; period: "previous" | "current" }>;
  sourceIds: string[];
}

export interface InterpretationConfidence {
  score: number;
  label: "high" | "medium" | "low";
  coveragePercent: number;
  availableRules: number;
  sampledRules: number;
  unavailableRules: number;
  skippedRules: number;
  warningPenalty: number;
  budgetPenalty: number;
  caveat: string;
}

export interface InterpretationTag {
  id: string;
  label: string;
  active: boolean;
  score: number;
  confidence: number;
  description: string;
  evidence: string[];
  sourceIds: string[];
}

export interface InterpretationRoleProfile {
  primary: string;
  secondary: string;
  dimensions: Array<{
    id: string;
    label: string;
    score: number;
    evidence: string[];
    sourceIds: string[];
  }>;
}

export interface InterpretationRepositoryQuality {
  repository: string;
  readinessScore: number;
  documentation: boolean;
  license: boolean;
  tests: boolean;
  ci: boolean;
  releases: number;
  securityCoverage: number;
  activeAlerts: number;
}

export interface InterpretationQualityProfile {
  score: number;
  grade: LetterGrade;
  documentationCoverage: number;
  licenseCoverage: number;
  testCoverage: number;
  ciCoverage: number;
  releaseCoverage: number;
  securityCoverage: number;
  repositories: InterpretationRepositoryQuality[];
  sourceIds: string[];
}

export interface InterpretationEvidenceTrace {
  id: string;
  label: string;
  value: string;
  status: RuleStatus | "derived";
  confidence: number;
  freshness: string;
  sourceIds: string[];
}

export interface InterpretationDataQuality {
  score: number;
  label: "strong" | "usable" | "limited";
  ruleCoverage: number;
  sampleDepth: number;
  freshness: number;
  sourceReliability: number;
  caveats: string[];
}

export interface InterpretationOutput {
  headline: string;
  overall: InterpretationGrade;
  grades: InterpretationGrade[];
  archetypes: InterpretationArchetype[];
  workRhythm: InterpretationWorkRhythm;
  workStyle: InterpretationWorkStyleAxis[];
  portfolio: InterpretationPortfolio;
  momentum: InterpretationMomentum;
  strengths: InterpretationGrade[];
  focusAreas: InterpretationGrade[];
  confidence: InterpretationConfidence;
  tags: InterpretationTag[];
  roleProfile: InterpretationRoleProfile;
  qualityProfile: InterpretationQualityProfile;
  evidenceTrace: InterpretationEvidenceTrace[];
  dataQuality: InterpretationDataQuality;
}

export interface EngineResult {
  profile: { login: string; name: string | null; avatarUrl: string; url: string };
  baseline: Record<string, RuleResult>;
  scores: ScoresOutput;
  signals: Record<string, SignalResult>;
  charts: Record<string, ChartResult>;
  interpretation: InterpretationOutput;
  meta: EngineMeta;
}
