import { PublicKey } from '@solana/web3.js';
import { dbAgentToApi } from '~/lib/db/mappers';
import { selectAllAgents, selectAllTools } from '~/lib/db/queries';
import {
  findAllAgents,
  getNetworkOverview,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
import type { DiscoveredTool } from '~/lib/sap/discovery';
import type { SerializedDiscoveredAgent } from '~/types/sap';

type IndexedAgentsResult = {
  agents: SerializedDiscoveredAgent[];
  expectedTotal: number | null;
};

function dedupeSerialized(list: SerializedDiscoveredAgent[]): SerializedDiscoveredAgent[] {
  const seen = new Set<string>();
  const out: SerializedDiscoveredAgent[] = [];
  for (const agent of list) {
    if (!agent?.pda) continue;
    if (seen.has(agent.pda)) continue;
    seen.add(agent.pda);
    out.push(agent);
  }
  return out;
}

/**
 * DB-first unified agent source for read-heavy views.
 *
 * Primary source is the indexed DB (fast, always available). RPC is used
 * only as a last-resort fallback when the DB is empty (cold start / first run).
 * This avoids `getProgramAccounts` RPC calls that can fail with 426 errors.
 */
export async function loadIndexedSerializedAgents(): Promise<IndexedAgentsResult> {
  const [dbRes, overviewRes] = await Promise.allSettled([
    selectAllAgents(),
    getNetworkOverview(),
  ]);

  const dbAgents = dbRes.status === 'fulfilled'
    ? dedupeSerialized(
        dbRes.value
          .map((row) => dbAgentToApi(row) as SerializedDiscoveredAgent)
          .filter((a) => a.identity !== null),
      )
    : [];

  const expectedTotal = overviewRes.status === 'fulfilled'
    ? Number(overviewRes.value.totalAgents ?? 0)
    : null;

  // DB has data — return it immediately without blocking on RPC.
  if (dbAgents.length > 0) {
    return { agents: dbAgents, expectedTotal };
  }

  // DB empty (cold start) — fall back to RPC one time.
  try {
    const rpcAgents = await findAllAgents();
    const agents = dedupeSerialized(rpcAgents.map(serializeDiscoveredAgent));
    return { agents, expectedTotal };
  } catch (e) {
    console.warn('[agent-index] RPC fallback failed:', (e as Error).message);
    return { agents: [], expectedTotal };
  }
}

/**
 * Load tools from the indexed DB as `DiscoveredTool`-compatible objects.
 * Avoids the `getProgramAccounts` RPC call used by `findAllTools()`.
 * Falls back to an empty array on any DB error.
 */
export async function loadDbTools(): Promise<DiscoveredTool[]> {
  try {
    const rows = await selectAllTools();
    const results: DiscoveredTool[] = [];
    for (const row of rows) {
      let pda: PublicKey;
      let agentKey: PublicKey | null = null;
      try { pda = new PublicKey(row.pda); } catch { continue; }
      try { agentKey = new PublicKey(row.agentPda); } catch { /* no agent link */ }
      results.push({
        pda,
        descriptor: {
          agent: agentKey,
          toolName: row.toolName ?? '',
          category: row.category ?? 'custom',
          httpMethod: row.httpMethod ?? 'get',
          paramsCount: row.paramsCount ?? 0,
          requiredParams: row.requiredParams ?? 0,
          isCompound: row.isCompound ?? false,
          isActive: row.isActive ?? true,
          totalInvocations: BigInt(row.totalInvocations ?? '0'),
          version: row.version ?? 0,
          createdAt: row.createdAt ? BigInt(row.createdAt.getTime()) : null,
          updatedAt: row.updatedAt ? BigInt(row.updatedAt.getTime()) : null,
        } as unknown as DiscoveredTool['descriptor'],
      });
    }
    return results;
  } catch (e) {
    console.warn('[agent-index] loadDbTools failed:', (e as Error).message);
    return [];
  }
}

