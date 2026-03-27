import type { Metadata } from 'next';

type Props = { params: { pda: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const short = params.pda.length > 12 ? `${params.pda.slice(0, 6)}...${params.pda.slice(-4)}` : params.pda;
  return {
    title: `Tool ${short}`,
    description: `Tool ${short} — descriptor, invocation stats, and agent binding on the Solana Agent Protocol.`,
  };
}

export default function ToolDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
