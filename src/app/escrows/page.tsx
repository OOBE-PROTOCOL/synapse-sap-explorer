'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Wallet, CreditCard, Filter } from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader, Skeleton, EmptyState, Address, StatusBadge } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import { useEscrows, useAgents } from '~/hooks/use-sap';

/* ── Escrow status derivation ────────────────── */

type EscrowStatus = 'active' | 'depleted' | 'expired' | 'settled' | 'unfunded';

const STATUS_CONFIG: Record<EscrowStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20',
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
  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const maxCalls = Number(escrow.maxCalls);
  const callsSettled = Number(escrow.totalCallsSettled);
  const isExpired = escrow.expiresAt !== '0' && Number(escrow.expiresAt) * 1000 < Date.now();

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
  const { data, loading, error } = useEscrows();
  const { data: agentsData } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EscrowStatus | null>(null);

  const enriched = useMemo(() => {
    if (!data?.escrows) return [];
    return data.escrows.map((e) => {
      const agent = agentsData?.agents.find((a) => a.pda === e.agent);
      return { ...e, agentName: agent?.identity?.name ?? null, status: deriveStatus(e) };
    });
  }, [data, agentsData]);

  // Count per status
  const statusCounts = useMemo(() => {
    const counts: Record<EscrowStatus, number> = { active: 0, depleted: 0, expired: 0, settled: 0, unfunded: 0 };
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
      <PageHeader title="Escrow Accounts" subtitle="Pre-funded payment escrows between depositors and agents">
        <Badge variant="secondary" className="tabular-nums">{data?.total ?? 0} escrows</Badge>
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
            <EscrowCard key={e.pda} escrow={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EscrowCard({ escrow }: { escrow: any }) {
  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const totalSettled = Number(escrow.totalSettled);
  const pricePerCall = Number(escrow.pricePerCall);
  const callsSettled = Number(escrow.totalCallsSettled);
  const maxCalls = Number(escrow.maxCalls);
  const dec = escrow.tokenDecimals ?? 9;
  const status: EscrowStatus = escrow.status;
  const cfg = STATUS_CONFIG[status];

  const formatAmount = (lamports: number) => (lamports / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
  const isExpired = escrow.expiresAt !== '0' && Number(escrow.expiresAt) * 1000 < Date.now();

  // Utilization: if maxCalls configured, use calls ratio; otherwise use funds ratio
  const utilization = maxCalls > 0
    ? Math.min((callsSettled / maxCalls) * 100, 100)
    : totalDeposited > 0
      ? Math.min((totalSettled / totalDeposited) * 100, 100)
      : 0;

  return (
    <Card className="group hover:bg-muted/30 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-chart-4/10 shrink-0">
                <CreditCard className="h-4 w-4 text-chart-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {escrow.agentName ?? 'Unknown Agent'}
                  </span>
                  <Badge className={`${cfg.className} text-[10px]`}>{cfg.label}</Badge>
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
                <p className="text-sm font-bold tabular-nums text-foreground/80">{formatAmount(pricePerCall)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Price/Call</p>
              </div>
            )}
            <div className="text-right">
              <p className={`text-lg font-bold tabular-nums ${
                balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              }`}>{formatAmount(balance)}</p>
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

        {/* Details row */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border/50 text-xs">
          <span className="text-muted-foreground">Price/call: <span className="text-foreground/70">{formatAmount(pricePerCall)}</span></span>
          <span className="text-muted-foreground">Total deposited: <span className="text-foreground/70">{formatAmount(totalDeposited)}</span></span>
          <span className="text-muted-foreground">Total settled: <span className="text-foreground/70">{formatAmount(totalSettled)}</span></span>
          {escrow.expiresAt !== '0' && (
            <span className="text-muted-foreground">
              Expires: <span className={isExpired ? 'text-destructive' : 'text-foreground/70'}>
                {new Date(Number(escrow.expiresAt) * 1000).toLocaleDateString()}
              </span>
            </span>
          )}
          {escrow.volumeCurve.length > 0 && (
            <Badge variant="outline" className="text-[10px]">Volume curve ({escrow.volumeCurve.length} tiers)</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
