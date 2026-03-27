import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Capabilities',
  description: 'Discover agent capabilities in the SAP network — protocol bindings, descriptions, and capability versioning.',
  openGraph: {
    title: 'Capabilities | Synapse Explorer',
    description: 'Discover agent capabilities — protocol bindings, descriptions, and versioning.',
  },
};

export default function CapabilitiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
