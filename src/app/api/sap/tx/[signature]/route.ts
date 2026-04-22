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
import { getSynapseConnection, getSapClient } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectTxDetails, upsertTxDetail, upsertTransaction } from '~/lib/db/queries';
import type { ParsedAnchorEvent, ApiTxInstruction } from '~/types';
import type { RpcTransactionMessage, RpcTransactionMeta } from '~/types/indexer';
import type { AccountKey, ParsedInstruction, BalanceChange, TokenBalanceChange } from '~/db/schema';

/* ── SAP instruction decoder (v0.4.2 IDL-based) ── */
const sapCoder = new BorshInstructionCoder(SAP_IDL as unknown as ConstructorParameters<typeof BorshInstructionCoder>[0]);
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
function decodeSapInstruction(data: string | null): { name: string; args: Record<string, unknown> } | null {
  if (!data) return null;
  try {
    const buf = decodeBase58(data);
    const decoded = sapCoder.decode(buf);
    if (decoded) {
      // Serialise BN / PublicKey values for JSON
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(decoded.data)) {
        if (v && typeof v === 'object' && 'toNumber' in v) args[k] = (v as { toNumber: () => number }).toNumber();
        else if (v && typeof v === 'object' && 'toBase58' in v) args[k] = (v as { toBase58: () => string }).toBase58();
        else args[k] = v;
      }
      return { name: snakeToPascal(decoded.name), args };
    }
  } catch { /* ignore */ }
  return null;
}

/** Serialize Anchor event data for JSON (PublicKey→base58, BN→string, Buffer→hex) */
function serializeEventData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (typeof v === 'object' && 'toBase58' in v) {
      out[k] = (v as { toBase58: () => string }).toBase58();
    } else if (typeof v === 'object' && 'toNumber' in v) {
      try { out[k] = (v as { toNumber: () => number }).toNumber(); } catch { out[k] = (v as { toString: () => string }).toString(); }
    } else if (Buffer.isBuffer(v)) {
      out[k] = (v as Buffer).toString('hex');
    } else if (v instanceof Uint8Array) {
      out[k] = Buffer.from(v).toString('hex');
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === 'object' && item !== null ? serializeEventData(item) : item,
      );
    } else if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 1 && typeof (v as Record<string, unknown>)[keys[0]] === 'object') {
        const inner = (v as Record<string, unknown>)[keys[0]];
        if (inner && Object.keys(inner as object).length === 0) {
          out[k] = keys[0]; // Anchor enum variant
        } else {
          out[k] = serializeEventData(v);
        }
      } else {
        out[k] = serializeEventData(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Extract SAP events from transaction logs using SDK EventParser */
function extractSapEvents(logs: string[]): ParsedAnchorEvent[] {
  try {
    const sap = getSapClient();
    const parsed: ParsedAnchorEvent[] = sap.events.parseLogs(logs);
    if (parsed && parsed.length > 0) {
      return parsed.map((evt) => ({
        name: evt.name,
        data: serializeEventData(evt.data),
      }));
    }
  } catch (e) {
    console.warn('[tx] SDK EventParser failed:', (e as Error).message);
    // Fall through to manual extraction
  }

  // Fallback: extract raw event data from "Program data:" log lines under SAP program
  const events: ParsedAnchorEvent[] = [];
  let inSap = false;
  for (const line of logs) {
    if (line.includes(`Program ${SAP_PROGRAM_ID} invoke`)) inSap = true;
    else if (line.includes(`Program ${SAP_PROGRAM_ID} success`) || line.includes(`Program ${SAP_PROGRAM_ID} failed`)) inSap = false;
    else if (inSap && line.includes('Program data:')) {
      const b64 = line.split('Program data:')[1]?.trim();
      if (b64) {
        try {
          const buf = Buffer.from(b64, 'base64');
          // First 8 bytes are the event discriminator
          const disc = buf.subarray(0, 8).toString('hex');
          events.push({
            name: `SapEvent_${disc.slice(0, 8)}`,
            data: { raw: b64, discriminator: disc },
          });
        } catch {
          events.push({ name: 'SapEvent', data: { raw: b64 } });
        }
      }
    }
  }
  return events;
}

/** Extract account key strings from any message version */
function extractAccountKeys(message: RpcTransactionMessage): string[] {
  if (message.accountKeys) {
    return message.accountKeys.map((k) =>
      typeof k === 'string' ? k : k.pubkey,
    );
  }
  if (message.staticAccountKeys) {
    return message.staticAccountKeys.map((k) =>
      typeof k === 'string' ? k : k.toBase58?.() ?? String(k),
    );
  }
  if (typeof (message as Record<string, unknown>).getAccountKeys === 'function') {
    try {
      const keys = (message as unknown as { getAccountKeys: () => { keySegments: () => Array<Array<{ toBase58?(): string }>> } }).getAccountKeys();
      return keys.keySegments().flat().map((k) => k.toBase58?.() ?? String(k));
    } catch { /* fall through */ }
  }
  return [];
}

/** Extract instructions from any message version */
function extractInstructions(message: RpcTransactionMessage): Array<Record<string, unknown>> {
  if (message.instructions) return message.instructions as unknown as Array<Record<string, unknown>>;
  if (message.compiledInstructions) {
    return message.compiledInstructions.map((cix) => ({
      programIdIndex: cix.programIdIndex,
      accounts: cix.accountKeyIndexes ?? [],
      data: cix.data ? Buffer.from(cix.data as Uint8Array).toString('base64') : null,
    }));
  }
  return [];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ signature: string }> },
) {
  try {
    const { signature: sig } = await params;

    const detail = await swr(`tx:${sig}`, async () => {
      // --- DB first (tx details are immutable once written) ---
      try {
        const row = await selectTxDetails(sig);
        if (row) {
          const dbBlockTime = row.blockTime
            ? Math.floor(new Date(row.blockTime).getTime() / 1000)
            : null;
          return {
            signature: row.signature,
            slot: (row as unknown as { slot?: number | null }).slot ?? null,
            blockTime: dbBlockTime,
            fee: (row as unknown as { fee?: number }).fee ?? 0,
            status: row.status,
            error: row.errorData ?? null,
            confirmations: null,
            version: (row as unknown as { version?: string }).version ?? 'legacy',
            recentBlockhash: null as string | null,
            accountKeys: row.accountKeys ?? [],
            instructions: ((row.instructions ?? []) as Array<Record<string, unknown>>).map((ix) => ({
              ...ix,
              innerInstructions: ((ix.innerInstructions as Array<Record<string, unknown>> | undefined) ?? []).map((inner) => ({
                ...inner,
                innerInstructions: (inner.innerInstructions as unknown[] | undefined) ?? [],
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
      } catch (e) { console.warn(`[tx/${sig}] DB read failed:`, (e as Error).message); }

      // --- RPC fallback ---
      const conn = getSynapseConnection();
      const tx = await conn.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return null;

      const meta: RpcTransactionMeta | undefined = tx.meta as RpcTransactionMeta | undefined;
      const message = tx.transaction.message as unknown as RpcTransactionMessage;
      const header = message.header;

      const allKeys = extractAccountKeys(message);
      if (meta?.loadedAddresses) {
        const w = meta.loadedAddresses.writable ?? [];
        const r = meta.loadedAddresses.readonly ?? [];
        for (const k of [...w, ...r]) {
          if (!allKeys.includes(k)) allKeys.push(k);
        }
      }

      const accountKeys = allKeys.map((pubkey: string, i: number) => ({
        pubkey,
        signer: i < (header?.numRequiredSignatures ?? 0),
        writable: i < ((header?.numRequiredSignatures ?? 0) - (header?.numReadonlySignedAccounts ?? 0)) ||
          (i >= (header?.numRequiredSignatures ?? 0) &&
           i < (allKeys.length - (header?.numReadonlyUnsignedAccounts ?? 0))),
      }));

      const signer = accountKeys.find(k => k.signer)?.pubkey ?? allKeys[0] ?? '';

      const rawIxs = extractInstructions(message);
      const instructions: ApiTxInstruction[] = rawIxs.map((ix) => {
        const programId = allKeys[(ix as Record<string, unknown>).programIdIndex as number] ?? String((ix as Record<string, unknown>).programIdIndex);
        const accounts = ((ix as Record<string, unknown>).accounts as number[] ?? (ix as Record<string, unknown>).accountKeyIndexes as number[] ?? []).map(
          (accIdx: number) => allKeys[accIdx] ?? String(accIdx),
        );
        // Decode SAP instruction type + args from IDL discriminator
        let type = ((ix as Record<string, unknown>).parsed as Record<string, unknown> | undefined)?.type as string | null ?? null;
        let decodedArgs: Record<string, unknown> | null = null;
        if (programId === SAP_PROGRAM_ID && (ix as Record<string, unknown>).data) {
          const decoded = decodeSapInstruction((ix as Record<string, unknown>).data as string);
          if (decoded) { type = decoded.name; decodedArgs = decoded.args; }
        }
        return {
          programId,
          program: identifyProgram(programId),
          data: (ix as Record<string, unknown>).data as string ?? null,
          accounts,
          parsed: (ix as Record<string, unknown>).parsed ?? null,
          type,
          decodedArgs,
          innerInstructions: [] as ApiTxInstruction[],
        };
      });

      const innerInstructions = meta?.innerInstructions?.map((inner) => ({
        index: inner.index,
        instructions: inner.instructions?.map((ix) => {
          const programId = ix.programId ?? (ix.programIdIndex != null ? allKeys[ix.programIdIndex] : undefined) ?? String(ix.programIdIndex ?? '');
          let type = (ix as unknown as Record<string, unknown>).parsed != null ? ((ix as unknown as Record<string, unknown>).parsed as Record<string, unknown>).type as string | null : null;
          let decodedArgs: Record<string, unknown> | null = null;
          if (programId === SAP_PROGRAM_ID && ix.data) {
            const decoded = decodeSapInstruction(ix.data as string);
            if (decoded) { type = decoded.name; decodedArgs = decoded.args; }
          }
          return {
            programId,
            program: identifyProgram(programId),
            data: ix.data ?? null,
            accounts: (ix.accounts ?? []).map((accIdx) => typeof accIdx === 'number' ? allKeys[accIdx] ?? String(accIdx) : accIdx),
            parsed: (ix as unknown as Record<string, unknown>).parsed ?? null,
            type,
            decodedArgs,
            innerInstructions: [] as ApiTxInstruction[],
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
      })).filter((b) => b.change !== 0);

      const tokenBalanceChanges = postTokenBalances.map((post) => {
        const pre = preTokenBalances.find(
          (p) => p.accountIndex === post.accountIndex && p.mint === post.mint,
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
        // Ensure parent transactions row exists (for the FK + join)
        upsertTransaction({
          signature: sig,
          slot: tx.slot,
          blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
          err: !!meta?.err,
          memo: null,
          signer: signer,
          fee: meta?.fee ?? 0,
          feeSol: (meta?.fee ?? 0) / 1e9,
          programs: result.instructions.map((ix) => ({
            id: ix.programId,
            name: ix.program ?? null,
          })),
          sapInstructions: result.instructions
            .filter((ix) => ix.programId === SAP_PROGRAM_ID && ix.type)
            .map((ix) => ix.type as string),
          instructionCount: result.instructions.length,
          innerInstructionCount: result.instructions.reduce(
            (sum: number, ix) => sum + (ix.innerInstructions?.length ?? 0), 0,
          ),
          computeUnits: meta?.computeUnitsConsumed ?? null,
          signerBalanceChange: 0,
          version: String(tx.version ?? 'legacy'),
        }).catch(() => {});

        upsertTxDetail({
          signature: sig,
          status: result.status,
          errorData: result.error as Record<string, unknown> | null,
          accountKeys: result.accountKeys as unknown as AccountKey[],
          instructions: result.instructions as unknown as ParsedInstruction[],
          logs: result.logs,
          balanceChanges: result.balanceChanges as unknown as BalanceChange[],
          tokenBalanceChanges: result.tokenBalanceChanges as unknown as TokenBalanceChange[],
          computeUnits: meta?.computeUnitsConsumed ?? null,
        }).catch(() => {});
      } catch (e) { console.warn(`[tx/${sig}] DB write-back failed:`, (e as Error).message); }

      return result;
    }, { ttl: 120_000, swr: 600_000 }); // 2min fresh, 10min stale (immutable data)

    if (!detail) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Remove internal flag
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _fromDb: _, ...response } = detail;
    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error('[tx detail]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch transaction' },
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
