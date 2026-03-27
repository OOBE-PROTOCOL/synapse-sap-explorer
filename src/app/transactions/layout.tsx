import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'Monitor real-time SAP transactions on Solana — instruction decoding, program interactions, block confirmations, and fee analysis.',
  openGraph: {
    title: 'Transactions | Synapse Explorer',
    description: 'Monitor real-time SAP transactions on Solana — instruction decoding, program interactions, and fee analysis.',
    images: [{ url: `${SITE_URL}/api/og?type=page&title=Transactions&desc=Monitor+real-time+SAP+transactions+on+Solana+%E2%80%94+instruction+decoding%2C+program+interactions%2C+and+fee+analysis.`, width: 1200, height: 630 }],
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
