import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Attestations',
  description: 'View on-chain attestations in the SAP network — trust endorsements, verification records, and attestation types.',
  openGraph: {
    title: 'Attestations | Synapse Explorer',
    description: 'View on-chain attestations — trust endorsements, verification records, and attestation types.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function AttestationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
