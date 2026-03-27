import type { Metadata } from 'next';

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Protocol ${params.id}`,
    description: `Protocol ${params.id} — agent adoption, capabilities, and analytics on the Solana Agent Protocol.`,
  };
}

export default function ProtocolDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
