import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ pda: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pda } = await params;
  const short = pda.length > 12 ? `${pda.slice(0, 6)}...${pda.slice(-4)}` : pda;
  const title = `Escrow ${short}`;
  const desc = `Balance, settlement history, and lifecycle on SAP.`;
  const ogUrl = `${SITE_URL}/synapse-metadata-logo.png`;
  return {
    title,
    description: `Escrow account ${short} — balance, settlement history, and lifecycle on the Solana Agent Protocol.`,
    openGraph: {
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  };
}

export default function EscrowDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
