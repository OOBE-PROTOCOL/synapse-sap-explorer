/* ──────────────────────────────────────────────
 * GET /api/sap/network/health
 * Protocol-wide health, utilisation, and growth metrics
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { getNetworkHealth, getProtocolGrowthRate, getExpiringEscrows } from '~/lib/db/queries';
import type { EscrowRow } from '~/types';

type NetworkHealth = Awaited<ReturnType<typeof getNetworkHealth>>;
type ProtocolGrowth = Awaited<ReturnType<typeof getProtocolGrowthRate>>;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [health, growth, expiring] = await Promise.allSettled([
      getNetworkHealth(),
      getProtocolGrowthRate(),
      getExpiringEscrows(48),
    ]);

    const h: NetworkHealth | null = health.status === 'fulfilled' ? health.value : null;
    const g: ProtocolGrowth | null = growth.status === 'fulfilled' ? growth.value : null;
    const exp: EscrowRow[] = expiring.status === 'fulfilled' ? expiring.value : [];

    // Compute utilisation ratio
    const totalDep = Number(h?.escrows.totalDep ?? '0');
    const totalVol = Number(h?.escrows.totalVol ?? '0');
    const utilisation = totalDep > 0 ? Math.round((totalVol / totalDep) * 100) : 0;

    // Active agent share
    const agentUtilisation =
      (h?.agents.total ?? 0) > 0
        ? Math.round(((h?.agents.active ?? 0) / (h?.agents.total ?? 1)) * 100)
        : 0;

    return NextResponse.json({
      agents: {
        total: h?.agents.total ?? 0,
        active: h?.agents.active ?? 0,
        activePercent: agentUtilisation,
        avgReputation: Number((h?.agents.avgRep ?? 0).toFixed(2)),
        withX402: h?.agents.withX402 ?? 0,
        active7d: h?.agents.recent7d ?? 0,
      },
      escrows: {
        total: h?.escrows.total ?? 0,
        active: h?.escrows.active ?? 0,
        totalVolumeSettled: h?.escrows.totalVol ?? '0',
        totalVolumeSettledSol: (Number(h?.escrows.totalVol ?? '0') / 1e9).toFixed(6),
        totalDeposited: h?.escrows.totalDep ?? '0',
        totalDepositedSol: (Number(h?.escrows.totalDep ?? '0') / 1e9).toFixed(6),
        utilisationPercent: utilisation,
        expiringSoon: h?.escrows.expiringSoon ?? 0,
      },
      tools: h?.tools ?? 0,
      vaults: h?.vaults ?? 0,
      growth: g ?? {
        agents:  { thisWeek: 0, lastWeek: 0, deltaPercent: 0 },
        tools:   { thisWeek: 0, lastWeek: 0, deltaPercent: 0 },
        escrows: { thisWeek: 0, lastWeek: 0, deltaPercent: 0 },
      },
      expiringEscrows: exp.slice(0, 20).map((e) => ({
        pda: e.pda,
        agentPda: e.agentPda,
        depositor: e.depositor,
        balance: e.balance,
        expiresAt: e.expiresAt,
      })),
    });
  } catch (err) {
    console.error('[network/health]', err);
    return NextResponse.json({ error: 'Failed to load network health' }, { status: 500 });
  }
}
