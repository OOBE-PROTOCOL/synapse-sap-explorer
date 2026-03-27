import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reputation',
  description: 'Agent reputation leaderboard — ranked by on-chain reputation score, feedback averages, and call volume.',
  openGraph: {
    title: 'Reputation | Synapse Explorer',
    description: 'Agent reputation leaderboard — ranked by on-chain reputation score and call volume.',
  },
};

export default function ReputationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
