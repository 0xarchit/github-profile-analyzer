import { describe, it, expect } from "vitest";
import { getAnalysisModeProfile } from "../engine";
import { runBaselineRules } from "../rules/baseline";
import { runScoringRules } from "../rules/scoring";
import { runSignalRules } from "../rules/signals";
import { runChartRules } from "../rules/charts";
import { runInterpretation, gradeForScore, interpretE3WorkRhythm, interpretE6Momentum } from "../interpretation";
import type { EngineData, GitHubRepo } from "../types";

const flagshipRepo: GitHubRepo = {
  id: 101,
  name: "flagship-repo",
  full_name: "testdev/flagship-repo",
  html_url: "https://github.com/testdev/flagship-repo",
  description: "Primary project",
  fork: false,
  forks_count: 20,
  stargazers_count: 120,
  watchers_count: 120,
  size: 5000,
  language: "TypeScript",
  topics: ["typescript", "fullstack"],
  created_at: "2022-01-01T00:00:00Z",
  updated_at: "2026-08-19T00:00:00Z",
  pushed_at: "2026-08-18T00:00:00Z",
  archived: false,
  disabled: false,
  homepage: null,
  has_wiki: false,
  has_pages: false,
  has_discussions: true,
  is_template: false,
  open_issues_count: 3,
  default_branch: "main",
  license: { spdx_id: "MIT", name: "MIT License" },
  mirror_url: null,
  owner: { login: "testdev" },
};

function createMockEngineData(overrides: Partial<EngineData> = {}): EngineData {
  const mockNow = new Date("2026-08-19T00:00:00Z");
  return {
    username: "testdev",
    now: mockNow,
    user: {
      login: "testdev",
      name: "Test Developer",
      avatar_url: "https://avatars.githubusercontent.com/u/1",
      html_url: "https://github.com/testdev",
      bio: "Open source builder",
      public_repos: 12,
      public_gists: 4,
      followers: 150,
      following: 50,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2026-08-19T00:00:00Z",
      company: "",
      blog: "",
      location: "Earth",
      hireable: true,
      twitter_username: null,
    },
    orgs: [{ login: "org1", avatar_url: "" }],
    gists: [],
    subscriptions: [],
    followers: [],
    following: [],
    userStarred: [],
    profileReadme: { present: true, bytes: 500, text: "# Hello" },
    events: [],
    repos: [flagshipRepo],
    topRepos: [flagshipRepo],
    graphql: {
      totalContributions: 450,
      restrictedContributionsCount: 0,
      totalPullRequestReviewContributions: 12,
      totalPullRequestContributions: 35,
      totalIssueContributions: 18,
      totalDiscussionCommentContributions: 0,
      contributionYears: [2024, 2025, 2026],
      calendar: Array.from({ length: 365 }, (_, i) => ({
        date: new Date(mockNow.getTime() - (364 - i) * 86400000).toISOString().split("T")[0]!,
        contributionCount: i % 3 === 0 ? 3 : 0,
        weekday: i % 7,
        color: "#22c55e",
      })),
      contributionsByRepo: [{ repository: "testdev/flagship-repo", count: 200 }],
      pinnedItems: [{ nameWithOwner: "testdev/flagship-repo", stargazerCount: 120 }],
      starredRepositoriesCount: 85,
      sponsoringCount: 1,
      sponsorCount: 0,
      repositoriesContributedToCount: 8,
      pullRequests: [],
      reviews: [],
      graphqlCost: 1,
      graphqlRemaining: 4999,
    },
    search: {
      prsOpened: 35,
      prsMerged: 28,
      prsMergedExternal: 5,
      issuesOpened: 18,
      issuesClosed: 14,
      authoredIssues: [],
      reviews: 12,
      caps: [],
    },
    commits: {
      "testdev/flagship-repo": [
        {
          sha: "abc1234",
          html_url: "https://github.com/testdev/flagship-repo/commit/abc1234",
          commit: {
            author: { name: "Test Dev", date: "2026-08-18T10:00:00Z" },
            committer: { name: "Test Dev", date: "2026-08-18T10:00:00Z" },
            message: "feat: deterministic beta",
            verification: { verified: true, reason: "valid" },
          },
          author: { login: "testdev" },
        },
      ],
    },
    commitDetails: {},
    commitActivity: {
      "testdev/flagship-repo": Array.from({ length: 52 }, (_, w) => ({
        week: 1700000000 + w * 604800,
        total: (w % 4) + 1,
        days: [0, 1, 0, 1, 0, 0, 0],
      })),
    },
    codeFrequency: {
      "testdev/flagship-repo": [[1700000000, 500, -120]],
    },
    participation: {
      "testdev/flagship-repo": { all: [5, 4, 3], owner: [5, 4, 3] },
    },
    punchCards: {
      "testdev/flagship-repo": [
        [1, 14, 10],
        [2, 14, 15],
        [3, 14, 12],
      ],
    },
    languages: {
      "testdev/flagship-repo": { TypeScript: 85000, JavaScript: 15000 },
    },
    releases: {
      "testdev/flagship-repo": [
        { tag_name: "v1.0.0", published_at: "2026-06-01T00:00:00Z", prerelease: false, assets: [{ download_count: 50 }] },
      ],
    },
    branches: {
      "testdev/flagship-repo": [{ name: "main", protected: true }],
    },
    qualities: {
      "testdev/flagship-repo": {
        readmeBytes: 1200,
        readmeText: "# Flagship",
        licensePresent: true,
        testsPresent: true,
        ciPresent: true,
      },
    },
    security: {
      "testdev/flagship-repo": {
        sbomPackages: [],
        codeScanningEnabled: true,
        dependabotEnabled: true,
        codeScanning: [],
        dependabot: [],
        checks: [{ status: "completed", conclusion: "success" }],
      },
    },
    stargazers: {
      "testdev/flagship-repo": [{ user: { login: "admirer" }, starred_at: "2026-07-01T00:00:00Z" }],
    },
    contributors: {
      "testdev/flagship-repo": [{ login: "testdev", contributions: 100 }],
    },
    issues: {
      "testdev/flagship-repo": { open: 3, closed: 12, discussions: 2, responseHours: [4, 12] },
    },
    authoredIssueResponseHours: [4, 8, 16],
    reviewComments: [],
    forks: {},
    forkComparisons: {},
    snapshots: [],
    sampled: {},
    unavailable: {},
    ...overrides,
  };
}

describe("Deterministic Engine Mode Profiles & Budgets", () => {
  it("enforces strict budget ceiling on quick mode", () => {
    const profile = getAnalysisModeProfile("quick");
    expect(profile.budget.rest).toBeLessThanOrEqual(45);
    expect(profile.budget.graphql).toBeLessThanOrEqual(4);
    expect(profile.budget.search).toBeLessThanOrEqual(6);
    expect(profile.repositoryLimit).toBe(3);
  });

  it("allocates standard mode budget for deep repos", () => {
    const profile = getAnalysisModeProfile("standard");
    expect(profile.budget.rest).toBe(240);
    expect(profile.repositoryLimit).toBe(6);
  });

  it("allocates deep mode budget for full scans", () => {
    const profile = getAnalysisModeProfile("deep");
    expect(profile.budget.rest).toBe(350);
    expect(profile.repositoryLimit).toBe(10);
  });
});

describe("Deterministic Scoring Rules", () => {
  it("ensures weights sum precisely to 1.0", () => {
    const data = createMockEngineData();
    const signals = runSignalRules(data);
    const scores = runScoringRules(data, signals);

    const totalWeight = Object.entries(scores.weights)
      .filter(([id]) => id !== "2.7")
      .reduce((a, [, w]) => a + w, 0);
    expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.0001);
  });

  it("calculates authenticity multiplier with minimum floor of 0.4", () => {
    const data = createMockEngineData();
    const signals = runSignalRules(data);
    const scores = runScoringRules(data, signals);

    expect(scores.authenticityMultiplier).toBeGreaterThanOrEqual(0.4);
    expect(scores.authenticityMultiplier).toBeLessThanOrEqual(1.0);
  });

  it("produces valid finalScore in the range [0, 100]", () => {
    const data = createMockEngineData();
    const signals = runSignalRules(data);
    const scores = runScoringRules(data, signals);

    expect(scores.finalScore).toBeGreaterThanOrEqual(0);
    expect(scores.finalScore).toBeLessThanOrEqual(100);
    expect(Number.isFinite(scores.finalScore)).toBe(true);
  });
});

describe("Deterministic Interpretation Layer & Boundaries", () => {
  it("computes letter grades, archetypes, and chronotype purely from rule results", () => {
    const data = createMockEngineData();
    const baseline = runBaselineRules(data);
    const signals = runSignalRules(data);
    const scores = runScoringRules(data, signals);
    const charts = runChartRules(data, scores);
    const interpretation = runInterpretation({
      data,
      baseline,
      scores,
      signals,
      charts,
      warnings: [],
      budget: {
        rest: { used: 10, limit: 45, remaining: 35 },
        graphql: { used: 1, limit: 4, remaining: 3 },
        search: { used: 2, limit: 6, remaining: 4 },
      },
    });

    expect(interpretation.overall.grade).toMatch(/^(A\+|A|B|C|D|F)$/);
    expect(interpretation.headline).toBeDefined();
    expect(interpretation.archetypes.length).toBeGreaterThan(0);
    expect(interpretation.confidence.score).toBeGreaterThan(0);
  });

  it("evaluates gradeForScore boundaries accurately", () => {
    expect(gradeForScore("dim", "Dimension", 96, []).grade).toBe("A+");
    expect(gradeForScore("dim", "Dimension", 87, []).grade).toBe("A");
    expect(gradeForScore("dim", "Dimension", 72, []).grade).toBe("B");
    expect(gradeForScore("dim", "Dimension", 58, []).grade).toBe("C");
    expect(gradeForScore("dim", "Dimension", 44, []).grade).toBe("D");
    expect(gradeForScore("dim", "Dimension", 30, []).grade).toBe("F");
  });

  it("evaluates work rhythm chronotypes across distinct peak hours", () => {
    const nightOwlData = createMockEngineData({
      punchCards: {
        "testdev/flagship-repo": [[1, 2, 20], [2, 3, 15]],
      },
    });
    const earlyBirdData = createMockEngineData({
      punchCards: {
        "testdev/flagship-repo": [[1, 7, 25], [2, 8, 20]],
      },
    });
    const afternoonData = createMockEngineData({
      punchCards: {
        "testdev/flagship-repo": [[1, 14, 30], [2, 15, 25]],
      },
    });
    const eveningData = createMockEngineData({
      punchCards: {
        "testdev/flagship-repo": [[1, 20, 25], [2, 21, 20]],
      },
    });

    const nightOwl = interpretE3WorkRhythm(nightOwlData);
    const earlyBird = interpretE3WorkRhythm(earlyBirdData);
    const afternoon = interpretE3WorkRhythm(afternoonData);
    const evening = interpretE3WorkRhythm(eveningData);

    expect(nightOwl.chronotypeTag).toBe("Night owl");
    expect(earlyBird.chronotypeTag).toBe("Early bird");
    expect(afternoon.chronotypeTag).toBe("Day worker");
    expect(evening.chronotypeTag).toBe("Evening builder");
  });

  it("evaluates momentum states correctly", () => {
    const baseMock = createMockEngineData();
    const surgingData = createMockEngineData({
      graphql: {
        ...baseMock.graphql,
        calendar: Array.from({ length: 365 }, (_, i) => ({
          date: new Date(baseMock.now.getTime() - (364 - i) * 86400000).toISOString().split("T")[0]!,
          contributionCount: i >= 275 ? 10 : 1,
          weekday: i % 7,
          color: "#22c55e",
        })),
      },
    });
    const momentum = interpretE6Momentum(surgingData);
    expect(["Surging", "Accelerating", "Steady"]).toContain(momentum.label);
  });
});
