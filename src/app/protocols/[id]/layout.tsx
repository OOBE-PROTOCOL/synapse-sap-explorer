import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Protocol ${id}`;
  const desc = 'Agent adoption, capabilities, and analytics on SAP.';
  const ogUrl = new URL(`${SITE_URL}/api/og`);
  ogUrl.searchParams.set('type', 'entity');
  ogUrl.searchParams.set('kind', 'Protocol');
  ogUrl.searchParams.set('title', title);
  ogUrl.searchParams.set('id', id);
  ogUrl.searchParams.set('desc', desc);
  ogUrl.searchParams.set('m1', 'Protocol ID');
  ogUrl.searchParams.set('v1', id);
  ogUrl.searchParams.set('m2', 'Coverage');
  ogUrl.searchParams.set('v2', 'Agents & Tools');
  ogUrl.searchParams.set('m3', 'Network');
  ogUrl.searchParams.set('v3', 'Solana Mainnet');
  return {
    title,
    description: `Protocol ${id} — agent adoption, capabilities, and analytics on the Synapse Agent Protocol.`,
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

export default function ProtocolDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
