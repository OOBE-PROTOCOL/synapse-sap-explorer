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
    name: string;
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

