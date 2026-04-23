import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const OG_TITLE = 'Escrows';
const OG_DESC = 'Track SAP payment escrows — balances, settlement rates, and escrow lifecycle status.';
const ogUrl = new URL(`${SITE_URL}/api/og`);
ogUrl.searchParams.set('type', 'page');
ogUrl.searchParams.set('title', OG_TITLE);
ogUrl.searchParams.set('desc', OG_DESC);

export const metadata: Metadata = {
  title: 'Escrows',
  description: 'Track SAP payment escrows — balances, settlement rates, depositor/agent pairs, and escrow lifecycle status.',
  openGraph: {
    title: 'Escrows | Synapse Explorer',
    description: OG_DESC,
    images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Escrows | Synapse Explorer',
    description: OG_DESC,
    images: [ogUrl.toString()],
  },
};

export default function EscrowsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
