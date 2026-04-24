export const dynamic = 'force-dynamic';

import { synapseResponse } from '~/lib/synapse/client';
import { getRpcConfig, getSapClient } from '~/lib/sap/discovery';

/**
 * GET /api/sap/agents/resolve/[id]
 *
 * Resolves an agent route identifier to an agent wallet.
 * Uses SDK MetaplexBridge.resolveAgentIdentifier as single source of truth.
 * Accepts either owner wallet or MPL Core asset id.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { url } = getRpcConfig();
    const resolved = await getSapClient().metaplex.resolveAgentIdentifier({
      identifier: id,
      rpcUrl: url,
    });

    if (!resolved.wallet || !resolved.hasSapAgent) {
      return synapseResponse({
        input: resolved.input,
        kind: resolved.kind,
        wallet: null,
        resolved: false,
        error: resolved.error,
      }, { status: 404 });
    }

    return synapseResponse({
      input: resolved.input,
      kind: resolved.kind,
      wallet: resolved.wallet.toBase58(),
      sapAgentPda: resolved.sapAgentPda?.toBase58() ?? null,
      asset: resolved.asset?.toBase58() ?? null,
      resolved: true,
    });
  } catch (err: unknown) {
    console.error('[agents/resolve]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'Failed to resolve agent identifier' },
      { status: 500 },
    );
  }
}
