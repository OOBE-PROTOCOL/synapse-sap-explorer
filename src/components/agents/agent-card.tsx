/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Check,
  Coins,
  Copy,
  ExternalLink,
  Globe,
  PaintBucket,
  ShieldCheck,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  Workflow,
  Wrench,
} from 'lucide-react';
import { AgentAvatar, SectionDivider, Skeleton } from '~/components/ui';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { ReputationChip } from '~/components/agents/reputation-chip';
import {
  useAgentBalances,
  type AgentBalanceSummary,
  type AgentMetaplexBadge,
  type AgentStakeSummary,
  type EnrichedAgent,
  type TokenBalance,
} from '~/hooks/use-sap';
import type { AggregatedReputation } from '~/hooks/use-aggregated-reputation';
import type { AgentWellKnown } from '~/lib/sap/well-known';
import { asPublicKeyText, asText, entityPath, fmtNum, short } from '~/lib/format';
import { safeExternalUrl } from '~/lib/safe-url';
import { cn } from '~/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { AvatarGroupCount } from '../ui/avatar';

type HealthLevel = 'excellent' | 'good' | 'untested' | 'degraded' | 'critical' | 'offline';
type AgentCardData = EnrichedAgent & { health: { level: HealthLevel; score: number } };
export type AgentCommerceVolume = {
  solRaw: number;
  usdcRaw: number;
  calls: number;
  escrows: number;
};

const SOLSCAN = 'https://solscan.io';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
const USDC_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png';

const HEALTH_STYLE: Record<HealthLevel, { label: string; ring: string; text: string; fill: string }> = {
  excellent: { label: 'Excellent', ring: 'text-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', fill: 'bg-emerald-500' },
  good: { label: 'Good', ring: 'text-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', fill: 'bg-emerald-500' },
  untested: { label: 'Untested', ring: 'text-muted-foreground', text: 'text-muted-foreground', fill: 'bg-muted-foreground' },
  degraded: { label: 'Degraded', ring: 'text-amber-500', text: 'text-amber-600 dark:text-amber-400', fill: 'bg-amber-500' },
  critical: { label: 'Critical', ring: 'text-destructive', text: 'text-destructive', fill: 'bg-destructive' },
  offline: { label: 'Offline', ring: 'text-muted-foreground', text: 'text-muted-foreground', fill: 'bg-muted-foreground' },
};

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${formatNumber(n / 1_000_000, 1)}M`;
  if (n >= 1_000) return `${formatNumber(n / 1_000, 2)}K`;
  if (n >= 100) return formatNumber(n, 2);
  if (n >= 1) return formatNumber(n, 4);
  if (n >= 0.01) return formatNumber(n, 4);
  if (n >= 0.0001) return formatNumber(n, 6);
  if (n > 0) return formatNumber(n, 8);
  return '0';
}

function lamportsToSolValue(raw: unknown): number {
  if (typeof raw === 'string') return Number(raw) / 1e9;
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value / 1e9 : 0;
}

function rawUsdcToValue(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value / 1e6 : 0;
}

function fmtUsdcCompact(rawAmount: unknown): string {
  const usdc = rawUsdcToValue(rawAmount);
  if (usdc >= 1_000_000) return `${formatNumber(usdc / 1_000_000, 2)}M USDC`;
  if (usdc >= 1_000) return `${formatNumber(usdc / 1_000, 2)}K USDC`;
  if (usdc >= 100) return `${formatNumber(usdc, 2)} USDC`;
  if (usdc >= 1) return `${formatNumber(usdc, 3)} USDC`;
  if (usdc >= 0.01) return `${formatNumber(usdc, 4)} USDC`;
  if (usdc > 0) return `${formatNumber(usdc, 6)} USDC`;
  return '0 USDC';
}

function fmtSolCompact(rawLamports: unknown): string {
  const sol = lamportsToSolValue(rawLamports);
  if (sol >= 1_000) return `${formatNumber(sol / 1_000, 2)}K SOL`;
  if (sol >= 100) return `${formatNumber(sol, 2)} SOL`;
  if (sol >= 1) return `${formatNumber(sol, 4)} SOL`;
  if (sol >= 0.01) return `${formatNumber(sol, 4)} SOL`;
  if (sol >= 0.0001) return `${formatNumber(sol, 6)} SOL`;
  if (sol > 0) return `${formatNumber(sol, 8)} SOL`;
  return '0 SOL';
}

function formatNumber(value: number, maxFractionDigits: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function fmtUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    maximumFractionDigits,
  })}`;
}

function fmtUsdApprox(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '~$0';
  return `~$${value.toLocaleString('en-US', {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function formatSettlementAssets(solRaw: number, usdcRaw: number): string {
  const parts: string[] = [];
  if (solRaw > 0) parts.push(fmtSolCompact(solRaw));
  if (usdcRaw > 0) parts.push(fmtUsdcCompact(usdcRaw));
  return parts.length > 0 ? parts.join(' + ') : '0 SOL';
}

function fmtSolEquivalentFromUsdc(rawAmount: unknown, solPrice: number | null | undefined): string | null {
  if (!solPrice || solPrice <= 0) return null;
  return `≈ ${formatNumber(rawUsdcToValue(rawAmount) / solPrice, 4)} SOL`;
}

function getToolsCount(agent: EnrichedAgent): number {
  return (agent as { onChainToolCount?: number }).onChainToolCount
    ?? agent.metadata?.tools?.length
    ?? 0;
}

function getCalls7d(agent: EnrichedAgent): number {
  return Number(agent.revenue?.calls7d ?? agent.revenue?.totalCalls ?? 0);
}

function hasMetaplexSignal(agent: EnrichedAgent): boolean {
  const m = (agent as { metaplex?: AgentMetaplexBadge | null }).metaplex;
  const logos = (agent as { logos?: { mplAsset?: string | null; mplImage?: string | null } | null }).logos;
  const agentUri = asText(agent.agent.identity?.agentUri).toLowerCase();
  const metadataText = agent.metadata ? JSON.stringify(agent.metadata).toLowerCase() : '';
  return Boolean(
    m?.linked ||
    (m?.pluginCount ?? 0) > 0 ||
    (m?.registryCount ?? 0) > 0 ||
    logos?.mplAsset ||
    logos?.mplImage ||
    agentUri.includes('metaplex') ||
    metadataText.includes('metaplex'),
  );
}

function metaplexSignalLabel(agent: EnrichedAgent): string {
  const m = (agent as { metaplex?: AgentMetaplexBadge | null }).metaplex;
  if (m?.linked) return 'SAP-bound MPL Core asset';
  if ((m?.pluginCount ?? 0) > 0 && (m?.registryCount ?? 0) > 0) {
    return `${m!.pluginCount} MPL plugin${m!.pluginCount === 1 ? '' : 's'} · ${m!.registryCount} registry`;
  }
  if ((m?.registryCount ?? 0) > 0) return `${m!.registryCount} Metaplex registry`;
  if ((m?.pluginCount ?? 0) > 0) return `${m!.pluginCount} AgentIdentity plugin${m!.pluginCount === 1 ? '' : 's'}`;
  return 'Metaplex signal discovered';
}

function useDisplayBalances(
  wallet: string,
  initial: AgentBalanceSummary | null,
  onResolved?: (wallet: string, balances: AgentBalanceSummary) => void,
): AgentBalanceSummary | null {
  const { data } = useAgentBalances(initial ? null : wallet);
  const display = useMemo(() => {
    if (initial) return initial;
    if (!data) return null;
    return {
      sol: data.sol,
      solUsd: data.solUsd,
      usdc: data.usdc,
      tokens: data.tokens.map((t) => ({
        mint: t.mint,
        symbol: t.meta?.symbol ?? short(t.mint, 4, 4),
        name: t.meta?.name ?? 'Unknown Token',
        logo: t.meta?.logo ?? null,
        uiAmount: t.uiAmount,
        decimals: t.decimals,
      })),
    };
  }, [data, initial]);

  useEffect(() => {
    if (!initial && wallet && display) onResolved?.(wallet, display);
  }, [display, initial, onResolved, wallet]);

  return display;
}

function buildSocials(wk: AgentWellKnown | null) {
  if (!wk) return [];
  const candidates: Array<{ label: string; url: string | null }> = [
    wk.twitter && { label: 'X', url: safeExternalUrl(wk.twitter.startsWith('http') ? wk.twitter : `https://x.com/${wk.twitter}`) },
    wk.github && { label: 'GitHub', url: safeExternalUrl(wk.github.startsWith('http') ? wk.github : `https://github.com/${wk.github}`) },
    wk.discord && { label: 'Discord', url: safeExternalUrl(wk.discord) },
    wk.telegram && { label: 'Telegram', url: safeExternalUrl(wk.telegram.startsWith('http') ? wk.telegram : `https://t.me/${wk.telegram}`) },
    wk.website && { label: 'Website', url: safeExternalUrl(wk.website) },
    wk.docs && { label: 'Docs', url: safeExternalUrl(wk.docs) },
  ].filter(Boolean) as Array<{ label: string; url: string | null }>;
  return candidates.filter((item): item is { label: string; url: string } => Boolean(item.url));
}

function CopyBtn({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy address"
      title="Copy address"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'neon-emerald' : 'secondary'} className="gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground')} aria-hidden="true" />
      {active ? 'Active' : 'Idle'}
    </Badge>
  );
}

function MerchantBadge({ toolsCount }: { toolsCount: number }) {
  if (toolsCount <= 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="default" className="gap-1.5">
          <Store className="h-3.5 w-3.5" aria-hidden="true" />
          Merchant
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <span>{toolsCount} published tool{toolsCount === 1 ? '' : 's'}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function DataQualityBadge({ data }: { data: EnrichedAgent['dataQuality'] | null | undefined }) {
  const status = data?.status ?? 'partial';
  const isSnapshot = status === 'snapshot';
  const label = isSnapshot ? 'Snapshot' : status === 'verified' ? 'Verified' : 'Partial';
  const ageMin = data?.snapshotAgeMs != null ? Math.max(0, Math.round(data.snapshotAgeMs / 60_000)) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={status === 'verified' ? 'neon-emerald' : isSnapshot ? 'default' : 'neon-amber'}
          className="gap-1.5"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <span>
          {isSnapshot
            ? `Served from DB snapshot${ageMin != null ? ` · ${ageMin}m old` : ''}`
            : status === 'verified'
              ? 'Verified by the current SAP/RPC fetch'
              : 'Partial data: at least one upstream source was unavailable'}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function TokenStack({ tokens, max = 4 }: { tokens: TokenBalance[]; max?: number }) {
  const shown = tokens.slice(0, max);
  const extra = tokens.length - max;
  if (!tokens.length) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`${tokens.length} token balances`}
        >
          <span className="flex items-center">
            {shown.map((t, i) => (
              <span
                key={t.mint}
                className={cn(
                  'flex size-6 items-center justify-center overflow-hidden rounded-full border border-background bg-muted text-xs font-semibold text-muted-foreground',
                  i > 0 && '-ml-2',
                )}
                style={{ zIndex: max - i }}
              >
                {t.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo} alt={`${t.symbol} token`} className="h-full w-full object-cover" />
                ) : (
                  <span>{t.symbol.slice(0, 2)}</span>
                )}
              </span>
            ))}
            {extra > 0 && (
              <span className="-ml-2 flex size-6 items-center justify-center rounded-full border border-background bg-muted text-xs font-semibold text-muted-foreground">
                +{extra}
              </span>
            )}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">
        <div className="flex flex-col gap-1">
          {tokens.slice(0, 8).map((t) => (
            <div key={t.mint} className="flex items-center justify-between gap-4 text-xs">
              <span className="truncate font-medium">{t.symbol}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{fmtAmt(t.uiAmount)}</span>
            </div>
          ))}
          {tokens.length > 8 && <p className="text-center text-xs text-muted-foreground">+{tokens.length - 8} more</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function HealthRing({ score, level, size = 60 }: { score: number; level: HealthLevel; size?: number }) {
  const safeScore = Math.max(0, Math.min(100, score));
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeScore / 100);
  const meta = HEALTH_STYLE[level];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative inline-flex shrink-0 items-center justify-center"
          role="img"
          aria-label={`${meta.label} health ${safeScore}%`}
        >
          <svg width={size} height={size} role="img" aria-hidden="true">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-muted"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className={cn('transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none', meta.ring)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
          </svg>
          <span className="absolute font-mono text-sm font-semibold tabular-nums text-foreground">{safeScore}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{meta.label} · {safeScore}% health</TooltipContent>
    </Tooltip>
  );
}

function Sparkline({
  series,
  active,
}: {
  series?: NonNullable<EnrichedAgent['revenue']>['daily'];
  active: boolean;
}) {
  const values = calendarVolumeValues(series, 14);
  const max = Math.max(...values, 0.000001);
  const hasVolumePoints = values.some((value) => value > 0);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 100;
    const y = 36 - (value / max) * 30;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const area = `0,40 ${points} 100,40`;

  return (
    <div className="h-24 w-full rounded-lg border bg-background p-3">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-label="Volume sparkline">
        <polygon points={area} className={active && hasVolumePoints ? 'fill-primary/10' : 'fill-muted'} />
        <polyline
          points={points}
          fill="none"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className={active && hasVolumePoints ? 'stroke-primary' : 'stroke-muted-foreground'}
        />
      </svg>
    </div>
  );
}

function getVolumeDelta(series?: NonNullable<EnrichedAgent['revenue']>['daily']) {
  const values = calendarVolumeValues(series, 14).filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;
  const current = values[values.length - 1] ?? 0;
  const previous = values[values.length - 2] ?? 0;
  if (current <= 0 && previous <= 0) return null;
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function getVolumeTrend(series?: NonNullable<EnrichedAgent['revenue']>['daily']) {
  const values = calendarVolumeValues(series, 14);
  const nonZeroBuckets = values.filter((value) => value > 0).length;
  const delta = getVolumeDelta(series);
  if (delta == null) {
    return {
      delta,
      label: nonZeroBuckets > 0 ? `${nonZeroBuckets}` : '0',
      title: nonZeroBuckets > 0
        ? 'Volume exists, but there are not two active daily buckets for a day-over-day trend yet'
        : 'No settled volume buckets indexed for this agent',
    };
  }
  const deltaPositive = delta >= 0;
  return {
    delta,
    label: `${deltaPositive ? '+' : ''}${delta.toFixed(1)}%`,
    title: 'Day-over-day settlement volume trend',
  };
}

function calendarVolumeValues(series: NonNullable<EnrichedAgent['revenue']>['daily'] | undefined, days: number) {
  const byDay = new Map<string, number>();
  for (const row of series ?? []) {
    const date = new Date(row.day);
    if (Number.isNaN(date.getTime())) continue;
    const key = utcDayKey(date);
    byDay.set(key, (byDay.get(key) ?? 0) + rawUsdcToValue(row.totalLamports));
  }

  const today = new Date();
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const ts = end - (days - 1 - index) * 86_400_000;
    return byDay.get(utcDayKey(new Date(ts))) ?? 0;
  });
}

function utcDayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function StatsStrip({ items }: { items: Array<{ label: string; value: string | number | React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-background/80 p-4 transition-colors group-hover:border-primary/20">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="mt-2 truncate font-mono text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function ActivityPanel({
  data,
  solPrice,
  commerceVolume,
}: {
  data: AgentCardData;
  solPrice?: number | null;
  commerceVolume?: AgentCommerceVolume | null;
}) {
  const revenue = data.revenue;
  const volume24hLamports = revenue?.volume24hLamports ?? '0';
  const volume7dLamports = revenue?.volume7dLamports ?? '0';
  const totalSettledLamports = revenue?.totalSettledLamports ?? '0';
  const liveUsdcRaw = commerceVolume?.usdcRaw ?? 0;
  const liveSolRaw = commerceVolume?.solRaw ?? 0;
  const volume24hUsdc = rawUsdcToValue(volume24hLamports);
  const volume7dUsdc = rawUsdcToValue(volume7dLamports);
  const totalSettledUsdc = rawUsdcToValue(totalSettledLamports);
  const calls24h = Number(revenue?.calls24h ?? 0);
  const calls7d = Number(revenue?.calls7d ?? 0);
  const totalCalls = Number(revenue?.totalCalls ?? 0);
  const has24hActivity = volume24hUsdc > 0 || calls24h > 0 || Number(revenue?.tx24h ?? 0) > 0;
  const has7dActivity = volume7dUsdc > 0 || calls7d > 0 || Number(revenue?.tx7d ?? 0) > 0;
  const hasRevenue = has24hActivity || has7dActivity || totalSettledUsdc > 0 || totalCalls > 0;
  
  const dashboardVolumeLamports = Math.max(
    Number(volume24hLamports ?? 0),
    Number(volume7dLamports ?? 0),
    Number(totalSettledLamports ?? 0),
  );
  const primaryVolumeLamports =
    Number(volume24hLamports ?? 0) === dashboardVolumeLamports ? volume24hLamports :
    Number(volume7dLamports ?? 0) === dashboardVolumeLamports ? volume7dLamports :
    totalSettledLamports;
  const primaryVolumeLabel =
    Number(volume24hLamports ?? 0) === dashboardVolumeLamports ? '24h volume' :
    Number(volume7dLamports ?? 0) === dashboardVolumeLamports ? '7d volume' :
    'Settled volume';
  
  // Determine calls window: 24h → 7d → total
  const primaryCalls = has24hActivity ? calls24h : has7dActivity ? calls7d : totalCalls;
  const primaryEscrowLabel = 'Total Escrow';
  
  const hasCommerceVolume = Boolean(commerceVolume && (liveUsdcRaw > 0 || liveSolRaw > 0));
  const secondaryVolumeLabel = hasCommerceVolume
    ? liveUsdcRaw > 0
      ? 'USDC settled'
      : 'SOL settled'
    : has24hActivity
      ? '7d volume'
      : 'Settled volume';
  const secondaryVolumeRaw = hasCommerceVolume
    ? liveUsdcRaw > 0
      ? liveUsdcRaw
      : liveSolRaw
    : has24hActivity
      ? volume7dLamports
      : totalSettledLamports;
  const secondaryVolume = hasCommerceVolume
    ? liveUsdcRaw > 0
      ? fmtUsdcCompact(secondaryVolumeRaw)
      : fmtSolCompact(secondaryVolumeRaw)
    : fmtSolCompact(secondaryVolumeRaw);
  const secondarySub = hasCommerceVolume && liveUsdcRaw > 0
    ? fmtSolEquivalentFromUsdc(secondaryVolumeRaw, solPrice) ?? undefined
    : undefined;
  
  const trend = getVolumeTrend(revenue?.daily);
  const delta = trend.delta;
  const deltaPositive = (delta ?? 0) >= 0;
  const hasActiveRevenue = hasRevenue || getToolsCount(data) > 0;
  const primaryUsdcRaw = hasCommerceVolume ? liveUsdcRaw : 0;
  const primarySolRaw = hasCommerceVolume ? liveSolRaw : Number(primaryVolumeLamports ?? 0);
  const displayCalls = commerceVolume?.calls && commerceVolume.calls > 0 ? commerceVolume.calls : primaryCalls;
  const volumeUsd = solPrice
    ? (lamportsToSolValue(primarySolRaw) * solPrice) + rawUsdcToValue(primaryUsdcRaw)
    : null;
  const tertiaryLabel = commerceVolume?.calls ? 'Escrows' : primaryEscrowLabel;
  const tertiaryValue = fmtNum(commerceVolume?.escrows ?? primaryCalls);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`activity-${asPublicKeyText(data.agent.pda)}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 id={`activity-${asPublicKeyText(data.agent.pda)}`} className="text-sm font-semibold text-foreground">
            Activity
          </h4>
        </div>
        
      </div>
      <Sparkline series={revenue?.daily ?? []} active={hasActiveRevenue} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat
          label="Volume"
          value={formatSettlementAssets(primarySolRaw, primaryUsdcRaw)}
          sub={`${volumeUsd != null ? `${fmtUsdApprox(volumeUsd)} · ` : ''}`}
        />
        <MiniStat
          label={secondaryVolumeLabel}
          value={secondaryVolume}
          sub={`${volumeUsd != null ? `${fmtUsdApprox(Number(secondaryVolume))} · ` : ''}`}
        />
        <MiniStat label={tertiaryLabel} value={tertiaryValue} sub={`${fmtNum(displayCalls)} calls`}/>
      </div>
    </section>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/80 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-base font-semibold tabular-nums text-foreground',
          value === 'No volume' || value === 'No 24h volume' ? 'font-sans text-sm text-muted-foreground' : 'font-mono',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BalancesPanel({
  displayBalances,
  staking,
}: {
  displayBalances: AgentBalanceSummary | null;
  staking: AgentStakeSummary | null;
}) {
  const tokens = displayBalances?.tokens ?? [];
  const stakeTotal = staking ? staking.stakedSol + staking.unstakeAmountSol + staking.slashedSol : 0;
  const stakePct = stakeTotal > 0 ? Math.min(100, Math.round((staking!.stakedSol / stakeTotal) * 100)) : 0;

  return (
    <section className="flex flex-col gap-3" aria-label="Balances">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <BalanceItem logo={SOL_LOGO} symbol="SOL" value={displayBalances ? fmtAmt(displayBalances.sol) : '—'} sub={displayBalances?.solUsd != null ? fmtUsd(displayBalances.solUsd) : <Skeleton className="h-4 w-full" />} />
        <BalanceItem logo={USDC_LOGO} symbol="USDC" value={displayBalances ? fmtAmt(displayBalances.usdc) : '—'} sub="" />
        <div className="flex items-center justify-between rounded-lg border bg-background p-4 sm:min-w-28 sm:justify-center">
          <span className="text-xs text-muted-foreground sm:sr-only">Tokens</span>
          {tokens.length > 0 ? (
            <div className="flex items-center gap-2">
              <TokenStack tokens={tokens} max={3} />
              <span className="font-mono text-sm font-semibold tabular-nums">{tokens.length}</span>
            </div>
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">0</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Staking</span>
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {staking ? `${staking.stakedSol.toFixed(3)} SOL` : 'Not initialized'}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none" style={{ width: `${stakePct}%` }} />
        </div>
        {staking?.unstakeAmountSol ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            <span className="font-mono tabular-nums">{staking.unstakeAmountSol.toFixed(3)} SOL</span> unstaking
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BalanceItem({ logo, symbol, value, sub }: { logo: string; symbol: string; value: string; sub?: string | React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={`${symbol} logo`} className="h-7 w-7 shrink-0 rounded-full" width={28} height={28} />
      <div className="min-w-0">
        <p className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function Tags({ protocols, capabilities }: { protocols: string[]; capabilities: Array<{ id: string }> }) {
  const protocolTags = protocols.slice(0, 2).map((p) => ({ label: typeof p === 'string' ? p : String(p), type: 'protocol' as const }));
  const capTags = capabilities.slice(0, Math.max(0, 5 - protocolTags.length)).map((c) => ({
    label: c.id.includes(':') ? c.id.split(':')[1] : c.id,
    type: 'capability' as const,
  }));
  const visibleTags = [...protocolTags, ...capTags];
  const overflowCount = protocols.length + capabilities.length - visibleTags.length;

  if (visibleTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Agent tags">
      {visibleTags.map((tag) => (
        <Badge
          key={`${tag.type}-${tag.label}`}
          variant={tag.type === 'protocol' ? 'default' : 'secondary'}
          className="max-w-36"
          title={tag.label}
        >
          <span className="truncate">{tag.label}</span>
        </Badge>
      ))}
      {overflowCount > 0 && (
        <Badge variant="outline">
          +{overflowCount}
        </Badge>
      )}
    </div>
  );
}

function FooterActions({
  wallet,
  agentPda,
  x402Url,
  agentMetadataUrl,
  socials,
}: {
  wallet: string;
  agentPda: string;
  x402Url: string | null;
  agentMetadataUrl: string | null;
  socials: Array<{ label: string; url: string }>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{short(wallet || agentPda, 8, 6)}</span>
        <CopyBtn value={wallet || agentPda} className="h-8 w-8" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {x402Url && (
          <Button asChild variant="outline" size="sm">
            <a href={x402Url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              x402
            </a>
          </Button>
        )}
        {agentMetadataUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={agentMetadataUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              Metadata
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        )}
        {socials.slice(0, 2).map((s) => (
          <Button key={s.label} asChild variant="outline" size="sm">
            <a href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {s.label}
            </a>
          </Button>
        ))}
        <Button asChild variant="outline" size="icon">
          <a
            href={`${SOLSCAN}/account/${agentPda}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open agent on Solscan"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function AgentCard({
  data,
  solPrice,
  commerceVolume,
  reputation,
  onBalanceResolved,
}: {
  data: AgentCardData;
  solPrice?: number | null;
  commerceVolume?: AgentCommerceVolume | null;
  reputation: AggregatedReputation | null;
  onBalanceResolved?: (wallet: string, balances: AgentBalanceSummary) => void;
}) {
  const { agent, balances, wellKnown, metadata, health } = data;
  const id = agent.identity;
  const agentPda = asPublicKeyText(agent.pda);
  const wallet = asPublicKeyText(id?.wallet);
  const displayBalances = useDisplayBalances(wallet, balances, onBalanceResolved);
  if (!id) return null;

  const staking = (data as AgentCardData & { staking?: AgentStakeSummary | null }).staking ?? null;
  const metaplex = (data as AgentCardData & { metaplex?: AgentMetaplexBadge | null }).metaplex ?? null;
  const onMetaplex = hasMetaplexSignal(data);
  const toolsCount = getToolsCount(data);
  const feedbacks = Number(id.totalFeedbacks ?? 0);
  const capCount = id.capabilities.length;
  const protocols = (id as unknown as { protocols?: string[] }).protocols ?? metadata?.protocols ?? [];
  const x402Url = safeExternalUrl(id.x402Endpoint);
  const agentMetadataUrl = safeExternalUrl(id.agentUri);
  const socials = buildSocials(wellKnown);
  const metaplexTooltip = metaplex?.linked
    ? `Metaplex · URI-bound to SAP host${metaplex.registryCount > 0 ? ` · also on api.metaplex.com (${metaplex.registryCount})` : ''}`
    : metaplexSignalLabel(data);
  const href = entityPath('/agents', wallet || agentPda);

  return (
    <TooltipProvider>
      <Card className={cn(onMetaplex ? "group flex h-full min-h-[44rem] flex-col overflow-hidden rounded-xl border bg-primary/10 shadow-sm transition-colors hover:border-primary/30 hover:shadow-md" : "group flex h-full min-h-[44rem] flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/30 hover:shadow-md")}>
        <article className="flex h-full flex-col" aria-labelledby={`agent-${agentPda}`}>
          <CardHeader className="p-5 pb-4 min-h-[210px] sm:p-6 sm:pb-0">
            <div className="flex items-start gap-5">
              
            {onMetaplex && (<AgentAvatar
              name={id.name}
              endpoint={id.x402Endpoint}
              logo={data.logos?.wellKnownLogo ?? wellKnown?.logo ?? null}
              mplImage={data.logos?.mplImage ?? null}
              size={64}
              className="rounded-full border bg-background"
              showMetaplexBadge={true}
            />)}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={href}
                    id={`agent-${agentPda}`}
                    className="min-w-0 text-lg font-semibold tracking-tight text-foreground text-pretty transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="line-clamp-1">{id.name}</span>
                  </Link>
                  <StatusPill active={!!id.isActive} />
                </div>
                <p className="mt-2 truncate font-mono text-sm text-muted-foreground">
                  {protocols[0] ?? metadata?.tools?.[0]?.category ?? short(wallet || agentPda, 8, 6)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <MerchantBadge toolsCount={toolsCount} />
                  {onMetaplex && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="default" className="gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          MPL
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{metaplexTooltip}</TooltipContent>
                    </Tooltip>
                  )}
                  <DataQualityBadge data={data.dataQuality} />
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <HealthRing score={health.score} level={health.level} />
                
              </div>
            </div>

            {(wellKnown?.description || id.description) && (
              <p className="mt-5 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {wellKnown?.description || id.description}
              </p>
            )}
          </CardHeader>

          <CardContent className="flex flex-1 flex-col gap-6 p-5 pt-6 sm:p-6 sm:pt-6">
            <BalancesPanel displayBalances={displayBalances} staking={staking} />
            
            <ActivityPanel data={data} solPrice={solPrice} commerceVolume={commerceVolume} />
            <SectionDivider />
            <StatsStrip
              items={[
                { label: 'Rep', value: feedbacks === 0 ? <Skeleton className="h-4 w-full" /> : fmtNum(id.reputationScore) },
                { label: 'Caps', value: capCount },
                { label: 'Tools', value: toolsCount },
                { label: 'Reviews', value: feedbacks },
              ]}
            />
            <Tags protocols={protocols} capabilities={id.capabilities ?? []} />
          </CardContent>

          <Separator />
          <CardFooter className="mt-auto p-5 sm:p-6">
            <FooterActions
              wallet={wallet}
              agentPda={agentPda}
              x402Url={x402Url}
              agentMetadataUrl={agentMetadataUrl}
              socials={socials}
            />
          </CardFooter>
        </article>
      </Card>
    </TooltipProvider>
  );
}

export function AgentListRow({
  data,
  index,
  solPrice,
  commerceVolume,
  reputation,
  onBalanceResolved,
}: {
  data: AgentCardData;
  index: number;
  solPrice?: number | null;
  commerceVolume?: AgentCommerceVolume | null;
  reputation: AggregatedReputation | null;
  onBalanceResolved?: (wallet: string, balances: AgentBalanceSummary) => void;
}) {
  const { agent, balances, wellKnown, health } = data;
  const id = agent.identity;
  const agentPda = asPublicKeyText(agent.pda);
  const wallet = asPublicKeyText(id?.wallet);
  const displayBalances = useDisplayBalances(wallet, balances, onBalanceResolved);
  if (!id) return null;

  const staking = (data as AgentCardData & { staking?: AgentStakeSummary | null }).staking ?? null;
  const toolsCount = getToolsCount(data);
  const isMerchant = toolsCount > 0;
  const onMetaplex = hasMetaplexSignal(data);
  const calls7d = getCalls7d(data);
  const fallbackVolumeRaw = Math.max(
    Number(data.revenue?.volume24hLamports ?? 0),
    Number(data.revenue?.volume7dLamports ?? 0),
    Number(data.revenue?.totalSettledLamports ?? 0),
  );
  const rowHasCommerceVolume = Boolean(commerceVolume && ((commerceVolume.usdcRaw ?? 0) > 0 || (commerceVolume.solRaw ?? 0) > 0));
  const rowVolumeUsdcRaw = rowHasCommerceVolume ? (commerceVolume?.usdcRaw ?? 0) : 0;
  const rowVolumeSolRaw = rowHasCommerceVolume ? (commerceVolume?.solRaw ?? 0) : fallbackVolumeRaw;
  const volumeLabel =
    Number(data.revenue?.volume24hLamports ?? 0) === fallbackVolumeRaw ? '24h vol' :
    Number(data.revenue?.volume7dLamports ?? 0) === fallbackVolumeRaw ? '7d vol' :
    'Settled';
  const volumeValue = formatSettlementAssets(rowVolumeSolRaw, rowVolumeUsdcRaw);
  const volumeSolValue = solPrice
    ? fmtUsdApprox(lamportsToSolValue(rowVolumeSolRaw) * solPrice + rawUsdcToValue(rowVolumeUsdcRaw))
    : undefined;
  const href = entityPath('/agents', wallet || agentPda);

  return (
    <Card className="rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/30">
      <CardContent className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <span className="mt-3 w-7 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{index}</span>
          <AgentAvatar
            name={id.name}
            endpoint={id.x402Endpoint}
            logo={data.logos?.wellKnownLogo ?? wellKnown?.logo ?? null}
            mplImage={data.logos?.mplImage ?? null}
            size={44}
            className="rounded-full border bg-background"
            showMetaplexBadge={onMetaplex}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={href}
                className="min-w-0 font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="line-clamp-1">{id.name}</span>
              </Link>
              <StatusPill active={!!id.isActive} />
              {isMerchant && <MerchantBadge toolsCount={toolsCount} />}
              {onMetaplex && (
                <Badge variant="default" className="gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  MPL
                </Badge>
              )}
              <DataQualityBadge data={data.dataQuality} />
              <ReputationChip data={reputation} size="xs" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="uppercase">PDA</span>
                <span className="max-w-48 truncate font-mono">{agentPda}</span>
                <CopyBtn value={agentPda} className="h-8 w-8" />
              </span>
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="uppercase">Wallet</span>
                <span className="max-w-48 truncate font-mono">{wallet}</span>
                <CopyBtn value={wallet} className="h-8 w-8" />
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {wellKnown && (
                <Badge variant="outline" className="gap-1">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  well-known
                </Badge>
              )}
              {id.x402Endpoint && (
                <Badge variant="default" className="gap-1">
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  x402
                </Badge>
              )}
              {isMerchant && (
                <Badge variant="secondary" className="gap-1">
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  {toolsCount} tools
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-background p-3 sm:grid-cols-4 lg:grid-cols-7">
          <MiniStat label="Health" value={`${health.score}%`} />
          <MiniStat label="SOL" value={displayBalances ? fmtAmt(displayBalances.sol) : '—'} />
          <MiniStat label="USDC" value={displayBalances ? fmtAmt(displayBalances.usdc) : '—'} />
          <MiniStat label="Tools" value={`${toolsCount}`} />
          <MiniStat label={volumeLabel} value={volumeValue} sub={volumeSolValue ?? undefined} />
          <MiniStat label="Calls" value={fmtNum(calls7d)} />
          <MiniStat label="Staked" value={staking ? staking.stakedSol.toFixed(3) : '—'} />
        </div>

        <Button asChild variant="outline" size="icon">
          <Link href={href} aria-label={`Open ${id.name}`}>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
