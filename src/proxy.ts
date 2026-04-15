import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const SESSION_COOKIE = "gitscore_session";
const UPSTASH_URL = (process.env.UPSTASH_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_TOKEN || "").trim();
const isRatelimitConfigured = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const redis = isRatelimitConfigured
  ? new Redis({
      url: UPSTASH_URL,
      token: UPSTASH_TOKEN,
    })
  : null;

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      analytics: true,
      prefix: "gitscore:ratelimit",
    })
  : null;

function applySecurityHeaders(
  response: Response | NextResponse,
): typeof response {
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  const cspPolicy =
    process.env.NODE_ENV === "production"
      ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com https://github.com https://github.githubassets.com; connect-src 'self' https://api.github.com https://github.com; font-src 'self' data:;"
      : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com https://github.com https://github.githubassets.com; connect-src 'self' https://api.github.com https://github.com; font-src 'self' data:;";
  response.headers.set("Content-Security-Policy", cspPolicy);
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return applySecurityHeaders(
        new Response(
          JSON.stringify({ error: "Domain Restricted: Access Denied" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (originUrl.host !== host) {
      return applySecurityHeaders(
        new Response(
          JSON.stringify({ error: "Domain Restricted: Access Denied" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isAuthRoute = pathname.startsWith("/api/auth/");
  const isSettingsRoute = pathname === "/settings";

  const response: NextResponse = NextResponse.next();

  if (isApiRoute || isSettingsRoute) {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    let isAuthenticated = false;

    if (sessionToken) {
      try {
        await jwtVerify(sessionToken, JWT_SECRET);
        isAuthenticated = true;
      } catch {}
    }

    if (!isAuthenticated) {
      if (isSettingsRoute) {
        return applySecurityHeaders(
          NextResponse.redirect(new URL("/?error=login_required", request.url)),
        );
      }

      if (isApiRoute && !isAuthRoute) {
        if (!ratelimit) {
          if (process.env.NODE_ENV === "production") {
            return applySecurityHeaders(
              new NextResponse(
                JSON.stringify({
                  error: "RATE_LIMIT_UNAVAILABLE",
                  message: "Rate limiter is not configured on this deployment.",
                }),
                {
                  status: 503,
                  headers: { "Content-Type": "application/json" },
                },
              ),
            );
          }
          return applySecurityHeaders(response);
        }

        const forwarded = request.headers.get("x-forwarded-for");
        const realIp = request.headers.get("x-real-ip");
        const ip = forwarded
          ? forwarded.split(",")[0]?.trim() || realIp || "127.0.0.1"
          : realIp || "127.0.0.1";

        const { success } = await ratelimit.limit(ip);

        if (!success) {
          return applySecurityHeaders(
            new NextResponse(
              JSON.stringify({
                error: "NEURAL_QUOTA_EXCEEDED",
                message:
                  "Guest scan quota depleted. Integrate GitHub for unlimited access.",
              }),
              {
                status: 429,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
      }
    }
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
