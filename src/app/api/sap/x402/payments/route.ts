export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/x402/payments — Global x402 direct payments (paginated)
 * ────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { selectX402Payments } from '~/lib/db/queries';
import type { X402DirectPaymentRow } from '~/types';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const agentWallet = sp.get('agent') ?? undefined;
    const payerWallet = sp.get('payer') ?? undefined;
    const hasX402Memo = sp.has('x402Only') ? true : undefined;
    const limit = Math.min(Number(sp.get('limit') ?? 100), 500);
    const offset = Number(sp.get('offset') ?? 0);

    const result: { rows: X402DirectPaymentRow[]; total: number } = await selectX402Payments({ agentWallet, payerWallet, hasX402Memo, limit, offset });

    return NextResponse.json({
      payments: result.rows.map((r) => ({
        id: r.id,
        signature: r.signature,
        agentWallet: r.agentWallet,
        agentAta: r.agentAta,
        payerWallet: r.payerWallet,
        payerAta: r.payerAta,
        amount: r.amount,
        amountRaw: r.amountRaw,
        mint: r.mint,
        decimals: r.decimals,
        memo: r.memo,
        hasX402Memo: r.hasX402Memo,
        slot: r.slot,
        blockTime: r.blockTime?.toISOString() ?? null,
      })),
      total: result.total,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
