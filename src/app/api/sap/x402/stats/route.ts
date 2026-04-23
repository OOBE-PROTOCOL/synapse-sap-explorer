export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/x402/stats — Global x402 direct payment stats
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { getGlobalX402Stats } from '~/lib/sap/x402-scanner';

export async function GET() {
  try {
    const stats = await getGlobalX402Stats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
