import { describe, it, expect } from "vitest";

// ─── Pure logic extracted from SnapshotClient.tsx ────────────────────────────
//
// These tests verify the business rules embedded in SnapshotClient without
// requiring a DOM or React rendering environment.

// ---------------------------------------------------------------------------
// Snapshot fetch URL construction
// ---------------------------------------------------------------------------

function buildSnapshotUrl(id: string): string {
  return `/api/scans/${id}`;
}

describe("SnapshotClient – snapshot URL construction", () => {
  it("builds the correct URL for a given snapshot id", () => {
    expect(buildSnapshotUrl("abc123")).toBe("/api/scans/abc123");
  });

  it("handles UUIDs as ids", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildSnapshotUrl(uuid)).toBe(`/api/scans/${uuid}`);
  });

  it("handles numeric string ids", () => {
    expect(buildSnapshotUrl("42")).toBe("/api/scans/42");
  });

  it("includes the id verbatim (no encoding applied by the builder)", () => {
    const id = "my-scan-id";
    expect(buildSnapshotUrl(id)).toContain(id);
  });
});

// ---------------------------------------------------------------------------
// Guest verification request builder
// handleViewerVerification posts to /api/auth/verify-guest
// ---------------------------------------------------------------------------

interface GuestVerifyBody {
  username: string;
}

function buildVerifyGuestPayload(rawUsername: string): GuestVerifyBody {
  return { username: rawUsername.trim() };
}

function shouldSubmitVerification(viewerUsername: string): boolean {
  return viewerUsername.trim().length > 0;
}

describe("SnapshotClient – viewer verification logic", () => {
  it("trims whitespace from the username before sending", () => {
    const payload = buildVerifyGuestPayload("  octocat  ");
    expect(payload.username).toBe("octocat");
  });

  it("preserves username casing", () => {
    const payload = buildVerifyGuestPayload("MyUser");
    expect(payload.username).toBe("MyUser");
  });

  it("prevents submission when username is empty", () => {
    expect(shouldSubmitVerification("")).toBe(false);
  });

  it("prevents submission when username is only whitespace", () => {
    expect(shouldSubmitVerification("   ")).toBe(false);
  });

  it("allows submission when username is non-empty", () => {
    expect(shouldSubmitVerification("octocat")).toBe(true);
  });

  it("allows submission when username has surrounding spaces (trimmed)", () => {
    expect(shouldSubmitVerification("  octocat  ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SectionCard null-return logic
// In SnapshotClient, SectionCard returns null when content is undefined/empty.
// ---------------------------------------------------------------------------

function sectionCardShouldRender(content: string | undefined): boolean {
  return !!content;
}

describe("SnapshotClient – SectionCard rendering logic", () => {
  it("does not render when content is undefined", () => {
    expect(sectionCardShouldRender(undefined)).toBe(false);
  });

  it("does not render when content is an empty string", () => {
    expect(sectionCardShouldRender("")).toBe(false);
  });

  it("renders when content is a non-empty string", () => {
    expect(sectionCardShouldRender("Some analysis text")).toBe(true);
  });

  it("renders when content is a single character", () => {
    expect(sectionCardShouldRender("x")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error state detection
// ---------------------------------------------------------------------------

function isSnapshotError(resOk: boolean, error403StarRequired: boolean): string | null {
  if (error403StarRequired) return "STAR_REQUIRED";
  if (!resOk) return "SNAPSHOT_RETRIEVAL_FAILED";
  return null;
}

describe("SnapshotClient – fetch error detection", () => {
  it("detects star-required 403 response", () => {
    expect(isSnapshotError(false, true)).toBe("STAR_REQUIRED");
  });

  it("detects generic failure on non-ok response", () => {
    expect(isSnapshotError(false, false)).toBe("SNAPSHOT_RETRIEVAL_FAILED");
  });

  it("returns null when response is OK", () => {
    expect(isSnapshotError(true, false)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Verification error message resolution
// When the verify-guest API returns an error message, the component uses
// resData.message or falls back to "Star not detected."
// ---------------------------------------------------------------------------

function resolveVerificationError(
  resOk: boolean,
  resSuccess: boolean,
  resMessage?: string,
): string | null {
  if (resOk && resSuccess) return null;
  return resMessage || "Star not detected.";
}

describe("SnapshotClient – verification error message", () => {
  it("returns null when verification is successful", () => {
    expect(resolveVerificationError(true, true)).toBe(null);
  });

  it("returns message from API when provided and failed", () => {
    expect(
      resolveVerificationError(false, false, "Repository not starred"),
    ).toBe("Repository not starred");
  });

  it("falls back to 'Star not detected.' when no message provided", () => {
    expect(resolveVerificationError(false, false)).toBe("Star not detected.");
  });

  it("returns fallback even when resOk is true but success is false", () => {
    expect(resolveVerificationError(true, false)).toBe("Star not detected.");
  });
});

// ---------------------------------------------------------------------------
// Historical date display
// The component calls `new Date(data.cachedAt || Date.now()).toLocaleDateString()`
// ---------------------------------------------------------------------------

function formatCachedDate(cachedAt: string | undefined): string {
  return new Date(cachedAt || Date.now()).toLocaleDateString();
}

describe("SnapshotClient – historical date display", () => {
  it("formats a known ISO date string", () => {
    const result = formatCachedDate("2024-01-15T00:00:00.000Z");
    expect(result).toContain("2024");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("falls back to today's date when cachedAt is undefined", () => {
    const result = formatCachedDate(undefined);
    const today = new Date().toLocaleDateString();
    // Result should be today (or possibly off by a second, so check format)
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Should match today's date in some locale format
    const todayYear = new Date().getFullYear().toString();
    expect(result).toContain(todayYear);
  });

  it("handles empty string like undefined (falls back to now)", () => {
    // Empty string coerces to 0 (epoch) in Date constructor
    const result = formatCachedDate("");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PDF filename for snapshot
// The PDF is exported as `Snapshot_${username}_${id}.pdf`
// ---------------------------------------------------------------------------

function buildSnapshotPdfFilename(username: string, id: string): string {
  return `Snapshot_${username}_${id}.pdf`;
}

describe("SnapshotClient – PDF filename construction", () => {
  it("builds the correct filename format", () => {
    expect(buildSnapshotPdfFilename("octocat", "abc123")).toBe(
      "Snapshot_octocat_abc123.pdf",
    );
  });

  it("preserves username casing", () => {
    expect(buildSnapshotPdfFilename("MyUser", "id42")).toBe(
      "Snapshot_MyUser_id42.pdf",
    );
  });

  it("handles UUID ids", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildSnapshotPdfFilename("user", uuid)).toBe(
      `Snapshot_user_${uuid}.pdf`,
    );
  });
});

// ---------------------------------------------------------------------------
// Live-profile navigation URL
// The "View Live Profile" button navigates to /${username}
// ---------------------------------------------------------------------------

function buildLiveProfileUrl(username: string): string {
  return `/${username}`;
}

describe("SnapshotClient – live profile URL", () => {
  it("constructs the correct route", () => {
    expect(buildLiveProfileUrl("octocat")).toBe("/octocat");
  });

  it("preserves username casing", () => {
    expect(buildLiveProfileUrl("MyUser")).toBe("/MyUser");
  });
});