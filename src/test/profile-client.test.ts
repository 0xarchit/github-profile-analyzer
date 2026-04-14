import { describe, it, expect } from "vitest";

// ─── Pure logic extracted from ProfileClient.tsx ──────────────────────────────
//
// These tests verify the business rules embedded in ProfileClient without
// requiring a DOM or React rendering environment.

// ---------------------------------------------------------------------------
// Username validation
// The component's useEffect runs this guard before making any API calls.
// ---------------------------------------------------------------------------

function isInvalidUsername(username: string | undefined | null): boolean {
  const safe = (username || "").toLowerCase();
  return (
    !username ||
    safe === "undefined" ||
    safe === "null" ||
    safe.trim() === ""
  );
}

describe("ProfileClient – username validation", () => {
  it("flags an empty string as invalid", () => {
    expect(isInvalidUsername("")).toBe(true);
  });

  it("flags the literal string 'undefined' as invalid", () => {
    expect(isInvalidUsername("undefined")).toBe(true);
  });

  it("flags the literal string 'UNDEFINED' (case-insensitive) as invalid", () => {
    expect(isInvalidUsername("UNDEFINED")).toBe(true);
  });

  it("flags the literal string 'null' as invalid", () => {
    expect(isInvalidUsername("null")).toBe(true);
  });

  it("flags the literal string 'NULL' (case-insensitive) as invalid", () => {
    expect(isInvalidUsername("NULL")).toBe(true);
  });

  it("flags undefined value as invalid", () => {
    expect(isInvalidUsername(undefined)).toBe(true);
  });

  it("flags null value as invalid", () => {
    expect(isInvalidUsername(null)).toBe(true);
  });

  it("accepts a normal GitHub username", () => {
    expect(isInvalidUsername("torvalds")).toBe(false);
  });

  it("accepts a username with numbers", () => {
    expect(isInvalidUsername("user123")).toBe(false);
  });

  it("accepts a username with hyphens", () => {
    expect(isInvalidUsername("my-name")).toBe(false);
  });

  it("accepts a single-character username", () => {
    expect(isInvalidUsername("a")).toBe(false);
  });

  it("accepts a username that contains 'null' as substring", () => {
    expect(isInvalidUsername("nulldev")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fetch URL construction
// fetchData builds the API URL based on `force` and `nosave` flags.
// ---------------------------------------------------------------------------

function buildAnalyzeUrl(
  username: string,
  force: boolean,
  nosave: boolean,
): string {
  const base = `/api/analyze?username=${username}`;
  return `${base}${force ? "&force=true" : ""}${nosave ? "&nosave=true" : ""}`;
}

describe("ProfileClient – analyze URL construction", () => {
  it("builds a base URL with no extra flags", () => {
    const url = buildAnalyzeUrl("octocat", false, false);
    expect(url).toBe("/api/analyze?username=octocat");
  });

  it("appends force=true when force is set", () => {
    const url = buildAnalyzeUrl("octocat", true, false);
    expect(url).toBe("/api/analyze?username=octocat&force=true");
  });

  it("appends nosave=true when nosave is set", () => {
    const url = buildAnalyzeUrl("octocat", false, true);
    expect(url).toBe("/api/analyze?username=octocat&nosave=true");
  });

  it("appends both flags when both are set", () => {
    const url = buildAnalyzeUrl("octocat", true, true);
    expect(url).toBe("/api/analyze?username=octocat&force=true&nosave=true");
  });

  it("preserves the username verbatim in the URL", () => {
    const url = buildAnalyzeUrl("My-Special-User", false, false);
    expect(url).toContain("username=My-Special-User");
  });
});

// ---------------------------------------------------------------------------
// Error state determination
// The component renders different titles based on the error code.
// ---------------------------------------------------------------------------

function resolveErrorTitle(error: string): string {
  if (error === "NEURAL_QUOTA_EXCEEDED") return "Quota Depleted";
  if (error === "REMOTE_SATURATION") return "Node Saturated";
  return "Scan Failure";
}

function resolveErrorMessage(error: string): string {
  if (error === "NEURAL_QUOTA_EXCEEDED")
    return "Your guest scan permit has expired. Integrate GitHub for unlimited protocol access.";
  if (error === "REMOTE_SATURATION")
    return "GitHub API nodes are cooling down. This protocol will resume shortly.";
  return error;
}

describe("ProfileClient – error state logic", () => {
  describe("error title resolution", () => {
    it("maps NEURAL_QUOTA_EXCEEDED to 'Quota Depleted'", () => {
      expect(resolveErrorTitle("NEURAL_QUOTA_EXCEEDED")).toBe("Quota Depleted");
    });

    it("maps REMOTE_SATURATION to 'Node Saturated'", () => {
      expect(resolveErrorTitle("REMOTE_SATURATION")).toBe("Node Saturated");
    });

    it("maps any other error to 'Scan Failure'", () => {
      expect(resolveErrorTitle("NETWORK_FAILURE")).toBe("Scan Failure");
    });

    it("maps empty string to 'Scan Failure'", () => {
      expect(resolveErrorTitle("")).toBe("Scan Failure");
    });

    it("maps INVALID_ID_SPEC to 'Scan Failure'", () => {
      expect(resolveErrorTitle("INVALID_ID_SPEC")).toBe("Scan Failure");
    });
  });

  describe("error message resolution", () => {
    it("returns quota-expired message for NEURAL_QUOTA_EXCEEDED", () => {
      const msg = resolveErrorMessage("NEURAL_QUOTA_EXCEEDED");
      expect(msg).toContain("guest scan permit");
    });

    it("returns cooling-down message for REMOTE_SATURATION", () => {
      const msg = resolveErrorMessage("REMOTE_SATURATION");
      expect(msg).toContain("cooling down");
    });

    it("returns the raw error string for unknown errors", () => {
      expect(resolveErrorMessage("Something went wrong")).toBe(
        "Something went wrong",
      );
    });

    it("returns the raw error string for NETWORK_FAILURE", () => {
      expect(resolveErrorMessage("NETWORK_FAILURE")).toBe("NETWORK_FAILURE");
    });
  });
});

// ---------------------------------------------------------------------------
// Status badge logic
// isLocked / isHistorical determine which UI badge and status text is shown.
// ---------------------------------------------------------------------------

function resolveStatusText(
  isLocked?: boolean,
  isHistorical?: boolean,
): string {
  if (isLocked) return "Static snapshot";
  if (isHistorical) return "Archived Analysis";
  return "Dynamic Edge calculation";
}

function resolveStatusBadge(
  isLocked?: boolean,
  isHistorical?: boolean,
): string {
  if (isLocked) return "Protocol Locked";
  if (isHistorical) return "Historical Snapshot";
  return "";
}

describe("ProfileClient – status badge / text logic", () => {
  it("shows 'Static snapshot' when isLocked is true", () => {
    expect(resolveStatusText(true, false)).toBe("Static snapshot");
  });

  it("shows 'Archived Analysis' when isHistorical is true", () => {
    expect(resolveStatusText(false, true)).toBe("Archived Analysis");
  });

  it("shows 'Dynamic Edge calculation' when neither flag is set", () => {
    expect(resolveStatusText(false, false)).toBe("Dynamic Edge calculation");
  });

  it("prefers isLocked over isHistorical when both are true", () => {
    expect(resolveStatusText(true, true)).toBe("Static snapshot");
  });

  it("returns 'Protocol Locked' badge text when isLocked", () => {
    expect(resolveStatusBadge(true, false)).toBe("Protocol Locked");
  });

  it("returns 'Historical Snapshot' badge text when isHistorical", () => {
    expect(resolveStatusBadge(false, true)).toBe("Historical Snapshot");
  });

  it("returns empty string when no special flags", () => {
    expect(resolveStatusBadge(false, false)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Owner-based button visibility logic
// The "Force Refresh" button is shown when the viewer is the owner, OR when
// the profile is neither locked nor historical.
// ---------------------------------------------------------------------------

function showForceRefresh(
  isOwner: boolean,
  isLocked?: boolean,
  isHistorical?: boolean,
): boolean {
  return isOwner || (!isLocked && !isHistorical);
}

function showLatestAnalysis(isLocked?: boolean, isHistorical?: boolean): boolean {
  return !!(isLocked || isHistorical);
}

describe("ProfileClient – button visibility logic", () => {
  describe("Force Refresh button", () => {
    it("visible when user is owner (even if locked)", () => {
      expect(showForceRefresh(true, true, false)).toBe(true);
    });

    it("visible when profile is neither locked nor historical", () => {
      expect(showForceRefresh(false, false, false)).toBe(true);
    });

    it("hidden when not owner and profile is locked", () => {
      expect(showForceRefresh(false, true, false)).toBe(false);
    });

    it("hidden when not owner and profile is historical", () => {
      expect(showForceRefresh(false, false, true)).toBe(false);
    });
  });

  describe("See Latest Analysis button", () => {
    it("shown when profile is locked", () => {
      expect(showLatestAnalysis(true, false)).toBe(true);
    });

    it("shown when profile is historical", () => {
      expect(showLatestAnalysis(false, true)).toBe(true);
    });

    it("hidden when profile is neither locked nor historical", () => {
      expect(showLatestAnalysis(false, false)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// PDF filename construction
// The PDF is exported as `Analysis_${username}.pdf`.
// ---------------------------------------------------------------------------

function buildProfilePdfFilename(username: string): string {
  return `Analysis_${username}.pdf`;
}

describe("ProfileClient – PDF filename construction", () => {
  it("produces correct filename format", () => {
    expect(buildProfilePdfFilename("octocat")).toBe("Analysis_octocat.pdf");
  });

  it("preserves username casing", () => {
    expect(buildProfilePdfFilename("MyUser")).toBe("Analysis_MyUser.pdf");
  });

  it("handles usernames with hyphens", () => {
    expect(buildProfilePdfFilename("my-user")).toBe("Analysis_my-user.pdf");
  });
});

// ---------------------------------------------------------------------------
// Repository sorting logic
// repos are sorted by stars descending and only top-6 are shown.
// ---------------------------------------------------------------------------

interface RepoEntry {
  stars?: number;
  description?: string | null;
}

function sortAndSliceRepos(
  repos: Record<string, RepoEntry>,
  limit: number,
): [string, RepoEntry][] {
  return Object.entries(repos)
    .sort(([, a], [, b]) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, limit);
}

describe("ProfileClient – repository display logic", () => {
  it("sorts repositories by stars descending", () => {
    const repos = {
      low: { stars: 1 },
      high: { stars: 100 },
      mid: { stars: 50 },
    };
    const sorted = sortAndSliceRepos(repos, 10);
    expect(sorted[0][0]).toBe("high");
    expect(sorted[1][0]).toBe("mid");
    expect(sorted[2][0]).toBe("low");
  });

  it("limits results to the specified count", () => {
    const repos: Record<string, RepoEntry> = {};
    for (let i = 0; i < 10; i++) repos[`repo${i}`] = { stars: i };
    const result = sortAndSliceRepos(repos, 6);
    expect(result).toHaveLength(6);
  });

  it("handles repos with undefined stars (treated as 0)", () => {
    const repos = { noStars: {}, withStars: { stars: 5 } };
    const sorted = sortAndSliceRepos(repos, 10);
    expect(sorted[0][0]).toBe("withStars");
  });

  it("returns all repos when fewer than limit", () => {
    const repos = { a: { stars: 10 }, b: { stars: 5 } };
    const result = sortAndSliceRepos(repos, 6);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty repos object", () => {
    const result = sortAndSliceRepos({}, 6);
    expect(result).toHaveLength(0);
  });
});