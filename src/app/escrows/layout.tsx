import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Escrows',
  description: 'Track SAP payment escrows — balances, settlement rates, depositor/agent pairs, and escrow lifecycle status.',
  openGraph: {
    title: 'Escrows | Synapse Explorer',
    description: 'Track SAP payment escrows — balances, settlement rates, and escrow lifecycle status.',
  },
};

export default function EscrowsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
