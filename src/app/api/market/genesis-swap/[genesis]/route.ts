import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  publicKey,
  createNoopSigner,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import {
  genesis,
  swapBondingCurveV2,
  safeFetchGenesisAccountV2,
  findBondingCurveBucketV2Pda,
  safeFetchBondingCurveBucketV2,
  SwapDirection,
} from '@metaplex-foundation/genesis';
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';
import { getRpcConfig } from '~/lib/sap/discovery';

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

  const { url } = getRpcConfig();
  const umi = createUmi(url).use(genesis());
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
  const totalBuckets = Number(account.bucketCount);
  for (let i = 0; i < totalBuckets; i++) {
    const pda = findBondingCurveBucketV2Pda(umi, {
      genesisAccount: genesisPk,
      bucketIndex: i,
    });
    const b = await safeFetchBondingCurveBucketV2(umi, pda);
    if (b) {
      bucketIndex = i;
      break;
    }
  }
  if (bucketIndex < 0) {
    return NextResponse.json(
      { error: 'No bonding curve bucket on this launch' },
      { status: 404 },
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
}
