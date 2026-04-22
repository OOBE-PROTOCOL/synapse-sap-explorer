# SAP v2 Explorer Reference

> Complete protocol reference for building explorers, indexers, and developer tools on top of the Synapse Agent Protocol. Every account type, event, instruction, error code, PDA derivation, and query pattern documented with field-level detail.
>
> **Program**: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
> **SDK**: `@oobe-protocol-labs/synapse-sap-sdk` (v0.4.2+)
> **Network**: Solana mainnet-beta

---

## Table of Contents

1. [Protocol Architecture](#1-protocol-architecture)
2. [Mainnet Addresses](#2-mainnet-addresses)
3. [Account Types (22)](#3-account-types)
4. [Enums](#4-enums)
5. [PDA Derivation (22 seeds)](#5-pda-derivation)
6. [Instructions (72)](#6-instructions)
7. [Events (45)](#7-events)
8. [Error Codes (91)](#8-error-codes)
9. [Protocol Limits](#9-protocol-limits)
10. [SDK Connection](#10-sdk-connection)
11. [Query Patterns](#11-query-patterns)
12. [Transaction Parsing](#12-transaction-parsing)
13. [Event Streaming](#13-event-streaming)
14. [PostgreSQL Indexer](#14-postgresql-indexer)
15. [Explorer Page Map](#15-explorer-page-map)

---

## 1. Protocol Architecture

The Synapse Agent Protocol (SAP v2) manages onchain lifecycle, reputation, discovery, encrypted memory, tool registries, micropayment escrows, and trust attestations for AI agents on Solana.

Every entity is a PDA (Program Derived Address) derived deterministically from known seeds. All reads are free (no TX fee). Only writes require transaction fees.

```
                         GlobalRegistry (singleton)
                                  |
           +----------------------+----------------------+
           |                      |                      |
      AgentAccount          CapabilityIndex         ProtocolIndex
      (per wallet)          (per capability)        (per protocol)
           |
     +-----+------+--------+--------+--------+
     |     |      |        |        |        |
  AgentStats  Feedback  Escrow   Tool    Attestation
  (hot path) (per pair) (per pair) (per tool) (per pair)
     |
  MemoryVault
     |
  SessionLedger ---- VaultDelegate (hot wallets)
     |
  +--+--+--+
  |  |  |  |
  Epoch  Checkpoint  MemoryLedger  LedgerPage
  Page                (ring buf)   (sealed, permanent)
```

---

## 2. Mainnet Addresses

| Resource | Address |
|----------|---------|
| Program ID | `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` |
| GlobalRegistry | `9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5` |
| Upgrade Authority | `GBLQznn1QMnx64zHXcDguP9yNW9ZfYCVdrY8eDovBvPk` |
| IDL Account | `ENs7L1NFuoP7dur8cqGGE6b98CQHfNeDZPWPSjRzhc4f` |
| Program Metadata | `pmetaypqG6SiB47xMigYVMAkuHDWeSDXcv3zzDrJJvA` |

### Tool Category Index Addresses

| Category | u8 | Address |
|----------|-----|---------|
| Swap | 0 | `5H8yn9RuRgZWqkDiWbKNaCHzTMjqSpwbNQKMPLtUXx2G` |
| Lend | 1 | `5Lqqk6VtFWnYq3h4Ae4FuUAKnFzw1Nm1DaSdt2cjcTDj` |
| Stake | 2 | `kC8oAiVUcFMXEnmMNu1h2sdAc3dWKcwV5qVKRFYMmQD` |
| Nft | 3 | `2zNWR9J3znvGQ5J6xDfJyZkd12Gi66mjErRDkgPeKbyF` |
| Payment | 4 | `Eh7MwxJYWRN8bzAmY3ZPTRXYjWpWypokBf1STixu2dy9` |
| Data | 5 | `AwpVxehQUZCVTAJ9icZfS6oRbF66jNo32duXaL11B5df` |
| Governance | 6 | `2573WjZzV9QtbqtM6Z86YGivkk1kdvJa4gK3tZRQ2jkN` |
| Bridge | 7 | `664nyr6kBeeFiE1ij5gtdncNCVHrXqrk2uBhnKmUREvK` |
| Analytics | 8 | `4DFsiTZ6h6RoCZuUeMTpaoQguepnPUMJBLJuwwjKg5GL` |
| Custom | 9 | `3Nk5dvFWEyWPEArdG9cCdab6C6ym36mSWUSB8HzN35ZM` |

---

## 3. Account Types

22 account types. Each section lists every field, its Rust type, and its serialized size. Fields marked `(DEPRECATED)` remain for backward compatibility.

### 3.1 GlobalRegistry

**Seeds**: `["sap_global"]`
**Singleton**: one per network

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump seed |
| total_agents | u64 | Lifetime registered agents |
| active_agents | u64 | Currently active agents |
| total_feedbacks | u64 | Lifetime feedback count |
| total_capabilities | u32 | Unique capabilities indexed |
| total_protocols | u32 | Unique protocols indexed |
| last_registered_at | i64 | Timestamp of last registration |
| initialized_at | i64 | Timestamp of initialization |
| authority | Pubkey | Initialization authority wallet |
| total_tools | u32 | Lifetime tools published |
| total_vaults | u32 | Lifetime vaults initialized |
| total_escrows | u32 | (DEPRECATED) No longer updated |
| total_attestations | u32 | Lifetime attestations created |

### 3.2 AgentAccount

**Seeds**: `["sap_agent", wallet_pubkey]`
**One per wallet**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| version | u8 | | Protocol version (currently 1) |
| wallet | Pubkey | | Owner wallet |
| name | String | 64 | Display name |
| description | String | 256 | Agent description |
| agent_id | Option\<String\> | 128 | DID-style identifier |
| agent_uri | Option\<String\> | 256 | Agent metadata URI |
| x402_endpoint | Option\<String\> | 256 | HTTPS x402 payment endpoint |
| is_active | bool | | Active status |
| created_at | i64 | | Registration timestamp |
| updated_at | i64 | | Last update timestamp |
| reputation_score | u32 | 10000 | Computed score (2 decimal, 0-100.00) |
| total_feedbacks | u32 | | Feedback count |
| reputation_sum | u64 | | Running sum for incremental calc |
| total_calls_served | u64 | | (DEPRECATED) Use AgentStats |
| avg_latency_ms | u32 | | Self-reported latency |
| uptime_percent | u8 | 100 | Self-reported uptime |
| capabilities | Vec\<Capability\> | 10 | Agent capabilities |
| pricing | Vec\<PricingTier\> | 5 | Service pricing tiers |
| protocols | Vec\<String\> | 5x64 | Protocol identifiers |
| active_plugins | Vec\<PluginRef\> | 5 | Active plugin references |

### 3.3 AgentStats

**Seeds**: `["sap_stats", agent_pda]`
**One per agent** (hot-path, 106 bytes)

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| agent | Pubkey | Parent AgentAccount PDA |
| wallet | Pubkey | Owner wallet |
| total_calls_served | u64 | Authoritative call counter |
| is_active | bool | Mirrored from AgentAccount |
| updated_at | i64 | Last update timestamp |

### 3.4 FeedbackAccount

**Seeds**: `["sap_feedback", agent_pda, reviewer_pubkey]`
**One per agent-reviewer pair**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| agent | Pubkey | | Target agent PDA |
| reviewer | Pubkey | | Reviewer wallet |
| score | u16 | 1000 | Score (0-1000) |
| tag | String | 32 | Category tag (e.g. "quality") |
| comment_hash | Option\<[u8; 32]\> | | SHA-256 hash of offchain comment |
| created_at | i64 | | Created timestamp |
| updated_at | i64 | | Last update timestamp |
| is_revoked | bool | | Revoked flag |

### 3.5 CapabilityIndex

**Seeds**: `["sap_cap_idx", sha256(capability_id)]`
**One per unique capability string**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| capability_id | String | 64 | Human-readable capability ID |
| capability_hash | [u8; 32] | | SHA-256 of capability_id |
| agents | Vec\<Pubkey\> | 100 | Agent PDAs with this capability |
| total_pages | u8 | | Overflow pagination counter |
| last_updated | i64 | | Last modification timestamp |

### 3.6 ProtocolIndex

**Seeds**: `["sap_proto_idx", sha256(protocol_id)]`
**One per unique protocol string**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| protocol_id | String | 64 | Human-readable protocol ID |
| protocol_hash | [u8; 32] | | SHA-256 of protocol_id |
| agents | Vec\<Pubkey\> | 100 | Agent PDAs in this protocol |
| total_pages | u8 | | Overflow pagination |
| last_updated | i64 | | Last modification timestamp |

### 3.7 ToolDescriptor

**Seeds**: `["sap_tool", agent_pda, tool_name_hash]`
**One per tool per agent**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| agent | Pubkey | | Parent AgentAccount PDA |
| tool_name_hash | [u8; 32] | | SHA-256 of tool_name |
| tool_name | String | 32 | Human-readable tool name |
| protocol_hash | [u8; 32] | | SHA-256 of protocol_id (links to ProtocolIndex) |
| version | u16 | | Schema version (1, 2, 3, ...) |
| description_hash | [u8; 32] | | SHA-256 of full description text |
| input_schema_hash | [u8; 32] | | SHA-256 of input JSON schema |
| output_schema_hash | [u8; 32] | | SHA-256 of output JSON schema |
| http_method | ToolHttpMethod | | GET, POST, PUT, DELETE, Compound |
| category | ToolCategory | | Swap, Lend, Data, etc. |
| params_count | u8 | | Total input parameters |
| required_params | u8 | | Required input parameters |
| is_compound | bool | | Chains multiple HTTP calls |
| is_active | bool | | Active/inactive flag |
| total_invocations | u64 | | Self-reported call counter |
| created_at | i64 | | Publication timestamp |
| updated_at | i64 | | Last update timestamp |
| previous_version | Pubkey | | Pubkey::default() if first version |

### 3.8 ToolCategoryIndex

**Seeds**: `["sap_tool_cat", category_u8]`
**One per category (10 total, globally pre-derivable)**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| category | u8 | | ToolCategory enum value (0-9) |
| tools | Vec\<Pubkey\> | 100 | ToolDescriptor PDAs in this category |
| total_pages | u8 | | Overflow pagination |
| last_updated | i64 | | Last modification timestamp |

### 3.9 EscrowAccount

**Seeds**: `["sap_escrow", agent_pda, depositor_wallet]`
**One per agent-depositor pair**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| agent | Pubkey | | Provider agent PDA |
| depositor | Pubkey | | Client wallet that funded |
| agent_wallet | Pubkey | | Agent owner wallet (settlement dest) |
| balance | u64 | | Available balance (lamports or smallest token unit) |
| total_deposited | u64 | | Lifetime deposits |
| total_settled | u64 | | Lifetime settled amount |
| total_calls_settled | u64 | | Lifetime calls settled |
| price_per_call | u64 | | Locked price per call (immutable) |
| max_calls | u64 | | Max calls (0 = unlimited) |
| created_at | i64 | | Creation timestamp |
| last_settled_at | i64 | | Last settlement timestamp |
| expires_at | i64 | | Expiration (0 = never) |
| volume_curve | Vec\<VolumeCurveBreakpoint\> | 5 | Tiered pricing breakpoints |
| token_mint | Option\<Pubkey\> | | None = SOL, Some = SPL token |
| token_decimals | u8 | | Token decimals (9=SOL, 6=USDC) |

### 3.10 AgentAttestation

**Seeds**: `["sap_attest", agent_pda, attester_wallet]`
**One per agent-attester pair**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| agent | Pubkey | | Target agent PDA |
| attester | Pubkey | | Authority wallet |
| attestation_type | String | 32 | Type string (e.g. "verified", "audited") |
| metadata_hash | [u8; 32] | | SHA-256 of attestation evidence |
| is_active | bool | | Active flag |
| expires_at | i64 | | Expiration (0 = never) |
| created_at | i64 | | Creation timestamp |
| updated_at | i64 | | Last update timestamp |

### 3.11 MemoryVault

**Seeds**: `["sap_vault", agent_pda]`
**One per agent**

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| agent | Pubkey | Parent AgentAccount PDA |
| wallet | Pubkey | Owner wallet |
| vault_nonce | [u8; 32] | PBKDF2 salt for key derivation (public) |
| total_sessions | u32 | Lifetime session count |
| total_inscriptions | u64 | Lifetime inscription count |
| total_bytes_inscribed | u64 | Lifetime bytes inscribed |
| created_at | i64 | Initialization timestamp |
| protocol_version | u8 | Event format version (1) |
| nonce_version | u32 | Increments on each nonce rotation |
| last_nonce_rotation | i64 | Timestamp of last nonce rotation |

### 3.12 SessionLedger

**Seeds**: `["sap_session", vault_pda, session_hash]`
**One per session per vault**

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| vault | Pubkey | Parent MemoryVault PDA |
| session_hash | [u8; 32] | SHA-256 of session identifier |
| sequence_counter | u32 | Next expected sequence number |
| total_bytes | u64 | Cumulative encrypted bytes |
| current_epoch | u32 | Current epoch index |
| total_epochs | u32 | Total epochs created |
| created_at | i64 | Session open timestamp |
| last_inscribed_at | i64 | Last inscription timestamp |
| is_closed | bool | Session closed flag |
| merkle_root | [u8; 32] | Rolling merkle: sha256(prev_root \|\| content_hash) |
| total_checkpoints | u32 | Checkpoints created |
| tip_hash | [u8; 32] | Last content_hash for O(1) change detection |

### 3.13 EpochPage

**Seeds**: `["sap_epoch", session_pda, epoch_index_u32_le]`
**One per 1000 inscriptions**

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| session | Pubkey | Parent SessionLedger PDA |
| epoch_index | u32 | Sequential epoch number |
| start_sequence | u32 | First sequence in this epoch |
| inscription_count | u16 | Inscriptions written in epoch |
| total_bytes | u32 | Bytes inscribed in epoch |
| first_ts | i64 | Timestamp of first inscription |
| last_ts | i64 | Timestamp of last inscription |

### 3.14 VaultDelegate

**Seeds**: `["sap_delegate", vault_pda, delegate_pubkey]`
**One per delegate per vault**

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| vault | Pubkey | Parent MemoryVault PDA |
| delegate | Pubkey | Authorized hot wallet |
| permissions | u8 | Bitmask (1=inscribe, 2=close_session, 4=open_session) |
| expires_at | i64 | Expiration (0 = never) |
| created_at | i64 | Creation timestamp |

### 3.15 SessionCheckpoint

**Seeds**: `["sap_checkpoint", session_pda, checkpoint_index_u32_le]`
**Periodic snapshots for fast-sync**

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| session | Pubkey | Parent SessionLedger PDA |
| checkpoint_index | u32 | Sequential checkpoint number |
| merkle_root | [u8; 32] | Merkle accumulator at this point |
| sequence_at | u32 | Sequence counter at checkpoint |
| epoch_at | u32 | Current epoch at checkpoint |
| total_bytes_at | u64 | Cumulative bytes at checkpoint |
| inscriptions_at | u64 | Total inscriptions up to checkpoint |
| created_at | i64 | Checkpoint creation timestamp |

### 3.16 MemoryLedger

**Seeds**: `["sap_ledger", session_pda]`
**The recommended memory system**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| session | Pubkey | | Parent SessionLedger PDA |
| authority | Pubkey | | Write-authorized wallet |
| num_entries | u32 | | Total writes ever (including evicted) |
| merkle_root | [u8; 32] | | Rolling hash of all entries |
| latest_hash | [u8; 32] | | Most recent content_hash |
| total_data_size | u64 | | Cumulative bytes written (ever) |
| created_at | i64 | | Initialization timestamp |
| updated_at | i64 | | Last write timestamp |
| num_pages | u32 | | Sealed archive page count |
| ring | Vec\<u8\> | 4096 | Sliding-window ring buffer |

Ring buffer format: each entry is `[data_len: u16 LE][data: u8 * data_len]`. On overflow, oldest entries are evicted. Evicted entries remain permanently in TX logs.

### 3.17 LedgerPage

**Seeds**: `["sap_page", ledger_pda, page_index_u32_le]`
**Write-once, permanent. No close instruction exists.**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| bump | u8 | | PDA bump |
| ledger | Pubkey | | Parent MemoryLedger PDA |
| page_index | u32 | | Sequential page number |
| sealed_at | i64 | | Seal timestamp |
| entries_in_page | u32 | | Entries frozen in this page |
| data_size | u32 | | Raw data bytes |
| merkle_root_at_seal | [u8; 32] | | Merkle snapshot at seal |
| data | Vec\<u8\> | 4096 | Frozen ring buffer (immutable) |

### 3.18-3.22 Legacy Accounts (feature-gated: `legacy-memory`)

These require the `legacy-memory` Cargo feature flag and are not active in current production builds.

**PluginSlot** - Seeds: `["sap_plugin", agent_pda, plugin_type_u8]`

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| agent | Pubkey | Parent agent PDA |
| plugin_type | PluginType | Plugin discriminant |
| is_active | bool | Active flag |
| initialized_at | i64 | Init timestamp |
| last_updated | i64 | Update timestamp |
| data_account | Option\<Pubkey\> | External data PDA |

**MemoryEntry** - Seeds: `["sap_memory", agent_pda, entry_hash]`

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| agent | Pubkey | Parent agent PDA |
| entry_hash | [u8; 32] | Entry key hash |
| content_type | String (32) | MIME-style content type |
| ipfs_cid | Option\<String\> (64) | IPFS content ID |
| total_chunks | u8 | Total chunk count |
| total_size | u32 | Total data size (bytes) |
| created_at | i64 | Creation timestamp |
| updated_at | i64 | Update timestamp |

**MemoryChunk** - Seeds: `["sap_mem_chunk", memory_entry_pda, chunk_index_u8]`

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| memory_entry | Pubkey | Parent entry PDA |
| chunk_index | u8 | Chunk number |
| data | Vec\<u8\> (900) | Chunk data |

**MemoryBuffer** - Seeds: `["sap_buffer", session_pda, page_index_u32_le]`

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| session | Pubkey | Parent session PDA |
| authority | Pubkey | Write-authorized wallet |
| page_index | u32 | Buffer page number |
| num_entries | u16 | Append count |
| total_size | u16 | Current bytes stored |
| created_at | i64 | Creation timestamp |
| updated_at | i64 | Update timestamp |
| data | Vec\<u8\> (10000) | Dynamic buffer (grows via realloc) |

**MemoryDigest** - Seeds: `["sap_digest", session_pda]`

| Field | Type | Description |
|-------|------|-------------|
| bump | u8 | PDA bump |
| session | Pubkey | Parent session PDA |
| authority | Pubkey | Write-authorized wallet |
| num_entries | u32 | Total post_digest calls |
| merkle_root | [u8; 32] | Rolling sha256(prev \|\| hash) |
| latest_hash | [u8; 32] | Most recent content_hash |
| total_data_size | u64 | Cumulative bytes (tracked, not stored) |
| storage_ref | [u8; 32] | Offchain storage pointer |
| storage_type | u8 | Storage type (0=None, 1=IPFS, 2=Arweave, 3=ShadowDrive, 4=HTTP, 5=Filecoin) |
| created_at | i64 | Creation timestamp |
| updated_at | i64 | Update timestamp |

---

## 4. Enums

### TokenType

| Variant | u8 | Description |
|---------|-----|-------------|
| Sol | 0 | Native SOL |
| Usdc | 1 | USDC SPL token |
| Spl | 2 | Arbitrary SPL token |

### SettlementMode

| Variant | u8 | Description |
|---------|-----|-------------|
| Instant | 0 | Per-call onchain transfer |
| Escrow | 1 | Pre-funded escrow PDA |
| Batched | 2 | Offchain accumulation, periodic settle |
| X402 | 3 | HTTP x402 protocol (default) |

### PluginType

| Variant | u8 | Description |
|---------|-----|-------------|
| Memory | 0 | Memory management |
| Validation | 1 | Input validation |
| Delegation | 2 | Access delegation |
| Analytics | 3 | Usage analytics |
| Governance | 4 | DAO governance |
| Custom | 5 | Uncategorized |

### ToolHttpMethod

| Variant | u8 | Description |
|---------|-----|-------------|
| Get | 0 | HTTP GET |
| Post | 1 | HTTP POST |
| Put | 2 | HTTP PUT |
| Delete | 3 | HTTP DELETE |
| Compound | 4 | Multi-call composition |

### ToolCategory

| Variant | u8 | Description |
|---------|-----|-------------|
| Swap | 0 | Token swaps |
| Lend | 1 | Lending/borrowing |
| Stake | 2 | Staking/validator |
| Nft | 3 | NFT mint/trade |
| Payment | 4 | Payments/transfers |
| Data | 5 | Data queries/feeds |
| Governance | 6 | DAO/voting |
| Bridge | 7 | Cross-chain |
| Analytics | 8 | Onchain analytics |
| Custom | 9 | Uncategorized |

### Helper Structs

**Capability**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| id | String | 64 | ID (format "protocol:method") |
| description | Option\<String\> | 128 | Description |
| protocol_id | Option\<String\> | 64 | Protocol group |
| version | Option\<String\> | 16 | Semver string |

**PricingTier**

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| tier_id | String | 32 | Tier identifier |
| price_per_call | u64 | | Base price (smallest unit) |
| min_price_per_call | Option\<u64\> | | Price floor |
| max_price_per_call | Option\<u64\> | | Price ceiling |
| rate_limit | u32 | | Max calls/sec |
| max_calls_per_session | u32 | | Max per session (0=unlimited) |
| burst_limit | Option\<u32\> | | Max burst/sec |
| token_type | TokenType | | Payment token |
| token_mint | Option\<Pubkey\> | | SPL mint (required if Spl) |
| token_decimals | Option\<u8\> | | Decimals (9=SOL, 6=USDC) |
| settlement_mode | Option\<SettlementMode\> | | Settlement type |
| min_escrow_deposit | Option\<u64\> | | Min escrow deposit |
| batch_interval_sec | Option\<u32\> | | Batch interval |
| volume_curve | Option\<Vec\<VolumeCurveBreakpoint\>\> | 5 | Volume discounts |

**VolumeCurveBreakpoint**

| Field | Type | Description |
|-------|------|-------------|
| after_calls | u32 | Cumulative calls threshold |
| price_per_call | u64 | Price after threshold (smallest unit) |

**PluginRef**

| Field | Type | Description |
|-------|------|-------------|
| plugin_type | PluginType | Plugin discriminant |
| pda | Pubkey | Plugin PDA address |

**Settlement** (used in batch settle)

| Field | Type | Description |
|-------|------|-------------|
| calls_to_settle | u64 | Calls to bill |
| service_hash | [u8; 32] | SHA-256 proof of service |

---

## 5. PDA Derivation

All PDAs use `PublicKey.findProgramAddressSync(seeds, SAP_PROGRAM_ID)`.

```typescript
import {
  deriveGlobalRegistry,
  deriveAgent,
  deriveAgentStats,
  deriveFeedback,
  deriveCapabilityIndex,
  deriveProtocolIndex,
  deriveToolCategoryIndex,
  deriveVault,
  deriveSession,
  deriveEpochPage,
  deriveVaultDelegate,
  deriveCheckpoint,
  deriveTool,
  deriveEscrow,
  deriveAttestation,
  deriveLedger,
  deriveLedgerPage,
  deriveBuffer,
  deriveDigest,
  derivePlugin,
  deriveMemoryEntry,
  deriveMemoryChunk,
} from "@oobe-protocol-labs/synapse-sap-sdk/pda";
```

### Complete Seed Reference

| Account | Seed Prefix | Additional Seeds | SDK Function |
|---------|-------------|------------------|--------------|
| GlobalRegistry | `sap_global` | (none) | `deriveGlobalRegistry()` |
| AgentAccount | `sap_agent` | wallet: Pubkey | `deriveAgent(wallet)` |
| AgentStats | `sap_stats` | agent_pda: Pubkey | `deriveAgentStats(agentPda)` |
| FeedbackAccount | `sap_feedback` | agent_pda, reviewer: Pubkey | `deriveFeedback(agentPda, reviewer)` |
| CapabilityIndex | `sap_cap_idx` | sha256(capability_id): [u8;32] | `deriveCapabilityIndex(hash)` |
| ProtocolIndex | `sap_proto_idx` | sha256(protocol_id): [u8;32] | `deriveProtocolIndex(hash)` |
| ToolCategoryIndex | `sap_tool_cat` | category: u8 | `deriveToolCategoryIndex(category)` |
| MemoryVault | `sap_vault` | agent_pda: Pubkey | `deriveVault(agentPda)` |
| SessionLedger | `sap_session` | vault_pda, session_hash: [u8;32] | `deriveSession(vaultPda, hash)` |
| EpochPage | `sap_epoch` | session_pda, epoch_index: u32 LE | `deriveEpochPage(sessionPda, idx)` |
| VaultDelegate | `sap_delegate` | vault_pda, delegate: Pubkey | `deriveVaultDelegate(vaultPda, delegate)` |
| SessionCheckpoint | `sap_checkpoint` | session_pda, checkpoint_index: u32 LE | `deriveCheckpoint(sessionPda, idx)` |
| ToolDescriptor | `sap_tool` | agent_pda, sha256(tool_name): [u8;32] | `deriveTool(agentPda, hash)` |
| EscrowAccount | `sap_escrow` | agent_pda, depositor: Pubkey | `deriveEscrow(agentPda, depositor)` |
| AgentAttestation | `sap_attest` | agent_pda, attester: Pubkey | `deriveAttestation(agentPda, attester)` |
| MemoryLedger | `sap_ledger` | session_pda: Pubkey | `deriveLedger(sessionPda)` |
| LedgerPage | `sap_page` | ledger_pda, page_index: u32 LE | `deriveLedgerPage(ledgerPda, idx)` |
| MemoryBuffer | `sap_buffer` | session_pda, page_index: u32 LE | `deriveBuffer(sessionPda, idx)` |
| MemoryDigest | `sap_digest` | session_pda: Pubkey | `deriveDigest(sessionPda)` |
| PluginSlot | `sap_plugin` | agent_pda, plugin_type: u8 | `derivePlugin(agentPda, type)` |
| MemoryEntry | `sap_memory` | agent_pda, entry_hash: [u8;32] | `deriveMemoryEntry(agentPda, hash)` |
| MemoryChunk | `sap_mem_chunk` | entry_pda, chunk_index: u8 | `deriveMemoryChunk(entryPda, idx)` |

---

## 6. Instructions

72 instructions organized by domain. Each row shows the instruction name, required arguments, and the event emitted on success.

### 6.1 Global Registry (1)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `initialize_global` | (none) | (none) |

### 6.2 Agent Lifecycle (7)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `register_agent` | name, description, capabilities, pricing, protocols, agent_id?, agent_uri?, x402_endpoint? | RegisteredEvent |
| `update_agent` | name?, description?, capabilities?, pricing?, protocols?, agent_id?, agent_uri?, x402_endpoint? | UpdatedEvent |
| `deactivate_agent` | (none) | DeactivatedEvent |
| `reactivate_agent` | (none) | ReactivatedEvent |
| `close_agent` | (none) | ClosedEvent |
| `report_calls` | calls_served: u64 | CallsReportedEvent |
| `update_reputation` | avg_latency_ms: u32, uptime_percent: u8 | ReputationUpdatedEvent |

### 6.3 Feedback (4)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `give_feedback` | score: u16, tag: String, comment_hash?: [u8;32] | FeedbackEvent |
| `update_feedback` | new_score: u16, new_tag?: String, comment_hash?: [u8;32] | FeedbackUpdatedEvent |
| `revoke_feedback` | (none) | FeedbackRevokedEvent |
| `close_feedback` | (none) | (none) |

### 6.4 Indexing (8)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `init_capability_index` | capability_id: String, capability_hash: [u8;32] | (none) |
| `add_to_capability_index` | capability_hash: [u8;32] | (none) |
| `remove_from_capability_index` | capability_hash: [u8;32] | (none) |
| `close_capability_index` | capability_hash: [u8;32] | (none) |
| `init_protocol_index` | protocol_id: String, protocol_hash: [u8;32] | (none) |
| `add_to_protocol_index` | protocol_hash: [u8;32] | (none) |
| `remove_from_protocol_index` | protocol_hash: [u8;32] | (none) |
| `close_protocol_index` | protocol_hash: [u8;32] | (none) |

### 6.5 Memory Vault (10)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `init_vault` | vault_nonce: [u8;32] | VaultInitializedEvent |
| `open_session` | session_hash: [u8;32] | SessionOpenedEvent |
| `inscribe_memory` | sequence, encrypted_data, nonce, content_hash, total_fragments, fragment_index, compression, epoch_index | MemoryInscribedEvent + EpochOpenedEvent (if new epoch) |
| `compact_inscribe` | sequence, encrypted_data, nonce, content_hash | MemoryInscribedEvent |
| `inscribe_memory_delegated` | (same as inscribe_memory) | MemoryInscribedEvent |
| `close_session` | (none) | SessionClosedEvent |
| `close_vault` | (none) | VaultClosedEvent |
| `close_session_pda` | (none) | SessionPdaClosedEvent |
| `close_epoch_page` | epoch_index: u32 | EpochPageClosedEvent |
| `rotate_vault_nonce` | new_nonce: [u8;32] | VaultNonceRotatedEvent |

### 6.6 Vault Delegation (2)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `add_vault_delegate` | permissions: u8, expires_at: i64 | DelegateAddedEvent |
| `revoke_vault_delegate` | (none) | DelegateRevokedEvent |

### 6.7 Tool Registry (7)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `publish_tool` | tool_name, tool_name_hash, protocol_hash, description_hash, input_schema_hash, output_schema_hash, http_method, category, params_count, required_params, is_compound | ToolPublishedEvent |
| `inscribe_tool_schema` | schema_type: u8, schema_data: Vec\<u8\>, schema_hash: [u8;32], compression: u8 | ToolSchemaInscribedEvent |
| `update_tool` | description_hash?, input_schema_hash?, output_schema_hash?, http_method?, category?, params_count?, required_params? | ToolUpdatedEvent |
| `deactivate_tool` | (none) | ToolDeactivatedEvent |
| `reactivate_tool` | (none) | ToolReactivatedEvent |
| `close_tool` | (none) | ToolClosedEvent |
| `report_tool_invocations` | invocations: u64 | ToolInvocationReportedEvent |

### 6.8 Session Checkpoints (2)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `create_session_checkpoint` | checkpoint_index: u32 | CheckpointCreatedEvent |
| `close_checkpoint` | checkpoint_index: u32 | (none) |

### 6.9 Escrow Settlement (5)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `create_escrow` | price_per_call, max_calls, initial_deposit, expires_at, volume_curve, token_mint?, token_decimals | EscrowCreatedEvent |
| `deposit_escrow` | amount: u64 | EscrowDepositedEvent |
| `settle_calls` | calls_to_settle: u64, service_hash: [u8;32] | PaymentSettledEvent |
| `withdraw_escrow` | amount: u64 | EscrowWithdrawnEvent |
| `settle_batch` | settlements: Vec\<Settlement\> (max 10) | BatchSettledEvent |

Note: `close_escrow` (1 instruction) does not emit an event. Proof of the escrow lifecycle lives in the `EscrowCreatedEvent`, `PaymentSettledEvent`, `EscrowWithdrawnEvent`, and `BatchSettledEvent` TX logs.

### 6.10 Attestation (3)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `create_attestation` | attestation_type: String, metadata_hash: [u8;32], expires_at: i64 | AttestationCreatedEvent |
| `revoke_attestation` | (none) | AttestationRevokedEvent |
| `close_attestation` | (none) | (none) |

### 6.11 Tool Category Index (4)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `init_tool_category_index` | category: u8 | (none) |
| `add_to_tool_category` | category: u8 | (none) |
| `remove_from_tool_category` | category: u8 | (none) |
| `close_tool_category_index` | category: u8 | (none) |

### 6.12 Memory Ledger (3)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `init_ledger` | (none) | (none) |
| `write_ledger` | data: Vec\<u8\>, content_hash: [u8;32] | LedgerEntryEvent |
| `seal_ledger` | (none) | LedgerSealedEvent |

Note: `close_ledger` (1 instruction) closes the MemoryLedger PDA. Sealed LedgerPages remain permanent.

### 6.13 Legacy Instructions (feature-gated)

| Instruction | Arguments | Emits |
|-------------|-----------|-------|
| `register_plugin` | plugin_type: u8 | PluginRegisteredEvent |
| `close_plugin` | (none) | (none) |
| `store_memory` | entry_hash, content_type, ipfs_cid?, total_size | MemoryStoredEvent |
| `append_memory_chunk` | chunk_index: u8, data: Vec\<u8\> | (none) |
| `close_memory_entry` | (none) | (none) |
| `close_memory_chunk` | (none) | (none) |
| `create_buffer` | page_index: u32 | BufferCreatedEvent |
| `append_buffer` | page_index: u32, data: Vec\<u8\> | BufferAppendedEvent |
| `close_buffer` | page_index: u32 | (none) |
| `init_digest` | (none) | (none) |
| `post_digest` | content_hash: [u8;32], data_size: u32 | DigestPostedEvent |
| `inscribe_to_digest` | data: Vec\<u8\>, content_hash: [u8;32] | DigestInscribedEvent |
| `update_digest_storage` | storage_ref: [u8;32], storage_type: u8 | StorageRefUpdatedEvent |
| `close_digest` | (none) | (none) |

**Instruction count**: 7 + 4 + 8 + 10 + 2 + 7 + 2 + 5 + 1(close_escrow) + 3 + 4 + 3 + 1(close_ledger) + 1(init_global) + 14(legacy) = **72 total**

---

## 7. Events

45 events total (31 active + 14 legacy). Each event is an Anchor `#[event]` emitted to transaction logs. Events persist permanently in the Solana ledger. The Anchor event discriminator is `sha256("event:<EventName>")[..8]`.

### 7.1 Agent Lifecycle Events (5)

**RegisteredEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| name | String |
| capabilities | Vec\<String\> |
| timestamp | i64 |

**UpdatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| updated_fields | Vec\<String\> |
| timestamp | i64 |

**DeactivatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| timestamp | i64 |

**ReactivatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| timestamp | i64 |

**ClosedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| timestamp | i64 |

### 7.2 Feedback Events (3)

**FeedbackEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| reviewer | Pubkey |
| score | u16 |
| tag | String |
| timestamp | i64 |

**FeedbackUpdatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| reviewer | Pubkey |
| old_score | u16 |
| new_score | u16 |
| timestamp | i64 |

**FeedbackRevokedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| reviewer | Pubkey |
| timestamp | i64 |

### 7.3 Reputation Events (2)

**ReputationUpdatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| avg_latency_ms | u32 |
| uptime_percent | u8 |
| timestamp | i64 |

**CallsReportedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| wallet | Pubkey |
| calls_reported | u64 |
| total_calls_served | u64 |
| timestamp | i64 |

### 7.4 Vault Events (6)

**VaultInitializedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| vault | Pubkey |
| wallet | Pubkey |
| timestamp | i64 |

**SessionOpenedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| session | Pubkey |
| session_hash | [u8; 32] |
| timestamp | i64 |

**MemoryInscribedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| session | Pubkey |
| sequence | u32 |
| epoch_index | u32 |
| encrypted_data | Vec\<u8\> |
| nonce | [u8; 12] |
| content_hash | [u8; 32] |
| total_fragments | u8 |
| fragment_index | u8 |
| compression | u8 |
| data_len | u32 |
| nonce_version | u32 |
| timestamp | i64 |

**EpochOpenedEvent**

| Field | Type |
|-------|------|
| session | Pubkey |
| epoch_page | Pubkey |
| epoch_index | u32 |
| start_sequence | u32 |
| timestamp | i64 |

**SessionClosedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| session | Pubkey |
| total_inscriptions | u32 |
| total_bytes | u64 |
| total_epochs | u32 |
| timestamp | i64 |

**VaultClosedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| agent | Pubkey |
| wallet | Pubkey |
| total_sessions | u32 |
| total_inscriptions | u64 |
| timestamp | i64 |

### 7.5 Vault Lifecycle Events (4)

**SessionPdaClosedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| session | Pubkey |
| total_inscriptions | u32 |
| total_bytes | u64 |
| timestamp | i64 |

**EpochPageClosedEvent**

| Field | Type |
|-------|------|
| session | Pubkey |
| epoch_page | Pubkey |
| epoch_index | u32 |
| timestamp | i64 |

**VaultNonceRotatedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| wallet | Pubkey |
| old_nonce | [u8; 32] |
| new_nonce | [u8; 32] |
| nonce_version | u32 |
| timestamp | i64 |

**DelegateAddedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| delegate | Pubkey |
| permissions | u8 |
| expires_at | i64 |
| timestamp | i64 |

**DelegateRevokedEvent**

| Field | Type |
|-------|------|
| vault | Pubkey |
| delegate | Pubkey |
| timestamp | i64 |

### 7.6 Tool Registry Events (7)

**ToolPublishedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| tool | Pubkey |
| tool_name | String |
| protocol_hash | [u8; 32] |
| version | u16 |
| http_method | u8 |
| category | u8 |
| params_count | u8 |
| required_params | u8 |
| is_compound | bool |
| timestamp | i64 |

**ToolSchemaInscribedEvent**

| Field | Type | Notes |
|-------|------|-------|
| agent | Pubkey | |
| tool | Pubkey | |
| tool_name | String | |
| schema_type | u8 | 0=input, 1=output, 2=description |
| schema_data | Vec\<u8\> | Full JSON schema (optionally compressed) |
| schema_hash | [u8; 32] | sha256 of uncompressed schema |
| compression | u8 | 0=none, 1=deflate |
| version | u16 | |
| timestamp | i64 | |

**ToolUpdatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| tool | Pubkey |
| tool_name | String |
| old_version | u16 |
| new_version | u16 |
| timestamp | i64 |

**ToolDeactivatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| tool | Pubkey |
| tool_name | String |
| timestamp | i64 |

**ToolReactivatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| tool | Pubkey |
| tool_name | String |
| timestamp | i64 |

**ToolClosedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| tool | Pubkey |
| tool_name | String |
| total_invocations | u64 |
| timestamp | i64 |

**ToolInvocationReportedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| tool | Pubkey |
| invocations_reported | u64 |
| total_invocations | u64 |
| timestamp | i64 |

### 7.7 Checkpoint Events (1)

**CheckpointCreatedEvent**

| Field | Type |
|-------|------|
| session | Pubkey |
| checkpoint | Pubkey |
| checkpoint_index | u32 |
| merkle_root | [u8; 32] |
| sequence_at | u32 |
| epoch_at | u32 |
| timestamp | i64 |

### 7.8 Escrow Events (5)

**EscrowCreatedEvent**

| Field | Type |
|-------|------|
| escrow | Pubkey |
| agent | Pubkey |
| depositor | Pubkey |
| price_per_call | u64 |
| max_calls | u64 |
| initial_deposit | u64 |
| expires_at | i64 |
| timestamp | i64 |

**EscrowDepositedEvent**

| Field | Type |
|-------|------|
| escrow | Pubkey |
| depositor | Pubkey |
| amount | u64 |
| new_balance | u64 |
| timestamp | i64 |

**PaymentSettledEvent**

| Field | Type |
|-------|------|
| escrow | Pubkey |
| agent | Pubkey |
| depositor | Pubkey |
| calls_settled | u64 |
| amount | u64 |
| service_hash | [u8; 32] |
| total_calls_settled | u64 |
| remaining_balance | u64 |
| timestamp | i64 |

**EscrowWithdrawnEvent**

| Field | Type |
|-------|------|
| escrow | Pubkey |
| depositor | Pubkey |
| amount | u64 |
| remaining_balance | u64 |
| timestamp | i64 |

**BatchSettledEvent**

| Field | Type |
|-------|------|
| escrow | Pubkey |
| agent | Pubkey |
| depositor | Pubkey |
| num_settlements | u8 |
| total_calls | u64 |
| total_amount | u64 |
| service_hashes | Vec\<[u8; 32]\> |
| calls_per_settlement | Vec\<u64\> |
| remaining_balance | u64 |
| timestamp | i64 |

### 7.9 Attestation Events (2)

**AttestationCreatedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| attester | Pubkey |
| attestation_type | String |
| expires_at | i64 |
| timestamp | i64 |

**AttestationRevokedEvent**

| Field | Type |
|-------|------|
| agent | Pubkey |
| attester | Pubkey |
| attestation_type | String |
| timestamp | i64 |

### 7.10 Ledger Events (2)

**LedgerEntryEvent**

| Field | Type |
|-------|------|
| session | Pubkey |
| ledger | Pubkey |
| entry_index | u32 |
| data | Vec\<u8\> |
| content_hash | [u8; 32] |
| data_len | u32 |
| merkle_root | [u8; 32] |
| timestamp | i64 |

**LedgerSealedEvent**

| Field | Type |
|-------|------|
| session | Pubkey |
| ledger | Pubkey |
| page | Pubkey |
| page_index | u32 |
| entries_in_page | u32 |
| data_size | u32 |
| merkle_root_at_seal | [u8; 32] |
| timestamp | i64 |

### 7.11 Legacy Events (feature-gated)

| Event | Key Fields |
|-------|------------|
| PluginRegisteredEvent | agent, plugin_type (u8), plugin_pda, timestamp |
| MemoryStoredEvent | agent, entry_hash, content_type, timestamp |
| BufferCreatedEvent | session, buffer, authority, page_index, timestamp |
| BufferAppendedEvent | session, buffer, page_index, chunk_size, total_size, num_entries, timestamp |
| DigestPostedEvent | session, digest, content_hash, data_size, entry_index, merkle_root, timestamp |
| DigestInscribedEvent | session, digest, entry_index, data, content_hash, data_len, merkle_root, timestamp |
| StorageRefUpdatedEvent | session, digest, storage_ref, storage_type, timestamp |

---

## 8. Error Codes

91 error codes. Anchor error code = 6000 + index. The `#[msg]` strings are kept minimal for transaction size.

### Agent Validation

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6000 | NameTooLong | name>64 | Name exceeds 64 bytes |
| 6001 | DescriptionTooLong | desc>256 | Description exceeds 256 bytes |
| 6002 | UriTooLong | uri>256 | URI exceeds 256 bytes |
| 6003 | TooManyCapabilities | caps>10 | More than 10 capabilities |
| 6004 | TooManyPricingTiers | tiers>5 | More than 5 pricing tiers |
| 6005 | TooManyProtocols | protos>5 | More than 5 protocols |
| 6006 | TooManyPlugins | plugins>5 | More than 5 plugins |

### Agent State

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6007 | AlreadyActive | already active | Reactivating active agent |
| 6008 | AlreadyInactive | already inactive | Deactivating inactive agent |

### Feedback

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6009 | InvalidFeedbackScore | score 0-1000 | Score outside range |
| 6010 | TagTooLong | tag>32 | Tag exceeds 32 bytes |
| 6011 | SelfReviewNotAllowed | self review | Reviewer is agent owner |
| 6012 | FeedbackAlreadyRevoked | already revoked | Revoking revoked feedback |

### Indexing

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6013 | CapabilityIndexFull | cap idx full | 100 agents in index |
| 6014 | ProtocolIndexFull | proto idx full | 100 agents in index |
| 6015 | AgentNotInIndex | not in idx | Agent not found in index |
| 6016 | InvalidCapabilityHash | cap hash | Hash mismatch |
| 6017 | InvalidProtocolHash | proto hash | Hash mismatch |

### Plugin

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6018 | InvalidPluginType | bad plugin type | Invalid u8 discriminant |

### Memory (Legacy)

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6019 | ChunkDataTooLarge | chunk>900 | Chunk exceeds 900 bytes |
| 6020 | ContentTypeTooLong | ctype>max | Content type too long |
| 6021 | IpfsCidTooLong | cid>max | IPFS CID too long |

### Deep Validation

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6022 | EmptyName | empty name | Name is empty string |
| 6023 | ControlCharInName | ctrl char | Control characters in name |
| 6024 | EmptyDescription | empty desc | Description is empty |
| 6025 | AgentIdTooLong | agentid>128 | Agent ID exceeds 128 bytes |
| 6026 | InvalidCapabilityFormat | cap format | Missing "protocol:method" format |
| 6027 | DuplicateCapability | dup cap | Duplicate capability ID |
| 6028 | EmptyTierId | empty tier | Empty tier_id string |
| 6029 | DuplicateTierId | dup tier | Duplicate tier ID |
| 6030 | InvalidRateLimit | rate=0 | Zero rate limit |
| 6031 | SplRequiresTokenMint | spl needs mint | SPL type without token_mint |
| 6032 | InvalidX402Endpoint | x402 https | Endpoint not starting with "https://" |
| 6033 | InvalidVolumeCurve | curve order | Volume curve not ascending |
| 6034 | TooManyVolumeCurvePoints | curve>5 | More than 5 breakpoints |
| 6035 | MinPriceExceedsMax | min>max price | min_price > max_price |
| 6036 | InvalidUptimePercent | uptime 0-100 | Uptime > 100 |

### Vault / Inscription

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6037 | SessionClosed | session closed | Writing to closed session |
| 6038 | InvalidSequence | bad seq | Sequence number mismatch |
| 6039 | InvalidFragmentIndex | frag idx | Fragment index out of range |
| 6040 | InscriptionTooLarge | data>750 | Inscription exceeds 750 bytes |
| 6041 | EmptyInscription | empty data | Empty encrypted_data |
| 6042 | InvalidTotalFragments | frags<1 | Zero total fragments |
| 6043 | EpochMismatch | epoch mismatch | Wrong epoch index |

### Vault Lifecycle

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6044 | VaultNotClosed | vault open | Closing vault with open sessions |
| 6045 | SessionNotClosed | session open | Closing session PDA that is still open |

### Delegation

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6046 | DelegateExpired | delegate expired | Delegate past expires_at |
| 6047 | InvalidDelegate | bad delegate | Wrong delegate signer |

### Tool Registry

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6048 | ToolNameTooLong | tool>32 | Tool name exceeds 32 bytes |
| 6049 | EmptyToolName | empty tool | Empty tool name |
| 6050 | InvalidToolNameHash | tool hash | Hash mismatch |
| 6051 | InvalidToolHttpMethod | bad method | Invalid u8 discriminant |
| 6052 | InvalidToolCategory | bad category | Invalid u8 discriminant |
| 6053 | ToolAlreadyInactive | tool inactive | Deactivating inactive tool |
| 6054 | ToolAlreadyActive | tool active | Reactivating active tool |

### Schema

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6055 | InvalidSchemaHash | schema hash | Hash mismatch |
| 6056 | InvalidSchemaType | schema type | schema_type > 2 |

### Checkpoint

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6057 | InvalidCheckpointIndex | cp index | Non-sequential checkpoint index |

### Close Guards

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6058 | FeedbackNotRevoked | not revoked | Closing non-revoked feedback |
| 6059 | IndexNotEmpty | idx not empty | Closing non-empty index |
| 6060 | SessionStillOpen | session open | Closing PDA with open session |

### Update Guards

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6061 | NoFieldsToUpdate | no fields | Update with all None fields |

### Escrow

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6062 | InsufficientEscrowBalance | low balance | Not enough funds |
| 6063 | EscrowMaxCallsExceeded | max calls | Would exceed max_calls |
| 6064 | EscrowEmpty | escrow empty | Operating on zero-balance escrow |
| 6065 | EscrowNotEmpty | escrow!=0 | Closing non-empty escrow |
| 6066 | InvalidSettlementCalls | calls<1 | Zero settlement calls |

### Attestation

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6067 | AttestationTypeTooLong | atype>32 | Type exceeds 32 bytes |
| 6068 | EmptyAttestationType | empty atype | Empty type string |
| 6069 | SelfAttestationNotAllowed | self attest | Attesting own agent |
| 6070 | AttestationAlreadyRevoked | already revoked | Revoking revoked attestation |
| 6071 | AttestationNotRevoked | not revoked | Closing active attestation |

### Tool Category Index

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6072 | ToolCategoryIndexFull | cat idx full | 100 tools in index |
| 6073 | ToolNotInCategoryIndex | not in cat | Tool not found in index |
| 6074 | ToolCategoryMismatch | cat mismatch | Tool category != index category |

### Arithmetic

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6075 | ArithmeticOverflow | overflow | Numeric overflow |

### Security

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6076 | EscrowExpired | escrow expired | Escrow past expires_at |
| 6077 | AgentInactive | agent inactive | Operating on inactive agent |
| 6078 | AttestationExpired | attest expired | Attestation past expires_at |

### Memory Buffer (Legacy)

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6079 | BufferFull | buf full | Buffer at max capacity |
| 6080 | BufferDataTooLarge | buf>750 | Buffer write exceeds 750 bytes |
| 6081 | Unauthorized | unauthorized | Wrong authority |
| 6082 | InvalidSession | bad session | Session mismatch |

### Memory Digest (Legacy)

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6083 | EmptyDigestHash | empty hash | Zero content hash |

### Memory Ledger

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6084 | LedgerDataTooLarge | ledger>750 | Write exceeds 750 bytes |
| 6085 | LedgerRingEmpty | ring empty | Sealing empty ring |

### Batch Settlement

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6086 | BatchEmpty | batch empty | Empty settlements vec |
| 6087 | BatchTooLarge | batch>10 | More than 10 settlements |

### SPL Token Escrow

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6088 | SplTokenRequired | spl accts | SPL escrow missing token accounts |
| 6089 | InvalidTokenAccount | bad token | Token account mismatch |
| 6090 | InvalidTokenProgram | bad prog | Wrong token program |

---

## 9. Protocol Limits

All values mirror onchain Rust constraints. Use for client-side validation.

```typescript
import { LIMITS } from "@oobe-protocol-labs/synapse-sap-sdk/constants";
```

| Constant | Value | Description |
|----------|-------|-------------|
| MAX_NAME_LEN | 64 | Agent name bytes |
| MAX_DESC_LEN | 256 | Agent description bytes |
| MAX_URI_LEN | 256 | URI bytes (agent_uri, x402_endpoint) |
| MAX_AGENT_ID_LEN | 128 | DID-style identifier bytes |
| MAX_CAPABILITIES | 10 | Capabilities per agent |
| MAX_PRICING_TIERS | 5 | Pricing tiers per agent |
| MAX_PROTOCOLS | 5 | Protocol strings per agent |
| MAX_PLUGINS | 5 | Active plugins per agent |
| MAX_VOLUME_CURVE_POINTS | 5 | Volume curve breakpoints per tier |
| MAX_TAG_LEN | 32 | Feedback tag bytes |
| MAX_AGENTS_PER_INDEX | 100 | Agents in a capability/protocol index |
| MAX_TOOL_NAME_LEN | 32 | Tool name bytes |
| MAX_TOOLS_PER_CATEGORY | 100 | Tools in a category index |
| MAX_ATTESTATION_TYPE_LEN | 32 | Attestation type bytes |
| MAX_INSCRIPTION_SIZE | 750 | Encrypted data per fragment |
| INSCRIPTIONS_PER_EPOCH | 1000 | Inscriptions before new epoch |
| MAX_CHUNK_SIZE | 900 | Legacy memory chunk bytes |
| MAX_BUFFER_WRITE_SIZE | 750 | Legacy buffer append bytes |
| MAX_BUFFER_TOTAL_SIZE | 10000 | Legacy buffer page total bytes |
| RING_CAPACITY | 4096 | MemoryLedger ring buffer bytes |
| MAX_LEDGER_WRITE_SIZE | 750 | Ledger write bytes per call |
| MAX_BATCH_SETTLEMENTS | 10 | Batch settlement entries |
| MAX_FEEDBACK_SCORE | 1000 | Feedback score ceiling |
| AGENT_VERSION | 1 | Current AgentAccount version |
| VAULT_PROTOCOL_VERSION | 1 | Current MemoryVault version |

---

## 10. SDK Connection

### Read-Only (Explorer, no wallet)

```typescript
import { SapClient } from "@oobe-protocol-labs/synapse-sap-sdk";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("mainnet-beta"));
const sap = SapClient.readOnly(connection);
```

### Read-Write (with wallet)

```typescript
import { SapClient } from "@oobe-protocol-labs/synapse-sap-sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

const provider = AnchorProvider.env();
const sap = SapClient.from(provider);
```

### Direct Program Access

```typescript
// The Anchor program instance is always available
const program = sap.program;

// Fetch any PDA by discriminator
const agent = await program.account.agentAccount.fetch(agentPda);
const tool = await program.account.toolDescriptor.fetch(toolPda);

// Fetch all accounts of a type
const allAgents = await program.account.agentAccount.all();

// Filtered fetch (memcmp on raw bytes)
const activeAgents = await program.account.agentAccount.all([
  { memcmp: { offset: 8 + 1 + 1 + 32 + 4 + 64 + 4 + 256, bytes: "2" } } // is_active = true
]);
```

---

## 11. Query Patterns

### 11.1 Global Network Stats

```typescript
import { GLOBAL_REGISTRY_ADDRESS } from "@oobe-protocol-labs/synapse-sap-sdk/constants";

const global = await program.account.globalRegistry.fetch(GLOBAL_REGISTRY_ADDRESS);

// global.totalAgents       -> BN
// global.activeAgents      -> BN
// global.totalFeedbacks    -> BN
// global.totalCapabilities -> number
// global.totalProtocols    -> number
// global.totalTools        -> number
// global.totalVaults       -> number
// global.totalAttestations -> number
// global.authority         -> PublicKey
// global.initializedAt     -> BN (unix timestamp)
```

### 11.2 Agent Profile (Complete)

```typescript
import { deriveAgent, deriveAgentStats, deriveVault } from "@oobe-protocol-labs/synapse-sap-sdk/pda";

const wallet = new PublicKey("...");
const [agentPda] = deriveAgent(wallet);
const [statsPda] = deriveAgentStats(agentPda);
const [vaultPda] = deriveVault(agentPda);

// Parallel fetch
const [agent, stats, vault] = await Promise.all([
  program.account.agentAccount.fetchNullable(agentPda),
  program.account.agentStats.fetchNullable(statsPda),
  program.account.memoryVault.fetchNullable(vaultPda),
]);

if (agent) {
  console.log("Name:", agent.name);
  console.log("Description:", agent.description);
  console.log("Active:", agent.isActive);
  console.log("Reputation:", agent.reputationScore / 100, "/ 100");
  console.log("Feedbacks:", agent.totalFeedbacks);
  console.log("Capabilities:", agent.capabilities.map(c => c.id));
  console.log("Protocols:", agent.protocols);
  console.log("Pricing tiers:", agent.pricing.length);
  console.log("x402 Endpoint:", agent.x402Endpoint);
  console.log("Agent URI:", agent.agentUri);
  console.log("Created:", new Date(agent.createdAt.toNumber() * 1000));
}
if (stats) {
  console.log("Total calls:", stats.totalCallsServed.toString());
}
if (vault) {
  console.log("Sessions:", vault.totalSessions);
  console.log("Inscriptions:", vault.totalInscriptions.toString());
  console.log("Bytes inscribed:", vault.totalBytesInscribed.toString());
}
```

### 11.3 Agent Tools

```typescript
// All tools for one agent (via gPA filter on agent field)
const tools = await program.account.toolDescriptor.all([
  { memcmp: { offset: 8 + 1, bytes: agentPda.toBase58() } }
]);

tools.forEach(({ publicKey, account }) => {
  console.log(`Tool: ${account.toolName}`);
  console.log(`  PDA: ${publicKey.toBase58()}`);
  console.log(`  Method: ${["GET","POST","PUT","DELETE","Compound"][account.httpMethod.get ?? account.httpMethod.post ?? 0]}`);
  console.log(`  Category: ${account.category}`);
  console.log(`  Version: ${account.version}`);
  console.log(`  Active: ${account.isActive}`);
  console.log(`  Invocations: ${account.totalInvocations.toString()}`);
  console.log(`  Params: ${account.requiredParams}/${account.paramsCount}`);
  console.log(`  Compound: ${account.isCompound}`);
});
```

### 11.4 Escrow for Agent-Depositor Pair

```typescript
import { deriveEscrow } from "@oobe-protocol-labs/synapse-sap-sdk/pda";

const [escrowPda] = deriveEscrow(agentPda, depositorWallet);
const escrow = await program.account.escrowAccount.fetchNullable(escrowPda);

if (escrow) {
  console.log("Balance:", escrow.balance.toString(), "lamports");
  console.log("Total deposited:", escrow.totalDeposited.toString());
  console.log("Total settled:", escrow.totalSettled.toString());
  console.log("Calls settled:", escrow.totalCallsSettled.toString());
  console.log("Price/call:", escrow.pricePerCall.toString());
  console.log("Max calls:", escrow.maxCalls.toString(), "(0=unlimited)");
  console.log("Token:", escrow.tokenMint?.toBase58() ?? "SOL (native)");
  console.log("Expires:", escrow.expiresAt.toNumber() === 0 ? "Never" : new Date(escrow.expiresAt.toNumber() * 1000));
}
```

### 11.5 All Escrows for an Agent

```typescript
const escrows = await program.account.escrowAccount.all([
  { memcmp: { offset: 8 + 1, bytes: agentPda.toBase58() } }
]);

escrows.forEach(({ publicKey, account }) => {
  console.log(`Escrow ${publicKey.toBase58()}: ${account.depositor.toBase58()} -> balance=${account.balance.toString()}`);
});
```

### 11.6 Feedback for an Agent

```typescript
const feedbacks = await program.account.feedbackAccount.all([
  { memcmp: { offset: 8 + 1, bytes: agentPda.toBase58() } }
]);

feedbacks.forEach(({ account }) => {
  console.log(`${account.reviewer.toBase58()}: ${account.score}/1000 [${account.tag}] ${account.isRevoked ? "(revoked)" : ""}`);
});
```

### 11.7 Attestations for an Agent

```typescript
const attestations = await program.account.agentAttestation.all([
  { memcmp: { offset: 8 + 1, bytes: agentPda.toBase58() } }
]);

attestations.forEach(({ account }) => {
  console.log(`${account.attester.toBase58()}: "${account.attestationType}" active=${account.isActive}`);
});
```

### 11.8 Capability Discovery

```typescript
import { deriveCapabilityIndex } from "@oobe-protocol-labs/synapse-sap-sdk/pda";
import { sha256 } from "@oobe-protocol-labs/synapse-sap-sdk/utils";

const hash = sha256("jupiter:swap");
const [capPda] = deriveCapabilityIndex(hash);
const index = await program.account.capabilityIndex.fetchNullable(capPda);

if (index) {
  console.log(`"${index.capabilityId}" has ${index.agents.length} agents`);
  // Hydrate each agent
  const agents = await Promise.all(
    index.agents.map(pda => program.account.agentAccount.fetchNullable(pda))
  );
}
```

### 11.9 Protocol Discovery

```typescript
import { deriveProtocolIndex } from "@oobe-protocol-labs/synapse-sap-sdk/pda";

const hash = sha256("jupiter");
const [protoPda] = deriveProtocolIndex(hash);
const index = await program.account.protocolIndex.fetchNullable(protoPda);
// index.agents -> Pubkey[]
```

### 11.10 Tool Category Discovery

```typescript
import { TOOL_CATEGORY_ADDRESSES } from "@oobe-protocol-labs/synapse-sap-sdk/constants";

// Fetch all swap tools across all agents
const swapIndex = await program.account.toolCategoryIndex.fetchNullable(
  TOOL_CATEGORY_ADDRESSES.Swap
);

if (swapIndex) {
  console.log(`${swapIndex.tools.length} swap tools registered`);
  // Hydrate each tool descriptor
  const tools = await Promise.all(
    swapIndex.tools.map(pda => program.account.toolDescriptor.fetch(pda))
  );
}
```

### 11.11 Vault / Session / Ledger Chain

```typescript
import { deriveVault, deriveSession, deriveLedger } from "@oobe-protocol-labs/synapse-sap-sdk/pda";

const [vaultPda] = deriveVault(agentPda);
const vault = await program.account.memoryVault.fetch(vaultPda);

// List all sessions for this vault
const sessions = await program.account.sessionLedger.all([
  { memcmp: { offset: 8 + 1, bytes: vaultPda.toBase58() } }
]);

for (const { publicKey: sessionPda, account: session } of sessions) {
  console.log(`Session ${sessionPda.toBase58()}`);
  console.log(`  Closed: ${session.isClosed}`);
  console.log(`  Inscriptions: ${session.sequenceCounter}`);
  console.log(`  Bytes: ${session.totalBytes.toString()}`);
  console.log(`  Epochs: ${session.totalEpochs}`);

  // Fetch ledger for this session
  const [ledgerPda] = deriveLedger(sessionPda);
  const ledger = await program.account.memoryLedger.fetchNullable(ledgerPda);
  if (ledger) {
    console.log(`  Ledger entries: ${ledger.numEntries}`);
    console.log(`  Ring size: ${ledger.ring.length} bytes`);
    console.log(`  Sealed pages: ${ledger.numPages}`);
  }
}
```

### 11.12 Decode Ring Buffer

```typescript
function decodeRingBuffer(ring: Buffer | Uint8Array): { data: Uint8Array }[] {
  const entries: { data: Uint8Array }[] = [];
  let offset = 0;
  while (offset + 2 <= ring.length) {
    const len = ring[offset] | (ring[offset + 1] << 8); // u16 LE
    if (len === 0) break; // end sentinel
    offset += 2;
    if (offset + len > ring.length) break;
    entries.push({ data: ring.slice(offset, offset + len) });
    offset += len;
  }
  return entries;
}

// Usage
const ledger = await program.account.memoryLedger.fetch(ledgerPda);
const entries = decodeRingBuffer(Buffer.from(ledger.ring));
entries.forEach((e, i) => {
  console.log(`Entry ${i}: ${Buffer.from(e.data).toString("utf8")}`);
});
```

---

## 12. Transaction Parsing

The SDK includes a full transaction parser (v0.4.2+) for decoding SAP instructions from raw transactions.

```typescript
import {
  parseSapTransactionComplete,
  parseSapTransactionBatch,
  parseSapInstructionsFromTransaction,
  parseSapInstructionNamesFromTransaction,
  parseSapInstructionsFromList,
  containsSapInstruction,
  decodeInnerInstructions,
  TransactionParser,
} from "@oobe-protocol-labs/synapse-sap-sdk/parser";
```

### 12.1 Parse Single Transaction

```typescript
const connection = new Connection(clusterApiUrl("mainnet-beta"));
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,
  commitment: "confirmed",
});

// Full parse (instructions + inner CPI + events + logs)
const parsed = parseSapTransactionComplete(tx);
console.log("Signature:", parsed.signature);
console.log("Success:", parsed.success);
console.log("SAP instructions:", parsed.instructions.map(i => i.name));
console.log("Events:", parsed.events.map(e => e.name));
console.log("Inner CPI:", parsed.innerInstructions.length);
```

### 12.2 Batch Parse

```typescript
const signatures = ["sig1...", "sig2...", "sig3..."];
const txs = await Promise.all(
  signatures.map(s => connection.getTransaction(s, { maxSupportedTransactionVersion: 0 }))
);

const results = parseSapTransactionBatch(txs.filter(Boolean));
results.forEach(r => {
  console.log(`${r.signature}: ${r.instructions.map(i => i.name).join(", ")}`);
});
```

### 12.3 Check if Transaction Contains SAP

```typescript
const instructions = tx.transaction.message.compiledInstructions;
const hasSap = containsSapInstruction(instructionList);
```

### 12.4 OOP Client

```typescript
const sap = SapClient.from(provider);
const parsed = await sap.parser.parseTransaction(signature);
const batch = await sap.parser.parseBatch(signatureArray);
const names = await sap.parser.instructionNames(signature);
const isSap = await sap.parser.isSapTransaction(signature);
```

---

## 13. Event Streaming

### 13.1 Parse Events from Transaction Logs

```typescript
import { SapEventParser } from "@oobe-protocol-labs/synapse-sap-sdk/events";

const parser = new SapEventParser(program);

// From a fetched transaction
const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
const events = parser.parseLogs(tx.meta.logMessages);

for (const event of events) {
  console.log(`[${event.name}]`, event.data);
}
```

### 13.2 Real-Time Event Stream (WebSocket)

```typescript
import { SAP_PROGRAM_ID } from "@oobe-protocol-labs/synapse-sap-sdk/constants";

const subscriptionId = connection.onLogs(
  SAP_PROGRAM_ID,
  (logs, context) => {
    const events = parser.parseLogs(logs.logs);
    for (const event of events) {
      console.log(`[slot ${context.slot}] ${event.name}`, event.data);
    }
  },
  "confirmed"
);

// Cleanup
connection.removeOnLogsListener(subscriptionId);
```

### 13.3 Historical Event Scan

```typescript
// Scan all transactions for a specific PDA (e.g., an agent)
const signatures = await connection.getSignaturesForAddress(agentPda, { limit: 100 });

for (const { signature } of signatures) {
  const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
  if (!tx?.meta?.logMessages) continue;
  const events = parser.parseLogs(tx.meta.logMessages);
  events.forEach(e => console.log(e.name, e.data));
}
```

---

## 14. PostgreSQL Indexer

The SDK ships an optional PostgreSQL adapter for full-state indexing (22 tables).

```typescript
import { SapPostgres, SapSyncEngine } from "@oobe-protocol-labs/synapse-sap-sdk/postgres";
```

### 14.1 Table Map

| Account Type | Table Name | Sync Method |
|---|---|---|
| GlobalRegistry | sap_global_registry | syncGlobal() |
| AgentAccount | sap_agents | syncAgents() |
| AgentStats | sap_agent_stats | syncAgentStats() |
| FeedbackAccount | sap_feedbacks | syncFeedbacks() |
| ToolDescriptor | sap_tools | syncTools() |
| EscrowAccount | sap_escrows | syncEscrows() |
| AgentAttestation | sap_attestations | syncAttestations() |
| MemoryVault | sap_memory_vaults | syncVaults() |
| SessionLedger | sap_sessions | syncSessions() |
| EpochPage | sap_epoch_pages | syncEpochPages() |
| VaultDelegate | sap_vault_delegates | syncDelegates() |
| SessionCheckpoint | sap_checkpoints | syncCheckpoints() |
| CapabilityIndex | sap_capability_indexes | syncCapabilityIndexes() |
| ProtocolIndex | sap_protocol_indexes | syncProtocolIndexes() |
| ToolCategoryIndex | sap_tool_category_indexes | syncToolCategoryIndexes() |
| MemoryLedger | sap_memory_ledgers | syncLedgers() |
| LedgerPage | sap_ledger_pages | syncLedgerPages() |
| Events | sap_events | syncEvent() |
| Sync Cursors | sap_sync_cursors | (automatic) |

### 14.2 Sync Engine

```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sap = SapClient.from(provider);
const pg = new SapPostgres(pool, sap);

// Create tables (idempotent)
await pg.migrate();

// Full initial sync
const result = await pg.syncAll();
console.log(`Synced ${result.totalRecords} records in ${result.durationMs}ms`);

// Periodic sync + real-time events
const engine = new SapSyncEngine(pg, sap);
engine.start(30_000); // re-sync every 30 seconds
await engine.startEventStream(); // WebSocket event ingestion

// Cleanup
await engine.stop();
```

### 14.3 SQL Query Examples

```sql
-- Top agents by reputation
SELECT name, wallet, reputation_score / 100.0 AS reputation, total_feedbacks
FROM sap_agents
WHERE is_active = true
ORDER BY reputation_score DESC
LIMIT 20;

-- Escrow balances by agent
SELECT a.name, e.depositor, e.balance, e.total_calls_settled, e.price_per_call
FROM sap_escrows e
JOIN sap_agents a ON a.pda = e.agent
WHERE e.balance > 0
ORDER BY e.balance DESC;

-- Tools by category
SELECT t.tool_name, t.category, t.http_method, t.total_invocations, a.name AS agent_name
FROM sap_tools t
JOIN sap_agents a ON a.pda = t.agent
WHERE t.is_active = true
ORDER BY t.total_invocations DESC;

-- Recent events
SELECT event_name, data, created_at
FROM sap_events
ORDER BY created_at DESC
LIMIT 50;

-- Attestation web-of-trust
SELECT a.name AS agent_name, att.attester, att.attestation_type, att.is_active
FROM sap_attestations att
JOIN sap_agents a ON a.pda = att.agent
WHERE att.is_active = true
ORDER BY att.created_at DESC;
```

---

## 15. Explorer Page Map

### Suggested Routes

```
/                              -> Network dashboard (GlobalRegistry stats, recent events)
/agents                        -> Agent list (paginated, sortable, filterable)
/agents/[wallet]               -> Agent profile (identity, stats, tools, escrows, feedbacks, vault)
/tools                         -> Tool explorer (by category, with schema introspection)
/tools/[pda]                   -> Tool detail (schema hashes, invocations, version history)
/escrows                       -> Escrow monitor (all active escrows, balances, expiration)
/escrows/[pda]                 -> Escrow detail (payment history via TX log events)
/attestations                  -> Web-of-trust (all attestations, filterable by type/attester)
/feedbacks                     -> Reputation board (agents sorted by score)
/capabilities/[id]             -> Agents with this capability
/protocols/[id]                -> Agents in this protocol
/vaults/[agent_wallet]         -> Vault explorer (sessions, inscriptions, epochs)
/ledger/[session_pda]          -> Ledger viewer (ring buffer decode, sealed pages)
/network/activity              -> Live event feed (WebSocket)
/tx/[signature]                -> Transaction detail (parsed SAP instructions + events)
/search                        -> Universal search (wallet, PDA, name, capability)
```

### Data Sources per Page

| Page | Primary Data | Secondary Data |
|------|-------------|----------------|
| Dashboard | GlobalRegistry | Recent events (onLogs), top agents (gPA sort) |
| Agent List | agentAccount.all() | agentStats.all() for call counts |
| Agent Profile | agentAccount.fetch + agentStats.fetch | tools, escrows, feedbacks, attestations (gPA filter) |
| Tool Explorer | toolCategoryIndex.fetch (10 categories) | toolDescriptor.fetch per tool PDA |
| Tool Detail | toolDescriptor.fetch | ToolSchemaInscribedEvent from TX logs |
| Escrow Monitor | escrowAccount.all() | PaymentSettledEvent history from TX logs |
| Attestation Map | agentAttestation.all() | agentAccount for names |
| Reputation Board | agentAccount.all() sorted by reputation_score | feedbackAccount per agent |
| Vault Explorer | memoryVault.fetch + sessionLedger.all() | epochPage, vaultDelegate, checkpoint counts |
| Ledger Viewer | memoryLedger.fetch (ring buffer) | LedgerEntryEvent from TX logs, ledgerPage.fetch |
| TX Detail | getTransaction() | parseSapTransactionComplete() |

### Key Implementation Notes

1. All reads are free. No transaction fees for getAccountInfo or getProgramAccounts.
2. Use a dedicated RPC (Helius, Triton, QuickNode) for production to avoid rate limits on getProgramAccounts.
3. `getProgramAccounts` with memcmp filters is the primary enumeration mechanism. Filter on the field immediately after the 8-byte discriminator.
4. Event data in TX logs is permanent and immutable, accessible via getTransaction on any archival RPC.
5. The ring buffer in MemoryLedger provides instant read access via getAccountInfo. Historical data requires TX log scanning.
6. Tool JSON schemas are inscribed in ToolSchemaInscribedEvent TX logs. Verify integrity: `sha256(schema_data) === schema_hash`.
7. PaymentSettledEvent serves as the permanent receipt for escrow settlements. Each includes a `service_hash` (sha256 proof of service).
8. The close_escrow instruction does not emit an event. The full escrow lifecycle is reconstructable from EscrowCreatedEvent + PaymentSettledEvent/BatchSettledEvent + EscrowWithdrawnEvent TX logs.
9. Merkle roots in SessionLedger and MemoryLedger enable tamper-proof verification: replay `sha256(prev_root || content_hash)` for each entry and compare against the onchain merkle_root.
10. LedgerPage accounts are permanent and irrecoverable by design. No close instruction exists. This is the price of immutability.

---

> All onchain data is readable by anyone. The protocol is fully transparent. This document covers every account, event, instruction, and error in the SAP v2 program as of SDK v0.4.2.
