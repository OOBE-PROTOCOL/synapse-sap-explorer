import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from 'sonner';
import AppLayout from '~/components/layout/app-layout';
import './globals.css';

export const metadata: Metadata = {
  title: 'Synapse Explorer — SAP Agent Protocol',
  description:
    'Explore the Solana Agent Protocol network — discover agents, visualize PDA connections, browse on-chain tools, and monitor SAP transactions in real-time.',
  keywords: [
    'Solana',
    'SAP',
    'Agent Protocol',
    'Explorer',
    'PDA',
    'On-chain agents',
    'Synapse',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${GeistMono.variable} font-mono`}
        suppressHydrationWarning
      >
        <AppLayout>{children}</AppLayout>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(12,17,23,0.82)',
              backdropFilter: 'blur(16px) saturate(150%)',
              border: '1px solid rgba(255,255,255,0.055)',
              color: '#e5e7eb',
              borderRadius: '16px',
              boxShadow: '0 8px 40px -8px rgba(0,0,0,0.40), 0 2px 12px -4px rgba(0,0,0,0.20)',
            },
          }}
        />
      </body>
    </html>
  );
}
