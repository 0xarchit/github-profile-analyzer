import type { ChartKind, ChartResult, CostTier, RuleResult, RuleStatus, SignalResult } from "../types";

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
export const round = (value: number, digits = 2) => Number(value.toFixed(digits));
export const ratio = (part: number, total: number) => (total > 0 ? part / total : 0);
export const daysBetween = (a: string | Date, b: string | Date) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
export const hoursBetween = (a: string | Date, b: string | Date) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
export const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
export const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

// Internal helper: percentile on an already-sorted array (avoids re-sort).
const sortedPercentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;

export const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sortedPercentile(sorted, p);
};

/**
 * Sort once and return median + common percentiles in a single pass.
 * Use this wherever multiple percentiles of the same array are needed.
 */
export const sortedStats = (values: number[]) => {
  if (!values.length) return { median: 0, p25: 0, p75: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    median: med,
    p25: sortedPercentile(sorted, 0.25),
    p75: sortedPercentile(sorted, 0.75),
    p90: sortedPercentile(sorted, 0.9),
  };
};

// Welford online algorithm: single pass computes mean + variance without a temp array.
export const standardDeviation = (values: number[]) => {
  if (values.length < 2) return 0;
  let m = 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i]! - m;
    m += delta / (i + 1);
    s += delta * (values[i]! - m);
  }
  return Math.sqrt(s / (values.length - 1));
};
export const coefficientOfVariation = (values: number[]) => {
  const average = mean(values);
  return average > 0 ? standardDeviation(values) / average : 0;
};
export const saturatingScore = (value: number, k: number) => clamp(100 * (1 - Math.exp(-k * Math.max(0, value))));
export const weightedAverage = (pairs: Array<[number, number]>) => {
  const weight = pairs.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  return weight ? pairs.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) / weight : 0;
};
export const gini = (values: number[]) => {
  const sorted = values.filter((value) => value >= 0).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (!sorted.length || total === 0) return 0;
  const weighted = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
};
export const entropy = (values: number[]) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  return -values.reduce((sum, value) => {
    if (!value) return sum;
    const p = value / total;
    return sum + p * Math.log2(p);
  }, 0);
};
export const tokenize = (value: string) =>
  new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1));

// Jaccard without allocating a union Set: |union| = |a| + |b| - |intersection|
export const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const unionSize = a.size + b.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
};
export const ok = <T>(
  id: string,
  name: string,
  value: T,
  description: string,
  source: string,
  cost: CostTier = "cheap",
  details?: Record<string, unknown>,
): RuleResult<T> => ({
  id,
  name,
  status: "ok",
  value,
  description,
  source,
  cost,
  ...(details ? { details } : {}),
});
export const withStatus = <T>(
  id: string,
  name: string,
  status: RuleStatus,
  value: T | null,
  description: string,
  source: string,
  cost: CostTier,
  caveat: string,
  sampleSize?: number,
): RuleResult<T> => ({ id, name, status, value, description, source, cost, caveat, sampleSize });
export const unavailable = (id: string, name: string, reason: string, source: string, cost: CostTier = "moderate") =>
  withStatus(id, name, "unavailable", null, reason, source, cost, reason);
export const skipped = (id: string, name: string, reason: string, source: string, cost: CostTier = "expensive") =>
  withStatus(id, name, "skipped", null, reason, source, cost, reason);
export const oauthOnly = (id: string, name: string, source: string) =>
  withStatus(id, name, "requires_oauth", null, "Requires user OAuth - not available in token-pool mode.", source, "oauth", "USER-LOGGED-IN only");
export const sampled = <T>(id: string, name: string, value: T, description: string, source: string, sampleSize: number, caveat: string) =>
  withStatus(id, name, "sampled", value, description, source, "expensive", caveat, sampleSize);
export const signal = <T>(base: RuleResult<T>, flagged: boolean): SignalResult<T> => ({ ...base, flagged });
export const chart = <T>(base: RuleResult<T>, kind: ChartKind): ChartResult<T> => ({ ...base, kind });
export const recordFrom = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;
