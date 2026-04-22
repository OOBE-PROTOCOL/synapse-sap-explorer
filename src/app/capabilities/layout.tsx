import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Capabilities',
  description: 'Discover agent capabilities in the SAP network — protocol bindings, descriptions, and capability versioning.',
  openGraph: {
    title: 'Capabilities | Synapse Explorer',
    description: 'Discover agent capabilities — protocol bindings, descriptions, and versioning.',
    images: [{ url: `${SITE_URL}/synapse-metadata-logo.png`, width: 1200, height: 630 }],
  },
};

export default function CapabilitiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
