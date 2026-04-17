import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { getUserByUsername, getLatestSelfScan } from "@/lib/db";
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
    try {
      const user = await getUserByUsername(username);
      if (user) {
        const scan = await getLatestSelfScan(user.id, username);
        if (scan) {
          score = scan.data.score;
          devType = scan.data.developer_type || "Developer";
        }
      }
    } catch {
      score = 0;
      devType = "Developer";
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
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (username.includes(".")) {
    notFound();
  }

  let initialScan: Awaited<ReturnType<typeof getLatestSelfScan>> = null;
  try {
    const user = await getUserByUsername(username);
    initialScan = user ? await getLatestSelfScan(user.id, username) : null;
  } catch {
    initialScan = null;
  }

  return (
    <ProfileClient
      username={username}
      initialData={
        initialScan
          ? ({
              ...initialScan.data,
              username,
            } as AnalysisResult)
          : undefined
      }
    />
  );
}
