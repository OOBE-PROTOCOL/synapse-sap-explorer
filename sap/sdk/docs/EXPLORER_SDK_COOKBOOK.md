# SAP Explorer SDK Cookbook

> Production patterns for building the Synapse SAP Explorer.
> Covers transaction decoding, event extraction, escrow tracking,
> protocol net volume, real-time streaming, and advanced analytics.
>
> **SDK**: `@oobe-protocol-labs/synapse-sap-sdk` v0.6.2+
> **Program**: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
> **Companion**: `@oobe-protocol-labs/synapse-client-sdk` 2.0.x

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Connection Setup](#2-connection-setup)
3. [Transaction Decoding](#3-transaction-decoding)
4. [Event Extraction Pipeline](#4-event-extraction-pipeline)
5. [Escrow State Machine](#5-escrow-state-machine)
6. [Protocol Net Volume (Total Payments)](#6-protocol-net-volume)
7. [Real-Time Indexing](#7-real-time-indexing)
8. [PostgreSQL Persistence Layer](#8-postgresql-persistence-layer)
9. [Advanced Analytics Queries](#9-advanced-analytics-queries)
10. [Explorer Page Recipes](#10-explorer-page-recipes)
11. [Performance Patterns](#11-performance-patterns)

---

## 1. Architecture Overview

The explorer reads on-chain state from two complementary sources:

```
                    Solana Mainnet
                         |
          +--------------+--------------+
          |                             |
    Account State                 Transaction Logs
    (current snapshot)            (permanent history)
          |                             |
    getProgramAccounts            getTransaction
    getAccountInfo                getSignaturesForAddress
          |                             |
    +-----+------+               +-----+------+
    | SapClient  |               | Parser     |
    | .program   |               | .parser    |
    | .discovery |               | .events    |
    +-----+------+               +-----+------+
          |                             |
          +----------+--+--+------------+
                     |  |  |
               +-----+  |  +------+
               |         |         |
         SapPostgres  REST API   WebSocket
         (22 tables)  (Next.js)  (live feed)
               |         |         |
               +---------+---------+
                         |
                    Explorer UI
```

**Key principle**: Account state gives you the current snapshot. Transaction
logs give you the full history. The explorer needs both.

### What lives where

| Data | Source | Method |
|------|--------|--------|
| Current agent profile | Account state | `program.account.agentAccount.fetch(pda)` |
| All escrow balances | Account state | `program.account.escrowAccount.all()` |
| Settlement history | TX logs | `PaymentSettledEvent` + `BatchSettledEvent` |
| Tool JSON schemas | TX logs | `ToolSchemaInscribedEvent` |
| Escrow lifecycle | TX logs | Created/Deposited/Settled/Withdrawn events |
| Memory content | TX logs | `MemoryInscribedEvent` (encrypted) |
| Ring buffer (latest) | Account state | `program.account.memoryLedger.fetch(pda)` |

---

## 2. Connection Setup

### Read-Only Explorer (no wallet required)

```typescript
import { SapClient, SAP_PROGRAM_ADDRESS } from "@oobe-protocol-labs/synapse-sap-sdk";
import { Connection } from "@solana/web3.js";

// Option A: Public RPC (rate-limited to ~10 req/s)
const connection = new Connection("https://api.mainnet-beta.solana.com");

// Option B: Dedicated RPC (recommended for production)
const connection = new Connection(
  `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`
);

// Read-only client (no transactions, only reads)
const sap = SapClient.readOnly(connection);
const program = sap.program;
```

### With Synapse Client SDK (RPC + DAS + WebSocket + gRPC)

```typescript
import { SynapseClient } from "@oobe-protocol-labs/synapse-client-sdk";

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const synapse = new SynapseClient({ endpoint: ENDPOINT });

// Use synapse.rpc for standard RPC calls
// Use synapse.ws for WebSocket subscriptions
// Use synapse.grpc for gRPC/Geyser streaming
// Use synapse.das for DAS (NFT) queries
```

### Dual Connection (Explorer + SAP)

```typescript
import { createDualConnection } from "@oobe-protocol-labs/synapse-sap-sdk";

// Primary: authenticated RPC for SAP program operations
// Fallback: public RPC for SPL token operations
const { primary, fallback } = createDualConnection(
  { primaryUrl: process.env.RPC_URL },
  "mainnet-beta",
);

const sap = SapClient.readOnly(primary);
```

---

## 3. Transaction Decoding

### 3.1 Parse a Single Transaction

```typescript
import {
  parseSapTransactionComplete,
  TransactionParser,
} from "@oobe-protocol-labs/synapse-sap-sdk/parser";
import type {
  ParsedSapTransaction,
  DecodedSapInstruction,
  ParseFilterOptions,
} from "@oobe-protocol-labs/synapse-sap-sdk/parser";

// Fetch raw transaction
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,
  commitment: "confirmed",
});

if (!tx) throw new Error("Transaction not found");

// Full decode: instructions + inner CPI + events + logs
const parsed: ParsedSapTransaction | null = parseSapTransactionComplete(
  tx,
  program,
  SAP_PROGRAM_ADDRESS,
);

if (parsed) {
  console.log("Signature:", parsed.signature);
  console.log("Slot:", parsed.slot);
  console.log("Block time:", parsed.blockTime);
  console.log("Success:", parsed.success);

  // Decoded SAP instructions (top-level)
  for (const ix of parsed.instructions) {
    console.log(`  IX: ${ix.name}`);
    console.log(`  Args:`, ix.args);
    console.log(`  Accounts:`, ix.accounts.map(a => a.toBase58()));
  }

  // Decoded inner CPI instructions (SAP program calls from within)
  for (const inner of parsed.innerInstructions) {
    if (inner.name) {
      console.log(`  CPI: ${inner.name} (outer IX #${inner.outerIndex})`);
    }
  }

  // Parsed events from TX logs
  for (const event of parsed.events) {
    console.log(`  Event: ${event.name}`, event.data);
  }
}
```

### 3.2 Batch Parse (Transaction Feed)

```typescript
import { parseSapTransactionBatch } from "@oobe-protocol-labs/synapse-sap-sdk/parser";

// Fetch recent SAP program signatures
const signatures = await connection.getSignaturesForAddress(
  SAP_PROGRAM_ADDRESS,
  { limit: 50 },
);

// Fetch all transactions in parallel (respect rate limits)
const txs = await Promise.all(
  signatures.map(({ signature }) =>
    connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    })
  )
);

// Batch decode — null-safe, skips failures
const parsed = parseSapTransactionBatch(
  txs.filter(Boolean),
  program,
  SAP_PROGRAM_ADDRESS,
);

// Each entry has: signature, slot, blockTime, success,
//                 instructions[], innerInstructions[], events[], logs[]
```

### 3.3 Filter by Instruction or Event

```typescript
const options: ParseFilterOptions = {
  includeInner: true,
  includeEvents: true,
  // Only decode these instructions (skip the rest)
  instructionFilter: ["settle_calls", "settle_batch", "create_escrow"],
  // Only extract these events
  eventFilter: ["PaymentSettledEvent", "BatchSettledEvent", "EscrowCreatedEvent"],
};

const parsed = parseSapTransactionComplete(tx, program, SAP_PROGRAM_ADDRESS, options);
```

### 3.4 Pre-Filter: Is It a SAP Transaction?

```typescript
import { containsSapInstruction } from "@oobe-protocol-labs/synapse-sap-sdk/parser";

// Fast check before full decode (no Anchor decode, just program ID match)
const isSap = containsSapInstruction(
  tx.transaction.message.compiledInstructions,
  SAP_PROGRAM_ADDRESS,
);

if (isSap) {
  // Now decode
}
```

### 3.5 OOP Interface (TransactionParser)

```typescript
const parser = sap.parser; // TransactionParser instance from SapClient

const result = parser.parseTransaction(tx);
const batch = parser.parseBatch(txArray);
const names = parser.instructionNames(tx);     // string[] — instruction names only
const isSap = parser.isSapTransaction(ixList); // fast pre-filter
const inner = parser.decodeInner(innerGroups, tx);
```

### 3.6 Decoding Versioned Transactions

The parser handles both legacy and versioned (v0) transactions automatically.
For v0 transactions with Address Lookup Tables:

```typescript
import { extractAccountKeys } from "@oobe-protocol-labs/synapse-sap-sdk/parser";

// Extract all account keys (handles versioned + lookup tables)
const allKeys = extractAccountKeys(tx);

// If you have lookup table data, pass it for v0 decompilation
const lookupTables = await Promise.all(
  tx.transaction.message.addressTableLookups.map(async (lookup) => {
    const acct = await connection.getAccountInfo(lookup.accountKey);
    return { key: lookup.accountKey, state: AddressLookupTableAccount.deserialize(acct.data) };
  })
);

const parsed = parseSapTransactionComplete(
  tx, program, SAP_PROGRAM_ADDRESS, {}, lookupTables
);
```

---

## 4. Event Extraction Pipeline

### 4.1 Event Parser Basics

```typescript
import { EventParser, SAP_EVENT_NAMES } from "@oobe-protocol-labs/synapse-sap-sdk/events";
import type { ParsedEvent, SapEventName } from "@oobe-protocol-labs/synapse-sap-sdk/events";

const eventParser = sap.events; // or: new EventParser(program)

// Parse events from transaction log messages
const events: ParsedEvent[] = eventParser.parseLogs(tx.meta.logMessages);

for (const event of events) {
  console.log(event.name);  // e.g. "PaymentSettledEvent"
  console.log(event.data);  // typed object with all event fields
}
```

### 4.2 All 45 Event Names

```typescript
// SAP_EVENT_NAMES is a frozen array of 38 active + 7 legacy event names
console.log(SAP_EVENT_NAMES);
// [
//   "RegisteredEvent", "UpdatedEvent", "DeactivatedEvent", "ReactivatedEvent",
//   "ClosedEvent", "FeedbackEvent", "FeedbackUpdatedEvent", "FeedbackRevokedEvent",
//   "ReputationUpdatedEvent", "CallsReportedEvent",
//   "VaultInitializedEvent", "SessionOpenedEvent", "MemoryInscribedEvent",
//   "EpochOpenedEvent", "SessionClosedEvent", "VaultClosedEvent",
//   "SessionPdaClosedEvent", "EpochPageClosedEvent", "VaultNonceRotatedEvent",
//   "DelegateAddedEvent", "DelegateRevokedEvent",
//   "ToolPublishedEvent", "ToolSchemaInscribedEvent", "ToolUpdatedEvent",
//   "ToolDeactivatedEvent", "ToolReactivatedEvent", "ToolClosedEvent",
//   "ToolInvocationReportedEvent", "CheckpointCreatedEvent",
//   "EscrowCreatedEvent", "EscrowDepositedEvent", "PaymentSettledEvent",
//   "EscrowWithdrawnEvent", "BatchSettledEvent",
//   "AttestationCreatedEvent", "AttestationRevokedEvent",
//   "LedgerEntryEvent", "LedgerSealedEvent",
//   ...legacy events
// ]
```

### 4.3 Filter Events by Type

```typescript
// Filter from a parsed event array
const settlements = eventParser.filterByName(events, "PaymentSettledEvent");
const batches = eventParser.filterByName(events, "BatchSettledEvent");

// Combined payment events
const allPayments = events.filter(
  e => e.name === "PaymentSettledEvent" || e.name === "BatchSettledEvent"
);
```

### 4.4 Typed Event Data Structures

The six primary typed event interfaces:

```typescript
// PaymentSettledEvent — single settlement
interface PaymentSettledEventData {
  escrow: PublicKey;
  agent: PublicKey;
  depositor: PublicKey;
  callsSettled: BN;       // number of calls billed
  amount: BN;             // lamports transferred to agent
  serviceHash: number[];  // [u8; 32] proof of service
  totalCallsSettled: BN;  // cumulative calls on this escrow
  remainingBalance: BN;   // escrow balance after settlement
  timestamp: BN;          // unix timestamp
}

// BatchSettledEvent — batch settlement (up to 10)
interface BatchSettledEventData {
  escrow: PublicKey;
  agent: PublicKey;
  depositor: PublicKey;
  numSettlements: number;       // number of entries in batch
  totalCalls: BN;               // sum of calls across all entries
  totalAmount: BN;              // sum of lamports across all entries
  serviceHashes: number[][];    // [u8; 32][] proof per entry
  callsPerSettlement: BN[];     // calls per entry
  remainingBalance: BN;         // escrow balance after batch
  timestamp: BN;
}

// EscrowCreatedEvent
interface EscrowCreatedEventData {
  escrow: PublicKey;
  agent: PublicKey;
  depositor: PublicKey;
  pricePerCall: BN;
  maxCalls: BN;
  initialDeposit: BN;
  expiresAt: BN;
  timestamp: BN;
}

// EscrowDepositedEvent
interface EscrowDepositedEventData {
  escrow: PublicKey;
  depositor: PublicKey;
  amount: BN;
  newBalance: BN;
  timestamp: BN;
}

// EscrowWithdrawnEvent
interface EscrowWithdrawnEventData {
  escrow: PublicKey;
  depositor: PublicKey;
  amount: BN;
  remainingBalance: BN;
  timestamp: BN;
}

// RegisteredEvent
interface RegisteredEventData {
  agent: PublicKey;
  wallet: PublicKey;
  name: string;
  capabilities: string[];
  timestamp: BN;
}
```

---

## 5. Escrow State Machine

Every escrow PDA follows this lifecycle. The explorer must track each transition.

```
                                      create_escrow
                                           |
                                           v
                          +----------------------------------+
                          |         OPEN (balance > 0)       |
                          |  balance, totalDeposited,        |
                          |  totalSettled, totalCallsSettled  |
                          +----+----------+----------+-------+
                               |          |          |
                  deposit_escrow   settle_calls   withdraw_escrow
                               |          |          |
                               v          v          v
                          +----------------------------------+
                          |           ACTIVE                 |
                          |  (same account, updated fields)  |
                          +----+----------+----------+-------+
                               |          |          |
                               |    settle_batch     |
                               |          |          |
                               v          v          v
                          +----------------------------------+
                          |      DRAINED (balance = 0)       |
                          +-----------------+----------------+
                                            |
                                      close_escrow
                                            |
                                            v
                                       [CLOSED]
                                   (account deleted)
```

### 5.1 Fetch All Escrows

```typescript
import { deriveAgent, deriveEscrow } from "@oobe-protocol-labs/synapse-sap-sdk/pda";

// All escrows in the protocol
const allEscrows = await program.account.escrowAccount.all();

// Escrows for a specific agent (memcmp on agent field at offset 9)
const agentEscrows = await program.account.escrowAccount.all([
  { memcmp: { offset: 8 + 1, bytes: agentPda.toBase58() } }
]);

// Single escrow by known pair
const [escrowPda] = deriveEscrow(agentPda, depositorWallet);
const escrow = await program.account.escrowAccount.fetchNullable(escrowPda);
```

### 5.2 Escrow Fields for Explorer Display

```typescript
interface EscrowDisplayData {
  pda: string;
  agent: string;
  agentWallet: string;
  depositor: string;
  // Current state
  balance: string;           // lamports, current available
  totalDeposited: string;    // lifetime deposits
  totalSettled: string;      // lifetime settled amount
  totalCallsSettled: string; // lifetime calls settled
  // Pricing
  pricePerCall: string;      // locked price
  maxCalls: string;          // 0 = unlimited
  volumeCurve: Array<{ afterCalls: number; pricePerCall: string }>;
  // Token info
  tokenMint: string | null;  // null = SOL
  tokenDecimals: number;
  // Timestamps
  createdAt: Date;
  lastSettledAt: Date;
  expiresAt: Date | null;    // null = never
  // Computed
  callsRemaining: number;    // maxCalls > 0 ? maxCalls - totalCallsSettled : Infinity
  effectivePrice: string;    // current price considering volume curve
  isExpired: boolean;
  utilizationPercent: number; // totalSettled / totalDeposited * 100
}
```

### 5.3 Reconstruct Escrow History from Events

The escrow account only stores the current state. To show a full transaction
history (deposits, settlements, withdrawals), scan TX logs:

```typescript
async function getEscrowHistory(
  connection: Connection,
  escrowPda: PublicKey,
  program: Program,
): Promise<EscrowHistoryEntry[]> {
  const eventParser = new EventParser(program);
  const history: EscrowHistoryEntry[] = [];

  // Get all transactions touching this escrow PDA
  const sigs = await connection.getSignaturesForAddress(escrowPda, { limit: 1000 });

  for (const { signature, slot, blockTime } of sigs) {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) continue;

    const events = eventParser.parseLogs(tx.meta.logMessages);

    for (const event of events) {
      switch (event.name) {
        case "EscrowCreatedEvent":
          history.push({
            type: "created",
            signature,
            slot,
            blockTime,
            amount: event.data.initialDeposit,
            pricePerCall: event.data.pricePerCall,
          });
          break;

        case "EscrowDepositedEvent":
          history.push({
            type: "deposit",
            signature,
            slot,
            blockTime,
            amount: event.data.amount,
            newBalance: event.data.newBalance,
          });
          break;

        case "PaymentSettledEvent":
          history.push({
            type: "settlement",
            signature,
            slot,
            blockTime,
            amount: event.data.amount,
            callsSettled: event.data.callsSettled,
            serviceHash: event.data.serviceHash,
            remainingBalance: event.data.remainingBalance,
          });
          break;

        case "BatchSettledEvent":
          history.push({
            type: "batch_settlement",
            signature,
            slot,
            blockTime,
            totalAmount: event.data.totalAmount,
            totalCalls: event.data.totalCalls,
            numEntries: event.data.numSettlements,
            remainingBalance: event.data.remainingBalance,
          });
          break;

        case "EscrowWithdrawnEvent":
          history.push({
            type: "withdrawal",
            signature,
            slot,
            blockTime,
            amount: event.data.amount,
            remainingBalance: event.data.remainingBalance,
          });
          break;
      }
    }
  }

  return history.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}
```

---

## 6. Protocol Net Volume

This is the most innovative metric for the explorer: tracking the total
economic activity flowing through the SAP protocol in real time.

### 6.1 Data Model

```
Protocol Net Volume = Sum of all PaymentSettledEvent.amount
                    + Sum of all BatchSettledEvent.totalAmount
                    across all escrows, all time
```

This represents the total value transferred from consumers to agents
through the x402 payment layer.

### 6.2 Compute from Current Account State (Fast Approximation)

Every `EscrowAccount` has `totalSettled` (lifetime settled amount).
Summing across all escrows gives a close approximation:

```typescript
async function getProtocolNetVolume(
  program: Program,
): Promise<{
  totalSettledLamports: bigint;
  totalSettledSol: number;
  totalCallsSettled: bigint;
  totalEscrows: number;
  activeEscrows: number;
  totalDeposited: bigint;
  totalCurrentBalance: bigint;
}> {
  const escrows = await program.account.escrowAccount.all();

  let totalSettled = 0n;
  let totalCalls = 0n;
  let totalDeposited = 0n;
  let totalBalance = 0n;
  let activeCount = 0;

  for (const { account } of escrows) {
    const settled = BigInt(account.totalSettled.toString());
    const calls = BigInt(account.totalCallsSettled.toString());
    const deposited = BigInt(account.totalDeposited.toString());
    const balance = BigInt(account.balance.toString());

    totalSettled += settled;
    totalCalls += calls;
    totalDeposited += deposited;
    totalBalance += balance;

    if (balance > 0n) activeCount++;
  }

  return {
    totalSettledLamports: totalSettled,
    totalSettledSol: Number(totalSettled) / 1e9,
    totalCallsSettled: totalCalls,
    totalEscrows: escrows.length,
    activeEscrows: activeCount,
    totalDeposited: totalDeposited,
    totalCurrentBalance: totalBalance,
  };
}
```

**Limitation**: This only counts currently-open escrows. Closed (deleted)
escrows are lost. For a complete historical count, use event scanning.

### 6.3 Compute from Events (Exact, Historical)

Scan all `PaymentSettledEvent` and `BatchSettledEvent` from the program's
transaction history for exact totals:

```typescript
async function getExactProtocolVolume(
  connection: Connection,
  program: Program,
): Promise<{
  totalSettledLamports: bigint;
  totalCalls: bigint;
  totalSettlements: number;
  totalBatchSettlements: number;
  firstSettlement: Date | null;
  lastSettlement: Date | null;
  settlementsByAgent: Map<string, { amount: bigint; calls: bigint }>;
  dailyVolume: Map<string, bigint>; // "YYYY-MM-DD" -> lamports
}> {
  const eventParser = new EventParser(program);
  const SAP_PROGRAM_ID = new PublicKey(SAP_PROGRAM_ADDRESS);

  let totalSettled = 0n;
  let totalCalls = 0n;
  let totalSingle = 0;
  let totalBatch = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  const byAgent = new Map<string, { amount: bigint; calls: bigint }>();
  const daily = new Map<string, bigint>();

  // Paginate through all program signatures
  let lastSig: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const sigs = await connection.getSignaturesForAddress(
      SAP_PROGRAM_ID,
      { limit: 1000, before: lastSig },
    );

    if (sigs.length === 0) break;
    if (sigs.length < 1000) hasMore = false;
    lastSig = sigs[sigs.length - 1].signature;

    for (const { signature, blockTime } of sigs) {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.meta?.logMessages) continue;

      const events = eventParser.parseLogs(tx.meta.logMessages);

      for (const event of events) {
        if (event.name === "PaymentSettledEvent") {
          const amount = BigInt(event.data.amount.toString());
          const calls = BigInt(event.data.callsSettled.toString());
          const agent = event.data.agent.toBase58();
          const ts = event.data.timestamp.toNumber();

          totalSettled += amount;
          totalCalls += calls;
          totalSingle++;

          // Track by agent
          const prev = byAgent.get(agent) ?? { amount: 0n, calls: 0n };
          byAgent.set(agent, {
            amount: prev.amount + amount,
            calls: prev.calls + calls,
          });

          // Track daily volume
          const day = new Date(ts * 1000).toISOString().slice(0, 10);
          daily.set(day, (daily.get(day) ?? 0n) + amount);

          // Track timestamps
          if (firstTs === null || ts < firstTs) firstTs = ts;
          if (lastTs === null || ts > lastTs) lastTs = ts;
        }

        if (event.name === "BatchSettledEvent") {
          const amount = BigInt(event.data.totalAmount.toString());
          const calls = BigInt(event.data.totalCalls.toString());
          const agent = event.data.agent.toBase58();
          const ts = event.data.timestamp.toNumber();

          totalSettled += amount;
          totalCalls += calls;
          totalBatch++;

          const prev = byAgent.get(agent) ?? { amount: 0n, calls: 0n };
          byAgent.set(agent, {
            amount: prev.amount + amount,
            calls: prev.calls + calls,
          });

          const day = new Date(ts * 1000).toISOString().slice(0, 10);
          daily.set(day, (daily.get(day) ?? 0n) + amount);

          if (firstTs === null || ts < firstTs) firstTs = ts;
          if (lastTs === null || ts > lastTs) lastTs = ts;
        }
      }
    }
  }

  return {
    totalSettledLamports: totalSettled,
    totalCalls,
    totalSettlements: totalSingle,
    totalBatchSettlements: totalBatch,
    firstSettlement: firstTs ? new Date(firstTs * 1000) : null,
    lastSettlement: lastTs ? new Date(lastTs * 1000) : null,
    settlementsByAgent: byAgent,
    dailyVolume: daily,
  };
}
```

### 6.4 Incremental Volume Tracking (PostgreSQL)

For a production explorer, do not re-scan the entire history on every request.
Instead, maintain a cursor and scan incrementally:

```typescript
async function incrementalVolumeSync(
  connection: Connection,
  program: Program,
  pg: SapPostgres,
): Promise<void> {
  // Get last processed signature from cursor table
  const cursor = await pg.query<{ last_signature: string; last_slot: number }>(
    `SELECT last_signature, last_slot FROM sap_sync_cursors WHERE entity = 'volume'`
  );

  const lastSig = cursor.rows[0]?.last_signature ?? undefined;

  // Fetch new signatures since last cursor
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey(SAP_PROGRAM_ADDRESS),
    { limit: 1000, until: lastSig },
  );

  if (sigs.length === 0) return;

  const eventParser = new EventParser(program);

  for (const { signature, slot } of sigs.reverse()) { // oldest first
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) continue;

    const events = eventParser.parseLogs(tx.meta.logMessages);

    for (const event of events) {
      if (event.name === "PaymentSettledEvent" || event.name === "BatchSettledEvent") {
        const amount = event.name === "PaymentSettledEvent"
          ? event.data.amount.toString()
          : event.data.totalAmount.toString();
        const calls = event.name === "PaymentSettledEvent"
          ? event.data.callsSettled.toString()
          : event.data.totalCalls.toString();
        const agent = event.data.agent.toBase58();
        const depositor = event.data.depositor.toBase58();
        const ts = event.data.timestamp?.toNumber() ?? (tx.blockTime ?? 0);

        // Insert into settlement ledger table
        await pg.query(
          `INSERT INTO sap_settlement_ledger
           (signature, slot, event_type, agent_pda, depositor, amount_lamports,
            calls_settled, block_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
           ON CONFLICT (signature, event_type) DO NOTHING`,
          [signature, slot, event.name, agent, depositor, amount, calls, ts],
        );
      }

      // Persist all events to the general event table
      await pg.syncEvent(
        event.name,
        signature,
        slot,
        event.data,
        event.data.agent?.toBase58(),
        event.data.wallet?.toBase58(),
      );
    }

    // Update cursor
    await pg.query(
      `INSERT INTO sap_sync_cursors (entity, last_signature, last_slot, updated_at)
       VALUES ('volume', $1, $2, NOW())
       ON CONFLICT (entity) DO UPDATE SET last_signature = $1, last_slot = $2, updated_at = NOW()`,
      [signature, slot],
    );
  }
}
```

### 6.5 Volume Dashboard SQL Queries

```sql
-- Create the settlement ledger table (add to migration)
CREATE TABLE IF NOT EXISTS sap_settlement_ledger (
  id            SERIAL PRIMARY KEY,
  signature     TEXT NOT NULL,
  slot          BIGINT NOT NULL,
  event_type    TEXT NOT NULL,        -- PaymentSettledEvent | BatchSettledEvent
  agent_pda     TEXT NOT NULL,
  depositor     TEXT NOT NULL,
  amount_lamports NUMERIC NOT NULL,
  calls_settled NUMERIC NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (signature, event_type)
);

CREATE INDEX idx_settlement_agent ON sap_settlement_ledger (agent_pda);
CREATE INDEX idx_settlement_time ON sap_settlement_ledger (block_time);
CREATE INDEX idx_settlement_depositor ON sap_settlement_ledger (depositor);

-- Total protocol net volume (all time)
SELECT
  SUM(amount_lamports) / 1e9 AS total_sol,
  SUM(calls_settled) AS total_calls,
  COUNT(*) AS total_settlements
FROM sap_settlement_ledger;

-- Daily volume (for charts)
SELECT
  DATE(block_time) AS day,
  SUM(amount_lamports) / 1e9 AS daily_sol,
  SUM(calls_settled) AS daily_calls,
  COUNT(*) AS daily_settlements
FROM sap_settlement_ledger
GROUP BY DATE(block_time)
ORDER BY day;

-- Hourly volume (last 24h, for live dashboard)
SELECT
  DATE_TRUNC('hour', block_time) AS hour,
  SUM(amount_lamports) / 1e9 AS hourly_sol,
  SUM(calls_settled) AS hourly_calls
FROM sap_settlement_ledger
WHERE block_time > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', block_time)
ORDER BY hour;

-- Top agents by revenue
SELECT
  agent_pda,
  SUM(amount_lamports) / 1e9 AS total_revenue_sol,
  SUM(calls_settled) AS total_calls,
  COUNT(*) AS settlement_count,
  AVG(amount_lamports) / 1e9 AS avg_settlement_sol
FROM sap_settlement_ledger
GROUP BY agent_pda
ORDER BY total_revenue_sol DESC
LIMIT 20;

-- Top depositors (consumers) by spend
SELECT
  depositor,
  SUM(amount_lamports) / 1e9 AS total_spent_sol,
  SUM(calls_settled) AS total_calls,
  COUNT(DISTINCT agent_pda) AS agents_used
FROM sap_settlement_ledger
GROUP BY depositor
ORDER BY total_spent_sol DESC
LIMIT 20;

-- Agent revenue over time (for agent profile chart)
SELECT
  DATE(block_time) AS day,
  SUM(amount_lamports) / 1e9 AS daily_sol,
  SUM(calls_settled) AS daily_calls
FROM sap_settlement_ledger
WHERE agent_pda = $1
GROUP BY DATE(block_time)
ORDER BY day;

-- Moving 7-day average volume
SELECT
  day,
  daily_sol,
  AVG(daily_sol) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7d
FROM (
  SELECT DATE(block_time) AS day, SUM(amount_lamports) / 1e9 AS daily_sol
  FROM sap_settlement_ledger
  GROUP BY DATE(block_time)
) sub
ORDER BY day;

-- Settlement velocity (avg time between settlements per agent)
SELECT
  agent_pda,
  COUNT(*) AS settlements,
  EXTRACT(EPOCH FROM (MAX(block_time) - MIN(block_time))) / NULLIF(COUNT(*) - 1, 0) AS avg_interval_sec
FROM sap_settlement_ledger
GROUP BY agent_pda
HAVING COUNT(*) > 1
ORDER BY avg_interval_sec;
```

---

## 7. Real-Time Indexing

### 7.1 WebSocket Event Stream

```typescript
import { EventParser, SAP_EVENT_NAMES } from "@oobe-protocol-labs/synapse-sap-sdk/events";
import { SAP_PROGRAM_ADDRESS } from "@oobe-protocol-labs/synapse-sap-sdk/constants";

const eventParser = new EventParser(program);
const SAP_PROGRAM_ID = new PublicKey(SAP_PROGRAM_ADDRESS);

// Subscribe to all SAP program logs
const subscriptionId = connection.onLogs(
  SAP_PROGRAM_ID,
  (logInfo, context) => {
    if (logInfo.err) return; // skip failed TXs

    const events = eventParser.parseLogs(logInfo.logs);

    for (const event of events) {
      // Route to handler by event type
      switch (event.name) {
        case "PaymentSettledEvent":
        case "BatchSettledEvent":
          handleSettlement(event, logInfo.signature, context.slot);
          break;
        case "RegisteredEvent":
          handleNewAgent(event, logInfo.signature);
          break;
        case "EscrowCreatedEvent":
          handleNewEscrow(event, logInfo.signature);
          break;
        case "FeedbackEvent":
          handleFeedback(event, logInfo.signature);
          break;
        // ... route all 38 event types
      }
    }
  },
  "confirmed",
);

// Cleanup
// connection.removeOnLogsListener(subscriptionId);
```

### 7.2 SapSyncEngine (Built-in Periodic Sync + Event Stream)

```typescript
import { SapPostgres, SapSyncEngine } from "@oobe-protocol-labs/synapse-sap-sdk/postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = new SapPostgres(pool, sap, { debug: true });

// Create all 22 tables (idempotent)
await pg.migrate();

// Initial full sync (run once)
const result = await pg.syncAll();
// result.totalRecords, result.durationMs, per-entity counts

// Start continuous sync
const engine = new SapSyncEngine(pg, sap, { debug: true });

// Periodic full re-sync (catches any missed state changes)
engine.start(30_000); // every 30 seconds

// Real-time event ingestion (WebSocket)
await engine.startEventStream();

// Status checks
console.log("Syncing:", engine.isRunning());
console.log("Streaming:", engine.isStreaming());

// Graceful shutdown
process.on("SIGINT", async () => {
  await engine.stop();
  await pool.end();
});
```

### 7.3 Hybrid Indexing Strategy

For a production explorer, combine three approaches:

```
Strategy                  Latency    Completeness    Cost
-------------------------------------------------------
WebSocket event stream    ~2s        Events only     Free (reads)
Periodic full sync        30-60s     All accounts    ~100 gPA/cycle
Historical TX scan        Minutes    Full history    ~N getTransaction

Recommended combo:
1. WebSocket for live event feed (dashboard, notifications)
2. Periodic sync every 30s for account state (balances, scores)
3. Incremental TX scan for settlement ledger (volume tracking)
```

---

## 8. PostgreSQL Persistence Layer

### 8.1 Table Map (22 Tables)

| SAP Account | Table | Key Query |
|-------------|-------|-----------|
| GlobalRegistry | `sap_global_registry` | `SELECT * FROM sap_global_registry LIMIT 1` |
| AgentAccount | `sap_agents` | `WHERE is_active = true ORDER BY reputation_score DESC` |
| AgentStats | `sap_agent_stats` | `WHERE is_active = true ORDER BY total_calls_served DESC` |
| FeedbackAccount | `sap_feedbacks` | `WHERE agent = $1 AND is_revoked = false` |
| ToolDescriptor | `sap_tools` | `WHERE agent = $1 AND is_active = true` |
| EscrowAccount | `sap_escrows` | `WHERE balance > 0 ORDER BY balance DESC` |
| AgentAttestation | `sap_attestations` | `WHERE is_active = true` |
| MemoryVault | `sap_memory_vaults` | `WHERE agent = $1` |
| SessionLedger | `sap_sessions` | `WHERE vault = $1 ORDER BY created_at DESC` |
| EpochPage | `sap_epoch_pages` | `WHERE session = $1 ORDER BY epoch_index` |
| VaultDelegate | `sap_vault_delegates` | `WHERE vault = $1` |
| SessionCheckpoint | `sap_checkpoints` | `WHERE session = $1 ORDER BY checkpoint_index` |
| CapabilityIndex | `sap_capability_indexes` | `ORDER BY array_length(agents, 1) DESC` |
| ProtocolIndex | `sap_protocol_indexes` | `ORDER BY array_length(agents, 1) DESC` |
| ToolCategoryIndex | `sap_tool_category_indexes` | All 10 categories |
| MemoryLedger | `sap_memory_ledgers` | `WHERE session = $1` |
| LedgerPage | `sap_ledger_pages` | `WHERE ledger = $1` |
| Events | `sap_events` | `ORDER BY created_at DESC LIMIT 50` |
| Sync Cursors | `sap_sync_cursors` | Status per entity |

### 8.2 Convenience Methods

```typescript
// Pre-built query methods on SapPostgres
const agent = await pg.getAgent(walletOrPda);          // single agent
const active = await pg.getActiveAgents(20);           // top by reputation
const tools = await pg.getAgentTools(agentPda);        // tools for agent
const balance = await pg.getEscrowBalance(agent, dep); // escrow balance
const events = await pg.getRecentEvents(50, "PaymentSettledEvent");
const status = await pg.getSyncStatus();               // sync cursor state
```

### 8.3 Custom Settlement Table (add to migration)

```typescript
// Add to your migration after pg.migrate()
await pg.query(`
  CREATE TABLE IF NOT EXISTS sap_settlement_ledger (
    id             SERIAL PRIMARY KEY,
    signature      TEXT NOT NULL,
    slot           BIGINT NOT NULL,
    event_type     TEXT NOT NULL,
    agent_pda      TEXT NOT NULL,
    depositor      TEXT NOT NULL,
    amount_lamports NUMERIC NOT NULL,
    calls_settled  NUMERIC NOT NULL,
    block_time     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (signature, event_type)
  );

  CREATE INDEX IF NOT EXISTS idx_sled_agent ON sap_settlement_ledger (agent_pda);
  CREATE INDEX IF NOT EXISTS idx_sled_time ON sap_settlement_ledger (block_time);
  CREATE INDEX IF NOT EXISTS idx_sled_depositor ON sap_settlement_ledger (depositor);

  -- Materialized view for protocol stats (refresh periodically)
  CREATE MATERIALIZED VIEW IF NOT EXISTS sap_protocol_stats AS
  SELECT
    COUNT(DISTINCT agent_pda) AS unique_agents,
    COUNT(DISTINCT depositor) AS unique_consumers,
    SUM(amount_lamports)::NUMERIC AS total_volume_lamports,
    SUM(calls_settled)::NUMERIC AS total_calls,
    COUNT(*) AS total_settlements,
    MIN(block_time) AS first_settlement,
    MAX(block_time) AS last_settlement
  FROM sap_settlement_ledger;

  -- Daily volume materialized view
  CREATE MATERIALIZED VIEW IF NOT EXISTS sap_daily_volume AS
  SELECT
    DATE(block_time) AS day,
    SUM(amount_lamports)::NUMERIC / 1e9 AS volume_sol,
    SUM(calls_settled)::NUMERIC AS calls,
    COUNT(*) AS settlements,
    COUNT(DISTINCT agent_pda) AS active_agents,
    COUNT(DISTINCT depositor) AS active_consumers
  FROM sap_settlement_ledger
  GROUP BY DATE(block_time)
  ORDER BY day;
`);
```

---

## 9. Advanced Analytics Queries

### 9.1 Agent Economics

```sql
-- Agent profit margin (settled vs deposited, per escrow)
SELECT
  a.name AS agent,
  e.pda AS escrow,
  e.total_deposited::NUMERIC / 1e9 AS deposited_sol,
  e.total_settled::NUMERIC / 1e9 AS settled_sol,
  e.balance::NUMERIC / 1e9 AS remaining_sol,
  CASE WHEN e.total_deposited > 0
    THEN ROUND(e.total_settled::NUMERIC / e.total_deposited * 100, 2)
    ELSE 0
  END AS utilization_pct,
  e.total_calls_settled
FROM sap_escrows e
JOIN sap_agents a ON a.pda = e.agent
WHERE e.total_settled > 0
ORDER BY settled_sol DESC;

-- Agent activity heatmap (by hour of day)
SELECT
  agent_pda,
  EXTRACT(HOUR FROM block_time) AS hour_of_day,
  SUM(calls_settled) AS calls,
  SUM(amount_lamports) / 1e9 AS volume_sol
FROM sap_settlement_ledger
GROUP BY agent_pda, EXTRACT(HOUR FROM block_time)
ORDER BY agent_pda, hour_of_day;
```

### 9.2 Network Health Metrics

```sql
-- Protocol growth rate (week over week)
WITH weekly AS (
  SELECT
    DATE_TRUNC('week', block_time) AS week,
    SUM(amount_lamports) / 1e9 AS volume_sol,
    COUNT(*) AS settlements
  FROM sap_settlement_ledger
  GROUP BY DATE_TRUNC('week', block_time)
)
SELECT
  week,
  volume_sol,
  settlements,
  LAG(volume_sol) OVER (ORDER BY week) AS prev_week_vol,
  CASE WHEN LAG(volume_sol) OVER (ORDER BY week) > 0
    THEN ROUND((volume_sol / LAG(volume_sol) OVER (ORDER BY week) - 1) * 100, 1)
    ELSE NULL
  END AS growth_pct
FROM weekly
ORDER BY week DESC;

-- Agent churn (registered but inactive for 7+ days)
SELECT
  a.name, a.wallet, a.pda, a.reputation_score / 100.0 AS reputation,
  s.total_calls_served,
  a.updated_at
FROM sap_agents a
LEFT JOIN sap_agent_stats s ON s.agent = a.pda
WHERE a.is_active = true
  AND a.updated_at < NOW() - INTERVAL '7 days'
ORDER BY a.updated_at;

-- Escrow health (expiring soon)
SELECT
  e.pda, a.name AS agent, e.depositor,
  e.balance::NUMERIC / 1e9 AS balance_sol,
  e.expires_at,
  EXTRACT(EPOCH FROM (to_timestamp(e.expires_at) - NOW())) / 3600 AS hours_remaining
FROM sap_escrows e
JOIN sap_agents a ON a.pda = e.agent
WHERE e.expires_at > 0
  AND e.balance > 0
  AND to_timestamp(e.expires_at) < NOW() + INTERVAL '24 hours'
ORDER BY e.expires_at;
```

### 9.3 Consumer-Agent Relationship Graph

```sql
-- Build adjacency list for network graph (consumers <-> agents)
SELECT
  depositor AS consumer,
  agent_pda AS agent,
  SUM(amount_lamports) / 1e9 AS total_volume_sol,
  SUM(calls_settled) AS total_calls,
  COUNT(*) AS interactions,
  MIN(block_time) AS first_interaction,
  MAX(block_time) AS last_interaction
FROM sap_settlement_ledger
GROUP BY depositor, agent_pda
ORDER BY total_volume_sol DESC;
```

---

## 10. Explorer Page Recipes

### 10.1 Network Dashboard (`/`)

```typescript
// API route: /api/sap/dashboard
import { GLOBAL_REGISTRY_ADDRESS } from "@oobe-protocol-labs/synapse-sap-sdk/constants";

export async function GET() {
  const [global, protocolStats, recentEvents, topAgents] = await Promise.all([
    // 1. Global registry (singleton)
    program.account.globalRegistry.fetch(GLOBAL_REGISTRY_ADDRESS),

    // 2. Protocol volume (from materialized view)
    pg.query(`SELECT * FROM sap_protocol_stats`),

    // 3. Recent events (last 20)
    pg.getRecentEvents(20),

    // 4. Top agents by reputation
    pg.getActiveAgents(10),
  ]);

  return Response.json({
    network: {
      totalAgents: global.totalAgents.toString(),
      activeAgents: global.activeAgents.toString(),
      totalTools: global.totalTools,
      totalFeedbacks: global.totalFeedbacks.toString(),
      totalVaults: global.totalVaults,
      totalAttestations: global.totalAttestations,
      totalCapabilities: global.totalCapabilities,
      totalProtocols: global.totalProtocols,
    },
    volume: protocolStats.rows[0] ?? null,
    recentEvents,
    topAgents,
  });
}
```

### 10.2 Transaction Detail (`/tx/[signature]`)

```typescript
// API route: /api/sap/tx/[signature]
export async function GET(req, { params }) {
  const { signature } = params;

  // Fetch raw transaction
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) return Response.json({ error: "Not found" }, { status: 404 });

  // Full SAP decode
  const parsed = parseSapTransactionComplete(
    tx, program, SAP_PROGRAM_ADDRESS,
  );

  // Compute balance changes from pre/post balances
  const balanceChanges = tx.meta.preBalances.map((pre, i) => ({
    account: tx.transaction.message.accountKeys[i]?.toBase58(),
    pre,
    post: tx.meta.postBalances[i],
    change: tx.meta.postBalances[i] - pre,
  })).filter(b => b.change !== 0);

  return Response.json({
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    success: tx.meta.err === null,
    fee: tx.meta.fee,
    computeUnits: tx.meta.computeUnitsConsumed ?? null,

    // SAP-specific decoded data
    sapInstructions: parsed?.instructions.map(ix => ({
      name: ix.name,
      args: ix.args,
      accounts: ix.accounts.map(a => a.toBase58()),
    })) ?? [],

    sapEvents: parsed?.events.map(e => ({
      name: e.name,
      data: serializeEventData(e.data),
    })) ?? [],

    innerInstructions: parsed?.innerInstructions.map(inner => ({
      outerIndex: inner.outerIndex,
      name: inner.name,
      programId: inner.programId.toBase58(),
    })) ?? [],

    // Raw data
    logs: tx.meta.logMessages ?? [],
    balanceChanges,
    accountKeys: tx.transaction.message.accountKeys.map(k => k.toBase58()),
  });
}

function serializeEventData(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value?.toBase58) out[key] = value.toBase58();
    else if (value?.toString && typeof value !== "string") out[key] = value.toString();
    else if (Array.isArray(value) && value.length === 32 && typeof value[0] === "number")
      out[key] = Buffer.from(value).toString("hex");
    else out[key] = value;
  }
  return out;
}
```

### 10.3 Agent Revenue Chart (`/agents/[wallet]`)

```typescript
// API route: /api/sap/agents/[wallet]/revenue
export async function GET(req, { params }) {
  const { wallet } = params;
  const [agentPda] = deriveAgent(new PublicKey(wallet));

  const [daily, totals] = await Promise.all([
    pg.query(`
      SELECT DATE(block_time) AS day,
             SUM(amount_lamports)::NUMERIC / 1e9 AS sol,
             SUM(calls_settled)::NUMERIC AS calls
      FROM sap_settlement_ledger
      WHERE agent_pda = $1
      GROUP BY DATE(block_time)
      ORDER BY day
    `, [agentPda.toBase58()]),

    pg.query(`
      SELECT SUM(amount_lamports)::NUMERIC / 1e9 AS total_sol,
             SUM(calls_settled)::NUMERIC AS total_calls,
             COUNT(*) AS settlement_count,
             COUNT(DISTINCT depositor) AS unique_consumers
      FROM sap_settlement_ledger
      WHERE agent_pda = $1
    `, [agentPda.toBase58()]),
  ]);

  return Response.json({
    daily: daily.rows,
    totals: totals.rows[0],
  });
}
```

### 10.4 Live Event Feed (WebSocket endpoint)

```typescript
// For SSE (Server-Sent Events) from Next.js API route
export async function GET() {
  const encoder = new TextEncoder();
  const eventParser = new EventParser(program);

  const stream = new ReadableStream({
    start(controller) {
      const subId = connection.onLogs(
        new PublicKey(SAP_PROGRAM_ADDRESS),
        (logInfo, context) => {
          if (logInfo.err) return;

          const events = eventParser.parseLogs(logInfo.logs);
          for (const event of events) {
            const payload = JSON.stringify({
              name: event.name,
              data: serializeEventData(event.data),
              signature: logInfo.signature,
              slot: context.slot,
            });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        },
        "confirmed",
      );

      // Cleanup on disconnect
      return () => connection.removeOnLogsListener(subId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## 11. Performance Patterns

### 11.1 Rate Limiting and Pacing

```typescript
// Sequential fetch with pacing (for public RPC, 10 req/s)
async function fetchWithPacing<T>(
  items: string[],
  fetcher: (item: string) => Promise<T>,
  delayMs = 100,
): Promise<(T | null)[]> {
  const results: (T | null)[] = [];
  for (const item of items) {
    try {
      results.push(await fetcher(item));
    } catch {
      results.push(null);
    }
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

// Parallel fetch with concurrency limit (for dedicated RPC)
async function fetchParallel<T>(
  items: string[],
  fetcher: (item: string) => Promise<T>,
  concurrency = 10,
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(items.length).fill(null);
  let idx = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fetcher(items[i]);
      } catch {
        results[i] = null;
      }
    }
  });

  await Promise.all(workers);
  return results;
}
```

### 11.2 In-Memory Cache

```typescript
class ExplorerCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expires: Date.now() + ttlMs });
  }
}

// Usage
const cache = new ExplorerCache<any>();

async function getAgentProfile(wallet: string) {
  const cached = cache.get(`agent:${wallet}`);
  if (cached) return cached;

  const profile = await sap.discovery.getAgentProfile(new PublicKey(wallet));
  cache.set(`agent:${wallet}`, profile, 30_000); // 30s TTL
  return profile;
}
```

### 11.3 Inflight Deduplication

```typescript
const inflight = new Map<string, Promise<any>>();

async function dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// Prevents duplicate RPC calls for the same PDA
const agent = await dedupedFetch(`agent:${pda}`, () =>
  program.account.agentAccount.fetch(pda)
);
```

### 11.4 getProgramAccounts Optimization

```typescript
// Use memcmp filters to reduce data transfer
// The 8-byte Anchor discriminator is at offset 0
// The bump byte is at offset 8
// The first pubkey field (usually agent) starts at offset 9

// All tools for a specific agent
const tools = await program.account.toolDescriptor.all([
  { memcmp: { offset: 9, bytes: agentPda.toBase58() } }
]);

// All active agents (is_active = true at known offset)
// Note: offset depends on field ordering in the Rust struct
// For AgentAccount: discriminator(8) + bump(1) + version(1) + wallet(32)
//   + name length(4) + name(variable) -- this is variable-length
// BETTER: use dataSize filter + post-filter in JS
const allAgents = await program.account.agentAccount.all();
const active = allAgents.filter(a => a.account.isActive);
```

### 11.5 Materialized View Refresh (cron)

```sql
-- Refresh materialized views (run every 5 minutes via cron/pg_cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY sap_protocol_stats;
REFRESH MATERIALIZED VIEW CONCURRENTLY sap_daily_volume;
```

```typescript
// In your sync engine's periodic callback
async function refreshViews(pg: SapPostgres) {
  await pg.query("REFRESH MATERIALIZED VIEW CONCURRENTLY sap_protocol_stats");
  await pg.query("REFRESH MATERIALIZED VIEW CONCURRENTLY sap_daily_volume");
}
```

---

## Quick Reference: Import Paths

```typescript
// Core
import { SapClient, SapConnection } from "@oobe-protocol-labs/synapse-sap-sdk";
import { SAP_PROGRAM_ADDRESS, GLOBAL_REGISTRY_ADDRESS, LIMITS } from "@oobe-protocol-labs/synapse-sap-sdk/constants";

// PDA derivation (22 functions)
import { deriveAgent, deriveEscrow, deriveTool, ... } from "@oobe-protocol-labs/synapse-sap-sdk/pda";

// Parser
import {
  parseSapTransactionComplete,
  parseSapTransactionBatch,
  parseSapInstructionsFromTransaction,
  containsSapInstruction,
  TransactionParser,
} from "@oobe-protocol-labs/synapse-sap-sdk/parser";

// Events
import { EventParser, SAP_EVENT_NAMES } from "@oobe-protocol-labs/synapse-sap-sdk/events";

// PostgreSQL
import { SapPostgres, SapSyncEngine } from "@oobe-protocol-labs/synapse-sap-sdk/postgres";

// Registries
import { DiscoveryRegistry, X402Registry, SessionManager } from "@oobe-protocol-labs/synapse-sap-sdk/registries";

// Utils
import { sha256, classifyAnchorError } from "@oobe-protocol-labs/synapse-sap-sdk/utils";

// Types
import type {
  AgentAccountData, EscrowAccountData, ToolDescriptorData,
  FeedbackAccountData, GlobalRegistryData, AgentStatsData,
} from "@oobe-protocol-labs/synapse-sap-sdk/types";
```

---

## Quick Reference: Event-to-Page Mapping

| Event | Explorer Page | Display |
|-------|--------------|---------|
| `RegisteredEvent` | Dashboard, Agent List | New agent notification |
| `PaymentSettledEvent` | Escrow Detail, Dashboard, Agent Revenue | Settlement receipt |
| `BatchSettledEvent` | Escrow Detail, Dashboard, Agent Revenue | Batch settlement receipt |
| `EscrowCreatedEvent` | Escrow List, Agent Profile | New escrow |
| `EscrowDepositedEvent` | Escrow Detail | Deposit entry |
| `EscrowWithdrawnEvent` | Escrow Detail | Withdrawal entry |
| `FeedbackEvent` | Agent Profile, Reputation Board | New review |
| `ToolPublishedEvent` | Tool Registry, Agent Profile | New tool |
| `ToolSchemaInscribedEvent` | Tool Detail | JSON schema display |
| `AttestationCreatedEvent` | Attestation Map, Agent Profile | Trust link |
| `MemoryInscribedEvent` | Vault Explorer | Inscription (encrypted) |
| `LedgerEntryEvent` | Ledger Viewer | Ring buffer write |
| `LedgerSealedEvent` | Ledger Viewer | Permanent page created |

---

> **Version**: 0.6.2 | **Last updated**: 2026-03-30
> **Companion docs**: [EXPLORER_REFERENCE.md](./EXPLORER_REFERENCE.md) (full protocol spec), [SYNAPSE_EXPLORER_GUIDE.md](../../SYNAPSE_EXPLORER_GUIDE.md) (Italian guide)
