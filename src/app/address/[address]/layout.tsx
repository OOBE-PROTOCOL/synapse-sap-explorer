import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: addr } = await params;
  const short = addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
  const title = `Address ${short}`;
  const desc = `Account details, transactions, and token balances on SAP.`;
  const ogUrl = `${SITE_URL}/api/og?type=page&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(desc)}`;
  return {
    title,
    description: `Address ${short} — account details, transactions, and token balances on the Solana Agent Protocol.`,
    openGraph: {
      title: `${title} | Synapse Explorer`,
      description: desc,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  };
}

export default function AddressDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
