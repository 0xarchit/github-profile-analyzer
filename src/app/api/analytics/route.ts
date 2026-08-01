import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/db";
import { getCachedData, setCachedData } from "@/lib/redis";

export const runtime = "edge";

const ANALYTICS_CACHE_KEY = "analytics:summary";
// 15 minutes — also invalidated on every new successful analysis
const ANALYTICS_CACHE_TTL = 900;

export async function GET() {
  try {
    // 1. Try Redis cache first
    const cached = await getCachedData<object>(ANALYTICS_CACHE_KEY);
    if (cached) {
      console.log("[ANALYTICS_API] Cache hit");
      return NextResponse.json(cached);
    }

    // 2. Compute from DB
    console.log("[ANALYTICS_API] Cache miss — querying DB");
    const summary = await getAnalyticsSummary();

    // 3. Write to cache and return
    await setCachedData(ANALYTICS_CACHE_KEY, summary, ANALYTICS_CACHE_TTL);

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[ANALYTICS_API] Failed to fetch analytics", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "ANALYTICS_UNAVAILABLE", message: "Could not retrieve analytics data." },
      { status: 500 },
    );
  }
}
