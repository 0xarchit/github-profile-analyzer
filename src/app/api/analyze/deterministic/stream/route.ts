import { NextRequest } from "next/server";
import {
  analyzeGitHubProfile,
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
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

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
          send(
            "error",
            JSON.stringify({
              error: "Star required",
              showPopup: true,
              isStarred: false,
              message: "Support the analyzer to unlock deterministic shards.",
            }),
          );
          controller.close();
          return;
        }

        // ── 2. Profile Lock & Privacy Enforcement ──────────────────────────────
        if (targetUser) {
          const isLocked = targetUser.settings?.profile_locked ?? true;
          const publicScans = targetUser.settings?.public_scans ?? false;
          const hasPrincipal = Boolean(targetUser.settings?.primary_scan_id);

          // Private profile check
          if (!isOwnerOfTarget && !publicScans && !hasPrincipal) {
            send(
              "error",
              JSON.stringify({
                error: "ACCESS_DENIED",
                message: "This developer profile is set to private.",
              }),
            );
            controller.close();
            return;
          }

          // Force refresh permission check
          if (force && !isOwnerOfTarget) {
            send(
              "error",
              JSON.stringify({
                error: "ACCESS_DENIED",
                message: "Only the profile owner can force-refresh this profile.",
              }),
            );
            controller.close();
            return;
          }

          // If profile is locked and non-owner is viewing, check for saved snapshot
          if (isLocked && !isOwnerOfTarget && !force) {
            const savedScan = await getLatestDeterministicScan(
              targetUser.id,
              username,
              modeParam || undefined,
            );
            if (savedScan && savedScan.data) {
              const historicalResult = {
                ...(savedScan.data as object),
                isHistorical: true,
                isLocked: true,
                snapshotId: savedScan.id,
              };
              send("complete", JSON.stringify(historicalResult));
              controller.close();
              return;
            }
          }
        }

        // ── 3. Tiered Mode Enforcement ─────────────────────────────────────────
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

        // ── 4. Token Selection ─────────────────────────────────────────────────
        // Any authenticated scan uses the logged-in user's OAuth token (5,000 req/hr).
        // Guest scans use the server token pool (GITHUB_TOKENS).
        const tokenToUse = isAuthenticated && scannerToken ? scannerToken : undefined;

        // ── 5. Run Deterministic Engine ────────────────────────────────────────
        const startedAt = Date.now();
        const result = await analyzeGitHubProfile(username, {
          mode: effectiveMode,
          token: tokenToUse,
          bypassCache: force && isOwnerOfTarget,
          onProgress: (event: AnalysisProgressEvent) => {
            send("progress", JSON.stringify(event));
          },
        });

        const durationMs = Date.now() - startedAt;
        const totalCalls =
          (result.meta.budget.rest.used || 0) +
          (result.meta.budget.graphql.used || 0) +
          (result.meta.budget.search.used || 0);

        // ── 6. Database Persistence ────────────────────────────────────────────
        // Save scan for registered users (either owner scanning self, or target with keep_history)
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
          ).catch((err) => console.error("[STREAM] Save scan failed:", err));
        }

        send("complete", JSON.stringify(result));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("GITHUB_TOKEN") || message.includes("GITHUB_TOKENS")) {
          send(
            "error",
            JSON.stringify({
              error: "Deterministic engine tokens unavailable.",
              message: "GitHub API tokens are currently saturated. Please try again shortly.",
            }),
          );
        } else if (message.includes("not found")) {
          send(
            "error",
            JSON.stringify({
              error: "USER_NOT_FOUND",
              message: `GitHub user @${username} was not found.`,
            }),
          );
        } else {
          send("error", JSON.stringify({ error: message, message }));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
