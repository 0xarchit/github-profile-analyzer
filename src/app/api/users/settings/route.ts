import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getUserByGithubId, updateUserSettings, getUserScans } from "@/lib/db";

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
    const user = await getUserByGithubId(session.githubId);
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const scans = await getUserScans(user.id);

    return NextResponse.json({
      settings: user.settings,
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

    const user = await getUserByGithubId(session.githubId);
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    await updateUserSettings(user.id, parsed.data);
    const updatedUser = await getUserByGithubId(session.githubId);

    return NextResponse.json({
      success: true,
      settings: updatedUser?.settings ?? user.settings,
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
