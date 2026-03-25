export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/tx/[signature] — Transaction detail
 *
 * Returns full parsed Solana transaction:
 * block time, slot, fee, instructions, logs, accounts.
 * Uses the Synapse RPC node for all calls.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { getSynapseConnection } from '~/lib/sap/discovery';

/** Extract account key strings from any message version */
function extractAccountKeys(message: any): string[] {
  // Legacy Message has .accountKeys
  if (message.accountKeys) {
    return message.accountKeys.map((k: any) =>
      typeof k === 'string' ? k : k.toBase58?.() ?? k.toString?.() ?? String(k),
    );
  }
  // VersionedMessage (v0) — use staticAccountKeys + address lookup tables from meta
  if (message.staticAccountKeys) {
    return message.staticAccountKeys.map((k: any) =>
      typeof k === 'string' ? k : k.toBase58?.() ?? k.toString?.() ?? String(k),
    );
  }
  // Fallback: getAccountKeys() (requires loaded addresses)
  if (typeof message.getAccountKeys === 'function') {
    try {
      const keys = message.getAccountKeys();
      return keys.keySegments().flat().map((k: any) => k.toBase58?.() ?? String(k));
    } catch { /* fall through */ }
  }
  return [];
}

/** Extract instructions from any message version */
function extractInstructions(message: any): any[] {
  // Legacy
  if (message.instructions) return message.instructions;
  // Versioned — compiledInstructions
  if (message.compiledInstructions) {
    return message.compiledInstructions.map((cix: any) => ({
      programIdIndex: cix.programIdIndex,
      accounts: cix.accountKeyIndexes ?? [],
      data: cix.data ? Buffer.from(cix.data).toString('base64') : null,
    }));
  }
  return [];
}

export async function GET(
  _req: Request,
  { params }: { params: { signature: string } },
) {
  try {
  const sig = params.signature;

  const conn = getSynapseConnection();

  // Fetch full transaction with max detail
  const tx = await conn.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const meta = tx.meta;
  const message: any = tx.transaction.message;
  const header = message.header;

  // Parse account keys — works for both legacy and v0
  const allKeys = extractAccountKeys(message);
  // Add lookup-table loaded addresses from meta if available
  if (meta?.loadedAddresses) {
    const w = meta.loadedAddresses.writable ?? [];
    const r = meta.loadedAddresses.readonly ?? [];
    for (const k of [...w, ...r]) {
      const s = typeof k === 'string' ? k : k.toBase58?.() ?? String(k);
      if (!allKeys.includes(s)) allKeys.push(s);
    }
  }

  const accountKeys = allKeys.map((pubkey: string, i: number) => ({
    pubkey,
    signer: i < (header?.numRequiredSignatures ?? 0),
    writable: i < ((header?.numRequiredSignatures ?? 0) - (header?.numReadonlySignedAccounts ?? 0)) ||
      (i >= (header?.numRequiredSignatures ?? 0) &&
       i < (allKeys.length - (header?.numReadonlyUnsignedAccounts ?? 0))),
  }));

  // Parse instructions — works for both legacy and v0
  const rawIxs = extractInstructions(message);
  const instructions: any[] = rawIxs.map((ix: any) => {
    const programId = allKeys[ix.programIdIndex] ?? String(ix.programIdIndex);
    const accounts = (ix.accounts ?? ix.accountKeyIndexes ?? []).map(
      (accIdx: number) => allKeys[accIdx] ?? String(accIdx),
    );
    return {
      programId,
      program: identifyProgram(programId),
      data: ix.data ?? null,
      accounts,
      parsed: ix.parsed ?? null,
      type: ix.parsed?.type ?? null,
    };
  });

  // Parse inner instructions
  const innerInstructions = meta?.innerInstructions?.map((inner: any) => ({
    index: inner.index,
    instructions: inner.instructions?.map((ix: any) => ({
      programId: allKeys[ix.programIdIndex] ?? String(ix.programIdIndex ?? ''),
      program: identifyProgram(allKeys[ix.programIdIndex] ?? ''),
      data: ix.data ?? null,
      accounts: (ix.accounts ?? ix.accountKeyIndexes ?? []).map((accIdx: number) => allKeys[accIdx] ?? String(accIdx)),
      parsed: ix.parsed ?? null,
      type: ix.parsed?.type ?? null,
    })) ?? [],
  })) ?? [];

  // Merge inner instructions into their parent
  for (const inner of innerInstructions) {
    if (instructions[inner.index]) {
      instructions[inner.index].innerInstructions = inner.instructions;
    }
  }

  // Parse log messages
  const logs = meta?.logMessages ?? [];

  // Pre/post balances
  const preBalances = meta?.preBalances ?? [];
  const postBalances = meta?.postBalances ?? [];

  // Token balance changes
  const preTokenBalances = meta?.preTokenBalances ?? [];
  const postTokenBalances = meta?.postTokenBalances ?? [];

  return NextResponse.json({
    signature: sig,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    fee: meta?.fee ?? 0,
    status: meta?.err ? 'failed' : 'success',
    error: meta?.err ?? null,
    confirmations: null, // finalized
    version: tx.version ?? 'legacy',

    // Accounts
    accountKeys,

    // Instructions (with inner merged)
    instructions,

    // Logs
    logs,

    // Balance changes
    balanceChanges: allKeys.map((pubkey: string, i: number) => ({
      account: pubkey,
      pre: preBalances[i] ?? 0,
      post: postBalances[i] ?? 0,
      change: (postBalances[i] ?? 0) - (preBalances[i] ?? 0),
    })).filter((b: any) => b.change !== 0),

    // Token balance changes
    tokenBalanceChanges: postTokenBalances.map((post: any) => {
      const pre = preTokenBalances.find(
        (p: any) => p.accountIndex === post.accountIndex && p.mint === post.mint,
      );
      return {
        account: allKeys[post.accountIndex] ?? '',
        mint: post.mint,
        owner: post.owner ?? null,
        preAmount: pre?.uiTokenAmount?.uiAmountString ?? '0',
        postAmount: post.uiTokenAmount?.uiAmountString ?? '0',
        decimals: post.uiTokenAmount?.decimals ?? 0,
      };
    }),

    // Compute units
    computeUnitsConsumed: meta?.computeUnitsConsumed ?? null,
  });
  } catch (err: any) {
    console.error('[tx detail]', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch transaction' },
      { status: 500 },
    );
  }
}

/* ── Program identification ────────────────── */
function identifyProgram(pubkey: string): string | null {
  const PROGRAMS: Record<string, string> = {
    '11111111111111111111111111111111': 'System Program',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
    'ComputeBudget111111111111111111111111111111': 'Compute Budget',
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
    'Memo1UhkJBfCR7GnRtJ5UcRPEMkY2DGqMGYAS8sEy6P': 'Memo v1',
    'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ': 'SAP Program',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
  };
  return PROGRAMS[pubkey] ?? null;
}
