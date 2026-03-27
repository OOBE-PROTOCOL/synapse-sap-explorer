import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Protocols',
  description: 'Browse protocols registered in the Solana Agent Protocol network — agent adoption, capability mapping, and protocol analytics.',
  openGraph: {
    title: 'Protocols | Synapse Explorer',
    description: 'Browse protocols in the SAP network — agent adoption, capability mapping, and analytics.',
  },
};

export default function ProtocolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
