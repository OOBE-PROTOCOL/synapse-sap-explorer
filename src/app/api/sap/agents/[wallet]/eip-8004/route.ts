export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/eip-8004
 *
 * Serves the EIP-8004 JSON registration for an agent.
 * This endpoint is referenced by Metaplex Core AgentIdentity plugins
 * and serves as the canonical source of agent metadata.
 *
 * Returns:
 *   - 200 with JSON: agent registration data if linked to MPL Core
 *   - 404: no linked MPL Core asset found
 *   - 500: server error
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

    // Serve the registration JSON
    return NextResponse.json(snapshot.registration, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err: unknown) {
    console.error('[agent/eip-8004]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to retrieve EIP-8004 registration' },
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
