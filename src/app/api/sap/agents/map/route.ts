export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/map — Lightweight wallet→agent name map
 *
 * SWR cached (5min fresh, 50min stale window).
 * Tries DB first, then falls back to RPC.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { findAllAgents, serializeDiscoveredAgent } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectAllAgents } from '~/lib/db/queries';

export async function GET() {
  try {
    const data = await swr('agents:map', async () => {
      // 1. Try DB first
      try {
        const dbRows = await selectAllAgents();
        if (dbRows.length > 0) {
          const map: Record<string, { name: string; pda: string; score: number }> = {};
          for (const row of dbRows) {
            if (row.wallet) {
              map[row.wallet] = {
                name: row.name || row.agentId || '',
                pda: row.pda,
                score: row.reputationScore ?? 0,
              };
            }
          }
          return map;
        }
      } catch (e) {
        console.warn('[agents/map] DB read failed:', (e as Error).message);
      }

      // 2. Fallback to RPC
      const agents = await findAllAgents();
      const map: Record<string, { name: string; pda: string; score: number }> = {};
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
    }, { ttl: 300_000, swr: 3_000_000 });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build agent map';
    console.error('[agents/map]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
