import { NextResponse } from "next/server";
import { verifyAndInjectStar } from "@/lib/github";
import { createGuestSession } from "@/lib/auth";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    const cleanUsername = username.trim();
    const requestId = crypto.randomUUID();
    console.info("guest-verify-request", { requestId });

    const isVerified = await verifyAndInjectStar(cleanUsername);

    if (isVerified) {
      await createGuestSession(cleanUsername);
      console.info("guest-verify-success", { requestId });
      return NextResponse.json({
        success: true,
        message: "Verified securely.",
      });
    } else {
      console.warn("guest-verify-failed", { requestId });
      return NextResponse.json(
        {
          error: "Star not found",
          message:
            "Could not verify star. Please star the repository and try again.",
        },
        { status: 403 },
      );
    }
  } catch (err: unknown) {
    const error =
      err instanceof Error ? err : new Error("Unknown verification error");
    console.error("Verify-Guest Security Incident:", error.message);
    return NextResponse.json(
      { error: "Verification protocol failure" },
      { status: 500 },
    );
  }
}
