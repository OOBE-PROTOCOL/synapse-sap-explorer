/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Bot, Network, ArrowLeftRight, Wrench, Layers,
  Wallet, ShieldCheck, Trophy, ArrowRight, Server, TrendingUp,
  Activity, CircleDot, Zap, Coins, Radio, Users, Cpu, BarChart3,
  BotIcon, Copy, Check,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, PieChart, Pie,
} from 'recharts';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '~/components/ui/badge';
import {
  ExplorerPageShell,
  ExplorerMetric,
  ExplorerSection,
  ExplorerLiveDot,
  SectionDivider,
} from '~/components/ui';
import { ArenaCard, ProtocolStats } from '~/components/ui/explorer-primitives';
import {
  ScoreRing,
  CategoryBadge,
  StatusBadge,
} from '~/components/ui';
import { SearchCommand } from '~/components/search-command';
import {
  useOverview,
  useEnrichedAgents,
} from '~/hooks/use-sap';
import { short, timeAgo, fmtUsdc, fmtNum, enumKey, cap } from '~/lib/format';
import { ESCROW_EVENT_LABELS } from '~/lib/constants';
import { cn } from '~/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────── */
type TxProgram = { id: string; name: string | null };
type SapTx = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  sapInstructions: string[];
  sapEvents?: string[];
  programs: TxProgram[];
  feeSol: number;
  signer: string;
};

/* ─── Constants ──────────────────────────────────────────────────── */
const EVENT_LABELS = ESCROW_EVENT_LABELS;

const CHART_COLORS = [
  'hsl(186, 93%, 37%)', 'hsl(186, 80%, 55%)', 'hsl(195, 85%, 48%)',
  'hsl(186, 60%, 65%)', 'hsl(195, 50%, 35%)', 'hsl(180, 70%, 42%)',
  'hsl(186, 40%, 70%)', 'hsl(195, 60%, 30%)', 'hsl(175, 80%, 45%)', 'hsl(186, 30%, 55%)',
];

const TOOLTIP_STYLE = {
  background: 'hsl(0 0% 7%)',
  color: 'hsl(0 0% 98%)',
  border: '1px solid hsl(0 0% 18%)',
  borderRadius: '8px',
  fontSize: '11px',
  boxShadow: '0 4px 12px -4px hsl(0 0% 0% / 0.5)',
};

/* ─── Reusable mini components ───────────────────────────────────── */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-xs text-neutral-500 hover:text-primary transition-colors flex items-center gap-1 group/link">
      {label} <ArrowRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
    </Link>
  );
}

function MiniProgressBar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted/20 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-1000 ease-out', color)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═════════════════════════════════════════════════════════════════ */
export default function OverviewPage() {
  const { data: overview, loading: overviewLoading } = useOverview();
  const { data: enrichedData } = useEnrichedAgents();

  const metrics       = overview?.metrics ?? null;
  const agentsData    = overview?.agents ?? null;
  const escrowData    = overview?.escrows ?? null;
  const attestationData = overview?.attestations ?? null;
  const feedbackData  = overview?.feedbacks ?? null;
  const vaultData     = overview?.vaults ?? null;
  const toolsData     = overview?.tools ?? null;
  const eventsData    = overview?.escrowEvents ?? null;

  const loading = overviewLoading;

  /* ── Live TX polling ── */
  const [txs, setTxs] = useState<SapTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txTick, setTxTick] = useState(0);
  const [copiedSnippet, setCopiedSnippet] = useState<'remote' | 'local' | null>(null);

  const remoteSkillCommand = `curl -fsSL https://synapse.oobeprotocol.ai/skills.md \\
  -o ./skills/synapse-skills-0.9.1.md`;
  const localSkillCommand = `pnpm add -D @oobe-protocol-labs/synapse-sap-sdk@0.9.1
cp node_modules/@oobe-protocol-labs/synapse-sap-sdk/skills/skills.md \\
  ./skills/synapse-skills-0.9.1.md`;

  const copySnippet = useCallback(async (which: 'remote' | 'local') => {
    const value = which === 'remote' ? remoteSkillCommand : localSkillCommand;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSnippet(which);
      setTimeout(() => setCopiedSnippet(null), 1200);
    } catch {
      // no-op in case clipboard is blocked
    }
  }, [localSkillCommand, remoteSkillCommand]);

  const fetchTxs = useCallback(async () => {
    try {
      const res = await fetch('/api/sap/transactions?perPage=12');
      if (res.ok) {
        const d = await res.json();
        setTxs(prev => {
          const next = d.transactions ?? [];
          if (next.length && prev[0]?.signature !== next[0]?.signature) setTxTick(t => t + 1);
          return next;
        });
      }
    } catch { /* non-critical */ }
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => { fetchTxs(); const t = setInterval(fetchTxs, 15_000); return () => clearInterval(t); }, [fetchTxs]);

  /* ── Derived ── */
  const totalAgents       = Number(metrics?.totalAgents ?? 0);
  const activeAgents      = Number(metrics?.activeAgents ?? 0);
  const totalAttestations = attestationData?.total ?? Number(metrics?.totalAttestations ?? 0);
  const totalFeedbacks    = feedbackData?.total    ?? Number(metrics?.totalFeedbacks    ?? 0);
  const totalVaults       = vaultData?.total       ?? Number(metrics?.totalVaults       ?? 0);
  const totalTools        = toolsData?.total       ?? Number(metrics?.totalTools        ?? 0);
  const totalProtocols    = Number(metrics?.totalProtocols    ?? 0);
  const totalCapabilities = Number(metrics?.totalCapabilities ?? 0);

  /* ── Escrow stats ── */
  const escrowStats = useMemo(() => {
    if (!escrowData?.escrows) return null;
    const e = escrowData.escrows;
    const totalBalance   = e.reduce((s, x) => s + Number(x.balance), 0);
    const totalDeposited = e.reduce((s, x) => s + Number(x.totalDeposited), 0);
    const totalSettled   = e.reduce((s, x) => s + Number(x.totalSettled), 0);
    const totalCalls     = e.reduce((s, x) => s + Number(x.totalCallsSettled), 0);
    const active = e.filter(x => Number(x.balance) > 0).length;
    const utilization = totalDeposited > 0 ? ((totalSettled / totalDeposited) * 100) : 0;
    return { totalBalance, totalDeposited, totalSettled, totalCalls, active, utilization, total: e.length };
  }, [escrowData]);

  /* ── Agent chart data ── */
  const agentChartData = useMemo(() => {
    const topRevenue = metrics?.topAgentsByRevenue ?? [];
    if (!topRevenue.length) return [];
    const nameMap = new Map<string, string>();
    if (agentsData?.agents) {
      for (const a of agentsData.agents) {
        if (a.identity?.name) nameMap.set(a.pda, a.identity.name);
      }
    }
    return topRevenue
      .filter(r => Number(r.totalSettled) > 0)
      .map(r => {
        const fullName = nameMap.get(r.agentPda) ?? short(r.agentPda, 6, 4);
        return {
          name: fullName.length > 14 ? fullName.slice(0, 12) + '..' : fullName,
          pda: r.agentPda,
          calls: Number(r.totalCalls ?? 0),
          settled: Number(r.totalSettled ?? 0),
        };
      })
      .sort((a, b) => b.settled - a.settled)
      .slice(0, 6);
  }, [metrics, agentsData]);

  /* ── Top depositors ── */
  const topDepositors = useMemo(() => {
    if (!escrowData?.escrows) return [];
    const map = new Map<string, { depositor: string; totalSpent: number; totalCalls: number; escrows: number; agents: Set<string> }>();
    for (const e of escrowData.escrows) {
      const dep = e.depositor ?? '';
      if (!dep) continue;
      const prev = map.get(dep) ?? { depositor: dep, totalSpent: 0, totalCalls: 0, escrows: 0, agents: new Set<string>() };
      prev.totalSpent += Number(e.totalSettled ?? 0);
      prev.totalCalls += Number(e.totalCallsSettled ?? 0);
      prev.escrows += 1;
      if (e.agent) prev.agents.add(e.agent);
      map.set(dep, prev);
    }
    return Array.from(map.values())
      .map(d => ({ ...d, agentCount: d.agents.size }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
  }, [escrowData]);

  /* ── Tool categories ── */
  const categoryData = useMemo(() => {
    if (!toolsData?.tools) return [];
    const counts = new Map<string, number>();
    for (const t of toolsData.tools) {
      const cat = cap(enumKey(t.descriptor?.category));
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [toolsData]);

  /* ── Recent events ── */
  const recentEvents = useMemo(() => {
    if (!eventsData?.events) return [];
    return eventsData.events.slice(0, 6);
  }, [eventsData]);

  /* ── Escrow status distribution ── */
  const escrowStatusDist = useMemo(() => {
    if (!escrowData?.escrows) return { active: 0, depleted: 0, expired: 0, closed: 0 };
    const e = escrowData.escrows;
    return {
      active:   e.filter(x => x.status === 'active' || (!x.status && Number(x.balance) > 0)).length,
      depleted: e.filter(x => x.status === 'depleted').length,
      expired:  e.filter(x => x.status === 'expired').length,
      closed:   e.filter(x => x.status === 'closed').length,
    };
  }, [escrowData]);

  /* ── Pie data for escrow status ── */
  const escrowPieData = useMemo(() => {
    return [
      { name: 'Active',   value: escrowStatusDist.active,   fill: 'hsl(0, 0%, 100%)' },
      { name: 'Depleted', value: escrowStatusDist.depleted, fill: 'hsl(0, 63%, 50%)' },
      { name: 'Expired',  value: escrowStatusDist.expired,  fill: 'hsl(24, 95%, 53%)' },
      { name: 'Closed',   value: escrowStatusDist.closed,   fill: 'hsl(0, 0%, 40%)' },
    ].filter(d => d.value > 0);
  }, [escrowStatusDist]);

  /* ── Tool list ── */
  const toolList = useMemo(() => {
    if (!toolsData?.tools) return [];
    return toolsData.tools
      .filter(t => t.descriptor)
      .map(t => ({
        pda:         t.pda,
        name:        t.descriptor!.toolName as string,
        category:    cap(enumKey(t.descriptor!.category)),
        invocations: Number(t.descriptor!.totalInvocations ?? 0),
        isActive:    t.descriptor!.isActive as boolean,
      }))
      .sort((a, b) => b.invocations - a.invocations);
  }, [toolsData]);

  /* ── Activity sparkline ── */
  const sparkData = useMemo(() => {
    if (!eventsData?.events) return [];
    const buckets = new Map<string, number>();
    for (const ev of eventsData.events) {
      const t = ev.blockTime ? new Date(Number(ev.blockTime) * 1000) : null;
      if (!t) continue;
      const key = `${t.getMonth() + 1}/${t.getDate()}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).slice(-14).map(([day, count]) => ({ day, count }));
  }, [eventsData]);

  /* ── Total SOL staked across agent wallets ── */
  const totalAgentSol = useMemo(() => {
    if (!enrichedData?.agents) return null;
    return enrichedData.agents.reduce((sum, a) => sum + (a.balances?.sol ?? 0), 0);
  }, [enrichedData]);

  /* ── Utilization score (0–10000) ── */
  const utilizationScore = escrowStats ? Math.round(escrowStats.utilization * 100) : 0;

  return (
    <ExplorerPageShell
      title="Dashboard"
      subtitle="Real-time on-chain intelligence for the Synapse Agent Protocol"
      icon={<Activity className="h-5 w-5" />}
      badge={
        <div className="flex items-center gap-2">
          <ExplorerLiveDot connected />
          <Badge variant="hud" className="text-[9px]">MAINNET</Badge>
        </div>
      }
      actions={<SearchCommand />}
      stats={
        <>
          <ExplorerMetric
            icon={<Bot className="h-4 w-4" />}
            label="Agents"
            value={loading ? '—' : fmtNum(totalAgents)}
            sub={`${activeAgents} active`}
            trend={activeAgents > 0 ? { value: `${((activeAgents / Math.max(totalAgents, 1)) * 100).toFixed(0)}% online`, direction: 'up' } : undefined}
            accent="primary"
          />
          <ExplorerMetric
            icon={<Wrench className="h-4 w-4" />}
            label="Tools"
            value={loading ? '—' : fmtNum(totalTools)}
            sub={`${totalCapabilities} capabilities`}
            accent="cyan"
          />
          <ExplorerMetric
            icon={<TrendingUp className="h-4 w-4" />}
            label="Volume"
            value={loading ? '—' : escrowStats ? fmtUsdc(escrowStats.totalSettled, 3) : '—'}
            sub={escrowStats ? `${fmtNum(escrowStats.totalCalls)} settled calls` : undefined}
            trend={escrowStats && escrowStats.utilization > 0 ? { value: `${escrowStats.utilization.toFixed(1)}% util`, direction: 'up' } : undefined}
            accent="emerald"
          />
          <ExplorerMetric
            icon={<Wallet className="h-4 w-4" />}
            label="Escrows"
            value={loading ? '—' : fmtNum(escrowData?.total ?? 0)}
            sub={`${escrowStats?.active ?? 0} active · ${fmtUsdc(escrowStats?.totalBalance ?? 0, 2)} locked`}
            accent="amber"
          />
        </>
      }
    >

      <SectionDivider />

      <ArenaCard glow="primary" className="border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-background to-background">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="h-4 w-4 text-amber-500 dark:text-amber-300" />

            <h2 className="text-sm font-semibold text-foreground">Initialize your agent context with Synapse skills</h2>
            </div>
            <p className="text-xs text-muted-foreground max-w-3xl">
              Use one of the following CLI paths to load the official skill pack and keep your agent aligned with Synapse SAP SDK version 0.9.1.
            </p>
          </div>

          <Link
            href="https://synapse.oobeprotocol.ai/skills.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-auto py-1.5 w-full sm:w-auto sm:min-w-[220px] md:min-w-[260px] justify-center items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/15 px-5 text-xs font-medium text-amber-700 dark:text-amber-200 hover:bg-amber-500/20 transition-colors"
          >
            Open skills.md
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 p-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Option A · Remote source</p>
              <button
                type="button"
                onClick={() => copySnippet('remote')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-200 hover:border-amber-400/40 transition-colors"
                aria-label="Copy remote command"
                title="Copy command"
              >
                {copiedSnippet === 'remote' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap sm:whitespace-pre text-[11px] leading-relaxed text-foreground/80 font-mono">
{remoteSkillCommand}
            </pre>
          </div>

          <div className="rounded-lg border border-border bg-card/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Option B · SDK local package</p>
              <button
                type="button"
                onClick={() => copySnippet('local')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-200 hover:border-amber-400/40 transition-colors"
                aria-label="Copy local command"
                title="Copy command"
              >
                {copiedSnippet === 'local' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap sm:whitespace-pre text-[11px] leading-relaxed text-foreground/80 font-mono">
{localSkillCommand}
            </pre>
          </div>
        </div>
      </ArenaCard>

      {/* ═══════════════════════════════════════════════════════════
         ROW 1 — Live Feed (left 3/ 5) + Charts (right 2/5)
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid gap-5 lg:grid-cols-5">

        {/* ── LEFT: Live Feed ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Transactions */}
          <ExplorerSection
            title="Live Transactions"
            icon={<ArrowLeftRight className="h-4 w-4" />}
            dataSource="onchain"
            actions={
              <div className="flex items-center gap-3">
                {txTick > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    <span className="text-[9px] font-mono text-white/70 uppercase tracking-wider">streaming</span>
                  </span>
                )}
                <SectionLink href="/transactions" label="All" />
              </div>
            }
            compact
          >
            {txLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
            ) : txs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
                <ArrowLeftRight className="h-8 w-8 mb-2" />
                <p className="text-xs">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {txs.slice(0, 6).map((tx, idx) => {
                  const eventNames: string[] = tx.sapEvents ?? [];
                  const rawAction = eventNames[0]
                    ? eventNames[0].replace('Event', '')
                    : (tx.sapInstructions[0] ?? 'Transfer');
                  return (
                    <Link
                      key={tx.signature}
                      href={`/tx/${tx.signature}`}
                      className={cn(
                        'flex items-center gap-2 sm:gap-3 py-2.5 px-2 sm:px-3 rounded-lg transition-all duration-200 group',
                        'hover:bg-accent/40',
                        idx === 0 && txTick > 0 && 'animate-fade-in',
                      )}
                    >
                      {/* Status dot */}
                      <div className="relative shrink-0">
                        <span className={cn(
                          'block h-2 w-2 rounded-full',
                          tx.err ? 'bg-red-500' : 'bg-primary',
                        )} />
                        {idx === 0 && !tx.err && txTick > 0 && (
                          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] sm:text-xs text-muted-foreground truncate group-hover:text-foreground transition-colors">
                            <span className="sm:hidden">{short(tx.signature, 8, 4)}</span>
                            <span className="hidden sm:inline">{short(tx.signature, 32, 8)}</span>
                          </span>
                          <Badge variant="neon" className="text-xs h-4 px-1.5 hidden sm:inline-flex shrink-0">
                            {rawAction.length > 16 ? rawAction.slice(0, 14) + '…' : rawAction}
                          </Badge>
                          {tx.err && <Badge variant="neon-rose" className="text-[8px] h-4 px-1.5 shrink-0">ERR</Badge>}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <BotIcon className="h-3 w-3 text-primary/40 shrink-0" />
                          <span className="text-[10px] sm:text-[12px] text-muted-foreground/70 font-mono truncate min-w-0">
                            <span className="sm:hidden">{tx.signer ? short(tx.signer, 6, 4) : ''}</span>
                            <span className="hidden sm:inline">{tx.signer ?? ''}</span>
                          </span>
                          {tx.feeSol > 0 && (
                            <>
                              <span className="text-[10px] text-muted-foreground/20 hidden sm:inline">·</span>
                              <span className="text-[10px] text-muted-foreground/30 tabular-nums hidden sm:inline whitespace-nowrap">{tx.feeSol.toFixed(6)} SOL</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums whitespace-nowrap shrink-0 group-hover:text-muted-foreground/60 transition-colors">
                        {tx.blockTime ? timeAgo(tx.blockTime) : '—'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </ExplorerSection>

          {/* Protocol Events */}
          <ExplorerSection
            title="Protocol Events"
            icon={<Radio className="h-4 w-4" />}
            dataSource="onchain"
            actions={<SectionLink href="/escrows" label="Escrows" />}
            compact
          >
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
            ) : recentEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                <Radio className="h-6 w-6 mb-2" />
                <p className="text-xs">No events tracked yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentEvents.map((ev, i) => {
                  const meta = EVENT_LABELS[ev.eventType] ?? { label: ev.eventType, color: 'text-muted-foreground' };
                  return (
                    <div
                      key={ev.id ?? i}
                      className="flex items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 rounded-lg hover:bg-muted/10 transition-colors"
                    >
                      <CircleDot className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="glass" className={cn('text-[9px] h-4 px-1.5 shrink-0', meta.color)}>
                            {meta.label}
                          </Badge>
                          {ev.amountChanged && Number(ev.amountChanged) > 0 && (
                            <span className="text-[10px] font-mono tabular-nums text-foreground/60 truncate">{fmtUsdc(Number(ev.amountChanged), 4)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                          {ev.escrowPda && (
                            <Link href={`/escrows/${ev.escrowPda}`} className="text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors shrink-0">
                              {short(ev.escrowPda, 4, 4)}
                            </Link>
                          )}
                          {ev.txSignature && (
                            <>
                              <span className="text-[10px] text-muted-foreground/20">·</span>
                              <Link href={`/tx/${ev.txSignature}`} className="text-[10px] font-mono text-muted-foreground/40 hover:text-foreground transition-colors truncate">
                                {short(ev.txSignature, 6, 4)}
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground/30 whitespace-nowrap shrink-0">
                        {ev.blockTime ? timeAgo(Number(ev.blockTime)) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ExplorerSection>
        </div>

        {/* ── RIGHT: Revenue + Utilization + Volume ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Revenue Leaderboard */}
          <ExplorerSection
            title="Revenue Leaderboard"
            icon={<Trophy className="h-4 w-4" />}
            actions={<SectionLink href="/agents" label="Agents" />}
            compact
          >
            {loading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : agentChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                <Trophy className="h-6 w-6 mb-2" />
                <p className="text-xs">No revenue data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={agentChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(186, 93%, 37%)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(186, 80%, 65%)" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <XAxis type="number" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
                    tickFormatter={v => (v / 1e6).toFixed(1) + 'M'} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false}
                    tickLine={false} width={64} />
                  <RechartsTooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: any) => v != null ? fmtUsdc(Number(v), 4) : ''}
                    cursor={{ fill: 'hsl(var(--glow))', opacity: 0.03 }}
                  />
                  <Bar dataKey="settled" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {agentChartData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ExplorerSection>

          {/* Utilization Ring + Volume Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            {/* Utilization */}
            <ArenaCard glow="emerald" className="flex flex-col items-center justify-center gap-2 py-5">
              {loading ? (
                <Skeleton className="h-14 w-14 rounded-full" />
              ) : (
                <>
                  <ScoreRing score={utilizationScore} size={56} />
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Utilization</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{escrowStats?.utilization.toFixed(1) ?? '0'}%</p>
                  </div>
                </>
              )}
            </ArenaCard>

            {/* Escrow Donut */}
            <ArenaCard glow="primary" className="flex flex-col items-center justify-center py-3">
              {loading || escrowPieData.length === 0 ? (
                <Skeleton className="h-14 w-14 rounded-full" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={72}>
                    <PieChart>
                      <Pie
                        data={escrowPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={20}
                        outerRadius={32}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {escrowPieData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mt-1">Escrow Status</p>
                  <p className="text-xs tabular-nums text-foreground/80">{escrowData?.total ?? 0} total</p>
                </>
              )}
            </ArenaCard>
          </div>

          {/* Activity Sparkline */}
          {sparkData.length > 2 && (
            <ExplorerSection title="Event Activity" icon={<Activity className="h-4 w-4" />} compact>
              <ResponsiveContainer width="100%" height={64}>
                <AreaChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--glow))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--glow))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--glow))" strokeWidth={1.5} fill="url(#sparkGrad)" />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                </AreaChart>
              </ResponsiveContainer>
            </ExplorerSection>
          )}

          {/* Volume Bars */}
          <ExplorerSection title="Volume Breakdown" icon={<Coins className="h-4 w-4" />} compact className="flex-1">
            {loading || !escrowStats ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Deposited', value: escrowStats.totalDeposited, color: 'bg-primary',     text: 'text-primary' },
                  { label: 'Settled',   value: escrowStats.totalSettled,   color: 'bg-foreground',  text: 'text-foreground' },
                  { label: 'Locked',    value: escrowStats.totalBalance,   color: 'bg-muted-foreground', text: 'text-muted-foreground' },
                ].map(({ label, value, color, text }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wider', text)}>{label}</span>
                      <span className="text-[10px] font-mono tabular-nums text-foreground/70">{fmtUsdc(value, 3)}</span>
                    </div>
                    <MiniProgressBar value={value} max={Math.max(escrowStats.totalDeposited, 1)} color={color} />
                  </div>
                ))}
                {/* Total agent SOL staked */}
                {totalAgentSol !== null && (
                  <div className="mt-4 pt-3 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">Agent SOL</span>
                      <span className="text-[10px] font-mono tabular-nums text-foreground/70">{totalAgentSol.toFixed(4)} SOL</span>
                    </div>
                    <MiniProgressBar value={totalAgentSol} max={Math.max(totalAgentSol, 1)} color="bg-primary/60" className="mt-1.5" />
                    <p className="text-[9px] text-muted-foreground/40 mt-1">Total SOL across {enrichedData?.agents?.length ?? 0} agent wallets</p>
                  </div>
                )}
              </div>
            )}
          </ExplorerSection>
        </div>
      </div>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════
         ROW 2 — Tool Categories + Top Depositors + Top Tools
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid gap-5 lg:grid-cols-3 items-stretch">

        {/* Tool Categories */}
        <ExplorerSection
          title="Tool Categories"
          icon={<BarChart3 className="h-4 w-4" />}
          count={totalTools}
          actions={<SectionLink href="/tools" label="Tools" />}
          compact
          className="h-full"
        >
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : categoryData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Wrench className="h-6 w-6 mb-2" />
              <p className="text-xs">No tools registered</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {categoryData.map((cat, idx) => (
                <div key={cat.name} className="group/cat">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={cat.name} />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-foreground/80">{cat.count}</span>
                  </div>
                  <MiniProgressBar
                    value={cat.count}
                    max={categoryData[0]?.count ?? 1}
                    color={`bg-[${CHART_COLORS[idx % CHART_COLORS.length]}]`}
                    className="group-hover/cat:bg-muted/30"
                  />
                </div>
              ))}
            </div>
          )}
        </ExplorerSection>

        {/* Top Depositors */}
        <ExplorerSection
          title="Top Depositors"
          icon={<Users className="h-4 w-4" />}
          actions={<SectionLink href="/escrows" label="Escrows" />}
          compact
          className="h-full"
        >
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
          ) : topDepositors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Users className="h-6 w-6 mb-2" />
              <p className="text-xs">No depositors yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {topDepositors.map((dep, i) => (
                <div
                  key={dep.depositor}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/10 transition-colors"
                >
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold tabular-nums shrink-0',
                    i === 0 ? 'bg-primary/15 text-primary' :
                    i === 1 ? 'bg-neutral-800 text-white' :
                    i === 2 ? 'bg-neutral-800 text-neutral-300' :
                    'bg-neutral-800/50 text-neutral-500',
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-mono text-neutral-400 truncate">{short(dep.depositor, 6, 4)}</p>
                    <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                      {dep.escrows} escrow{dep.escrows !== 1 ? 's' : ''} · {dep.agentCount} agent{dep.agentCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-semibold tabular-nums text-foreground/80">{fmtUsdc(dep.totalSpent)}</p>
                    <p className="text-[9px] text-muted-foreground/40 tabular-nums">{fmtNum(dep.totalCalls)} calls</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ExplorerSection>

        {/* Top Tools */}
        <ExplorerSection
          title="Top Tools"
          icon={<Wrench className="h-4 w-4" />}
          count={totalTools}
          actions={<SectionLink href="/tools" label="All" />}
          compact
          className="h-full"
        >
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
          ) : toolList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Wrench className="h-6 w-6 mb-2" />
              <p className="text-xs">No tools registered</p>
            </div>
          ) : (
            <div className="space-y-1">
              {toolList.slice(0, 5).map((tool, i) => (
                <Link
                  key={`${tool.pda}-${i}`}
                  href={`/tools/${tool.pda}`}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-neutral-800/50 transition-all group"
                >
                  <div className="relative shrink-0">
                    <StatusBadge active={tool.isActive} size="xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate group-hover:text-primary transition-colors">{tool.name}</p>
                    <CategoryBadge category={tool.category} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold tabular-nums">{tool.invocations.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground/40">calls</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ExplorerSection>
      </div>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════
         ROW 3 — Network Composition
         ═══════════════════════════════════════════════════════════ */}
      <ExplorerSection
        title="Network Composition"
        icon={<Network className="h-4 w-4" />}
        dataSource="onchain"
        actions={<SectionLink href="/network" label="Graph" />}
        compact
      >
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
            {[
              { label: 'Agents',       value: totalAgents,       icon: Bot,         glow: 'primary' as const, accent: 'text-primary' },
              { label: 'Tools',        value: totalTools,        icon: Wrench,      glow: 'cyan' as const,    accent: 'text-white' },
              { label: 'Protocols',    value: totalProtocols,    icon: Layers,      glow: 'emerald' as const, accent: 'text-white' },
              { label: 'Capabilities', value: totalCapabilities, icon: Zap,         glow: undefined,          accent: 'text-neutral-400' },
              { label: 'Attestations', value: totalAttestations, icon: ShieldCheck, glow: undefined,          accent: 'text-neutral-400' },
              { label: 'Vaults',       value: totalVaults,       icon: Server,      glow: undefined,          accent: 'text-neutral-400' },
            ].map(({ label, value, icon: Icon, glow, accent }) => (
              <ArenaCard key={label} glow={glow} className="text-center py-4">
                <Icon className={cn('h-5 w-5 mx-auto mb-2', accent)} />
                <p className="text-xl font-bold tabular-nums text-foreground">{fmtNum(value)}</p>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">{label}</p>
              </ArenaCard>
            ))}
          </div>
        )}
      </ExplorerSection>

      {/* ═══════════════════════════════════════════════════════════
         ROW 4 — Explore Quick Links
         ═══════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-neutral-800" />
          <Badge variant="hud" className="text-[9px]">EXPLORE</Badge>
          <div className="h-px flex-1 bg-neutral-800" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 stagger-children">
          {[
            { href: '/agents',       label: 'Agents',       icon: Bot },
            { href: '/network',      label: 'Network',      icon: Network },
            { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
            { href: '/tools',        label: 'Tools',        icon: Wrench },
            { href: '/protocols',    label: 'Protocols',    icon: Layers },
            { href: '/escrows',      label: 'Escrows',      icon: Wallet },
            { href: '/attestations', label: 'Attestations', icon: ShieldCheck },
            { href: '/capabilities', label: 'Capabilities', icon: Zap },
            { href: '/agents',       label: 'Program',      icon: Cpu },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={label} href={href}>
              <div className={cn(
                'group flex flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-4',
                'transition-all duration-300 hover:bg-neutral-800 hover:border-neutral-700',
              )}>
                <Icon className="h-4 w-4 text-neutral-500 group-hover:text-primary transition-colors duration-300" />
                <span className="text-[10px] font-semibold text-neutral-500 group-hover:text-white transition-colors">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </ExplorerPageShell>
  );
}
