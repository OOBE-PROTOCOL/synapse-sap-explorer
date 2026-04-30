/**
 * Genesis bonding-curve trade indexer (server-only).
 *
 * On-demand poll-based indexer: walks `getSignaturesForAddress(genesisAddress)`,
 * decodes any `swapBondingCurveV2` instructions, derives trader / side / amounts
 * from balance deltas, and persists into `sap_exp.token_trades`. Maintains a
 * cursor (`token_trade_cursors`) so subsequent runs only process new signatures.
 *
 * Why poll instead of Geyser:
 *   - Trade volume per agent is low (≤ tens per hour). Polling on page load
 *     is cheap, avoids extra streaming infrastructure, and survives gaps.
 *   - The full chart can be rebuilt from the trades table — Geyser can be
 *     bolted on later as an optimisation without changing the schema.
 *
 * Decoding strategy:
 *   - We don't decode the instruction *data* (which would require importing
 *     the SDK serializer here). Instead we look at *what changed* in the
 *     transaction:
 *       baseDelta  = signed change of trader's base-token ATA balance
 *       quoteDelta = signed change of trader's wSOL balance (or native lamports
 *                    when trade settled directly in SOL)
 *     baseDelta > 0 → BUY  (trader received base, paid quote)
 *     baseDelta < 0 → SELL (trader sent base, received quote)
 *   - This handles SOL and wSOL launches uniformly and works regardless of
 *     fee changes inside the program.
 */

import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { sql } from 'drizzle-orm';
import { db, getSharedPool, isDbDown } from '~/db';
import { tokenTrades, tokenTradeCursors } from '~/db/schema';
import { getRpcConfig } from '~/lib/sap/discovery';

const GENESIS_PROGRAM_ID = 'GNS1S5J5AspKXgpjz6SvKL66kPaKWAhaGRhCqPRxii2B';
const SWAP_BONDING_CURVE_V2_DISCRIMINATOR = 65;
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

// Per-genesis throttle so concurrent page loads don't spam RPC.
const inflight = new Map<string, Promise<IndexResult>>();
const lastScanAt = new Map<string, number>();
const MIN_RESCAN_MS = 15_000;

export interface IndexResult {
  scanned: number;
  inserted: number;
  cursor: string | null;
}

let _conn: Connection | null = null;
function getConn(): Connection {
  if (_conn) return _conn;
  const { url, headers } = getRpcConfig();
  _conn = new Connection(url, { commitment: 'confirmed', httpHeaders: headers });
  return _conn;
}

/**
 * Index trades for a genesis launch. Idempotent — uses `signature` as PK so
 * re-runs are safe. Returns counts; never throws (logs internally and returns
 * zeroes on failure).
 */
export async function indexGenesisTrades(
  genesisAddress: string,
  baseMint: string,
  opts: { limit?: number; force?: boolean } = {},
): Promise<IndexResult> {
  if (isDbDown()) return { scanned: 0, inserted: 0, cursor: null };

  // Throttle
  if (!opts.force) {
    const last = lastScanAt.get(genesisAddress) ?? 0;
    if (Date.now() - last < MIN_RESCAN_MS) {
      return { scanned: 0, inserted: 0, cursor: null };
    }
  }

  // Coalesce concurrent calls
  const existing = inflight.get(genesisAddress);
  if (existing) return existing;

  const promise = doIndex(genesisAddress, baseMint, opts.limit ?? 200)
    .catch((err) => {
      console.warn('[trade-indexer] scan failed', genesisAddress, err);
      return { scanned: 0, inserted: 0, cursor: null } satisfies IndexResult;
    })
    .finally(() => {
      inflight.delete(genesisAddress);
      lastScanAt.set(genesisAddress, Date.now());
    });

  inflight.set(genesisAddress, promise);
  return promise;
}

async function doIndex(
  genesisAddress: string,
  baseMint: string,
  limit: number,
): Promise<IndexResult> {
  const conn = getConn();
  const genesisPk = new PublicKey(genesisAddress);

  // 1. Load cursor → only fetch signatures *newer* than the last seen one.
  const cursorRow = await db
    .select()
    .from(tokenTradeCursors)
    .where(sql`${tokenTradeCursors.genesisAddress} = ${genesisAddress}`)
    .limit(1);
  const until = cursorRow[0]?.lastSignature;

  const sigs: ConfirmedSignatureInfo[] = await conn.getSignaturesForAddress(genesisPk, {
    limit: Math.min(limit, 1000),
    until,
  });
  if (sigs.length === 0) return { scanned: 0, inserted: 0, cursor: until ?? null };

  // 2. Fetch transactions in batches (RPC may rate-limit single getTransaction calls).
  const txs = await Promise.all(
    sigs.map((s) =>
      conn
        .getParsedTransaction(s.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
        .catch(() => null),
    ),
  );

  let inserted = 0;
  for (let i = 0; i < sigs.length; i++) {
    const tx = txs[i];
    const sig = sigs[i];
    if (!tx || !tx.meta || tx.meta.err) continue;

    const trade = extractTrade(tx, sig.signature, genesisAddress, baseMint);
    if (!trade) continue;

    try {
      await db
        .insert(tokenTrades)
        .values(trade)
        .onConflictDoNothing({ target: tokenTrades.signature });
      inserted += 1;
    } catch (err) {
      // ignore single-row failures, keep going
      console.warn('[trade-indexer] insert failed', sig.signature, err);
    }
  }

  // 3. Update cursor to the newest signature observed (sigs[0] is newest).
  const newest = sigs[0];
  await getSharedPool().query(
    `INSERT INTO sap_exp.token_trade_cursors (genesis_address, last_signature, last_slot, scanned_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (genesis_address) DO UPDATE
       SET last_signature = EXCLUDED.last_signature,
           last_slot = EXCLUDED.last_slot,
           scanned_at = now()`,
    [genesisAddress, newest.signature, newest.slot],
  );

  return { scanned: sigs.length, inserted, cursor: newest.signature };
}

/**
 * Detect a bonding-curve swap inside a parsed tx and return the row to insert.
 * Returns null if no Genesis-program swap instruction is present or the
 * trader's deltas are inconclusive.
 */
function extractTrade(
  tx: ParsedTransactionWithMeta,
  signature: string,
  genesisAddress: string,
  baseMint: string,
): typeof tokenTrades.$inferInsert | null {
  // 1. Confirm a swapBondingCurveV2 instruction is present.
  const ixs = tx.transaction.message.instructions;
  let hasSwap = false;
  for (const ix of ixs) {
    if (!('programId' in ix)) continue;
    if (ix.programId.toBase58() !== GENESIS_PROGRAM_ID) continue;
    if ('data' in ix && typeof ix.data === 'string') {
      // Instruction data is base58. First byte is the discriminator.
      try {
        const bytes = base58Decode(ix.data);
        if (bytes[0] === SWAP_BONDING_CURVE_V2_DISCRIMINATOR) {
          hasSwap = true;
          break;
        }
      } catch {
        // not base58 / unknown — skip this ix, keep scanning
      }
    }
  }
  if (!hasSwap) return null;

  // 2. Identify the trader: the first signer.
  const signers = tx.transaction.message.accountKeys.filter((k) => k.signer);
  if (signers.length === 0) return null;
  const trader = signers[0].pubkey.toBase58();

  // 3. Compute base-token delta for the trader.
  const baseDelta = tokenBalanceDelta(tx, trader, baseMint);
  if (baseDelta === 0n) return null;

  // 4. Compute quote-token delta (try wSOL ATA first, then native lamports).
  let quoteDelta = -tokenBalanceDelta(tx, trader, WRAPPED_SOL_MINT);
  let quoteDecimals = 9;
  if (quoteDelta === 0n) {
    quoteDelta = -nativeLamportsDelta(tx, trader);
  }
  if (quoteDelta <= 0n) return null;

  // 5. Determine side.
  const side = baseDelta > 0n ? 'buy' : 'sell';
  const absBase = baseDelta > 0n ? baseDelta : -baseDelta;
  const baseDecimals = tokenDecimals(tx, baseMint) ?? 9;

  const baseUi = Number(absBase) / 10 ** baseDecimals;
  const quoteUi = Number(quoteDelta) / 10 ** quoteDecimals;
  const price = baseUi > 0 ? quoteUi / baseUi : 0;

  return {
    signature,
    genesisAddress,
    baseMint,
    trader,
    side,
    baseAmount: absBase.toString(),
    quoteAmount: quoteDelta.toString(),
    baseDecimals,
    quoteDecimals,
    priceQuotePerBase: price.toFixed(18),
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
    source: 'bonding-curve',
  };
}

/** Signed delta of `owner`'s token-mint balance across the tx. */
function tokenBalanceDelta(
  tx: ParsedTransactionWithMeta,
  owner: string,
  mint: string,
): bigint {
  const pre = (tx.meta?.preTokenBalances ?? []).find(
    (b) => b.owner === owner && b.mint === mint,
  );
  const post = (tx.meta?.postTokenBalances ?? []).find(
    (b) => b.owner === owner && b.mint === mint,
  );
  const preAmt = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
  const postAmt = post ? BigInt(post.uiTokenAmount.amount) : 0n;
  return postAmt - preAmt;
}

/** Decimals for `mint` from token-balance metadata in the tx. */
function tokenDecimals(tx: ParsedTransactionWithMeta, mint: string): number | null {
  const ref = (tx.meta?.preTokenBalances ?? tx.meta?.postTokenBalances ?? []).find(
    (b) => b.mint === mint,
  );
  return ref?.uiTokenAmount.decimals ?? null;
}

/** Signed lamport delta of `owner`'s native SOL balance. */
function nativeLamportsDelta(tx: ParsedTransactionWithMeta, owner: string): bigint {
  const keys = tx.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k.pubkey.toBase58() === owner);
  if (idx < 0) return 0n;
  const pre = BigInt(tx.meta?.preBalances?.[idx] ?? 0);
  const post = BigInt(tx.meta?.postBalances?.[idx] ?? 0);
  return post - pre;
}

// Lightweight base58 decoder (avoids pulling bs58 just for one call).
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(s: string): Uint8Array {
  const map = new Map<string, number>();
  for (let i = 0; i < B58.length; i++) map.set(B58[i], i);
  let bytes: number[] = [0];
  for (const c of s) {
    const v = map.get(c);
    if (v === undefined) throw new Error('bad base58');
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of s) {
    if (c !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}
