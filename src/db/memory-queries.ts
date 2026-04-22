
import { Pool } from 'pg';

const _g = globalThis as unknown as { __memPool?: Pool };

function getPool(): Pool {
  if (!_g.__memPool) {
    _g.__memPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return _g.__memPool;
}

/* ── Types ── */

export type SapVault = {
  pda: string;
  bump: number;
  agent: string;
  wallet: string;
  vaultNonce: string; // hex
  totalSessions: number;
  totalInscriptions: number;
  totalBytesInscribed: number;
  createdAt: number;
  protocolVersion: number;
  nonceVersion: number;
  lastNonceRotation: number | null;
  slot: number;
  syncedAt: string;
};

export type SapSession = {
  pda: string;
  bump: number;
  vault: string;
  sessionHash: string; // hex
  sequenceCounter: number;
  totalBytes: number;
  currentEpoch: number;
  totalEpochs: number;
  createdAt: number;
  lastInscribedAt: number | null;
  isClosed: boolean;
  merkleRoot: string; // hex
  totalCheckpoints: number;
  tipHash: string; // hex
  slot: number;
};

export type SapEpochPage = {
  pda: string;
  bump: number;
  session: string;
  epochIndex: number;
  startSequence: number;
  inscriptionCount: number;
  totalBytes: number;
  firstTs: number;
  lastTs: number;
  slot: number;
};

export type SapMemoryLedger = {
  pda: string;
  bump: number;
  session: string;
  authority: string;
  numEntries: number;
  merkleRoot: string; // hex
  latestHash: string; // hex
  totalDataSize: number;
  createdAt: number;
  updatedAt: number;
  numPages: number;
  ring: string | null; // base64
  slot: number;
};

export type SapLedgerPage = {
  pda: string;
  bump: number;
  ledger: string;
  pageIndex: number;
  sealedAt: number;
  entriesInPage: number;
  dataSize: number;
  merkleRootAtSeal: string; // hex
  data: string | null; // base64
  slot: number;
};

export type SapVaultDelegate = {
  pda: string;
  bump: number;
  vault: string;
  delegate: string;
  permissions: number;
  expiresAt: number;
  createdAt: number;
  slot: number;
};

export type SapCheckpoint = {
  pda: string;
  bump: number;
  session: string;
  checkpointIndex: number;
  merkleRoot: string; // hex
  sequenceAt: number;
  epochAt: number;
  totalBytesAt: number;
  inscriptionsAt: number;
  createdAt: number;
  slot: number;
};

export type SapEvent = {
  id: number;
  eventName: string;
  txSignature: string;
  slot: number;
  blockTime: number | null;
  data: Record<string, unknown>;
  agentPda: string | null;
  wallet: string | null;
  syncedAt: string;
};

/* ── Helpers ── */

function bytesToHex(val: Buffer | null): string {
  if (!val) return '';
  return Buffer.from(val).toString('hex');
}

function bytesToBase64(val: Buffer | null): string | null {
  if (!val) return null;
  return Buffer.from(val).toString('base64');
}

/* ── Queries ── */

export async function getVaultByPda(pda: string): Promise<SapVault | null> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_memory_vaults WHERE pda = $1`,
    [pda],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    pda: r.pda,
    bump: r.bump,
    agent: r.agent,
    wallet: r.wallet,
    vaultNonce: bytesToHex(r.vault_nonce),
    totalSessions: r.total_sessions,
    totalInscriptions: Number(r.total_inscriptions),
    totalBytesInscribed: Number(r.total_bytes_inscribed),
    createdAt: Number(r.created_at),
    protocolVersion: r.protocol_version,
    nonceVersion: r.nonce_version,
    lastNonceRotation: r.last_nonce_rotation ? Number(r.last_nonce_rotation) : null,
    slot: Number(r.slot),
    syncedAt: r.synced_at,
  };
}

export async function getSessionsByVault(vaultPda: string): Promise<SapSession[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_sessions WHERE vault = $1 ORDER BY created_at DESC`,
    [vaultPda],
  );
  return rows.map((r) => ({
    pda: r.pda,
    bump: r.bump,
    vault: r.vault,
    sessionHash: bytesToHex(r.session_hash),
    sequenceCounter: r.sequence_counter,
    totalBytes: Number(r.total_bytes),
    currentEpoch: r.current_epoch,
    totalEpochs: r.total_epochs,
    createdAt: Number(r.created_at),
    lastInscribedAt: r.last_inscribed_at ? Number(r.last_inscribed_at) : null,
    isClosed: r.is_closed,
    merkleRoot: bytesToHex(r.merkle_root),
    totalCheckpoints: r.total_checkpoints,
    tipHash: bytesToHex(r.tip_hash),
    slot: Number(r.slot),
  }));
}

export async function getEpochPagesBySession(sessionPda: string): Promise<SapEpochPage[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_epoch_pages WHERE session = $1 ORDER BY epoch_index ASC`,
    [sessionPda],
  );
  return rows.map((r) => ({
    pda: r.pda,
    bump: r.bump,
    session: r.session,
    epochIndex: r.epoch_index,
    startSequence: r.start_sequence,
    inscriptionCount: r.inscription_count,
    totalBytes: r.total_bytes,
    firstTs: Number(r.first_ts),
    lastTs: Number(r.last_ts),
    slot: Number(r.slot),
  }));
}

export async function getLedgerBySession(sessionPda: string): Promise<SapMemoryLedger | null> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_memory_ledgers WHERE session = $1`,
    [sessionPda],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    pda: r.pda,
    bump: r.bump,
    session: r.session,
    authority: r.authority,
    numEntries: r.num_entries,
    merkleRoot: bytesToHex(r.merkle_root),
    latestHash: bytesToHex(r.latest_hash),
    totalDataSize: Number(r.total_data_size),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    numPages: r.num_pages,
    ring: bytesToBase64(r.ring),
    slot: Number(r.slot),
  };
}

export async function getLedgerPagesByLedger(ledgerPda: string): Promise<SapLedgerPage[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_ledger_pages WHERE ledger = $1 ORDER BY page_index ASC`,
    [ledgerPda],
  );
  return rows.map((r) => ({
    pda: r.pda,
    bump: r.bump,
    ledger: r.ledger,
    pageIndex: r.page_index,
    sealedAt: Number(r.sealed_at),
    entriesInPage: r.entries_in_page,
    dataSize: r.data_size,
    merkleRootAtSeal: bytesToHex(r.merkle_root_at_seal),
    data: bytesToBase64(r.data),
    slot: Number(r.slot),
  }));
}

export async function getDelegatesByVault(vaultPda: string): Promise<SapVaultDelegate[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_vault_delegates WHERE vault = $1 ORDER BY created_at DESC`,
    [vaultPda],
  );
  return rows.map((r) => ({
    pda: r.pda,
    bump: r.bump,
    vault: r.vault,
    delegate: r.delegate,
    permissions: r.permissions,
    expiresAt: Number(r.expires_at),
    createdAt: Number(r.created_at),
    slot: Number(r.slot),
  }));
}

export async function getCheckpointsBySession(sessionPda: string): Promise<SapCheckpoint[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_checkpoints WHERE session = $1 ORDER BY checkpoint_index ASC`,
    [sessionPda],
  );
  return rows.map((r) => ({
    pda: r.pda,
    bump: r.bump,
    session: r.session,
    checkpointIndex: r.checkpoint_index,
    merkleRoot: bytesToHex(r.merkle_root),
    sequenceAt: r.sequence_at,
    epochAt: r.epoch_at,
    totalBytesAt: Number(r.total_bytes_at),
    inscriptionsAt: Number(r.inscriptions_at),
    createdAt: Number(r.created_at),
    slot: Number(r.slot),
  }));
}

export async function getEventsByName(
  eventName: string,
  opts?: { agentPda?: string; limit?: number },
): Promise<SapEvent[]> {
  const params: unknown[] = [eventName];
  let where = `event_name = $1`;
  if (opts?.agentPda) {
    params.push(opts.agentPda);
    where += ` AND agent_pda = $${params.length}`;
  }
  const limit = opts?.limit ?? 100;
  params.push(limit);
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_events WHERE ${where} ORDER BY slot DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    eventName: r.event_name,
    txSignature: r.tx_signature,
    slot: Number(r.slot),
    blockTime: r.block_time ? Number(r.block_time) : null,
    data: r.data,
    agentPda: r.agent_pda,
    wallet: r.wallet,
    syncedAt: r.synced_at,
  }));
}

export async function getEventsByVault(
  vaultPda: string,
  opts?: { limit?: number },
): Promise<SapEvent[]> {
  const limit = opts?.limit ?? 100;
  // Events related to a vault: search in data jsonb for vault PDA or agent PDA
  // Also search by wallet (vault owner) via sap_memory_vaults join
  const { rows } = await getPool().query(
    `SELECT e.* FROM sap_exp.sap_events e
     WHERE e.data::text LIKE $1
     ORDER BY e.slot DESC LIMIT $2`,
    [`%${vaultPda}%`, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    eventName: r.event_name,
    txSignature: r.tx_signature,
    slot: Number(r.slot),
    blockTime: r.block_time ? Number(r.block_time) : null,
    data: r.data,
    agentPda: r.agent_pda,
    wallet: r.wallet,
    syncedAt: r.synced_at,
  }));
}

export async function getVaultsByAgent(agentPda: string): Promise<SapVault[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM sap_exp.sap_memory_vaults WHERE agent = $1 ORDER BY created_at DESC`,
    [agentPda],
  );
  return rows.map((r) => ({
    pda: r.pda,
    bump: r.bump,
    agent: r.agent,
    wallet: r.wallet,
    vaultNonce: bytesToHex(r.vault_nonce),
    totalSessions: r.total_sessions,
    totalInscriptions: Number(r.total_inscriptions),
    totalBytesInscribed: Number(r.total_bytes_inscribed),
    createdAt: Number(r.created_at),
    protocolVersion: r.protocol_version,
    nonceVersion: r.nonce_version,
    lastNonceRotation: r.last_nonce_rotation ? Number(r.last_nonce_rotation) : null,
    slot: Number(r.slot),
    syncedAt: r.synced_at,
  }));
}

/** Summary stats for an agent's memory across all vaults */
export async function getAgentMemoryStats(agentPda: string) {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*)::int AS vault_count,
       COALESCE(SUM(total_sessions), 0)::int AS total_sessions,
       COALESCE(SUM(total_inscriptions), 0)::bigint AS total_inscriptions,
       COALESCE(SUM(total_bytes_inscribed), 0)::bigint AS total_bytes_inscribed
     FROM sap_exp.sap_memory_vaults
     WHERE agent = $1`,
    [agentPda],
  );
  const r = rows[0];
  return {
    vaultCount: r.vault_count,
    totalSessions: r.total_sessions,
    totalInscriptions: Number(r.total_inscriptions),
    totalBytesInscribed: Number(r.total_bytes_inscribed),
  };
}
