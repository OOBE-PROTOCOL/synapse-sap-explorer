export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/pending-settlements — Fetch v0.7 pending settlements
 *
 * Data: DB-first (pending settlements are v0.7 entities)
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { db, isDbDown } from '~/db';
import { pendingSettlements } from '~/db/schema';
import { desc } from 'drizzle-orm';
import type { PendingSettlementRow } from '~/types';

export async function GET(req: Request) {
  if (isDbDown()) {
    return NextResponse.json({ settlements: [], total: 0 });
  }

  const url = new URL(req.url);
  const escrowPda = url.searchParams.get('escrow');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);

  try {
    const { eq } = await import('drizzle-orm');
    const base = db.select().from(pendingSettlements);
    const rows: PendingSettlementRow[] = escrowPda
      ? await base.where(eq(pendingSettlements.escrowPda, escrowPda)).orderBy(desc(pendingSettlements.createdAt)).limit(limit)
      : await base.orderBy(desc(pendingSettlements.createdAt)).limit(limit);

    return NextResponse.json({
      settlements: rows,
      total: rows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch pending settlements', details: (err as Error).message },
      { status: 500 },
    );
  }
}
