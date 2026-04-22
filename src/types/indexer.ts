/* ══════════════════════════════════════════════════════════
 * Indexer Types — Pipeline, sync, and worker shapes
 * ══════════════════════════════════════════════════════════ */

import type { PublicKey } from '@solana/web3.js';

/* ── BN-like value — anything with .toString() ────────── */

/** Value that can be converted via .toString() — BN, number, bigint, string */
export type BNLike = { toString(): string } | string | number | bigint | null | undefined;

/** Value that can be converted via Number() — BN, number, string */
export type NumLike = { toNumber?(): number; toString(): string } | string | number | null | undefined;

/* ── PublicKey-like ────────────────────────────────────── */

/** Anything that can resolve to a base58 string */
export type PKLike = PublicKey | string | { toBase58(): string } | null | undefined;

/* ── Anchor on-chain account (raw from program.account.X.all()) */

export type RawProgramAccount<T = Record<string, unknown>> = {
  publicKey: PublicKey;
  account: T;
};

/* ── RPC transaction shapes (from getTransaction) ─────── */

export type RpcTokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: {
    amount?: string;
    decimals?: number;
    uiAmount?: number;
    uiAmountString?: string;
  };
};

/** Solana RPC transaction error — null on success, object or string on failure.
 *  Matches @solana/web3.js TransactionError = {} | string */
export type TransactionError = Record<string, unknown> | string | null;

export type RpcTransactionMeta = {
  err: TransactionError;
  fee: number;
  preBalances: number[];
  postBalances: number[];
  preTokenBalances?: RpcTokenBalance[];
  postTokenBalances?: RpcTokenBalance[];
  innerInstructions?: Array<{
    index: number;
    instructions: Array<{
      programIdIndex?: number;
      programId?: string;
      accounts?: number[] | string[];
      data?: string;
    }>;
  }>;
  logMessages?: string[];
  computeUnitsConsumed?: number;
  loadedAddresses?: {
    writable?: string[];
    readonly?: string[];
  };
};

export type RpcTransactionMessage = {
  accountKeys?: Array<string | { pubkey: string }>;
  staticAccountKeys?: Array<string | { toBase58?(): string }>;
  recentBlockhash?: string;
  header?: {
    numRequiredSignatures: number;
    numReadonlySignedAccounts: number;
    numReadonlyUnsignedAccounts: number;
  };
  instructions?: Array<{
    programId?: string;
    programIdIndex?: number;
    accounts?: number[] | string[];
    data?: string;
  }>;
  compiledInstructions?: Array<{
    programIdIndex: number;
    accountKeyIndexes: number[];
    data: string | Uint8Array;
  }>;
};

export type RpcTransaction = {
  slot?: number;
  blockTime?: number | null;
  transaction?: {
    message?: RpcTransactionMessage;
    signatures?: string[];
  };
  meta?: RpcTransactionMeta;
  version?: string | number;
};

/* ── RPC signatures response ──────────────────────────── */

export type RpcSignatureInfo = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: TransactionError;
  memo: string | null;
};

/* ── Drizzle conflict update helper return ────────────── */

export type ConflictUpdateSet = Record<string, ReturnType<typeof import('drizzle-orm').sql.raw>>;

/* ── Sync result shapes ───────────────────────────────── */

export type SyncResult = {
  synced: number;
  errors: number;
  label: string;
};

/* ── PostgreSQL error (subset of pg error) ────────────── */

export type PgError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
};
