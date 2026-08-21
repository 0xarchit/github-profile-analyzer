import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { DeterministicProfileClient } from "@/components/deterministic";
import {
  getUserByUsername,
  getLatestSelfScan,
  getScanById,
  getLatestDeterministicScan,
  getDeterministicScanById,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AnalysisResult } from "@/types";
import type { StoredEngineResult } from "@/lib/deterministic";

export const runtime = "edge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  let score = 0;
  let devType = "Developer";

  if (!username.includes(".")) {
    const user = await getUserByUsername(username);
    if (user) {
      const session = await getSession();
      const isOwner =
        session?.username?.toLowerCase() === username.toLowerCase();

      // Check deterministic scans first
      let deterministicScan = null;
      if (user.settings?.primary_scan_id) {
        deterministicScan = await getDeterministicScanById(user.settings.primary_scan_id);
      }
      if (!deterministicScan && (isOwner || user.settings?.public_scans)) {
        deterministicScan = await getLatestDeterministicScan(user.id, username);
      }

      if (deterministicScan) {
        score = deterministicScan.overall_score;
        devType = deterministicScan.archetype || "Developer";
      } else {
        // Fallback to legacy scan if no deterministic scan found
        let scan = null;
        if (user.settings?.primary_scan_id) {
          scan = await getScanById(user.settings.primary_scan_id);
        }
        if (!scan && (isOwner || user.settings?.public_scans)) {
          scan = await getLatestSelfScan(user.id, username);
        }
        if (!scan && !isOwner && !user.settings?.public_scans) {
          notFound();
        }

        if (scan) {
          score = scan.data.score;
          devType = scan.data.developer_type || "Developer";
        }
      }
    }
  }

  const title = `${username}'s Engineering Protocol | ${score}/100 GitScore`;
  const description = `${username} is a ${devType} undergoing diagnostic analysis on GitScore. View their code shards, commit velocity, and technical trajectory.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/api/og?username=${username}&score=${score}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og?username=${username}&score=${score}`],
    },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ engine?: string }>;
}) {
  const { username } = await params;
  const { engine } = await searchParams;
  if (username.includes(".")) {
    notFound();
  }

  // Determine engine mode: deterministic is default, only accept "legacy" or "deterministic"
  const engineMode = engine === "legacy" ? "legacy" : "deterministic";

  const user = await getUserByUsername(username);
  let isOwner = false;
  if (user) {
    const session = await getSession();
    isOwner = session?.username?.toLowerCase() === username.toLowerCase();
  }

  if (engineMode === "deterministic") {
    let initialDeterministicData: StoredEngineResult | null = null;
    if (user) {
      const isLocked = user.settings?.profile_locked ?? true;
      const publicScans = user.settings?.public_scans ?? false;
      const hasPrincipal = Boolean(user.settings?.primary_scan_id);

      if (!isOwner && !publicScans && !hasPrincipal) {
        notFound();
      }

      if (isLocked && !isOwner) {
        const savedScan = await getLatestDeterministicScan(user.id, username);
        if (savedScan?.data) {
          initialDeterministicData = {
            ...(savedScan.data as StoredEngineResult),
            isHistorical: true,
            isLocked: true,
            snapshotId: savedScan.id,
          };
        } else {
          // Locked profile viewed by non-owner with no saved scan is not accessible
          notFound();
        }
      }
    }

    return (
      <DeterministicProfileClient
        username={username}
        initialData={initialDeterministicData}
      />
    );
  }

  let scan = null;
  if (user) {
    if (user.settings?.primary_scan_id) {
      scan = await getScanById(user.settings.primary_scan_id);
    }
    if (!scan && (isOwner || user.settings?.public_scans)) {
      scan = await getLatestSelfScan(user.id, username);
    }
    if (!scan && !isOwner && !user.settings?.public_scans) {
      notFound();
    }
  }

  const initialData: AnalysisResult | undefined = scan
    ? ({
        ...scan.data,
        username,
        snapshotId: scan.id,
        isHistorical: true,
        isLocked: user?.settings?.profile_locked ?? false,
      } as AnalysisResult)
    : undefined;

  return (
    <ProfileClient
      username={username}
      initialData={initialData}
      engineMode={engineMode}
    />
  );
}
