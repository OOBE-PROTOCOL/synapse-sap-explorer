export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[sapPda]/eip-8004
 *
 * Internal mirror of the public hybrid EIP-8004 card.
 * Same payload as `/agents/[sapPda]/eip-8004.json`.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { swr } from '~/lib/cache';
import {
  buildHybridEip8004Card,
  AgentNotFoundError,
} from '~/lib/sap/eip-8004-hybrid';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: sapPdaStr } = await params;

    const card = await swr(
      `eip8004:${sapPdaStr}:hybrid`,
      () => buildHybridEip8004Card(sapPdaStr),
      { ttl: 60_000, swr: 300_000 },
    );

    return NextResponse.json(card, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err: unknown) {
    if (err instanceof AgentNotFoundError) {
      return NextResponse.json(
        { error: err.message },
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }
    console.error('[api/agents/eip-8004]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to retrieve EIP-8004 card' },
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
