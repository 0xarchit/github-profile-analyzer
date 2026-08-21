import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";
import { sendTelegramAlert } from "./telegram-alert";

export const RAW_JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "development" ? "local_dev_default_jwt_secret_key_32bytes_long" : "");
if (!RAW_JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
export const JWT_SECRET = new TextEncoder().encode(RAW_JWT_SECRET);
export const SESSION_COOKIE = "gitscore_session";

export interface Session {
  githubId: number;
  username: string;
  accessToken: string;
  avatarUrl: string;
}

function isExpectedJwtFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const value = `${error.name} ${error.message}`.toLowerCase();
  return (
    value.includes("jwt") ||
    value.includes("jws") ||
    value.includes("token") ||
    value.includes("expired") ||
    value.includes("signature")
  );
}

function isValidSession(p: JWTPayload): p is JWTPayload & Session {
  const r = p as Record<string, unknown>;
  const parsedGithubId = Number(r.githubId);
  return (
    !isNaN(parsedGithubId) &&
    parsedGithubId > 0 &&
    typeof r.username === "string" &&
    r.username.trim().length > 0 &&
    typeof r.accessToken === "string" &&
    typeof r.avatarUrl === "string"
  );
}

/**
 * Creates a signed JWT session and sets it as an HTTP-only cookie (`gitscore_session`).
 * Encodes githubId, username, accessToken, and avatarUrl in the payload.
 *
 * @param sessionData - User info to encode into the token
 */
export async function createSession(sessionData: Session) {
  const session = await new SignJWT({ ...sessionData })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return session;
}

export const GUEST_COOKIE = "gitscore_guest";

export async function createGuestSession(username: string) {
  const token = await new SignJWT({ username, verified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);

  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
}

export async function getGuestSession(): Promise<string | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.verified === true && typeof payload.username === "string") {
      return payload.username;
    }
    return null;
  } catch (error) {
    if (!isExpectedJwtFailure(error)) {
      void sendTelegramAlert({
        source: "AUTH_GET_GUEST_SESSION",
        message: "Guest session verification failed",
        error,
      }).catch(() => null);
    }
    return null;
  }
}

/**
 * Verifies a raw JWT string and returns the typed `Session` if valid.
 * Uses `isValidSession()` to perform runtime field validation — returns `null`
 * if any required field (`githubId`, `username`, `accessToken`, `avatarUrl`) is
 * missing or has the wrong type, preventing silent undefined propagation.
 *
 * @param token  The raw JWT string to verify.
 * @returns `Session` on success, `null` on invalid/expired/malformed token.
 */
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!isValidSession(payload)) {
      console.warn("[AUTH] Session payload failed validation check");
      return null;
    }
    const r = payload as Record<string, unknown>;
    return {
      githubId: Number(r.githubId),
      username: String(r.username),
      accessToken: String(r.accessToken),
      avatarUrl: String(r.avatarUrl ?? ""),
    };
  } catch (error) {
    console.warn("[AUTH] jwtVerify failed:", error);
    if (!isExpectedJwtFailure(error)) {
      void sendTelegramAlert({
        source: "AUTH_VERIFY_SESSION",
        message: "Session verification failed",
        error,
      }).catch(() => null);
    }
    return null;
  }
}

/**
 * Reads the `gitscore_session` cookie from the current request and verifies it.
 * Delegates to `verifySession()` — returns `null` if the cookie is absent or invalid.
 */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete(GUEST_COOKIE);
}
