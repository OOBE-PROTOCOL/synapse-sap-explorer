import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'Monitor real-time SAP transactions on Solana — instruction decoding, program interactions, block confirmations, and fee analysis.',
  openGraph: {
    title: 'Transactions | Synapse Explorer',
    description: 'Monitor real-time SAP transactions on Solana — instruction decoding, program interactions, and fee analysis.',
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
