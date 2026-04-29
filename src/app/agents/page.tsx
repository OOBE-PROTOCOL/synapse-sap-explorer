'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import {
  Bot, Activity, ArrowRight, Heart,
  LayoutGrid, LayoutList, Globe, ShieldCheck,
  ExternalLink, Star, Wrench, Wallet,
  Copy, Check, Coins, Clock,
} from 'lucide-react';
import {
  EmptyState, Skeleton,
  AgentAvatar, ExplorerPagination, usePagination,
  ExplorerPageShell, ExplorerMetric, ExplorerFilterBar,
} from '~/components/ui';
import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '~/components/ui/tooltip';
import { useEnrichedAgents, type EnrichedAgent, type TokenBalance, type AgentStakeSummary } from '~/hooks/use-sap';
import { useQueryState, QueryParam } from '~/hooks/use-query-state';
import type { AgentWellKnown } from '~/lib/sap/well-known';
import { fmtNum } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { FilterChip } from '~/components/ui';

/* ═══════════════════════════════════════════════════════
   Health derivation
   ═══════════════════════════════════════════════════════ */

type HealthLevel = 'excellent' | 'good' | 'untested' | 'degraded' | 'critical' | 'offline';

function deriveHealth(agent: EnrichedAgent): { level: HealthLevel; score: number } {
  const id = agent.agent.identity;
  if (!id?.isActive) return { level: 'offline', score: 0 };

  const feedbacks = Number(id.totalFeedbacks ?? 0);
  const rep = Number(id.reputationScore ?? 0);
  let score = 30;

  if (feedbacks === 0) score += 15;
  else score += Math.min(rep / 10000, 1) * 30;

  const uptime = Number(id.uptimePercent ?? 0);
  score += (uptime / 100) * 20;

  const latency = Number(id.avgLatencyMs ?? 0);
  if (latency === 0) score += 10;
  else if (latency < 500) score += 20;
  else if (latency < 2000) score += 15;
  else if (latency < 5000) score += 10;
  else score += 5;

  const level: HealthLevel =
    feedbacks === 0 ? 'untested' :
    score >= 85 ? 'excellent' :
    score >= 65 ? 'good' :
    score >= 40 ? 'degraded' : 'critical';

  return { level, score: Math.round(score) };
}

const HEALTH_META: Record<HealthLevel, { dot: string; text: string; bar: string; label: string }> = {
  excellent: { dot: 'bg-emerald-400', text: 'text-emerald-400', bar: 'bg-emerald-400', label: 'Excellent' },
  good:      { dot: 'bg-primary/70',  text: 'text-primary/80',  bar: 'bg-primary/70',  label: 'Good' },
  untested:  { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground/60', bar: 'bg-muted-foreground/40', label: 'Untested' },
  degraded:  { dot: 'bg-amber-400',   text: 'text-amber-400',   bar: 'bg-amber-400',   label: 'Degraded' },
  critical:  { dot: 'bg-destructive', text: 'text-destructive', bar: 'bg-destructive', label: 'Critical' },
  offline:   { dot: 'bg-muted-foreground/30', text: 'text-muted-foreground/40', bar: 'bg-muted-foreground/20', label: 'Offline' },
};

/* ═══════════════════════════════════════════════════════
   Micro helpers
   ═══════════════════════════════════════════════════════ */

const SORT_OPTIONS = [
  { value: 'health',       label: 'Health' },
  { value: 'reputation',  label: 'Reputation' },
  { value: 'balance',     label: 'Balance' },
  { value: 'staking',     label: 'Staking' },
  { value: 'capabilities', label: 'Capabilities' },
  { value: 'newest',      label: 'Newest' },
  { value: 'oldest',      label: 'Oldest' },
];

const SOLSCAN = 'https://solscan.io';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
const USDC_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png';

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(2);
  if (n > 0) return n.toFixed(4);
  return '0';
}

function buildSocials(wk: AgentWellKnown | null) {
  if (!wk) return [];
  return [
    wk.twitter && { label: 'X', url: wk.twitter.startsWith('http') ? wk.twitter : `https://x.com/${wk.twitter}` },
    wk.github && { label: 'GitHub', url: wk.github.startsWith('http') ? wk.github : `https://github.com/${wk.github}` },
    wk.discord && { label: 'Discord', url: wk.discord },
    wk.telegram && { label: 'Telegram', url: wk.telegram.startsWith('http') ? wk.telegram : `https://t.me/${wk.telegram}` },
    wk.website && { label: 'Website', url: wk.website },
    wk.docs && { label: 'Docs', url: wk.docs },
  ].filter(Boolean) as { label: string; url: string }[];
}

/** Copy button with checkmark feedback */
function CopyBtn({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={cn('text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/** Token avatar stack with tooltip */
function TokenStack({ tokens, max = 4 }: { tokens: TokenBalance[]; max?: number }) {
  const shown = tokens.slice(0, max);
  const extra = tokens.length - max;
  if (!tokens.length) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="w-fit">
          <div className="flex items-center -space-x-1.5">
            {shown.map((t, i) => (
              <div
                key={t.mint}
                className="h-[18px] w-[18px] rounded-full border border-card bg-muted/20 overflow-hidden flex items-center justify-center"
                style={{ zIndex: max - i }}
              >
                {t.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo} alt={t.symbol} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[6px] font-bold text-muted-foreground">{t.symbol.slice(0, 2)}</span>
                )}
              </div>
            ))}
            {extra > 0 && (
              <div className="h-[18px] w-[18px] rounded-full border border-card bg-muted/30 flex items-center justify-center">
                <span className="text-[7px] font-bold text-muted-foreground">+{extra}</span>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[14rem]">
          <div className="space-y-1">
            {tokens.slice(0, 8).map((t) => (
              <div key={t.mint} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium">{t.symbol}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{fmtAmt(t.uiAmount)}</span>
              </div>
            ))}
            {tokens.length > 8 && <p className="text-muted-foreground text-center text-xs">+{tokens.length - 8} more</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ═══════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════ */

export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsSkeleton />}>
      <AgentsInner />
    </Suspense>
  );
}

function AgentsInner() {
  const [search, setSearch] = useQueryState('q', '', QueryParam.string);
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    'health',
    QueryParam.enum('health', ['health', 'reputation', 'balance', 'staking', 'capabilities', 'newest', 'oldest'] as const),
  );
  const [activeOnly, setActiveOnly] = useQueryState('active', true, {
    parse: (raw) => (raw == null ? true : raw !== '0' && raw !== 'false'),
    serialize: (v) => (v ? null : '0'),
  });
  const [mplOnly, setMplOnly] = useQueryState('metaplex', false, QueryParam.bool);
  const [recentOnly, setRecentOnly] = useQueryState('recent', false, QueryParam.bool);
  const [view, setView] = useQueryState('view', 'grid', QueryParam.enum('grid', ['grid', 'list'] as const));

  const { data, loading, error } = useEnrichedAgents();
  const agents = useMemo(() => data?.agents ?? [], [data]);

  const enriched = useMemo(() =>
    agents.map((a) => ({ ...a, health: deriveHealth(a) })),
  [agents]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (activeOnly) list = list.filter((a) => a.agent.identity?.isActive);
    if (mplOnly) {
      list = list.filter((a) => {
        const m = (a as { metaplex?: import('~/hooks/use-sap').AgentMetaplexBadge | null }).metaplex;
        return !!m && (m.linked || m.pluginCount > 0 || m.registryCount > 0);
      });
    }
    if (recentOnly) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((a) => {
        const raw = a.agent.identity?.createdAt;
        if (!raw) return false;
        const n = Number(raw);
        const ms = n > 1e12 ? n : n * 1000;
        return ms >= cutoff;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        const id = a.agent.identity;
        if (!id) return false;
        return id.name.toLowerCase().includes(q) || id.description.toLowerCase().includes(q) || a.agent.pda.toLowerCase().includes(q) || id.wallet.toLowerCase().includes(q);
      });
    }
    return list;
  }, [enriched, search, activeOnly, mplOnly, recentOnly]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const parseTs = (raw: string | null | undefined): number => {
      if (!raw) return 0;
      const n = Number(raw);
      return n > 1e12 ? n : n * 1000;
    };
    switch (sortBy) {
      case 'health': return copy.sort((a, b) => b.health.score - a.health.score);
      case 'reputation': return copy.sort((a, b) => (b.agent.identity?.reputationScore ?? 0) - (a.agent.identity?.reputationScore ?? 0));
      case 'balance': return copy.sort((a, b) => (b.balances?.sol ?? 0) - (a.balances?.sol ?? 0));
      case 'staking': return copy.sort((a, b) => ((b as CardData & { staking?: AgentStakeSummary | null }).staking?.stakedSol ?? 0) - ((a as CardData & { staking?: AgentStakeSummary | null }).staking?.stakedSol ?? 0));
      case 'capabilities': return copy.sort((a, b) => (b.agent.identity?.capabilities.length ?? 0) - (a.agent.identity?.capabilities.length ?? 0));
      case 'newest': return copy.sort((a, b) => parseTs(b.agent.identity?.createdAt) - parseTs(a.agent.identity?.createdAt));
      case 'oldest': return copy.sort((a, b) => parseTs(a.agent.identity?.createdAt) - parseTs(b.agent.identity?.createdAt));
      default: return copy;
    }
  }, [filtered, sortBy]);

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(sorted.length, 6);
  const paginated = useMemo(() => paginate(sorted), [paginate, sorted]);

  const stats = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((a) => a.agent.identity?.isActive).length;
    const avgHealth = enriched.length > 0 ? Math.round(enriched.reduce((s, a) => s + a.health.score, 0) / enriched.length) : 0;
    const excellent = enriched.filter((a) => a.health.level === 'excellent').length;
    return { total, active, avgHealth, excellent };
  }, [agents, enriched]);

  const mplCount = useMemo(() => enriched.filter((a) => {
    const m = (a as { metaplex?: import('~/hooks/use-sap').AgentMetaplexBadge | null }).metaplex;
    return !!m && (m.linked || m.pluginCount > 0 || m.registryCount > 0);
  }).length, [enriched]);

  const filterChips: FilterChip[] = [];
  if (activeOnly) filterChips.push({ key: 'active', label: 'Active only', value: 'true', onClear: () => setActiveOnly(false) });
  if (mplOnly) filterChips.push({ key: 'mpl', label: 'Metaplex', value: 'on', onClear: () => setMplOnly(false) });
  if (recentOnly) filterChips.push({ key: 'recent', label: 'Recently added', value: 'on', onClear: () => setRecentOnly(false) });
  if (sortBy !== 'health') filterChips.push({ key: 'sort', label: 'Sort', value: SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy, onClear: () => setSortBy('health') });

  return (
    <ExplorerPageShell
      title="Agent Directory"
      subtitle={`${data?.total ?? '...'} agents registered on the Synapse Agent Protocol`}
      icon={<Bot className="h-5 w-5" />}
      stats={
        <>
          <ExplorerMetric icon={<Bot className="h-3.5 w-3.5" />} label="Registered" value={loading ? '...' : fmtNum(stats.total)} sub="agents" accent="primary" />
          <ExplorerMetric icon={<Activity className="h-3.5 w-3.5" />} label="Active" value={loading ? '...' : fmtNum(stats.active)} sub={`${stats.total > 0 ? Math.round(stats.active / stats.total * 100) : 0}%`} accent="emerald" />
          <ExplorerMetric icon={<Heart className="h-3.5 w-3.5" />} label="Avg Health" value={loading ? '...' : `${stats.avgHealth}%`} accent={stats.avgHealth >= 70 ? 'emerald' : 'amber'} />
          <ExplorerMetric icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Excellent" value={loading ? '...' : fmtNum(stats.excellent)} sub="agents" accent="cyan" />
        </>
      }
      actions={
        <div className="flex items-center gap-1 border border-border/40 rounded-lg p-0.5 bg-muted/5">
          <button
            onClick={() => setView('grid')}
            className={cn('p-1.5 rounded-md transition-all', view === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground')}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('p-1.5 rounded-md transition-all', view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground')}
            aria-label="List view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name, PDA, or wallet..."
        sort={{ value: sortBy, options: SORT_OPTIONS, onChange: (v) => setSortBy(v as typeof sortBy) }}
        filters={filterChips}
      >
        <Button
          variant={activeOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveOnly(!activeOnly)}
        >
          {activeOnly ? 'Active only' : 'All agents'}
        </Button>
        <Button
          variant={mplOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMplOnly(!mplOnly)}
          disabled={mplCount === 0}
          className={cn(
            mplOnly
              ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black border-amber-400 hover:from-amber-300 hover:to-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
              : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 hover:border-amber-400/60',
          )}
          title={mplCount === 0 ? 'No Metaplex-coordinated agents discovered yet' : `${mplCount} agent${mplCount === 1 ? '' : 's'} on Metaplex`}
        >
          <span className={cn('mr-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black', mplOnly ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-300')}>
            ✓
          </span>
          MPL × SAP
          <span className="ml-1.5 tabular-nums opacity-80">{mplCount}</span>
        </Button>
        <Button
          variant={recentOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setRecentOnly(!recentOnly); if (!recentOnly) setSortBy('newest'); else setSortBy('health'); }}
          className={cn(
            recentOnly
              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40 hover:bg-cyan-500/30'
              : 'border-cyan-500/30 text-cyan-400/80 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-400/50',
          )}
          title="Show agents registered in the last 30 days"
        >
          <Clock className="mr-1.5 h-3.5 w-3.5" />
          Recently Added
        </Button>
      </ExplorerFilterBar>

      {loading ? (
        <AgentsSkeleton />
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No agents match your search' : 'No agents discovered on-chain'} />
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
              {paginated.map((item) => (
                <AgentCard key={item.agent.pda} data={item} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {paginated.map((item, i) => (
                <AgentListRow key={item.agent.pda} data={item} index={(page - 1) * perPage + i + 1} />
              ))}
            </div>
          )}
          <ExplorerPagination
            page={page}
            total={sorted.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            perPageOptions={[12, 24, 48, 96]}
            className="mt-6"
          />
        </>
      )}
    </ExplorerPageShell>
  );
}

/* ═══════════════════════════════════════════════════════
   Agent Card — Clean marketplace style
   ═══════════════════════════════════════════════════════ */

type CardData = EnrichedAgent & { health: { level: HealthLevel; score: number } };

function AgentCard({ data }: { data: CardData }) {
  const { agent, balances, wellKnown, metadata, health } = data;
  const id = agent.identity;
  if (!id) return null;

  const staking = (data as CardData & { staking?: AgentStakeSummary | null }).staking ?? null;
  const metaplex = (data as CardData & { metaplex?: import('~/hooks/use-sap').AgentMetaplexBadge | null }).metaplex ?? null;
  const onMetaplex = !!metaplex && (metaplex.linked || metaplex.pluginCount > 0 || metaplex.registryCount > 0);
  const metaplexVerified = !!metaplex?.linked;
  const metaplexTooltip = !metaplex
    ? null
    : metaplex.linked
      ? `Metaplex · URI-bound to SAP host${metaplex.registryCount > 0 ? ` · also on api.metaplex.com (${metaplex.registryCount})` : ''}`
      : metaplex.registryCount > 0 && metaplex.pluginCount > 0
        ? `Metaplex · ${metaplex.pluginCount} on-chain plugin${metaplex.pluginCount === 1 ? '' : 's'} + ${metaplex.registryCount} registry entr${metaplex.registryCount === 1 ? 'y' : 'ies'}`
        : metaplex.registryCount > 0
          ? `Metaplex · ${metaplex.registryCount} agent${metaplex.registryCount === 1 ? '' : 's'} on api.metaplex.com`
          : `Metaplex · ${metaplex.pluginCount} on-chain AgentIdentity plugin${metaplex.pluginCount === 1 ? '' : 's'}`;
  const hc = HEALTH_META[health.level];
  const capCount = id.capabilities.length;
  const feedbacks = Number(id.totalFeedbacks ?? 0);
  const socials = buildSocials(wellKnown);
  const tokens = balances?.tokens ?? [];
  const toolsCount = (data as { onChainToolCount?: number }).onChainToolCount ?? metadata?.tools?.length ?? 0;
  const protocols = (id as unknown as { protocols?: string[] }).protocols ?? metadata?.protocols ?? [];
  const caps = id.capabilities ?? [];

  // Categorize tags: protocols first, then caps — max 4 visible
  const protocolTags = protocols.slice(0, 2).map((p: string) => ({ label: typeof p === 'string' ? p : String(p), type: 'protocol' as const }));
  const capTags = caps.slice(0, Math.max(0, 4 - protocolTags.length)).map((c: { id: string }) => ({
    label: c.id.includes(':') ? c.id.split(':')[1] : c.id,
    type: 'capability' as const,
  }));
  const visibleTags = [...protocolTags, ...capTags];
  const overflowCount = protocols.length + caps.length - visibleTags.length;

  return (
    <Link href={`/agents/${id.wallet}`} className="group block">
      <div className={cn(
        'relative rounded-xl overflow-hidden transition-all duration-300',
        'bg-card/60 backdrop-blur-sm border',
        onMetaplex
          ? metaplexVerified
            ? 'border-amber-400/55 shadow-[0_0_0_1px_rgba(251,191,36,0.18)_inset,0_8px_36px_-14px_rgba(251,191,36,0.35)] hover:border-amber-300/75 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.28)_inset,0_10px_44px_-12px_rgba(251,191,36,0.5)]'
            : 'border-amber-500/35 shadow-[0_0_0_1px_rgba(217,160,30,0.12)_inset] hover:border-amber-400/55 hover:shadow-[0_0_0_1px_rgba(217,160,30,0.2)_inset,0_8px_36px_-16px_rgba(217,160,30,0.3)]'
          : 'border-border/30 hover:border-border/60 hover:shadow-[0_8px_40px_-12px_hsl(var(--glow)/0.08)]',
        'h-full flex flex-col',
      )}>
        {/* Gold corner ribbon — only when on Metaplex. Subtle, top-right. */}
        {onMetaplex && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute -top-px -right-px h-12 w-12 rounded-bl-[28px]',
              metaplexVerified
                ? 'bg-gradient-to-bl from-amber-300/30 via-amber-400/10 to-transparent'
                : 'bg-gradient-to-bl from-amber-500/18 via-amber-500/6 to-transparent',
            )}
          />
        )}
        {/* ────────────── HEADER ────────────── */}
        <div className="p-4 sm:p-6 pb-0">
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <AgentAvatar
                name={id.name}
                endpoint={id.x402Endpoint}
                logo={wellKnown?.logo}
                size={48}
              />
              {/* Metaplex verification mark — overlay on avatar (bottom-right),
                  like a verified checkmark. Gold = on Metaplex via any signal,
                  stronger gold + ring = SAP-bound URI verified. */}
              {onMetaplex && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (metaplex?.linked && metaplex.asset) {
                            window.open(`${SOLSCAN}/token/${metaplex.asset}`, '_blank', 'noopener');
                          }
                        }}
                        aria-label={metaplexTooltip ?? 'Metaplex'}
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full',
                          'text-[8px] font-black leading-none ring-2 ring-card transition-transform hover:scale-110',
                          metaplexVerified
                            ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-black shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                            : 'bg-gradient-to-br from-amber-500/90 to-amber-700/90 text-amber-50',
                        )}
                      >
                        {metaplexVerified ? '✓' : 'M'}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <span className="text-xs">{metaplexTooltip}</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Identity */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[14px] sm:text-[15px] font-semibold tracking-tight truncate text-foreground group-hover:text-primary transition-colors duration-200 max-w-full">
                  {id.name}
                </h3>
                {/* Status pill */}
                <span className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-px rounded-full text-xs font-medium tracking-wide shrink-0',
                  id.isActive
                    ? 'text-emerald-500 dark:text-emerald-400/90 bg-emerald-500/10 dark:bg-emerald-400/8'
                    : 'text-muted-foreground/40 bg-muted/20',
                )}>
                  <span className={cn('h-1 w-1 rounded-full', id.isActive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-muted-foreground/30')} />
                  {id.isActive ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              {/* Address with copy */}
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                <button
                  className="min-w-0 flex-1 truncate text-left text-xs sm:text-xs font-mono text-muted-foreground/55 transition-colors hover:text-muted-foreground/80"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`${SOLSCAN}/account/${agent.pda}`, '_blank', 'noopener'); }}
                >
                  <span className="sm:hidden">{agent.pda.slice(0, 6)}…{agent.pda.slice(-4)}</span>
                  <span className="hidden sm:inline">{agent.pda}</span>
                </button>
                <CopyBtn value={agent.pda} />
              </div>
            </div>

            {/* Health score — top right */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <span className={cn('text-sm font-bold tabular-nums', hc.text)}>{health.score}</span>
                    <div className="w-8 h-1 rounded-full bg-muted/20 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-700', hc.bar)} style={{ width: `${health.score}%` }} />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{hc.label} — {health.score}% health</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Description */}
          {(wellKnown?.description || id.description) && (
            <p className="text-[12px] leading-relaxed text-muted-foreground/60 line-clamp-2 mt-3 sm:mt-4">
              {wellKnown?.description || id.description}
            </p>
          )}
        </div>

        {/* ────────────── STATS ROW ────────────── */}
        <div className="mt-4 border-t border-border/10 px-4 sm:px-6 py-3 sm:py-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/45">STATS</span>
            <span className="h-px flex-1 bg-border/65" />
          </div>
          <div className="flex items-center">
            {[
              { label: 'REP', value: feedbacks === 0 ? '\u2014' : fmtNum(id.reputationScore) },
              { label: 'CAPS', value: `${capCount}` },
              { label: 'TOOLS', value: `${toolsCount}` },
              { label: 'REVIEWS', value: `${feedbacks}` },
            ].map((stat, i) => (
              <div key={stat.label} className={cn('flex-1 text-center', i > 0 && 'border-l border-border/15')}>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/40 leading-none">{stat.label}</p>
                <p className="text-[14px] font-bold tabular-nums text-foreground/90 leading-tight mt-1.5">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ────────────── BALANCES ────────────── */}
        <div className="border-t border-border/10 px-6 py-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/45">BALANCES</span>
            <span className="h-px flex-1 bg-border/65" />
          </div>
          <div className="flex items-center gap-4">
            {/* SOL */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SOL_LOGO} alt="SOL" className="h-5 w-5 rounded-full shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums text-foreground leading-none">{balances ? fmtAmt(balances.sol) : '\u2014'}</p>
                {balances?.solUsd != null && (
                  <p className="text-xs text-muted-foreground/35 tabular-nums mt-0.5">${balances.solUsd.toFixed(2)}</p>
                )}
              </div>
            </div>

            <div className="w-px h-8 bg-border/65 shrink-0" />

            {/* USDC */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={USDC_LOGO} alt="USDC" className="h-5 w-5 rounded-full shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums text-foreground leading-none">{balances ? fmtAmt(balances.usdc) : '\u2014'}</p>
                <p className="text-xs text-muted-foreground/35 mt-0.5">USDC</p>
              </div>
            </div>

            {/* Other tokens */}
            {tokens.length > 0 && (
              <>
                <div className="w-px h-8 bg-border/65 shrink-0" />
                <div className="flex items-center gap-2.5 shrink-0">
                  <TokenStack tokens={tokens} max={3} />
                  <span className="text-xs text-muted-foreground/35">{tokens.length}</span>
                </div>
              </>
            )}
          </div>

          {/* Staking */}
          <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/5 border border-primary/10 px-2.5 py-1.5">
            <Coins className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <span className="text-xs text-muted-foreground/50 uppercase tracking-wider">Staked</span>
            {staking ? (
              <>
                <span className="ml-auto text-xs font-bold tabular-nums text-primary">{staking.stakedSol.toFixed(3)} SOL</span>
                {staking.unstakeAmountSol > 0 && (
                  <span className="text-xs text-amber-400/70 tabular-nums">{staking.unstakeAmountSol.toFixed(3)} unstaking</span>
                )}
              </>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground/30">Not initialized</span>
            )}
          </div>
        </div>

        {/* ────────────── TAGS ────────────── */}
        {visibleTags.length > 0 && (
          <div className="border-t border-border/10 px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2 flex-wrap">
            {visibleTags.map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  'inline-flex text-xs font-medium px-2 py-0.5 rounded-md truncate max-w-[6rem]',
                  tag.type === 'protocol'
                    ? 'bg-primary/8 text-primary/70 border border-primary/10'
                    : 'bg-muted/10 text-muted-foreground/50 border border-border/15',
                )}
              >
                {tag.label}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-xs text-muted-foreground/25">+{overflowCount}</span>
            )}
          </div>
        )}

        {/* ────────────── FOOTER ────────────── */}
        <div className="mt-auto border-t border-border/10 px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
          {/* Left: wallet + protocols */}
          <div className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground/45">
            <span className="font-mono min-w-0 max-w-[8rem] sm:max-w-[10rem] truncate text-muted-foreground/70">{id.wallet}</span>
            {protocols.length > 0 && (
              <>
                <span className="text-border/30">&middot;</span>
                <span className="shrink-0">{protocols.length} protocol{protocols.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>

          {/* Right: action links */}
          <div className="flex items-center gap-1 shrink-0">
            {id.x402Endpoint && (
              <button
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary/70 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(id.x402Endpoint!, '_blank', 'noopener'); }}
              >
                <Wallet className="h-3 w-3" />
                x402
              </button>
            )}
            {id.agentUri && (
              <button
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/10 transition-all"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(id.agentUri!, '_blank', 'noopener'); }}
              >
                Metadata
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            )}
            {socials.length > 0 && socials.slice(0, 2).map((s) => (
              <button
                key={s.label}
                className="px-1.5 py-1 rounded-md text-xs font-medium text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/10 transition-all"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(s.url, '_blank', 'noopener'); }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════
   Agent List Row — Compact
   ═══════════════════════════════════════════════════════ */

function AgentListRow({ data, index }: { data: CardData; index: number }) {
  const { agent, balances, wellKnown, metadata, health } = data;
  const id = agent.identity;
  if (!id) return null;

  const staking = (data as CardData & { staking?: AgentStakeSummary | null }).staking ?? null;
  const hc = HEALTH_META[health.level];
  const feedbacks = Number(id.totalFeedbacks ?? 0);
  const tokens = balances?.tokens ?? [];
  const toolsCount = (data as { onChainToolCount?: number }).onChainToolCount ?? metadata?.tools?.length ?? 0;

  return (
    <Link href={`/agents/${id.wallet}`} className="group block">
      <div className={cn(
        'grid grid-cols-1 gap-4 rounded-xl border px-5 py-4 transition-all duration-200 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
        'bg-card/45 border-border/30',
        'hover:border-border/55 hover:bg-card/65 hover:shadow-[0_6px_28px_-16px_hsl(var(--glow)/0.15)]',
      )}>
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="mt-1 w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground/35">{index}</span>

            <AgentAvatar name={id.name} endpoint={id.x402Endpoint} logo={wellKnown?.logo} size={40} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{id.name}</p>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium tracking-wide',
                  id.isActive ? 'text-emerald-400/90 bg-emerald-400/10' : 'text-muted-foreground/45 bg-muted/20',
                )}>
                  <span className={cn('h-1 w-1 rounded-full', id.isActive ? 'bg-emerald-400' : 'bg-muted-foreground/30')} />
                  {id.isActive ? 'ONLINE' : 'OFFLINE'}
                </span>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="w-fit">
                      <span className={cn('text-xs font-semibold tabular-nums', hc.text)}>{health.score}%</span>
                    </TooltipTrigger>
                    <TooltipContent>{hc.label}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="uppercase tracking-wide text-muted-foreground/45">PDA</span>
                <span className="font-mono min-w-0 max-w-[11rem] truncate text-muted-foreground/85 sm:max-w-[14rem]">{agent.pda}</span>
                <CopyBtn value={agent.pda} className="text-muted-foreground/35" />
                <span className="text-border/30">•</span>
                <span className="uppercase tracking-wide text-muted-foreground/45">Wallet</span>
                <span className="font-mono min-w-0 max-w-[11rem] truncate text-muted-foreground/85 sm:max-w-[14rem]">{id.wallet}</span>
                <CopyBtn value={id.wallet} className="text-muted-foreground/35" />
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                {wellKnown && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/20 px-1.5 py-0.5 text-muted-foreground/50">
                    <Globe className="h-2.5 w-2.5" /> well-known
                  </span>
                )}
                {id.x402Endpoint && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary/70">
                    <Wallet className="h-2.5 w-2.5" /> x402
                  </span>
                )}
                {(data as CardData & { metaplex?: { linked: boolean } | null }).metaplex && (
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border',
                    (data as CardData & { metaplex?: { linked: boolean } | null }).metaplex?.linked
                      ? 'bg-pink-500/10 border-pink-500/20 text-pink-400'
                      : 'bg-muted/15 border-border/30 text-neutral-500',
                  )}>
                    <span className={cn(
                      'h-1 w-1 rounded-full',
                      (data as CardData & { metaplex?: { linked: boolean } | null }).metaplex?.linked
                        ? 'bg-pink-400'
                        : 'bg-neutral-500',
                    )} /> MPL
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="hidden shrink-0 rounded-lg border border-border/20 bg-muted/10 px-3 py-2 sm:flex sm:items-center sm:gap-4 text-[12px] tabular-nums">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="w-fit">
                <div className="flex items-center gap-1.5">
                  <Star className="h-3 w-3 text-muted-foreground/25" />
                  <span className="w-10 text-right font-medium">{feedbacks === 0 ? '\u2014' : fmtNum(id.reputationScore)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Rep ({feedbacks} reviews)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SOL_LOGO} alt="SOL" className="h-3.5 w-3.5 rounded-full" />
            <span className="w-12 text-right font-medium">{balances ? fmtAmt(balances.sol) : '\u2014'}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={USDC_LOGO} alt="USDC" className="h-3.5 w-3.5 rounded-full" />
            <span className="w-12 text-right font-medium">{balances ? fmtAmt(balances.usdc) : '\u2014'}</span>
          </div>

          {toolsCount > 0 && (
            <div className="hidden lg:flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-muted-foreground/25" />
              <span>{toolsCount}</span>
            </div>
          )}

          <div className="hidden lg:block">
            <TokenStack tokens={tokens} max={3} />
          </div>

          <div className="hidden xl:flex items-center gap-1.5">
            <Coins className="h-3 w-3 text-primary/50" />
            <span className={staking ? 'text-primary/80 font-semibold' : 'text-muted-foreground/30'}>
              {staking ? staking.stakedSol.toFixed(3) : '—'}
            </span>
          </div>
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-primary/60 transition-colors shrink-0" />
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════
   Skeleton
   ═══════════════════════════════════════════════════════ */

function AgentsSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    </div>
  );
}
