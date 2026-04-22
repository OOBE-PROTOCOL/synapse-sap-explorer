export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/settlements — Settlement ledger with pagination & filters
 * ────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { selectSettlementLedger, getSettlementLedgerStats } from '~/lib/db/queries';
import type { SettlementLedgerRow } from '~/types';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const agentPda = sp.get('agent') ?? undefined;
    const depositor = sp.get('depositor') ?? undefined;
    const escrowPda = sp.get('escrow') ?? undefined;
    const limit = Math.min(Number(sp.get('limit') ?? 100), 500);
    const offset = Number(sp.get('offset') ?? 0);

    const [ledger, stats] = await Promise.all([
      selectSettlementLedger({ agentPda, depositor, escrowPda, limit, offset }),
      getSettlementLedgerStats(),
    ]);

    return NextResponse.json({
      entries: ledger.rows.map((r: SettlementLedgerRow) => ({
        id: r.id,
        signature: r.signature,
        eventType: r.eventType,
        amountLamports: r.amountLamports,
        callsSettled: r.callsSettled,
        agentPda: r.agentPda,
        depositor: r.depositor,
        escrowPda: r.escrowPda,
        blockTime: r.blockTime?.toISOString() ?? null,
        slot: r.slot,
      })),
      total: ledger.total,
      stats,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
