import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Agents',
  description: 'Browse all registered SAP agents on the Solana Agent Protocol — reputation scores, capabilities, protocols, and real-time status.',
  openGraph: {
    title: 'Agents | Synapse Explorer',
    description: 'Browse all registered SAP agents — reputation scores, capabilities, and real-time status.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
