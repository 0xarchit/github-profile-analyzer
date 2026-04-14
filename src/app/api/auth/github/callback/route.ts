import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { upsertUser } from "@/lib/db";
import { createSession } from "@/lib/auth";

export const runtime = "edge";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: Request) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return NextResponse.redirect(`${APP_URL}/?error=missing_oauth_config`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const storedState = (await cookies()).get("oauth_state")?.value;
  if (!state || state !== storedState) {
    (await cookies()).delete("oauth_state");
    return NextResponse.redirect(`${APP_URL}/?error=invalid_state`);
  }

  if (!code) {
    (await cookies()).delete("oauth_state");
    return NextResponse.redirect(`${APP_URL}/?error=no_code`);
  }

  try {
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      throw new Error(tokenData.error_description || "Token exchange failed");
    }

    const accessToken = tokenData.access_token;

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "GitScore",
      },
    });

    if (!userRes.ok) {
      throw new Error(`Failed to fetch user profile: ${userRes.status}`);
    }

    const userData = await userRes.json();
    if (!userData?.id || !userData?.login) {
      throw new Error("GitHub profile payload missing required fields");
    }

    const user = await upsertUser({
      github_id: userData.id,
      username: userData.login,
      avatar_url: userData.avatar_url,
      access_token: accessToken,
    });

    await createSession({
      githubId: user.github_id,
      username: user.username,
      accessToken: user.access_token,
      avatarUrl: user.avatar_url || "",
    });

    (await cookies()).delete("oauth_state");

    return NextResponse.redirect(APP_URL);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error("Auth failed");
    console.error("Critical Auth Failure:", error.message);
    (await cookies()).delete("oauth_state");
    return NextResponse.redirect(`${APP_URL}/?error=authentication_failed`);
  }
}
