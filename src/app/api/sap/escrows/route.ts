/* ──────────────────────────────────────────────
 * GET /api/sap/escrows — Fetch all escrow accounts
 *
 * Returns serialized escrow data from program.account.escrowAccount.all()
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllEscrows, serialize } from '~/lib/sap/discovery';

export const GET = withSynapseError(async () => {
  const escrows = await findAllEscrows();

  const serialized = escrows.map((e) => {
    const a = e.account;
    return {
      pda: e.pda.toBase58(),
      agent: a.agent?.toBase58?.() ?? String(a.agent ?? ''),
      depositor: a.depositor?.toBase58?.() ?? String(a.depositor ?? ''),
      agentWallet: a.agentWallet?.toBase58?.() ?? String(a.agentWallet ?? ''),
      balance: a.balance?.toString?.() ?? '0',
      totalDeposited: a.totalDeposited?.toString?.() ?? '0',
      totalSettled: a.totalSettled?.toString?.() ?? '0',
      totalCallsSettled: a.totalCallsSettled?.toString?.() ?? '0',
      pricePerCall: a.pricePerCall?.toString?.() ?? '0',
      maxCalls: a.maxCalls?.toString?.() ?? '0',
      createdAt: a.createdAt?.toString?.() ?? '0',
      lastSettledAt: a.lastSettledAt?.toString?.() ?? '0',
      expiresAt: a.expiresAt?.toString?.() ?? '0',
      tokenMint: a.tokenMint?.toBase58?.() ?? null,
      tokenDecimals: a.tokenDecimals ?? 9,
      volumeCurve: (a.volumeCurve ?? []).map((bp: any) => ({
        afterCalls: bp.afterCalls ?? 0,
        pricePerCall: bp.pricePerCall?.toString?.() ?? '0',
      })),
    };
  });

  return synapseResponse({ escrows: serialized, total: serialized.length });
});
