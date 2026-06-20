/* ──────────────────────────────────────────────────────────
 * Aggregate Reputation — server-only helper
 *
 * Thin wrapper around `SapClient.fairscale.aggregate()` from
 * @oobe-protocol-labs/synapse-sap-sdk@^0.11.0 with SWR caching.
 *
 * Single source of truth for the FairScale × SAP blended score
 * shown in the agents listing chip and the agent detail page
 * Reputation tab. Re-exports the SDK's `AggregatedReputation`
 * type so client/server share the same shape.
 * ────────────────────────────────────────────────────────── */

import { PublicKey } from '@solana/web3.js';

import type {
  AggregatedReputation,
  AggregateOptions,
} from './sdk-compat';

import { getSapClient } from './discovery';
import { swr } from '~/lib/cache';

export type { AggregatedReputation, AggregateOptions };

/* ── Single ──────────────────────────────────────────── */

export async function aggregateReputation(
  wallet: string,
  opts: AggregateOptions = {},
): Promise<AggregatedReputation> {
  const cacheKey = JSON.stringify({
    k: 'agg-rep',
    w: wallet,
    weights: opts.weights ?? null,
    require: opts.require ?? null,
    task: opts.task ?? null,
  });
  return swr(
    cacheKey,
    () =>
      getSapClient().fairscale.aggregate(new PublicKey(wallet), opts),
    { ttl: 5 * 60_000, swr: 15 * 60_000 },
  );
}

/* ── Batch ───────────────────────────────────────────── */

export interface BatchAggregateEntry {
  readonly wallet: string;
  readonly result: AggregatedReputation | null;
  readonly error?: string;
}

/**
 * Resolve aggregate reputation for many wallets in parallel.
 * Each wallet is cached individually so repeat fetches stay cheap.
 * Failures degrade gracefully — `result: null` + `error: message`.
 */
export async function aggregateReputationBatch(
  wallets: ReadonlyArray<string>,
  opts: AggregateOptions = {},
): Promise<ReadonlyArray<BatchAggregateEntry>> {
  if (wallets.length === 0) return [];
  return Promise.all(
    wallets.map(async (w) => {
      try {
        const result = await aggregateReputation(w, opts);
        return { wallet: w, result };
      } catch (err) {
        return {
          wallet: w,
          result: null,
          error: (err as Error).message ?? 'aggregate_failed',
        };
      }
    }),
  );
}
