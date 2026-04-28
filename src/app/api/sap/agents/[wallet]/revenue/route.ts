/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/revenue
 * Per-agent daily revenue time-series + totals
 * ────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from 'next/server';
import { getAgentRevenueSeries, getAgentRevenueRanking, selectAgentByWallet } from '~/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;
    const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? '30'), 90);

    const agent = await selectAgentByWallet(wallet);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const [series, ranking] = await Promise.allSettled([
      getAgentRevenueSeries(agent.pda, days),
      getAgentRevenueRanking(100),          // fetch all then find this agent
    ]);

    const dailySeries = series.status === 'fulfilled' ? series.value : [];

    // Extract this agent's totals from ranking
    const allRanked = ranking.status === 'fulfilled' ? ranking.value : [];
    const agentRank = allRanked.find((r) => r.agentPda === agent.pda);

    // cumulative SOL over the series window (from escrow totals — always accurate)
    const totalSettledLamports = agentRank?.totalSettled ?? '0';
    const totalCalls = agentRank?.totalCalls ?? '0';
    const escrowCount = agentRank?.escrowCount ?? 0;

    // Fill gaps: create a sorted array of { day, lamports, calls }
    const seriesWithLabels = dailySeries.map((row) => ({
      day: row.day,
      lamports: row.totalLamports,
      sol: (Number(row.totalLamports) / 1e9).toFixed(6),
      calls: row.totalCalls,
      txCount: row.txCount,
    }));

    return NextResponse.json({
      agentPda: agent.pda,
      wallet,
      days,
      totalSettledLamports,
      totalSettledSol: (Number(totalSettledLamports) / 1e9).toFixed(6),
      totalCalls,
      escrowCount,
      series: seriesWithLabels,
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    const isTransient = /timeout|terminated|ECONNRESET|connection/i.test(msg);
    if (isTransient) {
      console.warn('[revenue] transient DB failure, returning empty payload:', msg);
      const { wallet } = await params;
      return NextResponse.json({
        agentPda: null,
        wallet,
        days: 30,
        totalSettledLamports: '0',
        totalSettledSol: '0.000000',
        totalCalls: '0',
        escrowCount: 0,
        series: [],
        degraded: true,
      });
    }
    console.error('[revenue]', err);
    return NextResponse.json({ error: 'Failed to load revenue data' }, { status: 500 });
  }
}
