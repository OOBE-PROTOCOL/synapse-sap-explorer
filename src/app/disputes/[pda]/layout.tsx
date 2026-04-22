import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Dispute Detail',
  description: 'Dispute resolution timeline — receipt proof, 3-layer arbitration, and outcome tracking.',
  openGraph: {
    title: 'Dispute Detail | Synapse Explorer',
    description: 'Dispute resolution timeline — 3-layer arbitration and outcome tracking.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function DisputeDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
