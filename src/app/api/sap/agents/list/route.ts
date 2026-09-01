/**
 * GET /api/sap/agents/list
 *
 * Lite, on-chain-only listing for the /agents page. Returns instantly
 * (sub-second after the in-process cache warms up) with only the data
 * needed for the first paint:
 *
 *   • serialized agent identity + PDA
 *   • on-chain tool count (from `findAllTools`)
 *
 * Heavy slices (balances, well-known, metadata, staking, metaplex, logos)
 * are fetched lazily per-row via /api/sap/agents/[wallet]/enrich once a
 * card scrolls into view — Solscan-style progressive loading.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { swr, peek } from '~/lib/cache';
import type { SerializedDiscoveredAgent } from '~/types/sap';
import { selectAllAgents, selectAllTools } from '~/lib/db/queries';
import { dbAgentToApi } from '~/lib/db/mappers';
import { asPublicKeyText } from '~/lib/format';

export interface AgentListItem {
  agent: SerializedDiscoveredAgent;
  onChainToolCount: number;
}

export interface AgentListResponse {
  agents: AgentListItem[];
  total: number;
}

async function build(): Promise<AgentListResponse> {
  const [agentRows, toolRows] = await Promise.all([
    selectAllAgents().catch(() => []),
    selectAllTools().catch(() => []),
  ]);

  let agents: SerializedDiscoveredAgent[] = agentRows
    .slice(0, 100)
    .map((row) => {
      const api = dbAgentToApi(row);
      return {
        pda: asPublicKeyText(api.pda),
        identity: api.identity ?? null,
        stats: null,
      };
    });

  const toolCount = new Map<string, number>();
  for (const tool of toolRows) {
    const key = asPublicKeyText(tool.agentPda);
    if (!key) continue;
    toolCount.set(key, (toolCount.get(key) ?? 0) + 1);
  }

  if (agents.length === 0) {
    const { findAllAgents, findAllTools, serializeDiscoveredAgent } = await import('~/lib/sap/discovery');
    const [rawAgents, allTools] = await Promise.all([
      findAllAgents().catch(() => []),
      findAllTools().catch(() => []),
    ]);
    const seen = new Set<string>();
    const unique = rawAgents.filter((a) => {
      const key = a.pda.toBase58();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    agents = unique.slice(0, 100).map(serializeDiscoveredAgent);
    for (const tool of allTools) {
      const agentPda = asPublicKeyText((tool.descriptor as { agent?: unknown } | null)?.agent);
      if (!agentPda) continue;
      toolCount.set(agentPda, (toolCount.get(agentPda) ?? 0) + 1);
    }
  }

  return {
    agents: agents.map((agent) => ({
      agent,
      onChainToolCount: toolCount.get(agent.pda) ?? 0,
    })),
    total: agents.length,
  };
}

export async function GET() {
  try {
    const key = 'agents:list';
    const cached = peek<AgentListResponse>(key);
    if (cached) {
      swr(key, build, { ttl: 30_000, swr: 300_000 }).catch(() => {});
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' },
      });
    }
    const data = await swr(key, build, { ttl: 30_000, swr: 300_000 });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[agents/list] Error:', err);
    return NextResponse.json({ error: 'Failed to load agent list' }, { status: 500 });
  }
}
