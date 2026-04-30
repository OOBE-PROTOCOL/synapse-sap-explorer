'use client';

import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * Default to our server-side RPC proxy at /api/solana/rpc.
 * The proxy forwards to Synapse with the API key, so the client
 * never sees the key and never hits a rate-limited public endpoint.
 */
const DEFAULT_RPC_ENDPOINT =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/solana/rpc`
    : '/api/solana/rpc';

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC_ENDPOINT;

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
