export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /agents/[sapPda]/eip-8004
 *
 * Same hybrid card as `/agents/[sapPda]/eip-8004.json`,
 * exposed without the `.json` extension for clients that
 * negotiate via `Accept: application/json`.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { swr } from '~/lib/cache';
import {
  buildHybridEip8004Card,
  AgentNotFoundError,
} from '~/lib/sap/eip-8004-hybrid';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: sapPdaStr } = await params;

    const card = await swr(
      `eip8004:${sapPdaStr}:hybrid`,
      () => buildHybridEip8004Card(sapPdaStr),
      { ttl: 60_000, swr: 300_000 },
    );

    return NextResponse.json(card, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err: unknown) {
    if (err instanceof AgentNotFoundError) {
      return NextResponse.json(
        { error: err.message },
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }
    console.error('[agents/eip-8004]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to retrieve EIP-8004 card' },
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /agents/[wallet]/eip-8004
 *
 * Public endpoint serving EIP-8004 JSON registration.
 * Serves the same data as /api/sap/agents/[wallet]/eip-8004
 * but as a public route (not under /api).
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { swr } from '~/lib/cache';
import { getMetaplexLinkSnapshot } from '~/lib/sap/metaplex-link';
import { getSapClient } from '~/lib/sap/discovery';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: agentPdaStr } = await params;
    const agentPda = new PublicKey(agentPdaStr);

    // Read the AgentAccount to get the owner wallet
    const agent = await swr(
      `agent:${agentPdaStr}:account`,
      () => getSapClient().agent.fetch(agentPda),
      { ttl: 300_000, swr: 600_000 }, // 5min fresh / 10min stale
    );

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found on-chain' },
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }

    // Resolve the Metaplex link
    const snapshot = await swr(
      `agent:${agentPdaStr}:metaplex`,
      () => getMetaplexLinkSnapshot(agent.wallet.toBase58()),
      { ttl: 60_000, swr: 300_000 },
    );

    if (!snapshot.registration || !snapshot.linked) {
      return NextResponse.json(
        { error: 'No Metaplex Core registration found for this agent' },
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }

    // Serve the registration JSON with proper cache headers
    return NextResponse.json(snapshot.registration, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err: unknown) {
    console.error('[agents/eip-8004]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to retrieve EIP-8004 registration' },
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
