-- ============================================================================
-- MIGRATION: Creazione tabelle DB_SAP_EXP
-- Eseguire DOPO databse_DB_SAP_EXP.sql (database, role, schema già esistenti)
--
-- Comando:
--   sudo -u postgres psql -d DB_SAP_EXP -f 001_create_tables.sql
--
-- Schema: sap_exp  |  Tabelle: 11  |  Ref: DB_SAP_EXP_PROP.md
-- ============================================================================

-- Assicura che tutte le tabelle finiscano nello schema corretto
SET search_path = sap_exp, public;


-- ============================================================================
-- ESTENSIONI RICHIESTE (idempotenti)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- 1. agents
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_agents_active ON agents (is_active) WHERE is_active = true;
CREATE INDEX idx_agents_reputation ON agents (reputation_score DESC);
CREATE INDEX idx_agents_protocols ON agents USING GIN (protocols);
CREATE INDEX idx_agents_capabilities ON agents USING GIN (capabilities);

-- Secondary / Composite Indexes
CREATE INDEX idx_agents_active_rep ON agents (reputation_score DESC, name) WHERE is_active = true;
CREATE INDEX idx_agents_wallet_lookup ON agents (wallet);
CREATE INDEX idx_agents_updated ON agents (updated_at DESC);
CREATE INDEX idx_agents_name_trgm ON agents USING GIN (name gin_trgm_ops);
CREATE INDEX idx_agents_pricing ON agents USING GIN (pricing jsonb_path_ops);
CREATE INDEX idx_agents_plugins ON agents USING GIN (active_plugins jsonb_path_ops);


-- ============================================================================
-- 2. agent_stats
-- ============================================================================

CREATE TABLE agent_stats (
  agent_pda          TEXT PRIMARY KEY REFERENCES agents(pda) ON DELETE CASCADE,
  wallet             TEXT NOT NULL,
  total_calls_served NUMERIC NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT false,
  bump               SMALLINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 3. tools
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_tools_agent ON tools (agent_pda);
CREATE INDEX idx_tools_category ON tools (category);
CREATE INDEX idx_tools_active ON tools (is_active) WHERE is_active = true;

-- Secondary / Composite Indexes
CREATE INDEX idx_tools_agent_active ON tools (agent_pda, is_active) WHERE is_active = true;
CREATE INDEX idx_tools_category_active ON tools (category, is_active);
CREATE INDEX idx_tools_invocations ON tools (total_invocations DESC) WHERE is_active = true;
CREATE INDEX idx_tools_name_trgm ON tools USING GIN (tool_name gin_trgm_ops);
CREATE INDEX idx_tools_agent_created ON tools (agent_pda, created_at DESC);
CREATE INDEX idx_tools_version ON tools (agent_pda, version DESC);


-- ============================================================================
-- 4. escrows
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_escrows_agent ON escrows (agent_pda);
CREATE INDEX idx_escrows_depositor ON escrows (depositor);
CREATE INDEX idx_escrows_expires ON escrows (expires_at) WHERE expires_at IS NOT NULL;

-- Secondary / Composite Indexes
CREATE INDEX idx_escrows_agent_balance ON escrows (agent_pda, balance DESC);
CREATE INDEX idx_escrows_depositor_agent ON escrows (depositor, agent_pda);
CREATE INDEX idx_escrows_active_balance ON escrows (balance DESC) WHERE balance > 0;
CREATE INDEX idx_escrows_agent_wallet ON escrows (agent_wallet);
CREATE INDEX idx_escrows_token_mint ON escrows (token_mint) WHERE token_mint IS NOT NULL;
CREATE INDEX idx_escrows_created ON escrows (created_at DESC);
CREATE INDEX idx_escrows_settled ON escrows (last_settled_at DESC) WHERE last_settled_at IS NOT NULL;


-- ============================================================================
-- 5. attestations
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_attestations_agent ON attestations (agent_pda);
CREATE INDEX idx_attestations_attester ON attestations (attester);
CREATE INDEX idx_attestations_active ON attestations (is_active) WHERE is_active = true;

-- Secondary / Composite Indexes
CREATE INDEX idx_attestations_agent_active ON attestations (agent_pda, is_active) WHERE is_active = true;
CREATE INDEX idx_attestations_agent_type ON attestations (agent_pda, attestation_type);
CREATE INDEX idx_attestations_attester_agent ON attestations (attester, agent_pda);
CREATE INDEX idx_attestations_expires ON attestations (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_attestations_type ON attestations (attestation_type);


-- ============================================================================
-- 6. feedbacks
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_feedbacks_agent ON feedbacks (agent_pda);
CREATE INDEX idx_feedbacks_score ON feedbacks (score DESC);
CREATE INDEX idx_feedbacks_reviewer ON feedbacks (reviewer);

-- Secondary / Composite Indexes
CREATE INDEX idx_feedbacks_agent_score ON feedbacks (agent_pda, score DESC);
CREATE INDEX idx_feedbacks_agent_recent ON feedbacks (agent_pda, created_at DESC);
CREATE INDEX idx_feedbacks_tag ON feedbacks (tag) WHERE tag != '';
CREATE INDEX idx_feedbacks_agent_tag ON feedbacks (agent_pda, tag);
CREATE INDEX idx_feedbacks_not_revoked ON feedbacks (agent_pda, score DESC) WHERE is_revoked = false;
CREATE INDEX idx_feedbacks_reviewer_agent ON feedbacks (reviewer, agent_pda);


-- ============================================================================
-- 7. vaults
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_vaults_agent ON vaults (agent_pda);

-- Secondary / Composite Indexes
CREATE INDEX idx_vaults_wallet ON vaults (wallet);
CREATE INDEX idx_vaults_agent_sessions ON vaults (agent_pda, total_sessions DESC);
CREATE INDEX idx_vaults_created ON vaults (created_at DESC);


-- ============================================================================
-- 8. transactions
-- ============================================================================

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

-- Primary Indexes
CREATE INDEX idx_tx_slot ON transactions (slot DESC);
CREATE INDEX idx_tx_block_time ON transactions (block_time DESC);
CREATE INDEX idx_tx_signer ON transactions (signer);
CREATE INDEX idx_tx_sap_ix ON transactions USING GIN (sap_instructions);
CREATE INDEX idx_tx_programs ON transactions USING GIN (programs jsonb_path_ops);

-- Secondary / Composite Indexes
CREATE INDEX idx_tx_signer_slot ON transactions (signer, slot DESC);
CREATE INDEX idx_tx_signer_time ON transactions (signer, block_time DESC);
CREATE INDEX idx_tx_err ON transactions (block_time DESC) WHERE err = true;
CREATE INDEX idx_tx_success_time ON transactions (block_time DESC) WHERE err = false;
CREATE INDEX idx_tx_fee ON transactions (fee DESC);
CREATE INDEX idx_tx_compute ON transactions (compute_units DESC) WHERE compute_units IS NOT NULL;
CREATE INDEX idx_tx_version ON transactions (version, slot DESC);
CREATE INDEX idx_tx_memo ON transactions (memo) WHERE memo IS NOT NULL;
CREATE INDEX idx_tx_indexed ON transactions (indexed_at DESC);

-- BRIN Index (ottimo per slot monotono crescente)
CREATE INDEX idx_tx_slot_brin ON transactions USING BRIN (slot) WITH (pages_per_range = 32);


-- ============================================================================
-- 9. tx_details (heavy payload — pagina /tx/[signature])
-- ============================================================================

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

-- Indexes
CREATE INDEX idx_txd_status ON tx_details (status);
CREATE INDEX idx_txd_status_err ON tx_details (status) WHERE status != 'success';
CREATE INDEX idx_txd_account_keys ON tx_details USING GIN (account_keys jsonb_path_ops);
CREATE INDEX idx_txd_instructions ON tx_details USING GIN (instructions jsonb_path_ops);
CREATE INDEX idx_txd_token_changes ON tx_details USING GIN (token_balance_changes jsonb_path_ops);


-- ============================================================================
-- 10. network_snapshots (time-series GlobalRegistry)
-- ============================================================================

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

-- Secondary Indexes
CREATE INDEX idx_snapshots_brin ON network_snapshots USING BRIN (captured_at) WITH (pages_per_range = 16);
CREATE INDEX idx_snapshots_authority ON network_snapshots (authority);
CREATE INDEX idx_snapshots_active_agents ON network_snapshots (captured_at DESC, active_agents);


-- ============================================================================
-- 11. sync_cursors (tracking per il gRPC indexer)
-- ============================================================================

CREATE TABLE sync_cursors (
  entity             TEXT PRIMARY KEY,
  last_slot          BIGINT,
  last_signature     TEXT,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-populate per ogni entity
INSERT INTO sync_cursors (entity) VALUES
  ('transactions'),
  ('agents'),
  ('tools'),
  ('escrows'),
  ('attestations'),
  ('feedbacks'),
  ('vaults'),
  ('metrics');


-- ============================================================================
-- DONE — 11 tabelle create nello schema sap_exp
-- ============================================================================

