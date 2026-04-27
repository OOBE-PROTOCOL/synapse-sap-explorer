import {
  getAgentRevenueRanking,
  getDailyVolume,
  getEscrowAggregates,
  getExpiringEscrows,
  getHourlyVolume,
  getLowBalanceEscrows,
  getNetworkHealth,
  getProtocolGrowthRate,
  selectAllAgents,
} from '~/lib/db/queries';
import type { EscrowRow, PublicDataSource } from '~/types';

export type PublicEscrowAlertsResult = {
  expiringEscrows: Array<Record<string, unknown>>;
  lowBalanceEscrows: Array<Record<string, unknown>>;
  total: number;
  source: PublicDataSource;
};

function fmtEscrowAlert(e: EscrowRow): Record<string, unknown> {
  return {
    pda: e.pda,
    agentPda: e.agentPda,
    depositor: e.depositor,
    balanceLamports: e.balance,
    balanceSol: (Number(e.balance ?? '0') / 1e9).toFixed(6),
    pricePerCall: e.pricePerCall,
    expiresAt: e.expiresAt,
    status: e.status,
  };
}

export async function getPublicEscrowAlerts(hoursAhead: number): Promise<PublicEscrowAlertsResult> {
  const [expiring, low] = await Promise.allSettled([
    getExpiringEscrows(hoursAhead),
    getLowBalanceEscrows(50),
  ]);

  const expiringList = expiring.status === 'fulfilled' ? expiring.value : [];
  const lowList = low.status === 'fulfilled' ? low.value : [];

  return {
    expiringEscrows: expiringList.map(fmtEscrowAlert),
    lowBalanceEscrows: lowList.map(fmtEscrowAlert),
    total: expiringList.length + lowList.length,
    source: 'db',
  };
}

export type PublicVolumeResult = {
  volume: Record<string, unknown>;
  source: PublicDataSource;
};

export async function getPublicVolume(): Promise<PublicVolumeResult> {
  const [agg, ranking, allAgents] = await Promise.allSettled([
    getEscrowAggregates(),
    getAgentRevenueRanking(10),
    selectAllAgents(),
  ]);

  const volume = agg.status === 'fulfilled' ? agg.value : null;
  const topAgents = ranking.status === 'fulfilled' ? ranking.value : [];
  const agents = allAgents.status === 'fulfilled' ? allAgents.value : [];
  const agentMap = new Map(agents.map((a) => [a.pda, { name: a.name, isActive: a.isActive }]));

  const totalSettled = Number(volume?.totalVolume ?? '0');

  return {
    volume: {
      totalSettledLamports: volume?.totalVolume ?? '0',
      totalSettledSol: (totalSettled / 1e9).toFixed(9),
      totalCallsSettled: volume?.totalCalls ?? '0',
      totalDeposited: volume?.totalDeposited ?? '0',
      utilizationPercent:
        volume?.totalDeposited && Number(volume.totalDeposited) > 0
          ? Math.round((totalSettled / Number(volume.totalDeposited)) * 100 * 10) / 10
          : 0,
      lockedBalance: volume?.totalBalance ?? '0',
      activeEscrows: volume?.activeEscrows ?? 0,
      fundedEscrows: volume?.fundedEscrows ?? 0,
      totalEscrows: volume?.totalEscrows ?? 0,
      topAgentsByRevenue: topAgents.map((r) => ({
        agentPda: r.agentPda,
        agentName: agentMap.get(r.agentPda)?.name ?? null,
        isActive: agentMap.get(r.agentPda)?.isActive ?? false,
        totalSettled: r.totalSettled,
        totalSettledSol: (Number(r.totalSettled) / 1e9).toFixed(6),
        totalCalls: r.totalCalls,
        escrowCount: r.escrowCount,
        sharePercent:
          totalSettled > 0
            ? Math.round((Number(r.totalSettled) / totalSettled) * 100 * 10) / 10
            : 0,
      })),
    },
    source: 'db',
  };
}

export type PublicVolumeDailyResult = {
  payload: Record<string, unknown>;
  source: PublicDataSource;
};

export async function getPublicVolumeDaily(input: {
  bucket: 'daily' | 'hourly';
  days: number;
  hours: number;
}): Promise<PublicVolumeDailyResult> {
  const { bucket, days, hours } = input;

  if (bucket === 'hourly') {
    let rows: Awaited<ReturnType<typeof getHourlyVolume>> = [];
    try {
      rows = await getHourlyVolume(hours);
    } catch {
      rows = [];
    }
    return {
      payload: {
        bucket: 'hourly',
        hours,
        series: rows.map((r) => ({
          bucket: r.hour,
          lamports: r.totalLamports,
          sol: (Number(r.totalLamports) / 1e9).toFixed(6),
          calls: r.totalCalls,
          txCount: r.txCount,
        })),
      },
      source: 'db',
    };
  }

  let rows: Awaited<ReturnType<typeof getDailyVolume>> = [];
  try {
    rows = await getDailyVolume(days);
  } catch {
    rows = [];
  }
  return {
    payload: {
      bucket: 'daily',
      days,
      series: rows.map((r) => ({
        bucket: r.day,
        lamports: r.totalLamports,
        sol: (Number(r.totalLamports) / 1e9).toFixed(6),
        calls: r.totalCalls,
        txCount: r.txCount,
      })),
    },
    source: 'db',
  };
}

export type PublicNetworkHealthResult = {
  health: Record<string, unknown>;
  source: PublicDataSource;
};

export async function getPublicNetworkHealth(): Promise<PublicNetworkHealthResult> {
  const [health, growth, expiring] = await Promise.allSettled([
    getNetworkHealth(),
    getProtocolGrowthRate(),
    getExpiringEscrows(48),
  ]);

  const h = health.status === 'fulfilled' ? health.value : null;
  const g = growth.status === 'fulfilled' ? growth.value : null;
  const exp = expiring.status === 'fulfilled' ? expiring.value : [];

  const totalDep = Number(h?.escrows.totalDep ?? '0');
  const totalVol = Number(h?.escrows.totalVol ?? '0');
  const utilisation = totalDep > 0 ? Math.round((totalVol / totalDep) * 100) : 0;

  const agentUtilisation =
    (h?.agents.total ?? 0) > 0
      ? Math.round(((h?.agents.active ?? 0) / (h?.agents.total ?? 1)) * 100)
      : 0;

  return {
    health: {
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
      growth:
        g ?? {
          agents: { thisWeek: 0, lastWeek: 0, deltaPercent: 0 },
          tools: { thisWeek: 0, lastWeek: 0, deltaPercent: 0 },
          escrows: { thisWeek: 0, lastWeek: 0, deltaPercent: 0 },
        },
      expiringEscrows: exp.slice(0, 20).map((e) => ({
        pda: e.pda,
        agentPda: e.agentPda,
        depositor: e.depositor,
        balance: e.balance,
        expiresAt: e.expiresAt,
      })),
    },
    source: 'db',
  };
}

