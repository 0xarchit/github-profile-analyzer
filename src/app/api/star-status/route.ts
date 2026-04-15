import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkStarStatus } from "@/lib/github";

export const runtime = "edge";

export async function GET() {
  const session = await getSession();
  if (!session?.username) {
    return NextResponse.json({ hasStarred: false });
  }

  try {
    const hasStarred = await checkStarStatus(
      session.username,
      session.accessToken,
    );
    return NextResponse.json({ hasStarred });
  } catch (error) {
    console.error("Star status lookup failed:", error);
    return NextResponse.json({ hasStarred: false });
  }
}
