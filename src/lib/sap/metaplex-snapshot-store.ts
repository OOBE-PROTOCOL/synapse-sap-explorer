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
import { getMetaplexLinkSnapshot, getMetaplexAssetsForWallet } from '~/lib/sap/metaplex-link';
import {
  listRegistryAgentsForWallet,
  getRegistryAgentsByMints,
} from '~/lib/metaplex/registry';

export type AgentMetaplexBadge = {
  asset: string | null;
  linked: boolean;
  pluginCount: number;
  registryCount: number;
};

const STALE_MS = 5 * 60_000;        // serve stale immediately, refresh async
const HARD_TTL_MS = 30 * 60_000;    // beyond this, block on refresh
/**
 * "Empty signal" rows (no asset, no plugin, no registry hit) are special:
 * they are commonly the result of a transient upstream miss — Synapse DAS
 * 0-result, getProgramAccountsV2 502, registry not yet indexed for a
 * brand-new wallet. Persisting them as "good" for HARD_TTL_MS hides the
 * agent's MPL footprint indefinitely. Re-resolve them aggressively (block
 * on refresh as soon as they're older than this window) so the next read
 * after the upstream recovers will pick up the real footprint.
 */
const EMPTY_SIGNAL_HARD_TTL_MS = 60_000;
const EMPTY_SIGNAL_STALE_MS = 15_000;

const inflight = new Map<string, Promise<void>>();

async function resolveAndPersist(wallet: string): Promise<void> {
  if (inflight.has(wallet)) return inflight.get(wallet)!;
  const task = (async () => {
    try {
      // 1. Enumerate owned MPL Core assets first (single source of
      //    truth for both pluginCount and registry candidate mints).
      const owned = await getMetaplexAssetsForWallet(wallet).catch(() => null);
      const candidateMints = (owned?.items ?? [])
        .filter((i) => i.hasAgentIdentity)
        .map((i) => i.asset);

      // 2. Resolve registry hits using the authoritative by-mint path,
      //    then fall back to the paged wallet listing.
      const resolveRegistry = async () => {
        try {
          if (candidateMints.length > 0) {
            const direct = await getRegistryAgentsByMints(wallet, candidateMints, 'solana-mainnet');
            if (direct.agents.length > 0) return direct;
          }
          return await listRegistryAgentsForWallet(wallet, 'solana-mainnet');
        } catch {
          return null;
        }
      };

      const [snap, reg] = await Promise.all([
        getMetaplexLinkSnapshot(wallet).catch(() => null),
        resolveRegistry(),
      ]);

      // Plugin count: prefer the higher of (snapshot, owned-enumeration).
      // The two paths use different caches — picking the max avoids
      // persisting a transient zero when one path saw the assets.
      const pluginCount = Math.max(
        snap?.pluginCount ?? 0,
        owned?.withAgentIdentity ?? 0,
      );

      await upsertAgentMetaplex({
        wallet,
        sapAgentPda: snap?.sapAgentPda ?? null,
        asset: snap?.asset ?? null,
        linked: !!snap?.linked,
        pluginCount,
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
  // A row carries no usable signal when nothing was found across all
  // sources. We don't trust those for long — they're often transient.
  const isEmpty = !!row && !row.linked && row.pluginCount === 0 && row.registryCount === 0;
  const hardTtl = isEmpty ? EMPTY_SIGNAL_HARD_TTL_MS : HARD_TTL_MS;
  const staleAt = isEmpty ? EMPTY_SIGNAL_STALE_MS : STALE_MS;

  if (!row || age > hardTtl) {
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

  if (age > staleAt) {
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
