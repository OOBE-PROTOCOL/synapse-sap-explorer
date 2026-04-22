/* ──────────────────────────────────────────────
 * GET /api/sap/stream
 * Unified SSE endpoint — streams ALL SAP events in real-time.
 *
 * Data sources:
 *   1. sap_events (SDK sync engine — all program events)
 *   2. escrow_events (indexer — escrow lifecycle)
 *   3. transactions (indexer — new SAP transactions)
 *
 * Query params:
 *   ?types=escrow,memory,tx   — filter event types (default: all)
 *   ?address=<pda>            — filter to events involving this address
 *
 * Wire format: SSE with JSON payloads
 *   data: { type: "sap_event"|"escrow_event"|"transaction", payload: {...} }
 * ────────────────────────────────────────────── */

import { type NextRequest } from 'next/server';
import { Pool } from 'pg';
import type { StreamEvent } from '~/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_MS       = 3_000;   // poll DB every 3s (more responsive)
const TTL_MS        = 300_000;  // close after 5 min (reconnect expected)
const MAX_INIT      = 30;       // seed with latest N items per source
const MAX_BACKOFF   = 30_000;   // max backoff on consecutive DB errors

/* ── DB pool ──────────────────────────────────────────── */

const _g = globalThis as unknown as { __sseStreamPool?: InstanceType<typeof Pool> };
function getPool(): Pool {
  if (!_g.__sseStreamPool) {
    _g.__sseStreamPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return _g.__sseStreamPool;
}

/* ── Queries ──────────────────────────────────────────── */

type SapEventRow = { id: number; event_name: string; tx_signature: string; slot: number; block_time: number | null; data: Record<string, unknown> };
type EscrowEventRow = { id: number; escrow_pda: string; tx_signature: string; event_type: string; slot: number; block_time: number | null; signer: string | null; agent_pda: string | null; depositor: string | null; balance_before: string | null; balance_after: string | null; amount_changed: string | null };
type TransactionStreamRow = { signature: string; slot: number; block_time: number | null; signer: string | null; fee_sol: number; sap_instructions: string[]; err: boolean; programs: Array<{ id: string; name: string }> };

async function fetchSapEvents(pool: Pool, afterId: number, address?: string, limit = 50): Promise<SapEventRow[]> {
  const params: (string | number)[] = [afterId, limit];
  let where = 'WHERE e.id > $1';
  if (address) {
    where += ` AND e.data::text LIKE '%' || $3 || '%'`;
    params.push(address);
  }
  const { rows } = await pool.query<SapEventRow>(
    `SELECT e.id, e.event_name, e.tx_signature, e.slot, e.block_time, e.data
     FROM sap_exp.sap_events e ${where}
     ORDER BY e.id ASC LIMIT $2`,
    params,
  );
  return rows;
}

async function fetchEscrowEvents(pool: Pool, afterId: number, address?: string, limit = 50): Promise<EscrowEventRow[]> {
  const params: (string | number)[] = [afterId, limit];
  let where = 'WHERE e.id > $1';
  if (address) {
    where += ` AND (e.escrow_pda = $3 OR e.agent_pda = $3 OR e.depositor = $3 OR e.signer = $3)`;
    params.push(address);
  }
  const { rows } = await pool.query<EscrowEventRow>(
    `SELECT e.id, e.escrow_pda, e.tx_signature, e.event_type, e.slot,
            e.block_time, e.signer, e.agent_pda, e.depositor,
            e.balance_before, e.balance_after, e.amount_changed
     FROM sap_exp.escrow_events e ${where}
     ORDER BY e.id ASC LIMIT $2`,
    params,
  );
  return rows;
}

async function fetchTransactions(pool: Pool, afterSlot: number, address?: string, limit = 50): Promise<TransactionStreamRow[]> {
  const params: (string | number)[] = [afterSlot, limit];
  let where = 'WHERE t.slot > $1';
  if (address) {
    where += ` AND (t.signer = $3 OR t.signature IN (
      SELECT d.signature FROM sap_exp.tx_details d
      WHERE d.account_keys::text LIKE '%' || $3 || '%'
    ))`;
    params.push(address);
  }
  const { rows } = await pool.query<TransactionStreamRow>(
    `SELECT t.signature, t.slot, t.block_time, t.signer, t.fee_sol,
            t.sap_instructions, t.err, t.programs
     FROM sap_exp.transactions t ${where}
     ORDER BY t.slot ASC LIMIT $2`,
    params,
  );
  return rows;
}

/* ── SSE handler ──────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const url = req.nextUrl;

  const typesParam = url.searchParams.get('types');
  const address = url.searchParams.get('address') ?? undefined;
  const enabledTypes = new Set(
    typesParam ? typesParam.split(',').map(s => s.trim()) : ['sap_event', 'escrow_event', 'transaction'],
  );

  const pool = getPool();

  // Get initial cursors (latest IDs)
  let lastSapEventId = 0;
  let lastEscrowEventId = 0;
  let lastTxSlot = 0;

  try {
    if (enabledTypes.has('sap_event')) {
      const { rows } = await pool.query<{ m: number }>(`SELECT COALESCE(MAX(id), 0) AS m FROM sap_exp.sap_events`);
      lastSapEventId = Math.max(0, (rows[0]?.m ?? 0) - MAX_INIT);
    }
    if (enabledTypes.has('escrow_event')) {
      const { rows } = await pool.query<{ m: number }>(`SELECT COALESCE(MAX(id), 0) AS m FROM sap_exp.escrow_events`);
      lastEscrowEventId = Math.max(0, (rows[0]?.m ?? 0) - MAX_INIT);
    }
    if (enabledTypes.has('transaction')) {
      const { rows } = await pool.query<{ m: number }>(`SELECT COALESCE(MAX(slot), 0) AS m FROM sap_exp.transactions`);
      lastTxSlot = Math.max(0, Number(rows[0]?.m ?? 0) - 100);  // look back ~100 slots
    }
  } catch (e) {
    console.warn('[stream] Cursor init failed:', (e as Error).message);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const startTs = Date.now();
      let closed = false;

      function send(type: StreamEvent['type'], payload: Record<string, unknown>) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, payload })}\n\n`));
        } catch {
          closed = true;
        }
      }

      // Send initial connected message
      send('connected', { types: Array.from(enabledTypes), address: address ?? null });

      let consecutiveErrors = 0;

      async function poll() {
        if (closed || Date.now() - startTs > TTL_MS) {
          if (!closed) {
            send('close', { reason: 'ttl' });
            try { controller.close(); } catch {}
          }
          return;
        }

        try {
          // Fetch new events from each source
          if (enabledTypes.has('sap_event')) {
            const events = await fetchSapEvents(pool, lastSapEventId, address);
            for (const ev of events) {
              send('sap_event', ev);
              if (ev.id > lastSapEventId) lastSapEventId = ev.id;
            }
          }

          if (enabledTypes.has('escrow_event')) {
            const events = await fetchEscrowEvents(pool, lastEscrowEventId, address);
            for (const ev of events) {
              send('escrow_event', ev);
              if (ev.id > lastEscrowEventId) lastEscrowEventId = ev.id;
            }
          }

          if (enabledTypes.has('transaction')) {
            const txs = await fetchTransactions(pool, lastTxSlot, address);
            for (const tx of txs) {
              send('transaction', tx);
              if (tx.slot > lastTxSlot) lastTxSlot = tx.slot;
            }
          }

          // Keep-alive
          if (!closed) {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          }

          // Reset backoff on success
          consecutiveErrors = 0;
        } catch (e) {
          consecutiveErrors++;
          if (consecutiveErrors <= 3) {
            console.warn(`[stream] Poll error (${consecutiveErrors}):`, (e as Error).message);
          }
        }

        if (!closed) {
          // Exponential backoff: 3s → 6s → 12s → … → 30s max
          const delay = Math.min(POLL_MS * Math.pow(2, consecutiveErrors), MAX_BACKOFF);
          setTimeout(poll, delay);
        }
      }

      // Start first poll after POLL_MS
      setTimeout(poll, POLL_MS);

      req.signal.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
