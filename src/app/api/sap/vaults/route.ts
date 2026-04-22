export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/vaults — Fetch all memory vaults with layers
 *
 * Data flow: SWR cache → DB (sap_*) enriched → RPC fallback
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllVaults, serialize } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllVaults, upsertVaults } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbVaultToApi, apiVaultToDb } from '~/lib/db/mappers';
import { Pool } from 'pg';

/* ── DB pool for sap_* queries ── */

const _g = globalThis as unknown as { __vaultsPool?: InstanceType<typeof Pool> };
function getPool(): Pool {
  if (!_g.__vaultsPool) {
    _g.__vaultsPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return _g.__vaultsPool;
}

export type EnrichedVault = {
  pda: string;
  agent: string;
  wallet: string;
  totalSessions: number;
  totalInscriptions: string;
  totalBytesInscribed: string;
  createdAt: string;
  nonceVersion: number;
  protocolVersion: number;
  /* enriched fields */
  vaultNonce: string | null;
  lastNonceRotation: number | null;
  memoryLayers: {
    hasInscriptions: boolean;
    hasLedger: boolean;
    hasEpochPages: boolean;
    hasDelegates: boolean;
    hasCheckpoints: boolean;
  };
  sessionsSummary: Array<{
    pda: string;
    isClosed: boolean;
    sequenceCounter: number;
    totalBytes: number;
    currentEpoch: number;
    createdAt: number;
    lastInscribedAt: number | null;
  }>;
  delegateCount: number;
  latestTxSignature: string | null;
  latestTxSlot: number | null;
  latestTxTime: number | null;
  latestTxEvent: string | null;
};

type VaultsEnrichedResponse = {
  vaults: EnrichedVault[];
  total: number;
};

async function enrichVaultsFromDb(baseVaults: Array<{
  pda: string; agent: string; wallet: string;
  totalSessions: number; totalInscriptions: string;
  totalBytesInscribed: string; createdAt: string;
  nonceVersion: number; protocolVersion: number;
}>): Promise<EnrichedVault[]> {
  if (baseVaults.length === 0) return [];
  const pool = getPool();

  // Batch lookup from sap_* tables for all vault PDAs
  const pdas = baseVaults.map(v => v.pda);

  // 1. sap_memory_vaults: get vaultNonce, lastNonceRotation
  type SapVaultQueryRow = { pda: string; vault_nonce_hex: string | null; last_nonce_rotation: string | null };
  const { rows: sapVaults } = await pool.query<SapVaultQueryRow>(
    `SELECT pda, encode(vault_nonce, 'hex') AS vault_nonce_hex, last_nonce_rotation
     FROM sap_exp.sap_memory_vaults WHERE pda = ANY($1)`,
    [pdas],
  );
  const sapVaultMap = new Map(sapVaults.map(r => [r.pda, r]));

  // 2. sap_sessions per vault
  type SessionQueryRow = { pda: string; vault: string; is_closed: boolean; sequence_counter: number; total_bytes: number; current_epoch: number; created_at: string; last_inscribed_at: string | null };
  const { rows: sessions } = await pool.query<SessionQueryRow>(
    `SELECT pda, vault, is_closed, sequence_counter, total_bytes::int AS total_bytes,
            current_epoch, created_at::bigint AS created_at, last_inscribed_at::bigint AS last_inscribed_at
     FROM sap_exp.sap_sessions WHERE vault = ANY($1) ORDER BY created_at DESC`,
    [pdas],
  );
  const sessMap = new Map<string, SessionQueryRow[]>();
  for (const s of sessions) {
    const arr = sessMap.get(s.vault) ?? [];
    arr.push(s);
    sessMap.set(s.vault, arr);
  }

  // 3. Memory ledgers (existence per session)
  const sessionPdas = sessions.map(s => s.pda);
  let ledgerSessionSet = new Set<string>();
  if (sessionPdas.length > 0) {
    const { rows: ledgers } = await pool.query<{ session: string }>(
      `SELECT session FROM sap_exp.sap_memory_ledgers WHERE session = ANY($1)`,
      [sessionPdas],
    );
    ledgerSessionSet = new Set(ledgers.map(r => r.session));
  }

  // 4. Epoch pages (existence per session)
  let epochSessionSet = new Set<string>();
  if (sessionPdas.length > 0) {
    const { rows: epochs } = await pool.query<{ session: string }>(
      `SELECT DISTINCT session FROM sap_exp.sap_epoch_pages WHERE session = ANY($1)`,
      [sessionPdas],
    );
    epochSessionSet = new Set(epochs.map(r => r.session));
  }

  // 5. Checkpoints (existence per session)
  let checkpointSessionSet = new Set<string>();
  if (sessionPdas.length > 0) {
    const { rows: cps } = await pool.query<{ session: string }>(
      `SELECT DISTINCT session FROM sap_exp.sap_checkpoints WHERE session = ANY($1)`,
      [sessionPdas],
    );
    checkpointSessionSet = new Set(cps.map(r => r.session));
  }

  // 6. Delegates per vault
  const { rows: delegateRows } = await pool.query<{ vault: string; cnt: number }>(
    `SELECT vault, count(*)::int AS cnt FROM sap_exp.sap_vault_delegates
     WHERE vault = ANY($1) GROUP BY vault`,
    [pdas],
  );
  const delegateMap = new Map(delegateRows.map(r => [r.vault, r.cnt]));

  // 7. Latest event per vault (from sap_events where data mentions vault PDA)
  // Use a lateral join for efficiency
  type LatestEventRow = { vault_pda: string; tx_signature: string | null; slot: string | null; block_time: string | null; event_name: string | null };
  const { rows: latestEvents } = await pool.query<LatestEventRow>(
    `SELECT DISTINCT ON (vault_pda) vault_pda, e.tx_signature, e.slot, e.block_time, e.event_name
     FROM unnest($1::text[]) AS vault_pda
     LEFT JOIN LATERAL (
       SELECT tx_signature, slot, block_time, event_name
       FROM sap_exp.sap_events
       WHERE data::text LIKE '%' || vault_pda || '%'
       ORDER BY slot DESC LIMIT 1
     ) e ON true
     ORDER BY vault_pda, e.slot DESC NULLS LAST`,
    [pdas],
  );
  const txMap = new Map(latestEvents.map(r => [r.vault_pda, r]));

  return baseVaults.map(v => {
    const sv = sapVaultMap.get(v.pda);
    const vSessions = sessMap.get(v.pda) ?? [];
    const vSessionPdas = vSessions.map(s => s.pda);
    const hasLedger = vSessionPdas.some(sp => ledgerSessionSet.has(sp));
    const hasEpochPages = vSessionPdas.some(sp => epochSessionSet.has(sp));
    const hasCheckpoints = vSessionPdas.some(sp => checkpointSessionSet.has(sp));
    const tx = txMap.get(v.pda);

    return {
      ...v,
      vaultNonce: sv?.vault_nonce_hex ?? null,
      lastNonceRotation: sv?.last_nonce_rotation ? Number(sv.last_nonce_rotation) : null,
      memoryLayers: {
        hasInscriptions: Number(v.totalInscriptions) > 0,
        hasLedger,
        hasEpochPages,
        hasDelegates: (delegateMap.get(v.pda) ?? 0) > 0,
        hasCheckpoints,
      },
      sessionsSummary: vSessions.map(s => ({
        pda: s.pda,
        isClosed: s.is_closed,
        sequenceCounter: s.sequence_counter,
        totalBytes: s.total_bytes,
        currentEpoch: s.current_epoch,
        createdAt: Number(s.created_at),
        lastInscribedAt: s.last_inscribed_at ? Number(s.last_inscribed_at) : null,
      })),
      delegateCount: delegateMap.get(v.pda) ?? 0,
      latestTxSignature: tx?.tx_signature ?? null,
      latestTxSlot: tx?.slot ? Number(tx.slot) : null,
      latestTxTime: tx?.block_time ? Number(tx.block_time) : null,
      latestTxEvent: tx?.event_name ?? null,
    };
  });
}

async function rpcFetchVaults(): Promise<VaultsEnrichedResponse> {
  const vaults = await findAllVaults();
  const serialized = vaults.map((v) => {
    const s = serialize(v.account) as Record<string, unknown>;
    return {
      pda: v.pda.toBase58(),
      agent: String(s.agent ?? ''),
      wallet: String(s.wallet ?? ''),
      totalSessions: Number(s.totalSessions ?? 0),
      totalInscriptions: String(s.totalInscriptions ?? '0'),
      totalBytesInscribed: String(s.totalBytesInscribed ?? '0'),
      createdAt: String(s.createdAt ?? '0'),
      nonceVersion: Number(s.nonceVersion ?? 0),
      protocolVersion: Number(s.protocolVersion ?? 0),
    };
  });
  upsertVaults(serialized.map(apiVaultToDb)).catch((e) =>
    console.warn('[vaults] DB write failed:', (e as Error).message),
  );
  // Enrich with memory layer data
  let enriched: EnrichedVault[];
  try {
    enriched = await enrichVaultsFromDb(serialized);
  } catch {
    enriched = serialized.map(v => ({
      ...v,
      vaultNonce: null,
      lastNonceRotation: null,
      memoryLayers: { hasInscriptions: Number(v.totalInscriptions) > 0, hasLedger: false, hasEpochPages: false, hasDelegates: false, hasCheckpoints: false },
      sessionsSummary: [],
      delegateCount: 0,
      latestTxSignature: null,
      latestTxSlot: null,
      latestTxTime: null,
      latestTxEvent: null,
    }));
  }
  return { vaults: enriched, total: enriched.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<VaultsEnrichedResponse>('vaults');
  if (cached && cached.vaults?.length > 0) {
    swr('vaults', rpcFetchVaults, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  if (!isDbDown()) try {
    const dbRows = await selectAllVaults();
    if (dbRows.length > 0) {
      const base = dbRows.map(dbVaultToApi);
      let enriched: EnrichedVault[];
      try {
        enriched = await enrichVaultsFromDb(base);
      } catch {
        enriched = base.map(v => ({
          ...v,
          vaultNonce: null,
          lastNonceRotation: null,
          memoryLayers: { hasInscriptions: Number(v.totalInscriptions) > 0, hasLedger: false, hasEpochPages: false, hasDelegates: false, hasCheckpoints: false },
          sessionsSummary: [],
          delegateCount: 0,
          latestTxSignature: null,
          latestTxSlot: null,
          latestTxTime: null,
          latestTxEvent: null,
        }));
      }
      const result = { vaults: enriched, total: enriched.length };
      swr('vaults', rpcFetchVaults, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[vaults] DB read failed:', (e as Error).message);
    markDbDown();
  }

  const data = await rpcFetchVaults();
  swr('vaults', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
