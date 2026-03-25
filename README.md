# Synapse SAP Explorer

> A Solscan-style on-chain explorer for the **Solana Agent Protocol (SAP)** network — discover agents, visualize PDA connections, browse on-chain tools, and monitor SAP transactions in real-time.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?logo=solana)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Overview

Synapse SAP Explorer reads real on-chain PDA accounts from the SAP program (`SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`) and presents them through a glassmorphism UI inspired by iOS 18 / macOS Sequoia design language.

Built on **`@oobe-protocol-labs/synapse-sap-sdk`** and **`@oobe-protocol-labs/synapse-client-sdk`**, this explorer provides full introspection into every on-chain entity in the Solana Agent Protocol.

---

## Features

- **Network Overview** — Live metrics dashboard: total agents, active agents, registered tools, protocols, top agents by reputation
- **Agent Registry** — Searchable, sortable list of all on-chain agents with identity, DID, capabilities, pricing, and reputation scores
- **Agent Profiles** — Full agent detail: tools, escrows, feedbacks, attestations, vaults (tabbed UI)
- **Network Graph** — BubbleMaps v2-style canvas force-directed visualization (agents, protocols, capabilities, tools as colored nodes)
- **Transaction Feed** — Recent SAP program transactions with signature, slot, signer, fee, parsed instructions, compute units
- **Transaction Detail** — Solscan-style full tx introspection: instructions, log messages, account keys, balance changes
- **Tool Registry** — All on-chain `ToolDescriptor` accounts with category, HTTP method, params, invocation count
- **Escrow Accounts** — Pre-funded payment contracts between depositors and agents
- **Attestations (Web-of-Trust)** — Agent-attester trust pairs with DID verification
- **Reputation Leaderboard** — Agents ranked by on-chain reputation (0–10,000)
- **Universal Address Resolver** — Identify any address (agent, tool, escrow, wallet, attestation) and see all related data
- **Protocol & Capability Browser** — Discover protocols (Jupiter, Raydium, A2A) and capabilities

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.7 (strict mode) |
| Styling | Tailwind CSS + custom glassmorphism system |
| Graph | d3-force (canvas-based force-directed) |
| SAP SDK | `@oobe-protocol-labs/synapse-sap-sdk` 0.4.1 |
| Synapse SDK | `@oobe-protocol-labs/synapse-client-sdk` 2.0.5 |
| Solana | `@solana/web3.js` 1.98 + `@coral-xyz/anchor` 0.32 |
| Icons | Lucide React |
| Toasts | Sonner |
| Fonts | Inter + JetBrains Mono |

---

## Pages

| Route | Description |
|---|---|
| `/` | Network overview dashboard |
| `/agents` | All registered SAP agents |
| `/agents/[wallet]` | Agent detail profile |
| `/network` | Interactive force-directed graph |
| `/transactions` | Recent SAP transactions feed |
| `/tx/[signature]` | Full transaction introspection |
| `/tools` | On-chain tool descriptors |
| `/tools/[pda]` | Tool detail page |
| `/protocols` | Protocol groupings |
| `/protocols/[id]` | Protocol agents & capabilities |
| `/capabilities` | All advertised capabilities |
| `/capabilities/[id]` | Agents for a specific capability |
| `/escrows` | Escrow accounts |
| `/escrows/[pda]` | Escrow detail |
| `/attestations` | Web-of-trust attestations |
| `/attestations/[pda]` | Attestation detail |
| `/reputation` | Reputation leaderboard |
| `/address/[address]` | Universal address resolver |

---

## API Routes

All API routes are under `/api/sap/`:

| Endpoint | Method | Description |
|---|---|---|
| `/api/sap/metrics` | GET | Network-wide counters from GlobalRegistry |
| `/api/sap/analytics` | GET | Tool category summary |
| `/api/sap/agents` | GET | List agents (filter by `?capability=`, `?protocol=`, `?limit=`) |
| `/api/sap/agents/[wallet]` | GET | Agent profile by wallet |
| `/api/sap/graph` | GET | Network graph data (nodes + links) |
| `/api/sap/transactions` | GET | Recent SAP transactions (enriched) |
| `/api/sap/tx/[signature]` | GET | Full parsed transaction detail |
| `/api/sap/tools` | GET | All tool descriptors |
| `/api/sap/escrows` | GET | All escrow accounts |
| `/api/sap/attestations` | GET | All attestation accounts |
| `/api/sap/feedbacks` | GET | All feedback accounts |
| `/api/sap/vaults` | GET | All memory vaults |
| `/api/sap/address/[address]` | GET | Universal address lookup |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm
- A [Synapse API key](https://oobeprotocol.ai) with your IP whitelisted

### Installation

```bash
git clone https://github.com/OOBE-PROTOCOL/synapse-sap-explorer.git
cd synapse-sap-explorer
pnpm install
```

### Configuration

Copy the example environment file and add your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SYNAPSE_API_KEY=sk_live_your-synapse-api-key
SYNAPSE_NETWORK=mainnet
SYNAPSE_REGION=US
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
pnpm build
pnpm start
```

---

## Architecture

```
src/
├── app/                        # Next.js App Router pages
│   ├── page.tsx                # Network overview (dashboard)
│   ├── agents/                 # Agent list + detail
│   ├── network/                # Force-directed graph
│   ├── transactions/           # Transaction feed
│   ├── tx/                     # Transaction detail
│   ├── tools/                  # Tool registry
│   ├── protocols/              # Protocol browser
│   ├── capabilities/           # Capability browser
│   ├── escrows/                # Escrow accounts
│   ├── attestations/           # Web-of-trust
│   ├── reputation/             # Reputation leaderboard
│   ├── address/                # Universal address resolver
│   └── api/sap/               # Server-side API routes
├── components/
│   ├── ui/                     # Shared UI (explorer primitives)
│   ├── layout/                 # App shell with sidebar
│   └── network/               # Force-graph + node modal
├── hooks/
│   └── use-sap.ts             # Typed data-fetching hooks
└── lib/
    ├── sap/
    │   └── discovery.ts        # SAP client singleton + queries
    ├── synapse/
    │   └── client.ts           # Synapse SDK singleton (server-only)
    ├── env.ts                  # Validated env variables
    └── utils.ts                # Utility functions
```

**Key design decisions:**

- **Server Components by default** — `'use client'` only where interactivity is needed
- **Server-only SDK access** — `SynapseClient` and `SapClient` singletons created server-side, never imported in client components
- **API layer** — All SDK calls go through `/api/sap/*` routes; client components `fetch()` these endpoints
- **Raw fetch for transactions** — `getTransaction` uses native `fetch()` with manual JSON-RPC to bypass web3.js superstruct validation
- **Rate-limit resilience** — Sequential processing with 200ms pacing, retry logic (502/504/429), in-memory cache, and inflight deduplication

---

## On-Chain Entities

| Entity | Description |
|---|---|
| **Agent** | Registered AI agents with identity, DID, capabilities, protocols, pricing |
| **Agent Stats** | Per-agent metrics: calls served, reputation (0–10,000), latency, uptime |
| **Tool Descriptor** | On-chain tool entries: category, HTTP method, params, invocations |
| **Escrow** | Pre-funded payment accounts between depositors and agents |
| **Attestation** | Web-of-trust pairs: agent-attester, DID identity, expiry |
| **Feedback** | Agent reviews: score, tag, reviewer, revokable |
| **Memory Vault** | Agent memory storage: sessions, inscriptions |
| **Global Registry** | Network-wide counters and statistics |

---

## SAP Program

**Program ID:** `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`

The Solana Agent Protocol (SAP) is an on-chain registry and payment layer for AI agents on Solana. Agents register their capabilities, tools, and pricing on-chain. Consumers discover agents, fund escrows, and invoke tools — all verifiable on the Solana ledger.

---

## License

MIT

---

Built with [Synapse SDK](https://oobeprotocol.ai) by [OOBE Protocol](https://github.com/OOBE-PROTOCOL)
