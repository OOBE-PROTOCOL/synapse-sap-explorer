export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/triple-check?asset=<assetId>
 *
 * SDK v0.9.3 — three-layer SAP × MPL link audit.
 *
 *   Layer 1 — mplOnChain : asset readable + AgentIdentity plugin present
 *   Layer 2 — eip8004Json: registration JSON resolves and `synapseAgent`
 *                          matches the derived SAP PDA
 *   Layer 3 — sapOnChain : SAP `AgentAccount` exists at that PDA
 *
 * `wallet` is the expected owner (used as a consistency check); `asset`
 * is the MPL Core asset ID to audit. Returns `{ layers, linked, ... }`.
 *
 * If `asset` is omitted, the route resolves the wallet's SAP-linked
 * asset via `getMetaplexLinkSnapshot` first, then audits it.
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import {
  tripleCheckMetaplexLink,
  getMetaplexLinkSnapshot,
} from '~/lib/sap/metaplex-link';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;
    const url = new URL(req.url);
    let asset = url.searchParams.get('asset');

    if (!asset) {
      const snap = await getMetaplexLinkSnapshot(wallet);
      asset = snap.asset;
    }

    if (!asset) {
      return synapseResponse({
        wallet,
        asset: null,
        sapAgentPda: '',
        layers: { mplOnChain: false, eip8004Json: false, sapOnChain: false },
        linked: false,
        agentIdentityUri: null,
        registration: null,
        agentName: null,
        error: 'no MPL Core asset linked to this wallet',
      });
    }

    const result = await swr(
      `agent:${wallet}:triple-check:${asset}`,
      () => tripleCheckMetaplexLink(asset!, wallet),
      { ttl: 60_000, swr: 300_000 },
    );

    return synapseResponse({ wallet, ...result });
  } catch (err: unknown) {
    console.error('[agent/triple-check]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'triple-check failed' },
      { status: 500 },
    );
  }
}
