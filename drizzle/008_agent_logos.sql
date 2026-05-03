-- ============================================================================
-- 008_agent_logos.sql — Persistent cache for agent logo URLs
--
-- Resolves and persists the canonical visual identity for each agent so the
-- listing page does not re-scrape `.well-known/agent.json` and re-walk MPL
-- Core asset metadata on every render.
--
-- Resolution order (handled at write time by metaplex-snapshot-store / a
-- dedicated logo resolver):
--   1. well_known_logo  — from <endpoint>/.well-known/agent.json `.logo`
--   2. mpl_image        — image from the MPL Core asset bound to this SAP
--                         PDA (preferred) or the first owned asset that
--                         carries an EIP-8004 AgentIdentity plugin.
--
-- Both fields are nullable: the avatar component falls back gracefully to
-- favicon → initials when neither is set.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sap_exp.agent_logos (
  wallet            TEXT PRIMARY KEY,
  well_known_logo   TEXT,
  mpl_image         TEXT,
  mpl_asset         TEXT,
  refreshed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_logos_refreshed_at_idx
  ON sap_exp.agent_logos (refreshed_at DESC);
