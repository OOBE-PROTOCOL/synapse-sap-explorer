import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { sql } from 'drizzle-orm';
import { db, isDbDown } from '~/db';

export interface OhlcvCandle {
  time: number;       // unix seconds (start of bucket)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;     // base-token UI volume in the bucket
  trades: number;
}

export interface OhlcvResponse {
  genesisAddress: string;
  interval: string;   // '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  candles: OhlcvCandle[];
}

const INTERVAL_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

function isValid(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
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
  const interval = url.searchParams.get('interval') ?? '5m';
  const bucketSec = INTERVAL_SECONDS[interval];
  if (!bucketSec) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
  }
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 500), 2000);

  if (isDbDown()) {
    return NextResponse.json(
      { error: 'Database temporarily unavailable' },
      { status: 503 },
    );
  }

  // Single SQL aggregation: bucket trades into candles ordered ASC.
  // We use date_bin for time bucketing (Postgres 14+).
  const rows = await db.execute<{
    bucket: Date;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    trades: string;
  }>(sql`
    WITH bucketed AS (
      SELECT
        date_bin(${`${bucketSec} seconds`}::interval, block_time, 'epoch'::timestamptz) AS bucket,
        price_quote_per_base::float8 AS price,
        (base_amount::numeric / power(10, base_decimals)::numeric)::float8 AS base_ui,
        signature,
        block_time
      FROM sap_exp.token_trades
      WHERE genesis_address = ${genesisAddress}
    )
    SELECT
      bucket,
      (SELECT price FROM bucketed b2 WHERE b2.bucket = b.bucket ORDER BY block_time ASC  LIMIT 1) AS open,
      (SELECT price FROM bucketed b2 WHERE b2.bucket = b.bucket ORDER BY block_time DESC LIMIT 1) AS close,
      MAX(price) AS high,
      MIN(price) AS low,
      SUM(base_ui) AS volume,
      COUNT(*)    AS trades
    FROM bucketed b
    GROUP BY bucket
    ORDER BY bucket ASC
    LIMIT ${limit}
  `);

  const candles: OhlcvCandle[] = rows.rows.map((r) => ({
    time: Math.floor(new Date(r.bucket).getTime() / 1000),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    trades: Number(r.trades),
  }));

  const payload: OhlcvResponse = { genesisAddress, interval, candles };
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' },
  });
}
