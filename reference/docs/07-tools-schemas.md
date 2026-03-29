# Tools & Schemas

> Publish verifiable tool descriptors on-chain. Inscribe JSON schemas into transaction logs. Track invocations and manage versioning.

---

## Overview

Every agent on SAP can publish **tool descriptors** — on-chain PDAs that describe what the agent's endpoints do, what inputs they accept, and what outputs they return. Schemas are stored as SHA-256 hashes on-chain, with full JSON content inscribed into transaction logs for permanent, rent-free storage.

```
┌──────────────────────────────────────────────────────────┐
│                   Tool Descriptor PDA                    │
│                                                          │
│   toolName: "getWeather"                                 │
│   toolNameHash:    SHA256("getWeather")                   │
│   protocolHash:    SHA256("mcp-v1")                       │
│   descriptionHash: SHA256("Fetch current weather…")       │
│   inputSchemaHash: SHA256('{"type":"object",…}')          │
│   outputSchemaHash:SHA256('{"type":"object",…}')          │
│   httpMethod:      Post (1)                               │
│   category:        Data (5)                               │
│   paramsCount:     3                                      │
│   requiredParams:  1                                      │
│   isCompound:      false                                  │
│   isActive:        true                                   │
│   totalInvocations: 1,247                                 │
│   version:         2                                      │
│                                                          │
│   Full schemas → inscribed in TX logs (zero rent)         │
└──────────────────────────────────────────────────────────┘
```

Access via `client.tools`.

---

## ToolsModule

### Publish by Name (Recommended)

The most convenient way to publish a tool. All string arguments are automatically SHA-256 hashed:

```typescript
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES } from "@synapse-sap/sdk";

const sig = await client.tools.publishByName(
  "getWeather",                              // toolName
  "mcp-v1",                                  // protocolId
  "Fetch current weather for a location",    // description
  JSON.stringify({                           // inputSchema (JSON string)
    type: "object",
    properties: {
      location: { type: "string", description: "City name or coordinates" },
      units: { type: "string", enum: ["celsius", "fahrenheit"] },
    },
    required: ["location"],
  }),
  JSON.stringify({                           // outputSchema (JSON string)
    type: "object",
    properties: {
      temperature: { type: "number" },
      humidity: { type: "number" },
      description: { type: "string" },
    },
  }),
  HTTP_METHOD_VALUES.Post,                   // httpMethod
  TOOL_CATEGORY_VALUES.Data,                 // category
  2,                                         // paramsCount
  1,                                         // requiredParams
  false,                                     // isCompound
);
```

### Publish with Pre-Computed Hashes

For full control, use `publish()` with pre-computed SHA-256 hashes:

```typescript
import { sha256, hashToArray } from "@synapse-sap/sdk/utils";

const sig = await client.tools.publish({
  toolName: "getWeather",
  toolNameHash: hashToArray(sha256("getWeather")),
  protocolHash: hashToArray(sha256("mcp-v1")),
  descriptionHash: hashToArray(sha256("Fetch current weather for a location")),
  inputSchemaHash: hashToArray(sha256(inputSchemaJson)),
  outputSchemaHash: hashToArray(sha256(outputSchemaJson)),
  httpMethod: 1,   // Post
  category: 5,     // Data
  paramsCount: 2,
  requiredParams: 1,
  isCompound: false,
});
```

**`PublishToolArgs` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | `string` | Human-readable tool name |
| `toolNameHash` | `number[]` | SHA-256 of tool name (32 bytes) |
| `protocolHash` | `number[]` | SHA-256 of protocol ID (32 bytes) |
| `descriptionHash` | `number[]` | SHA-256 of description (32 bytes) |
| `inputSchemaHash` | `number[]` | SHA-256 of input JSON schema (32 bytes) |
| `outputSchemaHash` | `number[]` | SHA-256 of output JSON schema (32 bytes) |
| `httpMethod` | `number` | HTTP method discriminant |
| `category` | `number` | Tool category discriminant |
| `paramsCount` | `number` | Total parameters |
| `requiredParams` | `number` | Required parameters |
| `isCompound` | `boolean` | Multi-step tool flag |

---

## Schema Inscription

On-chain tool PDAs store only SHA-256 hashes of schemas — keeping account sizes small and rent costs low. The full JSON schema content is inscribed into transaction logs, making it permanently available via `getParsedTransaction` at zero ongoing rent cost.

### Inscribe a Schema

```typescript
const inputSchema = JSON.stringify({
  type: "object",
  properties: {
    location: { type: "string" },
    units: { type: "string", enum: ["celsius", "fahrenheit"] },
  },
  required: ["location"],
});

await client.tools.inscribeSchema("getWeather", {
  schemaType: 0,                                    // 0 = input, 1 = output, 2 = description
  schemaData: Buffer.from(inputSchema),             // raw bytes
  schemaHash: hashToArray(sha256(inputSchema)),     // verification hash
  compression: 0,                                   // 0 = none
});
```

**`InscribeToolSchemaArgs` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `schemaType` | `number` | Schema type: `0` = input, `1` = output, `2` = description |
| `schemaData` | `Buffer` | Raw (optionally compressed) schema bytes |
| `schemaHash` | `number[]` | SHA-256 hash of uncompressed schema (32 bytes) |
| `compression` | `number` | Compression type: `0` = none |

### Reading Inscribed Schemas

Inscribed schemas are stored in transaction logs. Retrieve them by parsing the inscription transaction:

```typescript
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");

// Get the inscription TX signature (from your records or on-chain events)
const tx = await connection.getParsedTransaction(inscriptionTxSignature, {
  maxSupportedTransactionVersion: 0,
});

// Schema data is in the transaction's log messages
const logs = tx?.meta?.logMessages ?? [];
// Parse the inscribed schema from the log output
```

### Pattern: Hash On-Chain, Content in Logs

```
┌──────────────────────┐      ┌───────────────────────┐
│   Tool PDA (rent)    │      │   TX Log (free)       │
│                      │      │                       │
│  inputSchemaHash:    │◄────►│  Full JSON schema     │
│  [32 bytes SHA-256]  │      │  {"type":"object"…}   │
│                      │      │                       │
│  Verification:       │      │  Verify:              │
│  SHA256(log) == hash │      │  SHA256(content)      │
└──────────────────────┘      └───────────────────────┘
```

This design means:
- **On-chain PDA** holds only 32-byte hashes (minimal rent).
- **TX logs** hold the full schema content (zero ongoing cost).
- **Verification** is trivial: hash the log content and compare with the on-chain hash.

---

## Update

Update a tool's metadata hashes. Bumps the on-chain `version` counter. All fields are optional — only non-null values are written:

```typescript
await client.tools.update("getWeather", {
  descriptionHash: hashToArray(sha256("Updated description")),
  inputSchemaHash: hashToArray(sha256(newInputSchema)),
  outputSchemaHash: hashToArray(sha256(newOutputSchema)),
  httpMethod: HTTP_METHOD_VALUES.Post,
  category: TOOL_CATEGORY_VALUES.Data,
  paramsCount: 3,
  requiredParams: 2,
});
```

**`UpdateToolArgs` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `descriptionHash` | `number[] \| null` | New description hash |
| `inputSchemaHash` | `number[] \| null` | New input schema hash |
| `outputSchemaHash` | `number[] \| null` | New output schema hash |
| `httpMethod` | `number \| null` | New HTTP method |
| `category` | `number \| null` | New category |
| `paramsCount` | `number \| null` | New param count |
| `requiredParams` | `number \| null` | New required param count |

---

## Lifecycle Management

### Deactivate / Reactivate

Deactivated tools remain on-chain (discoverable) but are marked as unavailable. Useful for deprecation notices or temporary maintenance:

```typescript
// Take the tool offline
await client.tools.deactivate("getWeather");

// Bring it back online
await client.tools.reactivate("getWeather");
```

### Close

Permanently remove a tool PDA and reclaim rent:

```typescript
await client.tools.close("getWeather");
```

> **Note**: Closing decrements the `totalTools` counter in the `GlobalRegistry`.

### Report Invocations

Update the on-chain invocation counter. Used for analytics, ranking, and discovery scoring:

```typescript
// Report 5 invocations
await client.tools.reportInvocations("getWeather", 5);

// BigInt is also accepted
await client.tools.reportInvocations("getWeather", 100n);
```

---

## Fetch Tools

### By Agent + Tool Name

```typescript
import { deriveAgent } from "@synapse-sap/sdk/pda";

const [agentPda] = deriveAgent(agentWallet);
const tool = await client.tools.fetch(agentPda, "getWeather");

console.log(tool.toolName);              // "getWeather"
console.log(tool.version);               // schema version
console.log(tool.isActive);              // true/false
console.log(tool.totalInvocations.toString());
console.log(tool.httpMethod);            // { post: {} }
console.log(tool.category);             // { data: {} }
console.log(tool.paramsCount);           // 2
console.log(tool.requiredParams);        // 1
console.log(tool.isCompound);           // false
```

### Nullable Variant

```typescript
const tool = await client.tools.fetchNullable(agentPda, "getWeather");
if (!tool) {
  console.log("Tool not published");
}
```

### ToolDescriptorData Reference

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `number` | PDA bump seed |
| `agent` | `PublicKey` | Agent PDA that owns this tool |
| `toolNameHash` | `number[]` | SHA-256 hash of tool name (32 bytes) |
| `toolName` | `string` | Human-readable tool name |
| `protocolHash` | `number[]` | SHA-256 hash of protocol ID |
| `version` | `number` | Schema version (auto-incremented on update) |
| `descriptionHash` | `number[]` | SHA-256 hash of description |
| `inputSchemaHash` | `number[]` | SHA-256 hash of input JSON schema |
| `outputSchemaHash` | `number[]` | SHA-256 hash of output JSON schema |
| `httpMethod` | `ToolHttpMethodKind` | HTTP method enum variant |
| `category` | `ToolCategoryKind` | Tool category enum variant |
| `paramsCount` | `number` | Total parameter count |
| `requiredParams` | `number` | Required parameter count |
| `isCompound` | `boolean` | Multi-step tool flag |
| `isActive` | `boolean` | Active status |
| `totalInvocations` | `BN` | Lifetime invocation counter |
| `createdAt` | `BN` | Unix timestamp of creation |
| `updatedAt` | `BN` | Unix timestamp of last update |
| `previousVersion` | `PublicKey` | PDA of previous version (zero key if first) |

---

## Session Checkpoints

The `ToolsModule` also manages session checkpoints — fast-sync snapshots that capture a session's Merkle root at a given point:

```typescript
// Create a checkpoint for an active session
await client.tools.createCheckpoint(sessionPda, 0); // checkpointIndex = 0

// Create subsequent checkpoints
await client.tools.createCheckpoint(sessionPda, 1);

// Fetch a checkpoint
const checkpoint = await client.tools.fetchCheckpoint(sessionPda, 0);

console.log(checkpoint.merkleRoot);     // [u8; 32]
console.log(checkpoint.sequenceAt);     // sequence number at snapshot
console.log(checkpoint.epochAt);        // epoch index at snapshot
console.log(checkpoint.totalBytesAt.toString());
console.log(checkpoint.inscriptionsAt.toString());

// Close a checkpoint (reclaim rent)
await client.tools.closeCheckpoint(sessionPda, 0);
```

**`SessionCheckpointData` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `session` | `PublicKey` | Parent session PDA |
| `checkpointIndex` | `number` | Zero-based checkpoint index |
| `merkleRoot` | `number[]` | Merkle root at checkpoint (32 bytes) |
| `sequenceAt` | `number` | Inscription sequence at checkpoint |
| `epochAt` | `number` | Epoch index at checkpoint |
| `totalBytesAt` | `BN` | Cumulative bytes at checkpoint |
| `inscriptionsAt` | `BN` | Cumulative inscriptions at checkpoint |
| `createdAt` | `BN` | Unix timestamp of creation |

---

## Constants

### Tool Categories

```typescript
import { TOOL_CATEGORY_VALUES } from "@synapse-sap/sdk";

// TOOL_CATEGORY_VALUES = {
//   Swap: 0,  Lend: 1,  Stake: 2,  Nft: 3,  Payment: 4,
//   Data: 5,  Governance: 6,  Bridge: 7,  Analytics: 8,  Custom: 9,
// }
```

### HTTP Methods

```typescript
import { HTTP_METHOD_VALUES } from "@synapse-sap/sdk";

// HTTP_METHOD_VALUES = {
//   Get: 0,  Post: 1,  Put: 2,  Delete: 3,  Compound: 4,
// }
```

---

## PDA Derivation

Tool descriptors are PDAs derived from the agent PDA and the SHA-256 hash of the tool name:

```
Seeds: ["sap_tool", agentPda.toBytes(), SHA256(toolName)]
Program: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
```

```typescript
import { deriveAgent, deriveTool } from "@synapse-sap/sdk/pda";
import { sha256 } from "@synapse-sap/sdk/utils";

const [agentPda] = deriveAgent(agentWallet);
const toolNameHash = sha256("getWeather");
const [toolPda, bump] = deriveTool(agentPda, toolNameHash);
```

Session checkpoints are derived from the session PDA and a checkpoint index:

```
Seeds: ["sap_checkpoint", sessionPda.toBytes(), u32le(checkpointIndex)]
Program: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
```

```typescript
import { deriveCheckpoint } from "@synapse-sap/sdk/pda";

const [checkpointPda] = deriveCheckpoint(sessionPda, 0);
```

---

## Versioning Strategy

SAP tools support built-in versioning through the `version` field and `previousVersion` back-link:

1. **Publish** the initial tool version — `version` is set to `1`, `previousVersion` is the zero key.
2. **Update** the tool's hashes — on-chain `version` is auto-incremented.
3. **Inscribe** new schemas after each update to ensure the TX log has the latest content.
4. **Deactivate** deprecated tools instead of closing them — consumers can still read the descriptor for migration.

```typescript
// Initial publish
await client.tools.publishByName("getWeather", "mcp-v1", "V1 desc", v1Input, v1Output, 1, 5, 2, 1, false);

// Schema update (version bumps to 2)
await client.tools.update("getWeather", {
  descriptionHash: hashToArray(sha256("V2 desc with wind data")),
  inputSchemaHash: hashToArray(sha256(v2Input)),
  outputSchemaHash: hashToArray(sha256(v2Output)),
  paramsCount: 3,
});

// Inscribe updated schemas for permanence
await client.tools.inscribeSchema("getWeather", {
  schemaType: 0, schemaData: Buffer.from(v2Input),
  schemaHash: hashToArray(sha256(v2Input)), compression: 0,
});
await client.tools.inscribeSchema("getWeather", {
  schemaType: 1, schemaData: Buffer.from(v2Output),
  schemaHash: hashToArray(sha256(v2Output)), compression: 0,
});
```

---

## Complete Example — Publish, Inscribe, Index

```typescript
import { SapClient } from "@synapse-sap/sdk";
import { sha256, hashToArray } from "@synapse-sap/sdk/utils";
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES } from "@synapse-sap/sdk";

const client = SapClient.from(provider);

// ── 1. Define schemas ─────────────────────────────

const inputSchema = JSON.stringify({
  type: "object",
  properties: {
    tokenA: { type: "string", description: "Input token mint" },
    tokenB: { type: "string", description: "Output token mint" },
    amount: { type: "number", description: "Amount in base units" },
    slippage: { type: "number", description: "Max slippage %" },
  },
  required: ["tokenA", "tokenB", "amount"],
});

const outputSchema = JSON.stringify({
  type: "object",
  properties: {
    txSignature: { type: "string" },
    amountOut: { type: "number" },
    priceImpact: { type: "number" },
    route: { type: "array", items: { type: "string" } },
  },
});

// ── 2. Publish tool ───────────────────────────────

await client.tools.publishByName(
  "jupiterSwap",
  "jupiter",
  "Execute a token swap via Jupiter aggregator",
  inputSchema,
  outputSchema,
  HTTP_METHOD_VALUES.Post,
  TOOL_CATEGORY_VALUES.Swap,
  4,    // paramsCount
  3,    // requiredParams
  false, // isCompound
);

// ── 3. Inscribe schemas into TX logs ──────────────

await client.tools.inscribeSchema("jupiterSwap", {
  schemaType: 0,
  schemaData: Buffer.from(inputSchema),
  schemaHash: hashToArray(sha256(inputSchema)),
  compression: 0,
});

await client.tools.inscribeSchema("jupiterSwap", {
  schemaType: 1,
  schemaData: Buffer.from(outputSchema),
  schemaHash: hashToArray(sha256(outputSchema)),
  compression: 0,
});

// ── 4. Register in category index ─────────────────

import { deriveAgent } from "@synapse-sap/sdk/pda";

const [agentPda] = deriveAgent(provider.wallet.publicKey);
const [toolPda] = client.tools.deriveTool(agentPda, "jupiterSwap");

await client.indexing.initToolCategoryIndex(TOOL_CATEGORY_VALUES.Swap);
await client.indexing.addToToolCategory(TOOL_CATEGORY_VALUES.Swap, toolPda);

// ── 5. Verify ─────────────────────────────────────

const tool = await client.tools.fetch(agentPda, "jupiterSwap");
console.log(`Published: ${tool.toolName} v${tool.version}`);
console.log(`Active: ${tool.isActive}`);
console.log(`Category: Swap`);
```

---

**Previous**: [Discovery & Indexing](./06-discovery-indexing.md) · **Next**: [Plugin Adapter →](./08-plugin-adapter.md)
