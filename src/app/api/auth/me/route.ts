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
  const includeRateLimit = searchParams.get("rate_limit") === "true";

  const session = await getSession();
  if (session) {
    let rateLimit = null;
    if (includeRateLimit && session.accessToken) {
      try {
        const rlRes = await fetch("https://api.github.com/rate_limit", {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "User-Agent": "GitScore",
          },
          signal: AbortSignal.timeout(4_000),
        });
        if (rlRes.ok) {
          const rlData = await rlRes.json();
          rateLimit = {
            core: {
              limit: rlData.resources?.core?.limit ?? 5000,
              remaining: rlData.resources?.core?.remaining ?? 5000,
              reset: rlData.resources?.core?.reset ?? Math.floor(Date.now() / 1000) + 3600,
            },
            graphql: {
              limit: rlData.resources?.graphql?.limit ?? 5000,
              remaining: rlData.resources?.graphql?.remaining ?? 5000,
              reset: rlData.resources?.graphql?.reset ?? Math.floor(Date.now() / 1000) + 3600,
            },
          };
        }
      } catch {
        // Fallback gracefully on timeout
      }
    }

    const { accessToken, ...safeSession } = session;
    void accessToken;
    return NextResponse.json({ ...safeSession, rateLimit }, noStore);
  }

  if (includeGuest) {
    const { getGuestSession } = await import("@/lib/auth");
    const guestUsername = await getGuestSession();
    if (guestUsername) {
      return NextResponse.json(
        { username: guestUsername, isGuest: true, rateLimit: null },
        noStore,
      );
    }
  }

  return NextResponse.json(null, noStore);
}
