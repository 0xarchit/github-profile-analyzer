export interface ProfileSummary {
  username: string;
  name: string;
  bio: string | null;
  followers: number;
  following: number;
  avatar: string | null;
  total_stars: number;
  public_repo_count: number;
  original_repos: Record<string, RepositoryFields>;
  career_stats: CareerStats;
  calendar_data: ContributionCalendar;
  badges: Record<string, string>;
}

export interface RepositoryFields {
  n: string;
  description: string | null;
  stars: number;
  forks: number;
  primary_lang: string | null;
  issues: number;
  watchers: number;
  topics: string[];
}

export interface Trophy {
  name: string;
  rank: string;
  color: string;
}

export interface LanguageDistribution {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number | boolean | null;
}

export interface CommitActivity {
  month: string;
  count: number;
  [key: string]: string | number | boolean | null;
}

export interface CareerStats {
	total_contributions?: number;
	total_commits: number;
	total_prs: number;
	total_issues: number;
	total_reviews?: number;
	daily_streak: number;
	daily_best: number;
	weekly_streak: number;
	weekly_best: number;
	top_languages: LanguageDistribution[];
	commit_activity: CommitActivity[];
	trophies?: Trophy[];
}

export interface ContributionDay {
  contributionCount: number;
  date: string;
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface ContributionCalendar {
  weeks: ContributionWeek[];
}

export interface UserSettings {
  profile_locked: boolean;
  keep_history: boolean;
  public_scans: boolean;
  primary_scan_id: string | null;
}

export interface User {
  id: number;
  github_id: number;
  username: string;
  avatar_url: string | null;
  settings: UserSettings;
  created_at: string;
  updated_at: string;
}

export interface SessionData {
  githubId: number;
  username: string;
  accessToken: string;
  avatarUrl: string;
}

export interface AnalysisResult {
  score: number;
  segments: {
    roast: string;
    technical_analysis: string;
    strategic_advice: string;
  };
  improvement_areas: string[];
  diagnostics: string[];
  timestamp: string;
  username: string;
  project_ideas?: Record<
    string,
    {
      title: string;
      description: string;
      "tech stack": string[];
    }
  >;
  tag?: {
    tag_name: string;
    description: string;
  };
  developer_type?: string;
  career_stats?: CareerStats;
  calendar_data?: ContributionCalendar;
  badges?: Record<string, string>;
  isStarred?: boolean;
  cachedAt?: string;
  isLocked?: boolean;
  snapshotId?: string;
  isHistorical?: boolean;
  top_repos?: Array<{
    name: string;
    stars: number;
    description?: string;
    language?: string;
    pushedAt?: string;
  }>;
  achievements?: string[];
  stats?: {
    total_stars?: number;
    total_forks?: number;
    contribution_streak?: number;
    tech_stack_diversity?: number;
  };
  detailed_analysis?: string[];
  total_stars?: number;
  followers?: number;
  public_repo_count?: number;
  original_repos?: Record<string, RepositoryFields>;
}

export interface GithubRepoNode {
  name: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  isFork: boolean;
  primaryLanguage: { name: string; color?: string } | null;
  openIssues: { totalCount: number };
  watchers: { totalCount: number };
  repositoryTopics: { nodes: { topic: { name: string } }[] };
}

export interface Scan {
  id: string;
  user_id: number;
  username: string;
  data: AnalysisResult;
  created_at: string;
}
