export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/tools/[pda]/events
 *
 * Returns lifecycle events for a specific tool PDA.
 * Data source: tool_events table (populated by event-extractor).
 *
 * Query params:
 *   ?limit=50 — max events to return (default 50, max 200)
 *   ?type=ToolUpdated — filter by event type
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { selectToolEvents } from '~/lib/db/queries';
import { isDbDown } from '~/db';
import type { ToolEventRow } from '~/types';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pda: string }> },
) {
  try {
    const { pda } = await params;

    // Validate PDA
    try {
      new PublicKey(pda);
    } catch {
      return NextResponse.json({ error: 'Invalid PDA' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const typeFilter = searchParams.get('type');

    if (isDbDown()) {
      return NextResponse.json({
        events: [],
        total: 0,
        warning: 'Database unavailable',
      });
    }

    let events: ToolEventRow[] = [];
    try {
      events = await selectToolEvents(pda, limit);
    } catch (e: unknown) {
      const msg = ((e as Error)?.message ?? '').toLowerCase();
      // Graceful fallback when optional table is not yet migrated.
      if (
        msg.includes('relation "sap_exp.tool_events" does not exist') ||
        (msg.includes('failed query') && msg.includes('tool_events')) ||
        msg.includes('does not exist')
      ) {
        return NextResponse.json({
          events: [],
          total: 0,
          warning: 'tool_events table not available yet',
        });
      }
      // Timeout/connection hiccups should not break the tool detail page.
      if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('connection')) {
        return NextResponse.json({
          events: [],
          total: 0,
          warning: 'temporary database issue',
        });
      }
      throw e;
    }

    if (typeFilter) {
      events = events.filter((e) => e.eventType === typeFilter);
    }

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        toolPda: e.toolPda,
        agentPda: e.agentPda,
        txSignature: e.txSignature,
        eventType: e.eventType,
        slot: e.slot,
        blockTime: e.blockTime?.toISOString() ?? null,
        toolName: e.toolName,
        oldVersion: e.oldVersion,
        newVersion: e.newVersion,
        invocations: e.invocations,
        totalInvocations: e.totalInvocations,
        schemaType: e.schemaType,
        indexedAt: e.indexedAt?.toISOString() ?? null,
      })),
      total: events.length,
    });
  } catch (err: unknown) {
    console.error('[tool-events]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch tool events' },
      { status: 500 },
    );
  }
}
