import { NextRequest } from "next/server";
import {
  analyzeGitHubProfile,
  UserNotFoundError,
  type AnalysisMode,
  type AnalysisProgressEvent,
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
    return new Response(
      JSON.stringify({
        error: "INVALID_ID_SPEC",
        message: "Invalid GitHub username. Use 1-39 letters, numbers, or single hyphens.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const username = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const send = (event: string, data: string) => {
        if (isClosed || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      const safeClose = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      try {
        const session = await getSession();
        const scannerToken = session?.accessToken;
        const isAuthenticated = Boolean(session?.accessToken && session.accessToken.trim());
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
          send(
            "analysis-error",
            JSON.stringify({
              error: "Star required",
              showPopup: true,
              isStarred: false,
              message: "Support the analyzer to unlock deterministic shards.",
            }),
          );
          safeClose();
          return;
        }

        // ── 2. Profile Lock & Privacy Enforcement ──────────────────────────────
        if (targetUser) {
          const publicScans = targetUser.settings?.public_scans ?? false;
          const hasPrincipal = Boolean(targetUser.settings?.primary_scan_id);

          // Private profile check
          if (!isOwnerOfTarget && !publicScans && !hasPrincipal) {
            send(
              "analysis-error",
              JSON.stringify({
                error: "ACCESS_DENIED",
                message: "This developer profile is set to private.",
              }),
            );
            safeClose();
            return;
          }

          // Force refresh permission check
          if (force && !isOwnerOfTarget) {
            send(
              "analysis-error",
              JSON.stringify({
                error: "ACCESS_DENIED",
                message: "Only the profile owner can force-refresh this profile.",
              }),
            );
            safeClose();
            return;
          }
        }

        // ── 3. Tiered Mode Enforcement (Derived before lookup & live analysis) ──
        let effectiveMode: AnalysisMode = "quick";
        if (!isAuthenticated) {
          // Guests are strictly restricted to quick mode
          effectiveMode = "quick";
        } else if (isOwnerOfTarget) {
          // Profile owner can run any mode: quick, standard, deep
          const validModes: AnalysisMode[] = ["quick", "standard", "deep"];
          effectiveMode = validModes.includes(modeParam as AnalysisMode)
            ? (modeParam as AnalysisMode)
            : "deep";
        } else {
          // Authenticated users viewing others can run quick or standard (not deep)
          if (modeParam === "deep" || modeParam === "standard") {
            effectiveMode = "standard";
          } else {
            effectiveMode = "quick";
          }
        }

        // ── 4. Locked Profile Snapshot Access ──────────────────────────────────
        if (targetUser) {
          const isLocked = targetUser.settings?.profile_locked ?? true;
          if (isLocked && !isOwnerOfTarget && !force) {
            const savedScan = await getLatestDeterministicScan(
              targetUser.id,
              username,
              effectiveMode,
            );
            if (savedScan && savedScan.data) {
              const historicalResult = {
                ...(savedScan.data as object),
                isHistorical: true,
                isLocked: true,
                snapshotId: savedScan.id,
              };
              send("complete", JSON.stringify(historicalResult));
              safeClose();
              return;
            }
            // Non-owner cannot trigger new live analysis on a locked profile with no snapshots
            send(
              "analysis-error",
              JSON.stringify({
                error: "ACCESS_DENIED",
                message: "This profile is locked and no saved snapshot is available for the requested mode.",
              }),
            );
            safeClose();
            return;
          }
        }

        // ── 5. Token Selection ─────────────────────────────────────────────────
        // Any authenticated scan uses the logged-in user's OAuth token (5,000 req/hr).
        // Guest scans use the server token pool (GITHUB_TOKENS).
        const tokenToUse = isAuthenticated && scannerToken ? scannerToken : undefined;

        // ── 6. Run Deterministic Engine ────────────────────────────────────────
        const startedAt = Date.now();
        const result = await analyzeGitHubProfile(username, {
          mode: effectiveMode,
          token: tokenToUse,
          bypassCache: force && isOwnerOfTarget,
          signal: request.signal,
          onProgress: (event: AnalysisProgressEvent) => {
            send("progress", JSON.stringify(event));
          },
        });

        const durationMs = Date.now() - startedAt;
        const totalCalls =
          (result.meta.budget.rest.used || 0) +
          (result.meta.budget.graphql.used || 0) +
          (result.meta.budget.search.used || 0);

        // ── 7. Database Persistence ────────────────────────────────────────────
        // Save scan for registered users (either owner scanning self, or target with keep_history)
        if (targetUser && (isOwnerOfTarget || targetUser.settings?.keep_history)) {
          try {
            await saveDeterministicScan(
              targetUser.id,
              username,
              effectiveMode,
              result,
              result.scores.finalScore,
              result.interpretation?.overall?.grade,
              result.interpretation?.archetypes?.[0]?.label,
              durationMs,
              totalCalls,
            );
          } catch (err) {
            console.error("[STREAM] Save scan failed:", err);
          }
        }

        send("complete", JSON.stringify(result));
        safeClose();
      } catch (error) {
        if (error instanceof UserNotFoundError) {
          send(
            "analysis-error",
            JSON.stringify({
              error: "USER_NOT_FOUND",
              message: `GitHub user @${username} was not found.`,
            }),
          );
          safeClose();
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("GITHUB_TOKEN") || message.includes("GITHUB_TOKENS")) {
          send(
            "analysis-error",
            JSON.stringify({
              error: "TOKEN_UNAVAILABLE",
              message: "GitHub API tokens are currently saturated. Please try again shortly.",
            }),
          );
        } else if (message.includes("not found")) {
          send(
            "analysis-error",
            JSON.stringify({
              error: "USER_NOT_FOUND",
              message: `GitHub user @${username} was not found.`,
            }),
          );
        } else {
          console.error("[STREAM ERROR]", error);
          send(
            "analysis-error",
            JSON.stringify({
              error: "ANALYSIS_FAILED",
              message: "An error occurred while analyzing this profile. Please try again.",
            }),
          );
        }
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
