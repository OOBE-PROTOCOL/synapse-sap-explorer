import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Capability ${id}`;
  const desc = 'Protocol binding, description, and agent owners on SAP.';
  const ogUrl = new URL(`${SITE_URL}/api/og`);
  ogUrl.searchParams.set('type', 'entity');
  ogUrl.searchParams.set('kind', 'Capability');
  ogUrl.searchParams.set('title', title);
  ogUrl.searchParams.set('id', id);
  ogUrl.searchParams.set('desc', desc);
  ogUrl.searchParams.set('m1', 'Capability ID');
  ogUrl.searchParams.set('v1', id);
  ogUrl.searchParams.set('m2', 'Scope');
  ogUrl.searchParams.set('v2', 'Protocol Level');
  ogUrl.searchParams.set('m3', 'Network');
  ogUrl.searchParams.set('v3', 'Solana Mainnet');
  return {
    title,
    description: `Capability ${id} — protocol binding, description, and agent owners on the Synapse Agent Protocol.`,
    openGraph: {
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [ogUrl.toString()],
    },
  };
}

export default function CapabilityDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
