import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ pda: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pda } = await params;
  const short = pda.length > 12 ? `${pda.slice(0, 6)}...${pda.slice(-4)}` : pda;
  const title = `Tool ${short}`;
  const desc = 'Descriptor, invocation stats, and agent binding on SAP.';
  const ogUrl = new URL(`${SITE_URL}/api/og`);
  ogUrl.searchParams.set('type', 'entity');
  ogUrl.searchParams.set('kind', 'Tool');
  ogUrl.searchParams.set('title', title);
  ogUrl.searchParams.set('id', short);
  ogUrl.searchParams.set('desc', desc);
  ogUrl.searchParams.set('m1', 'PDA');
  ogUrl.searchParams.set('v1', short);
  ogUrl.searchParams.set('m2', 'Category');
  ogUrl.searchParams.set('v2', 'Tool Descriptor');
  ogUrl.searchParams.set('m3', 'Network');
  ogUrl.searchParams.set('v3', 'Solana Mainnet');
  return {
    title,
    description: `Tool ${short} — descriptor, invocation stats, and agent binding on the Synapse Agent Protocol.`,
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

export default function ToolDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
