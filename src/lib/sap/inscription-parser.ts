
import { PublicKey } from '@solana/web3.js';
import { EventParser } from '@oobe-protocol-labs/synapse-sap-sdk';
import { getSapClient, getSynapseConnection, getRpcConfig } from './discovery';
import { Pool } from 'pg';

/* ── Types ─────────────────────────────────────────────── */

export type ParsedInscription = {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  sequence: number;
  epochIndex: number;
  encryptedData: string;      // base64
  nonce: string;              // hex
  contentHash: string;        // hex
  totalFragments: number;
  fragmentIndex: number;
  compression: number;        // 0=none, 1=deflate, 2=gzip, 3=brotli
  dataLen: number;
  nonceVersion: number;
  timestamp: number;          // unix seconds
  vault: string;
  session: string;
};

export type ParsedLedgerEntry = {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  entryIndex: number;
  data: string;               // base64
  contentHash: string;        // hex
  dataLen: number;
  merkleRoot: string;         // hex
  timestamp: number;
  session: string;
  ledger: string;
};

export type SessionInscriptionResult = {
  inscriptions: ParsedInscription[];
  ledgerEntries: ParsedLedgerEntry[];
  totalTxScanned: number;
  totalTxFromDb: number;
  totalTxFromRpc: number;
};

/* ── DB pool (shared) ──────────────────────────────────── */

const _g = globalThis as unknown as { __inscParserPool?: Pool };
function getPool(): Pool {
  if (!_g.__inscParserPool) {
    _g.__inscParserPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return _g.__inscParserPool;
}

/* ── Helpers ───────────────────────────────────────────── */

function toHex(arr: number[] | Uint8Array): string {
  return Buffer.from(arr).toString('hex');
}
function toBase64(arr: number[] | Uint8Array): string {
  return Buffer.from(arr).toString('base64');
}

/**
 * Create an EventParser bound to the SAP program's IDL coder.
 */
function getEventParser(): EventParser {
  const client = getSapClient();
  return new EventParser(client.program);
}

/* ── DB: fetch logs from already-indexed transactions ──── */

/**
 * Find SAP transactions that touch a given address (session/vault PDA)
 * by querying the tx_details table which stores full log messages.
 */
async function fetchLogsFromDb(address: string, limit = 200): Promise<Array<{
  signature: string;
  slot: number;
  blockTime: number | null;
  logs: string[];
}>> {
  const pool = getPool();

  // Look for TXs where the address appears in account_keys
  // or where sap_instructions are present and the address is referenced
  const { rows } = await pool.query(`
    SELECT t.signature, t.slot, t.block_time, d.logs
    FROM sap_exp.transactions t
    JOIN sap_exp.tx_details d ON d.signature = t.signature
    WHERE d.logs IS NOT NULL
      AND array_length(d.logs, 1) > 0
      AND (
        d.account_keys::text LIKE '%' || $1 || '%'
        OR d.instructions::text LIKE '%' || $1 || '%'
      )
    ORDER BY t.slot ASC
    LIMIT $2
  `, [address, limit]);

  return rows.map(r => ({
    signature: r.signature,
    slot: r.slot,
    blockTime: r.block_time ? Math.floor(new Date(r.block_time).getTime() / 1000) : null,
    logs: r.logs ?? [],
  }));
}

/* ── RPC: fetch TX signatures + full transactions ──────── */

async function fetchTxFromRpc(address: string, limit = 200): Promise<Array<{
  signature: string;
  slot: number;
  blockTime: number | null;
  logs: string[];
}>> {
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  // Get signatures for the session/vault PDA
  const sigs = await conn.getSignaturesForAddress(
    new PublicKey(address),
    { limit },
    'confirmed',
  );

  if (sigs.length === 0) return [];

  const results: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    logs: string[];
  }> = [];

  // Fetch each TX (with rate limiting)
  for (const sig of sigs.reverse()) {
    try {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { ...rpcHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
        }),
      });

      if (!resp.ok) continue;
      const json = await resp.json();
      const tx = json.result;
      if (!tx?.meta?.logMessages) continue;

      results.push({
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime ?? null,
        logs: tx.meta.logMessages,
      });
    } catch (e) {
      console.warn(`[inscription-parser] TX fetch failed for ${sig.signature.slice(0, 12)}:`, (e as Error).message);
    }
  }

  return results;
}

/* ── Main: parse inscriptions from logs ────────────────── */

function parseLogsForInscriptions(
  parser: EventParser,
  txList: Array<{ signature: string; slot: number; blockTime: number | null; logs: string[] }>,
): { inscriptions: ParsedInscription[]; ledgerEntries: ParsedLedgerEntry[] } {
  const inscriptions: ParsedInscription[] = [];
  const ledgerEntries: ParsedLedgerEntry[] = [];

  for (const tx of txList) {
    if (!tx.logs || tx.logs.length === 0) continue;

    let events: Array<{ name: string; data: Record<string, unknown> }>;
    try {
      events = parser.parseLogs(tx.logs);
    } catch (e) {
      console.warn(`[inscription-parser] parseLogs failed for ${tx.signature.slice(0, 12)}:`, (e as Error).message);
      continue;
    }

    for (const ev of events) {
      if (ev.name === 'MemoryInscribedEvent') {
        const d = ev.data as Record<string, unknown>;
        inscriptions.push({
          txSignature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          sequence: Number(d.sequence ?? 0),
          epochIndex: Number(d.epochIndex ?? d.epoch_index ?? 0),
          encryptedData: toBase64(d.encryptedData as number[] ?? d.encrypted_data as number[] ?? []),
          nonce: toHex(d.nonce as number[] ?? []),
          contentHash: toHex(d.contentHash as number[] ?? d.content_hash as number[] ?? []),
          totalFragments: Number(d.totalFragments ?? d.total_fragments ?? 1),
          fragmentIndex: Number(d.fragmentIndex ?? d.fragment_index ?? 0),
          compression: Number(d.compression ?? 0),
          dataLen: Number(d.dataLen ?? d.data_len ?? 0),
          nonceVersion: Number(d.nonceVersion ?? d.nonce_version ?? 0),
          timestamp: Number(d.timestamp?.toString?.() ?? tx.blockTime ?? 0),
          vault: (d.vault as { toBase58?: () => string })?.toBase58?.() ?? String(d.vault ?? ''),
          session: (d.session as { toBase58?: () => string })?.toBase58?.() ?? String(d.session ?? ''),
        });
      } else if (ev.name === 'LedgerEntryEvent') {
        const d = ev.data as Record<string, unknown>;
        ledgerEntries.push({
          txSignature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          entryIndex: Number(d.entryIndex ?? d.entry_index ?? 0),
          data: toBase64(d.data as number[] ?? []),
          contentHash: toHex(d.contentHash as number[] ?? d.content_hash as number[] ?? []),
          dataLen: Number(d.dataLen ?? d.data_len ?? 0),
          merkleRoot: toHex(d.merkleRoot as number[] ?? d.merkle_root as number[] ?? []),
          timestamp: Number(d.timestamp?.toString?.() ?? tx.blockTime ?? 0),
          session: (d.session as { toBase58?: () => string })?.toBase58?.() ?? String(d.session ?? ''),
          ledger: (d.ledger as { toBase58?: () => string })?.toBase58?.() ?? String(d.ledger ?? ''),
        });
      }
    }
  }

  // Sort by sequence/entryIndex
  inscriptions.sort((a, b) => a.sequence - b.sequence || a.fragmentIndex - b.fragmentIndex);
  ledgerEntries.sort((a, b) => a.entryIndex - b.entryIndex);

  return { inscriptions, ledgerEntries };
}

/**
 * Fetch and parse all memory inscriptions for a given session PDA.
 * Strategy: DB first (fast), then RPC for any gaps.
 */
export async function getSessionInscriptions(
  sessionPda: string,
  opts?: { limit?: number; rpcFallback?: boolean },
): Promise<SessionInscriptionResult> {
  const limit = opts?.limit ?? 200;
  const rpcFallback = opts?.rpcFallback ?? true;
  const parser = getEventParser();

  // 1. Try DB first (already-indexed TXs)
  let dbTxList: Array<{ signature: string; slot: number; blockTime: number | null; logs: string[] }> = [];
  try {
    dbTxList = await fetchLogsFromDb(sessionPda, limit);
  } catch (e) {
    console.warn('[inscription-parser] DB fetch failed:', (e as Error).message);
  }

  // 2. Parse DB logs
  const dbResult = parseLogsForInscriptions(parser, dbTxList);
  const dbSigs = new Set(dbTxList.map(t => t.signature));

  // 3. RPC fallback for additional TXs not in DB
  let rpcTxList: typeof dbTxList = [];
  if (rpcFallback) {
    try {
      const rpcAll = await fetchTxFromRpc(sessionPda, limit);
      // Only parse TXs we don't already have from DB
      rpcTxList = rpcAll.filter(t => !dbSigs.has(t.signature));
    } catch (e) {
      console.warn('[inscription-parser] RPC fetch failed:', (e as Error).message);
    }
  }

  const rpcResult = parseLogsForInscriptions(parser, rpcTxList);

  // 4. Merge & dedupe
  const allInscriptions = [...dbResult.inscriptions, ...rpcResult.inscriptions];
  const allLedgerEntries = [...dbResult.ledgerEntries, ...rpcResult.ledgerEntries];

  // Dedupe by signature+sequence+fragmentIndex
  const seenInsc = new Set<string>();
  const dedupedInsc = allInscriptions.filter(i => {
    const key = `${i.txSignature}:${i.sequence}:${i.fragmentIndex}`;
    if (seenInsc.has(key)) return false;
    seenInsc.add(key);
    return true;
  });

  const seenLe = new Set<string>();
  const dedupedLe = allLedgerEntries.filter(e => {
    const key = `${e.txSignature}:${e.entryIndex}`;
    if (seenLe.has(key)) return false;
    seenLe.add(key);
    return true;
  });

  dedupedInsc.sort((a, b) => a.sequence - b.sequence || a.fragmentIndex - b.fragmentIndex);
  dedupedLe.sort((a, b) => a.entryIndex - b.entryIndex);

  return {
    inscriptions: dedupedInsc,
    ledgerEntries: dedupedLe,
    totalTxScanned: dbTxList.length + rpcTxList.length,
    totalTxFromDb: dbTxList.length,
    totalTxFromRpc: rpcTxList.length,
  };
}

/**
 * Fetch ALL memory inscriptions across all sessions of a vault.
 */
export async function getVaultInscriptions(
  vaultPda: string,
  opts?: { limit?: number; rpcFallback?: boolean },
): Promise<SessionInscriptionResult> {
  const pool = getPool();

  // Get all session PDAs for this vault
  const { rows: sessions } = await pool.query(
    `SELECT pda FROM sap_exp.sap_sessions WHERE vault = $1 ORDER BY created_at ASC`,
    [vaultPda],
  );

  if (sessions.length === 0) {
    // Also try RPC directly for the vault PDA itself
    return getSessionInscriptions(vaultPda, opts);
  }

  // Fetch inscriptions for each session
  const results = await Promise.all(
    sessions.map(s => getSessionInscriptions(s.pda, opts)),
  );

  return {
    inscriptions: results.flatMap(r => r.inscriptions)
      .sort((a, b) => a.sequence - b.sequence || a.fragmentIndex - b.fragmentIndex),
    ledgerEntries: results.flatMap(r => r.ledgerEntries)
      .sort((a, b) => a.entryIndex - b.entryIndex),
    totalTxScanned: results.reduce((s, r) => s + r.totalTxScanned, 0),
    totalTxFromDb: results.reduce((s, r) => s + r.totalTxFromDb, 0),
    totalTxFromRpc: results.reduce((s, r) => s + r.totalTxFromRpc, 0),
  };
}
