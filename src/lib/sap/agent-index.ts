import { dbAgentToApi } from '~/lib/db/mappers';
import { selectAllAgents } from '~/lib/db/queries';
import {
  findAllAgents,
  getNetworkOverview,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
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
 * Best-effort unified agent source used by read-heavy views.
 *
 * Primary source is on-chain RPC (`findAllAgents`), but when RPC under-returns
 * during transient upstream issues we backfill missing slots from the indexed DB,
 * using `getNetworkOverview().totalAgents` as the expected floor.
 */
export async function loadIndexedSerializedAgents(): Promise<IndexedAgentsResult> {
  const [rpcRes, dbRes, overviewRes] = await Promise.allSettled([
    findAllAgents(),
    selectAllAgents(),
    getNetworkOverview(),
  ]);

  const rpcAgents = rpcRes.status === 'fulfilled'
    ? dedupeSerialized(rpcRes.value.map(serializeDiscoveredAgent))
    : [];

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

  const merged = new Map<string, SerializedDiscoveredAgent>();
  for (const agent of rpcAgents) merged.set(agent.pda, agent);

  const shouldBackfill =
    merged.size === 0 ||
    (expectedTotal !== null && expectedTotal > 0 && merged.size < expectedTotal);

  if (shouldBackfill) {
    const target = expectedTotal !== null && expectedTotal > 0
      ? expectedTotal
      : Number.POSITIVE_INFINITY;
    for (const agent of dbAgents) {
      if (merged.size >= target) break;
      if (!merged.has(agent.pda)) merged.set(agent.pda, agent);
    }
  }

  const agents = Array.from(merged.values()).filter((a) => a.identity !== null);
  return { agents, expectedTotal };
}

