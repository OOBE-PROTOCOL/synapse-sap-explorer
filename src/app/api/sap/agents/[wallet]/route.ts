export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet] — Agent profile by wallet
 *
 * Returns full agent profile (identity + stats + computed).
 * Uses DiscoveryRegistry.getAgentProfile() from SAP SDK.
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import {
  getAgentProfile,
  serializeAgentProfile,
} from '~/lib/sap/discovery';

export const GET = withSynapseError(async (
  _req: Request,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: { wallet: string } };

  const profile = await getAgentProfile(params.wallet);

  if (!profile) {
    return synapseResponse(
      { error: 'Agent not found' },
      { status: 404 },
    );
  }

  return synapseResponse({
    profile: serializeAgentProfile(profile),
  });
});
