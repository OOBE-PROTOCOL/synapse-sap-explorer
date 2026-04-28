import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

type DexPair = {
  chainId?: string;
  pairAddress?: string;
  dexId?: string;
  url?: string;
  priceUsd?: string;
  priceNative?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  priceChange?: { h24?: number };
};

type DexResponse = {
  schemaVersion?: string;
  pairs?: DexPair[];
};

function isValidMint(mint: string): boolean {
  try {
    const pk = new PublicKey(mint);
    return PublicKey.isOnCurve(pk);
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;
  if (!isValidMint(mint)) {
    return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `DexScreener request failed (${res.status})` },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as DexResponse;
    const pairs = Array.isArray(raw.pairs) ? raw.pairs : [];
    const solanaPairs = pairs.filter((p) => p.chainId === 'solana');

    if (solanaPairs.length === 0) {
      return NextResponse.json({ mint, pair: null, found: false }, { status: 200 });
    }

    const best = [...solanaPairs].sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
    )[0];

    const payload = {
      mint,
      found: true,
      pair: {
        pairAddress: best.pairAddress ?? null,
        dexId: best.dexId ?? null,
        url: best.url ?? null,
        priceUsd: best.priceUsd ?? null,
        priceNative: best.priceNative ?? null,
        liquidityUsd: best.liquidity?.usd ?? null,
        volume24h: best.volume?.h24 ?? null,
        buys24h: best.txns?.h24?.buys ?? null,
        sells24h: best.txns?.h24?.sells ?? null,
        priceChange24h: best.priceChange?.h24 ?? null,
        fdv: best.fdv ?? null,
        marketCap: best.marketCap ?? null,
      },
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DexScreener error';
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
