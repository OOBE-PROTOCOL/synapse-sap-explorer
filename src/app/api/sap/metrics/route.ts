/* ──────────────────────────────────────────────
 * GET /api/sap/metrics — Network overview (GlobalRegistry)
 *
 * Returns total agents, active agents, total tools,
 * vaults, attestations, capabilities, protocols.
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getNetworkOverview, serializeOverview } from '~/lib/sap/discovery';

export const GET = withSynapseError(async () => {
  const overview = await getNetworkOverview();
  return synapseResponse(serializeOverview(overview));
});
