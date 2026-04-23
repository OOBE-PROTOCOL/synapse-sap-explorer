
import type { Pool } from 'pg';
import { EventParser } from '@oobe-protocol-labs/synapse-sap-sdk/events';
import { getSapClient } from '~/lib/sap/discovery';
import { getSharedPool } from '~/db';

const _g = globalThis as unknown as { __evtParser?: EventParser };

function getEventParser(): EventParser {
  if (!_g.__evtParser) {
    const client = getSapClient();
    _g.__evtParser = new EventParser(client.program);
  }
  return _g.__evtParser;
}

function getEvtPool(): Pool {
  return getSharedPool();
}

/**
 * Parse SAP Anchor events from transaction logs and insert into sap_events.
 * Call this after successfully indexing a transaction.
 */
export async function extractAndInsertEvents(
  logs: string[],
  txSignature: string,
  slot: number,
  blockTime: number | null,
  signer: string | null,
): Promise<number> {
  if (!logs || logs.length === 0) return 0;

  const parser = getEventParser();
  let events;
  try {
    events = parser.parseLogs(logs);
  } catch (e) {
    console.warn(`[events] parseLogs failed for tx ${txSignature.slice(0, 12)}:`, (e as Error).message);
    return 0;
  }

  if (events.length === 0) return 0;

  const pool = getEvtPool();

  // Extract agent PDA from event data if present
  for (const event of events) {
    const data = event.data as Record<string, unknown>;
    const agentPda = (data.agent as { toBase58?: () => string })?.toBase58?.()
      ?? (typeof data.agent === 'string' ? data.agent : null);
    const wallet = (data.wallet as { toBase58?: () => string })?.toBase58?.()
      ?? (typeof data.wallet === 'string' ? data.wallet : null);

    // Serialize Pubkeys in data to strings for JSON storage
    const serializedData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'toBase58' in v) {
        serializedData[k] = (v as { toBase58: () => string }).toBase58();
      } else if (v && typeof v === 'object' && 'toNumber' in v) {
        serializedData[k] = (v as { toNumber: () => number }).toNumber();
      } else if (Array.isArray(v)) {
        serializedData[k] = v.map(item => {
          if (item && typeof item === 'object' && 'toBase58' in item) return item.toBase58();
          if (item && typeof item === 'object' && 'toNumber' in item) return item.toNumber();
          return item;
        });
      } else {
        serializedData[k] = v;
      }
    }

    try {
      await pool.query(
        `INSERT INTO sap_exp.sap_events
          (event_name, tx_signature, slot, block_time, data, agent_pda, wallet, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [
          event.name,
          txSignature,
          slot,
          blockTime,
          JSON.stringify(serializedData),
          agentPda,
          wallet ?? signer,
        ],
      );
    } catch (e) {
      // Duplicate or constraint error — skip silently
      console.warn(`[events] Insert failed for ${event.name}: ${(e as Error).message}`);
    }

    // ── Tool lifecycle events → tool_events + tool_schemas tables ──
    await extractToolEvent(pool, event, data, serializedData, txSignature, slot, blockTime);
  }

  return events.length;
}

/* ── Tool Event Mapping ────────────────────────────────── */

const TOOL_EVENT_MAP: Record<string, string> = {
  ToolPublishedEvent:          'ToolPublished',
  ToolUpdatedEvent:            'ToolUpdated',
  ToolDeactivatedEvent:        'ToolDeactivated',
  ToolReactivatedEvent:        'ToolReactivated',
  ToolClosedEvent:             'ToolClosed',
  ToolSchemaInscribedEvent:    'ToolSchemaInscribed',
  ToolInvocationReportedEvent: 'ToolInvocationReported',
};

const SCHEMA_TYPE_LABELS: Record<number, string> = { 0: 'input', 1: 'output', 2: 'description' };

async function extractToolEvent(
  pool: Pool,
  event: { name: string; data: Record<string, unknown> },
  rawData: Record<string, unknown>,
  serializedData: Record<string, unknown>,
  txSignature: string,
  slot: number,
  blockTime: number | null,
): Promise<void> {
  const eventType = TOOL_EVENT_MAP[event.name];
  if (!eventType) return;

  const toolPda = (rawData.tool as { toBase58?: () => string })?.toBase58?.()
    ?? (typeof rawData.tool === 'string' ? rawData.tool : null);
  const agentPda = (rawData.agent as { toBase58?: () => string })?.toBase58?.()
    ?? (typeof rawData.agent === 'string' ? rawData.agent : null);

  if (!toolPda || !agentPda) return;

  const toolName = (rawData.toolName ?? rawData.tool_name ?? null) as string | null;
  const bt = blockTime ? new Date(blockTime * 1000) : null;

  // Insert into tool_events
  try {
    await pool.query(
      `INSERT INTO sap_exp.tool_events
        (tool_pda, agent_pda, tx_signature, event_type, slot, block_time,
         tool_name, old_version, new_version, invocations, total_invocations,
         schema_type, extra, indexed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (tx_signature, event_type, tool_pda) DO NOTHING`,
      [
        toolPda,
        agentPda,
        txSignature,
        eventType,
        slot,
        bt,
        toolName,
        numOrNull(serializedData.oldVersion ?? serializedData.old_version),
        numOrNull(serializedData.newVersion ?? serializedData.new_version ?? serializedData.version),
        numOrNull(serializedData.invocationsReported ?? serializedData.invocations_reported),
        numOrNull(serializedData.totalInvocations ?? serializedData.total_invocations),
        numOrNull(serializedData.schemaType ?? serializedData.schema_type),
        JSON.stringify(serializedData),
      ],
    );
  } catch (e) {
    console.warn(`[events] tool_event insert failed: ${(e as Error).message}`);
  }

  // For ToolSchemaInscribedEvent, also insert into tool_schemas
  if (event.name === 'ToolSchemaInscribedEvent') {
    await extractToolSchema(pool, rawData, toolPda, agentPda, txSignature, bt, toolName);
  }
}

async function extractToolSchema(
  pool: Pool,
  rawData: Record<string, unknown>,
  toolPda: string,
  agentPda: string,
  txSignature: string,
  blockTime: Date | null,
  toolName: string | null,
): Promise<void> {
  const schemaTypeRaw = Number(rawData.schemaType ?? rawData.schema_type ?? 0);
  const schemaTypeLabel = SCHEMA_TYPE_LABELS[schemaTypeRaw] ?? `unknown(${schemaTypeRaw})`;
  const compressionRaw = Number(rawData.compression ?? 0);
  const version = Number(
    (rawData.version as { toNumber?: () => number })?.toNumber?.() ?? rawData.version ?? 0,
  );

  // Decode schema data
  const sd = rawData.schemaData ?? rawData.schema_data;
  let rawBuf: Buffer;
  if (Buffer.isBuffer(sd)) {
    rawBuf = sd;
  } else if (sd instanceof Uint8Array) {
    rawBuf = Buffer.from(sd);
  } else if (Array.isArray(sd)) {
    rawBuf = Buffer.from(sd as number[]);
  } else {
    return; // no schema data
  }

  // Decompress if needed (0=none, 1=deflate)
  let schemaStr: string;
  if (compressionRaw === 1) {
    try {
      const zlib = await import('zlib');
      schemaStr = zlib.inflateRawSync(rawBuf).toString('utf-8');
    } catch {
      schemaStr = rawBuf.toString('utf-8');
    }
  } else {
    schemaStr = rawBuf.toString('utf-8');
  }

  // Try JSON parse
  let schemaJson: unknown = null;
  try { schemaJson = JSON.parse(schemaStr); } catch { /* not JSON */ }

  // Hash verification
  const hashData = rawData.schemaHash ?? rawData.schema_hash;
  let schemaHash = '';
  if (Buffer.isBuffer(hashData)) schemaHash = hashData.toString('hex');
  else if (hashData instanceof Uint8Array) schemaHash = Buffer.from(hashData).toString('hex');
  else if (Array.isArray(hashData)) schemaHash = (hashData as number[]).map(b => b.toString(16).padStart(2, '0')).join('');

  const { createHash } = await import('crypto');
  const computedHash = createHash('sha256').update(rawBuf).digest('hex');
  const verified = !!(schemaHash && computedHash === schemaHash);

  try {
    await pool.query(
      `INSERT INTO sap_exp.tool_schemas
        (tool_pda, agent_pda, tx_signature, schema_type, schema_type_label,
         schema_data, schema_json, schema_hash, computed_hash, verified,
         compression, version, tool_name, block_time, indexed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (tool_pda, schema_type, version) DO UPDATE SET
         schema_data = EXCLUDED.schema_data,
         schema_json = EXCLUDED.schema_json,
         schema_hash = EXCLUDED.schema_hash,
         computed_hash = EXCLUDED.computed_hash,
         verified = EXCLUDED.verified,
         compression = EXCLUDED.compression,
         tx_signature = EXCLUDED.tx_signature,
         block_time = EXCLUDED.block_time,
         indexed_at = NOW()`,
      [
        toolPda, agentPda, txSignature, schemaTypeRaw, schemaTypeLabel,
        schemaStr, schemaJson ? JSON.stringify(schemaJson) : null,
        schemaHash, computedHash, verified, compressionRaw,
        version, toolName, blockTime,
      ],
    );
  } catch (e) {
    console.warn(`[events] tool_schema insert failed: ${(e as Error).message}`);
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Backfill events from all already-indexed transactions that have logs.
 * Safe to run multiple times (ON CONFLICT DO NOTHING).
 */
export async function backfillEventsFromLogs(): Promise<number> {
  const pool = getEvtPool();
  let total = 0;

  try {
    // Get all tx_details that have logs
    const { rows } = await pool.query(
      `SELECT d.signature, d.logs, t.slot, t.block_time, t.signer
       FROM sap_exp.tx_details d
       JOIN sap_exp.transactions t ON t.signature = d.signature
       WHERE d.logs IS NOT NULL AND jsonb_array_length(d.logs) > 0
       ORDER BY t.slot ASC`,
    );

    for (const row of rows) {
      const logs = row.logs as string[];
      if (!logs?.length) continue;

      const blockTime = row.block_time
        ? Math.floor(new Date(row.block_time).getTime() / 1000)
        : null;

      const count = await extractAndInsertEvents(
        logs,
        row.signature,
        row.slot,
        blockTime,
        row.signer,
      );
      total += count;
    }
  } catch (e) {
    console.warn('[events] Backfill error:', (e as Error).message);
  }

  return total;
}
