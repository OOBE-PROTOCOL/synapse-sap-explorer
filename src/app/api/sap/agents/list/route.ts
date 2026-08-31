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

import { NextResponse } from 'next/server';
import { loadIndexedSerializedAgents, loadDbTools } from '~/lib/sap/agent-index';
import { swr, peek } from '~/lib/cache';
import type { SerializedDiscoveredAgent } from '~/types/sap';

export interface AgentListItem {
  agent: SerializedDiscoveredAgent;
  onChainToolCount: number;
}

export interface AgentListResponse {
  agents: AgentListItem[];
  total: number;
}

async function build(): Promise<AgentListResponse> {
  const [{ agents: rawAgents }, allTools] = await Promise.all([
    loadIndexedSerializedAgents(),
    loadDbTools().catch(() => []),
  ]);

  const agents = rawAgents.slice(0, 100);

  const toolCount = new Map<string, number>();
  for (const tool of allTools) {
    const agentPda = (tool.descriptor as { agent?: { toBase58?: () => string; toString?: () => string } })?.agent;
    if (!agentPda) continue;
    const key = typeof agentPda === 'string'
      ? agentPda
      : (agentPda.toBase58?.() ?? agentPda.toString?.() ?? String(agentPda));
    toolCount.set(key, (toolCount.get(key) ?? 0) + 1);
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
