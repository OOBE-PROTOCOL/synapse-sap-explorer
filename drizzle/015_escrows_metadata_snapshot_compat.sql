-- 015_escrows_metadata_snapshot_compat.sql
-- Compatibility fixes for v1.5 data pipeline on partially migrated DBs.

DO $$
BEGIN
  ALTER TABLE sap_exp.escrows
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping sap_exp.escrows.metadata: current role is not table owner';
END $$;

CREATE INDEX IF NOT EXISTS agent_snapshots_v2_agent_time_idx
  ON sap_exp.agent_snapshots_v2 (agent_pda, captured_at DESC);

CREATE INDEX IF NOT EXISTS tool_snapshots_v2_tool_time_idx
  ON sap_exp.tool_snapshots_v2 (tool_pda, captured_at DESC);
