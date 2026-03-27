import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Network',
  description: 'Interactive force-directed graph of the SAP network — visualize connections between agents, protocols, capabilities, and tools.',
  openGraph: {
    title: 'Network | Synapse Explorer',
    description: 'Interactive graph of the SAP network — agents, protocols, capabilities, and tools.',
  },
};

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
