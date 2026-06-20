/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  Bot, Network, ArrowLeftRight, Wrench, Layers,
  Wallet, ShieldCheck, Trophy, ArrowRight, Server, TrendingUp,
  Activity, CircleDot, Zap, Coins, Radio, Users, Cpu, BarChart3,
  BotIcon, Copy, Check, Store,
} from 'lucide-react';
import {
  Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, PieChart, Pie,
} from 'recharts';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '~/components/ui/badge';
import { AgentAvatar } from '~/components/ui/agent-avatar';
import {
  ExplorerPageShell,
  ExplorerMetric,
  ExplorerSection,
  ExplorerLiveDot,
  SectionDivider,
  VolumeMetricCard,
} from '~/components/ui';
import { ArenaCard, ProtocolStats } from '~/components/ui/explorer-primitives';
import {
  ScoreRing,
  CategoryBadge,
  StatusBadge,
} from '~/components/ui';
import { SearchCommand } from '~/components/search-command';
import { ChartAreaGradient, ChartVolumeComposition } from '~/components/ui/dashboard-charts';
import {
  useOverview,
  useEnrichedAgents,
  useSapActivity,
} from '~/hooks/use-sap';
import { asText, entityPath, short, timeAgo, fmtNum, enumKey, cap } from '~/lib/format';
import { ESCROW_EVENT_LABELS } from '~/lib/constants';
import { cn } from '~/lib/utils';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

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
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '11px',
  boxShadow: 'var(--shadow-md)',
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/* ─── Custom Animations ────────────────────────────────────────── */
const scanAnimation = `
  @keyframes scan {
    0%, 100% { transform: translateY(-100%); }
    50% { transform: translateY(100%); }
  }
`;

/* ─── Reusable mini components ───────────────────────────────────── */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary group/link">
      {label} <ArrowRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
    </Link>
  );
}

function MiniProgressBar({
  value,
  max,
  color,
  className,
  indicatorStyle,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
  indicatorStyle?: CSSProperties;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted/20 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-1000 ease-out motion-reduce:transition-none', color)}
        style={{ width: `${Math.min(pct, 100)}%`, ...indicatorStyle }}
      />
    </div>
  );
}

function lamportsToSol(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value / LAMPORTS_PER_SOL : 0;
}

function formatNumber(value: number, maxFractionDigits: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function fmtSol(rawLamports: unknown): string {
  const sol = lamportsToSol(rawLamports);
  if (sol >= 1_000) return `${formatNumber(sol / 1_000, 2)}K SOL`;
  if (sol >= 100) return `${formatNumber(sol, 2)} SOL`;
  if (sol >= 1) return `${formatNumber(sol, 4)} SOL`;
  if (sol >= 0.01) return `${formatNumber(sol, 4)} SOL`;
  if (sol >= 0.0001) return `${formatNumber(sol, 6)} SOL`;
  if (sol > 0) return `${formatNumber(sol, 8)} SOL`;
  return '0 SOL';
}

function fmtUsd(value: number): string {
  const abs = Math.abs(value);
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    maximumFractionDigits: abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6,
  })}`;
}

function inferTokenDecimals(mint: string | null, declaredDecimals: unknown): number {
  if (!mint || mint === SOL_MINT) return 9;
  if (mint === USDC_MINT) return 6;
  const declared = Number(declaredDecimals);
  if (Number.isInteger(declared) && declared >= 0 && declared <= 18) return declared;
  return 9;
}

function tokenSymbol(mint: string | null, decimals: number): string {
  if (!mint || mint === SOL_MINT) return 'SOL';
  if (mint === USDC_MINT || decimals === 6) return 'USDC';
  return short(mint, 4, 4);
}

function compactTokenValue(raw: number, decimals: number, symbol: string): string {
  const value = raw / 10 ** decimals;
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)}M ${symbol}`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 2)}K ${symbol}`;
  if (value >= 100) return `${formatNumber(value, 2)} ${symbol}`;
  if (value >= 1) return `${formatNumber(value, 4)} ${symbol}`;
  if (value > 0) return `${value.toFixed(Math.min(decimals, 6)).replace(/0+$/, '').replace(/\.$/, '')} ${symbol}`;
  return `0 ${symbol}`;
}

function formatTokenTotals(map: Map<string, { raw: number; decimals: number; symbol: string }>): string {
  const rows = Array.from(map.values())
    .filter((row) => row.raw > 0)
    .sort((a, b) => b.raw / 10 ** b.decimals - a.raw / 10 ** a.decimals);
  if (rows.length === 0) return '0';
  return rows.slice(0, 2).map((row) => compactTokenValue(row.raw, row.decimals, row.symbol)).join(' + ');
}

function addEscrowTokenTotal(
  map: Map<string, { raw: number; decimals: number; symbol: string }>,
  escrow: { tokenMint?: unknown; tokenDecimals?: unknown },
  raw: unknown,
) {
  const tokenMint = asText(escrow.tokenMint) || null;
  const decimals = inferTokenDecimals(tokenMint, escrow.tokenDecimals);
  const symbol = tokenSymbol(tokenMint, decimals);
  const key = `${tokenMint ?? SOL_MINT}:${decimals}:${symbol}`;
  const prev = map.get(key) ?? { raw: 0, decimals, symbol };
  const amount = Number(raw ?? 0);
  prev.raw += Number.isFinite(amount) ? amount : 0;
  map.set(key, prev);
}

function tokenTotalsUsdLike(
  map: Map<string, { raw: number; decimals: number; symbol: string }>,
  solPrice: number | null,
): number {
  let total = 0;
  for (const row of map.values()) {
    const amount = row.raw / 10 ** row.decimals;
    if (row.symbol === 'USDC') total += amount;
    else if (row.symbol === 'SOL') total += solPrice ? amount * solPrice : amount;
    else total += amount;
  }
  return total;
}

function fmtUsdApprox(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '~$0';
  return `~$${value.toLocaleString('en-US', {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024), 2)} MB`;
  if (bytes >= 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
  return `${formatNumber(bytes, 0)} B`;
}

function formatEventTokenAmount(
  rawAmount: unknown,
  meta: { mint: string | null; decimals: number; symbol: string } | undefined,
): string | null {
  const amount = Number(rawAmount ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const decimals = meta?.decimals ?? 6;
  const symbol = meta?.symbol ?? 'USDC';
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${compactTokenValue(Math.abs(amount), decimals, symbol)}`;
}

function utcDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildActivityChart(
  daily: Array<{ day: string; totalLamports: string | number }>,
  fallbackLamports: number,
) {
  const days = 14;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const byDay = new Map<string, number>();
  for (const point of daily) {
    const parsed = new Date(point.day);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = utcDayKey(parsed);
    byDay.set(key, (byDay.get(key) ?? 0) + lamportsToSol(point.totalLamports));
  }

  const chart = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const day = utcDayKey(date);
    return { day, volume: byDay.get(day) ?? 0 };
  });

  const hasDailyVolume = chart.some((point) => point.volume > 0);
  if (!hasDailyVolume && fallbackLamports > 0) {
    chart[chart.length - 1] = {
      ...chart[chart.length - 1],
      volume: lamportsToSol(fallbackLamports),
    };
  }
  return chart;
}

function AgentActivityRail({
  agents,
  solPrice,
}: {
  agents: Array<{
    pda: string;
    wallet: string;
    name: string;
    description: string;
    endpoint: string | null;
    logo: string | null;
    mplImage: string | null;
    onMetaplex?: boolean;
    volumeLamports: number;
    calls: number;
    tools: number;
    daily: Array<{ day: string; totalLamports: string | number }>;
  }>;
  solPrice: number | null;
}) {
  if (agents.length === 0) {
    return (
      <ExplorerSection title="Agent Activity" icon={<Store className="h-4 w-4" />} dataSource="onchain" compact>
        <div className="flex items-center justify-center rounded-lg border border-dashed bg-background py-10 text-sm text-muted-foreground">
          No agent settlement activity has been indexed yet.
        </div>
      </ExplorerSection>
    );
  }

  const loop = agents.length > 3 ? [...agents, ...agents] : agents;

  return (
    <ExplorerSection
      title="Agent Activity"
      icon={<Store className="h-4 w-4" />}
      dataSource="onchain"
      actions={<SectionLink href="/agents?sort=activity" label="Directory" />}
      compact
      noPadding
    >
      <div className="activity-rail overflow-hidden px-4 pb-4 pt-3">
        <div className="activity-rail-track flex gap-3">
          {loop.map((agent, idx) => {
            const href = entityPath('/agents', agent.wallet || agent.pda);
            const sol = lamportsToSol(agent.volumeLamports);
            const usd = solPrice ? sol * solPrice : null;
            const chart = buildActivityChart(agent.daily, agent.volumeLamports);
            const hasVolume = chart.some((point) => point.volume > 0);

            return (
              <Link
                key={`${agent.pda}-${idx}`}
                href={href}
                className="group flex min-h-[184px] w-[320px] shrink-0 flex-col rounded-xl border bg-background p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar
                    name={agent.name}
                    endpoint={agent.endpoint}
                    logo={agent.logo}
                    mplImage={agent.mplImage}
                    size={44}
                    showMetaplexBadge={!!agent.onMetaplex}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{agent.name}</p>
                      {agent.tools > 0 && (
                        <Badge variant="secondary" className="h-5 shrink-0 font-mono text-[10px]">
                          {agent.tools} tools
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {agent.description || short(agent.wallet || agent.pda, 8, 6)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Volume</p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{fmtSol(agent.volumeLamports)}</p>
	                    <p className="mt-0.5 text-xs text-muted-foreground">
	                      {usd != null
	                        ? `≈ ${fmtUsd(usd)}`
	                        : 'Syncing CoinGecko price'}
	                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground">Calls</p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">{fmtNum(agent.calls)}</p>
                  </div>
                </div>

                <div className="mt-auto pt-3">
                  {hasVolume ? (
                    <ResponsiveContainer width="100%" height={48}>
                      <AreaChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`agentRail-${agent.pda}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="volume"
                          stroke="hsl(var(--primary))"
                          strokeWidth={1.5}
                          fill={`url(#agentRail-${agent.pda}-${idx})`}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
	                  ) : (
	                    <div className="flex h-12 items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground">
	                      No settled volume yet
	                    </div>
	                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </ExplorerSection>
  );
}

function MemoryVaultMini({
  bytes,
  inscriptions,
  sessions,
  activeVaults,
  totalVaults,
  avgBytesPerVault,
}: {
  bytes: number;
  inscriptions: number;
  sessions: number;
  activeVaults: number;
  totalVaults: number;
  avgBytesPerVault: number;
}) {
  const max = Math.max(bytes / 1024, inscriptions, sessions, 1);
  const rows = [
    {
      label: 'Used memory',
      value: bytes / 1024,
      display: fmtBytes(bytes),
      sub: `${fmtBytes(avgBytesPerVault)} avg / vault`,
      color: 'bg-primary',
    },
    {
      label: 'Inscriptions',
      value: inscriptions,
      display: fmtNum(inscriptions),
      sub: 'on-chain memory writes',
      color: 'bg-foreground',
    },
    {
      label: 'Sessions',
      value: sessions,
      display: fmtNum(sessions),
      sub: `${activeVaults}/${totalVaults} vaults active`,
      color: 'bg-muted-foreground',
    },
  ];

  return (
    <div className="flex h-full min-h-[320px] flex-col justify-between gap-4">
      <div className="rounded-xl border bg-background p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">On-chain memory</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-3xl font-semibold tracking-tight text-foreground">{fmtBytes(bytes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{fmtNum(inscriptions)} inscriptions · {fmtNum(sessions)} sessions</p>
          </div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full border bg-card">
            <Server className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{row.label}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{row.sub}</p>
              </div>
              <p className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">{row.display}</p>
            </div>
            <MiniProgressBar value={row.value} max={max} color={row.color} className="mt-3 h-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═════════════════════════════════════════════════════════════════ */
export default function OverviewPage() {
  const { data: overview, loading: overviewLoading } = useOverview();
  const { data: enrichedData } = useEnrichedAgents();
  const { data: activityData } = useSapActivity('network', null, 96);

  
  const metrics       = overview?.metrics ?? null;
  const agentsData    = overview?.agents ?? null;
  const escrowData    = overview?.escrows ?? null;
  const attestationData = overview?.attestations ?? null;
  const feedbackData  = overview?.feedbacks ?? null;
  const vaultData     = overview?.vaults ?? null;
  const toolsData     = overview?.tools ?? null;
  const eventsData    = overview?.escrowEvents ?? null;

  const loading = overviewLoading;
  const solPrice = enrichedData?.solPrice ?? null;

  /* ── Live TX polling ── */
  const [txs, setTxs] = useState<SapTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txTick, setTxTick] = useState(0);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [typingComplete, setTypingComplete] = useState(false);

  const npxSkillCommand = `npx skills add @oobe-protocol-labs/synapse-sap-sdk`;

  const copySnippet = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(npxSkillCommand);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 1200);
    } catch {
      // no-op in case clipboard is blocked
    }
  }, [npxSkillCommand]);

  const copyAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 1200);
    } catch {
      // no-op in case clipboard is blocked
    }
  }, []);

  // Typing animation effect
  useEffect(() => {
    setTypingComplete(false);
    const timer = setTimeout(() => setTypingComplete(true), 800);
    return () => clearTimeout(timer);
  }, []);

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
    const balanceByToken = new Map<string, { raw: number; decimals: number; symbol: string }>();
    const depositedByToken = new Map<string, { raw: number; decimals: number; symbol: string }>();
    const settledByToken = new Map<string, { raw: number; decimals: number; symbol: string }>();
    let settledSolRaw = 0;
    let settledUsdcRaw = 0;
    let balanceSolRaw = 0;
    let balanceUsdcRaw = 0;
    let depositedSolRaw = 0;
    let depositedUsdcRaw = 0;
    for (const escrow of e) {
      addEscrowTokenTotal(balanceByToken, escrow, escrow.balance);
      addEscrowTokenTotal(depositedByToken, escrow, escrow.totalDeposited);
      addEscrowTokenTotal(settledByToken, escrow, escrow.totalSettled);
      const tokenMint = asText(escrow.tokenMint) || null;
      const decimals = inferTokenDecimals(tokenMint, escrow.tokenDecimals);
      const symbol = tokenSymbol(tokenMint, decimals);
      const settled = Number(escrow.totalSettled ?? 0);
      const balance = Number(escrow.balance ?? 0);
      const deposited = Number(escrow.totalDeposited ?? 0);
      if (symbol === 'SOL') {
        settledSolRaw += Number.isFinite(settled) ? settled : 0;
        balanceSolRaw += Number.isFinite(balance) ? balance : 0;
        depositedSolRaw += Number.isFinite(deposited) ? deposited : 0;
      } else if (symbol === 'USDC') {
        settledUsdcRaw += Number.isFinite(settled) ? settled : 0;
        balanceUsdcRaw += Number.isFinite(balance) ? balance : 0;
        depositedUsdcRaw += Number.isFinite(deposited) ? deposited : 0;
      }
    }
    const depositedValue = tokenTotalsUsdLike(depositedByToken, solPrice);
    const settledValue = tokenTotalsUsdLike(settledByToken, solPrice);
    const utilization = depositedValue > 0 ? (settledValue / depositedValue) * 100 : 0;
    return {
      totalBalance,
      totalDeposited,
      totalSettled,
      totalCalls,
      active,
      utilization,
      total: e.length,
      totalBalanceDisplay: formatTokenTotals(balanceByToken),
      totalDepositedDisplay: formatTokenTotals(depositedByToken),
      totalSettledDisplay: formatTokenTotals(settledByToken),
      settledSolRaw,
      settledUsdcRaw,
      balanceSolRaw,
      balanceUsdcRaw,
      depositedSolRaw,
      depositedUsdcRaw,
    };
  }, [escrowData, solPrice]);

  /* ── Agent chart data ── */
  const agentChartData = useMemo(() => {
    const topRevenue = metrics?.topAgentsByRevenue ?? [];
    if (!topRevenue.length) return [];
    const nameMap = new Map<string, string>();
    if (agentsData?.agents) {
      for (const a of agentsData.agents) {
        if (a.identity?.name) nameMap.set(asText(a.pda), a.identity.name);
      }
    }
    return topRevenue
      .filter(r => Number(r.totalSettled) > 0)
      .map(r => {
        const agentPda = asText(r.agentPda);
        const fullName = nameMap.get(agentPda) ?? short(agentPda, 6, 4);
        return {
          fullName,
          name: fullName.length > 14 ? fullName.slice(0, 12) + '..' : fullName,
          pda: agentPda,
          calls: Number(r.totalCalls ?? 0),
          settled: Number(r.totalSettled ?? 0),
        };
      })
      .sort((a, b) => b.settled - a.settled)
      .slice(0, 10);
  }, [metrics, agentsData]);

  const agentIdentityMap = useMemo(() => {
    const map = new Map<string, { name: string; wallet: string; pda: string; logo: string | null; endpoint: string | null; mplImage: string | null; onMetaplex?: boolean }>();
    for (const agent of enrichedData?.agents ?? []) {
      const id = agent.agent.identity;
      const pda = asText(agent.agent.pda);
      const wallet = asText(id?.wallet);
      const name = id?.name || short(wallet || pda, 8, 6);
      const value = {
        name,
        wallet,
        pda,
        logo: agent.logos?.wellKnownLogo ?? agent.wellKnown?.logo ?? null,
        endpoint: id?.x402Endpoint ?? null,
        mplImage: agent.logos?.mplImage ?? null,
        onMetaplex: !!(agent as { metaplex?: { linked?: boolean; pluginCount?: number; registryCount?: number } | null }).metaplex && (
          !!(agent as { metaplex?: { linked?: boolean } | null }).metaplex?.linked ||
          Number((agent as { metaplex?: { pluginCount?: number } | null }).metaplex?.pluginCount ?? 0) > 0 ||
          Number((agent as { metaplex?: { registryCount?: number } | null }).metaplex?.registryCount ?? 0) > 0
        ),
      };
      if (wallet) map.set(wallet, value);
      if (pda) map.set(pda, value);
    }
    for (const agent of agentsData?.agents ?? []) {
      const pda = asText(agent.pda);
      const wallet = asText(agent.identity?.wallet);
      const name = agent.identity?.name || short(wallet || pda, 8, 6);
      const value = { name, wallet, pda, logo: null, endpoint: agent.identity?.x402Endpoint ?? null, mplImage: null };
      if (wallet && !map.has(wallet)) map.set(wallet, value);
      if (pda && !map.has(pda)) map.set(pda, value);
    }
    return map;
  }, [agentsData?.agents, enrichedData?.agents]);

  const escrowTokenMeta = useMemo(() => {
    const map = new Map<string, { mint: string | null; decimals: number; symbol: string }>();
    for (const escrow of escrowData?.escrows ?? []) {
      const pda = asText(escrow.pda);
      if (!pda) continue;
      const mint = asText(escrow.tokenMint) || null;
      const decimals = inferTokenDecimals(mint, escrow.tokenDecimals);
      map.set(pda, {
        mint,
        decimals,
        symbol: tokenSymbol(mint, decimals),
      });
    }
    return map;
  }, [escrowData?.escrows]);

  /* ── Top depositors ── */
  const topDepositors = useMemo(() => {
    if (!escrowData?.escrows) return [];
    const map = new Map<string, {
      depositor: string;
      totalCalls: number;
      escrows: number;
      agents: Set<string>;
      settledByToken: Map<string, { raw: number; decimals: number; symbol: string }>;
      depositedByToken: Map<string, { raw: number; decimals: number; symbol: string }>;
    }>();
    for (const e of escrowData.escrows) {
      const dep = asText(e.depositor);
      if (!dep) continue;
      const prev = map.get(dep) ?? {
        depositor: dep,
        totalCalls: 0,
        escrows: 0,
        agents: new Set<string>(),
        settledByToken: new Map<string, { raw: number; decimals: number; symbol: string }>(),
        depositedByToken: new Map<string, { raw: number; decimals: number; symbol: string }>(),
      };
      addEscrowTokenTotal(prev.settledByToken, e, e.totalSettled);
      addEscrowTokenTotal(prev.depositedByToken, e, e.totalDeposited);
      prev.totalCalls += Number(e.totalCallsSettled ?? 0);
      prev.escrows += 1;
      const agent = asText(e.agent);
      if (agent) prev.agents.add(agent);
      map.set(dep, prev);
    }
    return Array.from(map.values())
      .map(d => ({
        ...d,
        agentCount: d.agents.size,
        totalSpentDisplay: formatTokenTotals(d.settledByToken),
        totalDepositedDisplay: formatTokenTotals(d.depositedByToken),
        rankValue: tokenTotalsUsdLike(d.settledByToken, solPrice) || tokenTotalsUsdLike(d.depositedByToken, solPrice),
      }))
      .sort((a, b) => b.rankValue - a.rankValue)
      .slice(0, 5);
  }, [escrowData, solPrice]);

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
    const indexed = eventsData?.events ?? [];
    if (indexed.length > 0) return indexed.slice(0, 6);
    const fallback = (escrowData?.escrows ?? []).flatMap((escrow) => {
      const escrowPda = asText(escrow.pda);
      const base = {
        id: 0,
        escrowPda,
        txSignature: '',
        slot: 0,
        signer: null,
        balanceBefore: null,
        balanceAfter: null,
        agentPda: asText(escrow.agent) || null,
        depositor: asText(escrow.depositor) || null,
        indexedAt: new Date().toISOString(),
      };
      const rows: Array<typeof base & {
        eventType: string;
        blockTime: string | null;
        amountChanged: string | null;
        callsSettled: string | null;
      }> = [];
      const settled = Number(escrow.totalSettled ?? 0);
      const calls = Number(escrow.totalCallsSettled ?? 0);
      const lastSettledAt = asText(escrow.lastSettledAt);
      if ((settled > 0 || calls > 0) && lastSettledAt && lastSettledAt !== '0') {
        rows.push({
          ...base,
          eventType: 'settle_calls',
          blockTime: lastSettledAt,
          amountChanged: String(escrow.totalSettled ?? '0'),
          callsSettled: String(escrow.totalCallsSettled ?? '0'),
        });
      }
      const deposited = Number(escrow.totalDeposited ?? 0);
      const createdAt = asText(escrow.createdAt);
      if (deposited > 0 && createdAt && createdAt !== '0') {
        rows.push({
          ...base,
          eventType: 'deposit_escrow',
          blockTime: createdAt,
          amountChanged: String(escrow.totalDeposited ?? '0'),
          callsSettled: null,
        });
      }
      const closedAt = asText(escrow.closedAt);
      if (escrow.status === 'closed' && closedAt && closedAt !== '0') {
        rows.push({
          ...base,
          eventType: 'close_escrow',
          blockTime: closedAt,
          amountChanged: String(escrow.balance ?? '0'),
          callsSettled: null,
        });
      }
      return rows;
    });
    return fallback
      .sort((a, b) => new Date(b.blockTime ?? 0).getTime() - new Date(a.blockTime ?? 0).getTime())
      .slice(0, 6);
  }, [eventsData?.events, escrowData?.escrows]);

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
    const data = [
      { name: 'Active',   value: escrowStatusDist.active,   fill: 'hsl(var(--primary))' },
      { name: 'Depleted', value: escrowStatusDist.depleted, fill: 'hsl(var(--destructive))' },
      { name: 'Expired',  value: escrowStatusDist.expired,  fill: 'hsl(var(--chart-4))' },
      { name: 'Closed',   value: escrowStatusDist.closed,   fill: 'hsl(var(--muted-foreground))' },
    ];
    
    // If all values are 0 but we have escrows, show all as active
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0 && escrowData?.total && escrowData.total > 0) {
      return [{ name: 'Active', value: escrowData.total, fill: 'hsl(var(--primary))' }];
    }
    
    return data.filter(d => d.value > 0);
  }, [escrowStatusDist, escrowData?.total]);

  /* ── Tool list ── */
  const toolList = useMemo(() => {
    if (!toolsData?.tools) return [];
    return toolsData.tools
      .filter(t => t.descriptor)
      .map(t => ({
        pda:         asText(t.pda),
        name:        t.descriptor!.toolName as string,
        category:    cap(enumKey(t.descriptor!.category)),
        invocations: Number(t.descriptor!.totalInvocations ?? 0),
        isActive:    t.descriptor!.isActive as boolean,
      }))
      .sort((a, b) => b.invocations - a.invocations);
  }, [toolsData]);

  const topTools = useMemo(() => {
    if (toolList.length > 0) {
      return toolList.slice(0, 5).map((tool) => ({
        ...tool,
        metric: tool.invocations,
        metricLabel: 'invocations',
      }));
    }
    if (!escrowData?.escrows) return [];
    const toolMap = new Map<string, { name: string; metric: number; metricLabel: string; category: string; isActive: boolean; pda: string }>();
    for (const escrow of escrowData.escrows) {
      const metadata = (escrow.metadata ?? {}) as { toolName?: string; category?: string; tool?: { name?: string } };
      const escrowExtra = escrow as typeof escrow & { toolPda?: unknown; tool?: unknown };
      const callsSettled = Number(escrow.totalCallsSettled ?? 0);
      if (callsSettled <= 0) continue;
      const toolName = metadata.toolName || metadata.tool?.name || `Tool for ${short(asText(escrow.agent), 6, 4)}`;
      const category = metadata.category || 'Custom';
      const existing = toolMap.get(toolName) ?? {
        name: toolName,
        metric: 0,
        metricLabel: 'settled calls',
        category,
        isActive: true,
        pda: asText(escrowExtra.toolPda ?? escrowExtra.tool ?? escrow.agent),
      };
      existing.metric += callsSettled;
      toolMap.set(toolName, existing);
    }
    return Array.from(toolMap.values()).sort((a, b) => b.metric - a.metric).slice(0, 5);
  }, [escrowData?.escrows, toolList]);

  const agentActivityCards = useMemo(() => {
    const agents = enrichedData?.agents ?? [];
    return agents
      .map((agent) => {
        const id = agent.agent.identity;
        const pda = asText(agent.agent.pda);
        const wallet = asText(id?.wallet);
        const volumeLamports = Math.max(
          Number(agent.revenue?.volume24hLamports ?? 0),
          Number(agent.revenue?.volume7dLamports ?? 0),
          Number(agent.revenue?.totalSettledLamports ?? 0),
        );
        const calls = Math.max(
          Number(agent.revenue?.calls24h ?? 0),
          Number(agent.revenue?.calls7d ?? 0),
          Number(agent.revenue?.totalCalls ?? 0),
        );
        return {
          pda,
          wallet,
          name: id?.name || short(wallet || pda, 8, 6),
          description: agent.wellKnown?.description || id?.description || '',
          endpoint: id?.x402Endpoint ?? null,
          logo: agent.logos?.wellKnownLogo ?? agent.wellKnown?.logo ?? null,
          mplImage: agent.logos?.mplImage ?? null,
          onMetaplex: !!agent.metaplex && (
            !!agent.metaplex.linked ||
            Number(agent.metaplex.pluginCount ?? 0) > 0 ||
            Number(agent.metaplex.registryCount ?? 0) > 0
          ),
          volumeLamports,
          calls,
          tools: (agent as { onChainToolCount?: number }).onChainToolCount ?? agent.metadata?.tools?.length ?? 0,
          daily: agent.revenue?.daily ?? [],
        };
      })
      .filter((agent) => agent.pda || agent.wallet)
      .sort((a, b) => (b.volumeLamports - a.volumeLamports) || (b.calls - a.calls) || (b.tools - a.tools))
      .slice(0, 10);
  }, [enrichedData?.agents]);

  /* ── Top Tools by Settlements (calls settled) ── */
  const topToolsBySettlements = useMemo(() => {
    if (!escrowData?.escrows) return [];
    
    // Aggregate calls settled by tool name from escrow events
    const toolMap = new Map<string, { name: string; callsSettled: number; category: string; isActive: boolean; pda: string }>();
    
    for (const escrow of escrowData.escrows) {
      const callsSettled = Number(escrow.totalCallsSettled ?? 0);
      if (callsSettled <= 0) continue;
      
      // Extract tool name from escrow metadata or use agent as fallback
      const toolName = escrow.metadata?.toolName || `Tool-${asText(escrow.agent).slice(0, 8)}`;
      const category = escrow.metadata?.category || 'Custom';
      
      const existing = toolMap.get(toolName) ?? {
        name: toolName,
        callsSettled: 0,
        category,
        isActive: true,
        pda: asText(escrow.agent),
      };
      
      existing.callsSettled += callsSettled;
      toolMap.set(toolName, existing);
    }
    
    return Array.from(toolMap.values())
      .sort((a, b) => b.callsSettled - a.callsSettled)
      .slice(0, 5);
  }, [escrowData?.escrows]);

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

  const networkActivityData = useMemo(() => {
    const points = activityData?.points ?? [];
    return points
      .map((point) => {
        const date = new Date(point.capturedAt);
        return {
          label: Number.isNaN(date.getTime())
            ? point.capturedAt
            : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          agents: Number(point.activeAgents ?? point.agents ?? 0),
          tools: Number(point.tools ?? 0),
          txs: Number(point.transactions ?? 0),
        };
      })
      .filter((point) => point.agents > 0 || point.tools > 0 || point.txs > 0)
      .slice(-48);
  }, [activityData?.points]);

  const activitySparkData = useMemo(() => {
    if (networkActivityData.length > 1) {
      return networkActivityData.map((point) => ({
        day: point.label,
        count: point.txs,
      }));
    }
    return sparkData;
  }, [networkActivityData, sparkData]);

  /* ── Total SOL staked across agent wallets ── */
  const computedAgentSol = useMemo(() => {
    if (!enrichedData?.agents) return null;
    return enrichedData.agents.reduce((sum, a) => sum + (a.balances?.sol ?? 0), 0);
  }, [enrichedData]);
  const [stableAgentSol, setStableAgentSol] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const cached = Number(window.localStorage.getItem('sap:agent-sol-total') ?? 0);
    return Number.isFinite(cached) && cached > 0 ? cached : null;
  });
  useEffect(() => {
    if (computedAgentSol !== null && computedAgentSol > 0) {
      setStableAgentSol(computedAgentSol);
      window.localStorage.setItem('sap:agent-sol-total', String(computedAgentSol));
    }
  }, [computedAgentSol]);
  const totalAgentSol = computedAgentSol !== null && computedAgentSol > 0 ? computedAgentSol : stableAgentSol;

  /* ── Utilization score (0–10000) ── */
  const utilizationScore = escrowStats ? Math.round(escrowStats.utilization * 100) : 0;

  const volumeUsdDisplay = escrowStats && solPrice
    ? fmtUsdApprox(lamportsToSol(escrowStats.settledSolRaw) * solPrice + Number(escrowStats.settledUsdcRaw) / 1e6)
    : null;

  const volumeBreakdownData = useMemo(() => {
    if (!escrowStats) return [];
    const toUsdLike = (solRaw: number, usdcRaw: number) => {
      const solValue = lamportsToSol(solRaw);
      const usdcValue = usdcRaw / 1e6;
      return solPrice ? solValue * solPrice + usdcValue : solValue + usdcValue;
    };

    return [
      {
        name: 'Deposited',
        value: toUsdLike(escrowStats.depositedSolRaw, escrowStats.depositedUsdcRaw),
        display: escrowStats.totalDepositedDisplay,
        fill: 'hsl(var(--chart-1))',
      },
      {
        name: 'Settled',
        value: toUsdLike(escrowStats.settledSolRaw, escrowStats.settledUsdcRaw),
        display: escrowStats.totalSettledDisplay,
        fill: 'hsl(var(--chart-2))',
      },
      {
        name: 'Locked',
        value: toUsdLike(escrowStats.balanceSolRaw, escrowStats.balanceUsdcRaw),
        display: escrowStats.totalBalanceDisplay,
        fill: 'hsl(var(--chart-3))',
      },
    ];
  }, [escrowStats, solPrice]);

  const vaultMemoryStats = useMemo(() => {
    const vaults = vaultData?.vaults ?? [];
    const totals = vaults.reduce(
      (acc, vault) => {
        const extra = vault as typeof vault & {
          totalBytesInscribed?: string | number;
          totalInscriptions?: string | number;
          totalSessions?: string | number;
          sessionsSummary?: Array<unknown>;
        };
        const sessions = Number(extra.totalSessions ?? extra.sessionsSummary?.length ?? 0);
        const inscriptions = Number(extra.totalInscriptions ?? 0);
        const bytes = Number(extra.totalBytesInscribed ?? 0);
        acc.bytes += Number.isFinite(bytes) ? bytes : 0;
        acc.inscriptions += Number.isFinite(inscriptions) ? inscriptions : 0;
        acc.sessions += Number.isFinite(sessions) ? sessions : 0;
        if (bytes > 0 || inscriptions > 0 || sessions > 0) acc.activeVaults += 1;
        return acc;
      },
      { bytes: 0, inscriptions: 0, sessions: 0, activeVaults: 0 },
    );
    const max = Math.max(totals.bytes / 1024, totals.inscriptions, totals.sessions, 1);
    const avgBytesPerVault = vaults.length > 0 ? totals.bytes / vaults.length : 0;
    return {
      ...totals,
      avgBytesPerVault,
      chart: [
        {
          name: 'Memory',
          value: totals.bytes / 1024,
          display: fmtBytes(totals.bytes),
          fill: 'hsl(var(--chart-1))',
        },
        {
          name: 'Writes',
          value: totals.inscriptions,
          display: `${fmtNum(totals.inscriptions)} inscriptions`,
          fill: 'hsl(var(--chart-2))',
        },
        {
          name: 'Sessions',
          value: totals.sessions,
          display: `${fmtNum(totals.sessions)} sessions`,
          fill: 'hsl(var(--chart-3))',
        },
      ].map((item) => ({
        ...item,
        detail: item.name === 'Memory'
          ? `${fmtBytes(avgBytesPerVault)} avg per vault`
          : item.name === 'Writes'
            ? 'On-chain memory inscriptions'
            : `${totals.activeVaults} active vaults`,
        value: max > 0 ? item.value : 0,
      })),
    };
  }, [vaultData?.vaults]);

  const settledRevenueChart = useMemo(() => {
    const top = agentChartData.slice(0, 10);
    if (top.length === 0) {
      return { data: [] as Array<Record<string, string | number>>, series: [] as Array<{ key: string; label: string; color: string }>, legend: [] as Array<{ label: string; href: string; value: string; color: string }> };
    }

    const enrichedById = new Map<string, { daily: Array<{ day: string; totalLamports: string | number }> }>();
    for (const agent of enrichedData?.agents ?? []) {
      const pda = asText(agent.agent.pda);
      const wallet = asText(agent.agent.identity?.wallet);
      const daily = Array.isArray(agent.revenue?.daily) ? agent.revenue.daily : [];
      if (pda) enrichedById.set(pda, { daily });
      if (wallet) enrichedById.set(wallet, { daily });
    }

    const dayKeys = new Set<string>();
    const valuesByAgent = new Map<string, Map<string, number>>();

    top.forEach((agent, index) => {
      const key = `agent_${index}`;
      const daily = enrichedById.get(agent.pda)?.daily ?? [];
      const values = new Map<string, number>();
      for (const point of daily) {
        const parsed = new Date(point.day);
        if (Number.isNaN(parsed.getTime())) continue;
        const day = utcDayKey(parsed);
        const value = lamportsToSol(point.totalLamports);
        if (value <= 0) continue;
        values.set(day, (values.get(day) ?? 0) + value);
        dayKeys.add(day);
      }
      valuesByAgent.set(key, values);
    });

    const sortedDays = Array.from(dayKeys).sort().slice(-14);
    const data = sortedDays.length > 0
      ? sortedDays.map((day) => {
          const row: Record<string, string | number> = {
            day: new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          };
          top.forEach((_, index) => {
            const key = `agent_${index}`;
            row[key] = valuesByAgent.get(key)?.get(day) ?? 0;
          });
          return row;
        })
      : [
          top.reduce<Record<string, string | number>>((row, agent, index) => {
            row[`agent_${index}`] = agent.settled / LAMPORTS_PER_SOL;
            return row;
          }, { day: 'Indexed total' }),
        ];

    return {
      data,
      series: top.map((agent, index) => ({
        key: `agent_${index}`,
        label: agent.fullName,
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
      legend: top.map((agent, index) => ({
        label: agent.fullName,
        href: entityPath('/agents', agent.pda),
        value: `${fmtNum(agent.calls)} calls`,
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
    };
  }, [agentChartData, enrichedData?.agents]);

  return (
    <ExplorerPageShell
      title="Dashboard"
      subtitle="Real-time on-chain intelligence for the Synapse Agent Protocol"
      icon={<Activity className="h-5 w-5" />}
      badge={
        <div className="flex items-center gap-2">
          <ExplorerLiveDot connected />
          <Badge variant="hud" className="text-xs">MAINNET</Badge>
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
          <VolumeMetricCard
            icon={<TrendingUp className="h-4 w-4" />}
            value={escrowStats ? escrowStats.totalSettledDisplay : null}
            fiatValue={volumeUsdDisplay}
            calls={escrowStats ? fmtNum(escrowStats.totalCalls) : null}
            utilization={escrowStats?.utilization ?? null}
            loading={loading}
          />
          <ExplorerMetric
            icon={<Wallet className="h-4 w-4" />}
            label="Escrows"
            value={loading ? '—' : fmtNum(escrowData?.total ?? 0)}
            sub={`${escrowStats?.active ?? 0} active · ${escrowStats?.totalBalanceDisplay ?? '0'} locked`}
            accent="amber"
          />
        </>
      }
    >
      <style>{scanAnimation}</style>

      <SectionDivider />

      <AgentActivityRail agents={agentActivityCards} solPrice={solPrice} />

      <SectionDivider />

      <ArenaCard glow="primary" className="border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="h-4 w-4 text-amber-500 dark:text-amber-300" />
              <h2 className="text-sm font-semibold text-balance text-foreground">Initialize your agent context with Synapse skills</h2>
            </div>
            <p className="max-w-3xl text-xs text-pretty text-muted-foreground">
              Install the official Synapse SAP SDK skills package using the skills CLI. This loads all skill definitions from the SDK into your agent context.
            </p>
          </div>

          <Link
            href="https://synapse.oobeprotocol.ai/skills.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:min-w-[220px] md:min-w-[260px]"
          >
            Open skills.md
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {/* Terminal Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="ml-2 text-xs font-medium text-muted-foreground">bash — skills install</span>
            </div>
            <button
              type="button"
              onClick={copySnippet}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-border/60 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Copy command"
              title="Copy to clipboard"
            >
              {copiedSnippet ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Terminal Body */}
          <div className="relative overflow-hidden">
            <div className="min-h-[140px] overflow-x-auto p-4 font-mono text-xs leading-relaxed">
              <div className="space-y-2">
                {/* Prompt line */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-emerald-400">❯</span>
                  <span className="text-cyan-400">~</span>
                  <span className={cn(
                    'transition-opacity duration-300',
                    typingComplete ? 'opacity-100' : 'opacity-0'
                  )}>{npxSkillCommand}</span>
                  <span className={cn(
                    'inline-block h-4 w-2 bg-emerald-400/80 animate-pulse',
                    !typingComplete && 'animate-bounce'
                  )} />
                </div>

                {/* Output lines with staggered animation */}
                <div className={cn(
                  'space-y-1.5 pt-2 text-muted-foreground transition-all duration-500',
                  typingComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                )}>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">◈</span>
                    <span>Installing <span className="text-foreground font-medium">@oobe-protocol-labs/synapse-sap-sdk</span>...</span>
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-emerald-400">✓</span>
                    <span>Resolving dependencies</span>
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-emerald-400">✓</span>
                    <span>Downloading skills package</span>
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-emerald-400">✓</span>
                    <span>Installing to agent contexts</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-emerald-400">◆</span>
                    <span className="text-emerald-400 font-medium">Done! </span>
                    <span>Skills ready for use</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scan line effect */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent animate-[scan_3s_ease-in-out_infinite]" style={{ backgroundSize: '100% 3px' }} />
          </div>
        </div>
      </ArenaCard>

      {/* ═══════════════════════════════════════════════════════════
         ROW 1 — Live Feed (left 3/ 5) + Charts (right 2/5)
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid items-stretch gap-5 lg:grid-cols-5">

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
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">streaming</span>
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
                  const signerAgent = tx.signer ? agentIdentityMap.get(tx.signer) : null;
                  const signerHref = signerAgent
                    ? entityPath('/agents', signerAgent.wallet || signerAgent.pda)
                    : entityPath('/address', tx.signer);
                  return (
                    <div
                      key={tx.signature}
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
                          <Link
                            href={entityPath('/tx', tx.signature)}
                            className="min-w-0 truncate font-mono text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="sm:hidden">{short(tx.signature, 8, 4)}</span>
                            <span className="hidden sm:inline">{short(tx.signature, 32, 8)}</span>
                          </Link>
                          <Link
                            href={entityPath('/tx', tx.signature)}
                            className="hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
                          >
                            <Badge variant="neon" className="h-4 px-1.5 text-xs">
                            {rawAction.length > 16 ? rawAction.slice(0, 14) + '…' : rawAction}
                            </Badge>
                          </Link>
                          {tx.err && <Badge variant="neon-rose" className="text-[8px] h-4 px-1.5 shrink-0">ERR</Badge>}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          {signerAgent ? (
                            <Link
                              href={signerHref}
                              className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              title={tx.signer}
                            >
                              <AgentAvatar
                                name={signerAgent.name}
                                endpoint={signerAgent.endpoint}
                                logo={signerAgent.logo}
                                mplImage={signerAgent.mplImage}
                                size={16}
                                className="rounded-full"
                                showMetaplexBadge={!!signerAgent.onMetaplex}
                              />
                              <span className="truncate">{signerAgent.name}</span>
                            </Link>
                          ) : (
                            <Link
                              href={signerHref}
                              className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/70 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <BotIcon className="h-3 w-3 shrink-0 text-primary/40" />
                              <span className="truncate font-mono">
                                <span className="sm:hidden">{tx.signer ? short(tx.signer, 6, 4) : ''}</span>
                                <span className="hidden sm:inline">{tx.signer ?? ''}</span>
                              </span>
                            </Link>
                          )}
                          {tx.feeSol > 0 && (
                            <>
                              <span className="text-xs text-muted-foreground/20 hidden sm:inline">·</span>
                              <span className="text-xs text-muted-foreground/30 tabular-nums hidden sm:inline whitespace-nowrap">{tx.feeSol.toFixed(6)} SOL</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      <span className="text-xs text-muted-foreground/40 tabular-nums whitespace-nowrap shrink-0 group-hover:text-muted-foreground/60 transition-colors">
                        {tx.blockTime ? timeAgo(tx.blockTime) : '—'}
                      </span>
                    </div>
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
                  const escrowPda = asText(ev.escrowPda);
                  const txSignature = asText(ev.txSignature);
                  const amount = formatEventTokenAmount(ev.amountChanged, escrowTokenMeta.get(escrowPda));
                  const stableKey = Number(ev.id) > 0
                    ? String(ev.id)
                    : `${escrowPda}-${ev.eventType}-${asText(ev.blockTime) || txSignature || i}`;
                  return (
                    <div
                      key={stableKey}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/10 sm:gap-3 sm:px-3"
                    >
                      <CircleDot className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="glass" className={cn('text-xs h-4 px-1.5 shrink-0', meta.color)}>
                            {meta.label}
                          </Badge>
                          {amount && (
                            <span className="truncate font-mono text-xs tabular-nums text-foreground/70">{amount}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                          {escrowPda && (
                            <Link href={entityPath('/escrows', escrowPda)} className="min-w-0 max-w-[13rem] truncate font-mono text-xs text-muted-foreground transition-colors hover:text-primary sm:max-w-[18rem]" title={escrowPda}>
                              <span className="sm:hidden">{short(escrowPda, 6, 4)}</span>
                              <span className="hidden sm:inline">{escrowPda}</span>
                            </Link>
                          )}
                          {txSignature && (
                            <>
                              <span className="text-xs text-muted-foreground/20">·</span>
                              <Link href={entityPath('/tx', txSignature)} className="min-w-0 max-w-[10rem] truncate font-mono text-xs text-muted-foreground/50 transition-colors hover:text-foreground sm:max-w-[16rem]" title={txSignature}>
                                <span className="sm:hidden">{short(txSignature, 6, 4)}</span>
                                <span className="hidden sm:inline">{short(txSignature, 12, 8)}</span>
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground/30 whitespace-nowrap shrink-0">
                        {ev.blockTime ? timeAgo(ev.blockTime) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ExplorerSection>
        </div>

        {/* ── RIGHT: Utilization + Network Pulse ── */}
        <div className="flex h-full flex-col gap-5 lg:col-span-2">
          {/* Utilization Ring */}
          <div className="grid grid-cols-2 gap-4">
            {/* Utilization */}
            <ArenaCard glow="emerald" className="flex flex-col items-center justify-center gap-2 py-5">
              {loading ? (
                <Skeleton className="h-14 w-14 rounded-full" />
              ) : (
                <>
                  <ScoreRing score={utilizationScore} size={56} />
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Utilization</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{escrowStats?.utilization.toFixed(1) ?? '0'}%</p>
                  </div>
                </>
              )}
            </ArenaCard>

            {/* Escrow Donut */}
            <ArenaCard glow="primary" className="flex flex-col items-center justify-center py-3">
              {loading || (!escrowPieData.length && !(escrowData?.total && escrowData.total > 0)) ? (
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
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mt-1">Escrow Status</p>
                  <p className="text-xs tabular-nums text-foreground/80">{escrowData?.total ?? 0} total</p>
                </>
              )}
            </ArenaCard>
          </div>

          {/* Activity Sparkline */}
          {activitySparkData.length > 2 && (
            <ExplorerSection
              title={networkActivityData.length > 1 ? 'Network Activity' : 'Event Activity'}
              icon={<Activity className="h-4 w-4" />}
              compact
            >
              <ResponsiveContainer width="100%" height={64}>
                <AreaChart data={activitySparkData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--glow))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--glow))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--glow))"
                    strokeWidth={1.5}
                    fill="url(#sparkGrad)"
                  />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                </AreaChart>
              </ResponsiveContainer>
            </ExplorerSection>
          )}

          <ExplorerSection
            title="Memory Vaults"
            icon={<Server className="h-4 w-4" />}
            actions={<SectionLink href="/vaults" label="Vaults" />}
            compact
            className="flex flex-1 flex-col [&>div:last-child]:flex [&>div:last-child]:flex-1 [&>div:last-child]:flex-col"
          >
            {loading ? (
              <Skeleton className="h-full min-h-[320px] w-full rounded-lg" />
            ) : (
              <MemoryVaultMini
                bytes={vaultMemoryStats.bytes}
                inscriptions={vaultMemoryStats.inscriptions}
                sessions={vaultMemoryStats.sessions}
                activeVaults={vaultMemoryStats.activeVaults}
                totalVaults={totalVaults}
                avgBytesPerVault={vaultMemoryStats.avgBytesPerVault}
              />
            )}
          </ExplorerSection>
        </div>
      </div>

      <SectionDivider />

      <ExplorerSection
  title="Settled Revenue"
  icon={<Trophy className="h-4 w-4" />}
  actions={<SectionLink href="/agents" label="Agents" />}
  compact
>
  {loading ? (
    <Skeleton className="h-[260px] w-full rounded-lg sm:h-[320px] lg:h-[360px]" />
  ) : settledRevenueChart.data.length === 0 ? (
    <div className="flex min-h-[220px] flex-col items-center justify-center py-10 text-muted-foreground/40 sm:min-h-[300px] sm:py-14">
      <Trophy className="mb-2 h-6 w-6" />
      <p className="text-xs">No revenue data</p>
    </div>
  ) : (
    <ChartAreaGradient
      title="Top 10 settled revenue"
      description="One live indexed revenue curve per top SAP agent"
      data={settledRevenueChart.data}
      xKey="day"
      height={typeof window !== "undefined" && window.innerWidth < 640 ? 260 : 340}
      series={settledRevenueChart.series}
      legendLayout="panel"
      valueFormatter={(value) => {
        const sol = Number(value ?? 0);
        const usd = solPrice ? sol * solPrice : null;
        return usd != null
          ? `${sol.toFixed(4)} SOL · ${fmtUsd(usd)}`
          : `${sol.toFixed(4)} SOL`;
      }}
      legend={settledRevenueChart.legend}
      footer={`${settledRevenueChart.series.length} top agents`}
    />
  )}
</ExplorerSection>

      <ExplorerSection title="Volume Breakdown" icon={<Coins className="h-4 w-4" />} compact>
        {loading || !escrowStats ? (
          <Skeleton className="h-[320px] w-full rounded-lg" />
        ) : (
          <div className="flex flex-col gap-4">
            <ChartVolumeComposition
              title="Escrow value"
              description={solPrice ? 'Normalized by live SOL/USD and USDC units' : 'Normalized by token units while SOL price syncs'}
              data={volumeBreakdownData}
              height={270}
            />
            {totalAgentSol !== null && (
              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">Agent SOL</span>
                  <span className="font-mono text-sm tabular-nums text-foreground">{totalAgentSol.toFixed(4)} SOL</span>
                </div>
                <MiniProgressBar value={totalAgentSol} max={Math.max(totalAgentSol, 1)} color="bg-primary/60" className="mt-2" />
                <p className="mt-2 text-xs text-muted-foreground/60">Total SOL across {enrichedData?.agents?.length ?? 0} agent wallets</p>
              </div>
            )}
          </div>
        )}
      </ExplorerSection>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════
         ROW 2 — Tool Categories + Top Depositors + Top Tools
         ═══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-5">

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
            <ChartAreaGradient
              title="Tool category curve"
              description="Registered SAP tools grouped by descriptor category"
              data={categoryData.map((cat) => ({ name: cat.name, tools: cat.count }))}
              xKey="name"
              height={260}
              series={[{ key: 'tools', label: 'Tools', color: 'hsl(var(--chart-2))' }]}
              tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 11)}…` : value}
              valueFormatter={(value) => `${Number(value ?? 0).toLocaleString()} tools`}
              legend={categoryData.map((cat, idx) => ({
                label: cat.name,
                href: `/tools?category=${encodeURIComponent(cat.name)}`,
                value: cat.count.toLocaleString(),
                color: CHART_COLORS[idx % CHART_COLORS.length],
              }))}
              footer={`${categoryData.length} indexed categories`}
            />
          )}
        </ExplorerSection>

        <div className="grid gap-5 lg:grid-cols-2">
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
                    key={`${dep.depositor}-${i}`}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/10 transition-colors"
                  >
                    <span className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold tabular-nums shrink-0',
                      i === 0 ? 'bg-primary/15 text-primary' :
                      i === 1 ? 'bg-secondary text-secondary-foreground' :
                      i === 2 ? 'bg-muted text-foreground/80' :
                      'bg-muted/50 text-muted-foreground',
                    )}>
                      {i + 1}
                    </span>
                    
                    <Link
                      href={entityPath('/address', dep.depositor)}
                      className="min-w-0 flex-1 rounded-md transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title={dep.depositor}
                    >
                      
                      <p className="truncate font-mono text-xs text-muted-foreground transition-colors group-hover:text-primary">
                        <span className="sm:hidden">{short(dep.depositor, 6, 4)}</span>
                        <span className="hidden sm:inline">{dep.depositor}</span>
                      </p>
                      <p className="text-xs text-muted-foreground/40 mt-0.5">
                        {dep.escrows} escrow{dep.escrows !== 1 ? 's' : ''} · {dep.agentCount} agent{dep.agentCount !== 1 ? 's' : ''}
                      </p>
                    </Link>
                    
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold tabular-nums text-foreground/80">{dep.totalSpentDisplay}</p>
                      <p className="text-xs text-muted-foreground/40 tabular-nums">{fmtNum(dep.totalCalls)} calls</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ExplorerSection>

          {/* Top Tools by Settlements */}
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
            ) : topTools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                <Wrench className="h-6 w-6 mb-2" />
                <p className="text-xs">No tools registered yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {topTools.map((tool, i) => (
                  <Link
                    key={`${tool.pda}-${tool.name}-${i}`}
                    href={entityPath('/tools', tool.pda)}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-accent/50 transition-all group"
                  >
                    <div className="relative shrink-0">
                      <StatusBadge active={tool.isActive} size="xs" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{tool.name}</p>
                      
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold tabular-nums text-primary">{tool.metric.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground/40">{tool.metricLabel}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ExplorerSection>
        </div>
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
              { label: 'Tools',        value: totalTools,        icon: Wrench,      glow: 'cyan' as const,    accent: 'text-foreground' },
              { label: 'Protocols',    value: totalProtocols,    icon: Layers,      glow: 'emerald' as const, accent: 'text-foreground' },
              { label: 'Capabilities', value: totalCapabilities, icon: Zap,         glow: undefined,          accent: 'text-muted-foreground' },
              { label: 'Attestations', value: totalAttestations, icon: ShieldCheck, glow: undefined,          accent: 'text-muted-foreground' },
              { label: 'Vaults',       value: totalVaults,       icon: Server,      glow: undefined,          accent: 'text-muted-foreground' },
            ].map(({ label, value, icon: Icon, glow, accent }) => (
              <ArenaCard key={label} glow={glow} className="text-center py-4">
                <Icon className={cn('h-5 w-5 mx-auto mb-2', accent)} />
                <p className="text-xl font-bold tabular-nums text-foreground">{fmtNum(value)}</p>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">{label}</p>
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
          <div className="h-px flex-1 bg-border" />
          <Badge variant="hud" className="text-xs">EXPLORE</Badge>
          <div className="h-px flex-1 bg-border" />
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
            <Link
              key={label}
              href={href}
              className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border bg-card px-3 py-4 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              <span className="text-center text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </ExplorerPageShell>
  );
}
