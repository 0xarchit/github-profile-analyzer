import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnapshotClient } from "./SnapshotClient";
import { DeterministicProfileClient } from "@/components/deterministic";
import {
  getScanById,
  getUserByUsername,
  getDeterministicScanById,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AnalysisResult } from "@/types";
import type { StoredEngineResult } from "@/lib/deterministic";

export const runtime = "edge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; id: string }>;
}): Promise<Metadata> {
  const { username, id } = await params;
  const targetUser = await getUserByUsername(username);
  if (!targetUser) notFound();

  const deterministicScan = await getDeterministicScanById(id);
  const scan = deterministicScan ? null : await getScanById(id);

  if (!deterministicScan && !scan) notFound();

  const scanUserId = deterministicScan
    ? deterministicScan.user_id
    : scan!.user_id;
  if (scanUserId !== targetUser.id) notFound();

  const session = await getSession();
  const isOwner = session?.username?.toLowerCase() === username.toLowerCase();
  const isPublic = targetUser.settings?.public_scans ?? false;

  if (!isOwner && !isPublic) {
    notFound();
  }

  let score = 0;
  let devType = "Developer";
  let createdAt = Date.now();

  if (deterministicScan) {
    score = deterministicScan.overall_score;
    devType = deterministicScan.archetype || "Developer";
    createdAt = new Date(deterministicScan.created_at).getTime();
  } else if (scan) {
    score = scan.data.score;
    devType = scan.data.developer_type || "Developer";
    createdAt = new Date(scan.created_at).getTime();
  }

  const title = `Archived Protocol: ${username} | ${score}/100 GitScore`;
  const description = `Historical snapshot of ${username}'s engineering protocol from ${new Date(createdAt).toLocaleDateString()}. Rank: ${score}/100, Type: ${devType}. View their technical trajectory over time.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/api/og?username=${username}&score=${score}&snapshot=true`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og?username=${username}&score=${score}&snapshot=true`],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ username: string; id: string }>;
}) {
  const { username, id } = await params;
  const targetUser = await getUserByUsername(username);
  if (!targetUser) {
    notFound();
  }

  const deterministicScan = await getDeterministicScanById(id);
  const scan = deterministicScan ? null : await getScanById(id);

  if (!deterministicScan && !scan) {
    notFound();
  }

  const scanUserId = deterministicScan
    ? deterministicScan.user_id
    : scan!.user_id;
  if (scanUserId !== targetUser.id) {
    notFound();
  }

  const session = await getSession();
  const isOwner = session?.username?.toLowerCase() === username.toLowerCase();
  const isPublic = targetUser.settings?.public_scans ?? false;

  if (!isOwner && !isPublic) {
    notFound();
  }

  if (deterministicScan) {
    const initialDeterministicData: StoredEngineResult = {
      ...(deterministicScan.data as StoredEngineResult),
      isHistorical: true,
      isLocked: true,
      snapshotId: deterministicScan.id,
    };

    return (
      <DeterministicProfileClient
        username={username}
        initialData={initialDeterministicData}
      />
    );
  }

  const initialData: AnalysisResult = {
    ...scan!.data,
    username: scan!.username,
    cachedAt: scan!.created_at,
    snapshotId: scan!.id,
    isHistorical: true,
    isLocked: true,
  } as AnalysisResult;

  return (
    <SnapshotClient
      username={username}
      id={id}
      initialData={initialData}
    />
  );
}
