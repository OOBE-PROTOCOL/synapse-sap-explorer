export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet] — Agent profile by wallet
 *
 * 1) SWR in-memory cache (60s fresh, 5min stale)
 * 2) DB first → RPC fallback → DB write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import {
  getAgentProfile,
  serializeAgentProfile,
} from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectAgentByWallet, upsertAgent } from '~/lib/db/queries';
import { dbAgentToApi, apiAgentToDb } from '~/lib/db/mappers';

export const GET = withSynapseError(async (
  _req: Request,
  ...args: unknown[]
) => {
  const { params: paramsPromise } = args[0] as { params: Promise<{ wallet: string }> };
  const { wallet } = await paramsPromise;

  const profile = await swr(`agent:${wallet}`, async () => {
    // --- DB first ---
    try {
      const row = await selectAgentByWallet(wallet);
      if (row) return { source: 'db' as const, profile: dbAgentToApi(row) };
    } catch { /* DB unavailable — fall through */ }

    // --- RPC fallback ---
    const rpcProfile = await getAgentProfile(wallet);
    if (!rpcProfile) return null;

    const serialized = serializeAgentProfile(rpcProfile);

    // Write-back to DB (non-blocking)
    try {
      const dbRow = apiAgentToDb(serialized);
      upsertAgent(dbRow).catch(() => {});
    } catch { /* ignore */ }

    return { source: 'rpc' as const, profile: serialized };
  }, { ttl: 60_000, swr: 300_000 });

  if (!profile) {
    return synapseResponse(
      { error: 'Agent not found' },
      { status: 404 },
    );
  }

  return synapseResponse({ profile: profile.profile });
});
