import { NextRequest } from "next/server";
import { analyzeGitHubProfile, type AnalysisMode, type AnalysisProgressEvent } from "@/lib/deterministic";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get("username");
  const modeParam = searchParams.get("mode");

  if (!username || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username.trim())) {
    return new Response(
      JSON.stringify({ error: "Invalid GitHub username." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const validModes: AnalysisMode[] = ["quick", "standard", "deep"];
  const mode: AnalysisMode = validModes.includes(modeParam as AnalysisMode)
    ? (modeParam as AnalysisMode)
    : "deep";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      try {
        const result = await analyzeGitHubProfile(username.trim(), {
          mode,
          onProgress: (event: AnalysisProgressEvent) => {
            send("progress", JSON.stringify(event));
          },
        });

        send("complete", JSON.stringify(result));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("GITHUB_TOKEN")) {
          send("error", JSON.stringify({ error: "Deterministic mode requires GITHUB_TOKEN environment variable." }));
        } else if (message.includes("Invalid GitHub username")) {
          send("error", JSON.stringify({ error: message }));
        } else if (message.includes("not found")) {
          send("error", JSON.stringify({ error: `GitHub user @${username} was not found.` }));
        } else {
          send("error", JSON.stringify({ error: message }));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
