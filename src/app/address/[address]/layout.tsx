import type { Metadata } from 'next';

type Props = { params: { address: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const addr = params.address;
  const short = addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
  return {
    title: `Address ${short}`,
    description: `Address ${short} — account details, transactions, and token balances on the Solana Agent Protocol.`,
  };
}

export default function AddressDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
