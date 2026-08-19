import { NextRequest, NextResponse } from "next/server";
import { analyzeGitHubProfile, type AnalysisMode, type EngineResult } from "@/lib/deterministic";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get("username");
  const modeParam = searchParams.get("mode");

  if (!username || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username.trim())) {
    return NextResponse.json(
      { error: "Invalid GitHub username. Use 1-39 letters, numbers, or single hyphens." },
      { status: 400 },
    );
  }

  const validModes: AnalysisMode[] = ["quick", "standard", "deep"];
  const mode: AnalysisMode = validModes.includes(modeParam as AnalysisMode)
    ? (modeParam as AnalysisMode)
    : "deep";

  try {
    const result: EngineResult = await analyzeGitHubProfile(username.trim(), { mode });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("GITHUB_TOKEN")) {
      return NextResponse.json(
        { error: "Deterministic mode requires GITHUB_TOKEN environment variable." },
        { status: 503 },
      );
    }
    if (message.includes("Invalid GitHub username")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: `GitHub user @${username} was not found.` }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
