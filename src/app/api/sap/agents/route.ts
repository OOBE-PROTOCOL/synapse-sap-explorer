export const dynamic = 'force-dynamic';

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import type { DiscoveredAgent } from '~/lib/sap/discovery';
import {
  findAgentsByCapability,
  findAgentsByProtocol,
  findAllAgents,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllAgents, upsertAgents, getAgentSettlementMap } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbAgentToApi, apiAgentToDb } from '~/lib/db/mappers';
import type { ApiAgent } from '~/types';

/** Fetch agents from RPC (source of truth), write to DB, return serialized */
async function rpcFetchAgents(
  capability: string | null,
  protocol: string | null,
  limit: number,
) {
  let agents: DiscoveredAgent[];
  if (capability) {
    agents = await findAgentsByCapability(capability);
  } else if (protocol) {
    agents = await findAgentsByProtocol(protocol);
  } else {
    agents = await findAllAgents();
  }

  // Deduplicate by PDA
  const seen = new Set<string>();
  const unique = agents.filter((a) => {
    const key = a.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const limited = unique.slice(0, limit);
  const serialized = limited.map(serializeDiscoveredAgent);

  // Merge settlement stats from escrows (data unification)
  try {
    const settlementMap = await getAgentSettlementMap();
    for (const agent of serialized) {
      const stats = settlementMap[agent.pda];
      if (stats) {
        (agent as ApiAgent).settlementStats = {
          totalSettled: stats.totalSettled,
          totalCalls: stats.totalCalls,
          totalDeposited: stats.totalDeposited,
          escrowCount: stats.escrowCount,
          activeEscrows: stats.activeEscrows,
        };
      }
    }
  } catch (e) { console.warn('[agents] settlement enrichment failed:', (e as Error).message); }

  // Write to DB (non-blocking)
  upsertAgents(serialized.map(apiAgentToDb)).catch((e) =>
    console.warn('[agents] DB write failed:', (e as Error).message),
  );

  // Kick off Metaplex snapshot refresh for any new wallet (non-blocking).
  // The snapshot store dedups inflight refreshes per wallet.
  void (async () => {
    const { invalidateMetaplexSnapshot } = await import('~/lib/sap/metaplex-snapshot-store');
    for (const a of serialized) {
      const w = a.identity?.wallet;
      if (w) invalidateMetaplexSnapshot(w).catch(() => {});
    }
  })();

  return { agents: serialized, total: serialized.length };
}

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);

  const capability = searchParams.get('capability');
  const protocol = searchParams.get('protocol');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const cacheKey = `agents:${capability ?? ''}:${protocol ?? ''}:${limit}`;

  // ── Step 1: Synchronous cache peek (0ms) ──
  const cached = peek<{ agents: ApiAgent[]; total: number }>(cacheKey);
  if (cached && cached.agents?.length > 0) {
    // Return instantly, revalidate from RPC in background
    swr(cacheKey, () => rpcFetchAgents(capability, protocol, limit), {
      ttl: 60_000, swr: 300_000,
    }).catch(() => {});
    return synapseResponse(cached);
  }

  // ── Step 2: DB read (~10ms) — fast initial response ──
  if (!isDbDown()) try {
    const dbRows = await selectAllAgents();
    if (dbRows.length > 0) {
      const mapped = dbRows.map(dbAgentToApi);
      let filtered = mapped;
      if (capability) {
        filtered = mapped.filter((a) =>
          (a as ApiAgent).identity?.capabilities?.some((c) => c.id === capability),
        );
      } else if (protocol) {
        filtered = mapped.filter((a) =>
          (a as ApiAgent).identity?.protocols?.includes(protocol),
        );
      }
      const limited = filtered.slice(0, limit);
      const result = { agents: limited, total: limited.length };

      // Fire-and-forget: warm SWR cache from RPC so next request has fresh data
      swr(cacheKey, () => rpcFetchAgents(capability, protocol, limit), {
        ttl: 60_000, swr: 300_000,
      }).catch(() => {});

      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[agents] DB read failed:', (e as Error).message);
    markDbDown();
  }

  // ── Cold start — no cache, no DB. Must await RPC. ──
  const data = await rpcFetchAgents(capability, protocol, limit);

  // Seed the SWR cache
  swr(cacheKey, () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});

  return synapseResponse(data);
});
