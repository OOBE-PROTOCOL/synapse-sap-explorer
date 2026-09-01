export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { AgentStakeSummary } from '~/app/api/sap/agents/enriched/route';

const LAMPORTS_PER_SOL = 1_000_000_000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;
    const { PublicKey } = await import('@solana/web3.js');
    const { getSapClient } = await import('~/lib/sap/discovery');
    const agentPda = new PublicKey(wallet);
    const stake = await getSapClient().staking.fetchNullable(agentPda);

    if (!stake) {
      return NextResponse.json(null);
    }

    const bnToNum = (v: { toNumber?: () => number; toString?: () => string }) =>
      typeof v.toNumber === 'function' ? v.toNumber() : Number(v.toString?.() ?? 0);

    const summary: AgentStakeSummary = {
      stakedSol: bnToNum(stake.stakedAmount) / LAMPORTS_PER_SOL,
      slashedSol: bnToNum(stake.slashedAmount) / LAMPORTS_PER_SOL,
      unstakeAmountSol: bnToNum(stake.unstakeAmount) / LAMPORTS_PER_SOL,
      unstakeAvailableAt: bnToNum(stake.unstakeAvailableAt) || null,
      lastStakeAt: bnToNum(stake.lastStakeAt) || null,
      totalDisputesWon: stake.totalDisputesWon,
      totalDisputesLost: stake.totalDisputesLost,
      createdAt: bnToNum(stake.createdAt) || null,
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[agent/staking]', err);
    return NextResponse.json(null);
  }
}
