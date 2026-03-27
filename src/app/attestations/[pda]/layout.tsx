import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: { pda: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const short = params.pda.length > 12 ? `${params.pda.slice(0, 6)}...${params.pda.slice(-4)}` : params.pda;
  const title = `Attestation ${short}`;
  const desc = `Trust endorsement details on the Solana Agent Protocol.`;
  const ogUrl = `${SITE_URL}/api/og?type=page&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(desc)}`;
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
