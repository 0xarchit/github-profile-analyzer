import { describe, it, expect, vi } from "vitest";

// Mock the dependencies before importing the module under test
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
}));

vi.mock("@/lib/telegram-alert", () => ({
  sendTelegramAlert: vi.fn().mockResolvedValue(undefined),
}));

// We test the isValidSession predicate indirectly through verifySession.
// Import after mocks are set up.
import { verifySession } from "../auth";

// A helper to build a minimal valid JWT token for tests
async function buildValidToken(): Promise<string> {
  // Access the JWT_SECRET from the module
  const { JWT_SECRET } = await import("../auth");
  const { SignJWT } = await import("jose");
  return new SignJWT({
    githubId: 12345,
    username: "testuser",
    accessToken: "gho_token",
    avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

describe("verifySession", () => {
  it("returns Session for a valid JWT with all required fields", async () => {
    const token = await buildValidToken();
    const session = await verifySession(token);
    expect(session).not.toBeNull();
    expect(session?.githubId).toBe(12345);
    expect(session?.username).toBe("testuser");
    expect(session?.accessToken).toBe("gho_token");
  });

  it("returns null for an invalid/garbage JWT", async () => {
    const session = await verifySession("not.a.valid.jwt");
    expect(session).toBeNull();
  });

  it("returns null when githubId is a string instead of number", async () => {
    const { JWT_SECRET } = await import("../auth");
    const { SignJWT } = await import("jose");
    const badToken = await new SignJWT({
      githubId: "string-id", // wrong type
      username: "testuser",
      accessToken: "gho_token",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(JWT_SECRET);
    const session = await verifySession(badToken);
    expect(session).toBeNull();
  });

  it("returns null when a required field (accessToken) is missing", async () => {
    const { JWT_SECRET } = await import("../auth");
    const { SignJWT } = await import("jose");
    const badToken = await new SignJWT({
      githubId: 12345,
      username: "testuser",
      // accessToken missing
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(JWT_SECRET);
    const session = await verifySession(badToken);
    expect(session).toBeNull();
  });
});
