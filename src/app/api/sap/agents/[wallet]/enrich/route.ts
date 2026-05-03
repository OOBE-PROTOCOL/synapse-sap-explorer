/**
 * GET /api/sap/agents/[wallet]/enrich
 *
 * Returns the heavy enrichment slice for a single agent wallet — used by
 * the /agents listing once a card scrolls into view. Backed by the
 * persistent `agent_enrichment_cache` SWR store so cold starts are
 * instant and refreshes happen in background.
 *
 * Caller passes optional `?agentPda=…&endpoint=…&agentUri=…` to seed the
 * resolver; without them the snapshot still returns whatever is cached
 * but background refresh becomes a no-op for missing fields.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getCachedAgentEnrichment,
  type AgentEnrichmentSnapshot,
} from '~/lib/sap/agent-enrichment-store';
import { getCachedAgentLogo, type AgentLogoSnapshot } from '~/lib/sap/agent-logo-store';
import { getCachedAgentMetaplex } from '~/lib/sap/metaplex-snapshot-store';

export interface AgentEnrichResponse {
  enrichment: AgentEnrichmentSnapshot;
  logos: AgentLogoSnapshot | null;
  metaplex: {
    asset: string | null;
    linked: boolean;
    pluginCount: number;
    registryCount: number;
  } | null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;
    if (!wallet) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400 });
    }
    const url = new URL(req.url);
    const agentPda = url.searchParams.get('agentPda');
    const endpoint = url.searchParams.get('endpoint');
    const agentUri = url.searchParams.get('agentUri');

    const [enrichment, logos, metaplex] = await Promise.all([
      getCachedAgentEnrichment({ wallet, agentPda, endpoint, agentUri }),
      getCachedAgentLogo(wallet, endpoint).catch(() => null),
      getCachedAgentMetaplex(wallet).catch(() => null),
    ]);

    const body: AgentEnrichResponse = {
      enrichment,
      logos,
      metaplex: metaplex
        ? {
            asset: metaplex.asset,
            linked: metaplex.linked,
            pluginCount: metaplex.pluginCount,
            registryCount: metaplex.registryCount,
          }
        : null,
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
    });
  } catch (err) {
    console.error('[agents/enrich] Error:', err);
    return NextResponse.json({ error: 'Failed to enrich agent' }, { status: 500 });
  }
}
