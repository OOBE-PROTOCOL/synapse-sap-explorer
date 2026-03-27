// src/indexer/tx-pipeline.ts — Shared tx hydration + upsert pipeline
import { db } from '~/db';
import { transactions, txDetails } from '~/db/schema';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { conflictUpdateSet } from './utils';

const PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  [SAP_PROGRAM_ADDRESS]: 'SAP Program',
};

export type SignatureLike = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown | null;
  memo: string | null;
};

export function hydrateTx(sig: SignatureLike, tx: any | null): {
  txRow: any;
  detailRow: any | null;
} {
  const base = {
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime ? new Date(sig.blockTime * 1000) : null,
    err: sig.err !== null,
    memo: sig.memo ?? null,
    signer: null as string | null,
    fee: 0,
    feeSol: 0,
    programs: [] as any[],
    sapInstructions: [] as string[],
    instructionCount: 0,
    innerInstructionCount: 0,
    computeUnits: null as number | null,
    signerBalanceChange: 0,
    version: 'legacy',
    indexedAt: new Date(),
  };

  if (!tx) return { txRow: base, detailRow: null };

  const meta = tx.meta;
  const message = tx.transaction?.message;
  if (!message) return { txRow: base, detailRow: null };

  let accountKeys: string[] = [];
  if (message.accountKeys) {
    accountKeys = message.accountKeys.map((k: any) =>
      typeof k === 'string' ? k : (k.pubkey ?? k.toBase58?.() ?? String(k)),
    );
  } else if (message.staticAccountKeys) {
    accountKeys = message.staticAccountKeys.map((k: any) =>
      typeof k === 'string' ? k : String(k),
    );
  }
  if (meta?.loadedAddresses) {
    const w = meta.loadedAddresses.writable ?? [];
    const r = meta.loadedAddresses.readonly ?? [];
    for (const k of [...w, ...r]) {
      const s = typeof k === 'string' ? k : String(k);
      if (!accountKeys.includes(s)) accountKeys.push(s);
    }
  }

  const signer = accountKeys[0] ?? null;
  const header = message.header;

  const programIds = new Set<string>();
  const ixs = message.instructions ?? message.compiledInstructions ?? [];
  for (const ix of ixs) {
    const pid = ix.programId ?? accountKeys[ix.programIdIndex];
    if (pid) programIds.add(typeof pid === 'string' ? pid : String(pid));
  }
  const innerIxs = meta?.innerInstructions ?? [];
  for (const inner of innerIxs) {
    for (const ix of inner.instructions ?? []) {
      const pid = ix.programId ?? accountKeys[ix.programIdIndex];
      if (pid) programIds.add(typeof pid === 'string' ? pid : String(pid));
    }
  }
  const programs = Array.from(programIds).map((pid) => ({
    id: pid,
    name: PROGRAMS[pid] ?? null,
  }));

  const logs: string[] = meta?.logMessages ?? [];
  const sapInstructions: string[] = [];
  for (const l of logs) {
    const m = l.match(/Instruction:\s+(\w+)/);
    if (m && !sapInstructions.includes(m[1])) sapInstructions.push(m[1]);
  }
  if (sapInstructions.length === 0) {
    if (logs.some((l) => l.includes(SAP_PROGRAM_ADDRESS) && l.includes('invoke'))) {
      sapInstructions.push('SAPCall');
    }
  }

  const fee = meta?.fee ?? 0;
  const preBalances = meta?.preBalances ?? [];
  const postBalances = meta?.postBalances ?? [];
  const signerBalanceChange = (postBalances[0] ?? 0) - (preBalances[0] ?? 0);

  const txRow = {
    ...base,
    signer,
    fee,
    feeSol: fee / 1e9,
    programs,
    sapInstructions,
    instructionCount: ixs.length,
    innerInstructionCount: innerIxs.reduce(
      (sum: number, inner: any) => sum + (inner.instructions?.length ?? 0),
      0,
    ),
    computeUnits: meta?.computeUnitsConsumed ?? null,
    signerBalanceChange,
    version: tx.version != null ? String(tx.version) : 'legacy',
  };

  const accountKeysDetail = accountKeys.map((pubkey: string, i: number) => ({
    pubkey,
    signer: i < (header?.numRequiredSignatures ?? 0),
    writable: i < ((header?.numRequiredSignatures ?? 0) - (header?.numReadonlySignedAccounts ?? 0)) ||
      (i >= (header?.numRequiredSignatures ?? 0) &&
       i < (accountKeys.length - (header?.numReadonlyUnsignedAccounts ?? 0))),
  }));

  const parsedInstructions = ixs.map((ix: any) => {
    const programId = accountKeys[ix.programIdIndex] ?? String(ix.programIdIndex);
    const ixAccounts = (ix.accounts ?? ix.accountKeyIndexes ?? []).map(
      (accIdx: number) => accountKeys[accIdx] ?? String(accIdx),
    );
    return {
      programId,
      program: PROGRAMS[programId] ?? programId.slice(0, 8),
      data: ix.data ?? '',
      accounts: ixAccounts,
      parsed: null,
      type: null,
      innerInstructions: [],
    };
  });

  const balanceChanges = accountKeys.map((pubkey: string, i: number) => ({
    account: pubkey,
    pre: preBalances[i] ?? 0,
    post: postBalances[i] ?? 0,
    change: (postBalances[i] ?? 0) - (preBalances[i] ?? 0),
  })).filter((c) => c.change !== 0);

  const preTokenBalances = meta?.preTokenBalances ?? [];
  const postTokenBalances = meta?.postTokenBalances ?? [];
  const tokenMap = new Map<string, any>();
  for (const tb of preTokenBalances) {
    const key = `${tb.accountIndex}-${tb.mint}`;
    tokenMap.set(key, { account: accountKeys[tb.accountIndex], mint: tb.mint, pre: tb.uiTokenAmount?.uiAmountString ?? '0', post: '0', change: '0' });
  }
  for (const tb of postTokenBalances) {
    const key = `${tb.accountIndex}-${tb.mint}`;
    const existing = tokenMap.get(key) ?? { account: accountKeys[tb.accountIndex], mint: tb.mint, pre: '0', post: '0', change: '0' };
    existing.post = tb.uiTokenAmount?.uiAmountString ?? '0';
    tokenMap.set(key, existing);
  }
  const tokenBalanceChanges = Array.from(tokenMap.values()).map((t) => ({
    ...t,
    change: String(Number(t.post) - Number(t.pre)),
  })).filter((t) => t.change !== '0');

  const detailRow = {
    signature: sig.signature,
    status: meta?.err ? 'failed' : 'success',
    errorData: meta?.err ?? null,
    accountKeys: accountKeysDetail,
    instructions: parsedInstructions,
    logs,
    balanceChanges,
    tokenBalanceChanges,
    computeUnits: meta?.computeUnitsConsumed ?? null,
    indexedAt: new Date(),
  };

  return { txRow, detailRow };
}

export async function upsertHydratedTx(txRow: any, detailRow: any | null): Promise<void> {
  await db
    .insert(transactions)
    .values(txRow)
    .onConflictDoUpdate({
      target: transactions.signature,
      set: conflictUpdateSet(transactions, ['signature']),
    });

  if (detailRow) {
    await db
      .insert(txDetails)
      .values(detailRow)
      .onConflictDoUpdate({
        target: txDetails.signature,
        set: conflictUpdateSet(txDetails, ['signature']),
      });
  }
}

