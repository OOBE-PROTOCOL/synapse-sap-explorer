'use client';

/* ═══════════════════════════════════════════════════════════
 * Explorer Primitives — Arena-grade Protocol Intelligence UI
 *
 * Reusable building blocks for every explorer page:
 *   ExplorerPageShell  — full page wrapper (header + stats + content)
 *   ExplorerSection    — titled content block with HUD accents
 *   ExplorerMetric     — compact KPI display (neon-style)
 *   ExplorerFilterBar  — search + filter chips + sort controls
 *   ExplorerSortHeader — clickable table header with sort indicator
 *   ExplorerGrid       — responsive grid wrapper
 *   ExplorerLiveDot    — animated live indicator
 *   SectionDivider     — subtle gradient separator
 *   DataSourceBadge    — on-chain / off-chain data source indicator
 *   ArenaCard          — sci-fi card with glow effects
 * ═══════════════════════════════════════════════════════════ */

import React from 'react';
import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from 'lucide-react';

/* ── ExplorerPageShell ──────────────────────── */
export function ExplorerPageShell({
  title,
  subtitle,
  icon,
  badge,
  stats,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4 sm:space-y-6 animate-fade-in', className)}>
      {/* ── Header ─── */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {icon && (
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-white truncate">{title}</h1>
                {badge}
              </div>
              {subtitle && (
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto sm:pl-4">{actions}</div>}
        </div>
      </div>

      {/* ── Stats Strip ─── */}
      {stats && (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 stagger-children">
          {stats}
        </div>
      )}

      {/* ── Content ─── */}
      {children}
    </div>
  );
}

/* ── ExplorerSection ────────────────────────── */
export function ExplorerSection({
  title,
  count,
  icon,
  actions,
  children,
  className,
  compact,
  noPadding,
  dataSource,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  noPadding?: boolean;
  dataSource?: 'onchain' | 'offchain' | 'hybrid';
}) {
  return (
    <Card className={cn('overflow-hidden bg-neutral-900 border-neutral-700', className)}>
      <CardHeader className={cn('pb-0', compact ? 'py-3 px-4' : 'px-5 pt-4')}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            {title}
            {count !== undefined && (
              <Badge variant="secondary" className="ml-1 tabular-nums font-mono">
                {count.toLocaleString()}
              </Badge>
            )}
            {dataSource && <DataSourceBadge source={dataSource} />}
          </CardTitle>
          {actions}
        </div>
      </CardHeader>
      <CardContent className={cn(compact ? 'pt-3 pb-3 px-4' : 'px-5 pt-3 pb-4', noPadding && 'p-0 pt-3')}>
        {children}
      </CardContent>
    </Card>
  );
}

/* ── ExplorerMetric ─────────────────────────── */
export function ExplorerMetric({
  label,
  value,
  icon,
  sub,
  trend,
  accent = 'primary',
  className,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  accent?: 'primary' | 'cyan' | 'emerald' | 'amber' | 'rose';
  className?: string;
}) {
  const accentMap = {
    primary: { iconBg: 'bg-primary/10', iconText: 'text-primary' },
    cyan: { iconBg: 'bg-neutral-800', iconText: 'text-white' },
    emerald: { iconBg: 'bg-neutral-800', iconText: 'text-white' },
    amber: { iconBg: 'bg-primary/10', iconText: 'text-primary' },
    rose: { iconBg: 'bg-red-500/10', iconText: 'text-red-400' },
  };

  const a = accentMap[accent];

  return (
    <Card className={cn('group overflow-hidden bg-neutral-900 border-neutral-700 hover:border-neutral-600 transition-all duration-300', className)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
              {label}
            </p>
            <p className="text-lg sm:text-2xl font-bold tracking-tight text-white tabular-nums font-mono truncate">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {sub && (
              <p className="text-xs text-muted-foreground/50">{sub}</p>
            )}
            {trend && (
              <p className={cn(
                'text-xs font-medium tabular-nums',
                trend.direction === 'up' && 'text-emerald-400',
                trend.direction === 'down' && 'text-destructive',
                trend.direction === 'neutral' && 'text-muted-foreground',
              )}>
                {trend.direction === 'up' && '↑ '}
                {trend.direction === 'down' && '↓ '}
                {trend.value}
              </p>
            )}
          </div>
          <div className={cn(
            'flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110 shrink-0',
            a.iconBg, a.iconText,
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── ExplorerFilterBar ──────────────────────── */
export type FilterChip = {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
};

export function ExplorerFilterBar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters,
  sort,
  children,
  className,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterChip[];
  sort?: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
    direction?: 'asc' | 'desc';
    onDirectionToggle?: () => void;
  };
  children?: React.ReactNode;
  className?: string;
}) {
  const activeFilters = filters?.filter((f) => f.value) ?? [];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Search */}
        {onSearch !== undefined && (
          <div className="relative flex-1 min-w-0 sm:min-w-[220px] max-w-md group/search w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 group-focus-within/search:text-primary transition-colors" />
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 pl-9 text-sm"
            />
            {search && (
              <button
                onClick={() => onSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Sort */}
        {sort && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Select value={sort.value} onValueChange={sort.onChange}>
              <SelectTrigger className="h-9 w-auto min-w-[110px] sm:min-w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sort.options.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-sm">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sort.onDirectionToggle && (
              <button
                onClick={sort.onDirectionToggle}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sort.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
            )}
          </div>
        )}

        {/* Extra controls */}
        {children}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium">Filters:</span>
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className="gap-1.5 pl-2.5 pr-1.5 py-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors group/chip"
              onClick={f.onClear}
            >
              <span className="text-muted-foreground/60">{f.label}:</span>
              {f.value}
              <X className="h-3 w-3 text-muted-foreground/40 group-hover/chip:text-destructive transition-colors" />
            </Badge>
          ))}
          {activeFilters.length > 1 && (
            <button
              onClick={() => activeFilters.forEach((f) => f.onClear())}
              className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors underline underline-offset-2"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ExplorerSortHeader ─────────────────────── */
export function ExplorerSortHeader({
  label,
  sortKey,
  currentSort,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  direction: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
        active ? 'text-primary' : 'text-neutral-400 hover:text-white',
        className,
      )}
    >
      {label}
      {active ? (
        direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

/* ── ExplorerGrid ───────────────────────────── */
export function ExplorerGrid({
  children,
  cols = 3,
  className,
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const colsMap = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', colsMap[cols], className)}>
      {children}
    </div>
  );
}

/* ── ExplorerLiveDot ────────────────────────── */
export function ExplorerLiveDot({ connected, className }: { connected?: boolean; className?: string }) {
  return (
    <Badge variant={connected ? 'neon-emerald' : 'secondary'} className={cn('gap-1.5 px-2.5 py-1', className)}>
      <span className="relative flex h-1.5 w-1.5">
        {connected && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-emerald))] opacity-50 animate-ping" />
        )}
        <span className={cn(
          'relative inline-flex rounded-full h-1.5 w-1.5',
          connected ? 'bg-[hsl(var(--neon-emerald))]' : 'bg-[hsl(var(--neon-amber))]',
        )} />
      </span>
      {connected ? 'Live' : 'Offline'}
    </Badge>
  );
}

/* ── SectionDivider ─────────────────────────── */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <div className={cn('h-px w-full bg-neutral-800', className)} />
  );
}

/* ── ExplorerEmptyRow ───────────────────────── */
export function ExplorerEmptyRow({ cols, message = 'No data found' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-12 text-center">
        <p className="text-sm text-muted-foreground/60">{message}</p>
      </td>
    </tr>
  );
}

/* ── DataSourceBadge ────────────────────────── */
export function DataSourceBadge({ source, className }: { source: 'onchain' | 'offchain' | 'hybrid'; className?: string }) {
  const config = {
    onchain:  { label: 'On-Chain',  cls: 'data-source-onchain' },
    offchain: { label: 'Off-Chain', cls: 'data-source-offchain' },
    hybrid:   { label: 'Hybrid',    cls: 'gradient-text-arena text-hud font-semibold uppercase tracking-wider' },
  };
  const c = config[source];
  return (
    <span className={cn(c.cls, 'ml-2', className)}>
      {c.label}
    </span>
  );
}

/* ── ArenaCard (sci-fi elevated card) ────────── */
export function ArenaCard({
  children,
  className,
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: 'primary' | 'cyan' | 'emerald';
}) {
  const glowMap = {
    primary: 'hover:border-primary/30',
    cyan:    'hover:border-neutral-600',
    emerald: 'hover:border-neutral-600',
  };

  return (
    <div className={cn(
      'rounded-xl p-4 bg-neutral-900 border border-neutral-700 transition-all duration-300',
      glow && glowMap[glow],
      className,
    )}>
      {children}
    </div>
  );
}

/* ── ProtocolStats (quick status row) ────────── */
export function ProtocolStats({
  items,
  className,
}: {
  items: Array<{
    label: string;
    value: string | number;
    source: 'onchain' | 'offchain';
    accent?: 'primary' | 'cyan' | 'emerald' | 'amber';
  }>;
  className?: string;
}) {
  const accentColors = {
    primary: 'text-primary',
    cyan:    'text-white',
    emerald: 'text-white',
    amber:   'text-primary',
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-2', className)}>
      {items.map(({ label, value, source, accent }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-micro text-muted-foreground/50 uppercase tracking-wider">{label}</span>
          <span className={cn('text-sm font-semibold tabular-nums', accent ? accentColors[accent] : 'text-foreground')}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          <span className={source === 'onchain' ? 'data-source-onchain' : 'data-source-offchain'}>
            {source === 'onchain' ? '◆' : '○'}
          </span>
        </div>
      ))}
    </div>
  );
}
