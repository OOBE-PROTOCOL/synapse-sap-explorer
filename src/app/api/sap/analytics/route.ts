/* ──────────────────────────────────────────────
 * GET /api/sap/analytics — Tool category summary
 *
 * Returns tool counts by category across the SAP network.
 * Uses DiscoveryRegistry.getToolCategorySummary().
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getToolCategorySummary } from '~/lib/sap/discovery';

export const GET = withSynapseError(async () => {
  const summary = await getToolCategorySummary();
  return synapseResponse({ categories: summary });
});
