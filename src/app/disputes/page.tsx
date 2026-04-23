'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Swords,
  Scale,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  Skeleton,
  EmptyState,
  Address,
  ExplorerPagination,
  usePagination,
  ExplorerPageShell,
  ExplorerMetric,
  ExplorerFilterBar,
} from '~/components/ui';
import { DataSourceBadge } from '~/components/ui/explorer-primitives';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { useDisputes } from '~/hooks/use-sap';
import { AgentTag } from '~/components/ui/agent-tag';
import { formatLamports, timeAgo } from '~/lib/format';

/* ── Dispute status styling ──────────────────── */

type OutcomeKey = 'Pending' | 'Upheld' | 'Rejected' | 'PartialRefund' | 'Split' | 'Expired';

const OUTCOME_CONFIG: Record<OutcomeKey, { label: string; icon: typeof CheckCircle2; variant: string; className: string }> = {
  Pending: {
    label: 'Pending',
    icon: Clock,
    variant: 'neon-amber',
    className: 'bg-amber-500/15 text-amber-400',
  },
  Upheld: {
    label: 'Upheld',
    icon: CheckCircle2,
    variant: 'neon-emerald',
    className: 'bg-emerald-500/15 text-emerald-400',
  },
  Rejected: {
    label: 'Rejected',
    icon: XCircle,
    variant: 'neon-rose',
    className: 'bg-red-500/15 text-red-400',
  },
  PartialRefund: {
    label: 'Partial Refund',
    icon: Scale,
    variant: 'neon-orange',
    className: 'bg-primary/15 text-primary',
  },
  Split: {
    label: 'Split',
    icon: Users,
    variant: 'neon-orange',
    className: 'bg-blue-500/15 text-blue-400',
  },
  Expired: {
    label: 'Expired',
    icon: Timer,
    variant: 'secondary',
    className: 'bg-zinc-500/15 text-zinc-400',
  },
};

const LAYER_CONFIG: Record<string, { label: string; icon: typeof ShieldCheck; className: string }> = {
  Auto: {
    label: 'Auto-Resolve',
    icon: ShieldCheck,
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  Governance: {
    label: 'Governance',
    icon: Users,
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  Pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
};

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  NonDelivery: 'Non-Delivery',
  PartialDelivery: 'Partial Delivery',
  Overcharge: 'Overcharge',
  Quality: 'Quality',
};

/* ── Outcome filter toggle ───────────────────── */

function OutcomeFilter({
  outcome,
  count,
  active,
  onClick,
}: {
  outcome: OutcomeKey;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = OUTCOME_CONFIG[outcome];
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
        active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-card border-border text-muted-foreground hover:border-primary/20 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full transition-colors',
          active ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      />
      {cfg.label}
      <span className="text-[10px] text-muted-foreground tabular-nums">({count})</span>
    </button>
  );
}

/* ── Main page ───────────────────────────────── */

export default function DisputesPage() {
  const { data, loading, error } = useDisputes();
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeKey | null>(null);

  const disputes = useMemo(() => data?.disputes ?? [], [data]);

  /* Outcome counts */
  const outcomeCounts = useMemo(() => {
    const counts: Record<OutcomeKey, number> = {
      Pending: 0, Upheld: 0, Rejected: 0, PartialRefund: 0, Split: 0, Expired: 0,
    };
    for (const d of disputes) {
      const key = d.outcome as OutcomeKey;
      if (key in counts) counts[key]++;
    }
    return counts;
  }, [disputes]);

  /* Filter + search */
  const filtered = useMemo(() => {
    return disputes.filter((d) => {
      if (outcomeFilter && d.outcome !== outcomeFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.pda.toLowerCase().includes(q) ||
        d.escrowPda.toLowerCase().includes(q) ||
        d.disputant.toLowerCase().includes(q) ||
        d.agentPda.toLowerCase().includes(q) ||
        (d.reason ?? '').toLowerCase().includes(q) ||
        (d.disputeType ?? '').toLowerCase().includes(q)
      );
    });
  }, [disputes, outcomeFilter, search]);

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(filtered.length, 10);
  const paginatedDisputes = useMemo(() => paginate(filtered), [paginate, filtered]);

  /* Stats */
  const stats = useMemo(() => {
    const totalBond = disputes.reduce((s, d) => s + Number(d.disputeBond ?? 0), 0);
    const resolved = disputes.filter((d) => d.outcome !== 'Pending').length;
    const autoResolved = disputes.filter((d) => d.resolutionLayer === 'Auto').length;
    return { totalBond, resolved, autoResolved };
  }, [disputes]);

  return (
    <ExplorerPageShell
      title="Dispute Arena"
      subtitle="v0.7 receipt-based trustless dispute resolution — 3-layer automatic arbitration"
      icon={<Swords className="h-5 w-5" />}
      badge={
        <Badge variant="secondary" className="tabular-nums">
          {data?.total ?? 0} disputes
        </Badge>
      }
      stats={
        <>
          <ExplorerMetric
            icon={<Swords className="h-3.5 w-3.5" />}
            label="Total Disputes"
            value={data?.total ?? 0}
            accent="primary"
          />
          <ExplorerMetric
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Resolved"
            value={stats.resolved}
            sub={disputes.length > 0 ? `${Math.round((stats.resolved / disputes.length) * 100)}%` : '0%'}
            accent="emerald"
          />
          <ExplorerMetric
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Auto-Resolved"
            value={stats.autoResolved}
            accent="cyan"
          />
          <ExplorerMetric
            icon={<Scale className="h-3.5 w-3.5" />}
            label="Total Bonds"
            value={formatLamports(String(stats.totalBond))}
            accent="amber"
          />
        </>
      }
    >
      {/* Outcome filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(OUTCOME_CONFIG) as OutcomeKey[]).map((key) => (
          <OutcomeFilter
            key={key}
            outcome={key}
            count={outcomeCounts[key]}
            active={outcomeFilter === key}
            onClick={() => setOutcomeFilter(outcomeFilter === key ? null : key)}
          />
        ))}
      </div>

      {/* Search */}
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search disputes by PDA, escrow, disputant, reason…"
      />

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-3 mt-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && disputes.length === 0 && (
        <EmptyState
          message="No disputes recorded yet. The arena is quiet."
          icon={<Swords className="h-8 w-8 text-muted-foreground" />}
        />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Dispute cards */}
      {paginatedDisputes.length > 0 && (
        <div className="space-y-3 mt-4">
          {paginatedDisputes.map((d) => {
            const outcomeCfg = OUTCOME_CONFIG[(d.outcome as OutcomeKey) ?? 'Pending'] ?? OUTCOME_CONFIG.Pending;
            const layerCfg = LAYER_CONFIG[d.resolutionLayer] ?? LAYER_CONFIG.Pending;
            const OutcomeIcon = outcomeCfg.icon;
            const LayerIcon = layerCfg.icon;

            return (
              <Card
                key={d.pda}
                className="arena-panel-active group transition-all duration-300 hover:shadow-[0_0_20px_-6px_hsl(var(--glow)/0.2)]"
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', outcomeCfg.className)}>
                        <OutcomeIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {DISPUTE_TYPE_LABELS[d.disputeType] ?? d.disputeType}
                          </span>
                          <Badge variant={outcomeCfg.variant as 'default'} className="text-[10px]">
                            {outcomeCfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Address value={d.pda} className="text-xs" copy />
                          <DataSourceBadge source="onchain" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Resolution layer badge */}
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md border',
                        layerCfg.className,
                      )}>
                        <LayerIcon className="h-3 w-3" />
                        {layerCfg.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {timeAgo(d.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Escrow</span>
                      <Link
                        href={`/escrows/${d.escrowPda}`}
                        className="text-primary hover:underline"
                      >
                        <Address value={d.escrowPda} className="text-xs" />
                      </Link>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Disputant</span>
                      <Address value={d.disputant} className="text-xs" copy />
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Agent</span>
                      <AgentTag
                        address={d.agentPda}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Bond</span>
                      <span className="font-mono tabular-nums">{formatLamports(d.disputeBond)}</span>
                    </div>
                  </div>

                  {/* Calls comparison bar (if data) */}
                  {d.provenCalls != null && d.claimedCalls != null && d.claimedCalls > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Proven: <span className="text-foreground font-mono">{d.provenCalls}</span></span>
                        <span>Claimed: <span className="text-foreground font-mono">{d.claimedCalls}</span></span>
                      </div>
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-500"
                          style={{ width: `${Math.min((d.provenCalls / d.claimedCalls) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  {d.reason && (
                    <div className="mt-3 pt-3 border-t border-border/30">
                      <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                        &ldquo;{d.reason}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Proof deadline */}
                  {d.proofDeadline && d.outcome === 'Pending' && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Proof deadline: {new Date(d.proofDeadline).toLocaleString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > perPage && (
        <div className="mt-6">
          <ExplorerPagination
            page={page}
            perPage={perPage}
            total={filtered.length}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </div>
      )}
    </ExplorerPageShell>
  );
}
