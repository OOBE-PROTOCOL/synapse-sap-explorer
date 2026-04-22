
import { PublicKey } from '@solana/web3.js';
import { db } from '~/db';
import { x402DirectPayments, agents, transactions, txDetails } from '~/db/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { getRpcConfig } from './discovery';
import type { RpcTransaction } from '~/types/indexer';

/* ── Raw RPC helpers ──────────────────────────────────── */

let _rpcId = 0;

async function rpcCall(method: string, params: unknown[]) {
  const { url, headers } = getRpcConfig();
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_rpcId,
      method,
      params,
    }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

async function rpcGetSignaturesForAddress(
  address: string,
  opts?: { limit?: number; before?: string; until?: string },
): Promise<Array<{ signature: string; slot: number; blockTime: number | null; err: unknown; memo: string | null }>> {
  return rpcCall('getSignaturesForAddress', [address, {
    limit: opts?.limit ?? 50,
    ...(opts?.before ? { before: opts.before } : {}),
    ...(opts?.until ? { until: opts.until } : {}),
    commitment: 'confirmed',
  }]) as Promise<Array<{ signature: string; slot: number; blockTime: number | null; err: unknown; memo: string | null }>>;
}

async function rpcGetTransaction(signature: string): Promise<RpcTransaction> {
  return rpcCall('getTransaction', [
    signature,
    { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
  ]) as Promise<RpcTransaction>;
}

/* ── Constants ────────────────────────────────────────── */

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM_PK = new PublicKey(TOKEN_PROGRAM);
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const MEMO_V1_PROGRAM = 'Memo1UhkJBfCR7GnRtJ5UcRPEMkY2DGqMGYAS8sEy6P';

const BATCH_LIMIT = 50;   // sigs per getSignaturesForAddress call
const TX_BATCH = 10;      // concurrent getTransaction calls

/* ── Types ────────────────────────────────────────────── */

export type X402DirectPayment = {
  signature: string;
  agentWallet: string;
  agentAta: string;
  payerWallet: string;
  payerAta: string;
  amount: string;        // human-readable
  amountRaw: string;     // raw units
  mint: string;
  decimals: number;
  memo: string | null;
  hasX402Memo: boolean;
  settlementData: unknown | null;
  slot: number;
  blockTime: Date | null;
};

/* ── Helpers ──────────────────────────────────────────── */

/**
 * Derive the Associated Token Account (ATA) for a wallet + mint.
 * Manual PDA derivation to avoid @solana/spl-token version issues.
 */
export function deriveUsdcAta(owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_PK.toBuffer(), USDC_MINT.toBuffer()],
    ATA_PROGRAM,
  );
  return ata;
}

/** Check if a memo string looks like an x402 marker. */
function isX402Memo(memo: string | null): boolean {
  if (!memo) return false;
  const lower = memo.toLowerCase();
  return lower.startsWith('x402:') ||
         lower.includes('payment-response') ||
         lower.includes('x-402') ||
         lower.startsWith('[x402]');
}

/** Extract memo from TX logs or instructions. */
function extractMemo(tx: RpcTransaction): string | null {
  const message = tx?.transaction?.message;
  if (!message) return null;

  const accountKeys: string[] = (message.accountKeys ?? message.staticAccountKeys ?? [])
    .map((k: unknown) => typeof k === 'string' ? k : String(k));

  type NormalizedIx = { programId?: string; programIdIndex?: number; accounts?: (number | string)[]; data?: string | Uint8Array };
  const ixs: NormalizedIx[] = (message.instructions ?? message.compiledInstructions ?? []) as NormalizedIx[];
  for (const ix of ixs) {
    const pid = ix.programId ?? (ix.programIdIndex != null ? accountKeys[ix.programIdIndex] : undefined);
    const pidStr = typeof pid === 'string' ? pid : String(pid);
    if (pidStr === MEMO_PROGRAM || pidStr === MEMO_V1_PROGRAM) {
      // Memo data is the instruction data as UTF-8
      if (ix.data) {
        try {
          if (typeof ix.data === 'string') {
            // Could be base58 or raw — try Buffer decode
            const buf = Buffer.from(ix.data, 'base64');
            return buf.toString('utf-8');
          }
        } catch { /* ignore */ }
        return String(ix.data);
      }
    }
  }
  return null;
}

/** Extract PAYMENT-RESPONSE settlement blob from memo or logs. */
function extractSettlement(memo: string | null, logs: string[]): unknown | null {
  // Check memo first
  if (memo && memo.includes('PAYMENT-RESPONSE')) {
    try {
      const jsonStart = memo.indexOf('{');
      if (jsonStart >= 0) return JSON.parse(memo.slice(jsonStart));
    } catch { /* not valid JSON */ }
  }
  // Check logs for settlement data
  for (const log of logs) {
    if (log.includes('PAYMENT-RESPONSE') || log.includes('x402:settlement')) {
      try {
        const jsonStart = log.indexOf('{');
        if (jsonStart >= 0) return JSON.parse(log.slice(jsonStart));
      } catch { /* continue */ }
    }
  }
  return null;
}

/** Parse a single RPC tx to find SPL token transfers to the agent ATA. */
function parseDirectPayments(
  tx: RpcTransaction,
  signature: string,
  agentWallet: string,
  agentAtaStr: string,
): X402DirectPayment[] {
  if (!tx?.meta || tx.meta.err) return [];

  const accountKeys: string[] = (
    tx.transaction?.message?.accountKeys ??
    tx.transaction?.message?.staticAccountKeys ?? []
  ).map((k: unknown) => typeof k === 'string' ? k : String(k));

  // Add loaded addresses
  if (tx.meta.loadedAddresses) {
    const w = tx.meta.loadedAddresses.writable ?? [];
    const r = tx.meta.loadedAddresses.readonly ?? [];
    for (const k of [...w, ...r]) {
      const s = typeof k === 'string' ? k : String(k);
      if (!accountKeys.includes(s)) accountKeys.push(s);
    }
  }

  const preTokenBalances = tx.meta.preTokenBalances ?? [];
  const postTokenBalances = tx.meta.postTokenBalances ?? [];
  const logs: string[] = tx.meta.logMessages ?? [];
  const memo = extractMemo(tx);

  // Build token balance map: accountIndex → { pre, post, mint, owner }
  const tokenMap = new Map<number, {
    mint: string; owner: string; decimals: number;
    pre: string; post: string;
  }>();

  for (const tb of preTokenBalances) {
    tokenMap.set(tb.accountIndex, {
      mint: tb.mint,
      owner: tb.owner ?? '',
      decimals: tb.uiTokenAmount?.decimals ?? 0,
      pre: tb.uiTokenAmount?.amount ?? '0',
      post: '0',
    });
  }
  for (const tb of postTokenBalances) {
    const existing = tokenMap.get(tb.accountIndex);
    if (existing) {
      existing.post = tb.uiTokenAmount?.amount ?? '0';
    } else {
      tokenMap.set(tb.accountIndex, {
        mint: tb.mint,
        owner: tb.owner ?? '',
        decimals: tb.uiTokenAmount?.decimals ?? 0,
        pre: '0',
        post: tb.uiTokenAmount?.amount ?? '0',
      });
    }
  }

  const payments: X402DirectPayment[] = [];

  for (const [accIdx, bal] of tokenMap) {
    const ata = accountKeys[accIdx];
    if (!ata || ata !== agentAtaStr) continue;   // only care about agent's ATA

    const preAmt = BigInt(bal.pre);
    const postAmt = BigInt(bal.post);
    const diff = postAmt - preAmt;
    if (diff <= 0n) continue;   // only incoming

    // Find the payer — someone whose token balance decreased
    let payerWallet = '';
    let payerAta = '';
    for (const [payerIdx, payerBal] of tokenMap) {
      if (payerIdx === accIdx) continue;
      if (payerBal.mint !== bal.mint) continue;
      const payerDiff = BigInt(payerBal.post) - BigInt(payerBal.pre);
      if (payerDiff < 0n) {
        payerWallet = payerBal.owner;
        payerAta = accountKeys[payerIdx] ?? '';
        break;
      }
    }

    // Skip if payer is the agent itself (self-transfer)
    if (payerWallet === agentWallet) continue;

    const decimals = bal.decimals || USDC_DECIMALS;
    const amountHuman = (Number(diff) / Math.pow(10, decimals)).toString();
    const settlement = extractSettlement(memo, logs);

    payments.push({
      signature,
      agentWallet,
      agentAta: agentAtaStr,
      payerWallet: payerWallet || 'unknown',
      payerAta: payerAta || 'unknown',
      amount: amountHuman,
      amountRaw: diff.toString(),
      mint: bal.mint,
      decimals,
      memo,
      hasX402Memo: isX402Memo(memo),
      settlementData: settlement,
      slot: tx.slot ?? 0,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    });
  }

  return payments;
}

/* ── Main scanner ─────────────────────────────────────── */

/**
 * Scan a single agent's USDC ATA for direct incoming transfers.
 * Returns newly discovered payments (not already in DB).
 */
export async function scanAgentDirectPayments(
  agentWallet: string,
  opts?: { limit?: number; before?: string },
): Promise<X402DirectPayment[]> {
  const ownerPk = new PublicKey(agentWallet);
  const ata = deriveUsdcAta(ownerPk);
  const ataStr = ata.toBase58();

  // Fetch recent signatures for the ATA via raw RPC
  const sigs = await rpcGetSignaturesForAddress(ataStr, {
    limit: opts?.limit ?? BATCH_LIMIT,
    before: opts?.before,
  });

  if (!sigs || sigs.length === 0) return [];

  // Filter out already-indexed signatures
  const sigStrings = sigs.map(s => s.signature);
  const existing = await db
    .select({ signature: x402DirectPayments.signature })
    .from(x402DirectPayments)
    .where(inArray(x402DirectPayments.signature, sigStrings));
  const existingSet = new Set(existing.map(e => e.signature));
  const newSigs = sigs.filter(s => !existingSet.has(s.signature));

  if (newSigs.length === 0) return [];

  // Fetch full TXs in batches via raw RPC
  const payments: X402DirectPayment[] = [];
  for (let i = 0; i < newSigs.length; i += TX_BATCH) {
    const batch = newSigs.slice(i, i + TX_BATCH);
    const txResults = await Promise.all(
      batch.map(s => rpcGetTransaction(s.signature).catch(() => null)),
    );
    for (let j = 0; j < txResults.length; j++) {
      const tx = txResults[j];
      if (!tx) continue;
      const found = parseDirectPayments(tx, batch[j].signature, agentWallet, ataStr);
      payments.push(...found);
    }
  }

  return payments;
}

/**
 * Classify a payment: only "x402DirectPayment" if payer is also
 * a registered agent OR the memo contains x402 markers.
 * Otherwise → "splTransfer" (regular token transfer to an agent).
 */
function classifyPayment(
  payment: X402DirectPayment,
  agentWalletSet: Set<string>,
): 'x402DirectPayment' | 'splTransfer' {
  if (payment.hasX402Memo) return 'x402DirectPayment';
  if (agentWalletSet.has(payment.payerWallet)) return 'x402DirectPayment';
  return 'splTransfer';
}

/**
 * Scan ALL registered agents with an x402 endpoint for direct payments.
 * Persists new payments to the DB.
 *
 * Only labels as x402DirectPayment when:
 *   - Payer is also a registered agent, OR
 *   - Transaction memo contains x402 markers
 * Otherwise → splTransfer (just a regular SPL token transfer)
 */
export async function syncAllX402DirectPayments(): Promise<number> {
  // Fetch ALL agents — scan every agent's ATA for direct USDC payments
  const allAgents = await db
    .select({ wallet: agents.wallet })
    .from(agents);

  if (allAgents.length === 0) return 0;

  // Build set of all agent wallets for fast lookup
  const agentWalletSet = new Set(allAgents.map(a => a.wallet));

  let totalNew = 0;
  for (const agent of allAgents) {
    try {
      const payments = await scanAgentDirectPayments(agent.wallet);
      if (payments.length > 0) {
        // Insert into x402_direct_payments
        await db
          .insert(x402DirectPayments)
          .values(payments.map(p => ({
            signature: p.signature,
            agentWallet: p.agentWallet,
            agentAta: p.agentAta,
            payerWallet: p.payerWallet,
            payerAta: p.payerAta,
            amount: p.amount,
            amountRaw: p.amountRaw,
            mint: p.mint,
            decimals: p.decimals,
            memo: p.memo,
            hasX402Memo: p.hasX402Memo,
            settlementData: p.settlementData,
            slot: p.slot,
            blockTime: p.blockTime,
            indexedAt: new Date(),
          })))
          .onConflictDoNothing({ target: x402DirectPayments.signature });

        // Also insert into transactions table so they appear in /transactions
        await db
          .insert(transactions)
          .values(payments.map(p => ({
            signature: p.signature,
            slot: p.slot,
            blockTime: p.blockTime,
            err: false,
            memo: p.memo,
            signer: p.payerWallet,
            fee: 0,
            feeSol: 0,
            programs: [
              { id: TOKEN_PROGRAM, name: 'Token Program' },
              ...(p.memo ? [{ id: MEMO_PROGRAM, name: 'Memo Program' }] : []),
            ],
            sapInstructions: [classifyPayment(p, agentWalletSet)],
            instructionCount: p.memo ? 2 : 1,
            innerInstructionCount: 0,
            computeUnits: null,
            signerBalanceChange: 0,
            version: 'legacy',
            indexedAt: new Date(),
          })))
          .onConflictDoNothing({ target: transactions.signature });

        // Insert tx_details for the detail page
        await db
          .insert(txDetails)
          .values(payments.map(p => ({
            signature: p.signature,
            status: 'success',
            errorData: null,
            accountKeys: [
              { pubkey: p.payerWallet, signer: true, writable: true },
              { pubkey: p.agentWallet, signer: false, writable: false },
              { pubkey: p.payerAta, signer: false, writable: true },
              { pubkey: p.agentAta, signer: false, writable: true },
              { pubkey: TOKEN_PROGRAM, signer: false, writable: false },
            ],
            instructions: [{
              programId: TOKEN_PROGRAM,
              program: 'Token Program',
              data: '',
              accounts: [p.payerAta, p.agentAta, p.payerWallet],
              parsed: { amount: p.amountRaw, source: p.payerAta, destination: p.agentAta },
              type: 'transfer',
              innerInstructions: [],
            }],
            logs: [],
            balanceChanges: [],
            tokenBalanceChanges: [{
              account: p.agentAta,
              mint: p.mint,
              pre: '0',
              post: p.amount,
              change: p.amount,
            }],
            computeUnits: null,
            indexedAt: new Date(),
          })))
          .onConflictDoNothing({ target: txDetails.signature });

        totalNew += payments.length;
      }
    } catch (err) {
      console.warn(`[x402-scanner] Failed for ${agent.wallet}:`, ((err as Error).message ?? '').slice(0, 120));
    }
  }

  console.log(`[x402-scanner] Synced ${totalNew} new direct payments from ${allAgents.length} agents`);
  return totalNew;
}

/**
 * Get direct payments for a specific agent from DB.
 */
export async function getAgentDirectPayments(
  agentWallet: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ payments: X402DirectPayment[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(x402DirectPayments)
      .where(eq(x402DirectPayments.agentWallet, agentWallet))
      .orderBy(sql`${x402DirectPayments.slot} DESC`)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(x402DirectPayments)
      .where(eq(x402DirectPayments.agentWallet, agentWallet)),
  ]);

  return {
    payments: rows.map(r => ({
      signature: r.signature,
      agentWallet: r.agentWallet,
      agentAta: r.agentAta,
      payerWallet: r.payerWallet,
      payerAta: r.payerAta,
      amount: r.amount,
      amountRaw: r.amountRaw,
      mint: r.mint,
      decimals: r.decimals,
      memo: r.memo,
      hasX402Memo: r.hasX402Memo,
      settlementData: r.settlementData,
      slot: r.slot,
      blockTime: r.blockTime,
    })),
    total: countResult[0]?.count ?? 0,
  };
}

/**
 * Get aggregate x402 stats for a specific agent.
 */
export async function getAgentX402Stats(agentWallet: string) {
  const result = await db
    .select({
      totalPayments: sql<number>`count(*)::int`,
      totalAmountRaw: sql<string>`COALESCE(sum(${x402DirectPayments.amountRaw}::numeric), 0)::text`,
      totalAmount: sql<string>`COALESCE(sum(${x402DirectPayments.amount}::numeric), 0)::text`,
      uniquePayers: sql<number>`count(DISTINCT ${x402DirectPayments.payerWallet})::int`,
      withMemo: sql<number>`count(*) FILTER (WHERE ${x402DirectPayments.hasX402Memo})::int`,
      latestSlot: sql<number>`COALESCE(max(${x402DirectPayments.slot}), 0)::int`,
    })
    .from(x402DirectPayments)
    .where(eq(x402DirectPayments.agentWallet, agentWallet));

  return result[0] ?? {
    totalPayments: 0,
    totalAmountRaw: '0',
    totalAmount: '0',
    uniquePayers: 0,
    withMemo: 0,
    latestSlot: 0,
  };
}

/**
 * Global x402 stats across all agents.
 */
export async function getGlobalX402Stats() {
  const result = await db
    .select({
      totalPayments: sql<number>`count(*)::int`,
      totalAmountRaw: sql<string>`COALESCE(sum(${x402DirectPayments.amountRaw}::numeric), 0)::text`,
      totalAmount: sql<string>`COALESCE(sum(${x402DirectPayments.amount}::numeric), 0)::text`,
      uniquePayers: sql<number>`count(DISTINCT ${x402DirectPayments.payerWallet})::int`,
      uniqueAgents: sql<number>`count(DISTINCT ${x402DirectPayments.agentWallet})::int`,
      withMemo: sql<number>`count(*) FILTER (WHERE ${x402DirectPayments.hasX402Memo})::int`,
    })
    .from(x402DirectPayments);

  return result[0] ?? {
    totalPayments: 0,
    totalAmountRaw: '0',
    totalAmount: '0',
    uniquePayers: 0,
    uniqueAgents: 0,
    withMemo: 0,
  };
}

/**
 * Reclassify existing x402DirectPayment transactions.
 * Downgrades to "splTransfer" if the payer is NOT a registered agent
 * AND the transaction has no x402 memo.
 */
export async function reclassifyX402Payments(): Promise<number> {
  const allAgents = await db
    .select({ wallet: agents.wallet })
    .from(agents);

  const agentWalletSet = new Set(allAgents.map(a => a.wallet));

  // Find all x402DirectPayment transactions
  const x402Txs = await db
    .select({
      signature: transactions.signature,
      signer: transactions.signer,
      memo: transactions.memo,
    })
    .from(transactions)
    .where(sql`${transactions.sapInstructions}::text LIKE '%x402DirectPayment%'`);

  let reclassified = 0;
  for (const tx of x402Txs) {
    const isAgentPayer = tx.signer ? agentWalletSet.has(tx.signer) : false;
    const hasMemo = tx.memo ? isX402Memo(tx.memo) : false;

    if (!isAgentPayer && !hasMemo) {
      // Downgrade to splTransfer — use raw SQL because sapInstructions is a text[] column
      await db.execute(
        sql`UPDATE sap_exp.transactions SET sap_instructions = ARRAY['splTransfer'] WHERE signature = ${tx.signature}`,
      );
      reclassified++;
    }
  }

  if (reclassified > 0) {
    console.log(`[x402-scanner] Reclassified ${reclassified} txs from x402DirectPayment → splTransfer`);
  }
  return reclassified;
}
