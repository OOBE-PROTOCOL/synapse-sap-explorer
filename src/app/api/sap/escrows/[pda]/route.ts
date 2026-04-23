export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/escrows/[pda] — Fetch single escrow by PDA
 *
 * Eliminates N+1: detail page no longer loads all escrows.
 * Data flow: DB → (fallback) RPC list scan
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { isDbDown } from '~/db';
import { selectEscrowByPda } from '~/lib/db/queries';
import { dbEscrowToApi } from '~/lib/db/mappers';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pda: string }> },
) {
  const { pda } = await params;

  if (!pda || pda.length < 32) {
    return NextResponse.json({ error: 'Invalid PDA' }, { status: 400 });
  }

  // Try DB first
  if (!isDbDown()) {
    try {
      const row = await selectEscrowByPda(pda);
      if (row) {
        return NextResponse.json({ escrow: dbEscrowToApi(row) });
      }
    } catch {
      // fall through to 404
    }
  }

  // Fallback: fetch all from cache and find
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sap/escrows`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const escrow = data.escrows?.find((e: { pda: string }) => e.pda === pda);
      if (escrow) {
        return NextResponse.json({ escrow });
      }
    }
  } catch {
    // fall through to 404
  }

  return NextResponse.json({ error: 'Escrow not found' }, { status: 404 });
}
