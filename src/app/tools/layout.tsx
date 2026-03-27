import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Tools',
  description: 'Explore registered on-chain tools in the Solana Agent Protocol — invocation counts, categories, HTTP methods, and tool descriptors.',
  openGraph: {
    title: 'Tools | Synapse Explorer',
    description: 'Explore registered on-chain tools in the SAP network — invocation counts, categories, and descriptors.',
    images: [{ url: `${SITE_URL}/api/og?type=page&title=Tools&desc=Explore+registered+on-chain+tools+%E2%80%94+invocation+counts%2C+categories%2C+and+descriptors.`, width: 1200, height: 630 }],
  },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
