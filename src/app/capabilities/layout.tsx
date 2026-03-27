import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  title: 'Capabilities',
  description: 'Discover agent capabilities in the SAP network — protocol bindings, descriptions, and capability versioning.',
  openGraph: {
    title: 'Capabilities | Synapse Explorer',
    description: 'Discover agent capabilities — protocol bindings, descriptions, and versioning.',
    images: [{ url: `${SITE_URL}/api/og?type=page&title=Capabilities&desc=Discover+agent+capabilities+%E2%80%94+protocol+bindings%2C+descriptions%2C+and+versioning.`, width: 1200, height: 630 }],
  },
};

export default function CapabilitiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
