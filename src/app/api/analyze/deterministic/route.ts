import { NextRequest, NextResponse } from "next/server";
import {
  analyzeGitHubProfile,
  type AnalysisMode,
  type EngineResult,
} from "@/lib/deterministic";
import { checkStarStatus } from "@/lib/github";
import { getSession } from "@/lib/auth";
import {
  getUserByUsername,
  getUserByGithubId,
  getLatestDeterministicScan,
  saveDeterministicScan,
} from "@/lib/db";
import { UsernameSchema } from "@/lib/validation";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const usernameParam = searchParams.get("username");
  const modeParam = searchParams.get("mode") as AnalysisMode | null;
  const force = searchParams.get("force") === "true";

  const parsed = UsernameSchema.safeParse(usernameParam);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_ID_SPEC",
        message: "Invalid GitHub username. Use 1-39 letters, numbers, or single hyphens.",
      },
      { status: 400 },
    );
  }

  const username = parsed.data;

  try {
    const session = await getSession();
    const scannerToken = session?.accessToken;
    const isAuthenticated = Boolean(session?.username);
    const viewerUser = session
      ? await getUserByGithubId(session.githubId)
      : null;
    const targetUser = await getUserByUsername(username);

    const isOwnerOfTarget = Boolean(
      viewerUser && targetUser && viewerUser.id === targetUser.id,
    ) || (session?.username?.toLowerCase() === username.toLowerCase());

    // ── 1. Star-Gate Verification ──────────────────────────────────────────
    let hasStarred = false;
    if (isOwnerOfTarget) {
      hasStarred = true;
    } else if (session?.username) {
      hasStarred =
        (await checkStarStatus(session.username, scannerToken)) ||
        (await checkStarStatus(username));
    } else {
      hasStarred = await checkStarStatus(username);
    }

    if (!hasStarred) {
      return NextResponse.json(
        {
          error: "Star required",
          showPopup: true,
          isStarred: false,
          message: "Support the analyzer to unlock deterministic shards.",
        },
        { status: 403 },
      );
    }

    // ── 2. Profile Lock & Privacy Enforcement ──────────────────────────────
    if (targetUser) {
      const isLocked = targetUser.settings?.profile_locked ?? true;
      const publicScans = targetUser.settings?.public_scans ?? false;
      const hasPrincipal = Boolean(targetUser.settings?.primary_scan_id);

      if (!isOwnerOfTarget && !publicScans && !hasPrincipal) {
        return NextResponse.json(
          {
            error: "ACCESS_DENIED",
            message: "This developer profile is set to private.",
          },
          { status: 403 },
        );
      }

      if (force && !isOwnerOfTarget) {
        return NextResponse.json(
          {
            error: "ACCESS_DENIED",
            message: "Only the profile owner can force-refresh this profile.",
          },
          { status: 403 },
        );
      }

      if (isLocked && !isOwnerOfTarget && !force) {
        const savedScan = await getLatestDeterministicScan(
          targetUser.id,
          username,
          modeParam || undefined,
        );
        if (savedScan && savedScan.data) {
          return NextResponse.json({
            ...(savedScan.data as object),
            isHistorical: true,
            isLocked: true,
            snapshotId: savedScan.id,
          });
        }
      }
    }

    // ── 3. Tiered Mode Enforcement ─────────────────────────────────────────
    let effectiveMode: AnalysisMode = "quick";
    if (!isAuthenticated) {
      effectiveMode = "quick";
    } else if (isOwnerOfTarget) {
      const validModes: AnalysisMode[] = ["quick", "standard", "deep"];
      effectiveMode = validModes.includes(modeParam as AnalysisMode)
        ? (modeParam as AnalysisMode)
        : "deep";
    } else {
      effectiveMode = modeParam === "deep" || modeParam === "standard" ? "standard" : "quick";
    }

    // ── 4. Token Selection ─────────────────────────────────────────────────
    // Any authenticated scan uses the logged-in user's OAuth token (5,000 req/hr).
    // Guest scans use the server token pool (GITHUB_TOKENS).
    const tokenToUse = isAuthenticated && scannerToken ? scannerToken : undefined;

    // ── 5. Run Deterministic Engine ────────────────────────────────────────
    const startedAt = Date.now();
    const result: EngineResult = await analyzeGitHubProfile(username, {
      mode: effectiveMode,
      token: tokenToUse,
      bypassCache: force && isOwnerOfTarget,
    });

    const durationMs = Date.now() - startedAt;
    const totalCalls =
      (result.meta.budget.rest.used || 0) +
      (result.meta.budget.graphql.used || 0) +
      (result.meta.budget.search.used || 0);

    // ── 6. Database Persistence ────────────────────────────────────────────
    if (targetUser && (isOwnerOfTarget || targetUser.settings?.keep_history)) {
      void saveDeterministicScan(
        targetUser.id,
        username,
        effectiveMode,
        result,
        result.scores.finalScore,
        result.interpretation?.overall?.grade,
        result.interpretation?.archetypes?.[0]?.label,
        durationMs,
        totalCalls,
      ).catch((err) => console.error("[ROUTE] Save scan failed:", err));
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("GITHUB_TOKEN") || message.includes("GITHUB_TOKENS")) {
      return NextResponse.json(
        {
          error: "Deterministic engine tokens unavailable.",
          message: "GitHub API tokens are currently saturated. Please try again shortly.",
        },
        { status: 503 },
      );
    }
    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: `GitHub user @${username} was not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
