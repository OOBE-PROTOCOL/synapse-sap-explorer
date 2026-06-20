-- 013_tool_schemas_rich_compat.sql
-- Align sap_exp.tool_schemas with the schema used by tool detail pages,
-- schema verification routes, and decoded inscription events.

CREATE TABLE IF NOT EXISTS sap_exp.tool_schemas (
  id              BIGSERIAL PRIMARY KEY,
  tool_pda        TEXT NOT NULL REFERENCES sap_exp.tools(pda) ON DELETE CASCADE,
  agent_pda       TEXT,
  tx_signature    TEXT,
  schema_type     SMALLINT,
  schema_type_label TEXT,
  schema_data     TEXT,
  schema_json     JSONB,
  schema_hash     TEXT,
  computed_hash   TEXT,
  verified        BOOLEAN NOT NULL DEFAULT false,
  compression     SMALLINT NOT NULL DEFAULT 0,
  version         SMALLINT NOT NULL DEFAULT 0,
  tool_name       TEXT,
  block_time      TIMESTAMPTZ,
  indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sap_exp.tool_schemas
  ADD COLUMN IF NOT EXISTS agent_pda TEXT,
  ADD COLUMN IF NOT EXISTS tx_signature TEXT,
  ADD COLUMN IF NOT EXISTS schema_type SMALLINT,
  ADD COLUMN IF NOT EXISTS schema_type_label TEXT,
  ADD COLUMN IF NOT EXISTS schema_data TEXT,
  ADD COLUMN IF NOT EXISTS schema_json JSONB,
  ADD COLUMN IF NOT EXISTS computed_hash TEXT,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compression SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tool_name TEXT,
  ADD COLUMN IF NOT EXISTS block_time TIMESTAMPTZ;

UPDATE sap_exp.tool_schemas
SET
  schema_type = COALESCE(schema_type, 0),
  schema_type_label = COALESCE(schema_type_label, 'input'),
  schema_data = COALESCE(schema_data, schema_json::text, '{}'),
  schema_hash = COALESCE(schema_hash, ''),
  computed_hash = COALESCE(computed_hash, schema_hash, ''),
  tx_signature = COALESCE(tx_signature, ''),
  agent_pda = COALESCE(agent_pda, '')
WHERE schema_type IS NULL
   OR schema_type_label IS NULL
   OR schema_data IS NULL
   OR schema_hash IS NULL
   OR computed_hash IS NULL
   OR tx_signature IS NULL
   OR agent_pda IS NULL;

CREATE INDEX IF NOT EXISTS idx_tool_schemas_tool
  ON sap_exp.tool_schemas (tool_pda);

CREATE INDEX IF NOT EXISTS idx_tool_schemas_agent
  ON sap_exp.tool_schemas (agent_pda);

CREATE INDEX IF NOT EXISTS idx_tool_schemas_type
  ON sap_exp.tool_schemas (schema_type);

CREATE UNIQUE INDEX IF NOT EXISTS tool_schemas_tool_type_version_key
  ON sap_exp.tool_schemas (tool_pda, schema_type, version);
