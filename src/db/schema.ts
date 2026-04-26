// src/db/schema.ts
import {
    pgSchema, text, boolean, smallint, integer, bigint,
    real, doublePrecision, numeric, timestamp, jsonb, serial,
} from 'drizzle-orm/pg-core';

/* ═══════════════════════════════════════════════
 * Schema: sap_exp (custom PostgreSQL schema)
 * ═══════════════════════════════════════════════ */

export const sapExpSchema = pgSchema('sap_exp');

/* ═══════════════════════════════════════════════
 * JSONB Type Definitions
 * ═══════════════════════════════════════════════ */

export type Capability = {
    id: string;
    description: string;
    protocolId: string;
    version: string;
};

export type PricingTier = {
    tierId: string;
    pricePerCall: string;
    minPricePerCall: string | null;
    maxPricePerCall: string | null;
    rateLimit: number;
    maxCallsPerSession: number;
    burstLimit: number | null;
    tokenType: Record<string, object>;
    tokenMint: string | null;
    tokenDecimals: number | null;
    settlementMode: Record<string, object>;
    minEscrowDeposit: string | null;
    batchIntervalSec: number | null;
    volumeCurve: VolumeCurveEntry[] | null;
};

export type VolumeCurveEntry = {
    afterCalls: number;
    pricePerCall: string;
};

export type ActivePlugin = {
    id: string;
    name: string;
    version: string;
    [key: string]: unknown;
};

export type TxProgram = {
    id: string;
    name: string | null;
};

export type AccountKey = {
    pubkey: string;
    signer: boolean;
    writable: boolean;
};

export type ParsedInstruction = {
    programId: string;
    program: string;
    data: string;
    accounts: string[];
    parsed: unknown;
    type: string | null;
    innerInstructions: unknown[];
};

export type BalanceChange = {
    account: string;
    pre: number;
    post: number;
    change: number;
};

export type TokenBalanceChange = {
    account: string;
    mint: string;
    pre: string;
    post: string;
    change: string;
};

/* ═══════════════════════════════════════════════
 * agents
 * ═══════════════════════════════════════════════ */

export const agents = sapExpSchema.table('agents', {
    pda:              text('pda').primaryKey(),
    wallet:           text('wallet').notNull().unique(),
    name:             text('name').notNull().default(''),
    description:      text('description').notNull().default(''),
    agentId:          text('agent_id'),
    agentUri:         text('agent_uri'),
    x402Endpoint:     text('x402_endpoint'),
    isActive:         boolean('is_active').notNull().default(false),
    bump:             smallint('bump').notNull().default(0),
    version:          smallint('version').notNull().default(0),
    reputationScore:  smallint('reputation_score').notNull().default(0),
    reputationSum:    numeric('reputation_sum').notNull().default('0'),
    totalFeedbacks:   integer('total_feedbacks').notNull().default(0),
    totalCallsServed: numeric('total_calls_served').notNull().default('0'),
    avgLatencyMs:     real('avg_latency_ms').notNull().default(0),
    uptimePercent:    real('uptime_percent').notNull().default(0),
    capabilities:     jsonb('capabilities').$type<Capability[]>().notNull().default([]),
    pricing:          jsonb('pricing').$type<PricingTier[]>().notNull().default([]),
    protocols:        text('protocols').array().notNull().default([]),
    activePlugins:    jsonb('active_plugins').$type<ActivePlugin[]>().notNull().default([]),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * agent_stats
 * ═══════════════════════════════════════════════ */

export const agentStats = sapExpSchema.table('agent_stats', {
    agentPda:         text('agent_pda').primaryKey().references(() => agents.pda, { onDelete: 'cascade' }),
    wallet:           text('wallet').notNull(),
    totalCallsServed: numeric('total_calls_served').notNull().default('0'),
    isActive:         boolean('is_active').notNull().default(false),
    bump:             smallint('bump').notNull().default(0),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * tools
 * ═══════════════════════════════════════════════ */

export const tools = sapExpSchema.table('tools', {
    pda:              text('pda').primaryKey(),
    agentPda:         text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
    toolName:         text('tool_name').notNull().default(''),
    toolNameHash:     text('tool_name_hash'),
    protocolHash:     text('protocol_hash'),
    descriptionHash:  text('description_hash'),
    inputSchemaHash:  text('input_schema_hash'),
    outputSchemaHash: text('output_schema_hash'),
    httpMethod:       text('http_method'),
    category:         text('category'),
    paramsCount:      smallint('params_count').notNull().default(0),
    requiredParams:   smallint('required_params').notNull().default(0),
    isCompound:       boolean('is_compound').notNull().default(false),
    isActive:         boolean('is_active').notNull().default(true),
    totalInvocations: numeric('total_invocations').notNull().default('0'),
    version:          smallint('version').notNull().default(0),
    previousVersion:  text('previous_version'),
    bump:             smallint('bump').notNull().default(0),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * escrows
 * ═══════════════════════════════════════════════ */

export const escrows = sapExpSchema.table('escrows', {
    pda:               text('pda').primaryKey(),
    agentPda:          text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
    depositor:         text('depositor').notNull(),
    agentWallet:       text('agent_wallet').notNull(),
    balance:           numeric('balance').notNull().default('0'),
    totalDeposited:    numeric('total_deposited').notNull().default('0'),
    totalSettled:      numeric('total_settled').notNull().default('0'),
    totalCallsSettled: numeric('total_calls_settled').notNull().default('0'),
    pricePerCall:      numeric('price_per_call').notNull().default('0'),
    maxCalls:          numeric('max_calls').notNull().default('0'),
    tokenMint:         text('token_mint'),
    tokenDecimals:     smallint('token_decimals').notNull().default(9),
    volumeCurve:       jsonb('volume_curve').$type<VolumeCurveEntry[]>().notNull().default([]),
    status:            text('status').notNull().default('active'),       // active | closed | depleted | expired
    createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt:          timestamp('closed_at', { withTimezone: true }),
    lastSettledAt:     timestamp('last_settled_at', { withTimezone: true }),
    expiresAt:         timestamp('expires_at', { withTimezone: true }),
    indexedAt:         timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * escrow_events (lifecycle history)
 * ═══════════════════════════════════════════════ */

export type EscrowEventType =
    | 'create_escrow'
    | 'deposit_escrow'
    | 'settle_calls'
    | 'withdraw_escrow'
    | 'close_escrow';

export const escrowEvents = sapExpSchema.table('escrow_events', {
    id:            serial('id').primaryKey(),
    escrowPda:     text('escrow_pda').notNull(),
    txSignature:   text('tx_signature').notNull().references(() => transactions.signature, { onDelete: 'cascade' }),
    eventType:     text('event_type').$type<EscrowEventType>().notNull(),
    slot:          bigint('slot', { mode: 'number' }).notNull(),
    blockTime:     timestamp('block_time', { withTimezone: true }),
    signer:        text('signer'),
    balanceBefore: numeric('balance_before'),
    balanceAfter:  numeric('balance_after'),
    amountChanged: numeric('amount_changed'),
    callsSettled:  numeric('calls_settled'),
    agentPda:      text('agent_pda'),
    depositor:     text('depositor'),
    indexedAt:     timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * attestations
 * ═══════════════════════════════════════════════ */

export const attestations = sapExpSchema.table('attestations', {
    pda:              text('pda').primaryKey(),
    agentPda:         text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
    attester:         text('attester').notNull(),
    attestationType:  text('attestation_type').notNull().default(''),
    isActive:         boolean('is_active').notNull().default(true),
    metadataHash:     text('metadata_hash'),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt:        timestamp('expires_at', { withTimezone: true }),
    indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * feedbacks
 * ═══════════════════════════════════════════════ */

export const feedbacks = sapExpSchema.table('feedbacks', {
    pda:           text('pda').primaryKey(),
    agentPda:      text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
    reviewer:      text('reviewer').notNull(),
    score:         smallint('score').notNull().default(0),
    tag:           text('tag').notNull().default(''),
    isRevoked:     boolean('is_revoked').notNull().default(false),
    commentHash:   text('comment_hash'),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt:     timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * vaults
 * ═══════════════════════════════════════════════ */

export const vaults = sapExpSchema.table('vaults', {
    pda:                  text('pda').primaryKey(),
    agentPda:             text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
    wallet:               text('wallet').notNull(),
    totalSessions:        integer('total_sessions').notNull().default(0),
    totalInscriptions:    numeric('total_inscriptions').notNull().default('0'),
    totalBytesInscribed:  numeric('total_bytes_inscribed').notNull().default('0'),
    nonceVersion:         integer('nonce_version').notNull().default(0),
    protocolVersion:      smallint('protocol_version').notNull().default(0),
    createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt:            timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * transactions
 * ═══════════════════════════════════════════════ */

export const transactions = sapExpSchema.table('transactions', {
    signature:             text('signature').primaryKey(),
    slot:                  bigint('slot', { mode: 'number' }).notNull(),
    blockTime:             timestamp('block_time', { withTimezone: true }),
    err:                   boolean('err').notNull().default(false),
    memo:                  text('memo'),
    signer:                text('signer'),
    fee:                   bigint('fee', { mode: 'number' }).notNull().default(0),
    feeSol:                doublePrecision('fee_sol').notNull().default(0),
    programs:              jsonb('programs').$type<TxProgram[]>().notNull().default([]),
    sapInstructions:       text('sap_instructions').array().notNull().default([]),
    instructionCount:      smallint('instruction_count').notNull().default(0),
    innerInstructionCount: smallint('inner_instruction_count').notNull().default(0),
    computeUnits:          integer('compute_units'),
    signerBalanceChange:   bigint('signer_balance_change', { mode: 'number' }).notNull().default(0),
    version:               text('version').notNull().default('legacy'),
    indexedAt:             timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * tx_details (heavy payload — /tx/[signature] page)
 * ═══════════════════════════════════════════════ */

export const txDetails = sapExpSchema.table('tx_details', {
    signature:            text('signature').primaryKey().references(() => transactions.signature, { onDelete: 'cascade' }),
    status:               text('status').notNull().default('success'),
    errorData:            jsonb('error_data'),
    accountKeys:          jsonb('account_keys').$type<AccountKey[]>().notNull().default([]),
    instructions:         jsonb('instructions').$type<ParsedInstruction[]>().notNull().default([]),
    logs:                 text('logs').array().notNull().default([]),
    balanceChanges:       jsonb('balance_changes').$type<BalanceChange[]>().notNull().default([]),
    tokenBalanceChanges:  jsonb('token_balance_changes').$type<TokenBalanceChange[]>().notNull().default([]),
    computeUnits:         integer('compute_units'),
    indexedAt:            timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * network_snapshots (time-series GlobalRegistry)
 * ═══════════════════════════════════════════════ */

export const networkSnapshots = sapExpSchema.table('network_snapshots', {
    id:                 serial('id').primaryKey(),
    totalAgents:        integer('total_agents').notNull().default(0),
    activeAgents:       integer('active_agents').notNull().default(0),
    totalFeedbacks:     integer('total_feedbacks').notNull().default(0),
    totalTools:         integer('total_tools').notNull().default(0),
    totalVaults:        integer('total_vaults').notNull().default(0),
    totalAttestations:  integer('total_attestations').notNull().default(0),
    totalCapabilities:  integer('total_capabilities').notNull().default(0),
    totalProtocols:     integer('total_protocols').notNull().default(0),
    authority:          text('authority').notNull(),
    capturedAt:         timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * sync_cursors (gRPC indexer tracking)
 * ═══════════════════════════════════════════════ */

export const syncCursors = sapExpSchema.table('sync_cursors', {
    entity:         text('entity').primaryKey(),
    lastSlot:       bigint('last_slot', { mode: 'number' }),
    lastSignature:  text('last_signature'),
    lastSyncedAt:   timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * settlement_ledger (per-event settlement audit log)
 * Each row = one decoded payment/batch-settle event
 * uniquely identified by (signature, event_type)
 * ═══════════════════════════════════════════════ */

export const settlementLedger = sapExpSchema.table('settlement_ledger', {
    id:             serial('id').primaryKey(),
    signature:      text('signature').notNull(),
    eventType:      text('event_type').notNull(),   // 'PaymentSettledEvent' | 'BatchSettledEvent'
    amountLamports: numeric('amount_lamports').notNull().default('0'),
    callsSettled:   numeric('calls_settled').notNull().default('0'),
    agentPda:       text('agent_pda').notNull(),
    depositor:      text('depositor').notNull(),
    escrowPda:      text('escrow_pda').notNull(),
    blockTime:      timestamp('block_time', { withTimezone: true }),
    slot:           bigint('slot', { mode: 'number' }).notNull().default(0),
    indexedAt:      timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * x402_direct_payments
 * Direct USDC SPL token transfers to agent ATA
 * (bypasses escrow — detected by scanning agent ATA)
 * ═══════════════════════════════════════════════ */

export const x402DirectPayments = sapExpSchema.table('x402_direct_payments', {
    id:             serial('id').primaryKey(),
    signature:      text('signature').notNull().unique(),
    agentWallet:    text('agent_wallet').notNull(),
    agentAta:       text('agent_ata').notNull(),
    payerWallet:    text('payer_wallet').notNull(),
    payerAta:       text('payer_ata').notNull(),
    amount:         numeric('amount').notNull(),              // human-readable (e.g. "1.50")
    amountRaw:      numeric('amount_raw').notNull(),          // raw lamports/smallest unit
    mint:           text('mint').notNull(),                   // SPL token mint
    decimals:       smallint('decimals').notNull().default(6),
    memo:           text('memo'),                             // x402:... prefix or null
    hasX402Memo:    boolean('has_x402_memo').notNull().default(false),
    settlementData: jsonb('settlement_data'),                 // PAYMENT-RESPONSE blob if found
    slot:           bigint('slot', { mode: 'number' }).notNull(),
    blockTime:      timestamp('block_time', { withTimezone: true }),
    indexedAt:      timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * tool_events (lifecycle audit trail)
 * ═══════════════════════════════════════════════ */

export type ToolEventType =
    | 'ToolPublished'
    | 'ToolUpdated'
    | 'ToolDeactivated'
    | 'ToolReactivated'
    | 'ToolClosed'
    | 'ToolSchemaInscribed'
    | 'ToolInvocationReported';

export const toolEvents = sapExpSchema.table('tool_events', {
    id:                serial('id').primaryKey(),
    toolPda:           text('tool_pda').notNull().references(() => tools.pda, { onDelete: 'cascade' }),
    agentPda:          text('agent_pda').notNull(),
    txSignature:       text('tx_signature').notNull(),
    eventType:         text('event_type').$type<ToolEventType>().notNull(),
    slot:              bigint('slot', { mode: 'number' }).notNull(),
    blockTime:         timestamp('block_time', { withTimezone: true }),
    toolName:          text('tool_name'),
    oldVersion:        smallint('old_version'),
    newVersion:        smallint('new_version'),
    invocations:       numeric('invocations'),
    totalInvocations:  numeric('total_invocations'),
    schemaType:        smallint('schema_type'),
    extra:             jsonb('extra'),
    indexedAt:         timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * tool_schemas (cached decoded schemas from TX logs)
 * ═══════════════════════════════════════════════ */

export const toolSchemas = sapExpSchema.table('tool_schemas', {
    id:              serial('id').primaryKey(),
    toolPda:         text('tool_pda').notNull().references(() => tools.pda, { onDelete: 'cascade' }),
    agentPda:        text('agent_pda').notNull(),
    txSignature:     text('tx_signature').notNull(),
    schemaType:      smallint('schema_type').notNull(),
    schemaTypeLabel: text('schema_type_label').notNull(),
    schemaData:      text('schema_data').notNull(),
    schemaJson:      jsonb('schema_json'),
    schemaHash:      text('schema_hash').notNull(),
    computedHash:    text('computed_hash').notNull(),
    verified:        boolean('verified').notNull().default(false),
    compression:     smallint('compression').notNull().default(0),
    version:         smallint('version').notNull().default(0),
    toolName:        text('tool_name'),
    blockTime:       timestamp('block_time', { withTimezone: true }),
    indexedAt:       timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * receipt_batches (v0.7 — trustless dispute evidence)
 * PDA seeds: ["sap_receipt", escrow_pda, batch_index_u32_le]
 * ═══════════════════════════════════════════════ */

export const receiptBatches = sapExpSchema.table('receipt_batches', {
    pda:             text('pda').primaryKey(),
    escrowPda:       text('escrow_pda').notNull().references(() => escrows.pda, { onDelete: 'cascade' }),
    batchIndex:      integer('batch_index').notNull(),
    callsMerkleRoot: text('calls_merkle_root').notNull(),
    callCount:       integer('call_count').notNull().default(0),
    totalAmount:     numeric('total_amount').notNull().default('0'),
    reporter:        text('reporter').notNull(),
    txSignature:     text('tx_signature'),
    slot:            bigint('slot', { mode: 'number' }),
    blockTime:       timestamp('block_time', { withTimezone: true }),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt:       timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * disputes (v0.7 — multi-layer dispute records)
 * ═══════════════════════════════════════════════ */

export type DisputeType = 'NonDelivery' | 'PartialDelivery' | 'Overcharge' | 'Quality';
export type ResolutionLayer = 'Pending' | 'Auto' | 'Governance';
export type DisputeOutcome = 'Pending' | 'Upheld' | 'Rejected' | 'PartialRefund' | 'Split' | 'Expired';

export const disputes = sapExpSchema.table('disputes', {
    pda:              text('pda').primaryKey(),
    escrowPda:        text('escrow_pda').notNull().references(() => escrows.pda, { onDelete: 'cascade' }),
    disputant:        text('disputant').notNull(),
    agentPda:         text('agent_pda').notNull(),
    disputeType:      text('dispute_type').$type<DisputeType>().notNull(),
    resolutionLayer:  text('resolution_layer').$type<ResolutionLayer>().notNull().default('Pending'),
    outcome:          text('outcome').$type<DisputeOutcome>().notNull().default('Pending'),
    disputeBond:      numeric('dispute_bond').notNull().default('0'),
    provenCalls:      integer('proven_calls').notNull().default(0),
    claimedCalls:     integer('claimed_calls').notNull().default(0),
    proofDeadline:    bigint('proof_deadline', { mode: 'number' }),
    reason:           text('reason'),
    txSignature:      text('tx_signature'),
    resolvedAt:       timestamp('resolved_at', { withTimezone: true }),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * pending_settlements (v0.7 — batch settlement with merkle proof)
 * ═══════════════════════════════════════════════ */

export const pendingSettlements = sapExpSchema.table('pending_settlements', {
    pda:                text('pda').primaryKey(),
    escrowPda:          text('escrow_pda').notNull().references(() => escrows.pda, { onDelete: 'cascade' }),
    agentPda:           text('agent_pda').notNull(),
    amount:             numeric('amount').notNull().default('0'),
    callsCount:         integer('calls_count').notNull().default(0),
    receiptMerkleRoot:  text('receipt_merkle_root'),
    status:             text('status').notNull().default('pending'),  // pending | settled | disputed | expired
    txSignature:        text('tx_signature'),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    settledAt:          timestamp('settled_at', { withTimezone: true }),
    indexedAt:          timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * token_metadata — Persistent cache for SPL token metadata
 * ═══════════════════════════════════════════════ */

export const tokenMetadata = sapExpSchema.table('token_metadata', {
    mint:       text('mint').primaryKey(),
    symbol:     text('symbol').notNull(),
    name:       text('name').notNull(),
    logo:       text('logo'),
    uri:        text('uri'),
    source:     text('source').notNull().default('onchain'), // onchain | metaplex | known | fallback
    updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * agent_metaplex — Persistent cache for Metaplex × SAP link snapshots
 * ═══════════════════════════════════════════════ */

export const agentMetaplex = sapExpSchema.table('agent_metaplex', {
    wallet:           text('wallet').primaryKey(),
    sapAgentPda:      text('sap_agent_pda'),
    asset:            text('asset'),
    linked:           boolean('linked').notNull().default(false),
    pluginCount:      integer('plugin_count').notNull().default(0),
    registryCount:    integer('registry_count').notNull().default(0),
    agentIdentityUri: text('agent_identity_uri'),
    registration:     jsonb('registration').$type<unknown>(),
    registryAgents:   jsonb('registry_agents').$type<unknown[]>().notNull().default([]),
    source:           text('source').notNull().default('unknown'), // das | searchAssets | on-chain | none
    error:            text('error'),
    refreshedAt:      timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

