import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnapshotClient } from "./SnapshotClient";
import { getScanById, getUserByUsername } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AnalysisResult } from "@/types";

export const runtime = "edge";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ username: string; id: string }>;
}): Promise<Metadata> {
	const { username, id } = await params;
	const scan = await getScanById(id);
	if (!scan) notFound();

	const targetUser = await getUserByUsername(username);
	if (!targetUser) notFound();

	// Ensure scan belongs to this user
	if (scan.user_id !== targetUser.id) notFound();

	const session = await getSession();
	const isOwner = session?.username?.toLowerCase() === username.toLowerCase();
	const isPublic = targetUser.settings?.public_scans ?? false;

	if (!isOwner && !isPublic) {
		notFound();
	}

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
	const scan = await getScanById(id);

	if (!scan) {
		notFound();
	}

	const targetUser = await getUserByUsername(username);
	if (!targetUser) {
		notFound();
	}

	// Ensure scan belongs to this user
	if (scan.user_id !== targetUser.id) {
		notFound();
	}

	const session = await getSession();
	const isOwner = session?.username?.toLowerCase() === username.toLowerCase();
	const isPublic = targetUser.settings?.public_scans ?? false;

	if (!isOwner && !isPublic) {
		notFound();
	}

	const initialData: AnalysisResult = {
		...scan.data,
		username: scan.username,
		cachedAt: scan.created_at,
		snapshotId: scan.id,
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
