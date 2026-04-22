/* ──────────────────────────────────────────────
 * GET /api/sap/depositors
 * Top depositors leaderboard ranked by SOL deposited
 * ────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from 'next/server';
import { getTopDepositors } from '~/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '20'), 100);
    const rows = await getTopDepositors(limit);

    const depositors = rows.map((r, i) => ({
      rank: i + 1,
      depositor: r.depositor,
      totalDepositedLamports: r.totalDeposited ?? '0',
      totalDepositedSol: (Number(r.totalDeposited ?? '0') / 1e9).toFixed(6),
      totalSettledLamports: r.totalSettled ?? '0',
      totalSettledSol: (Number(r.totalSettled ?? '0') / 1e9).toFixed(6),
      lockedBalance: r.totalBalance ?? '0',
      lockedBalanceSol: (Number(r.totalBalance ?? '0') / 1e9).toFixed(6),
      totalCalls: r.totalCalls ?? '0',
      escrowCount: r.escrowCount,
    }));

    return NextResponse.json({ depositors, total: depositors.length });
  } catch (err) {
    console.error('[depositors]', err);
    return NextResponse.json({ error: 'Failed to load depositors' }, { status: 500 });
  }
}
