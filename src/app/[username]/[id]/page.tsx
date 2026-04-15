import { Metadata } from "next";
import { SnapshotClient } from "./SnapshotClient";
import { getScanById } from "@/lib/db";

export const runtime = "edge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; id: string }>;
}): Promise<Metadata> {
  const { username, id } = await params;
  const scan = await getScanById(id);
  let score = 0;
  let devType = "Developer";

  if (scan) {
    score = scan.data.score;
    devType = scan.data.developer_type || "Developer";
  }

  const title = `Archived Protocol: ${username} | ${score}/100 GitScore`;
  const description = `Historical snapshot of ${username}'s engineering protocol from ${new Date(scan?.created_at || Date.now()).toLocaleDateString()}. Rank: ${score}/100, Type: ${devType}. View their technical trajectory over time.`;

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
  return <SnapshotClient username={username} id={id} />;
}
