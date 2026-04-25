'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  Heart,
  Zap,
  Clock,
  ArrowRight,
  Signal,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  Address,
  Skeleton,
  ExplorerPageShell,
  ExplorerMetric,
  AgentAvatar,
} from '~/components/ui';
import { DataSourceBadge } from '~/components/ui/explorer-primitives';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { useAgents } from '~/hooks/use-sap';
import { fmtNum } from '~/lib/format';
import type { SerializedDiscoveredAgent } from '~/lib/sap/discovery';

/* ── Health derivation ─────────────────────── */

type HealthLevel = 'excellent' | 'good' | 'degraded' | 'critical' | 'offline';

function deriveHealth(agent: SerializedDiscoveredAgent): {
  level: HealthLevel;
  score: number;
  factors: string[];
} {
  const factors: string[] = [];
  let score = 0;
  const id = agent.identity;

  // Active status (30 points)
  if (id?.isActive) {
    score += 30;
  } else {
    factors.push('Inactive');
  }

  // Reputation (30 points)
  const rep = Number(id?.reputationScore ?? 0);
  const repScore = Math.min(rep / 10000, 1) * 30;
  score += repScore;
  if (rep < 3000) factors.push('Low reputation');

  // Uptime (20 points)
  const uptime = Number(id?.uptimePercent ?? 0);
  score += (uptime / 100) * 20;
  if (uptime < 90) factors.push('Low uptime');

  // Latency (20 points — lower is better)
  const latency = Number(id?.avgLatencyMs ?? 0);
  if (latency === 0) {
    score += 10; // no data
  } else if (latency < 500) {
    score += 20;
  } else if (latency < 2000) {
    score += 15;
  } else if (latency < 5000) {
    score += 10;
    factors.push('High latency');
  } else {
    score += 5;
    factors.push('Very high latency');
  }

  const level: HealthLevel =
    !id?.isActive ? 'offline' :
    score >= 85 ? 'excellent' :
    score >= 65 ? 'good' :
    score >= 40 ? 'degraded' : 'critical';

  return { level, score: Math.round(score), factors };
}

const HEALTH_CONFIG: Record<HealthLevel, { label: string; className: string; dotClass: string; ringClass: string }> = {
  excellent: {
    label: 'Excellent',
    className: 'text-emerald-400',
    dotClass: 'bg-emerald-500 shadow-[0_0_8px_hsl(var(--neon-emerald)/0.6)]',
    ringClass: 'ring-emerald-500/30',
  },
  good: {
    label: 'Good',
    className: 'text-primary',
    dotClass: 'bg-primary shadow-[0_0_8px_hsl(var(--neon-orange)/0.6)]',
    ringClass: 'ring-primary/30',
  },
  degraded: {
    label: 'Degraded',
    className: 'text-amber-400',
    dotClass: 'bg-amber-500 shadow-[0_0_8px_hsl(var(--neon-amber)/0.6)]',
    ringClass: 'ring-amber-500/30',
  },
  critical: {
    label: 'Critical',
    className: 'text-red-400',
    dotClass: 'bg-red-500 shadow-[0_0_8px_hsl(var(--destructive)/0.6)]',
    ringClass: 'ring-red-500/30',
  },
  offline: {
    label: 'Offline',
    className: 'text-zinc-500',
    dotClass: 'bg-zinc-600',
    ringClass: 'ring-zinc-600/30',
  },
};

/* ── Main page ───────────────────────────────── */

export default function AgentHealthPage() {
  const { data, loading } = useAgents({ limit: '100' });

  const agents = useMemo(() => data?.agents ?? [], [data]);

  const healthData = useMemo(() => {
    return agents.map((a) => ({ ...a, health: deriveHealth(a) }));
  }, [agents]);

  const sorted = useMemo(() => {
    return [...healthData].sort((a, b) => b.health.score - a.health.score);
  }, [healthData]);

  const stats = useMemo(() => {
    const byLevel: Record<HealthLevel, number> = { excellent: 0, good: 0, degraded: 0, critical: 0, offline: 0 };
    for (const a of healthData) byLevel[a.health.level]++;
    const avgScore = healthData.length > 0
      ? Math.round(healthData.reduce((s, a) => s + a.health.score, 0) / healthData.length)
      : 0;
    return { byLevel, avgScore };
  }, [healthData]);

  return (
    <ExplorerPageShell
      title="Agent Health Grid"
      subtitle="Real-time health monitoring across all registered agents — reputation, uptime, latency, and status"
      icon={<Activity className="h-5 w-5" />}
      badge={<Badge variant="secondary" className="tabular-nums">{agents.length} agents</Badge>}
      stats={
        <>
          <ExplorerMetric
            icon={<Heart className="h-3.5 w-3.5" />}
            label="Avg Health"
            value={`${stats.avgScore}%`}
            accent={stats.avgScore >= 70 ? 'emerald' : stats.avgScore >= 40 ? 'amber' : 'primary'}
          />
          <ExplorerMetric
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Excellent"
            value={stats.byLevel.excellent}
            accent="emerald"
          />
          <ExplorerMetric
            icon={<Signal className="h-3.5 w-3.5" />}
            label="Degraded"
            value={stats.byLevel.degraded + stats.byLevel.critical}
            accent="amber"
          />
          <ExplorerMetric
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Offline"
            value={stats.byLevel.offline}
            accent="primary"
          />
        </>
      }
    >
      {/* Loading */}
      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {/* Health grid */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((agent) => {
            const hcfg = HEALTH_CONFIG[agent.health.level];
            const id = agent.identity;
            const rep = Number(id?.reputationScore ?? 0);
            const uptime = Number(id?.uptimePercent ?? 0);
            const latency = Number(id?.avgLatencyMs ?? 0);
            const calls = Number(id?.totalCallsServed ?? agent.stats?.totalCallsServed ?? 0);

            return (
              <Link key={agent.pda} href={`/agents/${id?.wallet ?? agent.pda}`}>
                <Card className={cn(
                  'arena-panel-active group transition-all duration-300 cursor-pointer',
                  'hover:shadow-[0_0_24px_-6px_hsl(var(--glow)/0.25)]',
                  'ring-1',
                  hcfg.ringClass,
                )}>
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <AgentAvatar name={agent.identity?.name ?? 'Agent'} endpoint={agent.identity?.x402Endpoint} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {agent.identity?.name ?? 'Unnamed'}
                          </p>
                          <Address value={id?.wallet ?? agent.pda} className="text-xs" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full animate-pulse', hcfg.dotClass)} />
                        <span className={cn('text-xs font-medium', hcfg.className)}>
                          {hcfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Health bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Health Score</span>
                        <span className={cn('font-mono font-bold', hcfg.className)}>
                          {agent.health.score}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-700',
                            agent.health.level === 'excellent' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                            agent.health.level === 'good' ? 'bg-gradient-to-r from-primary to-primary' :
                            agent.health.level === 'degraded' ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                            agent.health.level === 'critical' ? 'bg-gradient-to-r from-red-500 to-red-400' :
                            'bg-zinc-600',
                          )}
                          style={{ width: `${agent.health.score}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Rep:</span>
                        <span className="font-mono">{fmtNum(rep)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Up:</span>
                        <span className="font-mono">{uptime.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Calls:</span>
                        <span className="font-mono">{fmtNum(calls)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Signal className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Lat:</span>
                        <span className="font-mono">{latency > 0 ? `${latency}ms` : '—'}</span>
                      </div>
                    </div>

                    {/* Issues */}
                    {agent.health.factors.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <div className="flex flex-wrap gap-1">
                          {agent.health.factors.map((f) => (
                            <Badge key={f} variant="outline" className="text-xs px-1.5 py-0">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Data source */}
                    <div className="mt-2 flex items-center justify-between">
                      <DataSourceBadge source="hybrid" />
                      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </ExplorerPageShell>
  );
}
