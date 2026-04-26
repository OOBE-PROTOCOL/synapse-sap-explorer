/**
 * Persistent SWR store for Metaplex × SAP link snapshots.
 *
 * Strategy:
 *   1. Read from DB (`agent_metaplex`).
 *   2. If row is fresh (< STALE_MS), return as-is.
 *   3. If row is stale, return stale value AND kick off a background
 *      refresh that re-resolves the snapshot and upserts to DB.
 *   4. If no row exists (cold), block on a fresh resolution then upsert.
 *
 * Adding new agents in real-time:
 *   - First-time wallet → cold path (one resolution call), then cached.
 *   - Subsequent reads → instant from DB.
 *   - The realtime indexer can call `invalidateMetaplexSnapshot(wallet)`
 *     to force a refresh on next read.
 *
 * Server-only.
 */

import {
  selectAgentMetaplex,
  upsertAgentMetaplex,
} from '~/lib/db/queries';
import { getMetaplexLinkSnapshot } from '~/lib/sap/metaplex-link';
import { listRegistryAgentsForWallet } from '~/lib/metaplex/registry';

export type AgentMetaplexBadge = {
  asset: string | null;
  linked: boolean;
  pluginCount: number;
  registryCount: number;
};

const STALE_MS = 5 * 60_000;        // serve stale immediately, refresh async
const HARD_TTL_MS = 30 * 60_000;    // beyond this, block on refresh

const inflight = new Map<string, Promise<void>>();

async function resolveAndPersist(wallet: string): Promise<void> {
  if (inflight.has(wallet)) return inflight.get(wallet)!;
  const task = (async () => {
    try {
      const [snap, reg] = await Promise.all([
        getMetaplexLinkSnapshot(wallet).catch(() => null),
        listRegistryAgentsForWallet(wallet).catch(() => null),
      ]);
      await upsertAgentMetaplex({
        wallet,
        sapAgentPda: snap?.sapAgentPda ?? null,
        asset: snap?.asset ?? null,
        linked: !!snap?.linked,
        pluginCount: snap?.pluginCount ?? 0,
        registryCount: reg?.agents.length ?? 0,
        agentIdentityUri: snap?.agentIdentityUri ?? null,
        registration: (snap?.registration as unknown) ?? null,
        registryAgents: (reg?.agents as unknown[]) ?? [],
        source: snap?.error ? 'error' : (snap?.asset ? 'on-chain' : 'none'),
        error: snap?.error ?? null,
      });
    } catch {
      // best-effort; never throw
    } finally {
      inflight.delete(wallet);
    }
  })();
  inflight.set(wallet, task);
  return task;
}

/**
 * Get the cached Metaplex badge for a wallet. Serves stale data fast and
 * refreshes in the background. Cold wallets block on first resolution.
 */
export async function getCachedAgentMetaplex(
  wallet: string,
): Promise<AgentMetaplexBadge | null> {
  const row = await selectAgentMetaplex(wallet).catch(() => null);
  const now = Date.now();
  const age = row ? now - new Date(row.refreshedAt).getTime() : Infinity;

  if (!row || age > HARD_TTL_MS) {
    // Cold or very stale → block on fresh resolution.
    await resolveAndPersist(wallet);
    const fresh = await selectAgentMetaplex(wallet).catch(() => null);
    return fresh
      ? {
          asset: fresh.asset,
          linked: fresh.linked,
          pluginCount: fresh.pluginCount,
          registryCount: fresh.registryCount,
        }
      : null;
  }

  if (age > STALE_MS) {
    // Stale-while-revalidate: kick off async refresh, return current.
    void resolveAndPersist(wallet);
  }

  return {
    asset: row.asset,
    linked: row.linked,
    pluginCount: row.pluginCount,
    registryCount: row.registryCount,
  };
}

/**
 * Batch variant — resolves N wallets concurrently. Stale rows are served
 * fast; cold rows block. Background refreshes are deduped via `inflight`.
 */
export async function getCachedAgentMetaplexBatch(
  wallets: string[],
): Promise<Map<string, AgentMetaplexBadge | null>> {
  const out = new Map<string, AgentMetaplexBadge | null>();
  await Promise.all(
    wallets.map(async (w) => {
      out.set(w, await getCachedAgentMetaplex(w));
    }),
  );
  return out;
}

/** Force a refresh of one wallet's snapshot (call from the realtime indexer). */
export async function invalidateMetaplexSnapshot(wallet: string): Promise<void> {
  await resolveAndPersist(wallet);
}
