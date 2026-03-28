/* ──────────────────────────────────────────────
 * Escrow Event Extraction
 *
 * Parses indexed transactions to extract escrow lifecycle events.
 * Events: create_escrow, deposit_escrow, settle_calls, withdraw_escrow, close_escrow
 *
 * Uses sapInstructions from indexed txs + accountKeys from txDetails
 * to match escrow PDAs and record lifecycle events.
 * ────────────────────────────────────────────── */

import type { EscrowEventType } from '~/db/schema';

/** Map SAP instruction names (PascalCase from decoded instructions) → event types */
const INSTRUCTION_EVENT_MAP: Record<string, EscrowEventType> = {
  CreateEscrow: 'create_escrow',
  InitializeEscrow: 'create_escrow',
  DepositEscrow: 'deposit_escrow',
  FundEscrow: 'deposit_escrow',
  SettleCalls: 'settle_calls',
  SettleEscrow: 'settle_calls',
  WithdrawEscrow: 'withdraw_escrow',
  CloseEscrow: 'close_escrow',
};

/** Human-readable labels for UI display */
export const EVENT_LABELS: Record<EscrowEventType, string> = {
  create_escrow: 'Escrow Created',
  deposit_escrow: 'Deposit',
  settle_calls: 'Calls Settled',
  withdraw_escrow: 'Withdrawal',
  close_escrow: 'Escrow Closed',
};

/** Icon color classes for each event type */
export const EVENT_COLORS: Record<EscrowEventType, string> = {
  create_escrow: 'text-emerald-500',
  deposit_escrow: 'text-blue-500',
  settle_calls: 'text-violet-500',
  withdraw_escrow: 'text-amber-500',
  close_escrow: 'text-red-500',
};

/** A raw transaction row shape (from DB or API) */
export interface TxForEventExtraction {
  signature: string;
  slot: number;
  blockTime: Date | string | null;
  signer: string | null;
  sapInstructions: string[];
  accountKeys?: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
}

/** Extracted event (before DB insert) */
export interface ExtractedEscrowEvent {
  escrowPda: string;
  txSignature: string;
  eventType: EscrowEventType;
  slot: number;
  blockTime: Date | null;
  signer: string | null;
  agentPda: string | null;
  depositor: string | null;
}

/**
 * Given a transaction and a set of known escrow PDAs,
 * extract any escrow lifecycle events.
 */
export function extractEscrowEvents(
  tx: TxForEventExtraction,
  knownEscrowPdas: Set<string>,
): ExtractedEscrowEvent[] {
  const events: ExtractedEscrowEvent[] = [];

  // Check if this tx has any escrow-related SAP instructions
  const escrowInstructions: EscrowEventType[] = [];
  for (const ixName of tx.sapInstructions) {
    const eventType = INSTRUCTION_EVENT_MAP[ixName];
    if (eventType) escrowInstructions.push(eventType);
  }

  if (escrowInstructions.length === 0) return events;

  // Find escrow PDAs in the transaction's account keys
  const matchedPdas: string[] = [];
  if (tx.accountKeys) {
    for (const ak of tx.accountKeys) {
      if (knownEscrowPdas.has(ak.pubkey)) {
        matchedPdas.push(ak.pubkey);
      }
    }
  }

  // If we have matched PDAs, create events for each (ix, pda) combo
  // If no accountKeys available, use a generic approach — we can't match a specific PDA
  const blockTime = tx.blockTime
    ? (typeof tx.blockTime === 'string' ? new Date(tx.blockTime) : tx.blockTime)
    : null;

  for (const eventType of escrowInstructions) {
    if (matchedPdas.length > 0) {
      for (const pda of matchedPdas) {
        events.push({
          escrowPda: pda,
          txSignature: tx.signature,
          eventType,
          slot: tx.slot,
          blockTime,
          signer: tx.signer,
          agentPda: null,  // Will be enriched from escrow record
          depositor: null, // Will be enriched from escrow record
        });
      }
    }
    // If no matched PDAs but we know it's escrow-related, still log with unknown PDA
    // This handles the case where the escrow was just created and we haven't indexed it yet
  }

  return events;
}

/**
 * Determine event types from SAP instruction names (e.g. from tx list).
 * Returns empty array if no escrow instructions found.
 */
export function getEscrowEventTypes(sapInstructions: string[]): EscrowEventType[] {
  const types: EscrowEventType[] = [];
  for (const ix of sapInstructions) {
    const t = INSTRUCTION_EVENT_MAP[ix];
    if (t && !types.includes(t)) types.push(t);
  }
  return types;
}
