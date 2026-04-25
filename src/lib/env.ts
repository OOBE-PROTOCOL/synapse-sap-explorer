

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Missing required env var: ${key}. Copy .env.example to .env.local`,
    );
  }
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const env = {
  /* Synapse SDK */
  get SYNAPSE_API_KEY() {
    return required('SYNAPSE_API_KEY');
  },
  get SYNAPSE_NETWORK() {
    return optional('SYNAPSE_NETWORK', 'mainnet');
  },
  get SYNAPSE_REGION() {
    // Accept legacy "US" and explicit zone "US-1"; resolvers normalize both.
    return optional('SYNAPSE_REGION', 'US-1');
  },
  /**
   * Fallback Solana RPC URL used when Synapse RPC fails on heavy calls
   * (notably `getProgramAccounts`, which has been returning 502 during
   * Metaplex-related upstream incidents). Recommended: a Helius URL with
   * `?api-key=…`. Leave empty to disable fallback.
   */
  get SAP_FALLBACK_RPC_URL() {
    return optional('SAP_FALLBACK_RPC_URL', '');
  },
  /* Database */
  get DATABASE_URL() {
    return required('DATABASE_URL');
  },
  /* Indexer (optional) : polling, hybrid */
  get INDEXER_MODE() {
    return optional('INDEXER_MODE', 'polling');
  },
  get INDEXER_GRPC_COMMITMENT() {
    return optional('INDEXER_GRPC_COMMITMENT', 'confirmed');
  },
} as const;
