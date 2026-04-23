export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/depositors/[address] — Depositor profile & portfolio
 * ────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { getDepositorProfile } from '~/lib/db/queries';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    const { address } = await params;
    const profile = await getDepositorProfile(address);

    return NextResponse.json({
      depositor: profile.depositor,
      escrows: profile.escrows.map((e) => ({
        pda: e.pda,
        agentPda: e.agentPda,
        balance: e.balance,
        totalDeposited: e.totalDeposited,
        totalSettled: e.totalSettled,
        totalCallsSettled: e.totalCallsSettled,
        pricePerCall: e.pricePerCall,
        status: e.status,
        createdAt: e.createdAt?.toISOString() ?? null,
      })),
      settlements: profile.settlements,
      totalEscrows: profile.escrows.length,
      activeEscrows: profile.escrows.filter((e) => e.status === 'active').length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
