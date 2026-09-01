import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, isDbDown } from '~/db';
import { tokenTrades } from '~/db/schema';
import { fetchGenesisAccountByAddress } from '~/lib/metaplex/genesis-onchain';
import { indexGenesisTrades } from '~/lib/market/genesis-trades';

export const dynamic = 'force-dynamic';

const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface TradeRow {
  signature: string;
  side: 'buy' | 'sell';
  trader: string;
  baseAmount: string;       // raw u64
  quoteAmount: string;      // raw lamports
  baseDecimals: number;
  quoteDecimals: number;
  baseUi: number;           // human-readable
  quoteUi: number;          // SOL
  price: number;            // SOL per token
  blockTime: string;        // ISO
  slot: number;
  source: string;
}

export interface TradesResponse {
  genesisAddress: string;
  baseMint: string | null;
  trades: TradeRow[];
  scan: { scanned: number; inserted: number } | null;
}

function isValid(addr: string): boolean {
  return BASE58_ADDRESS_RE.test(addr);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ genesis: string }> },
) {
  const { genesis: genesisAddress } = await params;
  if (!isValid(genesisAddress)) {
    return NextResponse.json({ error: 'Invalid genesis address' }, { status: 400 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 1000);
  const refresh = url.searchParams.get('refresh') !== 'false';

  if (isDbDown()) {
    return NextResponse.json(
      { error: 'Database temporarily unavailable' },
      { status: 503 },
    );
  }

  // Resolve baseMint (needed both for indexing and for the response).
  const account = await fetchGenesisAccountByAddress(genesisAddress);
  const baseMint = account?.baseMint ?? null;

  // Trigger an indexer pass (throttled internally; safe to call every request).
  let scan: TradesResponse['scan'] = null;
  if (refresh && baseMint) {
    const r = await indexGenesisTrades(genesisAddress, baseMint);
    scan = { scanned: r.scanned, inserted: r.inserted };
  }

  const rows = await db
    .select()
    .from(tokenTrades)
    .where(sql`${tokenTrades.genesisAddress} = ${genesisAddress}`)
    .orderBy(sql`${tokenTrades.blockTime} DESC`)
    .limit(limit);

  const trades: TradeRow[] = rows.map((r) => {
    const baseDec = r.baseDecimals;
    const quoteDec = r.quoteDecimals;
    const baseUi = Number(r.baseAmount) / 10 ** baseDec;
    const quoteUi = Number(r.quoteAmount) / 10 ** quoteDec;
    return {
      signature: r.signature,
      side: r.side as 'buy' | 'sell',
      trader: r.trader,
      baseAmount: r.baseAmount,
      quoteAmount: r.quoteAmount,
      baseDecimals: baseDec,
      quoteDecimals: quoteDec,
      baseUi,
      quoteUi,
      price: Number(r.priceQuotePerBase),
      blockTime: r.blockTime.toISOString(),
      slot: r.slot,
      source: r.source,
    };
  });

  const payload: TradesResponse = {
    genesisAddress,
    baseMint,
    trades,
    scan,
  };

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' },
  });
}
