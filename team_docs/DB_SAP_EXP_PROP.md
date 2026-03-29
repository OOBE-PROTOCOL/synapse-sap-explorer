# Synapse SAP Explorer — Database Schema Proposal

> Persistent storage layer for the SAP Explorer: PostgreSQL + Drizzle ORM + gRPC indexer.

---

## Stack

| Layer | Scelta | Motivo |
|---|---|---|
| **DB** | PostgreSQL | JSONB per nested data (capabilities, pricing, volumeCurve), indici GIN, upsert nativo, scalabile |
| **ORM** | Drizzle ORM | Type-safe, zero-runtime overhead, schema-as-code TS, migrations native, perfetto per Next.js App Router |
| **Ingest** | gRPC subscribe → worker | Stream real-time da Synapse, scrive su DB, le API leggono dal DB |

Drizzle > Prisma per questo progetto: query SQL native quando serve, zero codegen, bundle più leggero, JSONB first-class.

---

## Entity Relationships

```
agents ──┬── 1:N → tools            (tool.agent_pda → agents.pda)
         ├── 1:N → escrows          (escrow.agent_pda → agents.pda)
         ├── 1:N → attestations     (attestation.agent_pda → agents.pda)
         ├── 1:N → feedbacks        (feedback.agent_pda → agents.pda)
         ├── 1:N → vaults           (vault.agent_pda → agents.pda)
         ├── 1:N → capabilities     (embedded JSONB in agents)
         ├── 1:N → pricing_tiers    (embedded JSONB in agents)
         └── M:N → protocols        (TEXT[] in agents)

transactions ── 1:1 → tx_details    (heavy payload, pagina dettaglio)
network_snapshots                    (time-series GlobalRegistry)
sync_cursors                         (gRPC indexer tracking)
```

---

## SQL Schema (11 tabelle)

### 1. `agents`

```sql
CREATE TABLE agents (
  pda                TEXT PRIMARY KEY,
  wallet             TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  agent_id           TEXT,
  agent_uri          TEXT,
  x402_endpoint      TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT false,
  bump               SMALLINT NOT NULL DEFAULT 0,
  version            SMALLINT NOT NULL DEFAULT 0,

  -- Reputation (denormalized for fast queries)
  reputation_score     SMALLINT NOT NULL DEFAULT 0,
  reputation_sum       NUMERIC NOT NULL DEFAULT 0,
  total_feedbacks      INTEGER NOT NULL DEFAULT 0,
  total_calls_served   NUMERIC NOT NULL DEFAULT 0,
  avg_latency_ms       REAL NOT NULL DEFAULT 0,
  uptime_percent       REAL NOT NULL DEFAULT 0,

  -- Embedded JSON (complex nested structures)
  capabilities       JSONB NOT NULL DEFAULT '[]',
  pricing            JSONB NOT NULL DEFAULT '[]',
  protocols          TEXT[] NOT NULL DEFAULT '{}',
  active_plugins     JSONB NOT NULL DEFAULT '[]',

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_agents_active ON agents (is_active) WHERE is_active = true;
CREATE INDEX idx_agents_reputation ON agents (reputation_score DESC);
CREATE INDEX idx_agents_protocols ON agents USING GIN (protocols);
CREATE INDEX idx_agents_capabilities ON agents USING GIN (capabilities);

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_agents_active_rep ON agents (reputation_score DESC, name) WHERE is_active = true;   -- leaderboard query
CREATE INDEX idx_agents_wallet_lookup ON agents (wallet);                                             -- UNIQUE constraint already covers this, ma esplicito per chiarezza
CREATE INDEX idx_agents_updated ON agents (updated_at DESC);                                          -- sync delta polling
CREATE INDEX idx_agents_name_trgm ON agents USING GIN (name gin_trgm_ops);                           -- fuzzy search (richiede pg_trgm)
CREATE INDEX idx_agents_pricing ON agents USING GIN (pricing jsonb_path_ops);                         -- query per pricing tiers
CREATE INDEX idx_agents_plugins ON agents USING GIN (active_plugins jsonb_path_ops);                  -- plugin filtering
```

**JSONB `capabilities` shape:**
```json
[{
  "id": "jupiter:swap:v1",
  "description": "Jupiter token swap",
  "protocolId": "jupiter",
  "version": "1"
}]
```

**JSONB `pricing` shape:**
```json
[{
  "tierId": "standard",
  "pricePerCall": "1000000",
  "minPricePerCall": null,
  "maxPricePerCall": null,
  "rateLimit": 100,
  "maxCallsPerSession": 1000,
  "burstLimit": null,
  "tokenType": { "native": {} },
  "tokenMint": null,
  "tokenDecimals": null,
  "settlementMode": { "perCall": {} },
  "minEscrowDeposit": null,
  "batchIntervalSec": null,
  "volumeCurve": null
}]
```

---

### 2. `agent_stats`

```sql
CREATE TABLE agent_stats (
  agent_pda          TEXT PRIMARY KEY REFERENCES agents(pda) ON DELETE CASCADE,
  wallet             TEXT NOT NULL,
  total_calls_served NUMERIC NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT false,
  bump               SMALLINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 3. `tools`

```sql
CREATE TABLE tools (
  pda                TEXT PRIMARY KEY,
  agent_pda          TEXT NOT NULL REFERENCES agents(pda) ON DELETE CASCADE,
  tool_name          TEXT NOT NULL DEFAULT '',
  tool_name_hash     BYTEA,
  protocol_hash      BYTEA,
  description_hash   BYTEA,
  input_schema_hash  BYTEA,
  output_schema_hash BYTEA,
  http_method        TEXT,
  category           TEXT,
  params_count       SMALLINT NOT NULL DEFAULT 0,
  required_params    SMALLINT NOT NULL DEFAULT 0,
  is_compound        BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  total_invocations  NUMERIC NOT NULL DEFAULT 0,
  version            SMALLINT NOT NULL DEFAULT 0,
  previous_version   TEXT,
  bump               SMALLINT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_tools_agent ON tools (agent_pda);
CREATE INDEX idx_tools_category ON tools (category);
CREATE INDEX idx_tools_active ON tools (is_active) WHERE is_active = true;

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_tools_agent_active ON tools (agent_pda, is_active) WHERE is_active = true;   -- agent page: active tools only
CREATE INDEX idx_tools_category_active ON tools (category, is_active);                         -- category filter page
CREATE INDEX idx_tools_invocations ON tools (total_invocations DESC) WHERE is_active = true;   -- most-used tools ranking
CREATE INDEX idx_tools_name_trgm ON tools USING GIN (tool_name gin_trgm_ops);                  -- fuzzy search tool names
CREATE INDEX idx_tools_agent_created ON tools (agent_pda, created_at DESC);                    -- agent tools timeline
CREATE INDEX idx_tools_version ON tools (agent_pda, version DESC);                             -- latest version lookup
```

---

### 4. `escrows`

```sql
CREATE TABLE escrows (
  pda                  TEXT PRIMARY KEY,
  agent_pda            TEXT NOT NULL REFERENCES agents(pda) ON DELETE CASCADE,
  depositor            TEXT NOT NULL,
  agent_wallet         TEXT NOT NULL,
  balance              NUMERIC NOT NULL DEFAULT 0,
  total_deposited      NUMERIC NOT NULL DEFAULT 0,
  total_settled        NUMERIC NOT NULL DEFAULT 0,
  total_calls_settled  NUMERIC NOT NULL DEFAULT 0,
  price_per_call       NUMERIC NOT NULL DEFAULT 0,
  max_calls            NUMERIC NOT NULL DEFAULT 0,
  token_mint           TEXT,
  token_decimals       SMALLINT NOT NULL DEFAULT 9,
  volume_curve         JSONB NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_settled_at      TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  indexed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_escrows_agent ON escrows (agent_pda);
CREATE INDEX idx_escrows_depositor ON escrows (depositor);
CREATE INDEX idx_escrows_expires ON escrows (expires_at) WHERE expires_at IS NOT NULL;

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_escrows_agent_balance ON escrows (agent_pda, balance DESC);                   -- agent page: escrows sorted by balance
CREATE INDEX idx_escrows_depositor_agent ON escrows (depositor, agent_pda);                    -- depositor's escrows per agent
CREATE INDEX idx_escrows_active_balance ON escrows (balance DESC) WHERE balance > 0;           -- only funded escrows
CREATE INDEX idx_escrows_agent_wallet ON escrows (agent_wallet);                               -- lookup by agent wallet
CREATE INDEX idx_escrows_token_mint ON escrows (token_mint) WHERE token_mint IS NOT NULL;      -- filter by token type
CREATE INDEX idx_escrows_created ON escrows (created_at DESC);                                 -- recent escrows feed
CREATE INDEX idx_escrows_settled ON escrows (last_settled_at DESC) WHERE last_settled_at IS NOT NULL;  -- recent activity
```

**JSONB `volume_curve` shape:**
```json
[
  { "afterCalls": 100,  "pricePerCall": "900000" },
  { "afterCalls": 1000, "pricePerCall": "750000" }
]
```

---

### 5. `attestations`

```sql
CREATE TABLE attestations (
  pda                TEXT PRIMARY KEY,
  agent_pda          TEXT NOT NULL REFERENCES agents(pda) ON DELETE CASCADE,
  attester           TEXT NOT NULL,
  attestation_type   TEXT NOT NULL DEFAULT '',
  is_active          BOOLEAN NOT NULL DEFAULT true,
  metadata_hash      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ,
  indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_attestations_agent ON attestations (agent_pda);
CREATE INDEX idx_attestations_attester ON attestations (attester);
CREATE INDEX idx_attestations_active ON attestations (is_active) WHERE is_active = true;

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_attestations_agent_active ON attestations (agent_pda, is_active) WHERE is_active = true;  -- active per agent
CREATE INDEX idx_attestations_agent_type ON attestations (agent_pda, attestation_type);                     -- filter by type
CREATE INDEX idx_attestations_attester_agent ON attestations (attester, agent_pda);                         -- who attested what
CREATE INDEX idx_attestations_expires ON attestations (expires_at) WHERE expires_at IS NOT NULL;            -- expiry sweep
CREATE INDEX idx_attestations_type ON attestations (attestation_type);                                      -- global type filter
```

---

### 6. `feedbacks`

```sql
CREATE TABLE feedbacks (
  pda                TEXT PRIMARY KEY,
  agent_pda          TEXT NOT NULL REFERENCES agents(pda) ON DELETE CASCADE,
  reviewer           TEXT NOT NULL,
  score              SMALLINT NOT NULL DEFAULT 0,
  tag                TEXT NOT NULL DEFAULT '',
  is_revoked         BOOLEAN NOT NULL DEFAULT false,
  comment_hash       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_feedbacks_agent ON feedbacks (agent_pda);
CREATE INDEX idx_feedbacks_score ON feedbacks (score DESC);
CREATE INDEX idx_feedbacks_reviewer ON feedbacks (reviewer);

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_feedbacks_agent_score ON feedbacks (agent_pda, score DESC);                    -- agent page: best reviews first
CREATE INDEX idx_feedbacks_agent_recent ON feedbacks (agent_pda, created_at DESC);              -- agent page: timeline
CREATE INDEX idx_feedbacks_tag ON feedbacks (tag) WHERE tag != '';                               -- filter by tag
CREATE INDEX idx_feedbacks_agent_tag ON feedbacks (agent_pda, tag);                             -- agent + tag combo
CREATE INDEX idx_feedbacks_not_revoked ON feedbacks (agent_pda, score DESC) WHERE is_revoked = false;  -- only valid feedbacks
CREATE INDEX idx_feedbacks_reviewer_agent ON feedbacks (reviewer, agent_pda);                   -- user's reviews per agent
```

---

### 7. `vaults`

```sql
CREATE TABLE vaults (
  pda                    TEXT PRIMARY KEY,
  agent_pda              TEXT NOT NULL REFERENCES agents(pda) ON DELETE CASCADE,
  wallet                 TEXT NOT NULL,
  total_sessions         INTEGER NOT NULL DEFAULT 0,
  total_inscriptions     NUMERIC NOT NULL DEFAULT 0,
  total_bytes_inscribed  NUMERIC NOT NULL DEFAULT 0,
  nonce_version          INTEGER NOT NULL DEFAULT 0,
  protocol_version       SMALLINT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_vaults_agent ON vaults (agent_pda);

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_vaults_wallet ON vaults (wallet);                                              -- lookup by wallet
CREATE INDEX idx_vaults_agent_sessions ON vaults (agent_pda, total_sessions DESC);              -- agent page: most-active vaults
CREATE INDEX idx_vaults_created ON vaults (created_at DESC);                                    -- recent vaults feed
```

---

### 8. `transactions`

```sql
CREATE TABLE transactions (
  signature                TEXT PRIMARY KEY,
  slot                     BIGINT NOT NULL,
  block_time               TIMESTAMPTZ,
  err                      BOOLEAN NOT NULL DEFAULT false,
  memo                     TEXT,
  signer                   TEXT,
  fee                      BIGINT NOT NULL DEFAULT 0,
  fee_sol                  DOUBLE PRECISION NOT NULL DEFAULT 0,
  programs                 JSONB NOT NULL DEFAULT '[]',
  sap_instructions         TEXT[] NOT NULL DEFAULT '{}',
  instruction_count        SMALLINT NOT NULL DEFAULT 0,
  inner_instruction_count  SMALLINT NOT NULL DEFAULT 0,
  compute_units            INTEGER,
  signer_balance_change    BIGINT NOT NULL DEFAULT 0,
  version                  TEXT NOT NULL DEFAULT 'legacy',
  indexed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Primary Indexes ===
CREATE INDEX idx_tx_slot ON transactions (slot DESC);
CREATE INDEX idx_tx_block_time ON transactions (block_time DESC);
CREATE INDEX idx_tx_signer ON transactions (signer);
CREATE INDEX idx_tx_sap_ix ON transactions USING GIN (sap_instructions);
CREATE INDEX idx_tx_programs ON transactions USING GIN (programs jsonb_path_ops);

-- === Secondary / Composite Indexes ===
CREATE INDEX idx_tx_signer_slot ON transactions (signer, slot DESC);                            -- user's tx timeline
CREATE INDEX idx_tx_signer_time ON transactions (signer, block_time DESC);                      -- user's tx by time
CREATE INDEX idx_tx_err ON transactions (block_time DESC) WHERE err = true;                     -- failed tx feed
CREATE INDEX idx_tx_success_time ON transactions (block_time DESC) WHERE err = false;           -- successful tx feed
CREATE INDEX idx_tx_fee ON transactions (fee DESC);                                             -- highest-fee ranking
CREATE INDEX idx_tx_compute ON transactions (compute_units DESC) WHERE compute_units IS NOT NULL; -- CU ranking
CREATE INDEX idx_tx_version ON transactions (version, slot DESC);                               -- legacy vs versioned filter
CREATE INDEX idx_tx_memo ON transactions (memo) WHERE memo IS NOT NULL;                         -- memo search
CREATE INDEX idx_tx_indexed ON transactions (indexed_at DESC);                                  -- sync delta query

-- === BRIN Index (Block Range INdex) — ottimo per slot monotono crescente ===
CREATE INDEX idx_tx_slot_brin ON transactions USING BRIN (slot) WITH (pages_per_range = 32);    -- 100x smaller than btree, scans by range
```

**JSONB `programs` shape:**
```json
[
  { "id": "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ", "name": "SAP Program" },
  { "id": "11111111111111111111111111111111", "name": "System Program" }
]
```

---

### 9. `tx_details` (heavy payload — solo per pagina `/tx/[signature]`)

```sql
CREATE TABLE tx_details (
  signature              TEXT PRIMARY KEY REFERENCES transactions(signature) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'success',
  error_data             JSONB,
  account_keys           JSONB NOT NULL DEFAULT '[]',
  instructions           JSONB NOT NULL DEFAULT '[]',
  logs                   TEXT[] NOT NULL DEFAULT '{}',
  balance_changes        JSONB NOT NULL DEFAULT '[]',
  token_balance_changes  JSONB NOT NULL DEFAULT '[]',
  compute_units          INTEGER,
  indexed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Indexes per tx_details ===
CREATE INDEX idx_txd_status ON tx_details (status);                                             -- filter success/fail
CREATE INDEX idx_txd_status_err ON tx_details (status) WHERE status != 'success';               -- only errors
CREATE INDEX idx_txd_account_keys ON tx_details USING GIN (account_keys jsonb_path_ops);        -- search by account key
CREATE INDEX idx_txd_instructions ON tx_details USING GIN (instructions jsonb_path_ops);        -- search by instruction data
CREATE INDEX idx_txd_token_changes ON tx_details USING GIN (token_balance_changes jsonb_path_ops); -- token transfer search
```
```json
[
  { "pubkey": "ABC...", "signer": true, "writable": true },
  { "pubkey": "DEF...", "signer": false, "writable": false }
]
```

**JSONB `instructions` shape:**
```json
[{
  "programId": "SAPp...",
  "program": "SAP Program",
  "data": "base64...",
  "accounts": ["ABC...", "DEF..."],
  "parsed": null,
  "type": null,
  "innerInstructions": [...]
}]
```

**JSONB `balance_changes` shape:**
```json
[
  { "account": "ABC...", "pre": 5000000000, "post": 4999995000, "change": -5000 }
]
```

---

### 10. `network_snapshots` (time-series della GlobalRegistry)

```sql
CREATE TABLE network_snapshots (
  id                   BIGSERIAL PRIMARY KEY,
  total_agents         INTEGER NOT NULL DEFAULT 0,
  active_agents        INTEGER NOT NULL DEFAULT 0,
  total_feedbacks      INTEGER NOT NULL DEFAULT 0,
  total_tools          INTEGER NOT NULL DEFAULT 0,
  total_vaults         INTEGER NOT NULL DEFAULT 0,
  total_attestations   INTEGER NOT NULL DEFAULT 0,
  total_capabilities   INTEGER NOT NULL DEFAULT 0,
  total_protocols      INTEGER NOT NULL DEFAULT 0,
  authority            TEXT NOT NULL,
  captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_time ON network_snapshots (captured_at DESC);

-- === Secondary Indexes ===
CREATE INDEX idx_snapshots_brin ON network_snapshots USING BRIN (captured_at) WITH (pages_per_range = 16); -- time-series scan
CREATE INDEX idx_snapshots_authority ON network_snapshots (authority);                           -- filter by authority
CREATE INDEX idx_snapshots_active_agents ON network_snapshots (captured_at DESC, active_agents); -- active agents timeline
```

---

### 11. `sync_cursors` (tracking per il gRPC indexer)

```sql
CREATE TABLE sync_cursors (
  entity             TEXT PRIMARY KEY,
  last_slot          BIGINT,
  last_signature     TEXT,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-populate per ogni entity
INSERT INTO sync_cursors (entity) VALUES
  ('transactions'), ('agents'), ('tools'), ('escrows'),
  ('attestations'), ('feedbacks'), ('vaults'), ('metrics');
```

---

## Drizzle ORM Schema (TypeScript)

> **Prerequisito:** `CREATE EXTENSION IF NOT EXISTS pg_trgm;` per gli indici trigram (fuzzy search su nomi).

---

## Index Strategy Summary

### Tipi di Indice Usati

| Tipo | Uso | Tabelle |
|---|---|---|
| **B-tree** | Default per lookup, range, ORDER BY | Tutte |
| **B-tree Partial** | Filtro su subset (WHERE clause) | agents, tools, escrows, attestations, feedbacks, transactions |
| **B-tree Composite** | Multi-colonna per query frequenti | Tutte tranne sync_cursors |
| **GIN** | Full containment su JSONB e arrays | agents, transactions, tx_details |
| **GIN jsonb_path_ops** | Subset più leggero di GIN per `@>` queries | transactions.programs, tx_details.*, escrows (se servono query nested) |
| **GIN gin_trgm_ops** | Fuzzy / LIKE / ILIKE search | agents.name, tools.tool_name |
| **BRIN** | Time-series e colonne monotone (slot) | transactions.slot, network_snapshots.captured_at |

### Conteggio Indici per Tabella

| Tabella | PK | B-tree | Partial | Composite | GIN | BRIN | Totale |
|---|---|---|---|---|---|---|---|
| agents | 1 | 1 (UNIQUE) | 1 | 1 | 4 | — | **8** |
| agent_stats | 1 | — | — | — | — | — | **1** |
| tools | 1 | 1 | 1 | 3 | 1 | — | **7** |
| escrows | 1 | 2 | 3 | 2 | — | — | **8** |
| attestations | 1 | 2 | 1 | 2 | — | — | **6** |
| feedbacks | 1 | 1 | 1 | 4 | — | — | **7** |
| vaults | 1 | 1 | — | 1 | — | — | **3** |
| transactions | 1 | 2 | 3 | 3 | 2 | 1 | **12** |
| tx_details | 1 | — | 1 | — | 3 | — | **5** |
| network_snapshots | 1 | 1 | — | 1 | — | 1 | **4** |
| sync_cursors | 1 | — | — | — | — | — | **1** |
| **TOTALE** | **11** | **11** | **11** | **17** | **10** | **2** | **62** |

### BRIN vs B-tree (quando usare cosa)

```
BRIN (Block Range INdex):
  ✅ Colonne monotonamente crescenti (slot, block_time, captured_at)
  ✅ 100-1000x più piccoli di B-tree equivalente
  ✅ Perfetti per time-series con scan sequenziali
  ❌ Non adatti per lookup puntuale (singola riga)
  ❌ Richiedono che i dati siano fisicamente ordinati sulla colonna

B-tree:
  ✅ Lookup puntuale, range query, ORDER BY
  ✅ Funziona con qualsiasi distribuzione dati
  ❌ Occupa molto più spazio su tabelle grandi
```

### Partial Indexes — Perché Sono Fondamentali

```sql
-- ❌ SENZA partial: indice su TUTTE le righe (include agenti inattivi)
CREATE INDEX idx_agents_reputation ON agents (reputation_score DESC);
-- Size: ~100% delle righe

-- ✅ CON partial: indice SOLO sugli agenti attivi (tipicamente 20-40%)
CREATE INDEX idx_agents_active_rep ON agents (reputation_score DESC) WHERE is_active = true;
-- Size: ~20-40% delle righe → indice più piccolo → in RAM → più veloce
```

### Covering Indexes (Index-Only Scans)

Per le query più frequenti, PostgreSQL può rispondere direttamente dall'indice senza toccare la tabella (heap):

```sql
-- Covering: la leaderboard legge solo dal B-tree
-- SELECT name, reputation_score FROM agents WHERE is_active ORDER BY reputation_score DESC LIMIT 20
-- → idx_agents_active_rep contiene (reputation_score, name) → index-only scan ✓

-- Covering: lista TX per signer
-- SELECT signature, slot, block_time FROM transactions WHERE signer = $1 ORDER BY slot DESC
-- → idx_tx_signer_slot contiene (signer, slot) → partial index-only scan ✓
```

### GIN Index Strategies

```sql
-- jsonb_path_ops (più piccolo, solo operatore @>)
CREATE INDEX idx_tx_programs ON transactions USING GIN (programs jsonb_path_ops);
-- Query: WHERE programs @> '[{"id": "SAPp..."}]'

-- GIN standard (tutti gli operatori: @>, ?, ?|, ?&, etc.)
CREATE INDEX idx_agents_capabilities ON agents USING GIN (capabilities);
-- Query: WHERE capabilities @> '[{"protocolId": "jupiter"}]'
-- Query: WHERE capabilities ? 'some_key'  ← supportato da GIN standard, NON da jsonb_path_ops

-- gin_trgm_ops (fuzzy text search — richiede pg_trgm)
CREATE INDEX idx_agents_name_trgm ON agents USING GIN (name gin_trgm_ops);
-- Query: WHERE name ILIKE '%jup%'        ← trigram match
-- Query: WHERE name % 'jupter'           ← fuzzy similarity (typo-tolerant)
```

---

## PostgreSQL Performance Tuning

> Configurazione ottimizzata per macchina dedicata SAP Explorer.
> Adatta per **macOS / Linux**, 16-64 GB RAM, SSD NVMe.

### Profilo Macchina Consigliato

| Spec | Minimo | Consigliato | Produzione |
|---|---|---|---|
| **RAM** | 8 GB | 16 GB | 32-64 GB |
| **CPU** | 4 cores | 8 cores | 16 cores |
| **Disco** | SSD SATA | NVMe SSD | NVMe RAID |
| **OS** | macOS / Ubuntu | Ubuntu 22.04+ | Ubuntu 22.04 LTS |
| **PG Version** | 15 | 16 | 16+ |

### `postgresql.conf` — Tuning Completo

```ini
# ═══════════════════════════════════════════════════════════════
# MEMORY — il parametro più importante
# ═══════════════════════════════════════════════════════════════

# 25% della RAM totale (16GB → 4GB, 32GB → 8GB, 64GB → 16GB)
shared_buffers = '4GB'

# 50-75% della RAM totale — hint per il planner, non alloca nulla
effective_cache_size = '12GB'

# RAM per singola operazione di sort/hash (per connection)
# Attenzione: max_connections * work_mem = RAM potenziale!
# 50 connections * 64MB = 3.2GB worst case
work_mem = '64MB'

# RAM per VACUUM, CREATE INDEX, ALTER TABLE
maintenance_work_mem = '1GB'

# RAM per WAL — auto-tuned di solito, ma esplicito non fa male
wal_buffers = '64MB'

# Dimensione segment WAL (default 1MB, troppo piccolo per workload di ingest)
# huge_pages = try                  # Linux only — abilitare se disponibili

# ═══════════════════════════════════════════════════════════════
# WAL & CHECKPOINT — critico per write-heavy workload (gRPC indexer)
# ═══════════════════════════════════════════════════════════════

# WAL level: minimal per performance, replica se serve replication
wal_level = 'replica'

# Quanta RAM può accumulare il WAL prima di checkpoint
max_wal_size = '4GB'
min_wal_size = '1GB'

# Quanto frequenti sono i checkpoint (in secondi)
# Default 5min — alzare a 15min riduce I/O
checkpoint_timeout = '15min'

# Spalmare i write su tutto il periodo checkpoint (0.0-1.0)
# 0.9 = spalma su 90% del tempo → I/O più smooth
checkpoint_completion_target = 0.9

# Commit sincrono: off per massima velocità (rischi perdita <1s su crash)
# on per safety in produzione
synchronous_commit = 'off'          # dev/staging
# synchronous_commit = 'on'         # production

# Riusa file WAL invece di cancellarli
wal_recycle = on

# ═══════════════════════════════════════════════════════════════
# DISK I/O — essenziale per SSD
# ═══════════════════════════════════════════════════════════════

# SSD: random read costa quasi come sequential → abbassa questo
# HDD: 4.0 (default) | SSD SATA: 1.1-1.3 | NVMe: 1.0-1.1
random_page_cost = 1.1

# Sequential page cost reference (lasciare a 1.0)
seq_page_cost = 1.0

# Parallelismo I/O — quante richieste I/O async il kernel gestisce
# NVMe: 200 | SSD SATA: 100-150 | HDD: 2 (default)
effective_io_concurrency = 200

# Maintenance operations (VACUUM, INDEX build)
maintenance_io_concurrency = 200

# ═══════════════════════════════════════════════════════════════
# PARALLELISMO — sfrutta tutti i core
# ═══════════════════════════════════════════════════════════════

# Workers totali per query parallele (≤ CPU cores - 2)
max_parallel_workers = 6

# Workers per singola query
max_parallel_workers_per_gather = 4

# Workers per maintenance (VACUUM parallel, INDEX build)
max_parallel_maintenance_workers = 4

# Soglia minima per attivare scan parallelo (default 8MB)
min_parallel_table_scan_size = '1MB'
min_parallel_index_scan_size = '256kB'

# ═══════════════════════════════════════════════════════════════
# CONNECTIONS
# ═══════════════════════════════════════════════════════════════

# Next.js pool + indexer worker + admin
# Usare PgBouncer in produzione per > 100 connessioni
max_connections = 100

# Connessioni riservate per superuser (DBA)
superuser_reserved_connections = 3

# ═══════════════════════════════════════════════════════════════
# VACUUM / AUTOVACUUM — fondamentale per tables con upsert frequente
# ═══════════════════════════════════════════════════════════════

# Autovacuum più aggressivo per tabelle hot (transactions, agents)
autovacuum_max_workers = 4                       # default 3
autovacuum_naptime = '30s'                       # default 1min — check più frequente
autovacuum_vacuum_threshold = 25                 # default 50
autovacuum_vacuum_scale_factor = 0.02            # default 0.2 (20%) → 2% = trigger molto prima
autovacuum_analyze_threshold = 25                # default 50
autovacuum_analyze_scale_factor = 0.01           # default 0.1 → 1%
autovacuum_vacuum_cost_delay = '2ms'             # default 2ms — ok per SSD
autovacuum_vacuum_cost_limit = 1000              # default 200 — alzare per SSD

# ═══════════════════════════════════════════════════════════════
# PLANNER / STATISTICS
# ═══════════════════════════════════════════════════════════════

# Più campioni per statistiche → planner più preciso (default 100)
default_statistics_target = 500

# JIT compilation — utile per query complesse
jit = on
jit_above_cost = 100000
jit_inline_above_cost = 500000
jit_optimize_above_cost = 500000

# ═══════════════════════════════════════════════════════════════
# LOGGING — per debug e monitoring
# ═══════════════════════════════════════════════════════════════

# Log query lente (> 500ms)
log_min_duration_statement = 500

# Log autovacuum esecuzioni (per monitoring)
log_autovacuum_min_duration = 0

# Formato log per parsing automatico
log_line_prefix = '%t [%p] %q%u@%d '

# Log checkpoints
log_checkpoints = on

# Log connessioni/disconnessioni
log_connections = on
log_disconnections = on

# ═══════════════════════════════════════════════════════════════
# EXTENSIONS RICHIESTE
# ═══════════════════════════════════════════════════════════════

# In psql:
# CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- fuzzy text search indexes
# CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- query performance tracking
# CREATE EXTENSION IF NOT EXISTS btree_gist;     -- per exclusion constraints (se servono)
```

### Per-Table Storage Parameters

```sql
-- Le tabelle con upsert frequente meritano configurazioni custom
ALTER TABLE transactions SET (
  fillfactor = 85,                              -- 15% spazio per HOT updates
  autovacuum_vacuum_scale_factor = 0.01,        -- vacuum ogni 1% dead tuples
  autovacuum_analyze_scale_factor = 0.005,      -- reanalyze ogni 0.5%
  autovacuum_vacuum_cost_delay = '0ms',         -- massima velocità vacuum su SSD
  toast_tuple_target = 128                       -- comprimi JSONB aggressivamente in TOAST
);

ALTER TABLE agents SET (
  fillfactor = 85,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE tx_details SET (
  fillfactor = 100,                             -- write-once, no updates → pack tight
  autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE network_snapshots SET (
  fillfactor = 100,                             -- append-only, no updates
  autovacuum_vacuum_scale_factor = 0.1
);

ALTER TABLE escrows SET (
  fillfactor = 80,                              -- frequent balance updates → più spazio HOT
  autovacuum_vacuum_scale_factor = 0.02
);
```

### macOS Specific Tuning

```bash
# macOS: shared_buffers > 4GB richiede sysctl tuning
# Controlla il limite attuale
sysctl kern.sysv.shmmax
sysctl kern.sysv.shmall

# Aumenta i limiti shared memory (sudo richiesto)
# Per 8GB di shared_buffers:
sudo sysctl -w kern.sysv.shmmax=8589934592      # 8GB in bytes
sudo sysctl -w kern.sysv.shmall=2097152           # 8GB / 4096 page size

# Per rendere persistente, aggiungi a /etc/sysctl.conf:
# kern.sysv.shmmax=8589934592
# kern.sysv.shmall=2097152

# macOS: Disabilita App Nap per PostgreSQL (critical per daemon)
defaults write /Applications/Postgres.app/Contents/Info NSAppSleepDisabled -bool YES

# macOS: file descriptor limit
ulimit -n 65536
# Aggiungi a ~/.zshrc o /etc/launchd.conf per persistenza
```

### Linux Specific Tuning (Produzione)

```bash
# ═══ Kernel ═══
# Huge Pages — evita TLB miss per shared_buffers
# Calcola: shared_buffers / 2MB page = num_pages
# 4GB / 2MB = 2048 pages
sudo sysctl -w vm.nr_hugepages=2200              # +10% margin
echo 'vm.nr_hugepages = 2200' >> /etc/sysctl.conf

# In postgresql.conf: huge_pages = on

# ═══ Disk Scheduler ═══
# NVMe: usa 'none' o 'mq-deadline'
echo 'none' | sudo tee /sys/block/nvme0n1/queue/scheduler

# ═══ Readahead ═══
# 256 sectors = 128KB — buono per sequential scan
sudo blockdev --setra 256 /dev/nvme0n1

# ═══ Swappiness ═══
# PostgreSQL gestisce la sua RAM — evita swapping
sudo sysctl -w vm.swappiness=1
echo 'vm.swappiness = 1' >> /etc/sysctl.conf

# ═══ Dirty Pages ═══
# Flush background scrive più frequentemente → meno spike
sudo sysctl -w vm.dirty_ratio=10
sudo sysctl -w vm.dirty_background_ratio=3
sudo sysctl -w vm.dirty_expire_centisecs=500
sudo sysctl -w vm.dirty_writeback_centisecs=100

# ═══ Transparent Huge Pages ═══
# Disabilitare — interferisce con huge_pages di PG
echo 'never' | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
```

### Connection Pooling (PgBouncer)

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
sap_explorer = host=127.0.0.1 port=5432 dbname=sap_explorer

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

pool_mode = transaction              # Session → Transaction mode per Next.js
max_client_conn = 500                # Max client connections
default_pool_size = 25               # Connections per database
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3

# Timeouts
server_idle_timeout = 600
client_idle_timeout = 0              # Next.js connections may idle
query_timeout = 30
```

```env
# .env — punta a PgBouncer invece che direttamente a PG
DATABASE_URL=postgresql://user:pass@127.0.0.1:6432/sap_explorer
```

### Monitoring Queries Utili

```sql
-- ═══ Index Usage ═══
-- Mostra indici mai usati (candidati per DROP)
SELECT schemaname, tablename, indexname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- ═══ Missing Indexes ═══
-- Tabelle con molte sequential scan (potrebbero beneficiare di nuovi indici)
SELECT relname, seq_scan, seq_tup_read, idx_scan,
       CASE WHEN seq_scan > 0 THEN seq_tup_read / seq_scan ELSE 0 END AS avg_tup_per_scan
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_tup_read DESC;

-- ═══ Bloat ═══
-- Tabelle con molte dead tuples (autovacuum non tiene il passo)
SELECT relname, n_live_tup, n_dead_tup,
       ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- ═══ Cache Hit Ratio ═══
-- Deve essere > 99% — se no, alzare shared_buffers
SELECT
  sum(heap_blks_read) AS heap_read,
  sum(heap_blks_hit)  AS heap_hit,
  ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS ratio
FROM pg_statio_user_tables;

-- ═══ Index Cache Hit Ratio ═══
SELECT
  sum(idx_blks_read) AS idx_read,
  sum(idx_blks_hit)  AS idx_hit,
  ROUND(100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) AS ratio
FROM pg_statio_user_indexes;

-- ═══ Slow Queries (richiede pg_stat_statements) ═══
SELECT query, calls, mean_exec_time, total_exec_time, rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- ═══ Table Sizes ═══
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS table_only,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename) - pg_relation_size(schemaname || '.' || tablename)) AS indexes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- ═══ VACUUM Progress ═══
SELECT * FROM pg_stat_progress_vacuum;
```

---

## Drizzle ORM Schema (TypeScript)

```typescript
// src/db/schema.ts
import {
  pgTable, text, boolean, smallint, integer, bigint,
  real, doublePrecision, numeric, timestamp, jsonb, serial,
} from 'drizzle-orm/pg-core';

/* ═══════════════════════════════════════════════
 * agents
 * ═══════════════════════════════════════════════ */

export const agents = pgTable('agents', {
  pda:              text('pda').primaryKey(),
  wallet:           text('wallet').notNull().unique(),
  name:             text('name').notNull().default(''),
  description:      text('description').notNull().default(''),
  agentId:          text('agent_id'),
  agentUri:         text('agent_uri'),
  x402Endpoint:     text('x402_endpoint'),
  isActive:         boolean('is_active').notNull().default(false),
  bump:             smallint('bump').notNull().default(0),
  version:          smallint('version').notNull().default(0),
  reputationScore:  smallint('reputation_score').notNull().default(0),
  reputationSum:    numeric('reputation_sum').notNull().default('0'),
  totalFeedbacks:   integer('total_feedbacks').notNull().default(0),
  totalCallsServed: numeric('total_calls_served').notNull().default('0'),
  avgLatencyMs:     real('avg_latency_ms').notNull().default(0),
  uptimePercent:    real('uptime_percent').notNull().default(0),
  capabilities:     jsonb('capabilities').notNull().default([]),
  pricing:          jsonb('pricing').notNull().default([]),
  protocols:        text('protocols').array().notNull().default([]),
  activePlugins:    jsonb('active_plugins').notNull().default([]),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * agent_stats
 * ═══════════════════════════════════════════════ */

export const agentStats = pgTable('agent_stats', {
  agentPda:         text('agent_pda').primaryKey().references(() => agents.pda, { onDelete: 'cascade' }),
  wallet:           text('wallet').notNull(),
  totalCallsServed: numeric('total_calls_served').notNull().default('0'),
  isActive:         boolean('is_active').notNull().default(false),
  bump:             smallint('bump').notNull().default(0),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * tools
 * ═══════════════════════════════════════════════ */

export const tools = pgTable('tools', {
  pda:              text('pda').primaryKey(),
  agentPda:         text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
  toolName:         text('tool_name').notNull().default(''),
  toolNameHash:     text('tool_name_hash'),      // hex-encoded
  protocolHash:     text('protocol_hash'),
  descriptionHash:  text('description_hash'),
  inputSchemaHash:  text('input_schema_hash'),
  outputSchemaHash: text('output_schema_hash'),
  httpMethod:       text('http_method'),
  category:         text('category'),
  paramsCount:      smallint('params_count').notNull().default(0),
  requiredParams:   smallint('required_params').notNull().default(0),
  isCompound:       boolean('is_compound').notNull().default(false),
  isActive:         boolean('is_active').notNull().default(true),
  totalInvocations: numeric('total_invocations').notNull().default('0'),
  version:          smallint('version').notNull().default(0),
  previousVersion:  text('previous_version'),
  bump:             smallint('bump').notNull().default(0),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * escrows
 * ═══════════════════════════════════════════════ */

export const escrows = pgTable('escrows', {
  pda:               text('pda').primaryKey(),
  agentPda:          text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
  depositor:         text('depositor').notNull(),
  agentWallet:       text('agent_wallet').notNull(),
  balance:           numeric('balance').notNull().default('0'),
  totalDeposited:    numeric('total_deposited').notNull().default('0'),
  totalSettled:      numeric('total_settled').notNull().default('0'),
  totalCallsSettled: numeric('total_calls_settled').notNull().default('0'),
  pricePerCall:      numeric('price_per_call').notNull().default('0'),
  maxCalls:          numeric('max_calls').notNull().default('0'),
  tokenMint:         text('token_mint'),
  tokenDecimals:     smallint('token_decimals').notNull().default(9),
  volumeCurve:       jsonb('volume_curve').notNull().default([]),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSettledAt:     timestamp('last_settled_at', { withTimezone: true }),
  expiresAt:         timestamp('expires_at', { withTimezone: true }),
  indexedAt:         timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * attestations
 * ═══════════════════════════════════════════════ */

export const attestations = pgTable('attestations', {
  pda:              text('pda').primaryKey(),
  agentPda:         text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
  attester:         text('attester').notNull(),
  attestationType:  text('attestation_type').notNull().default(''),
  isActive:         boolean('is_active').notNull().default(true),
  metadataHash:     text('metadata_hash'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt:        timestamp('expires_at', { withTimezone: true }),
  indexedAt:        timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * feedbacks
 * ═══════════════════════════════════════════════ */

export const feedbacks = pgTable('feedbacks', {
  pda:           text('pda').primaryKey(),
  agentPda:      text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
  reviewer:      text('reviewer').notNull(),
  score:         smallint('score').notNull().default(0),
  tag:           text('tag').notNull().default(''),
  isRevoked:     boolean('is_revoked').notNull().default(false),
  commentHash:   text('comment_hash'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  indexedAt:     timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * vaults
 * ═══════════════════════════════════════════════ */

export const vaults = pgTable('vaults', {
  pda:                  text('pda').primaryKey(),
  agentPda:             text('agent_pda').notNull().references(() => agents.pda, { onDelete: 'cascade' }),
  wallet:               text('wallet').notNull(),
  totalSessions:        integer('total_sessions').notNull().default(0),
  totalInscriptions:    numeric('total_inscriptions').notNull().default('0'),
  totalBytesInscribed:  numeric('total_bytes_inscribed').notNull().default('0'),
  nonceVersion:         integer('nonce_version').notNull().default(0),
  protocolVersion:      smallint('protocol_version').notNull().default(0),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  indexedAt:            timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * transactions
 * ═══════════════════════════════════════════════ */

export const transactions = pgTable('transactions', {
  signature:             text('signature').primaryKey(),
  slot:                  bigint('slot', { mode: 'number' }).notNull(),
  blockTime:             timestamp('block_time', { withTimezone: true }),
  err:                   boolean('err').notNull().default(false),
  memo:                  text('memo'),
  signer:                text('signer'),
  fee:                   bigint('fee', { mode: 'number' }).notNull().default(0),
  feeSol:                doublePrecision('fee_sol').notNull().default(0),
  programs:              jsonb('programs').notNull().default([]),
  sapInstructions:       text('sap_instructions').array().notNull().default([]),
  instructionCount:      smallint('instruction_count').notNull().default(0),
  innerInstructionCount: smallint('inner_instruction_count').notNull().default(0),
  computeUnits:          integer('compute_units'),
  signerBalanceChange:   bigint('signer_balance_change', { mode: 'number' }).notNull().default(0),
  version:               text('version').notNull().default('legacy'),
  indexedAt:             timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * tx_details (heavy payload — /tx/[signature] page)
 * ═══════════════════════════════════════════════ */

export const txDetails = pgTable('tx_details', {
  signature:            text('signature').primaryKey().references(() => transactions.signature, { onDelete: 'cascade' }),
  status:               text('status').notNull().default('success'),
  errorData:            jsonb('error_data'),
  accountKeys:          jsonb('account_keys').notNull().default([]),
  instructions:         jsonb('instructions').notNull().default([]),
  logs:                 text('logs').array().notNull().default([]),
  balanceChanges:       jsonb('balance_changes').notNull().default([]),
  tokenBalanceChanges:  jsonb('token_balance_changes').notNull().default([]),
  computeUnits:         integer('compute_units'),
  indexedAt:            timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * network_snapshots (time-series GlobalRegistry)
 * ═══════════════════════════════════════════════ */

export const networkSnapshots = pgTable('network_snapshots', {
  id:                 serial('id').primaryKey(),
  totalAgents:        integer('total_agents').notNull().default(0),
  activeAgents:       integer('active_agents').notNull().default(0),
  totalFeedbacks:     integer('total_feedbacks').notNull().default(0),
  totalTools:         integer('total_tools').notNull().default(0),
  totalVaults:        integer('total_vaults').notNull().default(0),
  totalAttestations:  integer('total_attestations').notNull().default(0),
  totalCapabilities:  integer('total_capabilities').notNull().default(0),
  totalProtocols:     integer('total_protocols').notNull().default(0),
  authority:          text('authority').notNull(),
  capturedAt:         timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════
 * sync_cursors (gRPC indexer tracking)
 * ═══════════════════════════════════════════════ */

export const syncCursors = pgTable('sync_cursors', {
  entity:         text('entity').primaryKey(),
  lastSlot:       bigint('last_slot', { mode: 'number' }),
  lastSignature:  text('last_signature'),
  lastSyncedAt:   timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## Drizzle Relations

```typescript
// src/db/relations.ts
import { relations } from 'drizzle-orm';
import {
  agents, agentStats, tools, escrows,
  attestations, feedbacks, vaults,
  transactions, txDetails,
} from './schema';

export const agentsRelations = relations(agents, ({ one, many }) => ({
  stats:        one(agentStats, { fields: [agents.pda], references: [agentStats.agentPda] }),
  tools:        many(tools),
  escrows:      many(escrows),
  attestations: many(attestations),
  feedbacks:    many(feedbacks),
  vaults:       many(vaults),
}));

export const agentStatsRelations = relations(agentStats, ({ one }) => ({
  agent: one(agents, { fields: [agentStats.agentPda], references: [agents.pda] }),
}));

export const toolsRelations = relations(tools, ({ one }) => ({
  agent: one(agents, { fields: [tools.agentPda], references: [agents.pda] }),
}));

export const escrowsRelations = relations(escrows, ({ one }) => ({
  agent: one(agents, { fields: [escrows.agentPda], references: [agents.pda] }),
}));

export const attestationsRelations = relations(attestations, ({ one }) => ({
  agent: one(agents, { fields: [attestations.agentPda], references: [agents.pda] }),
}));

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  agent: one(agents, { fields: [feedbacks.agentPda], references: [agents.pda] }),
}));

export const vaultsRelations = relations(vaults, ({ one }) => ({
  agent: one(agents, { fields: [vaults.agentPda], references: [agents.pda] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  details: one(txDetails, { fields: [transactions.signature], references: [txDetails.signature] }),
}));

export const txDetailsRelations = relations(txDetails, ({ one }) => ({
  transaction: one(transactions, { fields: [txDetails.signature], references: [transactions.signature] }),
}));
```

---

## Drizzle Config

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

---

## DB Client

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as relations from './relations';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
export type Database = typeof db;
```

---

## Query Examples

```typescript
import { db } from '~/db';
import { agents, tools, transactions } from '~/db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';

// Agent con tutti i tools
const agentWithTools = await db.query.agents.findFirst({
  where: eq(agents.wallet, walletPubkey),
  with: { tools: true, escrows: true, feedbacks: true, attestations: true, vaults: true },
});

// Top agents per reputation
const topAgents = await db
  .select()
  .from(agents)
  .where(eq(agents.isActive, true))
  .orderBy(desc(agents.reputationScore))
  .limit(20);

// Ultime 50 transazioni SAP
const recentTxs = await db
  .select()
  .from(transactions)
  .orderBy(desc(transactions.slot))
  .limit(50);

// Transazione con dettaglio completo
const txWithDetails = await db.query.transactions.findFirst({
  where: eq(transactions.signature, sig),
  with: { details: true },
});

// Tool count per category
const categories = await db
  .select({
    category: tools.category,
    count: sql<number>`count(*)::int`,
  })
  .from(tools)
  .where(eq(tools.isActive, true))
  .groupBy(tools.category);

// Escrows in scadenza nelle prossime 24h
const expiring = await db
  .select()
  .from(escrows)
  .where(and(
    gte(escrows.expiresAt, new Date()),
    sql`${escrows.expiresAt} < NOW() + INTERVAL '24 hours'`,
  ));
```

---

## Architettura di Ingestion

```
                    ┌──────────────────┐
                    │  Synapse gRPC    │
                    │  (transaction    │
                    │   subscribe)     │
                    └────────┬─────────┘
                             │ real-time stream
                    ┌────────▼─────────┐
                    │  Indexer Worker   │  ← Node.js process separato
                    │  - parse tx      │
                    │  - detect SAP ix │
                    │  - upsert DB     │
                    │  - sync agents   │
                    │  - sync_cursors  │
                    └────────┬─────────┘
                             │ PostgreSQL
                    ┌────────▼─────────┐
                    │    PostgreSQL     │
                    │  (all tables)     │
                    └────────┬─────────┘
                             │ read
                    ┌────────▼─────────┐
                    │  Next.js API      │  ← /api/sap/* legge dal DB
                    │  routes           │     niente più RPC calls
                    └──────────────────┘
```

**Flusso:**

1. **Indexer Worker** si connette via gRPC `transactionSubscribe` al SAP program address
2. Per ogni tx ricevuta: parse → `INSERT ... ON CONFLICT DO UPDATE` in `transactions` + `tx_details`
3. Se è una SAP instruction (RegisterAgent, UpdateAgent, CreateEscrow, etc.): trigger refresh dell'entità toccata → upsert nella tabella corrispondente
4. Ogni 60s: snapshot della GlobalRegistry → `INSERT` in `network_snapshots`
5. `sync_cursors` tiene traccia dell'ultimo slot/signature processato per ogni entity type
6. Le API routes Next.js fanno solo `SELECT` dal DB — zero RPC calls, risposte in <10ms

---

## Dipendenze da Aggiungere

```bash
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

---

## ENV Vars da Aggiungere

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/sap_explorer
```

---

## Struttura File

```
src/
├── db/
│   ├── schema.ts          # Drizzle table definitions
│   ├── relations.ts       # Drizzle relation declarations
│   └── index.ts           # DB client singleton
├── indexer/
│   ├── worker.ts          # gRPC subscribe + parse + upsert
│   ├── parsers.ts         # SAP instruction parsers
│   └── sync.ts            # Cursor management
drizzle/
│   └── *.sql              # Generated migrations
drizzle.config.ts          # Drizzle Kit config
```
