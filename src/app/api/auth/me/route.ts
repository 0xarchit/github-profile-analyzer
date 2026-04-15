import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "edge";

const noStore = {
  headers: {
    "Cache-Control": "private, no-store",
  },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeGuest = searchParams.get("guest") === "true";

  const session = await getSession();
  if (session) {
    const { accessToken, ...safeSession } = session;
    void accessToken;
    return NextResponse.json(safeSession, noStore);
  }

  if (includeGuest) {
    const { getGuestSession } = await import("@/lib/auth");
    const guestUsername = await getGuestSession();
    if (guestUsername) {
      return NextResponse.json(
        { username: guestUsername, isGuest: true },
        noStore,
      );
    }
  }

  return NextResponse.json(null, noStore);
}
