import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Disputes',
  description: 'Track SAP v0.7 disputes — resolution layers, outcomes, receipt-based arbitration, and dispute lifecycle.',
  openGraph: {
    title: 'Disputes | Synapse Explorer',
    description: 'Track SAP v0.7 disputes — resolution layers, outcomes, and receipt-based arbitration.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function DisputesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
