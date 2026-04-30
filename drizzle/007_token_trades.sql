-- Genesis bonding curve trades indexed from RPC.
-- Populated by the trade indexer (src/lib/market/genesis-trades.ts) when a
-- /api/market/genesis-trades/[genesis] route is hit. Trades survive across
-- requests so we can rebuild OHLCV candles without re-fetching the full
-- signature history every time.
CREATE TABLE IF NOT EXISTS sap_exp.token_trades (
  signature        text PRIMARY KEY,
  genesis_address  text NOT NULL,
  base_mint        text NOT NULL,
  trader           text NOT NULL,
  side             text NOT NULL CHECK (side IN ('buy','sell')),
  base_amount      numeric(40,0) NOT NULL,    -- raw base-token units (no decimals applied)
  quote_amount     numeric(40,0) NOT NULL,    -- raw quote-token units (lamports for wSOL)
  base_decimals    smallint NOT NULL DEFAULT 9,
  quote_decimals   smallint NOT NULL DEFAULT 9,
  price_quote_per_base numeric(40,18) NOT NULL,  -- quote_ui / base_ui
  slot             bigint NOT NULL,
  block_time       timestamp with time zone NOT NULL,
  source           text NOT NULL DEFAULT 'bonding-curve',  -- bonding-curve | raydium | jupiter
  inserted_at      timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS token_trades_genesis_time_idx
  ON sap_exp.token_trades (genesis_address, block_time DESC);
CREATE INDEX IF NOT EXISTS token_trades_mint_time_idx
  ON sap_exp.token_trades (base_mint, block_time DESC);

-- Last successful indexer scan (so we don't re-walk the full history).
CREATE TABLE IF NOT EXISTS sap_exp.token_trade_cursors (
  genesis_address  text PRIMARY KEY,
  last_signature   text NOT NULL,
  last_slot        bigint NOT NULL,
  scanned_at       timestamp with time zone NOT NULL DEFAULT now()
);
