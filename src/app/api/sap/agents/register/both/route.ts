export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * POST /api/sap/agents/register/both
 *
 * SDK v0.9.3 — Flow C (atomic).
 * Caller has neither side of the link. Builds a single transaction
 * with three instructions:
 *   1. SAP `registerAgent`
 *   2. MPL Core `create` (fresh asset)
 *   3. MPL `addExternalPluginAdapterV1` (AgentIdentity)
 *
 * The fresh asset Keypair is generated server-side, used to
 * partial-sign the transaction, and never returned to the client.
 *
 * Request body:
 *   {
 *     "walletAddress": "<base58>",
 *     "registerArgs":  { name, capabilities, metadataUri, ... },  // SDK RegisterAgentInput
 *     "mintName":      "<string>",
 *     "mintMetadataUri": "<string>"
 *   }
 *
 * Response: RegisterFlowResult
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { buildLinkBothFlow } from '~/lib/sap/metaplex-link';
import type { RegisterAgentInput } from '@oobe-protocol-labs/synapse-sap-sdk/registries';

interface RequestBody {
  walletAddress?: unknown;
  registerArgs?: unknown;
  mintName?: unknown;
  mintMetadataUri?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (typeof body.walletAddress !== 'string') {
      return synapseResponse({ error: 'walletAddress is required' }, { status: 400 });
    }
    if (typeof body.mintName !== 'string' || typeof body.mintMetadataUri !== 'string') {
      return synapseResponse(
        { error: 'mintName and mintMetadataUri are required strings' },
        { status: 400 },
      );
    }
    if (!body.registerArgs || typeof body.registerArgs !== 'object') {
      return synapseResponse(
        { error: 'registerArgs is required (RegisterAgentInput object)' },
        { status: 400 },
      );
    }

    const result = await buildLinkBothFlow({
      walletAddress: body.walletAddress,
      registerArgs: body.registerArgs as RegisterAgentInput,
      mintName: body.mintName,
      mintMetadataUri: body.mintMetadataUri,
    });

    return synapseResponse(result, { status: result.ok ? 200 : 422 });
  } catch (err: unknown) {
    console.error('[register/both]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'flow build failed' },
      { status: 500 },
    );
  }
}
