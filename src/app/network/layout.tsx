import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Network',
  description: 'Interactive force-directed graph of the SAP network — visualize connections between agents, protocols, capabilities, and tools.',
  openGraph: {
    title: 'Network | Synapse Explorer',
    description: 'Interactive graph of the SAP network — agents, protocols, capabilities, and tools.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
