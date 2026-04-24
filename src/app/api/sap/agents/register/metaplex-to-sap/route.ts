export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * POST /api/sap/agents/register/metaplex-to-sap
 *
 * SDK v0.9.3 — Flow B (idempotent).
 * Caller already owns an MPL Core asset (with or without AgentIdentity).
 * Build the SAP `registerAgent` instruction for the asset's owner.
 * If a SAP agent already exists, returns `alreadyRegistered: true` and
 * `base64Tx: null`.
 *
 * Request body:
 *   {
 *     "assetAddress": "<base58>",
 *     "registerArgs": { name, capabilities, metadataUri, ... }   // SDK RegisterAgentInput
 *   }
 *
 * Response: RegisterFlowResult
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { buildMetaplexToSapFlow } from '~/lib/sap/metaplex-link';
import type { RegisterAgentInput } from '@oobe-protocol-labs/synapse-sap-sdk/registries';

interface RequestBody {
  assetAddress?: unknown;
  registerArgs?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (typeof body.assetAddress !== 'string') {
      return synapseResponse(
        { error: 'assetAddress is required (base58 string)' },
        { status: 400 },
      );
    }
    if (!body.registerArgs || typeof body.registerArgs !== 'object') {
      return synapseResponse(
        { error: 'registerArgs is required (RegisterAgentInput object)' },
        { status: 400 },
      );
    }

    const result = await buildMetaplexToSapFlow({
      assetAddress: body.assetAddress,
      registerArgs: body.registerArgs as RegisterAgentInput,
    });

    return synapseResponse(result, { status: result.ok ? 200 : 422 });
  } catch (err: unknown) {
    console.error('[register/metaplex-to-sap]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'flow build failed' },
      { status: 500 },
    );
  }
}
