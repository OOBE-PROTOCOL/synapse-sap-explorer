export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/escrows/map — Lightweight escrowPDA→info map
 *
 * SWR cached (5min fresh, 50min stale window).
 * Tries DB first, then falls back to RPC.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { findAllEscrows } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectAllEscrows } from '~/lib/db/queries';
import { dbEscrowToApi } from '~/lib/db/mappers';

export type EscrowMapEntry = {
  agent: string;
  depositor: string;
  agentWallet: string;
  balance: string;
};

export async function GET() {
  try {
    const data = await swr('escrows:map', async () => {
      // 1. Try DB first
      try {
        const dbRows = await selectAllEscrows();
        if (dbRows.length > 0) {
          const map: Record<string, EscrowMapEntry> = {};
          for (const row of dbRows) {
            const api = dbEscrowToApi(row);
            map[api.pda] = {
              agent: api.agent ?? '',
              depositor: api.depositor ?? '',
              agentWallet: api.agentWallet ?? '',
              balance: api.balance ?? '0',
            };
          }
          return map;
        }
      } catch (e) {
        console.warn('[escrows/map] DB read failed:', (e as Error).message);
      }

      // 2. Fallback to RPC
      const escrows = await findAllEscrows();
      const map: Record<string, EscrowMapEntry> = {};
      for (const e of escrows) {
        const a = e.account;
        const pda = e.pda.toBase58();
        map[pda] = {
          agent: a.agent?.toBase58?.() ?? String(a.agent ?? ''),
          depositor: a.depositor?.toBase58?.() ?? String(a.depositor ?? ''),
          agentWallet: a.agentWallet?.toBase58?.() ?? String(a.agentWallet ?? ''),
          balance: a.balance?.toString?.() ?? '0',
        };
      }
      return map;
    }, { ttl: 300_000, swr: 3_000_000 });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build escrow map';
    console.error('[escrows/map]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
