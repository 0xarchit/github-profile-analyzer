import { AnalysisResultSchema, ValidatedAnalysisResult } from "./validation";
import { ProfileSummary } from "@/types";
import {
  sendTelegramAlert,
  TelegramAlertCollector,
} from "./telegram-alert";

// Modal.com LLM endpoint (OpenAI-compatible). GITHUB_ENDPOINT should end at /v1.
const LLM_ENDPOINT =
  (process.env.GITHUB_ENDPOINT || "").replace(/\/$/, "") +
  "/chat/completions";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
// Model name is fixed server-side on Modal; keep as env var for observability.
const LLM_MODEL = process.env.GITHUB_MODEL || "gpt-4o-mini";

const AI_TIMEOUT_MS = 45000;
const AI_RETRY_ATTEMPTS = 3;
const AI_RETRY_DELAY_MS = 2000;

export type AIAnalysis = ValidatedAnalysisResult;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  duration_ms: number;
  model: string;
}

type AlertedError = Error & { __alertSent?: boolean };

function markAlertSent(error: Error): Error {
  (error as AlertedError).__alertSent = true;
  return error;
}

/**
 * Minifies a ProfileSummary into a compact payload optimised for token savings.
 * - Top repos capped at 15 (was 20)
 * - Other repos capped at 50 (was 80)
 * - Bio truncated to 80 chars
 * - Null descriptions stripped from top repos
 */
function minifyProfile(profile: ProfileSummary) {
  const allRepos = [
    ...Object.entries(profile.original_repos).map(([, r]) => ({ ...r })),
  ].sort((a, b) => b.stars + b.forks - (a.stars + a.forks));

  const tr = allRepos.slice(0, 15).map((r) => {
    const entry: Record<string, unknown> = {
      n: r.n,
      s: r.stars,
      f: r.forks,
      l: r.primary_lang,
    };
    // Only include description when it is non-empty
    if (r.description) entry.d = r.description.slice(0, 80);
    return entry;
  });

  const or = allRepos
    .slice(15, 65)
    .map((r) => [r.n, r.stars, r.primary_lang]);

  return {
    u: {
      un: profile.username,
      nm: profile.name,
      bio: profile.bio?.slice(0, 80),
      fol: profile.followers,
      sc: profile.total_stars,
      rc: profile.public_repo_count,
    },
    tr,
    or,
    st: {
      tc: profile.career_stats?.total_contributions,
      cc: profile.career_stats?.total_commits,
      pr: profile.career_stats?.total_prs,
      ir: profile.career_stats?.total_issues,
      cs: profile.career_stats?.daily_streak,
      ls: profile.career_stats?.daily_best,
      l: profile.career_stats?.top_languages.map((l) => l.name).slice(0, 5),
    },
  };
}

/**
 * Compressed system prompt — all extraneous whitespace removed to minimise
 * prompt tokens. Keys use the same single-letter abbreviations as minifyProfile.
 */
const SYSTEM_PROMPT =
  `You are a professional GitHub Auditor. Tone: witty, analytical, slightly sarcastic ("roast" style). No emojis.` +
  ` Keys: u=user info, tr=top 15 repos {n,s,f,l,d?}, or=other repos [name,stars,lang], st=stats (tc=contributions,cc=commits,pr=PRs,ir=issues,cs=streak,ls=best,l=langs).` +
  ` Return JSON only:` +
  ` {"score":<0-100>,"segments":{"roast":"<2-3 sentence brutal funny roast>","technical_analysis":"<deep dive code quality stack repos>","strategic_advice":"<long-term career advice>"}` +
  `,"improvement_areas":["<area>"],"diagnostics":["<observation>"]` +
  `,"project_ideas":{"1":{"title":"...","description":"...","tech stack":["..."]},"2":{"title":"...","description":"...","tech stack":["..."]},"3":{"title":"...","description":"...","tech stack":["..."]}}` +
  `,"tag":{"tag_name":"...","description":"..."},"developer_type":"<Professional Title>"}` +
  ` IMPORTANT: Return PURE JSON ONLY starting directly with '{'. Do not include thinking, reasoning, or preamble text. developer_type must be a direct child of root. Generate exactly 3 unique project_ideas. Keep text concise.`;

async function callAIWithTimeout(
  systemPrompt: string,
  minified: unknown,
  attempt: number = 1,
): Promise<Response> {
  console.log("[AI_ANALYSIS] AI API call attempt", {
    attempt,
    endpoint: LLM_ENDPOINT,
    model: LLM_MODEL,
    timeoutMs: AI_TIMEOUT_MS,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.error("[AI_ANALYSIS] Timeout triggered - aborting request", {
      attempt,
      timeoutMs: AI_TIMEOUT_MS,
    });
    controller.abort();
  }, AI_TIMEOUT_MS);

  try {
    const schemaPayload = {
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(minified) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "github_analysis_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "integer" },
              segments: {
                type: "object",
                properties: {
                  roast: { type: "string" },
                  technical_analysis: { type: "string" },
                  strategic_advice: { type: "string" },
                },
                required: ["roast", "technical_analysis", "strategic_advice"],
                additionalProperties: false,
              },
              improvement_areas: {
                type: "array",
                items: { type: "string" },
              },
              diagnostics: {
                type: "array",
                items: { type: "string" },
              },
              project_ideas: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    "tech stack": {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["title", "description", "tech stack"],
                  additionalProperties: false,
                },
              },
              tag: {
                type: "object",
                properties: {
                  tag_name: { type: "string" },
                  description: { type: "string" },
                },
                required: ["tag_name", "description"],
                additionalProperties: false,
              },
              developer_type: { type: "string" },
            },
            required: [
              "score",
              "segments",
              "improvement_areas",
              "diagnostics",
              "project_ideas",
              "tag",
              "developer_type",
            ],
            additionalProperties: false,
          },
        },
      },
      max_tokens: 4000,
    };

    const res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(schemaPayload),
    });

    if (res.ok || res.status !== 400) return res;

    // Fallback for endpoints that do not support json_schema
    console.warn("[AI_ANALYSIS] json_schema rejected by endpoint, falling back to json_object...");
    return await fetch(LLM_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(minified) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls the Modal.com LLM endpoint (OpenAI-compatible) to generate an AI analysis
 * of a GitHub profile.
 *
 * @param profile        The full `ProfileSummary` to analyse.
 * @param alertCollector Optional `TelegramAlertCollector` for deferred, batched alerts.
 * @returns `{ analysis, usage }` — validated analysis result and token usage data.
 * @throws `Error("CORRUPT_INTELLIGENCE")` if the AI response fails validation.
 * @throws On persistent HTTP errors after `AI_RETRY_ATTEMPTS` retries.
 */
export async function getAIAnalysis(
  profile: ProfileSummary,
  alertCollector?: TelegramAlertCollector,
): Promise<{ analysis: AIAnalysis; usage: TokenUsage }> {
  const startMs = Date.now();

  console.log("[AI_ANALYSIS] Starting AI analysis", {
    username: profile.username,
    model: LLM_MODEL,
    endpoint: LLM_ENDPOINT,
    retryAttempts: AI_RETRY_ATTEMPTS,
    timeoutMs: AI_TIMEOUT_MS,
  });

  const minified = minifyProfile(profile);
  console.log("[AI_ANALYSIS] Profile minified", {
    minifiedSize: JSON.stringify(minified).length,
  });

  let lastError: Error | null = null;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= AI_RETRY_ATTEMPTS; attempt++) {
    response = null;
    try {
      console.log("[AI_ANALYSIS] Sending request to Modal LLM endpoint", {
        attempt,
        url: LLM_ENDPOINT,
        model: LLM_MODEL,
      });
      response = await callAIWithTimeout(SYSTEM_PROMPT, minified, attempt);
      console.log("[AI_ANALYSIS] AI API response received", {
        attempt,
        status: response.status,
        statusText: response.statusText,
      });
      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }
      break;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const isAbort =
        error.name === "AbortError" || error.message.includes("AbortError");
      lastError = error;
      console.error("[AI_ANALYSIS] AI API request failed", {
        attempt,
        error: error.message,
        isAbort,
        willRetry: attempt < AI_RETRY_ATTEMPTS,
      });

      if (attempt < AI_RETRY_ATTEMPTS) {
        const delayMs = AI_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log("[AI_ANALYSIS] Waiting before retry", { attempt, delayMs });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  if (!response) {
    console.error("[AI_ANALYSIS] All retry attempts failed", {
      attempts: AI_RETRY_ATTEMPTS,
      lastError: lastError?.message,
    });
    const alertPayload = {
      source: "AI_ANALYSIS",
      message: "All retry attempts failed",
      error: lastError || new Error("AI API request failed after all retries"),
      context: {
        username: profile.username,
        model: LLM_MODEL,
        attempts: AI_RETRY_ATTEMPTS,
      },
    };
    if (alertCollector) alertCollector.add(alertPayload);
    else void sendTelegramAlert(alertPayload).catch(() => null);
    const baseError =
      lastError || new Error("AI API request failed after all retries");
    throw markAlertSent(baseError);
  }

  if (!response || !response.ok) {
    const errorText = response ? await response.text() : "No response";
    console.error("[AI_ANALYSIS] AI API returned error", {
      status: response?.status,
      error: errorText.slice(0, 200),
    });
    const alertPayload = {
      source: "AI_ANALYSIS",
      message: "AI API returned non-OK status",
      error: new Error(`AI API error: ${response?.status || "unknown"}`),
      context: {
        username: profile.username,
        model: LLM_MODEL,
        status: response?.status,
        errorText: errorText.slice(0, 500),
      },
    };
    if (alertCollector) alertCollector.add(alertPayload);
    else void sendTelegramAlert(alertPayload).catch(() => null);
    throw markAlertSent(
      new Error(
        `AI API error: ${response?.status || "unknown"} - ${errorText}`,
      ),
    );
  }

  console.log("[AI_ANALYSIS] Parsing AI response");
  const data = await response.json();

  // Extract token usage from OpenAI-compatible response
  const rawUsage = data.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;
  const usage: TokenUsage = {
    input_tokens: rawUsage?.prompt_tokens ?? 0,
    output_tokens: rawUsage?.completion_tokens ?? 0,
    total_tokens: rawUsage?.total_tokens ?? 0,
    duration_ms: Date.now() - startMs,
    model: LLM_MODEL,
  };

  const content = data.choices?.[0]?.message?.content;
  console.log("[AI_ANALYSIS] AI response content extracted", {
    hasContent: !!content,
    contentLength: content?.length || 0,
    usage,
  });

  if (!content) {
    console.error("[AI_ANALYSIS] Empty content from AI response", { data });
    const alertPayload = {
      source: "AI_ANALYSIS",
      message: "Empty AI response content",
      error: new Error("CORRUPT_INTELLIGENCE: Empty AI response content."),
      context: { username: profile.username, model: LLM_MODEL },
    };
    if (alertCollector) alertCollector.add(alertPayload);
    else void sendTelegramAlert(alertPayload).catch(() => null);
    throw markAlertSent(
      new Error("CORRUPT_INTELLIGENCE: Empty AI response content."),
    );
  }

  try {
    console.log("[AI_ANALYSIS] Parsing JSON content");
    // Strip markdown code fences (e.g. ```json ... ```) or preambles if present
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    }
    const firstBrace = cleanedContent.indexOf("{");
    const lastBrace = cleanedContent.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
    }

    let rawAnalysis;
    try {
      rawAnalysis = JSON.parse(cleanedContent);
    } catch {
      // If output was truncated at token limit, attempt basic structural JSON repair
      console.warn("[AI_ANALYSIS] Standard JSON.parse failed, attempting JSON auto-repair...");
      let repaired = cleanedContent;
      // Close unclosed strings
      const openQuotes = (repaired.match(/"/g) || []).length;
      if (openQuotes % 2 !== 0) {
        repaired += '"';
      }
      // Count unclosed braces/brackets
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '"' && repaired[i - 1] !== "\\") inString = !inString;
        if (!inString) {
          if (char === "{") openBraces++;
          else if (char === "}") openBraces--;
          else if (char === "[") openBrackets++;
          else if (char === "]") openBrackets--;
        }
      }
      while (openBrackets > 0) { repaired += "]"; openBrackets--; }
      while (openBraces > 0) { repaired += "}"; openBraces--; }
      rawAnalysis = JSON.parse(repaired);
    }
    console.log("[AI_ANALYSIS] JSON parsed successfully", {
      score: rawAnalysis.score,
      hasSegments: !!rawAnalysis.segments,
    });
    const ensuredAnalysis = {
      ...rawAnalysis,
      improvement_areas: Array.isArray(rawAnalysis.improvement_areas)
        ? rawAnalysis.improvement_areas.filter(
            (v: unknown) => typeof v === "string",
          )
        : [],
      diagnostics: Array.isArray(rawAnalysis.diagnostics)
        ? rawAnalysis.diagnostics.filter((v: unknown) => typeof v === "string")
        : [],
      project_ideas: rawAnalysis.project_ideas || {},
      tag: rawAnalysis.tag || {
        tag_name: "Developer",
        description: "Active developer",
      },
      developer_type: rawAnalysis.developer_type || "Developer",
    };
    console.log("[AI_ANALYSIS] Validating against schema");
    const validated = AnalysisResultSchema.parse(ensuredAnalysis) as AIAnalysis;
    console.log("[AI_ANALYSIS] Analysis complete and validated", {
      score: validated.score,
      usage,
    });
    return { analysis: validated, usage };
  } catch (err) {
    console.error("[AI_ANALYSIS] Response Parsing/Validation Failure", {
      error: err instanceof Error ? err.message : String(err),
      contentPreview: content.slice(0, 300),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const alertPayload = {
      source: "AI_ANALYSIS",
      message: "Response parsing/validation failure",
      error: err,
      context: {
        username: profile.username,
        model: LLM_MODEL,
        contentPreview: content.slice(0, 240),
      },
    };
    if (alertCollector) alertCollector.add(alertPayload);
    else void sendTelegramAlert(alertPayload).catch(() => null);
    throw markAlertSent(
      new Error(
        "CORRUPT_INTELLIGENCE: The AI response failed structural validation protocols.",
      ),
    );
  }
}
