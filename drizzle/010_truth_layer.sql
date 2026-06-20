-- ============================================================================
-- 010_truth_layer.sql — SAP Explorer Truth Layer
--
-- Goals:
--   • canonical aliases for wallet/PDA/MPL/tool/escrow identity joins
--   • fast DB-backed /agents directory snapshots
--   • explicit data health/provenance instead of false zeros
-- ============================================================================

CREATE TABLE IF NOT EXISTS sap_exp.entity_aliases (
  alias          TEXT PRIMARY KEY,
  entity_type    TEXT NOT NULL,
  canonical      TEXT NOT NULL,
  relation       TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'indexer',
  confidence     SMALLINT NOT NULL DEFAULT 100,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entity_aliases_canonical_idx
  ON sap_exp.entity_aliases (canonical);

CREATE INDEX IF NOT EXISTS entity_aliases_type_relation_idx
  ON sap_exp.entity_aliases (entity_type, relation);

CREATE TABLE IF NOT EXISTS sap_exp.agent_directory_snapshots (
  agent_pda                TEXT PRIMARY KEY,
  wallet                   TEXT NOT NULL,
  name                     TEXT NOT NULL DEFAULT '',
  is_active                BOOLEAN NOT NULL DEFAULT false,
  is_merchant              BOOLEAN NOT NULL DEFAULT false,
  has_metaplex             BOOLEAN NOT NULL DEFAULT false,
  tool_count               INTEGER NOT NULL DEFAULT 0,
  volume_24h_lamports      NUMERIC NOT NULL DEFAULT '0',
  volume_7d_lamports       NUMERIC NOT NULL DEFAULT '0',
  total_settled_lamports   NUMERIC NOT NULL DEFAULT '0',
  calls_7d                 NUMERIC NOT NULL DEFAULT '0',
  total_calls              NUMERIC NOT NULL DEFAULT '0',
  health_score             SMALLINT NOT NULL DEFAULT 0,
  activity_score           NUMERIC NOT NULL DEFAULT '0',
  payload                  JSONB NOT NULL,
  sources                  JSONB NOT NULL,
  verified_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_directory_snapshots_activity_idx
  ON sap_exp.agent_directory_snapshots (activity_score DESC, tool_count DESC, total_settled_lamports DESC);

CREATE INDEX IF NOT EXISTS agent_directory_snapshots_wallet_idx
  ON sap_exp.agent_directory_snapshots (wallet);

CREATE INDEX IF NOT EXISTS agent_directory_snapshots_verified_idx
  ON sap_exp.agent_directory_snapshots (verified_at DESC);

CREATE TABLE IF NOT EXISTS sap_exp.data_health_checks (
  id          SERIAL PRIMARY KEY,
  scope       TEXT NOT NULL,
  check_name  TEXT NOT NULL,
  status      TEXT NOT NULL,
  expected    TEXT,
  actual      TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_health_checks_latest_idx
  ON sap_exp.data_health_checks (scope, check_name, checked_at DESC);
