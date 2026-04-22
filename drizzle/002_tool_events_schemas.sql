-- ============================================================================
-- MIGRATION 002: Tool lifecycle events + cached schemas
--
-- Adds:
--   1. tool_events   — lifecycle events decoded from TX logs
--   2. tool_schemas  — cached decoded schemas (from ToolSchemaInscribedEvent)
--
-- Comando:
--   sudo -u postgres psql -d DB_SAP_EXP -f 002_tool_events_schemas.sql
-- ============================================================================

SET search_path = sap_exp, public;


-- ============================================================================
-- 1. tool_events (lifecycle audit trail)
-- ============================================================================

CREATE TABLE tool_events (
  id              BIGSERIAL PRIMARY KEY,
  tool_pda        TEXT NOT NULL REFERENCES tools(pda) ON DELETE CASCADE,
  agent_pda       TEXT NOT NULL,
  tx_signature    TEXT NOT NULL,
  event_type      TEXT NOT NULL,          -- ToolPublished, ToolUpdated, ToolDeactivated,
                                          -- ToolReactivated, ToolClosed, ToolSchemaInscribed,
                                          -- ToolInvocationReported
  slot            BIGINT NOT NULL,
  block_time      TIMESTAMPTZ,

  -- Event-specific data (varies by event_type)
  tool_name       TEXT,
  old_version     SMALLINT,               -- ToolUpdated only
  new_version     SMALLINT,               -- ToolUpdated / ToolPublished
  invocations     NUMERIC,                -- ToolInvocationReported
  total_invocations NUMERIC,              -- ToolInvocationReported / ToolClosed
  schema_type     SMALLINT,               -- ToolSchemaInscribed: 0=input, 1=output, 2=desc
  extra           JSONB,                  -- catch-all for future event fields

  indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Dedup: one event per (tx, event_type, tool_pda)
  UNIQUE (tx_signature, event_type, tool_pda)
);

-- Indexes
CREATE INDEX idx_tool_events_tool    ON tool_events (tool_pda, slot DESC);
CREATE INDEX idx_tool_events_agent   ON tool_events (agent_pda, slot DESC);
CREATE INDEX idx_tool_events_type    ON tool_events (event_type);
CREATE INDEX idx_tool_events_slot    ON tool_events (slot DESC);
CREATE INDEX idx_tool_events_tx      ON tool_events (tx_signature);


-- ============================================================================
-- 2. tool_schemas (cached decoded schemas from TX log events)
-- ============================================================================

CREATE TABLE tool_schemas (
  id              BIGSERIAL PRIMARY KEY,
  tool_pda        TEXT NOT NULL REFERENCES tools(pda) ON DELETE CASCADE,
  agent_pda       TEXT NOT NULL,
  tx_signature    TEXT NOT NULL,

  schema_type     SMALLINT NOT NULL,      -- 0=input, 1=output, 2=description
  schema_type_label TEXT NOT NULL,        -- 'input', 'output', 'description'
  schema_data     TEXT NOT NULL,          -- decoded (decompressed) schema string
  schema_json     JSONB,                  -- parsed JSON if valid, NULL otherwise
  schema_hash     TEXT NOT NULL,          -- inscribed sha256 hex
  computed_hash   TEXT NOT NULL,          -- locally computed sha256 hex
  verified        BOOLEAN NOT NULL DEFAULT false,  -- schema_hash == computed_hash
  compression     SMALLINT NOT NULL DEFAULT 0,     -- 0=none, 1=deflate
  version         SMALLINT NOT NULL DEFAULT 0,
  tool_name       TEXT,

  block_time      TIMESTAMPTZ,
  indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One schema per type per version per tool
  UNIQUE (tool_pda, schema_type, version)
);

-- Indexes
CREATE INDEX idx_tool_schemas_tool   ON tool_schemas (tool_pda);
CREATE INDEX idx_tool_schemas_agent  ON tool_schemas (agent_pda);
CREATE INDEX idx_tool_schemas_type   ON tool_schemas (schema_type);


-- ============================================================================
-- Add sync cursor entries for new entities
-- ============================================================================

INSERT INTO sync_cursors (entity) VALUES ('tool_events'), ('tool_schemas')
  ON CONFLICT DO NOTHING;


-- ============================================================================
-- DONE — 2 tables added
-- ============================================================================
