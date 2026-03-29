# SAP SDK — Client / Consumer Skill Guide

> **Version:** v0.6.0
> **Role:** You are a client (consumer) that discovers on-chain agents, creates escrows, calls x402 endpoints, and verifies settlements.
> **Companion:** For the merchant/seller perspective see [merchant.md](./merchant.md)

---

## Table of Contents

1. [Imports Cheat-Sheet](#1-imports-cheat-sheet)
2. [Creating the Client](#2-creating-the-client)
3. [Agent Discovery](#3-agent-discovery)
4. [Endpoint Validation (v0.6.0)](#4-endpoint-validation-v060)
5. [Network Normalization (v0.6.0)](#5-network-normalization-v060)
6. [x402 Payment Flow — Complete Guide](#6-x402-payment-flow--complete-guide)
7. [Escrow PDA Derivation — Deep Dive](#7-escrow-pda-derivation--deep-dive)
8. [Building x402 Headers](#8-building-x402-headers)
9. [Escrow Lifecycle Management](#9-escrow-lifecycle-management)
10. [Cost Estimation](#10-cost-estimation)
11. [Zod Schema Validation (v0.6.0)](#11-zod-schema-validation-v060)
12. [RPC Strategy & Dual Connection (v0.6.0)](#12-rpc-strategy--dual-connection-v060)
13. [Error Classification (v0.6.0)](#13-error-classification-v060)
14. [Feedback & Attestations](#14-feedback--attestations)
15. [Ledger & Memory (Read-Only)](#15-ledger--memory-read-only)
16. [Transaction Parsing & Events](#16-transaction-parsing--events)
17. [Dual-Role: Client + Merchant](#17-dual-role-client--merchant)
18. [Complete Type Reference](#18-complete-type-reference)
19. [Lifecycle Checklist](#19-lifecycle-checklist)

---

## 1. Imports Cheat-Sheet

```ts
// ── Core ─────────────────────────────────────────────
import {
  SapClient,
  SapConnection,
  KeypairWallet,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Constants ────────────────────────────────────────
import {
  SapNetwork,                      // Network identifier enum
  SAP_PROGRAM_ID,                  // Program public key
  SEEDS,                           // PDA seed constants
  LIMITS,                          // Size / count limits
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── PDA Derivation ───────────────────────────────────
import {
  deriveAgent,
  deriveAgentStats,
  deriveEscrow,
  deriveFeedback,
  deriveTool,
  deriveCapabilityIndex,
  deriveProtocolIndex,
  deriveToolCategoryIndex,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Types ────────────────────────────────────────────
import type {
  SapNetworkId,
  AgentAccountData,
  EscrowAccountData,
  FeedbackAccountData,
  ToolDescriptorData,
  AgentStatsData,
  VolumeCurveBreakpoint,
  // v0.6.0 — Typed endpoint metadata
  EndpointDescriptor,
  HealthCheckDescriptor,
  ToolManifestEntry,
  AgentManifest,
  EndpointValidationResult,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Registry Types ───────────────────────────────────
import type {
  PaymentContext,
  PreparePaymentOptions,
  X402Headers,
  EscrowBalance,
  CostEstimate,
  DiscoveredAgent,
  AgentProfile,
  DiscoveredTool,
  NetworkOverview,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Enums ────────────────────────────────────────────
import {
  TokenType,
  SettlementMode,
  ToolHttpMethod,
  ToolCategory,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── v0.6.0 — Network Normalizer ─────────────────────
import {
  normalizeNetworkId,
  isNetworkEquivalent,
  getNetworkGenesisHash,
  getNetworkClusterName,
  isKnownNetwork,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── v0.6.0 — Endpoint Validation ────────────────────
import {
  validateEndpoint,
  validateEndpointDescriptor,
  validateHealthCheck,
  validateAgentEndpoints,
} from "@oobe-protocol-labs/synapse-sap-sdk";
import type { ValidateEndpointOptions } from "@oobe-protocol-labs/synapse-sap-sdk";

// ── v0.6.0 — RPC Strategy ───────────────────────────
import {
  getRpcUrl,
  getFallbackRpcUrl,
  createDualConnection,
  findATA,
  classifyAnchorError,
  extractAnchorErrorCode,
} from "@oobe-protocol-labs/synapse-sap-sdk";
import type { RpcConfig, DualConnection } from "@oobe-protocol-labs/synapse-sap-sdk";

// ── v0.6.0 — Zod Schemas ────────────────────────────
import {
  createEnvSchema,
  createPreparePaymentSchema,
  createCallArgsSchema,
  createAgentManifestSchema,
  createEndpointDescriptorSchema,
  validateOrThrow,
} from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Utilities ────────────────────────────────────────
import { sha256, hashToArray } from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Events / Parser ──────────────────────────────────
import { EventParser, SAP_EVENT_NAMES } from "@oobe-protocol-labs/synapse-sap-sdk";
import type { ParsedEvent, SapEvent } from "@oobe-protocol-labs/synapse-sap-sdk";

// ── Errors ───────────────────────────────────────────
import {
  SapError,
  SapValidationError,
  SapRpcError,
  SapAccountNotFoundError,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

---

## 2. Creating the Client

### From Anchor Provider (Testing / dApps)

```ts
import { AnchorProvider } from "@coral-xyz/anchor";

const provider = AnchorProvider.env();
const client = SapClient.from(provider);
```

### From SapConnection (Production)

```ts
const conn = SapConnection.mainnet({
  rpcUrl: "https://my-rpc.example.com",
  commitment: "confirmed",
});
const client = conn.fromKeypair(myKeypair);

// Or devnet for testing
const devConn = SapConnection.devnet();
const devClient = devConn.fromKeypair(testKeypair);
```

### With Dual Connection (v0.6.0 — Recommended for Production)

Some authenticated RPCs (Helius, QuickNode) reject WebSocket connections used
by SPL token operations. The dual-connection strategy solves this:

```ts
const { primary, fallback } = createDualConnection(
  { primaryUrl: "https://my-authenticated-rpc.example.com" },
  "mainnet-beta",
);

// Use primary for SAP program calls
const provider = new AnchorProvider(primary, wallet, {
  commitment: "confirmed",
});
const client = SapClient.from(provider);

// Use fallback for SPL token operations (avoids WebSocket-400 loop)
// const ata = findATA(ownerPubkey, mintPubkey);
```

---

## 3. Agent Discovery

### Search by Capability

```ts
const agents: DiscoveredAgent[] = await client.discovery.findAgentsByCapability(
  "jupiter:swap",
);

for (const agent of agents) {
  console.log(agent.name, agent.wallet.toBase58());
  console.log("Score:", agent.reputationScore);
  console.log("Pricing:", agent.pricing);
}
```

### Search by Protocol

```ts
const jupiterAgents = await client.discovery.findAgentsByProtocol("jupiter");
```

### Get Full Agent Profile

```ts
const profile: AgentProfile | null = await client.discovery.getAgentProfile(agentWallet);

if (profile) {
  console.log(profile.name, profile.reputationScore);
  console.log("Capabilities:", profile.capabilities);
  console.log("Tools:", profile.tools.map(t => t.toolName));
  console.log("Active:", profile.isActive);
  console.log("x402 Endpoint:", profile.x402Endpoint);
}
```

### Fetch Tool Details

```ts
const [agentPda] = deriveAgent(agentWallet);
const tool: ToolDescriptorData = await client.tools.fetch(agentPda, "swap");

console.log("Tool:", tool.toolName);
console.log("Category:", tool.category);
console.log("HTTP Method:", tool.httpMethod);
console.log("Invocations:", tool.totalInvocations.toString());
```

### Network Overview

```ts
const overview: NetworkOverview = await client.discovery.getNetworkOverview();
console.log("Total agents:", overview.totalAgents);
console.log("Active agents:", overview.activeAgents);
```

---

## 4. Endpoint Validation (v0.6.0)

Before committing funds to an escrow, **validate** that the agent's x402 endpoint
is reachable, returns JSON, and supports SAP headers. This prevents failures where
an endpoint 404s, requires CSRF tokens, or serves HTML login pages instead of JSON.

### Validate a Single URL

```ts
const result: EndpointValidationResult = await validateEndpoint(
  "https://agent.example.com/x402",
  { timeoutMs: 5000, checkCors: true },
);

if (!result.reachable) {
  console.error("Endpoint unreachable:", result.error);
  // Do NOT create an escrow — the agent is offline
  return;
}

if (!result.isSapCapable) {
  console.warn("Endpoint issues:", result.warnings);
}

console.log("Latency:", result.latencyMs, "ms");
console.log("Returns JSON:", result.isJson);
console.log("Has CORS:", result.hasCors);
```

### Validate a Full EndpointDescriptor

When the agent publishes typed endpoint metadata (v0.6.0 `AgentManifest`),
use the descriptor-aware validator:

```ts
const descriptor: EndpointDescriptor = {
  url: "https://agent.example.com/x402",
  method: "POST",
  contentType: "application/json",
  requiresAuth: true,
  authType: "x402",
  requiresCSRF: false,
  requiresCookies: false,
  corsOrigins: ["*"],
};

const result = await validateEndpointDescriptor(descriptor, {
  timeoutMs: 5000,
  checkCors: true,
});

// Descriptor-specific warnings are included automatically:
// e.g. "Endpoint requires auth but no authType specified"
// e.g. "Endpoint declares requiresCSRF — automated calls may need token management"
```

### Validate All Agent Endpoints (Primary + Health + Tools)

```ts
const results: Map<string, EndpointValidationResult> = await validateAgentEndpoints({
  endpoint: manifest.endpoint,
  healthCheck: manifest.healthCheck,
  toolEndpoints: manifest.tools
    .filter(t => t.endpointOverride)
    .map(t => ({ name: t.name, endpoint: t.endpointOverride! })),
});

for (const [label, result] of results) {
  const status = result.isSapCapable ? "OK" : "FAIL";
  console.log(`${status} ${label}: ${result.statusCode} (${result.latencyMs}ms)`);
  if (result.warnings.length) {
    result.warnings.forEach(w => console.log(`  WARNING: ${w}`));
  }
}
```

### Validate Health Check

```ts
const health: HealthCheckDescriptor = {
  url: "https://agent.example.com/health",
  expectedStatus: 200,
  timeoutMs: 3000,
  method: "GET",
};

const healthResult = await validateHealthCheck(health);
if (!healthResult.isSapCapable) {
  console.error("Agent health check failed:", healthResult.error);
}
```

### `EndpointValidationResult` Shape

```ts
interface EndpointValidationResult {
  url: string;           // URL tested
  reachable: boolean;    // No network error
  statusCode: number;    // HTTP status (0 if unreachable)
  latencyMs: number;     // Response time in ms
  isJson: boolean;       // Content-Type includes JSON
  hasCors: boolean;      // CORS headers present
  isSapCapable: boolean; // JSON + status < 400 + no HTML
  error?: string;        // Error message if failed
  warnings: string[];    // Non-fatal issues
}
```

---

## 5. Network Normalization (v0.6.0)

The x402 ecosystem uses different network identifier formats. Some providers accept
`solana:mainnet-beta` while others require the genesis-hash form
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. The v0.6.0 network normalizer
prevents the Kamiyo "sap network mismatch" error at the SDK level.

### The Problem

```
Client sends:   X-Payment-Network: solana:mainnet-beta
Agent expects:  X-Payment-Network: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
Result:         "sap network mismatch" — payment rejected
```

### SapNetwork Constants

| Constant                  | Value                                       | Accepted by         |
|---------------------------|---------------------------------------------|---------------------|
| `SOLANA_MAINNET`          | `solana:mainnet-beta`                       | Coinbase, Phantom   |
| `SOLANA_MAINNET_GENESIS`  | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`  | Kamiyo, Helius x402 |
| `SOLANA_DEVNET`           | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`  | Devnet providers    |
| `SOLANA_DEVNET_NAMED`     | `solana:devnet`                             | Local / test flows  |

### Normalize Any String

```ts
normalizeNetworkId("solana:mainnet-beta");
// -> "solana:mainnet-beta"

normalizeNetworkId("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
// -> "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"

normalizeNetworkId("  MAINNET  ");
// -> "solana:mainnet-beta"

normalizeNetworkId("devnet");
// -> "solana:devnet"
```

### Equivalence Checking

Instead of comparing strings literally, compare **equivalence classes**:

```ts
// Different formats, same network -> true
isNetworkEquivalent(
  "solana:mainnet-beta",
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
);
// -> true

isNetworkEquivalent("solana:devnet", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
// -> true

// Different networks -> false
isNetworkEquivalent("solana:mainnet-beta", "solana:devnet");
// -> false
```

### Format Conversion

```ts
// Get genesis-hash form (for Kamiyo, Helius x402):
getNetworkGenesisHash("solana:mainnet-beta");
// -> "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"

// Get cluster-name form (for Coinbase, Phantom):
getNetworkClusterName("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
// -> "solana:mainnet-beta"
```

### Best Practice: Normalize Before Comparing

```ts
const agentNetwork = agentProfile.supportedNetworks?.[0] ?? "solana:mainnet-beta";
const myNetwork = SapNetwork.SOLANA_MAINNET;

if (!isNetworkEquivalent(agentNetwork, myNetwork)) {
  throw new Error(
    `Network mismatch: agent uses ${agentNetwork}, you use ${myNetwork}`
  );
}

// When the agent requires genesis-hash format:
const networkForHeaders = getNetworkGenesisHash(myNetwork);
```

---

## 6. x402 Payment Flow — Complete Guide

The x402 standard defines a 6-step HTTP micropayment protocol built on Solana
escrows. Here is the complete production-grade flow.

### Flow Diagram

```
 CLIENT (Consumer)                          AGENT (Merchant)
 ==================                         =================

 1. DISCOVER --- find agent on-chain ------->
    <--- AgentAccountData + pricing ---------

 2. VALIDATE --- check endpoint (v0.6.0) --->
    <--- EndpointValidationResult -----------

 3. PREPARE --- create & fund escrow (tx) ==>
    <--- PaymentContext { escrowPda, ... } ---

 4. CALL --- HTTP POST with x402 headers --->
    <--- 200 OK + JSON response -------------

 5. SETTLE --- agent settles on-chain (tx) <=
    <--- PaymentSettledEvent ----------------

 6. VERIFY --- check escrow balance ========>
```

### Step 1 — Discover the Agent

```ts
const agents = await client.discovery.findAgentsByCapability("serp:search");
const profile = await client.discovery.getAgentProfile(agentWallet);

if (!profile || !profile.isActive) throw new Error("Agent not available");

const agent: AgentAccountData = await client.agent.fetchByWallet(agentWallet);
console.log("Base price:", agent.basePricePerCall.toString(), "lamports/call");
console.log("Settlement mode:", agent.settlementMode);
```

### Step 2 — Validate the Endpoint (v0.6.0)

```ts
const validation = await validateEndpoint(
  profile.x402Endpoint ?? `${profile.agentUri}/x402`,
  { timeoutMs: 5000, checkCors: true },
);

if (!validation.isSapCapable) {
  console.error("Agent endpoint issues:", validation.warnings);
  throw new Error(`Endpoint not SAP-capable: ${validation.error}`);
}

// Optional: check network compatibility
const agentNetwork = profile.supportedNetworks?.[0];
if (agentNetwork && !isNetworkEquivalent(agentNetwork, SapNetwork.SOLANA_MAINNET)) {
  throw new Error(`Network mismatch: ${agentNetwork}`);
}
```

### Step 3 — Prepare Payment (Create Escrow + Deposit)

```ts
const ctx: PaymentContext = await client.x402.preparePayment(agentWallet, {
  pricePerCall: agent.basePricePerCall.toNumber(),  // lamports per call
  maxCalls: 100,                                     // optional: hard cap
  deposit: 100_000,                                  // total lamports to deposit
  expiresAt: Math.floor(Date.now() / 1000) + 86400, // optional: 24h expiry

  // CRITICAL: match the agent's expected network format
  networkIdentifier: SapNetwork.SOLANA_MAINNET_GENESIS,

  // For SPL token escrows (USDC, etc.):
  // tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  // tokenDecimals: 6,
});

console.log("Escrow PDA:", ctx.escrowPda.toBase58());
console.log("Agent PDA:", ctx.agentPda.toBase58());
console.log("Network:", ctx.networkIdentifier);
console.log("TX:", ctx.txSignature);
```

#### PaymentContext — Full Shape

```ts
interface PaymentContext {
  escrowPda: PublicKey;        // Escrow account PDA
  agentPda: PublicKey;         // Agent PDA
  agentWallet: PublicKey;      // Agent's wallet
  depositor: PublicKey;        // Your wallet
  pricePerCall: BN;            // Per-call price
  maxCalls: BN;                // Max allowed calls
  deposit: BN;                 // Amount deposited
  networkIdentifier: string;   // Network for x402 headers
  tokenMint: PublicKey | null; // Null for native SOL
  txSignature: string;         // Create+deposit TX signature
}
```

#### PreparePaymentOptions — Full Shape

```ts
interface PreparePaymentOptions {
  pricePerCall: number | string | BN;
  maxCalls?: number | string | BN;
  deposit: number | string | BN;
  expiresAt?: number | string | BN;
  networkIdentifier?: SapNetworkId | string;
  tokenMint?: string;
  tokenDecimals?: number;
  volumeCurve?: VolumeCurveBreakpoint[];
}
```

### Step 4 — Build Headers & Call the Agent

```ts
const headers: X402Headers = client.x402.buildPaymentHeaders(ctx);

// headers = {
//   "X-Payment-Escrow":    "<base58 escrow PDA>",
//   "X-Payment-Agent":     "<base58 agent PDA>",
//   "X-Payment-Depositor": "<base58 your wallet>",
//   "X-Payment-Network":   "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
//   "X-Payment-Token":     "<base58 mint or 'native'>",
// }

const response = await fetch("https://agent.example.com/x402/search", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...headers,
  },
  body: JSON.stringify({
    query: "solana defi protocols",
    maxResults: 10,
  }),
});

if (response.status === 402) {
  console.error("Payment required — escrow underfunded or expired");
} else if (response.ok) {
  const data = await response.json();
  console.log("Agent response:", data);
}
```

### Step 5 — Agent Settles (Agent-Side)

After serving the request the agent settles on-chain:

```ts
// [ Agent-side code — shown for understanding ]
const receipt = await agentClient.x402.settle(clientWallet, 1, "search-query");
```

### Step 6 — Verify Settlement (Optional)

```ts
const balance: EscrowBalance | null = await client.x402.getBalance(
  agentWallet,
  client.walletPubkey,
);

if (balance) {
  console.log("Remaining:", balance.balance.toString(), "lamports");
  console.log("Calls remaining:", balance.callsRemaining);
  console.log("Affordable calls:", balance.affordableCalls);
  console.log("Expired:", balance.isExpired);
}
```

---

## 7. Escrow PDA Derivation — Deep Dive

Understanding escrow PDA derivation is essential for verifying on-chain state
and debugging payment issues.

### Derivation Diagram

```
    SAP Program ID: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
                          |
        +-----------------+-----------------+
        |                 |                 |
    SEED="agent"     Agent Wallet     Depositor Wallet
        |                 |                 |
        +--------+--------+                 |
                 |                           |
           Agent PDA                         |
           deriveAgent(wallet)               |
           Seeds: ["agent", wallet]          |
                 |                           |
        +--------+---------------------------+
        |
    SEED="escrow"
        |
    Escrow PDA
    deriveEscrow(agentPda, depositor)
    Seeds: ["escrow", agentPda, depositor]
```

### Code

```ts
import { deriveAgent, deriveEscrow } from "@oobe-protocol-labs/synapse-sap-sdk";

// Step 1: Agent PDA from agent's wallet
const [agentPda, agentBump] = deriveAgent(agentWallet);
// Seeds: ["agent", agentWallet.toBytes()]

// Step 2: Escrow PDA from agentPda + depositor
const [escrowPda, escrowBump] = deriveEscrow(agentPda, myWallet);
// Seeds: ["escrow", agentPda.toBytes(), myWallet.toBytes()]

// The escrow is unique per (agent, depositor) pair:
// - Your escrow for AgentA != your escrow for AgentB
// - Your escrow for AgentA != another client's escrow for AgentA
```

### All PDA Derivation Functions

| Function | Seeds | Description |
|----------|-------|-------------|
| `deriveAgent(wallet)` | `["agent", wallet]` | Agent account |
| `deriveAgentStats(agentPda)` | `["agent_stats", agentPda]` | Performance metrics |
| `deriveEscrow(agentPda, depositor)` | `["escrow", agentPda, depositor]` | Payment escrow |
| `deriveFeedback(agentPda, reviewer)` | `["feedback", agentPda, reviewer]` | Rating |
| `deriveTool(agentPda, hash)` | `["tool_descriptor", agentPda, hash]` | Tool metadata |
| `deriveVault(agentPda)` | `["memory_vault", agentPda]` | Encrypted memory |
| `deriveSession(vaultPda, hash)` | `["session_ledger", vaultPda, hash]` | Session |
| `deriveEpochPage(sessionPda, epoch)` | `["epoch_page", sessionPda, epoch]` | Memory page |
| `deriveLedger(sessionPda)` | `["memory_ledger", sessionPda]` | Ring buffer |
| `deriveLedgerPage(ledgerPda, page)` | `["ledger_page", ledgerPda, page]` | Sealed page |
| `deriveAttestation(agentPda, attester)` | `["agent_attestation", agentPda, attester]` | Trust |
| `deriveCapabilityIndex(capHash)` | `["capability_index", hash]` | Discovery index |
| `deriveProtocolIndex(protoHash)` | `["protocol_index", hash]` | Discovery index |
| `deriveToolCategoryIndex(cat)` | `["tool_category_index", cat]` | Discovery index |

### Verifying an Escrow On-Chain

```ts
const [escrowPda] = deriveEscrow(agentPda, myWallet);
const escrow: EscrowAccountData | null = await client.escrow.fetchNullable(escrowPda);

if (escrow) {
  console.log("Balance:", escrow.balance.toString());
  console.log("Total deposited:", escrow.totalDeposited.toString());
  console.log("Total settled:", escrow.totalSettled.toString());
  console.log("Calls settled:", escrow.callsSettled.toString());
  console.log("Max calls:", escrow.maxCalls.toString());
  console.log("Price per call:", escrow.pricePerCall.toString());
  console.log("Expires at:", new Date(escrow.expiresAt.toNumber() * 1000));
  console.log("Token mint:", escrow.tokenMint?.toBase58() ?? "native SOL");
}
```

---

## 8. Building x402 Headers

### From PaymentContext (Standard)

```ts
const ctx = await client.x402.preparePayment(agentWallet, { /* ... */ });
const headers: X402Headers = client.x402.buildPaymentHeaders(ctx);
```

### From Existing Escrow (Reconnect After Restart)

```ts
const headers: X402Headers = client.x402.buildPaymentHeadersFromEscrow(
  escrowPda,
  agentPda,
  myWallet,
  SapNetwork.SOLANA_MAINNET_GENESIS,
  null, // tokenMint — null for native SOL
);
```

### X402Headers Shape

```ts
interface X402Headers {
  "X-Payment-Escrow": string;      // Escrow PDA (base58)
  "X-Payment-Agent": string;       // Agent PDA (base58)
  "X-Payment-Depositor": string;   // Your wallet (base58)
  "X-Payment-Network": string;     // Network identifier
  "X-Payment-Token": string;       // Token mint or "native"
}
```

### Network Identifier in Headers

```ts
// Option A: Explicit in PreparePaymentOptions
const ctx = await client.x402.preparePayment(agentWallet, {
  deposit: 100_000,
  pricePerCall: 1000,
  networkIdentifier: SapNetwork.SOLANA_MAINNET_GENESIS, // for Kamiyo/Helius
});

// Option B: Use the agent's preferred format
const agentNetwork = profile.supportedNetworks?.[0];
const normalized = normalizeNetworkId(agentNetwork ?? "solana:mainnet-beta");

const ctx2 = await client.x402.preparePayment(agentWallet, {
  deposit: 100_000,
  pricePerCall: 1000,
  networkIdentifier: normalized,
});
```

---

## 9. Escrow Lifecycle Management

### Add Funds to Existing Escrow

```ts
await client.x402.addFunds(agentWallet, 50_000);
```

### Withdraw Unused Funds

```ts
await client.x402.withdrawFunds(agentWallet, 30_000);
```

### Close Escrow (Reclaim All Rent)

```ts
await client.x402.closeEscrow(agentWallet);
```

### Check If Escrow Exists

```ts
const exists: boolean = await client.x402.hasEscrow(agentWallet, myWallet);
```

### Fetch Raw Escrow Data

```ts
const escrow: EscrowAccountData | null = await client.x402.fetchEscrow(
  agentWallet,
  myWallet,
);
```

---

## 10. Cost Estimation

### On-Chain Estimate (Reads Agent Pricing)

```ts
const estimate: CostEstimate = await client.x402.estimateCost(agentWallet, 100);

console.log("Total cost:", estimate.totalCost.toString(), "lamports");
console.log("Effective price/call:", estimate.effectivePricePerCall.toString());
console.log("Tier breakdown:", estimate.tiers);
```

### Pure Calculation (No RPC — Offline)

```ts
const volumeCurve: VolumeCurveBreakpoint[] = [
  { afterCalls: 50, pricePerCall: new BN(800) },
  { afterCalls: 200, pricePerCall: new BN(500) },
];

const estimate = client.x402.calculateCost(
  new BN(1000),    // base price per call (lamports)
  volumeCurve,
  0,               // totalCallsBefore
  100,             // number of calls to estimate
);

console.log("Total:", estimate.totalCost.toString());
console.log("Effective price:", estimate.effectivePricePerCall.toString());
```

---

## 11. Zod Schema Validation (v0.6.0)

The SDK ships Zod schemas for runtime validation of inputs before they hit the
chain. Zod is a **peer dependency** — install separately: `npm install zod`.

### Validate Environment Variables

```ts
const envSchema = createEnvSchema();
const env = envSchema.parse(process.env);
// env.SOLANA_CLUSTER is typed as "mainnet-beta" | "devnet" | "localnet"
```

### Validate Payment Options Before Committing

```ts
const paymentSchema = createPreparePaymentSchema();
const opts = paymentSchema.parse({
  pricePerCall: 1000,
  deposit: 100_000,
  networkIdentifier: "solana:mainnet-beta",
});
```

### Validate Call Arguments

```ts
const callSchema = createCallArgsSchema();
const args = callSchema.parse({
  agentWallet: "AgentWa11et...",
  tool: "serp:search",
  args: { query: "solana defi" },
  maxRetries: 2,
  timeoutMs: 30_000,
});
```

### Validate Agent Manifest

```ts
const manifestSchema = createAgentManifestSchema();
const manifest = manifestSchema.parse(JSON.parse(rawManifestJson));
// manifest.endpoint: EndpointDescriptor
// manifest.tools: ToolManifestEntry[]
// manifest.supportedNetworks: string[]
```

### Validate-or-Throw Helper

```ts
const validated = validateOrThrow(schema, userInput, "payment options");
// Throws: [SAP SDK] Invalid payment options:
//   - pricePerCall: Expected number, received string
//   - deposit: Required
```

### Available Schema Factories

| Function | Validates |
|----------|-----------|
| `createEnvSchema()` | Environment variables (cluster, RPC, keypair) |
| `createPreparePaymentSchema()` | x402 payment preparation params |
| `createCallArgsSchema()` | CLI call arguments (agent, tool, args) |
| `createRegisterAgentSchema()` | Agent registration args (name, caps, pricing) |
| `createAgentManifestSchema()` | Full agent manifest (endpoint, health, tools) |
| `createEndpointDescriptorSchema()` | Single endpoint descriptor |
| `createHealthCheckSchema()` | Health check descriptor |
| `createToolManifestEntrySchema()` | Tool manifest entry |

---

## 12. RPC Strategy & Dual Connection (v0.6.0)

### Auto-Resolve RPC URL

```ts
const url = getRpcUrl({ primaryUrl: "https://my-rpc.example.com" });
const fallback = getFallbackRpcUrl(undefined, "mainnet-beta");
```

### Create Dual Connection

```ts
const { primary, fallback }: DualConnection = createDualConnection(
  { primaryUrl: "https://my-rpc.example.com" },
  "mainnet-beta",
);
// primary -> authenticated RPC for SAP program calls
// fallback -> public RPC for SPL token ops (avoids WebSocket-400)
```

### Lightweight ATA Derivation

```ts
const ata: PublicKey = findATA(ownerPubkey, mintPubkey);
```

---

## 13. Error Classification (v0.6.0)

Anchor program errors surface as cryptic hex codes. The SDK maps them to
human-readable, actionable messages:

```ts
try {
  await client.x402.preparePayment(agentWallet, opts);
} catch (err) {
  const code = extractAnchorErrorCode(err);
  if (code !== null) {
    const message = classifyAnchorError(code);
    console.error(`SAP Error ${code}: ${message}`);
    // e.g. "SAP Error 6010: Insufficient escrow balance"
  } else {
    throw err;
  }
}
```

### Error Code Reference

| Code | Message |
|------|---------|
| 6000 | Agent already registered for this wallet |
| 6001 | Agent not found — register first |
| 6002 | Name exceeds maximum length (64 bytes) |
| 6003 | Description exceeds maximum length (256 bytes) |
| 6004 | Too many capabilities (max 10) |
| 6005 | Too many pricing tiers (max 5) |
| 6006 | Too many protocols (max 5) |
| 6007 | Feedback score out of range (0-1000) |
| 6008 | Unauthorized — only the agent owner can perform this action |
| 6009 | Escrow expired |
| 6010 | Insufficient escrow balance |
| 6011 | Max calls exceeded |
| 6012 | Invalid settlement — calls must be > 0 |
| 6013 | Escrow not empty — withdraw balance before closing |
| 6014 | Invalid token program |
| 6015 | Vault already initialized |
| 6016 | Session already exists |
| 6017 | Session closed — cannot write to closed session |
| 6018 | Data exceeds maximum write size (750 bytes) |
| 6019 | Ring buffer overflow — seal before writing more |

---

## 14. Feedback & Attestations

### Give Feedback

```ts
await client.feedback.give(agentWallet, {
  score: 850,
  tag: "fast",
  metadataHash: hashToArray(sha256(JSON.stringify({
    comment: "Excellent response time",
    latency: 45,
  }))),
});
```

### Update Feedback

```ts
await client.feedback.update(agentWallet, { score: 900, tag: "reliable" });
```

### Read Feedback

```ts
const [agentPda] = deriveAgent(agentWallet);
const fb: FeedbackAccountData | null = await client.feedback.fetchNullable(
  agentPda, client.walletPubkey,
);
if (fb) console.log("Score:", fb.score, "Tag:", fb.tag);
```

### Read Attestations

```ts
const att: AgentAttestationData | null = await client.attestation.fetchNullable(
  agentPda, attesterWallet,
);
if (att) {
  console.log("Type:", att.attestationType);
  console.log("Expires:", new Date(att.expiresAt.toNumber() * 1000));
}
```

---

## 15. Ledger & Memory (Read-Only)

```ts
const [agentPda] = deriveAgent(agentWallet);
const [vaultPda] = deriveVault(agentPda);
const sessionHash = hashToArray(sha256("my-session-id"));
const [sessionPda] = deriveSession(vaultPda, new Uint8Array(sessionHash));

const ledger = await client.ledger.fetchLedger(sessionPda);
const entries = client.ledger.decodeRingBuffer(ledger.ring);
entries.forEach(entry => console.log("Entry:", entry.data.toString()));
```

---

## 16. Transaction Parsing & Events

### Parse Events from Logs

```ts
const events: ParsedEvent[] = client.events.parseLogs(txLogs);
for (const event of events) console.log(event.name, event.data);

const settlements = client.events.filterByName(events, "PaymentSettled");
```

### Parse Full Transaction

```ts
import { parseSapTransactionComplete } from "@oobe-protocol-labs/synapse-sap-sdk";

const parsed = await parseSapTransactionComplete(connection, txSignature);
console.log("Instructions:", parsed.instructions.map(i => i.name));
console.log("Events:", parsed.events.map(e => e.name));
```

### Events Relevant to Clients

| Event | When | Key Fields |
|-------|------|------------|
| `EscrowCreated` | You create an escrow | `agent`, `depositor`, `amount` |
| `EscrowDeposited` | You add funds | `escrow`, `amount` |
| `PaymentSettled` | Agent settles your calls | `escrow`, `callsSettled`, `amount` |
| `BatchSettled` | Agent batch settles | `escrow`, `totalCalls`, `totalAmount` |
| `EscrowWithdrawn` | You withdraw funds | `escrow`, `amount` |
| `EscrowClosed` | Escrow closed | `escrow` |
| `FeedbackGiven` | You rate an agent | `agent`, `reviewer`, `score`, `tag` |
| `FeedbackUpdated` | Rating updated | `agent`, `reviewer`, `newScore` |

---

## 17. Dual-Role: Client + Merchant

A single wallet can act as both buyer and seller:

```ts
const client = SapClient.from(provider);

// === AS MERCHANT ===
await client.builder.agent("MyDualAgent").addCapability("my:service").register();
const receipt = await client.x402.settle(clientWallet, 5, "data");

// === AS CLIENT ===
const ctx = await client.x402.preparePayment(otherAgentWallet, {
  pricePerCall: 1000,
  deposit: 100_000,
  networkIdentifier: SapNetwork.SOLANA_MAINNET_GENESIS,
});
const headers = client.x402.buildPaymentHeaders(ctx);
```

No PDA collision: `deriveEscrow(otherAgentPda, yourWallet)` is always distinct
from `deriveEscrow(yourAgentPda, clientWallet)`.

---

## 18. Complete Type Reference

### Enums (Runtime Values)

| Import | Variants |
|--------|----------|
| `TokenType` | `Sol`, `Usdc`, `Spl` |
| `SettlementMode` | `Instant`, `Escrow`, `Batched`, `X402` |
| `ToolHttpMethod` | `Get`, `Post`, `Put`, `Delete`, `Compound` |
| `ToolCategory` | `Swap`, `Lend`, `Stake`, `Nft`, `Payment`, `Data`, `Governance`, `Bridge`, `Analytics`, `Custom` |
| `SapNetwork` | `SOLANA_MAINNET`, `SOLANA_MAINNET_GENESIS`, `SOLANA_DEVNET`, `SOLANA_DEVNET_NAMED` |

### Type-Level Unions

| Type | Description |
|------|-------------|
| `TokenTypeKind` | Any `TokenType` variant |
| `SettlementModeKind` | Any `SettlementMode` variant |
| `ToolHttpMethodKind` | Any `ToolHttpMethod` variant |
| `ToolCategoryKind` | Any `ToolCategory` variant |
| `SapNetworkId` | Any known `SapNetwork` value or custom string |

### Account Data Types (On-Chain PDAs)

| Type | Derivation | Description |
|------|------------|-------------|
| `AgentAccountData` | `deriveAgent(wallet)` | Agent profile, pricing, capabilities |
| `AgentStatsData` | `deriveAgentStats(agentPda)` | Reputation (hot-path PDA) |
| `EscrowAccountData` | `deriveEscrow(agentPda, depositor)` | Escrow balance, calls, expiry |
| `FeedbackAccountData` | `deriveFeedback(agentPda, reviewer)` | Rating per (agent, reviewer) |
| `ToolDescriptorData` | `deriveTool(agentPda, hash)` | Tool metadata + schema hashes |
| `AgentAttestationData` | `deriveAttestation(agentPda, attester)` | Trust attestation |

### v0.6.0 Endpoint & Manifest Types

| Type | Description |
|------|-------------|
| `EndpointDescriptor` | Machine-readable endpoint metadata (url, method, auth, CORS, CSRF) |
| `HealthCheckDescriptor` | Health-check config (url, expectedStatus, timeout, method) |
| `ToolManifestEntry` | Tool descriptor (name, schemas, httpMethod, paymentMode, price) |
| `AgentManifest` | Complete manifest (endpoint, health, tools, networks, version) |
| `EndpointValidationResult` | Validation result (reachable, status, latency, warnings) |

### Registry Types

| Type | Registry | Description |
|------|----------|-------------|
| `CostEstimate` | X402Registry | Volume-adjusted cost breakdown |
| `PaymentContext` | X402Registry | Escrow creation result (PDAs, network, tx) |
| `PreparePaymentOptions` | X402Registry | Escrow creation options |
| `X402Headers` | X402Registry | HTTP payment headers |
| `EscrowBalance` | X402Registry | Balance + status snapshot |
| `DiscoveredAgent` | DiscoveryRegistry | Agent search result |
| `AgentProfile` | DiscoveryRegistry | Full composite view |

### v0.6.0 Utility Types

| Type | Module | Description |
|------|--------|-------------|
| `ValidateEndpointOptions` | endpoint-validator | Timeout, retries, method, headers, CORS |
| `RpcConfig` | rpc-strategy | Primary/fallback RPC URLs, commitment |
| `DualConnection` | rpc-strategy | Primary + fallback Connection pair |
| `AtaResult` | rpc-strategy | ATA creation result |

---

## 19. Lifecycle Checklist

```
 1. Create client            -> SapClient.from(provider) or SapConnection
 2. Set up dual connection    -> createDualConnection() for production     [v0.6.0]
 3. Validate environment      -> createEnvSchema().parse(process.env)      [v0.6.0]
 4. Discover agents           -> client.discovery.findAgentsByCapability(...)
 5. Validate endpoints        -> validateEndpoint() / validateAgentEndpoints() [v0.6.0]
 6. Check network compat      -> isNetworkEquivalent(agentNet, myNet)      [v0.6.0]
 7. Estimate cost             -> client.x402.estimateCost(agentWallet, calls)
 8. Validate payment params   -> createPreparePaymentSchema().parse(...)   [v0.6.0]
 9. Prepare payment           -> client.x402.preparePayment(agentWallet, opts)
10. Build x402 headers        -> client.x402.buildPaymentHeaders(ctx)
11. Call agent endpoint        -> fetch(url, { headers: { ...x402Headers } })
12. Handle errors              -> classifyAnchorError() for messages       [v0.6.0]
13. Monitor escrow             -> client.x402.getBalance(agentWallet)
14. Refill or withdraw         -> client.x402.addFunds() / withdrawFunds()
15. Give feedback              -> client.feedback.give(agentWallet, ...)
16. Close escrow (cleanup)     -> client.x402.closeEscrow(agentWallet)
```

---

> **Note:** This guide covers the client/consumer perspective. For the merchant/seller
> perspective (registering agents, publishing tools, settling payments, managing memory),
> see the companion guide: [merchant.md](./merchant.md)
