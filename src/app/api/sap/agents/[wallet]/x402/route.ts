export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/x402 — x402 direct payments
 *
 * Query params:
 *   ?limit=50    — max rows (default 50, max 200)
 *   ?offset=0    — pagination offset
 *   ?scan=true   — trigger a fresh scan before returning
 * ────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAgentDirectPayments,
  getAgentX402Stats,
  scanAgentDirectPayments,
} from '~/lib/sap/x402-scanner';
import { x402DirectPayments } from '~/db/schema';
import { db } from '~/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await params;

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const scan = url.searchParams.get('scan') === 'true';

    // Optionally trigger a fresh scan
    if (scan) {
      try {
        const found = await scanAgentDirectPayments(wallet);
        if (found.length > 0) {
          await db
            .insert(x402DirectPayments)
            .values(found.map(p => ({
              signature: p.signature,
              agentWallet: p.agentWallet,
              agentAta: p.agentAta,
              payerWallet: p.payerWallet,
              payerAta: p.payerAta,
              amount: p.amount,
              amountRaw: p.amountRaw,
              mint: p.mint,
              decimals: p.decimals,
              memo: p.memo,
              hasX402Memo: p.hasX402Memo,
              settlementData: p.settlementData,
              slot: p.slot,
              blockTime: p.blockTime,
              indexedAt: new Date(),
            })))
            .onConflictDoNothing({ target: x402DirectPayments.signature });
        }
      } catch (err) {
        console.warn('[x402-api] Scan failed:', (err as Error).message);
      }
    }

    const [data, stats] = await Promise.all([
      getAgentDirectPayments(wallet, { limit, offset }),
      getAgentX402Stats(wallet),
    ]);

    return NextResponse.json({
      wallet,
      payments: data.payments,
      total: data.total,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
