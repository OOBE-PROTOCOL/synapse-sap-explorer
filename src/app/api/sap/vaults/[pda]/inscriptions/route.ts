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
 *   ?limit=100          — max TXs to scan per session (default: 200)
 *   ?rpc=true           — enable RPC fallback (default: true)
 * ────────────────────────────────────────────────────────── */

import { NextRequest } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
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
    return new Response(JSON.stringify({ error: 'Missing vault PDA' }), { status: 400 });
  }

  try { new PublicKey(pda); } catch {
    return new Response(JSON.stringify({ error: 'Invalid PDA' }), { status: 400 });
  }

  const sessionPda = req.nextUrl.searchParams.get('session');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200), 1000);
  const rpcFallback = req.nextUrl.searchParams.get('rpc') !== 'false';

  if (sessionPda) {
    try { new PublicKey(sessionPda); } catch {
      return new Response(JSON.stringify({ error: 'Invalid session PDA' }), { status: 400 });
    }
  }

  const cacheKey = `inscriptions:${pda}:${sessionPda ?? 'all'}:${limit}`;

  const data = await swr<SessionInscriptionResult>(
    cacheKey,
    () => sessionPda
      ? getSessionInscriptions(sessionPda, { limit, rpcFallback })
      : getVaultInscriptions(pda, { limit, rpcFallback }),
    { ttl: 10_000, swr: 30_000 },
  );

  return synapseResponse(data);
});
