import { db, getSharedPool, isDbDown } from '~/db';
import { syncCursors } from '~/db/schema';
import { getSynapseConnection } from '~/lib/sap/discovery';
import type { ApiComponentHealth, StatusResponseV1 } from '~/types';

const ENTITY_MAX_AGE_MS = Number(process.env.HEALTH_ENTITY_MAX_AGE_MS ?? 15 * 60_000);
const TX_MAX_AGE_MS = Number(process.env.HEALTH_TX_MAX_AGE_MS ?? 10 * 60_000);
const TX_KEYS = new Set(['transactions']);

function staleThresholdMs(entity: string): number {
  return TX_KEYS.has(entity) ? TX_MAX_AGE_MS : ENTITY_MAX_AGE_MS;
}

async function probeDatabase(): Promise<ApiComponentHealth> {
  if (isDbDown()) {
    return { status: 'error', error: 'circuit-breaker-open' };
  }

  const start = Date.now();
  try {
    await getSharedPool().query('SELECT 1');
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

async function probeRpc(): Promise<ApiComponentHealth> {
  const start = Date.now();
  try {
    const conn = getSynapseConnection();
    await Promise.race([
      conn.getSlot('processed'),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('rpc-timeout')), 6000);
      }),
    ]);

    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

async function probeIndexer(): Promise<StatusResponseV1['components']['indexer']> {
  if (isDbDown()) {
    return { status: 'down', cursors: [] };
  }

  try {
    const rows = await db.select().from(syncCursors);
    if (rows.length === 0) {
      return { status: 'degraded', cursors: [] };
    }

    const now = Date.now();
    const cursors = rows.map((row) => {
      const ageMs = Math.max(now - new Date(row.lastSyncedAt).getTime(), 0);
      const maxAgeMs = staleThresholdMs(row.entity);

      return {
        entity: row.entity,
        lastSyncAgoSec: Math.round(ageMs / 1000),
        stale: ageMs > maxAgeMs,
        maxAgeSec: Math.round(maxAgeMs / 1000),
      };
    });

    const staleAny = cursors.some((cursor) => cursor.stale);
    return {
      status: staleAny ? 'stale' : 'ok',
      cursors,
    };
  } catch {
    return { status: 'down', cursors: [] };
  }
}

export async function getPublicStatus(): Promise<StatusResponseV1> {
  const [database, rpc, indexer] = await Promise.all([
    probeDatabase(),
    probeRpc(),
    probeIndexer(),
  ]);

  const anyHardDown = database.status === 'error' && rpc.status === 'error';
  const anyDegraded =
    database.status !== 'ok' ||
    rpc.status !== 'ok' ||
    indexer.status === 'stale' ||
    indexer.status === 'degraded' ||
    indexer.status === 'down';

  return {
    status: anyHardDown ? 'down' : anyDegraded ? 'degraded' : 'ok',
    version: '1.0',
    timestamp: new Date().toISOString(),
    components: {
      database,
      rpc,
      indexer,
    },
  };
}

