
export const SAP_PROGRAM_ID = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

export const ESCROW_EVENT_LABELS: Record<string, { label: string; color: string }> = {
  create_escrow:   { label: 'New Escrow', color: 'text-primary'  },
  deposit_escrow:  { label: 'Deposit',    color: 'text-blue-400'    },
  settle_calls:    { label: 'Settled',    color: 'text-emerald-400' },
  withdraw_escrow: { label: 'Withdraw',   color: 'text-amber-400'   },
  close_escrow:    { label: 'Closed',     color: 'text-red-400'     },
};

export const PROGRAM_META: Record<string, { name: string; color: string }> = {
  [SAP_PROGRAM_ID]:                                    { name: 'SAP',            color: 'text-primary'     },
  '11111111111111111111111111111111':                   { name: 'System',         color: 'text-slate-400'   },
  ComputeBudget111111111111111111111111111111:          { name: 'Compute Budget', color: 'text-primary'  },
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:        { name: 'Token',          color: 'text-primary'    },
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL:       { name: 'ATA',            color: 'text-teal-400'    },
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s:        { name: 'Metaplex',       color: 'text-pink-400'    },
};

/**
 * Solana cluster explorer URLs (used for tx/account links to explorer.solana.com).
 */
export const EXPLORER_URLS: Record<string, string> = {
  mainnet: 'https://explorer.solana.com',
  devnet: 'https://explorer.solana.com?cluster=devnet',
  localnet: 'http://localhost:3000/explorer',
};

/**
 * Canonical SAP Explorer host. This is the base URL used to:
 *  - Render the EIP-8004 registration JSON endpoint
 *    (`<base>/agents/<sapAgentPda>/eip-8004.json`) attached to MPL Core
 *    `AgentIdentity` plugins.
 *  - Build x402 service URLs included in the registration document.
 *
 * Override via `NEXT_PUBLIC_SAP_EXPLORER_BASE` for staging/preview deploys.
 */
export const SAP_EXPLORER_BASE_URL: string =
  process.env.NEXT_PUBLIC_SAP_EXPLORER_BASE?.replace(/\/+$/, '') ??
  process.env.SAP_EXPLORER_BASE?.replace(/\/+$/, '') ??
  'https://explorer.oobeprotocol.ai';

export const TAG_COLORS: Record<string, string> = {
  excellent:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  good:       'bg-blue-500/15 text-blue-300 border-blue-500/30',
  reliable:   'bg-primary/15 text-primary border-primary/30',
  fast:       'bg-primary/15 text-primary border-primary/30',
  accurate:   'bg-teal-500/15 text-teal-300 border-teal-500/30',
  poor:       'bg-red-500/15 text-red-300 border-red-500/30',
  slow:       'bg-primary/15 text-primary border-primary/30',
  unreliable: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export const HEALTH_STATUS: Record<string, { color: string; label: string }> = {
  up:           { color: 'text-emerald-400', label: 'UP'      },
  down:         { color: 'text-red-400',     label: 'DOWN'    },
  timeout:      { color: 'text-yellow-400',  label: 'TIMEOUT' },
  'no-endpoint': { color: 'text-muted-foreground', label: 'N/A' },
};
