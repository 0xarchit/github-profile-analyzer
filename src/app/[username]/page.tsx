import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { getUserByUsername, getLatestSelfScan, getScanById } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AnalysisResult } from "@/types";

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

      let scan = null;
      if (user.settings?.primary_scan_id) {
        scan = await getScanById(user.settings.primary_scan_id);
      }
      if (!scan && (isOwner || user.settings?.public_scans)) {
        scan = await getLatestSelfScan(user.id, username);
      }
      // If still no scan and not owner and public_scans off -> private
      if (!scan && !isOwner && !user.settings?.public_scans) {
        notFound();
      }

      if (scan) {
        score = scan.data.score;
        devType = scan.data.developer_type || "Developer";
      }
    }
    // If no user (unregistered), we still allow metadata (score remains 0)
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
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (username.includes(".")) {
    notFound();
  }

  const user = await getUserByUsername(username);
  let isOwner = false;
  if (user) {
    const session = await getSession();
    isOwner = session?.username?.toLowerCase() === username.toLowerCase();
  }

  let scan = null;
  if (user) {
    if (user.settings?.primary_scan_id) {
      scan = await getScanById(user.settings.primary_scan_id);
    }
    if (!scan && (isOwner || user.settings?.public_scans)) {
      scan = await getLatestSelfScan(user.id, username);
    }
    // If still no scan and not owner and public_scans off -> private profile
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

  return <ProfileClient username={username} initialData={initialData} />;
}
