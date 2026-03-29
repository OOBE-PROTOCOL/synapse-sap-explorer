# x402 Payments

> SAP's native micropayment standard. Pre-fund an escrow, call with HTTP headers, settle on-chain.

---

## How x402 Works

x402 turns every agent call into a verifiable financial transaction. No invoices, no subscriptions — just an on-chain escrow that settles per-call (or in batches) with cryptographic proof of service.

```
┌────────────┐                              ┌────────────┐
│   Client   │                              │   Agent    │
└─────┬──────┘                              └─────┬──────┘
      │                                           │
      │  1. Discover pricing (agent.pricing)      │
      │  ─────────────────────────────────────►    │
      │                                           │
      │  2. Create escrow + deposit funds         │
      │  ─── createEscrow (on-chain TX) ──────►   │
      │                                           │
      │  3. Call agent with x402 headers          │
      │  ─── X-Payment-Escrow, X-Payment-*─────►  │
      │                                           │
      │  4. Agent serves the request              │
      │  ◄──────── response payload ────────────  │
      │                                           │
      │  5. Agent settles on-chain                │
      │       settleCalls (on-chain TX)           │
      │  ◄── PaymentSettledEvent emitted ───────  │
      │                                           │
      │  6. Client verifies settlement TX         │
      │  ─── getParsedTransaction ────────────►   │
      └───────────────────────────────────────────┘
```

The client side uses `client.x402` (high-level) or `client.escrow` (low-level). The agent side calls `settle` or `settleBatch` after serving requests.

---

## X402Registry — High-Level Orchestration

Access via `client.x402`. This registry wraps the full payment lifecycle into a developer-friendly API.

### Estimate Cost

Before committing funds, estimate how much N calls will cost — including volume-curve discounts:

```typescript
const estimate = await client.x402.estimateCost(agentWallet, 100);

console.log(estimate.totalCost.toString());        // total in lamports
console.log(estimate.effectivePricePerCall.toString()); // weighted average
console.log(estimate.hasVolumeCurve);               // true if tiered
console.log(estimate.tiers);                        // per-tier breakdown
```

**`CostEstimate` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `totalCost` | `BN` | Total cost in smallest token unit |
| `calls` | `number` | Number of calls estimated |
| `effectivePricePerCall` | `BN` | Weighted average price per call |
| `hasVolumeCurve` | `boolean` | Whether volume-curve tiers applied |
| `tiers` | `Array<{ calls, pricePerCall, subtotal }>` | Per-tier cost breakdown |

You can also skip the on-chain fetch and provide pricing directly:

```typescript
const estimate = client.x402.calculateCost(
  new BN(100_000),  // basePrice
  [{ afterCalls: 50, pricePerCall: new BN(80_000) }],  // volumeCurve
  0,   // totalCallsBefore
  100, // calls
);
```

### Prepare Payment

Creates an escrow and deposits funds in a single transaction. Returns a `PaymentContext` used to build HTTP headers:

```typescript
const ctx = await client.x402.preparePayment(agentWallet, {
  pricePerCall: 1_000,          // lamports per call
  maxCalls: 500,                // 0 = unlimited
  deposit: 500_000,             // initial deposit (lamports)
  expiresAt: 0,                 // 0 = never expires
  volumeCurve: [
    { afterCalls: 100, pricePerCall: 800 },
    { afterCalls: 300, pricePerCall: 600 },
  ],
});

console.log(ctx.escrowPda.toBase58());   // escrow account address
console.log(ctx.txSignature);            // creation TX
```

**`PreparePaymentOptions`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pricePerCall` | `number \| string \| BN` | — | Base price per call |
| `maxCalls` | `number \| string \| BN` | `0` | Max calls (0 = unlimited) |
| `deposit` | `number \| string \| BN` | — | Initial deposit amount |
| `expiresAt` | `number \| string \| BN` | `0` | Unix timestamp (0 = never) |
| `volumeCurve` | `Array<{ afterCalls, pricePerCall }>` | `[]` | Volume discount breakpoints |
| `tokenMint` | `PublicKey \| null` | `null` | SPL token mint (null = SOL) |
| `tokenDecimals` | `number` | `9` | Token decimal places |

### Build Payment Headers

Once you have a `PaymentContext`, generate the HTTP headers to include in every request to the agent:

```typescript
const headers = client.x402.buildPaymentHeaders(ctx);

// Use with any HTTP client
const response = await fetch(agentEndpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...headers,
  },
  body: JSON.stringify({ prompt: "Analyze SOL/USDC liquidity" }),
});
```

You can also build headers directly from an existing escrow (fetches on-chain):

```typescript
const headers = await client.x402.buildPaymentHeadersFromEscrow(agentWallet);
```

### X402Headers Structure

Every x402 request carries these headers:

| Header | Value | Description |
|--------|-------|-------------|
| `X-Payment-Protocol` | `"SAP-x402"` | Protocol identifier |
| `X-Payment-Escrow` | Base58 address | Escrow PDA address |
| `X-Payment-Agent` | Base58 address | Agent PDA address |
| `X-Payment-Depositor` | Base58 address | Client wallet address |
| `X-Payment-MaxCalls` | Numeric string | Max calls allowed |
| `X-Payment-PricePerCall` | Numeric string | Price per call |
| `X-Payment-Program` | Base58 address | SAP Program ID |
| `X-Payment-Network` | Cluster name | `"mainnet-beta"`, `"devnet"`, etc. |

### Settle Calls (Agent Side)

After serving requests, the agent settles to claim payment. The service data is auto-hashed to a 32-byte SHA-256 digest:

```typescript
const receipt = await client.x402.settle(
  depositorWallet,    // client who funded the escrow
  5,                  // number of calls to settle
  "service-data-v1", // arbitrary service data (hashed on-chain)
);

console.log(receipt.txSignature);
console.log(receipt.callsSettled);   // 5
console.log(receipt.amount.toString()); // total lamports transferred
console.log(receipt.serviceHash);    // [u8; 32]
```

**`SettlementResult` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `txSignature` | `TransactionSignature` | Settlement TX |
| `callsSettled` | `number` | Calls settled in this TX |
| `amount` | `BN` | Lamports / tokens transferred |
| `serviceHash` | `number[]` | SHA-256 of service data |

### Batch Settlement

Settle up to 10 service records in a single transaction. More gas-efficient than individual settlements:

```typescript
const batch = await client.x402.settleBatch(depositorWallet, [
  { calls: 3, serviceData: "batch-1-data" },
  { calls: 7, serviceData: "batch-2-data" },
  { calls: 2, serviceData: "batch-3-data" },
]);

console.log(batch.totalCalls);       // 12
console.log(batch.totalAmount.toString());
console.log(batch.settlementCount);  // 3
```

### Get Balance

Check the current escrow state — balance, remaining calls, expiry, and affordability:

```typescript
const balance = await client.x402.getBalance(agentWallet);

if (balance) {
  console.log(balance.balance.toString());       // current balance
  console.log(balance.totalDeposited.toString()); // lifetime deposits
  console.log(balance.totalSettled.toString());   // lifetime settlements
  console.log(balance.callsRemaining);            // remaining calls
  console.log(balance.isExpired);                 // expiry check
  console.log(balance.affordableCalls);           // calls budget allows
}
```

**`EscrowBalance` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `balance` | `BN` | Current remaining balance |
| `totalDeposited` | `BN` | Cumulative deposits |
| `totalSettled` | `BN` | Cumulative settlements |
| `totalCallsSettled` | `BN` | Lifetime calls settled |
| `callsRemaining` | `number` | `min(maxCalls - settled, affordableCalls)` |
| `isExpired` | `boolean` | Whether the escrow has expired |
| `affordableCalls` | `number` | `floor(balance / pricePerCall)` |

You can also check a specific depositor:

```typescript
const balance = await client.x402.getBalance(agentWallet, specificDepositor);
```

### Verify Settlement

Parse a settlement transaction to extract emitted events:

```typescript
const events = await client.x402.verifySettlement(txSignature);
```

### Additional Helpers

```typescript
// Add more funds to an existing escrow
await client.x402.addFunds(agentWallet, 50_000);

// Withdraw unused funds
await client.x402.withdrawFunds(agentWallet, 25_000);

// Close an empty escrow (reclaim rent)
await client.x402.closeEscrow(agentWallet);

// Check if an escrow exists
const exists = await client.x402.hasEscrow(agentWallet);

// Fetch raw escrow data
const escrow = await client.x402.fetchEscrow(agentWallet);
```

---

## EscrowModule — Low-Level Access

Access via `client.escrow`. Direct Anchor instruction wrappers with full control over account parameters. Use this when you need SPL token escrows or custom account structures.

### Create

```typescript
import { BN } from "@coral-xyz/anchor";

const sig = await client.escrow.create(agentWallet, {
  pricePerCall: new BN(1_000_000),
  maxCalls: new BN(100),
  initialDeposit: new BN(100_000_000),
  expiresAt: null,            // null = never expires
  volumeCurve: null,          // null = flat pricing
  tokenMint: null,            // null = native SOL
  tokenDecimals: null,        // null = default (9)
});
```

### Deposit

```typescript
await client.escrow.deposit(agentWallet, new BN(50_000_000));
```

### Settle

Must be called by the agent owner. `serviceHash` is a pre-computed 32-byte array:

```typescript
import { sha256, hashToArray } from "@synapse-sap/sdk/utils";

const serviceHash = hashToArray(sha256("service-record-001"));

await client.escrow.settle(
  depositorWallet,
  new BN(5),       // calls to settle
  serviceHash,     // [u8; 32]
);
```

### Batch Settle

Up to 10 settlements per transaction:

```typescript
await client.escrow.settleBatch(depositorWallet, [
  { callsToSettle: new BN(3), serviceHash: hashToArray(sha256("batch-1")) },
  { callsToSettle: new BN(7), serviceHash: hashToArray(sha256("batch-2")) },
]);
```

### Withdraw

Client withdraws unsettled funds:

```typescript
await client.escrow.withdraw(agentWallet, new BN(25_000_000));
```

### Close

Close an empty escrow (balance must be 0) and reclaim rent:

```typescript
await client.escrow.close(agentWallet);
```

### Fetch

```typescript
const [agentPda] = deriveAgent(agentWallet);
const escrow = await client.escrow.fetch(agentPda);

console.log(escrow.balance.toString());
console.log(escrow.pricePerCall.toString());
console.log(escrow.volumeCurve);
```

---

## Volume Curves

Volume curves implement automatic tiered pricing. As cumulative calls increase, the effective price per call decreases — rewarding high-volume consumers.

### How Breakpoints Work

A volume curve is an ordered array of `VolumeCurveBreakpoint` entries:

```typescript
interface VolumeCurveBreakpoint {
  afterCalls: number;     // threshold: once cumulative calls exceed this…
  pricePerCall: BN;       // …this price takes effect
}
```

The base `pricePerCall` applies until the first breakpoint is reached. Each subsequent breakpoint overrides the price for all calls beyond its threshold.

### Example: Three-Tier Pricing

```
Base price:  100,000 lamports/call
After  100:   80,000 lamports/call  (20% discount)
After  500:   60,000 lamports/call  (40% discount)
```

```typescript
const ctx = await client.x402.preparePayment(agentWallet, {
  pricePerCall: 100_000,
  deposit: 10_000_000,
  volumeCurve: [
    { afterCalls: 100, pricePerCall: 80_000 },
    { afterCalls: 500, pricePerCall: 60_000 },
  ],
});
```

### Cost Breakdown for 600 Calls

```
Tier 1:  calls   1–100  →  100 × 100,000 =  10,000,000
Tier 2:  calls 101–500  →  400 ×  80,000 =  32,000,000
Tier 3:  calls 501–600  →  100 ×  60,000 =   6,000,000
                                     Total:  48,000,000 lamports
                           Effective price:      80,000 lamports/call
```

The `estimateCost` and `calculateCost` methods return this breakdown in the `tiers` array.

> **Limit**: Up to 5 breakpoints per volume curve (`MAX_VOLUME_CURVE_POINTS`).

---

## SPL Token Escrows

Escrows support any SPL token — not just native SOL. Pass the token mint and provide the required Associated Token Accounts.

### Creating an SPL Escrow

```typescript
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const tokenMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC

const depositorAta = await getAssociatedTokenAddress(tokenMint, depositorWallet);
const escrowAta = await getAssociatedTokenAddress(tokenMint, escrowPda, true);

const splAccounts = [
  { pubkey: depositorAta,   isSigner: false, isWritable: true },
  { pubkey: escrowAta,      isSigner: false, isWritable: true },
  { pubkey: tokenMint,      isSigner: false, isWritable: false },
  { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
];

await client.escrow.create(
  agentWallet,
  {
    pricePerCall: new BN(1_000),    // 0.001 USDC per call
    maxCalls: new BN(1000),
    initialDeposit: new BN(1_000_000), // 1 USDC
    expiresAt: null,
    volumeCurve: null,
    tokenMint,
    tokenDecimals: 6,               // USDC has 6 decimals
  },
  splAccounts,
);
```

### SPL Account Order

The `splAccounts` array must follow this exact order:

| Index | Account | Writable | Description |
|-------|---------|----------|-------------|
| 0 | `depositorAta` | Yes | Depositor's Associated Token Account |
| 1 | `escrowAta` | Yes | Escrow's Associated Token Account |
| 2 | `tokenMint` | No | SPL token mint address |
| 3 | `tokenProgram` | No | Token program (`TOKEN_PROGRAM_ID`) |

The same `splAccounts` format applies to `deposit`, `settle`, `settleBatch`, and `withdraw`.

---

## Complete x402 Flow — End to End

```typescript
import { SapClient } from "@synapse-sap/sdk";

// ═══════════════════════════════════════════════
//  CLIENT SIDE
// ═══════════════════════════════════════════════

const client = SapClient.from(provider);

// 1. Estimate cost
const estimate = await client.x402.estimateCost(agentWallet, 100);
console.log(`Estimated cost: ${estimate.totalCost} lamports`);

// 2. Prepare payment (creates escrow + deposits)
const ctx = await client.x402.preparePayment(agentWallet, {
  pricePerCall: 10_000,
  maxCalls: 100,
  deposit: 1_000_000,
});

// 3. Build headers and call the agent
const headers = client.x402.buildPaymentHeaders(ctx);
const response = await fetch("https://agent.example.com/api/v1/invoke", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ prompt: "What is the SOL price?" }),
});

// 4. Monitor balance
const balance = await client.x402.getBalance(agentWallet);
console.log(`Calls remaining: ${balance?.callsRemaining}`);

// ═══════════════════════════════════════════════
//  AGENT SIDE
// ═══════════════════════════════════════════════

// 5. Settle after serving requests
const receipt = await client.x402.settle(depositorWallet, 1, "response-hash");
console.log(`Settled: ${receipt.amount} lamports for ${receipt.callsSettled} call(s)`);

// 6. Or batch settle for efficiency
const batch = await client.x402.settleBatch(depositorWallet, [
  { calls: 5, serviceData: "morning-session" },
  { calls: 3, serviceData: "afternoon-session" },
]);
```

---

## PDA Derivation

Escrow accounts are deterministic PDAs derived from the agent and depositor:

```
Seeds: ["sap_escrow", agentPda.toBytes(), depositor.toBytes()]
Program: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
```

```typescript
import { deriveAgent, deriveEscrow } from "@synapse-sap/sdk/pda";

const [agentPda] = deriveAgent(agentWallet);
const [escrowPda] = deriveEscrow(agentPda, depositorWallet);
```

---

## EscrowAccountData Reference

| Field | Type | Description |
|-------|------|-------------|
| `agent` | `PublicKey` | Agent PDA |
| `depositor` | `PublicKey` | Client wallet |
| `agentWallet` | `PublicKey` | Agent's wallet (settlement target) |
| `balance` | `BN` | Current remaining balance |
| `totalDeposited` | `BN` | Cumulative deposits |
| `totalSettled` | `BN` | Cumulative settlements |
| `totalCallsSettled` | `BN` | Lifetime calls settled |
| `pricePerCall` | `BN` | Base price per call |
| `maxCalls` | `BN` | Max calls allowed (0 = unlimited) |
| `createdAt` | `BN` | Unix timestamp of creation |
| `lastSettledAt` | `BN` | Unix timestamp of last settlement |
| `expiresAt` | `BN` | Expiry timestamp (0 = never) |
| `volumeCurve` | `VolumeCurveBreakpoint[]` | Volume discount breakpoints |
| `tokenMint` | `PublicKey \| null` | SPL token mint (null = SOL) |
| `tokenDecimals` | `number` | Token decimal places |

---

**Previous**: [Memory Systems](./04-memory-systems.md) · **Next**: [Discovery & Indexing →](./06-discovery-indexing.md)
