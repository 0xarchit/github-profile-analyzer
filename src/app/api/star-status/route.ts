import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkStarStatus, getRepoStarCount } from "@/lib/github";
import { sendTelegramAlert } from "@/lib/telegram-alert";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoOnly = searchParams.get("repoOnly") === "true";
  const repoStars = await getRepoStarCount();
  if (repoOnly) {
    return NextResponse.json({ repoStars });
  }

  const session = await getSession();
  if (!session?.username) {
    return NextResponse.json({ hasStarred: false, repoStars });
  }

  try {
    const hasStarred = await checkStarStatus(
      session.username,
      session.accessToken,
    );
    return NextResponse.json({ hasStarred, repoStars });
  } catch (error) {
    console.error("Star status lookup failed:", error);
    void sendTelegramAlert({
      source: "STAR_STATUS_ROUTE",
      message: "Star status lookup failed",
      error,
      context: { username: session.username },
    }).catch(() => null);
    return NextResponse.json({ hasStarred: false, repoStars });
  }
}
