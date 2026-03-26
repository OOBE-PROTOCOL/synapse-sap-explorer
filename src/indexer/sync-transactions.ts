// src/indexer/sync-transactions.ts — Incremental transaction sync → DB
import { PublicKey } from '@solana/web3.js';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { db } from '~/db';
import { transactions, txDetails } from '~/db/schema';
import { getSynapseConnection, getRpcConfig } from '~/lib/sap/discovery';
import { log, logErr, withRetry, sleep, conflictUpdateSet } from './utils';
import { getCursor, setCursor } from './cursor';

/* ── Program map (for labeling) ──────────────────────── */

const PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  [SAP_PROGRAM_ADDRESS]: 'SAP Program',
};

/* ── Raw JSON-RPC getTransaction ─────────────────────── */

let _rpcId = 0;

async function rawGetTransaction(
  signature: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<any | null> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_rpcId,
      method: 'getTransaction',
      params: [signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
    }),
  });

  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result ?? null;
}

/* ── Parse & hydrate a single transaction ────────────── */

function hydrateTx(sig: any, tx: any | null): {
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

  // Account keys
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

  // Programs
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

  // SAP instruction types (parse from logs)
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

  // Build tx_details row
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

  // Balance changes
  const balanceChanges = accountKeys.map((pubkey: string, i: number) => ({
    account: pubkey,
    pre: preBalances[i] ?? 0,
    post: postBalances[i] ?? 0,
    change: (postBalances[i] ?? 0) - (preBalances[i] ?? 0),
  })).filter((c) => c.change !== 0);

  // Token balance changes
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
    logs: logs,
    balanceChanges,
    tokenBalanceChanges,
    computeUnits: meta?.computeUnitsConsumed ?? null,
    indexedAt: new Date(),
  };

  return { txRow, detailRow };
}

/* ── Main sync function ──────────────────────────────── */

export async function syncTransactions(): Promise<number> {
  log('tx', 'Starting incremental transaction sync...');

  const cursor = await getCursor('transactions');
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  // Fetch signatures (newest first). If we have a cursor, only fetch newer ones.
  const fetchOpts: any = { limit: 50 };
  if (cursor.lastSignature) {
    fetchOpts.until = cursor.lastSignature;
  }

  const signatures = await withRetry(
    () => conn.getSignaturesForAddress(new PublicKey(SAP_PROGRAM_ADDRESS), fetchOpts),
    'tx:signatures',
  );

  if (signatures.length === 0) {
    log('tx', 'No new transactions');
    return 0;
  }

  log('tx', `Found ${signatures.length} new signatures to process`);

  let inserted = 0;

  // Process oldest first so cursor advances correctly
  for (const sig of signatures.reverse()) {
    try {
      const tx = await withRetry(
        () => rawGetTransaction(sig.signature, rpcUrl, rpcHeaders),
        sig.signature.slice(0, 8),
      );

      const { txRow, detailRow } = hydrateTx(sig, tx);

      // Insert transaction
      await db
        .insert(transactions)
        .values(txRow)
        .onConflictDoUpdate({
          target: transactions.signature,
          set: conflictUpdateSet(transactions, ['signature']),
        });

      // Insert tx_details (if hydrated)
      if (detailRow) {
        await db
          .insert(txDetails)
          .values(detailRow)
          .onConflictDoUpdate({
            target: txDetails.signature,
            set: conflictUpdateSet(txDetails, ['signature']),
          });
      }

      inserted++;

      // Update cursor after each successful insert
      await setCursor('transactions', {
        lastSlot: sig.slot,
        lastSignature: sig.signature,
      });
    } catch (e: any) {
      logErr('tx', `Failed ${sig.signature.slice(0, 12)}: ${e.message}`);
    }

    // Pacing: 200ms between RPC calls
    await sleep(200);
  }

  log('tx', `Done: ${inserted} transactions inserted`);
  return inserted;
}

