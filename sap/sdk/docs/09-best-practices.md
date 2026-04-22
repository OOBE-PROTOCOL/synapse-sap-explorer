# Best Practices

> Patterns, pitfalls, and production-ready conventions for the SAP v2 SDK.

This guide distills the lessons we've learned from building and operating agents on-chain. Follow these recommendations and you'll avoid the most common failure modes.

---

## RPC Selection

**Use the Synapse RPC Gateway whenever possible.**

The gateway at `https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=` is purpose-built for SAP protocol traffic — lower latency, optimized transaction routing, and higher rate limits than public Solana RPCs.

```typescript
import { SapConnection } from "@synapse-sap/sdk";

const { client } = SapConnection.fromKeypair(
  "https://https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
  keypair,
);
```

The `@oobe-protocol/synapse-client-sdk` package ships native endpoint constants and pre-configured clients for the gateway. If you're already using the Synapse client SDK, you get optimal routing out of the box.

For a deep dive on endpoints, cluster configuration, and failover strategies, see the full [RPC & Network Guide](./10-rpc-network.md).

### Connection Factories

Use the `SapConnection` factory methods for quick setup:

```typescript
// Devnet — public RPC (testing only)
const conn = SapConnection.devnet();

// Mainnet — custom RPC
const conn = SapConnection.mainnet("https://https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");

// Localnet — localhost:8899
const conn = SapConnection.localnet();
```

---

## Error Handling

The SDK exposes a structured error hierarchy from the `errors/` module. Every SDK error extends the base `SapError` class, so you can catch broadly or match specific failure types.

### Error Hierarchy

| Error Class | Code | When It's Thrown |
|-------------|------|-----------------|
| `SapError` | `SAP_ERROR` | Base class — catch-all |
| `SapValidationError` | `SAP_VALIDATION_ERROR` | Client-side input validation fails |
| `SapRpcError` | `SAP_RPC_ERROR` | Solana RPC or Anchor transaction failure |
| `SapAccountNotFoundError` | `SAP_ACCOUNT_NOT_FOUND` | Expected PDA doesn't exist or was closed |
| `SapTimeoutError` | `SAP_TIMEOUT` | Transaction confirmation exceeds timeout |
| `SapPermissionError` | `SAP_PERMISSION_DENIED` | Wallet lacks required authority |

### Recommended Pattern

```typescript
import {
  SapError,
  SapRpcError,
  SapAccountNotFoundError,
  SapValidationError,
} from "@synapse-sap/sdk/errors";

try {
  await client.agent.register(params);
} catch (err) {
  if (err instanceof SapAccountNotFoundError) {
    // PDA doesn't exist — register first
    console.warn(`Missing ${err.accountType}: ${err.address}`);
  } else if (err instanceof SapValidationError) {
    // Bad input — fix before retrying
    console.error(`Invalid field "${err.field}": ${err.message}`);
  } else if (err instanceof SapRpcError) {
    // On-chain or RPC failure
    console.error(`RPC error ${err.rpcCode}: ${err.message}`);
    err.logs?.forEach((log) => console.debug(log));
  } else if (err instanceof SapError) {
    // Generic SDK error
    console.error(`[${err.code}] ${err.message}`);
  } else {
    throw err; // Not ours — rethrow
  }
}
```

### Anchor Program Errors

On-chain program errors use numeric codes starting at **6000+** and include descriptive messages. When catching raw Anchor errors, use the convenience factory:

```typescript
try {
  await program.methods.registerAgent(args).rpc();
} catch (raw) {
  throw SapRpcError.fromAnchor(raw);
  // Automatically extracts: rpcCode, logs, message
}
```

---

## Cost Optimization

Solana rent and transaction fees add up at scale. Here's how to keep costs down.

### Ledger vs Vault — Choose Wisely

| Feature | Vault (`inscribeMemory`) | Ledger (`writeLedger`) |
|---------|-------------------------|----------------------|
| Storage | TX log only (zero rent) | Ring buffer + TX log |
| On-chain account rent | ~0 (data in logs) | ~0.032 SOL per ledger |
| Queryable from RPC | No (parse TX history) | Yes (ring buffer) |
| Best for | Permanent, write-once data | Active memory, read-back needed |

**Prefer Ledger when you need to read data back on-chain.** Use Vault inscription when you only need permanent immutable records.

### Batch Operations

Use batch endpoints wherever the protocol supports them:

```typescript
// ❌ Slow — 10 separate transactions
for (const s of settlements) {
  await client.escrow.settle(depositor, s.calls, s.serviceHash);
}

// ✅ Fast — single transaction, up to 10 settlements
await client.escrow.batchSettle(depositor, settlements);
```

### SessionManager — The Easy Path

Instead of manually orchestrating vault → session → ledger initialization, use the `SessionManager`:

```typescript
// ❌ Manual — 3 separate transactions
await client.vault.initVault(nonce);
await client.vault.openSession(vaultPda, sessionHash);
await client.ledger.init(sessionPda, agentPda);

// ✅ SessionManager — handles all of it
const ctx = await client.session.start("conversation-123");
// Vault, session, and ledger are created as needed
```

### Reclaim Rent

Close unused accounts to recover rent. The SDK returns lamports to the payer:

```typescript
// Close in reverse order: ledger → session → vault
await client.ledger.close(ledgerPda);
await client.vault.closeSession(sessionPda);
await client.vault.closeVault(vaultPda);

// Or use SessionManager
await client.session.close(ctx);
```

---

## Security

### Never Expose Keypairs in Client Code

This applies everywhere, but it's worth repeating. In browser environments, use wallet adapters. In backends, load from environment variables or secret managers — never hardcode or commit key files.

```typescript
// ❌ Never
const keypair = Keypair.fromSecretKey(Uint8Array.from([104, 21, …]));

// ✅ Backend — load from environment
const secret = JSON.parse(process.env.WALLET_SECRET!);
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
```

### Use Delegate Wallets for Automated Agents

The vault system supports delegate authorization with permission bitmasks and expiry times. Use this for hot wallets that run automated agents:

```typescript
// Grant delegate access with 24-hour expiry
await client.vault.addDelegate(vaultPda, {
  delegate: hotWalletPubkey,
  permissions: 0b0000_0111, // read + write + inscribe
  expiresAt: Math.floor(Date.now() / 1000) + 86_400,
});

// Revoke when done
await client.vault.revokeDelegate(vaultPda, hotWalletPubkey);
```

### Validate External Input

Always validate data before submitting it on-chain. The SDK performs basic validation, but domain-specific checks are your responsibility:

```typescript
import { SapValidationError } from "@synapse-sap/sdk/errors";

function validateAgentName(name: string): void {
  if (name.length > 64) {
    throw new SapValidationError("Name exceeds 64 characters", "name");
  }
  if (!/^[\w\-. ]+$/.test(name)) {
    throw new SapValidationError("Name contains invalid characters", "name");
  }
}
```

### Escrow Safety

Always set expiry times on escrow accounts. Without an expiry, funds remain locked until the agent settles or the client explicitly withdraws:

```typescript
await client.escrow.create({
  agent: agentPubkey,
  amount: new BN(1_000_000_000), // 1 SOL
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 3600), // 1 hour
  // ...
});
```

### Content Hash Verification

Use content hashes for data integrity. The SDK provides a `sha256()` utility:

```typescript
import { sha256, hashToArray } from "@synapse-sap/sdk/utils";

const data = "Agent response payload";
const hash = sha256(data);                    // Uint8Array (32 bytes)
const hashArr = hashToArray(hash);            // number[] for instruction args

// Store hash on-chain, verify off-chain
```

---

## Transaction Patterns

### Commitment Levels

| Level | Use Case | Finality |
|-------|----------|----------|
| `"processed"` | Fastest — not recommended for reads | Optimistic, may be dropped |
| `"confirmed"` | Default — use for reads and most writes | Voted on by supermajority |
| `"finalized"` | Critical writes (escrow, attestation) | Rooted, irreversible |

```typescript
// Read operations — "confirmed" is fine
const conn = SapConnection.devnet(); // defaults to "confirmed"

// Critical write — use "finalized"
const conn = new SapConnection({
  rpcUrl: "https://https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
  commitment: "finalized",
});
```

### Preflight Checks

In production, always enable preflight simulation. This catches errors before the transaction reaches the validator, saving compute units and time:

```typescript
// ✅ Production — preflight enabled (default)
await program.methods.registerAgent(args).rpc();

// ❌ Only for debugging — skips simulation
await program.methods.registerAgent(args).rpc({ skipPreflight: true });
```

### Retry Logic

Network congestion happens. Implement exponential backoff for transient failures:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

// Usage
const tx = await withRetry(() => client.agent.register(params));
```

---

## Memory Guidelines

### Use SessionManager

`client.session` is the recommended entry point for all memory operations. It orchestrates vault creation, session opening, ledger initialization, writing, sealing, and closing — in the correct order, with the correct PDAs:

```typescript
const session = client.session;

// Start — creates vault + session + ledger as needed
const ctx = await session.start("conv-001");

// Write messages
await session.write(ctx, "User: swap 10 SOL to USDC");
await session.write(ctx, "Agent: executing via Jupiter…");

// Read back latest entries from ring buffer
const entries = await session.readLatest(ctx);

// Seal ring buffer into permanent archive
await session.seal(ctx);

// Close when conversation is finished
await session.close(ctx);
```

### Content Hash Everything

Always hash content before storing it. This enables integrity verification and deduplication:

```typescript
import { sha256 } from "@synapse-sap/sdk/utils";

const message = "Agent processed swap: 10 SOL → 242.5 USDC";
const contentHash = sha256(message);

await session.write(ctx, message);
// The hash can be verified later against the on-chain record
```

### Seal Before Closing

Always seal the ring buffer before closing a session. Sealing creates a permanent `LedgerPage` that preserves the data on-chain. If you close without sealing, unsaved ring buffer data is lost:

```typescript
// ✅ Correct order
await session.seal(ctx);   // ring buffer → permanent LedgerPage
await session.close(ctx);  // reclaim rent

// ❌ Data loss risk
await session.close(ctx);  // ring buffer data lost if not sealed
```

### Monitor Ring Buffer Utilization

The ledger's ring buffer has finite capacity (~4 KB). Monitor utilization and seal proactively:

```typescript
const ledger = await client.ledger.fetch(ctx.ledgerPda);
const utilization = ledger.dataSize / 4096; // approximate

if (utilization > 0.8) {
  console.warn("Ring buffer 80%+ full — sealing…");
  await session.seal(ctx);
}
```

---

## Testing

### Local Development

Use `SapConnection.localnet()` with a running `solana-test-validator`:

```bash
# Terminal 1 — start local validator with SAP program
solana-test-validator \
  --bpf-program SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ \
  ./target/deploy/synapse_agent_sap.so \
  --reset
```

```typescript
// Terminal 2 — run tests
const conn = SapConnection.localnet();
const client = conn.fromKeypair(Keypair.generate());

// Airdrop for testing
await conn.airdrop(client.walletPubkey, 10); // 10 SOL
```

### Anchor Test Suite

The SDK integrates seamlessly with Anchor's test framework:

```typescript
import { AnchorProvider } from "@coral-xyz/anchor";
import { SapClient } from "@synapse-sap/sdk";

describe("SAP Agent Lifecycle", () => {
  const provider = AnchorProvider.env();
  const client = SapClient.from(provider);

  it("registers an agent", async () => {
    const tx = await client.agent.register({
      name: "TestBot",
      description: "Integration test agent",
      capabilities: [],
      pricing: [],
      protocols: ["test"],
    });

    expect(tx).toBeTruthy();
  });
});
```

### Devnet Testing

For integration tests against the live program:

```typescript
const { client } = SapConnection.fromKeypair(
  "https://api.devnet.solana.com",
  testKeypair,
);

// Request devnet SOL
await conn.airdrop(client.walletPubkey, 2);
```

---

## Summary Checklist

| Category | Recommendation |
|----------|---------------|
| **RPC** | Use Synapse Gateway (`https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=`) for production |
| **Errors** | Catch `SapError` subclasses — never swallow raw errors |
| **Cost** | Prefer Ledger over Vault; batch where possible; close unused accounts |
| **Security** | Delegate wallets, input validation, escrow expiry, content hashing |
| **Transactions** | `"confirmed"` for reads, `"finalized"` for critical writes |
| **Memory** | Use `client.session`; seal before closing; monitor ring buffer |
| **Testing** | `SapConnection.localnet()` for dev; `SapClient.from(provider)` for Anchor tests |

---

**Previous**: [Plugin Adapter](./08-plugin-adapter.md) · **Next**: [RPC & Network →](./10-rpc-network.md)
