import { NextResponse } from "next/server";
import { getScanById, getUserById, getUserByGithubId } from "@/lib/db";
import { getSession, getGuestSession } from "@/lib/auth";
import { checkStarStatus } from "@/lib/github";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const session = await getSession();
    const token = session?.accessToken;

    const scan = await getScanById(id);

    if (!scan) {
      return NextResponse.json(
        { error: "Snapshot not found" },
        { status: 404 },
      );
    }

    let isAuthorized = false;
    let isOwner = false;

    if (session) {
      const dbUser = await getUserByGithubId(session.githubId);
      if (dbUser && dbUser.id === scan.user_id) {
        isAuthorized = true;
        isOwner = true;
      }
    }

    if (!isAuthorized) {
      const owner = await getUserById(scan.user_id);
      if (owner?.settings?.public_scans) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: "ACCESS_DENIED",
          message:
            "This scan is private. Only the owner can view historical shards.",
        },
        { status: 403 },
      );
    }

    if (!isOwner) {
      let isStarred = false;

      if (session) {
        isStarred = await checkStarStatus(session.username, token);
      }

      if (!isStarred) {
        const guestUsername = await getGuestSession();
        if (guestUsername) {
          isStarred = await checkStarStatus(guestUsername);
        }
      }

      if (!isStarred) {
        return NextResponse.json(
          {
            error: "Star required",
            message: "Verification required to access the diagnostic database.",
          },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(scan);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error("Retrieval Failure");
    console.error("Scan Retrieval Matrix Failure:", error.message);
    return NextResponse.json({ error: "Retrieval failure" }, { status: 500 });
  }
}
