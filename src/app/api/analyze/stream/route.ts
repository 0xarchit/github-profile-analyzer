import { NextRequest } from "next/server";
import { UsernameSchema } from "@/lib/validation";
import { getProfileSummary, checkStarStatus } from "@/lib/github";
import { getAIAnalysis } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { getCachedData, setCachedData, deleteCachedData } from "@/lib/redis";
import { getUserByUsername, getUserByGithubId, insertAnalytics } from "@/lib/db";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const usernameParam = searchParams.get("username");
  const force = searchParams.get("force") === "true";

  const parsed = UsernameSchema.safeParse(usernameParam);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "INVALID_ID_SPEC",
        message: "Target identifier invalid",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const username = parsed.data;
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(payload));
  };

  (async () => {
    try {
      await sendEvent("status", {
        step: "SESSION_CHECK",
        message: "Authenticating protocol session & user permissions...",
      });

      const session = await getSession();
      const scannerToken = session?.accessToken;
      const viewerUser = session
        ? await getUserByGithubId(session.githubId)
        : null;
      const targetUser = await getUserByUsername(username);
      const isOwnerOfTarget = Boolean(
        viewerUser && targetUser && viewerUser.id === targetUser.id,
      );

      await sendEvent("status", {
        step: "STAR_GATE",
        message: "Verifying GitHub repository star status...",
      });

      let hasTargetStarred = false;
      if (isOwnerOfTarget) {
        hasTargetStarred = true;
      } else if (session?.username) {
        hasTargetStarred =
          (await checkStarStatus(session.username, scannerToken)) ||
          (await checkStarStatus(username));
      } else {
        hasTargetStarred = await checkStarStatus(username);
      }

      if (!hasTargetStarred) {
        await sendEvent("error", {
          error: "Star required",
          message: "Support the analyzer to unlock high-fidelity shards.",
        });
        await writer.close();
        return;
      }

      const cacheKey = `analysed:${username.toLowerCase()}`;

      if (!force) {
        await sendEvent("status", {
          step: "CACHE_CHECK",
          message: "Querying Redis edge cache for existing analysis...",
        });
        const cachedResult = await getCachedData(cacheKey);
        if (cachedResult) {
          await sendEvent("status", {
            step: "CACHE_HIT",
            message: "Cached protocol shard resolved! Rendering dashboard...",
          });
          await sendEvent("complete", cachedResult);
          await writer.close();
          return;
        }
      }

      await sendEvent("status", {
        step: "GITHUB_FETCH",
        message: `Extracting ${username}'s repositories, contribution graph & career metrics...`,
      });
      const profile = await getProfileSummary(username, scannerToken);

      await sendEvent("status", {
        step: "NEURAL_ANALYSIS",
        message: "Invoking Modal LLM neural scoring network (Modal.com)...",
      });
      const { analysis, usage } = await getAIAnalysis(profile);

      const finalData = {
        ...profile,
        ...analysis,
        isStarred: true,
        cachedAt: new Date().toISOString(),
      };

      await sendEvent("status", {
        step: "CACHE_WRITE",
        message: "Persisting intelligence shard to Redis edge cache...",
      });
      await setCachedData(cacheKey, finalData);

      // Await analytics insert & cache invalidation inline before completing stream
      try {
        await insertAnalytics({
          username,
          model: usage.model,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          total_tokens: usage.total_tokens,
          duration_ms: usage.duration_ms,
          success: true,
        });
        await deleteCachedData("analytics:summary").catch(() => null);
      } catch (analyticsErr) {
        console.error("[SSE_STREAM] Analytics insertion failed:", analyticsErr);
      }

      await sendEvent("status", {
        step: "COMPLETE",
        message: "Protocol matrix fully compiled! Launching interface...",
      });
      await sendEvent("complete", finalData);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[SSE_STREAM_ERROR]", error);
      await sendEvent("error", {
        error: error.message.includes("CORRUPT_INTELLIGENCE")
          ? "CORRUPT_INTELLIGENCE"
          : "CRITICAL_FAILURE",
        message: error.message,
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
