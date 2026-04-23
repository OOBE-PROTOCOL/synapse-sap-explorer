# RPC & Network

> Connecting to Solana the right way — endpoints, clusters, and production configuration.

Choosing the right RPC endpoint is one of the highest-leverage decisions you'll make. Public RPCs are rate-limited, congested, and not optimized for SAP traffic. This guide walks through the recommended setup and provides fallback options.

---

## Synapse RPC Gateway (Recommended)

**Endpoint**: `https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=`

The Synapse RPC Gateway is the recommended RPC endpoint for all SAP protocol traffic. It's operated by the Oobe Protocol team and optimized for the specific access patterns of on-chain agent infrastructure.

### Why Use the Synapse Gateway

| Feature | Synapse Gateway | Public Solana RPC |
|---------|----------------|-------------------|
| Latency for SAP PDAs | Optimized | Standard |
| Transaction routing | Priority routing for SAP | Best-effort |
| Rate limits | Higher limits | 40 req/s (shared) |
| Solana RPC methods | All standard methods | All standard methods |
| WebSocket support | Yes | Yes |
| Cost | Free tier available | Free (rate-limited) |

### Quick Start

```typescript
import { SapConnection } from "@synapse-sap/sdk";
import { Keypair } from "@solana/web3.js";

// One-liner — returns { client, connection, cluster, programId }
const { client } = SapConnection.fromKeypair(
  "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
  keypair,
);

// Use as normal
await client.agent.register({
  name: "SwapBot",
  description: "AI-powered swap agent",
  capabilities: [],
  pricing: [],
  protocols: ["jupiter"],
});
```

### Synapse Client SDK Integration

If you're already using `@oobe-protocol/synapse-client-sdk`, the gateway endpoint is available as a built-in constant:

```typescript
import { SynapseAgentKit } from "@oobe-protocol-labs/synapse-client-sdk/ai/plugins";
import { createSAPPlugin } from "@synapse-sap/sdk/plugin";

const kit = new SynapseAgentKit({
  rpcUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
}).use(createSAPPlugin({ provider }));
```

---

## SapConnection Factory Methods

The SDK provides convenience factories for every cluster. Each returns a fully-configured `SapConnection` with the correct program ID auto-resolved.

### API Reference

```typescript
import { SapConnection } from "@synapse-sap/sdk";
```

| Method | Endpoint | Cluster | Use Case |
|--------|----------|---------|----------|
| `SapConnection.devnet()` | `https://api.devnet.solana.com` | `devnet` | Testing, prototyping |
| `SapConnection.mainnet(rpcUrl?)` | Custom (or Solana default) | `mainnet-beta` | Production |
| `SapConnection.localnet()` | `http://localhost:8899` | `localnet` | Local development |
| `SapConnection.fromKeypair(url, keypair)` | Custom | Auto-detected | Scripts, bots, CLIs |

### Factory Return Types

```typescript
// Standard factories return SapConnection
const conn: SapConnection = SapConnection.devnet();

// fromKeypair returns SapConnection + client
const result = SapConnection.fromKeypair(url, keypair);
// result.client      → SapClient
// result.connection  → Connection (Solana web3.js)
// result.cluster     → "devnet" | "mainnet-beta" | "localnet"
// result.programId   → PublicKey
```

### Examples

```typescript
// Devnet — for testing
const conn = SapConnection.devnet();
const client = conn.fromKeypair(testKeypair);

// Mainnet — Synapse Gateway (recommended)
const conn = SapConnection.mainnet("https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");
const client = conn.createClient(wallet);

// Mainnet — alternative RPC
const conn = SapConnection.mainnet("https://staging.oobeprotocol.ai/rpc?api_key=");
const client = conn.createClient(wallet);

// Localnet — local validator
const conn = SapConnection.localnet();
const client = conn.fromKeypair(Keypair.generate());
await conn.airdrop(client.walletPubkey, 100); // local airdrop

// fromKeypair — one-liner for any endpoint
const { client } = SapConnection.fromKeypair(
  "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
  keypair,
);
```

### Custom Configuration

For full control, instantiate `SapConnection` directly:

```typescript
const conn = new SapConnection({
  rpcUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=", // api key needed from synapse.oobeprotocol.ai
  wsUrl: "wss://us-1-mainnet.oobeprotocol.ai/ws?api_key=",
  commitment: "finalized",
  cluster: "mainnet-beta",
});
```

| Config Property | Type | Default | Description |
|----------------|------|---------|-------------|
| `rpcUrl` | `string` | — (required) | Solana JSON-RPC endpoint |
| `wsUrl` | `string` | Auto-derived from `rpcUrl` | WebSocket endpoint |
| `commitment` | `Commitment` | `"confirmed"` | Default commitment level |
| `cluster` | `SapCluster` | Auto-detected from URL | Explicit cluster hint |

---

## Cluster Configuration

### Devnet

**Use for**: Testing, prototyping, CI/CD pipelines.

```typescript
const conn = SapConnection.devnet();
```

- Program ID: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
- SOL is free via `conn.airdrop(pubkey, amount)`
- Public RPC is rate-limited (~40 req/s shared across all users)
- Data resets periodically

### Mainnet-Beta

**Use for**: Production deployments.

```typescript
const conn = SapConnection.mainnet("https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");
```

- Program ID: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
- Real SOL — all transactions cost fees
- Use a dedicated RPC provider (see recommendations below)
- Always use `"confirmed"` or `"finalized"` commitment

### Localnet

**Use for**: Development, fast iteration, unit tests.

```typescript
const conn = SapConnection.localnet();
```

- Program ID: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` (unless overridden)
- Requires a running `solana-test-validator`
- Unlimited SOL via airdrop
- Zero network latency

```bash
# Start local validator with SAP program loaded
solana-test-validator \
  --bpf-program SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ \
  ./target/deploy/synapse_agent_sap.so \
  --reset
```

---

## Commitment Levels

Solana offers three commitment levels. Choosing the right one affects latency, reliability, and correctness.

| Level | Latency | Guarantee | When to Use |
|-------|---------|-----------|-------------|
| `processed` | ~400 ms | Optimistic — may be rolled back | Never in production; debug only |
| `confirmed` | ~400 ms | Supermajority voted | Reads, non-critical writes |
| `finalized` | ~6–12 s | Rooted — irreversible | Escrow settlements, attestations, critical state changes |

### SDK Defaults

- `SapConnection` defaults to `"confirmed"` — suitable for most operations.
- Override per-connection when needed:

```typescript
// Standard reads
const conn = SapConnection.mainnet("https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");
// → commitment: "confirmed"

// Critical operations — wait for finality
const conn = new SapConnection({
  rpcUrl: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
  commitment: "finalized",
});
```

### When to Go Finalized

Use `"finalized"` when the consequences of a rollback would be harmful:

- **Escrow deposits and settlements** — real money moves
- **Attestation creation** — trust relationships should be stable
- **Agent registration** — identity PDAs referenced by other accounts
- **Vault delegation** — granting access should be confirmed

---

## Rate Limiting

### Public RPCs

Solana's public RPC endpoints (`api.devnet.solana.com`, `api.mainnet-beta.solana.com`) enforce shared rate limits — typically ~40 requests/second across all users. You **will** hit these limits in production.

Symptoms of rate limiting:

- `429 Too Many Requests` responses
- Dropped WebSocket connections
- Transaction send failures with no error details

### Production Strategy

For production workloads, use a dedicated RPC provider:

```typescript
// ✅ Production — dedicated endpoint
const conn = SapConnection.mainnet("https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");

// ❌ Production — shared public RPC
const conn = SapConnection.mainnet(); // defaults to api.mainnet-beta.solana.com
```

### Handling Rate Limit Errors

```typescript
import { SapRpcError } from "@synapse-sap/sdk/errors";

try {
  await client.agent.fetch();
} catch (err) {
  if (err instanceof SapRpcError && err.rpcCode === 429) {
    // Back off and retry
    await new Promise((r) => setTimeout(r, 2000));
    return client.agent.fetch();
  }
  throw err;
}
```

---

## Connection Health Monitoring

For long-running services (bots, indexers, backend APIs), monitor connection health:

```typescript
import { SapConnection } from "@synapse-sap/sdk";

const conn = SapConnection.mainnet("https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=");

// Periodic health check
async function checkHealth(): Promise<boolean> {
  try {
    const slot = await conn.connection.getSlot();
    console.log(`Healthy — current slot: ${slot}`);
    return true;
  } catch (err) {
    console.error("RPC health check failed:", err);
    return false;
  }
}

// Run every 30 seconds
setInterval(checkHealth, 30_000);
```

### WebSocket Disconnects

Solana WebSocket connections can drop silently. If you're subscribing to account changes or logs, implement reconnection logic:

```typescript
function subscribeWithReconnect(conn: SapConnection, accountPda: PublicKey) {
  let subId: number;

  function connect() {
    subId = conn.connection.onAccountChange(accountPda, (info) => {
      console.log("Account updated:", info.data.length, "bytes");
    });
  }

  // Reconnect on WebSocket close
  conn.connection.onSlotChange(() => {}); // keep-alive ping
  connect();

  return () => conn.connection.removeAccountChangeListener(subId);
}
```

---

## Alternative RPC Providers

If the Synapse Gateway doesn't meet your needs (e.g., geographic requirements, existing contracts), these providers are proven in the Solana ecosystem:

| Provider | Endpoint Pattern | Strengths |
|----------|-----------------|-----------|
| **Synapse Gateway** ⭐ | `synapse.oobeprotocol.ai` | SAP-optimized, priority routing |
| Helius | `rpc.helius.xyz/?api-key=…` | Enhanced APIs, DAS support |
| QuickNode | `<name>.solana-mainnet.quiknode.pro/…` | Global edge, multi-chain |
| Triton | `<name>.rpcpool.com` | Validator-operated, low latency |

All of these support the standard Solana JSON-RPC and are fully compatible with the SAP SDK. Just pass the endpoint URL to any `SapConnection` factory:

```typescript
// Any provider works — swap the URL
const conn = SapConnection.mainnet("https://rpc.helius.xyz/?api-key=YOUR_KEY");
const client = conn.createClient(wallet);
```

> **Our recommendation**: Start with the Synapse Gateway. It's free to get started, optimized for SAP, and used by the core team in production. Switch to an alternative only if you have specific infrastructure requirements.

---

## Network Configuration Summary

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| **RPC** | `localhost:8899` | `api.devnet.solana.com` | `synapse.oobeprotocol.ai` |
| **Cluster** | `localnet` | `devnet` | `mainnet-beta` |
| **Commitment** | `confirmed` | `confirmed` | `confirmed` / `finalized` |
| **Program ID** | `SAPTU7a…` | `SAPTU7a…` | `SAPTU7a…` |
| **SOL source** | Airdrop | Airdrop | Real SOL |
| **Rate limits** | None | ~40 req/s | Provider-dependent |

### Environment-Based Setup

A common pattern for applications that run across environments:

```typescript
import { SapConnection } from "@synapse-sap/sdk";
import { Keypair } from "@solana/web3.js";

function createClient(env: "development" | "staging" | "production") {
  const keypair = Keypair.fromSecretKey(/* load from env/vault */);

  const rpcUrls: Record<string, string> = {
    development: "http://localhost:8899",
    staging: "https://api.devnet.solana.com",
    production: "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=",
  };

  const { client } = SapConnection.fromKeypair(rpcUrls[env], keypair);
  return client;
}

const client = createClient(process.env.NODE_ENV as any ?? "development");
```

---

**Previous**: [Best Practices](./09-best-practices.md) · **Next**: [Back to Overview →](./00-overview.md)
