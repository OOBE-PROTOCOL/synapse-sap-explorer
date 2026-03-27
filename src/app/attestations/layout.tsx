import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Attestations',
  description: 'View on-chain attestations in the SAP network — trust endorsements, verification records, and attestation types.',
  openGraph: {
    title: 'Attestations | Synapse Explorer',
    description: 'View on-chain attestations — trust endorsements, verification records, and attestation types.',
  },
};

export default function AttestationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
