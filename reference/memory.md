# SAP SDK — Memory Systems Complete Reference

> **Version:** v0.6.3
> **Package:** `@oobe-protocol-labs/synapse-sap-sdk`
> **Program:** `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
> **Companion guides:** [merchant.md](./merchant.md) · [client.md](./client.md) · [skills.md](./skills.md)

This document is the **complete operational reference** for all SAP memory systems.
It covers every instruction, account struct, PDA derivation, event, SDK method,
data chunking pattern, encryption model, and cost analysis across all four memory
layers plus the recommended MemoryLedger system.

---

## Table of Contents

- [SAP SDK — Memory Systems Complete Reference](#sap-sdk--memory-systems-complete-reference)
  - [Table of Contents](#table-of-contents)
  - [1. Architecture Overview](#1-architecture-overview)
  - [2. Which System to Use](#2-which-system-to-use)
  - [3. PDA Seed Reference](#3-pda-seed-reference)
  - [4. Memory Vault](#4-memory-vault)
    - [4a. Init Vault](#4a-init-vault)
    - [4b. Open Session](#4b-open-session)
    - [4c. Inscribe Memory](#4c-inscribe-memory)
    - [4d. Compact Inscribe](#4d-compact-inscribe)
    - [4e. Multi-Fragment Data Chunking](#4e-multi-fragment-data-chunking)
    - [4f. Epoch Pages](#4f-epoch-pages)
    - [4g. Close Session \& Vault](#4g-close-session--vault)
    - [4h. Nonce Rotation](#4h-nonce-rotation)
    - [4i. Delegate Hot-Wallet Access](#4i-delegate-hot-wallet-access)
    - [4j. Delegated Inscription](#4j-delegated-inscription)
    - [4k. Fetch Vault Data](#4k-fetch-vault-data)
  - [5. Memory Ledger](#5-memory-ledger)
    - [5a. Init Ledger](#5a-init-ledger)
    - [5b. Write to Ledger](#5b-write-to-ledger)
    - [5c. Ring Buffer Mechanics](#5c-ring-buffer-mechanics)
    - [5d. Seal Ledger](#5d-seal-ledger)
    - [5e. Read Ring Buffer (Hot Path)](#5e-read-ring-buffer-hot-path)
    - [5f. Read Sealed Pages (Cold Path)](#5f-read-sealed-pages-cold-path)
    - [5g. Close Ledger](#5g-close-ledger)
    - [5h. Merkle Proof Verification](#5h-merkle-proof-verification)
  - [6. Memory Buffer — Legacy](#6-memory-buffer--legacy)
  - [7. Memory Digest — Legacy](#7-memory-digest--legacy)
  - [8. Encryption Model](#8-encryption-model)
  - [9. Merkle Accumulator](#9-merkle-accumulator)
  - [10. Events — Complete Reference](#10-events--complete-reference)
    - [Vault Events (8)](#vault-events-8)
    - [Vault Security Events (3)](#vault-security-events-3)
    - [Ledger Events (2)](#ledger-events-2)
    - [Checkpoint Events (1)](#checkpoint-events-1)
    - [Buffer Events — Legacy (2)](#buffer-events--legacy-2)
    - [Digest Events — Legacy (3)](#digest-events--legacy-3)
  - [11. Fetching Events from Transactions](#11-fetching-events-from-transactions)
    - [Method 1 — Parse from a known TX](#method-1--parse-from-a-known-tx)
    - [Method 2 — Scan all TXs for a PDA](#method-2--scan-all-txs-for-a-pda)
    - [Method 3 — Scan by epoch (efficient range query)](#method-3--scan-by-epoch-efficient-range-query)
    - [Method 4 — Real-time WebSocket](#method-4--real-time-websocket)
    - [Method 5 — Yellowstone gRPC (recommended for production)](#method-5--yellowstone-grpc-recommended-for-production)
  - [12. Reconstructing Data from TX Logs](#12-reconstructing-data-from-tx-logs)
    - [Vault: Reconstruct encrypted conversation](#vault-reconstruct-encrypted-conversation)
    - [Ledger: Reconstruct full history](#ledger-reconstruct-full-history)
    - [Ledger: Reconstruct from TX logs (when ring buffer has evicted old entries)](#ledger-reconstruct-from-tx-logs-when-ring-buffer-has-evicted-old-entries)
  - [13. Data Chunking — Large Payload Patterns](#13-data-chunking--large-payload-patterns)
    - [Pattern 1: Vault Multi-Fragment (recommended for encrypted data)](#pattern-1-vault-multi-fragment-recommended-for-encrypted-data)
    - [Pattern 2: Ledger Multi-Write (for unencrypted data \> 750B)](#pattern-2-ledger-multi-write-for-unencrypted-data--750b)
    - [Pattern 3: Compressed + Chunked (maximum efficiency)](#pattern-3-compressed--chunked-maximum-efficiency)
  - [14. Compression](#14-compression)
  - [15. Cost Analysis](#15-cost-analysis)
    - [Per-Write Costs](#per-write-costs)
    - [Volume Cost Comparison](#volume-cost-comparison)
  - [16. Production Patterns](#16-production-patterns)
    - [Pattern: Agent Conversation Memory](#pattern-agent-conversation-memory)
    - [Pattern: Encrypted Session + Readable Index](#pattern-encrypted-session--readable-index)
    - [Pattern: Auto-Seal on Threshold](#pattern-auto-seal-on-threshold)
    - [Pattern: Full History Retrieval with Verification](#pattern-full-history-retrieval-with-verification)
  - [17. PostgreSQL Sync for Memory Events](#17-postgresql-sync-for-memory-events)
  - [18. Yellowstone gRPC Streaming](#18-yellowstone-grpc-streaming)
  - [19. Account Structs — Full Field Reference](#19-account-structs--full-field-reference)
    - [MemoryVault](#memoryvault)
    - [SessionLedger](#sessionledger)
    - [EpochPage](#epochpage)
    - [VaultDelegate](#vaultdelegate)
    - [MemoryLedger](#memoryledger)
    - [LedgerPage](#ledgerpage)
  - [20. Constants \& Limits](#20-constants--limits)
  - [21. Feature Gates](#21-feature-gates)

---

## 1. Architecture Overview

SAP provides **four memory systems**. Two are active (default), two are legacy
(behind the `legacy-memory` feature flag).

```
┌────────────────────────────────────────────────────────────┐
│                   SAP Memory Architecture                  │
│                                                            │
│  ACTIVE (default build)                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Memory Vault (Encrypted TX Log Inscriptions)        │  │
│  │  ├─ SessionLedger PDA (session index, merkle root)   │  │
│  │  ├─ EpochPage PDA(s) (per-1000 pagination)           │  │
│  │  ├─ VaultDelegate PDA(s) (hot-wallet delegation)     │  │
│  │  └─ TX Logs: MemoryInscribedEvent (permanent, 0 rent)│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Memory Ledger ⭐ RECOMMENDED                        │  │
│  │  ├─ MemoryLedger PDA (4KB ring buffer, hot read)     │  │
│  │  ├─ LedgerPage PDA(s) (sealed archives, immutable)   │  │
│  │  └─ TX Logs: LedgerEntryEvent (permanent, 0 rent)    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  LEGACY (feature = "legacy-memory")                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Memory Buffer (On-Chain Realloc Storage)             │  │
│  │  └─ MemoryBuffer PDA (dynamic Vec, grows via realloc)│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Memory Digest (Proof-of-Memory, Off-Chain Data)     │  │
│  │  ├─ MemoryDigest PDA (fixed ~230B, hash-only)        │  │
│  │  └─ Optional TX Log inscription                      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Data storage model:**

| System | Where data lives | Rent model | Readable via |
|--------|-----------------|------------|--------------|
| **Vault** | TX logs (events) | Zero rent — permanent | `getSignaturesForAddress()` → `getTransaction()` → parse logs |
| **Ledger** | Ring buffer PDA + TX logs | Fixed 0.032 SOL + zero-rent logs | `getAccountInfo()` for hot data, TX logs for history |
| **Buffer** | On-chain PDA (Vec) | Dynamic rent (grows) | `getAccountInfo()` directly |
| **Digest** | Off-chain (IPFS/Arweave/etc) | Fixed ~0.002 SOL | Off-chain fetch + verify hash |

---

## 2. Which System to Use

| Use Case | System | Why |
|----------|--------|-----|
| Encrypted agent memory | **Vault** | Zero-rent TX logs, AES-256-GCM, nonce rotation, delegation |
| General-purpose read/write | **Ledger** ⭐ | Fixed cost, 4KB hot ring, permanent sealed pages |
| Fast reads (last N entries) | **Ledger** ring buffer | `getAccountInfo()` on any RPC — single call |
| Permanent immutable archive | **Ledger** sealed pages | Write-once, never-delete, merkle proven |
| Encrypted + readable | **Vault** + **Ledger** | Vault for encrypted archive, Ledger for readable index |
| Off-chain data proofs | **Digest** (legacy) | IPFS/Arweave hash on-chain, minimal footprint |
| Dynamic on-chain storage | **Buffer** (legacy) | Realloc-based, but higher cost |

**Rule of thumb:** Use **MemoryLedger** unless you need encryption (→ Vault) or off-chain storage proofs (→ Digest).

---

## 3. PDA Seed Reference

All PDAs are derived from the SAP program ID: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`

```typescript
import { deriveVault, deriveSession, deriveEpochPage, deriveVaultDelegate,
         deriveLedger, deriveLedgerPage, deriveCheckpoint } from "@oobe-protocol-labs/synapse-sap-sdk";

// Memory Vault PDAs
const [vaultPda]    = deriveVault(agentPda);
//  Seeds: ["sap_vault", agent_pda]

const [sessionPda]  = deriveSession(vaultPda, sessionHash);
//  Seeds: ["sap_session", vault_pda, session_hash]   (session_hash = sha256 of session ID)

const [epochPda]    = deriveEpochPage(sessionPda, epochIndex);
//  Seeds: ["sap_epoch", session_pda, epoch_index_u32_le]

const [delegatePda] = deriveVaultDelegate(vaultPda, delegateWallet);
//  Seeds: ["sap_delegate", vault_pda, delegate_pubkey]

// Memory Ledger PDAs
const [ledgerPda]   = deriveLedger(sessionPda);
//  Seeds: ["sap_ledger", session_pda]

const [pagePda]     = deriveLedgerPage(ledgerPda, pageIndex);
//  Seeds: ["sap_page", ledger_pda, page_index_u32_le]

// Checkpoint PDAs
const [checkpointPda] = deriveCheckpoint(sessionPda, checkpointIndex);
//  Seeds: ["sap_checkpoint", session_pda, checkpoint_index_u32_le]
```

**Full seed table:**

| Account | Seed Pattern | Unique Per |
|---------|-------------|------------|
| `MemoryVault` | `["sap_vault", agent_pda]` | Agent |
| `SessionLedger` | `["sap_session", vault_pda, session_hash]` | Vault + session |
| `EpochPage` | `["sap_epoch", session_pda, epoch_index_LE]` | Session + epoch |
| `VaultDelegate` | `["sap_delegate", vault_pda, delegate_pubkey]` | Vault + delegate |
| `MemoryLedger` | `["sap_ledger", session_pda]` | Session |
| `LedgerPage` | `["sap_page", ledger_pda, page_index_LE]` | Ledger + page |
| `SessionCheckpoint` | `["sap_checkpoint", session_pda, idx_LE]` | Session + checkpoint |
| `MemoryBuffer` | `["sap_buffer", session_pda, page_index_LE]` | Session + page (legacy) |
| `MemoryDigest` | `["sap_digest", session_pda]` | Session (legacy) |

---

## 4. Memory Vault

The Memory Vault stores **AES-256-GCM encrypted data** permanently in Solana transaction
logs at **zero rent cost**. Data is written as `MemoryInscribedEvent` emissions —
permanent, immutable, and retrievable by scanning the session's or epoch's transaction history.

### 4a. Init Vault

Creates the `MemoryVault` PDA for your agent. One vault per agent.

```typescript
import { sha256, hashToArray } from "@oobe-protocol-labs/synapse-sap-sdk";
import crypto from "crypto";

// Generate a random 32-byte nonce (PBKDF2 salt — public, stored on-chain)
const vaultNonce = Array.from(crypto.randomBytes(32));

const tx = await client.vault.initVault(vaultNonce);
console.log("Vault initialized:", tx);
```

**Cost:** ~0.002 SOL (rent for MemoryVault PDA, reclaimable on close)

### 4b. Open Session

Each session groups inscriptions under a unique session hash. You can have multiple
concurrent sessions per vault.

```typescript
// Session hash = SHA-256 of any unique session identifier
const sessionId = "conversation-2026-04-02-user-abc";
const sessionHash = hashToArray(sha256(sessionId));

const tx = await client.vault.openSession(sessionHash);
console.log("Session opened:", tx);
```

**PDA:** `["sap_session", vaultPda, sessionHash]`

**Fields initialized:**
- `sequenceCounter = 0`
- `currentEpoch = 0`
- `isClosed = false`
- `merkleRoot = [0; 32]`

### 4c. Inscribe Memory

Writes encrypted data to the transaction log as a `MemoryInscribedEvent`.
The data is **permanent** — it lives in the TX log forever, at zero rent cost.

```typescript
import crypto from "crypto";
import { sha256, hashToArray } from "@oobe-protocol-labs/synapse-sap-sdk";

// 1. Get vault data for nonce version
const vaultData = await client.vault.fetchVault(agentPda);

// 2. Derive encryption key (client-side only — NEVER on chain)
const key = crypto.pbkdf2Sync(
  userSecret,                    // user's password or secret
  Buffer.from(vaultData.vaultNonce), // public salt from vault
  100_000,                       // iterations
  32,                            // key length (AES-256)
  "sha512"                       // digest
);

// 3. Encrypt data
const plaintext = Buffer.from(JSON.stringify({
  role: "assistant",
  content: "The swap was executed successfully. TX: 5xK9...",
  timestamp: Date.now(),
}));

const iv = crypto.randomBytes(12); // 12-byte nonce for AES-GCM
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();
const encryptedData = Buffer.concat([encrypted, authTag]); // ciphertext + 16-byte tag

// 4. Compute content hash
const contentHash = hashToArray(sha256(encryptedData));

// 5. Get current sequence from session
const [sessionPda] = client.vault.deriveSession(vaultPda, sessionHash);
const session = await client.vault.fetchSessionByPda(sessionPda);
const sequence = session.sequenceCounter;
const epochIndex = Math.floor(sequence / 1000);

// 6. Inscribe
const tx = await client.vault.inscribe({
  sequence,
  encryptedData,
  nonce: Array.from(iv),
  contentHash,
  totalFragments: 1,
  fragmentIndex: 0,
  compression: 0,               // 0=none, 1=deflate, 2=gzip, 3=brotli
  epochIndex,
});
console.log("Inscribed sequence", sequence, "TX:", tx);
```

**Validation rules (enforced on-chain):**
- `sequence == session.sequenceCounter` (must be exact)
- `epochIndex == sequence / 1000` (integer division)
- `encryptedData.length <= 750` bytes
- `totalFragments >= 1`
- `fragmentIndex < totalFragments`
- Session must not be closed

**What happens on-chain:**
1. `session.sequenceCounter++`
2. `session.totalBytes += encryptedData.length`
3. `session.merkleRoot = sha256(prevRoot || contentHash)`
4. `session.tipHash = contentHash`
5. If new epoch: auto-creates `EpochPage` PDA
6. Emits `MemoryInscribedEvent` with full encrypted payload
7. If epoch page already exists: increments `inscriptionCount` and `totalBytes`

### 4d. Compact Inscribe

DX-first variant with only 4 arguments (no fragments, no compression, no epoch).
The program computes epoch internally.

```typescript
const tx = await client.vault.compactInscribe(sessionPda, vaultPda, {
  sequence: session.sequenceCounter,
  encryptedData,
  nonce: Array.from(iv),
  contentHash,
});
```

**When to use:** Single-fragment, uncompressed writes under 750 bytes (most common case).

### 4e. Multi-Fragment Data Chunking

For payloads larger than 750 bytes, split across multiple fragments sharing the same
`contentHash` and `sequence`. All fragments must be inscribed before the sequence advances.

```typescript
const MAX_FRAGMENT = 750;

// Example: 2KB payload → 3 fragments
const payload = encryptWithAESGCM(largeData, key, iv);
const contentHash = hashToArray(sha256(payload));

const fragments = [];
for (let i = 0; i < payload.length; i += MAX_FRAGMENT) {
  fragments.push(payload.slice(i, i + MAX_FRAGMENT));
}

const sequence = session.sequenceCounter;
const epochIndex = Math.floor(sequence / 1000);

for (let i = 0; i < fragments.length; i++) {
  await client.vault.inscribe({
    sequence,                     // SAME sequence for all fragments
    encryptedData: fragments[i],
    nonce: Array.from(iv),
    contentHash,                  // SAME hash for all fragments
    totalFragments: fragments.length,
    fragmentIndex: i,             // 0, 1, 2, ...
    compression: 0,
    epochIndex,
  });
}

// After all fragments: sequence has advanced by 1 (NOT by fragment count)
```

**Fragment reassembly (reader side):**

```typescript
// 1. Fetch all TX logs for the session/epoch
// 2. Group MemoryInscribedEvent by sequence number
// 3. Sort by fragmentIndex within each group
// 4. Concatenate encryptedData from each fragment
// 5. Verify sha256(concatenated) === contentHash

function reassembleFragments(events: MemoryInscribedEvent[]): Map<number, Buffer> {
  const bySequence = new Map<number, MemoryInscribedEvent[]>();

  for (const e of events) {
    const seq = e.data.sequence;
    if (!bySequence.has(seq)) bySequence.set(seq, []);
    bySequence.get(seq)!.push(e);
  }

  const results = new Map<number, Buffer>();
  for (const [seq, frags] of bySequence) {
    frags.sort((a, b) => a.data.fragmentIndex - b.data.fragmentIndex);

    // Verify completeness
    if (frags.length !== frags[0].data.totalFragments) {
      throw new Error(`Sequence ${seq}: expected ${frags[0].data.totalFragments} fragments, got ${frags.length}`);
    }

    const data = Buffer.concat(frags.map(f => Buffer.from(f.data.encryptedData)));

    // Verify integrity
    const hash = sha256(data);
    const expected = Buffer.from(frags[0].data.contentHash).toString("hex");
    if (hash !== expected) {
      throw new Error(`Sequence ${seq}: content hash mismatch`);
    }

    results.set(seq, data);
  }

  return results;
}
```

**Chunking limits:**
- Max per fragment: **750 bytes**
- Max fragments per sequence: **255** (`u8`)
- Max total per sequence: **750 × 255 = ~191 KB** (theoretical)
- Practical limit: TX size (~1232 bytes per TX) means 1–2 fragments per TX

### 4f. Epoch Pages

Every 1,000 inscriptions, a new `EpochPage` PDA is auto-created. Epoch pages
enable efficient time-range queries without scanning the entire session.

```
Epoch 0: sequences 0–999    → EpochPage PDA ["sap_epoch", session, 0]
Epoch 1: sequences 1000–1999 → EpochPage PDA ["sap_epoch", session, 1]
Epoch 2: sequences 2000–2999 → EpochPage PDA ["sap_epoch", session, 2]
...
```

**Query pattern: scan a specific epoch's inscriptions:**

```typescript
const connection = client.program.provider.connection;

// Get the epoch page PDA
const [epochPda] = deriveEpochPage(sessionPda, targetEpoch);

// Fetch all TXs that touched this epoch page = all inscriptions in this epoch
const sigs = await connection.getSignaturesForAddress(epochPda, { limit: 1000 });

for (const sigInfo of sigs) {
  const tx = await connection.getTransaction(sigInfo.signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta?.logMessages) continue;

  const events = client.events.parseLogs(tx.meta.logMessages);
  const inscriptions = client.events.filterByName(events, "MemoryInscribedEvent");

  for (const ins of inscriptions) {
    console.log(`Seq ${ins.data.sequence}: ${ins.data.dataLen} bytes, epoch ${ins.data.epochIndex}`);
  }
}
```

**Epoch page data:**

```typescript
const epochData = await client.vault.fetchEpochPage(sessionPda, epochIndex);
// {
//   epochIndex: 0,
//   startSequence: 0,
//   inscriptionCount: 847,
//   totalBytes: 524_000,
//   firstTs: BN(1711929600),
//   lastTs: BN(1711972800),
// }
```

### 4g. Close Session & Vault

```typescript
// 1. Close session (marks isClosed = true, no more inscriptions)
await client.vault.closeSession(vaultPda, sessionPda);

// 2. Close session PDA (returns rent — session must be closed first)
await client.vault.closeSessionPda(vaultPda, sessionPda);

// 3. Close epoch pages (optional — returns rent per page)
for (let i = 0; i <= session.totalEpochs; i++) {
  await client.vault.closeEpochPage(sessionPda, i);
}

// 4. Close vault (returns vault rent)
await client.vault.closeVault();
```

**Important:** Closing the session PDA does NOT delete the TX log inscriptions —
they are permanent. You only lose the on-chain index (sequence counter, merkle root, etc).

### 4h. Nonce Rotation

Rotating the vault nonce changes the PBKDF2 salt for future key derivation.
Old inscriptions remain decryptable using the old nonce (stored in the rotation event).

```typescript
const newNonce = Array.from(crypto.randomBytes(32));
const tx = await client.vault.rotateNonce(newNonce);
```

**Event emitted:**

```
VaultNonceRotatedEvent {
  vault, wallet,
  oldNonce: [u8; 32],    // save this to decrypt old data
  newNonce: [u8; 32],
  nonceVersion: 3,        // incremented
  timestamp
}
```

**Decryption strategy:** Store the nonce version alongside each inscription.
When decrypting, check `MemoryInscribedEvent.nonceVersion` to determine which
nonce (and therefore which derived key) to use.

### 4i. Delegate Hot-Wallet Access

Allow a hot wallet to inscribe on your behalf without exposing the owner key.

```typescript
// Permission bitmask
const PERMISSION_INSCRIBE      = 1;  // bit 0
const PERMISSION_CLOSE_SESSION = 2;  // bit 1
const PERMISSION_OPEN_SESSION  = 4;  // bit 2
const ALL_PERMISSIONS          = 7;  // all bits

// Add delegate with inscribe-only permission, expires in 30 days
const expiresAt = Math.floor(Date.now() / 1000) + 30 * 86400;
await client.vault.addDelegate(hotWalletPubkey, PERMISSION_INSCRIBE, expiresAt);

// Add delegate with all permissions, never expires
await client.vault.addDelegate(hotWalletPubkey, ALL_PERMISSIONS, 0);

// Revoke delegate
await client.vault.revokeDelegate(hotWalletPubkey);
```

### 4j. Delegated Inscription

The delegate wallet signs the TX instead of the owner.

```typescript
// Hot wallet inscribes on behalf of the owner
await client.vault.inscribeDelegated(hotWalletPubkey, {
  sequence,
  encryptedData,
  nonce: Array.from(iv),
  contentHash,
  totalFragments: 1,
  fragmentIndex: 0,
  compression: 0,
  epochIndex,
});
```

**Auth chain:**
```
hotWallet (Signer)
  → VaultDelegate PDA → has_one = vault, permissions check, expiry check
    → MemoryVault PDA → has_one = agent
      → AgentAccount PDA
```

### 4k. Fetch Vault Data

```typescript
// Fetch vault
const vault = await client.vault.fetchVault(agentPda);
// vault.totalSessions, vault.totalInscriptions, vault.totalBytesInscribed, vault.nonceVersion

// Fetch vault (returns null if not found)
const vaultOrNull = await client.vault.fetchVaultNullable(agentPda);

// Fetch session by vault + hash
const session = await client.vault.fetchSession(vaultPda, sessionHash);
// session.sequenceCounter, session.merkleRoot, session.isClosed, session.currentEpoch

// Fetch session by PDA directly
const session2 = await client.vault.fetchSessionByPda(sessionPda);

// Fetch epoch page
const epoch = await client.vault.fetchEpochPage(sessionPda, 0);
// epoch.inscriptionCount, epoch.totalBytes, epoch.firstTs, epoch.lastTs

// Fetch delegate
const delegate = await client.vault.fetchDelegate(vaultPda, hotWalletPubkey);
// delegate.permissions, delegate.expiresAt
```

---

## 5. Memory Ledger

The **recommended** memory system. Combines a 4KB on-chain ring buffer (fast reads)
with permanent TX log entries and sealable archive pages.

```
                    ┌──────────────────────────────────┐
                    │         MemoryLedger PDA          │
                    │                                   │
                    │  ring: [4096 bytes]                │
write_ledger() ──→  │   ├─ [len][data][len][data]...    │
                    │   └─ auto-evicts oldest on full    │
                    │                                   │
                    │  merkle_root: sha256(prev||hash)   │
                    │  num_entries: 1247                 │
                    │  num_pages: 3                      │
                    └───────────┬───────────────────────┘
                                │
                    seal_ledger()│
                                ▼
              ┌──────────────────────────────────┐
              │         LedgerPage PDA            │
              │  (WRITE-ONCE, NEVER-DELETE)        │
              │                                   │
              │  data: [frozen ring buffer copy]   │
              │  merkle_root_at_seal: [u8; 32]    │
              │  entries_in_page: 412              │
              │  sealed_at: 1711972800             │
              └──────────────────────────────────┘
```

### 5a. Init Ledger

Creates the `MemoryLedger` PDA with a 4KB ring buffer.

```typescript
const [sessionPda] = deriveSession(vaultPda, sessionHash);
const tx = await client.ledger.init(sessionPda);
console.log("Ledger initialized:", tx);
```

**Cost:** ~0.032 SOL (rent for 4KB ring buffer PDA, reclaimable on close)

**PDA:** `["sap_ledger", session_pda]`

### 5b. Write to Ledger

Writes data to both the ring buffer (hot) AND the TX log (permanent) simultaneously.

```typescript
import { sha256, hashToArray } from "@oobe-protocol-labs/synapse-sap-sdk";

const data = Buffer.from(JSON.stringify({
  role: "user",
  content: "Swap 10 SOL to USDC",
  timestamp: Date.now(),
}));

const contentHash = hashToArray(sha256(data));
const tx = await client.ledger.write(sessionPda, data, contentHash);
console.log("Written entry", tx);
```

**Validation rules:**
- `data.length > 0`
- `data.length <= 750` bytes
- `contentHash != [0; 32]`
- Session must not be closed

**What happens on-chain:**
1. Data appended to ring buffer: `[u16 LE data_len][data bytes]`
2. If ring buffer is full → oldest entries evicted (they remain in TX logs)
3. `ledger.numEntries++`
4. `ledger.totalDataSize += data.length`
5. `ledger.merkleRoot = sha256(prevRoot || contentHash)`
6. `ledger.latestHash = contentHash`
7. Emits `LedgerEntryEvent` with full data payload

**Cost:** TX fee only (~0.000005 SOL). Zero rent.

### 5c. Ring Buffer Mechanics

The ring buffer is a 4096-byte circular array stored on-chain in the `MemoryLedger` PDA.

**Format:**
```
[u16 LE length][data bytes][u16 LE length][data bytes]...
```

**Behavior:**
- New entries are appended at the end
- When the buffer is full, oldest entries at the beginning are evicted
- Evicted entries are NOT lost — they remain permanently in the TX log (`LedgerEntryEvent`)
- The ring always contains the most recent entries that fit in 4KB
- No gaps — contiguous byte stream

**Capacity examples:**

| Entry Size | Entries in 4KB | Notes |
|-----------|---------------|-------|
| 50 bytes | ~78 entries | Small chat messages |
| 100 bytes | ~39 entries | Typical messages |
| 200 bytes | ~19 entries | Large messages |
| 500 bytes | ~8 entries | Tool call results |
| 750 bytes | ~5 entries | Maximum size entries |

Each entry costs 2 bytes overhead (the u16 LE length prefix).

### 5d. Seal Ledger

Freezes the current ring buffer into a permanent, immutable `LedgerPage` PDA.
After sealing, the ring buffer is cleared for reuse.

```typescript
const tx = await client.ledger.seal(sessionPda);
console.log("Ledger sealed into page:", tx);
```

**What happens:**
1. Creates `LedgerPage` PDA with `pageIndex = ledger.numPages`
2. Copies the entire ring buffer into the page's `data` field
3. Snapshots `merkleRootAtSeal` from current merkle root
4. Records `entriesInPage` and `dataSize`
5. Clears the ring buffer (resets to empty)
6. Increments `ledger.numPages`
7. Emits `LedgerSealedEvent`

**Important:** `LedgerPage` PDAs are **WRITE-ONCE, NEVER-DELETE**. No close instruction
exists. The program owns the PDA with no deletion mechanism. This is by design —
sealed pages are permanent, immutable records.

**Cost:** ~0.031 SOL per page (permanent, non-recoverable)

### 5e. Read Ring Buffer (Hot Path)

The ring buffer is readable via a single `getAccountInfo()` RPC call — the fastest
possible read path on Solana.

```typescript
// Fetch the ledger account
const ledger = await client.ledger.fetchLedger(sessionPda);

// Decode the ring buffer into individual entries
const entries = client.ledger.decodeRingBuffer(ledger.ring);

for (const entry of entries) {
  const text = new TextDecoder().decode(entry);
  console.log("Entry:", text);
}

// entries = Uint8Array[] — each entry is a raw data blob
// Order: oldest → newest (most recent is last)
```

**`decodeRingBuffer()` implementation:**

```typescript
decodeRingBuffer(ring: number[] | Uint8Array): Uint8Array[] {
  const buf = ring instanceof Uint8Array ? ring : new Uint8Array(ring);
  const entries: Uint8Array[] = [];
  let offset = 0;

  while (offset + 2 <= buf.length) {
    const len = buf[offset] | (buf[offset + 1] << 8); // u16 LE
    if (len === 0) break;                               // end of data
    offset += 2;
    if (offset + len > buf.length) break;               // safety check
    entries.push(buf.slice(offset, offset + len));
    offset += len;
  }

  return entries;
}
```

### 5f. Read Sealed Pages (Cold Path)

Sealed pages contain frozen ring buffer snapshots. Decode them the same way.

```typescript
// Fetch a specific sealed page
const page = await client.ledger.fetchPage(ledgerPda, 0);
// page.data, page.entriesInPage, page.merkleRootAtSeal, page.sealedAt

// Decode the page's data
const entries = client.ledger.decodeRingBuffer(page.data);

// Read ALL pages
const allEntries: Uint8Array[] = [];
for (let i = 0; i < ledger.numPages; i++) {
  const pg = await client.ledger.fetchPage(ledgerPda, i);
  const pgEntries = client.ledger.decodeRingBuffer(pg.data);
  allEntries.push(...pgEntries);
}

// Add current ring buffer entries
const currentEntries = client.ledger.decodeRingBuffer(ledger.ring);
allEntries.push(...currentEntries);

// allEntries now contains the COMPLETE history:
// [page 0 entries] + [page 1 entries] + ... + [current ring buffer]
```

### 5g. Close Ledger

Closes the `MemoryLedger` PDA and returns the ~0.032 SOL rent.
TX log entries and sealed pages remain permanent.

```typescript
await client.ledger.close(sessionPda);
```

### 5h. Merkle Proof Verification

Both Vault and Ledger maintain a rolling merkle root:

```
merkle_root = sha256(prev_merkle_root || content_hash)
```

**Verification from sealed pages:**

```typescript
import { sha256 } from "@oobe-protocol-labs/synapse-sap-sdk";

// Replay merkle chain from TX log events
let computedRoot = new Uint8Array(32); // start with zeros

for (const event of ledgerEntryEvents) {
  const prev = Buffer.from(computedRoot);
  const hash = Buffer.from(event.data.contentHash);
  computedRoot = Buffer.from(sha256(Buffer.concat([prev, hash])), "hex");
}

// Compare with on-chain root
const onchainRoot = Buffer.from(ledger.merkleRoot).toString("hex");
const verified = Buffer.from(computedRoot).toString("hex") === onchainRoot;
console.log("Merkle chain verified:", verified);
```

**Verification from sealed page:**

```typescript
const page = await client.ledger.fetchPage(ledgerPda, pageIndex);
const pageRootHex = Buffer.from(page.merkleRootAtSeal).toString("hex");
// This root was snapshot when the page was sealed — immutable proof of state at seal time
```

---

## 6. Memory Buffer — Legacy

> **Feature gate:** `legacy-memory` — not available in default builds.

On-chain storage using Anchor's `realloc` for dynamic growth.

```typescript
// Create buffer page
const pageIndex = 0;
await client.buffer.create(sessionPda, pageIndex);

// Append data (grows PDA via realloc, costs dynamic rent)
const data = Buffer.from("Hello, world!");
await client.buffer.append(sessionPda, pageIndex, data);

// Close buffer (returns all accumulated rent)
await client.buffer.close(sessionPda, pageIndex);
```

**Limits:**
- Max per append: 750 bytes
- Max total per page: 10,000 bytes
- Header overhead: 101 bytes

**Cost model:** Pay rent for every byte stored. At 10,000 bytes: ~0.008 SOL.

**Reading:** Direct `getAccountInfo()` — data is in the `data` field of the PDA.

---

## 7. Memory Digest — Legacy

> **Feature gate:** `legacy-memory` — not available in default builds.

Proof-of-memory: only hashes are stored on-chain. Actual data lives off-chain
(IPFS, Arweave, Shadow Drive, HTTP/S, Filecoin).

```typescript
// Init digest
await client.digest.init(sessionPda);

// Post hash-only proof (data stored off-chain)
const contentHash = hashToArray(sha256(offchainData));
const dataSize = offchainData.length;
await client.digest.post(sessionPda, contentHash, dataSize);

// OR inscribe data on-chain too (same as Vault but without encryption)
await client.digest.inscribe(sessionPda, data, contentHash);

// Update off-chain storage reference
const ipfsCid = hashToArray(sha256("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oc..."));
const STORAGE_IPFS = 1;
await client.digest.updateStorage(sessionPda, ipfsCid, STORAGE_IPFS);

// Close digest
await client.digest.close(sessionPda);
```

**Storage types:**

| Value | Type | Description |
|-------|------|-------------|
| 0 | None | No off-chain storage (hash only) |
| 1 | IPFS | IPFS CID |
| 2 | Arweave | Arweave transaction ID |
| 3 | Shadow Drive | GenesysGo Shadow Drive reference |
| 4 | HTTP/S | URL hash |
| 5 | Filecoin | Filecoin deal CID |

---

## 8. Encryption Model

The Memory Vault uses **AES-256-GCM** for authenticated encryption.

```
┌────────────────────────────────────────────────────┐
│                Encryption Pipeline                  │
│                                                     │
│  userSecret ──┐                                     │
│               ├──→ PBKDF2(secret, salt, 100k, 32B, SHA-512)
│  vault_nonce ─┘        │                            │
│  (public salt)         ▼                            │
│                   AES-256 Key                       │
│                        │                            │
│  plaintext ──→ AES-256-GCM(key, iv) ──→ ciphertext │
│  iv (12B) ──→         │              ──→ authTag(16B)│
│                        ▼                            │
│              encryptedData = ciphertext || authTag    │
│              contentHash = SHA-256(encryptedData)     │
│                                                     │
│  On-chain: encryptedData, nonce(iv), contentHash,   │
│            vault_nonce(salt), nonce_version          │
│  Secret: NEVER touches the chain                    │
└────────────────────────────────────────────────────┘
```

**Decryption:**

```typescript
function decrypt(
  encryptedData: Buffer,
  iv: Buffer,           // 12 bytes from MemoryInscribedEvent.nonce
  vaultNonce: Buffer,   // 32 bytes from vault (or VaultNonceRotatedEvent for old versions)
  userSecret: string,
  nonceVersion: number, // from MemoryInscribedEvent.nonceVersion
): Buffer {
  // Derive key
  const key = crypto.pbkdf2Sync(userSecret, vaultNonce, 100_000, 32, "sha512");

  // Split ciphertext and auth tag
  const ciphertext = encryptedData.slice(0, -16);
  const authTag = encryptedData.slice(-16);

  // Decrypt
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

**Nonce rotation history:**

When the vault nonce is rotated, the old nonce is emitted in `VaultNonceRotatedEvent`.
To decrypt old inscriptions:
1. Check `MemoryInscribedEvent.nonceVersion`
2. Fetch the corresponding nonce from the rotation event history
3. Derive the key with the correct nonce

---

## 9. Merkle Accumulator

Both Vault (SessionLedger) and Ledger (MemoryLedger) maintain a rolling merkle root.

**Formula:**
```
root_0 = [0u8; 32]                          // initial (all zeros)
root_n = SHA-256(root_{n-1} || content_hash_n)  // each write
```

**Properties:**
- Append-only — new entries can only extend the chain
- Tamper-evident — changing any historical entry breaks the chain
- Verifiable — replay all content hashes to recompute root, compare with on-chain value
- Snapshot-able — sealed pages preserve `merkleRootAtSeal` for point-in-time verification

**Stored in:**
- `SessionLedger.merkleRoot` — vault inscription chain
- `MemoryLedger.merkleRoot` — ledger write chain
- `LedgerPage.merkleRootAtSeal` — frozen at seal time

---

## 10. Events — Complete Reference

### Vault Events (8)

| Event | Fields | When |
|-------|--------|------|
| `VaultInitializedEvent` | `agent`, `vault`, `wallet`, `timestamp` | `initVault()` |
| `SessionOpenedEvent` | `vault`, `session`, `sessionHash`, `timestamp` | `openSession()` |
| `MemoryInscribedEvent` | `vault`, `session`, `sequence`, `epochIndex`, `encryptedData`, `nonce`, `contentHash`, `totalFragments`, `fragmentIndex`, `compression`, `dataLen`, `nonceVersion`, `timestamp` | `inscribeMemory()` |
| `EpochOpenedEvent` | `session`, `epochPage`, `epochIndex`, `startSequence`, `timestamp` | Auto on first inscription of new epoch |
| `SessionClosedEvent` | `vault`, `session`, `totalInscriptions`, `totalBytes`, `totalEpochs`, `timestamp` | `closeSession()` |
| `VaultClosedEvent` | `vault`, `agent`, `wallet`, `totalSessions`, `totalInscriptions`, `timestamp` | `closeVault()` |
| `SessionPdaClosedEvent` | `vault`, `session`, `totalInscriptions`, `totalBytes`, `timestamp` | `closeSessionPda()` |
| `EpochPageClosedEvent` | `session`, `epochPage`, `epochIndex`, `timestamp` | `closeEpochPage()` |

### Vault Security Events (3)

| Event | Fields | When |
|-------|--------|------|
| `VaultNonceRotatedEvent` | `vault`, `wallet`, `oldNonce`, `newNonce`, `nonceVersion`, `timestamp` | `rotateVaultNonce()` |
| `DelegateAddedEvent` | `vault`, `delegate`, `permissions`, `expiresAt`, `timestamp` | `addVaultDelegate()` |
| `DelegateRevokedEvent` | `vault`, `delegate`, `timestamp` | `revokeVaultDelegate()` |

### Ledger Events (2)

| Event | Fields | When |
|-------|--------|------|
| `LedgerEntryEvent` | `session`, `ledger`, `entryIndex`, `data`, `contentHash`, `dataLen`, `merkleRoot`, `timestamp` | `writeLedger()` |
| `LedgerSealedEvent` | `session`, `ledger`, `page`, `pageIndex`, `entriesInPage`, `dataSize`, `merkleRootAtSeal`, `timestamp` | `sealLedger()` |

### Checkpoint Events (1)

| Event | Fields | When |
|-------|--------|------|
| `CheckpointCreatedEvent` | `session`, `checkpoint`, `checkpointIndex`, `merkleRoot`, `sequenceAt`, `epochAt`, `timestamp` | `createCheckpoint()` |

### Buffer Events — Legacy (2)

| Event | Fields | When |
|-------|--------|------|
| `BufferCreatedEvent` | `session`, `buffer`, `authority`, `pageIndex`, `timestamp` | `createBuffer()` |
| `BufferAppendedEvent` | `session`, `buffer`, `pageIndex`, `chunkSize`, `totalSize`, `numEntries`, `timestamp` | `appendBuffer()` |

### Digest Events — Legacy (3)

| Event | Fields | When |
|-------|--------|------|
| `DigestPostedEvent` | `session`, `digest`, `contentHash`, `dataSize`, `entryIndex`, `merkleRoot`, `timestamp` | `postDigest()` |
| `DigestInscribedEvent` | `session`, `digest`, `entryIndex`, `data`, `contentHash`, `dataLen`, `merkleRoot`, `timestamp` | `inscribeToDigest()` |
| `StorageRefUpdatedEvent` | `session`, `digest`, `storageRef`, `storageType`, `timestamp` | `updateDigestStorage()` |

---

## 11. Fetching Events from Transactions

### Method 1 — Parse from a known TX

```typescript
import { EventParser } from "@oobe-protocol-labs/synapse-sap-sdk";

const parser = new EventParser(client.program);
// Or use the client's built-in parser:
// const parser = client.events;

// Parse a specific transaction
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,
});

const events = parser.parseLogs(tx.meta.logMessages);
for (const event of events) {
  console.log(event.name, event.data);
}

// Filter to specific event type
const inscriptions = parser.filterByName(events, "MemoryInscribedEvent");
const ledgerEntries = parser.filterByName(events, "LedgerEntryEvent");
```

### Method 2 — Scan all TXs for a PDA

```typescript
// Scan all inscriptions for a session
const sigs = await connection.getSignaturesForAddress(sessionPda, {
  limit: 1000,
});

const allInscriptions = [];
for (const sigInfo of sigs) {
  const tx = await connection.getTransaction(sigInfo.signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta?.logMessages) continue;

  const events = parser.parseLogs(tx.meta.logMessages);
  allInscriptions.push(...parser.filterByName(events, "MemoryInscribedEvent"));
}

console.log(`Found ${allInscriptions.length} inscriptions`);
```

### Method 3 — Scan by epoch (efficient range query)

```typescript
// Fetch only epoch 2's inscriptions (sequences 2000–2999)
const [epochPda] = deriveEpochPage(sessionPda, 2);
const sigs = await connection.getSignaturesForAddress(epochPda);

// Parse each TX's events
for (const sigInfo of sigs) {
  const tx = await connection.getTransaction(sigInfo.signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta?.logMessages) continue;

  const events = parser.parseLogs(tx.meta.logMessages);
  // Process inscriptions from this epoch only
}
```

### Method 4 — Real-time WebSocket

```typescript
const subId = connection.onLogs(
  client.program.programId,
  (logInfo) => {
    const events = parser.parseLogs(logInfo.logs);
    for (const e of events) {
      if (e.name === "MemoryInscribedEvent") {
        console.log(`New inscription: seq=${e.data.sequence}, ${e.data.dataLen} bytes`);
      }
      if (e.name === "LedgerEntryEvent") {
        console.log(`New ledger entry: idx=${e.data.entryIndex}, ${e.data.dataLen} bytes`);
      }
    }
  },
  "confirmed"
);
```

### Method 5 — Yellowstone gRPC (recommended for production)

```typescript
import { GeyserEventStream, EventParser } from "@oobe-protocol-labs/synapse-sap-sdk";

const stream = new GeyserEventStream({
  endpoint: "https://us-1-mainnet.oobeprotocol.ai",
  token:    process.env.OOBE_API_KEY!,
});

const parser = new EventParser(program);

stream.on("logs", (logs, signature, slot) => {
  const events = parser.parseLogs(logs);
  for (const e of events) {
    switch (e.name) {
      case "MemoryInscribedEvent":
        handleInscription(e.data, signature, slot);
        break;
      case "LedgerEntryEvent":
        handleLedgerWrite(e.data, signature, slot);
        break;
      case "LedgerSealedEvent":
        handlePageSealed(e.data, signature, slot);
        break;
    }
  }
});

await stream.connect();
```

---

## 12. Reconstructing Data from TX Logs

Data inscribed via Vault or Ledger lives permanently in transaction logs.
Here's how to reconstruct the full conversation history.

### Vault: Reconstruct encrypted conversation

```typescript
async function reconstructVaultSession(
  connection: Connection,
  sessionPda: PublicKey,
  userSecret: string,
  vaultNonce: Buffer,
): Promise<{ sequence: number; plaintext: string; timestamp: number }[]> {
  const parser = new EventParser(program);
  const results: { sequence: number; plaintext: string; timestamp: number }[] = [];

  // 1. Fetch all TX signatures for this session
  const sigs = await connection.getSignaturesForAddress(sessionPda, { limit: 1000 });

  // 2. Parse each TX for MemoryInscribedEvent
  const allEvents: any[] = [];
  for (const sigInfo of sigs) {
    const tx = await connection.getTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) continue;
    const events = parser.parseLogs(tx.meta.logMessages);
    allEvents.push(...parser.filterByName(events, "MemoryInscribedEvent"));
  }

  // 3. Reassemble fragments (group by sequence)
  const bySequence = new Map<number, any[]>();
  for (const e of allEvents) {
    const seq = e.data.sequence;
    if (!bySequence.has(seq)) bySequence.set(seq, []);
    bySequence.get(seq)!.push(e.data);
  }

  // 4. Decrypt each sequence
  for (const [seq, fragments] of [...bySequence.entries()].sort((a, b) => a[0] - b[0])) {
    fragments.sort((a, b) => a.fragmentIndex - b.fragmentIndex);

    // Concatenate fragments
    const encrypted = Buffer.concat(
      fragments.map(f => Buffer.from(f.encryptedData))
    );

    // Get the IV from the first fragment
    const iv = Buffer.from(fragments[0].nonce);

    // Derive key using the correct nonce version
    const key = crypto.pbkdf2Sync(userSecret, vaultNonce, 100_000, 32, "sha512");

    // Decrypt
    const ciphertext = encrypted.slice(0, -16);
    const authTag = encrypted.slice(-16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    results.push({
      sequence: seq,
      plaintext: plaintext.toString("utf-8"),
      timestamp: fragments[0].timestamp.toNumber(),
    });
  }

  return results;
}
```

### Ledger: Reconstruct full history

```typescript
async function reconstructLedgerHistory(
  client: SapClient,
  sessionPda: PublicKey,
): Promise<{ index: number; data: string; timestamp: number }[]> {
  const ledger = await client.ledger.fetchLedger(sessionPda);
  const [ledgerPda] = client.ledger.deriveLedger(sessionPda);
  const results: { index: number; data: string; timestamp: number }[] = [];

  // 1. Read ALL sealed pages (cold archive)
  for (let i = 0; i < ledger.numPages; i++) {
    const page = await client.ledger.fetchPage(ledgerPda, i);
    const entries = client.ledger.decodeRingBuffer(page.data);
    for (const entry of entries) {
      results.push({
        index: results.length,
        data: new TextDecoder().decode(entry),
        timestamp: page.sealedAt.toNumber(),
      });
    }
  }

  // 2. Read current ring buffer (hot)
  const currentEntries = client.ledger.decodeRingBuffer(ledger.ring);
  for (const entry of currentEntries) {
    results.push({
      index: results.length,
      data: new TextDecoder().decode(entry),
      timestamp: ledger.updatedAt.toNumber(),
    });
  }

  return results;
}
```

### Ledger: Reconstruct from TX logs (when ring buffer has evicted old entries)

```typescript
async function reconstructFromTxLogs(
  connection: Connection,
  sessionPda: PublicKey,
): Promise<{ entryIndex: number; data: Buffer; merkleRoot: Buffer }[]> {
  const parser = new EventParser(program);
  const [ledgerPda] = deriveLedger(sessionPda);

  // Scan all TXs for the ledger PDA
  const sigs = await connection.getSignaturesForAddress(ledgerPda, { limit: 10000 });
  const results: { entryIndex: number; data: Buffer; merkleRoot: Buffer }[] = [];

  for (const sigInfo of sigs.reverse()) { // oldest first
    const tx = await connection.getTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) continue;

    const events = parser.parseLogs(tx.meta.logMessages);
    for (const e of parser.filterByName(events, "LedgerEntryEvent")) {
      results.push({
        entryIndex: e.data.entryIndex,
        data: Buffer.from(e.data.data),
        merkleRoot: Buffer.from(e.data.merkleRoot),
      });
    }
  }

  return results;
}
```

---

## 13. Data Chunking — Large Payload Patterns

### Pattern 1: Vault Multi-Fragment (recommended for encrypted data)

```typescript
const MAX_FRAGMENT = 750;

async function inscribeLargePayload(
  client: SapClient,
  sessionPda: PublicKey,
  vaultPda: PublicKey,
  encryptedPayload: Buffer,
  iv: Buffer,
  sequence: number,
): Promise<string[]> {
  const contentHash = hashToArray(sha256(encryptedPayload));
  const epochIndex = Math.floor(sequence / 1000);
  const txSigs: string[] = [];

  // Split into 750-byte fragments
  const numFragments = Math.ceil(encryptedPayload.length / MAX_FRAGMENT);

  for (let i = 0; i < numFragments; i++) {
    const start = i * MAX_FRAGMENT;
    const end = Math.min(start + MAX_FRAGMENT, encryptedPayload.length);
    const fragment = encryptedPayload.slice(start, end);

    const sig = await client.vault.inscribe({
      sequence,                 // SAME for all fragments
      encryptedData: fragment,
      nonce: Array.from(iv),
      contentHash,              // SAME for all fragments
      totalFragments: numFragments,
      fragmentIndex: i,
      compression: 0,
      epochIndex,
    });
    txSigs.push(sig);
  }

  return txSigs;
}
```

### Pattern 2: Ledger Multi-Write (for unencrypted data > 750B)

```typescript
async function writeLargeToLedger(
  client: SapClient,
  sessionPda: PublicKey,
  payload: Buffer,
): Promise<string[]> {
  const MAX_WRITE = 750;
  const txSigs: string[] = [];

  // Option A: Split into separate ledger entries
  for (let i = 0; i < payload.length; i += MAX_WRITE) {
    const chunk = payload.slice(i, i + MAX_WRITE);
    const contentHash = hashToArray(sha256(chunk));
    const sig = await client.ledger.write(sessionPda, chunk, contentHash);
    txSigs.push(sig);
  }

  return txSigs;
}
```

### Pattern 3: Compressed + Chunked (maximum efficiency)

```typescript
import { deflateSync, inflateSync } from "zlib";

async function inscribeCompressed(
  client: SapClient,
  sessionPda: PublicKey,
  vaultPda: PublicKey,
  plaintext: Buffer,
  key: Buffer,
  sequence: number,
): Promise<void> {
  // 1. Compress
  const compressed = deflateSync(plaintext);

  // 2. Encrypt the compressed data
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(compressed),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // 3. Fragment if needed
  const contentHash = hashToArray(sha256(encrypted));
  const epochIndex = Math.floor(sequence / 1000);
  const numFragments = Math.ceil(encrypted.length / 750);

  for (let i = 0; i < numFragments; i++) {
    const frag = encrypted.slice(i * 750, (i + 1) * 750);
    await client.vault.inscribe({
      sequence,
      encryptedData: frag,
      nonce: Array.from(iv),
      contentHash,
      totalFragments: numFragments,
      fragmentIndex: i,
      compression: 1,  // 1 = deflate
      epochIndex,
    });
  }
}

// Reader side: reassemble → decrypt → decompress
function decryptAndDecompress(encrypted: Buffer, iv: Buffer, key: Buffer): Buffer {
  const ciphertext = encrypted.slice(0, -16);
  const authTag = encrypted.slice(-16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return inflateSync(compressed);
}
```

**Compression codecs:**

| Value | Codec | Use Case |
|-------|-------|----------|
| 0 | None | Default — no compression |
| 1 | Deflate | Good all-around |
| 2 | Gzip | Deflate + headers |
| 3 | Brotli | Best ratio, slower |

---

## 14. Compression

The `compression` field in `inscribeMemory()` tells readers how to decompress
after decryption. It's **metadata only** — the program doesn't compress for you.

```
Pipeline: plaintext → compress → encrypt → fragment → inscribe
Reader:   reassemble → decrypt → decompress → plaintext
```

**Typical compression ratios (JSON chat messages):**

| Original | Deflated | Ratio |
|----------|----------|-------|
| 200B | ~120B | 40% reduction |
| 500B | ~280B | 44% reduction |
| 750B | ~400B | 47% reduction |
| 2KB | ~900B | 55% reduction (fits in 2 fragments instead of 3) |

---

## 15. Cost Analysis

### Per-Write Costs

| System | Init Cost (SOL) | Per-Write Cost | Notes |
|--------|----------------|---------------|-------|
| **Vault** (inscribe) | 0.002 | ~0.000005 (TX fee) | Zero rent — data in TX logs |
| **Vault** (epoch page) | — | ~0.001 (auto-created per 1000 writes) | Reclaimable |
| **Ledger** (write) | 0.032 | ~0.000005 (TX fee) | Zero rent — data in ring + TX logs |
| **Ledger** (seal) | — | ~0.031 (permanent page) | Non-recoverable (immutable) |
| **Buffer** (append) | 0.001 | Dynamic (rent per byte) | Reclaimable |
| **Digest** (post) | 0.002 | ~0.000005 (TX fee) | Zero rent — hash only |

### Volume Cost Comparison

| Writes | Vault | Ledger (no seal) | Ledger (seal every 100) | Buffer |
|--------|-------|-----------------|------------------------|--------|
| 100 | 0.0025 | 0.0325 | 0.063 | 0.009 |
| 1,000 | 0.008 | 0.037 | 0.342 | 0.021+ |
| 10,000 | 0.055 | 0.082 | 3.15 | 0.073+ |
| 100,000 | 0.505 | 0.532 | 31.03 | N/A (10K page limit) |

**Key insight:** Vault is cheapest for write-heavy workloads. Ledger costs more but provides
instant reads via `getAccountInfo()`. Seal pages only when you need permanent + on-chain readable archives.

---

## 16. Production Patterns

### Pattern: Agent Conversation Memory

```typescript
// Merchant side: store each conversation turn
async function storeConversationTurn(
  client: SapClient,
  sessionPda: PublicKey,
  role: "user" | "assistant",
  content: string,
) {
  const data = Buffer.from(JSON.stringify({ role, content, ts: Date.now() }));
  const contentHash = hashToArray(sha256(data));
  await client.ledger.write(sessionPda, data, contentHash);
}

// Consumer side: read last N turns
async function getRecentTurns(client: SapClient, sessionPda: PublicKey): Promise<any[]> {
  const ledger = await client.ledger.fetchLedger(sessionPda);
  const entries = client.ledger.decodeRingBuffer(ledger.ring);
  return entries.map(e => JSON.parse(new TextDecoder().decode(e)));
}
```

### Pattern: Encrypted Session + Readable Index

```typescript
// Use BOTH vault (encrypted full data) and ledger (readable summary)
async function storeWithIndex(
  client: SapClient,
  sessionPda: PublicKey,
  vaultPda: PublicKey,
  message: { role: string; content: string },
  encryptionKey: Buffer,
) {
  // 1. Write full encrypted message to vault
  const fullData = JSON.stringify(message);
  const encrypted = encryptAES256GCM(fullData, encryptionKey);
  await client.vault.inscribe({
    sequence: session.sequenceCounter,
    encryptedData: encrypted.ciphertext,
    nonce: Array.from(encrypted.iv),
    contentHash: hashToArray(sha256(encrypted.ciphertext)),
    totalFragments: 1,
    fragmentIndex: 0,
    compression: 0,
    epochIndex: Math.floor(session.sequenceCounter / 1000),
  });

  // 2. Write readable summary to ledger (for fast queries)
  const summary = Buffer.from(JSON.stringify({
    role: message.role,
    preview: message.content.slice(0, 100),
    seq: session.sequenceCounter,
    ts: Date.now(),
  }));
  await client.ledger.write(sessionPda, summary, hashToArray(sha256(summary)));
}
```

### Pattern: Auto-Seal on Threshold

```typescript
async function writeAndMaybeSeal(
  client: SapClient,
  sessionPda: PublicKey,
  data: Buffer,
) {
  const contentHash = hashToArray(sha256(data));
  await client.ledger.write(sessionPda, data, contentHash);

  // Seal every 100 entries to create permanent checkpoints
  const ledger = await client.ledger.fetchLedger(sessionPda);
  if (ledger.numEntries % 100 === 0 && ledger.numEntries > 0) {
    await client.ledger.seal(sessionPda);
    console.log(`Sealed page ${ledger.numPages}`);
  }
}
```

### Pattern: Full History Retrieval with Verification

```typescript
async function getVerifiedHistory(
  client: SapClient,
  connection: Connection,
  sessionPda: PublicKey,
): Promise<{ entries: string[]; verified: boolean }> {
  const ledger = await client.ledger.fetchLedger(sessionPda);
  const [ledgerPda] = client.ledger.deriveLedger(sessionPda);

  // 1. Collect all entries from sealed pages + ring buffer
  const allEntries: string[] = [];
  for (let i = 0; i < ledger.numPages; i++) {
    const page = await client.ledger.fetchPage(ledgerPda, i);
    const entries = client.ledger.decodeRingBuffer(page.data);
    allEntries.push(...entries.map(e => new TextDecoder().decode(e)));
  }
  const currentEntries = client.ledger.decodeRingBuffer(ledger.ring);
  allEntries.push(...currentEntries.map(e => new TextDecoder().decode(e)));

  // 2. Verify merkle chain from TX logs
  const sigs = await connection.getSignaturesForAddress(ledgerPda, { limit: 10000 });
  const parser = client.events;
  let computedRoot = Buffer.alloc(32);

  for (const sigInfo of sigs.reverse()) {
    const tx = await connection.getTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) continue;
    const events = parser.parseLogs(tx.meta.logMessages);
    for (const e of parser.filterByName(events, "LedgerEntryEvent")) {
      const prevBuf = Buffer.from(computedRoot);
      const hashBuf = Buffer.from(e.data.contentHash);
      computedRoot = Buffer.from(sha256(Buffer.concat([prevBuf, hashBuf])), "hex");
    }
  }

  const onchainRoot = Buffer.from(ledger.merkleRoot).toString("hex");
  const verified = computedRoot.toString("hex") === onchainRoot;

  return { entries: allEntries, verified };
}
```

---

## 17. PostgreSQL Sync for Memory Events

The SDK includes `SapSyncEngine` which automatically ingests memory events
into PostgreSQL for SQL-queryable access.

```typescript
import { SapSyncEngine, SapPostgres, SapClient } from "@oobe-protocol-labs/synapse-sap-sdk";
import { Pool } from "pg";

const pool = new Pool({ connectionString: "postgresql://..." });
const sap  = SapClient.from(provider);
const pg   = new SapPostgres(pool, sap);
const sync = new SapSyncEngine(pg, sap);

// Start real-time event streaming (WebSocket)
await sync.startEventStream();

// OR use Yellowstone gRPC (recommended for production)
await sync.startGeyserStream({
  endpoint: "https://us-1-mainnet.oobeprotocol.ai",
  token:    process.env.OOBE_API_KEY!,
});

// Query memory events via SQL
const results = await pool.query(`
  SELECT * FROM sap_events
  WHERE event_name = 'MemoryInscribedEvent'
    AND agent_pda = $1
  ORDER BY created_at DESC
  LIMIT 100
`, [agentPda.toBase58()]);
```

---

## 18. Yellowstone gRPC Streaming

For real-time memory event monitoring in production:

```typescript
import { GeyserEventStream, EventParser } from "@oobe-protocol-labs/synapse-sap-sdk";

const stream = new GeyserEventStream({
  endpoint: "https://us-1-mainnet.oobeprotocol.ai",
  token:    process.env.OOBE_API_KEY!,
});

const parser = new EventParser(program);

stream.on("logs", (logs, signature, slot) => {
  const events = parser.parseLogs(logs);
  for (const e of events) {
    switch (e.name) {
      case "MemoryInscribedEvent":
        console.log(`Vault inscription: seq=${e.data.sequence}, ${e.data.dataLen}B`);
        break;
      case "LedgerEntryEvent":
        console.log(`Ledger write: idx=${e.data.entryIndex}, ${e.data.dataLen}B`);
        break;
      case "LedgerSealedEvent":
        console.log(`Page sealed: page=${e.data.pageIndex}, ${e.data.entriesInPage} entries`);
        break;
      case "VaultNonceRotatedEvent":
        console.log(`Nonce rotated: v${e.data.nonceVersion}`);
        break;
      case "DelegateAddedEvent":
        console.log(`Delegate added: ${e.data.delegate}, perms=${e.data.permissions}`);
        break;
    }
  }
});

await stream.connect();
```

**Using the raw Yellowstone client:**

```typescript
import Client from "@triton-one/yellowstone-grpc";

const client = new Client(
  "https://us-1-mainnet.oobeprotocol.ai",
  process.env.OOBE_API_KEY!   // sent as x-token automatically
);

const stream = await client.subscribe();

stream.on("data", (data) => {
  // Raw Yellowstone data — use EventParser to decode SAP events
  console.log("Received:", data);
});

// Subscribe to all SAP program transactions
await stream.write({
  accounts: {},
  slots: {},
  transactions: {
    sapFilter: {
      accountInclude: ["SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ"],
      accountExclude: [],
      accountRequired: [],
    },
  },
  blocks: {},
  blocksMeta: {},
  entry: {},
  accountsDataSlice: [],
  commitment: 1, // CONFIRMED
});
```

---

## 19. Account Structs — Full Field Reference

### MemoryVault

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | u8 | 1 | PDA bump seed |
| `agent` | Pubkey | 32 | Parent AgentAccount PDA |
| `wallet` | Pubkey | 32 | Owner wallet |
| `vaultNonce` | [u8; 32] | 32 | PBKDF2 salt (public) |
| `totalSessions` | u32 | 4 | Sessions created |
| `totalInscriptions` | u64 | 8 | Lifetime inscription count |
| `totalBytesInscribed` | u64 | 8 | Lifetime bytes written |
| `createdAt` | i64 | 8 | Creation timestamp |
| `protocolVersion` | u8 | 1 | Always 1 |
| `nonceVersion` | u32 | 4 | Nonce rotation counter |
| `lastNonceRotation` | i64 | 8 | Last rotation timestamp |

### SessionLedger

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | u8 | 1 | PDA bump |
| `vault` | Pubkey | 32 | Parent vault |
| `sessionHash` | [u8; 32] | 32 | SHA-256 of session ID |
| `sequenceCounter` | u32 | 4 | Next sequence number |
| `totalBytes` | u64 | 8 | Bytes inscribed |
| `currentEpoch` | u32 | 4 | Current epoch index |
| `totalEpochs` | u32 | 4 | Epochs created |
| `createdAt` | i64 | 8 | Creation timestamp |
| `lastInscribedAt` | i64 | 8 | Last write timestamp |
| `isClosed` | bool | 1 | Session closed flag |
| `merkleRoot` | [u8; 32] | 32 | Rolling hash chain |
| `totalCheckpoints` | u32 | 4 | Checkpoints created |
| `tipHash` | [u8; 32] | 32 | Last content_hash |

### EpochPage

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | u8 | 1 | PDA bump |
| `session` | Pubkey | 32 | Parent session |
| `epochIndex` | u32 | 4 | Epoch number |
| `startSequence` | u32 | 4 | First sequence in epoch |
| `inscriptionCount` | u16 | 2 | Writes in this epoch |
| `totalBytes` | u32 | 4 | Bytes in this epoch |
| `firstTs` | i64 | 8 | First write timestamp |
| `lastTs` | i64 | 8 | Last write timestamp |

### VaultDelegate

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | u8 | 1 | PDA bump |
| `vault` | Pubkey | 32 | Parent vault |
| `delegate` | Pubkey | 32 | Hot wallet pubkey |
| `permissions` | u8 | 1 | Bitmask: 1=inscribe, 2=close, 4=open |
| `expiresAt` | i64 | 8 | 0 = never |
| `createdAt` | i64 | 8 | Creation timestamp |

### MemoryLedger

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | u8 | 1 | PDA bump |
| `session` | Pubkey | 32 | Parent session |
| `authority` | Pubkey | 32 | Write authority |
| `numEntries` | u32 | 4 | Lifetime write count |
| `merkleRoot` | [u8; 32] | 32 | Rolling hash chain |
| `latestHash` | [u8; 32] | 32 | Most recent content_hash |
| `totalDataSize` | u64 | 8 | Cumulative bytes |
| `createdAt` | i64 | 8 | Creation timestamp |
| `updatedAt` | i64 | 8 | Last write timestamp |
| `numPages` | u32 | 4 | Sealed page count |
| `ring` | Vec\<u8\> | 4096 | Ring buffer (RING_CAPACITY) |

### LedgerPage

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | u8 | 1 | PDA bump |
| `ledger` | Pubkey | 32 | Parent ledger |
| `pageIndex` | u32 | 4 | Sequential page number |
| `sealedAt` | i64 | 8 | Seal timestamp |
| `entriesInPage` | u32 | 4 | Entries in page |
| `dataSize` | u32 | 4 | Raw data bytes |
| `merkleRootAtSeal` | [u8; 32] | 32 | Root snapshot at seal |
| `data` | Vec\<u8\> | ≤4096 | Frozen ring buffer copy |

---

## 20. Constants & Limits

```typescript
// Fragment / write limits
const MAX_INSCRIPTION_SIZE = 750;          // Max bytes per vault inscription
const MAX_LEDGER_WRITE_SIZE = 750;         // Max bytes per ledger write
const MAX_BUFFER_WRITE_SIZE = 750;         // Max bytes per buffer append (legacy)
const MAX_BUFFER_TOTAL_SIZE = 10_000;      // Max total bytes per buffer page (legacy)
const MAX_CHUNK_SIZE = 900;                // Max bytes per memory chunk (legacy)

// Epoch & ring
const INSCRIPTIONS_PER_EPOCH = 1000;       // Inscriptions per epoch page
const RING_CAPACITY = 4096;                // Ledger ring buffer size in bytes

// Fragment limits
const MAX_FRAGMENTS = 255;                 // Max fragments per sequence (u8)
const MAX_SEQUENCE = 4_294_967_295;        // Max sequence number (u32)

// Permission bitmask
const PERMISSION_INSCRIBE = 1;
const PERMISSION_CLOSE_SESSION = 2;
const PERMISSION_OPEN_SESSION = 4;
const ALL_PERMISSIONS = 7;

// Digest storage types
const STORAGE_NONE = 0;
const STORAGE_IPFS = 1;
const STORAGE_ARWEAVE = 2;
const STORAGE_SHADOW_DRIVE = 3;
const STORAGE_HTTPS = 4;
const STORAGE_FILECOIN = 5;

// Compression codecs
const COMPRESSION_NONE = 0;
const COMPRESSION_DEFLATE = 1;
const COMPRESSION_GZIP = 2;
const COMPRESSION_BROTLI = 3;
```

---

## 21. Feature Gates

| Feature | Systems Available | Default |
|---------|-------------------|---------|
| **(none)** | Vault, SessionLedger, EpochPage, VaultDelegate, MemoryLedger, LedgerPage, SessionCheckpoint | **Yes** |
| `legacy-memory` | + MemoryBuffer, MemoryDigest, MemoryEntry, MemoryChunk, PluginSlot | No |

To enable legacy systems in the Rust program build:

```toml
[features]
legacy-memory = []
```

The SDK always includes types and PDA derivation for all systems. Only the
on-chain instructions are gated.

---

> **See also:**
> - [merchant.md](./merchant.md) §15 — Memory Vault & Ledger merchant operations
> - [client.md](./client.md) §15 — Ledger read paths for consumers
> - [skills.md](./skills.md) — Full SDK reference
> - [docs/05-memory.md](../docs/05-memory.md) — Memory architecture deep dive
