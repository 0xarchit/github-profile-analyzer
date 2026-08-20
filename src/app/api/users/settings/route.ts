import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getUserByGithubId,
  getUserByUsername,
  upsertUser,
  updateUserSettings,
  getUserScans,
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

    const scans = user ? await getUserScans(user.id) : [];

    return NextResponse.json({
      settings: user
        ? user.settings
        : {
            profile_locked: true,
            keep_history: true,
            public_scans: false,
            primary_scan_id: null,
          },
      history: scans,
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
