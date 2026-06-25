import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";
import { getProfileSummary, checkStarStatus } from "@/lib/github";
import { getAIAnalysis } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { getCachedData, setCachedData } from "@/lib/redis";
import {
  getUserByUsername,
  saveScan,
  getScanById,
  getUserByGithubId,
  getLatestSelfScan,
} from "@/lib/db";

// Mock all external modules to avoid actual network/DB calls
vi.mock("@/lib/github", () => ({
  getProfileSummary: vi.fn(),
  checkStarStatus: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getAIAnalysis: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getUserByUsername: vi.fn(),
  saveScan: vi.fn(),
  getScanById: vi.fn(),
  getUserByGithubId: vi.fn(),
  getLatestSelfScan: vi.fn(),
}));

vi.mock("@/lib/telegram-alert", () => ({
  TelegramAlertCollector: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("analyze route access-control & routing logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("1. Unstarred guest -> 403 Star required", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getUserByUsername).mockResolvedValue(null);
    vi.mocked(checkStarStatus).mockResolvedValue(false);

    const req = new NextRequest("http://localhost/api/analyze?username=targetuser");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: "Star required",
      showPopup: true,
      isStarred: false,
      message: "Support the analyzer to unlock high-fidelity shards.",
    });
  });

  it("2. Owner force-refreshing own profile -> allowed & calls saveScan", async () => {
    const mockUser = { id: "user-123", username: "targetuser", settings: { keep_history: true } };
    vi.mocked(getSession).mockResolvedValue({
      githubId: 111,
      username: "targetuser",
      accessToken: "gho_owner_token",
      avatarUrl: "",
    });
    vi.mocked(getUserByGithubId).mockResolvedValue(mockUser);
    vi.mocked(getUserByUsername).mockResolvedValue(mockUser);

    vi.mocked(getProfileSummary).mockResolvedValue({
      original_repos: {},
      username: "targetuser",
    } as any);

    vi.mocked(getAIAnalysis).mockResolvedValue({
      score: 85,
      developer_type: "Backend Engineer",
      segments: [],
    } as any);

    const req = new NextRequest("http://localhost/api/analyze?username=targetuser&force=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(85);
    expect(body.username).toBe("targetuser");

    // Owner should trigger database save
    expect(saveScan).toHaveBeenCalledWith("user-123", "targetuser", expect.any(Object));
  });

  it("3. Non-owner force-refreshing registered user -> 403 ACCESS_DENIED", async () => {
    const mockViewer = { id: "user-viewer", username: "vieweruser" };
    const mockTarget = { id: "user-target", username: "targetuser" };

    vi.mocked(getSession).mockResolvedValue({
      githubId: 222,
      username: "vieweruser",
      accessToken: "gho_viewer_token",
      avatarUrl: "",
    });
    vi.mocked(getUserByGithubId).mockResolvedValue(mockViewer);
    vi.mocked(getUserByUsername).mockResolvedValue(mockTarget);

    const req = new NextRequest("http://localhost/api/analyze?username=targetuser&force=true");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: "ACCESS_DENIED",
      message: "You are not allowed to override or force-update another registered user's profile.",
    });
  });

  it("4. Private profile, no principal scan, non-owner -> 403 ACCESS_DENIED", async () => {
    const mockViewer = { id: "user-viewer", username: "vieweruser" };
    const mockTarget = {
      id: "user-target",
      username: "targetuser",
      settings: { public_scans: false, primary_scan_id: null },
    };

    vi.mocked(getSession).mockResolvedValue({
      githubId: 222,
      username: "vieweruser",
      accessToken: "gho_viewer_token",
      avatarUrl: "",
    });
    vi.mocked(getUserByGithubId).mockResolvedValue(mockViewer);
    vi.mocked(getUserByUsername).mockResolvedValue(mockTarget);
    vi.mocked(checkStarStatus).mockResolvedValue(true); // starred but private

    const req = new NextRequest("http://localhost/api/analyze?username=targetuser");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: "ACCESS_DENIED",
      message: "This profile is private.",
    });
  });

  it("5. Public profile, non-owner -> proceeds to analysis but does not saveScan", async () => {
    const mockViewer = { id: "user-viewer", username: "vieweruser" };
    const mockTarget = {
      id: "user-target",
      username: "targetuser",
      settings: { public_scans: true, primary_scan_id: null },
    };

    vi.mocked(getSession).mockResolvedValue({
      githubId: 222,
      username: "vieweruser",
      accessToken: "gho_viewer_token",
      avatarUrl: "",
    });
    vi.mocked(getUserByGithubId).mockResolvedValue(mockViewer);
    vi.mocked(getUserByUsername).mockResolvedValue(mockTarget);
    vi.mocked(checkStarStatus).mockResolvedValue(true);

    vi.mocked(getProfileSummary).mockResolvedValue({
      original_repos: {},
      username: "targetuser",
    } as any);

    vi.mocked(getAIAnalysis).mockResolvedValue({
      score: 92,
      developer_type: "Frontend Specialist",
      segments: [],
    } as any);

    const req = new NextRequest("http://localhost/api/analyze?username=targetuser");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(92);

    // Should not save scan to DB since viewer is not the owner
    expect(saveScan).not.toHaveBeenCalled();
  });

  it("6. Cache hit -> returns cached data without calling GitHub/AI APIs", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getUserByUsername).mockResolvedValue(null);
    vi.mocked(checkStarStatus).mockResolvedValue(true);

    const cachedData = {
      username: "targetuser",
      score: 95,
      developer_type: "Architect",
      isStarred: true,
      cachedAt: "2026-06-25T12:00:00Z",
    };
    vi.mocked(getCachedData).mockResolvedValue(cachedData);

    const req = new NextRequest("http://localhost/api/analyze?username=targetuser");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(cachedData);

    // APIs should not be called
    expect(getProfileSummary).not.toHaveBeenCalled();
    expect(getAIAnalysis).not.toHaveBeenCalled();
  });
});
