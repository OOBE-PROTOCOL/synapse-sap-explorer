// src/indexer/sync-snapshots.ts — Network overview → network_snapshots (time-series)
import { db } from '../db';
import { agentSnapshots, networkSnapshots, toolSnapshots } from '../db/schema';
import { selectAllAgents, selectAllTools } from '../lib/db/queries';
import { getNetworkOverview, getRpcConfig, getSynapseConnection, serializeOverview } from '../lib/sap/discovery';
import { formatError, log, logErr, withRetry, logRpcTarget } from './utils';
import { setCursor } from './cursor';

export async function syncSnapshots(): Promise<void> {
  log('snapshots', 'Capturing network snapshot...');
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();
  logRpcTarget('snapshots', 'getNetworkOverview', rpcUrl, rpcHeaders);

  try {
    const overview = await withRetry(() => getNetworkOverview(), 'snapshots:fetch');
    const s = serializeOverview(overview);

    await db.insert(networkSnapshots).values({
      totalAgents: Number(s.totalAgents),
      activeAgents: Number(s.activeAgents),
      totalFeedbacks: Number(s.totalFeedbacks),
      totalTools: Number(s.totalTools),
      totalVaults: Number(s.totalVaults),
      totalAttestations: Number(s.totalAttestations),
      totalCapabilities: Number(s.totalCapabilities),
      totalProtocols: Number(s.totalProtocols),
      authority: s.authority,
      capturedAt: new Date(),
    });

    await captureAccountSnapshots();

    await setCursor('metrics', {});
    log('snapshots', `Snapshot saved: ${s.totalAgents} agents, ${s.activeAgents} active, ${s.totalTools} tools`);
  } catch (e: unknown) {
    logErr('snapshots', `Failed: ${formatError(e)}`);
  }
}

async function captureAccountSnapshots(): Promise<void> {
  const capturedAt = new Date();
  const slot = await resolveSnapshotSlot();
  const [agentRows, toolRows] = await Promise.all([
    selectAllAgents(),
    selectAllTools(),
  ]);

  if (agentRows.length > 0) {
    await db.insert(agentSnapshots).values(agentRows.map((agent) => ({
      agentPda: agent.pda,
      slot,
      capturedAt,
      payload: {
        pda: agent.pda,
        wallet: agent.wallet,
        name: agent.name,
        isActive: agent.isActive,
        reputationScore: agent.reputationScore,
        totalFeedbacks: agent.totalFeedbacks,
        totalCallsServed: agent.totalCallsServed,
        avgLatencyMs: agent.avgLatencyMs,
        uptimePercent: agent.uptimePercent,
        capabilities: agent.capabilities,
        pricing: agent.pricing,
        protocols: agent.protocols,
        updatedAt: agent.updatedAt?.toISOString?.() ?? String(agent.updatedAt ?? ''),
      },
    }))).onConflictDoNothing();
  }

  if (toolRows.length > 0) {
    await db.insert(toolSnapshots).values(toolRows.map((tool) => ({
      toolPda: tool.pda,
      slot,
      capturedAt,
      payload: {
        pda: tool.pda,
        agentPda: tool.agentPda,
        toolName: tool.toolName,
        category: tool.category,
        httpMethod: tool.httpMethod,
        paramsCount: tool.paramsCount,
        requiredParams: tool.requiredParams,
        isCompound: tool.isCompound,
        isActive: tool.isActive,
        totalInvocations: tool.totalInvocations,
        version: tool.version,
        updatedAt: tool.updatedAt?.toISOString?.() ?? String(tool.updatedAt ?? ''),
      },
    }))).onConflictDoNothing();
  }

  log('snapshots', `Account snapshots saved: ${agentRows.length} agents, ${toolRows.length} tools`);
}

async function resolveSnapshotSlot(): Promise<number> {
  try {
    const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();
    logRpcTarget('snapshots', 'getSlot', rpcUrl, rpcHeaders);
    return await getSynapseConnection().getSlot('confirmed');
  } catch (e) {
    logErr('snapshots', `Slot lookup failed, using timestamp fallback: ${formatError(e)}`);
    return Date.now();
  }
}
