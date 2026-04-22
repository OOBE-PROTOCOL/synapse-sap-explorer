import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ pda: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pda } = await params;
  const short = pda.length > 12 ? `${pda.slice(0, 6)}...${pda.slice(-4)}` : pda;
  const title = `Attestation ${short}`;
  const desc = `Trust endorsement details on the Solana Agent Protocol.`;
  const ogUrl = `${SITE_URL}/synapse-metadata-logo.png`;
  return {
    title,
    description: `Attestation ${short} — trust endorsement details on the Solana Agent Protocol.`,
    openGraph: {
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  };
}

export default function AttestationDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
