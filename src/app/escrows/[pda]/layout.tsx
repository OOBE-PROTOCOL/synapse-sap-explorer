import type { Metadata } from 'next';

type Props = { params: { pda: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const short = params.pda.length > 12 ? `${params.pda.slice(0, 6)}...${params.pda.slice(-4)}` : params.pda;
  return {
    title: `Escrow ${short}`,
    description: `Escrow account ${short} — balance, settlement history, and lifecycle on the Solana Agent Protocol.`,
  };
}

export default function EscrowDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
