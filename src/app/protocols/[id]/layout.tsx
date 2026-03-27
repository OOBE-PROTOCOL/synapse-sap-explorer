import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const title = `Protocol ${params.id}`;
  const desc = `Agent adoption, capabilities, and analytics on SAP.`;
  const ogUrl = `${SITE_URL}/api/og?type=page&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(desc)}`;
  return {
    title,
    description: `Protocol ${params.id} — agent adoption, capabilities, and analytics on the Solana Agent Protocol.`,
    openGraph: {
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  };
}

export default function ProtocolDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
