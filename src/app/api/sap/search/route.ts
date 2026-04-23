export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/search?q=... — Global cross-entity search
 * ────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { globalSearch } from '~/lib/db/queries';
import type { SearchResult } from '~/types';

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ results: [], total: 0 });
    }

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 20), 50);
    const results = await globalSearch(q, limit);

    return NextResponse.json({
      results: results.map((r): SearchResult => ({
        pda: r.pda,
        name: r.name,
        wallet: r.wallet,
        type: r.type,
      })),
      total: results.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
