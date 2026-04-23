import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const OG_TITLE = 'Disputes';
const OG_DESC = 'Track SAP v0.7 disputes — resolution layers, outcomes, and receipt-based arbitration.';
const ogUrl = new URL(`${SITE_URL}/api/og`);
ogUrl.searchParams.set('type', 'page');
ogUrl.searchParams.set('title', OG_TITLE);
ogUrl.searchParams.set('desc', OG_DESC);

export const metadata: Metadata = {
  title: 'Disputes',
  description: 'Track SAP v0.7 disputes — resolution layers, outcomes, receipt-based arbitration, and dispute lifecycle.',
  openGraph: {
    title: 'Disputes | Synapse Explorer',
    description: OG_DESC,
    images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Disputes | Synapse Explorer',
    description: OG_DESC,
    images: [ogUrl.toString()],
  },
};

export default function DisputesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
