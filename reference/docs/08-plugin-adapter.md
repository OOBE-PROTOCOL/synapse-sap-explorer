# Plugin Adapter

> 52 tools · 8 on-chain protocols · one `SynapsePlugin` install.

The plugin adapter bridges the full SAP v2 protocol surface into the **SynapseAgentKit** ecosystem. Every on-chain instruction is exposed as a LangChain-compatible `StructuredTool` with Zod-validated inputs, LLM-friendly descriptions, and automatic `PublicKey ↔ string` serialization — meaning an LLM can call any SAP instruction without ever touching Solana primitives directly.

---

## Quick Start

```typescript
import { SynapseAgentKit } from "@oobe-protocol-labs/synapse-client-sdk/ai/plugins";
import { createSAPPlugin } from "@synapse-sap/sdk/plugin";

const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({ rpcUrl })
  .use(sapPlugin);

const tools = kit.getTools(); // → StructuredTool[] (LangChain)
// 52 tools ready for agent orchestration
```

That's it. The plugin registers all 8 protocol domains, wires the executor to your `SapClient`, and translates every LLM-generated JSON blob into valid Anchor instructions.

---

## Architecture

The plugin follows a four-layer pipeline:

```
┌──────────────────────────────────────────────────────────┐
│  LLM / Agent Runtime                                     │
│  (LangChain, Vercel AI, custom orchestrator)             │
└──────────────┬───────────────────────────────────────────┘
               │  JSON tool call
               ▼
┌──────────────────────────────────────────────────────────┐
│  1. Schemas (Zod)                                        │
│  Runtime validation + LLM-friendly .describe() strings   │
└──────────────┬───────────────────────────────────────────┘
               │  Validated input
               ▼
┌──────────────────────────────────────────────────────────┐
│  2. Protocols (8 domains)                                │
│  Method registries mapping tool names → schema pairs     │
└──────────────┬───────────────────────────────────────────┘
               │  ProtocolMethod + input
               ▼
┌──────────────────────────────────────────────────────────┐
│  3. Executor                                             │
│  Dispatches to SapClient module methods                  │
│  Handles serialization bridge (see below)                │
└──────────────┬───────────────────────────────────────────┘
               │  Anchor instruction
               ▼
┌──────────────────────────────────────────────────────────┐
│  4. Solana RPC                                           │
│  Transaction submitted, confirmed, signature returned    │
└──────────────────────────────────────────────────────────┘
```

### Why This Matters

LLMs produce JSON strings. Solana instructions expect `PublicKey`, `BN`, `Buffer`, and Anchor enum variants. The executor layer bridges that gap automatically — your agent never has to worry about type conversions.

---

## Plugin Metadata

Every `SynapsePlugin` exposes a `meta` object for registry discovery:

```typescript
const plugin = createSAPPlugin({ provider });

console.log(plugin.meta);
// {
//   id:          "sap-v2",
//   name:        "Synapse Agent Protocol",
//   version:     "0.1.0",
//   description: "52 tools across 8 on-chain SAP v2 protocol domains …",
//   tags:        ["solana", "agent", "sap", "x402", "escrow", "vault", …]
// }
```

| Field | Value |
|-------|-------|
| `id` | `"sap-v2"` |
| `name` | `"Synapse Agent Protocol"` |
| `version` | `"0.1.0"` |
| `tags` | `solana`, `agent`, `sap`, `x402`, `escrow`, `vault`, `memory`, `reputation` |

---

## The 8 Protocol Domains

Each domain maps 1:1 to a `SapClient` module and contains a focused set of tools.

### Agent Identity — `sap-agent` (8 tools)

On-chain agent registration, lifecycle management, and reputation metrics.

| Tool | Description |
|------|-------------|
| `registerAgent` | Register a new AI agent with capabilities, pricing tiers, and x402 endpoint |
| `updateAgent` | Update metadata, capabilities, or pricing tiers |
| `deactivateAgent` | Mark agent inactive for discovery |
| `reactivateAgent` | Reactivate a previously deactivated agent |
| `reportCalls` | Self-report call count (updates AgentStats) |
| `updateReputation` | Update latency and uptime metrics for reputation scoring |
| `fetchAgent` | Fetch full agent identity from on-chain PDA |
| `fetchGlobalRegistry` | Fetch network-wide stats (total agents, tools, vaults, escrows) |

### Trustless Reputation — `sap-feedback` (4 tools)

On-chain feedback tied to agent identity PDAs.

| Tool | Description |
|------|-------------|
| `giveFeedback` | Leave feedback for an agent (score 1–5, tag, optional comment hash) |
| `updateFeedback` | Update an existing feedback entry (original reviewer only) |
| `revokeFeedback` | Revoke feedback — excluded from reputation calculations |
| `fetchFeedback` | Fetch a specific feedback entry between reviewer and agent |

### Web of Trust — `sap-attestation` (3 tools)

Cross-agent attestations for identity, capability, and compliance verification.

| Tool | Description |
|------|-------------|
| `createAttestation` | Create an on-chain attestation vouching for an agent |
| `revokeAttestation` | Revoke a previously issued attestation (original attester only) |
| `fetchAttestation` | Fetch an attestation between attester and agent |

### x402 Escrow — `sap-escrow` (6 tools)

Micropayment escrow for agent-to-agent and consumer-to-agent settlements.

| Tool | Description |
|------|-------------|
| `createEscrow` | Create a pre-funded escrow account (SOL or SPL, with volume curve) |
| `depositEscrow` | Deposit additional funds into an existing escrow |
| `settleEscrow` | Agent settles N calls — claims proportional funds |
| `withdrawEscrow` | Client withdraws remaining funds from escrow |
| `batchSettle` | Batch settlement — up to 10 settlements in a single transaction |
| `fetchEscrow` | Fetch escrow account data (balance, settled amounts, pricing, expiry) |

### Tool Registry — `sap-tools` (7 tools)

On-chain tool definitions with schema hashing and invocation tracking.

| Tool | Description |
|------|-------------|
| `publishToolByName` | Publish a tool descriptor with name, protocol, schema hashes, HTTP method, and category |
| `inscribeToolSchema` | Inscribe full JSON schema into transaction logs (zero rent) |
| `updateTool` | Update schema hashes and bump version number |
| `deactivateTool` | Deactivate a tool — still discoverable but marked unavailable |
| `reactivateTool` | Reactivate a previously deactivated tool |
| `reportInvocations` | Report invocation count for analytics and ranking |
| `fetchTool` | Fetch tool descriptor (schema hashes, version, invocation count, category) |

### Encrypted Memory Vault — `sap-vault` (10 tools)

Vault lifecycle, session management, encrypted memory inscription, and delegation.

| Tool | Description |
|------|-------------|
| `initVault` | Initialize an encrypted memory vault (AES-256-GCM nonce) |
| `openSession` | Open a conversation session within a vault (session hash) |
| `inscribeMemory` | Inscribe encrypted data into the transaction log (zero rent, permanent) |
| `closeSession` | Finalize a session — no more inscriptions allowed |
| `closeVault` | Close the MemoryVault PDA and reclaim rent |
| `rotateNonce` | Rotate the vault encryption nonce (increments nonceVersion) |
| `addDelegate` | Authorize a delegate (hot wallet) with permission bitmask and expiry |
| `revokeDelegate` | Revoke a delegate's vault authorization |
| `fetchVault` | Fetch vault metadata (session count, inscription count, nonce version) |
| `fetchSession` | Fetch session data (sequence counter, epoch info, closure status) |

### Discovery Indexes — `sap-indexing` (8 tools)

On-chain capability and protocol indexes for agent discovery.

| Tool | Description |
|------|-------------|
| `initCapabilityIndex` | Create a capability index with the caller as first entry |
| `addToCapabilityIndex` | Add caller's agent to an existing capability index |
| `removeFromCapabilityIndex` | Remove caller's agent from a capability index |
| `initProtocolIndex` | Create a protocol index with the caller as first entry |
| `addToProtocolIndex` | Add caller's agent to an existing protocol index |
| `removeFromProtocolIndex` | Remove caller's agent from a protocol index |
| `fetchCapabilityIndex` | Fetch all agents registered for a given capability |
| `fetchProtocolIndex` | Fetch all agents registered for a given protocol |

### Unified Memory Ledger — `sap-ledger` (6 tools)

Ring-buffer ledgers with permanent sealed archive pages.

| Tool | Description |
|------|-------------|
| `initLedger` | Create a MemoryLedger with 4 KB ring buffer (~0.032 SOL rent) |
| `writeLedger` | Write data to ring buffer + transaction log simultaneously |
| `sealLedger` | Seal ring buffer into a permanent LedgerPage (~0.031 SOL rent) |
| `closeLedger` | Close ledger PDA and reclaim ~0.032 SOL rent |
| `fetchLedger` | Fetch ledger metadata (entry count, data size, page count, merkle root) |
| `fetchLedgerPage` | Fetch a sealed LedgerPage (permanent archive with merkle proof) |

---

## Zod Schemas & Type Safety

Every tool has a pair of Zod schemas — `input` and `output` — defined in the `plugin/schemas` module. These serve three purposes:

1. **Runtime validation**: the executor validates LLM-generated JSON before dispatching.
2. **LangChain integration**: schemas drive `StructuredTool` generation via `.describe()`.
3. **MCP / Vercel AI compatibility**: the same schemas can be used to produce tool descriptors for other AI frameworks.

### Schema Conventions

| Solana Type | Zod Representation | Example |
|-------------|-------------------|---------|
| `PublicKey` | `z.string().min(32).max(44)` | `"SAPTU7aUXk2Aa…"` |
| `BN` / `u64` | `z.string()` (numeric) | `"1000000000"` |
| `[u8; 32]` hash | `z.array(z.number()).length(32)` | `[0, 128, …]` |
| Anchor enum | `z.enum(["sol", "usdc", "spl"])` | `"usdc"` |

All write operations return `{ txSignature: string }` in the output schema.

```typescript
import { agentSchemas } from "@synapse-sap/sdk/plugin";

// Type-safe input inference
type RegisterInput = z.infer<typeof agentSchemas.registerAgent.input>;
// {
//   name: string;
//   description: string;
//   capabilities: { id: string; description?: string; ... }[];
//   pricing: { tierId: string; pricePerCall: string; ... }[];
//   protocols: string[];
// }
```

---

## Serialization Bridge

The executor handles all type conversions automatically when dispatching tool calls:

| Direction | Conversion |
|-----------|-----------|
| LLM → Chain | Base58 `string` → `PublicKey` |
| LLM → Chain | Numeric `string` → `BN` |
| LLM → Chain | Hex `string` → `Buffer` / `Uint8Array` |
| LLM → Chain | Enum `string` → Anchor variant (`{ sol: {} }`) |
| Chain → LLM | `PublicKey` → Base58 `string` |
| Chain → LLM | `BN` → Numeric `string` |

This means an LLM can produce:

```json
{
  "agent": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "amount": "1000000000"
}
```

…and the executor will convert `agent` to a `PublicKey` and `amount` to a `BN` before calling the Anchor instruction. No manual conversion required.

---

## The `install()` Lifecycle

When `SynapseAgentKit.use(plugin)` is called, the kit invokes `plugin.install(context)`:

```typescript
// What happens under the hood:
const result = sapPlugin.install({
  client: { transport: rpcTransport },
  config: kitConfig,
});

// result.executor  → (method, input) => Promise<output>
// result.teardown  → optional cleanup callback
```

The returned `executor` function is bound to the `SapClient` instance created from your `provider`. It resolves the target module method by protocol ID, deserializes the input, calls the method, and serializes the output back to plain JSON.

---

## Configuration

```typescript
import { createSAPPlugin } from "@synapse-sap/sdk/plugin";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Minimal — uses canonical program ID
const plugin = createSAPPlugin({
  provider: AnchorProvider.env(),
});

// With custom program ID (e.g. localnet deployment)
const plugin = createSAPPlugin({
  provider,
  programId: new PublicKey("YourCustomProgramId…"),
});
```

The `SAPPluginConfig` interface accepts:

| Property | Type | Required | Default |
|----------|------|----------|---------|
| `provider` | `AnchorProvider` | Yes | — |
| `programId` | `PublicKey` | No | `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` |

---

## Full Integration Example

```typescript
import { SynapseAgentKit } from "@oobe-protocol-labs/synapse-client-sdk/ai/plugins";
import { createSAPPlugin } from "@synapse-sap/sdk/plugin";
import { AnchorProvider } from "@coral-xyz/anchor";

// 1. Create the plugin
const provider = AnchorProvider.env();
const sapPlugin = createSAPPlugin({ provider });

// 2. Install into agent kit
const kit = new SynapseAgentKit({
  rpcUrl: "https://synapse.oobeprotocol.ai",
}).use(sapPlugin);

// 3. Get LangChain-compatible tools
const tools = kit.getTools();
console.log(`Loaded ${tools.length} SAP tools`);
// → "Loaded 52 SAP tools"

// 4. Use in a LangChain agent
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createStructuredChatAgent } from "langchain/agents";

const llm = new ChatOpenAI({ model: "gpt-4o" });
const agent = await createStructuredChatAgent({ llm, tools, prompt });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

const result = await executor.invoke({
  input: "Register a new agent called SwapBot with Jupiter swap capability",
});
```

---

## Protocol Summary

| Protocol | ID | Tools | Domain |
|----------|----|-------|--------|
| Agent Identity | `sap-agent` | 8 | Registration, lifecycle, reputation |
| Trustless Reputation | `sap-feedback` | 4 | On-chain feedback |
| Web of Trust | `sap-attestation` | 3 | Cross-agent attestations |
| x402 Escrow | `sap-escrow` | 6 | Micropayments |
| Tool Registry | `sap-tools` | 7 | Tool schemas, versioning |
| Encrypted Memory Vault | `sap-vault` | 10 | Vault, sessions, delegation |
| Discovery Indexes | `sap-indexing` | 8 | Capability/protocol indexes |
| Unified Memory Ledger | `sap-ledger` | 6 | Ring buffer, sealed pages |
| **Total** | | **52** | |

---

**Previous**: [Tools & Schemas](./07-tools-schemas.md) · **Next**: [Best Practices →](./09-best-practices.md)
