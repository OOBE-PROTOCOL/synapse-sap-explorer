-- Tool Inscribed Schemas Cache
-- Stores reconstructed JSON schemas from on-chain inscription events
-- Created: 2026-06-09

CREATE TABLE IF NOT EXISTS sap_exp.tool_schemas (
    id            SERIAL PRIMARY KEY,
    tool_pda      TEXT NOT NULL UNIQUE REFERENCES sap_exp.tools(pda) ON DELETE CASCADE,
    schema_hash   TEXT,
    schema_json   JSONB NOT NULL DEFAULT '{}',
    inscribed_at  BIGINT,
    tx_signature  TEXT REFERENCES sap_exp.transactions(signature),
    slot          BIGINT,
    indexed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by tool PDA
CREATE INDEX IF NOT EXISTS idx_tool_schemas_tool_pda 
ON sap_exp.tool_schemas(tool_pda);

-- Index for recently indexed schemas
CREATE INDEX IF NOT EXISTS idx_tool_schemas_indexed_at 
ON sap_exp.tool_schemas(indexed_at DESC);

-- Comment
COMMENT ON TABLE sap_exp.tool_schemas IS 'Cached JSON schemas inscribed on-chain for SAP tools';
COMMENT ON COLUMN sap_exp.tool_schemas.tool_pda IS 'Tool PDA that owns this schema';
COMMENT ON COLUMN sap_exp.tool_schemas.schema_json IS 'The full JSON schema object (input or output)';
COMMENT ON COLUMN sap_exp.tool_schemas.inscribed_at IS 'Block timestamp when schema was inscribed';
COMMENT ON COLUMN sap_exp.tool_schemas.tx_signature IS 'Transaction signature that inscribed the schema';
