import { isDbDown, markDbDown } from '~/db';
import { dbAgentToApi, apiAgentToDb } from '~/lib/db/mappers';
import { getAgentSettlementMap, selectAgentByWallet, selectAllAgents, upsertAgent, upsertAgents } from '~/lib/db/queries';
import {
  findAgentsByCapability,
  findAgentsByProtocol,
  findAllAgents,
  getAgentProfile,
  serializeAgentProfile,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
import type { ApiAgent, PublicDataSource } from '~/types';

export type PublicAgentsResult = {
  agents: ApiAgent[];
  total: number;
  source: PublicDataSource;
};

export type PublicAgentDetailResult = {
  profile: Record<string, unknown>;
  source: PublicDataSource;
};

function applyFilters(list: ApiAgent[], capability?: string, protocol?: string): ApiAgent[] {
  if (capability) {
    return list.filter((a) => a.identity?.capabilities?.some((c) => c.id === capability));
  }
  if (protocol) {
    return list.filter((a) => a.identity?.protocols?.includes(protocol));
  }
  return list;
}

async function enrichSettlement(agents: ApiAgent[]) {
  try {
    const settlementMap = await getAgentSettlementMap();
    for (const agent of agents) {
      const stats = settlementMap[agent.pda];
      if (!stats) continue;
      agent.settlementStats = {
        totalSettled: stats.totalSettled,
        totalCalls: stats.totalCalls,
        totalDeposited: stats.totalDeposited,
        escrowCount: stats.escrowCount,
        activeEscrows: stats.activeEscrows,
      };
    }
  } catch {
    // Best effort enrichment.
  }
}

export async function listPublicAgents(input: { capability?: string; protocol?: string; limit: number }): Promise<PublicAgentsResult> {
  const { capability, protocol, limit } = input;

  if (!isDbDown()) {
    try {
      const dbRows = await selectAllAgents();
      if (dbRows.length > 0) {
        const mapped = dbRows.map((row) => dbAgentToApi(row) as ApiAgent);
        const filtered = applyFilters(mapped, capability, protocol).slice(0, limit);
        await enrichSettlement(filtered);
        return {
          agents: filtered,
          total: filtered.length,
          source: 'db',
        };
      }
    } catch {
      markDbDown();
    }
  }

  let rpcAgents = capability
    ? await findAgentsByCapability(capability)
    : protocol
      ? await findAgentsByProtocol(protocol)
      : await findAllAgents();

  const seen = new Set<string>();
  rpcAgents = rpcAgents.filter((a) => {
    const pda = a.pda.toBase58();
    if (seen.has(pda)) return false;
    seen.add(pda);
    return true;
  });

  const serialized = rpcAgents.slice(0, limit).map((a) => serializeDiscoveredAgent(a) as ApiAgent);
  await enrichSettlement(serialized);

  if (!isDbDown()) {
    upsertAgents(serialized.map(apiAgentToDb)).catch(() => {
      markDbDown();
    });
  }

  return {
    agents: serialized,
    total: serialized.length,
    source: 'rpc',
  };
}

export async function getPublicAgentByWallet(wallet: string): Promise<PublicAgentDetailResult | null> {
  if (!isDbDown()) {
    try {
      const row = await selectAgentByWallet(wallet);
      if (row) {
        return {
          profile: dbAgentToApi(row) as Record<string, unknown>,
          source: 'db',
        };
      }
    } catch {
      markDbDown();
    }
  }

  const profile = await getAgentProfile(wallet);
  if (!profile) return null;

  const serialized = serializeAgentProfile(profile) as Record<string, unknown>;

  if (!isDbDown()) {
    try {
      await upsertAgent(apiAgentToDb(serialized as unknown as ApiAgent));
    } catch {
      markDbDown();
    }
  }

  return {
    profile: serialized,
    source: 'rpc',
  };
}

