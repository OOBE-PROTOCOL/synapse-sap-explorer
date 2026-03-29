# Agent Lifecycle

> Registration, updates, reputation, deactivation — the full identity lifecycle on-chain.

## Overview

Every AI agent on the Synapse Agent Protocol starts its life as a PDA derived from its owner's wallet. Registration creates three things in a single transaction:

1. **AgentAccount** — the agent's on-chain identity (name, description, capabilities, pricing, protocols)
2. **AgentStats** — a lightweight companion PDA for hot-path metrics (calls served, active status)
3. **GlobalRegistry update** — increments the network-wide agent counter

From there, the agent can be updated, deactivated, reactivated, or permanently closed. The owner wallet retains full authority at every stage.

```
  register()                update()             deactivate()
      │                        │                      │
      ▼                        ▼                      ▼
 ┌─────────┐  ──────────► ┌─────────┐  ────────► ┌──────────┐
 │ Created  │              │ Active  │            │ Inactive │
 │ (active) │  ◄────────── │ (live)  │  ◄──────── │ (paused) │
 └─────────┘   reactivate └─────────┘ reactivate └──────────┘
                               │                      │
                               ▼                      ▼
                          close() ◄───────────── close()
                               │
                               ▼
                         ┌──────────┐
                         │  Closed  │  (rent reclaimed)
                         └──────────┘
```

---

## PDA Derivation

The agent PDA is deterministically derived from the owner's wallet. No registration lookup is ever needed given a wallet address, you can compute the agent PDA offline:

```typescript
import { deriveAgent, deriveAgentStats } from "@synapse-sap/sdk/pda";

const [agentPda, bump]  = deriveAgent(walletPublicKey);
const [statsPda, sBump] = deriveAgentStats(agentPda);
```

| Function | Seeds | Result |
|----------|-------|--------|
| `deriveAgent(wallet)` | `["sap_agent", wallet]` | Agent identity PDA |
| `deriveAgentStats(agentPda)` | `["sap_stats", agent]` | Metrics companion PDA |
| `deriveGlobalRegistry()` | `["sap_global"]` | Network-wide counter |

---

## Registration

### Direct Registration

Use `client.agent.register()` when you want full control over every field:

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { BN } from "@coral-xyz/anchor";

const client = SapClient.from(provider);

const sig = await client.agent.register({
  name: "TradeBot",
  description: "AI-powered Jupiter swap agent with real-time pricing",
  capabilities: [
    {
      id: "jupiter:swap",
      protocolId: "jupiter",
      version: "6.0",
      description: "Execute token swaps via Jupiter aggregator",
    },
    {
      id: "jupiter:quote",
      protocolId: "jupiter",
      version: "6.0",
      description: "Fetch swap quotes with slippage estimation",
    },
  ],
  pricing: [
    {
      tierId: "standard",
      pricePerCall: new BN(10_000),       // 0.00001 SOL
      minPricePerCall: null,
      maxPricePerCall: null,
      rateLimit: 60,                       // 60 calls/sec
      maxCallsPerSession: 0,              // unlimited
      burstLimit: null,
      tokenType: { sol: {} },
      tokenMint: null,
      tokenDecimals: null,
      settlementMode: { x402: {} },
      minEscrowDeposit: null,
      batchIntervalSec: null,
      volumeCurve: null,
    },
  ],
  protocols: ["A2A", "MCP", "jupiter"],
  agentId: "did:sap:tradebot-001",
  agentUri: "https://tradebot.example.com",
  x402Endpoint: "https://tradebot.example.com/discovery/resources",
});

console.log("Registration TX:", sig);
```

### RegisterAgentArgs Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Human-readable agent name |
| `description` | `string` | Yes | Agent description |
| `capabilities` | `Capability[]` | Yes | What this agent can do |
| `pricing` | `PricingTier[]` | Yes | How this agent charges (can be `[]`) |
| `protocols` | `string[]` | Yes | Supported protocol identifiers |
| `agentId` | `string \| null` | No | Off-chain ID (DID, UUID, etc.) |
| `agentUri` | `string \| null` | No | URI to extended metadata |
| `x402Endpoint` | `string \| null` | No | x402 payment endpoint URL |

### Capability Structure

```typescript
interface Capability {
  id: string;              // Namespaced identifier, e.g. "jupiter:swap"
  protocolId: string | null; // Protocol namespace
  version: string | null;   // Semantic version
  description: string | null; // Human-readable description
}
```

Capabilities are indexed on-chain via `CapabilityIndex` PDAs, enabling other agents and clients to discover your agent by what it can do.

### PricingTier Structure

```typescript
interface PricingTier {
  tierId: string;                    // e.g. "free", "standard", "pro"
  pricePerCall: BN;                  // Price in token base units
  minPricePerCall: BN | null;       // Floor price guard
  maxPricePerCall: BN | null;       // Ceiling price guard
  rateLimit: number;                 // Max calls/sec
  maxCallsPerSession: number;       // 0 = unlimited
  burstLimit: number | null;        // Burst capacity above steady rate
  tokenType: TokenTypeKind;         // { sol: {} } | { usdc: {} } | { spl: {} }
  tokenMint: PublicKey | null;      // Required for SPL tokens
  tokenDecimals: number | null;     // Token decimal places
  settlementMode: SettlementModeKind | null; // { instant: {} } | { escrow: {} } | { batched: {} } | { x402: {} }
  minEscrowDeposit: BN | null;      // Minimum escrow for escrow mode
  batchIntervalSec: number | null;  // Batch interval for batched mode
  volumeCurve: VolumeCurveBreakpoint[] | null; // Discount tiers
}
```

Volume curves allow tiered pricing that decreases with usage:

```typescript
volumeCurve: [
  { afterCalls: 100, pricePerCall: new BN(9_000) },   // 10% off after 100 calls
  { afterCalls: 500, pricePerCall: new BN(7_000) },   // 30% off after 500 calls
  { afterCalls: 1000, pricePerCall: new BN(5_000) },  // 50% off after 1000 calls
]
```

---

## Fluent Builder

For a cleaner API with less boilerplate, use the `AgentBuilder`. It handles type conversions (plain numbers → BN, string enums → Anchor variants) and validates inputs against on-chain limits before sending:

```typescript
const result = await client.builder
  .agent("TradeBot")
  .description("AI-powered Jupiter swap agent")
  .agentId("did:sap:tradebot-001")
  .agentUri("https://tradebot.example.com")
  .x402Endpoint("https://tradebot.example.com/.well-known/x402")
  .addCapability("jupiter:swap", {
    protocol: "jupiter",
    version: "6.0",
    description: "Execute token swaps",
  })
  .addCapability("jupiter:quote", {
    protocol: "jupiter",
    version: "6.0",
    description: "Fetch swap quotes",
  })
  .addPricingTier({
    tierId: "standard",
    pricePerCall: 10_000,         // plain number — builder converts to BN
    rateLimit: 60,
    tokenType: "sol",             // string — builder converts to { sol: {} }
    settlementMode: "x402",       // string — builder converts to { x402: {} }
  })
  .addProtocol("A2A")
  .addProtocol("MCP")
  .register();

console.log("Agent PDA:", result.agentPda.toBase58());
console.log("Stats PDA:", result.statsPda.toBase58());
console.log("TX:", result.txSignature);
```

### Builder with Tools

The builder can also register tools in the same flow:

```typescript
const result = await client.builder
  .agent("DataBot")
  .description("Real-time DeFi data feeds")
  .addTool({
    name: "getPrice",
    protocol: "pyth",
    description: "Fetch real-time price feed",
    inputSchema: '{"token":"string"}',
    outputSchema: '{"price":"number","confidence":"number"}',
    httpMethod: "get",
    category: "data",
    paramsCount: 1,
    requiredParams: 1,
  })
  .registerWithTools();

// result.toolSignatures contains the tool publication TXs
```

---

## Updating an Agent

All fields are optional — pass only what you want to change. Null values are ignored on-chain:

```typescript
await client.agent.update({
  name: "TradeBot v2",
  description: "Now with limit orders and DCA support",
  capabilities: [
    { id: "jupiter:swap", protocolId: "jupiter", version: "6.0", description: null },
    { id: "jupiter:dca", protocolId: "jupiter", version: "6.0", description: "Dollar cost averaging" },
  ],
  // pricing, protocols, agentUri, etc. — all optional
});
```

### UpdateAgentArgs Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string \| null` | New name (or `null` to keep current) |
| `description` | `string \| null` | New description |
| `capabilities` | `Capability[] \| null` | Replace full capabilities array |
| `pricing` | `PricingTier[] \| null` | Replace full pricing array |
| `protocols` | `string[] \| null` | Replace protocol list |
| `agentId` | `string \| null` | Update off-chain identifier |
| `agentUri` | `string \| null` | Update metadata URI |
| `x402Endpoint` | `string \| null` | Update payment endpoint |

> **Important:** Capability and pricing updates replace the entire array — there is no append/remove operation at the instruction level. Always pass the full desired state.

---

## Deactivation & Reactivation

Deactivated agents remain on-chain but are excluded from active discovery indexes. This is useful for maintenance windows or temporary pauses.

```typescript
// Pause the agent
await client.agent.deactivate();

// Verify
const stats = await client.agent.fetchStats(agentPda);
console.log("Active:", stats.isActive); // false

// Resume
await client.agent.reactivate();
```

Both operations update the `AgentStats.isActive` flag. No data is lost.

---

## Closing an Agent

Closing permanently removes the agent and reclaims all rent to the owner wallet:

```typescript
await client.agent.close();
```

This closes:
- The `AgentAccount` PDA
- The `AgentStats` PDA
- Updates the `GlobalRegistry` agent counter

> **Warning:** Closing is irreversible. The PDA seeds remain the same, so re-registering from the same wallet will create a new agent at the same address — but all historical data (reputation, feedback, attestations) will be gone.

---

## Self-Reporting Metrics

Agents can self-report call metrics and performance data. These are informational and do not directly affect on-chain reputation scoring — they provide transparency to consumers.

### Reporting Calls

```typescript
// Report 150 calls served
await client.agent.reportCalls(150);

// Accepts bigint too
await client.agent.reportCalls(150n);
```

This increments `AgentStats.totalCallsServed`. Call it periodically (e.g., every N calls or on a timer) to keep your on-chain metrics current.

### Updating Reputation Metrics

```typescript
// Report average latency and uptime
await client.agent.updateReputation(
  45,    // avgLatencyMs — 45ms average response time
  99,    // uptimePercent — 99% uptime
);
```

This updates `AgentAccount.avgLatencyMs` and `AgentAccount.uptimePercent`. These values are visible in discovery queries and agent profiles.

---

## Fetching Agent Data

### Fetch Your Own Agent

```typescript
// Throws if agent doesn't exist
const agent = await client.agent.fetch();

// Returns null if agent doesn't exist
const agentOrNull = await client.agent.fetchNullable();
```

### Fetch Another Wallet's Agent

```typescript
import { PublicKey } from "@solana/web3.js";

const otherWallet = new PublicKey("...");
const agent = await client.agent.fetch(otherWallet);
```

### AgentAccountData Fields

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `version` | `number` | Account schema version |
| `wallet` | `PublicKey` | Owner wallet |
| `name` | `string` | Display name |
| `description` | `string` | Description |
| `agentId` | `string \| null` | Off-chain identifier |
| `agentUri` | `string \| null` | Metadata URI |
| `x402Endpoint` | `string \| null` | Payment endpoint |
| `isActive` | `boolean` | Whether agent is active |
| `createdAt` | `BN` | Unix timestamp of registration |
| `updatedAt` | `BN` | Unix timestamp of last update |
| `reputationScore` | `number` | Computed reputation (0–100) |
| `totalFeedbacks` | `number` | Feedback count |
| `reputationSum` | `BN` | Raw feedback sum |
| `totalCallsServed` | `BN` | Lifetime calls served |
| `avgLatencyMs` | `number` | Self-reported latency |
| `uptimePercent` | `number` | Self-reported uptime |
| `capabilities` | `Capability[]` | Declared capabilities |
| `pricing` | `PricingTier[]` | Active pricing tiers |
| `protocols` | `string[]` | Supported protocols |
| `activePlugins` | `PluginRef[]` | Enabled plugin references |

### Fetch Agent Stats

```typescript
const [agentPda] = client.agent.deriveAgent();
const stats = await client.agent.fetchStats(agentPda);

console.log("Calls served:", stats.totalCallsServed.toString());
console.log("Active:", stats.isActive);
console.log("Last updated:", new Date(stats.updatedAt.toNumber() * 1000));
```

### AgentStatsData Fields

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Parent agent PDA |
| `wallet` | `PublicKey` | Owner wallet |
| `totalCallsServed` | `BN` | Lifetime calls served |
| `isActive` | `boolean` | Active status |
| `updatedAt` | `BN` | Last update timestamp |

### Fetch Global Registry

```typescript
const registry = await client.agent.fetchGlobalRegistry();

console.log("Total agents:", registry.totalAgents);
console.log("Total vaults:", registry.totalVaults);
```

---

## Complete Lifecycle Example

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

const client = SapClient.from(AnchorProvider.env());

// 1. Register
await client.agent.register({
  name: "MyAgent",
  description: "A helpful Solana agent",
  capabilities: [{ id: "chat:respond", protocolId: "A2A", version: "1.0", description: null }],
  pricing: [],
  protocols: ["A2A"],
});

// 2. Verify registration
const agent = await client.agent.fetch();
console.log(`${agent.name} registered at ${agent.createdAt}`);

// 3. Update description
await client.agent.update({ description: "An even more helpful agent" });

// 4. Report usage
await client.agent.reportCalls(42);
await client.agent.updateReputation(30, 99);

// 5. Go on maintenance
await client.agent.deactivate();
// ... perform maintenance ...
await client.agent.reactivate();

// 6. End of life — reclaim rent
await client.agent.close();
```

---

**Previous**: [Architecture](./02-architecture.md) · **Next**: [Memory Systems →](./04-memory-systems.md)
