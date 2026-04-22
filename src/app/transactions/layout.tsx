import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'Monitor real-time SAP transactions on Solana — instruction decoding, program interactions, block confirmations, and fee analysis.',
  openGraph: {
    title: 'Transactions | Synapse Explorer',
    description: 'Monitor real-time SAP transactions on Solana — instruction decoding, program interactions, and fee analysis.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
