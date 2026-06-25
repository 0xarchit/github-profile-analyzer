import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before any import of the module under test
vi.mock("@/lib/telegram-alert", () => ({
  sendTelegramAlert: vi.fn().mockResolvedValue(undefined),
  TelegramAlertCollector: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    size: 0,
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getAIAnalysis } from "../ai";
import type { ProfileSummary } from "@/types";

const MINIMAL_PROFILE: ProfileSummary = {
  username: "testuser",
  name: "Test User",
  bio: null,
  followers: 10,
  following: 5,
  avatar: null,
  total_stars: 50,
  public_repo_count: 5,
  original_repos: {},
  career_stats: {
    total_contributions: 200,
    total_commits: 150,
    total_prs: 20,
    total_issues: 10,
    total_reviews: 5,
    daily_streak: 3,
    daily_best: 10,
    weekly_streak: 2,
    weekly_best: 5,
    top_languages: [{ name: "TypeScript", value: 80, color: "#3178c6" }],
    commit_activity: [{ month: "2024-01", count: 30 }],
    trophies: [],
  },
  calendar_data: { weeks: [] },
  badges: {},
};

const VALID_AI_RESPONSE = {
  score: 75,
  segments: {
    roast: "You write code like a poet with no readers.",
    technical_analysis: "Solid TypeScript usage across the board.",
    strategic_advice: "Focus on open source contributions.",
  },
  improvement_areas: ["Add more tests", "Write READMEs"],
  diagnostics: ["No CI/CD pipeline detected"],
  project_ideas: {
    "1": { title: "CLI tool", description: "A terminal helper", "tech stack": ["Node.js"] },
    "2": { title: "API wrapper", description: "Wrap a public API", "tech stack": ["TypeScript"] },
    "3": { title: "Dashboard", description: "Visualize your stats", "tech stack": ["React"] },
  },
  tag: { tag_name: "The Builder", description: "Always shipping something" },
  developer_type: "Full-Stack Developer",
};

function makeAIResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: valid AI response
  mockFetch.mockImplementation(() => makeAIResponse(VALID_AI_RESPONSE));
});

describe("getAIAnalysis", () => {
  it("returns a validated AIAnalysis for a well-formed AI response", async () => {
    const result = await getAIAnalysis(MINIMAL_PROFILE, "test-token");
    expect(result.score).toBe(75);
    expect(result.segments.roast).toContain("poet");
    expect(result.developer_type).toBe("Full-Stack Developer");
  });

  it("returns default developer_type when field is missing from AI response", async () => {
    const withoutDevType = { ...VALID_AI_RESPONSE, developer_type: undefined };
    mockFetch.mockImplementation(() => makeAIResponse(withoutDevType));
    const result = await getAIAnalysis(MINIMAL_PROFILE, "test-token");
    expect(result.developer_type).toBe("Developer"); // default applied
  });

  it("throws CORRUPT_INTELLIGENCE when AI response content is malformed JSON", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "this is not json {{{" } }],
          }),
      } as unknown as Response),
    );
    await expect(getAIAnalysis(MINIMAL_PROFILE, "test-token")).rejects.toThrow(
      "CORRUPT_INTELLIGENCE",
    );
  });

  it("throws CORRUPT_INTELLIGENCE when AI response content is empty", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "" } }] }),
      } as unknown as Response),
    );
    await expect(getAIAnalysis(MINIMAL_PROFILE, "test-token")).rejects.toThrow(
      "CORRUPT_INTELLIGENCE",
    );
  });

  it("throws on HTTP 429 after all retries", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve("rate limited"),
      } as unknown as Response),
    );
    const promise = getAIAnalysis(MINIMAL_PROFILE, "test-token");
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
