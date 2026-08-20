import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { upsertUser } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { sendTelegramAlert } from "@/lib/telegram-alert";
import { UsernameSchema } from "@/lib/validation";

export const runtime = "edge";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV !== "production";
  const { searchParams } = new URL(request.url);
  const devLogin = searchParams.get("dev_login") === "true";
  const rawDevUser = searchParams.get("username") || "local-dev";
  const parsedUser = UsernameSchema.safeParse(rawDevUser);
  const devUsername = parsedUser.success ? parsedUser.data : "local-dev";

  if (isDev && devLogin) {
    const devGithubId = 99999999;
    try {
      const user = await upsertUser({
        github_id: devGithubId,
        username: devUsername,
        avatar_url: `https://github.com/${devUsername}.png`,
        access_token: "dev_mock_token",
      });
      await createSession({
        githubId: user.github_id,
        username: user.username,
        accessToken: user.access_token,
        avatarUrl: user.avatar_url || "",
      });
    } catch {
      // If DB is offline in local dev, create session directly
      await createSession({
        githubId: devGithubId,
        username: devUsername,
        accessToken: "dev_mock_token",
        avatarUrl: `https://github.com/${devUsername}.png`,
      });
    }
    return NextResponse.redirect(APP_URL);
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    if (isDev) {
      return NextResponse.redirect(`${APP_URL}/api/auth/github/callback?dev_login=true&username=${encodeURIComponent(devUsername)}`);
    }
    return NextResponse.redirect(`${APP_URL}/?error=missing_oauth_config`);
  }

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
    const signal = AbortSignal.timeout(10_000);

    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        signal,
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
      signal: AbortSignal.timeout(10_000),
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
    await sendTelegramAlert({
      source: "AUTH_GITHUB_CALLBACK",
      message: "Critical auth callback failure",
      error,
      context: { hasCode: Boolean(code), hasState: Boolean(state) },
    });
    (await cookies()).delete("oauth_state");
    return NextResponse.redirect(`${APP_URL}/?error=authentication_failed`);
  }
}
