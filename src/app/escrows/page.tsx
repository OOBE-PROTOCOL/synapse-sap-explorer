'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Wallet, CreditCard, Clock, ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, PlusCircle, History } from 'lucide-react';
import { cn } from '~/lib/utils';
import { formatTokenAmount } from '~/lib/format';
import { Skeleton, EmptyState, Address, ExplorerPagination, usePagination, ExplorerPageShell, ExplorerMetric, ExplorerFilterBar } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { useEscrows, useAgents, useEscrowEvents, useTokenMetadata } from '~/hooks/use-sap';
import { useAgentMapCtx } from '~/providers/sap-data-provider';
import Image from 'next/image';
import { AgentTag } from '~/components/ui/agent-tag';

/* ── Escrow status derivation ────────────────── */

type EscrowData = {
  pda: string;
  agent: string;
  agentName: string | null;
  depositor: string;
  balance: number | string;
  totalDeposited: number | string;
  totalSettled: number | string;
  totalCallsSettled: number | string;
  maxCalls: number | string;
  pricePerCall: number | string;
  expiresAt: string | number | null;
  closedAt: string | null;
  status: string;
  tokenMint: string | null;
  tokenDecimals: number | null;
  volumeCurve: Array<{ label: string; value: number }> | null;
};

type EscrowEvent = {
  id: string;
  escrowPda: string;
  eventType: string;
  txSignature: string;
  blockTime: number | string | null;
  signer: string | null;
  amountChanged: number | string | null;
  callsSettled: number | string | null;
};

type EscrowStatus = 'active' | 'closed' | 'depleted' | 'expired' | 'settled' | 'unfunded';

const STATUS_CONFIG: Record<EscrowStatus, { label: string; className: string; dot: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  closed: {
    label: 'Closed',
    className: 'bg-neutral-800 text-neutral-400 border border-neutral-700',
    dot: 'bg-neutral-500',
  },
  depleted: {
    label: 'Depleted',
    className: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    dot: 'bg-amber-400',
  },
  expired: {
    label: 'Expired',
    className: 'bg-red-500/15 text-red-400 border border-red-500/20',
    dot: 'bg-red-400',
  },
  settled: {
    label: 'Fully Settled',
    className: 'bg-primary/15 text-primary border border-primary/20',
    dot: 'bg-primary',
  },
  unfunded: {
    label: 'Unfunded',
    className: 'bg-neutral-800 text-neutral-500 border border-neutral-700',
    dot: 'bg-neutral-600',
  },
};

function deriveStatus(escrow: EscrowData): EscrowStatus {
  // If the DB/API already reports a status, respect it
  if (escrow.status === 'closed') return 'closed';
  // closedAt being set is a reliable secondary signal (escrow was closed on-chain)
  if (escrow.closedAt) return 'closed';

  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const maxCalls = Number(escrow.maxCalls);
  const callsSettled = Number(escrow.totalCallsSettled);

  // Parse expiry: handle ISO strings or unix timestamps
  let expiryMs = 0;
  if (escrow.expiresAt && escrow.expiresAt !== '0') {
    const raw = escrow.expiresAt;
    const asNum = Number(raw);
    expiryMs = asNum > 1e12 ? asNum : asNum > 0 ? asNum * 1000 : new Date(raw as string | number).getTime();
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
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-all duration-200',
        active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-white',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full transition-colors', active ? 'bg-primary' : cfg.dot)} />
      {cfg.label}
      <span className="text-[10px] text-neutral-500 tabular-nums">({count})</span>
    </button>
  );
}

export default function EscrowsPage() {
  const { data, loading, error, refetch } = useEscrows();
  const { data: agentsData } = useAgents({ limit: '100' });
  const { data: eventsData } = useEscrowEvents();
  const { map: walletAgentMap } = useAgentMapCtx();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EscrowStatus | null>(null);
  const [expandedEscrow, setExpandedEscrow] = useState<string | null>(null);

  // Collect unique token mints from escrows for metadata resolution
  const tokenMints = useMemo(() => {
    if (!data?.escrows) return [];
    const mints = new Set<string>();
    for (const e of data.escrows as unknown as EscrowData[]) {
      if (e.tokenMint && e.tokenMint !== 'So11111111111111111111111111111111111111112') {
        mints.add(e.tokenMint);
      }
    }
    return [...mints];
  }, [data]);
  const { tokens: tokenMetaMap } = useTokenMetadata(tokenMints);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => { refetch?.(); }, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Build event counts per escrow PDA
  const eventsByEscrow = useMemo(() => {
    if (!eventsData?.events) return new Map<string, EscrowEvent[]>();
    const map = new Map<string, EscrowEvent[]>();
    for (const ev of eventsData.events as unknown as EscrowEvent[]) {
      const list = map.get(ev.escrowPda) ?? [];
      list.push(ev);
      map.set(ev.escrowPda, list);
    }
    return map;
  }, [eventsData]);

  const enriched = useMemo(() => {
    if (!data?.escrows) return [];
    return (data.escrows as unknown as EscrowData[]).map((e) => {
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

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(filtered.length, 10);
  const paginatedEscrows = useMemo(() => paginate(filtered), [paginate, filtered]);

  return (
    <ExplorerPageShell
      title="Escrow Accounts"
      subtitle="Pre-funded payment escrows between depositors and agents — full lifecycle tracked"
      icon={<CreditCard className="h-5 w-5" />}
      badge={<Badge variant="secondary" className="tabular-nums">{data?.total ?? 0} escrows</Badge>}
      stats={
        <>
          <ExplorerMetric icon={<CreditCard className="h-3.5 w-3.5" />} label="Total Escrows" value={data?.total ?? 0} accent="primary" />
          <ExplorerMetric icon={<Wallet className="h-3.5 w-3.5" />} label="Active" value={statusCounts.active} sub={`${enriched.length > 0 ? Math.round((statusCounts.active / enriched.length) * 100) : 0}%`} accent="emerald" />
          <ExplorerMetric icon={<History className="h-3.5 w-3.5" />} label="Events Tracked" value={eventsData?.total ?? 0} accent="cyan" />
          <ExplorerMetric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Fully Settled" value={statusCounts.settled} accent="amber" />
        </>
      }
    >
      {/* Filters */}
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search escrows…"
      >
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
      </ExplorerFilterBar>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center bg-neutral-900 border-neutral-700">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No escrows match search' : 'No escrow accounts found on-chain'} />
      ) : (
        <>
          <div className="space-y-4">
            {paginatedEscrows.map((e) => (
              <EscrowCard
                key={e.pda}
                escrow={e}
                events={eventsByEscrow.get(e.pda) ?? []}
                expanded={expandedEscrow === e.pda}
                onToggle={() => setExpandedEscrow(expandedEscrow === e.pda ? null : e.pda)}
                walletAgentMap={walletAgentMap}
                tokenMetaMap={tokenMetaMap}
              />
            ))}
          </div>
          <ExplorerPagination
            page={page}
            total={filtered.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            perPageOptions={[10, 25, 50]}
            className="mt-4 rounded-xl border border-border/40"
          />
        </>
      )}
    </ExplorerPageShell>
  );
}

/* ── Event type config ────────────────────────── */

const EVENT_CONFIG: Record<string, { label: string; icon: typeof PlusCircle; color: string }> = {
  create_escrow: { label: 'Created', icon: PlusCircle, color: 'text-emerald-400' },
  deposit_escrow: { label: 'Deposit', icon: ArrowDownLeft, color: 'text-blue-400' },
  settle_calls: { label: 'Settled', icon: CheckCircle2, color: 'text-primary' },
  withdraw_escrow: { label: 'Withdrawal', icon: ArrowUpRight, color: 'text-amber-400' },
  close_escrow: { label: 'Closed', icon: XCircle, color: 'text-red-400' },
};

function EscrowCard({ escrow, events, expanded, onToggle, walletAgentMap, tokenMetaMap }: {
  escrow: EscrowData;
  events: EscrowEvent[];
  expanded: boolean;
  onToggle: () => void;
  walletAgentMap: import('~/types/api').AgentMap;
  tokenMetaMap: Record<string, { mint: string; symbol: string; name: string; logo: string | null }>;
}) {
  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const totalSettled = Number(escrow.totalSettled);
  const pricePerCall = Number(escrow.pricePerCall);
  const callsSettled = Number(escrow.totalCallsSettled);
  const maxCalls = Number(escrow.maxCalls);
  const status = escrow.status as EscrowStatus;
  const cfg = STATUS_CONFIG[status];

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const isNativeSol = !escrow.tokenMint || escrow.tokenMint === SOL_MINT;
  const dec = isNativeSol ? 9 : Number(escrow.tokenDecimals ?? 9);

  // Resolve token label and logo from shared metadata
  const tokenMeta = !isNativeSol && escrow.tokenMint ? tokenMetaMap[escrow.tokenMint] : null;
  const tokenLabel = isNativeSol ? 'SOL' : (tokenMeta?.symbol ?? String(escrow.tokenMint).slice(0, 4) + '…');
  const tokenLogo = isNativeSol
    ? 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
    : tokenMeta?.logo ?? null;
  const tokenName = isNativeSol ? 'SOL' : (tokenMeta?.name ?? 'Unknown Token');

  const formatAmount = (lamports: number) => formatTokenAmount(lamports, dec);

  // Parse expiry safely
  let expiryMs = 0;
  if (escrow.expiresAt && escrow.expiresAt !== '0') {
    const raw = escrow.expiresAt;
    const asNum = Number(raw);
    expiryMs = asNum > 1e12 ? asNum : asNum > 0 ? asNum * 1000 : new Date(raw as string | number).getTime();
  }
  const isExpired = expiryMs > 0 && expiryMs < Date.now();

  // Utilization: if maxCalls configured, use calls ratio; otherwise use funds ratio
  const utilization = maxCalls > 0
    ? Math.min((callsSettled / maxCalls) * 100, 100)
    : totalDeposited > 0
      ? Math.min((totalSettled / totalDeposited) * 100, 100)
      : 0;

  return (
    <Card className={cn(
      'group transition-all duration-300 bg-card border-border',
      status === 'closed' ? 'opacity-60' : 'hover:border-border/80',
    )}>
      <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          {/* Left */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2.5 mb-2">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                status === 'closed' ? 'bg-muted' : 'bg-primary/10',
              )}>
                <CreditCard className={cn('h-4 w-4', status === 'closed' ? 'text-muted-foreground' : 'text-primary')} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate max-w-full">
                    {escrow.agentName ?? 'Unknown Agent'}
                  </span>
                  <Badge className={cn('text-[10px] gap-1', cfg.className)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                    {cfg.label}
                  </Badge>
                  {escrow.closedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      Closed {new Date(escrow.closedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                  <span className="text-[10px] text-muted-foreground shrink-0">PDA</span>
                  <Address value={escrow.pda} copy />
                </div>
              </div>
            </div>

            {/* Parties */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] mt-1">
              <span className="text-muted-foreground">Agent</span>
              <Address value={escrow.agent} copy />
              <span className="text-muted-foreground">Depositor</span>
              <AgentTag address={escrow.depositor} agentMap={walletAgentMap} className="text-[10px]" />
            </div>
          </div>

          {/* Right — stats: 3-col grid on mobile, flex-row on sm+ */}
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-3 sm:gap-5 sm:shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-border/40">
            {pricePerCall > 0 && (
              <div className="text-left sm:text-right min-w-0">
                <p className="text-xs sm:text-sm font-bold tabular-nums text-foreground truncate">{formatAmount(pricePerCall)} <span className="text-[10px] font-normal text-muted-foreground">{tokenLabel}</span></p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">Price/Call</p>
              </div>
            )}
            <div className="text-left sm:text-right min-w-0">
              <div className="flex items-center sm:justify-end gap-1.5 mb-0.5">
                {tokenLogo && (
                  <Image src={tokenLogo} alt={tokenLabel} width={14} height={14} className="rounded-full shrink-0" unoptimized />
                )}
                <p className={cn('text-sm sm:text-lg font-bold tabular-nums font-mono truncate',
                  balance > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-muted-foreground'
                )}>{formatAmount(balance)}</p>
                <span className="text-[10px] sm:text-xs font-normal text-muted-foreground hidden sm:inline">{tokenLabel}</span>
              </div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.12em] font-semibold truncate">{tokenName}</p>
            </div>
            <div className="text-left sm:text-right min-w-0">
              <p className="text-xs sm:text-sm font-bold tabular-nums text-foreground font-mono truncate">{callsSettled}{maxCalls > 0 ? `/${maxCalls}` : ''}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">Calls</p>
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
              <span className="text-[10px] tabular-nums text-muted-foreground font-mono">{utilization.toFixed(1)}%</span>
            </div>
            <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  utilization >= 100 ? 'bg-primary' : utilization > 75 ? 'bg-amber-500/70' : 'bg-primary/60'
                )}
                style={{ width: `${utilization}%` }}
              />
            </div>
          </div>
        )}

        {/* Details row + event toggle */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-neutral-800 text-xs">
          <span className="text-neutral-500">Price/call: <span className="text-neutral-300 tabular-nums">{formatAmount(pricePerCall)} {tokenLabel}</span></span>
          <span className="text-neutral-500">Total deposited: <span className="text-neutral-300 tabular-nums">{formatAmount(totalDeposited)} {tokenLabel}</span></span>
          <span className="text-neutral-500">Total settled: <span className="text-neutral-300 tabular-nums">{formatAmount(totalSettled)} {tokenLabel}</span></span>
          {expiryMs > 0 && (
            <span className="text-neutral-500">
              Expires: <span className={isExpired ? 'text-red-400' : 'text-neutral-300'}>
                {new Date(expiryMs).toLocaleDateString()}
              </span>
            </span>
          )}
          {(escrow.volumeCurve ?? []).length > 0 && (
            <Badge variant="outline" className="text-[10px]">Volume curve ({escrow.volumeCurve!.length} tiers)</Badge>
          )}
          <div className="ml-auto">
            <button
              onClick={onToggle}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] transition-all duration-200 border',
                expanded
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'text-neutral-500 hover:text-white hover:bg-neutral-800 border-transparent hover:border-neutral-700',
              )}
            >
              <History className="h-3 w-3" />
              {events.length > 0 ? `${events.length} events` : 'Events'}
            </button>
          </div>
        </div>

        {/* Event Timeline */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <h4 className="text-[9px] font-semibold text-neutral-500 uppercase tracking-[0.15em] mb-2">
              Event History
            </h4>
            {events.length === 0 ? (
              <p className="text-[11px] text-neutral-500 py-2">No events tracked yet for this escrow.</p>
            ) : (
              <div className="relative space-y-0">
                {/* Timeline line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-neutral-800" />
                {events.map((ev, i) => {
                  const evCfg = EVENT_CONFIG[ev.eventType] ?? { label: ev.eventType, icon: Clock, color: 'text-muted-foreground' };
                  const Icon = evCfg.icon;
                  return (
                    <div key={ev.id ?? i} className="relative flex items-start gap-3 py-1.5">
                      <div className={cn('relative z-10 mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-neutral-900 border border-neutral-700', evCfg.color)}>
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
