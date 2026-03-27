// src/indexer/sync-agents.ts — Fetch all agents + stats → upsert DB
import { db } from '~/db';
import { agents, agentStats } from '~/db/schema';
import { findAllAgents, findAllAgentStats } from '~/lib/sap/discovery';
import { serializeAccount } from '@oobe-protocol-labs/synapse-sap-sdk/utils';
import { log, logErr, withRetry, pk, bn, num, bnToDate, conflictUpdateSet, sleep } from './utils';
import { setCursor } from './cursor';

export async function syncAgents(): Promise<number> {
  log('agents', 'Fetching all agents from RPC...');

  const rawAgents = await withRetry(() => findAllAgents(), 'agents:fetch');
  log('agents', `Fetched ${rawAgents.length} agents`);

  if (rawAgents.length === 0) {
    await setCursor('agents', {});
    return 0;
  }

  // Also fetch stats for enrichment
  let statsMap = new Map<string, any>();
  try {
    const rawStats = await withRetry(() => findAllAgentStats(), 'agents:stats');
    for (const s of rawStats) {
      const agentPda = pk(s.stats?.agent ?? s.pda);
      if (agentPda) statsMap.set(agentPda, s.stats);
    }
    log('agents', `Fetched ${rawStats.length} agent stats`);
  } catch (e: any) {
    logErr('agents', `Stats fetch failed (continuing without): ${e.message}`);
  }

  await sleep(1000); // pacing between RPC calls

  let upserted = 0;

  // Process agents in batches of 20
  const BATCH = 20;
  for (let i = 0; i < rawAgents.length; i += BATCH) {
    const batch = rawAgents.slice(i, i + BATCH);

    const rows = batch
      .filter((a) => a.identity)
      .map((a) => {
        const pda = pk(a.pda);
        const id = a.identity as any;
        // Deep-serialize complex objects for JSONB storage
        const serialized = serializeAccount(id);

        return {
          pda,
          wallet: pk(id.wallet),
          name: serialized.name ?? '',
          description: serialized.description ?? '',
          agentId: serialized.agentId ?? null,
          agentUri: serialized.agentUri ?? null,
          x402Endpoint: serialized.x402Endpoint ?? null,
          isActive: Boolean(id.isActive),
          bump: num(id.bump),
          version: num(id.version),
          reputationScore: num(id.reputationScore),
          reputationSum: bn(id.reputationSum),
          totalFeedbacks: num(id.totalFeedbacks),
          totalCallsServed: bn(id.totalCallsServed),
          avgLatencyMs: num(id.avgLatencyMs),
          uptimePercent: num(id.uptimePercent),
          capabilities: serialized.capabilities ?? [],
          pricing: serialized.pricing ?? [],
          protocols: serialized.protocols ?? [],
          activePlugins: serialized.activePlugins ?? [],
          createdAt: bnToDate(id.createdAt) ?? new Date(),
          updatedAt: bnToDate(id.updatedAt) ?? new Date(),
          indexedAt: new Date(),
        };
      });

    if (rows.length === 0) continue;

    try {
      await db
        .insert(agents)
        .values(rows)
        .onConflictDoUpdate({
          target: agents.pda,
          set: conflictUpdateSet(agents, ['pda']),
        });
      upserted += rows.length;
    } catch (e: any) {
      logErr('agents', `Batch upsert failed (i=${i}): ${e.message}`);
      // Fallback: insert one by one
      for (const row of rows) {
        try {
          await db.insert(agents).values(row).onConflictDoUpdate({
            target: agents.pda,
            set: conflictUpdateSet(agents, ['pda']),
          });
          upserted++;
        } catch (e2: any) {
          logErr('agents', `Single upsert failed pda=${row.pda.slice(0, 8)}: ${e2.message}`);
        }
      }
    }
  }

  // Upsert agent_stats
  let statsUpserted = 0;
  for (const [agentPda, stats] of statsMap) {
    try {
      const row = {
        agentPda,
        wallet: pk(stats.wallet),
        totalCallsServed: bn(stats.totalCallsServed),
        isActive: Boolean(stats.isActive),
        bump: num(stats.bump),
        updatedAt: bnToDate(stats.updatedAt) ?? new Date(),
      };
      await db
        .insert(agentStats)
        .values(row)
        .onConflictDoUpdate({
          target: agentStats.agentPda,
          set: conflictUpdateSet(agentStats, ['agentPda']),
        });
      statsUpserted++;
    } catch (e: any) {
      // FK violation: agent not in DB yet — skip
    }
  }

  await setCursor('agents', {});
  log('agents', `Done: ${upserted} agents, ${statsUpserted} stats upserted`);
  return upserted;
}

