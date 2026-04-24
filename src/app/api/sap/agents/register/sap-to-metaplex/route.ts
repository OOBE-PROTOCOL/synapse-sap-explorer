export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * POST /api/sap/agents/register/sap-to-metaplex
 *
 * SDK v0.9.3 — Flow A.
 * Caller already has a SAP agent. Mint a fresh MPL Core asset and
 * attach the AgentIdentity plugin pointing at the canonical SAP
 * registration URL — all in a single transaction.
 *
 * Request body:
 *   {
 *     "walletAddress": "<base58>",  // owner = SAP agent owner
 *     "name":          "<string>",  // MPL Core asset name
 *     "metadataUri":   "<string>"   // off-chain JSON URI
 *   }
 *
 * Response: RegisterFlowResult
 *   {
 *     "ok": true,
 *     "base64Tx": "<wallet-ready partial-signed tx>",
 *     "sapAgentPda": "<base58>",
 *     "assetAddress": "<base58>",
 *     "registrationUrl": "https://explorer.oobeprotocol.ai/agents/<pda>/eip-8004.json",
 *     "alreadyRegistered": false,
 *     "message": "...",
 *     "error": null
 *   }
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { buildSapToMetaplexFlow } from '~/lib/sap/metaplex-link';

interface RequestBody {
  walletAddress?: unknown;
  name?: unknown;
  metadataUri?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (
      typeof body.walletAddress !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.metadataUri !== 'string'
    ) {
      return synapseResponse(
        { error: 'walletAddress, name, metadataUri are required strings' },
        { status: 400 },
      );
    }

    const result = await buildSapToMetaplexFlow({
      walletAddress: body.walletAddress,
      name: body.name,
      metadataUri: body.metadataUri,
    });

    return synapseResponse(result, { status: result.ok ? 200 : 422 });
  } catch (err: unknown) {
    console.error('[register/sap-to-metaplex]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'flow build failed' },
      { status: 500 },
    );
  }
}
