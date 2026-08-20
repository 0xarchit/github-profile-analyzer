import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "edge";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const REDIRECT_URI = `${APP_URL}/api/auth/github/callback`;

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development" || process.env.ENV === "dev" || process.env.NEXT_PUBLIC_ENV === "dev";
  const { searchParams } = new URL(request.url);
  const devUserParam = searchParams.get("username") || "local-dev";

  if (!GITHUB_CLIENT_ID) {
    if (isDev) {
      // In local dev without OAuth credentials configured, provide a dev mock session redirect
      return NextResponse.redirect(`${APP_URL}/api/auth/github/callback?dev_login=true&username=${encodeURIComponent(devUserParam)}`);
    }
    return NextResponse.redirect(`${APP_URL}/?error=missing_client_id`);
  }

  const state = crypto.randomUUID();
  (await cookies()).set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "read:user",
    state,
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
}
