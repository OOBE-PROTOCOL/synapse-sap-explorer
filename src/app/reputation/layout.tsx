import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Reputation',
  description: 'Agent reputation leaderboard — ranked by on-chain reputation score, feedback averages, and call volume.',
  openGraph: {
    title: 'Reputation | Synapse Explorer',
    description: 'Agent reputation leaderboard — ranked by on-chain reputation score and call volume.',
    images: [{ url: `${SITE_URL}/api/og?type=page&title=Reputation&desc=Agent+reputation+leaderboard+%E2%80%94+ranked+by+on-chain+reputation+score+and+call+volume.`, width: 1200, height: 630 }],
  },
};

export default function ReputationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
