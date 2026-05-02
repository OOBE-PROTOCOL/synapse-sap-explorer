'use client';

/* ──────────────────────────────────────────────────────────
 * Hooks for FairScale × SAP aggregated reputation.
 *
 * All types are sourced from the SDK (`AggregatedReputation`,
 * `AggregateOptions`) — the explorer never re-defines these.
 * ────────────────────────────────────────────────────────── */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  AggregatedReputation,
  AggregateOptions,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries/fairscale';

export type { AggregatedReputation, AggregateOptions };

export type BatchAggregateEntry = {
  wallet: string;
  result: AggregatedReputation | null;
  error?: string;
};

type ReputationOpts = {
  sapWeight?: number;
  fsWeight?: number;
  minFeedbacks?: number;
  task?: AggregateOptions['task'];
};

function buildQs(opts?: ReputationOpts): string {
  if (!opts) return '';
  const p = new URLSearchParams();
  if (opts.sapWeight != null) p.set('sapWeight', String(opts.sapWeight));
  if (opts.fsWeight != null) p.set('fsWeight', String(opts.fsWeight));
  if (opts.minFeedbacks != null)
    p.set('minFeedbacks', String(opts.minFeedbacks));
  if (opts.task) p.set('task', opts.task);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/* ── Single-wallet fetch (detail page Reputation tab) ── */

export function useAggregatedReputation(
  wallet: string | null,
  opts?: ReputationOpts,
) {
  const qs = useMemo(() => buildQs(opts), [opts]);
  const url = wallet
    ? `/api/sap/agents/${wallet}/aggregate-reputation${qs}`
    : null;

  const q = useQuery<AggregatedReputation, Error>({
    queryKey: ['sap', 'aggregate-reputation', wallet, qs],
    queryFn: async () => {
      const r = await fetch(url!);
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    enabled: url !== null,
    staleTime: 60_000,
  });

  return {
    data: q.data ?? null,
    error: q.error?.message ?? null,
    loading: q.isLoading,
    refetch: q.refetch,
  };
}

/* ── Batch fetch (cards listing — single POST) ── */

export function useAggregatedReputationBatch(
  wallets: ReadonlyArray<string>,
  opts?: ReputationOpts,
) {
  const sortedKey = useMemo(
    () => [...wallets].sort().join(','),
    [wallets],
  );
  const optsKey = useMemo(
    () => JSON.stringify(opts ?? {}),
    [opts],
  );

  const q = useQuery<{ results: BatchAggregateEntry[] }, Error>({
    queryKey: ['sap', 'aggregate-reputation', 'batch', sortedKey, optsKey],
    queryFn: async () => {
      const r = await fetch('/api/sap/agents/aggregate-reputation/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallets: [...wallets],
          weights:
            opts?.sapWeight != null && opts?.fsWeight != null
              ? { sap: opts.sapWeight, fairscale: opts.fsWeight }
              : undefined,
          minFeedbacks: opts?.minFeedbacks,
          task: opts?.task,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    enabled: wallets.length > 0,
    staleTime: 60_000,
  });

  // Index by wallet for O(1) lookup in card grids.
  const byWallet = useMemo(() => {
    const m = new Map<string, AggregatedReputation>();
    for (const e of q.data?.results ?? []) {
      if (e.result) m.set(e.wallet, e.result);
    }
    return m;
  }, [q.data]);

  return {
    data: q.data?.results ?? null,
    byWallet,
    error: q.error?.message ?? null,
    loading: q.isLoading,
    refetch: q.refetch,
  };
}
