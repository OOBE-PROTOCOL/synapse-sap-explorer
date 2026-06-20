export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { findAllEscrows, serialize } from '~/lib/sap/discovery';
import { peek, put } from '~/lib/cache';
import { selectAllEscrows } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbEscrowToApi } from '~/lib/db/mappers';
import { withTimeout } from '~/lib/async-timeout';

export type EscrowMapEntry = {
  agent: string;
  depositor: string;
  agentWallet: string;
  balance: string;
};

type EscrowMap = Record<string, EscrowMapEntry>;
const CACHE_KEY = 'escrows:map:v2';
const DB_TIMEOUT_MS = 1_500;
const RPC_TIMEOUT_MS = 3_000;

async function rpcFetchEscrowMap(): Promise<EscrowMap> {
  const escrows = await findAllEscrows();
  const map: EscrowMap = {};
  for (const e of escrows) {
    const s = serialize(e.account) as { agent?: string; depositor?: string; agentWallet?: string; balance?: string };
    const pda = e.pda.toBase58();
    map[pda] = {
      agent: s.agent ?? '',
      depositor: s.depositor ?? '',
      agentWallet: s.agentWallet ?? '',
      balance: s.balance ?? '0',
    };
  }
  return map;
}

export async function GET() {
  try {
    const cached = peek<EscrowMap>(CACHE_KEY);
    if (cached && Object.keys(cached).length > 0) {
      return NextResponse.json(cached);
    }

    if (!isDbDown()) try {
      const dbRows = await withTimeout(selectAllEscrows(), DB_TIMEOUT_MS, 'escrows map db read');
      if (dbRows.length > 0) {
        const map: EscrowMap = {};
        for (const row of dbRows) {
          const api = dbEscrowToApi(row);
          map[api.pda] = {
            agent: api.agent ?? '',
            depositor: api.depositor ?? '',
            agentWallet: api.agentWallet ?? '',
            balance: api.balance ?? '0',
          };
        }
        put(CACHE_KEY, map);
        return NextResponse.json(map);
      }
    } catch (e) {
      markDbDown();
      const fallback = peek<EscrowMap>(CACHE_KEY);
      if (fallback && Object.keys(fallback).length > 0) {
        const res = NextResponse.json(fallback);
        res.headers.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=300');
        res.headers.set('x-sap-data-source', 'escrows-map-cache');
        res.headers.set('x-sap-warning', (e as Error).message);
        return res;
      }
      console.warn('[escrows/map] DB read unavailable:', (e as Error).message);
    }

    const data = await withTimeout(rpcFetchEscrowMap(), RPC_TIMEOUT_MS, 'escrows map rpc');
    put(CACHE_KEY, data);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build escrow map';
    const fallback = peek<EscrowMap>(CACHE_KEY);
    if (fallback && Object.keys(fallback).length > 0) {
      const res = NextResponse.json(fallback);
      res.headers.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=300');
      res.headers.set('x-sap-data-source', 'escrows-map-cache');
      res.headers.set('x-sap-warning', message);
      return res;
    }
    console.error('[escrows/map]', err);
    return NextResponse.json({}, { status: 200, headers: { 'x-sap-warning': message } });
  }
}
