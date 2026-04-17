export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/graph — Network graph data for visualization
 *
 * Pipeline: cache → DB → RPC fallback
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import type { DiscoveredAgent } from '~/lib/sap/discovery';
import {
  findAgentsByProtocol,
  findAgentsByCapability,
  findAllAgents,
  findAllTools,
  buildGraphData,
  type GraphData,
} from '~/lib/sap/discovery';
import { selectAllAgents, selectAllTools } from '~/lib/db/queries';
import { swr, peek } from '~/lib/cache';

/* ── DB-based graph builder ──────────────────── */

function dbAgentsToGraphAgents(rows: Awaited<ReturnType<typeof selectAllAgents>>) {
  return rows.map((r) => ({
    pda: { toBase58: () => r.pda } as any,
    identity: {
      wallet: r.wallet,
      name: r.name,
      description: r.description,
      agentId: r.agentId,
      agentUri: r.agentUri,
      x402Endpoint: r.x402Endpoint,
      isActive: r.isActive,
      bump: r.bump,
      version: r.version,
      reputationScore: r.reputationScore,
      reputationSum: r.reputationSum,
      totalFeedbacks: r.totalFeedbacks,
      totalCallsServed: r.totalCallsServed,
      avgLatencyMs: r.avgLatencyMs,
      uptimePercent: r.uptimePercent,
      capabilities: r.capabilities ?? [],
      pricing: r.pricing ?? [],
      protocols: r.protocols ?? [],
      activePlugins: r.activePlugins ?? [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    } as any,
  }));
}

function dbToolsToGraphTools(rows: Awaited<ReturnType<typeof selectAllTools>>) {
  return rows.map((t) => ({
    pda: { toBase58: () => t.pda } as any,
    descriptor: {
      agent: t.agentPda,
      toolName: t.toolName,
      category: t.category ?? 'custom',
      httpMethod: t.httpMethod ?? 'GET',
      isActive: t.isActive,
      paramsCount: t.paramsCount,
      requiredParams: t.requiredParams,
      isCompound: t.isCompound,
      version: t.version,
      totalInvocations: t.totalInvocations,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    } as any,
  }));
}

async function dbFetchGraph(
  capability: string | null,
  protocol: string | null,
): Promise<GraphData | null> {
  const dbAgentRows = await selectAllAgents();
  if (dbAgentRows.length === 0) return null;

  let agents = dbAgentsToGraphAgents(dbAgentRows);

  // Apply filters
  if (capability) {
    agents = agents.filter((a: any) =>
      a.identity?.capabilities?.some((c: any) => c.id === capability),
    );
  } else if (protocol) {
    agents = agents.filter((a: any) =>
      a.identity?.protocols?.includes(protocol),
    );
  }

  const dbToolRows = await selectAllTools();
  const tools = dbToolsToGraphTools(dbToolRows);

  return buildGraphData(agents as any, tools as any);
}

/* ── RPC-based graph builder (original) ──────── */

async function rpcFetchGraph(
  capability: string | null,
  protocol: string | null,
): Promise<GraphData> {
  let agents: DiscoveredAgent[];
  if (capability) {
    agents = await findAgentsByCapability(capability);
  } else if (protocol) {
    agents = await findAgentsByProtocol(protocol);
  } else {
    agents = await findAllAgents();
  }
  const seen = new Set<string>();
  const unique = agents.filter((a) => {
    const key = a.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const tools = await findAllTools();
  return buildGraphData(unique, tools);
}

/* ── Handler ─────────────────────────────────── */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const protocol = searchParams.get('protocol');
    const capability = searchParams.get('capability');
    const cacheKey = `graph:${protocol ?? ''}:${capability ?? ''}`;

    // Step 1: cache peek
    const cached = peek<GraphData>(cacheKey);
    if (cached) {
      swr(cacheKey, () => rpcFetchGraph(capability, protocol), {
        ttl: 60_000,
        swr: 300_000,
      }).catch(() => {});
      return NextResponse.json(cached);
    }

    // Step 2: DB read
    try {
      const dbData = await dbFetchGraph(capability, protocol);
      if (dbData && dbData.nodes.length > 0) {
        swr(cacheKey, () => rpcFetchGraph(capability, protocol), {
          ttl: 60_000,
          swr: 300_000,
        }).catch(() => {});
        return NextResponse.json(dbData);
      }
    } catch (e) {
      console.warn('[graph] DB read failed:', (e as Error).message, '| cause:', (e as any).cause?.message ?? 'none');
    }

    // Step 3: RPC cold start
    const data = await rpcFetchGraph(capability, protocol);
    swr(cacheKey, () => Promise.resolve(data), {
      ttl: 60_000,
      swr: 300_000,
    }).catch(() => {});
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build graph data';
    console.error('[graph]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
