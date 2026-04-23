-- ═══════════════════════════════════════════════
-- 003: v0.7 — Receipt batches, disputes, pending settlements
-- ═══════════════════════════════════════════════

-- Receipt batches (trustless dispute evidence)
CREATE TABLE IF NOT EXISTS sap_exp.receipt_batches (
    pda                TEXT PRIMARY KEY,
    escrow_pda         TEXT NOT NULL REFERENCES sap_exp.escrows(pda) ON DELETE CASCADE,
    batch_index        INTEGER NOT NULL,
    calls_merkle_root  TEXT NOT NULL,
    call_count         INTEGER NOT NULL DEFAULT 0,
    total_amount       NUMERIC NOT NULL DEFAULT '0',
    reporter           TEXT NOT NULL,
    tx_signature       TEXT,
    slot               BIGINT,
    block_time         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    indexed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_batches_escrow ON sap_exp.receipt_batches (escrow_pda);

-- Disputes (multi-layer resolution)
CREATE TABLE IF NOT EXISTS sap_exp.disputes (
    pda                TEXT PRIMARY KEY,
    escrow_pda         TEXT NOT NULL REFERENCES sap_exp.escrows(pda) ON DELETE CASCADE,
    disputant          TEXT NOT NULL,
    agent_pda          TEXT NOT NULL,
    dispute_type       TEXT NOT NULL,
    resolution_layer   TEXT NOT NULL DEFAULT 'Pending',
    outcome            TEXT NOT NULL DEFAULT 'Pending',
    dispute_bond       NUMERIC NOT NULL DEFAULT '0',
    proven_calls       INTEGER NOT NULL DEFAULT 0,
    claimed_calls      INTEGER NOT NULL DEFAULT 0,
    proof_deadline     BIGINT,
    reason             TEXT,
    tx_signature       TEXT,
    resolved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    indexed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON sap_exp.disputes (escrow_pda);
CREATE INDEX IF NOT EXISTS idx_disputes_agent ON sap_exp.disputes (agent_pda);
CREATE INDEX IF NOT EXISTS idx_disputes_outcome ON sap_exp.disputes (outcome);

-- Pending settlements (batch settlement with merkle proof)
CREATE TABLE IF NOT EXISTS sap_exp.pending_settlements (
    pda                 TEXT PRIMARY KEY,
    escrow_pda          TEXT NOT NULL REFERENCES sap_exp.escrows(pda) ON DELETE CASCADE,
    agent_pda           TEXT NOT NULL,
    amount              NUMERIC NOT NULL DEFAULT '0',
    calls_count         INTEGER NOT NULL DEFAULT 0,
    receipt_merkle_root TEXT,
    status              TEXT NOT NULL DEFAULT 'pending',
    tx_signature        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at          TIMESTAMPTZ,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_settlements_escrow ON sap_exp.pending_settlements (escrow_pda);
CREATE INDEX IF NOT EXISTS idx_pending_settlements_status ON sap_exp.pending_settlements (status);

-- Add receipt_batch_count to escrows
ALTER TABLE sap_exp.escrows ADD COLUMN IF NOT EXISTS receipt_batch_count INTEGER NOT NULL DEFAULT 0;
