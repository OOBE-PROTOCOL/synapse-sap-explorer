# Memory Systems

> Two on-chain memory architectures. How to choose, how to use them, and what they cost.

## Overview

SAP v2 provides two memory systems for persisting agent conversation data on-chain. They solve the same fundamental problem — durable, verifiable session memory — but with different tradeoffs.

| | **Ledger** (recommended) | **Vault** (legacy) |
|---|---|---|
| Architecture | 4 KB ring buffer PDA | Encrypted epoch pages |
| Write cost | ~0.000005 SOL (TX fee only) | ~0.003–0.01 SOL (rent per page) |
| Init cost | ~0.032 SOL (one-time rent) | ~0.005 SOL (vault + session) |
| Encryption | None (cleartext on-chain) | AES-256-GCM (client-side) |
| Structure | Ring buffer → sealed pages | Epoch pages with sequence numbers |
| Integrity | Rolling Merkle hash | Content hash per inscription |
| Best for | High-frequency writes, logs, conversation history | Sensitive data, encrypted storage |
| Delegation | No | Yes (hot wallet delegates) |
| High-level API | `SessionManager` | Manual (module methods) |

**Recommendation:** Use the **Ledger** via `SessionManager` for most workloads. Use **Vault** only when you need client-side encryption or hot-wallet delegation.

---

## Ledger (Recommended)

The Ledger is a fixed-cost ring buffer optimized for high-frequency writes. After the one-time PDA creation (~0.032 SOL), every write costs only the Solana transaction fee (~0.000005 SOL) with **zero additional rent**. Data is written simultaneously to the ring buffer (for latest-read access) and the transaction log (for permanent storage).

### Architecture

```
  ┌──────────────────────────────────────────────────────┐
  │                  MemoryLedger PDA                     │
  │  ┌──────────────────────────────────────────────────┐ │
  │  │          4 KB Ring Buffer                        │ │
  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │ │
  │  │  │ msg1 │ │ msg2 │ │ msg3 │ │ ···  │ ← write   │ │
  │  │  └──────┘ └──────┘ └──────┘ └──────┘           │ │
  │  │  (overwrites oldest when full)                  │ │
  │  └──────────────────────────────────────────────────┘ │
  │  merkleRoot: 0xabc...                                 │
  │  numEntries: 3                                         │
  │  numPages: 0                                           │
  │  totalDataSize: 847                                    │
  └──────────────────────────────────────────────────────┘
            │ seal()
            ▼
  ┌──────────────────────────┐
  │   LedgerPage PDA (0)     │  ← ~0.031 SOL, write-once
  │   snapshot of ring buffer │
  └──────────────────────────┘
```

### Low-Level API (LedgerModule)

For direct control, use the `LedgerModule` methods:

#### Initialize

```typescript
// Creates a MemoryLedger PDA with 4 KB ring buffer
// Cost: ~0.032 SOL rent (one-time, reclaimable on close)
await client.ledger.init(sessionPda);
```

#### Write

```typescript
import { sha256, hashToArray } from "@synapse-sap/sdk/utils";

const data = Buffer.from("User requested SOL→USDC swap");
const contentHash = hashToArray(sha256(data));

// Cost: ~0.000005 SOL (TX fee only — ZERO additional rent)
await client.ledger.write(sessionPda, data, contentHash);
```

Each write:
- Appends to the ring buffer (overwrites oldest entry when full)
- Emits data in the transaction log (permanent, retrievable via `getTransaction`)
- Updates the rolling Merkle hash for integrity verification

#### Seal

```typescript
// Freezes ring buffer contents into a permanent LedgerPage PDA
// Cost: ~0.031 SOL rent (write-once, never-delete)
await client.ledger.seal(sessionPda);
```

Sealing:
- Creates a new `LedgerPage` PDA containing a snapshot of the current ring buffer
- Resets the ring buffer for new writes
- Increments `numPages` on the ledger
- Pages are **immutable** after creation

#### Close

```typescript
// Closes the MemoryLedger PDA, reclaims ~0.032 SOL
await client.ledger.close(sessionPda);
```

#### Read & Decode

```typescript
// Fetch the ledger account
const ledger = await client.ledger.fetchLedger(sessionPda);

// Decode ring buffer into individual entries
const entries = client.ledger.decodeRingBuffer(ledger.ring);
entries.forEach((entry) => {
  console.log(Buffer.from(entry).toString("utf-8"));
});

// Fetch a sealed page
const page = await client.ledger.fetchPage(ledgerPda, 0);
```

### PDA Derivation

```typescript
import { deriveLedger, deriveLedgerPage } from "@synapse-sap/sdk/pda";

const [ledgerPda] = deriveLedger(sessionPda);          // ["sap_ledger", session]
const [pagePda]   = deriveLedgerPage(ledgerPda, 0);    // ["sap_page", ledger, 0]
```

---

## SessionManager (Recommended High-Level API)

The `SessionManager` is the recommended way to work with memory. It wraps the vault and ledger modules into a single cohesive API that handles all the setup automatically.

```
  client.session.start("conversation-123")
      │
      ├─ 1. Ensure vault exists       (skip if already created)
      ├─ 2. Open session              (skip if already open)
      └─ 3. Initialize ledger         (skip if already initialized)
      │
      ▼
  SessionContext { sessionPda, ledgerPda, vaultPda, agentPda, ... }
```

### Start a Session

```typescript
const ctx = await client.session.start("conversation-123");

// ctx contains all derived PDAs:
// ctx.sessionId     → "conversation-123"
// ctx.sessionHash   → SHA-256 of the session ID
// ctx.agentPda      → derived from wallet
// ctx.vaultPda      → derived from agent
// ctx.sessionPda    → derived from vault + session hash
// ctx.ledgerPda     → derived from session
// ctx.wallet        → provider wallet
```

`start()` is **idempotent** — it skips any step that's already been completed on-chain. Safe to call multiple times for the same session ID.

### Write Data

```typescript
const result = await client.session.write(ctx, "User requested SOL→USDC swap");

console.log("TX:", result.txSignature);
console.log("Hash:", result.contentHash);
console.log("Size:", result.dataSize, "bytes");

// Accepts string, Buffer, or Uint8Array
await client.session.write(ctx, Buffer.from([0x01, 0x02, 0x03]));
```

| Field | Type | Description |
|-------|------|-------------|
| `txSignature` | `string` | Transaction signature |
| `contentHash` | `number[]` | SHA-256 of the written data |
| `dataSize` | `number` | Written payload size in bytes |

### Read Latest

```typescript
const entries = await client.session.readLatest(ctx);

for (const entry of entries) {
  console.log(`[${entry.size} bytes] ${entry.text}`);
}
```

`readLatest()` calls `getAccountInfo()` under the hood — it's free on any RPC (no archival node needed) and returns the current ring buffer contents.

| Field | Type | Description |
|-------|------|-------------|
| `data` | `Uint8Array` | Raw bytes |
| `text` | `string` | UTF-8 decoded string |
| `size` | `number` | Byte size |

### Seal to Permanent Archive

```typescript
const sealResult = await client.session.seal(ctx);

console.log("Sealed page index:", sealResult.pageIndex);
console.log("TX:", sealResult.txSignature);
```

After sealing, the ring buffer is reset. Previous data lives permanently in the `LedgerPage` PDA. Cost: ~0.031 SOL per page.

### Read Sealed Pages

```typescript
// Read a specific page
const pageEntries = await client.session.readPage(ctx, 0);

// Read ALL data: sealed pages (oldest) + ring buffer (latest)
const allEntries = await client.session.readAll(ctx);
```

### Get Session Status

```typescript
const status = await client.session.getStatus(ctx);

console.log("Vault exists:", status.vaultExists);
console.log("Session exists:", status.sessionExists);
console.log("Ledger exists:", status.ledgerExists);
console.log("Closed:", status.isClosed);
console.log("Total entries:", status.totalEntries);
console.log("Total data:", status.totalDataSize, "bytes");
console.log("Sealed pages:", status.numPages);
console.log("Merkle root:", status.merkleRoot);
```

### Close Session

```typescript
// Full teardown: close ledger → close session
// Reclaims all rent. Idempotent.
await client.session.close(ctx);
```

### Derive Context Without Creating

If you just need the PDAs without creating anything on-chain:

```typescript
// Pure computation — no network calls
const ctx = client.session.deriveContext("conversation-123");
```

### Complete SessionManager Example

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

const client = SapClient.from(AnchorProvider.env());

// Start (creates vault + session + ledger if needed)
const ctx = await client.session.start("conv-001");

// Write conversation data
await client.session.write(ctx, "User: What's the price of SOL?");
await client.session.write(ctx, "Agent: SOL is trading at $142.50");
await client.session.write(ctx, "User: Swap 10 SOL to USDC");
await client.session.write(ctx, "Agent: Swap executed. Received 1,425 USDC");

// Read back
const messages = await client.session.readLatest(ctx);
messages.forEach((m) => console.log(m.text));

// Archive to permanent storage
await client.session.seal(ctx);

// Check status
const status = await client.session.getStatus(ctx);
console.log(`${status.totalEntries} entries, ${status.numPages} sealed pages`);

// Cleanup when done
await client.session.close(ctx);
```

---

## Cost Summary

| Operation | Ledger Cost | Notes |
|-----------|------------|-------|
| `init` / `start` | ~0.032 SOL | One-time rent for 4 KB ring buffer (reclaimable) |
| `write` | ~0.000005 SOL | TX fee only, zero rent |
| `seal` | ~0.031 SOL | Permanent page, write-once |
| `close` | Reclaims ~0.032 SOL | Returns ring buffer rent |
| 100 writes | ~0.0005 SOL | Just transaction fees |
| 1,000 writes | ~0.005 SOL | Still just transaction fees |

Compare this to the Vault, where each inscription can cost 0.003–0.01 SOL in epoch page rent. For high-frequency writes, the ledger is orders of magnitude cheaper.

---

## Vault (Legacy)

The Vault provides encrypted, session-scoped memory with epoch-based pagination. Data is encrypted client-side with AES-256-GCM before being inscribed on-chain. The vault also supports hot-wallet delegation, allowing authorized delegates to inscribe data without the owner's signature.

> **When to use Vault:** Only when you need client-side encryption or hot-wallet delegation. For everything else, use the Ledger.

### Architecture

```
  ┌───────────────────────────────────────────────────────┐
  │                   MemoryVault PDA                      │
  │   owner, nonce, session count, active session count    │
  └───────────────────┬───────────────────────────────────┘
                      │
            ┌─────────┼─────────┐
            ▼         ▼         ▼
  ┌──────────────┐ ┌────────┐ ┌────────┐
  │ SessionLedger│ │Session │ │Session │
  │ (hash-scoped)│ │   B    │ │   C    │
  └──────┬───────┘ └────────┘ └────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
  ┌────┐┌────┐┌────┐
  │Ep 0││Ep 1││Ep 2│   ← EpochPage PDAs
  └────┘└────┘└────┘
```

### Vault Lifecycle

#### Initialize Vault

```typescript
// 32-byte encryption nonce
const vaultNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)));

await client.vault.initVault(vaultNonce);
```

#### Open Session

```typescript
import { sha256, hashToArray } from "@synapse-sap/sdk/utils";

const sessionHash = hashToArray(sha256("conversation-456"));
await client.vault.openSession(sessionHash);
```

#### Inscribe Data

```typescript
// Full inscription (8 args — for fragmented/multi-part data)
await client.vault.inscribeWithAccounts(sessionPda, epochPagePda, vaultPda, {
  sequence: 1,
  encryptedData: Buffer.from(encryptedBytes),
  nonce: encryptionNonce,
  contentHash: contentHashArray,
  totalFragments: 1,
  fragmentIndex: 0,
  compression: 0,         // 0 = none, 1 = zlib, 2 = zstd
  epochIndex: 0,
});

// Compact inscription (4 args — for single-fragment writes)
await client.vault.compactInscribe(sessionPda, vaultPda, {
  sequence: 1,
  encryptedData: Buffer.from(encryptedBytes),
  nonce: encryptionNonce,
  contentHash: contentHashArray,
});
```

#### Close Session & Vault

```typescript
// Close a session (no more inscriptions)
await client.vault.closeSession(vaultPda, sessionPda);

// Close epoch pages (reclaim rent)
await client.vault.closeEpochPage(sessionPda, 0);

// Close the vault itself
await client.vault.closeVault();
```

### Nonce Rotation

Rotate the encryption nonce when key material needs to change:

```typescript
const newNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)));
await client.vault.rotateNonce(newNonce);
```

### Delegation (Hot Wallets)

Vaults support delegated access for scenarios where a hot wallet needs to write on behalf of the vault owner (e.g., a backend service signing transactions):

```typescript
import { PublicKey } from "@solana/web3.js";

const hotWallet = new PublicKey("...");

// Authorize delegate with permissions bitmask and expiry
await client.vault.addDelegate(
  hotWallet,
  0xFF,                         // permission bitmask (all permissions)
  Math.floor(Date.now() / 1000) + 86400,  // expires in 24 hours
);

// Delegate can inscribe data
await client.vault.inscribeDelegated(
  hotWallet,
  vaultPda,
  sessionPda,
  epochPagePda,
  inscriptionArgs,
);

// Revoke when no longer needed
await client.vault.revokeDelegate(hotWallet);
```

### Vault Fetchers

```typescript
const vault = await client.vault.fetchVault(agentPda);
const session = await client.vault.fetchSession(vaultPda, sessionHash);
const sessionByPda = await client.vault.fetchSessionByPda(sessionPda);
const epochPage = await client.vault.fetchEpochPage(sessionPda, 0);
const delegate = await client.vault.fetchDelegate(vaultPda, hotWallet);
```

### Vault PDA Derivation

```typescript
import {
  deriveVault,
  deriveSession,
  deriveEpochPage,
  deriveVaultDelegate,
} from "@synapse-sap/sdk/pda";

const [vaultPda]    = deriveVault(agentPda);                           // ["sap_vault", agent]
const [sessionPda]  = deriveSession(vaultPda, sessionHash);            // ["sap_session", vault, hash]
const [epochPda]    = deriveEpochPage(sessionPda, 0);                  // ["sap_epoch", session, 0]
const [delegatePda] = deriveVaultDelegate(vaultPda, delegateWallet);   // ["sap_delegate", vault, delegate]
```

---

## Choosing Between Ledger and Vault

### Use Ledger when:

- You need high-frequency writes (conversation logs, telemetry, audit trails)
- Cost per write matters (100x cheaper for ongoing writes)
- Data doesn't need to be encrypted on-chain
- You want the simplest API (`SessionManager`)

### Use Vault when:

- Data must be encrypted on-chain (AES-256-GCM)
- You need hot-wallet delegation for backend services
- You need epoch-based pagination with custom sequencing
- You're working with an existing Vault-based codebase

### Migration Path

If you have an existing Vault setup and want to move to Ledger, the `SessionManager` handles both systems. You can start new sessions with the Ledger while keeping old Vault sessions readable:

```typescript
// New sessions automatically use the Ledger
const ctx = await client.session.start("new-conversation");
await client.session.write(ctx, "This writes to the ledger");

// Old vault sessions can still be read via VaultModule
const oldSession = await client.vault.fetchSession(vaultPda, oldSessionHash);
```

---

**Previous**: [Agent Lifecycle](./03-agent-lifecycle.md) · **Next**: [x402 Payments →](./05-x402-payments.md)
