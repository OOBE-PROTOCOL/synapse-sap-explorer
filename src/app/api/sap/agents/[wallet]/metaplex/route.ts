export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/metaplex
 *
 * Resolves the SAP × Metaplex Core link for an agent:
 *   - Takes the SAP agent PDA from the URL param.
 *   - Reads the AgentAccount on-chain to get the owner wallet.
 *   - Enumerates MPL Core assets owned by the wallet via DAS.
 *   - Picks the asset whose AgentIdentity plugin URI points
 *     to this agent's canonical EIP-8004 registration URL.
 *   - Returns the bridge-verified UnifiedProfile snapshot
 *     plus the canonical expected URL (for UI rendering).
 *
 * Cached 60s fresh / 5min stale via SWR.
 * Never throws — returns `{ linked: false, asset: null }` when
 * no link is detected.
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import { getSynapseRpcConfig } from '~/lib/sap/rpc-config';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: walletOrId } = await params;
    const { getSapClient } = await import('~/lib/sap/discovery');
    const { getMetaplexLinkSnapshot, invalidateSnapshotCache } = await import('~/lib/sap/metaplex-link');
    const { invalidateMetaplexSnapshot } = await import('~/lib/sap/metaplex-snapshot-store');
    const { url: rpcUrl } = getSynapseRpcConfig();
    const resolved = await getSapClient().metaplex.resolveAgentIdentifier({
      identifier: walletOrId,
      rpcUrl,
    }).catch(() => null);
    const wallet = resolved?.wallet?.toBase58() ?? walletOrId;
    const url = new URL(req.url);
    const fresh = url.searchParams.get('fresh') === '1';

    if (fresh) {
      // Bypass all caches and force a clean re-resolution.
      invalidateSnapshotCache(wallet);
      const snapshot = await getMetaplexLinkSnapshot(wallet, { fresh: true });
      // Best-effort: also refresh the DB-backed snapshot for consistency.
      void invalidateMetaplexSnapshot(wallet).catch(() => {});
      return synapseResponse(snapshot);
    }

    // Route param already is the owner wallet.
    const snapshot = await swr(
      `agent:${wallet}:metaplex`,
      () => getMetaplexLinkSnapshot(wallet),
      { ttl: 60_000, swr: 300_000 },
    );

    return synapseResponse(snapshot);
  } catch (err: unknown) {
    console.error('[agent/metaplex]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'Failed to resolve Metaplex link' },
      { status: 500 },
    );
  }
}
