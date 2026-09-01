'use client';

import { useMemo, type ComponentType, type ReactNode } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  type ConnectionProviderProps,
} from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
  type WalletModalProviderProps,
} from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * Default to our server-side RPC proxy at /api/solana/rpc.
 * The proxy forwards to Synapse with the API key, so the client
 * never sees the key and never hits a rate-limited public endpoint.
 *
 * NOTE: `ConnectionProvider` validates the endpoint URL at construction
 * (must start with http(s):), including during SSR / static prerender.
 * We therefore use a harmless absolute placeholder on the server and
 * swap to the real same-origin proxy URL on the client.
 */
const SSR_PLACEHOLDER_ENDPOINT = 'https://api.mainnet-beta.solana.com';

const TypedConnectionProvider = ConnectionProvider as ComponentType<ConnectionProviderProps>;
const TypedWalletModalProvider = WalletModalProvider as ComponentType<WalletModalProviderProps>;

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const fromEnv = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (fromEnv && /^https?:\/\//.test(fromEnv)) return fromEnv;
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/solana/rpc`;
    }
    return SSR_PLACEHOLDER_ENDPOINT;
  }, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <TypedConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <TypedWalletModalProvider>{children}</TypedWalletModalProvider>
      </WalletProvider>
    </TypedConnectionProvider>
  );
}
