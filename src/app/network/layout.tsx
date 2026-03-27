import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Network',
  description: 'Interactive force-directed graph of the SAP network — visualize connections between agents, protocols, capabilities, and tools.',
  openGraph: {
    title: 'Network | Synapse Explorer',
    description: 'Interactive graph of the SAP network — agents, protocols, capabilities, and tools.',
    images: [{ url: `${SITE_URL}/api/og?type=page&title=Network&desc=Interactive+graph+of+the+SAP+network+%E2%80%94+agents%2C+protocols%2C+capabilities%2C+and+tools.`, width: 1200, height: 630 }],
  },
};

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
