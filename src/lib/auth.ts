import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";
import { sendTelegramAlert } from "./telegram-alert";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
export const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
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

/**
 * Runtime type predicate that validates a JWT payload contains all required
 * Session fields with the correct types. Prevents silent undefined values
 * from propagating when field names change or tokens are malformed.
 */
function isValidSession(p: JWTPayload): p is JWTPayload & Session {
  return (
    typeof (p as Record<string, unknown>).githubId === "number" &&
    typeof (p as Record<string, unknown>).username === "string" &&
    typeof (p as Record<string, unknown>).accessToken === "string" &&
    typeof (p as Record<string, unknown>).avatarUrl === "string"
  );
}

/**
 * Creates a signed JWT session and sets it as an HTTP-only cookie (`gitscore_session`).
 * The token is signed with HS256 and expires in 7 days.
 *
 * @param sessionData The session payload to sign.
 */
export async function createSession(sessionData: Session) {
  const token = await new SignJWT({ ...sessionData })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export const GUEST_COOKIE = "gitscore_guest";

export async function createGuestSession(username: string) {
  const token = await new SignJWT({ username, verified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
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
      return null;
    }
    return payload;
  } catch (error) {
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
