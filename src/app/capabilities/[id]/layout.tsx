import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Capability ${id}`;
  const desc = `Protocol binding, description, and agent owners on SAP.`;
  const ogUrl = `${SITE_URL}/api/og?type=page&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(desc)}`;
  return {
    title,
    description: `Capability ${id} — protocol binding, description, and agent owners on the Solana Agent Protocol.`,
    openGraph: {
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  };
}

export default function CapabilityDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
