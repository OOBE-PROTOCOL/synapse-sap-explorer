export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  findAllTools,
  findAllAgents,
  fetchIndexedAgents,
  fetchIndexedTools,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
import type { AgentWellKnown } from '~/lib/sap/well-known';
import { getCachedAgentMetaplexBatch } from '~/lib/sap/metaplex-snapshot-store';
import { getCachedAgentLogosBatch, type AgentLogoSnapshot } from '~/lib/sap/agent-logo-store';
import {
  fetchSolPrice,
  getCachedAgentEnrichmentBatch,
  type AgentEnrichmentSnapshot,
  type AgentBalanceSummary,
  type AgentMetadata,
  type AgentStakeSummary,
} from '~/lib/sap/agent-enrichment-store';
import { swr, peek } from '~/lib/cache';
import type { SerializedDiscoveredAgent } from '~/types/sap';
import {
  getAgentRevenueSnapshots,
  selectAgentDirectorySnapshots,
  selectToolStatsByAgent,
  upsertAgentDirectorySnapshots,
  upsertEntityAliases,
  type AgentRevenueSnapshot,
  type EntityAliasInsert,
} from '~/lib/db/queries';
import { isDbDown } from '~/db';
import { asPublicKeyText } from '~/lib/format';

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

export interface AgentDataQuality {
  status: 'verified' | 'snapshot' | 'partial';
  verifiedAt: string;
  snapshotAgeMs?: number;
  warnings: string[];
  sources: {
    rpc: 'verified' | 'stale' | 'unavailable';
    db: 'snapshot' | 'live' | 'unavailable';
    metaplex: 'verified' | 'cached' | 'none' | 'unavailable';
    balances: 'verified' | 'cached' | 'none' | 'unavailable';
    revenue: 'verified' | 'snapshot' | 'none' | 'unavailable';
  };
}

export interface EnrichedAgent {
  agent: SerializedDiscoveredAgent;
  balances: AgentBalanceSummary | null;
  wellKnown: AgentWellKnown | null;
  metadata: AgentMetadata | null;
  revenue: AgentRevenueSnapshot | null;
  onChainToolCount: number;
  toolDescriptorCount: number;
  inscribedToolCount: number;
  inscribedSchemaCount: number;
  toolEventCount: number;
  deployedTokenCount: number;
  staking: AgentStakeSummary | null;
  metaplex: AgentMetaplexBadge | null;
  logos: AgentLogoSnapshot | null;
  dataQuality: AgentDataQuality;
}

export interface EnrichedAgentsResponse {
  agents: EnrichedAgent[];
  total: number;
  solPrice: number | null;
}

/* ── Assembly ─────────────────────────────────────────── */

const ENRICHED_REFRESH_TIMEOUT_MS = 12_000;
const ENRICHED_SNAPSHOT_TIMEOUT_MS = 1_500;
const ENRICHED_INITIAL_WAIT_MS = 750;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

function hasMetaplexSignal(agent: EnrichedAgent): boolean {
  return Boolean(
    agent.metaplex?.linked ||
    (agent.metaplex?.pluginCount ?? 0) > 0 ||
    (agent.metaplex?.registryCount ?? 0) > 0 ||
    agent.logos?.mplAsset ||
    agent.logos?.mplImage,
  );
}

function numeric(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function healthScore(agent: EnrichedAgent): number {
  const id = agent.agent.identity;
  if (!id?.isActive) return 0;
  const feedbacks = Number(id.totalFeedbacks ?? 0);
  const rep = Number(id.reputationScore ?? 0);
  const uptime = Number(id.uptimePercent ?? 0);
  const latency = Number(id.avgLatencyMs ?? 0);
  let score = 30;
  score += feedbacks === 0 ? 15 : Math.min(rep / 10000, 1) * 30;
  score += (uptime / 100) * 20;
  if (latency === 0) score += 10;
  else if (latency < 500) score += 20;
  else if (latency < 2000) score += 15;
  else if (latency < 5000) score += 10;
  else score += 5;
  return Math.round(score);
}

function activityScore(agent: EnrichedAgent): number {
  const tools = agent.onChainToolCount ?? 0;
  const revenue = Math.max(
    numeric(agent.revenue?.volume7dLamports),
    numeric(agent.revenue?.totalSettledLamports),
  ) / 1e9;
  const calls = Math.max(numeric(agent.revenue?.calls7d), numeric(agent.revenue?.totalCalls));
  const caps = agent.agent.identity?.capabilities.length ?? 0;
  return (
    (tools > 0 ? 1_000_000_000 : 0) +
    tools * 10_000_000 +
    revenue * 100_000 +
    calls * 1_000 +
    caps * 25 +
    (hasMetaplexSignal(agent) ? 15 : 0) +
    healthScore(agent)
  );
}

function verifiedQuality(agent: Omit<EnrichedAgent, 'dataQuality'>): AgentDataQuality {
  const now = new Date().toISOString();
  return {
    status: 'verified',
    verifiedAt: now,
    warnings: [
      !agent.balances ? 'balances-not-verified-this-response' : '',
      !agent.revenue ? 'no-indexed-revenue-for-agent' : '',
    ].filter(Boolean),
    sources: {
      rpc: 'verified',
      db: 'live',
      metaplex: agent.metaplex
        ? agent.metaplex.linked || agent.metaplex.pluginCount > 0 || agent.metaplex.registryCount > 0
          ? 'cached'
          : 'none'
        : 'unavailable',
      balances: agent.balances ? 'cached' : 'none',
      revenue: agent.revenue ? 'snapshot' : 'none',
    },
  };
}

async function readSnapshotResponse(): Promise<EnrichedAgentsResponse | null> {
  const rows = await withTimeout(
    selectAgentDirectorySnapshots(200),
    ENRICHED_SNAPSHOT_TIMEOUT_MS,
    'agent directory snapshot db read',
  ).catch(() => []);
  if (rows.length === 0) return null;
  const now = Date.now();
  let solPrice: number | null = await fetchSolPrice().catch(() => null);
  const agents = rows.map((row) => {
    const payload = row.payload as unknown as EnrichedAgent;
    if (solPrice == null && payload.balances?.solUsd != null && payload.balances.sol > 0) {
      solPrice = payload.balances.solUsd / payload.balances.sol;
    }
    const verifiedAt = new Date(row.verifiedAt).toISOString();
    return {
      ...payload,
      dataQuality: {
        ...(payload.dataQuality ?? {}),
        status: 'snapshot',
        verifiedAt,
        snapshotAgeMs: now - new Date(row.verifiedAt).getTime(),
        warnings: Array.from(new Set([
          ...(payload.dataQuality?.warnings ?? []),
          'served-from-agent-directory-snapshot',
        ])),
        sources: {
          ...(payload.dataQuality?.sources ?? {}),
          db: 'snapshot',
          rpc: 'stale',
        },
      },
    } satisfies EnrichedAgent;
  });
  return { agents, total: agents.length, solPrice };
}

async function readBestEffortResponse(
  cacheKey: string,
): Promise<{ data: EnrichedAgentsResponse; source: string } | null> {
  const cached = peek<EnrichedAgentsResponse>(cacheKey);
  if (cached) return { data: cached, source: 'stale-memory-cache' };

  const snapshot = await readSnapshotResponse().catch(() => null);
  if (snapshot) return { data: snapshot, source: 'agent-directory-snapshot' };

  const overview = readOverviewAgentFallback();
  if (overview) return { data: overview, source: 'overview-cache' };

  return null;
}

function partialQuality(source: 'overview-cache' | 'rpc-lite'): AgentDataQuality {
  return {
    status: 'partial',
    verifiedAt: new Date().toISOString(),
    warnings: [`served-from-${source}`],
    sources: {
      rpc: source === 'rpc-lite' ? 'verified' : 'stale',
      db: 'unavailable',
      metaplex: 'unavailable',
      balances: 'unavailable',
      revenue: 'unavailable',
    },
  };
}

function toPartialEnrichedAgent(agent: SerializedDiscoveredAgent, source: 'overview-cache' | 'rpc-lite'): EnrichedAgent {
  return {
    agent,
    balances: null,
    wellKnown: null,
    metadata: null,
    revenue: null,
    onChainToolCount: 0,
    toolDescriptorCount: 0,
    inscribedToolCount: 0,
    inscribedSchemaCount: 0,
    toolEventCount: 0,
    deployedTokenCount: 0,
    staking: null,
    metaplex: null,
    logos: null,
    dataQuality: partialQuality(source),
  };
}

function readOverviewAgentFallback(): EnrichedAgentsResponse | null {
  const overview = peek<{
    agents?: { agents?: SerializedDiscoveredAgent[]; total?: number };
  }>('overview-batch');
  const agents = overview?.agents?.agents;
  if (!Array.isArray(agents) || agents.length === 0) return null;
  return {
    agents: agents.map((agent) => toPartialEnrichedAgent(agent, 'overview-cache')),
    total: overview?.agents?.total ?? agents.length,
    solPrice: null,
  };
}

async function persistTruthLayer(agents: EnrichedAgent[], allTools: Awaited<ReturnType<typeof findAllTools>>) {
  const aliasRows: EntityAliasInsert[] = [];
  const now = new Date();
  for (const agent of agents) {
    const pda = asPublicKeyText(agent.agent.pda);
    const wallet = asPublicKeyText(agent.agent.identity?.wallet);
    if (!pda) continue;
    aliasRows.push({
      alias: pda,
      canonical: pda,
      entityType: 'agent',
      relation: 'self',
      source: 'sap-rpc',
      confidence: 100,
      metadata: { name: agent.agent.identity?.name ?? null },
      lastSeenAt: now,
    });
    if (wallet) {
      aliasRows.push({
        alias: wallet,
        canonical: pda,
        entityType: 'wallet',
        relation: 'owner_wallet',
        source: 'sap-rpc',
        confidence: 100,
        metadata: { agentPda: pda, name: agent.agent.identity?.name ?? null },
        lastSeenAt: now,
      });
    }
    if (agent.metaplex?.asset) {
      aliasRows.push({
        alias: agent.metaplex.asset,
        canonical: pda,
        entityType: 'mpl_asset',
        relation: agent.metaplex.linked ? 'verified_mpl_asset' : 'metaplex_signal',
        source: 'metaplex',
        confidence: agent.metaplex.linked ? 100 : 70,
        metadata: { wallet, linked: agent.metaplex.linked },
        lastSeenAt: now,
      });
    }
  }

  for (const tool of allTools) {
    const toolPda = asPublicKeyText(tool.pda);
    const agentPda = asPublicKeyText((tool.descriptor as { agent?: unknown } | null)?.agent);
    if (!toolPda || !agentPda) continue;
    aliasRows.push({
      alias: toolPda,
      canonical: agentPda,
      entityType: 'tool',
      relation: 'tool_owner',
      source: 'sap-rpc',
      confidence: 100,
      metadata: { toolName: (tool.descriptor as { toolName?: unknown } | null)?.toolName ?? null },
      lastSeenAt: now,
    });
  }

  const snapshotRows = agents
    .filter((agent) => asPublicKeyText(agent.agent.pda) && asPublicKeyText(agent.agent.identity?.wallet))
    .map((agent) => {
      const pda = asPublicKeyText(agent.agent.pda);
      const wallet = asPublicKeyText(agent.agent.identity?.wallet);
      const score = activityScore(agent);
      return {
        agentPda: pda,
        wallet,
        name: agent.agent.identity?.name ?? '',
        isActive: Boolean(agent.agent.identity?.isActive),
        isMerchant: agent.onChainToolCount > 0,
        hasMetaplex: hasMetaplexSignal(agent),
        toolCount: agent.onChainToolCount,
        volume24hLamports: agent.revenue?.volume24hLamports ?? '0',
        volume7dLamports: agent.revenue?.volume7dLamports ?? '0',
        totalSettledLamports: agent.revenue?.totalSettledLamports ?? '0',
        calls7d: agent.revenue?.calls7d ?? '0',
        totalCalls: agent.revenue?.totalCalls ?? '0',
        healthScore: healthScore(agent),
        activityScore: String(Math.round(score)),
        payload: agent as unknown as Record<string, unknown>,
        sources: agent.dataQuality.sources,
        verifiedAt: now,
      };
    });

  await Promise.allSettled([
    upsertEntityAliases(aliasRows),
    upsertAgentDirectorySnapshots(snapshotRows),
  ]);
}

async function fetchEnrichedAgents(): Promise<EnrichedAgentsResponse> {
  const [indexedAgents, indexedTools] = await Promise.all([
    fetchIndexedAgents(),
    fetchIndexedTools(),
  ]);

  const rawAgents = indexedAgents.length > 0 ? indexedAgents : await findAllAgents();
  const allTools = indexedTools.length > 0
    ? indexedTools
    : await findAllTools().catch(() => [] as Awaited<ReturnType<typeof findAllTools>>);

  // Dedup by PDA, cap at 100.
  const seen = new Set<string>();
  const unique = rawAgents.filter((a) => {
    const key = a.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const agents: SerializedDiscoveredAgent[] = unique.slice(0, 100).map(serializeDiscoveredAgent);

  // PDA → tool count
  const toolCountByAgent = new Map<string, number>();
  for (const tool of allTools) {
    const agentPda = asPublicKeyText((tool.descriptor as { agent?: unknown })?.agent);
    if (!agentPda) continue;
    toolCountByAgent.set(agentPda, (toolCountByAgent.get(agentPda) ?? 0) + 1);
  }

  const indexedToolStats = new Map<string, {
    distinctTools: number;
    schemaCount: number;
    eventCount: number;
  }>();
  if (!isDbDown()) {
    const rows = await selectToolStatsByAgent().catch(() => []);
    for (const row of rows) {
      const agentPda = asPublicKeyText(row.agentPda);
      if (!agentPda) continue;
      indexedToolStats.set(agentPda, {
        distinctTools: Number(row.distinctTools ?? 0),
        schemaCount: Number(row.schemaCount ?? 0),
        eventCount: Number(row.eventCount ?? 0),
      });
    }
  }

  const revenueByAgent = await getAgentRevenueSnapshots(14)
    .catch((e) => {
      console.warn('[enriched] revenue snapshots unavailable:', (e as Error).message);
      return new Map<string, AgentRevenueSnapshot>();
    });

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

  // Surface the freshest SOL price from CoinGecko cache, falling back to
  // balance-derived snapshots when the price endpoint is unavailable.
  let solPrice: number | null = await fetchSolPrice().catch(() => null);
  const enriched: EnrichedAgent[] = agents.map((agent) => {
    const wallet = agent.identity?.wallet ?? null;
    const snap: AgentEnrichmentSnapshot | null = wallet
      ? (enrichmentMap.get(wallet) ?? null)
      : null;
    if (snap?.balances?.solUsd != null && snap.balances.sol > 0 && solPrice == null) {
      solPrice = snap.balances.solUsd / snap.balances.sol;
    }
    const base = {
      agent,
      balances: snap?.balances ?? null,
      wellKnown: snap?.wellKnown ?? null,
      metadata: snap?.metadata ?? null,
      revenue: revenueByAgent.get(agent.pda) ?? null,
      onChainToolCount: Math.max(
        toolCountByAgent.get(agent.pda) ?? 0,
        indexedToolStats.get(agent.pda)?.distinctTools ?? 0,
      ),
      toolDescriptorCount: toolCountByAgent.get(agent.pda) ?? 0,
      inscribedToolCount: indexedToolStats.get(agent.pda)?.distinctTools ?? 0,
      inscribedSchemaCount: indexedToolStats.get(agent.pda)?.schemaCount ?? 0,
      toolEventCount: indexedToolStats.get(agent.pda)?.eventCount ?? 0,
      deployedTokenCount: snap?.deployedTokenCount ?? 0,
      staking: snap?.staking ?? null,
      metaplex: wallet ? (metaplexBadgeMap.get(wallet) ?? null) : null,
      logos: wallet ? (logosMap.get(wallet) ?? null) : null,
    } satisfies Omit<EnrichedAgent, 'dataQuality'>;
    return {
      ...base,
      dataQuality: verifiedQuality(base),
    };
  });

  void persistTruthLayer(enriched, allTools).catch((e) => {
    console.warn('[enriched] truth layer persist failed:', (e as Error).message);
  });

  return { agents: enriched, total: enriched.length, solPrice };
}

export async function GET() {
  const cacheKey = 'agents:enriched';
  try {
    const cached = peek<EnrichedAgentsResponse>(cacheKey);
    if (cached) {
      swr(
        cacheKey,
        () => withTimeout(fetchEnrichedAgents(), ENRICHED_REFRESH_TIMEOUT_MS, 'agents enriched refresh'),
        { ttl: 30_000, swr: 180_000, silentRevalidationErrors: true },
      ).catch(() => {});
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
      });
    }
    const snapshot = await readSnapshotResponse();
    if (snapshot) {
      swr(
        cacheKey,
        () => withTimeout(fetchEnrichedAgents(), ENRICHED_REFRESH_TIMEOUT_MS, 'agents enriched refresh'),
        { ttl: 30_000, swr: 180_000, silentRevalidationErrors: true },
      ).catch(() => {});
      return NextResponse.json(snapshot, {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=180',
          'x-sap-data-source': 'agent-directory-snapshot',
        },
      });
    }
    const overviewFallback = readOverviewAgentFallback();
    if (overviewFallback) {
      swr(
        cacheKey,
        () => withTimeout(fetchEnrichedAgents(), ENRICHED_REFRESH_TIMEOUT_MS, 'agents enriched refresh'),
        { ttl: 30_000, swr: 180_000, silentRevalidationErrors: true },
      ).catch(() => {});
      return NextResponse.json(overviewFallback, {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=60',
          'x-sap-data-source': 'overview-cache',
        },
      });
    }
    const pending = swr(
      cacheKey,
      () => withTimeout(fetchEnrichedAgents(), ENRICHED_REFRESH_TIMEOUT_MS, 'agents enriched fetch'),
      { ttl: 30_000, swr: 180_000 },
    );
    const data = await withTimeout(pending, ENRICHED_INITIAL_WAIT_MS, 'agents enriched initial response')
      .catch(() => null);
    if (data) {
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
      });
    }

    return NextResponse.json(
      { agents: [], total: 0, solPrice: null } satisfies EnrichedAgentsResponse,
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'x-sap-data-source': 'live-refresh-pending',
        },
      },
    );
  } catch (err) {
    const message = (err as Error)?.message ?? 'unknown error';
    console.warn('[enriched] serving degraded response:', message);

    const bestEffort = await readBestEffortResponse(cacheKey);
    if (bestEffort) {
      return NextResponse.json(bestEffort.data, {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=180',
          'x-sap-data-source': bestEffort.source,
          'x-sap-warning': message,
        },
      });
    }

    return NextResponse.json(
      { agents: [], total: 0, solPrice: null } satisfies EnrichedAgentsResponse,
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'x-sap-data-source': 'degraded-empty',
          'x-sap-warning': message,
        },
      },
    );
  }
}
