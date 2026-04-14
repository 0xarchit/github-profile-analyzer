import { Metadata } from 'next';
import { ProfileClient } from './ProfileClient';
import { getUserByUsername, getLatestSelfScan } from '@/lib/db';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const user = await getUserByUsername(username);
  let score = 0;
  let devType = 'Developer';

  if (user) {
    const scan = await getLatestSelfScan(user.id, username);
    if (scan) {
      score = scan.data.score;
      devType = scan.data.developer_type || 'Developer';
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
      card: 'summary_large_image',
      title,
      description,
      images: [`/api/og?username=${username}&score=${score}`],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileClient username={username} />;
}
