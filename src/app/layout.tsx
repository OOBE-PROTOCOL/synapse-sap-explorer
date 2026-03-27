import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from 'sonner';
import { ThemeProvider } from '~/components/theme-provider';
import AppLayout from '~/components/layout/app-layout';
import './globals.css';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Synapse Explorer — SAP Agent Protocol',
    template: '%s | Synapse Explorer',
  },
  description:
    'Explore the Solana Agent Protocol network — discover agents, visualize PDA connections, browse on-chain tools, and monitor SAP transactions in real-time.',
  keywords: [
    'Solana', 'SAP', 'Agent Protocol', 'Explorer',
    'PDA', 'On-chain agents', 'Synapse', 'OOBE Protocol',
  ],
  authors: [{ name: 'OOBE Protocol Labs', url: 'https://oobe.me' }],
  creator: 'OOBE Protocol Labs',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    siteName: 'Synapse Explorer',
    title: 'Synapse Explorer — SAP Agent Protocol',
    description: 'Real-time on-chain explorer for the Solana Agent Protocol. Discover agents, tools, escrows, and transactions.',
    url: SITE_URL,
    images: [{ url: `${SITE_URL}/og-default.png`, width: 311, height: 311, alt: 'Synapse Explorer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Synapse Explorer — SAP Agent Protocol',
    description: 'Real-time on-chain explorer for the Solana Agent Protocol.',
    images: [`${SITE_URL}/og-default.png`],
    creator: '@oobeprotocol',
  },
  robots: {
    index: true,
    follow: true,
  },
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
