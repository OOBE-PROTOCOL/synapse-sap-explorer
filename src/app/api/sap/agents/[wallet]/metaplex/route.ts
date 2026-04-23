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

import { PublicKey } from '@solana/web3.js';
import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import { getMetaplexLinkSnapshot } from '~/lib/sap/metaplex-link';
import { getSapClient } from '~/lib/sap/discovery';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: agentPdaStr } = await params;
    const agentPda = new PublicKey(agentPdaStr);

    // Read the AgentAccount to get the owner wallet
    const agent = await swr(
      `agent:${agentPdaStr}:account`,
      () => getSapClient().agent.fetch(agentPda),
      { ttl: 300_000, swr: 600_000 }, // 5min fresh / 10min stale
    );

    if (!agent) {
      return synapseResponse(
        { linked: false, asset: null, expectedUrl: '', sapAgentPda: agentPdaStr, agentIdentityUri: null, registration: null, error: 'Agent not found on-chain' },
        { status: 404 },
      );
    }

    // Now resolve the Metaplex link using the owner wallet
    const snapshot = await swr(
      `agent:${agentPdaStr}:metaplex`,
      () => getMetaplexLinkSnapshot(agent.wallet.toBase58()),
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
