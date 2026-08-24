/**
 * smoke-test.mts — Live deep-mode smoke test for @0xarchit
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-test.mts
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-test.mts standard
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-test.mts quick 0xarchit
 *
 * Arguments (all optional):
 *   argv[2] = mode       (quick | standard | deep)   default: deep
 *   argv[3] = username                               default: 0xarchit
 *
 * Output:
 *   logs/smoke-<timestamp>-<mode>-<username>.json   full structured log
 *   logs/smoke-<timestamp>-<mode>-<username>.txt    human-readable log
 *   stdout: live streaming of every engine event
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { AnalysisMode } from "../src/lib/deterministic/types.js";

// ─── Paths ─────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(__filename), "..");

// ─── Load .env.local / .env ────────────────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  try {
    const content = readFileSync(resolve(projectRoot, file), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1 || line.trim().startsWith("#")) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
    process.stderr.write(`[env] loaded ${file}\n`);
    break;
  } catch {}
}

// ─── Args ──────────────────────────────────────────────────────────────────────
const mode = (process.argv[2] ?? "deep") as AnalysisMode;
const username = process.argv[3] ?? "0xarchit";
if (mode !== "deep") {
  console.error(`Invalid mode "${mode}". The engine now runs a single deep-dive mode.`);
  process.exit(1);
}

// ─── Import engine (tsx handles @/ alias via tsconfig.json paths) ──────────────
const { analyzeGitHubProfile } = await import("../src/lib/deterministic/engine.js");

// ─── Log setup ────────────────────────────────────────────────────────────────
const logsDir = resolve(projectRoot, "logs");
mkdirSync(logsDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const slug = `${ts}-${mode}-${username}`;
const jsonPath = resolve(logsDir, `smoke-${slug}.json`);
const txtPath  = resolve(logsDir, `smoke-${slug}.txt`);

// ─── Terminal colours ──────────────────────────────────────────────────────────
const C = {
  reset:             "\x1b[0m",
  phase:             "\x1b[96m",   // bright cyan
  "request-start":   "\x1b[90m",   // dark grey
  "request-complete":"\x1b[32m",   // green
  retry:             "\x1b[93m",   // bright yellow
  warning:           "\x1b[33m",   // yellow
  cache:             "\x1b[35m",   // magenta
  error:             "\x1b[91m",   // bright red
  dim:               "\x1b[2m",
  bold:              "\x1b[1m",
};

const STATUS_ICON: Record<number, string> = {
  200: "✅", 201: "✅", 202: "⏳", 204: "✅",
  301: "↩️ ", 302: "↩️ ", 304: "📦",
  400: "❌", 401: "🔒", 403: "🚫", 404: "❓",
  409: "⚠️ ", 422: "⚠️ ", 429: "🛑", 500: "💥", 502: "💥",
};

const KIND_PREFIX: Record<string, string> = {
  phase:              "📍 PHASE  ",
  "request-start":    "→  REQ    ",
  "request-complete": "←  RES    ",
  retry:              "🔄 RETRY  ",
  warning:            "⚠️  WARN   ",
  cache:              "📦 CACHE  ",
};

// ─── State ────────────────────────────────────────────────────────────────────
type EventRecord = Record<string, unknown>;
const events: EventRecord[] = [];
const txtLines: string[] = [];

let reqCount   = 0;
let cacheCount = 0;
let retryCount = 0;
let warnCount  = 0;

interface EndpointStat {
  calls: number;
  statuses: number[];
  errors: string[];
}
const epStats: Record<string, EndpointStat> = {};

// ─── Banner ───────────────────────────────────────────────────────────────────
const banner = `
${C.bold}════════════════════════════════════════════════════════${C.reset}
  🔬 SMOKE TEST   @${username}   mode=${mode.toUpperCase()}
  ${C.dim}logs → ${jsonPath}${C.reset}
${C.bold}════════════════════════════════════════════════════════${C.reset}
`;
process.stdout.write(banner);
txtLines.push(`SMOKE TEST @${username} mode=${mode}`);
txtLines.push(`JSON log: ${jsonPath}`);
txtLines.push("");

// ─── Run ──────────────────────────────────────────────────────────────────────
const token = process.env.GITHUB_TOKENS?.split(",")[0]?.trim() ?? "";
if (!token) {
  console.error(`${C.error}❌ GITHUB_TOKENS not set in env${C.reset}`);
  process.exit(1);
}

const startMs = Date.now();
let result: Awaited<ReturnType<typeof analyzeGitHubProfile>> | null = null;
let engineError: Error | null = null;

try {
  result = await analyzeGitHubProfile(username, {
    mode,
    bypassCache: true,
    token,
    onProgress(ev) {
      const elapsed = `[${(ev.elapsedMs / 1000).toFixed(1).padStart(5)}s]`;
      const kind    = ev.kind as string;
      const color   = C[kind as keyof typeof C] ?? C.reset;
      const prefix  = KIND_PREFIX[kind] ?? `   ${kind.padEnd(9)}`;
      const statusPart = typeof ev.statusCode === "number"
        ? `  ${STATUS_ICON[ev.statusCode] ?? "❓"} HTTP ${ev.statusCode}`
        : "";
      const budgetPart  = ev.budget
        ? ` ${C.dim}[REST ${ev.budget.rest.used}/${ev.budget.rest.limit} GQL ${ev.budget.graphql.used}/${ev.budget.graphql.limit}]${C.reset}`
        : "";
      const attemptPart = ev.attempt && ev.attempt > 1 ? ` (attempt ${ev.attempt})` : "";

      const line = `${C.dim}${elapsed}${C.reset} ${color}${prefix}${C.reset}${ev.message}${statusPart}${attemptPart}${budgetPart}`;
      process.stdout.write(line + "\n");
      txtLines.push(`${elapsed} ${prefix}${ev.message}${statusPart}${attemptPart}`);

      // Record event
      events.push({
        t: ev.elapsedMs,
        kind: ev.kind,
        phase: ev.phase,
        message: ev.message,
        bucket: ev.bucket,
        label: ev.label,
        statusCode: ev.statusCode,
        attempt: ev.attempt,
        retryAfterMs: ev.retryAfterMs,
        budgetRest: ev.budget?.rest.used,
        budgetGql: ev.budget?.graphql.used,
      });

      // Track stats
      const ep = (ev.label ?? ev.phase ?? "unknown") as string;
      if (!epStats[ep]) epStats[ep] = { calls: 0, statuses: [], errors: [] };

      if (kind === "request-start") {
        reqCount++;
        epStats[ep].calls++;
      }
      if (kind === "request-complete" && typeof ev.statusCode === "number") {
        epStats[ep].statuses.push(ev.statusCode);
        if (ev.statusCode >= 400 && ev.statusCode !== 404 && ev.statusCode !== 403) {
          epStats[ep].errors.push(`HTTP ${ev.statusCode}`);
        }
      }
      if (kind === "cache")   cacheCount++;
      if (kind === "retry")   retryCount++;
      if (kind === "warning") warnCount++;
    },
  });
} catch (err) {
  engineError = err instanceof Error ? err : new Error(String(err));
  process.stdout.write(`\n${C.error}💥 ENGINE CRASHED: ${engineError.message}${C.reset}\n`);
}

const totalMs = Date.now() - startMs;

// ─── Analysis of endpoint health ──────────────────────────────────────────────
const problematic = Object.entries(epStats).filter(([, s]) =>
  s.errors.length > 0 || (s.statuses.length > 0 && s.statuses.every(c => c === 202))
);
const notFound = Object.entries(epStats).filter(([, s]) => s.statuses.includes(404));
const always202 = Object.entries(epStats).filter(([, s]) =>
  s.statuses.length > 0 && s.statuses.every(c => c === 202)
);

// ─── Print summary ─────────────────────────────────────────────────────────────
const divider = `${C.bold}════════════════════════════════════════════════════════${C.reset}`;
process.stdout.write(`\n${divider}\n  📊 RESULTS\n${divider}\n`);
process.stdout.write(`  Time:          ${(totalMs / 1000).toFixed(1)}s\n`);
process.stdout.write(`  Events:        ${events.length}\n`);
process.stdout.write(`  API calls:     ${reqCount}\n`);
process.stdout.write(`  Cache hits:    ${cacheCount}\n`);
process.stdout.write(`  Retries:       ${retryCount}\n`);
process.stdout.write(`  Warnings:      ${warnCount}\n`);

if (result) {
  const m = result.meta;
  process.stdout.write(`\n  Score: ${C.bold}${result.scores.finalScore}${C.reset} (${result.interpretation.overall.grade})\n`);
  process.stdout.write(`  Rules: ${m.sampledRules.length} sampled | ${m.unavailableRules.length} unavailable | ${m.skippedRules.length} skipped\n`);

  if (m.warnings.length) {
    process.stdout.write(`\n  ${C.error}Engine Warnings (${m.warnings.length}):${C.reset}\n`);
    for (const w of m.warnings) process.stdout.write(`    - ${w}\n`);
  }
  if (m.unavailableRules.length) {
    process.stdout.write(`\n  ${C.error}Unavailable Rules (${m.unavailableRules.length}):${C.reset}\n`);
    for (const r of m.unavailableRules) process.stdout.write(`    [${r.id}] ${r.reason}\n`);
  }
}

if (always202.length) {
  process.stdout.write(`\n  ${C.error}⏳ Always-202 (GitHub stats still computing):${C.reset}\n`);
  for (const [ep] of always202) process.stdout.write(`    ${ep}\n`);
}
if (notFound.length) {
  process.stdout.write(`\n  ${C.error}❓ 404 Not Found:${C.reset}\n`);
  for (const [ep] of notFound) process.stdout.write(`    ${ep}\n`);
}
if (problematic.length > always202.length) {
  process.stdout.write(`\n  ${C.error}❌ Other Errors:${C.reset}\n`);
  for (const [ep, s] of problematic) {
    if (!always202.find(([a]) => a === ep)) {
      process.stdout.write(`    ${ep}: ${s.errors.join(", ")}\n`);
    }
  }
}
if (engineError) {
  process.stdout.write(`\n  ${C.error}💥 Engine Error: ${engineError.message}${C.reset}\n`);
}
process.stdout.write(`${divider}\n\n`);

// ─── Write log files ───────────────────────────────────────────────────────────
const jsonOutput = {
  meta: { username, mode, timestamp: new Date().toISOString(), totalMs, reqCount, cacheCount, retryCount, warnCount },
  result: result
    ? {
        score: result.scores.finalScore,
        grade: result.interpretation.overall.grade,
        engineWarnings: result.meta.warnings,
        unavailableRules: result.meta.unavailableRules,
        skippedRules: result.meta.skippedRules,
        sampledRules: result.meta.sampledRules,
      }
    : null,
  error: engineError ? { message: engineError.message, stack: engineError.stack } : null,
  endpointHealth: {
    always202: always202.map(([ep]) => ep),
    notFound: notFound.map(([ep]) => ep),
    errors: problematic.map(([ep, s]) => ({ ep, statuses: s.statuses, errors: s.errors })),
  },
  endpointStats: epStats,
  events,
};

writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), "utf8");
txtLines.push("");
txtLines.push("=== RESULTS ===");
txtLines.push(`Time: ${(totalMs / 1000).toFixed(1)}s | Calls: ${reqCount} | Retries: ${retryCount} | Cache: ${cacheCount}`);
if (result) txtLines.push(`Score: ${result.scores.finalScore} (${result.interpretation.overall.grade}) | Unavailable: ${result.meta.unavailableRules.length}`);
if (always202.length) txtLines.push(`Always-202: ${always202.map(([e]) => e).join(", ")}`);
if (notFound.length) txtLines.push(`404s: ${notFound.map(([e]) => e).join(", ")}`);
if (engineError) txtLines.push(`ENGINE ERROR: ${engineError.message}`);
writeFileSync(txtPath, txtLines.join("\n"), "utf8");

process.stdout.write(`  ✅ JSON → ${jsonPath}\n`);
process.stdout.write(`  ✅ TXT  → ${txtPath}\n\n`);
process.exit(engineError ? 1 : 0);
