'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Bot, Wrench, Lock, Shield, Receipt,
  ArrowDown, Activity, CheckCircle2, Database,
  ChevronRight, ChevronDown, Layers, FileCode2, Fingerprint,
  Star, Network, Hash, Info,
  Zap, Globe, Eye, SquareCode, KeyRound, Coins,
  CircleDot,  AlertTriangle, 
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  ExplorerPageShell,
  ExplorerMetric,
} from '~/components/ui';
import { DataSourceBadge } from '~/components/ui/explorer-primitives';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useOverview, useDisputes, useReceiptBatches } from '~/hooks/use-sap';
import { fmtNum } from '~/lib/format';

/* ═══════════════════════════════════════════════════════
   Tip — reusable inline tooltip
   ═══════════════════════════════════════════════════════ */

function Tip({ children, content, className }: { children: ReactNode; content: ReactNode; className?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center gap-0.5 cursor-help underline decoration-dotted decoration-muted-foreground/30 underline-offset-2", className)}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function InfoTip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="inline h-3 w-3 text-muted-foreground/50 cursor-help ml-0.5" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ═══════════════════════════════════════════════════════
   Flow stage data model
   ═══════════════════════════════════════════════════════ */

type PdaInfo = {
  name: string;
  seeds: string;
  size: string;
  rent: string;
  tooltip: string;
};

type InstructionInfo = {
  name: string;
  description: string;
  signer: string;
  tooltip: string;
};

type FlowStage = {
  id: string;
  step: number;
  phase: string;
  label: string;
  icon: typeof Bot;
  tagline: string;
  whyItMatters: string;
  howItWorks: string[];
  dataSource: 'onchain' | 'offchain' | 'hybrid';
  color: string;
  colorVar: string;
  glowClass: string;
  pdas: PdaInfo[];
  instructions: InstructionInfo[];
  validationRules: string[];
  events: string[];
  keyInsight: string;
};

const FLOW_STAGES: FlowStage[] = [
  {
    id: 'register',
    step: 1,
    phase: 'Identity',
    label: 'Agent Registration',
    icon: Bot,
    tagline: 'On-chain identity & reputation bootstrap',
    whyItMatters:
      'Every AI agent needs a verifiable on-chain identity before it can publish tools, receive payments, or build reputation. ' +
      'Registration creates the agent\'s permanent home on Solana: an 8 KB PDA that acts as a decentralized profile, ' +
      'discoverable by any client without relying on centralized registries.',
    howItWorks: [
      'The agent owner wallet signs a register_agent transaction with name, description, capabilities, and pricing tiers.',
      'The program creates an 8,192-byte AgentAccount PDA seeded by ["sap_agent", wallet] and a companion 106-byte AgentStats PDA.',
      'All fields pass through the deep validation engine: names ≤64 bytes with no control chars, capabilities in "domain:action" format (max 10, no duplicates), pricing tiers (max 5) with optional volume curves.',
      'The GlobalRegistry singleton increments its active_agents counter. The agent is immediately discoverable via getAccountInfo or getProgramAccounts.',
      'Updates use partial semantics: only supplied fields are validated and changed. None fields are left untouched.',
    ],
    dataSource: 'onchain',
    color: 'text-[hsl(var(--glow))]',
    colorVar: '--glow',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--glow)/0.4)]',
    pdas: [
      { name: 'AgentAccount', seeds: '["sap_agent", wallet]', size: '8,192 B', rent: '~0.060 SOL', tooltip: 'Core identity PDA. Contains name, description, capabilities (max 10), pricing tiers (max 5), reputation fields, and protocol affiliations. Seeded by owner wallet for deterministic derivation.' },
      { name: 'AgentStats', seeds: '["sap_stats", agent]', size: '106 B', rent: '~0.001 SOL', tooltip: 'Companion stats tracker. Stores total_calls_served separately to reduce AgentAccount write contention during high-frequency call reporting.' },
      { name: 'GlobalRegistry', seeds: '["sap_global"]', size: '137 B', rent: '~0.002 SOL', tooltip: 'Protocol singleton. Tracks total_agents, active_agents, total_tools, total_escrows counters. Created once via initialize_global.' },
    ],
    instructions: [
      { name: 'register_agent', description: 'Create AgentAccount + AgentStats PDAs. Deep-validates every field.', signer: 'wallet', tooltip: 'Creates both PDAs atomically. Runs the full validation engine: name (1-64 bytes, no control chars), description (1-256 bytes), capabilities ("domain:action", max 10, no dupes), pricing (max 5 tiers, unique tier_id, rate_limit > 0), x402_endpoint (must start with https://). Bumps GlobalRegistry counters.' },
      { name: 'update_agent', description: 'Partial update. None fields left unchanged. Re-validates supplied fields.', signer: 'wallet', tooltip: 'Uses Option<T> for every field. Only non-None fields are validated and written. This means you can update just the name without resending capabilities. validate_update() enforces the same rules as registration.' },
      { name: 'deactivate_agent', description: 'Sets is_active = false. Filtered from discovery.', signer: 'wallet', tooltip: 'Soft-delete: the PDA remains on-chain but is_active = false. Discovery indexes filter on this flag. Errors AlreadyInactive if already off. Decrements GlobalRegistry.active_agents.' },
      { name: 'reactivate_agent', description: 'Sets is_active = true. Returns to discovery.', signer: 'wallet', tooltip: 'Reverse of deactivate. Errors AlreadyActive if already on. Increments GlobalRegistry.active_agents.' },
      { name: 'close_agent', description: 'Closes both PDAs, returns rent. Decrements global counters.', signer: 'wallet', tooltip: 'Permanent deletion. Closes AgentAccount + AgentStats PDAs. ~0.061 SOL rent returned to wallet. Decrements GlobalRegistry counters (only active_agents if agent was active).' },
      { name: 'report_calls', description: 'Increments AgentStats.total_calls_served.', signer: 'wallet', tooltip: 'Simple counter increment. Protected by ArithmeticOverflow check. No reputation effect, purely usage tracking.' },
      { name: 'update_reputation', description: 'Self-report latency (ms) and uptime (0-100%).', signer: 'wallet', tooltip: 'Writes avg_latency_ms (u32) and uptime_percent (u8, validated 0-100) directly to AgentAccount. These are self-reported metrics. Trust comes from peer feedback, not self-reports.' },
    ],
    validationRules: [
      'name: 1–64 bytes, no control chars (< 0x20)',
      'description: 1–256 bytes',
      'capabilities: max 10 items, each "domain:action" format, no duplicates',
      'pricing: max 5 tiers, unique tier_id, rate_limit > 0',
      'SPL pricing requires token_mint to be Some',
      'x402_endpoint must start with https://, ≤ 256 bytes',
      'volume_curve: max 5 breakpoints, after_calls strictly ascending',
      'uptime_percent: 0–100 (validated by validate_uptime_percent)',
    ],
    events: ['RegisteredEvent', 'UpdatedEvent', 'DeactivatedEvent', 'ReactivatedEvent', 'AgentClosedEvent'],
    keyInsight: 'Registration costs ~0.061 SOL rent (fully recoverable on close). The 8 KB account size allows growth: capabilities, pricing tiers, and plugins can be added later without reallocation.',
  },
  {
    id: 'tools',
    step: 2,
    phase: 'Discovery',
    label: 'Tool Publishing',
    icon: Wrench,
    tagline: 'Schema registry with on-chain hashes & TX-log inscriptions',
    whyItMatters:
      'Tools are the API surface of an AI agent. Publishing tools on-chain means any client can discover what an agent can do, ' +
      'verify schema integrity via hashes, and invoke tools through a standardized interface, all without trusting a central directory.',
    howItWorks: [
      'The agent publishes a ToolDescriptor PDA (333 bytes) with compact metadata: tool name, name hash, protocol hash, input/output schema hashes, HTTP method, category, and param counts.',
      'Full JSON schemas are inscribed into Solana TX logs via inscribe_tool_schema. The on-chain PDA holds only hashes; sha256 verification ensures integrity.',
      'Tools are categorized into ToolCategoryIndex PDAs (0-9 enum, up to 100 tools each) for efficient discovery by category.',
      'Cross-referencing via CapabilityIndex and ProtocolIndex PDAs allows clients to find all agents offering a specific capability or belonging to a protocol.',
      'Tools are versioned: update_tool bumps the version counter. Deactivation marks a tool unavailable without deleting it.',
    ],
    dataSource: 'hybrid',
    color: 'text-[hsl(var(--neon-orange))]',
    colorVar: '--neon-orange',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--neon-orange)/0.4)]',
    pdas: [
      { name: 'ToolDescriptor', seeds: '["sap_tool", agent, name_hash]', size: '333 B', rent: '~0.004 SOL', tooltip: 'One PDA per tool per agent. Stores metadata compactly: name (≤32 bytes), name_hash (sha256), protocol_hash, description_hash, input/output schema hashes, http_method (0-4), category (0-9), params_count, required_params, is_compound flag, version counter.' },
      { name: 'ToolCategoryIndex', seeds: '["sap_tool_cat", category]', size: '3,255 B', rent: '~0.024 SOL', tooltip: 'One PDA per category (0=Swap, 1=Lend, etc.). Holds up to 100 tool pubkeys for efficient category-based discovery. Created via init_tool_category_index.' },
      { name: 'CapabilityIndex', seeds: '["sap_cap_idx", hash]', size: '3,386 B', rent: '~0.025 SOL', tooltip: 'Maps a capability hash to up to 100 agent pubkeys. Created via init_capability_index with the SHA-256 of the capability string (e.g., "jupiter:swap").' },
      { name: 'ProtocolIndex', seeds: '["sap_proto_idx", hash]', size: '3,386 B', rent: '~0.025 SOL', tooltip: 'Maps a protocol hash to agent pubkeys. Allows clients to find all agents affiliated with a specific protocol (e.g., "jupiter", "raydium").' },
    ],
    instructions: [
      { name: 'publish_tool', description: 'Create ToolDescriptor PDA with schema hashes and metadata.', signer: 'agent owner', tooltip: 'Takes 11 arguments including tool_name, tool_name_hash (must equal sha256(name)), protocol_hash, description_hash, input/output schema hashes, http_method (0=GET, 1=POST, 2=PUT, 3=DELETE, 4=PATCH), category (0-9), params_count, required_params, is_compound. Bumps GlobalRegistry.total_tools.' },
      { name: 'inscribe_tool_schema', description: 'Inscribe full JSON schema to TX log. Verifies hash integrity.', signer: 'agent owner', tooltip: 'Writes the complete JSON schema into the transaction log (zero rent, permanent storage). schema_type: 0=input, 1=output, 2=description. The program verifies sha256(schema_data) == schema_hash before emitting.' },
      { name: 'update_tool', description: 'Partial update, bumps version. None = unchanged.', signer: 'agent owner', tooltip: 'Option<T> semantics like update_agent. Can update description_hash, input/output schema hashes, http_method, category, params_count, required_params. Errors NoFieldsToUpdate if everything is None.' },
      { name: 'deactivate_tool / reactivate_tool', description: 'Toggle tool active state for discovery filtering.', signer: 'agent owner', tooltip: 'deactivate_tool → is_active = false (errors ToolAlreadyInactive). reactivate_tool → is_active = true (errors ToolAlreadyActive). Tool remains on-chain either way.' },
      { name: 'init_capability_index', description: 'Create capability index PDA, register first agent.', signer: 'agent owner', tooltip: 'Takes capability_id (string) and capability_hash (sha256 of the id). Creates the CapabilityIndex PDA and adds the caller\'s agent as the first entry. Subsequent agents use add_to_capability_index.' },
      { name: 'init_tool_category_index', description: 'Create category index for enum value 0–9.', signer: 'agent owner', tooltip: 'Creates a ToolCategoryIndex PDA for one of the 10 tool categories. add_to_tool_category then registers tools (verifies tool.category matches).' },
    ],
    validationRules: [
      'tool_name: 1–32 bytes, sha256 must match tool_name_hash on publish',
      'http_method: 0–4 (GET=0, POST=1, PUT=2, DELETE=3, PATCH=4)',
      'category: 0–9 (ToolCategory enum)',
      'schema_type: 0=input, 1=output, 2=description',
      'inscribe_tool_schema verifies sha256(data) == hash before emit',
      'All index PDAs capped at 100 entries',
      'add_to_tool_category verifies tool.category == requested category',
    ],
    events: ['ToolPublishedEvent', 'ToolUpdatedEvent', 'ToolSchemaInscribedEvent', 'ToolDeactivatedEvent'],
    keyInsight: 'Schema data lives in TX logs at zero ongoing cost. The on-chain PDA stores only 32-byte hashes for integrity verification. This hybrid design balances verifiability with cost efficiency.',
  },
  {
    id: 'escrow',
    step: 3,
    phase: 'Payment',
    label: 'Escrow Funding',
    icon: Lock,
    tagline: 'Pre-funded trustless micropayment channels',
    whyItMatters:
      'AI agent calls cost fractions of a cent, but blockchain transactions cost ~$0.0002 each. ' +
      'The x402 escrow system solves this by pre-funding a payment channel: the client deposits once, ' +
      'and the agent settles multiple calls in batches. No trust required: funds are locked in a PDA that neither party can unilaterally drain.',
    howItWorks: [
      'The client (depositor) creates an EscrowAccount PDA seeded by ["sap_escrow", agent, depositor]. This binds the escrow to a specific agent-client pair.',
      'Price-per-call is set at creation and is immutable. This prevents the agent from raising prices on locked funds.',
      'Volume curve breakpoints (max 5) allow tiered pricing: e.g., first 100 calls at 0.0001 SOL, next 1000 at 0.00005 SOL.',
      'The client can top up (deposit_escrow) or withdraw (withdraw_escrow) at any time. The escrow tracks balance, total_deposited, and total_settled separately.',
      'Escrows support both SOL and any SPL token. SPL escrows require token accounts passed via remaining_accounts.',
      'Optional expiry: expires_at = 0 means no expiry; otherwise, settlements fail after the timestamp.',
    ],
    dataSource: 'onchain',
    color: 'text-[hsl(var(--neon-emerald))]',
    colorVar: '--neon-emerald',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--neon-emerald)/0.4)]',
    pdas: [
      { name: 'EscrowAccount', seeds: '["sap_escrow", agent, depositor]', size: '291 B', rent: '~0.004 SOL', tooltip: 'One PDA per (agent, depositor) pair. Stores: balance, total_deposited, total_settled, total_calls_settled, price_per_call (immutable), max_calls, created_at, last_settled_at, expires_at, volume_curve (max 5 breakpoints), token_mint (None=SOL), token_decimals.' },
    ],
    instructions: [
      { name: 'create_escrow', description: 'Create escrow PDA with immutable price, max_calls, initial deposit, and volume curve.', signer: 'depositor', tooltip: 'Takes price_per_call (immutable), max_calls (0=unlimited), initial_deposit (transferred in same TX), expires_at (0=never), volume_curve (max 5 breakpoints), token_mint (null=SOL), token_decimals. Agent must be active.' },
      { name: 'deposit_escrow', description: 'Add funds to existing escrow.', signer: 'depositor', tooltip: 'Simple top-up. Increments balance and total_deposited. Works for both SOL and SPL escrows.' },
      { name: 'withdraw_escrow', description: 'Client withdraws min(amount, balance).', signer: 'depositor', tooltip: 'Client can always reclaim their unused funds. Takes min(requested_amount, current_balance) to prevent underflow. Errors EscrowEmpty if balance is 0.' },
      { name: 'close_escrow', description: 'Close empty escrow PDA (balance must be 0). Rent returned to depositor.', signer: 'depositor', tooltip: 'Can only close when balance == 0 (error: EscrowNotEmpty otherwise). Returns ~0.004 SOL rent to the depositor. Decrements GlobalRegistry escrow counter.' },
    ],
    validationRules: [
      'price_per_call is immutable after creation, cannot be changed',
      'volume_curve: max 5 breakpoints, after_calls must be strictly ascending',
      'SPL escrows require token_account + token_program in remaining_accounts',
      'expires_at enforced on every settle_calls (0 = no expiry)',
      'Agent must be active (AgentInactive error) to create escrow',
      'close requires balance == 0 (EscrowNotEmpty error)',
      'withdraw takes min(amount, balance) to prevent underflow',
    ],
    events: ['EscrowCreatedEvent', 'EscrowDepositEvent', 'EscrowWithdrawEvent', 'EscrowClosedEvent'],
    keyInsight: 'The immutable price_per_call is a key trust mechanism: once funds are deposited, the agent cannot raise prices. Volume curves incentivize long-term usage by offering bulk discounts.',
  },
  {
    id: 'receipts',
    step: 4,
    phase: 'Attestation',
    label: 'Memory & Receipts',
    icon: Receipt,
    tagline: 'Encrypted vault inscriptions with Merkle-chain integrity',
    whyItMatters:
      'AI agents need to store conversation history, tool call logs, and decision traces. The Memory Vault system provides encrypted, ' +
      'tamper-proof storage on Solana. Data is AES-256-GCM encrypted client-side, inscribed into TX logs at zero rent, ' +
      'and linked via a rolling Merkle chain that makes any tampering detectable.',
    howItWorks: [
      'init_vault creates a MemoryVault PDA storing a PBKDF2 nonce salt. This salt is used client-side for key derivation. The program never sees plaintext.',
      'Sessions are opened per-task. Each gets a SessionLedger PDA that tracks sequence numbers, merkle roots, and epoch counters.',
      'inscribe_memory writes AES-256-GCM ciphertext (1-750 bytes) to the Solana TX log. The data is permanent and free (no rent).',
      'Each write updates: merkle_root = sha256(prev_root || content_hash). This creates an unforgeable chain. Any inserted, deleted, or modified entry breaks the hash.',
      'The MemoryLedger PDA provides a 4 KB ring buffer for hot-path reads via getAccountInfo (free RPC call). When the buffer is full, oldest entries are evicted (but remain in TX logs).',
      'LedgerPage PDAs are permanent archives (the only PDA with no close instruction). Once sealed, they are immutable.',
      'Hot wallets can be authorized via add_vault_delegate with bitmask permissions (1=inscribe, 2=close, 4=open) and expiry timestamps.',
    ],
    dataSource: 'onchain',
    color: 'text-[hsl(var(--neon-amber))]',
    colorVar: '--neon-amber',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--neon-amber)/0.4)]',
    pdas: [
      { name: 'MemoryVault', seeds: '["sap_vault", agent]', size: '178 B', rent: '~0.002 SOL', tooltip: 'Root vault PDA per agent. Stores PBKDF2 nonce salt (never decrypted on-chain), nonce_version (incremented on rotation), session count, and creation timestamp.' },
      { name: 'SessionLedger', seeds: '["sap_session", vault, hash]', size: '210 B', rent: '~0.003 SOL', tooltip: 'Per-task session tracker. hash is SHA-256 of a deterministic session ID. Tracks sequence_counter, merkle_root, current_epoch, total_checkpoints, is_closed flag.' },
      { name: 'MemoryLedger', seeds: '["sap_ledger", session]', size: '4,269 B', rent: '~0.032 SOL', tooltip: '4 KB ring buffer for hot-path reads. Each entry: [data_len: u16 LE][data]. When full, oldest entries are drained. num_entries tracks lifetime writes (including evicted). merkle_root provides tamper detection.' },
      { name: 'EpochPage', seeds: '["sap_epoch", session, idx]', size: '103 B', rent: '~0.002 SOL', tooltip: 'Lightweight epoch boundary marker. Auto-created when inscriptions cross epoch boundaries. Tracks the epoch_index for historical navigation.' },
      { name: 'LedgerPage', seeds: '["sap_page", ledger, page_idx]', size: '4,193 B', rent: '~0.031 SOL', tooltip: 'PERMANENT archive page, the only PDA in SAP with no close instruction. Write-once, immutable after sealing. Used for long-term tamper-proof storage.' },
      { name: 'VaultDelegate', seeds: '["sap_delegate", vault, delegate]', size: '122 B', rent: '~0.002 SOL', tooltip: 'Hot wallet authorization. Permissions bitmask: 1=inscribe, 2=close sessions, 4=open sessions. Has an expires_at timestamp for time-limited access.' },
    ],
    instructions: [
      { name: 'init_vault', description: 'Create MemoryVault PDA with PBKDF2 nonce salt.', signer: 'wallet', tooltip: 'Takes vault_nonce (32 bytes), the PBKDF2 salt for client-side key derivation. The program stores but never interprets this nonce.' },
      { name: 'open_session', description: 'Create SessionLedger PDA for a task context.', signer: 'wallet', tooltip: 'Takes session_hash (SHA-256 of a deterministic session ID). Creates SessionLedger with zeroed sequence_counter and merkle_root.' },
      { name: 'inscribe_memory', description: 'Write AES-256-GCM ciphertext to TX log (8 args, full control).', signer: 'wallet', tooltip: 'Full-featured inscription: sequence, encrypted_data (1-750 bytes), nonce (12 bytes), content_hash (sha256 of plaintext), total_fragments, fragment_index, compression flag, epoch_index. Updates merkle_root atomically.' },
      { name: 'compact_inscribe', description: 'Simplified: 4 args, single fragment, current epoch.', signer: 'wallet', tooltip: 'DX-first variant: just sequence, encrypted_data, nonce, content_hash. Assumes single fragment, no compression, auto-resolves epoch. Recommended for most use cases.' },
      { name: 'inscribe_memory_delegated', description: 'Delegation variant: authorized hot wallet signs.', signer: 'delegate', tooltip: 'Same as inscribe_memory but the delegate wallet signs instead of the owner. Checks VaultDelegate PDA for correct permissions bitmask (bit 0 = inscribe) and expiry.' },
      { name: 'rotate_vault_nonce', description: 'Rotate PBKDF2 salt for forward secrecy.', signer: 'wallet', tooltip: 'Takes new_nonce (32 bytes). Emits the OLD nonce in a NonceRotatedEvent so historical data can still be decrypted. Increments nonce_version.' },
      { name: 'add_vault_delegate', description: 'Authorize a hot wallet with bitmask permissions + expiry.', signer: 'wallet', tooltip: 'Creates VaultDelegate PDA. permissions bitmask: 1=can inscribe, 2=can close sessions, 4=can open sessions. expires_at timestamp for time-limited access (0=never).' },
      { name: 'create_ledger / write_ledger', description: '4 KB ring buffer + permanent LedgerPage archive.', signer: 'authority', tooltip: 'create_ledger initializes the MemoryLedger ring buffer. write_ledger appends data. When the 4 KB ring is full, oldest entries are drained. Sealed pages become permanent LedgerPage PDAs.' },
    ],
    validationRules: [
      'encrypted_data: 1–750 bytes (InscriptionTooLarge / EmptyInscription)',
      'sequence must match session.sequence_counter (InvalidSequence)',
      'fragment_index < total_fragments (InvalidFragmentIndex)',
      'total_fragments >= 1 (InvalidTotalFragments)',
      'Session must not be closed (SessionClosed error)',
      'Delegate: permissions bitmask + expiry checked (DelegateExpired / InvalidDelegate)',
      'epoch_index must match session.current_epoch (EpochMismatch)',
      'LedgerPage has no close instruction (permanent on-chain storage)',
    ],
    events: ['MemoryInscribedEvent', 'VaultInitializedEvent', 'SessionOpenedEvent', 'LedgerEntryEvent', 'NonceRotatedEvent'],
    keyInsight: 'The two-tier storage model is key: hot path (MemoryLedger ring buffer, readable via getAccountInfo for free) and cold path (TX logs, queryable via getSignaturesForAddress). This gives O(1) reads for recent data and full history at zero rent.',
  },
  {
    id: 'settlement',
    step: 5,
    phase: 'Payment',
    label: 'Settlement',
    icon: CheckCircle2,
    tagline: 'Atomic fund transfer with volume-curve pricing',
    whyItMatters:
      'Settlement is where money actually moves. The agent claims payment by proving it served N calls, ' +
      'and the escrow computes the exact amount owed using the volume curve. This happens atomically: ' +
      'either the full settlement succeeds, or nothing changes. No partial payments, no race conditions.',
    howItWorks: [
      'The agent calls settle_calls with the number of calls to settle and a service_hash (for auditability).',
      'The program computes the effective price per call by walking the volume curve breakpoints. If total_calls_settled crosses a threshold, the discounted rate kicks in.',
      'Funds transfer atomically from the escrow PDA (which is the lamport holder) directly to the agent_wallet. No intermediary.',
      'PaymentSettledEvent is emitted as a permanent receipt in the TX log. This is the proof of payment.',
      'settle_batch allows up to 10 settlements in one transaction. The volume curve is computed across the entire batch for consistency.',
      'After settlement, total_settled (lifetime lamports) and total_calls_settled are updated for auditing.',
    ],
    dataSource: 'onchain',
    color: 'text-[hsl(var(--neon-emerald))]',
    colorVar: '--neon-emerald',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--neon-emerald)/0.4)]',
    pdas: [
      { name: 'EscrowAccount', seeds: '["sap_escrow", agent, depositor]', size: '291 B', rent: '(shared with Escrow stage)', tooltip: 'Same PDA as the Escrow Funding stage. Settlement updates balance (decreases), total_settled (increases), total_calls_settled (increases), and last_settled_at timestamp.' },
    ],
    instructions: [
      { name: 'settle_calls', description: 'Agent claims payment for N calls. Volume curve determines effective price.', signer: 'agent wallet', tooltip: 'Takes calls_to_settle (u64, >=1) and service_hash ([u8;32] for audit trail). Computes amount = sum of effective prices per call (walking volume curve breakpoints). Transfers lamports from escrow PDA to agent_wallet. Emits PaymentSettledEvent.' },
      { name: 'settle_batch', description: 'Batch settle 1–10 settlements in a single transaction.', signer: 'agent wallet', tooltip: 'Takes Vec<Settlement> (1-10 items). Each Settlement has calls_to_settle and service_hash. Volume curve spans the entire batch for consistent pricing. More efficient than N separate settle_calls.' },
    ],
    validationRules: [
      'Balance must cover calls x effective_price (InsufficientEscrowBalance)',
      'total_calls_settled + calls <= max_calls when max_calls > 0 (EscrowMaxCallsExceeded)',
      'calls_to_settle >= 1 (InvalidSettlementCalls)',
      'Agent must be active (AgentInactive error if deactivated)',
      'Escrow must not be expired (EscrowExpired if Clock > expires_at)',
      'Batch: 1-10 settlements (BatchEmpty / BatchTooLarge)',
    ],
    events: ['PaymentSettledEvent', 'BatchSettledEvent'],
    keyInsight: 'Volume curve pricing is computed incrementally. If the 100th call crosses a breakpoint threshold, only calls after the threshold get the new rate. This makes pricing fair and predictable.',
  },
  {
    id: 'reputation',
    step: 6,
    phase: 'Trust',
    label: 'Reputation & Attestation',
    icon: Star,
    tagline: 'Trustless on-chain reputation + web-of-trust vouching',
    whyItMatters:
      'In a decentralized agent marketplace, trust can\'t come from a central authority rating system. ' +
      'SAP combines two complementary mechanisms: quantitative peer feedback (scores 0-1000 per reviewer) ' +
      'and qualitative web-of-trust attestations. Both are on-chain, verifiable, and sybil-resistant through economic incentives.',
    howItWorks: [
      'Feedback: Any wallet can review any agent (one FeedbackAccount PDA per pair). Score is 0-1000. Self-review is blocked.',
      'The agent\'s reputation_score is computed incrementally: (reputation_sum x 10) / total_feedbacks, giving a 0-10,000 range with 2-decimal precision.',
      'Feedback can be updated (atomically adjusts reputation_sum with new_score - old_score) or revoked (subtracts score). This means the reputation is always mathematically correct.',
      'Attestation: Any wallet can vouch for any agent via AgentAttestation PDA. Types: "verified", "audited", "partner", etc.',
      'Trust derives from WHO is attesting. An attestation from a known auditor carries weight not because of the protocol, but because of the attester\'s identity.',
      'Attestations support expiry timestamps (0 = never expires). They can be revoked by the original attester.',
    ],
    dataSource: 'onchain',
    color: 'text-[hsl(var(--neon-rose))]',
    colorVar: '--neon-rose',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--neon-rose)/0.4)]',
    pdas: [
      { name: 'FeedbackAccount', seeds: '["sap_feedback", agent, reviewer]', size: '209 B', rent: '~0.002 SOL', tooltip: 'One per (agent, reviewer) pair. Stores: score (u16, 0-1000), tag (string, <=32 bytes), comment_hash (optional [u8;32]), is_revoked flag, created_at, updated_at. Self-review blocked by SelfReviewNotAllowed.' },
      { name: 'AgentAttestation', seeds: '["sap_attest", agent, attester]', size: '198 B', rent: '~0.003 SOL', tooltip: 'One per (agent, attester) pair. Stores: attestation_type (string, 1-32 chars), metadata_hash ([u8;32]), is_active flag, expires_at (0=never), created_at. Self-attestation blocked.' },
    ],
    instructions: [
      { name: 'give_feedback', description: 'Create feedback PDA. Score 0-1000. Updates reputation incrementally.', signer: 'reviewer', tooltip: 'Creates FeedbackAccount PDA. Updates AgentAccount: reputation_sum += score, total_feedbacks += 1, reputation_score = (reputation_sum * 10) / total_feedbacks. Score > 1000 → InvalidFeedbackScore.' },
      { name: 'update_feedback', description: 'Modify score/tag. Adjusts reputation sum atomically.', signer: 'reviewer', tooltip: 'Does reputation_sum = reputation_sum - old_score + new_score atomically. The reputation_score is recomputed in the same instruction. Tag and comment_hash can also be updated.' },
      { name: 'revoke_feedback', description: 'Mark as revoked. Subtracts score from reputation.', signer: 'reviewer', tooltip: 'Sets is_revoked = true. Does reputation_sum -= score, total_feedbacks -= 1. Errors FeedbackAlreadyRevoked on double-revoke. After revocation, close_feedback can reclaim rent.' },
      { name: 'create_attestation', description: 'Vouch with type, metadata hash, and optional expiry.', signer: 'attester', tooltip: 'Creates AgentAttestation PDA. attestation_type: freeform string <=32 chars (e.g., "verified", "audited", "partner"). metadata_hash: SHA-256 of off-chain attestation details. expires_at: 0=never.' },
      { name: 'revoke_attestation', description: 'Deactivate an attestation. Only original attester can revoke.', signer: 'attester', tooltip: 'Sets is_active = false. Only the original attester can revoke. Errors AttestationAlreadyRevoked on double-revoke. After revocation, close_attestation reclaims rent.' },
    ],
    validationRules: [
      'Score: 0-1000 (InvalidFeedbackScore if exceeded)',
      'Tag: <= 32 bytes (TagTooLong)',
      'Self-review blocked (SelfReviewNotAllowed: reviewer != agent.wallet)',
      'Self-attestation blocked (SelfAttestationNotAllowed: attester != agent.wallet)',
      'Attestation type: 1-32 chars, non-empty',
      'Reputation formula: (reputation_sum x 10) / total_feedbacks',
      'close_feedback requires is_revoked = true (FeedbackNotRevoked)',
      'close_attestation requires is_active = false (AttestationNotRevoked)',
    ],
    events: ['FeedbackGivenEvent', 'FeedbackUpdatedEvent', 'FeedbackRevokedEvent', 'AttestationCreatedEvent', 'AttestationRevokedEvent'],
    keyInsight: 'The incremental reputation formula avoids re-scanning all feedbacks on every update. Each give/update/revoke adjusts the sum and count in O(1), keeping the instruction compute-efficient even with thousands of reviews.',
  },
  {
    id: 'staking',
    step: 7,
    phase: 'Trust',
    label: 'Agent Staking',
    icon: Coins,
    tagline: 'On-chain collateral that unlocks advanced settlement modes',
    whyItMatters:
      'Staking aligns agent incentives with honest behavior. An agent that locks SOL as collateral has ' +
      'skin in the game: lose a dispute and lose your stake. This unlocks EscrowV2 settlement modes — ' +
      'CoSigned and DisputeWindow — that require a stake account to exist. Staking is the trust primitive ' +
      'that separates permissionless agents from production-grade ones.',
    howItWorks: [
      'initStake creates an AgentStake PDA seeded by ["sap_stake", agentPda]. The agent deposits an initial amount in the same instruction.',
      'Additional deposits grow the stake via deposit(). There is no upper limit — more stake = more credibility in dispute resolution.',
      'requestUnstake begins a cooldown period. The agent cannot withdraw immediately: unstakeAvailableAt is set to now + cooldown. This prevents agents from pulling stake right before a dispute is filed.',
      'completeUnstake transfers the unstake amount back to the agent wallet after the cooldown expires. stakedAmount is reduced by the withdrawn amount.',
      'Disputes can slash the stake. StakeSlashedEvent is emitted when the program transfers slashed lamports to the dispute winner. slashedAmount tracks total historical slashes.',
      'The stake account is not closed after unstaking — it persists to retain the disputes history (totalDisputesWon, totalDisputesLost).',
    ],
    dataSource: 'onchain',
    color: 'text-[hsl(var(--neon-amber))]',
    colorVar: '--neon-amber',
    glowClass: 'shadow-[0_0_20px_-4px_hsl(var(--neon-amber)/0.4)]',
    pdas: [
      {
        name: 'AgentStake',
        seeds: '["sap_stake", agentPda]',
        size: '~120 B',
        rent: '~0.002 SOL',
        tooltip: 'One per agent. Stores: stakedAmount (BN, lamports), slashedAmount (lifetime slashes), unstakeAmount (pending withdrawal), unstakeAvailableAt (cooldown end timestamp), lastStakeAt, totalDisputesWon, totalDisputesLost, createdAt. Never closed — persists as permanent dispute history.',
      },
    ],
    instructions: [
      { name: 'init_stake', description: 'Create AgentStake PDA with initial deposit.', signer: 'agent wallet', tooltip: 'Takes initial_deposit (lamports). Creates AgentStake PDA, transfers SOL from agent wallet to stake PDA. Agent must be registered. Emits StakeDepositedEvent.' },
      { name: 'deposit', description: 'Add more lamports to an existing stake account.', signer: 'agent wallet', tooltip: 'Increments stakedAmount by amount. Updates lastStakeAt. Emits StakeDepositedEvent.' },
      { name: 'request_unstake', description: 'Begin cooldown to withdraw stake.', signer: 'agent wallet', tooltip: 'Sets unstakeAmount and calculates unstakeAvailableAt = now + cooldown_period. Stake is still locked during cooldown. Emits UnstakeRequestedEvent.' },
      { name: 'complete_unstake', description: 'Withdraw after cooldown expires.', signer: 'agent wallet', tooltip: 'Checks Clock.unix_timestamp >= unstakeAvailableAt. Transfers unstakeAmount lamports back to agent wallet. Decrements stakedAmount. Emits UnstakeCompletedEvent.' },
    ],
    validationRules: [
      'Agent must be registered to init_stake (AgentNotFound)',
      'Only the agent wallet can deposit or unstake (unauthorized signer)',
      'complete_unstake: must wait until unstakeAvailableAt (CooldownNotElapsed)',
      'Slash: triggered by dispute resolution — only the program can slash (not user-callable)',
      'stakedAmount cannot go below 0 (overflow protection)',
      'Stake PDA is never closed — preserves dispute win/loss history',
    ],
    events: ['StakeDepositedEvent', 'UnstakeRequestedEvent', 'UnstakeCompletedEvent', 'StakeSlashedEvent'],
    keyInsight: 'The cooldown mechanism prevents stake-and-run attacks. By requiring agents to signal unstake intent before withdrawal, it gives clients time to file any pending disputes before the collateral is gone.',
  },
];

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

/* ── Stepper step ────────────────────────── */
function StepperNode({
  stage,
  count,
  active,
  selected,
  isLast,
  onSelect,
}: {
  stage: FlowStage;
  stepIndex: number;
  count: number;
  active: boolean;
  selected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  const Icon = stage.icon;
  return (
    <div className="flex gap-4">
      {/* Vertical line + circle */}
      <div className="flex flex-col items-center">
        <button
          onClick={onSelect}
          className={cn(
            'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 cursor-pointer',
            selected
              ? 'border-transparent scale-110'
              : active
                ? 'border-border/40 bg-card/60 hover:border-border/60 hover:scale-105'
                : 'border-border/20 bg-card/30 opacity-50',
          )}
          style={selected ? {
            background: `hsl(var(${stage.colorVar}) / 0.15)`,
            borderColor: `hsl(var(${stage.colorVar}) / 0.5)`,
            boxShadow: `0 0 20px -4px hsl(var(${stage.colorVar}) / 0.3)`,
          } : undefined}
        >
          <Icon className={cn('h-4.5 w-4.5', selected ? stage.color : active ? 'text-foreground/60' : 'text-muted-foreground/40')} />
          {/* Step number badge */}
          <span
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
            style={{
              background: selected ? `hsl(var(${stage.colorVar}))` : 'hsl(var(--muted))',
              color: selected ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {stage.step}
          </span>
        </button>
        {/* Connector line */}
        {!isLast && (
          <div
            className="w-px flex-1 min-h-[24px] my-1 transition-colors duration-500"
            style={{
              background: selected
                ? `linear-gradient(to bottom, hsl(var(${stage.colorVar}) / 0.4), hsl(var(${stage.colorVar}) / 0.1))`
                : 'hsl(var(--border) / 0.2)',
            }}
          />
        )}
      </div>

      {/* Content */}
      <button
        onClick={onSelect}
        className={cn(
          'flex-1 text-left pb-6 cursor-pointer group transition-all duration-300',
          !isLast && 'mb-0',
        )}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-xs font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: `hsl(var(${stage.colorVar}) / 0.08)`,
              color: `hsl(var(${stage.colorVar}) / ${selected ? '1' : '0.5'})`,
            }}
          >
            {stage.phase}
          </span>
          <DataSourceBadge source={stage.dataSource} />
        </div>
        <h3 className={cn(
          'text-sm font-bold mt-1 transition-colors',
          selected ? 'text-foreground' : 'text-foreground/60 group-hover:text-foreground/80',
        )}>
          {stage.label}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {stage.tagline}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={cn('text-base font-bold font-mono tabular-nums', active ? stage.color : 'text-muted-foreground')}>
            {fmtNum(count)}
          </span>
          <span className="text-xs text-muted-foreground">
            {stage.pdas.length} PDAs · {stage.instructions.length} ix
          </span>
        </div>
      </button>
    </div>
  );
}

/* ── Horizontal compact stepper (desktop top bar) ──── */
function HorizontalStepper({
  stages,
  counts,
  selected,
  onSelect,
}: {
  stages: FlowStage[];
  counts: Record<string, number>;
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-0">
      {stages.map((stage, i) => {
        const Icon = stage.icon;
        const count = counts[stage.id] ?? 0;
        const isSelected = selected === i;
        const isActive = count > 0;
        return (
          <div key={stage.id} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => onSelect(i)}
              className={cn(
                'flex-1 min-w-0 flex items-center gap-2 p-2.5 rounded-lg transition-all duration-300 cursor-pointer',
                isSelected
                  ? 'bg-card/70 border border-border/40'
                  : 'hover:bg-card/40 border border-transparent',
                !isActive && 'opacity-50',
              )}
              style={isSelected ? { boxShadow: `0 0 16px -6px hsl(var(${stage.colorVar}) / 0.3)` } : undefined}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all',
                )}
                style={{
                  background: isSelected ? `hsl(var(${stage.colorVar}) / 0.15)` : 'hsl(var(--muted) / 0.3)',
                  color: isSelected ? `hsl(var(${stage.colorVar}))` : 'hsl(var(--muted-foreground))',
                  border: isSelected ? `1.5px solid hsl(var(${stage.colorVar}) / 0.3)` : '1.5px solid transparent',
                }}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className={cn('text-xs font-semibold truncate', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                  {stage.label}
                </p>
                <p className={cn('text-xs font-mono tabular-nums', isActive ? stage.color : 'text-muted-foreground')}>
                  {fmtNum(count)}
                </p>
              </div>
            </button>
            {/* Connector */}
            {i < stages.length - 1 && (
              <div className="flex items-center px-0.5 shrink-0">
                <ArrowDown className="h-2.5 w-2.5 rotate-[-90deg] text-border/40" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── PDA card with tooltip ───────────────── */
function PdaCard({ pda, colorVar }: { pda: PdaInfo; colorVar: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-card/40 border border-border/30 hover:border-border/40 transition-colors">
      <Layers className="h-4 w-4 mt-0.5 shrink-0" style={{ color: `hsl(var(${colorVar}))` }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold font-mono">{pda.name}</p>
          <InfoTip content={pda.tooltip} />
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-0.5 break-all">{pda.seeds}</p>
        <div className="flex gap-3 mt-1">
          <Tip content="On-chain account size in bytes. Determines rent cost.">
            <span className="text-xs text-muted-foreground">{pda.size}</span>
          </Tip>
          <Tip content="Rent cost in SOL. Fully recoverable when the PDA is closed (except LedgerPage which is permanent).">
            <span className="text-xs" style={{ color: `hsl(var(${colorVar}) / 0.8)` }}>{pda.rent}</span>
          </Tip>
        </div>
      </div>
    </div>
  );
}

/* ── Instruction row with tooltip ────────── */
function InstructionRow({ ix, colorVar }: { ix: InstructionInfo; colorVar: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0 group">
      <SquareCode className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: `hsl(var(${colorVar}) / 0.7)` }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Tip content={ix.tooltip}>
            <code className="text-xs font-mono font-semibold">{ix.name}</code>
          </Tip>
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
            <KeyRound className="h-2.5 w-2.5 mr-0.5" />
            {ix.signer}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ix.description}</p>
      </div>
    </div>
  );
}

/* ── Key insight callout ─────────────────── */
function KeyInsight({ text, colorVar }: { text: string; colorVar: string }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg border"
      style={{
        background: `hsl(var(${colorVar}) / 0.04)`,
        borderColor: `hsl(var(${colorVar}) / 0.15)`,
      }}
    >
      <Zap className="h-4 w-4 mt-0.5 shrink-0" style={{ color: `hsl(var(${colorVar}))` }} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: `hsl(var(${colorVar}))` }}>
          Key Insight
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

/* ── Stage detail panel (tabbed) ─────────── */
function StageDetail({ stage }: { stage: FlowStage }) {
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `hsl(var(${stage.colorVar}) / 0.1)`,
            border: `2px solid hsl(var(${stage.colorVar}) / 0.3)`,
            boxShadow: `0 0 24px -8px hsl(var(${stage.colorVar}) / 0.2)`,
          }}
        >
          <stage.icon className={cn('h-6 w-6', stage.color)} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-lg font-bold">{stage.label}</h3>
            <span
              className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                background: `hsl(var(${stage.colorVar}) / 0.1)`,
                color: `hsl(var(${stage.colorVar}))`,
                border: `1px solid hsl(var(${stage.colorVar}) / 0.2)`,
              }}
            >
              Step {stage.step} · {stage.phase}
            </span>
          </div>
          <p className="text-xs text-muted-foreground italic">{stage.tagline}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="gap-1">
            <Eye className="h-3 w-3" /> Overview
          </TabsTrigger>
          <TabsTrigger value="pdas" className="gap-1">
            <Layers className="h-3 w-3" /> PDAs ({stage.pdas.length})
          </TabsTrigger>
          <TabsTrigger value="instructions" className="gap-1">
            <FileCode2 className="h-3 w-3" /> Instructions ({stage.instructions.length})
          </TabsTrigger>
          <TabsTrigger value="validation" className="gap-1">
            <Shield className="h-3 w-3" /> Validation ({stage.validationRules.length})
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1">
            <Zap className="h-3 w-3" /> Events ({stage.events.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          <div className="space-y-4">
            {/* Why it matters */}
            <div>
              <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: `hsl(var(${stage.colorVar}))` }} />
                Why It Matters
              </h4>
              <p className="text-xs text-muted-foreground/90 leading-relaxed">
                {stage.whyItMatters}
              </p>
            </div>

            {/* How it works */}
            <div>
              <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <CircleDot className="h-3.5 w-3.5" style={{ color: `hsl(var(${stage.colorVar}))` }} />
                How It Works
              </h4>
              <ol className="space-y-2">
                {stage.howItWorks.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs text-muted-foreground/90">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5"
                      style={{
                        background: `hsl(var(${stage.colorVar}) / 0.1)`,
                        color: `hsl(var(${stage.colorVar}))`,
                        border: `1px solid hsl(var(${stage.colorVar}) / 0.2)`,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="leading-relaxed flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Key insight */}
            <KeyInsight text={stage.keyInsight} colorVar={stage.colorVar} />
          </div>
        </TabsContent>

        {/* PDAs tab */}
        <TabsContent value="pdas">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-3">
              <Tip content="Program Derived Addresses: deterministic accounts derived from seed values. Anyone can compute the address, but only the program can write to them.">
                <span className="font-semibold">PDA Accounts</span>
              </Tip>
              {' '}are on-chain accounts with deterministic addresses derived from seed values.
              Each stores typed state that the SAP program reads and writes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {stage.pdas.map(pda => (
                <PdaCard key={pda.name} pda={pda} colorVar={stage.colorVar} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Instructions tab */}
        <TabsContent value="instructions">
          <div className="space-y-0">
            <p className="text-xs text-muted-foreground mb-3">
              Each instruction requires a specific{' '}
              <Tip content="The signer is the wallet that must sign the transaction. This enforces access control: only the owner can modify their agent, only the depositor can withdraw from their escrow, etc.">
                <span className="font-semibold">signer</span>
              </Tip>
              {' '}for access control. Hover over instruction names for detailed parameter info.
            </p>
            {stage.instructions.map(ix => (
              <InstructionRow key={ix.name} ix={ix} colorVar={stage.colorVar} />
            ))}
          </div>
        </TabsContent>

        {/* Validation tab */}
        <TabsContent value="validation">
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              All validation happens at the{' '}
              <Tip content="BPF (Berkeley Packet Filter) is the bytecode format Solana programs compile to. Validation at this level means invalid data is rejected before any state mutation. There is no way to bypass these checks.">
                <span className="font-semibold">BPF level</span>
              </Tip>
              {' '}: invalid payloads are rejected before any state mutation.
            </p>
            <ul className="space-y-2">
              {stage.validationRules.map((rule, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2.5">
                  <Shield className="h-3 w-3 mt-0.5 shrink-0" style={{ color: `hsl(var(${stage.colorVar}) / 0.5)` }} />
                  <span className="leading-relaxed">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        {/* Events tab */}
        <TabsContent value="events">
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              Events are emitted into{' '}
              <Tip content="Solana transaction logs are permanent, immutable records. Events emitted here can be indexed by Geyser gRPC plugins for real-time streaming, or queried historically via getTransaction.">
                <span className="font-semibold">TX logs</span>
              </Tip>
              {' '}on every state change. They are indexed by the Geyser gRPC plugin for real-time streaming.
            </p>
            <div className="flex flex-wrap gap-2">
              {stage.events.map(ev => (
                <code
                  key={ev}
                  className="text-xs font-mono px-2.5 py-1.5 rounded-md border"
                  style={{
                    background: `hsl(var(${stage.colorVar}) / 0.05)`,
                    borderColor: `hsl(var(${stage.colorVar}) / 0.15)`,
                    color: `hsl(var(${stage.colorVar}))`,
                  }}
                >
                  {ev}
                </code>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Architecture overview ───────────────── */
function ArchitectureOverview() {
  const [expanded, setExpanded] = useState<number | null>(null);

  const layers = [
    {
      title: 'Client Layer',
      icon: Globe,
      color: '--neon-orange',
      description: 'Client applications interact with SAP through the TypeScript SDK or direct Anchor calls. The SDK handles PDA derivation, transaction building, and account deserialization.',
      items: [
        { text: 'Wallet signs all TXs', detail: 'Every SAP instruction requires at least one signer. The wallet proves ownership of agents, escrows, and vaults.' },
        { text: 'SDK derives PDA addresses', detail: 'PDA addresses are computed deterministically from seeds. No on-chain lookups needed. The SDK does this client-side.' },
        { text: 'getAccountInfo for reads', detail: 'Reading PDA state is free (no transaction needed). Any RPC can serve account data.' },
      ],
    },
    {
      title: 'Program Layer (BPF)',
      icon: SquareCode,
      color: '--glow',
      description: 'The SAP program runs as compiled BPF bytecode on Solana validators. It processes instructions, validates inputs, mutates state, and emits events.',
      items: [
        { text: '72 instructions, 13 domains', detail: 'Covers agent lifecycle, memory vaults, escrow settlements, and more in one upgradeable program.' },
        { text: 'Deep validation engine', detail: 'Every input field is validated at the BPF level before any state mutation. This includes string lengths, format checks, uniqueness, and cross-field constraints.' },
        { text: 'Checks-effects-interactions', detail: 'The program follows the CEI pattern: validate all inputs first, then mutate state, then emit events. This prevents reentrancy and partial-mutation bugs.' },
      ],
    },
    {
      title: 'State Layer (PDAs)',
      icon: Layers,
      color: '--neon-emerald',
      description: 'All on-chain state lives in PDA accounts. Seeds are deterministic, meaning anyone can derive the address of any account without on-chain lookups.',
      items: [
        { text: '22 account types', detail: 'Ranges from the singleton GlobalRegistry to per-agent AgentAccount to per-task SessionLedger. Each account type has fixed seeds and known size.' },
        { text: 'Ring buffers + TX logs', detail: 'Hot data lives in ring buffer PDAs (MemoryLedger), cold data in TX logs. This two-tier model balances read performance with storage cost.' },
        { text: 'All closeable except LedgerPage', detail: 'Every PDA can be closed to reclaim rent, except LedgerPage which is permanent, write-once archival storage.' },
      ],
    },
    {
      title: 'Indexing Layer',
      icon: Eye,
      color: '--neon-amber',
      description: 'The indexing layer makes on-chain data queryable. Geyser gRPC streams real-time account updates and transaction events to off-chain databases.',
      items: [
        { text: 'gRPC Geyser streaming', detail: 'Real-time account and transaction updates via Geyser plugin. Events flow to a PostgreSQL database for the Explorer UI.' },
        { text: 'On-chain index PDAs', detail: 'CapabilityIndex, ProtocolIndex, and ToolCategoryIndex PDAs allow on-chain discovery without off-chain infrastructure.' },
        { text: 'Hot/cold read paths', detail: 'Hot: getAccountInfo (ring buffers, latest state). Cold: getSignaturesForAddress + getTransaction (full TX log history).' },
      ],
    },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-lg border-border/30">
      <CardContent className="p-6">
        <h3 className="text-base font-semibold gradient-text mb-5 flex items-center gap-2">
          <Network className="h-4 w-4" />
          Architecture Stack
          <InfoTip content="SAP follows a four-layer architecture: Client (SDK) → Program (BPF bytecode) → State (PDA accounts) → Indexing (Geyser + on-chain indexes). Each layer is independently auditable." />
        </h3>
        <div className="space-y-2">
          {layers.map((layer, idx) => {
            const Icon = layer.icon;
            const isOpen = expanded === idx;
            return (
              <div key={layer.title}>
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : idx)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 cursor-pointer text-left',
                    isOpen
                      ? 'border-border/40'
                      : 'border-border/20 hover:border-border/40',
                  )}
                  style={{ background: `hsl(var(${layer.color}) / ${isOpen ? '0.06' : '0.03'})` }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                    style={{
                      background: `hsl(var(${layer.color}) / 0.1)`,
                      border: `1.5px solid hsl(var(${layer.color}) / 0.25)`,
                    }}
                  >
                    <Icon className="h-5 w-5" style={{ color: `hsl(var(${layer.color}))` }} />
                  </div>
                  <div className="w-44 shrink-0">
                    <p className="text-sm font-semibold">{layer.title}</p>
                  </div>
                  <div className="flex-1 flex items-center gap-4">
                    {layer.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span style={{ color: `hsl(var(${layer.color}) / 0.5)` }}>›</span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  <ChevronDown
                    className={cn('h-5 w-5 shrink-0 text-primary transition-transform duration-300', isOpen && 'rotate-180')}
                  />
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div
                    className="mt-1 rounded-xl border border-border/20 p-4 animate-fade-in"
                    style={{ background: `hsl(var(${layer.color}) / 0.02)` }}
                  >
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">{layer.description}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {layer.items.map((item, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg border border-border/20"
                          style={{ background: `hsl(var(${layer.color}) / 0.04)` }}
                        >
                          <p className="text-sm font-semibold mb-1" style={{ color: `hsl(var(${layer.color}))` }}>{item.text}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connector */}
                {idx < layers.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="h-3 w-3 text-border/30" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── PDA relationship map ────────────────── */
function PdaRelationshipMap() {
  const relationships = [
    { from: 'Wallet', to: 'AgentAccount', label: 'owns', color: '--glow', tip: 'The wallet address is used as a seed to derive the AgentAccount PDA. Only this wallet can mutate the agent.' },
    { from: 'AgentAccount', to: 'ToolDescriptor', label: 'publishes', color: '--neon-orange', tip: 'Tools are seeded by [agent, name_hash]. An agent can publish unlimited tools.' },
    { from: 'AgentAccount', to: 'MemoryVault', label: 'controls', color: '--neon-amber', tip: 'One vault per agent, seeded by ["sap_vault", agent]. The vault is the root of the memory hierarchy.' },
    { from: 'MemoryVault', to: 'SessionLedger', label: 'opens sessions', color: '--neon-amber', tip: 'Sessions are opened per-task. Each gets a SessionLedger PDA tracking sequence numbers and merkle roots.' },
    { from: 'SessionLedger', to: 'MemoryLedger', label: 'writes to', color: '--neon-amber', tip: 'The MemoryLedger is a 4 KB ring buffer for hot-path reads. Seeded by the session.' },
    { from: 'MemoryLedger', to: 'LedgerPage', label: 'archives (permanent)', color: '--neon-rose', tip: 'When the ring buffer is full, sealed data moves to permanent LedgerPage PDAs. These have NO close instruction.' },
    { from: 'Depositor', to: 'EscrowAccount', label: 'funds', color: '--neon-emerald', tip: 'The client deposits funds into an escrow seeded by [agent, depositor]. Funds are locked until settled or withdrawn.' },
    { from: 'AgentAccount', to: 'EscrowAccount', label: 'settles from', color: '--neon-emerald', tip: 'The agent wallet can call settle_calls to claim payment. Funds move from escrow PDA to agent wallet.' },
    { from: 'Reviewer', to: 'FeedbackAccount', label: 'reviews', color: '--neon-rose', tip: 'One feedback per (agent, reviewer) pair. Score 0-1000 updates the agent reputation incrementally.' },
    { from: 'FeedbackAccount', to: 'AgentAccount', label: 'updates reputation', color: '--neon-rose', tip: 'Each feedback give/update/revoke atomically adjusts reputation_sum and total_feedbacks on the AgentAccount.' },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-lg border-border/30">
      <CardContent className="p-6">
        <h3 className="text-base font-semibold gradient-text mb-5 flex items-center gap-2">
          <Hash className="h-4 w-4" />
          PDA Authority Chain
          <InfoTip content="This diagram shows how PDA accounts relate to each other through seed derivation and authority. Arrows indicate which entity creates or controls which account." />
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {relationships.map((rel, i) => {
            const row = (
              <div
                className="group flex items-center gap-3 px-4 py-3 rounded-lg border border-border/20 transition-all duration-300 hover:border-border/40 cursor-help"
                style={{ background: `hsl(var(${rel.color}) / 0.03)` }}
              >
                <code className="font-mono text-xs font-semibold whitespace-nowrap" style={{ color: `hsl(var(${rel.color}))` }}>
                  {rel.from}
                </code>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="h-px flex-1" style={{ background: `hsl(var(${rel.color}) / 0.2)` }} />
                  <span className="text-sm text-muted-foreground/70 italic whitespace-nowrap">{rel.label}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" style={{ color: `hsl(var(${rel.color}) / 0.5)` }} />
                  <div className="h-px flex-1" style={{ background: `hsl(var(${rel.color}) / 0.2)` }} />
                </div>
                <code className="font-mono text-xs font-semibold whitespace-nowrap">
                  {rel.to}
                </code>
              </div>
            );
            return (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild className="w-full">{row}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                    {rel.tip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Data sources panel ──────────────────── */
function DataSourcesPanel() {
  const sources = [
    {
      icon: Database,
      label: 'On-Chain',
      colorVar: '--neon-emerald',
      description: 'PDA accounts, escrow balances, reputation scores, and attestations. Verified by Solana validators.',
      readPath: 'getAccountInfo (free, real-time)',
      examples: 'AgentAccount, EscrowAccount, FeedbackAccount, GlobalRegistry',
    },
    {
      icon: Shield,
      label: 'Off-Chain',
      colorVar: '--glow',
      description: 'Performance metrics, latency, and uptime. Self-reported via update_reputation.',
      readPath: 'Geyser gRPC → PostgreSQL → Explorer API',
      examples: 'avg_latency_ms, uptime_percent, tool invocation counters',
    },
    {
      icon: Activity,
      label: 'Hybrid',
      colorVar: '--neon-orange',
      description: 'On-chain hashes verify integrity; off-chain content provides the full data.',
      readPath: 'PDA for hash verification + TX logs for full content',
      examples: 'Tool schemas (hash on-chain, JSON in TX log), events (emitted on-chain, indexed via gRPC)',
    },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-lg border-border/30">
      <CardContent className="p-6">
        <h3 className="text-base font-semibold gradient-text mb-5 flex items-center gap-2">
          <Database className="h-4 w-4" />
          Data Source Architecture
          <InfoTip content="SAP uses three data source types: On-Chain (verifiable by validators), Off-Chain (self-reported metrics indexed by Geyser), and Hybrid (on-chain hash + off-chain content for cost efficiency)." />
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {sources.map(s => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="group flex flex-col gap-3 p-5 rounded-xl border border-border/20 transition-all duration-300 hover:border-border/40"
                style={{ background: `hsl(var(${s.colorVar}) / 0.04)` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 transition-shadow duration-300 group-hover:shadow-lg"
                    style={{
                      background: `hsl(var(${s.colorVar}) / 0.12)`,
                      border: `1.5px solid hsl(var(${s.colorVar}) / 0.25)`,
                    }}
                  >
                    <Icon className="h-4.5 w-4.5" style={{ color: `hsl(var(${s.colorVar}))` }} />
                  </div>
                  <p className="text-sm font-bold" style={{ color: `hsl(var(${s.colorVar}))` }}>{s.label}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                <div className="mt-auto pt-3 border-t border-border/15 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <code className="text-sm font-mono font-semibold px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/50 shrink-0">READ</code>
                    <span className="text-xs text-muted-foreground">{s.readPath}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="text-sm font-mono font-semibold px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/50 shrink-0">DATA</code>
                    <span className="text-xs text-muted-foreground">{s.examples}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════ */

export default function ProtocolFlowPage() {
  const { data: overview, loading: ovLoading } = useOverview();
  const { data: disputeData } = useDisputes();
  const { data: receiptData } = useReceiptBatches();
  const [selectedStage, setSelectedStage] = useState(0);

  const metrics = overview?.metrics ?? null;
  const escrowData = overview?.escrows ?? null;
  const toolsData = overview?.tools ?? null;

  const stageCounts = useMemo(() => {
    const agents = Number(metrics?.totalAgents ?? 0);
    const tools = Number(toolsData?.total ?? 0);
    const escrows = Number(escrowData?.total ?? 0);
    const receipts = Number(receiptData?.total ?? 0);
    const settlements = Number(escrowData?.escrows?.reduce(
      (s: number, e: { totalCallsSettled?: string | number }) => s + Number(e.totalCallsSettled ?? 0), 0,
    ) ?? 0);
    const disputes = Number(disputeData?.total ?? 0);

    return {
      register: agents, tools, escrow: escrows, receipts,
      settlement: settlements, reputation: disputes,
    };
  }, [metrics, toolsData, escrowData, receiptData, disputeData]);

  const totalFlow = Object.values(stageCounts).reduce((s, v) => s + v, 0);
  const totalInstructions = FLOW_STAGES.reduce((s, st) => s + st.instructions.length, 0);

  return (
    <ExplorerPageShell
      title="Protocol Flow"
      subtitle="Complete SAP lifecycle: 72 instructions, 22 PDA types, 13 domains"
      icon={<Activity className="h-5 w-5" />}
      badge={
        <Tip content="Total count of all on-chain entities across all lifecycle stages.">
          <Badge variant="secondary" className="tabular-nums">{totalFlow} entities</Badge>
        </Tip>
      }
      stats={
        <>
          <ExplorerMetric icon={<Bot className="h-3.5 w-3.5" />} label="Agents" value={stageCounts.register} accent="primary" />
          <ExplorerMetric icon={<Wrench className="h-3.5 w-3.5" />} label="Tools" value={stageCounts.tools} accent="cyan" />
          <ExplorerMetric icon={<Lock className="h-3.5 w-3.5" />} label="Escrows" value={stageCounts.escrow} accent="emerald" />
          <ExplorerMetric icon={<FileCode2 className="h-3.5 w-3.5" />} label="Instructions" value={totalInstructions} accent="amber" />
        </>
      }
    >
      {/* Loading skeleton */}
      {ovLoading && !overview && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 flex-1 rounded-xl bg-muted/10 animate-pulse" />
            ))}
          </div>
          <div className="h-96 rounded-xl bg-muted/10 animate-pulse" />
        </div>
      )}

      {overview && (
        <div className="space-y-6">
          {/* ─── Desktop: horizontal compact stepper + detail side-by-side ─── */}
          <div className="hidden lg:block space-y-4">
            {/* Top bar stepper */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                <Fingerprint className="h-3.5 w-3.5" />
                Select a stage to explore its instructions, PDAs, validation rules, and events
              </p>
              <HorizontalStepper
                stages={FLOW_STAGES}
                counts={stageCounts}
                selected={selectedStage}
                onSelect={setSelectedStage}
              />
            </div>

            {/* Detail panel */}
            <Card className="bg-card/50 backdrop-blur-lg border-border/30">
              <CardContent className="p-6">
                <StageDetail stage={FLOW_STAGES[selectedStage]} />
              </CardContent>
            </Card>
          </div>

          {/* ─── Mobile: vertical stepper + expandable detail ─── */}
          <div className="lg:hidden space-y-4">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Fingerprint className="h-3.5 w-3.5" />
              Tap a stage to explore its details
            </p>

            {/* Vertical stepper */}
            <div>
              {FLOW_STAGES.map((stage, i) => (
                <div key={stage.id}>
                  <StepperNode
                    stage={stage}
                    stepIndex={i}
                    count={stageCounts[stage.id as keyof typeof stageCounts]}
                    active={stageCounts[stage.id as keyof typeof stageCounts] > 0}
                    selected={selectedStage === i}
                    isLast={i === FLOW_STAGES.length - 1}
                    onSelect={() => setSelectedStage(i)}
                  />
                  {/* Inline detail when selected */}
                  {selectedStage === i && (
                    <div className="ml-14 mb-6">
                      <Card className="bg-card/50 backdrop-blur-lg border-border/30">
                        <CardContent className="p-4">
                          <StageDetail stage={stage} />
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─── Separator ─── */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border/20" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground/50 uppercase tracking-widest">Reference</span>
            </div>
          </div>

          {/* ─── Architecture + PDA map ─── */}
          <ArchitectureOverview />
          <PdaRelationshipMap />

          {/* ─── Data sources ─── */}
          <DataSourcesPanel />
        </div>
      )}
    </ExplorerPageShell>
  );
}
