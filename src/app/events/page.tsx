'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Radio, Pause, Play,
  Zap, Wallet, ArrowLeftRight, Bot, Shield,
  BookOpen, Star, Wrench, Layers, Clock,
  ChevronDown, Hash, Activity,
} from 'lucide-react';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ExplorerPageShell, ExplorerLiveDot, ExplorerFilterBar, ExplorerPagination, usePagination } from '~/components/ui';
import { useAllEvents, type StreamEvent } from '~/hooks/use-sap';
import { useAgentMapCtx } from '~/providers/sap-data-provider';
import { AgentTag } from '~/components/ui/agent-tag';
import { cn } from '~/lib/utils';

/* ═══════════════════════════════════════════════
 * EVENT TYPE CONFIG — maps SDK Layer 4 event types
 * ═══════════════════════════════════════════════ */

type EventMeta = {
  label: string;
  icon: typeof Zap;
  color: string;      // tailwind text color
  bgColor: string;    // badge bg
  category: 'agent' | 'escrow' | 'vault' | 'tool' | 'indexing' | 'attestation' | 'feedback' | 'ledger' | 'tx';
};

/*
 * Complete SAP event map — 45 events (38 active + 7 legacy)
 * Names match Anchor #[event] discriminators from EXPLORER_REFERENCE.
 * We also map shortened aliases (e.g. "AgentRegistered") for DB compat.
 */
const agent = (label: string): EventMeta => ({ label, icon: Bot, color: 'text-blue-400', bgColor: 'bg-blue-500/10', category: 'agent' });
const escrow = (label: string): EventMeta => ({ label, icon: Wallet, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', category: 'escrow' });
const vault = (label: string): EventMeta => ({ label, icon: Shield, color: 'text-primary', bgColor: 'bg-primary/10', category: 'vault' });
const tool = (label: string): EventMeta => ({ label, icon: Wrench, color: 'text-primary', bgColor: 'bg-primary/10', category: 'tool' });
const attest = (label: string): EventMeta => ({ label, icon: Star, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', category: 'attestation' });
const fb = (label: string): EventMeta => ({ label, icon: Star, color: 'text-pink-400', bgColor: 'bg-pink-500/10', category: 'feedback' });
const rep = (label: string): EventMeta => ({ label, icon: Activity, color: 'text-blue-300', bgColor: 'bg-blue-400/10', category: 'agent' });
const ledger = (label: string): EventMeta => ({ label, icon: Layers, color: 'text-primary', bgColor: 'bg-primary/10', category: 'ledger' });
const idx = (label: string): EventMeta => ({ label, icon: Layers, color: 'text-teal-400', bgColor: 'bg-teal-500/10', category: 'indexing' });
const mem = (label: string): EventMeta => ({ label, icon: BookOpen, color: 'text-primary', bgColor: 'bg-primary/10', category: 'vault' });
const legacy = (label: string, cat: EventMeta['category'] = 'vault'): EventMeta => ({ label, icon: Layers, color: 'text-gray-400', bgColor: 'bg-gray-500/10', category: cat });

const SAP_EVENTS: Record<string, EventMeta> = {
  /* ── 7.1 Agent Lifecycle (5) ── */
  RegisteredEvent:      agent('Agent Registered'),
  UpdatedEvent:         agent('Agent Updated'),
  DeactivatedEvent:     agent('Agent Deactivated'),
  ReactivatedEvent:     agent('Agent Reactivated'),
  ClosedEvent:          agent('Agent Closed'),
  /* aliases */
  AgentRegistered:      agent('Agent Registered'),
  AgentUpdated:         agent('Agent Updated'),
  AgentDeactivated:     agent('Agent Deactivated'),
  AgentReactivated:     agent('Agent Reactivated'),
  AgentClosed:          agent('Agent Closed'),

  /* ── 7.2 Feedback (3) ── */
  FeedbackEvent:        fb('Feedback Given'),
  FeedbackUpdatedEvent: fb('Feedback Updated'),
  FeedbackRevokedEvent: fb('Feedback Revoked'),
  FeedbackGiven:        fb('Feedback Given'),
  FeedbackUpdated:      fb('Feedback Updated'),
  FeedbackRevoked:      fb('Feedback Revoked'),

  /* ── 7.3 Reputation (2) ── */
  ReputationUpdatedEvent: rep('Reputation Updated'),
  CallsReportedEvent:     rep('Calls Reported'),

  /* ── 7.4 Vault Events (6) ── */
  VaultInitializedEvent:  vault('Vault Initialized'),
  SessionOpenedEvent:     vault('Session Opened'),
  MemoryInscribedEvent:   mem('Memory Inscribed'),
  EpochOpenedEvent:       vault('Epoch Opened'),
  SessionClosedEvent:     vault('Session Closed'),
  VaultClosedEvent:       vault('Vault Closed'),
  VaultInitialized:       vault('Vault Initialized'),
  SessionCreated:         vault('Session Opened'),

  /* ── 7.5 Vault Lifecycle (5) ── */
  SessionPdaClosedEvent:  vault('Session PDA Closed'),
  EpochPageClosedEvent:   vault('Epoch Page Closed'),
  VaultNonceRotatedEvent: vault('Nonce Rotated'),
  DelegateAddedEvent:     vault('Delegate Added'),
  DelegateRevokedEvent:   vault('Delegate Revoked'),
  DelegateGranted:        vault('Delegate Added'),
  DelegateRevoked:        vault('Delegate Revoked'),

  /* ── 7.6 Tool Registry (7) ── */
  ToolPublishedEvent:           tool('Tool Published'),
  ToolSchemaInscribedEvent:     tool('Schema Inscribed'),
  ToolUpdatedEvent:             tool('Tool Updated'),
  ToolDeactivatedEvent:         tool('Tool Deactivated'),
  ToolReactivatedEvent:         tool('Tool Reactivated'),
  ToolClosedEvent:              tool('Tool Closed'),
  ToolInvocationReportedEvent:  tool('Invocations Reported'),
  ToolPublished:                tool('Tool Published'),
  ToolInscribed:                tool('Schema Inscribed'),
  ToolUpdated:                  tool('Tool Updated'),
  ToolClosed:                   tool('Tool Closed'),

  /* ── 7.7 Checkpoint (1) ── */
  CheckpointCreatedEvent: vault('Checkpoint Created'),
  CheckpointCreated:      vault('Checkpoint Created'),

  /* ── 7.8 Escrow (5) ── */
  EscrowCreatedEvent:   escrow('Escrow Created'),
  EscrowDepositedEvent: escrow('Escrow Deposit'),
  PaymentSettledEvent:  escrow('Payment Settled'),
  EscrowWithdrawnEvent: escrow('Escrow Withdrawn'),
  BatchSettledEvent:    escrow('Batch Settled'),
  EscrowCreated:        escrow('Escrow Created'),
  EscrowDeposited:      escrow('Escrow Deposit'),
  PaymentSettled:       escrow('Payment Settled'),
  PaymentBatchSettled:  escrow('Batch Settled'),
  EscrowWithdrawn:      escrow('Escrow Withdrawn'),

  /* ── 7.9 Attestation (2) ── */
  AttestationCreatedEvent: attest('Attestation Created'),
  AttestationRevokedEvent: attest('Attestation Revoked'),
  AttestationCreated:      attest('Attestation Created'),
  AttestationRevoked:      attest('Attestation Revoked'),

  /* ── 7.10 Ledger (2) ── */
  LedgerEntryEvent:   ledger('Ledger Entry'),
  LedgerSealedEvent:  ledger('Ledger Sealed'),
  LedgerWritten:      ledger('Ledger Entry'),
  LedgerSealed:       ledger('Ledger Sealed'),

  /* ── 7.11 Legacy Events (7) ── */
  PluginRegisteredEvent:   legacy('Plugin Registered', 'agent'),
  MemoryStoredEvent:       legacy('Memory Stored'),
  BufferCreatedEvent:      legacy('Buffer Created'),
  BufferAppendedEvent:     legacy('Buffer Appended'),
  DigestPostedEvent:       legacy('Digest Posted'),
  DigestInscribedEvent:    legacy('Digest Inscribed'),
  StorageRefUpdatedEvent:  legacy('Storage Ref Updated'),

  /* ── Indexing (no Anchor events, but may be logged) ── */
  CapabilityRegistered:    idx('Capability Registered'),
  ProtocolRegistered:      idx('Protocol Registered'),
  ToolCategoryRegistered:  idx('Category Registered'),
};

/* Escrow event subtypes from escrow_events table */
const ESCROW_EVENTS: Record<string, EventMeta> = {
  create_escrow:   escrow('Escrow Created'),
  deposit_escrow:  escrow('Escrow Deposit'),
  settle_calls:    escrow('Payment Settled'),
  withdraw_escrow: escrow('Escrow Withdrawn'),
  close_escrow:    escrow('Escrow Closed'),
  /* short aliases */
  create:   escrow('Escrow Created'),
  deposit:  escrow('Escrow Deposit'),
  settle:   escrow('Payment Settled'),
  withdraw: escrow('Escrow Withdrawn'),
  close:    escrow('Escrow Closed'),
};

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Activity },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'escrow', label: 'Escrow', icon: Wallet },
  { id: 'vault', label: 'Vault', icon: Shield },
  { id: 'tool', label: 'Tool', icon: Wrench },
  { id: 'ledger', label: 'Ledger', icon: Layers },
  { id: 'attestation', label: 'Attestation', icon: Star },
  { id: 'feedback', label: 'Feedback', icon: Star },
  { id: 'indexing', label: 'Indexing', icon: Layers },
  { id: 'tx', label: 'Transaction', icon: ArrowLeftRight },
] as const;

import { short, timeAgo } from '~/lib/format';

function resolveEventMeta(event: StreamEvent): EventMeta & { eventName: string } {
  const p = event.payload;

  if (event.type === 'sap_event') {
    const name = (p.event_name as string) ?? (p.eventName as string) ?? 'Unknown';
    const meta = SAP_EVENTS[name];
    if (meta) return { ...meta, eventName: name };
    return {
      label: name, icon: Zap, color: 'text-muted-foreground',
      bgColor: 'bg-muted/10', category: 'agent', eventName: name,
    };
  }

  if (event.type === 'escrow_event') {
    const subType = (p.event_type as string) ?? 'create';
    const meta = ESCROW_EVENTS[subType] ?? ESCROW_EVENTS.create;
    return { ...meta, eventName: `escrow.${subType}` };
  }

  if (event.type === 'transaction') {
    return {
      label: 'New Transaction', icon: ArrowLeftRight, color: 'text-primary',
      bgColor: 'bg-primary/10', category: 'tx', eventName: 'transaction',
    };
  }

  return {
    label: event.type, icon: Zap, color: 'text-muted-foreground',
    bgColor: 'bg-muted/10', category: 'agent', eventName: event.type,
  };
}

function extractAddresses(event: StreamEvent): { key: string; value: string; link?: string }[] {
  const p = event.payload;
  const result: { key: string; value: string; link?: string }[] = [];

  // Common address fields — comprehensive for all 45 event types
  const fields: [string, string, string?][] = [
    ['agent', 'Agent', '/agents/'],
    ['agent_pda', 'Agent', '/agents/'],
    ['wallet', 'Wallet', '/address/'],
    ['escrow', 'Escrow', '/escrows/'],
    ['escrow_pda', 'Escrow', '/escrows/'],
    ['depositor', 'Depositor', '/address/'],
    ['signer', 'Signer', '/address/'],
    ['reviewer', 'Reviewer', '/address/'],
    ['attester', 'Attester', '/address/'],
    ['delegate', 'Delegate', '/address/'],
    ['vault', 'Vault', '/vaults/'],
    ['tool', 'Tool', '/tools/'],
    ['session', 'Session'],
    ['ledger', 'Ledger'],
    ['checkpoint', 'Checkpoint'],
    ['page', 'Page'],
    ['epoch_page', 'Epoch'],
    ['signature', 'TX', '/tx/'],
    ['tx_signature', 'TX', '/tx/'],
  ];

  for (const [field, label, basePath] of fields) {
    const val = (p[field] as string | undefined) ?? ((p.data as Record<string, unknown> | undefined)?.[field] as string | undefined);
    if (val && typeof val === 'string' && val.length >= 32) {
      result.push({ key: label, value: val, link: basePath ? `${basePath}${val}` : undefined });
    }
  }

  return result;
}

function extractAmount(event: StreamEvent): { amount: string; symbol: string } | null {
  const p = event.payload;
  const data = p.data as Record<string, unknown> | undefined;

  const amt = p.amount_changed ?? p.amount ?? p.initial_deposit ?? p.total_amount
    ?? data?.amount ?? data?.amount_changed ?? data?.initial_deposit ?? data?.total_amount;
  if (amt !== undefined && amt !== null) {
    const num = Number(amt);
    if (num === 0) return null;
    // USDC (6 decimals) vs SOL (9 decimals) heuristic
    const tokenMint = p.token_mint ?? data?.token_mint;
    const isUsdc = tokenMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    if (isUsdc) return { amount: (num / 1e6).toFixed(2), symbol: 'USDC' };
    // If no known mint, assume lamports (SOL) for large values, raw for small
    if (num > 1e9) return { amount: (num / 1e9).toFixed(4), symbol: 'SOL' };
    if (num > 1e6) return { amount: (num / 1e6).toFixed(2), symbol: 'USDC' };
    if (num > 0) return { amount: String(num), symbol: '' };
  }
  return null;
}

/* ═══════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════ */

export default function EventsPage() {
  const [paused, setPaused] = useState(false);
  const [catFilter, setCatFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { events: rawEvents, connected, loading: historyLoading } = useAllEvents();
  const { map: agentMap } = useAgentMapCtx();
  const eventsRef = useRef(rawEvents);
  if (!paused) eventsRef.current = rawEvents;

  const events = eventsRef.current;

  /* Stats */
  const stats = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const e of events) {
      const meta = resolveEventMeta(e);
      byCategory.set(meta.category, (byCategory.get(meta.category) ?? 0) + 1);
    }
    return { total: events.length, byCategory };
  }, [events]);

  /* Filtered events */
  const filtered = useMemo(() => {
    let list = events;
    if (catFilter !== 'all') {
      list = list.filter((e: StreamEvent) => resolveEventMeta(e).category === catFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e: StreamEvent) => {
        const p = e.payload;
        return JSON.stringify(p).toLowerCase().includes(q);
      });
    }
    return list;
  }, [events, catFilter, search]);

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(filtered.length, 25);
  const paginatedEvents = useMemo(() => paginate(filtered), [paginate, filtered]);

  return (
    <ExplorerPageShell
      title="Live Events"
      subtitle="All protocol events since program deployment — updating in real-time"
      icon={<Radio className="h-5 w-5" />}
      badge={
        <Badge variant="secondary" className="text-xs tabular-nums">
          {stats.total} events
        </Badge>
      }
      actions={<ExplorerLiveDot connected={connected} />}
    >

      {/* Search */}
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search event payload…"
        filters={catFilter !== 'all' ? [{
          key: 'category',
          label: 'Category',
          value: CATEGORIES.find(c => c.id === catFilter)?.label ?? catFilter,
          onClear: () => setCatFilter('all'),
        }] : undefined}
      />

      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const count = id === 'all' ? stats.total : (stats.byCategory.get(id) ?? 0);
            return (
              <button
                key={id}
                onClick={() => setCatFilter(id)}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  catFilter === id
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
                {count > 0 && <span className="ml-0.5 tabular-nums opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Pause / Resume */}
          <Button
            variant={paused ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>

      {/* Event feed */}
      <div className="space-y-2">
        {historyLoading ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Radio className="h-8 w-8 text-primary/40 animate-pulse" />
              <p className="text-sm text-muted-foreground">Loading full event history…</p>
              <p className="text-xs text-muted-foreground/60">
                Fetching all events since program deployment
              </p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Radio className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
              <p className="text-sm text-muted-foreground">
                {connected ? 'Waiting for events…' : 'Connecting to event stream…'}
              </p>
              <p className="text-xs text-muted-foreground/60">
                Events from all 8 SAP protocol modules will appear here in real-time
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {paginatedEvents.map((event: StreamEvent, idx: number) => (
              <EventCard key={`${event.type}-${(page - 1) * perPage + idx}`} event={event} agentMap={agentMap} />
            ))}
            <ExplorerPagination
              page={page}
              total={filtered.length}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              className="rounded-xl border border-border/40"
            />
          </>
        )}
      </div>
    </ExplorerPageShell>
  );
}

/* ═══════════════════════════════════════════════
 * EVENT CARD
 * ═══════════════════════════════════════════════ */

function EventCard({ event, agentMap }: { event: StreamEvent; agentMap: import('~/types/api').AgentMap }) {
  const [expanded, setExpanded] = useState(false);
  const meta = resolveEventMeta(event);
  const Icon = meta.icon;
  const addresses = extractAddresses(event);
  const amount = extractAmount(event);
  const p = event.payload;
  const blockTime = (p.block_time as number | undefined) ?? (p.blockTime as number | undefined);
  const slot = p.slot as number | undefined;

  // Address fields that should show agent tags (wallet-type addresses)
  const AGENT_TAG_FIELDS = new Set(['Wallet', 'Depositor', 'Signer', 'Reviewer', 'Attester', 'Delegate']);

  return (
    <Card className={cn(
      'group transition-all duration-200 hover:border-primary/10',
      'animate-in slide-in-from-top-1 fade-in duration-300',
    )}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Event icon */}
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', meta.bgColor)}>
            <Icon className={cn('h-4 w-4', meta.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-sm font-medium', meta.color)}>{meta.label}</span>
              <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono">
                {meta.eventName}
              </Badge>
              {amount && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 tabular-nums">
                  {amount.amount} {amount.symbol}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-auto tabular-nums flex items-center gap-1.5">
                {slot && (
                  <>
                    <Hash className="h-2.5 w-2.5" />
                    <span>{Number(slot).toLocaleString()}</span>
                  </>
                )}
                {blockTime && (
                  <>
                    <Clock className="h-2.5 w-2.5 ml-1" />
                    <span>{timeAgo(Number(blockTime))}</span>
                  </>
                )}
              </span>
            </div>

            {/* Address pills — agent-tagged for wallets */}
            {addresses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {addresses.map(({ key, value, link }, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">{key}:</span>
                    {AGENT_TAG_FIELDS.has(key) ? (
                      <AgentTag address={value} agentMap={agentMap} className="text-xs" />
                    ) : link ? (
                      <Link
                        href={link}
                        className="font-mono text-primary/70 hover:text-primary transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {short(value)}
                      </Link>
                    ) : (
                      <span className="font-mono text-foreground/70">{short(value)}</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Expandable raw data */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-2 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
              Raw data
            </button>
            {expanded && (
              <pre className="mt-2 p-3 rounded-lg bg-muted/30 text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto text-muted-foreground">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
