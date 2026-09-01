import { NextResponse } from 'next/server';
import { getSynapseRpcConfig } from '~/lib/sap/rpc-config';
import { env } from '~/lib/env';

export const dynamic = 'force-dynamic';

const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Build an unsigned `swapBondingCurveV2` transaction for the requested
 * launch and return it as base64. The browser deserialises it into a
 * `VersionedTransaction`, signs it with the user's wallet adapter, and
 * sends it via `connection.sendRawTransaction`.
 *
 * Why server-side construction:
 *   - Keeps the Genesis SDK + Umi out of the client bundle (heavy).
 *   - Lets us use the SDK's PDA helpers + on-chain bucket discovery
 *     without re-implementing them on the browser.
 *   - The trader still custodies their key — we never see it.
 *
 * Inputs (POST body):
 *   { trader: base58, side: 'buy'|'sell', amount: string (raw u64),
 *     minAmountOutScaled?: string (default '0' = no slippage protection
 *     — caller MUST set this for production trades) }
 */

interface SwapBody {
  trader?: unknown;
  side?: unknown;
  amount?: unknown;
  minAmountOutScaled?: unknown;
}

function isAddr(s: unknown): s is string {
  return typeof s === 'string' && BASE58_ADDRESS_RE.test(s);
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

    const body = (await request.json().catch(() => ({}))) as SwapBody;
    if (!isAddr(body.trader)) {
      return NextResponse.json({ error: 'Invalid trader pubkey' }, { status: 400 });
    }
    if (body.side !== 'buy' && body.side !== 'sell') {
      return NextResponse.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }
    if (typeof body.amount !== 'string' || !/^\d+$/.test(body.amount)) {
      return NextResponse.json({ error: 'amount must be a u64 string' }, { status: 400 });
    }
    const minOut =
      typeof body.minAmountOutScaled === 'string' && /^\d+$/.test(body.minAmountOutScaled)
        ? body.minAmountOutScaled
        : '0';

    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const {
      publicKey,
      createNoopSigner,
      transactionBuilder,
    } = await import('@metaplex-foundation/umi');
    const {
      genesis,
      swapBondingCurveV2,
      safeFetchGenesisAccountV2,
      findBondingCurveBucketV2Pda,
      safeFetchBondingCurveBucketV2,
      SwapDirection,
      isFirstBuyPending,
      isSwappable,
    } = await import('@metaplex-foundation/genesis');
    const { toWeb3JsTransaction } = await import('@metaplex-foundation/umi-web3js-adapters');

    const { url } = getSynapseRpcConfig();
    const umi = createUmi(url, { httpHeaders: { 'x-api-key': env.SYNAPSE_API_KEY } }).use(genesis());
    const traderPk = publicKey(body.trader);
    umi.identity = createNoopSigner(traderPk);
    umi.payer = umi.identity;

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

    // Locate the bonding-curve bucket. A launch may have several buckets
    // (presale, vault, raydium, etc.) — we scan from index 0 until we find
    // a BondingCurveBucketV2.
    let bucketIndex = -1;
    let bucketAccount: Awaited<ReturnType<typeof safeFetchBondingCurveBucketV2>> | null =
      null;
    const totalBuckets = Number(account.bucketCount);
    for (let i = 0; i < totalBuckets; i++) {
      const pda = findBondingCurveBucketV2Pda(umi, {
        genesisAccount: genesisPk,
        bucketIndex: i,
      });
      const b = await safeFetchBondingCurveBucketV2(umi, pda);
      if (b) {
        bucketIndex = i;
        bucketAccount = b;
        break;
      }
    }
    if (bucketIndex < 0 || !bucketAccount) {
      return NextResponse.json(
        { error: 'No bonding curve bucket on this launch' },
        { status: 404 },
      );
    }
    if (!isSwappable(bucketAccount)) {
      return NextResponse.json(
        {
          error: isFirstBuyPending(bucketAccount)
            ? 'First-buy restriction is pending — only the designated buyer can trade right now'
            : 'Bonding curve is not currently swappable (start/end conditions or sold out)',
        },
        { status: 409 },
      );
    }
    const bucketPda = findBondingCurveBucketV2Pda(umi, {
      genesisAccount: genesisPk,
      bucketIndex,
    });

    const builder = transactionBuilder().add(
      swapBondingCurveV2(umi, {
        genesisAccount: genesisPk,
        bucket: bucketPda,
        baseMint: account.baseMint,
        quoteMint: account.quoteMint,
        payer: umi.identity,
        swapDirection: body.side === 'buy' ? SwapDirection.Buy : SwapDirection.Sell,
        amount: BigInt(body.amount),
        minAmountOutScaled: BigInt(minOut),
      }),
    );

    // Latest blockhash + build
    const { blockhash, lastValidBlockHeight } = await umi.rpc.getLatestBlockhash();
    const built = await builder
      .setBlockhash({ blockhash, lastValidBlockHeight })
      .buildWithLatestBlockhash(umi)
      .catch(() => builder.setBlockhash({ blockhash, lastValidBlockHeight }).build(umi));

    const web3Tx = toWeb3JsTransaction(built);
    const serialised = Buffer.from(web3Tx.serialize()).toString('base64');

    return NextResponse.json({
      transaction: serialised,
      blockhash,
      lastValidBlockHeight,
      bucketIndex,
      baseMint: account.baseMint.toString(),
      quoteMint: account.quoteMint.toString(),
    });
  } catch (e) {
    console.error('[genesis-swap]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Swap build failed' },
      { status: 500 },
    );
  }
}
