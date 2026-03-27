export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents — Discover agents on-chain
 *
 * Query params:
 *   capability  — filter by capability id
 *   protocol    — filter by protocol
 *   limit       — max results (default 50)
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import type { DiscoveredAgent } from '~/lib/sap/discovery';
import {
  findAgentsByCapability,
  findAgentsByProtocol,
  findAllAgents,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllAgents, upsertAgents } from '~/lib/db/queries';
import { dbAgentToApi, apiAgentToDb } from '~/lib/db/mappers';

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

  // Write to DB (non-blocking)
  upsertAgents(serialized.map(apiAgentToDb)).catch((e) =>
    console.warn('[agents] DB write failed:', (e as Error).message),
  );

  return { agents: serialized, total: serialized.length };
}

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);

  const capability = searchParams.get('capability');
  const protocol = searchParams.get('protocol');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const cacheKey = `agents:${capability ?? ''}:${protocol ?? ''}:${limit}`;

  // ── Step 1: Synchronous cache peek (0ms) ──
  const cached = peek<{ agents: any[]; total: number }>(cacheKey);
  if (cached && cached.agents?.length > 0) {
    // Return instantly, revalidate from RPC in background
    swr(cacheKey, () => rpcFetchAgents(capability, protocol, limit), {
      ttl: 60_000, swr: 300_000,
    }).catch(() => {});
    return synapseResponse(cached);
  }

  // ── Step 2: DB read (~10ms) — fast initial response ──
  try {
    const dbRows = await selectAllAgents();
    if (dbRows.length > 0) {
      const mapped = dbRows.map(dbAgentToApi);
      let filtered = mapped;
      if (capability) {
        filtered = mapped.filter((a: any) =>
          a.identity?.capabilities?.some((c: any) => c.id === capability),
        );
      } else if (protocol) {
        filtered = mapped.filter((a: any) =>
          a.identity?.protocols?.includes(protocol),
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
  }

  // ── Step 3: Cold start — no cache, no DB. Must await RPC. ──
  console.log('[agents] Cold start — fetching from RPC');
  const data = await rpcFetchAgents(capability, protocol, limit);

  // Seed the SWR cache
  swr(cacheKey, () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});

  return synapseResponse(data);
});
