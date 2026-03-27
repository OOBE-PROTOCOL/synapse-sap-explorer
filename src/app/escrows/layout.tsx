import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Escrows',
  description: 'Track SAP payment escrows — balances, settlement rates, depositor/agent pairs, and escrow lifecycle status.',
  openGraph: {
    title: 'Escrows | Synapse Explorer',
    description: 'Track SAP payment escrows — balances, settlement rates, and escrow lifecycle status.',
    images: [{ url: `${SITE_URL}/api/og?type=page&title=Escrows&desc=Track+SAP+payment+escrows+%E2%80%94+balances%2C+settlement+rates%2C+and+escrow+lifecycle+status.`, width: 1200, height: 630 }],
  },
};

export default function EscrowsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
