-- ============================================================================
-- 009_agent_enrichment.sql — Persistent SWR cache for /agents enriched view
--
-- Problem: cold start of /agents waited 10–30s on:
--   • N×.well-known/agent.json HTTP scrapes
--   • N×agent.json metadata HTTP scrapes
--   • N×getParsedTokenAccountsByOwner (Token + Token-2022)
--   • Jupiter token-metadata resolutions for unknown mints
-- Solution (Solscan-style): persist the full enrichment slice per wallet so
-- the listing serves instantly from Postgres and refreshes in background.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sap_exp.agent_enrichment_cache (
  wallet         TEXT PRIMARY KEY,
  -- Opaque JSONB with: { balances, wellKnown, metadata, staking, deployedTokenCount }
  -- Keep schema flexible; enforced in TypeScript at the store layer.
  data           JSONB NOT NULL,
  refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_enrichment_cache_refreshed_at_idx
  ON sap_exp.agent_enrichment_cache (refreshed_at DESC);
