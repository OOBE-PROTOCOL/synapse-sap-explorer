import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const OG_TITLE = 'Protocols';
const OG_DESC = 'Browse protocols in the SAP network — agent adoption, capability mapping, and analytics.';
const ogUrl = new URL(`${SITE_URL}/api/og`);
ogUrl.searchParams.set('type', 'page');
ogUrl.searchParams.set('title', OG_TITLE);
ogUrl.searchParams.set('desc', OG_DESC);

export const metadata: Metadata = {
  title: 'Protocols',
  description: 'Browse protocols registered in the Synapse Agent Protocol network — agent adoption, capability mapping, and protocol analytics.',
  openGraph: {
    title: 'Protocols | Synapse Explorer',
    description: OG_DESC,
    images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Protocols | Synapse Explorer',
    description: OG_DESC,
    images: [ogUrl.toString()],
  },
};

export default function ProtocolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
