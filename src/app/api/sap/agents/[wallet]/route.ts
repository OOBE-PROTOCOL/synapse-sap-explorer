export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet] — Agent profile by wallet
 *
 * 1) SWR in-memory cache (60s fresh, 5min stale)
 * 2) DB first → RPC fallback → DB write-back
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import {
  findAllAgents,
  getAgentProfile,
  serializeDiscoveredAgent,
  serializeAgentProfile,
} from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectAgentByPda, selectAgentByWallet, upsertAgent } from '~/lib/db/queries';
import { dbAgentToApi, apiAgentToDb } from '~/lib/db/mappers';
import { asPublicKeyText } from '~/lib/format';
import type { SerializedAgentProfile, SerializedDiscoveredAgent } from '~/types/sap';

function discoveredToProfile(agent: SerializedDiscoveredAgent): SerializedAgentProfile | null {
  if (!agent.identity) return null;
  const identity = agent.identity;
  const statsCalls = agent.stats?.totalCallsServed;
  const totalCalls = String(identity.totalCallsServed ?? statsCalls ?? '0');
  return {
    pda: asPublicKeyText(agent.pda),
    identity: {
      ...identity,
      wallet: asPublicKeyText(identity.wallet),
    },
    stats: agent.stats
      ? {
        ...agent.stats,
        agent: asPublicKeyText(agent.stats.agent),
        wallet: asPublicKeyText(agent.stats.wallet),
      }
      : null,
    computed: {
      isActive: identity.isActive ?? false,
      totalCalls,
      reputationScore: identity.reputationScore ?? 0,
      hasX402: !!identity.x402Endpoint,
      capabilityCount: identity.capabilities?.length ?? 0,
      pricingTierCount: identity.pricing?.length ?? 0,
      protocols: identity.protocols ?? [],
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: rawWallet } = await params;
    const wallet = asPublicKeyText(rawWallet) || rawWallet;

    const profile = await swr(`agent:${wallet}`, async () => {
      // --- DB first ---
      try {
        const row = await selectAgentByWallet(wallet) ?? await selectAgentByPda(wallet);
        if (row) return { source: 'db' as const, profile: dbAgentToApi(row) };
      } catch (e) { console.warn(`[agent/${wallet}] DB read failed:`, (e as Error).message); /* fall through to RPC */ }

      // --- RPC fallback ---
      const rpcProfile = await getAgentProfile(wallet).catch(() => null);
      if (!rpcProfile) {
        const agents = await findAllAgents().catch(() => []);
        const discovered = agents.find((a) => asPublicKeyText(a.pda) === wallet);
        if (!discovered) return null;

        const serializedAgent = serializeDiscoveredAgent(discovered);
        const discoveredProfile = discoveredToProfile(serializedAgent);
        if (!discoveredProfile) return null;

        try {
          const dbRow = apiAgentToDb(discoveredProfile);
          upsertAgent(dbRow).catch(() => {});
        } catch (e) { console.warn(`[agent/${wallet}] DB write-back failed:`, (e as Error).message); }

        return { source: 'rpc' as const, profile: discoveredProfile };
      }

      const serialized = serializeAgentProfile(rpcProfile);

      if (serialized?.pda && serialized.identity?.wallet) {
        try {
          const dbRow = apiAgentToDb(serialized);
          upsertAgent(dbRow).catch(() => {});
        } catch (e) { console.warn(`[agent/${wallet}] DB write-back failed:`, (e as Error).message); }
      }

      return { source: 'rpc' as const, profile: serialized };
    }, { ttl: 60_000, swr: 300_000 });

    if (!profile) {
      return synapseResponse(
        { error: 'Agent not found' },
        { status: 404 },
      );
    }

    return synapseResponse({ profile: profile.profile });
  } catch (err: unknown) {
    console.error('[agent/wallet]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'Failed to fetch agent' },
      { status: 500 },
    );
  }
}
