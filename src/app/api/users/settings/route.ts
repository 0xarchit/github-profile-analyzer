import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getUserByGithubId,
  getUserByUsername,
  upsertUser,
  updateUserSettings,
  getUserScans,
  getUserDeterministicScans,
} from "@/lib/db";
import { deleteCachedData } from "@/lib/redis";

export const runtime = "edge";

const SettingsSchema = z.object({
  profile_locked: z.boolean().optional(),
  keep_history: z.boolean().optional(),
  public_scans: z.boolean().optional(),
  primary_scan_id: z.string().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let user = await getUserByGithubId(session.githubId);
    if (!user && session.username) {
      user = await getUserByUsername(session.username);
    }
    if (!user) {
      try {
        user = await upsertUser({
          github_id: session.githubId,
          username: session.username,
          avatar_url: session.avatarUrl,
          access_token: session.accessToken || "",
        });
      } catch (upsertErr) {
        console.warn("Could not auto-upsert user in settings route:", upsertErr);
      }
    }

    const [scans, deterministicScans] = user
      ? await Promise.all([getUserScans(user.id), getUserDeterministicScans(user.id)])
      : [[], []];

    // Combine with deterministic scans first, sorted by created_at desc, capped strictly at 10
    const unifiedHistory = [
      ...deterministicScans.map((d) => ({
        id: d.id,
        user_id: d.user_id,
        username: d.username,
        data: {
          score: d.overall_score,
          developer_type: d.archetype || "Developer",
          letter_grade: d.letter_grade,
          mode: d.mode,
        },
        created_at: d.created_at,
        type: "deterministic" as const,
      })),
      ...scans.map((s) => ({
        ...s,
        type: "legacy" as const,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    const defaultPrimaryId = user?.settings?.primary_scan_id || unifiedHistory[0]?.id || null;

    return NextResponse.json({
      settings: user
        ? {
            ...user.settings,
            primary_scan_id: defaultPrimaryId,
          }
        : {
            profile_locked: true,
            keep_history: true,
            public_scans: false,
            primary_scan_id: defaultPrimaryId,
          },
      history: unifiedHistory,
      deterministicHistory: deterministicScans.slice(0, 10),
    });
  } catch (err: unknown) {
    const error =
      err instanceof Error ? err : new Error("Settings Retrieval Failure");
    console.error("Settings GET failure:", error.message);
    return NextResponse.json(
      { error: "Failed to retrieve configuration shards" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = SettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_CONFIG",
          message:
            "The submitted settings bundle failed structural validation.",
        },
        { status: 400 },
      );
    }

    let user = await getUserByGithubId(session.githubId);
    if (!user && session.username) {
      user = await getUserByUsername(session.username);
    }
    if (!user) {
      user = await upsertUser({
        github_id: session.githubId,
        username: session.username,
        avatar_url: session.avatarUrl,
        access_token: session.accessToken || "",
      });
    }

    await updateUserSettings(user.id, parsed.data);

    if (
      parsed.data.primary_scan_id !== undefined ||
      parsed.data.public_scans !== undefined
    ) {
      const cacheKey = `analysed:${user.username.toLowerCase()}`;
      await deleteCachedData(cacheKey);
    }

    return NextResponse.json({
      success: true,
      settings: {
        ...user.settings,
        ...parsed.data,
      },
    });
  } catch (err: unknown) {
    const error =
      err instanceof Error ? err : new Error("Settings Update Failure");
    console.error("Settings PATCH failure:", error.message);
    return NextResponse.json(
      { error: "Failed to commit configuration updates" },
      { status: 500 },
    );
  }
}
