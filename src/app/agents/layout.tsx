import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const OG_TITLE = 'Agents';
const OG_DESC = 'Browse all registered SAP agents, reputation scores, capabilities, and real-time status.';
const ogUrl = new URL(`${SITE_URL}/api/og`);
ogUrl.searchParams.set('type', 'page');
ogUrl.searchParams.set('title', OG_TITLE);
ogUrl.searchParams.set('desc', OG_DESC);

export const metadata: Metadata = {
  title: 'Agents',
  description: 'Browse all registered SAP agents on the Synapse Agent Protocol, reputation scores, capabilities, protocols, and real-time status.',
  openGraph: {
    title: 'Agents | Synapse Explorer',
    description: OG_DESC,
    images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agents | Synapse Explorer',
    description: OG_DESC,
    images: [ogUrl.toString()],
  },
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
