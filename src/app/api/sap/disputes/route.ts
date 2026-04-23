export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/disputes — Fetch all dispute records
 *
 * Data: DB-first (disputes are v0.7 entities)
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { db, isDbDown } from '~/db';
import { disputes } from '~/db/schema';
import { desc, sql } from 'drizzle-orm';
import type { DisputeRow } from '~/types';

export async function GET() {
  if (isDbDown()) {
    return NextResponse.json({ disputes: [], total: 0 });
  }

  try {
    // Some deployments may not have run v0.7 DB migrations yet.
    const tableCheck = await db.execute(sql`select to_regclass('sap_exp.disputes') is not null as exists`);
    const hasDisputesTable = Boolean((tableCheck as { rows?: Array<{ exists?: boolean }> }).rows?.[0]?.exists);

    if (!hasDisputesTable) {
      return NextResponse.json({ disputes: [], total: 0 });
    }

    const rows: DisputeRow[] = await db.select().from(disputes).orderBy(desc(disputes.createdAt)).limit(200);

    

    return NextResponse.json({
      disputes: rows,
      total: rows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch disputes', details: (err as Error).message },
      { status: 500 },
    );
  }
}
