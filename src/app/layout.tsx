import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import AppLayout from '~/components/layout/app-layout';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

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
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrains.variable} font-sans`}
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
