export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/tx/[signature] — Transaction detail
 *
 * 1) SWR in-memory cache (2min fresh, 10min stale — tx data is immutable)
 * 2) DB txDetails first → RPC fallback → DB write-back
 * 3) SAP instruction decoding via SDK v0.4.2 BorshInstructionCoder
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { SAP_IDL } from '@oobe-protocol-labs/synapse-sap-sdk/idl';
import { getSynapseConnection } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectTxDetails, upsertTxDetail } from '~/lib/db/queries';

/* ── SAP instruction decoder (v0.4.2 IDL-based) ── */
const sapCoder = new BorshInstructionCoder(SAP_IDL as any);
const SAP_PROGRAM_ID = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

function snakeToPascal(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
}

const BS58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(str: string): Buffer {
  const bytes: number[] = [];
  for (const c of str) {
    const idx = BS58.indexOf(c);
    if (idx < 0) return Buffer.alloc(0);
    let carry = idx;
    for (let j = bytes.length - 1; j >= 0; j--) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.unshift(carry & 0xff); carry >>= 8; }
  }
  for (const c of str) { if (c !== '1') break; bytes.unshift(0); }
  return Buffer.from(bytes);
}

/** Decode SAP instruction data → name + typed args */
function decodeSapInstruction(data: string | null): { name: string; args: Record<string, any> } | null {
  if (!data) return null;
  try {
    const buf = decodeBase58(data);
    const decoded = sapCoder.decode(buf);
    if (decoded) {
      // Serialise BN / PublicKey values for JSON
      const args: Record<string, any> = {};
      for (const [k, v] of Object.entries(decoded.data)) {
        if (v && typeof v === 'object' && 'toNumber' in v) args[k] = (v as any).toNumber();
        else if (v && typeof v === 'object' && 'toBase58' in v) args[k] = (v as any).toBase58();
        else args[k] = v;
      }
      return { name: snakeToPascal(decoded.name), args };
    }
  } catch { /* ignore */ }
  return null;
}

/** Extract SAP events from transaction logs */
function extractSapEvents(logs: string[]): Array<{ name: string; data: Record<string, any> }> {
  const events: Array<{ name: string; data: Record<string, any> }> = [];
  try {
    const EVENT_PREFIX = 'Program data: ';
    for (const log of logs) {
      if (!log.includes(EVENT_PREFIX)) continue;
      const b64 = log.split(EVENT_PREFIX)[1];
      if (!b64) continue;
      try {
        const buf = Buffer.from(b64, 'base64');
        // Anchor events: 8-byte discriminator + borsh-encoded data
        // We extract the discriminator and try to match against known event names
        if (buf.length >= 8) {
          const disc = buf.subarray(0, 8).toString('hex');
          events.push({ name: `Event(${disc.slice(0, 8)}…)`, data: {} });
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return events;
}

/** Extract account key strings from any message version */
function extractAccountKeys(message: any): string[] {
  if (message.accountKeys) {
    return message.accountKeys.map((k: any) =>
      typeof k === 'string' ? k : k.toBase58?.() ?? k.toString?.() ?? String(k),
    );
  }
  if (message.staticAccountKeys) {
    return message.staticAccountKeys.map((k: any) =>
      typeof k === 'string' ? k : k.toBase58?.() ?? k.toString?.() ?? String(k),
    );
  }
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
  if (message.instructions) return message.instructions;
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

    const detail = await swr(`tx:${sig}`, async () => {
      // --- DB first (tx details are immutable once written) ---
      try {
        const row = await selectTxDetails(sig);
        if (row) {
          return {
            signature: row.signature,
            slot: null as number | null,
            blockTime: null as number | null,
            fee: 0,
            status: row.status,
            error: row.errorData ?? null,
            confirmations: null,
            version: 'legacy',
            recentBlockhash: null as string | null,
            accountKeys: row.accountKeys ?? [],
            instructions: ((row.instructions ?? []) as any[]).map((ix: any) => ({
              ...ix,
              innerInstructions: (ix.innerInstructions ?? []).map((inner: any) => ({
                ...inner,
                innerInstructions: inner.innerInstructions ?? [],
              })),
            })),
            logs: row.logs ?? [],
            events: extractSapEvents(row.logs ?? []),
            balanceChanges: row.balanceChanges ?? [],
            tokenBalanceChanges: row.tokenBalanceChanges ?? [],
            computeUnitsConsumed: row.computeUnits,
            _fromDb: true,
          };
        }
      } catch { /* DB unavailable */ }

      // --- RPC fallback ---
      const conn = getSynapseConnection();
      const tx = await conn.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return null;

      const meta = tx.meta;
      const message: any = tx.transaction.message;
      const header = message.header;

      const allKeys = extractAccountKeys(message);
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

      const rawIxs = extractInstructions(message);
      const instructions: any[] = rawIxs.map((ix: any) => {
        const programId = allKeys[ix.programIdIndex] ?? String(ix.programIdIndex);
        const accounts = (ix.accounts ?? ix.accountKeyIndexes ?? []).map(
          (accIdx: number) => allKeys[accIdx] ?? String(accIdx),
        );
        // Decode SAP instruction type + args from IDL discriminator
        let type = ix.parsed?.type ?? null;
        let decodedArgs: Record<string, any> | null = null;
        if (programId === SAP_PROGRAM_ID && ix.data) {
          const decoded = decodeSapInstruction(ix.data);
          if (decoded) { type = decoded.name; decodedArgs = decoded.args; }
        }
        return {
          programId,
          program: identifyProgram(programId),
          data: ix.data ?? null,
          accounts,
          parsed: ix.parsed ?? null,
          type,
          decodedArgs,
          innerInstructions: [] as any[],
        };
      });

      const innerInstructions = meta?.innerInstructions?.map((inner: any) => ({
        index: inner.index,
        instructions: inner.instructions?.map((ix: any) => {
          const programId = allKeys[ix.programIdIndex] ?? String(ix.programIdIndex ?? '');
          let type = ix.parsed?.type ?? null;
          let decodedArgs: Record<string, any> | null = null;
          if (programId === SAP_PROGRAM_ID && ix.data) {
            const decoded = decodeSapInstruction(ix.data);
            if (decoded) { type = decoded.name; decodedArgs = decoded.args; }
          }
          return {
            programId,
            program: identifyProgram(programId),
            data: ix.data ?? null,
            accounts: (ix.accounts ?? ix.accountKeyIndexes ?? []).map((accIdx: number) => allKeys[accIdx] ?? String(accIdx)),
            parsed: ix.parsed ?? null,
            type,
            decodedArgs,
            innerInstructions: [] as any[],
          };
        }) ?? [],
      })) ?? [];

      for (const inner of innerInstructions) {
        if (instructions[inner.index]) {
          instructions[inner.index].innerInstructions = inner.instructions;
        }
      }

      const logs = meta?.logMessages ?? [];
      const preBalances = meta?.preBalances ?? [];
      const postBalances = meta?.postBalances ?? [];
      const preTokenBalances = meta?.preTokenBalances ?? [];
      const postTokenBalances = meta?.postTokenBalances ?? [];

      const balanceChanges = allKeys.map((pubkey: string, i: number) => ({
        account: pubkey,
        pre: preBalances[i] ?? 0,
        post: postBalances[i] ?? 0,
        change: (postBalances[i] ?? 0) - (preBalances[i] ?? 0),
      })).filter((b: any) => b.change !== 0);

      const tokenBalanceChanges = postTokenBalances.map((post: any) => {
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
      });

      const result = {
        signature: sig,
        slot: tx.slot as number | null,
        blockTime: tx.blockTime ?? null as number | null,
        fee: meta?.fee ?? 0,
        status: meta?.err ? 'failed' : 'success',
        error: meta?.err ?? null,
        confirmations: null,
        version: tx.version ?? 'legacy',
        recentBlockhash: message.recentBlockhash ?? null,
        accountKeys,
        instructions,
        logs,
        events: extractSapEvents(logs),
        balanceChanges,
        tokenBalanceChanges,
        computeUnitsConsumed: meta?.computeUnitsConsumed ?? null,
        _fromDb: false,
      };

      // Write-back to DB (non-blocking)
      try {
        upsertTxDetail({
          signature: sig,
          status: result.status,
          errorData: result.error as any,
          accountKeys: result.accountKeys as any,
          instructions: result.instructions as any,
          logs: result.logs,
          balanceChanges: result.balanceChanges as any,
          tokenBalanceChanges: result.tokenBalanceChanges as any,
          computeUnits: meta?.computeUnitsConsumed ?? null,
        }).catch(() => {});
      } catch { /* ignore */ }

      return result;
    }, { ttl: 120_000, swr: 600_000 }); // 2min fresh, 10min stale (immutable data)

    if (!detail) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Remove internal flag
    const { _fromDb, ...response } = detail;
    return NextResponse.json(response);
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
