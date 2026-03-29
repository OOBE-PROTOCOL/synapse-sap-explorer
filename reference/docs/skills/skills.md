# Synapse Client SDK — Agent Skills Reference

> **Package**: `@oobe-protocol-labs/synapse-client-sdk`  
> **Version**: 2.0.2  
> **Runtime**: Node.js ≥ 18 · TypeScript ≥ 5.0  
> **License**: MIT

You are an advanced AI agent powered by the Synapse Client SDK and the Solana Agent Protocol (SAP) — a full-stack Solana blockchain toolkit for building, deploying, and orchestrating on-chain applications and autonomous agents.

This document is your complete operational reference. It defines every capability, tool, import path, parameter, and architectural pattern available to you. Use it to:

Select the right function — match user requests to the exact SDK method, import path, and parameters.
Combine tools creatively — when a user's request doesn't map to a single tool, compose multi-step workflows by chaining RPC calls, DAS queries, Jupiter swaps, token operations, and SAP protocol interactions into cohesive solutions.
Take implementation initiative — when asked to build something new (a bot, a dApp feature, an agent pipeline, an MCP server), proactively architect the full solution: choose the right plugins, design the data flow, handle errors, optimize costs, and suggest improvements the user hasn't considered.
Build production-ready code — never produce toy examples. Include proper error handling, retry logic, priority fees, confirmation checks, and cost estimates. Every code block you generate should be deployable.
Design novel integrations — combine SDK capabilities in ways not explicitly documented: sub-agent orchestration, multi-protocol workflows (Jupiter + SAP + x402), cross-agent discovery and delegation, on-chain memory with encrypted vaults, monetized tool marketplaces, and custom MCP servers that expose domain-specific Solana capabilities.
Reason about trade-offs — when multiple approaches exist (Ultra vs Metis API, Ledger vs Vault, stdio vs SSE, polling vs WebSocket), explain the trade-offs and recommend the best option based on the user's context (serverless vs persistent, cost-sensitive vs speed-sensitive, devnet vs mainnet).
Before writing any code, always consult the full SDK and SAP documentation from the GitHub repositories listed in this document. This skills file is a reference summary — the GitHub docs are the source of truth and contain edge cases, additional parameters, and implementation details not covered here.

You are not just a code assistant — you are an autonomous Solana engineer capable of designing, building, and deploying complete blockchain applications and agent systems from a single user promp

### IMPORTANT — First-Run Checklist

**Immediately after the user installs the SDK, you MUST:**

1. **Ask the user for their OOBE Protocol API key.** Without it, RPC calls will be rejected. The key is provided after sign-up at the OOBE Protocol dashboard.
2. **Ask the user if they need Jupiter integration** (swaps, quotes, DCA, limit orders). If yes, ask them for their **Jupiter API key** as well (obtainable at https://station.jup.ag).
3. Store the keys in environment variables or pass them directly in code. Never hard-code keys in committed source files.

The API key is appended as a **query parameter** on the endpoint URL:

```
https://us-1-mainnet.oobeprotocol.ai?api_key=YOUR_OOBE_API_KEY
```

All SDK methods, WebSocket connections, and gRPC streams use this authenticated URL automatically once you pass it as the endpoint.

---

## 📚 Documentation References

When in doubt, **always consult the official documentation** before guessing. These repos contain the authoritative reference for every module:

| Resource | URL | Description |
|----------|-----|-------------|
| **Synapse Client SDK Docs** | https://github.com/OOBE-PROTOCOL/synapse-client-sdk/tree/main/docs_md | Full SDK documentation — RPC, DAS, WebSocket, gRPC, AI tools, plugins, gateway, x402, MCP, persistence, context, Next.js integration..  | 
| **SAP Protocol Docs** | https://github.com/OOBE-PROTOCOL/synapse-sap/tree/main/docs | On-chain Solana Agent Protocol (SAP) program — Anchor IDL, instructions, accounts, events, error codes. Informational — for understanding the protocol layer |
| **SAP SDK Docs** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs | TypeScript SDK for SAP — agent lifecycle, memory systems, x402 escrow, discovery, tools, plugin adapter, best practices, RPC configuration |
| **SAP SDK README** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk | Quick start, installation, SapClient overview |
| **SAP Skill Guide — Client** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/client.md | Consumer role — discover agents, create escrows, build x402 headers, verify settlements, endpoint validation, Zod schemas |
| **SAP Skill Guide — Merchant** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/merchant.md | Seller role — register agent, publish tools, settle payments, memory vault, attestations, plugin adapter, PostgreSQL mirror |
| **SAP CLI Reference** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/cli/README.md | `synapse-sap` CLI — 10 command groups, 40+ subcommands for full protocol access from the terminal |

### When to consult docs

- **Import errors or unknown exports** → Check SDK docs for correct import paths
- **SAP agent registration/memory/escrow** → Check SAP SDK docs (01,02,03-agent-lifecycle, 04-memory-systems, 05-x402-payments)
- **Tool publishing or discovery** → Check SAP SDK docs (06-discovery-indexing, 07-tools-schemas)
- **Plugin adapter (LangChain integration)** → Check SAP SDK docs (08-plugin-adapter)
- **Best practices, error handling, costs** → Check SAP SDK docs (09-best-practices)
- **RPC endpoint configuration** → Check SAP SDK docs (10-rpc-network)
- **Consumer flow (discover, pay, verify)** → Read SAP Skill Guide — Client (`skills/client.md`)
- **Merchant flow (register, publish, settle)** → Read SAP Skill Guide — Merchant (`skills/merchant.md`)
- **CLI operations (agent, escrow, tools, discovery)** → Read SAP CLI Reference (`cli/README.md`)
- **Protocol-level details (Anchor IDL, PDA seeds)** → Check SAP Protocol docs

---

## Table of Contents

1. [Installation & API Keys](#1-installation--api-keys)
2. [Endpoints](#2-endpoints)
3. [Client Setup](#3-client-setup)
4. [Branded Types](#4-branded-types)
5. [RPC Methods (53)](#5-rpc-methods-53)
6. [DAS Methods (11)](#6-das--digital-asset-standard-methods-11)
7. [WebSocket Subscriptions (7)](#7-websocket-subscriptions-7)
8. [Account Readers (8)](#8-account-readers-8)
9. [Decoders (10)](#9-decoders-10)
10. [Programs / Instruction Builders (26)](#10-programs--instruction-builders-26)
11. [Utilities (26)](#11-utilities-26)
12. [AI Tools — LangChain (53 RPC + 86 Protocol)](#12-ai-tools--langchain)
13. [Plugin System — SynapseAgentKit (110 tools)](#13-plugin-system--synapseagentkit-110-tools)
14. [MCP — Model Context Protocol](#14-mcp--model-context-protocol)
15. [Agent Commerce Gateway](#15-agent-commerce-gateway)
16. [x402 Payment Protocol](#16-x402-payment-protocol)
17. [Intents System](#17-intents-system)
18. [SAP — Synapse Agent Protocol (SDK)](#18-sap--synapse-agent-protocol-sdk)
19. [SAP — On-Chain Protocol (via `@synapse-sap/sdk`)](#19-sap--on-chain-protocol-via-synapse-sapsdk)
20. [Solana Actions & Blinks](#20-solana-actions--blinks)
21. [Persistence](#21-persistence)
22. [Context / IoC Container](#22-context--ioc-container)
23. [gRPC / Geyser Parser](#23-grpc--geyser-parser)
24. [@solana/kit Bridge](#24-solanakit-bridge)
25. [Next.js Integration](#25-nextjs-integration)
26. [Common Patterns](#26-common-patterns)
27. [SAP Agent Skill Guides](#27-sap-agent-skill-guides)
28. [SAP CLI — synapse-sap](#28-sap-cli--synapse-sap)

---

## 1. Installation & API Keys

### Install

```bash
npm i @oobe-protocol-labs/synapse-client-sdk
```

Peer dependencies (install if using AI tools):
```bash
npm i @langchain/core zod
```

### API Key Configuration

**OOBE Protocol API Key** (required for all RPC access):

Append `?api_key=` to the endpoint URL. This is the **only** authentication method:

```ts
// ✅ Correct — API key as query param
const ENDPOINT = 'https://us-1-mainnet.oobeprotocol.ai?api_key=YOUR_OOBE_API_KEY';

// Use the authenticated URL everywhere
const client = new SynapseClient({ endpoint: ENDPOINT });
```

Or via environment variable (recommended):

```bash
# .env
OOBE_API_KEY=your-api-key-here
JUPITER_API_KEY=your-jupiter-key-here   # optional, only if using Jupiter tools
```

```ts
const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const client = new SynapseClient({ endpoint: ENDPOINT });
```

**Jupiter API Key** (optional — required only for Jupiter swap/quote/DCA tools):

If the user wants to use Jupiter DeFi tools (swap, quote, limit orders, DCA), they need a separate Jupiter API key. Pass it when creating Jupiter tools:

```ts
import { createJupiterTools } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

// ✅ CORRECT — Do NOT override apiUrl. The SDK uses https://api.jup.ag internally.
const { tools } = createJupiterTools({
  apiKey: process.env.JUPITER_API_KEY, // Jupiter-specific key
});
```

> **⚠️ CRITICAL**: Do **NOT** pass `apiUrl: 'https://quote-api.jup.ag/v6'` — that URL is **deprecated** and will cause `TOKEN_NOT_TRADABLE` errors. The SDK defaults to `https://api.jup.ag` which is the correct, current Jupiter API endpoint. Only pass `apiKey`.

> **Agent rule:** If the user has not provided their OOBE API key yet, **ask for it before running any SDK operation**. If they request Jupiter-related features, ask for the Jupiter API key too.

---

## 2. Endpoints

### Production Endpoints

| Region | URL | Use Case |
|--------|-----|----------|
| **US Mainnet** | `https://us-1-mainnet.oobeprotocol.ai?api_key=KEY` | Production — US region (lowest latency for Americas) |
| **EU Mainnet** | `https://staging.oobeprotocol.ai?api_key=KEY` | Production — EU region (lowest latency for Europe) |

All endpoints expose:
- **RPC**: `https://<host>` — JSON-RPC 2.0
- **WebSocket**: `wss://<host>/ws` — PubSub subscriptions
- **gRPC**: `https://<host>/grpc` — Yellowstone/Geyser streaming
- **gRPC native**: `grpc://<host>/grpc-native` — native gRPC transport

### Endpoint Resolution

```ts
import { SynapseNetwork, SynapseRegion, resolveEndpoint } from '@oobe-protocol-labs/synapse-client-sdk';

// Resolve US mainnet
const us = resolveEndpoint(SynapseNetwork.Mainnet, SynapseRegion.US);
// → { rpc: 'https://us-1-mainnet.oobeprotocol.ai', wss: 'wss://...', grpc: '...' }

// Resolve EU mainnet
const eu = resolveEndpoint(SynapseNetwork.Mainnet, SynapseRegion.EU);
// → { rpc: 'https://staging.oobeprotocol.ai', wss: 'wss://...', grpc: '...' }

// Auto-select fastest region
const fastest = await autoSelectRegion(SynapseNetwork.Mainnet);
```

---

## 3. Client Setup

### Direct endpoint

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;

const client = new SynapseClient({
  endpoint: ENDPOINT,
});

const balance = await client.rpc.getBalance(Pubkey('So11111111111111111111111111111111'));
```

### From endpoint registry

```ts
import { SynapseClient, SynapseNetwork, SynapseRegion } from '@oobe-protocol-labs/synapse-client-sdk';

const client = SynapseClient.fromEndpoint({
  network: SynapseNetwork.Mainnet,
  region: SynapseRegion.US,
  apiKey: process.env.OOBE_API_KEY, // appended as ?api_key= automatically
});
```

### Factory function

```ts
import { createSynapse } from '@oobe-protocol-labs/synapse-client-sdk';

const client = createSynapse({
  endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
});
```

### Configuration Options

```ts
interface SynapseClientConfig {
  endpoint: string;          // RPC endpoint URL with ?api_key= (required)
  apiKey?: string;           // API key (auto-appended as ?api_key= if not in URL)
  timeout?: number;          // Request timeout in ms (default: 30000)
  maxRetries?: number;       // Retry attempts on failure (default: 3)
  debug?: boolean;           // Enable debug logging
  headers?: Record<string, string>; // Extra HTTP headers
  wsEndpoint?: string;       // WebSocket endpoint (auto-derived if omitted)
  grpcEndpoint?: string;     // gRPC endpoint (auto-derived if omitted)
}
```

### Sub-clients (lazy-loaded)

```ts
client.rpc       // SolanaRpc — 53 JSON-RPC methods
client.das       // DasClient — 11 DAS methods
client.ws        // WsClient — WebSocket subscriptions
client.grpc      // GrpcTransport — gRPC/Geyser streaming
client.accounts  // AccountsClient — typed account fetchers
client.transport // HttpTransport — raw RPC transport
client.kitRpc    // @solana/kit native RPC client
```

---

## 4. Branded Types

Zero-cost nominal types enforced at compile time. **These are NOT plain strings/numbers** — passing a raw `string` where `Pubkey` is expected will cause a TypeScript error.

```ts
import { Pubkey, Sig, Slot, Epoch, Lamports, UnixTs } from '@oobe-protocol-labs/synapse-client-sdk';

const pk  = Pubkey('So11111111111111111111111111111111111111112');
const sig = Sig('5eykt4Uu...');
const s   = Slot(250_000_000);
const e   = Epoch(600);
const l   = Lamports(1_000_000_000n);  // = 1 SOL
const ts  = UnixTs(1709740800);
```

### ⚠️ Strict-Mode Rules (MUST follow)

1. **Never pass raw strings where branded types are expected.**
   ```ts
   // ❌ WRONG — TypeScript error in strict mode
   const balance = await client.rpc.getBalance('So111...');

   // ✅ CORRECT — wrap with Pubkey()
   const balance = await client.rpc.getBalance(Pubkey('So111...'));
   ```

2. **Always wrap user-supplied wallet addresses with `Pubkey()`.**
   When the user gives you an address as a plain string, immediately brand it:
   ```ts
   const userWallet = Pubkey(userInput);  // brand it once, use everywhere
   ```

3. **Cast singletons and factory returns to `SynapseClient`.**
   `createSingleton()` and other factories may return a generic type. In strict Next.js builds, cast explicitly:
   ```ts
   import { SynapseClient, createSingleton } from '@oobe-protocol-labs/synapse-client-sdk';

   const getClient = createSingleton(
     () => new SynapseClient({ endpoint: ENDPOINT }),
     { key: 'synapse-client' },
   );

   // ✅ Cast to SynapseClient — avoids 'unknown' type in app router
   const client = getClient() as SynapseClient;
   ```

4. **Branded types are assignable to their base type** (e.g. `Pubkey` → `string` works), but **not the reverse**. If an external library expects `string`, you can pass a `Pubkey` directly.

---

## 5. RPC Methods (53)

Access via `client.rpc.*` or standalone functions.

### Account Methods (5)
| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `getAccountInfo(pubkey, opts?)` | `Pubkey, { commitment?, encoding? }` | Account data or null | Fetch account data |
| `getBalance(pubkey, opts?)` | `Pubkey, { commitment? }` | `{ value: Lamports }` | SOL balance in lamports |
| `getMultipleAccounts(pubkeys, opts?)` | `Pubkey[]` | Account data array | Batch fetch accounts |
| `getProgramAccounts(program, opts?)` | `Pubkey, filters?` | Program accounts | All accounts owned by program |
| `getLargestAccounts(opts?)` | `{ filter?, commitment? }` | Top 20 accounts | Largest lamport balances |

### Block Methods (7)
| Method | Description |
|--------|-------------|
| `getBlock(slot, opts?)` | Confirmed block by slot |
| `getBlockHeight(opts?)` | Current block height |
| `getBlockTime(slot)` | Estimated production time |
| `getBlockProduction(opts?)` | Recent block production info |
| `getBlocks(startSlot, endSlot?)` | Block list between slots |
| `getBlocksWithLimit(startSlot, limit)` | Blocks from slot with limit |
| `getBlockCommitment(slot)` | Block commitment |

### Transaction Methods (6)
| Method | Description |
|--------|-------------|
| `getTransaction(sig, opts?)` | Confirmed transaction by signature |
| `getSignaturesForAddress(addr, opts?)` | Signatures for an address |
| `getSignatureStatuses(sigs, opts?)` | Batch signature statuses |
| `sendTransaction(tx, opts?)` | Submit signed transaction |
| `simulateTransaction(tx, opts?)` | Simulate without submitting |
| `requestAirdrop(pubkey, lamports)` | Airdrop (devnet/testnet only) |

### Blockhash Methods (2)
| Method | Description |
|--------|-------------|
| `getLatestBlockhash(opts?)` | Latest blockhash + last valid block height |
| `isBlockhashValid(blockhash, opts?)` | Check blockhash validity |

### Slot / Epoch Methods (5)
| Method | Description |
|--------|-------------|
| `getSlot(opts?)` | Current slot |
| `getSlotLeader(opts?)` | Current slot leader |
| `getSlotLeaders(startSlot, limit)` | Slot leaders for range |
| `getEpochInfo(opts?)` | Current epoch info |
| `getEpochSchedule()` | Epoch schedule parameters |

### Inflation Methods (3)
| Method | Description |
|--------|-------------|
| `getInflationGovernor(opts?)` | Inflation governor params |
| `getInflationRate()` | Current epoch inflation |
| `getInflationReward(addresses, opts?)` | Staking rewards per address |

### Cluster / Network Methods (8)
| Method | Description |
|--------|-------------|
| `getVoteAccounts(opts?)` | All vote accounts + stake |
| `getClusterNodes()` | Cluster node info |
| `getSupply(opts?)` | SOL supply breakdown |
| `getRecentPerformanceSamples(limit?)` | Performance samples |
| `getHealth()` | Node health status |
| `getVersion()` | Solana version |
| `getGenesisHash()` | Genesis hash |
| `getIdentity()` | Node identity pubkey |

### Rent / Ledger Methods (5)
| Method | Description |
|--------|-------------|
| `getMinimumBalanceForRentExemption(size)` | Minimum lamports for rent-exempt |
| `minimumLedgerSlot()` | Lowest slot in ledger |
| `getFirstAvailableBlock()` | First non-purged block |
| `getHighestSnapshotSlot()` | Highest snapshot slot |
| `getLeaderSchedule(opts?)` | Leader schedule |

### Staking Methods (2)
| Method | Description |
|--------|-------------|
| `getStakeMinimumDelegation(opts?)` | Minimum delegation |
| `getStakeActivation(pubkey, opts?)` | Stake activation state *(deprecated)* |

### Token / SPL Methods (5)
| Method | Description |
|--------|-------------|
| `getTokenAccountBalance(pubkey)` | SPL token balance |
| `getTokenAccountsByOwner(owner, opts)` | All token accounts for owner |
| `getTokenAccountsByDelegate(delegate, opts)` | Token accounts by delegate |
| `getTokenLargestAccounts(mint)` | Top 20 for token mint |
| `getTokenSupply(mint)` | Total supply for mint |

### Fee / Misc Methods (5)
| Method | Description |
|--------|-------------|
| `getTransactionCount(opts?)` | Ledger transaction count |
| `getFeeForMessage(message)` | Network fee for message |
| `getRecentPrioritizationFees(pubkeys?)` | Recent priority fees |
| `getMaxRetransmitSlot()` | Max retransmit slot |
| `getMaxShredInsertSlot()` | Max shred insert slot |

---

## 6. DAS — Digital Asset Standard Methods (11)

Access via `client.das.*`. Used for NFTs, compressed NFTs (cNFTs), and digital assets.

```ts
const asset = await client.das.getAsset({ id: 'AssetPubkeyHere...' });
const nfts  = await client.das.getAssetsByOwner({ ownerAddress: 'WalletPubkey...' });
```

| Method | Params | Description |
|--------|--------|-------------|
| `getAsset({ id })` | Asset pubkey | Single digital asset |
| `getAssetProof({ id })` | Asset pubkey | Merkle proof for compressed asset |
| `getAssetBatch({ ids })` | Pubkey array | Batch fetch assets |
| `getAssetProofBatch({ ids })` | Pubkey array | Batch Merkle proofs |
| `getAssetsByOwner({ ownerAddress, ... })` | Owner wallet | All assets owned by wallet |
| `getAssetsByGroup({ groupKey, groupValue })` | Group (e.g. collection) | Assets in a group |
| `getAssetsByCreator({ creatorAddress })` | Creator pubkey | Assets by creator |
| `getAssetsByAuthority({ authorityAddress })` | Authority pubkey | Assets by authority |
| `searchAssets({ ... })` | Flexible filters | Search with criteria |
| `getSignaturesForAsset({ id })` | Asset pubkey | Transaction signatures for asset |
| `getTokenAccounts({ owner? , mint? })` | Owner or mint | Token accounts |

### ⚠️ DAS Strict-Type Pitfall — Collection Gating

`GetAssetsByOwnerParams` does **NOT** include `groupKey`/`groupValue` filter fields in the official type. If you need to check whether a wallet holds an NFT from a specific collection, you **cannot** filter at the DAS query level. Instead:

1. Fetch all assets for the owner.
2. Manually inspect the `grouping` array in each returned asset.

```ts
// ✅ CORRECT — fetch then filter client-side
const { items } = await client.das.getAssetsByOwner({
  ownerAddress: walletAddress,
  page: 1,
  limit: 1000,
});

const REQUIRED_COLLECTION = 'YourCollectionMintPubkey...';

const hasNft = items.some((asset) =>
  asset.grouping?.some(
    (g) => g.group_key === 'collection' && g.group_value === REQUIRED_COLLECTION,
  ),
);

if (!hasNft) throw new Error('Wallet does not hold an NFT from the required collection');
```

> **Do NOT** try to pass `{ groupKey: 'collection', groupValue: '...' }` into `getAssetsByOwner()` — it is not in the type and will cause a TypeScript error in strict mode. Use `getAssetsByGroup()` instead if you want to query by collection directly (but that returns ALL holders, not filtered to one wallet).

---

## 7. WebSocket Subscriptions (7)

Access via `client.ws.*`.

```ts
const subId = await client.ws.onAccountChange(
  Pubkey('So111...'),
  (account) => console.log('Updated:', account),
);

// Later
await client.ws.unsubscribe(subId);
```

| Method | Description |
|--------|-------------|
| `onAccountChange(pubkey, callback, opts?)` | Account data changes |
| `onProgramAccountChange(program, callback, opts?)` | All accounts for a program |
| `onLogs(filter, callback, opts?)` | Transaction logs (`'all'`, `'allWithVotes'`, or mentions `Pubkey`) |
| `onSignature(sig, callback, opts?)` | Transaction confirmation |
| `onSlotChange(callback)` | Slot changes |
| `onRootChange(callback)` | Root slot changes |
| `unsubscribe(subId)` | Remove subscription |
| `close()` | Close connection + clear all |

---

## 8. Account Readers (8)

Access via `client.accounts.*`. Fetch + decode in one call.

```ts
const tokenAcct = await client.accounts.fetchTokenAccount(transport, Pubkey('...'));
const mint      = await client.accounts.fetchMint(transport, Pubkey('...'));
const stake     = await client.accounts.fetchStakeAccount(transport, Pubkey('...'));
```

| Method | Description |
|--------|-------------|
| `fetchTokenAccount(transport, pubkey)` | SPL Token account (auto-detects Token vs Token-2022) |
| `fetchMint(transport, pubkey)` | Token mint (auto-detects) |
| `fetchTokenAccountsByOwner(transport, owner, mint?)` | All token accounts for owner |
| `fetchStakeAccount(transport, pubkey)` | Stake account |
| `fetchNonceAccount(transport, pubkey)` | Durable nonce account |
| `fetchLookupTable(transport, pubkey)` | Address Lookup Table |
| `fetchDecoded(transport, pubkey, decoder)` | Any account + custom decoder |
| `fetchDecodedBatch(transport, pubkeys, decoder)` | Batch + custom decoder |

---

## 9. Decoders (10)

Pure functions — decode raw bytes with zero I/O. Import from root or `decoders`.

```ts
import { decodeTokenAccount, decodeMint } from '@oobe-protocol-labs/synapse-client-sdk';
```

| Function | Description |
|----------|-------------|
| `decodeTokenAccount(data)` | SPL Token v1 account |
| `decodeMint(data)` | SPL Token v1 mint |
| `decodeToken2022Account(data)` | Token-2022 account (with extensions) |
| `decodeToken2022Mint(data)` | Token-2022 mint (with extensions) |
| `decodeStakeAccount(data)` | Stake account |
| `decodeNonceAccount(data)` | Durable nonce account |
| `decodeLookupTable(data)` | Address Lookup Table |
| `decodeMultisig(data)` | SPL Token multisig |
| `AccountReader` | Low-level DataView byte reader class |
| `encodeBase58(bytes)` | Encode bytes to base58 |

**Constants**: `TOKEN_PROGRAM_ID`, `TOKEN_2022_PROGRAM_ID`, `SYSTEM_PROGRAM_ID`, `STAKE_PROGRAM_ID`, `LOOKUP_TABLE_PROGRAM_ID`, `TOKEN_ACCOUNT_SIZE`, `MINT_SIZE`, `NONCE_ACCOUNT_SIZE`, `MULTISIG_SIZE`.

---

## 10. Programs / Instruction Builders (26)

Create transaction instructions without external deps.

```ts
import { SystemProgram, SplToken, AssociatedToken, ComputeBudget, Memo } from '@oobe-protocol-labs/synapse-client-sdk';
```

### SystemProgram (5)
| Method | Description |
|--------|-------------|
| `SystemProgram.transfer(params)` | Transfer SOL |
| `SystemProgram.createAccount(params)` | Create account |
| `SystemProgram.assign(params)` | Assign to program |
| `SystemProgram.createWithSeed(params)` | Create with seed derivation |
| `SystemProgram.allocate(params)` | Allocate space |

### SplToken (11)
| Method | Description |
|--------|-------------|
| `SplToken.transfer(params)` | Transfer tokens |
| `SplToken.transferChecked(params)` | Transfer with decimal check |
| `SplToken.approve(params)` | Approve delegate |
| `SplToken.revoke(params)` | Revoke delegate |
| `SplToken.mintTo(params)` | Mint tokens |
| `SplToken.mintToChecked(params)` | Mint with decimal check |
| `SplToken.burn(params)` | Burn tokens |
| `SplToken.closeAccount(params)` | Close token account |
| `SplToken.freezeAccount(params)` | Freeze account |
| `SplToken.thawAccount(params)` | Thaw account |
| `SplToken.syncNative(params)` | Sync wrapped SOL |

### AssociatedToken (2)
| Method | Description |
|--------|-------------|
| `AssociatedToken.create(params)` | Create ATA |
| `AssociatedToken.createIdempotent(params)` | Create ATA (no-op if exists) |

### ComputeBudget (3)
| Method | Description |
|--------|-------------|
| `ComputeBudget.setComputeUnitLimit(params)` | Set CU limit |
| `ComputeBudget.setComputeUnitPrice(params)` | Set priority fee |
| `ComputeBudget.requestHeapFrame(params)` | Request heap memory |

### Memo (2)
| Method | Description |
|--------|-------------|
| `Memo.v1(message)` | Memo Program v1 |
| `Memo.v2(message, signers?)` | Memo Program v2 |

### Utility
| Function | Description |
|----------|-------------|
| `createToken(params)` | High-level: create mint + ATA + mint-to in one call |

---

## 11. Utilities (26)

```ts
import { lamportsToSol, solToLamports, isValidPubkey, sleep, retry, chunk } from '@oobe-protocol-labs/synapse-client-sdk';
```

### Conversion & Validation
| Function | Description |
|----------|-------------|
| `lamportsToSol(lamports)` | Lamports → SOL (÷ 1e9) |
| `solToLamports(sol)` | SOL → branded `Lamports` (× 1e9) |
| `isValidPubkey(str)` | Validate base58 public key |
| `isValidSignature(str)` | Validate base58 signature |

### Async Helpers
| Function | Description |
|----------|-------------|
| `sleep(ms)` | Async sleep for ms |
| `retry(fn, opts?)` | Retry with exponential backoff |
| `chunk(array, size)` | Split array into chunks |

### Serialization
| Function | Description |
|----------|-------------|
| `toJsonSafe(value)` | BigInt-safe JSON conversion |
| `bigIntReplacer` | `JSON.stringify` replacer for BigInt |

### Environment
| Function | Description |
|----------|-------------|
| `isBrowser()` | `true` in browser |
| `isServer()` | `true` on server |
| `getEnvironment()` | `'browser'` or `'server'` |
| `SDK_USER_AGENT` | User-agent string |

### Endpoint Management
| Function | Description |
|----------|-------------|
| `resolveEndpoint(network, region?)` | Resolve RPC/WSS/gRPC URLs |
| `listEndpoints(network?)` | List all endpoints |
| `listRegions(network)` | Available regions |
| `listNetworks()` | Available networks |
| `autoSelectRegion(network)` | Fastest region by latency |
| `probeLatency(endpoint)` | Ping endpoint |
| `toClientConfig(endpoint, opts?)` | Endpoint → client config |
| `createSingleton(factory, opts?)` | HMR-safe singleton (Next.js/Vite) |

### Pre-resolved Endpoints
| Constant | Value |
|----------|-------|
| `SYNAPSE_MAINNET_US` | `https://us-1-mainnet.oobeprotocol.ai` |
| `SYNAPSE_MAINNET_EU` | `https://staging.oobeprotocol.ai` |
| `SYNAPSE_DEVNET_US` | Devnet US endpoint |
| `SYNAPSE_DEVNET_EU` | Devnet EU endpoint |

---

## 12. AI Tools — LangChain

### RPC Tools (53 methods)

```ts
import { createExecutableSolanaTools } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

const client = new SynapseClient({ endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` });
const { tools, toolMap } = createExecutableSolanaTools(client);

// All 53 RPC methods as LangChain StructuredTool[]
// Each tool has a Zod schema for input validation
```

> **⚠️ IMPORTANT**: The function is called `createExecutableSolanaTools`, NOT `createSolanaTools`. Using the wrong name will cause an import error.

### Protocol Tools (86 methods across 6 groups)

```ts
import {
  createJupiterTools,        // 22 tools — swap, quote, route, limit orders, DCA, price, smartSwap
  createRaydiumTools,        // 16 tools — pools, liquidity, farming, swaps
  createMetaplexTools,       // 12 tools — NFT mint, update, verify, burn, collections
  createJupiterOnchainTools, // 10 tools — on-chain Jupiter interactions
  createRaydiumOnchainTools, // 10 tools — on-chain Raydium interactions
  createSolanaProgramsTools, // 16 tools — program-level tools
  createProtocolTools,       // all protocol tools at once (86 total)
} from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

// ✅ CORRECT — no apiUrl needed, SDK defaults to https://api.jup.ag
const { tools } = createJupiterTools({
  apiKey: process.env.JUPITER_API_KEY,
});

// ❌ WRONG — never pass the deprecated quote-api URL
// const { tools } = createJupiterTools({ apiUrl: 'https://quote-api.jup.ag/v6' });
```

### Jupiter Tools Breakdown (22 tools)

| Group | Tools | Description |
|-------|-------|-------------|
| **Ultra** | `getOrder`, `executeOrder`, `getHoldings`, `shield` | Ultra swap API (simplified) |
| **Metis/Swap** | `getQuote`, `swap`, `swapInstructions`, `smartSwap` | Metis swap engine (full control) |
| **Price** | `getPrice` | Real-time token price |
| **Tokens** | `searchTokens`, `getTokenList`, `getTokenInfo`, `programLabels` | Token metadata |
| **Trigger** | `createLimitOrder`, `executeTrigger`, `cancelLimitOrder`, `cancelLimitOrders`, `getLimitOrders` | Limit & trigger orders |
| **Recurring** | `createDCA`, `executeDCA`, `cancelDCA`, `getDCAOrders` | Dollar-cost averaging |

### Protocol Tool Totals

| Factory | Count |
|---------|-------|
| `createJupiterTools()` | 22 |
| `createRaydiumTools()` | 16 |
| `createMetaplexTools()` | 12 |
| `createJupiterOnchainTools()` | 10 |
| `createRaydiumOnchainTools()` | 10 |
| `createSolanaProgramsTools()` | 16 |
| **Total (via `createProtocolTools()`)** | **86** |

### SDK Constants

```ts
import { JUPITER_API_URL, RAYDIUM_API_URL } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

console.log(JUPITER_API_URL); // 'https://api.jup.ag'
console.log(RAYDIUM_API_URL); // Raydium API base URL
```

---

## 13. Plugin System — SynapseAgentKit (110 tools)

The modular plugin architecture. Compose exactly the tools you need via `.use()`.

### Setup

```ts
import { SynapseAgentKit } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { TokenPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/token';
import { NFTPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/nft';
import { DeFiPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/defi';
import { MiscPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/misc';
import { BlinksPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/blinks';

const kit = new SynapseAgentKit({
  rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
  walletPubkey: 'YourWalletPubkey...',  // optional
})
  .use(TokenPlugin)
  .use(NFTPlugin)
  .use(DeFiPlugin)
  .use(MiscPlugin)
  .use(BlinksPlugin);
```

### SynapseAgentKit API

| Method | Returns | Description |
|--------|---------|-------------|
| `.use(plugin)` | `this` | Install a plugin (chainable) |
| `.getTools()` | `StructuredTool[]` | All tools as LangChain StructuredTool |
| `.getVercelAITools()` | Vercel AI format | All tools for Vercel AI SDK |
| `.getMcpToolDescriptors()` | `McpToolDescriptor[]` | MCP-compatible descriptors |
| `.getToolMap()` | `Map<string, Tool>` | Name → tool lookup |
| `.summary()` | object | Installed plugins, tool count, protocol list |
| `.destroy()` | void | Cleanup resources |

### TokenPlugin — 22 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/token`

**spl-token** (11 tools):
| Tool | Description |
|------|-------------|
| `deployToken` | Deploy a new SPL token mint |
| `transfer` | Transfer SPL tokens between wallets |
| `transferSol` | Transfer native SOL |
| `getBalance` | Get token balance for a wallet |
| `getTokenAccounts` | List all token accounts for owner |
| `mintTo` | Mint tokens to an account |
| `burn` | Burn tokens from an account |
| `freezeAccount` | Freeze a token account |
| `thawAccount` | Unfreeze a token account |
| `closeAccount` | Close a token account |
| `rugCheck` | Run a rug-pull risk analysis on a token |

**staking** (7 tools):
| Tool | Description |
|------|-------------|
| `stakeSOL` | Native SOL staking |
| `unstakeSOL` | Unstake native SOL |
| `getStakeAccounts` | List stake accounts |
| `stakeJupSOL` | Stake via Jupiter (JupSOL) |
| `unstakeJupSOL` | Unstake JupSOL |
| `stakeSolayer` | Stake via Solayer |
| `unstakeSolayer` | Unstake Solayer |

**bridging** (4 tools):
| Tool | Description |
|------|-------------|
| `bridgeWormhole` | Cross-chain bridge via Wormhole |
| `bridgeWormholeStatus` | Check Wormhole bridge status |
| `bridgeDeBridge` | Cross-chain bridge via deBridge |
| `bridgeDeBridgeStatus` | Check deBridge bridge status |

### NFTPlugin — 19 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/nft`

**metaplex-nft** (9 tools):
| Tool | Description |
|------|-------------|
| `deployCollection` | Create a new NFT collection |
| `mintNFT` | Mint a single NFT |
| `updateMetadata` | Update NFT metadata |
| `verifyCreator` | Verify creator on NFT |
| `verifyCollection` | Verify collection on NFT |
| `setAndVerifyCollection` | Set + verify collection |
| `delegateAuthority` | Delegate authority |
| `revokeAuthority` | Revoke authority |
| `configureRoyalties` | Configure royalty settings |

**3land** (5 tools):
| Tool | Description |
|------|-------------|
| `createCollection` | Create collection on 3Land |
| `mintAndList` | Mint + list for sale |
| `listForSale` | List existing NFT for sale |
| `cancelListing` | Cancel a listing |
| `buyNFT` | Purchase listed NFT |

**das** (5 tools):
| Tool | Description |
|------|-------------|
| `getAsset` | Fetch a digital asset |
| `getAssetsByOwner` | Assets owned by wallet |
| `getAssetsByCreator` | Assets by creator |
| `getAssetsByCollection` | Assets in collection |
| `searchAssets` | Search with filters |

### DeFiPlugin — 43 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/defi`

**pump** (2): `launchToken`, `trade`
**raydium-pools** (5): `createCPMM`, `createCLMM`, `createAMMv4`, `addLiquidity`, `removeLiquidity`
**orca** (5): `getWhirlpool`, `swap`, `openPosition`, `closePosition`, `collectFees`
**manifest** (4): `createMarket`, `placeLimitOrder`, `cancelOrder`, `getOrderbook`
**meteora** (5): `createDynamicPool`, `createDLMMPool`, `addDLMMLiquidity`, `removeDLMMLiquidity`, `createAlphaVault`
**openbook** (3): `createMarket`, `placeOrder`, `cancelOrder`
**drift** (7): `deposit`, `withdraw`, `openPerpPosition`, `closePerpPosition`, `getPositions`, `lend`, `borrow`
**adrena** (5): `openPosition`, `closePosition`, `addCollateral`, `removeCollateral`, `getPositions`
**lulo** (4): `deposit`, `withdraw`, `getBestRates`, `getPositions`
**jito** (3): `sendBundle`, `getBundleStatus`, `getTipEstimate`

### MiscPlugin — 20 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/misc`

**sns** (3): `registerDomain`, `resolveDomain`, `reverseLookup` — Bonfida .sol domains
**alldomains** (3): `registerDomain`, `resolveDomain`, `getOwnedDomains`
**pyth** (3): `getPrice`, `getPriceHistory`, `listPriceFeeds` — real-time oracle prices
**coingecko** (6): `getTokenPrice`, `getTrending`, `getTopGainersLosers`, `getTokenInfo`, `getPoolsByToken`, `getOHLCV`
**gibwork** (3): `createBounty`, `listBounties`, `submitWork`
**send-arcade** (2): `listGames`, `playGame`

### BlinksPlugin — 6 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/blinks`

| Tool | Description |
|------|-------------|
| `getAction` | Fetch a Solana Action by URL |
| `executeAction` | Execute an action |
| `confirmAction` | Confirm execution |
| `resolveBlinkUrl` | Resolve shortened blink URL |
| `validateActionsJson` | Validate actions.json |
| `buildActionUrl` | Build a proper action URL |

Pure HTTP — no RPC transport needed.

---

## 14. MCP — Model Context Protocol

Zero-dependency MCP implementation (spec 2024-11-05). Works as both server AND client.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/mcp`

### MCP Server

Exposes your SynapseAgentKit tools to any MCP client (Claude Desktop, Cursor, VS Code, Cline).

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(TokenPlugin)
  .use(DeFiPlugin);

// stdio mode (Claude Desktop, Cursor)
const server = new SynapseMcpServer(kit, {
  name: 'synapse-solana',
  version: '2.0.2',
  instructions: 'Solana blockchain tools for AI agents.',
});
await server.start(); // reads stdin, writes stdout

// SSE mode (web clients)
const sseServer = new SynapseMcpServer(kit, {
  transport: 'sse',
  ssePort: 3001,
  ssePath: '/mcp',
});
await sseServer.start(); // HTTP server on port 3001
```

**Claude Desktop config** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "synapse-solana": {
      "command": "npx",
      "args": ["synapse-mcp-server"],
      "env": {
        "SYNAPSE_RPC_URL": "https://us-1-mainnet.oobeprotocol.ai",
        "OOBE_API_KEY": "YOUR_OOBE_API_KEY"
      }
    }
  }
}
```

**Cursor config** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "synapse-solana": {
      "command": "npx",
      "args": ["synapse-mcp-server"],
      "env": {
        "SYNAPSE_RPC_URL": "https://us-1-mainnet.oobeprotocol.ai",
        "OOBE_API_KEY": "YOUR_OOBE_API_KEY"
      }
    }
  }
}
```

### SynapseMcpServer API

| Method | Description |
|--------|-------------|
| `start()` | Start server (stdio or SSE) |
| `stop()` | Graceful shutdown |
| `info()` | Server introspection |

MCP spec dispatch: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `resources/templates/list`, `prompts/list`, `prompts/get`, `ping`, `completion/complete`, `logging/setLevel`.

### MCP Client Bridge

Connect to external MCP servers and import their tools.

```ts
import { McpClientBridge } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const bridge = new McpClientBridge();

// Connect to GitHub MCP server
await bridge.connect({
  id: 'github',
  name: 'GitHub',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
  toolPrefix: 'github_',
});

// Connect to Postgres
await bridge.connect({
  id: 'postgres',
  name: 'PostgreSQL',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-postgres', process.env.DATABASE_URL!],
  toolPrefix: 'pg_',
});

// Connect via SSE
await bridge.connect({
  id: 'custom',
  name: 'Custom MCP',
  transport: 'sse',
  url: 'https://my-mcp-server.com/mcp/sse',
});

// Get tools or use as plugin
const externalTools = bridge.getTools();       // LangChain StructuredTool[]
const plugin = bridge.toPlugin();              // SynapsePlugin
kit.use(plugin);                               // chain into AgentKit

// Direct access
const result = await bridge.callTool('github', 'list_repos', { owner: 'oobe-protocol-labs' });
const resource = await bridge.readResource('postgres', 'postgres://table/users');
```

### McpClientBridge API

| Method | Description |
|--------|-------------|
| `connect(config)` | Connect to an MCP server |
| `disconnect(id)` | Disconnect a server |
| `disconnectAll()` | Disconnect all |
| `getTools()` | All external tools as LangChain |
| `getServerTools(id)` | Tools from specific server |
| `callTool(serverId, name, args)` | Call a tool directly |
| `readResource(serverId, uri)` | Read a resource |
| `toPlugin()` | Convert to SynapsePlugin for `.use()` |
| `getAllStatuses()` | Connection statuses |
| `getAllToolDefinitions()` | Raw tool definitions |

---

## 15. Agent Commerce Gateway

Session management, pricing, validation, and marketplace for agent-to-agent commerce.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/gateway`

```ts
import {
  AgentGateway,
  createAgentGateway,
  AgentSession,
  PricingEngine,
  ResponseValidator,
  ToolMarketplace,
  AgentRegistry,
  createMonetizedTools,
  createMultiProtocolMonetizedTools,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/gateway';
```

### AgentGateway
| Method | Description |
|--------|-------------|
| `createSession(config)` | Create metered session |
| `processRequest(sessionId, request)` | Process request with metering |
| `getSessionInfo(sessionId)` | Session info |
| `revokeSession(sessionId)` | Revoke session |
| `registerTool(def)` | Register tool in marketplace |
| `discoverTools(query)` | Search marketplace |
| `getMetrics()` | Gateway metrics |

### AgentSession
| Method | Description |
|--------|-------------|
| `create(config)` | Create session with TTL + rate limits |
| `validate(sessionId, token)` | Validate session token |
| `consume(sessionId)` | Consume a request from quota |
| `revoke(sessionId)` | Revoke |
| `info(sessionId)` | Session details |
| `cleanup()` | Remove expired sessions |

### PricingEngine
| Method | Description |
|--------|-------------|
| `calculateCost(method, params)` | Calculate cost for a call |
| `registerTier(tier)` | Register pricing tier |
| `getTiers()` | List tiers |
| `getUsage(sessionId)` | Usage stats |
| `estimateBatch(methods)` | Estimate batch cost |

### ResponseValidator
| Method | Description |
|--------|-------------|
| `validate(response, schema)` | Validate response shape |
| `attest(response, privateKey)` | Sign response attestation |
| `verify(response, attestation, publicKey)` | Verify attestation |

### Monetized Tools

```ts
// Create monetized versions of tools with per-call pricing
const monetized = createMonetizedTools(tools, pricingConfig);
const multiProto = createMultiProtocolMonetizedTools(protocolTools, pricingConfig);
```

### Gateway Errors

| Error | Description |
|-------|-------------|
| `GatewayError` | Base gateway error |
| `SessionNotFoundError` | Session ID not found |
| `MaxSessionsError` | Maximum concurrent sessions reached |
| `BudgetExhaustedError` | Session budget depleted |
| `RateLimitExceededError` | Too many requests |
| `SessionExpiredError` | Session TTL expired |
| `CallLimitExceededError` | Call quota exhausted |
| `IntentVerificationError` | Intent signature verification failed |

---

## 16. x402 Payment Protocol

HTTP 402-based micropayment protocol for AI agent commerce.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/gateway` (x402 is part of the gateway module)

```ts
import {
  X402Client,
  X402Paywall,
  FacilitatorClient,
  FacilitatorDiscovery,
  createFacilitator,
  createX402Client,
  encodePaymentHeader,
  decodePaymentHeader,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/gateway';
```

### X402Client (Buyer)
| Method | Description |
|--------|-------------|
| `pay(invoice)` | Pay a 402 invoice |
| `negotiate(offer)` | Negotiate terms |
| `getReceipt(paymentId)` | Get payment receipt |

### X402Paywall (Seller)
| Method | Description |
|--------|-------------|
| `protect(route, price)` | Protect endpoint with 402 |
| `verify(payment)` | Verify incoming payment |
| `middleware()` | Express/Connect middleware |

### FacilitatorDiscovery
| Method | Description |
|--------|-------------|
| `findFacilitatorsByNetwork(network)` | Find facilitators for a network |
| `findGasSponsoredFacilitators()` | Find gas-sponsored facilitators |
| `listKnownFacilitators()` | List all known facilitators |
| `resolveKnownFacilitator(id)` | Resolve by ID |

### Supported Networks & Tokens

| Constant | Description |
|----------|-------------|
| `SOLANA_MAINNET`, `SOLANA_DEVNET` | Solana network IDs |
| `USDC_SOLANA_MAINNET`, `USDC_SOLANA_DEVNET` | USDC on Solana |
| `BASE_MAINNET`, `BASE_SEPOLIA` | Base network IDs |
| `ETHEREUM_MAINNET`, `POLYGON_MAINNET`, `AVALANCHE_MAINNET`, `SEI_MAINNET` | EVM chains |
| `USDC_BASE_MAINNET`, `USDC_ETHEREUM_MAINNET` | USDC on EVM chains |

### x402 Protocol Constants

| Constant | Value |
|----------|-------|
| `X402_STATUS_CODE` | `402` |
| `X402_VERSION` | Protocol version |
| `X402_HEADER_PAYMENT_REQUIRED` | Payment header key |
| `X402_HEADER_PAYMENT_SIGNATURE` | Signature header key |

---

## 17. Intents System

Natural language → on-chain action resolution.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/intents`

```ts
import { IntentParser, IntentPlanner, IntentExecutor } from '@oobe-protocol-labs/synapse-client-sdk/ai/intents';
```

| Class | Method | Description |
|-------|--------|-------------|
| `IntentParser` | `parse(text)` | Natural language → structured intent |
| `IntentPlanner` | `plan(intent)` | Intent → execution steps with dependency resolution |
| `IntentExecutor` | `execute(plan)` | Execute planned steps |

### Intent Errors

| Error | Description |
|-------|-------------|
| `IntentError` | Base intent error |
| `CyclicDependencyError` | Circular dependency in plan steps |
| `UnresolvedReferenceError` | Missing dependency reference |
| `BudgetExceededError` | Execution would exceed budget |

---

## 18. SAP — Synapse Agent Protocol (SDK)

On-chain agent registry, discovery, scoring, and validation — built into the Synapse Client SDK.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/sap`

```ts
import {
  SAPDiscovery,
  SAPInstructionBuilder,
  SAPCapabilityRegistry,
  SAPValidator,
  SubnetworkBuilder,
  OnChainPersistenceAdapter,
  computeAgentHealthScore,
  computeNetworkAnalytics,
  deriveAgentPDA,
  deserializeAgentAccount,
  SAP_DEFAULT_PROGRAM_ID,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/sap';
```

| Class / Function | Description |
|------------------|-------------|
| `SAPDiscovery` | Agent discovery — find by capability, protocol, score |
| `SAPInstructionBuilder` | Build SAP program instructions |
| `SAPCapabilityRegistry` | Register and query agent capabilities |
| `SAPValidator` | Validate agent behavior and integrity |
| `SubnetworkBuilder` | Create and manage agent subnetworks |
| `OnChainPersistenceAdapter` | Persist agent state on-chain |
| `computeAgentHealthScore` | Calculate agent health score |
| `computeNetworkAnalytics` | Calculate network-wide analytics |
| `deriveAgentPDA` | Derive agent PDA from wallet |
| `deserializeAgentAccount` | Deserialize on-chain agent account data |
| `serializeRegisterData` / `serializeUpdateData` | Serialize instruction data |
| `pdaToIdentity` | Convert PDA to agent identity |
| `pricingToTier` / `computeCallCost` / `estimateTotalCost` | Cost computation utilities |
| `base58Decode` / `base58Encode` | Base58 encoding/decoding |
| `BorshReader` / `BorshWriter` | Borsh serialization utilities |

### SAP Constants

| Constant | Value |
|----------|-------|
| `SAP_DEFAULT_PROGRAM_ID` | `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` |
| `SAP_SEED_PREFIX` | PDA seed prefix |
| `SAP_ACCOUNT_DISCRIMINATOR` | Account discriminator bytes |

### SAP Errors

| Error | Description |
|-------|-------------|
| `SAPProgramError` | On-chain program error |
| `SAPDiscoveryError` | Discovery lookup failure |
| `SAPValidationError` | Agent validation failure |

> **For full SAP protocol interaction** (agent registration, memory, escrow, tool publishing), use the dedicated `@synapse-sap/sdk` package. See [§19](#19-sap--on-chain-protocol-via-synapse-sapsdk) below.
>
> **Role-specific guides:** Consumer workflow → [skills/client.md](./skills/client.md) · Merchant workflow → [skills/merchant.md](./skills/merchant.md) · CLI access → [§28](#28-sap-cli--synapse-sap)

---

## 19. SAP — On-Chain Protocol (via `@synapse-sap/sdk`)

> **📚 Full documentation**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs  
> **Program ID**: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`

The **Solana Agent Protocol (SAP)** is a full on-chain protocol for AI agents on Solana. The dedicated `@synapse-sap/sdk` package provides a TypeScript client for all protocol operations.

> **Role-specific deep-dives** for production agents:
> - **Consumer (buyer):** [skills/client.md](./skills/client.md) — discovery, escrow creation, x402 headers, settlement verification, endpoint validation, Zod schema validation, RPC strategy, network normalization
> - **Merchant (seller):** [skills/merchant.md](./skills/merchant.md) — agent registration, tool publishing, escrow settlement, memory vault, delegate hot-wallet, attestations, reputation metrics, plugin adapter, PostgreSQL mirror
> - **CLI access:** [§28](#28-sap-cli--synapse-sap) — `synapse-sap` command-line with 10 command groups and 40+ subcommands for full protocol access without writing code

### Installation

```bash
npm i @synapse-sap/sdk @coral-xyz/anchor @solana/web3.js
```

### Quick Start

```ts
import { SapClient } from '@synapse-sap/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

const provider = AnchorProvider.env();
const client = SapClient.from(provider);

// Register an agent
await client.agent.register({
  name: 'SwapBot',
  description: 'AI-powered multi-DEX swap agent',
  capabilities: [
    { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: null },
  ],
  pricing: [
    { tierId: 'free', pricePerCall: '0', currency: 'SOL' },
  ],
  protocols: ['jupiter', 'A2A'],
});
```

### Architecture — SapClient Module Tree

```
SapClient
├── .agent          → AgentModule          (register, update, deactivate, reactivate, close)
├── .feedback       → FeedbackModule       (give, update, revoke)
├── .indexing       → IndexingModule       (capability/protocol/tool category indexes)
├── .tools          → ToolsModule          (publish, inscribe, update, deactivate, checkpoints)
├── .vault          → VaultModule          (init, sessions, inscribe, delegate, encrypt)
├── .escrow         → EscrowModule         (create, deposit, settle, batchSettle, withdraw)
├── .attestation    → AttestationModule    (create, revoke)
├── .ledger         → LedgerModule         (init, write, seal, close, fetch pages)
├── .discovery      → DiscoveryRegistry    (findByCapability, findByProtocol, profiles, network overview)
├── .session        → SessionManager       (start, write, read, seal, close — recommended entry point)
├── .x402           → X402Registry         (estimateCost, preparePayment, buildPaymentHeaders)
└── .builder        → AgentBuilder         (fluent registration API)
```

### 6 Protocol Layers

| Layer | Purpose | Modules |
|-------|---------|---------|
| **Identity** | Agent registration, lifecycle, reputation metrics | `agent`, `feedback`, `attestation` |
| **Memory** | Conversation storage — ring buffer (Ledger) or encrypted (Vault) | `ledger`, `vault`, `session` |
| **Reputation** | On-chain feedback (1–5 score), attestations, health scoring | `feedback`, `attestation` |
| **Commerce** | x402 micropayment escrow — SOL & SPL token, volume curves | `escrow`, `x402` |
| **Tools** | On-chain tool descriptors with schema hashing, versioning | `tools` |
| **Discovery** | Capability/protocol indexes, agent profiles, network overview | `discovery`, `indexing` |

---

### Agent Lifecycle

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/03-agent-lifecycle.md

#### Registration (Direct)

```ts
await client.agent.register({
  name: 'SwapBot',
  description: 'Multi-DEX swap agent',
  capabilities: [
    { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: null },
    { id: 'raydium:swap', protocolId: 'raydium', version: '2.0', description: null },
  ],
  pricing: [
    { tierId: 'basic', pricePerCall: '1000000', currency: 'SOL' },
  ],
  protocols: ['jupiter', 'raydium', 'A2A'],
});
```

#### Registration (Fluent Builder)

```ts
await client.builder
  .agent('SwapBot')
  .description('Multi-DEX swap agent')
  .addCapability('jupiter:swap', { protocolId: 'jupiter', version: '6.0' })
  .addCapability('raydium:swap', { protocolId: 'raydium', version: '2.0' })
  .addPricingTier({ tierId: 'basic', pricePerCall: '1000000', currency: 'SOL' })
  .addProtocol('jupiter')
  .addProtocol('raydium')
  .register();
```

#### Lifecycle Operations

```ts
// Update agent metadata
await client.agent.update({ description: 'Updated description' });

// Deactivate (still discoverable but marked inactive)
await client.agent.deactivate();

// Reactivate
await client.agent.reactivate();

// Self-report metrics
await client.agent.reportCalls(100);               // Update call count
await client.agent.updateReputation(150, 9950);     // latency ms, uptime bps (99.5%)

// Fetch agent data
const data = await client.agent.fetch();
const stats = await client.agent.fetchStats();
const global = await client.agent.fetchGlobalRegistry();

// Close agent permanently (reclaim rent)
await client.agent.close();
```

---

### Memory Systems — SessionManager (Recommended)

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/04-memory-systems.md

The **SessionManager** (`client.session`) is the recommended entry point for all memory operations. It orchestrates vault creation, session opening, ledger initialization, writing, sealing, and closing in the correct order.

#### Recommended Workflow

```ts
const session = client.session;

// 1. Start — creates vault + session + ledger as needed
const ctx = await session.start('conversation-001');

// 2. Write messages to ring buffer + TX log
await session.write(ctx, 'User: swap 10 SOL to USDC');
await session.write(ctx, 'Agent: executing via Jupiter…');

// 3. Read back latest entries from ring buffer
const entries = await session.readLatest(ctx);

// 4. Seal ring buffer into permanent archive page
await session.seal(ctx);

// 5. Close when conversation is finished (reclaim rent)
await session.close(ctx);
```

#### Two Memory Backends

| Feature | Ledger (Recommended) | Vault (Legacy) |
|---------|---------------------|----------------|
| Storage | Ring buffer (4 KB) + TX log | TX log only (encrypted AES-256-GCM) |
| On-chain rent | ~0.032 SOL per ledger | ~0 (data in logs) |
| Per-write cost | ~0.000005 SOL | ~0.000005 SOL |
| Queryable from RPC | Yes (ring buffer) | No (parse TX history) |
| Best for | Active memory, read-back needed | Permanent write-once encrypted records |

#### Best Practices

- **Always seal before closing** — unsaved ring buffer data is lost if you close without sealing
- **Monitor ring buffer utilization** — seal proactively when >80% full
- **Use SessionManager** — avoid manual vault/session/ledger orchestration

```ts
// ✅ Correct order
await session.seal(ctx);   // ring buffer → permanent LedgerPage
await session.close(ctx);  // reclaim rent

// ❌ Data loss risk
await session.close(ctx);  // ring buffer data lost if not sealed
```

---

### x402 Escrow Payments

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/05-x402-payments.md

#### Consumer Flow (Paying for Agent Services)

```ts
// 1. Estimate cost
const cost = await client.x402.estimateCost(agentPubkey, 10); // 10 calls

// 2. Prepare payment (creates escrow)
const payment = await client.x402.preparePayment(agentPubkey, {
  amount: cost,
  currency: 'SOL',
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
});

// 3. Build headers for HTTP requests
const headers = client.x402.buildPaymentHeaders(payment);
// Use these headers when calling the agent's x402-protected endpoint
```

#### Agent Flow (Settling Payments)

```ts
// Settle after serving N calls
await client.escrow.settle(depositorPubkey, 5, serviceHash);

// Batch settlement — up to 10 in one TX
await client.escrow.batchSettle(depositorPubkey, settlements);
```

#### Volume Curves

Escrow supports pricing curves with up to 5 breakpoints for volume discounts:

```ts
await client.escrow.create({
  agent: agentPubkey,
  amount: new BN(10_000_000_000), // 10 SOL
  pricingCurve: [
    { callThreshold: 0,    pricePerCall: new BN(100_000_000) },  // 0.1 SOL/call
    { callThreshold: 100,  pricePerCall: new BN(80_000_000) },   // 0.08 SOL/call
    { callThreshold: 1000, pricePerCall: new BN(50_000_000) },   // 0.05 SOL/call
  ],
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 3600),
});
```

---

### Discovery & Indexing

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/06-discovery-indexing.md

#### High-Level Queries (DiscoveryRegistry)

```ts
// Find agents by capability
const agents = await client.discovery.findAgentsByCapability('jupiter:swap');

// Find agents by protocol
const a2aAgents = await client.discovery.findAgentsByProtocol('A2A');

// Multi-capability search (deduplicated)
const swapAgents = await client.discovery.findAgentsByCapabilities([
  'jupiter:swap', 'raydium:swap', 'orca:swap',
]);

// Find tools by category
const swapTools = await client.discovery.findToolsByCategory('Swap');

// Get full agent profile
const profile = await client.discovery.getAgentProfile(agentWallet);
if (profile) {
  console.log(profile.identity.name);
  console.log(profile.computed.reputationScore);  // 0–1000
  console.log(profile.computed.hasX402);           // boolean
  console.log(profile.computed.protocols);         // string[]
}

// Network overview
const overview = await client.discovery.getNetworkOverview();
console.log(`Agents: ${overview.totalAgents}, Active: ${overview.activeAgents}`);
console.log(`Tools: ${overview.totalTools}, Vaults: ${overview.totalVaults}`);
```

#### Low-Level Index Management (IndexingModule)

```ts
// Capability indexes
await client.indexing.initCapabilityIndex('jupiter:swap');
await client.indexing.addToCapabilityIndex('jupiter:swap');
await client.indexing.removeFromCapabilityIndex('jupiter:swap');

// Protocol indexes
await client.indexing.initProtocolIndex('jupiter');
await client.indexing.addToProtocolIndex('jupiter');

// Tool category indexes
import { TOOL_CATEGORY_VALUES } from '@synapse-sap/sdk';
await client.indexing.initToolCategoryIndex(TOOL_CATEGORY_VALUES.Swap);
await client.indexing.addToToolCategory(TOOL_CATEGORY_VALUES.Swap, toolPda);
```

#### Tool Categories

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

---

### Tool Registry

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/07-tools-schemas.md

Publish on-chain tool descriptors with schema hashing and version tracking:

```ts
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES } from '@synapse-sap/sdk';

// Publish a tool descriptor
await client.tools.publishByName(
  'jupiterSwap',                                    // toolName
  'jupiter',                                        // protocolId
  'Execute a token swap via Jupiter aggregator',     // description
  JSON.stringify(inputSchema),                       // inputSchema (JSON string)
  JSON.stringify(outputSchema),                      // outputSchema (JSON string)
  HTTP_METHOD_VALUES.Post,                           // httpMethod
  TOOL_CATEGORY_VALUES.Swap,                         // category
  4,                                                 // paramsCount
  3,                                                 // requiredParams
  false,                                             // isCompound
);

// Inscribe full schema into TX logs (zero rent, permanent)
await client.tools.inscribeSchema('jupiterSwap', {
  schemaType: 0,  // 0 = input, 1 = output, 2 = description
  schemaData: Buffer.from(inputSchemaJson),
  schemaHash: hashToArray(sha256(inputSchemaJson)),
  compression: 0,
});

// Update, deactivate, reactivate, close
await client.tools.update('jupiterSwap', { paramsCount: 5 });
await client.tools.deactivate('jupiterSwap');
await client.tools.reactivate('jupiterSwap');
await client.tools.reportInvocations('jupiterSwap', 100);
```

---

### Plugin Adapter (LangChain Integration)

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/08-plugin-adapter.md

The SAP SDK provides a plugin that bridges all 52 on-chain SAP tools into the SynapseAgentKit:

```ts
import { SynapseAgentKit } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';

const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({ rpcUrl: 'https://synapse.oobeprotocol.ai' })
  .use(sapPlugin);

const tools = kit.getTools(); // → 52 SAP tools as LangChain StructuredTool[]
```

#### 8 Protocol Domains (52 tools total)

| Domain | ID | Tools | Description |
|--------|----|-------|-------------|
| Agent Identity | `sap-agent` | 8 | Registration, lifecycle, reputation |
| Trustless Reputation | `sap-feedback` | 4 | On-chain feedback (1–5 score) |
| Web of Trust | `sap-attestation` | 3 | Cross-agent attestations |
| x402 Escrow | `sap-escrow` | 6 | Micropayment escrow |
| Tool Registry | `sap-tools` | 7 | Tool schemas, versioning |
| Encrypted Memory Vault | `sap-vault` | 10 | Vault, sessions, delegation |
| Discovery Indexes | `sap-indexing` | 8 | Capability/protocol indexes |
| Unified Memory Ledger | `sap-ledger` | 6 | Ring buffer, sealed pages |

The plugin handles all type conversions automatically (LLM JSON → Solana `PublicKey`, `BN`, `Buffer`).

---

### SAP Error Handling

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/09-best-practices.md

```ts
import {
  SapError,
  SapRpcError,
  SapAccountNotFoundError,
  SapValidationError,
  SapTimeoutError,
  SapPermissionError,
} from '@synapse-sap/sdk/errors';

try {
  await client.agent.register(params);
} catch (err) {
  if (err instanceof SapAccountNotFoundError) {
    console.warn(`Missing ${err.accountType}: ${err.address}`);
  } else if (err instanceof SapValidationError) {
    console.error(`Invalid field "${err.field}": ${err.message}`);
  } else if (err instanceof SapRpcError) {
    console.error(`RPC error ${err.rpcCode}: ${err.message}`);
    err.logs?.forEach((log) => console.debug(log));
  } else if (err instanceof SapError) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    throw err;
  }
}
```

---

### SAP RPC & Network Configuration

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/10-rpc-network.md

```ts
import { SapConnection } from '@synapse-sap/sdk';

// Devnet (testing)
const conn = SapConnection.devnet();

// Mainnet with Synapse Gateway (recommended)
const conn = SapConnection.mainnet('https://synapse.oobeprotocol.ai');

// Localnet (local validator)
const conn = SapConnection.localnet();

// One-liner with keypair
const { client } = SapConnection.fromKeypair(
  'https://synapse.oobeprotocol.ai',
  keypair,
);
```

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| **RPC** | `localhost:8899` | `api.devnet.solana.com` | `synapse.oobeprotocol.ai` |
| **Cluster** | `localnet` | `devnet` | `mainnet-beta` |
| **Commitment** | `confirmed` | `confirmed` | `confirmed` / `finalized` |
| **SOL source** | Airdrop | Airdrop | Real SOL |

---

### SAP Cost Optimization

| Operation | Cost |
|-----------|------|
| Ledger init | ~0.032 SOL rent |
| Ledger write | ~0.000005 SOL |
| Ledger seal → LedgerPage | ~0.031 SOL rent |
| Vault inscription | ~0 (data in TX logs) |
| Agent registration | ~0.01 SOL rent |
| Tool descriptor | ~0.005 SOL rent |

**Tips:**
- Prefer **Ledger** over Vault when you need to read data back
- Use `client.escrow.batchSettle()` instead of individual `settle()` calls (up to 10 per TX)
- Close unused accounts to reclaim rent
- Use `SessionManager` (`client.session`) instead of manual vault/session/ledger orchestration

---

## 20. Solana Actions & Blinks

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/actions`

```ts
import { ActionServer, BlinkGenerator, createBlinkFromAction } from '@oobe-protocol-labs/synapse-client-sdk/ai/actions';
```

| Class / Function | Description |
|------------------|-------------|
| `ActionServer` | Host Solana Actions endpoints |
| `BlinkGenerator` | Generate blink URLs from actions |
| `createBlinkFromAction` | Quick blink creation |
| `DEFAULT_RESOLVER_URL` | Default blink resolver URL |
| `ACTION_SCHEME` | Action URL scheme |

### ActionServer API
| Method | Description |
|--------|-------------|
| `registerAction()` | Register a Solana Action |
| `handleRequest()` | Handle incoming action request |
| `serve()` | Start HTTP server |

---

## 21. Persistence

Pluggable state persistence with 3 backends.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/persistence`

```ts
import {
  MemoryStore,
  FileStore,
  RedisStore,
  createStore,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/persistence';
```

| Backend | Description |
|---------|-------------|
| `MemoryStore` | In-memory (dev/testing) |
| `FileStore` | JSON file-based |
| `RedisStore` | Redis-backed (production) |

Common API: `get(key)`, `set(key, value, ttl?)`, `delete(key)`, `has(key)`, `clear()`, `keys(pattern?)`.

---

## 22. Context / IoC Container

Dependency injection, service lifecycle, and hooks.

Import: `@oobe-protocol-labs/synapse-client-sdk/context`

```ts
import {
  SynapseContext,
  createSynapseContext,
  createBareContext,
  createBinding,
  ServiceRef,
  WeakServiceRef,
  RefRegistry,
} from '@oobe-protocol-labs/synapse-client-sdk';
```

| Function | Description |
|----------|-------------|
| `createSynapseContext(config)` | Full IoC context with auto-wired services |
| `createBareContext()` | Empty context |
| `createBinding(token, factory)` | Service binding |
| `autoWire(context)` | Auto-register default services |

---

## 23. gRPC / Geyser Parser

Low-level Yellowstone/Geyser stream parser.

```ts
import { GeyserParser, GrpcTransport } from '@oobe-protocol-labs/synapse-client-sdk';
```

### GeyserParser
| Method | Description |
|--------|-------------|
| `parseTransaction(raw)` | Decode raw transaction |
| `parseAccountUpdate(raw)` | Decode account update |
| `parseBlockMeta(raw)` | Decode block metadata |
| `parseSlotUpdate(raw)` | Decode slot update |
| `parseEntry(raw)` | Decode ledger entry |
| `stream(filter, callback)` | Stream parsed updates |

**80+ known programs** recognized — Jupiter, Raydium, Metaplex, Orca, Meteora, Marinade, SPL programs, and more.

---

## 24. @solana/kit Bridge

Interop with `@solana/kit` native types.

Import: `@oobe-protocol-labs/synapse-client-sdk/kit`

```ts
import { address, signature, lamports } from '@oobe-protocol-labs/synapse-client-sdk/kit';

// Convert Synapse types → Kit types
const kitAddr = address('So11111111111111111111111111111111111111112');

// Or use kit-native RPC
const balance = await client.kitRpc.getBalance(kitAddr).send();
```

---

## 25. Next.js Integration

### ⚠️ Strict App Router Compatibility

Next.js app router builds use stricter TypeScript checking. The SDK's branded types and singleton factories require explicit handling:

### Singleton Setup (with explicit cast)

```ts
import {
  SynapseClient,
  createSingleton,
  Pubkey,
} from '@oobe-protocol-labs/synapse-client-sdk';

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;

const getClient = createSingleton(
  () => new SynapseClient({ endpoint: ENDPOINT }),
  { key: 'synapse-client' },
);

// ✅ MUST cast — createSingleton returns a generic; Next.js strict mode rejects 'unknown'
const client = getClient() as SynapseClient;
```

### Server Component Example — NFT-Gated Page

```ts
// app/gated/page.tsx  (server component)
import { SynapseClient, createSingleton, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';
import { redirect } from 'next/navigation';

const getClient = createSingleton(
  () => new SynapseClient({ endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` }),
  { key: 'synapse' },
);

const REQUIRED_COLLECTION = 'YourCollectionMintHere...';

export default async function GatedPage({ searchParams }: { searchParams: { wallet?: string } }) {
  const wallet = searchParams.wallet;
  if (!wallet) redirect('/connect');

  const client = getClient() as SynapseClient;          // ← cast
  const walletPk = Pubkey(wallet);                       // ← brand the string

  // Fetch assets, then filter client-side (getAssetsByOwner has no groupKey param)
  const { items } = await client.das.getAssetsByOwner({
    ownerAddress: wallet,
    page: 1,
    limit: 1000,
  });

  const hasAccess = items.some((a) =>
    a.grouping?.some((g) => g.group_key === 'collection' && g.group_value === REQUIRED_COLLECTION),
  );

  if (!hasAccess) redirect('/no-access');

  return <div>Welcome, holder!</div>;
}
```

### Key Rules for Next.js

| Rule | Why |
|------|-----|
| Cast `getClient()` to `SynapseClient` | `createSingleton` returns generic — strict TS rejects `unknown` |
| Wrap all address strings with `Pubkey()` | Branded type — plain `string` fails type-check |
| Filter DAS results client-side for collection gating | `getAssetsByOwner` params don't include `groupKey` / `groupValue` |
| Use `process.env.OOBE_API_KEY` in `?api_key=` | Server-only env var — never exposed to client bundle |

---

## 26. Common Patterns

### Get SOL balance of a wallet

```ts
const client = new SynapseClient({ endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` });
const { value } = await client.rpc.getBalance(Pubkey('WalletAddressHere'));
const sol = lamportsToSol(value);
```

### Get all NFTs owned by a wallet

```ts
const assets = await client.das.getAssetsByOwner({
  ownerAddress: 'WalletAddressHere',
  page: 1,
  limit: 100,
});
```

### Swap tokens via DeFi plugin

```ts
const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(DeFiPlugin);

const tools = kit.getTools();
const swapTool = kit.getToolMap().get('orca_swap');
const result = await swapTool.invoke({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EikyJKSVWPK28rX5FG8KyJcSzv3D2b2Qg7VodzqQoobe', // OOBE TOKEN
  amount: 1_000_000_000, // 1 SOL
  slippage: 50, // 0.5%
});
```

### Resolve a .sol domain

```ts
const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(MiscPlugin);

const resolver = kit.getToolMap().get('sns_resolveDomain');
const result = await resolver.invoke({ domain: 'toly.sol' });
```

### Get real-time token price from Pyth

```ts
const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(MiscPlugin);

const pyth = kit.getToolMap().get('pyth_getPrice');
const price = await pyth.invoke({ symbol: 'SOL/USD' });
```

### Full agent with LangChain

```ts
import { SynapseClient } from '@oobe-protocol-labs/synapse-client-sdk';
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, MiscPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';

const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(MiscPlugin);

const tools = kit.getTools(); // 85 LangChain StructuredTool[]
const llm = new ChatOpenAI({ modelName: 'gpt-4o' });
const agent = createStructuredChatAgent({ llm, tools, prompt: '...' });
const executor = new AgentExecutor({ agent, tools });

const result = await executor.invoke({
  input: 'What is the current price of SOL and my balance?',
});
```

### Full agent with SAP protocol tools

```ts
import { SynapseAgentKit } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';
import { AnchorProvider } from '@coral-xyz/anchor';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';

const provider = AnchorProvider.env();
const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({
  rpcUrl: 'https://synapse.oobeprotocol.ai',
}).use(sapPlugin);

const tools = kit.getTools(); // 52 SAP tools
const llm = new ChatOpenAI({ model: 'gpt-4o' });
const agent = await createStructuredChatAgent({ llm, tools, prompt: '...' });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

const result = await executor.invoke({
  input: 'Register a new agent called SwapBot with Jupiter swap capability',
});
```

### Expose tools via MCP to Claude Desktop

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NFTPlugin, MiscPlugin, BlinksPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(NFTPlugin)
  .use(MiscPlugin)
  .use(BlinksPlugin);

const server = new SynapseMcpServer(kit, {
  name: 'synapse-solana',
  version: '2.0.2',
});

await server.start(); // 110 tools available to Claude
```

### Combine MCP server + external MCP client

```ts
import { McpClientBridge } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const bridge = new McpClientBridge();
await bridge.connect({
  id: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
});

// Merge external tools into the kit
kit.use(bridge.toPlugin());

// Now kit has 110 Solana tools + GitHub tools
const allTools = kit.getTools();
```

---

## Quick Reference — Import Paths

| Import Path | What |
|-------------|------|
| `@oobe-protocol-labs/synapse-client-sdk` | Core: `SynapseClient`, types, utils, decoders, programs |
| `@oobe-protocol-labs/synapse-client-sdk/ai/tools` | LangChain: `createExecutableSolanaTools`, protocol tool factories |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins` | `SynapseAgentKit` + all 5 plugins |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/token` | `TokenPlugin` (22 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/nft` | `NFTPlugin` (19 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/defi` | `DeFiPlugin` (43 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/misc` | `MiscPlugin` (20 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/blinks` | `BlinksPlugin` (6 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/mcp` | `SynapseMcpServer` + `McpClientBridge` |
| `@oobe-protocol-labs/synapse-client-sdk/ai/gateway` | Gateway, sessions, pricing, x402, monetization |
| `@oobe-protocol-labs/synapse-client-sdk/ai/gateway/x402` | x402 sub-module |
| `@oobe-protocol-labs/synapse-client-sdk/ai/gateway/monetize` | Monetized tools sub-module |
| `@oobe-protocol-labs/synapse-client-sdk/ai/intents` | Intent parser, planner, executor |
| `@oobe-protocol-labs/synapse-client-sdk/ai/sap` | Synapse Agent Protocol (client-side) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/actions` | Solana Actions / Blinks server |
| `@oobe-protocol-labs/synapse-client-sdk/ai/persistence` | State store (memory, file, redis) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/lazy` | Lazy-loading utilities |
| `@oobe-protocol-labs/synapse-client-sdk/kit` | @solana/kit bridge |
| `@oobe-protocol-labs/synapse-client-sdk/context` | IoC container |
| `@oobe-protocol-labs/synapse-client-sdk/next` | Next.js integration utilities |
| `@synapse-sap/sdk` | Full SAP on-chain SDK (separate package) |
| `@synapse-sap/sdk/plugin` | SAP plugin adapter for SynapseAgentKit |
| `@synapse-sap/sdk/errors` | SAP error hierarchy |
| `@synapse-sap/sdk/pda` | PDA derivation helpers |
| `@synapse-sap/sdk/utils` | SHA-256, base58, hashing utilities |

---

## Quick Reference — Endpoints

| Region | Endpoint | Protocol | URL |
|--------|----------|----------|-----|
| US | Mainnet RPC | HTTPS | `https://us-1-mainnet.oobeprotocol.ai?api_key=KEY` |
| US | Mainnet WS | WSS | `wss://us-1-mainnet.oobeprotocol.ai/ws?api_key=KEY` |
| US | Mainnet gRPC | HTTPS | `https://us-1-mainnet.oobeprotocol.ai/grpc?api_key=KEY` |
| EU | Mainnet RPC | HTTPS | `https://staging.oobeprotocol.ai?api_key=KEY` |
| EU | Mainnet WS | WSS | `wss://staging.oobeprotocol.ai/ws?api_key=KEY` |
| SAP | Synapse Gateway | HTTPS | `https://synapse.oobeprotocol.ai` |

---

## Quick Reference — Jupiter API

| Setting | Value |
|---------|-------|
| **Default API URL** | `https://api.jup.ag` (hardcoded in SDK as `JUPITER_API_URL`) |
| **Deprecated URL** | ~~`https://quote-api.jup.ag/v6`~~ — **NEVER use this** |
| **Tool count** | 22 tools |
| **API key param** | `apiKey` (passed to `createJupiterTools()`) |
| **apiUrl override** | Not needed — only override if you have a custom Jupiter proxy |

---

## Technical Examples — Step-by-Step Agent Guide

This section provides detailed, production-ready examples with full technical explanations. Use these as reference when implementing user requests.

---

### Transfer SOL between wallets

**What happens under the hood:**
1. Build a `SystemProgram.transfer` instruction with sender, recipient, and lamport amount.
2. Get a recent blockhash (required — transactions expire after ~60 seconds).
3. Construct a `VersionedTransaction` with the instruction.
4. Sign with the sender's keypair.
5. Submit via `sendTransaction` and confirm.

```ts
import { SynapseClient, Pubkey, Lamports } from '@oobe-protocol-labs/synapse-client-sdk';
import {
  SystemProgram,
} from '@oobe-protocol-labs/synapse-client-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const client = new SynapseClient({ endpoint: ENDPOINT });
const connection = new Connection(ENDPOINT);

// 1. Sender keypair (loaded from env — NEVER hardcode)
const secret = JSON.parse(process.env.WALLET_SECRET!);
const sender = Keypair.fromSecretKey(Uint8Array.from(secret));

// 2. Build the transfer instruction
//    Amount is in LAMPORTS: 1 SOL = 1_000_000_000 lamports
const amountSol = 0.5;
const amountLamports = amountSol * 1e9; // 500_000_000

const transferIx = SystemProgram.transfer({
  fromPubkey: sender.publicKey,
  toPubkey: new PublicKey('RECIPIENT_WALLET_ADDRESS_HERE'),
  lamports: amountLamports,
});

// 3. Get recent blockhash (transaction validity window)
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

// 4. Build a VersionedTransaction (v0 — supports Address Lookup Tables)
const messageV0 = new TransactionMessage({
  payerKey: sender.publicKey,
  recentBlockhash: blockhash,
  instructions: [transferIx],
}).compileToV0Message();

const tx = new VersionedTransaction(messageV0);
tx.sign([sender]);

// 5. Send and confirm
const signature = await connection.sendTransaction(tx, {
  skipPreflight: false,  // always simulate first in production
  maxRetries: 3,
});

// 6. Wait for confirmation
const confirmation = await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  'confirmed',
);

if (confirmation.value.err) {
  throw new Error(`Transfer failed: ${JSON.stringify(confirmation.value.err)}`);
}

console.log(`✅ Sent ${amountSol} SOL — tx: ${signature}`);
```

> **Agent notes:**
> - Always convert SOL → lamports (× 1e9). Users say "send 1 SOL" but Solana works in lamports.
> - Check sender balance BEFORE building the TX: `await client.rpc.getBalance(Pubkey(sender.publicKey.toBase58()))`.
> - The minimum balance to keep an account alive (rent-exempt) is ~0.00089 SOL. Never drain a wallet to exactly 0.

---

### Transfer SPL Tokens (USDC, etc.)

**What happens under the hood:**
1. Find (or create) the Associated Token Account (ATA) for the recipient.
2. Build a `SplToken.transfer` or `SplToken.transferChecked` instruction.
3. Sign and send.

SPL tokens live in **token accounts** (not wallet accounts). Each wallet has one ATA per token mint. If the recipient hasn't received this token before, their ATA doesn't exist yet — you must create it first.

```ts
import {
  SplToken,
  AssociatedToken,
} from '@oobe-protocol-labs/synapse-client-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const connection = new Connection(ENDPOINT);

const sender = Keypair.fromSecretKey(/* ... */);
const recipientWallet = new PublicKey('RECIPIENT_WALLET_HERE');

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

// 1. Derive ATAs (deterministic — no network call)
const senderAta = getAssociatedTokenAddressSync(USDC_MINT, sender.publicKey);
const recipientAta = getAssociatedTokenAddressSync(USDC_MINT, recipientWallet);

// 2. Check if recipient ATA exists
const recipientAtaInfo = await connection.getAccountInfo(recipientAta);

const instructions = [];

// 3. If recipient ATA doesn't exist, create it (sender pays rent ~0.002 SOL)
if (!recipientAtaInfo) {
  instructions.push(
    AssociatedToken.createIdempotent({
      payer: sender.publicKey,
      associatedToken: recipientAta,
      owner: recipientWallet,
      mint: USDC_MINT,
    }),
  );
}

// 4. Transfer with decimal check (safer — prevents wrong-mint transfers)
const amountUsdc = 10;  // 10 USDC
const amountRaw = amountUsdc * 10 ** USDC_DECIMALS;  // 10_000_000

instructions.push(
  SplToken.transferChecked({
    source: senderAta,
    mint: USDC_MINT,
    destination: recipientAta,
    owner: sender.publicKey,
    amount: amountRaw,
    decimals: USDC_DECIMALS,
  }),
);

// 5. Build, sign, send
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

const messageV0 = new TransactionMessage({
  payerKey: sender.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const tx = new VersionedTransaction(messageV0);
tx.sign([sender]);

const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

console.log(`✅ Sent ${amountUsdc} USDC — tx: ${signature}`);
```

> **Agent notes:**
> - `transferChecked` is safer than `transfer` — it verifies the mint and decimals match. Always prefer it.
> - If the recipient wallet has never held a token, you MUST create their ATA first. Use `createIdempotent` (no-op if it already exists).
> - Common token decimals: SOL=9, USDC=6, BONK=5. Always look up the mint's `decimals` field.
> - The sender pays ~0.00203 SOL rent for creating a new ATA.

---

### Swap tokens via Jupiter (using AI tools)

**Two approaches:** Ultra API (simple) vs Metis/Swap API (full control).

#### Ultra API (Recommended for simple swaps)

```ts
import { createJupiterTools } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

const { tools, toolMap } = createJupiterTools({
  apiKey: process.env.JUPITER_API_KEY,
});

// Ultra flow: getOrder → executeOrder
// Step 1: Get an order (returns a ready-to-sign transaction)
const order = await toolMap.getOrder.invoke({
  inputMint: 'So11111111111111111111111111111111111111112',  // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: 1_000_000_000,  // 1 SOL in lamports
  taker: 'YOUR_WALLET_ADDRESS',
});

// Step 2: Sign and execute
const result = await toolMap.executeOrder.invoke({
  signedTransaction: order.transaction,  // sign this with your wallet first
});
```

#### Metis/Swap API (Full control — custom slippage, routes, instructions)

```ts
// Step 1: Get a quote
const quote = await toolMap.getQuote.invoke({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: 1_000_000_000,
  slippageBps: 50,  // 0.5% slippage tolerance
});

// Step 2: Get swap transaction
const swapResult = await toolMap.swap.invoke({
  quoteResponse: quote,
  userPublicKey: 'YOUR_WALLET_ADDRESS',
  wrapAndUnwrapSol: true,
  dynamicComputeUnitLimit: true,
  prioritizationFeeLamports: 'auto',
});

// Step 3: Sign the returned transaction and submit
```

> **Agent notes:**
> - **Ultra** = simpler, fewer params, Jupiter handles routing + MEV protection. Best for most users.
> - **Metis/Swap** = full control over slippage, priority fees, route selection. Use when the user needs specific settings.
> - **NEVER** pass `apiUrl: 'https://quote-api.jup.ag/v6'` — this deprecated URL causes TOKEN_NOT_TRADABLE errors.
> - `amount` is always in the input token's **base units** (lamports for SOL, raw units for SPL).
> - `slippageBps`: 50 = 0.5%, 100 = 1%, 300 = 3%. For volatile tokens use higher slippage.

---

### Check wallet balance (SOL + all tokens)

```ts
import { SynapseClient, Pubkey, lamportsToSol } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });
const wallet = Pubkey('WALLET_ADDRESS_HERE');

// SOL balance
const { value: solBalance } = await client.rpc.getBalance(wallet);
console.log(`SOL: ${lamportsToSol(solBalance)}`);

// All SPL token balances
const tokenAccounts = await client.rpc.getTokenAccountsByOwner(wallet, {
  programId: Pubkey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
});

for (const { account } of tokenAccounts.value) {
  const data = account.data;
  // Each token account has: mint, owner, amount
  // Use decoders for proper parsing:
  // const decoded = decodeTokenAccount(Buffer.from(data.data[0], data.encoding));
  console.log('Token account:', data);
}
```

> **Agent notes:**
> - `getBalance` returns lamports (bigint). Always convert to SOL for display: `lamportsToSol(value)`.
> - `getTokenAccountsByOwner` returns ALL token accounts. Filter by mint if the user asks about a specific token.
> - To get a human-readable token list with names, follow up with `client.das.getAssetsByOwner()` — DAS returns metadata including token names and images.

---

### Fetch NFTs for a wallet (with collection filtering)

```ts
import { SynapseClient } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });

// Fetch all digital assets (NFTs, cNFTs, fungible tokens)
const { items, total } = await client.das.getAssetsByOwner({
  ownerAddress: 'WALLET_ADDRESS_HERE',
  page: 1,
  limit: 1000,
  displayOptions: {
    showFungible: false,       // exclude fungible tokens
    showNativeBalance: false,  // exclude SOL
  },
});

console.log(`Found ${total} NFTs`);

// Filter by collection
const COLLECTION_MINT = 'YOUR_COLLECTION_MINT_HERE';
const collectionNfts = items.filter((asset) =>
  asset.grouping?.some(
    (g) => g.group_key === 'collection' && g.group_value === COLLECTION_MINT,
  ),
);

console.log(`${collectionNfts.length} NFTs from target collection`);

// Access NFT metadata
for (const nft of collectionNfts) {
  console.log({
    name: nft.content?.metadata?.name,
    image: nft.content?.links?.image,
    mint: nft.id,
    compressed: nft.compression?.compressed ?? false,
  });
}
```

> **Agent notes:**
> - `getAssetsByOwner` does NOT support filtering by collection in the query params. You MUST fetch all and filter client-side.
> - If the user asks "do I own an NFT from collection X?", use the `grouping` array to check.
> - For large wallets, paginate: increment `page` until `items.length < limit`.
> - `nft.compression.compressed === true` means it's a compressed NFT (cNFT) — Merkle proof needed for transfers.

---

### Set priority fees (land transactions faster)

During network congestion, transactions may be dropped. Priority fees incentivize validators to include your transaction first.

```ts
import { ComputeBudget } from '@oobe-protocol-labs/synapse-client-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(ENDPOINT);

// 1. Check recent priority fees for the accounts you're touching
const recentFees = await connection.getRecentPrioritizationFees({
  lockedWritableAccounts: [
    new PublicKey('ACCOUNT_YOU_ARE_WRITING_TO'),
  ],
});

// 2. Calculate a competitive fee (use median or p75)
const fees = recentFees
  .map((f) => f.prioritizationFee)
  .filter((f) => f > 0)
  .sort((a, b) => a - b);

const medianFee = fees[Math.floor(fees.length / 2)] || 1000; // fallback 1000 micro-lamports

// 3. Add priority fee instructions BEFORE your main instructions
const instructions = [
  // Set compute unit limit (tighter = cheaper)
  ComputeBudget.setComputeUnitLimit({ units: 200_000 }),

  // Set price per compute unit (in micro-lamports)
  ComputeBudget.setComputeUnitPrice({ microLamports: medianFee }),

  // ... your actual instructions here (transfer, swap, etc.)
];
```

> **Agent notes:**
> - Priority fee = `computeUnits × microLamportsPerUnit`. A 200K CU tx at 1000 micro-lamports = 0.0002 SOL.
> - Always set `setComputeUnitLimit` to a tight estimate. Default is 200K but many txs use <50K. Tighter limit = lower total fee.
> - For Jupiter swaps, use `prioritizationFeeLamports: 'auto'` in the swap params instead of manual compute budget instructions.
> - During heavy congestion (meme coin launches, etc.), fees can spike to 100K+ micro-lamports. Warn the user about cost.

---

### Create a new SPL token (mint)

```ts
import {
  SystemProgram,
  SplToken,
  AssociatedToken,
} from '@oobe-protocol-labs/synapse-client-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const connection = new Connection(ENDPOINT);
const payer = Keypair.fromSecretKey(/* ... */);
const mintKeypair = Keypair.generate(); // new mint address

const DECIMALS = 9; // 9 decimals like SOL, 6 like USDC, 0 for NFTs

// 1. Calculate rent for the mint account
const rentExempt = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

// 2. Build instructions
const instructions = [
  // Create the mint account
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: MINT_SIZE,
    lamports: rentExempt,
    programId: TOKEN_PROGRAM_ID,
  }),

  // Initialize mint (set decimals, mint authority, freeze authority)
  SplToken.initializeMint2({
    mint: mintKeypair.publicKey,
    decimals: DECIMALS,
    mintAuthority: payer.publicKey,
    freezeAuthority: payer.publicKey, // null to disable freezing
  }),
];

// 3. Optionally: create ATA and mint initial supply
const payerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);

instructions.push(
  AssociatedToken.createIdempotent({
    payer: payer.publicKey,
    associatedToken: payerAta,
    owner: payer.publicKey,
    mint: mintKeypair.publicKey,
  }),
  SplToken.mintTo({
    mint: mintKeypair.publicKey,
    destination: payerAta,
    authority: payer.publicKey,
    amount: 1_000_000_000 * 10 ** DECIMALS, // 1 billion tokens
  }),
);

// 4. Build, sign (BOTH payer and mint keypair), send
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

const messageV0 = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const tx = new VersionedTransaction(messageV0);
tx.sign([payer, mintKeypair]); // ← mint keypair must also sign

const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

console.log(`✅ Token created — mint: ${mintKeypair.publicKey.toBase58()}`);
```

> **Agent notes:**
> - The mint address is a NEW keypair — it must sign the transaction.
> - `decimals`: 0 for NFTs, 6 for stablecoins, 9 for most tokens. Ask the user if unsure.
> - Rent for a mint account is ~0.00145 SOL (fixed, based on MINT_SIZE=82 bytes).
> - After creation, only the `mintAuthority` can mint new tokens. To make supply fixed, set mintAuthority to `null` after minting.
> - For Token-2022 (new standard with extensions like transfer fees, interest bearing, etc.), use `TOKEN_2022_PROGRAM_ID` instead.

---

### Subscribe to account changes (WebSocket)

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });

// Watch a wallet for any SOL balance changes
const subId = await client.ws.onAccountChange(
  Pubkey('WALLET_TO_WATCH'),
  (accountInfo) => {
    const lamports = accountInfo.lamports;
    console.log(`Balance changed: ${lamports / 1e9} SOL`);
  },
  { commitment: 'confirmed' },
);

// Watch all transactions mentioning an address
const logSubId = await client.ws.onLogs(
  Pubkey('WALLET_OR_PROGRAM_TO_WATCH'),
  (logs) => {
    console.log(`TX: ${logs.signature}`);
    for (const log of logs.logs) {
      console.log(`  ${log}`);
    }
  },
);

// Clean up when done
await client.ws.unsubscribe(subId);
await client.ws.unsubscribe(logSubId);
// or close all: await client.ws.close();
```

> **Agent notes:**
> - WebSocket subscriptions are **long-lived connections**. They stay open until you unsubscribe or close.
> - `onAccountChange` fires whenever ANY data in the account changes (balance, data, owner).
> - `onLogs` fires for every transaction that mentions the address — useful for monitoring tokens, programs, or wallets.
> - In serverless environments (Vercel, AWS Lambda), WebSocket subscriptions won't work — they need a persistent process. Use polling instead.
> - Always call `unsubscribe()` or `close()` to avoid memory leaks.

---

### Airdrop SOL on devnet (testing)

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

// Use devnet endpoint (no API key needed)
const client = new SynapseClient({ endpoint: 'https://api.devnet.solana.com' });

const wallet = Pubkey('YOUR_DEVNET_WALLET');

// Request 2 SOL airdrop
const signature = await client.rpc.requestAirdrop(wallet, 2_000_000_000); // 2 SOL in lamports

console.log(`Airdrop requested: ${signature}`);
// Wait a few seconds, then check balance
```

> **Agent notes:**
> - Airdrops only work on **devnet** and **testnet**. Never try on mainnet.
> - Rate limit: ~2 SOL per request, max ~5 requests per minute per IP.
> - If airdrop fails with "Too Many Requests", tell the user to wait 1-2 minutes or use https://faucet.solana.com.
> - For testing with mainnet tokens, use devnet token faucets (not the SOL faucet).

---

### Error handling best practices

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });

try {
  const balance = await client.rpc.getBalance(Pubkey('SomeAddress...'));
  console.log(balance);
} catch (err) {
  // The SDK throws typed errors — match them for specific handling
  if (err.name === 'NetworkError') {
    // RPC endpoint unreachable — try fallback endpoint or retry
    console.error('Network error — check RPC endpoint or API key');
  } else if (err.name === 'TimeoutError') {
    // Request timed out — retry with longer timeout
    console.error('Request timed out — try again');
  } else if (err.name === 'RpcMethodNotFoundError') {
    // The RPC node doesn't support this method (e.g., DAS on a non-DAS node)
    console.error('RPC method not available on this endpoint');
  } else if (err.name === 'UpstreamError') {
    // The Solana validator returned an error
    console.error('Solana RPC error:', err.message);
  } else if (err.name === 'SynapseError') {
    // Generic SDK error
    console.error('SDK error:', err.message);
  } else {
    throw err; // Unknown error — rethrow
  }
}
```

> **Agent notes:**
> - Always wrap SDK calls in try/catch. Network calls WILL fail occasionally.
> - **Common failures:** invalid pubkey format, insufficient balance, rate limiting (429), blockhash expired.
> - For transaction failures, check `err.logs` — Solana programs emit helpful log messages.
> - Implement retry with exponential backoff for transient errors: `await retry(() => client.rpc.getBalance(pk), { maxRetries: 3 })`.

---

### Compute costs cheatsheet

| Operation | Approximate Cost |
|-----------|-----------------|
| SOL transfer | 0.000005 SOL (5000 lamports base fee) |
| SPL token transfer | 0.000005 SOL base + priority fee |
| Create token account (ATA) | ~0.00203 SOL rent |
| Create token mint | ~0.00145 SOL rent |
| Priority fee (moderate congestion) | 0.0001–0.001 SOL |
| Priority fee (high congestion) | 0.001–0.01 SOL |
| Jupiter swap (typical) | 0.000005 SOL + priority fee + Jupiter platform fee |
| SAP Ledger init | ~0.032 SOL rent |
| SAP Ledger write | ~0.000005 SOL |
| SAP Agent registration | ~0.01 SOL rent |

> **Agent notes:**
> - Rent is **recoverable** — close accounts to get SOL back.
> - Base transaction fee (5000 lamports) is burned, not recoverable.
> - Always tell the user the estimated cost BEFORE executing a transaction.
>> - For multi-instruction transactions, the base fee is still just 5000 lamports — batching is cost-efficient.

---

### Build your own MCP Server (expose Solana tools to any AI client)

An MCP (Model Context Protocol) server lets you expose your Solana tools to **any MCP-compatible AI client** — Claude Desktop, Cursor, VS Code Copilot, Cline, Windsurf, or custom agents. This is how you turn your Solana capabilities into a **reusable service** that any AI can call.

#### Minimal MCP Server (stdio)

```ts
// file: mcp-server.ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

// 1. Build your tool kit with the plugins you want to expose
const kit = new SynapseAgentKit({
  rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
})
  .use(TokenPlugin)      // getBalance, transfer, getTokenInfo, etc.
  .use(DeFiPlugin)       // Jupiter swap, quote, price, etc.
  .use(NftPlugin);       // getAssetsByOwner, getAsset, etc.

// 2. Create and start the MCP server
const server = new SynapseMcpServer(kit, {
  name: 'my-solana-mcp',
  version: '1.0.0',
  instructions: 'Solana blockchain tools — balances, transfers, swaps, NFTs.',
});

await server.start(); // stdio mode — reads stdin, writes stdout
```

Compile with `tsc` and add to your AI client config:

```json
// Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
// Cursor: .cursor/mcp.json
// VS Code: .vscode/mcp.json
{
  "mcpServers": {
    "my-solana-mcp": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "env": {
        "OOBE_API_KEY": "your-key-here"
      }
    }
  }
}
```

#### SSE MCP Server (web-accessible, multi-client)

```ts
// SSE mode — HTTP server that multiple clients can connect to
const sseServer = new SynapseMcpServer(kit, {
  name: 'solana-mcp-sse',
  version: '1.0.0',
  transport: 'sse',
  ssePort: 3001,
  ssePath: '/mcp',
  instructions: 'Solana tools via SSE transport.',
});

await sseServer.start(); // HTTP server on port 3001
// Clients connect to: http://localhost:3001/mcp
```

#### MCP Server with SAP tools (full protocol access)

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

// Combine Solana tools + SAP protocol tools
const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({
  rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
})
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(sapPlugin);  // adds 52 SAP tools (agent, escrow, vault, ledger, tools, discovery...)

const server = new SynapseMcpServer(kit, {
  name: 'solana-full-mcp',
  version: '1.0.0',
  instructions: 'Full Solana + SAP protocol tools for AI agents.',
});

await server.start();
// Now any MCP client has access to ALL Solana + SAP tools
```

#### Consuming external MCP servers (bridge)

You can also **import tools from other MCP servers** and combine them with your Solana tools:

```ts
import { McpClientBridge } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const bridge = new McpClientBridge();

// Import GitHub tools
await bridge.connect({
  id: 'github',
  name: 'GitHub',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
  toolPrefix: 'github_',
});

// Import a custom MCP server
await bridge.connect({
  id: 'analytics',
  name: 'Analytics',
  transport: 'sse',
  url: 'https://analytics.example.com/mcp/sse',
  toolPrefix: 'analytics_',
});

// Convert to plugin and add to agent kit
const externalPlugin = bridge.toPlugin();
kit.use(externalPlugin);

// Now your agent has: Solana tools + SAP tools + GitHub tools + Analytics tools
```

> **Agent notes:**
> - **stdio** = one process per client, best for local use (Claude Desktop, Cursor). **SSE** = one server, many clients, best for teams/cloud.
> - MCP servers expose tools, resources, and prompts. Tools are the primary integration.
> - The `instructions` field is the system-level description sent to the AI client — make it descriptive.
> - `toolPrefix` avoids name collisions when combining multiple MCP servers (e.g., `github_list_repos` vs `analytics_list_repos`).
> - To restrict which tools are exposed, create the kit with only the plugins you want.

---

### Sub-Agents — Orchestrating multiple specialized agents

A **sub-agent** is a specialized agent that handles a specific domain. An **orchestrator** delegates work to sub-agents. This is the most powerful pattern for complex tasks.

#### Architecture

```
Orchestrator Agent
├── Swap Sub-Agent       (Jupiter, Raydium — handles all swap logic)
├── NFT Sub-Agent        (DAS, Metaplex — handles NFT queries and minting)
├── Analytics Sub-Agent  (portfolio analysis, price tracking)
└── SAP Sub-Agent        (agent registration, discovery, memory, escrow)
```

#### Building sub-agents with SynapseAgentKit

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin, MiscPlugin, BlinksPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createOpenAIFunctionsAgent, AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';

const RPC_URL = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;

// --- Sub-Agent 1: DeFi specialist ---
const defiKit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(TokenPlugin)
  .use(DeFiPlugin);

const defiAgent = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: defiKit.getTools(),
    prompt: defiSystemPrompt, // "You are a DeFi specialist. You handle swaps, quotes, token prices..."
  }),
  tools: defiKit.getTools(),
});

// --- Sub-Agent 2: NFT specialist ---
const nftKit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(NftPlugin);

const nftAgent = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: nftKit.getTools(),
    prompt: nftSystemPrompt, // "You are an NFT specialist. You handle NFT queries, minting..."
  }),
  tools: nftKit.getTools(),
});

// --- Sub-Agent 3: SAP protocol specialist ---
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';

const sapKit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(createSAPPlugin({ provider }));

const sapAgent = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: sapKit.getTools(),
    prompt: sapSystemPrompt, // "You manage on-chain agent identities, memory, escrow, and tools..."
  }),
  tools: sapKit.getTools(),
});
```

#### Orchestrator pattern

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// Wrap each sub-agent as a tool the orchestrator can call
const defiTool = new DynamicStructuredTool({
  name: 'defi_agent',
  description: 'Handles all DeFi operations: token swaps, price quotes, Jupiter/Raydium interactions, token balances.',
  schema: z.object({ request: z.string().describe('The user DeFi request in natural language') }),
  func: async ({ request }) => {
    const result = await defiAgent.invoke({ input: request });
    return result.output;
  },
});

const nftTool = new DynamicStructuredTool({
  name: 'nft_agent',
  description: 'Handles NFT operations: viewing collections, fetching metadata, minting, transferring NFTs.',
  schema: z.object({ request: z.string().describe('The user NFT request in natural language') }),
  func: async ({ request }) => {
    const result = await nftAgent.invoke({ input: request });
    return result.output;
  },
});

const sapTool = new DynamicStructuredTool({
  name: 'sap_agent',
  description: 'Handles SAP protocol operations: agent registration, memory management, escrow, tool publishing, discovery.',
  schema: z.object({ request: z.string().describe('The SAP protocol operation to perform') }),
  func: async ({ request }) => {
    const result = await sapAgent.invoke({ input: request });
    return result.output;
  },
});

// Orchestrator agent — delegates to sub-agents
const orchestrator = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: [defiTool, nftTool, sapTool],
    prompt: orchestratorPrompt,
    // "You are an orchestrator. Route user requests to the appropriate specialist:
    //  - DeFi agent for swaps, prices, balances
    //  - NFT agent for NFT queries and operations
    //  - SAP agent for protocol operations (registration, memory, escrow)
    //  Never try to handle Operations yourself — always delegate."
  }),
  tools: [defiTool, nftTool, sapTool],
});

// Now the orchestrator routes:
// "swap 10 SOL to USDC" → defiTool → defiAgent (Jupiter swap)
// "show my NFTs" → nftTool → nftAgent (DAS query)
// "register me as a SAP agent" → sapTool → sapAgent (on-chain registration)
const result = await orchestrator.invoke({ input: 'swap 10 SOL to USDC and then show me my NFTs' });
```

> **Agent notes:**
> - Each sub-agent has its own `SynapseAgentKit` with ONLY the relevant plugins — this reduces token usage and prevents tool confusion.
> - The orchestrator's LLM sees sub-agents as opaque tools — it doesn't know the internal tools. This keeps context windows manageable.
> - For complex multi-step tasks, the orchestrator can call multiple sub-agents in sequence (e.g., "swap then check NFTs").
> - Sub-agents can share the same RPC endpoint and wallet — they're just different tool configurations.
> - For production, add error handling at each sub-agent level AND at the orchestrator level.

---

### Register your agent on SAP (become discoverable on-chain)

Your AI agent can register itself on the Solana Agent Protocol to become **discoverable by other agents and users**, receive **on-chain reputation**, accept **x402 payments**, and store **memory on-chain**.

#### Step 1: Register Agent Identity

```ts
import { SapClient } from '@synapse-sap/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

const provider = AnchorProvider.env(); // uses ANCHOR_WALLET + ANCHOR_PROVIDER_URL
const client = SapClient.from(provider);

// Register with capabilities (what your agent can do)
await client.agent.register({
  name: 'MySwapBot',
  description: 'AI agent that executes optimal token swaps across Jupiter and Raydium',
  capabilities: [
    { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: 'Execute Jupiter swaps' },
    { id: 'raydium:swap', protocolId: 'raydium', version: '2.0', description: 'Execute Raydium swaps' },
    { id: 'token:balance', protocolId: 'spl', version: '1.0', description: 'Check token balances' },
  ],
  pricing: [
    { tierId: 'free', pricePerCall: '0', currency: 'SOL' },
    { tierId: 'premium', pricePerCall: '10000000', currency: 'SOL' }, // 0.01 SOL per call
  ],
  protocols: ['jupiter', 'raydium', 'A2A'],
});

console.log('✅ Agent registered on-chain');
```

#### Step 2: Publish tools on-chain

```ts
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES } from '@synapse-sap/sdk';

// Publish tool descriptors so other agents can discover what your agent offers
await client.tools.publishByName(
  'jupiterSwap',
  'jupiter',
  'Execute an optimal token swap via Jupiter aggregator',
  JSON.stringify({
    type: 'object',
    properties: {
      inputMint: { type: 'string', description: 'Input token mint address' },
      outputMint: { type: 'string', description: 'Output token mint address' },
      amount: { type: 'number', description: 'Amount in base units (lamports)' },
      slippageBps: { type: 'number', description: 'Max slippage in basis points' },
    },
    required: ['inputMint', 'outputMint', 'amount'],
  }),
  JSON.stringify({
    type: 'object',
    properties: {
      signature: { type: 'string' },
      inputAmount: { type: 'string' },
      outputAmount: { type: 'string' },
    },
  }),
  HTTP_METHOD_VALUES.Post,
  TOOL_CATEGORY_VALUES.Swap,
  4,     // paramsCount
  3,     // requiredParams
  false, // isCompound
);

// Add to capability index (makes it findable by other agents)
await client.indexing.initCapabilityIndex('jupiter:swap');
await client.indexing.addToCapabilityIndex('jupiter:swap');

console.log('✅ Tool published and indexed on-chain');
```

#### Step 3: Enable x402 payments (monetize your agent)

```ts
// Other agents/users pay before calling your tools
// Set up escrow pricing with volume discounts

await client.escrow.create({
  agent: provider.wallet.publicKey,
  amount: new BN(0),  // initial deposit from self (usually 0)
  pricingCurve: [
    { callThreshold: 0,    pricePerCall: new BN(10_000_000) },   // 0.01 SOL/call (first 100)
    { callThreshold: 100,  pricePerCall: new BN(5_000_000) },    // 0.005 SOL/call (100-1000)
    { callThreshold: 1000, pricePerCall: new BN(1_000_000) },    // 0.001 SOL/call (1000+)
  ],
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 30 * 86400), // 30 days
});

console.log('✅ x402 escrow configured — agent is now monetized');
```

#### Step 4: Enable memory (store conversation state on-chain)

```ts
const session = client.session;

// Start a session — creates vault + session + ledger as needed
const ctx = await session.start('user-123-conversation');

// Store conversation turns
await session.write(ctx, 'User: swap 10 SOL to USDC');
await session.write(ctx, 'Agent: Executing via Jupiter. Quote: 10 SOL → 248.5 USDC...');
await session.write(ctx, 'Agent: ✅ Swap complete. TX: 4xK3...');

// Read back (ring buffer — latest entries)
const history = await session.readLatest(ctx);

// Seal to permanent storage when conversation ends
await session.seal(ctx);
await session.close(ctx); // reclaim rent

console.log('✅ Conversation stored on-chain');
```

#### Step 5: Report health metrics

```ts
// Periodically report metrics so your reputation score stays high
await client.agent.reportCalls(500);                 // total calls served
await client.agent.updateReputation(120, 9990);      // avg latency (ms), uptime (bps: 99.9%)

// Check your own profile
const profile = await client.discovery.getAgentProfile(provider.wallet.publicKey);
console.log(`Reputation score: ${profile?.computed.reputationScore}/1000`);
console.log(`Total calls: ${profile?.identity.totalCalls}`);
```

> **Agent notes:**
> - Registration costs ~0.01 SOL (rent — recoverable via `client.agent.close()`).
> - The agent PDA is derived from the wallet: `deriveAgentPDA(walletPubkey)`.
> - Capability IDs should use `protocol:action` format (e.g., `jupiter:swap`, `das:getAsset`).
> - After registration, OTHER agents can discover you via `client.discovery.findAgentsByCapability('jupiter:swap')`.
> - x402 payments are automatic — consumers deposit into your escrow, you settle after serving calls.
> - Memory (Ledger) has a 4KB ring buffer. Seal proactively when >80% full to avoid data loss.

---

### Discover and call other SAP agents (agent-to-agent)

Your agent can find and interact with other registered agents on the SAP network:

```ts
import { SapClient } from '@synapse-sap/sdk';

const client = SapClient.from(provider);

// 1. Find agents that can do what you need
const swapAgents = await client.discovery.findAgentsByCapability('jupiter:swap');
console.log(`Found ${swapAgents.length} agents that can swap via Jupiter`);

// 2. Get full profiles — pick the best one
for (const agent of swapAgents) {
  const profile = await client.discovery.getAgentProfile(agent.wallet);
  if (!profile) continue;

  console.log({
    name: profile.identity.name,
    reputation: profile.computed.reputationScore,  // 0–1000
    uptime: profile.identity.uptimeBps / 100 + '%',
    hasX402: profile.computed.hasX402,
    pricing: profile.identity.pricing,
  });
}

// 3. Pay and call the agent (x402 flow)
const bestAgent = swapAgents[0];

// Estimate cost
const cost = await client.x402.estimateCost(bestAgent.wallet, 1); // 1 call

// Prepare payment (creates escrow deposit)
const payment = await client.x402.preparePayment(bestAgent.wallet, {
  amount: cost,
  currency: 'SOL',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});

// Build x402 headers for the HTTP request
const headers = client.x402.buildPaymentHeaders(payment);

// Call the agent's endpoint (A2A protocol)
const response = await fetch(`https://agent-endpoint.example.com/api/swap`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers,  // x402 payment proof
  },
  body: JSON.stringify({
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 1_000_000_000,
  }),
});

// 4. Leave feedback (builds on-chain reputation)
await client.feedback.give(bestAgent.wallet, {
  score: 5,          // 1-5
  comment: 'Fast execution, good price',
});

// 5. Network overview — see the whole SAP ecosystem
const overview = await client.discovery.getNetworkOverview();
console.log(`Network: ${overview.totalAgents} agents, ${overview.activeAgents} active`);
console.log(`Tools: ${overview.totalTools}, Vaults: ${overview.totalVaults}`);
```

> **Agent notes:**
> - `findAgentsByCapability` returns agents sorted by reputation. The first result is typically the best.
> - `findAgentsByCapabilities(['jupiter:swap', 'raydium:swap'])` finds agents with ANY of those capabilities (deduplicated).
> - x402 payment flow: estimate → prepare → build headers → include in HTTP request. The agent settles after serving.
> - Feedback is on-chain and immutable. Score 1-5. Can be updated but not deleted.
> - `getNetworkOverview()` is useful for showing the user the size/health of the SAP network.

---

### Full production agent setup (everything together)

This is a complete example of a production-ready agent that:
1. Registers on SAP with capabilities
2. Publishes tools on-chain
3. Creates an MCP server
4. Handles x402 payments
5. Stores memory on-chain

```ts
// file: production-agent.ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';
import { SapClient } from '@synapse-sap/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

const RPC_URL = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const provider = AnchorProvider.env();
const sapClient = SapClient.from(provider);

// ── 1. Register on SAP ──────────────────────────────────
try {
  await sapClient.agent.register({
    name: 'SynapseFullAgent',
    description: 'Full-featured Solana AI agent — swaps, NFTs, portfolio, SAP protocol',
    capabilities: [
      { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: null },
      { id: 'das:getAsset', protocolId: 'das', version: '1.0', description: null },
      { id: 'token:balance', protocolId: 'spl', version: '1.0', description: null },
    ],
    pricing: [
      { tierId: 'free', pricePerCall: '0', currency: 'SOL' },
    ],
    protocols: ['jupiter', 'das', 'A2A'],
  });
  console.log('✅ Registered on SAP');
} catch (err) {
  // Already registered — that's fine
  console.log('Agent already registered, continuing...');
}

// ── 2. Build agent kit ──────────────────────────────────
const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(NftPlugin)
  .use(sapPlugin);

console.log(`Tools loaded: ${kit.getTools().length}`);

// ── 3. Start MCP server ─────────────────────────────────
const mcpServer = new SynapseMcpServer(kit, {
  name: 'synapse-full-agent',
  version: '2.0.2',
  transport: process.env.MCP_TRANSPORT === 'sse' ? 'sse' : 'stdio',
  ssePort: parseInt(process.env.MCP_PORT || '3001'),
  ssePath: '/mcp',
  instructions: [
    'Full Solana AI agent with swap, NFT, balance, and SAP protocol capabilities.',
    'Use jupiter:swap tools for token exchanges.',
    'Use DAS tools for NFT and asset queries.',
    'Use SAP tools for on-chain agent management.',
  ].join(' '),
});

await mcpServer.start();
console.log('✅ MCP server running');

// ── 4. Health reporting loop ─────────────────────────────
let callCount = 0;
setInterval(async () => {
  try {
    await sapClient.agent.reportCalls(callCount);
    await sapClient.agent.updateReputation(
      100,    // avg latency ms
      9990,   // uptime 99.9%
    );
  } catch {
    // Non-critical — skip
  }
}, 60_000); // every minute

// ── 5. Graceful shutdown ─────────────────────────────────
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await mcpServer.stop();
  process.exit(0);
});
```

> **Agent notes:**
> - This is a **standalone agent process** — run with `node dist/production-agent.js` or as a Docker container.
> - In Next.js API routes, skip the MCP server and use `kit.getTools()` directly with LangChain.
> - Agent registration is idempotent — safe to call on every startup (wrap in try/catch for "already registered").
> - Health reporting is optional but strongly recommended for discovery ranking.
> - The SAP plugin adds ~52 tools. If you don't need all SAP capabilities, use specific modules directly instead.

---

## ⚠️ MANDATORY — Always read the full documentation before answering

**Before answering any question about the Synapse Client SDK, SAP Protocol, or SAP SDK, you MUST fetch and read the relevant documentation from GitHub.** Do NOT rely solely on this skills.md file — it is a summary. The full docs contain implementation details, edge cases, parameter options, and examples that are not included here.

### Documentation sources to read

#### 1. Synapse Client SDK Docs (ALL files)

Fetch every `.md` file from:

```
https://github.com/OOBE-PROTOCOL/synapse-client-sdk/tree/main/docs_md
```

Individual doc files to read:

| File | URL | Covers |
|------|-----|--------|
| `00-getting-started.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/00-getting-started.md | Installation, SynapseClient setup, basic RPC calls |
| `01-rpc.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/01-rpc.md | All RPC methods, branded types, error handling |
| `02-das.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/02-das.md | Digital Asset Standard — NFTs, cNFTs, fungible assets |
| `03-websocket.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/03-websocket.md | WebSocket subscriptions, account changes, logs |
| `04-grpc.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/04-grpc.md | gRPC streaming — Yellowstone Geyser |
| `05-ai-tools.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/05-ai-tools.md | createExecutableSolanaTools, createJupiterTools, LangChain integration |
| `06-ai-plugins.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/06-ai-plugins.md | SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin, MiscPlugin, BlinksPlugin |
| `07-ai-gateway.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/07-ai-gateway.md | AgentGateway, x402, monetization, session management |
| `08-ai-mcp.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/08-ai-mcp.md | MCP server, MCP client bridge, stdio/SSE transport |
| `09-ai-persistence.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/09-ai-persistence.md | Persistence adapters — memory, file, Redis, Postgres |
| `10-ai-context.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/10-ai-context.md | Context management, conversation state |
| `11-nextjs.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/11-nextjs.md | Next.js integration patterns, server/client separation |

#### 2. SAP SDK Docs (ALL files)

Fetch every `.md` file from:

```
https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs
```

Individual doc files to read:

| File | URL | Covers |
|------|-----|--------|
| `00-overview.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/00-overview.md | Architecture overview, module tree, protocol layers |
| `01-installation.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/01-installation.md | Installation, peer dependencies, environment setup |
| `02-quickstart.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/02-quickstart.md | Quick start — registration, memory, discovery in 5 minutes |
| `03-agent-lifecycle.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/03-agent-lifecycle.md | Agent registration, update, deactivate, reactivate, close, metrics |
| `04-memory-systems.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/04-memory-systems.md | Ledger, Vault, SessionManager — ring buffers, encryption, sealing |
| `05-x402-payments.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/05-x402-payments.md | x402 escrow — consumer flow, agent settlement, volume curves |
| `06-discovery-indexing.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/06-discovery-indexing.md | DiscoveryRegistry, IndexingModule, agent profiles, network overview |
| `07-tools-schemas.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/07-tools-schemas.md | On-chain tool publishing, schema hashing, versioning |
| `08-plugin-adapter.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/08-plugin-adapter.md | createSAPPlugin — bridge SAP tools into SynapseAgentKit |
| `09-best-practices.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/09-best-practices.md | Error handling, idempotency, cost optimization, security |
| `10-rpc-network.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/10-rpc-network.md | RPC config, devnet/mainnet/localnet, commitment levels |

#### 3. SAP Protocol (on-chain program)

```
https://github.com/OOBE-PROTOCOL/synapse-sap/tree/main/docs
```

Read for: Anchor IDL, instruction formats, account schemas, events, error codes. This is the raw on-chain program — informational for understanding what the SDK wraps.

#### 4. SAP SDK README

```
https://github.com/OOBE-PROTOCOL/synapse-sap-sdk
```

Read for: Quick overview, `SapClient.from(provider)`, module summary, version info.

### When to read docs

- **Always** before answering any SDK-related question
- **Always** before writing code that uses the SDK or SAP
- **Always** when the user asks about a feature you're not 100% sure about
- **Always** when debugging an error — the docs contain error codes and troubleshooting
- **Especially** read `09-best-practices.md` (SAP) and `05-ai-tools.md` (SDK) — these contain critical gotchas

### How to read docs

Use your web fetch / file read capabilities to download the raw markdown from the `raw.githubusercontent.com` URLs listed above. Read the FULL content of each relevant file — do not skim or skip sections.

> **This is not optional.** The skills.md file is a reference guide, but the GitHub docs are the source of truth. If there is ever a conflict between this file and the GitHub docs, the **GitHub docs win**.


