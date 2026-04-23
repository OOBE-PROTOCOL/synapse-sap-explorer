/* ──────────────────────────────────────────────
 * GET /api/sap/escrows/alerts
 * Returns escrows expiring within the next N hours
 * and escrows that are critically low on balance
 * ────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from 'next/server';
import { getExpiringEscrows } from '~/lib/db/queries';
import { db } from '~/db';
import { escrows } from '~/db/schema';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const hoursAhead = Math.min(
      Number(req.nextUrl.searchParams.get('hours') ?? '48'),
      720,
    );

    const [expiring, low] = await Promise.allSettled([
      getExpiringEscrows(hoursAhead),
      db.select()
        .from(escrows)
        .where(
          sql`${escrows.balance}::numeric > 0
            AND ${escrows.pricePerCall}::numeric > 0
            AND ${escrows.balance}::numeric / ${escrows.pricePerCall}::numeric < 3`,
        )
        .limit(50),
    ]);

    const expiringList = expiring.status === 'fulfilled' ? expiring.value : [];
    const lowList = low.status === 'fulfilled' ? low.value : [];

    const fmt = (e: (typeof expiringList)[0]) => ({
      pda: e.pda,
      agentPda: e.agentPda,
      depositor: e.depositor,
      balanceLamports: e.balance,
      balanceSol: (Number(e.balance ?? '0') / 1e9).toFixed(6),
      pricePerCall: e.pricePerCall,
      expiresAt: e.expiresAt,
      status: e.status,
    });

    return NextResponse.json({
      expiringEscrows: expiringList.map(fmt),
      lowBalanceEscrows: lowList.map(fmt),
      total: expiringList.length + lowList.length,
    });
  } catch (err) {
    console.error('[escrows/alerts]', err);
    return NextResponse.json({ error: 'Failed to load escrow alerts' }, { status: 500 });
  }
}
