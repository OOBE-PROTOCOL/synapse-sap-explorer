import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Events | Synapse Explorer',
  description: 'Real-time SAP protocol events — escrow settlements, agent registrations, memory inscriptions, and more.',
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
