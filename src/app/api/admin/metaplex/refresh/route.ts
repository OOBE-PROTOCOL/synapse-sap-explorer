/**
 * POST /api/admin/metaplex/refresh
 *
 * Forces a re-resolution of the Metaplex link snapshot for all known
 * agents (or a specific subset via `?wallets=w1,w2`). Useful after
 * RPC outages, code deploys, or when the on-chain truth has diverged
 * from the cached `sap_exp.agent_metaplex` rows.
 *
 * Auth: requires `x-admin-key` header matching `SAP_ADMIN_KEY` env.
 * Without that env set, the route is disabled.
 */
import { NextResponse } from 'next/server';
import { selectAllAgents } from '~/lib/db/queries';
import { invalidateMetaplexSnapshot } from '~/lib/sap/metaplex-snapshot-store';
import { invalidateSnapshotCache } from '~/lib/sap/metaplex-link';
import { invalidate, invalidatePrefix } from '~/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const adminKey = process.env.SAP_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'admin disabled' }, { status: 503 });
  }
  if (req.headers.get('x-admin-key') !== adminKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const explicit = url.searchParams.get('wallets');
  let wallets: string[];
  if (explicit) {
    wallets = explicit.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const rows = await selectAllAgents();
    wallets = rows.map((r) => r.wallet).filter(Boolean) as string[];
  }

  // Drop in-memory caches first so the re-resolution actually re-fetches.
  invalidateSnapshotCache();
  // Per-wallet SWR keys used by /nfts and /metaplex routes.
  for (const w of wallets) {
    invalidate(`agent:${w}:metaplex`);
    invalidate(`agent:${w}:nfts`);
  }
  // Listing cache used by /api/sap/agents/enriched.
  invalidatePrefix('agents:enriched');

  // Refresh sequentially to avoid hammering Synapse RPC.
  const results: { wallet: string; ok: boolean; error?: string }[] = [];
  for (const w of wallets) {
    try {
      await invalidateMetaplexSnapshot(w);
      results.push({ wallet: w, ok: true });
    } catch (e) {
      results.push({ wallet: w, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({
    refreshed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
