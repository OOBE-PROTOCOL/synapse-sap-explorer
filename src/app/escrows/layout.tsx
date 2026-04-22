import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Escrows',
  description: 'Track SAP payment escrows — balances, settlement rates, depositor/agent pairs, and escrow lifecycle status.',
  openGraph: {
    title: 'Escrows | Synapse Explorer',
    description: 'Track SAP payment escrows — balances, settlement rates, and escrow lifecycle status.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function EscrowsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
