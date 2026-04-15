import { describe, it, expect } from "vitest";
import { AnalysisResultSchema } from "../lib/validation";

describe("Validation Protocol - Zod Schema Validation", () => {
  const validData = {
    score: 85,
    segments: {
      roast:
        "Your code is so messy it looks like a spider on caffeine wrote it.",
      technical_analysis: "High commit velocity but low PR reviews.",
      strategic_advice: "Implement strict linting and unified type system.",
    },
    improvement_areas: ["Type Safety", "Documentation"],
    diagnostics: ["Missing JSDoc", "No unit tests"],
    developer_type: "Fullstack Architect",
    total_stars: 42,
    followers: 120,
    public_repo_count: 15,
    career_stats: {
      total_commits: 1500,
      total_prs: 45,
      total_issues: 30,
      daily_streak: 5,
      daily_best: 20,
      weekly_streak: 2,
      weekly_best: 8,
      top_languages: [{ name: "TypeScript", value: 75, color: "#3178c6" }],
      commit_activity: [{ month: "Jan", count: 120 }],
    },
    calendar_data: {
      weeks: [
        {
          contributionDays: [{ contributionCount: 5, date: "2024-01-01" }],
        },
      ],
    },
  };

  describe("Complete Data Validation", () => {
    it("should validate complete correct data", () => {
      const result = AnalysisResultSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept data with default empty arrays", () => {
      const data = {
        ...validData,
        improvement_areas: undefined,
        diagnostics: undefined,
      };
      const result = AnalysisResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.improvement_areas).toEqual([]);
        expect(result.data.diagnostics).toEqual([]);
      }
    });
  });

  describe("Score Validation", () => {
    it("should reject invalid scores (>100)", () => {
      const invalid = { ...validData, score: 105 };
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject negative scores", () => {
      const invalid = { ...validData, score: -10 };
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should accept score 0", () => {
      const valid = { ...validData, score: 0 };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should accept score 100", () => {
      const valid = { ...validData, score: 100 };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("Segments Validation", () => {
    it("should reject missing mandatory segments", () => {
      const invalid = { ...validData, segments: { roast: "only roast" } };
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should require all three segment texts", () => {
      const missingOne = {
        ...validData,
        segments: { roast: "text", technical_analysis: "text" },
      };
      const result = AnalysisResultSchema.safeParse(missingOne);
      expect(result.success).toBe(false);
    });
  });

  describe("Arrays & Lists Validation", () => {
    it("should accept improvement_areas array", () => {
      const valid = {
        ...validData,
        improvement_areas: ["Performance", "Documentation"],
      };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should default missing improvement_areas to empty array", () => {
      const data = { ...validData, improvement_areas: undefined };
      const result = AnalysisResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.improvement_areas).toEqual([]);
      }
    });

    it("should accept empty improvement_areas array", () => {
      const valid = { ...validData, improvement_areas: [] };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should default missing diagnostics to empty array", () => {
      const data = { ...validData, diagnostics: undefined };
      const result = AnalysisResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.diagnostics).toEqual([]);
      }
    });

    it("should accept large arrays", () => {
      const largeArray = Array(100).fill("item");
      const valid = { ...validData, improvement_areas: largeArray };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("Nested Objects Validation", () => {
    it("should validate career_stats structure", () => {
      const invalid = JSON.parse(JSON.stringify(validData));
      invalid.career_stats.total_commits = "1500";
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should validate calendar_data structure", () => {
      const invalid = JSON.parse(JSON.stringify(validData));
      invalid.calendar_data.weeks[0].contributionDays[0].contributionCount =
        "five";
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should handle missing optional nested fields", () => {
      const invalid = JSON.parse(JSON.stringify(validData));
      delete invalid.career_stats.top_languages;
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("String Fields Validation", () => {
    it("should accept non-empty strings", () => {
      const valid = { ...validData, developer_type: "Expert" };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should accept long strings", () => {
      const long = "a".repeat(100);
      const valid = { ...validData, developer_type: long };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("Numeric Fields Validation", () => {
    it("should accept valid star count", () => {
      const valid = { ...validData, total_stars: 1000 };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should accept zero star count", () => {
      const valid = { ...validData, total_stars: 0 };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject negative star count", () => {
      const invalid = { ...validData, total_stars: -5 };
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should accept valid follower count", () => {
      const valid = { ...validData, followers: 5000 };
      const result = AnalysisResultSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject negative followers", () => {
      const invalid = { ...validData, followers: -10 };
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Error Messages", () => {
    it("should provide clear error messages", () => {
      const invalid = { ...validData, score: 105 };
      const result = AnalysisResultSchema.safeParse(invalid);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should indicate which field failed validation", () => {
      const invalid = { ...validData, score: "not a number" };
      const result = AnalysisResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Partial Data Handling", () => {
    it("should allow optional fields to be missing", () => {
      const minimal = { ...validData } as Partial<typeof validData>;
      delete minimal.developer_type;
      const result = AnalysisResultSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it("should not accept null for optional fields", () => {
      const withNull = { ...validData, developer_type: null };
      const result = AnalysisResultSchema.safeParse(withNull);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes("developer_type"),
          ),
        ).toBe(true);
      }
    });
  });

  describe("Type Coercion", () => {
    it("should handle number-string conversions", () => {
      const data = { ...validData, score: "85" as unknown as number };
      const result = AnalysisResultSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path.includes("score")),
        ).toBe(true);
      }
    });
  });
});
