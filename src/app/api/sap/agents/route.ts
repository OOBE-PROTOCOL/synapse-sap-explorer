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
import { swr } from '~/lib/cache';
import { selectAllAgents, upsertAgents } from '~/lib/db/queries';
import { dbAgentToApi, apiAgentToDb } from '~/lib/db/mappers';

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);

  const capability = searchParams.get('capability');
  const protocol = searchParams.get('protocol');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const cacheKey = `agents:${capability ?? ''}:${protocol ?? ''}:${limit}`;

  const data = await swr(cacheKey, async () => {
    // 1. Try DB first (fast — <10ms)
    try {
      const dbRows = await selectAllAgents();
      if (dbRows.length > 0) {
        const mapped = dbRows.map(dbAgentToApi);
        // Apply filters if needed
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
        return { agents: limited, total: limited.length };
      }
    } catch (e) {
      console.warn('[agents] DB read failed:', (e as Error).message);
    }

    // 2. Fallback to RPC
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

    // 3. Write to DB (non-blocking)
    upsertAgents(serialized.map(apiAgentToDb)).catch((e) =>
      console.warn('[agents] DB write failed:', (e as Error).message),
    );

    return { agents: serialized, total: serialized.length };
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
