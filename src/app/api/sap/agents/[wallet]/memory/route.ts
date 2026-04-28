export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/memory — Agent memory overview
 *
 * Returns all vaults + sessions + memory stats for an agent.
 * ────────────────────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import {
  getVaultsByAgent,
  getSessionsByVault,
  getAgentMemoryStats,
  getDelegatesByVault,
} from '~/db/memory-queries';

export type AgentMemoryResponse = {
  agentPda: string;
  stats: {
    vaultCount: number;
    totalSessions: number;
    totalInscriptions: number;
    totalBytesInscribed: number;
  };
  vaults: Array<{
    pda: string;
    wallet: string;
    vaultNonce: string;
    totalSessions: number;
    totalInscriptions: number;
    totalBytesInscribed: number;
    nonceVersion: number;
    protocolVersion: number;
    createdAt: number;
    lastNonceRotation: number | null;
    sessionCount: number;
    delegateCount: number;
    sessions: Array<{
      pda: string;
      sessionHash: string;
      sequenceCounter: number;
      totalBytes: number;
      currentEpoch: number;
      totalEpochs: number;
      isClosed: boolean;
      createdAt: number;
      lastInscribedAt: number | null;
    }>;
  }>;
};

async function fetchAgentMemory(agentPda: string): Promise<AgentMemoryResponse> {
  const [stats, vaults] = await Promise.all([
    getAgentMemoryStats(agentPda),
    getVaultsByAgent(agentPda),
  ]);

  const vaultsWithSessions = await Promise.all(
    vaults.map(async (v) => {
      const [sessions, delegates] = await Promise.all([
        getSessionsByVault(v.pda),
        getDelegatesByVault(v.pda),
      ]);
      return {
        pda: v.pda,
        wallet: v.wallet,
        vaultNonce: v.vaultNonce,
        totalSessions: v.totalSessions,
        totalInscriptions: v.totalInscriptions,
        totalBytesInscribed: v.totalBytesInscribed,
        nonceVersion: v.nonceVersion,
        protocolVersion: v.protocolVersion,
        createdAt: v.createdAt,
        lastNonceRotation: v.lastNonceRotation,
        sessionCount: sessions.length,
        delegateCount: delegates.length,
        sessions: sessions.map((s) => ({
          pda: s.pda,
          sessionHash: s.sessionHash,
          sequenceCounter: s.sequenceCounter,
          totalBytes: s.totalBytes,
          currentEpoch: s.currentEpoch,
          totalEpochs: s.totalEpochs,
          isClosed: s.isClosed,
          createdAt: s.createdAt,
          lastInscribedAt: s.lastInscribedAt,
        })),
      };
    }),
  );

  return { agentPda, stats, vaults: vaultsWithSessions };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await params;
  try {
    const data = await swr(`agent-memory:${wallet}`, () => fetchAgentMemory(wallet), {
      ttl: 30_000,
      swr: 120_000,
    });

    return synapseResponse(data);
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? 'unknown';
    // DB transient failure — degrade gracefully so the page still renders
    // other tabs. The UI shows an empty state instead of a hard error.
    const isTransient = /timeout|terminated|ECONNRESET|connection/i.test(msg);
    if (isTransient) {
      console.warn('[agent-memory] transient DB failure, returning empty payload:', msg);
      return synapseResponse({
        agentPda: wallet,
        stats: { vaultCount: 0, totalSessions: 0, totalInscriptions: 0, totalBytesInscribed: 0 },
        vaults: [],
        degraded: true,
      } satisfies AgentMemoryResponse & { degraded: true });
    }
    console.error('[agent-memory]', err);
    return new Response(
      JSON.stringify({ error: msg ?? 'Failed to fetch agent memory' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
