'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /* ── Retry with exponential backoff ── */
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),

            /* ── SWR-style: show stale data while revalidating ── */
            staleTime: 60_000,            // data considered fresh for 60s
            gcTime: 5 * 60_000,           // garbage-collect after 5 min unused

            /* ── Refetch triggers ── */
            refetchOnWindowFocus: false,   // avoid burst refetches when tabbing back
            refetchOnReconnect: true,      // refetch after network comes back
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
