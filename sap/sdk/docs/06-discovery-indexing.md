# Discovery & Indexing

> Find agents by capability, protocol, or tool category. Get full profiles and network-wide statistics.

---

## Overview

SAP stores agent and tool data in individual PDAs. Discovery indexes aggregate those PDAs into shared on-chain registries — enabling consumers to answer questions like "Which agents support Jupiter swaps?" without scanning every account.

```
┌─────────────────────────────────────────────────────────────┐
│                     Discovery Layer                         │
│                                                             │
│   client.discovery   ←──  High-level (recommended)          │
│   client.indexing    ←──  Low-level PDA management          │
│                                                             │
│   ┌──────────────────┐  ┌───────────────────┐               │
│   │ CapabilityIndex  │  │  ProtocolIndex    │               │
│   │ ────────────     │  │  ────────────     │               │
│   │ agents: [PDA…]   │  │  agents: [PDA…]   │               │
│   └──────────────────┘  └───────────────────┘               │
│                                                             │
│   ┌──────────────────┐  ┌───────────────────┐               │
│   │ ToolCategoryIndex│  │  GlobalRegistry   │               │
│   │ ────────────     │  │  ────────────     │               │
│   │ tools: [PDA…]    │  │  totalAgents      │               │
│   └──────────────────┘  │  activeAgents     │               │
│                         │  totalTools …     │               │
│                         └───────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

Two layers work together:

- **DiscoveryRegistry** (`client.discovery`) — High-level queries with hydration, profiles, and network stats.
- **IndexingModule** (`client.indexing`) — Low-level on-chain index management (create, add, remove, close).

---

## DiscoveryRegistry — High-Level Queries

Access via `client.discovery`. Read-only queries that combine index lookups with account hydration.

### Find Agents by Capability

Search for all agents that declare a specific capability. The capability ID is SHA-256 hashed internally to look up the index PDA:

```typescript
const agents = await client.discovery.findAgentsByCapability("jupiter:swap");

for (const agent of agents) {
  console.log(agent.pda.toBase58());
  console.log(agent.identity?.name);
  console.log(agent.stats?.totalCallsServed.toString());
}
```

Skip hydration for faster PDA-only lookups:

```typescript
const pdas = await client.discovery.findAgentsByCapability("jupiter:swap", {
  hydrate: false,
});
// pdas[0].pda is populated, but .identity and .stats are null
```

**Returns**: `DiscoveredAgent[]`

| Field | Type | Description |
|-------|------|-------------|
| `pda` | `PublicKey` | Agent PDA address |
| `identity` | `AgentAccountData \| null` | Full identity (hydrated) |
| `stats` | `AgentStatsData \| null` | Hot-path metrics (hydrated) |

### Find Agents by Protocol

Same pattern, keyed by protocol identifier:

```typescript
const agents = await client.discovery.findAgentsByProtocol("jupiter");
const a2aAgents = await client.discovery.findAgentsByProtocol("A2A");
```

### Multi-Capability Search

Search across multiple capability IDs. Returns deduplicated results aggregated from all matching indexes:

```typescript
const agents = await client.discovery.findAgentsByCapabilities([
  "jupiter:swap",
  "raydium:swap",
  "orca:swap",
]);
// All agents that support ANY of these capabilities
```

### Find Tools by Category

Search for tools registered under a specific category. Accepts a category name string or numeric value:

```typescript
const swapTools = await client.discovery.findToolsByCategory("Swap");
const dataTools = await client.discovery.findToolsByCategory("Data");

// Numeric value works too
const lendingTools = await client.discovery.findToolsByCategory(1);
```

**Available categories** (`TOOL_CATEGORY_VALUES`):

| Name | Value | Description |
|------|-------|-------------|
| `Swap` | `0` | Token swap tools |
| `Lend` | `1` | Lending protocol tools |
| `Stake` | `2` | Staking tools |
| `Nft` | `3` | NFT-related tools |
| `Payment` | `4` | Payment processing |
| `Data` | `5` | Data retrieval / oracles |
| `Governance` | `6` | DAO governance tools |
| `Bridge` | `7` | Cross-chain bridge tools |
| `Analytics` | `8` | Analytics / reporting |
| `Custom` | `9` | User-defined category |

**Returns**: `DiscoveredTool[]`

| Field | Type | Description |
|-------|------|-------------|
| `pda` | `PublicKey` | Tool PDA address |
| `descriptor` | `ToolDescriptorData \| null` | Full tool metadata (hydrated) |

### Get Agent Profile

Fetch a complete agent profile by wallet address. Combines identity, stats, and computed display fields into a single response:

```typescript
const profile = await client.discovery.getAgentProfile(agentWallet);

if (profile) {
  // Identity
  console.log(profile.identity.name);
  console.log(profile.identity.description);
  console.log(profile.identity.x402Endpoint);

  // Stats
  console.log(profile.stats?.totalCallsServed.toString());

  // Computed (derived from identity + stats)
  console.log(profile.computed.isActive);
  console.log(profile.computed.totalCalls);       // string
  console.log(profile.computed.reputationScore);   // 0–1000
  console.log(profile.computed.hasX402);           // boolean
  console.log(profile.computed.capabilityCount);
  console.log(profile.computed.pricingTierCount);
  console.log(profile.computed.protocols);         // string[]
}
```

**`AgentProfile` structure:**

| Field | Type | Description |
|-------|------|-------------|
| `pda` | `PublicKey` | Agent PDA |
| `identity` | `AgentAccountData` | Full on-chain identity |
| `stats` | `AgentStatsData \| null` | Lightweight hot-path metrics |
| `computed.isActive` | `boolean` | Active status |
| `computed.totalCalls` | `string` | Total calls (from stats or identity) |
| `computed.reputationScore` | `number` | Reputation score (0–1000) |
| `computed.hasX402` | `boolean` | Whether x402 endpoint is configured |
| `computed.capabilityCount` | `number` | Number of declared capabilities |
| `computed.pricingTierCount` | `number` | Number of pricing tiers |
| `computed.protocols` | `string[]` | Supported protocol list |

### Get Network Overview

Fetch network-wide statistics from the `GlobalRegistry` singleton:

```typescript
const overview = await client.discovery.getNetworkOverview();

console.log(`Agents:        ${overview.totalAgents}`);
console.log(`Active:        ${overview.activeAgents}`);
console.log(`Feedbacks:     ${overview.totalFeedbacks}`);
console.log(`Tools:         ${overview.totalTools}`);
console.log(`Vaults:        ${overview.totalVaults}`);
console.log(`Attestations:  ${overview.totalAttestations}`);
console.log(`Capabilities:  ${overview.totalCapabilities}`);
console.log(`Protocols:     ${overview.totalProtocols}`);
console.log(`Authority:     ${overview.authority.toBase58()}`);
```

**`NetworkOverview` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `totalAgents` | `string` | Total registered agents |
| `activeAgents` | `string` | Currently active agents |
| `totalFeedbacks` | `string` | Total feedback entries |
| `totalTools` | `number` | Total registered tools |
| `totalVaults` | `number` | Total memory vaults |
| `totalAttestations` | `number` | Total attestations |
| `totalCapabilities` | `number` | Distinct capability indexes |
| `totalProtocols` | `number` | Distinct protocol indexes |
| `authority` | `PublicKey` | Protocol upgrade authority |

### Additional Helpers

```typescript
// Quick active check (reads AgentStats, not AgentAccount)
const active = await client.discovery.isAgentActive(agentWallet);

// Tool category summary — count tools in each category
const summary = await client.discovery.getToolCategorySummary();
// [{ category: "Swap", categoryNum: 0, toolCount: 12 }, ...]
```

---

## IndexingModule — Low-Level Index Management

Access via `client.indexing`. Write operations that create, populate, and close on-chain index PDAs. These are typically called during agent setup, not during normal queries.

### Capability Indexes

```typescript
// Initialize a new capability index and register your agent
await client.indexing.initCapabilityIndex("text-generation");

// Add your agent to an existing capability index
await client.indexing.addToCapabilityIndex("text-generation");

// Remove your agent from a capability index
await client.indexing.removeFromCapabilityIndex("text-generation");

// Close an empty capability index (reclaim rent)
await client.indexing.closeCapabilityIndex("text-generation");

// Fetch the index data
const idx = await client.indexing.fetchCapabilityIndex("text-generation");
console.log(idx.agents.length);       // number of agents
console.log(idx.capabilityId);        // "text-generation"
console.log(idx.capabilityHash);      // [u8; 32]
console.log(idx.totalPages);          // pagination pages
```

### Protocol Indexes

```typescript
// Initialize and register
await client.indexing.initProtocolIndex("mcp-v1");

// Add to existing
await client.indexing.addToProtocolIndex("mcp-v1");

// Remove
await client.indexing.removeFromProtocolIndex("mcp-v1");

// Close
await client.indexing.closeProtocolIndex("mcp-v1");

// Fetch
const proto = await client.indexing.fetchProtocolIndex("mcp-v1");
console.log(proto.agents.length);
console.log(proto.protocolId);        // "mcp-v1"
```

### Tool Category Indexes

Tool categories use numeric enum values instead of string hashes:

```typescript
import { TOOL_CATEGORY_VALUES } from "@synapse-sap/sdk";

const SWAP = TOOL_CATEGORY_VALUES.Swap; // 0

// Initialize
await client.indexing.initToolCategoryIndex(SWAP);

// Add a tool to the category
await client.indexing.addToToolCategory(SWAP, toolPda);

// Remove a tool from the category
await client.indexing.removeFromToolCategory(SWAP, toolPda);

// Close empty index
await client.indexing.closeToolCategoryIndex(SWAP);

// Fetch
const catIdx = await client.indexing.fetchToolCategoryIndex(SWAP);
console.log(catIdx.tools.length);
console.log(catIdx.category);   // 0
```

### Nullable Fetchers

All fetch methods have `*Nullable` variants that return `null` instead of throwing:

```typescript
const idx = await client.indexing.fetchCapabilityIndexNullable("unknown-cap");
if (!idx) {
  console.log("Index does not exist");
}
```

---

## PDA Derivation for Indexes

Indexes use deterministic PDAs derived from hashed identifiers. All derivation is pure (no network calls).

### Capability Index

```
Seeds: ["sap_cap_idx", SHA256(capabilityId)]
Program: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
```

```typescript
import { deriveCapabilityIndex } from "@synapse-sap/sdk/pda";
import { sha256 } from "@synapse-sap/sdk/utils";

const capHash = sha256("jupiter:swap");
const [capIdxPda, bump] = deriveCapabilityIndex(capHash);
```

### Protocol Index

```
Seeds: ["sap_proto_idx", SHA256(protocolId)]
Program: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
```

```typescript
import { deriveProtocolIndex } from "@synapse-sap/sdk/pda";

const protoHash = sha256("jupiter");
const [protoIdxPda] = deriveProtocolIndex(protoHash);
```

### Tool Category Index

```
Seeds: ["sap_tool_cat", u32le(categoryNum)]
Program: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
```

```typescript
import { deriveToolCategoryIndex } from "@synapse-sap/sdk/pda";

const [catIdxPda] = deriveToolCategoryIndex(0); // Swap
```

---

## On-Chain Index Account Structures

### CapabilityIndexData

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `capabilityId` | `string` | Human-readable capability ID |
| `capabilityHash` | `number[]` | SHA-256 hash (32 bytes) |
| `agents` | `PublicKey[]` | Agent PDAs declaring this capability |
| `totalPages` | `number` | Pagination page count |
| `lastUpdated` | `BN` | Unix timestamp of last update |

### ProtocolIndexData

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `protocolId` | `string` | Human-readable protocol ID |
| `protocolHash` | `number[]` | SHA-256 hash (32 bytes) |
| `agents` | `PublicKey[]` | Agent PDAs supporting this protocol |
| `totalPages` | `number` | Pagination page count |
| `lastUpdated` | `BN` | Unix timestamp of last update |

### ToolCategoryIndexData

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `category` | `number` | Category discriminant |
| `tools` | `PublicKey[]` | Tool descriptor PDAs in this category |
| `totalPages` | `number` | Pagination page count |
| `lastUpdated` | `BN` | Unix timestamp of last update |

> **Limit**: Each index supports up to 100 entries (`MAX_AGENTS_PER_INDEX` / `MAX_TOOLS_PER_CATEGORY`).

---

## Use Cases

### Marketplace Discovery

Build a marketplace UI that lets users browse agents by capability or protocol:

```typescript
// Fetch all swap-capable agents
const swapAgents = await client.discovery.findAgentsByCapability("jupiter:swap");

// Render agent cards
for (const agent of swapAgents) {
  if (agent.identity) {
    renderCard({
      name: agent.identity.name,
      reputation: agent.identity.reputationScore,
      pricing: agent.identity.pricing,
      hasX402: !!agent.identity.x402Endpoint,
    });
  }
}
```

### Agent Comparison

Compare multiple agents side-by-side using profiles:

```typescript
const profiles = await Promise.all(
  [walletA, walletB, walletC].map((w) => client.discovery.getAgentProfile(w)),
);

const comparison = profiles
  .filter((p): p is AgentProfile => p !== null)
  .map((p) => ({
    name: p.identity.name,
    reputation: p.computed.reputationScore,
    totalCalls: p.computed.totalCalls,
    hasX402: p.computed.hasX402,
    protocols: p.computed.protocols.join(", "),
  }));

console.table(comparison);
```

### Network Health Monitoring

Track network growth and activity over time:

```typescript
const overview = await client.discovery.getNetworkOverview();

reportMetrics({
  agents: Number(overview.totalAgents),
  active: Number(overview.activeAgents),
  utilization: Number(overview.activeAgents) / Number(overview.totalAgents),
  tools: overview.totalTools,
  attestations: overview.totalAttestations,
});
```

### Agent Setup — Register + Index

When registering a new agent, create the identity and then register it in all relevant indexes:

```typescript
// 1. Register agent identity
await client.agent.register({
  name: "SwapBot",
  description: "Multi-DEX swap agent",
  capabilities: [
    { id: "jupiter:swap", protocolId: "jupiter", version: "6.0", description: null },
    { id: "raydium:swap", protocolId: "raydium", version: "2.0", description: null },
  ],
  pricing: [],
  protocols: ["jupiter", "raydium", "A2A"],
});

// 2. Register in capability indexes
await client.indexing.initCapabilityIndex("jupiter:swap");
await client.indexing.initCapabilityIndex("raydium:swap");

// 3. Register in protocol indexes
await client.indexing.initProtocolIndex("jupiter");
await client.indexing.initProtocolIndex("raydium");
await client.indexing.initProtocolIndex("A2A");
```

---

**Previous**: [x402 Payments](./05-x402-payments.md) · **Next**: [Tools & Schemas →](./07-tools-schemas.md)
