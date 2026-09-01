export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { synapseResponse } from '~/lib/synapse/client';
import { selectAgentByPda, selectAgentByWallet } from '~/lib/db/queries';
import { asPublicKeyText } from '~/lib/format';
import { getSynapseRpcConfig } from '~/lib/sap/rpc-config';

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
    const { id: rawId } = await params;
    const id = asPublicKeyText(rawId) || rawId;

    try {
      const dbRow = await selectAgentByWallet(id) ?? await selectAgentByPda(id);
      if (dbRow) {
        return synapseResponse({
          input: id,
          kind: dbRow.pda === id ? 'sap-pda' : 'wallet',
          wallet: asPublicKeyText(dbRow.wallet),
          sapAgentPda: asPublicKeyText(dbRow.pda),
          asset: null,
          resolved: true,
        });
      }
    } catch (e) {
      console.warn('[agents/resolve] DB lookup failed:', (e as Error).message);
    }

    const { findAllAgents, getSapClient } = await import('~/lib/sap/discovery');
    const discovered = await findAllAgents()
      .then((agents) => agents.find((agent) => asPublicKeyText(agent.pda) === id))
      .catch(() => null);
    if (discovered?.identity) {
      return synapseResponse({
        input: id,
        kind: 'sap-pda',
        wallet: asPublicKeyText(discovered.identity.wallet),
        sapAgentPda: asPublicKeyText(discovered.pda),
        asset: null,
        resolved: true,
      });
    }

    const { url } = getSynapseRpcConfig();
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
