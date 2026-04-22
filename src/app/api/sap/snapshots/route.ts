export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/snapshots — Network snapshot history for growth charts
 *
 * Primary: DB (network_snapshots table)
 * Backfill: When DB is down, returns a single live snapshot
 *           from GlobalRegistry via RPC.
 * ────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { selectSnapshotHistory } from '~/lib/db/queries';
import { isDbDown } from '~/db';
import { getNetworkOverview, serializeOverview } from '~/lib/sap/discovery';

/** Build a single-point "live" snapshot from on-chain GlobalRegistry */
async function rpcBackfill() {
  const overview = await getNetworkOverview();
  const s = serializeOverview(overview);
  return {
    snapshots: [
      {
        capturedAt: new Date().toISOString(),
        totalAgents: Number(s.totalAgents),
        activeAgents: Number(s.activeAgents),
        totalTools: s.totalTools,
        totalVaults: s.totalVaults,
        totalAttestations: s.totalAttestations,
        totalFeedbacks: Number(s.totalFeedbacks),
        totalCapabilities: s.totalCapabilities,
        totalProtocols: s.totalProtocols,
      },
    ],
    total: 1,
    backfill: true,
  };
}

export async function GET(req: NextRequest) {
  const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? 30), 365);

  // Fast-path: skip DB entirely when circuit breaker is tripped
  if (isDbDown()) {
    try {
      return NextResponse.json(await rpcBackfill());
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  try {
    const snapshots = await selectSnapshotHistory(days);

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        capturedAt: s.capturedAt.toISOString(),
        totalAgents: s.totalAgents,
        activeAgents: s.activeAgents,
        totalTools: s.totalTools,
        totalVaults: s.totalVaults,
        totalAttestations: s.totalAttestations,
        totalFeedbacks: s.totalFeedbacks,
        totalCapabilities: s.totalCapabilities,
        totalProtocols: s.totalProtocols,
      })),
      total: snapshots.length,
    });
  } catch (err) {
    // DB query failed — try RPC backfill
    console.warn('[snapshots] DB failed, trying RPC backfill:', (err as Error).message);
    try {
      return NextResponse.json(await rpcBackfill());
    } catch (rpcErr) {
      return NextResponse.json({ error: (rpcErr as Error).message }, { status: 502 });
    }
  }
}
