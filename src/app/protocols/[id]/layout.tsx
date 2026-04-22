import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Protocol ${id}`;
  const desc = `Agent adoption, capabilities, and analytics on SAP.`;
  const ogUrl = `${SITE_URL}/synapse-metadata-logo.png`;
  return {
    title,
    description: `Protocol ${id} — agent adoption, capabilities, and analytics on the Synapse Agent Protocol.`,
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
