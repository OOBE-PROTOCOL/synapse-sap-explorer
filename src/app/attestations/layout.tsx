import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const OG_TITLE = 'Attestations';
const OG_DESC = 'View on-chain attestations — trust endorsements, verification records, and attestation types.';
const ogUrl = new URL(`${SITE_URL}/api/og`);
ogUrl.searchParams.set('type', 'page');
ogUrl.searchParams.set('title', OG_TITLE);
ogUrl.searchParams.set('desc', OG_DESC);

export const metadata: Metadata = {
  title: 'Attestations',
  description: 'View on-chain attestations in the SAP network — trust endorsements, verification records, and attestation types.',
  openGraph: {
    title: 'Attestations | Synapse Explorer',
    description: OG_DESC,
    images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Attestations | Synapse Explorer',
    description: OG_DESC,
    images: [ogUrl.toString()],
  },
};

export default function AttestationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
