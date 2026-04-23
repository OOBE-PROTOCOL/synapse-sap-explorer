import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ pda: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pda } = await params;
  const short = pda.length > 12 ? `${pda.slice(0, 6)}...${pda.slice(-4)}` : pda;
  const title = `Dispute ${short}`;
  const desc = 'Dispute resolution timeline — receipt proof, arbitration layers, and outcome tracking.';

  const ogUrl = new URL(`${SITE_URL}/api/og`);
  ogUrl.searchParams.set('type', 'entity');
  ogUrl.searchParams.set('kind', 'Dispute');
  ogUrl.searchParams.set('title', title);
  ogUrl.searchParams.set('id', short);
  ogUrl.searchParams.set('desc', desc);
  ogUrl.searchParams.set('m1', 'Dispute PDA');
  ogUrl.searchParams.set('v1', short);
  ogUrl.searchParams.set('m2', 'Flow');
  ogUrl.searchParams.set('v2', 'Arbitration');
  ogUrl.searchParams.set('m3', 'Network');
  ogUrl.searchParams.set('v3', 'Solana Mainnet');

  return {
    title,
    description: desc,
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

export default function DisputeDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
