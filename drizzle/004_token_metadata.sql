-- Token metadata persistent cache
CREATE TABLE IF NOT EXISTS sap_exp.token_metadata (
    mint        TEXT PRIMARY KEY,
    symbol      TEXT NOT NULL,
    name        TEXT NOT NULL,
    logo        TEXT,
    uri         TEXT,
    source      TEXT NOT NULL DEFAULT 'onchain',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
