import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from 'sonner';
import { ThemeProvider } from '~/components/theme-provider';
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistMono.variable} font-mono`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppLayout>{children}</AppLayout>
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: 'bg-popover text-popover-foreground border-border shadow-lg rounded-2xl',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
