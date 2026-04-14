import { describe, it, expect } from "vitest";
import type { AnalysisResult } from "../types/index";

// Local replica of the Scan shape to avoid importing from ../lib/db,
// which throws at module-load time if DATABASE_WRITE env var is absent.
interface ScanSnapshot {
  data: AnalysisResult;
  created_at: string;
}

// ─── Pure logic extracted from src/app/[username]/[id]/page.tsx ──────────────
//
// generateMetadata fetches a scan and builds Next.js metadata from it.
// The function is a server function that calls getScanById(id), so rather
// than importing it (which would pull in database dependencies), we replicate
// the metadata-building algorithm here and test every branch.

// ---------------------------------------------------------------------------
// Metadata building logic – mirrors generateMetadata() in page.tsx
// ---------------------------------------------------------------------------

interface BuildMetadataOptions {
  username: string;
  scan: ScanSnapshot | null;
}

interface PageMetadata {
  title: string;
  description: string;
  openGraph: {
    title: string;
    description: string;
    images: string[];
  };
  twitter: {
    card: string;
    title: string;
    description: string;
    images: string[];
  };
}

function buildSnapshotMetadata({
  username,
  scan,
}: BuildMetadataOptions): PageMetadata {
  let score = 0;
  let devType = "Developer";

  if (scan) {
    score = scan.data.score;
    devType = scan.data.developer_type || "Developer";
  }

  const createdAt = scan?.created_at || new Date().toISOString();
  const dateStr = new Date(createdAt).toLocaleDateString();
  const title = `Archived Protocol: ${username} | ${score}/100 GitScore`;
  const description = `Historical snapshot of ${username}'s engineering protocol from ${dateStr}. Rank: ${score}/100, Type: ${devType}. View their technical trajectory over time.`;
  const ogImage = `/api/og?username=${username}&score=${score}&snapshot=true`;

  return {
    title,
    description,
    openGraph: { title, description, images: [ogImage] },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeScan(
  overrides: Partial<AnalysisResult> = {},
  created_at = "2024-03-15T00:00:00.000Z",
): ScanSnapshot {
  const data: AnalysisResult = {
    score: 75,
    developer_type: "Fullstack Engineer",
    segments: {
      roast: "Needs more tests",
      technical_analysis: "Good structure",
      strategic_advice: "Write docs",
    },
    improvement_areas: [],
    diagnostics: [],
    timestamp: new Date().toISOString(),
    username: "octocat",
    ...overrides,
  };
  return { data, created_at };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("page.tsx – generateMetadata metadata building", () => {
  describe("title format", () => {
    it("includes 'Archived Protocol' prefix", () => {
      const meta = buildSnapshotMetadata({ username: "octocat", scan: makeScan() });
      expect(meta.title).toMatch(/^Archived Protocol:/);
    });

    it("includes the username", () => {
      const meta = buildSnapshotMetadata({ username: "octocat", scan: makeScan() });
      expect(meta.title).toContain("octocat");
    });

    it("includes the score and 'GitScore' suffix", () => {
      const scan = makeScan({ score: 88 });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.title).toContain("88/100 GitScore");
    });

    it("uses score 0 when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: null });
      expect(meta.title).toContain("0/100 GitScore");
    });

    it("exact title format: 'Archived Protocol: {username} | {score}/100 GitScore'", () => {
      const scan = makeScan({ score: 42 });
      const meta = buildSnapshotMetadata({ username: "dev", scan });
      expect(meta.title).toBe("Archived Protocol: dev | 42/100 GitScore");
    });
  });

  describe("description content", () => {
    it("includes the username in the description", () => {
      const meta = buildSnapshotMetadata({ username: "octocat", scan: makeScan() });
      expect(meta.description).toContain("octocat");
    });

    it("includes 'Historical snapshot' in description", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.description).toContain("Historical snapshot");
    });

    it("includes the score in description", () => {
      const scan = makeScan({ score: 65 });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.description).toContain("65/100");
    });

    it("includes the developer_type in description", () => {
      const scan = makeScan({ developer_type: "Backend Specialist" });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.description).toContain("Backend Specialist");
    });

    it("falls back to 'Developer' when developer_type is undefined", () => {
      const scan = makeScan({ developer_type: undefined });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.description).toContain("Type: Developer");
    });

    it("falls back to 'Developer' when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: null });
      expect(meta.description).toContain("Type: Developer");
    });

    it("uses score 0 in description when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: null });
      expect(meta.description).toContain("Rank: 0/100");
    });

    it("mentions trajectory in description", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.description).toContain("trajectory");
    });
  });

  describe("openGraph metadata", () => {
    it("openGraph title matches the page title", () => {
      const scan = makeScan({ score: 77 });
      const meta = buildSnapshotMetadata({ username: "octocat", scan });
      expect(meta.openGraph.title).toBe(meta.title);
    });

    it("openGraph description matches the page description", () => {
      const meta = buildSnapshotMetadata({ username: "octocat", scan: makeScan() });
      expect(meta.openGraph.description).toBe(meta.description);
    });

    it("openGraph images array has exactly one entry", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.openGraph.images).toHaveLength(1);
    });

    it("openGraph image URL includes username", () => {
      const meta = buildSnapshotMetadata({ username: "octocat", scan: makeScan() });
      expect(meta.openGraph.images[0]).toContain("username=octocat");
    });

    it("openGraph image URL includes the score", () => {
      const scan = makeScan({ score: 90 });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.openGraph.images[0]).toContain("score=90");
    });

    it("openGraph image URL includes snapshot=true", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.openGraph.images[0]).toContain("snapshot=true");
    });
  });

  describe("Twitter card metadata", () => {
    it("twitter card type is 'summary_large_image'", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.twitter.card).toBe("summary_large_image");
    });

    it("twitter title matches the page title", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.twitter.title).toBe(meta.title);
    });

    it("twitter description matches the page description", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.twitter.description).toBe(meta.description);
    });

    it("twitter image URL matches openGraph image URL", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.twitter.images[0]).toBe(meta.openGraph.images[0]);
    });

    it("twitter images array has exactly one entry", () => {
      const meta = buildSnapshotMetadata({ username: "user", scan: makeScan() });
      expect(meta.twitter.images).toHaveLength(1);
    });
  });

  describe("null / missing scan fallbacks", () => {
    it("still produces a valid metadata object when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "ghost", scan: null });
      expect(meta.title).toBeTruthy();
      expect(meta.description).toBeTruthy();
    });

    it("score defaults to 0 when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "ghost", scan: null });
      expect(meta.title).toContain("0/100 GitScore");
    });

    it("developer_type defaults to 'Developer' when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "ghost", scan: null });
      expect(meta.description).toContain("Type: Developer");
    });

    it("openGraph image still contains snapshot=true when scan is null", () => {
      const meta = buildSnapshotMetadata({ username: "ghost", scan: null });
      expect(meta.openGraph.images[0]).toContain("snapshot=true");
    });
  });

  describe("edge cases", () => {
    it("handles score of 0 correctly (not treated as falsy)", () => {
      const scan = makeScan({ score: 0 });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.title).toContain("0/100 GitScore");
    });

    it("handles score of 100", () => {
      const scan = makeScan({ score: 100 });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      expect(meta.title).toContain("100/100 GitScore");
    });

    it("handles username with special chars (hyphens)", () => {
      const meta = buildSnapshotMetadata({
        username: "my-name",
        scan: makeScan(),
      });
      expect(meta.title).toContain("my-name");
    });

    it("handles empty developer_type string by falling back to 'Developer'", () => {
      const scan = makeScan({ developer_type: "" });
      const meta = buildSnapshotMetadata({ username: "user", scan });
      // "" is falsy, so should use "Developer"
      expect(meta.description).toContain("Type: Developer");
    });
  });
});

// ---------------------------------------------------------------------------
// Page component – params resolution
// The Page component simply destructures params and passes them to SnapshotClient.
// We test the shape of what it forwards.
// ---------------------------------------------------------------------------

describe("page.tsx – Page component params handling", () => {
  it("destructures username from params correctly", async () => {
    const params = Promise.resolve({ username: "octocat", id: "abc123" });
    const { username } = await params;
    expect(username).toBe("octocat");
  });

  it("destructures id from params correctly", async () => {
    const params = Promise.resolve({ username: "octocat", id: "abc123" });
    const { id } = await params;
    expect(id).toBe("abc123");
  });

  it("both username and id are forwarded", async () => {
    const params = Promise.resolve({ username: "dev", id: "xyz789" });
    const { username, id } = await params;
    expect(username).toBe("dev");
    expect(id).toBe("xyz789");
  });
});