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
  try {
    const { wallet } = await params;

    const data = await swr(`agent-memory:${wallet}`, () => fetchAgentMemory(wallet), {
      ttl: 30_000,
      swr: 120_000,
    });

    return synapseResponse(data);
  } catch (err: unknown) {
    console.error('[agent-memory]', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Failed to fetch agent memory' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
