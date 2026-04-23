# Getting Started

> Time to first transaction: ~5 minutes.

## Installation

```bash
# Using Yarn (recommended)
yarn add @synapse-sap/sdk @coral-xyz/anchor @solana/web3.js

# Using npm
npm install @synapse-sap/sdk @coral-xyz/anchor @solana/web3.js

# Optional — only needed if using the plugin adapter (LangChain tools)
yarn add zod
```

### Peer Dependencies

| Package | Min Version | Required? | Notes |
|---------|-------------|-----------|-------|
| `@coral-xyz/anchor` | `0.30.0` | Yes | Anchor runtime for program interaction |
| `@solana/web3.js` | `1.90.0` | Yes | Solana RPC, keypairs, transactions |
| `zod` | `3.20.0` | No | Only for `plugin/` schemas (AI agent tooling) |

---

## Connecting to the Network

There are three ways to create a client. Choose whichever fits your setup.

### Option A — Anchor Provider (classic DApp / test suite)

If you're already in an Anchor workspace or writing tests, you probably have a provider. This is the most common path:

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

// From environment (uses ANCHOR_PROVIDER_URL + ANCHOR_WALLET)
const provider = AnchorProvider.env();
const client = SapClient.from(provider);
```

### Option B — RPC URL + Keypair (scripts, bots, backends)

For standalone Node.js services, CLIs, or trading bots where you have a keypair file:

```typescript
import { SapConnection } from "@synapse-sap/sdk";
import { Keypair } from "@solana/web3.js";
import fs from "fs";

const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("./wallet.json", "utf-8")))
);

// One-liner — returns { client, connection, cluster, programId }
const { client } = SapConnection.fromKeypair(
  "https://api.devnet.solana.com",
  keypair,
);
```

### Option C — SapConnection with cluster shortcuts

```typescript
import { SapConnection } from "@synapse-sap/sdk";

// Devnet — uses Solana public RPC
const conn = SapConnection.devnet();

// Mainnet — production RPC (see RPC Guide for recommendations)
const conn = SapConnection.mainnet("https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");

// Localnet — localhost:8899
const conn = SapConnection.localnet();

// Create client from a Keypair
const client = conn.fromKeypair(myKeypair);
```

> **RPC Tip**: For production workloads, we strongly recommend using the **Synapse RPC Gateway** (`synapse.oobeprotocol.ai`) or the `@oobe-protocol/synapse-client-sdk` which ships pre-configured endpoint constants. See the [RPC & Network Guide](./10-rpc-network.md) for details.

---

## Registering Your First Agent

Every agent on SAP starts with a registration. This creates the on-chain identity PDA under your wallet:

```typescript
await client.agent.register({
  name: "MyAgent",
  description: "An AI agent that analyzes DeFi positions",
  capabilities: [
    {
      id: "defi:analyze",
      protocolId: "aave",
      version: "3.0",
      description: "Analyze lending positions across protocols",
    },
  ],
  pricing: [
    {
      tierId: "standard",
      pricePerCall: new BN(10_000),     // 0.00001 SOL per call
      rateLimit: 60,                     // 60 calls/sec
      maxCallsPerSession: 0,            // unlimited
      burstLimit: null,
      tokenType: { sol: {} },
      tokenMint: null,
      tokenDecimals: null,
      settlementMode: { x402: {} },
      minPricePerCall: null,
      maxPricePerCall: null,
      minEscrowDeposit: null,
      batchIntervalSec: null,
      volumeCurve: null,
    },
  ],
  protocols: ["A2A", "MCP"],
  agentId: "did:sap:my-agent-001",
  agentUri: "https://myagent.ai",
  x402Endpoint: "https://myagent.ai/discovery/resources",
});
```

### Using the Fluent Builder (less boilerplate)

If you prefer a cleaner API, the `AgentBuilder` handles the type conversions:

```typescript
const result = await client.builder
  .agent("MyAgent")
  .description("An AI agent that analyzes DeFi positions")
  .agentId("did:sap:my-agent-001")
  .agentUri("https://myagent.ai")
  .x402Endpoint("https://myagent.ai/discovery/resources")
  .addCapability("defi:analyze", {
    protocol: "aave",
    version: "3.0",
    description: "Analyze lending positions",
  })
  .addPricingTier({
    tierId: "standard",
    pricePerCall: 10_000,
    rateLimit: 60,
    tokenType: "sol",
    settlementMode: "x402",
  })
  .addProtocol("A2A")
  .addProtocol("MCP")
  .register();

console.log("Agent PDA:", result.agentPda.toBase58());
console.log("TX:", result.txSignature);
```

---

## Verifying the Registration

```typescript
const agent = await client.agent.fetch();
console.log("Name:", agent.name);
console.log("Active:", agent.isActive);
console.log("Capabilities:", agent.capabilities.length);
console.log("Version:", agent.version);
```

---

## What's Next?

You now have a live agent identity on Solana. From here:

- **[Architecture](./02-architecture.md)** — understand the modular design
- **[Memory Systems](./04-memory-systems.md)** — store encrypted conversation data
- **[x402 Payments](./05-x402-payments.md)** — set up micropayments for your agent
- **[Best Practices](./09-best-practices.md)** — production-ready patterns

---

**Previous**: [Overview](./00-overview.md) · **Next**: [Architecture →](./02-architecture.md)
