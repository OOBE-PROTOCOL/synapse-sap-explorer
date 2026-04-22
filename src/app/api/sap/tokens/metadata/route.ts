export const dynamic = 'force-dynamic';

/**
 * GET /api/sap/tokens/metadata?mints=MINT1,MINT2,...
 *
 * Batch-resolve SPL token metadata (name, symbol, logo).
 * Uses the shared token-metadata service with DB caching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveTokens, type TokenMeta } from '~/lib/sap/token-metadata';

export async function GET(req: NextRequest) {
  try {
    const mintsParam = req.nextUrl.searchParams.get('mints');
    if (!mintsParam) {
      return NextResponse.json({ error: 'Missing ?mints= parameter' }, { status: 400 });
    }

    const mints = mintsParam.split(',').filter(Boolean).slice(0, 50); // cap at 50
    if (mints.length === 0) {
      return NextResponse.json({ tokens: {} });
    }

    const metaMap = await resolveTokens(mints);
    const tokens: Record<string, TokenMeta> = {};
    for (const [mint, meta] of metaMap) {
      tokens[mint] = meta;
    }

    return NextResponse.json({ tokens });
  } catch (e) {
    console.error('[tokens/metadata] Error:', e);
    return NextResponse.json({ error: 'Failed to resolve token metadata' }, { status: 500 });
  }
}
