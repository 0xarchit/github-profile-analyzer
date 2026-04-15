import { z } from "zod";

export const UsernameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid GitHub username format");

export const RepositorySchema = z.object({
  name: z.string(),
  stars: z.number(),
  description: z.string().optional().default(""),
  language: z.string().optional().default("Unknown"),
  pushedAt: z.string(),
});

export const ProjectIdeaSchema = z.object({
  title: z.string(),
  description: z.string(),
  "tech stack": z.array(z.string()),
});

export const AnalysisResultSchema = z.object({
  score: z.number().min(0).max(100),
  segments: z.object({
    roast: z.string(),
    technical_analysis: z.string(),
    strategic_advice: z.string(),
  }),
  improvement_areas: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
  project_ideas: z.record(z.string(), ProjectIdeaSchema).optional(),
  tag: z
    .object({
      tag_name: z.string(),
      description: z.string(),
    })
    .optional(),
  developer_type: z.string().optional(),

  career_stats: z
    .object({
      total_commits: z.number(),
      total_prs: z.number(),
      total_issues: z.number(),
      daily_streak: z.number(),
      daily_best: z.number(),
      weekly_streak: z.number(),
      weekly_best: z.number(),
      top_languages: z.array(
        z.object({
          name: z.string(),
          value: z.number(),
          color: z.string(),
        }),
      ),
      commit_activity: z.array(
        z.object({
          month: z.string(),
          count: z.number(),
        }),
      ),
    })
    .optional(),

  calendar_data: z
    .object({
      weeks: z.array(
        z.object({
          contributionDays: z.array(
            z.object({
              contributionCount: z.number(),
              date: z.string(),
            }),
          ),
        }),
      ),
    })
    .optional(),

  total_stars: z.number().min(0).optional(),
  followers: z.number().min(0).optional(),
  public_repo_count: z.number().min(0).optional(),

  top_repos: z.array(RepositorySchema).optional(),
  achievements: z.array(z.string()).optional(),
  stats: z
    .object({
      total_stars: z.number().optional(),
      total_forks: z.number().optional(),
      contribution_streak: z.number().optional(),
      tech_stack_diversity: z.number().optional(),
    })
    .optional(),
  detailed_analysis: z.array(z.string()).optional(),
  timestamp: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
});

export type ValidatedAnalysisResult = z.infer<typeof AnalysisResultSchema>;
