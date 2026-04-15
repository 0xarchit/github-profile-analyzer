import { AnalysisResultSchema, ValidatedAnalysisResult } from "./validation";
import { ProfileSummary } from "@/types";

const GITHUB_PAT_TOKENS = (process.env.GITHUB_PAT_TOKENS || "")
  .split(",")
  .filter(Boolean);
const GITHUB_MODEL = process.env.GITHUB_MODEL || "openai/gpt-4.1";

const AI_TIMEOUT_MS = 45000;
const AI_RETRY_ATTEMPTS = 3;
const AI_RETRY_DELAY_MS = 2000;

function getFallbackKey(): string {
  const key =
    GITHUB_PAT_TOKENS[Math.floor(Math.random() * GITHUB_PAT_TOKENS.length)];
  if (!key)
    throw new Error("GITHUB_PAT_TOKENS environment variable is required");
  return key;
}

export type AIAnalysis = ValidatedAnalysisResult;

function minifyProfile(profile: ProfileSummary) {
  const allRepos = [
    ...Object.entries(profile.original_repos).map(([, r]) => ({ ...r })),
  ].sort((a, b) => b.stars + b.forks - (a.stars + a.forks));

  const tr = allRepos.slice(0, 20).map((r) => ({
    n: r.n,
    d: r.description?.slice(0, 100),
    s: r.stars,
    f: r.forks,
    l: r.primary_lang,
  }));

  const or = allRepos.slice(20, 100).map((r) => [r.n, r.stars, r.primary_lang]);

  return {
    u: {
      un: profile.username,
      nm: profile.name,
      bio: profile.bio?.slice(0, 120),
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

async function callAIWithTimeout(
  apiKey: string,
  systemPrompt: string,
  minified: unknown,
  attempt: number = 1,
): Promise<Response> {
  console.log("[AI_ANALYSIS] AI API call attempt", {
    attempt,
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
    return await fetch("https://models.github.ai/inference/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        model: GITHUB_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(minified) },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAIAnalysis(
  profile: ProfileSummary,
  userToken?: string,
): Promise<AIAnalysis> {
  console.log("[AI_ANALYSIS] Starting AI analysis", {
    username: profile.username,
    hasUserToken: !!userToken,
    model: GITHUB_MODEL,
    retryAttempts: AI_RETRY_ATTEMPTS,
    timeoutMs: AI_TIMEOUT_MS,
  });
  const apiKey = userToken || getFallbackKey();
  console.log("[AI_ANALYSIS] Using API key", { isUserKey: !!userToken });
  const minified = minifyProfile(profile);
  console.log("[AI_ANALYSIS] Profile minified", {
    minifiedSize: JSON.stringify(minified).length,
  });

  const systemPrompt = `You are a professional GitHub Auditor. Your tone is witty, analytical, and slightly sarcastic (a "roast" style).
Analyze the minified JSON data and return a structured JSON response. **Do not use emojis in your response.**

Data Keys:
- "u": User info
- "tr": Top 20 Detailed Repos
- "or": Other Repos [name, stars, lang]
- "st": Stats (tc=contributions, cc=commits, pr=PRs, ir=Issues, cs=streak, l=langs)

Return format:
{
  "score": <0-100>,
  "segments": {
    "roast": "<a 2-3 sentence brutal but funny roast of the profile>",
    "technical_analysis": "<a deep dive into code quality, stack choices, and repository architecture>",
    "strategic_advice": "<long-term advice for career growth or profile impact>"
  },
  "improvement_areas": ["<area>"],
  "diagnostics": ["<observation>"],
  "project_ideas": {
    "1": { "title": "...", "description": "...", "tech stack": ["..."] },
    "2": { "title": "...", "description": "...", "tech stack": ["..."] },
    "3": { "title": "...", "description": "...", "tech stack": ["..."] }
  },
  "tag": { "tag_name": "...", "description": "..." },
  "developer_type": "<Professional Title>"
}
IMPORTANT: Always return 'developer_type' as a direct child of the root object. You MUST generate exactly 3 unique project ideas in the 'project_ideas' object. Do not leave any fields empty.`;

  let lastError: Error | null = null;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= AI_RETRY_ATTEMPTS; attempt++) {
    try {
      console.log("[AI_ANALYSIS] Sending request to GitHub AI API", {
        attempt,
        url: "https://models.github.ai/inference/chat/completions",
        model: GITHUB_MODEL,
      });
      response = await callAIWithTimeout(
        apiKey,
        systemPrompt,
        minified,
        attempt,
      );
      console.log("[AI_ANALYSIS] AI API response received", {
        attempt,
        status: response.status,
        statusText: response.statusText,
      });
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
    throw lastError || new Error("AI API request failed after all retries");
  }

  if (!response || !response.ok) {
    const errorText = response ? await response.text() : "No response";
    console.error("[AI_ANALYSIS] AI API returned error", {
      status: response?.status,
      error: errorText.slice(0, 200),
    });
    throw new Error(
      `AI API error: ${response?.status || "unknown"} - ${errorText}`,
    );
  }

  console.log("[AI_ANALYSIS] Parsing AI response");
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  console.log("[AI_ANALYSIS] AI response content extracted", {
    hasContent: !!content,
    contentLength: content?.length || 0,
  });
  if (!content) {
    console.error("[AI_ANALYSIS] Empty content from AI response", { data });
    throw new Error("CORRUPT_INTELLIGENCE: Empty AI response content.");
  }

  try {
    console.log("[AI_ANALYSIS] Parsing JSON content");
    const rawAnalysis = JSON.parse(content);
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
    });
    return validated;
  } catch (err) {
    console.error("[AI_ANALYSIS] Response Parsing/Validation Failure", {
      error: err instanceof Error ? err.message : String(err),
      contentPreview: content.slice(0, 300),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw new Error(
      "CORRUPT_INTELLIGENCE: The AI response failed structural validation protocols.",
    );
  }
}
