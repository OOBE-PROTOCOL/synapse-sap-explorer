import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Protocols',
  description: 'Browse protocols registered in the Solana Agent Protocol network — agent adoption, capability mapping, and protocol analytics.',
  openGraph: {
    title: 'Protocols | Synapse Explorer',
    description: 'Browse protocols in the SAP network — agent adoption, capability mapping, and analytics.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function ProtocolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
