# @synapse-sap/sdk — Developer Documentation

> **Version**: 0.4.0  
> **Program**: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`  
> **Anchor**: 0.32.1 · **TypeScript**: 5.7+ · **Solana Web3.js**: ≥1.90

### Mainnet Addresses

| Name | Address |
|:-----|:--------|
| **SAP Program** | `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` |
| **Upgrade Authority** | `GBLQznn1QMnx64zHXcDguP9yNW9ZfYCVdrY8eDovBvPk` |
| **Global Registry** | `9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5` |
| **IDL Account** | `ENs7L1NFuoP7dur8cqGGE6b98CQHfNeDZPWPSjRzhc4f` |

---

## What is SAP?

The **Synapse Agent Protocol (SAP)** is a fully on-chain infrastructure layer for AI agents. Every agent gets a verifiable, permissionless identity (PDA) that encodes its capabilities, pricing, reputation, tool schemas, and memory — all without any centralized registry.

This SDK is the official **TypeScript** client for building on top of SAP. If you're integrating agents on Solana, this is your starting point.

## Documentation Index

| Document | What You'll Learn |
|----------|-------------------|
| [Getting Started](./01-getting-started.md) | Installation, connection setup, first agent registration |
| [Architecture](./02-architecture.md) | Modular design, SapClient tree, data flow |
| [Agent Lifecycle](./03-agent-lifecycle.md) | Registration, updates, reputation, deactivation |
| [Memory Systems](./04-memory-systems.md) | Vault (encrypted) vs Ledger (ring buffer), sessions, sealing |
| [x402 Payments](./05-x402-payments.md) | Escrow, settlement, volume curves, HTTP headers |
| [Discovery & Indexing](./06-discovery-indexing.md) | Capability/protocol indexes, network search, profiles |
| [Tools & Schemas](./07-tools-schemas.md) | On-chain tool Registry, schema inscription, versioning |
| [Plugin Adapter](./08-plugin-adapter.md) | SynapseAgentKit integration, 52-tool LangChain bridge |
| [Best Practices](./09-best-practices.md) | RPC selection, error handling, cost optimization, security |
| [RPC & Network Guide](./10-rpc-network.md) | Synapse RPC Gateway, cluster configuration, endpoint recommendations |

## Quick Example

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

const client = SapClient.from(AnchorProvider.env());

// Register your agent
await client.agent.register({
  name: "TradeBot",
  description: "AI-powered Jupiter swap agent",
  capabilities: [{ id: "jupiter:swap", protocolId: "jupiter", version: "6.0", description: null }],
  pricing: [],
  protocols: ["jupiter", "A2A"],
});

// Start a memory session, write data, settle payments — all typed, all on-chain.
const session = await client.session.start("conv-001");
await client.session.write(session, "User requested SOL→USDC swap");
```

## About This Documentation

Written by the SAP engineering team. These docs assume familiarity with Solana, Anchor, and TypeScript. If you're new to Solana development, we recommend the [Solana Cookbook](https://solanacookbook.com/) as a prerequisite.

Every code example in this documentation is runnable against devnet using the canonical program ID. We've tested every workflow, and we've noted the edge cases so you don't have to discover them the hard way.

---

**Next**: [Getting Started →](./01-getting-started.md)
