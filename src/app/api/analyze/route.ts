import { NextResponse, NextRequest } from "next/server";
import { UsernameSchema } from "@/lib/validation";
import { getProfileSummary, checkStarStatus } from "@/lib/github";
import { getAIAnalysis } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { getCachedData, setCachedData } from "@/lib/redis";
import {
  getUserByUsername,
  saveScan,
  getScanById,
  getUserByGithubId,
  getLatestSelfScan,
} from "@/lib/db";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const usernameParam = searchParams.get("username");

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

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 },
    );
  }

  const session = await getSession();
  const scannerToken = session?.accessToken;
  const viewerUser = session ? await getUserByGithubId(session.githubId) : null;

  const targetUser = await getUserByUsername(username);
  const isOwnerOfTarget = Boolean(
    viewerUser && targetUser && viewerUser.id === targetUser.id,
  );

  if (force && !nosave && targetUser) {
    if (!isOwnerOfTarget) {
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

  let hasTargetStarred = false;
  if (!isOwnerOfTarget) {
    hasTargetStarred = await checkStarStatus(username, scannerToken);
  } else {
    hasTargetStarred = true;
  }

  if (!hasTargetStarred) {
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
      const principalScan = await getScanById(
        targetUser.settings.primary_scan_id,
      );
      if (principalScan) {
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
      const lockedScan = await getScanById(targetUser.settings.primary_scan_id);
      if (lockedScan) {
        return NextResponse.json({
          ...lockedScan.data,
          isLocked: true,
          snapshotId: lockedScan.id,
        });
      }
    }

    if (isOwnerOfTarget || targetUser.settings?.public_scans) {
      const latestScan = await getLatestSelfScan(targetUser.id, username);
      if (latestScan) {
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
      const cachedResult = await getCachedData(cacheKey);
      if (cachedResult) return NextResponse.json(cachedResult);
    }

    const profile = await getProfileSummary(username, scannerToken);

    const analysis = await getAIAnalysis(profile, scannerToken);

    const finalData = {
      ...profile,
      ...analysis,
      isStarred: true,
      cachedAt: new Date().toISOString(),
    };

    if (viewerUser && !nosave && isOwnerOfTarget) {
      if (viewerUser.settings.keep_history) {
        await saveScan(viewerUser.id, username, finalData);
      }
    }

    await setCachedData(cacheKey, finalData);

    return NextResponse.json(finalData);
  } catch (err: unknown) {
    const error =
      err instanceof Error
        ? err
        : new Error("An unknown analysis failure occurred");
    const msg = error.message;

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

    console.error("Scan Matrix Failure:", msg);

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
  }
}
