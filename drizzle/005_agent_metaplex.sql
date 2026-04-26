-- ============================================================================
-- 005_agent_metaplex.sql — Persistent Metaplex × SAP link snapshots
--
-- Caches the result of resolving a SAP wallet against MPL Core (on-chain
-- AgentIdentity plugins) and api.metaplex.com Agents Registry. Avoids
-- re-fetching every request and lets the API serve cached badges while a
-- background refresher updates rows asynchronously.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sap_exp.agent_metaplex (
  wallet           TEXT PRIMARY KEY,
  sap_agent_pda    TEXT,
  asset            TEXT,
  linked           BOOLEAN NOT NULL DEFAULT false,
  plugin_count     INTEGER NOT NULL DEFAULT 0,
  registry_count   INTEGER NOT NULL DEFAULT 0,
  agent_identity_uri TEXT,
  registration     JSONB,
  registry_agents  JSONB NOT NULL DEFAULT '[]',
  source           TEXT NOT NULL DEFAULT 'unknown',
  error            TEXT,
  refreshed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_metaplex_refreshed
  ON sap_exp.agent_metaplex (refreshed_at);
CREATE INDEX IF NOT EXISTS idx_agent_metaplex_linked
  ON sap_exp.agent_metaplex (linked) WHERE linked = true;
CREATE INDEX IF NOT EXISTS idx_agent_metaplex_has_plugin
  ON sap_exp.agent_metaplex (plugin_count) WHERE plugin_count > 0;
