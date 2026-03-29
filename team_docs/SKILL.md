# SKILL.md — Synapse Agent Protocol v2 (SAP) SDK

> **Complete technical reference for building, deploying, and operating AI agents on Solana.**
>
> Package: `@oobe-protocol-labs/synapse-sap-sdk`
> Program ID: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
> Repository: [github.com/OOBE-PROTOCOL/synapse-sap-sdk](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk)

---

## Table of Contents

1. [What is SAP v2?](#1-what-is-sap-v2)
2. [Architecture Overview](#2-architecture-overview)
3. [Installation & Setup](#3-installation--setup)
4. [Quick Start](#4-quick-start)
5. [SDK Module Map](#5-sdk-module-map)
6. [Constants Reference](#6-constants-reference)
7. [Enum Reference](#7-enum-reference)
8. [PDA Derivation](#8-pda-derivation)
9. [Agent Lifecycle](#9-agent-lifecycle)
10. [Reputation & Feedback](#10-reputation--feedback)
11. [Tool Registry](#11-tool-registry)
12. [Memory System (Vault + Ledger)](#12-memory-system-vault--ledger)
13. [x402 Escrow Payments](#13-x402-escrow-payments)
14. [Attestations (Web of Trust)](#14-attestations-web-of-trust)
15. [Discovery & Indexing](#15-discovery--indexing)
16. [Plugin Adapter (52 Tools)](#16-plugin-adapter-52-tools)
17. [PostgreSQL Off-Chain Mirror](#17-postgresql-off-chain-mirror)
18. [Event System](#18-event-system)
19. [Error Hierarchy](#19-error-hierarchy)
20. [Integration with synapse-client-sdk](#20-integration-with-synapse-client-sdk)
21. [Best Practices & Patterns](#21-best-practices--patterns)
22. [Limits Reference](#22-limits-reference)
23. [Full Exports Map](#23-full-exports-map)
24. [Endpoint Discovery & Validation (v0.6.0)](#24-endpoint-discovery--validation-v060)
25. [Network Normalization (v0.6.0)](#25-network-normalization-v060)
26. [RPC Strategy & Dual Connections (v0.6.0)](#26-rpc-strategy--dual-connections-v060)
27. [Zod Runtime Schemas (v0.6.0)](#27-zod-runtime-schemas-v060)
28. [CLI Reference](#28-cli-reference)
29. [Troubleshooting & FAQ](#29-troubleshooting--faq)
30. [Account Data Structures](#30-account-data-structures)
31. [End-to-End Recipes](#31-end-to-end-recipes)
32. [Security Model](#32-security-model)

---

## 1. What is SAP v2?

**Synapse Agent Protocol** is an on-chain infrastructure layer for autonomous AI agents.
It provides:

- **Identity** — Deterministic PDAs for agent registration, metrics, and lifecycle.
- **Reputation** — Trustless feedback scores (0–1000), aggregated on-chain.
- **Memory** — Encrypted vaults, session ledgers, ring-buffer pages.
- **Payments** — x402-based escrow with volume discounts, batch settlement, SPL tokens.
- **Discovery** — On-chain capability/protocol/category indexes for agent search.
- **Attestations** — Web-of-trust between agents.
- **Tools** — On-chain tool registry with schemas, categories, and invocation tracking.

**The Solana program** is deployed at `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` on mainnet-beta and devnet. It contains **72 instructions**, **22 account types**, **45 events**, and **91 custom errors**.

---

## 2. Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                       @oobe-protocol-labs/synapse-sap-sdk  v0.6.0           │
├──────────┬──────────┬──────────┬───────────┬──────────────┬────────────────┤
│  core/   │ modules/ │registries│  plugin/  │   postgres/  │     cli/       │
│          │          │          │           │              │                │
│SapClient │ Agent    │Discovery │SAPPlugin  │SapPostgres   │ 10 cmd groups  │
│SapConn.  │ Feedback │X402Reg.  │52 tools   │SapSyncEngine │ 40+ subcommands│
│          │ Tools    │Session   │Zod schemas│22 tables     │ Plugin system  │
│          │ Vault    │Builder   │Protocols  │Event stream  │                │
│          │ Escrow   │          │           │              │                │
│          │ Attest.  │          │           │              │                │
│          │ Indexing │          │           │              │                │
│          │ Ledger   │          │           │              │                │
├──────────┴──────────┴──────────┴───────────┴──────────────┴────────────────┤
│  types/         │constants/│   pda/   │  events/  │  errors/  │   utils/   │
│                 │          │          │           │           │            │
│ accounts (22)   │programs  │ 17 fns   │EventParser│ 6 classes │ hash       │
│ common structs  │seeds (20)│          │ 45 events │           │ validation │
│ enums (5+Kind)  │limits    │          │           │           │*endpoint-  │
│ instructions    │network   │          │           │           │  validator │
│*endpoint types  │          │          │           │           │*network-   │
│                 │          │          │           │           │  normalizer│
│                 │          │          │           │           │*rpc-strategy│
│                 │          │          │           │           │*schemas    │
│                 │          │          │           │           │ serial.    │
└─────────────────┴──────────┴──────────┴───────────┴───────────┴────────────┘
            │                                                  │
            ▼                                                  ▼
     Anchor Program (Solana)                            PostgreSQL
     SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ       (off-chain)

  * = added in v0.6.0
```

### Directory structure (41 source files, 11 directories)

```
src/
├── index.ts                # Barrel exports (everything)
├── core/
│   ├── client.ts           # SapClient — main entry point
│   ├── connection.ts       # SapConnection — RPC factory
│   └── index.ts
├── modules/
│   ├── base.ts             # BaseModule abstract class
│   ├── agent.ts            # Agent lifecycle (register, update, close…)
│   ├── attestation.ts      # Web-of-trust attestations
│   ├── escrow.ts           # x402 escrow payments
│   ├── feedback.ts         # Reputation feedback
│   ├── indexing.ts         # Discovery indexes (capability, protocol, category)
│   ├── ledger.ts           # MemoryLedger (ring-buffer, sealed pages)
│   ├── tools.ts            # Tool registry (publish, schema, checkpoints)
│   ├── vault.ts            # Encrypted memory vault + sessions
│   └── index.ts
├── registries/
│   ├── discovery.ts        # Agent/tool search across the network
│   ├── x402.ts             # x402 payment lifecycle
│   ├── session.ts          # Unified memory session manager
│   ├── builder.ts          # Fluent AgentBuilder
│   └── index.ts
├── plugin/
│   ├── index.ts            # SAPPlugin / createSAPPlugin
│   ├── protocols.ts        # Protocol method definitions
│   └── schemas.ts          # Zod validation schemas
├── postgres/
│   ├── adapter.ts          # SapPostgres database adapter
│   ├── sync.ts             # SapSyncEngine (periodic + WebSocket)
│   ├── schema.sql          # Full DDL (22 tables, indexes, views)
│   ├── serializers.ts      # On-chain → SQL row serializers
│   ├── types.ts            # Row types, config, table map
│   └── index.ts
├── constants/
│   ├── programs.ts         # Program IDs per cluster
│   ├── seeds.ts            # PDA seed prefixes (20 seeds)
│   └── limits.ts           # Size limits, version constants, enum values
├── pda/
│   └── index.ts            # 17 derive*() functions
├── events/
│   └── index.ts            # EventParser + 45 event types
├── errors/
│   └── index.ts            # 6 error classes
├── types/
│   ├── accounts.ts         # 22 account data interfaces
│   ├── common.ts           # Shared structs (Capability, PricingTier…)
│   ├── enums.ts            # 5 enum types + Kind unions
│   ├── instructions.ts     # 11 instruction arg DTOs
│   └── index.ts
├── utils/
│   ├── hash.ts             # sha256, hashToArray
│   ├── validation.ts       # assert helper
│   ├── serialization.ts    # Account serialization
│   ├── endpoint-validator.ts # v0.6.0 — Endpoint reachability & SAP-compat checks
│   ├── network-normalizer.ts # v0.6.0 — Network ID normalization for x402 headers
│   ├── rpc-strategy.ts     # v0.6.0 — Dual-connection RPC, ATA helper, error classify
│   ├── schemas.ts          # v0.6.0 — Zod runtime validation schemas
│   └── index.ts
└── idl/
    ├── index.ts            # IDL re-exports
    └── synapse_agent_sap.json  # Embedded Anchor IDL
```

---

## 3. Installation & Setup

```bash
# npm
npm install @oobe-protocol-labs/synapse-sap-sdk

# yarn
yarn add @oobe-protocol-labs/synapse-sap-sdk

# Peer dependencies (required)
npm install @coral-xyz/anchor @solana/web3.js

# Optional peers
npm install pg    # PostgreSQL adapter
npm install zod   # Plugin schema validation
```

### Environment variables (`.env.example`)

```env
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_FALLBACK_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
WALLET_KEYPAIR_PATH=~/.config/solana/id.json
DATABASE_URL=postgresql://user:pass@localhost:5432/sap_db
LOG_LEVEL=info
X402_ENDPOINT=https://api.myagent.ai/.well-known/x402
AGENT_URI=https://api.myagent.ai
```

### OOBE RPC (recommended for mainnet)

```env
# Replace YOUR_KEY with your OOBE RPC API key
SOLANA_CLUSTER=mainnet-beta
SOLANA_RPC_URL=https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=sk_YOUR_KEY
SOLANA_FALLBACK_RPC_URL=https://api.mainnet-beta.solana.com
```

> **Why dual RPC?** Authenticated RPCs (OOBE, Helius, QuickNode) sometimes reject
> WebSocket connections for SPL token operations. Set `SOLANA_FALLBACK_RPC_URL`
> to a public endpoint so token ATA creation uses the fallback automatically.

---

## 4. Quick Start

### From Anchor Provider

```ts
import { AnchorProvider } from "@coral-xyz/anchor";
import { SapClient } from "@oobe-protocol-labs/synapse-sap-sdk";

const provider = AnchorProvider.env();
const client = SapClient.from(provider);

// Register an agent
await client.agent.register({
  name: "SwapBot",
  description: "AI-powered Jupiter swap agent",
  agentUri: "https://api.swapbot.ai",
  x402Endpoint: "https://api.swapbot.ai/.well-known/x402",
});
```

### From RPC URL + Keypair (synapse-client-sdk compatible)

```ts
import { SapConnection } from "@oobe-protocol-labs/synapse-sap-sdk";
import { Keypair } from "@solana/web3.js";
import fs from "fs";

const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("~/.config/solana/id.json", "utf-8")))
);

const conn = SapConnection.fromKeypair("https://api.devnet.solana.com", keypair);
// conn.client is now a fully configured SapClient
await conn.client.agent.register({ name: "MyAgent", description: "..." });
```

### With SapConnection factory

```ts
import { SapConnection } from "@oobe-protocol-labs/synapse-sap-sdk";

// Preset clusters
const devnet = SapConnection.devnet();
const mainnet = SapConnection.mainnet();

// Custom RPC
const custom = new SapConnection({
  rpcUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
  cluster: "mainnet-beta",
  commitment: "confirmed",
});
```

### With Dual Connection (v0.6.0)

```ts
import {
  createDualConnection,
  getRpcUrl,
  getFallbackRpcUrl,
  SapClient,
} from "@oobe-protocol-labs/synapse-sap-sdk";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";

// Dual-connection: primary (OOBE RPC) for SAP, fallback (public) for SPL tokens
const { primary, fallback } = createDualConnection({
  primaryUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
  // fallback auto-resolves to https://api.mainnet-beta.solana.com
}, "mainnet-beta");

// Use primary for the Anchor provider
const provider = new AnchorProvider(primary, wallet, { commitment: "confirmed" });
const client = SapClient.from(provider);

// Use fallback for SPL token operations
import { findATA } from "@oobe-protocol-labs/synapse-sap-sdk";
const ata = findATA(ownerPubkey, mintPubkey);
```

---

## 5. SDK Module Map

### Core

| Class | Import | Purpose |
|-------|--------|---------|
| `SapClient` | `@.../synapse-sap-sdk` | Root entry point, lazy module accessors |
| `SapConnection` | `@.../synapse-sap-sdk` | RPC factory, cluster presets |

### Modules (Low-level)

| Module | Accessor | Key Methods |
|--------|----------|-------------|
| `AgentModule` | `client.agent` | `register`, `update`, `deactivate`, `reactivate`, `close`, `reportCalls`, `updateReputation`, `fetch`, `fetchNullable` |
| `FeedbackModule` | `client.feedback` | `give`, `update`, `revoke`, `close`, `fetch`, `fetchNullable` |
| `ToolsModule` | `client.tools` | `publish`, `publishByName`, `inscribeSchema`, `update`, `deactivate`, `reactivate`, `close`, `reportInvocations`, `createCheckpoint`, `restoreCheckpoint` |
| `VaultModule` | `client.vault` | `initVault`, `openSession`, `inscribe`, `compactInscribe`, `closeSession`, `closeVault`, `addDelegate`, `revokeDelegate`, `inscribeDelegated`, `rotateNonce` |
| `EscrowModule` | `client.escrow` | `create`, `deposit`, `settle`, `withdraw`, `close`, `settleBatch` |
| `AttestationModule` | `client.attestation` | `create`, `revoke`, `close`, `fetch`, `fetchNullable` |
| `LedgerModule` | `client.ledger` | `init`, `write`, `seal`, `close`, `decodeRingBuffer`, `fetch`, `fetchNullable` |
| `IndexingModule` | `client.indexing` | `registerCapability`, `registerProtocol`, `registerToolCategory`, `removeCapability`, `removeProtocol`, `removeToolCategory` |

### Registries (High-level)

| Registry | Accessor | Purpose |
|----------|----------|---------|
| `DiscoveryRegistry` | `client.discovery` | `findAgentsByProtocol`, `findAgentsByCapability`, `getAgentProfile`, `getNetworkOverview`, `estimateCost` |
| `X402Registry` | `client.x402` | `preparePayment`, `buildPaymentHeaders`, `settle`, `settleAndWithdraw`, `getBalance` |
| `SessionManager` | `client.session` | `start`, `write`, `readLatest`, `seal`, `getStatus` |
| `AgentBuilder` | `client.builder` | Fluent `.agent()`, `.description()`, `.addCapability()`, `.addPricingTier()`, `.register()` |

### Plugin

| Export | Purpose |
|--------|---------|
| `createSAPPlugin(client)` | Returns a `SAPPlugin` with 52 tools for AI agent frameworks |
| `SAP_PROTOCOLS` | Protocol method definitions |

---

## 6. Constants Reference

All constants are importable from `@oobe-protocol-labs/synapse-sap-sdk/constants` or the root package.

### Program IDs

```ts
import {
  SAP_PROGRAM_ADDRESS,       // "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ"
  SAP_PROGRAM_ID,            // PublicKey (default — mainnet alias)
  MAINNET_SAP_PROGRAM_ID,    // PublicKey
  DEVNET_SAP_PROGRAM_ID,     // PublicKey
  LOCALNET_SAP_PROGRAM_ID,   // PublicKey
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

### PDA Seeds

```ts
import { SEEDS } from "@oobe-protocol-labs/synapse-sap-sdk";
```

| Key | Seed String | Account Type |
|-----|-------------|--------------|
| `SEEDS.GLOBAL` | `"sap_global"` | `GlobalRegistry` |
| `SEEDS.AGENT` | `"sap_agent"` | `AgentAccount` |
| `SEEDS.STATS` | `"sap_stats"` | `AgentStats` |
| `SEEDS.FEEDBACK` | `"sap_feedback"` | `FeedbackAccount` |
| `SEEDS.CAPABILITY_INDEX` | `"sap_cap_idx"` | `CapabilityIndex` |
| `SEEDS.PROTOCOL_INDEX` | `"sap_proto_idx"` | `ProtocolIndex` |
| `SEEDS.TOOL_CATEGORY` | `"sap_tool_cat"` | `ToolCategoryIndex` |
| `SEEDS.TOOL` | `"sap_tool"` | `ToolDescriptor` |
| `SEEDS.VAULT` | `"sap_vault"` | `MemoryVault` |
| `SEEDS.SESSION` | `"sap_session"` | `SessionLedger` |
| `SEEDS.EPOCH` | `"sap_epoch"` | `EpochPage` |
| `SEEDS.DELEGATE` | `"sap_delegate"` | `VaultDelegate` |
| `SEEDS.CHECKPOINT` | `"sap_checkpoint"` | `SessionCheckpoint` |
| `SEEDS.MEMORY` | `"sap_memory"` | `MemoryEntry` |
| `SEEDS.MEMORY_CHUNK` | `"sap_mem_chunk"` | `MemoryChunk` |
| `SEEDS.PLUGIN` | `"sap_plugin"` | `PluginSlot` |
| `SEEDS.ESCROW` | `"sap_escrow"` | `EscrowAccount` |
| `SEEDS.ATTESTATION` | `"sap_attest"` | `AgentAttestation` |
| `SEEDS.LEDGER` | `"sap_ledger"` | `MemoryLedger` |
| `SEEDS.LEDGER_PAGE` | `"sap_page"` | `LedgerPage` |

### Size Limits

```ts
import { LIMITS } from "@oobe-protocol-labs/synapse-sap-sdk";
```

| Constant | Value | Description |
|----------|-------|-------------|
| `LIMITS.MAX_NAME_LEN` | `64` | Max agent name bytes |
| `LIMITS.MAX_DESC_LEN` | `256` | Max description bytes |
| `LIMITS.MAX_URI_LEN` | `256` | Max URI bytes (agentUri, x402Endpoint) |
| `LIMITS.MAX_AGENT_ID_LEN` | `128` | Max DID-style identifier bytes |
| `LIMITS.MAX_CAPABILITIES` | `10` | Max capabilities per agent |
| `LIMITS.MAX_PRICING_TIERS` | `5` | Max pricing tiers per agent |
| `LIMITS.MAX_PROTOCOLS` | `5` | Max protocol strings per agent |
| `LIMITS.MAX_PLUGINS` | `5` | Max active plugins per agent |
| `LIMITS.MAX_VOLUME_CURVE_POINTS` | `5` | Max volume curve breakpoints |
| `LIMITS.MAX_TAG_LEN` | `32` | Max feedback tag bytes |
| `LIMITS.MAX_AGENTS_PER_INDEX` | `100` | Max agents in a discovery index |
| `LIMITS.MAX_TOOL_NAME_LEN` | `32` | Max tool name bytes |
| `LIMITS.MAX_TOOLS_PER_CATEGORY` | `100` | Max tools in a category index |
| `LIMITS.MAX_ATTESTATION_TYPE_LEN` | `32` | Max attestation type bytes |
| `LIMITS.MAX_INSCRIPTION_SIZE` | `750` | Max encrypted data per inscription |
| `LIMITS.INSCRIPTIONS_PER_EPOCH` | `1000` | Max inscriptions per epoch page |
| `LIMITS.RING_CAPACITY` | `4096` | Ring buffer capacity (MemoryLedger) |
| `LIMITS.MAX_LEDGER_WRITE_SIZE` | `750` | Max ledger write per call |
| `LIMITS.MAX_BATCH_SETTLEMENTS` | `10` | Max settlements in a batch |
| `LIMITS.MAX_FEEDBACK_SCORE` | `1000` | Feedback score range: 0–1000 |

### Protocol Versions

```ts
import { AGENT_VERSION, VAULT_PROTOCOL_VERSION } from "@oobe-protocol-labs/synapse-sap-sdk";

AGENT_VERSION;            // 1
VAULT_PROTOCOL_VERSION;   // 1
```

### Network Identifiers (v0.6.0)

```ts
import { SapNetwork } from "@oobe-protocol-labs/synapse-sap-sdk";
import type { SapNetworkId } from "@oobe-protocol-labs/synapse-sap-sdk";
```

| Constant | Value | Accepted by |
|----------|-------|-------------|
| `SapNetwork.SOLANA_MAINNET` | `"solana:mainnet-beta"` | Coinbase, Phantom |
| `SapNetwork.SOLANA_MAINNET_GENESIS` | `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` | Kamiyo, Helius x402 |
| `SapNetwork.SOLANA_DEVNET` | `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` | Devnet providers |
| `SapNetwork.SOLANA_DEVNET_NAMED` | `"solana:devnet"` | Local / test flows |

x402 providers require the `X-Payment-Network` header to match their canonical format.
Some accept the cluster name, others the genesis-hash form. Use `SapNetwork` to select
the right format, or pass any custom string where needed.

```ts
// Example: build x402 headers with the correct network for Kamiyo
const ctx = await client.x402.preparePayment(agentWallet, {
  pricePerCall: 1000,
  deposit: 100_000,
  networkIdentifier: SapNetwork.SOLANA_MAINNET_GENESIS,
});
```

> **Tip**: If you don't know which format a provider expects, use the
> `normalizeNetworkId()` utility (§25) to canonicalize at both ends.

### Numeric Enum Maps

```ts
import { TOOL_CATEGORY_VALUES, HTTP_METHOD_VALUES } from "@oobe-protocol-labs/synapse-sap-sdk";

TOOL_CATEGORY_VALUES.Swap;     // 0
TOOL_CATEGORY_VALUES.Lend;     // 1
TOOL_CATEGORY_VALUES.Custom;   // 9

HTTP_METHOD_VALUES.Get;        // 0
HTTP_METHOD_VALUES.Post;       // 1
HTTP_METHOD_VALUES.Compound;   // 4
```

---

## 7. Enum Reference

All enums follow Anchor's variant-object pattern: `{ variantName: {} }`.

```ts
import {
  TokenType,
  PluginType,
  SettlementMode,
  ToolHttpMethod,
  ToolCategory,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

### TokenType

| Variant | Value | Description |
|---------|-------|-------------|
| `TokenType.Sol` | `{ sol: {} }` | Native SOL |
| `TokenType.Usdc` | `{ usdc: {} }` | USDC stablecoin |
| `TokenType.Spl` | `{ spl: {} }` | Arbitrary SPL token (requires `tokenMint`) |

### SettlementMode

| Variant | Value | Description |
|---------|-------|-------------|
| `SettlementMode.Instant` | `{ instant: {} }` | Pay-per-call, settled immediately |
| `SettlementMode.Escrow` | `{ escrow: {} }` | Pre-funded escrow drawdown |
| `SettlementMode.Batched` | `{ batched: {} }` | Aggregated at intervals |
| `SettlementMode.X402` | `{ x402: {} }` | HTTP 402-based micropayments |

### ToolHttpMethod

| Variant | Value | Description |
|---------|-------|-------------|
| `ToolHttpMethod.Get` | `{ get: {} }` | GET request |
| `ToolHttpMethod.Post` | `{ post: {} }` | POST request |
| `ToolHttpMethod.Put` | `{ put: {} }` | PUT request |
| `ToolHttpMethod.Delete` | `{ delete: {} }` | DELETE request |
| `ToolHttpMethod.Compound` | `{ compound: {} }` | Multi-step operation |

### ToolCategory

| Variant | Value | Description |
|---------|-------|-------------|
| `ToolCategory.Swap` | `{ swap: {} }` | Token swap / DEX |
| `ToolCategory.Lend` | `{ lend: {} }` | Lending protocols |
| `ToolCategory.Stake` | `{ stake: {} }` | Staking / validators |
| `ToolCategory.Nft` | `{ nft: {} }` | NFT operations |
| `ToolCategory.Payment` | `{ payment: {} }` | Payment & invoicing |
| `ToolCategory.Data` | `{ data: {} }` | Data feeds / oracles |
| `ToolCategory.Governance` | `{ governance: {} }` | DAO operations |
| `ToolCategory.Bridge` | `{ bridge: {} }` | Cross-chain bridges |
| `ToolCategory.Analytics` | `{ analytics: {} }` | On-chain analytics |
| `ToolCategory.Custom` | `{ custom: {} }` | User-defined |

### PluginType

| Variant | Value | Description |
|---------|-------|-------------|
| `PluginType.Memory` | `{ memory: {} }` | Encrypted memory/vault |
| `PluginType.Validation` | `{ validation: {} }` | Custom validation |
| `PluginType.Delegation` | `{ delegation: {} }` | Hot-wallet delegation |
| `PluginType.Analytics` | `{ analytics: {} }` | Metrics & analytics |
| `PluginType.Governance` | `{ governance: {} }` | DAO participation |
| `PluginType.Custom` | `{ custom: {} }` | User-defined |

---

## 8. PDA Derivation

All 17 derive functions return `[PublicKey, bump]` and require no network calls.

```ts
import {
  deriveGlobalRegistry,
  deriveAgent,
  deriveAgentStats,
  deriveFeedback,
  deriveCapabilityIndex,
  deriveProtocolIndex,
  deriveToolCategoryIndex,
  deriveVault,
  deriveSession,
  deriveEpochPage,
  deriveVaultDelegate,
  deriveCheckpoint,
  deriveTool,
  deriveEscrow,
  deriveAttestation,
  deriveLedger,
  deriveLedgerPage,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

### Derivation Seeds

| Function | Seeds | Example |
|----------|-------|---------|
| `deriveGlobalRegistry()` | `["sap_global"]` | `deriveGlobalRegistry()` |
| `deriveAgent(wallet)` | `["sap_agent", wallet]` | `deriveAgent(walletPubkey)` |
| `deriveAgentStats(agent)` | `["sap_stats", agentPda]` | `deriveAgentStats(agentPda)` |
| `deriveFeedback(agent, reviewer)` | `["sap_feedback", agent, reviewer]` | `deriveFeedback(agentPda, reviewerWallet)` |
| `deriveCapabilityIndex(hash)` | `["sap_cap_idx", hash]` | `deriveCapabilityIndex(sha256Hash)` |
| `deriveProtocolIndex(hash)` | `["sap_proto_idx", hash]` | `deriveProtocolIndex(sha256Hash)` |
| `deriveToolCategoryIndex(category)` | `["sap_tool_cat", category]` | `deriveToolCategoryIndex(categoryByte)` |
| `deriveVault(agent, nonce)` | `["sap_vault", agent, nonce]` | `deriveVault(agentPda, 0)` |
| `deriveSession(vault, sessionId)` | `["sap_session", vault, sessionId]` | `deriveSession(vaultPda, "conv-123")` |
| `deriveEpochPage(session, epoch)` | `["sap_epoch", session, epoch]` | `deriveEpochPage(sessionPda, 0)` |
| `deriveVaultDelegate(vault, delegate)` | `["sap_delegate", vault, delegate]` | `deriveVaultDelegate(vaultPda, delegateWallet)` |
| `deriveCheckpoint(session, tag)` | `["sap_checkpoint", session, tag]` | `deriveCheckpoint(sessionPda, "v1")` |
| `deriveTool(agent, toolName)` | `["sap_tool", agent, toolName]` | `deriveTool(agentPda, "jupiter-swap")` |
| `deriveEscrow(agent, depositor)` | `["sap_escrow", agent, depositor]` | `deriveEscrow(agentPda, depositorWallet)` |
| `deriveAttestation(attester, subject)` | `["sap_attest", attester, subject]` | `deriveAttestation(attesterPda, subjectPda)` |
| `deriveLedger(session)` | `["sap_ledger", session]` | `deriveLedger(sessionPda)` |
| `deriveLedgerPage(ledger, page)` | `["sap_page", ledger, page]` | `deriveLedgerPage(ledgerPda, 0)` |

---

## 9. Agent Lifecycle

### Register

```ts
await client.agent.register({
  name: "SwapBot",
  description: "AI-powered Jupiter swap agent",
  agentId: "did:sap:SwapBot",
  agentUri: "https://api.swapbot.ai",
  x402Endpoint: "https://api.swapbot.ai/.well-known/x402",
  capabilities: [
    { name: "jupiter:swap", version: 1, metadata: '{"dex":"jupiter"}' },
    { name: "raydium:pool", version: 1, metadata: "" },
  ],
  pricing: [
    {
      tierId: "standard",
      pricePerCall: new BN(1_000_000),    // 0.001 SOL
      tokenType: TokenType.Sol,
      settlementMode: SettlementMode.Escrow,
      rateLimit: 60,
      maxCallsPerEpoch: new BN(10_000),
    },
  ],
  protocols: ["jupiter", "raydium"],
});
```

### Fluent Builder

```ts
await client.builder
  .agent("SwapBot")
  .description("AI-powered swap agent")
  .agentUri("https://api.swapbot.ai")
  .x402Endpoint("https://api.swapbot.ai/.well-known/x402")
  .addCapability("jupiter:swap", { protocol: "jupiter" })
  .addCapability("raydium:pool", { protocol: "raydium" })
  .addPricingTier({
    tierId: "standard",
    pricePerCall: 1_000_000,
    rateLimit: 60,
  })
  .register();
```

### Update

```ts
await client.agent.update({
  name: "SwapBot v2",
  description: "Upgraded swap agent with multi-dex support",
});
```

### Deactivate / Reactivate / Close

```ts
await client.agent.deactivate();
await client.agent.reactivate();
await client.agent.close();  // Reclaims rent
```

### Fetch Agent Data

```ts
const [agentPda] = deriveAgent(walletPubkey);
const data = await client.agent.fetch(agentPda);
// data: AgentAccountData — name, description, reputationScore, isActive, etc.
```

---

## 10. Reputation & Feedback

```ts
import { deriveFeedback } from "@oobe-protocol-labs/synapse-sap-sdk";

// Give feedback (0–1000 score)
await client.feedback.give({
  agent: agentPda,
  score: 850,
  tag: "swap-quality",
});

// Update existing feedback
await client.feedback.update({
  agent: agentPda,
  score: 920,
  tag: "swap-quality-v2",
});

// Fetch feedback
const [feedbackPda] = deriveFeedback(agentPda, reviewerWallet);
const fb = await client.feedback.fetch(feedbackPda);
// fb: { score: 920, tag: "swap-quality-v2", reviewer, agent, ... }

// Revoke & close
await client.feedback.revoke({ agent: agentPda });
await client.feedback.close({ agent: agentPda });
```

---

## 11. Tool Registry

### Publish a Tool

```ts
await client.tools.publish({
  agent: agentPda,
  toolName: "jupiter-swap",
  httpMethod: ToolHttpMethod.Post,
  category: ToolCategory.Swap,
  paramsCount: 3,
  requiredParams: 2,
  isCompound: false,
});
```

### Publish by Name (auto-derives PDA)

```ts
await client.tools.publishByName(agentPda, "raydium-pool", {
  httpMethod: ToolHttpMethod.Post,
  category: ToolCategory.Swap,
  paramsCount: 4,
  requiredParams: 2,
});
```

### Inscribe Schema (attach JSON Schema)

```ts
const schema = JSON.stringify({
  type: "object",
  properties: {
    inputMint: { type: "string" },
    outputMint: { type: "string" },
    amount: { type: "number" },
  },
  required: ["inputMint", "outputMint", "amount"],
});

await client.tools.inscribeSchema({
  agent: agentPda,
  toolName: "jupiter-swap",
  schemaData: Buffer.from(schema),
  schemaType: SchemaType.Json,
  compressionType: CompressionType.None,
});
```

### Checkpoints

```ts
// Save current state
await client.tools.createCheckpoint(sessionPda, "v1");

// Restore to checkpoint
await client.tools.restoreCheckpoint(sessionPda, "v1");
```

---

## 12. Memory System (Vault + Ledger)

### Vault Flow (encrypted, session-based)

```ts
// 1. Initialize vault
await client.vault.initVault(0); // nonce = 0

// 2. Open session
const [vaultPda] = deriveVault(agentPda, 0);
await client.vault.openSession(vaultPda, "conversation-123");

// 3. Inscribe encrypted data
const [sessionPda] = deriveSession(vaultPda, "conversation-123");
await client.vault.inscribe(sessionPda, encryptedData, contentHash);

// 4. Compact inscribe (with accounts)
await client.vault.compactInscribe(sessionPda, encryptedData, contentHash);

// 5. Close session & vault
await client.vault.closeSession(sessionPda);
await client.vault.closeVault(vaultPda);
```

### Delegation

```ts
// Grant delegate access
await client.vault.addDelegate(vaultPda, delegateWallet, permissions);

// Inscribe as delegate
await client.vault.inscribeDelegated(sessionPda, encryptedData, contentHash);

// Revoke
await client.vault.revokeDelegate(vaultPda, delegateWallet);
```

### Ledger Flow (ring-buffer, unified)

```ts
// 1. Init ledger
const [sessionPda] = deriveSession(vaultPda, "conversation-123");
await client.ledger.init(sessionPda);

// 2. Write data
await client.ledger.write(sessionPda, data, contentHash);

// 3. Seal page (freeze current page)
const [ledgerPda] = deriveLedger(sessionPda);
await client.ledger.seal(ledgerPda, 0);

// 4. Read ring buffer
const entries = await client.ledger.decodeRingBuffer(ledgerPda);
// entries: { data, contentHash, timestamp, slot }[]
```

### Session Manager (high-level)

```ts
// Start a session (auto-creates vault + session + ledger)
const ctx = await client.session.start("conversation-123");

// Write data
await client.session.write(ctx, "Hello from agent");

// Read latest entries
const messages = await client.session.readLatest(ctx);

// Seal the session
await client.session.seal(ctx);

// Check status
const status = await client.session.getStatus(ctx);
```

---

## 13. x402 Escrow Payments

### Create Escrow

```ts
await client.escrow.create(agentWallet, {
  pricePerCall: new BN(1_000_000),     // 0.001 SOL
  maxCalls: new BN(1_000),
  expiresAt: new BN(Date.now() / 1000 + 86400), // 24h
  tokenMint: null,                      // SOL
  tokenDecimals: 9,
  volumeCurve: [
    { afterCalls: 100, pricePerCall: new BN(800_000) },
    { afterCalls: 500, pricePerCall: new BN(600_000) },
  ],
});
```

### Deposit

```ts
await client.escrow.deposit(agentPda, depositorWallet, new BN(100_000_000)); // 0.1 SOL
```

### Settle

```ts
await client.escrow.settle(depositorWallet, 5, serviceDataHash);
// Settles 5 calls worth of payment from escrow to agent
```

### Batch Settlement

```ts
await client.escrow.settleBatch([
  { depositor: wallet1, callCount: 3, serviceData: hash1 },
  { depositor: wallet2, callCount: 7, serviceData: hash2 },
]);
```

### x402 Flow (high-level)

```ts
// Consumer side
const ctx = await client.x402.preparePayment(agentWallet, {
  callCount: 10,
  tokenType: TokenType.Sol,
});

// Build HTTP headers for the API call
const headers = client.x402.buildPaymentHeaders(ctx);

// Agent side — settle after service delivery
const receipt = await client.x402.settle(depositorWallet, 1, serviceData);

// Check balance
const balance = await client.x402.getBalance(agentPda, depositorWallet);
```

---

## 14. Attestations (Web of Trust)

```ts
import { deriveAttestation } from "@oobe-protocol-labs/synapse-sap-sdk";

// Create attestation (agent → agent)
await client.attestation.create({
  subject: subjectAgentPda,
  attestationType: "capability-verified",
  data: Buffer.from(JSON.stringify({ capability: "jupiter:swap", verified: true })),
});

// Revoke
await client.attestation.revoke(subjectAgentPda);

// Fetch
const [attestPda] = deriveAttestation(attesterPda, subjectPda);
const att = await client.attestation.fetch(attestPda);
// att: { attester, subject, attestationType, data, isRevoked, ... }
```

---

## 15. Discovery & Indexing

### Register to Indexes

```ts
// Register agent capability for discovery
await client.indexing.registerCapability(agentPda, "jupiter:swap");

// Register protocol
await client.indexing.registerProtocol(agentPda, "jupiter");

// Register tool category
await client.indexing.registerToolCategory(toolPda, ToolCategory.Swap);
```

### Discover Agents

```ts
// Find agents by protocol
const agents = await client.discovery.findAgentsByProtocol("jupiter");
// agents: DiscoveredAgent[]

// Find by capability
const swappers = await client.discovery.findAgentsByCapability("jupiter:swap");

// Get full profile
const profile = await client.discovery.getAgentProfile(walletPubkey);
// profile: { agent, stats, tools, feedbacks, attestations, ... }

// Get network overview
const overview = await client.discovery.getNetworkOverview();
// overview: { totalAgents, activeAgents, totalTools, totalFeedbacks, ... }

// Estimate cost
const cost = await client.discovery.estimateCost(agentPda, 100);
// cost: { totalCost, pricePerCall, tier, volumeDiscount }
```

---

## 16. Plugin Adapter (52 Tools)

The plugin adapter wraps the entire SDK into 52 tool functions compatible with AI agent frameworks (LangChain, Vercel AI, etc.).

```ts
import { createSAPPlugin } from "@oobe-protocol-labs/synapse-sap-sdk/plugin";

const plugin = createSAPPlugin(client);

// plugin.tools — array of 52 tool definitions
// plugin.meta  — { name, version, description }

// Each tool has:
// - name: string
// - description: string
// - schema: ZodSchema (input validation)
// - execute(input): Promise<result>

// Example: use with LangChain
const tools = plugin.tools.map(t => new DynamicTool({
  name: t.name,
  description: t.description,
  func: async (input) => JSON.stringify(await t.execute(JSON.parse(input))),
}));
```

### Tool Categories (52 total)

- **Agent** (7): register, update, deactivate, reactivate, close, fetch, reportCalls
- **Feedback** (5): give, update, revoke, close, fetch
- **Tools** (8): publish, inscribeSchema, update, deactivate, reactivate, close, reportInvocations, createCheckpoint
- **Vault** (9): initVault, openSession, inscribe, compactInscribe, closeSession, closeVault, addDelegate, revokeDelegate, inscribeDelegated
- **Escrow** (6): create, deposit, settle, withdraw, close, settleBatch
- **Attestation** (4): create, revoke, close, fetch
- **Ledger** (5): init, write, seal, close, decodeRingBuffer
- **Indexing** (4): registerCapability, registerProtocol, registerToolCategory, removeCapability
- **Discovery** (4): findByProtocol, findByCapability, getProfile, getOverview

---

## 17. PostgreSQL Off-Chain Mirror

Mirror all 22 on-chain account types to PostgreSQL for off-chain querying, analytics, and dashboards.

### Setup

```ts
import { SapPostgres, SapSyncEngine } from "@oobe-protocol-labs/synapse-sap-sdk/postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = new SapPostgres(pool, client);

// Run DDL migrations (idempotent)
await pg.migrate();
```

### One-Shot Sync

```ts
const result = await pg.syncAll({
  onProgress: (step, total, type) => {
    console.log(`[${step}/${total}] Syncing ${type}...`);
  },
});
// result: { agents: 42, tools: 85, escrows: 120, ..., totalRecords: 1234, durationMs: 4500 }
```

### Periodic Sync (cron-style)

```ts
const sync = new SapSyncEngine(pg, client);

// Sync every 60 seconds
sync.start(60_000);

// Check status
sync.isRunning();  // true

// Stop
await sync.stop();
```

### Real-time Event Streaming

```ts
// Subscribe to SAP program logs via WebSocket
await sync.startEventStream();

// Events are inserted into sap_events table in real-time
// Stop streaming
await sync.stopEventStream();
```

### Query Helpers

```ts
// Fetch agent by PDA or wallet
const agent = await pg.getAgent("7xKXtg2CW87d97TXJSDpbD...");

// Active agents sorted by reputation
const top = await pg.getActiveAgents(50);

// Escrow balance
const balance = await pg.getEscrowBalance(agentPda, depositorWallet);

// Agent tools
const tools = await pg.getAgentTools(agentPda);

// Recent events
const events = await pg.getRecentEvents(100, "PaymentSettledEvent");

// Sync status per account type
const cursors = await pg.getSyncStatus();

// Raw SQL
const { rows } = await pg.query(
  "SELECT * FROM sap_agents WHERE reputation_score > $1 ORDER BY total_calls_served DESC",
  [800]
);
```

### Database Schema (22 tables)

| Table | Source Account | Key Columns |
|-------|---------------|-------------|
| `sap_global_registry` | `GlobalRegistry` | authority, total_agents, active_agents |
| `sap_agents` | `AgentAccount` | wallet, name, is_active, reputation_score, capabilities (JSONB) |
| `sap_agent_stats` | `AgentStats` | agent, total_calls, avg_latency, uptime |
| `sap_feedbacks` | `FeedbackAccount` | agent, reviewer, score (0–1000), tag |
| `sap_tools` | `ToolDescriptor` | agent, tool_name, http_method, category |
| `sap_escrows` | `EscrowAccount` | agent, depositor, balance, volume_curve (JSONB) |
| `sap_attestations` | `AgentAttestation` | attester, subject, attestation_type, is_revoked |
| `sap_memory_vaults` | `MemoryVault` | agent, nonce, protocol_version |
| `sap_sessions` | `SessionLedger` | vault, session_id, total_inscriptions |
| `sap_epoch_pages` | `EpochPage` | session, epoch_number, inscriptions_count |
| `sap_vault_delegates` | `VaultDelegate` | vault, delegate, permissions |
| `sap_checkpoints` | `SessionCheckpoint` | session, tag, data_hash |
| `sap_memory_ledgers` | `MemoryLedger` | session, num_entries, total_data_size |
| `sap_ledger_pages` | `LedgerPage` | ledger, page_number, is_sealed |
| `sap_capability_indexes` | `CapabilityIndex` | capability_hash, agents (TEXT[]) |
| `sap_protocol_indexes` | `ProtocolIndex` | protocol_hash, agents (TEXT[]) |
| `sap_tool_category_indexes` | `ToolCategoryIndex` | category, tools (TEXT[]) |
| `sap_plugin_slots` | `PluginSlot` | agent, plugin_type, pda |
| `sap_memory_entries` | `MemoryEntry` | vault, session, encrypted_data (BYTEA) |
| `sap_memory_chunks` | `MemoryChunk` | entry, chunk_index, data (BYTEA) |
| `sap_memory_buffers` | `MemoryBuffer` | vault, data (BYTEA) |
| `sap_memory_digests` | `MemoryDigest` | vault, digest_hash |
| `sap_events` | _(event log)_ | event_name, tx_signature, slot, data (JSONB) |
| `sap_sync_cursors` | _(sync tracking)_ | account_type, last_slot, last_signature |

### Views

- `sap_active_agents` — Active agents with reputation > 0
- `sap_escrow_balances` — Escrow balances joined with agent info
- `sap_agent_tools` — Tools joined with owning agent

---

## 18. Event System

### Parse Events from Transaction Logs

```ts
import { EventParser, SAP_EVENT_NAMES } from "@oobe-protocol-labs/synapse-sap-sdk";

const parser = client.events;

// Parse logs from a confirmed transaction
const events = parser.parseLogs(txLogs);

// Filter by name
const settled = parser.filterByName(events, "PaymentSettledEvent");

for (const event of settled) {
  console.log(event.data); // { agent, depositor, amount, callCount, ... }
}
```

### Event Names (45 total)

Key events include:
- `RegisteredEvent` — Agent registered
- `UpdatedEvent` — Agent updated
- `DeactivatedEvent` — Agent deactivated
- `FeedbackGivenEvent` — Feedback submitted
- `ToolPublishedEvent` — Tool published
- `MemoryInscribedEvent` — Data inscribed to vault
- `PaymentSettledEvent` — Escrow payment settled
- `EscrowCreatedEvent` — Escrow account created
- `AttestationCreatedEvent` — Attestation issued
- `LedgerEntryEvent` — Ledger write completed
- `DelegateAddedEvent` — Vault delegate granted
- `SessionOpenedEvent` — Memory session started
- `CheckpointCreatedEvent` — Session checkpoint saved

---

## 19. Error Hierarchy

```ts
import {
  SapError,                  // Base class
  SapValidationError,        // Client-side validation failure
  SapRpcError,               // RPC / network error
  SapAccountNotFoundError,   // Account not found on-chain
  SapTimeoutError,           // Transaction timeout
  SapPermissionError,        // Unauthorized operation
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

```
SapError (base)
├── SapValidationError       — Input validation failed
├── SapRpcError              — Network/RPC failure (includes status code)
├── SapAccountNotFoundError  — PDA account does not exist
├── SapTimeoutError          — Transaction confirmation timeout
└── SapPermissionError       — Signer lacks authority
```

The on-chain program defines 91 custom errors (e.g., `AgentNotActive`, `EscrowInsufficientBalance`, `MaxCapabilitiesReached`, etc.) which are surfaced through `SapRpcError.logs`.

### Error Classification (v0.6.0)

```ts
import {
  classifyAnchorError,
  extractAnchorErrorCode,
} from "@oobe-protocol-labs/synapse-sap-sdk";

try {
  await client.escrow.create(agentWallet, { ... });
} catch (err) {
  const code = extractAnchorErrorCode(err);
  if (code !== null) {
    // Returns a human-readable, actionable message
    console.error(classifyAnchorError(code));
    // e.g. "Escrow expired" or "Insufficient escrow balance"
  }
}
```

### Known Error Codes (partial)

| Code | Message |
|------|---------|
| `6000` | Agent already registered for this wallet |
| `6001` | Agent not found — register first |
| `6002` | Name exceeds maximum length (64 bytes) |
| `6003` | Description exceeds maximum length (256 bytes) |
| `6004` | Too many capabilities (max 10) |
| `6005` | Too many pricing tiers (max 5) |
| `6006` | Too many protocols (max 5) |
| `6007` | Feedback score out of range (0-1000) |
| `6008` | Unauthorized — only the agent owner can perform this action |
| `6009` | Escrow expired |
| `6010` | Insufficient escrow balance |
| `6011` | Max calls exceeded |
| `6012` | Invalid settlement — calls must be > 0 |
| `6013` | Escrow not empty — withdraw balance before closing |
| `6014` | Invalid token program |
| `6015` | Vault already initialized |
| `6016` | Session already exists |
| `6017` | Session closed — cannot write to closed session |
| `6018` | Data exceeds maximum write size (750 bytes) |
| `6019` | Ring buffer overflow — seal before writing more |

---

## 20. Integration with synapse-client-sdk

The `@oobe-protocol-labs/synapse-sap-sdk` is designed to work seamlessly alongside `synapse-client-sdk` — the general-purpose Solana client toolkit from OOBE Protocol.

### Shared Connection Pattern

```ts
import { SapConnection } from "@oobe-protocol-labs/synapse-sap-sdk";

// Both SDKs can share the same RPC connection
const conn = new SapConnection({
  rpcUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
  cluster: "mainnet-beta",
  commitment: "confirmed",
});

// Create SAP client from the connection
const sapClient = conn.createClient(wallet);

// The underlying provider/connection can be shared with synapse-client-sdk
const provider = conn.provider;
```

### Using Together

```ts
// synapse-client-sdk handles general Solana operations
// synapse-sap-sdk handles SAP-specific protocol operations

// 1. Use synapse-client-sdk for wallet/connection management
// 2. Pass the provider to SapClient for protocol operations

import { SapClient } from "@oobe-protocol-labs/synapse-sap-sdk";

// Reuse the same Anchor provider from synapse-client-sdk 
const sapClient = SapClient.from(provider);

// Now you have full SAP v2 access
await sapClient.agent.register({ name: "MyAgent", description: "..." });
await sapClient.escrow.create(agentWallet, { ... });
await sapClient.session.start("conv-123");
```

### Complementary Flow

```
synapse-client-sdk               synapse-sap-sdk
──────────────────                ───────────────
Connection management    ──►     SapClient.from(provider)
Wallet / keypair         ──►     Agent registration
Transaction helpers      ──►     Escrow payments
RPC utilities            ──►     Memory vault operations
                                 Tool registry
                                 Discovery & indexing
                                 PostgreSQL sync
```

---

## 21. Best Practices & Patterns

### 1. Always Validate Before Sending

```ts
import { LIMITS } from "@oobe-protocol-labs/synapse-sap-sdk";

// Client-side validation prevents wasted transactions
if (name.length > LIMITS.MAX_NAME_LEN) throw new Error("Name too long");
if (capabilities.length > LIMITS.MAX_CAPABILITIES) throw new Error("Too many capabilities");
if (score > LIMITS.MAX_FEEDBACK_SCORE) throw new Error("Score out of range");
```

### 2. Use PDA Derivation (Not Hardcoded Addresses)

```ts
// ✅ Correct — deterministic, portable
const [agentPda] = deriveAgent(walletPubkey);
const [escrowPda] = deriveEscrow(agentPda, depositorWallet);

// ❌ Wrong — hardcoded addresses break across environments
const agentPda = new PublicKey("7xKXtg...");
```

### 3. Use Nullable Fetchers for Optional Accounts

```ts
// fetchNullable returns null instead of throwing
const agent = await client.agent.fetchNullable(agentPda);
if (!agent) {
  console.log("Agent not registered yet");
}

// fetch throws SapAccountNotFoundError if missing
try {
  const agent = await client.agent.fetch(agentPda);
} catch (e) {
  if (e instanceof SapAccountNotFoundError) { ... }
}
```

### 4. Use the Builder for Complex Registrations

```ts
// Builder is cleaner for multi-cap, multi-tier agents
await client.builder
  .agent("MultiDexBot")
  .description("...")
  .addCapability("jupiter:swap", { protocol: "jupiter" })
  .addCapability("raydium:swap", { protocol: "raydium" })
  .addPricingTier({ tierId: "basic", pricePerCall: 500_000, rateLimit: 30 })
  .addPricingTier({ tierId: "premium", pricePerCall: 200_000, rateLimit: 120 })
  .register();
```

### 5. Handle Volume Discounts in Escrow

```ts
// Volume curve gives automatic discounts at scale
await client.escrow.create(agentWallet, {
  pricePerCall: new BN(1_000_000),
  maxCalls: new BN(10_000),
  volumeCurve: [
    { afterCalls: 100,  pricePerCall: new BN(900_000) },  // -10%
    { afterCalls: 500,  pricePerCall: new BN(750_000) },  // -25%
    { afterCalls: 1000, pricePerCall: new BN(500_000) },  // -50%
  ],
});
```

### 6. Use PostgreSQL for Analytics

```ts
// Don't fetch from RPC for analytics — use PostgreSQL
const pg = new SapPostgres(pool, client);
await pg.syncAll(); // One-time sync

// Fast SQL queries instead of RPC calls
const topAgents = await pg.query(`
  SELECT name, reputation_score, total_calls_served
  FROM sap_agents
  WHERE is_active = true
  ORDER BY reputation_score DESC
  LIMIT 20
`);
```

### 7. Use Deep Imports for Tree-Shaking

```ts
// ✅ Tree-shakeable — only imports what you need
import { deriveAgent } from "@oobe-protocol-labs/synapse-sap-sdk/pda";
import { LIMITS } from "@oobe-protocol-labs/synapse-sap-sdk/constants";
import { SapPostgres } from "@oobe-protocol-labs/synapse-sap-sdk/postgres";

// Also fine — barrel import (all modules)
import { SapClient, deriveAgent, LIMITS } from "@oobe-protocol-labs/synapse-sap-sdk";
```

### 8. Validate Environment at Startup (v0.6.0)

```ts
import { createEnvSchema, validateOrThrow } from "@oobe-protocol-labs/synapse-sap-sdk";

// Fail fast if required env vars are missing or mis-typed
const env = validateOrThrow(createEnvSchema(), process.env, "environment");
// env is now fully typed: env.SOLANA_CLUSTER, env.SOLANA_RPC_URL, etc.
```

### 9. Use Dual-RPC for SPL Token Operations (v0.6.0)

```ts
import { createDualConnection } from "@oobe-protocol-labs/synapse-sap-sdk";

// Primary (authenticated) for SAP calls, fallback (public) for token ops
const { primary, fallback } = createDualConnection({
  primaryUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
}, "mainnet-beta");

// This prevents WebSocket-400 errors when authenticated RPCs reject
// token-related WebSocket subscriptions
```

### 10. Validate Endpoints Before Escrow Deposits (v0.6.0)

```ts
import { validateEndpoint, validateAgentEndpoints } from "@oobe-protocol-labs/synapse-sap-sdk";

// Quick single-endpoint check
const result = await validateEndpoint("https://api.example.com/x402");
if (!result.isSapCapable) {
  console.error("Agent endpoint not SAP-capable:", result.warnings);
  // Don't deposit into escrow for an unreachable agent!
}

// Full agent validation (primary + health + tool overrides)
const results = await validateAgentEndpoints({
  endpoint: manifest.endpoint,
  healthCheck: manifest.healthCheck,
  toolEndpoints: manifest.tools
    .filter(t => t.endpointOverride)
    .map(t => ({ name: t.name, endpoint: t.endpointOverride! })),
});
```

### 11. Normalize Network IDs for x402 Headers (v0.6.0)

```ts
import { normalizeNetworkId, isNetworkEquivalent } from "@oobe-protocol-labs/synapse-sap-sdk";

// Prevent "sap network mismatch" errors
const clientNetwork = normalizeNetworkId(process.env.NETWORK ?? "mainnet");
const agentNetwork = normalizeNetworkId(agentManifest.supportedNetworks[0]);

if (!isNetworkEquivalent(clientNetwork, agentNetwork)) {
  throw new Error(`Network mismatch: client=${clientNetwork}, agent=${agentNetwork}`);
}
```

### 12. Use Zod Schemas for Manifest Validation (v0.6.0)

```ts
import {
  createAgentManifestSchema,
  validateOrThrow,
} from "@oobe-protocol-labs/synapse-sap-sdk";

const manifest = validateOrThrow(
  createAgentManifestSchema(),
  JSON.parse(fs.readFileSync("manifest.json", "utf-8")),
  "agent manifest",
);
// manifest is now fully typed with AgentManifest shape
```

### 13. Classify Anchor Errors for Better UX (v0.6.0)

```ts
import {
  classifyAnchorError,
  extractAnchorErrorCode,
} from "@oobe-protocol-labs/synapse-sap-sdk";

try {
  await client.agent.register({ name: "MyAgent", description: "..." });
} catch (err) {
  const code = extractAnchorErrorCode(err);
  if (code !== null) {
    // "Agent already registered for this wallet"
    console.error(`[Error ${code}] ${classifyAnchorError(code)}`);
  } else {
    throw err; // Not an Anchor error — rethrow
  }
}
```

---

## 22. Limits Reference

Quick-reference table for all on-chain constraints:

| What | Max | Constant |
|------|-----|----------|
| Agent name | 64 bytes | `LIMITS.MAX_NAME_LEN` |
| Agent description | 256 bytes | `LIMITS.MAX_DESC_LEN` |
| Agent URI | 256 bytes | `LIMITS.MAX_URI_LEN` |
| Agent DID | 128 bytes | `LIMITS.MAX_AGENT_ID_LEN` |
| Capabilities per agent | 10 | `LIMITS.MAX_CAPABILITIES` |
| Pricing tiers per agent | 5 | `LIMITS.MAX_PRICING_TIERS` |
| Protocols per agent | 5 | `LIMITS.MAX_PROTOCOLS` |
| Plugins per agent | 5 | `LIMITS.MAX_PLUGINS` |
| Volume curve points | 5 | `LIMITS.MAX_VOLUME_CURVE_POINTS` |
| Feedback tag | 32 bytes | `LIMITS.MAX_TAG_LEN` |
| Feedback score | 0–1000 | `LIMITS.MAX_FEEDBACK_SCORE` |
| Agents per index | 100 | `LIMITS.MAX_AGENTS_PER_INDEX` |
| Tool name | 32 bytes | `LIMITS.MAX_TOOL_NAME_LEN` |
| Tools per category | 100 | `LIMITS.MAX_TOOLS_PER_CATEGORY` |
| Attestation type | 32 bytes | `LIMITS.MAX_ATTESTATION_TYPE_LEN` |
| Inscription size | 750 bytes | `LIMITS.MAX_INSCRIPTION_SIZE` |
| Inscriptions per epoch | 1000 | `LIMITS.INSCRIPTIONS_PER_EPOCH` |
| Ring buffer capacity | 4096 entries | `LIMITS.RING_CAPACITY` |
| Ledger write size | 750 bytes | `LIMITS.MAX_LEDGER_WRITE_SIZE` |
| Batch settlements | 10 | `LIMITS.MAX_BATCH_SETTLEMENTS` |

---

## 23. Full Exports Map

### Package Subpath Exports

```jsonc
{
  ".":                  "Root — everything",
  "./core":             "SapClient, SapConnection",
  "./agent":            "AgentModule",
  "./feedback":         "FeedbackModule",
  "./tools":            "ToolsModule",
  "./vault":            "VaultModule",
  "./escrow":           "EscrowModule",
  "./attestation":      "AttestationModule",
  "./ledger":           "LedgerModule",
  "./indexing":         "IndexingModule",
  "./pda":              "17 derive*() functions",
  "./types":            "All interfaces, enums, DTOs + endpoint types (v0.6.0)",
  "./constants":        "Program IDs, SEEDS, LIMITS, SapNetwork (v0.6.0)",
  "./events":           "EventParser, SAP_EVENT_NAMES",
  "./errors":           "6 error classes",
  "./utils":            "sha256, hashToArray, assert, serialization + v0.6.0 utils",
  "./utils/schemas":    "9 Zod schema factories (v0.6.0)",
  "./idl":              "Embedded Anchor IDL",
  "./plugin":           "SAPPlugin, createSAPPlugin",
  "./plugin/schemas":   "Zod validation schemas",
  "./registries":       "DiscoveryRegistry, X402Registry, SessionManager, AgentBuilder",
  "./registries/discovery": "DiscoveryRegistry (standalone)",
  "./registries/x402":     "X402Registry (standalone)",
  "./registries/session":  "SessionManager (standalone)",
  "./registries/builder":  "AgentBuilder (standalone)",
  "./postgres":         "SapPostgres, SapSyncEngine, serializers"
}
```

### Root Barrel Exports

From `@oobe-protocol-labs/synapse-sap-sdk`:

```ts
// Core
export { SapClient, SapConnection };

// Types (22 account interfaces + 11 instruction DTOs + 5 enums)
export type { AgentAccountData, EscrowAccountData, ToolDescriptorData, ... };
export { TokenType, SettlementMode, ToolHttpMethod, ToolCategory, PluginType };

// v0.6.0 — Endpoint & Manifest types
export type {
  EndpointDescriptor,
  HealthCheckDescriptor,
  ToolManifestEntry,
  AgentManifest,
  EndpointValidationResult,
};

// Constants
export { SAP_PROGRAM_ID, SEEDS, LIMITS, AGENT_VERSION, SapNetwork, ... };
export type { SapNetworkId };

// PDA (17 functions)
export { deriveAgent, deriveEscrow, deriveTool, ... };

// Events
export { EventParser, SAP_EVENT_NAMES };

// Errors
export { SapError, SapValidationError, SapRpcError, ... };

// Modules
export { AgentModule, FeedbackModule, ToolsModule, VaultModule, ... };

// Registries
export { DiscoveryRegistry, X402Registry, SessionManager, AgentBuilder };

// Plugin
export { createSAPPlugin, SAPPlugin };

// PostgreSQL
export { SapPostgres, SapSyncEngine, SAP_TABLE_MAP };

// v0.6.0 — Network normalizer
export {
  normalizeNetworkId,
  isNetworkEquivalent,
  getNetworkGenesisHash,
  getNetworkClusterName,
  isKnownNetwork,
};

// v0.6.0 — Endpoint validation
export {
  validateEndpoint,
  validateEndpointDescriptor,
  validateHealthCheck,
  validateAgentEndpoints,
};
export type { ValidateEndpointOptions };

// v0.6.0 — RPC strategy & error classification
export {
  getRpcUrl,
  getFallbackRpcUrl,
  createDualConnection,
  findATA,
  classifyAnchorError,
  extractAnchorErrorCode,
};
export type { RpcConfig, DualConnection, AtaResult };

// v0.6.0 — Zod runtime schemas
export {
  createEnvSchema,
  createEndpointDescriptorSchema,
  createHealthCheckSchema,
  createToolManifestEntrySchema,
  createAgentManifestSchema,
  createPreparePaymentSchema,
  createRegisterAgentSchema,
  createCallArgsSchema,
  validateOrThrow,
};
```

---

## 24. Endpoint Discovery & Validation (v0.6.0)

> Solves the "guess the endpoint" interoperability problem. Typed endpoint descriptors
> replace stringly-typed metadata with machine-verifiable schemas for HTTP endpoints,
> authentication, health checks, and tool manifests.

### Types

```ts
import type {
  EndpointDescriptor,
  HealthCheckDescriptor,
  ToolManifestEntry,
  AgentManifest,
  EndpointValidationResult,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

#### EndpointDescriptor

Machine-readable description of an agent's HTTP endpoint.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | — | Full URL (`https://api.example.com/x402`) |
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE"` | `"POST"` | HTTP method |
| `contentType` | `string` | `"application/json"` | Expected response Content-Type |
| `requiresAuth` | `boolean` | `false` | Whether `Authorization` header is needed |
| `authType` | `"bearer" \| "api-key" \| "x402" \| "none"` | — | Auth type if `requiresAuth` |
| `requiresCSRF` | `boolean` | `false` | Requires CSRF tokens |
| `requiresCookies` | `boolean` | `false` | Requires browser cookies |
| `corsOrigins` | `string[]` | — | Required CORS origins |
| `requiredHeaders` | `Record<string, string>` | — | Additional required headers |

#### HealthCheckDescriptor

Health-check endpoint configuration for an agent.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | — | Health-check URL |
| `expectedStatus` | `number` | `200` | Expected HTTP status code |
| `timeoutMs` | `number` | `5000` | Timeout in milliseconds |
| `method` | `"GET" \| "HEAD"` | `"GET"` | HTTP method |

#### ToolManifestEntry

Typed descriptor for a single tool in an agent's manifest.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | — | Tool name (e.g. `"jupiter:swap"`) |
| `description` | `string` | — | Human-readable description |
| `protocol` | `string` | — | Protocol namespace |
| `category` | `string` | — | Tool category |
| `inputSchema` | `Record<string, unknown>` | — | JSON Schema (draft-07) for inputs |
| `outputSchema` | `Record<string, unknown>` | — | JSON Schema (draft-07) for outputs |
| `httpMethod` | `"GET" \| "POST" \| "PUT" \| "DELETE" \| "COMPOUND"` | `"POST"` | HTTP method |
| `paymentMode` | `"x402" \| "free" \| "prepaid" \| "subscription"` | `"x402"` | Payment mode |
| `pricePerCall` | `number` | `0` | Price per call (smallest token unit) |
| `requiredArgs` | `string[]` | `[]` | Required arguments list |
| `prerequisites` | `string[]` | `[]` | Prerequisites (e.g. `"requires escrow"`) |
| `endpointOverride` | `EndpointDescriptor` | — | Tool-specific endpoint override |

#### AgentManifest

Complete typed manifest for an agent — the replacement for stringly-typed metadata.

| Field | Type | Description |
|-------|------|-------------|
| `version` | `"1.0.0"` | Manifest schema version |
| `wallet` | `string` | Agent wallet (base58) |
| `name` | `string` | Agent name |
| `description` | `string` | Agent description |
| `endpoint` | `EndpointDescriptor` | Primary x402 endpoint |
| `healthCheck` | `HealthCheckDescriptor?` | Health-check config |
| `tools` | `ToolManifestEntry[]` | All tools with typed schemas |
| `supportedNetworks` | `string[]` | Network identifiers for x402 |
| `generatedAt` | `string` | ISO 8601 timestamp |

#### EndpointValidationResult

Result of validating an endpoint's reachability and SAP-compatibility.

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | The URL tested |
| `reachable` | `boolean` | Whether endpoint is reachable |
| `statusCode` | `number` | HTTP status code (0 if unreachable) |
| `latencyMs` | `number` | Response time in ms |
| `isJson` | `boolean` | Response Content-Type is JSON |
| `hasCors` | `boolean` | CORS headers present |
| `isSapCapable` | `boolean` | Endpoint is SAP-compatible |
| `error` | `string?` | Error message if failed |
| `warnings` | `string[]` | Warnings (e.g. `"requires CSRF"`) |

### Validation Functions

```ts
import {
  validateEndpoint,
  validateEndpointDescriptor,
  validateHealthCheck,
  validateAgentEndpoints,
} from "@oobe-protocol-labs/synapse-sap-sdk";
import type { ValidateEndpointOptions } from "@oobe-protocol-labs/synapse-sap-sdk";
```

#### `validateEndpoint(url, opts?)`

Validate a single URL for SAP compatibility. Checks: reachability, JSON content-type,
CORS headers, no HTML redirect, measures latency.

```ts
const result = await validateEndpoint("https://api.example.com/x402", {
  timeoutMs: 10_000,  // default: 10s
  retries: 1,         // default: 1
  method: "HEAD",     // default: HEAD
  checkCors: true,    // default: false
  headers: { "X-Custom": "value" },
});

if (!result.reachable) {
  console.error(`Endpoint unreachable: ${result.error}`);
}
if (!result.isSapCapable) {
  console.warn("Warnings:", result.warnings);
  // e.g. ["Endpoint returns HTML — may require CSRF or browser session"]
}
```

#### `validateEndpointDescriptor(descriptor, opts?)`

Validate using the full `EndpointDescriptor` metadata (uses the descriptor's method,
required headers, and adds descriptor-specific warnings for CSRF/cookies).

```ts
const descriptor: EndpointDescriptor = {
  url: "https://api.example.com/x402",
  method: "POST",
  contentType: "application/json",
  requiresAuth: true,
  authType: "x402",
  requiresCSRF: false,
  requiresCookies: false,
};

const result = await validateEndpointDescriptor(descriptor);
```

#### `validateHealthCheck(health)`

Validate an agent's health-check endpoint against its expected status code.

```ts
const health: HealthCheckDescriptor = {
  url: "https://api.example.com/health",
  expectedStatus: 200,
  timeoutMs: 5000,
};

const result = await validateHealthCheck(health);
if (!result.isSapCapable) {
  console.error("Health check failed:", result.warnings);
}
```

#### `validateAgentEndpoints(params, opts?)`

Validate all endpoints for an agent in one call (primary + health + tool overrides).
Returns a `Map<string, EndpointValidationResult>`.

```ts
const results = await validateAgentEndpoints({
  endpoint: manifest.endpoint,
  healthCheck: manifest.healthCheck,
  toolEndpoints: [
    { name: "jupiter-swap", endpoint: toolEndpointDescriptor },
  ],
});

// results.get("primary")      — primary endpoint result
// results.get("health")       — health check result
// results.get("tool:jupiter-swap") — tool-specific result

for (const [label, result] of results) {
  console.log(`${label}: ${result.isSapCapable ? "✓" : "✗"} (${result.latencyMs}ms)`);
}
```

### Example: Full Agent Manifest

```json
{
  "version": "1.0.0",
  "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "name": "SwapBot",
  "description": "AI-powered Jupiter swap agent",
  "endpoint": {
    "url": "https://api.swapbot.ai/x402",
    "method": "POST",
    "contentType": "application/json",
    "requiresAuth": true,
    "authType": "x402",
    "requiresCSRF": false,
    "requiresCookies": false
  },
  "healthCheck": {
    "url": "https://api.swapbot.ai/health",
    "expectedStatus": 200,
    "timeoutMs": 5000
  },
  "tools": [
    {
      "name": "jupiter:swap",
      "description": "Swap tokens via Jupiter aggregator",
      "protocol": "jupiter",
      "category": "swap",
      "inputSchema": {
        "type": "object",
        "properties": {
          "inputMint": { "type": "string" },
          "outputMint": { "type": "string" },
          "amount": { "type": "number" }
        },
        "required": ["inputMint", "outputMint", "amount"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "txSignature": { "type": "string" },
          "amountOut": { "type": "number" }
        }
      },
      "httpMethod": "POST",
      "paymentMode": "x402",
      "pricePerCall": 1000000,
      "requiredArgs": ["inputMint", "outputMint", "amount"],
      "prerequisites": ["requires escrow deposit"]
    }
  ],
  "supportedNetworks": ["solana:mainnet-beta", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
  "generatedAt": "2026-03-29T10:00:00Z"
}
```

---

## 25. Network Normalization (v0.6.0)

> Solves the x402 "sap network mismatch" error. Different x402 providers use
> different formats for the same Solana network (`solana:mainnet-beta` vs.
> `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`). This module normalizes identifiers
> so both clients and agents canonicalize before comparing.

### Import

```ts
import {
  normalizeNetworkId,
  isNetworkEquivalent,
  getNetworkGenesisHash,
  getNetworkClusterName,
  isKnownNetwork,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

### `normalizeNetworkId(raw)`

Normalize a raw network identifier to its canonical `SapNetworkId` form.
Case-insensitive, strips whitespace, resolves genesis-hash vs. cluster-name aliases.

```ts
normalizeNetworkId("solana:mainnet-beta");
// → "solana:mainnet-beta"

normalizeNetworkId("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
// → "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"

normalizeNetworkId("  MAINNET  ");
// → "solana:mainnet-beta"

normalizeNetworkId("unknown-chain");
// → "unknown-chain" (passthrough)
```

### `isNetworkEquivalent(a, b)`

Check if two identifiers refer to the same network, even if different formats.
This is the key function that prevents the "sap network mismatch" error.

```ts
isNetworkEquivalent("solana:mainnet-beta", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
// → true (both are mainnet)

isNetworkEquivalent("solana:devnet", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
// → true (both are devnet)

isNetworkEquivalent("solana:mainnet-beta", "solana:devnet");
// → false (different networks)
```

### `getNetworkGenesisHash(networkId)`

Get the genesis-hash form (CAIP-2). Required by Kamiyo, Helius x402.

```ts
getNetworkGenesisHash("mainnet");
// → "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"

getNetworkGenesisHash("devnet");
// → "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
```

### `getNetworkClusterName(networkId)`

Get the human-readable cluster-name form. Accepted by Coinbase, Phantom.

```ts
getNetworkClusterName("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
// → "solana:mainnet-beta"

getNetworkClusterName("EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
// → "solana:devnet"
```

### `isKnownNetwork(networkId)`

Check if the identifier is recognized by the SDK.

```ts
isKnownNetwork("solana:mainnet-beta"); // → true
isKnownNetwork("solana:devnet");       // → true
isKnownNetwork("ethereum:mainnet");    // → false
```

### Alias Resolution Table

| Input | Canonical Output |
|-------|-----------------|
| `"solana:mainnet-beta"` | `"solana:mainnet-beta"` |
| `"solana:mainnet"` | `"solana:mainnet-beta"` |
| `"mainnet-beta"` | `"solana:mainnet-beta"` |
| `"mainnet"` | `"solana:mainnet-beta"` |
| `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` | `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` |
| `"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` | `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` |
| `"solana:devnet"` | `"solana:devnet"` |
| `"devnet"` | `"solana:devnet"` |
| `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` | `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` |
| `"EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` | `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` |

---

## 26. RPC Strategy & Dual Connections (v0.6.0)

> Solves two interoperability problems:
> 1. **WebSocket 400 loop** — Authenticated RPCs reject WebSocket connections for
>    SPL token operations. Dual connections route token calls to a public fallback.
> 2. **Idempotent ATA creation** — Wraps `getOrCreateAssociatedTokenAccount` so
>    "account already exists" doesn't surface as a hard error.

### Import

```ts
import {
  getRpcUrl,
  getFallbackRpcUrl,
  createDualConnection,
  findATA,
  classifyAnchorError,
  extractAnchorErrorCode,
} from "@oobe-protocol-labs/synapse-sap-sdk";

import type { RpcConfig, DualConnection, AtaResult } from "@oobe-protocol-labs/synapse-sap-sdk";
```

### Types

#### RpcConfig

```ts
interface RpcConfig {
  /** Primary RPC URL (for SAP program calls). */
  readonly primaryUrl: string;
  /** Fallback RPC URL (for SPL token ops, public RPCs). */
  readonly fallbackUrl?: string;
  /** Commitment level. */
  readonly commitment?: Commitment;
}
```

#### DualConnection

```ts
interface DualConnection {
  /** Primary connection for SAP program calls. */
  readonly primary: Connection;
  /** Fallback connection for SPL token operations. */
  readonly fallback: Connection;
}
```

#### AtaResult

```ts
interface AtaResult {
  /** The ATA public key (exists or newly created). */
  readonly address: PublicKey;
  /** Whether the ATA already existed. */
  readonly existed: boolean;
  /** Transaction signature (only if newly created). */
  readonly txSignature?: TransactionSignature;
}
```

### `getRpcUrl(config?, cluster?)`

Get the primary RPC URL. Resolution order:
1. Explicit `config.primaryUrl`
2. `SOLANA_RPC_URL` env var
3. Cluster-appropriate public RPC

```ts
getRpcUrl();
// → "https://api.mainnet-beta.solana.com" (from public fallback)

getRpcUrl({ primaryUrl: "https://my-rpc.example.com" });
// → "https://my-rpc.example.com"

// With SOLANA_RPC_URL env var set:
getRpcUrl();
// → value from process.env.SOLANA_RPC_URL
```

### `getFallbackRpcUrl(config?, cluster?)`

Get the fallback RPC for SPL token operations. Resolution order:
1. Explicit `config.fallbackUrl`
2. `SOLANA_FALLBACK_RPC_URL` env var
3. Cluster-appropriate public RPC

```ts
getFallbackRpcUrl(undefined, "devnet");
// → "https://api.devnet.solana.com"

getFallbackRpcUrl({ fallbackUrl: "https://rpc.helius.xyz" });
// → "https://rpc.helius.xyz"
```

### `createDualConnection(config, cluster?)`

Create a dual-connection pair for the split-RPC strategy.

```ts
const { primary, fallback } = createDualConnection({
  primaryUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
  // fallbackUrl auto-resolves to https://api.mainnet-beta.solana.com
  commitment: "confirmed",
}, "mainnet-beta");

// primary → Anchor provider for SAP program calls
const provider = new AnchorProvider(primary, wallet, {});
const client = SapClient.from(provider);

// fallback → SPL token operations (ATA creation, etc.)
// Avoids WebSocket-400 errors from authenticated RPCs
```

### `findATA(owner, mint, programId?)`

Derive the Associated Token Account address without importing `@solana/spl-token`.

```ts
const ata = findATA(ownerPubkey, usdcMintPubkey);
// → PublicKey of the ATA
```

### `classifyAnchorError(errorCode)`

Convert a numeric Anchor error code into an actionable message.

```ts
classifyAnchorError(6000); // → "Agent already registered for this wallet"
classifyAnchorError(6009); // → "Escrow expired"
classifyAnchorError(9999); // → "Unknown SAP program error (code 9999)..."
```

### `extractAnchorErrorCode(err)`

Extract the Anchor error code from a caught error (handles direct `.code`,
nested `.error.errorCode.number`, and `custom program error: 0xNNNN` in logs).

```ts
try {
  await client.agent.register({ ... });
} catch (err) {
  const code = extractAnchorErrorCode(err);
  if (code !== null) {
    console.error(`[Error ${code}] ${classifyAnchorError(code)}`);
  }
}
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                Your Application                  │
├────────────────────┬────────────────────────────┤
│   SAP Calls        │     SPL Token Ops          │
│   (register,       │     (ATA creation,         │
│    escrow,         │      token transfers,      │
│    inscribe…)      │      balance checks)       │
├────────────────────┼────────────────────────────┤
│   primary          │     fallback               │
│   Connection       │     Connection             │
│                    │                            │
│   OOBE RPC         │     Public RPC             │
│   (authenticated)  │     (open)                 │
└────────────────────┴────────────────────────────┘
```

---

## 27. Zod Runtime Schemas (v0.6.0)

> Zod schemas enforce correctness at the boundary: CLI scripts refuse to run if
> required fields are missing, and SDK methods validate inputs before hitting
> the chain. Zod is a **peer dependency** — schemas are tree-shaken if not imported.

### Import

```ts
import {
  createEnvSchema,
  createEndpointDescriptorSchema,
  createHealthCheckSchema,
  createToolManifestEntrySchema,
  createAgentManifestSchema,
  createPreparePaymentSchema,
  createRegisterAgentSchema,
  createCallArgsSchema,
  validateOrThrow,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

### Schema Factory Reference

All schema functions are factories (`create*Schema()`) that return Zod schema objects.
Zod is loaded lazily at runtime — if not installed, a clear error message is thrown.

| Factory | Validates | Key Fields |
|---------|-----------|------------|
| `createEnvSchema()` | Environment variables | `SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `DATABASE_URL`, `LOG_LEVEL` |
| `createEndpointDescriptorSchema()` | `EndpointDescriptor` | `url`, `method`, `contentType`, `authType` |
| `createHealthCheckSchema()` | `HealthCheckDescriptor` | `url`, `expectedStatus`, `timeoutMs` |
| `createToolManifestEntrySchema()` | `ToolManifestEntry` | `name`, `protocol`, `inputSchema`, `paymentMode` |
| `createAgentManifestSchema()` | `AgentManifest` | `version`, `wallet`, `endpoint`, `tools` |
| `createPreparePaymentSchema()` | x402 payment params | `pricePerCall`, `deposit`, `volumeCurve`, `networkIdentifier` |
| `createRegisterAgentSchema()` | Agent registration args | `name`, `description`, `capabilities`, `pricing` |
| `createCallArgsSchema()` | CLI call script args | `agentWallet`, `tool`, `args`, `endpoint` |

### `createEnvSchema()`

Validates `process.env` for SAP SDK configuration.

```ts
const schema = createEnvSchema();
const env = schema.parse(process.env);

// env is now typed:
// env.SOLANA_CLUSTER    → "mainnet-beta" | "devnet" | "localnet"
// env.SOLANA_RPC_URL    → string (URL) | undefined
// env.SOLANA_FALLBACK_RPC_URL → string (URL) | undefined
// env.WALLET_KEYPAIR_PATH → string | undefined
// env.DATABASE_URL      → string | undefined
// env.LOG_LEVEL         → "debug" | "info" | "warn" | "error"
// env.X402_ENDPOINT     → string (URL) | undefined
// env.AGENT_URI         → string (URL) | undefined
```

### `createAgentManifestSchema()`

Validates a complete agent manifest JSON.

```ts
const schema = createAgentManifestSchema();
const manifest = schema.parse(JSON.parse(fs.readFileSync("manifest.json", "utf-8")));

// manifest.version         → "1.0.0" (literal)
// manifest.wallet          → string (32-50 chars)
// manifest.endpoint        → EndpointDescriptor (validated)
// manifest.tools           → ToolManifestEntry[] (each validated)
// manifest.supportedNetworks → string[] (min 1)
```

### `createPreparePaymentSchema()`

Validates x402 payment preparation parameters.

```ts
const schema = createPreparePaymentSchema();
const params = schema.parse({
  pricePerCall: 1_000_000,
  deposit: 100_000_000,
  volumeCurve: [
    { afterCalls: 100, pricePerCall: 900_000 },
  ],
  networkIdentifier: "solana:mainnet-beta",
  tokenDecimals: 9,
});
```

### `createRegisterAgentSchema()`

Validates agent registration arguments with on-chain limits enforcement.

```ts
const schema = createRegisterAgentSchema();
const args = schema.parse({
  name: "SwapBot",                    // 1-64 chars
  description: "Jupiter swap agent",  // 1-256 chars
  capabilities: [
    { id: "jupiter:swap" },
  ],                                  // max 10
  protocols: ["jupiter"],             // max 5
  pricing: [{
    tierId: "standard",
    pricePerCall: 1_000_000,
    rateLimit: 60,
  }],                                 // max 5
});
```

### `createCallArgsSchema()`

Validates CLI call script arguments.

```ts
const schema = createCallArgsSchema();
const args = schema.parse({
  agentWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  tool: "jupiter:swap",
  args: { inputMint: "SOL", outputMint: "USDC", amount: 1.0 },
  maxRetries: 2,      // 0-10, default: 2
  timeoutMs: 30_000,  // 1000-120000, default: 30000
});
```

### `validateOrThrow(schema, value, label)`

Validate any value against a Zod schema. Throws a formatted error with field-by-field
details if validation fails.

```ts
import { createEnvSchema, validateOrThrow } from "@oobe-protocol-labs/synapse-sap-sdk";

// Fail fast at startup
const env = validateOrThrow(createEnvSchema(), process.env, "environment");

// On failure, throws:
// [SAP SDK] Invalid environment:
//   • SOLANA_CLUSTER: Invalid enum value. Expected 'mainnet-beta' | 'devnet' | 'localnet'
//   • SOLANA_RPC_URL: Invalid url
```

---

## 28. CLI Reference

> The `@oobe-protocol-labs/synapse-sap-cli` is a standalone CLI tool (10 command groups,
> 40+ subcommands) that wraps the full SDK for terminal-based workflows.

### Installation

```bash
# Global install
npm install -g @oobe-protocol-labs/synapse-sap-cli

# Or use npx
npx @oobe-protocol-labs/synapse-sap-cli --help

# Shorthand binary
sap --help
```

### Command Groups

| Group | Description | Subcommands |
|-------|-------------|-------------|
| `sap agent` | Agent lifecycle management | `list`, `info`, `tools`, `health`, `register` |
| `sap escrow` | x402 escrow lifecycle | `open`, `deposit`, `withdraw`, `close`, `dump`, `list`, `monitor` |
| `sap x402` | x402 micropayment operations | `headers`, `call`, `sign`, `verify`, `settle`, `replay` |
| `sap tools` | Tool manifest & schema management | `manifest generate`, `manifest validate`, `typify`, `publish`, `compare`, `doc` |
| `sap discovery` | Network discovery & endpoint validation | `scan`, `validate`, `cache` |
| `sap env` | Environment & keypair management | `init`, `check`, `keypair show`, `keypair generate`, `keypair import` |
| `sap config` | CLI configuration | `show`, `set`, `edit`, `reset`, `path` |
| `sap doctor` | Diagnostic checks | `run` |
| `sap plugin` | Plugin management & scaffolding | `list`, `install`, `create`, `validate` |
| `sap tmp` | Tmp artifact management | `list`, `cat`, `diff`, `clean`, `archive` |

### Global Options

```
--cluster, -c     Solana cluster (mainnet-beta | devnet | localnet)
--rpc, -r         RPC endpoint URL
--keypair, -k     Path to keypair JSON file
--output, -o      Output format (table | json | csv)
--verbose, -v     Verbose output
--help, -h        Show help
```

### Agent Commands

```bash
# List all agents on the network
sap agent list --cluster mainnet-beta

# Show full agent profile
sap agent info 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# List tools for an agent
sap agent tools 7xKXtg2CW87d97TXJSDpbD --output json

# Health check (ping x402, escrow status)
sap agent health 7xKXtg2CW87d97TXJSDpbD

# Register from manifest
sap agent register --manifest manifest.json --keypair ~/.config/solana/id.json
```

### Escrow Commands

```bash
# Open escrow for an agent
sap escrow open 7xKXtg2CW87d97TXJSDpbD \
  --price 0.001 \
  --max-calls 1000 \
  --expires 24h

# Deposit funds
sap escrow deposit 7xKXtg2CW87d97TXJSDpbD --amount 0.1

# Monitor balance in real-time
sap escrow monitor 7xKXtg2CW87d97TXJSDpbD
```

### x402 Commands

```bash
# Generate x402 headers
sap x402 headers 7xKXtg2CW87d97TXJSDpbD --network solana:mainnet-beta

# Make an x402 API call
sap x402 call 7xKXtg2CW87d97TXJSDpbD jupiter:swap \
  --args '{"inputMint":"SOL","outputMint":"USDC","amount":1.0}' \
  --save  # saves response artifact to tmp/

# Replay a saved call
sap x402 replay tmp/x402-call-2026-03-29.json
```

### Tools Commands

```bash
# Generate typed manifest from on-chain data
sap tools manifest generate 7xKXtg2CW87d97TXJSDpbD > manifest.json

# Validate manifest against Zod schema
sap tools manifest validate manifest.json

# Generate TypeScript types from manifest
sap tools typify manifest.json --output ./types/

# Diff capabilities between two agents
sap tools compare 7xKXtg2CW87d97TXJSDpbD 8yLYug3DX98e08UYTEqcC

# Auto-generate docs for agent tools
sap tools doc 7xKXtg2CW87d97TXJSDpbD --output README.md
```

### Discovery Commands

```bash
# Scan the network
sap discovery scan --capability "jupiter:swap" --cluster mainnet-beta

# Validate agent endpoints
sap discovery validate 7xKXtg2CW87d97TXJSDpbD --check-cors --timeout 10000

# Cache management
sap discovery cache write
sap discovery cache read
sap discovery cache clear
```

### Environment Commands

```bash
# Generate .env from template
sap env init --cluster devnet

# Validate current env
sap env check

# Show public key from keypair
sap env keypair show

# Generate new keypair
sap env keypair generate --output ~/.config/solana/sap-agent.json
```

### Doctor & Config

```bash
# Run all diagnostic checks
sap doctor run

# Show merged config
sap config show

# Set a config value
sap config set cluster mainnet-beta

# Open config in editor
sap config edit
```

### Plugin System

```bash
# List available plugins
sap plugin list

# Scaffold a new plugin project
sap plugin create my-custom-plugin

# Validate plugin structure
sap plugin validate ./my-custom-plugin/
```

---

## 29. Troubleshooting & FAQ

### Common Errors

#### `AgentNotActive` (error 6001)

**Symptom**: Agent operations fail with "Agent not found".

**Cause**: The wallet has never registered an agent, or the agent was closed.

**Fix**:
```ts
const agent = await client.agent.fetchNullable(agentPda);
if (!agent) {
  await client.agent.register({ name: "MyAgent", description: "..." });
}
```

#### `EscrowInsufficientBalance` (error 6010)

**Symptom**: Settlement fails with insufficient balance.

**Cause**: The escrow doesn't have enough tokens for the settlement amount.

**Fix**:
```ts
const balance = await client.x402.getBalance(agentPda, depositorWallet);
if (balance.lt(new BN(requiredAmount))) {
  await client.escrow.deposit(agentPda, depositorWallet, new BN(topUpAmount));
}
```

#### `VaultAlreadyInitialized` (error 6015)

**Symptom**: `initVault` fails.

**Cause**: Vault with this nonce already exists for the agent.

**Fix**: Use a different nonce, or skip initialization:
```ts
const [vaultPda] = deriveVault(agentPda, 0);
const vault = await client.vault.fetchNullable?.(vaultPda);
if (!vault) {
  await client.vault.initVault(0);
}
```

#### `SessionClosed` (error 6017)

**Symptom**: Inscriptions fail with "session closed".

**Cause**: The session was already closed (either manually or by a delegate).

**Fix**: Open a new session with a different session ID.

#### `DataExceedsMaxWriteSize` (error 6018)

**Symptom**: Inscribe or ledger write fails.

**Cause**: Data exceeds the 750-byte maximum per write.

**Fix**: Split the data into multiple writes, or use compression:
```ts
const MAX = LIMITS.MAX_INSCRIPTION_SIZE; // 750
const chunks = [];
for (let i = 0; i < data.length; i += MAX) {
  chunks.push(data.slice(i, i + MAX));
}
for (const chunk of chunks) {
  await client.vault.inscribe(sessionPda, chunk, hashToArray(sha256(chunk)));
}
```

#### `RingBufferOverflow` (error 6019)

**Symptom**: Ledger write fails with "seal before writing more".

**Cause**: The ring buffer is full (4096 entries). Must seal the current page first.

**Fix**:
```ts
const [ledgerPda] = deriveLedger(sessionPda);
const ledger = await client.ledger.fetch(ledgerPda);
if (ledger.numEntries >= LIMITS.RING_CAPACITY) {
  await client.ledger.seal(ledgerPda, ledger.numPages);
}
// Now write
await client.ledger.write(sessionPda, data, contentHash);
```

#### "SAP Network Mismatch" (x402 error)

**Symptom**: x402 payment call rejected by the agent.

**Cause**: Your `X-Payment-Network` header doesn't match the agent's expected format.

**Fix**: Use the network normalizer (§25):
```ts
import { isNetworkEquivalent, getNetworkGenesisHash } from "@oobe-protocol-labs/synapse-sap-sdk";

// If the agent requires genesis-hash form:
const network = getNetworkGenesisHash("mainnet");
// → "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
```

#### WebSocket 400 Errors

**Symptom**: SPL token operations fail with 400 status on WebSocket.

**Cause**: Authenticated RPC rejects WebSocket connections for token subscriptions.

**Fix**: Use the dual-connection strategy (§26):
```ts
const { primary, fallback } = createDualConnection({
  primaryUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
});
```

#### "Zod is required" Error

**Symptom**: `[SAP SDK] Zod is required for schema validation. Install it: npm install zod`

**Cause**: You're using Zod schemas but haven't installed the `zod` peer dependency.

**Fix**:
```bash
npm install zod
```

### FAQ

**Q: Can I use the SDK without Anchor?**
A: The SDK requires `@coral-xyz/anchor` as a peer dependency. It uses Anchor providers
and program interfaces under the hood. You can create a minimal provider with
`SapConnection.fromKeypair()`.

**Q: What Solana clusters are supported?**
A: Mainnet-beta, devnet, and localnet. Custom clusters work if you provide the RPC URL.

**Q: Do I need PostgreSQL?**
A: No. PostgreSQL is optional. The `pg` package is a peer dependency. Only install it
if you want off-chain mirroring/analytics.

**Q: How much SOL does registration cost?**
A: Agent registration costs ~0.003-0.005 SOL in rent (reclaimable on close).
Tools cost ~0.001-0.002 SOL each. Escrows cost ~0.002 SOL for the account plus
whatever deposit amount. See §22 for all account size limits.

**Q: Can multiple wallets control one agent?**
A: No. Each agent PDA is derived from a single wallet. Use the Vault Delegation
system (§12) to grant hot-wallet access to specific operations.

**Q: How do I migrate from v0.5.x to v0.6.0?**
A: No breaking changes. v0.6.0 is fully backward compatible. New features
(endpoint types, network normalizer, RPC strategy, Zod schemas, CLI) are
all additive. New peer dependency: `zod` (optional, only if using schema validation).

---

## 30. Account Data Structures

> All 22 on-chain account types with field-by-field reference. These interfaces
> are returned by `fetch()` and `fetchNullable()` methods.

### AgentAccountData

Core agent identity PDA. Stores profile, reputation, pricing, capabilities.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `version` | `number` | Account schema version |
| `wallet` | `PublicKey` | Owner wallet |
| `name` | `string` | Agent name (max 64 bytes) |
| `description` | `string` | Agent description (max 256 bytes) |
| `agentId` | `string \| null` | Off-chain DID/UUID identifier |
| `agentUri` | `string \| null` | Extended metadata URI |
| `x402Endpoint` | `string \| null` | x402 payment endpoint URL |
| `isActive` | `boolean` | Currently accepting calls |
| `createdAt` | `BN` | Unix timestamp of registration |
| `updatedAt` | `BN` | Unix timestamp of last update |
| `reputationScore` | `number` | Computed reputation (0–100) |
| `totalFeedbacks` | `number` | Total feedbacks received |
| `reputationSum` | `BN` | Raw sum of all feedback scores |
| `totalCallsServed` | `BN` | Lifetime calls served |
| `avgLatencyMs` | `number` | Average latency in ms |
| `uptimePercent` | `number` | Uptime percentage (0–100) |
| `capabilities` | `Capability[]` | Declared capabilities for discovery |
| `pricing` | `PricingTier[]` | Active pricing tiers |
| `protocols` | `string[]` | Supported protocol identifiers |
| `activePlugins` | `PluginRef[]` | Enabled plugin references |

### AgentStatsData

Lightweight hot-path metrics PDA. Separated from AgentAccountData to minimize
compute cost of frequent counter updates.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Agent PDA this tracks |
| `wallet` | `PublicKey` | Owner wallet |
| `totalCallsServed` | `BN` | Lifetime calls counter |
| `isActive` | `boolean` | Agent active status |
| `updatedAt` | `BN` | Last update timestamp |

### FeedbackAccountData

Trustless reputation entry. Unique PDA keyed by `[agent, reviewer]`.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Target agent PDA |
| `reviewer` | `PublicKey` | Reviewer wallet |
| `score` | `number` | Reputation score (1–100) |
| `tag` | `string` | Freeform tag (max 32 bytes) |
| `commentHash` | `number[] \| null` | SHA-256 of off-chain comment |
| `createdAt` | `BN` | Creation timestamp |
| `updatedAt` | `BN` | Last update timestamp |
| `isRevoked` | `boolean` | Whether revoked |

### GlobalRegistryData

Network-wide statistics singleton PDA.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `totalAgents` | `BN` | Total registered agents |
| `activeAgents` | `BN` | Currently active agents |
| `totalFeedbacks` | `BN` | Total feedbacks network-wide |
| `totalCapabilities` | `number` | Distinct capability count |
| `totalProtocols` | `number` | Distinct protocol count |
| `lastRegisteredAt` | `BN` | Last agent registration timestamp |
| `initializedAt` | `BN` | Registry initialization timestamp |
| `authority` | `PublicKey` | Upgrade authority |
| `totalTools` | `number` | Published tools count |
| `totalVaults` | `number` | Memory vaults count |
| `totalEscrows` | `number` | Escrow accounts count |
| `totalAttestations` | `number` | Attestations count |

### ToolDescriptorData

On-chain tool schema registry PDA.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Owning agent PDA |
| `toolNameHash` | `number[]` | SHA-256 of tool name (PDA seed) |
| `toolName` | `string` | Human-readable name (max 32 bytes) |
| `protocolHash` | `number[]` | SHA-256 of protocol identifier |
| `version` | `number` | Schema version |
| `descriptionHash` | `number[]` | SHA-256 of description |
| `inputSchemaHash` | `number[]` | SHA-256 of input JSON Schema |
| `outputSchemaHash` | `number[]` | SHA-256 of output JSON Schema |
| `httpMethod` | `ToolHttpMethodKind` | HTTP method variant |
| `category` | `ToolCategoryKind` | Discovery category |
| `paramsCount` | `number` | Total parameters |
| `requiredParams` | `number` | Required parameters |
| `isCompound` | `boolean` | Multi-step operation |
| `isActive` | `boolean` | Currently enabled |
| `totalInvocations` | `BN` | Lifetime invocation counter |
| `createdAt` | `BN` | Creation timestamp |
| `updatedAt` | `BN` | Last update timestamp |
| `previousVersion` | `PublicKey` | PDA of previous version (zero key if first) |

### EscrowAccountData

x402 pre-funded micropayment escrow PDA.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Agent PDA |
| `depositor` | `PublicKey` | Consumer wallet that funded escrow |
| `agentWallet` | `PublicKey` | Agent wallet for settlements |
| `balance` | `BN` | Current remaining balance |
| `totalDeposited` | `BN` | Cumulative deposited |
| `totalSettled` | `BN` | Cumulative settled to agent |
| `totalCallsSettled` | `BN` | Cumulative calls settled |
| `pricePerCall` | `BN` | Base price per call |
| `maxCalls` | `BN` | Maximum funded calls |
| `createdAt` | `BN` | Creation timestamp |
| `lastSettledAt` | `BN` | Last settlement timestamp |
| `expiresAt` | `BN` | Expiry timestamp |
| `volumeCurve` | `VolumeCurveBreakpoint[]` | Volume discount breakpoints |
| `tokenMint` | `PublicKey \| null` | SPL token mint (null = native SOL) |
| `tokenDecimals` | `number` | Token decimal places |

### MemoryVaultData

Encrypted inscription vault PDA (NaCl encryption, nonce rotation).

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Owning agent PDA |
| `wallet` | `PublicKey` | Vault owner wallet |
| `vaultNonce` | `number[]` | Current encryption nonce seed (32 bytes) |
| `totalSessions` | `number` | Total sessions created |
| `totalInscriptions` | `BN` | Total inscriptions across all sessions |
| `totalBytesInscribed` | `BN` | Total bytes inscribed |
| `createdAt` | `BN` | Creation timestamp |
| `protocolVersion` | `number` | Protocol version |
| `nonceVersion` | `number` | Nonce version (increments on rotation) |
| `lastNonceRotation` | `BN` | Last nonce rotation timestamp |

### SessionLedgerData

Compact session index PDA within a MemoryVault.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `vault` | `PublicKey` | Parent vault PDA |
| `sessionHash` | `number[]` | SHA-256 session ID |
| `sequenceCounter` | `number` | Next inscription sequence |
| `totalBytes` | `BN` | Total bytes in session |
| `currentEpoch` | `number` | Current epoch index |
| `totalEpochs` | `number` | Total epochs |
| `createdAt` | `BN` | Creation timestamp |
| `lastInscribedAt` | `BN` | Last inscription timestamp |
| `isClosed` | `boolean` | Whether session is closed |
| `merkleRoot` | `number[]` | Running Merkle root |
| `totalCheckpoints` | `number` | Checkpoint count |
| `tipHash` | `number[]` | Latest inscription hash |

### EpochPageData

Per-epoch scan target within a session.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `session` | `PublicKey` | Parent session PDA |
| `epochIndex` | `number` | Zero-based epoch index |
| `startSequence` | `number` | First inscription sequence |
| `inscriptionCount` | `number` | Inscriptions in epoch |
| `totalBytes` | `number` | Bytes in epoch |
| `firstTs` | `BN` | First inscription timestamp |
| `lastTs` | `BN` | Last inscription timestamp |

### VaultDelegateData

Hot-wallet authorization PDA for vault operations.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `vault` | `PublicKey` | Parent vault PDA |
| `delegate` | `PublicKey` | Delegate wallet |
| `permissions` | `number` | Permission bitmask |
| `expiresAt` | `BN` | Delegation expiry |
| `createdAt` | `BN` | Creation timestamp |

### SessionCheckpointData

Fast-sync snapshot PDA for session integrity verification.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `session` | `PublicKey` | Parent session PDA |
| `checkpointIndex` | `number` | Zero-based index |
| `merkleRoot` | `number[]` | Merkle root at checkpoint |
| `sequenceAt` | `number` | Sequence at checkpoint |
| `epochAt` | `number` | Epoch at checkpoint |
| `totalBytesAt` | `BN` | Cumulative bytes |
| `inscriptionsAt` | `BN` | Cumulative inscriptions |
| `createdAt` | `BN` | Checkpoint timestamp |

### AgentAttestationData

Web-of-trust attestation PDA.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Agent being attested |
| `attester` | `PublicKey` | Attester wallet |
| `attestationType` | `string` | Type (e.g. `"kyc"`, `"audit"`) |
| `metadataHash` | `number[]` | SHA-256 of off-chain metadata |
| `isActive` | `boolean` | Currently active |
| `expiresAt` | `BN` | Expiry timestamp |
| `createdAt` | `BN` | Creation timestamp |
| `updatedAt` | `BN` | Last update timestamp |

### MemoryLedgerData

Unified ring-buffer memory ledger PDA.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `session` | `PublicKey` | Parent session PDA |
| `authority` | `PublicKey` | Write authority |
| `numEntries` | `number` | Current ring buffer entries |
| `merkleRoot` | `number[]` | Running Merkle root |
| `latestHash` | `number[]` | Latest entry hash |
| `totalDataSize` | `BN` | Total data in bytes |
| `createdAt` | `BN` | Creation timestamp |
| `updatedAt` | `BN` | Last update timestamp |
| `numPages` | `number` | Sealed pages count |
| `ring` | `number[]` | Ring-buffer raw bytes |

### LedgerPageData

Sealed archive page (write-once, immutable).

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `ledger` | `PublicKey` | Parent ledger PDA |
| `pageIndex` | `number` | Zero-based page index |
| `sealedAt` | `BN` | Seal timestamp |
| `entriesInPage` | `number` | Entries in page |
| `dataSize` | `number` | Page data size in bytes |
| `merkleRootAtSeal` | `number[]` | Merkle root at seal time |
| `data` | `number[]` | Archived data bytes |

### Discovery Index Accounts

#### CapabilityIndexData

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `capabilityId` | `string` | Human-readable capability |
| `capabilityHash` | `number[]` | SHA-256 hash (PDA seed) |
| `agents` | `PublicKey[]` | Agents declaring this capability |
| `totalPages` | `number` | Total pages for pagination |
| `lastUpdated` | `BN` | Last update timestamp |

#### ProtocolIndexData

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `protocolId` | `string` | Human-readable protocol |
| `protocolHash` | `number[]` | SHA-256 hash (PDA seed) |
| `agents` | `PublicKey[]` | Agents supporting this protocol |
| `totalPages` | `number` | Total pages |
| `lastUpdated` | `BN` | Last update timestamp |

#### ToolCategoryIndexData

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `category` | `number` | Numeric category discriminant |
| `tools` | `PublicKey[]` | Tool descriptor PDAs |
| `totalPages` | `number` | Total pages |
| `lastUpdated` | `BN` | Last update timestamp |

### Shared Structs

#### Capability

```ts
interface Capability {
  readonly id: string;               // e.g. "jupiter:swap"
  readonly description: string | null;
  readonly protocolId: string | null;
  readonly version: string | null;
}
```

#### PricingTier

```ts
interface PricingTier {
  readonly tierId: string;
  readonly pricePerCall: BN;
  readonly tokenType: TokenTypeKind;
  readonly settlementMode: SettlementModeKind;
  readonly rateLimit: number;
  readonly maxCallsPerEpoch: BN;
  readonly volumeCurve: VolumeCurveBreakpoint[];
  readonly tokenMint: PublicKey | null;
  readonly tokenDecimals: number;
}
```

#### VolumeCurveBreakpoint

```ts
interface VolumeCurveBreakpoint {
  readonly afterCalls: number;    // Threshold after which tier activates
  readonly pricePerCall: BN;      // New price per call (token base units)
}
```

#### PluginRef

```ts
interface PluginRef {
  readonly pluginType: PluginTypeKind;
  readonly pda: PublicKey;
}
```

---

## 31. End-to-End Recipes

### Recipe 1: DeFi Swap Agent (Full Lifecycle)

Register an agent, publish tools, accept payments, serve a swap request, collect metrics.

```ts
import {
  SapClient,
  SapConnection,
  TokenType,
  SettlementMode,
  ToolHttpMethod,
  ToolCategory,
  deriveAgent,
  deriveEscrow,
  LIMITS,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// 1. Setup
const conn = new SapConnection({
  rpcUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY",
  cluster: "mainnet-beta",
});
const client = conn.client;

// 2. Register agent with capabilities and pricing
await client.builder
  .agent("JupiterSwapBot")
  .description("AI-powered Jupiter V6 swap agent")
  .agentUri("https://api.jupswap.ai")
  .x402Endpoint("https://api.jupswap.ai/.well-known/x402")
  .addCapability("jupiter:swap", { protocol: "jupiter" })
  .addCapability("jupiter:quote", { protocol: "jupiter" })
  .addPricingTier({
    tierId: "standard",
    pricePerCall: 1_000_000, // 0.001 SOL
    rateLimit: 60,
  })
  .register();

// 3. Publish tools with JSON schemas
const [agentPda] = deriveAgent(wallet.publicKey);

await client.tools.publish({
  agent: agentPda,
  toolName: "jupiter-swap",
  httpMethod: ToolHttpMethod.Post,
  category: ToolCategory.Swap,
  paramsCount: 3,
  requiredParams: 3,
  isCompound: false,
});

await client.tools.inscribeSchema({
  agent: agentPda,
  toolName: "jupiter-swap",
  schemaData: Buffer.from(JSON.stringify({
    type: "object",
    properties: {
      inputMint: { type: "string", description: "Input token mint address" },
      outputMint: { type: "string", description: "Output token mint address" },
      amount: { type: "number", description: "Amount in token base units" },
    },
    required: ["inputMint", "outputMint", "amount"],
  })),
  schemaType: SchemaType.Json,
  compressionType: CompressionType.None,
});

// 4. Register for discovery
await client.indexing.registerCapability(agentPda, "jupiter:swap");
await client.indexing.registerProtocol(agentPda, "jupiter");
await client.indexing.registerToolCategory(toolPda, ToolCategory.Swap);

// 5. Consumer side: find agent, create escrow, make calls
const agents = await client.discovery.findAgentsByCapability("jupiter:swap");
const topAgent = agents[0]; // highest reputation

await client.escrow.create(topAgent.wallet, {
  pricePerCall: new BN(1_000_000),
  maxCalls: new BN(100),
  expiresAt: new BN(Date.now() / 1000 + 86400),
  volumeCurve: [{ afterCalls: 50, pricePerCall: new BN(800_000) }],
});

// 6. x402 payment call
const ctx = await client.x402.preparePayment(topAgent.wallet, {
  callCount: 1,
  tokenType: TokenType.Sol,
});
const headers = client.x402.buildPaymentHeaders(ctx);
// Send HTTP request with these headers to agent's x402 endpoint

// 7. Agent settles after serving
await client.x402.settle(depositorWallet, 1, serviceDataHash);

// 8. Report metrics
await client.agent.reportCalls(5, 120); // 5 calls, 120ms avg latency
await client.tools.reportInvocations(agentPda, "jupiter-swap", 5);
```

### Recipe 2: Encrypted Memory Agent (Vault + Ledger)

Store conversation history on-chain with encrypted vault + ring-buffer ledger.

```ts
import {
  SapClient,
  deriveAgent,
  deriveVault,
  deriveSession,
  deriveLedger,
  sha256,
  hashToArray,
  LIMITS,
} from "@oobe-protocol-labs/synapse-sap-sdk";

const [agentPda] = deriveAgent(wallet.publicKey);

// 1. Initialize vault (one-time)
await client.vault.initVault(0); // nonce = 0

// 2. Open a conversation session
const [vaultPda] = deriveVault(agentPda, 0);
await client.vault.openSession(vaultPda, "conversation-2026-03-29");

// 3. Inscribe encrypted conversation entries
const [sessionPda] = deriveSession(vaultPda, "conversation-2026-03-29");

const messages = [
  "User: What's the best DEX on Solana?",
  "Agent: Jupiter is the top aggregator. It routes through Raydium, Orca, and others.",
  "User: Execute a swap of 1 SOL to USDC",
  "Agent: Swapped 1 SOL → 142.35 USDC via Jupiter V6. Tx: 4xK9...",
];

for (const msg of messages) {
  const encrypted = encrypt(msg, vaultKey); // Your encryption function
  const contentHash = hashToArray(sha256(encrypted));
  await client.vault.inscribe(sessionPda, encrypted, contentHash);
}

// 4. Initialize ring-buffer ledger for the session
await client.ledger.init(sessionPda);

// 5. Write structured data to ledger
const entry = JSON.stringify({
  type: "swap_result",
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amountIn: 1_000_000_000,
  amountOut: 142_350_000,
  timestamp: Date.now(),
});

const data = Buffer.from(entry);
const hash = hashToArray(sha256(data));
await client.ledger.write(sessionPda, data, hash);

// 6. Read back ring buffer entries
const [ledgerPda] = deriveLedger(sessionPda);
const entries = await client.ledger.decodeRingBuffer(ledgerPda);
for (const e of entries) {
  console.log(JSON.parse(Buffer.from(e.data).toString()));
}

// 7. Create checkpoint for fast-sync
await client.tools.createCheckpoint(sessionPda, "v1");

// 8. Delegate access to a hot wallet
await client.vault.addDelegate(vaultPda, hotWallet, permissions);
await client.vault.inscribeDelegated(sessionPda, delegatedData, delegatedHash);

// 9. Seal and close
await client.ledger.seal(ledgerPda, 0);
await client.vault.closeSession(sessionPda);
// Keep vault open for future sessions
```

### Recipe 3: AI Agent Framework Integration (LangChain)

Use the plugin adapter to expose all 52 SAP tools to an AI agent framework.

```ts
import { SapClient, SapConnection, createSAPPlugin } from "@oobe-protocol-labs/synapse-sap-sdk";
import { DynamicTool, AgentExecutor } from "langchain/agents";
import { ChatOpenAI } from "@langchain/openai";

// 1. Setup SAP client
const conn = SapConnection.mainnet();
const client = conn.client;

// 2. Create SAP plugin (52 tools, Zod-validated)
const plugin = createSAPPlugin(client);

// 3. Convert to LangChain tools
const langchainTools = plugin.tools.map(t => new DynamicTool({
  name: t.name,
  description: t.description,
  func: async (input: string) => {
    const parsed = JSON.parse(input);
    const result = await t.execute(parsed);
    return JSON.stringify(result);
  },
}));

// 4. Create agent with SAP tools
const model = new ChatOpenAI({ modelName: "gpt-4" });
const agent = AgentExecutor.fromAgentAndTools({
  agent: model,
  tools: langchainTools,
});

// 5. Agent can now autonomously:
//    - Register agents
//    - Publish tools with schemas
//    - Create escrows and settle payments
//    - Inscribe encrypted memories
//    - Discover other agents
//    - Issue attestations
const result = await agent.invoke({
  input: "Find the best swap agent on the network and execute a 1 SOL → USDC swap",
});
```

---

## 32. Security Model

### Encryption

Memory vault inscriptions are encrypted client-side before being stored on-chain.
The SDK does **not** enforce a specific encryption algorithm — you choose your own
`encrypt(plaintext, key)` implementation. Common choices:

- **NaCl `secretbox`** — Recommended. Fast, authenticated, 24-byte nonce.
- **AES-256-GCM** — Also suitable for structured data.

```ts
import nacl from "tweetnacl";

function encrypt(plaintext: string, key: Uint8Array): Buffer {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const message = Buffer.from(plaintext, "utf-8");
  const encrypted = nacl.secretbox(message, nonce, key);
  return Buffer.concat([nonce, Buffer.from(encrypted)]);
}

function decrypt(ciphertext: Buffer, key: Uint8Array): string {
  const nonce = ciphertext.subarray(0, nacl.secretbox.nonceLength);
  const message = ciphertext.subarray(nacl.secretbox.nonceLength);
  const decrypted = nacl.secretbox.open(message, nonce, key);
  if (!decrypted) throw new Error("Decryption failed");
  return Buffer.from(decrypted).toString("utf-8");
}
```

### Nonce Rotation

Vaults track a `nonceVersion` counter. When you rotate:

```ts
await client.vault.rotateNonce(vaultPda);
// Increments nonceVersion, updates lastNonceRotation timestamp
// New inscriptions should use the new nonce seed
```

Rotation invalidates the old encryption nonce without deleting existing inscriptions.
Historical data can still be decrypted if you retain the old key.

### Delegate Permissions

Vault delegation grants a hot-wallet limited access to vault operations.
Permissions are a bitmask:

| Bit | Permission | Description |
|-----|-----------|-------------|
| `0x01` | `INSCRIBE` | Can inscribe data |
| `0x02` | `OPEN_SESSION` | Can open new sessions |
| `0x04` | `CLOSE_SESSION` | Can close sessions |
| `0x08` | `READ` | Can read vault data |

```ts
// Grant inscribe + read
const permissions = 0x01 | 0x08; // = 0x09
await client.vault.addDelegate(vaultPda, hotWallet, permissions);

// Delegated inscriptions include the delegate's signature
await client.vault.inscribeDelegated(sessionPda, data, hash);

// Revoke at any time
await client.vault.revokeDelegate(vaultPda, hotWallet);
```

Delegations have an `expiresAt` timestamp after which they are automatically invalid.

### Authority Model

| Operation | Required Signer | Notes |
|-----------|----------------|-------|
| Register agent | Wallet owner | Creates agent PDA |
| Update/close agent | Wallet owner | Only owner can modify |
| Give feedback | Any wallet | One feedback per reviewer per agent |
| Create escrow | Any wallet (depositor) | Depositor funds the escrow |
| Settle escrow | Agent owner | Agent claims payment |
| Withdraw escrow | Depositor wallet | Depositor reclaims unused funds |
| Init vault | Agent owner | One vault per nonce per agent |
| Inscribe | Agent owner or delegate | Delegate needs `INSCRIBE` permission |
| Open session | Agent owner or delegate | Delegate needs `OPEN_SESSION` |
| Create attestation | Any wallet (attester) | One per attester-subject pair |
| Revoke attestation | Attester wallet | Only attester can revoke |

### On-Chain Validation

The Solana program validates all operations on-chain:
- **Signer checks** — Every instruction verifies the signer matches the expected authority.
- **PDA derivation checks** — All accounts are verified against their expected PDA seeds.
- **Size limits** — Data sizes are enforced on-chain (see §22).
- **State machine** — Agent lifecycle (active/inactive), session state (open/closed),
  escrow state (funded/expired) are all enforced on-chain.

### Client-Side Validation

Use the SDK's validation utilities to fail fast before hitting the chain:

```ts
import { LIMITS, createRegisterAgentSchema, validateOrThrow } from "@oobe-protocol-labs/synapse-sap-sdk";

// Method 1: Manual checks
if (name.length > LIMITS.MAX_NAME_LEN) throw new Error("Name too long");

// Method 2: Zod schema validation (v0.6.0)
const args = validateOrThrow(createRegisterAgentSchema(), input, "agent registration");
// Validates all fields, lengths, and limits in one call
```

MIT — see [LICENSE](./LICENSE)

## Links

- **GitHub**: [github.com/OOBE-PROTOCOL/synapse-sap-sdk](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk)
- **npm**: [@oobe-protocol-labs/synapse-sap-sdk](https://www.npmjs.com/package/@oobe-protocol-labs/synapse-sap-sdk)
- **Program**: [SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ](https://solscan.io/account/SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ)
- **OOBE Protocol**: [oobeprotocol.ai](https://oobeprotocol.ai)
