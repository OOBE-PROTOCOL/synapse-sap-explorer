import type { Metadata } from 'next';

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Capability ${params.id}`,
    description: `Capability ${params.id} — protocol binding, description, and agent owners on the Solana Agent Protocol.`,
  };
}

export default function CapabilityDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
