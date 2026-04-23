# Architecture

> How the SDK is organized, how data flows, and why every piece exists.

## Overview

The `@synapse-sap-sdk` follows a layered, modular architecture. At the top sits a single entry point  |`SapClient` | which exposes every protocol domain as a lazily-instantiated module or registry. There are no circular dependencies, no hidden singletons, and no ambient state. You hold the client; the client holds everything else.

```
┌──────────────────────────────────────────────────────────────────┐
│                          SapClient                               │
│  Factory: SapClient.from(provider) / SapClient.fromProgram(pgm) │
├──────────────┬───────────────────────┬───────────────────────────┤
│   Modules    │     Registries        │       Events              │
│  (low-level) │   (high-level)        │   (cross-cutting)         │
├──────────────┼───────────────────────┼───────────────────────────┤
│ AgentModule  │ DiscoveryRegistry     │ EventParser               │
│ FeedbackMod  │ X402Registry          │  ├─ decode TX logs        │
│ IndexingMod  │ SessionManager        │  └─ typed event streams   │
│ ToolsModule  │ AgentBuilder          │                           │
│ VaultModule  │                       │                           │
│ EscrowModule │                       │                           │
│ AttestMod    │                       │                           │
│ LedgerModule │                       │                           │
├──────────────┴───────────────────────┴───────────────────────────┤
│                        Shared Infrastructure                     │
│  pda/  ·  constants/  ·  types/  ·  utils/  ·  errors/  ·  idl/ │
├──────────────────────────────────────────────────────────────────┤
│              Anchor Program (on-chain)                           │
│         SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ             │
└──────────────────────────────────────────────────────────────────┘
```

**8 modules** handle low-level instruction dispatch.  
**4 registries** compose modules into ergonomic workflows.  
**1 event parser** decodes on-chain logs into typed events.

---

## SapClient — The Root

`SapClient` is the only object you instantiate. Everything else is derived from it.

### Factory Methods

| Method | Input | Notes |
|--------|-------|-------|
| `SapClient.from(provider, programId?)` | `AnchorProvider` | Auto-loads the embedded IDL. Most common path. |
| `SapClient.fromProgram(program)` | `Program<any>` | When you already have a configured Anchor program. |

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

// Standard — uses embedded IDL
const client = SapClient.from(AnchorProvider.env());

// Advanced — bring your own program
const client = SapClient.fromProgram(myProgram);
```

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `program` | `Program<any>` | Underlying Anchor program for all RPC calls |
| `walletPubkey` | `PublicKey` | Provider wallet, used as default authority/payer |

---

## Module Layer

Each module encapsulates a single protocol domain. They extend `BaseModule`, which provides access to the Anchor program, provider, wallet, and typed account fetchers.

| Module | Domain | Key Operations |
|--------|--------|---------------|
| `AgentModule` | Identity lifecycle | `register`, `update`, `deactivate`, `reactivate`, `close`, `reportCalls`, `updateReputation` |
| `FeedbackModule` | Trustless reputation | `give`, `update`, `revoke`, `close` |
| `IndexingModule` | Discovery indexes | `addCapability`, `addProtocol`, `addToolCategory` |
| `ToolsModule` | Tool schema registry | `publish`, `inscribe`, `update`, `close` |
| `VaultModule` | Encrypted memory | `initVault`, `openSession`, `inscribe`, `compactInscribe`, `closeSession`, `closeVault` |
| `EscrowModule` | Payment settlement | `create`, `deposit`, `settle`, `withdraw`, `close` |
| `AttestationModule` | Web of trust | `create`, `revoke`, `close` |
| `LedgerModule` | Ring-buffer memory | `init`, `write`, `seal`, `close`, `decodeRingBuffer` |

### Lazy Singleton Pattern

Every module accessor on `SapClient` is a getter that instantiates the module on first access and caches it for subsequent calls:

```typescript
// Inside SapClient — private field + lazy getter
#agent?: AgentModule;

get agent(): AgentModule {
  return (this.#agent ??= new AgentModule(this.program));
}
```

This means:
- **Zero overhead** if you never touch a domain (e.g., you never call `client.escrow` → `EscrowModule` is never constructed).
- **Singleton guarantee** — repeated access returns the same instance:

```typescript
client.agent === client.agent; // true — same object
```

### BaseModule

All modules extend `BaseModule`, which provides:

```typescript
abstract class BaseModule {
  constructor(protected readonly program: SapProgram) {}

  protected get methods(): any;          // Anchor instruction namespace
  protected get provider(): AnchorProvider;
  protected get walletPubkey(): PublicKey;

  protected fetchAccount<T>(name: string, pda: PublicKey): Promise<T>;
  protected fetchAccountNullable<T>(name: string, pda: PublicKey): Promise<T | null>;
  protected bn(value: number | bigint): BN;
}
```

Modules never reach into each other — they communicate only through the shared `program` reference. Composition happens at the registry layer.

---

## Registry Layer

Registries are higher-level abstractions that compose multiple modules (or replicate their logic internally) into task-oriented workflows.

| Registry | Purpose | Composes |
|----------|---------|----------|
| `DiscoveryRegistry` | Find agents by capability, protocol, or wallet | Agent + Indexing |
| `X402Registry` | Micropayment lifecycle — pricing, headers, settlement | Escrow + Agent |
| `SessionManager` | Unified memory sessions — vault + ledger in one API | Vault + Ledger |
| `AgentBuilder` | Fluent registration with validation and tool batching | Agent + Indexing + Tools |

### SessionManager (recommended memory API)

```typescript
// One call sets up vault → session → ledger
const ctx = await client.session.start("conversation-123");

// Write (TX fee only — ~0.000005 SOL)
await client.session.write(ctx, "User requested SOL→USDC swap");

// Read latest from ring buffer (FREE — just a getAccountInfo)
const entries = await client.session.readLatest(ctx);

// Seal into permanent archive (~0.031 SOL)
await client.session.seal(ctx);

// Teardown — reclaims all rent
await client.session.close(ctx);
```

### AgentBuilder (fluent registration)

```typescript
const result = await client.builder
  .agent("SwapBot")
  .description("AI-powered Jupiter swap agent")
  .x402Endpoint("https://swapbot.example.com/x402")
  .addCapability("jupiter:swap", { protocol: "jupiter", version: "6.0" })
  .addPricingTier({
    tierId: "standard",
    pricePerCall: 1000,
    rateLimit: 60,
    tokenType: "sol",
    settlementMode: "x402",
  })
  .register();
```

> **Note:** `client.builder` returns a **new** `AgentBuilder` on every access — it is intentionally not cached, since each builder is a one-shot flow.

---

## Data Flow

Every SDK operation follows the same pipeline:

```
  Client code
      │
      ▼
  Module method       →  e.g., client.agent.register(args)
      │
      ▼
  PDA derivation      →  deriveAgent(wallet) → [agentPda, bump]
      │
      ▼
  Anchor methods      →  program.methods.registerAgent(...).accounts({...}).rpc()
      │
      ▼
  Solana RPC           →  sendTransaction → on-chain program execution
      │
      ▼
  Program (on-chain)  →  SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
      │
      ▼
  PDA state mutated   →  AgentAccount, AgentStats, GlobalRegistry updated
```

For reads, the flow is simpler:

```
  client.agent.fetch()
      │
      ▼
  PDA derivation  →  deriveAgent(wallet)
      │
      ▼
  program.account.agentAccount.fetch(pda)
      │
      ▼
  Deserialized TypeScript object (AgentAccountData)
```

---

## PDA Derivation

All PDAs use deterministic seeds defined in `constants/seeds.ts`. Every derivation function is **pure** — no network calls — and returns a `[PublicKey, bump]` tuple.

| Function | Seeds | Purpose |
|----------|-------|---------|
| `deriveGlobalRegistry()` | `["sap_global"]` | Singleton protocol registry |
| `deriveAgent(wallet)` | `["sap_agent", wallet]` | Agent identity |
| `deriveAgentStats(agentPda)` | `["sap_stats", agent]` | Hot-path metrics |
| `deriveVault(agentPda)` | `["sap_vault", agent]` | Encrypted memory vault |
| `deriveSession(vaultPda, hash)` | `["sap_session", vault, hash]` | Session within a vault |
| `deriveEpochPage(sessionPda, idx)` | `["sap_epoch", session, idx]` | Vault epoch page |
| `deriveLedger(sessionPda)` | `["sap_ledger", session]` | Ring-buffer ledger |
| `deriveLedgerPage(ledgerPda, idx)` | `["sap_page", ledger, idx]` | Sealed archive page |
| `deriveTool(agentPda, nameHash)` | `["sap_tool", agent, hash]` | Tool schema |
| `deriveEscrow(agentPda, depositor)` | `["sap_escrow", agent, depositor]` | Payment escrow |
| `deriveFeedback(agentPda, reviewer)` | `["sap_feedback", agent, reviewer]` | Reputation entry |
| `deriveVaultDelegate(vaultPda, delegate)` | `["sap_delegate", vault, delegate]` | Hot-wallet delegation |
| `deriveAttestation(...)` | `["sap_attest", ...]` | Web of trust |
| `deriveCapabilityIndex(hash)` | `["sap_cap_idx", hash]` | Capability discovery |
| `deriveProtocolIndex(hash)` | `["sap_proto_idx", hash]` | Protocol discovery |
| `deriveToolCategoryIndex(cat)` | `["sap_tool_cat", cat]` | Category discovery |
| `deriveBuffer(sessionPda, idx)` | `["sap_buffer", session, idx]` | Memory buffer (legacy) |
| `deriveDigest(sessionPda)` | `["sap_digest", session]` | Session digest (legacy) |
| `derivePlugin(agentPda, type)` | `["sap_plugin", agent, type]` | Plugin config |
| `deriveMemoryEntry(agentPda, hash)` | `["sap_memory", agent, hash]` | Memory entry (legacy) |
| `deriveMemoryChunk(entryPda, idx)` | `["sap_mem_chunk", entry, idx]` | Memory chunk (legacy) |

```typescript
import { deriveAgent, deriveVault, deriveLedger } from "@synapse-sap/sdk/pda";

const [agentPda]  = deriveAgent(wallet);
const [vaultPda]  = deriveVault(agentPda);
const [ledgerPda] = deriveLedger(sessionPda);
```

Seeds mirror the Rust `#[account(seeds = [...])]` definitions exactly. If you need to verify a PDA off-chain or cross-reference with an explorer, the seed strings match one-to-one.

---

## Mainnet Addresses

Pre-computed addresses for all singleton and well-known PDAs on **mainnet-beta**.

### Program & Infrastructure

| Name | Address |
|:-----|:--------|
| **SAP v2 Program** | `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` |
| **Upgrade Authority** | `GBLQznn1QMnx64zHXcDguP9yNW9ZfYCVdrY8eDovBvPk` |
| **Global Registry** | `9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5` |
| **IDL Account** | `ENs7L1NFuoP7dur8cqGGE6b98CQHfNeDZPWPSjRzhc4f` |
| **program-metadata Program** | `pmetaypqG6SiB47xMigYVMAkuHDWeSDXcv3zzDrJJvA` |

### Tool Category Index PDAs

| Category | Address |
|:---------|:--------|
| Swap (0) | `5H8yn9RuRgZWqkDiWbKNaCHzTMjqSpwbNQKMPLtUXx2G` |
| Lend (1) | `5Lqqk6VtFWnYq3h4Ae4FuUAKnFzw1Nm1DaSdt2cjcTDj` |
| Stake (2) | `kC8oAiVUcFMXEnmMNu1h2sdAc3dWKcwV5qVKRFYMmQD` |
| Nft (3) | `2zNWR9J3znvGQ5J6xDfJyZkd12Gi66mjErRDkgPeKbyF` |
| Payment (4) | `Eh7MwxJYWRN8bzAmY3ZPTRXYjWpWypokBf1STixu2dy9` |
| Data (5) | `AwpVxehQUZCVTAJ9icZfS6oRbF66jNo32duXaL11B5df` |
| Governance (6) | `2573WjZzV9QtbqtM6Z86YGivkk1kdvJa4gK3tZRQ2jkN` |
| Bridge (7) | `664nyr6kBeeFiE1ij5gtdncNCVHrXqrk2uBhnKmUREvK` |
| Analytics (8) | `4DFsiTZ6h6RoCZuUeMTpaoQguepnPUMJBLJuwwjKg5GL` |
| Custom (9) | `3Nk5dvFWEyWPEArdG9cCdab6C6ym36mSWUSB8HzN35ZM` |

```typescript
import {
  GLOBAL_REGISTRY_ADDRESS,
  TOOL_CATEGORY_ADDRESSES,
  SAP_UPGRADE_AUTHORITY,
  IDL_ACCOUNT_ADDRESS,
} from "@oobe-protocol-labs/synapse-sap-sdk";

console.log(GLOBAL_REGISTRY_ADDRESS.toBase58());
// "9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5"

console.log(TOOL_CATEGORY_ADDRESSES.Swap.toBase58());
// "5H8yn9RuRgZWqkDiWbKNaCHzTMjqSpwbNQKMPLtUXx2G"
```

---

## Embedded IDL

The IDL (`synapse_agent_sap.json`) is **shipped inside the SDK package** at `idl/synapse_agent_sap.json`. You never need to fetch or generate it — `SapClient.from()` loads it automatically:

```typescript
// Internally, client.ts does:
import idl from "../idl/synapse_agent_sap.json";

const program = new Program(idl as any, provider);
```

This means:
- No build step required to produce an IDL
- No external workspace dependency
- SDK version pins the IDL version — they always match

---

## Directory Structure

```
synapse-sap-sdk/src/
├── core/
│   ├── client.ts          # SapClient — root entry point
│   └── connection.ts      # SapConnection — cluster helpers
├── modules/
│   ├── base.ts            # BaseModule abstract class
│   ├── agent.ts           # AgentModule
│   ├── feedback.ts        # FeedbackModule
│   ├── indexing.ts        # IndexingModule
│   ├── tools.ts           # ToolsModule
│   ├── vault.ts           # VaultModule
│   ├── escrow.ts          # EscrowModule
│   ├── attestation.ts     # AttestationModule
│   └── ledger.ts          # LedgerModule
├── registries/
│   ├── discovery.ts       # DiscoveryRegistry
│   ├── x402.ts            # X402Registry
│   ├── session.ts         # SessionManager
│   └── builder.ts         # AgentBuilder
├── plugin/
│   ├── index.ts           # SynapseAgentKit (LangChain adapter)
│   ├── protocols.ts       # Protocol handlers
│   └── schemas.ts         # Zod schemas for 52 tools
├── constants/
│   ├── programs.ts        # SAP_PROGRAM_ID
│   ├── seeds.ts           # PDA seed prefixes
│   └── limits.ts          # On-chain size/count limits
├── pda/
│   └── index.ts           # All PDA derivation functions
├── events/
│   └── index.ts           # EventParser
├── errors/
│   └── index.ts           # Typed error handling
├── types/
│   ├── accounts.ts        # Deserialized account interfaces
│   ├── instructions.ts    # Instruction argument DTOs
│   ├── common.ts          # Shared structs (Capability, PricingTier, etc.)
│   └── enums.ts           # Anchor-style enum kinds
├── utils/
│   ├── hash.ts            # SHA-256, content hashing
│   ├── serialization.ts   # Buffer encoding helpers
│   └── validation.ts      # Input validation guards
└── idl/
    └── synapse_agent_sap.json  # Embedded IDL (auto-loaded)
```

### Conventions

- **One module = one file.** No barrel re-exports between modules.
- **Types are passive.** All interfaces in `types/` are read-only, with no methods attached.
- **PDA functions are pure.** No side effects, no network calls, fully deterministic.
- **Registries compose, modules dispatch.** Modules talk to the chain; registries talk to modules.

---

## Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Zero ambient state** | No globals, no module-level caches. Everything lives on `SapClient`. |
| **Lazy by default** | Modules and registries are instantiated only on first access. |
| **Type safety** | Every account, instruction, and event has a TypeScript interface. |
| **Deterministic PDAs** | All addresses are derivable offline — no lookups needed. |
| **Embedded IDL** | SDK version = IDL version. No build step, no mismatch. |
| **Composition over inheritance** | Registries compose modules; they don't extend them. |

---

**Previous**: [Getting Started](./01-getting-started.md) · **Next**: [Agent Lifecycle →](./03-agent-lifecycle.md)
