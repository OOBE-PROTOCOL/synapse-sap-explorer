export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { peek, swr } from '~/lib/cache';
import {
  selectEscrowEvents,
  upsertEscrowEvents,
  selectTransactions,
  selectTxDetails,
} from '~/lib/db/queries';
import { dbEscrowEventToApi } from '~/lib/db/mappers';
import { isDbDown } from '~/db';
import { getSapClient } from '~/lib/sap/discovery';
import type { EscrowEventType } from '~/db/schema';
import type { ParsedAnchorEvent } from '~/types';

/** SDK event name → internal EscrowEventType */
const SDK_EVENT_TO_TYPE: Record<string, EscrowEventType> = {
  EscrowCreatedEvent:   'create_escrow',
  EscrowDepositedEvent: 'deposit_escrow',
  PaymentSettledEvent:  'settle_calls',
  BatchSettledEvent:    'settle_calls',
  EscrowWithdrawnEvent: 'withdraw_escrow',
  EscrowClosedEvent:    'close_escrow',
};

/** Extract a base58 string from a PublicKey-like value */
const toStr = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toBase58' in v) return (v as { toBase58: () => string }).toBase58();
  return String(v);
};

/** Extract a numeric string from a BN-like or number value */
const toNum = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    try { return String((v as { toNumber: () => number }).toNumber()); } catch { return (v as { toString: () => string }).toString(); }
  }
  return String(v);
};

/**
 * Derive balanceBefore and balanceAfter from on-chain event data.
 * On-chain events emit different fields per type:
 *
 * | Event               | amount field        | balance field     | balanceBefore formula       |
 * |---------------------|---------------------|-------------------|-----------------------------|
 * | EscrowCreatedEvent  | initial_deposit     | (none)            | 0                           |
 * | EscrowDepositedEvent| amount              | new_balance       | new_balance - amount        |
 * | PaymentSettledEvent | amount              | remaining_balance | remaining_balance + amount  |
 * | BatchSettledEvent   | total_amount        | remaining_balance | remaining_balance + amount  |
 * | EscrowWithdrawnEvent| amount              | remaining_balance | remaining_balance + amount  |
 * | EscrowClosedEvent   | (none)              | (none)            | 0 (constraint: balance==0) |
 */
function deriveBalances(
  eventName: string,
  data: ParsedAnchorEvent['data'],
): { balanceBefore: string | null; balanceAfter: string | null; amountChanged: string | null } {
  switch (eventName) {
    case 'EscrowCreatedEvent': {
      const deposit = toNum(data.initialDeposit ?? data.initial_deposit) ?? '0';
      return {
        balanceBefore: '0',
        balanceAfter: deposit,
        amountChanged: deposit,
      };
    }
    case 'EscrowDepositedEvent': {
      const amount = toNum(data.amount) ?? '0';
      const newBalance = toNum(data.newBalance ?? data.new_balance) ?? '0';
      const before = String(BigInt(newBalance) - BigInt(amount));
      return {
        balanceBefore: before,
        balanceAfter: newBalance,
        amountChanged: amount,
      };
    }
    case 'PaymentSettledEvent': {
      const amount = toNum(data.amount) ?? '0';
      const remaining = toNum(data.remainingBalance ?? data.remaining_balance) ?? '0';
      const before = String(BigInt(remaining) + BigInt(amount));
      return {
        balanceBefore: before,
        balanceAfter: remaining,
        amountChanged: `-${amount}`,
      };
    }
    case 'BatchSettledEvent': {
      const totalAmount = toNum(data.totalAmount ?? data.total_amount) ?? '0';
      const remaining = toNum(data.remainingBalance ?? data.remaining_balance) ?? '0';
      const before = String(BigInt(remaining) + BigInt(totalAmount));
      return {
        balanceBefore: before,
        balanceAfter: remaining,
        amountChanged: `-${totalAmount}`,
      };
    }
    case 'EscrowWithdrawnEvent': {
      const amount = toNum(data.amount) ?? '0';
      const remaining = toNum(data.remainingBalance ?? data.remaining_balance) ?? '0';
      const before = String(BigInt(remaining) + BigInt(amount));
      return {
        balanceBefore: before,
        balanceAfter: remaining,
        amountChanged: `-${amount}`,
      };
    }
    case 'EscrowClosedEvent': {
      return {
        balanceBefore: '0',
        balanceAfter: '0',
        amountChanged: '0',
      };
    }
    default:
      return { balanceBefore: null, balanceAfter: null, amountChanged: null };
  }
}

/**
 * Scan recent indexed transactions for escrow events using the SDK EventParser.
 * Parses real Anchor emitted events and derives all balance fields.
 */
async function extractAndStoreEvents() {
  const sap = getSapClient();
  const txRows = await selectTransactions(150);
  if (txRows.length === 0) return [];

  const events: Parameters<typeof upsertEscrowEvents>[0] = [];
  const seen = new Set<string>();

  for (const tx of txRows) {
    const detail = await selectTxDetails(tx.signature);
    if (!detail?.logs?.length) continue;

    let parsed: ParsedAnchorEvent[] = [];
    try {
      parsed = sap.events.parseLogs(detail.logs);
    } catch (e) {
      console.warn(`[escrow-events] parseLogs failed for ${tx.signature.slice(0, 12)}:`, (e as Error).message);
      continue;
    }

    for (const evt of parsed) {
      const eventType = SDK_EVENT_TO_TYPE[evt.name];
      if (!eventType) continue;

      const d = evt.data;
      const escrowPda = toStr(d.escrow);
      if (!escrowPda) continue;

      const key = `${tx.signature}:${eventType}:${escrowPda}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isBatch = evt.name === 'BatchSettledEvent';
      const { balanceBefore, balanceAfter, amountChanged } = deriveBalances(evt.name, d);

      events.push({
        escrowPda,
        txSignature: tx.signature,
        eventType,
        slot: tx.slot,
        blockTime: tx.blockTime ? new Date(tx.blockTime) : null,
        signer: tx.signer,
        agentPda:      toStr(d.agent),
        depositor:     toStr(d.depositor),
        balanceBefore,
        balanceAfter,
        amountChanged,
        callsSettled:  toNum(isBatch ? d.totalCalls : d.callsSettled),
        indexedAt: new Date(),
      });
    }
  }

  if (events.length > 0) {
    await upsertEscrowEvents(events);
  }
  return events;
}

export const GET = withSynapseError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const escrowPda = searchParams.get('escrow') ?? undefined;
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500);

  const cacheKey = escrowPda ? `escrow-events:${escrowPda}` : 'escrow-events:all';

  const cached = peek<{ events: unknown[]; total: number }>(cacheKey);
  if (cached) {
    swr(cacheKey, async () => {
      extractAndStoreEvents().catch(() => {});
      const rows = await selectEscrowEvents(escrowPda, limit);
      const events = rows.map(dbEscrowEventToApi);
      return { events, total: events.length };
    }, { ttl: 30_000, swr: 120_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  try {
    await extractAndStoreEvents();
  } catch (e) {
    console.warn('[escrow-events] Event extraction failed:', (e as Error).message);
  }

  let events: Array<ReturnType<typeof dbEscrowEventToApi>> = [];
  if (!isDbDown()) {
    try {
      const rows = await selectEscrowEvents(escrowPda, limit);
      events = rows.map(dbEscrowEventToApi);
    } catch (e) {
      console.warn('[escrow-events] DB read failed:', (e as Error).message);
      events = [];
    }
  }

  const result = { events, total: events.length };
  swr(cacheKey, () => Promise.resolve(result), { ttl: 30_000, swr: 120_000 }).catch(() => {});
  return synapseResponse(result);
});
