import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

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
    if (payload.verified && payload.username) {
      return payload.username as string;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete(GUEST_COOKIE);
}
