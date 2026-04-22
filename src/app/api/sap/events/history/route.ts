/* eslint-disable @typescript-eslint/no-unused-vars */
/* ──────────────────────────────────────────────
 * GET /api/sap/events/history
 *
 * Returns ALL historical events (sap_events + escrow_events)
 * merged and sorted chronologically (oldest → newest).
 *
 * Query params:
 *   ?afterSapId=<number>       — resume from sap_events cursor
 *   ?afterEscrowId=<number>    — resume from escrow_events cursor
 *   ?limit=<number>            — max events per source (default 5000)
 *
 * Response: { events: StreamEvent[], cursors: { lastSapId, lastEscrowId } }
 * ────────────────────────────────────────────── */

import { type NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import type { StreamEvent } from '~/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── DB pool (shared with stream route) ────── */

const _g = globalThis as unknown as { __sseHistoryPool?: InstanceType<typeof Pool> };
function getPool(): Pool {
  if (!_g.__sseHistoryPool) {
    _g.__sseHistoryPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return _g.__sseHistoryPool;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const afterSapId = Number(url.searchParams.get('afterSapId') ?? '0');
  const afterEscrowId = Number(url.searchParams.get('afterEscrowId') ?? '0');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '5000'), 10000);

  const pool = getPool();

  try {
    type SapEventRow = { id: number; event_name: string; tx_signature: string; slot: number; block_time: number | null; data: Record<string, unknown> };
    type EscrowHistoryRow = { id: number; escrow_pda: string; tx_signature: string; event_type: string; slot: number; block_time: number | null; signer: string | null; agent_pda: string | null; depositor: string | null; balance_before: string | null; balance_after: string | null; amount_changed: string | null };

    const [sapRows, escrowRows] = await Promise.all([
      pool.query<SapEventRow>(
        `SELECT e.id, e.event_name, e.tx_signature, e.slot, e.block_time, e.data
         FROM sap_exp.sap_events e
         WHERE e.id > $1
         ORDER BY e.id ASC
         LIMIT $2`,
        [afterSapId, limit],
      ),
      pool.query<EscrowHistoryRow>(
        `SELECT e.id, e.escrow_pda, e.tx_signature, e.event_type, e.slot,
                e.block_time, e.signer, e.agent_pda, e.depositor,
                e.balance_before, e.balance_after, e.amount_changed
         FROM sap_exp.escrow_events e
         WHERE e.id > $1
         ORDER BY e.id ASC
         LIMIT $2`,
        [afterEscrowId, limit],
      ),
    ]);

    type MergedEvent = { type: StreamEvent['type']; payload: Record<string, unknown>; _sort: number };

    // Convert to StreamEvent format and merge by slot (chronological)
    const events: MergedEvent[] = [];

    let lastSapId = afterSapId;
    for (const row of sapRows.rows) {
      events.push({
        type: 'sap_event',
        payload: row,
        _sort: Number(row.slot ?? 0),
      });
      if (row.id > lastSapId) lastSapId = row.id;
    }

    let lastEscrowId = afterEscrowId;
    for (const row of escrowRows.rows) {
      events.push({
        type: 'escrow_event',
        payload: row,
        _sort: Number(row.slot ?? 0),
      });
      if (row.id > lastEscrowId) lastEscrowId = row.id;
    }

    // Sort by slot ascending (oldest first)
    events.sort((a, b) => a._sort - b._sort);

    // Strip internal sort key
    const result = events.map(({ _sort, ...rest }) => rest);

    return NextResponse.json({
      events: result,
      cursors: { lastSapId, lastEscrowId },
      total: result.length,
    });
  } catch (e) {
    console.error('[events/history] Error:', (e as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch event history' },
      { status: 500 },
    );
  }
}
