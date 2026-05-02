import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import {
  genesis,
  safeFetchGenesisAccountV2,
  findBondingCurveBucketV2Pda,
  safeFetchBondingCurveBucketV2,
  SwapDirection,
} from '@metaplex-foundation/genesis';
import {
  getSwapResult,
  getCurrentPriceComponents,
  isFirstBuyPending,
  isSwappable,
  getFillPercentage,
} from '@metaplex-foundation/genesis';
import { getRpcConfig } from '~/lib/sap/discovery';

/**
 * POST /api/market/genesis-quote/[genesis]
 *
 * Real-time quote against the on-chain bonding-curve state. Mirrors the
 * exact math the program uses (`getSwapResult`) including protocol /
 * creator fees and first-buy waiver. Server-side so the heavy Genesis
 * SDK never lands in the client bundle.
 *
 * Body: { side: 'buy'|'sell', amount: string (raw u64) }
 *
 * Response:
 *   {
 *     amountIn: string;        // raw u64 (after fee on buys)
 *     amountOut: string;       // raw u64
 *     fee: string;             // raw u64 — protocol fee
 *     creatorFee: string;      // raw u64 — creator fee
 *     priceQuotePerBaseRaw: { quoteReserves: string; baseReserves: string };
 *     swappable: boolean;
 *     firstBuyPending: boolean;
 *     fillPct: number;
 *     baseDecimals: number;
 *     quoteDecimals: number;
 *   }
 */

interface QuoteBody {
  side?: unknown;
  amount?: unknown;
}

function isAddr(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ genesis: string }> },
) {
  try {
    const { genesis: genesisAddress } = await params;
    if (!isAddr(genesisAddress)) {
      return NextResponse.json({ error: 'Invalid genesis address' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as QuoteBody;
    if (body.side !== 'buy' && body.side !== 'sell') {
      return NextResponse.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }
    if (typeof body.amount !== 'string' || !/^\d+$/.test(body.amount)) {
      return NextResponse.json({ error: 'amount must be a u64 string' }, { status: 400 });
    }

    const amountIn = BigInt(body.amount);
    if (amountIn <= 0n) {
      return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 });
    }

    const { url } = getRpcConfig();
    const umi = createUmi(url).use(genesis());

    const genesisPk = publicKey(genesisAddress);
    const account = await safeFetchGenesisAccountV2(umi, genesisPk);
    if (!account) {
      return NextResponse.json({ error: 'Genesis account not found' }, { status: 404 });
    }
    if (account.finalized) {
      return NextResponse.json(
        { error: 'Launch has graduated — trade via Raydium / Jupiter' },
        { status: 409 },
      );
    }

    // Find the bonding-curve bucket.
    const totalBuckets = Number(account.bucketCount);
    let bucket: Awaited<ReturnType<typeof safeFetchBondingCurveBucketV2>> | null = null;
    for (let i = 0; i < totalBuckets; i++) {
      const pda = findBondingCurveBucketV2Pda(umi, {
        genesisAccount: genesisPk,
        bucketIndex: i,
      });
      const b = await safeFetchBondingCurveBucketV2(umi, pda);
      if (b) {
        bucket = b;
        break;
      }
    }
    if (!bucket) {
      return NextResponse.json(
        { error: 'No bonding curve bucket on this launch' },
        { status: 404 },
      );
    }

    const direction = body.side === 'buy' ? SwapDirection.Buy : SwapDirection.Sell;
    const firstBuyPending = isFirstBuyPending(bucket);
    const swappable = isSwappable(bucket);

    let result: ReturnType<typeof getSwapResult>;
    try {
      result = getSwapResult(bucket, amountIn, direction, firstBuyPending);
    } catch (e) {
      // Curve math throws on insufficient reserves / overflow → return
      // a clean 422 instead of a 500 so the panel can render it inline.
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : 'Quote unavailable',
          swappable,
          firstBuyPending,
        },
        { status: 422 },
      );
    }

    const reserves = getCurrentPriceComponents(bucket);

    return NextResponse.json({
      amountIn: result.amountIn.toString(),
      amountOut: result.amountOut.toString(),
      fee: result.fee.toString(),
      creatorFee: result.creatorFee.toString(),
      priceQuotePerBaseRaw: {
        quoteReserves: reserves.quoteReserves.toString(),
        baseReserves: reserves.baseReserves.toString(),
      },
      swappable,
      firstBuyPending,
      fillPct: getFillPercentage(bucket),
      // Decimals are fixed for SAP launches: SOL=9 quote, base=9.
      // Real values are fetched client-side via mint inspection if needed.
      baseDecimals: 9,
      quoteDecimals: 9,
    });
  } catch (e) {
    console.error('[genesis-quote]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Quote failed' },
      { status: 500 },
    );
  }
}
