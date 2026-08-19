import { describe, it, expect } from "vitest";
import { ANALYSIS_MODE_PROFILES, getAnalysisModeProfile } from "../engine";
import { runBaselineRules } from "../rules/baseline";
import { runScoringRules } from "../rules/scoring";
import { runSignalRules } from "../rules/signals";
import { runChartRules } from "../rules/charts";
import { runInterpretation } from "../interpretation";
import type { EngineData } from "../types";

function createMockEngineData(overrides: Partial<EngineData> = {}): EngineData {
  return {
    username: "testdev",
    now: new Date("2026-08-19T00:00:00Z"),
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
    repos: [
      {
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
      },
    ],
    topRepos: [
      {
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
      },
    ],
    forks: {},
    stargazers: {},
    forkComparisons: {},
    languages: { "testdev/flagship-repo": { TypeScript: 80000, CSS: 20000 } },
    releases: { "testdev/flagship-repo": [] },
    branches: { "testdev/flagship-repo": [] },
    commits: { "testdev/flagship-repo": [] },
    commitDetails: {},
    commitActivity: {},
    codeFrequency: {},
    participation: {},
    punchCards: {},
    contributors: {},
    qualities: {
      "testdev/flagship-repo": {
        readmeBytes: 1500,
        readmeText: "# Flagship\n## Installation\nRun npm install",
        licensePresent: true,
        testsPresent: true,
        ciPresent: true,
      },
    },
    issues: {},
    security: {},
    authoredIssueResponseHours: [],
    reviewComments: [],
    unavailable: {},
    sampled: {},
    snapshots: [],
    graphql: {
      totalContributions: 540,
      restrictedContributionsCount: 0,
      totalPullRequestReviewContributions: 12,
      totalPullRequestContributions: 25,
      totalIssueContributions: 8,
      totalDiscussionCommentContributions: 4,
      contributionYears: [2022, 2023, 2024, 2025, 2026],
      calendar: [
        { date: "2026-08-01", contributionCount: 5, weekday: 6 },
        { date: "2026-08-02", contributionCount: 3, weekday: 0 },
        { date: "2026-08-03", contributionCount: 8, weekday: 1 },
      ],
      contributionsByRepo: [{ repository: "testdev/flagship-repo", count: 400 }],
      pinnedItems: [{ nameWithOwner: "testdev/flagship-repo", stargazerCount: 120 }],
      starredRepositoriesCount: 35,
      sponsoringCount: 0,
      sponsorCount: 0,
      repositoriesContributedToCount: 5,
      pullRequests: [],
      reviews: [],
      graphqlCost: 1,
      graphqlRemaining: 4999,
    },
    search: {
      prsOpened: 15,
      prsMerged: 12,
      prsMergedExternal: 4,
      issuesOpened: 6,
      issuesClosed: 5,
      reviews: 8,
      authoredIssues: [],
      caps: [],
    },
    ...overrides,
  };
}

describe("Deterministic Analysis Mode Profiles", () => {
  it("defines bounded budgets for quick, standard, and deep modes", () => {
    expect(ANALYSIS_MODE_PROFILES.quick.budget.rest).toBeLessThanOrEqual(45);
    expect(ANALYSIS_MODE_PROFILES.standard.budget.rest).toBe(240);
    expect(ANALYSIS_MODE_PROFILES.deep.budget.rest).toBe(350);

    expect(getAnalysisModeProfile("quick").id).toBe("quick");
    expect(getAnalysisModeProfile("standard").id).toBe("standard");
    expect(getAnalysisModeProfile("deep").id).toBe("deep");
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

describe("Deterministic Interpretation Layer", () => {
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
});
