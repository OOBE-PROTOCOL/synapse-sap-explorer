/**
 * Persistent SWR store for agent logo URLs.
 *
 * Resolution order (in this order, first non-empty wins for the
 * `displayLogo` accessor used by the avatar component):
 *
 *   1. `wellKnownLogo` — `<endpoint>/.well-known/agent.json`.logo
 *   2. `mplImage`      — image of the SAP-bound MPL Core asset, or the
 *                         first owned asset carrying an EIP-8004
 *                         AgentIdentity plugin.
 *
 * Why a dedicated store?
 *   The agents listing was re-scraping `.well-known/agent.json` and
 *   walking MPL metadata on every render — both 200-3000ms operations
 *   that are otherwise static for hours/days. We persist what is
 *   effectively immutable per agent so the listing serves logos
 *   instantly and a single background pass keeps the cache warm.
 *
 * Server-only.
 */

import {
  selectAgentLogo,
  selectAgentLogosBatch,
  upsertAgentLogo,
} from '~/lib/db/queries';
import { fetchAgentWellKnown } from '~/lib/sap/well-known';
import { getMetaplexAssetsForWallet } from '~/lib/sap/metaplex-link';
import { isDbDown } from '~/db';

export type AgentLogoSnapshot = {
  wallet: string;
  /** `.well-known/agent.json` `.logo` (preferred when present and live). */
  wellKnownLogo: string | null;
  /** Image URL from the MPL Core asset bound to this agent. */
  mplImage: string | null;
  /** Asset address whose image was used (for diagnostics / linking). */
  mplAsset: string | null;
  /** Best logo to display (well-known → mpl → null). */
  displayLogo: string | null;
};

const STALE_MS = 30 * 60_000;       // serve stale immediately, refresh async
const HARD_TTL_MS = 24 * 60 * 60_000; // beyond this, block on refresh
/**
 * Empty-result rows expire fast: a brand-new agent might publish its
 * `.well-known/agent.json` minutes after on-chain registration, and
 * MPL Core enumeration occasionally returns 0 from a transient DAS hiccup.
 */
const EMPTY_HARD_TTL_MS = 5 * 60_000;
const EMPTY_STALE_MS = 60_000;

const inflight = new Map<string, Promise<AgentLogoSnapshot>>();

function pickDisplayLogo(wk: string | null, mpl: string | null): string | null {
  return wk ?? mpl ?? null;
}

async function resolveLogos(
  wallet: string,
  endpoint: string | null,
): Promise<AgentLogoSnapshot> {
  // Run both resolutions in parallel; never throw.
  const [wkResult, mplResult] = await Promise.allSettled([
    endpoint ? fetchAgentWellKnown(endpoint) : Promise.resolve(null),
    getMetaplexAssetsForWallet(wallet),
  ]);

  const wk = wkResult.status === 'fulfilled' ? wkResult.value : null;
  const wellKnownLogo =
    wk && typeof wk.logo === 'string' && wk.logo.trim().length > 0 ? wk.logo : null;

  let mplImage: string | null = null;
  let mplAsset: string | null = null;
  if (mplResult.status === 'fulfilled' && mplResult.value) {
    const items = mplResult.value.items ?? [];
    // Prefer the asset whose AgentIdentity plugin URI is bound to this SAP PDA.
    const linked = items.find((i) => i.linkedToThisAgent && i.image);
    const anyAgent = items.find((i) => i.hasAgentIdentity && i.image);
    const anyAsset = items.find((i) => i.image);
    const pick = linked ?? anyAgent ?? anyAsset ?? null;
    if (pick) {
      mplImage = pick.image ?? null;
      mplAsset = pick.asset ?? null;
    }
  }

  return {
    wallet,
    wellKnownLogo,
    mplImage,
    mplAsset,
    displayLogo: pickDisplayLogo(wellKnownLogo, mplImage),
  };
}

async function resolveAndPersist(
  wallet: string,
  endpoint: string | null,
): Promise<AgentLogoSnapshot> {
  const existing = inflight.get(wallet);
  if (existing) return existing;

  const task = (async () => {
    const snap = await resolveLogos(wallet, endpoint);
    if (!isDbDown()) {
      try {
        await upsertAgentLogo({
          wallet,
          wellKnownLogo: snap.wellKnownLogo,
          mplImage: snap.mplImage,
          mplAsset: snap.mplAsset,
        });
      } catch {
        // best-effort persistence
      }
    }
    inflight.delete(wallet);
    return snap;
  })();

  inflight.set(wallet, task);
  return task;
}

function rowToSnapshot(row: {
  wallet: string;
  wellKnownLogo: string | null;
  mplImage: string | null;
  mplAsset: string | null;
}): AgentLogoSnapshot {
  return {
    wallet: row.wallet,
    wellKnownLogo: row.wellKnownLogo,
    mplImage: row.mplImage,
    mplAsset: row.mplAsset,
    displayLogo: pickDisplayLogo(row.wellKnownLogo, row.mplImage),
  };
}

/**
 * Get the cached logo snapshot for a wallet, refreshing on stale.
 * Endpoint is required for `.well-known` resolution; pass null if unknown.
 */
export async function getCachedAgentLogo(
  wallet: string,
  endpoint: string | null,
): Promise<AgentLogoSnapshot> {
  if (isDbDown()) {
    return resolveLogos(wallet, endpoint);
  }

  const row = await selectAgentLogo(wallet).catch(() => null);
  if (!row) {
    // Cold path: block on resolve so caller has something to render.
    return resolveAndPersist(wallet, endpoint);
  }

  const isEmpty = !row.wellKnownLogo && !row.mplImage;
  const ageMs = Date.now() - new Date(row.refreshedAt).getTime();
  const staleMs = isEmpty ? EMPTY_STALE_MS : STALE_MS;
  const hardTtlMs = isEmpty ? EMPTY_HARD_TTL_MS : HARD_TTL_MS;

  if (ageMs >= hardTtlMs) {
    return resolveAndPersist(wallet, endpoint);
  }

  // Stale-while-revalidate: kick off background refresh, return cached.
  if (ageMs >= staleMs) {
    void resolveAndPersist(wallet, endpoint).catch(() => undefined);
  }
  return rowToSnapshot(row);
}

/**
 * Batch variant for the listing page. Returns a wallet → snapshot map.
 * Wallets with no row are resolved lazily in the background; the caller
 * sees `null` for those entries on the first request.
 */
export async function getCachedAgentLogosBatch(
  inputs: Array<{ wallet: string; endpoint: string | null }>,
): Promise<Map<string, AgentLogoSnapshot>> {
  const map = new Map<string, AgentLogoSnapshot>();
  if (inputs.length === 0) return map;
  if (isDbDown()) return map;

  const wallets = inputs.map((i) => i.wallet);
  const rows = await selectAgentLogosBatch(wallets).catch(() => [] as Array<{
    wallet: string;
    wellKnownLogo: string | null;
    mplImage: string | null;
    mplAsset: string | null;
    refreshedAt: Date;
  }>);

  const byWallet = new Map(rows.map((r) => [r.wallet, r]));
  const now = Date.now();

  for (const { wallet, endpoint } of inputs) {
    const row = byWallet.get(wallet);
    if (row) {
      map.set(wallet, rowToSnapshot(row));
      const isEmpty = !row.wellKnownLogo && !row.mplImage;
      const ageMs = now - new Date(row.refreshedAt).getTime();
      const staleMs = isEmpty ? EMPTY_STALE_MS : STALE_MS;
      const hardTtlMs = isEmpty ? EMPTY_HARD_TTL_MS : HARD_TTL_MS;
      if (ageMs >= staleMs && ageMs < hardTtlMs) {
        // Background refresh — listing already has cached value.
        void resolveAndPersist(wallet, endpoint).catch(() => undefined);
      } else if (ageMs >= hardTtlMs) {
        // Stale beyond hard TTL: refresh in background but still serve
        // whatever we have to keep the listing snappy.
        void resolveAndPersist(wallet, endpoint).catch(() => undefined);
      }
    } else {
      // Cold wallet: kick off resolve, listing gets null this round.
      void resolveAndPersist(wallet, endpoint).catch(() => undefined);
    }
  }

  return map;
}
