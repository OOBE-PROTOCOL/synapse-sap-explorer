'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Search, Wallet, CreditCard, Filter, Clock, ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, PlusCircle, History } from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader, Skeleton, EmptyState, Address, StatusBadge } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import { useEscrows, useAgents, useEscrowEvents } from '~/hooks/use-sap';

/* ── Escrow status derivation ────────────────── */

type EscrowStatus = 'active' | 'closed' | 'depleted' | 'expired' | 'settled' | 'unfunded';

const STATUS_CONFIG: Record<EscrowStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20',
  },
  closed: {
    label: 'Closed',
    className: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-500/20',
  },
  depleted: {
    label: 'Depleted',
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20',
  },
  expired: {
    label: 'Expired',
    className: 'bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/20',
  },
  settled: {
    label: 'Fully Settled',
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20',
  },
  unfunded: {
    label: 'Unfunded',
    className: 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-500/20',
  },
};

function deriveStatus(escrow: any): EscrowStatus {
  // If the DB/API already reports a status, respect it
  if (escrow.status === 'closed') return 'closed';

  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const maxCalls = Number(escrow.maxCalls);
  const callsSettled = Number(escrow.totalCallsSettled);

  // Parse expiry: handle ISO strings or unix timestamps
  let expiryMs = 0;
  if (escrow.expiresAt && escrow.expiresAt !== '0') {
    const raw = escrow.expiresAt;
    const asNum = Number(raw);
    expiryMs = asNum > 1e12 ? asNum : asNum > 0 ? asNum * 1000 : new Date(raw).getTime();
  }
  const isExpired = expiryMs > 0 && expiryMs < Date.now();

  // Expired takes priority
  if (isExpired) return 'expired';

  // Fully settled (if maxCalls is configured and reached)
  if (maxCalls > 0 && callsSettled >= maxCalls) return 'settled';

  // Has funds → active
  if (balance > 0) return 'active';

  // Was funded before but now empty
  if (totalDeposited > 0) return 'depleted';

  // Never funded
  return 'unfunded';
}

/* ── Status filter toggle ────────────────────── */

function StatusFilter({
  status,
  count,
  active,
  onClick,
}: {
  status: EscrowStatus;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
        active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-card border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
      {cfg.label}
      <span className="text-[10px] text-muted-foreground tabular-nums">({count})</span>
    </button>
  );
}

export default function EscrowsPage() {
  const { data, loading, error, refetch } = useEscrows();
  const { data: agentsData } = useAgents({ limit: '100' });
  const { data: eventsData } = useEscrowEvents();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EscrowStatus | null>(null);
  const [expandedEscrow, setExpandedEscrow] = useState<string | null>(null);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => { refetch?.(); }, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Build event counts per escrow PDA
  const eventsByEscrow = useMemo(() => {
    if (!eventsData?.events) return new Map<string, any[]>();
    const map = new Map<string, any[]>();
    for (const ev of eventsData.events) {
      const list = map.get(ev.escrowPda) ?? [];
      list.push(ev);
      map.set(ev.escrowPda, list);
    }
    return map;
  }, [eventsData]);

  const enriched = useMemo(() => {
    if (!data?.escrows) return [];
    return data.escrows.map((e) => {
      const agent = agentsData?.agents.find((a) => a.pda === e.agent);
      return {
        ...e,
        agentName: agent?.identity?.name ?? null,
        status: deriveStatus(e),
        eventCount: eventsByEscrow.get(e.pda)?.length ?? 0,
      };
    });
  }, [data, agentsData, eventsByEscrow]);

  // Count per status
  const statusCounts = useMemo(() => {
    const counts: Record<EscrowStatus, number> = { active: 0, closed: 0, depleted: 0, expired: 0, settled: 0, unfunded: 0 };
    for (const e of enriched) counts[e.status]++;
    return counts;
  }, [enriched]);

  const filtered = enriched.filter((e) => {
    // Status filter
    if (statusFilter && e.status !== statusFilter) return false;

    // Text search
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.pda.toLowerCase().includes(q) ||
      e.agent.toLowerCase().includes(q) ||
      e.depositor.toLowerCase().includes(q) ||
      (e.agentName ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Escrow Accounts" subtitle="Pre-funded payment escrows between depositors and agents — full lifecycle tracked">
        <div className="flex items-center gap-2">
          {eventsData && eventsData.total > 0 && (
            <Badge variant="outline" className="tabular-nums gap-1">
              <History className="h-3 w-3" />
              {eventsData.total} events
            </Badge>
          )}
          <Badge variant="secondary" className="tabular-nums">{data?.total ?? 0} escrows</Badge>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search escrows…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(Object.keys(STATUS_CONFIG) as EscrowStatus[]).map((s) =>
            statusCounts[s] > 0 ? (
              <StatusFilter
                key={s}
                status={s}
                count={statusCounts[s]}
                active={statusFilter === s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              />
            ) : null
          )}
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No escrows match search' : 'No escrow accounts found on-chain'} />
      ) : (
        <div className="space-y-4">
          {filtered.map((e) => (
            <EscrowCard
              key={e.pda}
              escrow={e}
              events={eventsByEscrow.get(e.pda) ?? []}
              expanded={expandedEscrow === e.pda}
              onToggle={() => setExpandedEscrow(expandedEscrow === e.pda ? null : e.pda)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Event type config ────────────────────────── */

const EVENT_CONFIG: Record<string, { label: string; icon: typeof PlusCircle; color: string }> = {
  create_escrow: { label: 'Created', icon: PlusCircle, color: 'text-emerald-500' },
  deposit_escrow: { label: 'Deposit', icon: ArrowDownLeft, color: 'text-blue-500' },
  settle_calls: { label: 'Settled', icon: CheckCircle2, color: 'text-violet-500' },
  withdraw_escrow: { label: 'Withdrawal', icon: ArrowUpRight, color: 'text-amber-500' },
  close_escrow: { label: 'Closed', icon: XCircle, color: 'text-red-500' },
};

function EscrowCard({ escrow, events, expanded, onToggle }: {
  escrow: any;
  events: any[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const totalSettled = Number(escrow.totalSettled);
  const pricePerCall = Number(escrow.pricePerCall);
  const callsSettled = Number(escrow.totalCallsSettled);
  const maxCalls = Number(escrow.maxCalls);
  const status: EscrowStatus = escrow.status;
  const cfg = STATUS_CONFIG[status];

  // Native SOL escrows (tokenMint is null/empty) always use 9 decimals.
  // Some on-chain escrows store tokenDecimals=0 incorrectly — force 9 for SOL.
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const isNativeSol = !escrow.tokenMint || escrow.tokenMint === SOL_MINT;
  const dec = isNativeSol ? 9 : (escrow.tokenDecimals ?? 9);
  const tokenLabel = isNativeSol ? 'SOL' : (escrow.tokenMint?.slice(0, 4) ?? 'SOL');

  const formatAmount = (lamports: number) => {
    const value = lamports / 10 ** dec;
    // Show more precision for tiny amounts, fewer for larger ones
    if (value === 0) return '0';
    if (value < 0.001) return value.toFixed(6);
    if (value < 1) return value.toFixed(4);
    return value.toFixed(2);
  };

  // Parse expiry safely
  let expiryMs = 0;
  if (escrow.expiresAt && escrow.expiresAt !== '0') {
    const raw = escrow.expiresAt;
    const asNum = Number(raw);
    expiryMs = asNum > 1e12 ? asNum : asNum > 0 ? asNum * 1000 : new Date(raw).getTime();
  }
  const isExpired = expiryMs > 0 && expiryMs < Date.now();

  // Utilization: if maxCalls configured, use calls ratio; otherwise use funds ratio
  const utilization = maxCalls > 0
    ? Math.min((callsSettled / maxCalls) * 100, 100)
    : totalDeposited > 0
      ? Math.min((totalSettled / totalDeposited) * 100, 100)
      : 0;

  return (
    <Card className={cn('group transition-colors', status === 'closed' ? 'opacity-70' : 'hover:bg-muted/30')}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
                status === 'closed' ? 'bg-zinc-500/10' : 'bg-chart-4/10',
              )}>
                <CreditCard className={cn('h-4 w-4', status === 'closed' ? 'text-zinc-500' : 'text-chart-4')} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {escrow.agentName ?? 'Unknown Agent'}
                  </span>
                  <Badge className={`${cfg.className} text-[10px]`}>{cfg.label}</Badge>
                  {escrow.closedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      Closed {new Date(escrow.closedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">Escrow PDA</span>
                  <Address value={escrow.pda} copy />
                </div>
              </div>
            </div>

            {/* Parties */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] mt-1">
              <span className="text-muted-foreground">Agent</span>
              <Address value={escrow.agent} copy />
              <span className="text-muted-foreground">Depositor</span>
              <Address value={escrow.depositor} copy />
            </div>
          </div>

          {/* Right — stats */}
          <div className="flex items-center gap-5 shrink-0">
            {pricePerCall > 0 && (
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums text-foreground/80">{formatAmount(pricePerCall)} <span className="text-[10px] font-normal text-muted-foreground">{tokenLabel}</span></p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Price/Call</p>
              </div>
            )}
            <div className="text-right">
              <p className={`text-lg font-bold tabular-nums ${
                balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              }`}>{formatAmount(balance)} <span className="text-xs font-normal text-muted-foreground">{tokenLabel}</span></p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums text-foreground">{callsSettled}{maxCalls > 0 ? `/${maxCalls}` : ''}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calls Settled</p>
            </div>
          </div>
        </div>

        {/* Utilization bar */}
        {(totalDeposited > 0 || maxCalls > 0) && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">
                {maxCalls > 0 ? `Calls ${callsSettled}/${maxCalls}` : 'Funds Utilization'}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{utilization.toFixed(1)}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  utilization >= 100 ? 'bg-blue-500/70' : utilization > 75 ? 'bg-amber-500/60' : 'bg-primary/60'
                )}
                style={{ width: `${utilization}%` }}
              />
            </div>
          </div>
        )}

        {/* Details row + event toggle */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border/50 text-xs">
          <span className="text-muted-foreground">Price/call: <span className="text-foreground/70">{formatAmount(pricePerCall)} {tokenLabel}</span></span>
          <span className="text-muted-foreground">Total deposited: <span className="text-foreground/70">{formatAmount(totalDeposited)} {tokenLabel}</span></span>
          <span className="text-muted-foreground">Total settled: <span className="text-foreground/70">{formatAmount(totalSettled)} {tokenLabel}</span></span>
          {expiryMs > 0 && (
            <span className="text-muted-foreground">
              Expires: <span className={isExpired ? 'text-destructive' : 'text-foreground/70'}>
                {new Date(expiryMs).toLocaleDateString()}
              </span>
            </span>
          )}
          {(escrow.volumeCurve ?? []).length > 0 && (
            <Badge variant="outline" className="text-[10px]">Volume curve ({escrow.volumeCurve.length} tiers)</Badge>
          )}
          <div className="ml-auto">
            <button
              onClick={onToggle}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors',
                expanded
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <History className="h-3 w-3" />
              {events.length > 0 ? `${events.length} events` : 'Events'}
            </button>
          </div>
        </div>

        {/* Event Timeline */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Event History
            </h4>
            {events.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">No events tracked yet for this escrow.</p>
            ) : (
              <div className="relative space-y-0">
                {/* Timeline line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                {events.map((ev, i) => {
                  const evCfg = EVENT_CONFIG[ev.eventType] ?? { label: ev.eventType, icon: Clock, color: 'text-muted-foreground' };
                  const Icon = evCfg.icon;
                  return (
                    <div key={ev.id ?? i} className="relative flex items-start gap-3 py-1.5">
                      <div className={cn('relative z-10 mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-background border border-border', evCfg.color)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-medium', evCfg.color)}>{evCfg.label}</span>
                          {ev.amountChanged && Number(ev.amountChanged) !== 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {Number(ev.amountChanged) > 0 ? '+' : ''}{formatAmount(Number(ev.amountChanged))} {tokenLabel}
                            </span>
                          )}
                          {ev.callsSettled && Number(ev.callsSettled) > 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {ev.callsSettled} calls
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ev.blockTime && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(ev.blockTime).toLocaleString()}
                            </span>
                          )}
                          {ev.signer && (
                            <span className="text-[10px] text-muted-foreground">
                              by <Address value={ev.signer} copy />
                            </span>
                          )}
                          {ev.txSignature && (
                            <Link
                              href={`/tx/${ev.txSignature}`}
                              className="text-[10px] text-primary/70 hover:text-primary transition-colors"
                            >
                              {ev.txSignature.slice(0, 8)}...
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
