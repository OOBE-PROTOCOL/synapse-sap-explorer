-- ============================================================================
-- 006_public_api_keys.sql — Public API auth + per-minute rate windows
--
-- IMPORTANT:
-- - This migration must be applied manually by an operator.
-- - The application does NOT auto-create these tables.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS sap_exp;

CREATE TABLE IF NOT EXISTS sap_exp.api_keys (
  id          SERIAL PRIMARY KEY,
  key_prefix  TEXT NOT NULL DEFAULT '',
  key_hash    TEXT NOT NULL UNIQUE,
  tier        TEXT NOT NULL DEFAULT 'free',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  daily_limit INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tier
  ON sap_exp.api_keys (tier)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS sap_exp.api_rate_windows (
  identity_key TEXT NOT NULL,
  tier         TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_key, tier, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_windows_window
  ON sap_exp.api_rate_windows (window_start);

-- Optional housekeeping helper (manual):
-- DELETE FROM sap_exp.api_rate_windows WHERE window_start < NOW() - INTERVAL '7 days';

