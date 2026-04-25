export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/metaplex-registry
 *
 * Lists all agents the wallet has registered on the public
 * Metaplex Agents Registry (api.metaplex.com), regardless of
 * whether their AgentIdentity URI points to this SAP host.
 *
 * Cached 60s fresh / 5min stale via SWR.
 * Never throws — upstream failures surface in `error`.
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import {
  listRegistryAgentsForWallet,
  getRegistryAgentsByMints,
} from '~/lib/metaplex/registry';
import { getMetaplexAssetsForWallet } from '~/lib/sap/metaplex-link';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;
    const data = await swr(
      `agent:${wallet}:metaplex-registry`,
      async () => {
        // Authoritative path: enumerate the wallet's owned MPL Core assets
        // that carry an AgentIdentity plugin, then look each one up directly
        // on api.metaplex.com. This bypasses the upstream `walletAddress=`
        // filter (frequently ignored) and the api also stores the SAP-side
        // wallet under `authority`, not `walletAddress`.
        const assets = await getMetaplexAssetsForWallet(wallet);
        const candidateMints = assets.items
          .filter((i) => i.hasAgentIdentity)
          .map((i) => i.asset);
        const direct = await getRegistryAgentsByMints(wallet, candidateMints, 'solana-mainnet');
        if (direct.agents.length > 0) return direct;
        // Fallback: paged wallet listing (rarely matches but kept as safety net).
        return listRegistryAgentsForWallet(wallet, 'solana-mainnet');
      },
      { ttl: 60_000, swr: 300_000 },
    );
    return synapseResponse(data);
  } catch (err: unknown) {
    console.error('[agent/metaplex-registry]', err);
    return synapseResponse(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
