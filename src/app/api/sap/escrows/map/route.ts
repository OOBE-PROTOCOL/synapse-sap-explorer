export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { findAllEscrows, serialize } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllEscrows } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbEscrowToApi } from '~/lib/db/mappers';

export type EscrowMapEntry = {
  agent: string;
  depositor: string;
  agentWallet: string;
  balance: string;
};

type EscrowMap = Record<string, EscrowMapEntry>;

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
    const cached = peek<EscrowMap>('escrows:map');
    if (cached && Object.keys(cached).length > 0) {
      swr('escrows:map', rpcFetchEscrowMap, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return NextResponse.json(cached);
    }

    if (!isDbDown()) try {
      const dbRows = await selectAllEscrows();
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
        swr('escrows:map', rpcFetchEscrowMap, { ttl: 60_000, swr: 300_000 }).catch(() => {});
        return NextResponse.json(map);
      }
    } catch (e) {
      console.warn('[escrows/map] DB read failed:', (e as Error).message);
      markDbDown();
    }

    const data = await rpcFetchEscrowMap();
    swr('escrows:map', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build escrow map';
    console.error('[escrows/map]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
