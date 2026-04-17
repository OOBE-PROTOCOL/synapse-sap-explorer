export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/map — Lightweight wallet→agent name map
 *
 * SWR cached (5min fresh, 50min stale window).
 * Tries DB first, then falls back to RPC.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { findAllAgents, serializeDiscoveredAgent } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllAgents } from '~/lib/db/queries';

type AgentMap = Record<string, { name: string; pda: string; score: number }>;

async function rpcFetchAgentMap(): Promise<AgentMap> {
  const agents = await findAllAgents();
  const map: AgentMap = {};
  for (const agent of agents) {
    const s = serializeDiscoveredAgent(agent);
    if (s.identity?.wallet) {
      map[s.identity.wallet] = {
        name: s.identity.name || s.identity.agentId || '',
        pda: s.pda,
        score: s.identity.reputationScore ?? 0,
      };
    }
  }
  return map;
}

export async function GET() {
  try {
    // Step 1: cache peek
    const cached = peek<AgentMap>('agents:map');
    if (cached && Object.keys(cached).length > 0) {
      swr('agents:map', rpcFetchAgentMap, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return NextResponse.json(cached);
    }

    // Step 2: DB read
    try {
      const dbRows = await selectAllAgents();
      if (dbRows.length > 0) {
        const map: AgentMap = {};
        for (const row of dbRows) {
          if (row.wallet) {
            map[row.wallet] = {
              name: row.name || row.agentId || '',
              pda: row.pda,
              score: row.reputationScore ?? 0,
            };
          }
        }
        swr('agents:map', rpcFetchAgentMap, { ttl: 60_000, swr: 300_000 }).catch(() => {});
        return NextResponse.json(map);
      }
    } catch (e) {
      console.warn('[agents/map] DB read failed:', (e as Error).message, '| cause:', (e as any).cause?.message ?? 'none');
    }

    // Step 3: cold start
    const data = await rpcFetchAgentMap();
    swr('agents:map', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build agent map';
    console.error('[agents/map]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
