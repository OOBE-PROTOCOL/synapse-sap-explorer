export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /agents/[sapPda]/eip-8004.json
 *
 * Canonical hybrid EIP-8004 card. Single source of truth merging:
 *   1. SAP on-chain `AgentAccount`
 *   2. Metaplex Core `AgentIdentity` plugin (if any)
 *   3. Metaplex public Agents Registry (api.metaplex.com)
 *
 * Always served when the SAP agent exists — even when no Metaplex
 * artifact is present, so SAP-only agents still expose a card here.
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
    console.error('[agents/eip-8004.json]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to retrieve EIP-8004 card' },
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
