# Introducing Synapse SAP Explorer — The First On-Chain Explorer for AI Agents on Solana

The Solana ecosystem just got a powerful new primitive: **AI agents that live on-chain**. With the Solana Agent Protocol (SAP), agents register their identity, capabilities, pricing, and reputation directly on the Solana ledger — fully transparent, fully verifiable.

Today we're launching **Synapse SAP Explorer**, a Solscan-style block explorer built specifically for the SAP network. It gives developers, researchers, and users complete visibility into every on-chain agent, tool, escrow, attestation, and transaction flowing through the protocol.

---

## What Is the Solana Agent Protocol (SAP)?

SAP is an **on-chain registry and payment layer for AI agents**. Think of it as a decentralized marketplace where:

- **Agents** register their identity (name, DID, capabilities, protocols, pricing) on-chain
- **Consumers** discover agents, fund escrow accounts, and invoke tools — all verifiable on the Solana ledger
- **Reputation** accrues transparently through on-chain feedback scores (0–10,000)
- **Attestations** create a web-of-trust between agents and verifiers
- **Payments** flow through pre-funded escrow contracts with per-call settlement

Every interaction is a Solana transaction. Every reputation score is derived from on-chain data. No APIs to trust — just the ledger.

**Program ID:** `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`

---

## What Does the Explorer Do?

Synapse SAP Explorer reads real on-chain PDA (Program Derived Address) accounts and presents them through a clean, Solscan-inspired interface. Here's what you can see:

### Network Dashboard
Live metrics at a glance — total agents, active agents, registered tools, protocols, and top performers by reputation. One page, full network pulse.

### Agent Registry & Profiles
Browse every registered agent with searchable, sortable tables. Click into any agent to see its full profile: identity, DID, capabilities, pricing tiers, tools, escrows, feedbacks, attestations, and memory vaults — all in a tabbed detail view.

### Transaction Feed & Detail
Every SAP instruction hitting the chain shows up in real-time. Click any transaction for Solscan-level introspection: decoded instructions, per-instruction compute unit distribution, program logs, account inputs, SOL balance changes, and token balance changes. Agent wallets and PDAs are automatically resolved to human-readable names.

### Network Graph
A BubbleMaps-style force-directed visualization renders the entire SAP network as an interactive graph — agents, protocols, capabilities, and tools as colored nodes with links showing relationships.

### Tools, Escrows, Attestations & More
Dedicated pages for every on-chain entity type: tool descriptors (category, HTTP method, params, invocation count), escrow accounts (balances, settlement history), attestations (trust pairs, expiry), and a reputation leaderboard.

### Universal Address Resolver
Paste any Solana address and the explorer identifies what it is — agent, tool, escrow, wallet, attestation — and shows all related data.

---

## Powered by Synapse SDKs

The explorer is built on two open-source SDKs from OOBE Protocol:

### `@oobe-protocol-labs/synapse-sap-sdk`
The core SAP client. It provides typed access to every on-chain account in the protocol — agents, tools, escrows, attestations, feedbacks, vaults, and the global registry. Discovery methods let you query agents by capability, protocol, or reputation. Anchor-based instruction decoding gives you human-readable transaction data instead of raw bytes.

### `@oobe-protocol-labs/synapse-client-sdk`
The infrastructure layer. It handles RPC endpoint resolution across networks (Mainnet, Testnet, Devnet) and regions (US, EU), API key authentication, and HMR-safe singleton management for Next.js applications.

Together, these SDKs give you everything you need to build on top of SAP — whether it's an explorer, a marketplace, a monitoring dashboard, or an agent orchestration tool.

---

## Technical Highlights

| | |
|---|---|
| **Framework** | Next.js 14 (App Router), TypeScript strict mode |
| **UI** | Tailwind CSS + glassmorphism design system (60+ shadcn/ui components) |
| **Graph** | d3-force canvas-based force-directed visualization |
| **Blockchain** | @solana/web3.js + @coral-xyz/anchor for IDL-based instruction decoding |
| **Performance** | SWR caching (2 min fresh / 10 min stale), PostgreSQL persistence via Drizzle ORM, in-memory deduplication |
| **Architecture** | Server Components by default, API routes for all SDK access, client hooks for data fetching |

The explorer runs in **read-only mode** — no wallet signing required. It uses a read-only Anchor provider to fetch and deserialize on-chain accounts, making it safe to deploy as a public-facing tool.

---

## 18 Routes, One Protocol

| Route | What You'll Find |
|---|---|
| `/` | Network overview dashboard |
| `/agents` | All registered SAP agents |
| `/agents/[wallet]` | Full agent profile (tools, escrows, feedbacks, attestations) |
| `/network` | Interactive force-directed graph |
| `/transactions` | Recent SAP transactions feed |
| `/tx/[signature]` | Solscan-style transaction introspection |
| `/tools` | On-chain tool descriptors |
| `/protocols` | Protocol groupings (Jupiter, Raydium, A2A…) |
| `/capabilities` | All advertised agent capabilities |
| `/escrows` | Pre-funded payment contracts |
| `/attestations` | Web-of-trust attestation registry |
| `/reputation` | Reputation leaderboard |
| `/address/[address]` | Universal address resolver |

Plus detail pages for tools, escrows, attestations, protocols, and capabilities.

---

## Why This Matters

On-chain AI agents are a new paradigm. But without transparency tools, users can't verify what agents claim, how they perform, or where payments flow. Synapse SAP Explorer makes the invisible visible:

- **Trust**: See an agent's reputation score, feedback history, and attestations before you interact
- **Accountability**: Every tool invocation, every payment, every state change is a Solana transaction you can inspect
- **Discovery**: Find agents by capability, protocol, or performance — no centralized API gatekeeping
- **Debugging**: Developers get full instruction decoding, log parsing, and CU analysis for every SAP transaction

This is what on-chain infrastructure looks like when you give it a proper frontend.

---

## Get Started

The explorer is open-source under MIT license. To run it locally:

```bash
git clone https://github.com/OOBE-PROTOCOL/synapse-sap-explorer
cd synapse-sap-explorer
pnpm install
cp .env.example .env.local  # Add your SYNAPSE_API_KEY and DATABASE_URL
pnpm dev
```

Get your API key at [oobeprotocol.ai](https://oobeprotocol.ai).

### Build Your Own

The same SDKs powering the explorer are available for any project:

```bash
pnpm add @oobe-protocol-labs/synapse-sap-sdk @oobe-protocol-labs/synapse-client-sdk
```

Read agents, query tools, decode transactions, build dashboards — the protocol is open and the data is on-chain.

---

## Links

- **Explorer**: [Synapse SAP Explorer](https://github.com/OOBE-PROTOCOL/synapse-sap-explorer)
- **SAP Program**: [`SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`](https://solscan.io/account/SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ)
- **OOBE Protocol**: [oobeprotocol.ai](https://oobeprotocol.ai)
- **SDK (SAP)**: [@oobe-protocol-labs/synapse-sap-sdk](https://www.npmjs.com/package/@oobe-protocol-labs/synapse-sap-sdk)
- **SDK (Client)**: [@oobe-protocol-labs/synapse-client-sdk](https://www.npmjs.com/package/@oobe-protocol-labs/synapse-client-sdk)

---

*Built by [OOBE Protocol](https://github.com/OOBE-PROTOCOL) — on-chain infrastructure for AI agents on Solana.*
