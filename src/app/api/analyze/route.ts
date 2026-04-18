import { NextResponse, NextRequest } from "next/server";
import { UsernameSchema } from "@/lib/validation";
import type { ValidatedAnalysisResult } from "@/lib/validation";
import { getProfileSummary, checkStarStatus } from "@/lib/github";
import { getAIAnalysis } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { getCachedData, setCachedData } from "@/lib/redis";
import { TelegramAlertCollector } from "@/lib/telegram-alert";
import {
  getUserByUsername,
  saveScan,
  getScanById,
  getUserByGithubId,
  getLatestSelfScan,
} from "@/lib/db";

export const runtime = "edge";

type AnalyzedPayload = ValidatedAnalysisResult & {
  isStarred: boolean;
  cachedAt: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const usernameParam = searchParams.get("username");
  console.log("[ANALYZE] Request started", {
    usernameParam,
    force: searchParams.get("force"),
  });

  const parsed = UsernameSchema.safeParse(usernameParam);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_ID_SPEC",
        message: "Target identifier does not meet standard parameters.",
      },
      { status: 400 },
    );
  }

  const username = parsed.data;
  const force = searchParams.get("force") === "true";
  const nosave = searchParams.get("nosave") === "true";
  const alertCollector = new TelegramAlertCollector();

  const handleFailure = async (err: unknown) => {
    const error =
      err instanceof Error
        ? err
        : new Error("An unknown analysis failure occurred");
    const msg = error.message;
    const alreadyAlerted = Boolean(
      (error as { __alertSent?: boolean }).__alertSent,
    );
    const isExpectedClientError =
      msg === "USER_NOT_FOUND" || msg === "INVALID_USERNAME";
    const isAbortError =
      error.name === "AbortError" ||
      msg.includes("AbortError") ||
      msg.includes("This operation was aborted");
    const stack = error instanceof Error ? error.stack : "N/A";

    console.error("[ANALYZE] Scan Matrix Failure", {
      message: msg,
      isAbortError,
      name: error.name,
      stack,
      type: error.constructor.name,
    });

    if (!isExpectedClientError) {
      if (!alreadyAlerted) {
        alertCollector.add({
          source: "ANALYZE_ROUTE",
          message: "Scan matrix failure",
          error,
          context: {
            username,
            force,
            nosave,
            isAbortError,
          },
        });
      }

      try {
        await alertCollector.flush({
          username,
          force,
          nosave,
          isAbortError,
        });
      } catch (flushError) {
        console.error("[ANALYZE] Alert flush failed", flushError);
      }
    }

    if (msg === "USER_NOT_FOUND" || msg === "INVALID_USERNAME") {
      return NextResponse.json(
        {
          error: msg,
          message:
            "The target user identifier could not be resolved by the GitHub neural network.",
        },
        { status: msg === "USER_NOT_FOUND" ? 404 : 400 },
      );
    }

    if (isAbortError) {
      console.error("[ANALYZE] Request timeout/abort detected", {
        timeout: "15s for AI or 10s for GitHub API",
      });
      return NextResponse.json(
        {
          error: "REQUEST_TIMEOUT",
          message:
            "The analysis operation timed out. GitHub API or AI service may be slow.",
        },
        { status: 504 },
      );
    }

    if (
      msg.includes("rate limit") ||
      msg.includes("403") ||
      msg.includes("429")
    ) {
      return NextResponse.json(
        {
          error: "REMOTE_SATURATION",
          message:
            "GitHub API nodes are currently saturated. This protocol will resume shortly.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: "CRITICAL_FAILURE",
        message: "The diagnostic matrix encountered an unhandled exception.",
      },
      { status: 500 },
    );
  };

  try {
    console.log("[ANALYZE] Validated username", { username, force, nosave });
    const session = await getSession();
    console.log("[ANALYZE] Session fetched", {
      hasSession: !!session,
      hasToken: !!session?.accessToken,
    });
    const scannerToken = session?.accessToken;
    console.log("[ANALYZE] Fetching viewer user from DB", {
      githubId: session?.githubId,
    });
    const viewerUser = session
      ? await getUserByGithubId(session.githubId)
      : null;
    console.log("[ANALYZE] Viewer user resolved", {
      userId: viewerUser?.id,
      username: viewerUser?.username,
    });

    console.log("[ANALYZE] Fetching target user from DB", { username });
    const targetUser = await getUserByUsername(username);
    console.log("[ANALYZE] Target user resolved", {
      userId: targetUser?.id,
      username: targetUser?.username,
    });
    const isOwnerOfTarget = Boolean(
      viewerUser && targetUser && viewerUser.id === targetUser.id,
    );
    console.log("[ANALYZE] Ownership check", { isOwnerOfTarget });

    if (force && targetUser) {
      if (!isOwnerOfTarget) {
        console.log("[ANALYZE] Force refresh denied - not owner");
        return NextResponse.json(
          {
            error: "ACCESS_DENIED",
            message:
              "You are not allowed to override or force-update another registered user's profile.",
          },
          { status: 403 },
        );
      }
    }

    console.log("[ANALYZE] Checking star status", {
      isOwnerOfTarget,
      username,
    });
    let hasTargetStarred = false;
    if (!isOwnerOfTarget) {
      hasTargetStarred = await checkStarStatus(username, scannerToken);
    } else {
      hasTargetStarred = true;
    }
    console.log("[ANALYZE] Star status resolved", { hasTargetStarred });

    if (!hasTargetStarred) {
      console.log("[ANALYZE] Star required - denying access");
      return NextResponse.json(
        {
          error: "Star required",
          showPopup: true,
          isStarred: false,
          message: "Support the analyzer to unlock high-fidelity shards.",
        },
        { status: 403 },
      );
    }

    if (!force && targetUser) {
      if (isOwnerOfTarget && targetUser.settings?.primary_scan_id) {
        console.log("[ANALYZE] Attempting to load owner principal scan", {
          scanId: targetUser.settings.primary_scan_id,
        });
        const principalScan = await getScanById(
          targetUser.settings.primary_scan_id,
        );
        if (principalScan) {
          console.log("[ANALYZE] Returning owner principal scan");
          return NextResponse.json({
            ...principalScan.data,
            isLocked: false,
            snapshotId: principalScan.id,
            isHistorical: true,
          });
        }
      }

      if (
        targetUser.settings?.profile_locked &&
        targetUser.settings.primary_scan_id
      ) {
        console.log("[ANALYZE] Attempting to load locked scan", {
          scanId: targetUser.settings.primary_scan_id,
        });
        const lockedScan = await getScanById(
          targetUser.settings.primary_scan_id,
        );
        if (lockedScan) {
          console.log("[ANALYZE] Returning locked scan");
          return NextResponse.json({
            ...lockedScan.data,
            isLocked: true,
            snapshotId: lockedScan.id,
          });
        }
      }

      if (isOwnerOfTarget || targetUser.settings?.public_scans) {
        console.log("[ANALYZE] Attempting to load latest self scan", {
          userId: targetUser.id,
          username,
        });
        const latestScan = await getLatestSelfScan(targetUser.id, username);
        if (latestScan) {
          console.log("[ANALYZE] Returning latest self scan");
          return NextResponse.json({
            ...latestScan.data,
            isLocked: false,
            snapshotId: latestScan.id,
            isHistorical: true,
          });
        }
      }
    }

    const cacheKey = `analysed:${username.toLowerCase()}`;

    try {
      if (!force) {
        console.log("[ANALYZE] Checking cache", { cacheKey });
        const cachedResult = await getCachedData(cacheKey);
        if (cachedResult) {
          console.log("[ANALYZE] Cache hit - returning cached result");
          return NextResponse.json(cachedResult);
        }
        console.log("[ANALYZE] Cache miss - proceeding with fresh analysis");
      } else {
        console.log("[ANALYZE] Force refresh requested - skipping cache");
      }

      const populateAnalysis = async (): Promise<AnalyzedPayload> => {
        console.log("[ANALYZE] Fetching profile summary", { username });
        const profile = await getProfileSummary(username, scannerToken);
        console.log("[ANALYZE] Profile summary completed", {
          repos: Object.keys(profile.original_repos).length,
        });

        console.log("[ANALYZE] Starting AI analysis");
        const analysis = await getAIAnalysis(
          profile,
          scannerToken,
          alertCollector,
        );
        console.log("[ANALYZE] AI analysis completed", {
          score: analysis.score,
        });

        const finalData: AnalyzedPayload = {
          ...profile,
          ...analysis,
          isStarred: true,
          cachedAt: new Date().toISOString(),
        };

        console.log("[ANALYZE] Setting cache", { cacheKey });
        await setCachedData(cacheKey, finalData);
        console.log("[ANALYZE] Cache set successfully");

        return finalData;
      };

      if (!force) {
        const finalData = await populateAnalysis();

        if (
          viewerUser &&
          !nosave &&
          isOwnerOfTarget &&
          viewerUser.settings.keep_history
        ) {
          console.log("[ANALYZE] Saving scan to database", {
            userId: viewerUser.id,
            username,
          });
          await saveScan(viewerUser.id, username, finalData);
          console.log("[ANALYZE] Scan saved to database");
        }

        console.log("[ANALYZE] Analysis complete - returning result");
        return NextResponse.json(finalData);
      }

      const finalData = await populateAnalysis();

      if (
        viewerUser &&
        !nosave &&
        isOwnerOfTarget &&
        viewerUser.settings.keep_history
      ) {
        console.log("[ANALYZE] Saving scan to database", {
          userId: viewerUser.id,
          username,
        });
        await saveScan(viewerUser.id, username, finalData);
        console.log("[ANALYZE] Scan saved to database");
      }

      console.log("[ANALYZE] Analysis complete - returning result");
      return NextResponse.json(finalData);
    } catch (err: unknown) {
      return handleFailure(err);
    }
  } catch (err: unknown) {
    return handleFailure(err);
  }
}
