import { describe, it, expect } from "vitest";
import { calculateDetailedStreaks } from "../profile";
import type { ContributionWeek } from "@/types";

function makeWeek(counts: number[]): ContributionWeek {
  return {
    contributionDays: counts.map((contributionCount, i) => ({
      contributionCount,
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    })),
  };
}

describe("calculateDetailedStreaks", () => {
  it("returns all zeros for empty input", () => {
    const result = calculateDetailedStreaks([]);
    expect(result).toEqual({
      daily_streak: 0,
      daily_best: 0,
      weekly_streak: 0,
      weekly_best: 0,
    });
  });

  it("returns all zeros when no contributions exist", () => {
    const result = calculateDetailedStreaks([makeWeek([0, 0, 0, 0, 0, 0, 0])]);
    expect(result).toEqual({
      daily_streak: 0,
      daily_best: 0,
      weekly_streak: 0,
      weekly_best: 0,
    });
  });

  it("counts a single active day as daily_streak=1 and daily_best=1", () => {
    const result = calculateDetailedStreaks([makeWeek([0, 0, 0, 0, 0, 0, 1])]);
    expect(result.daily_streak).toBe(1);
    expect(result.daily_best).toBe(1);
  });

  it("counts consecutive active days correctly", () => {
    // All 7 days active → streak = 7
    const result = calculateDetailedStreaks([makeWeek([1, 2, 3, 1, 2, 3, 1])]);
    expect(result.daily_streak).toBe(7);
    expect(result.daily_best).toBe(7);
  });

  it("resets current streak on a gap but preserves best", () => {
    // Week 1: [3,3,3,0,0,0,0] → best=3, current at that week=0
    // Week 2: [0,0,0,0,2,2,2] → current ends at 3, final streak=3
    const result = calculateDetailedStreaks([
      makeWeek([3, 3, 3, 0, 0, 0, 0]),
      makeWeek([0, 0, 0, 0, 2, 2, 2]),
    ]);
    expect(result.daily_best).toBe(3);
    expect(result.daily_streak).toBe(3);
  });

  it("preserves streak when only the last (today) day has no contributions (grace period)", () => {
    // The algorithm skips the last day if it's 0 — today may not have contributions yet.
    // So [1,1,1,1,1,1,0] has a streak of 6 (yesterday and earlier all active).
    const result = calculateDetailedStreaks([makeWeek([1, 1, 1, 1, 1, 1, 0])]);
    expect(result.daily_streak).toBe(6);
    expect(result.daily_best).toBe(6);
  });

  it("streak is 0 when the last two days both have no contributions", () => {
    // Grace period only applies to the very last day; a second empty day breaks the streak.
    const result = calculateDetailedStreaks([makeWeek([1, 1, 1, 1, 1, 0, 0])]);
    expect(result.daily_streak).toBe(0);
    expect(result.daily_best).toBe(5);
  });

  it("weekly streak counts consecutive active weeks", () => {
    const activeWeek = makeWeek([0, 0, 0, 0, 0, 0, 1]);
    const emptyWeek = makeWeek([0, 0, 0, 0, 0, 0, 0]);
    // 2 active, 1 empty, 1 active → best=2, current=1
    const result = calculateDetailedStreaks([
      activeWeek,
      activeWeek,
      emptyWeek,
      activeWeek,
    ]);
    expect(result.weekly_best).toBe(2);
    expect(result.weekly_streak).toBe(1);
  });

  it("weekly streak is preserved when only the last (this) week has no contributions (grace period)", () => {
    // Same grace-period logic applies at the weekly level.
    const activeWeek = makeWeek([0, 0, 0, 0, 0, 0, 1]);
    const emptyWeek = makeWeek([0, 0, 0, 0, 0, 0, 0]);
    const result = calculateDetailedStreaks([activeWeek, activeWeek, emptyWeek]);
    expect(result.weekly_streak).toBe(2);
    expect(result.weekly_best).toBe(2);
  });

  it("weekly streak is 0 when the last two weeks both have no contributions", () => {
    const activeWeek = makeWeek([0, 0, 0, 0, 0, 0, 1]);
    const emptyWeek = makeWeek([0, 0, 0, 0, 0, 0, 0]);
    const result = calculateDetailedStreaks([activeWeek, activeWeek, emptyWeek, emptyWeek]);
    expect(result.weekly_streak).toBe(0);
    expect(result.weekly_best).toBe(2);
  });
});
