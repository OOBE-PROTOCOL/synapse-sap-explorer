export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * POST /api/sap/invalidate — Force-clear all SWR caches
 *
 * Triggers immediate RPC refresh for agents, tools, escrows, etc.
 * Use when new on-chain entities need to appear immediately.
 *
 * Query params:
 *   ?key=agents   — invalidate only a specific cache key prefix
 *                    (default: invalidate everything)
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { invalidatePrefix } from '~/lib/cache';

const ALL_PREFIXES = [
  'agents',
  'tools',
  'escrows',
  'escrow-events',
  'attestations',
  'feedbacks',
  'vaults',
  'graph',
  'metrics',
  'transactions',
];

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (key) {
      invalidatePrefix(key);
      return NextResponse.json({ invalidated: key, message: `Cache prefix "${key}" invalidated` });
    }

    // Invalidate everything
    for (const prefix of ALL_PREFIXES) {
      invalidatePrefix(prefix);
    }

    return NextResponse.json({
      invalidated: ALL_PREFIXES,
      message: 'All caches invalidated. Next request will fetch fresh data from DB + trigger RPC refresh.',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Also allow GET for quick browser/curl usage
export async function GET(req: Request) {
  return POST(req);
}
