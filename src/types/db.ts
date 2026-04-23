/* ══════════════════════════════════════════════════════════
 * DB Types — Drizzle inferred row & insert types
 *
 * Usage: import type { AgentRow, AgentInsert } from '~/types';
 * ══════════════════════════════════════════════════════════ */

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  agents,
  agentStats,
  tools,
  escrows,
  escrowEvents,
  attestations,
  feedbacks,
  vaults,
  transactions,
  txDetails,
  networkSnapshots,
  syncCursors,
  settlementLedger,
  x402DirectPayments,
  toolEvents,
  toolSchemas,
  receiptBatches,
  disputes,
  pendingSettlements,
} from '~/db/schema';

/* ── Select (read) types ──────────────────────────────── */

export type AgentRow = InferSelectModel<typeof agents>;
export type AgentStatsRow = InferSelectModel<typeof agentStats>;
export type ToolRow = InferSelectModel<typeof tools>;
export type EscrowRow = InferSelectModel<typeof escrows>;
export type EscrowEventRow = InferSelectModel<typeof escrowEvents>;
export type AttestationRow = InferSelectModel<typeof attestations>;
export type FeedbackRow = InferSelectModel<typeof feedbacks>;
export type VaultRow = InferSelectModel<typeof vaults>;
export type TransactionRow = InferSelectModel<typeof transactions>;
export type TxDetailRow = InferSelectModel<typeof txDetails>;
export type NetworkSnapshotRow = InferSelectModel<typeof networkSnapshots>;
export type SyncCursorRow = InferSelectModel<typeof syncCursors>;
export type SettlementLedgerRow = InferSelectModel<typeof settlementLedger>;
export type X402DirectPaymentRow = InferSelectModel<typeof x402DirectPayments>;
export type ToolEventRow = InferSelectModel<typeof toolEvents>;
export type ToolSchemaRow = InferSelectModel<typeof toolSchemas>;
export type ReceiptBatchRow = InferSelectModel<typeof receiptBatches>;
export type DisputeRow = InferSelectModel<typeof disputes>;
export type PendingSettlementRow = InferSelectModel<typeof pendingSettlements>;

/* ── Insert types ─────────────────────────────────────── */

export type AgentInsert = InferInsertModel<typeof agents>;
export type AgentStatsInsert = InferInsertModel<typeof agentStats>;
export type ToolInsert = InferInsertModel<typeof tools>;
export type EscrowInsert = InferInsertModel<typeof escrows>;
export type EscrowEventInsert = InferInsertModel<typeof escrowEvents>;
export type AttestationInsert = InferInsertModel<typeof attestations>;
export type FeedbackInsert = InferInsertModel<typeof feedbacks>;
export type VaultInsert = InferInsertModel<typeof vaults>;
export type TransactionInsert = InferInsertModel<typeof transactions>;
export type TxDetailInsert = InferInsertModel<typeof txDetails>;
export type NetworkSnapshotInsert = InferInsertModel<typeof networkSnapshots>;
export type SettlementLedgerInsert = InferInsertModel<typeof settlementLedger>;
export type X402DirectPaymentInsert = InferInsertModel<typeof x402DirectPayments>;
export type ToolEventInsert = InferInsertModel<typeof toolEvents>;
export type ToolSchemaInsert = InferInsertModel<typeof toolSchemas>;
export type ReceiptBatchInsert = InferInsertModel<typeof receiptBatches>;
export type DisputeInsert = InferInsertModel<typeof disputes>;
export type PendingSettlementInsert = InferInsertModel<typeof pendingSettlements>;

/* ── Re-export JSONB shapes from schema ───────────────── */

export type {
  Capability,
  PricingTier,
  VolumeCurveEntry,
  ActivePlugin,
  TxProgram,
  AccountKey,
  ParsedInstruction,
  BalanceChange,
  TokenBalanceChange,
  EscrowEventType,
  ToolEventType,
  DisputeType,
  ResolutionLayer,
  DisputeOutcome,
} from '~/db/schema';

/* ── Joined query shapes ──────────────────────────────── */

/** Transaction row joined with txDetails columns */
export type TxWithDetails = TransactionRow & {
  accountKeys?: AccountKey[] | null;
  tokenBalanceChanges?: TokenBalanceChange[] | null;
  balanceChanges?: BalanceChange[] | null;
};

import type { AccountKey, TokenBalanceChange, BalanceChange } from '~/db/schema';
