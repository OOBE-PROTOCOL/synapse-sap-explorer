export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/receipts — Fetch receipt batches
 *
 * Data: DB-first (receipt batches are v0.7 entities)
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { db, isDbDown } from '~/db';
import { receiptBatches } from '~/db/schema';
import { desc, sql } from 'drizzle-orm';
import type { ReceiptBatchRow } from '~/types';

export async function GET(req: Request) {
  if (isDbDown()) {
    return NextResponse.json({ receipts: [], total: 0 });
  }

  const url = new URL(req.url);
  const escrowPda = url.searchParams.get('escrow');
  const rawLimit = Number(url.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 100;

  try {
    // Some deployments may not have run v0.7 DB migrations yet.
    const tableCheck = await db.execute(sql`select to_regclass('sap_exp.receipt_batches') is not null as exists`);
    const hasReceiptBatchesTable = Boolean((tableCheck as { rows?: Array<{ exists?: boolean }> }).rows?.[0]?.exists);

    if (!hasReceiptBatchesTable) {
      return NextResponse.json({ receipts: [], total: 0 });
    }

    const { eq } = await import('drizzle-orm');
    const base = db.select().from(receiptBatches);
    const rows: ReceiptBatchRow[] = escrowPda
      ? await base.where(eq(receiptBatches.escrowPda, escrowPda)).orderBy(desc(receiptBatches.createdAt)).limit(limit)
      : await base.orderBy(desc(receiptBatches.createdAt)).limit(limit);

    return NextResponse.json({
      receipts: rows,
      total: rows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch receipts', details: (err as Error).message },
      { status: 500 },
    );
  }
}
