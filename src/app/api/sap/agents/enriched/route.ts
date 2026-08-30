export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  findAllTools,
} from '~/lib/sap/discovery';
import { loadIndexedSerializedAgents } from '~/lib/sap/agent-index';
import type { AgentWellKnown } from '~/lib/sap/well-known';
import { getCachedAgentMetaplexBatch } from '~/lib/sap/metaplex-snapshot-store';
import { getCachedAgentLogosBatch, type AgentLogoSnapshot } from '~/lib/sap/agent-logo-store';
import {
  getCachedAgentEnrichmentBatch,
  type AgentEnrichmentSnapshot,
  type AgentBalanceSummary,
  type AgentMetadata,
  type AgentStakeSummary,
} from '~/lib/sap/agent-enrichment-store';
import { swr, peek } from '~/lib/cache';
import type { SerializedDiscoveredAgent } from '~/types/sap';

/* ── Re-exports (SDK / hook compat) ───────────────────── */

export type {
  TokenBalance,
  AgentBalanceSummary,
  AgentStakeSummary,
  AgentMetadata,
} from '~/lib/sap/agent-enrichment-store';

export interface AgentMetaplexBadge {
  asset: string | null;
  linked: boolean;
  pluginCount: number;
  registryCount: number;
}

export interface EnrichedAgent {
  agent: SerializedDiscoveredAgent;
  balances: AgentBalanceSummary | null;
  wellKnown: AgentWellKnown | null;
  metadata: AgentMetadata | null;
  onChainToolCount: number;
  deployedTokenCount: number;
  staking: AgentStakeSummary | null;
  metaplex: AgentMetaplexBadge | null;
  logos: AgentLogoSnapshot | null;
}

export interface EnrichedAgentsResponse {
  agents: EnrichedAgent[];
  total: number;
  solPrice: number | null;
}

/* ── Assembly ─────────────────────────────────────────── */

async function fetchEnrichedAgents(): Promise<EnrichedAgentsResponse> {
  // Read from unified indexed source + on-chain tools.
  const [{ agents }, allTools] = await Promise.all([
    loadIndexedSerializedAgents(),
    findAllTools().catch(() => [] as Awaited<ReturnType<typeof findAllTools>>),
  ]);

  // PDA → tool count
  const toolCountByAgent = new Map<string, number>();
  for (const tool of allTools) {
    const agentPda = (tool.descriptor as { agent?: { toBase58?: () => string; toString?: () => string } })?.agent;
    if (agentPda) {
      const key = typeof agentPda === 'string' ? agentPda : (agentPda.toBase58?.() ?? agentPda.toString?.() ?? String(agentPda));
      toolCountByAgent.set(key, (toolCountByAgent.get(key) ?? 0) + 1);
    }
  }

  const wallets = agents.map((a) => a.identity?.wallet).filter(Boolean) as string[];
  const enrichmentInputs = agents
    .filter((a) => a.identity?.wallet)
    .map((a) => ({
      wallet: a.identity!.wallet,
      agentPda: a.pda,
      endpoint: a.identity?.x402Endpoint ?? null,
      agentUri: a.identity?.agentUri ?? null,
    }));

  // All three are DB-backed SWR batches: instant return + background refresh.
  const [enrichmentMap, metaplexBadgeMap, logosMap] = await Promise.all([
    getCachedAgentEnrichmentBatch(enrichmentInputs),
    getCachedAgentMetaplexBatch(wallets),
    getCachedAgentLogosBatch(
      enrichmentInputs.map((i) => ({ wallet: i.wallet, endpoint: i.endpoint })),
    ),
  ]);

  // Surface the most recent SOL price seen across cached snapshots.
  let solPrice: number | null = null;
  const enriched: EnrichedAgent[] = agents.map((agent) => {
    const wallet = agent.identity?.wallet ?? null;
    const snap: AgentEnrichmentSnapshot | null = wallet
      ? (enrichmentMap.get(wallet) ?? null)
      : null;
    if (snap?.balances?.solUsd != null && snap.balances.sol > 0 && solPrice == null) {
      solPrice = snap.balances.solUsd / snap.balances.sol;
    }
    return {
      agent,
      balances: snap?.balances ?? null,
      wellKnown: snap?.wellKnown ?? null,
      metadata: snap?.metadata ?? null,
      onChainToolCount: toolCountByAgent.get(agent.pda) ?? 0,
      deployedTokenCount: snap?.deployedTokenCount ?? 0,
      staking: snap?.staking ?? null,
      metaplex: wallet ? (metaplexBadgeMap.get(wallet) ?? null) : null,
      logos: wallet ? (logosMap.get(wallet) ?? null) : null,
    };
  });

  return { agents: enriched, total: enriched.length, solPrice };
}

export async function GET() {
  try {
    const cacheKey = 'agents:enriched';
    const cached = peek<EnrichedAgentsResponse>(cacheKey);
    if (cached) {
      swr(cacheKey, () => fetchEnrichedAgents(), { ttl: 30_000, swr: 180_000 }).catch(() => {});
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
      });
    }
    const data = await swr(cacheKey, () => fetchEnrichedAgents(), { ttl: 30_000, swr: 180_000 });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
    });
  } catch (err) {
    console.error('[enriched] Error:', err);
    return NextResponse.json({ error: 'Failed to enrich agents' }, { status: 500 });
  }
}
