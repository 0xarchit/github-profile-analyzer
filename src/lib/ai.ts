import { AnalysisResultSchema, ValidatedAnalysisResult } from "./validation";
import { ProfileSummary } from "@/types";

const GITHUB_PAT_TOKENS = (process.env.GITHUB_PAT_TOKENS || "")
  .split(",")
  .filter(Boolean);
const GITHUB_MODEL = process.env.GITHUB_MODEL || "openai/gpt-4.1";

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

  const or = allRepos.slice(20).map((r) => [r.n, r.stars, r.primary_lang]);

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

export async function getAIAnalysis(
  profile: ProfileSummary,
  userToken?: string,
): Promise<AIAnalysis> {
  const apiKey = userToken || getFallbackKey();
  const minified = minifyProfile(profile);

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

  const response = await fetch(
    "https://models.github.ai/inference/chat/completions",
    {
      method: "POST",
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
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content)
    throw new Error("CORRUPT_INTELLIGENCE: Empty AI response content.");

  try {
    const rawAnalysis = JSON.parse(content);
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
    return AnalysisResultSchema.parse(ensuredAnalysis) as AIAnalysis;
  } catch (err) {
    console.error("AI Response Parsing/Validation Failure", err, content);
    throw new Error(
      "CORRUPT_INTELLIGENCE: The AI response failed structural validation protocols.",
    );
  }
}
