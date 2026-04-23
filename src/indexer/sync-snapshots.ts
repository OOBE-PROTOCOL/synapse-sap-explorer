// src/indexer/sync-snapshots.ts — Network overview → network_snapshots (time-series)
import { db } from '../db';
import { networkSnapshots } from '../db/schema';
import { getNetworkOverview, serializeOverview } from '../lib/sap/discovery';
import { log, logErr, withRetry } from './utils';
import { setCursor } from './cursor';

export async function syncSnapshots(): Promise<void> {
  log('snapshots', 'Capturing network snapshot...');

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

    await setCursor('metrics', {});
    log('snapshots', `Snapshot saved: ${s.totalAgents} agents, ${s.activeAgents} active, ${s.totalTools} tools`);
  } catch (e: unknown) {
    logErr('snapshots', `Failed: ${(e as Error).message}`);
  }
}

