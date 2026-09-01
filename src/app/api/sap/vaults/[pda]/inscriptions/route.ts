export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────────────────
 * GET /api/sap/vaults/[pda]/inscriptions
 *
 * Reconstructs memory inscriptions from TX logs for a vault.
 * Uses the inscription parser to scan both DB (indexed TX logs)
 * and RPC (direct Solana node) for MemoryInscribedEvent events.
 *
 * Query params:
 *   ?session=<pda>      — filter to a specific session (optional)
 *   ?limit=3000         — max TXs/events to scan per session (default: 3000)
 *   ?rpc=true           — enable direct RPC fallback (default: false)
 * ────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import { getVaultByPda } from '~/db/memory-queries';
import {
  getSessionInscriptions,
  getVaultInscriptions,
  type SessionInscriptionResult,
} from '~/lib/sap/inscription-parser';

export const GET = withSynapseError(async (req: NextRequest) => {
  const segments = req.nextUrl.pathname.split('/');
  // /api/sap/vaults/[pda]/inscriptions → pda is at index -2
  const pdaIdx = segments.indexOf('vaults') + 1;
  const pda = segments[pdaIdx];

  if (!pda) {
    return NextResponse.json({ error: 'Missing vault PDA' }, { status: 400 });
  }

  try { new PublicKey(pda); } catch {
    return NextResponse.json({ error: 'Invalid PDA' }, { status: 400 });
  }

  const vault = await getVaultByPda(pda);
  if (!vault) {
    return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
  }

  const sessionPda = req.nextUrl.searchParams.get('session');
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? 3000);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 3000, 1), 5000);
  const rpcFallback = req.nextUrl.searchParams.get('rpc') === 'true';

  if (sessionPda) {
    try { new PublicKey(sessionPda); } catch {
      return NextResponse.json({ error: 'Invalid session PDA' }, { status: 400 });
    }
  }

  const cacheKey = `inscriptions:${pda}:${sessionPda ?? 'all'}:${limit}:${rpcFallback ? 'rpc' : 'db'}`;

  const data = await swr<SessionInscriptionResult>(
    cacheKey,
    () => sessionPda
      ? getSessionInscriptions(sessionPda, { limit, rpcFallback })
      : getVaultInscriptions(pda, { limit, rpcFallback }),
    { ttl: 10_000, swr: 30_000 },
  );

  return synapseResponse(data);
});
