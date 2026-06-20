-- 012_account_snapshots_v2.sql
-- Append-only account snapshot history for real explorer activity charts.

CREATE TABLE IF NOT EXISTS sap_exp.agent_snapshots_v2 (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_pda    TEXT NOT NULL REFERENCES sap_exp.agents(pda) ON DELETE CASCADE,
  slot         BIGINT NOT NULL,
  captured_at  TIMESTAMPTZ NOT NULL,
  payload      JSONB NOT NULL,
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_snapshots_v2_agent_time_idx
  ON sap_exp.agent_snapshots_v2 (agent_pda, captured_at DESC);

CREATE INDEX IF NOT EXISTS agent_snapshots_v2_time_idx
  ON sap_exp.agent_snapshots_v2 (captured_at DESC);

CREATE TABLE IF NOT EXISTS sap_exp.tool_snapshots_v2 (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_pda     TEXT NOT NULL REFERENCES sap_exp.tools(pda) ON DELETE CASCADE,
  slot         BIGINT NOT NULL,
  captured_at  TIMESTAMPTZ NOT NULL,
  payload      JSONB NOT NULL,
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_snapshots_v2_tool_time_idx
  ON sap_exp.tool_snapshots_v2 (tool_pda, captured_at DESC);

CREATE INDEX IF NOT EXISTS tool_snapshots_v2_time_idx
  ON sap_exp.tool_snapshots_v2 (captured_at DESC);
