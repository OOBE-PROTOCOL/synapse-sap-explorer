/* ──────────────────────────────────────────────
 * GET /api/sap/volume/daily
 * Daily + hourly settlement volume from ledger
 * ────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from 'next/server';
import { getDailyVolume, getHourlyVolume } from '~/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const bucket = req.nextUrl.searchParams.get('bucket') ?? 'daily';   // 'daily' | 'hourly'
    const days   = Math.min(Number(req.nextUrl.searchParams.get('days') ?? '30'), 90);
    const hours  = Math.min(Number(req.nextUrl.searchParams.get('hours') ?? '24'), 168);

    if (bucket === 'hourly') {
      const rows = await getHourlyVolume(hours);
      const series = rows.map((r) => ({
        bucket: r.hour,
        lamports: r.totalLamports,
        sol: (Number(r.totalLamports) / 1e9).toFixed(6),
        calls: r.totalCalls,
        txCount: r.txCount,
      }));
      return NextResponse.json({ bucket: 'hourly', hours, series });
    }

    const rows = await getDailyVolume(days);
    const series = rows.map((r) => ({
      bucket: r.day,
      lamports: r.totalLamports,
      sol: (Number(r.totalLamports) / 1e9).toFixed(6),
      calls: r.totalCalls,
      txCount: r.txCount,
    }));
    return NextResponse.json({ bucket: 'daily', days, series });
  } catch (err) {
    console.error('[volume/daily]', err);
    return NextResponse.json({ error: 'Failed to load volume data' }, { status: 500 });
  }
}
