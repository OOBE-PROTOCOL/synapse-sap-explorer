
import { PublicKey } from '@solana/web3.js';
import { EventParser } from './sdk-compat';
import { getSapClient, getSynapseConnection, getRpcConfig } from './discovery';
import type { Pool } from 'pg';
import { getSharedPool } from '~/db';
import { asPublicKeyText, asText } from '~/lib/format';

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

function getPool(): Pool {
  return getSharedPool();
}

/* ── Helpers ───────────────────────────────────────────── */

function toBytes(value: unknown): Uint8Array {
  if (value === null || value === undefined) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) {
    return Uint8Array.from(value.map(Number).filter(Number.isFinite));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return new Uint8Array();
    if (/^[A-Fa-f0-9]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      return Buffer.from(trimmed, 'hex');
    }
    try {
      return Buffer.from(trimmed, 'base64');
    } catch {
      return new Uint8Array();
    }
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.data)) return toBytes(obj.data);
    if (obj.data && typeof obj.data === 'object') return toBytes(obj.data);
    const numericKeys = Object.keys(obj).filter((key) => /^\d+$/.test(key));
    if (numericKeys.length > 0) {
      return Uint8Array.from(
        numericKeys
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => Number(obj[key]))
          .filter(Number.isFinite),
      );
    }
  }

  return new Uint8Array();
}

function toHex(value: unknown): string {
  return Buffer.from(toBytes(value)).toString('hex');
}

function toBase64(value: unknown): string {
  return Buffer.from(toBytes(value)).toString('base64');
}

function toNumberValue(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const toNumber = (value as { toNumber?: unknown })?.toNumber;
  if (typeof toNumber === 'function') {
    try {
      const parsed = toNumber.call(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  const text = asText(value);
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toUnixSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return value > 1e12 ? Math.floor(value / 1000) : value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.floor(time / 1000) : null;
  }
  return null;
}

function toAddress(value: unknown): string {
  return asPublicKeyText(value) || asText(value);
}

function parseJsonData(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
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

async function fetchEventsFromDb(address: string, limit = 200): Promise<{
  inscriptions: ParsedInscription[];
  ledgerEntries: ParsedLedgerEntry[];
}> {
  const pool = getPool();
  const { rows } = await pool.query<{
    event_name: string;
    tx_signature: string;
    slot: string | number;
    block_time: string | number | Date | null;
    data: unknown;
  }>(`
    SELECT event_name, tx_signature, slot, block_time, data
    FROM (
      SELECT DISTINCT ON (
        event_name,
        tx_signature,
        COALESCE(data->>'sequence', ''),
        COALESCE(data->>'entryIndex', data->>'entry_index', ''),
        COALESCE(data->>'fragmentIndex', data->>'fragment_index', ''),
        COALESCE(data->>'contentHash', data->>'content_hash', '')
      )
        event_name, tx_signature, slot, block_time, data
      FROM sap_exp.sap_events
      WHERE event_name IN (
        'MemoryInscribedEvent',
        'memoryInscribedEvent',
        'LedgerEntryEvent',
        'ledgerEntryEvent'
      )
        AND data::text LIKE '%' || $1 || '%'
      ORDER BY
        event_name,
        tx_signature,
        COALESCE(data->>'sequence', ''),
        COALESCE(data->>'entryIndex', data->>'entry_index', ''),
        COALESCE(data->>'fragmentIndex', data->>'fragment_index', ''),
        COALESCE(data->>'contentHash', data->>'content_hash', ''),
        slot DESC
    ) unique_events
    ORDER BY slot DESC
    LIMIT $2
  `, [address, limit]);

  const inscriptions: ParsedInscription[] = [];
  const ledgerEntries: ParsedLedgerEntry[] = [];

  for (const row of rows) {
    const d = parseJsonData(row.data);
    const slot = toNumberValue(row.slot);
    const rowBlockTime = toUnixSeconds(row.block_time);

    if (row.event_name === 'MemoryInscribedEvent' || row.event_name === 'memoryInscribedEvent') {
      const encryptedData = d.encryptedData ?? d.encrypted_data;
      const dataLen = toNumberValue(d.dataLen ?? d.data_len, toBytes(encryptedData).length);
      const timestamp = toNumberValue(d.timestamp, rowBlockTime ?? 0);
      inscriptions.push({
        txSignature: row.tx_signature,
        slot,
        blockTime: rowBlockTime ?? (timestamp > 0 ? timestamp : null),
        sequence: toNumberValue(d.sequence),
        epochIndex: toNumberValue(d.epochIndex ?? d.epoch_index),
        encryptedData: toBase64(encryptedData),
        nonce: toHex(d.nonce),
        contentHash: toHex(d.contentHash ?? d.content_hash),
        totalFragments: toNumberValue(d.totalFragments ?? d.total_fragments, 1),
        fragmentIndex: toNumberValue(d.fragmentIndex ?? d.fragment_index),
        compression: toNumberValue(d.compression),
        dataLen,
        nonceVersion: toNumberValue(d.nonceVersion ?? d.nonce_version),
        timestamp,
        vault: toAddress(d.vault),
        session: toAddress(d.session),
      });
    } else if (row.event_name === 'LedgerEntryEvent' || row.event_name === 'ledgerEntryEvent') {
      const data = d.data;
      const dataLen = toNumberValue(d.dataLen ?? d.data_len, toBytes(data).length);
      const timestamp = toNumberValue(d.timestamp, rowBlockTime ?? 0);
      ledgerEntries.push({
        txSignature: row.tx_signature,
        slot,
        blockTime: rowBlockTime ?? (timestamp > 0 ? timestamp : null),
        entryIndex: toNumberValue(d.entryIndex ?? d.entry_index),
        data: toBase64(data),
        contentHash: toHex(d.contentHash ?? d.content_hash),
        dataLen,
        merkleRoot: toHex(d.merkleRoot ?? d.merkle_root),
        timestamp,
        session: toAddress(d.session),
        ledger: toAddress(d.ledger),
      });
    }
  }

  return { inscriptions, ledgerEntries };
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
      if (ev.name === 'MemoryInscribedEvent' || ev.name === 'memoryInscribedEvent') {
        const d = ev.data as Record<string, unknown>;
        inscriptions.push({
          txSignature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          sequence: toNumberValue(d.sequence),
          epochIndex: toNumberValue(d.epochIndex ?? d.epoch_index),
          encryptedData: toBase64(d.encryptedData ?? d.encrypted_data),
          nonce: toHex(d.nonce),
          contentHash: toHex(d.contentHash ?? d.content_hash),
          totalFragments: toNumberValue(d.totalFragments ?? d.total_fragments, 1),
          fragmentIndex: toNumberValue(d.fragmentIndex ?? d.fragment_index),
          compression: toNumberValue(d.compression),
          dataLen: toNumberValue(d.dataLen ?? d.data_len, toBytes(d.encryptedData ?? d.encrypted_data).length),
          nonceVersion: toNumberValue(d.nonceVersion ?? d.nonce_version),
          timestamp: toNumberValue(d.timestamp, tx.blockTime ?? 0),
          vault: toAddress(d.vault),
          session: toAddress(d.session),
        });
      } else if (ev.name === 'LedgerEntryEvent' || ev.name === 'ledgerEntryEvent') {
        const d = ev.data as Record<string, unknown>;
        ledgerEntries.push({
          txSignature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          entryIndex: toNumberValue(d.entryIndex ?? d.entry_index),
          data: toBase64(d.data),
          contentHash: toHex(d.contentHash ?? d.content_hash),
          dataLen: toNumberValue(d.dataLen ?? d.data_len, toBytes(d.data).length),
          merkleRoot: toHex(d.merkleRoot ?? d.merkle_root),
          timestamp: toNumberValue(d.timestamp, tx.blockTime ?? 0),
          session: toAddress(d.session),
          ledger: toAddress(d.ledger),
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

  // 1. Try normalized SAP events first. These are already parsed and queryable,
  // even when the raw transaction log cache is partial.
  let dbEventResult: { inscriptions: ParsedInscription[]; ledgerEntries: ParsedLedgerEntry[] } = {
    inscriptions: [],
    ledgerEntries: [],
  };
  try {
    dbEventResult = await fetchEventsFromDb(sessionPda, limit);
  } catch (e) {
    console.warn('[inscription-parser] DB event fetch failed:', (e as Error).message);
  }

  // 2. Try DB transaction logs.
  let dbTxList: Array<{ signature: string; slot: number; blockTime: number | null; logs: string[] }> = [];
  try {
    dbTxList = await fetchLogsFromDb(sessionPda, limit);
  } catch (e) {
    console.warn('[inscription-parser] DB fetch failed:', (e as Error).message);
  }

  // 3. Parse DB logs
  const dbResult = parseLogsForInscriptions(parser, dbTxList);
  const dbSigs = new Set(dbTxList.map(t => t.signature));

  // 4. RPC fallback for additional TXs not in DB
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

  // 5. Merge & dedupe
  const allInscriptions = [
    ...dbEventResult.inscriptions,
    ...dbResult.inscriptions,
    ...rpcResult.inscriptions,
  ];
  const allLedgerEntries = [
    ...dbEventResult.ledgerEntries,
    ...dbResult.ledgerEntries,
    ...rpcResult.ledgerEntries,
  ];

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

  dedupedInsc.sort((a, b) => b.sequence - a.sequence || b.fragmentIndex - a.fragmentIndex);
  dedupedLe.sort((a, b) => b.entryIndex - a.entryIndex);

  const dbEventSigs = new Set([
    ...dbEventResult.inscriptions.map((item) => item.txSignature),
    ...dbEventResult.ledgerEntries.map((item) => item.txSignature),
  ]);
  const txScanned = new Set([
    ...dbEventSigs,
    ...dbTxList.map((item) => item.signature),
    ...rpcTxList.map((item) => item.signature),
  ]);

  return {
    inscriptions: dedupedInsc,
    ledgerEntries: dedupedLe,
    totalTxScanned: txScanned.size,
    totalTxFromDb: new Set([...dbEventSigs, ...dbTxList.map((item) => item.signature)]).size,
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

  const vaultEventResult = await fetchEventsFromDb(vaultPda, opts?.limit ?? 200).catch((e) => {
    console.warn('[inscription-parser] vault event fetch failed:', (e as Error).message);
    return { inscriptions: [], ledgerEntries: [] };
  });

  // Fetch inscriptions for each session
  const results = await Promise.all(
    sessions.map(s => getSessionInscriptions(s.pda, opts)),
  );
  const inscriptions = dedupeInscriptions([
    ...vaultEventResult.inscriptions,
    ...results.flatMap(r => r.inscriptions),
  ]).sort((a, b) => b.sequence - a.sequence || b.fragmentIndex - a.fragmentIndex);
  const ledgerEntries = dedupeLedgerEntries([
    ...vaultEventResult.ledgerEntries,
    ...results.flatMap(r => r.ledgerEntries),
  ]).sort((a, b) => b.entryIndex - a.entryIndex);

  const vaultEventSigs = new Set([
    ...vaultEventResult.inscriptions.map((item) => item.txSignature),
    ...vaultEventResult.ledgerEntries.map((item) => item.txSignature),
  ]);

  return {
    inscriptions,
    ledgerEntries,
    totalTxScanned: vaultEventSigs.size + results.reduce((s, r) => s + r.totalTxScanned, 0),
    totalTxFromDb: vaultEventSigs.size + results.reduce((s, r) => s + r.totalTxFromDb, 0),
    totalTxFromRpc: results.reduce((s, r) => s + r.totalTxFromRpc, 0),
  };
}

function dedupeInscriptions(items: ParsedInscription[]): ParsedInscription[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.txSignature}:${item.sequence}:${item.fragmentIndex}:${item.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeLedgerEntries(items: ParsedLedgerEntry[]): ParsedLedgerEntry[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.txSignature}:${item.entryIndex}:${item.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
