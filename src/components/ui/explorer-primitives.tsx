/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

/* ═══════════════════════════════════════════════════════════
 * Explorer Primitives — clean data-explorer UI
 *
 * Reusable building blocks for every explorer page:
 *   ExplorerPageShell  — full page wrapper (header + stats + content)
 *   ExplorerSection    — titled content block
 *   ExplorerMetric     — compact KPI display
 *   ExplorerFilterBar  — search + filter chips + sort controls
 *   ExplorerSortHeader — clickable table header with sort indicator
 *   ExplorerGrid       — responsive grid wrapper
 *   ExplorerLiveDot    — animated live indicator
 *   SectionDivider     — subtle separator
 *   DataSourceBadge    — on-chain / off-chain data source indicator
 *   ArenaCard          — backwards-compatible elevated card
 * ═══════════════════════════════════════════════════════════ */

import React from "react";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { Skeleton } from "./skeleton";

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
    <div className={cn("space-y-5 sm:space-y-6", className)}>
      {/* ── Header ─── */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance sm:text-3xl">
                  {title}
                </h1>
                {badge}
              </div>
              {subtitle && (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground text-pretty">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex w-full shrink-0 items-center justify-start gap-2 sm:w-auto sm:justify-end sm:pl-4">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Strip ─── */}
      {stats && (
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {stats}
        </div>
      )}

      {/* ── Content ─── */}
      {children}
    </div>
  );
}

/* ── ExplorerSection ────────────────────────── */
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
  dataSource?: "onchain" | "offchain" | "hybrid";
}) {
  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden border bg-card shadow-sm",
        className,
      )}
    >
      <CardHeader
        className={cn(
          "pb-0",
          compact ? "px-3 py-3 sm:px-4" : "px-4 pt-4 sm:px-5 sm:pt-5",
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold sm:text-base">
            {icon && (
              <span className="shrink-0 text-muted-foreground">
                {icon}
              </span>
            )}

            <span className="min-w-0 truncate">{title}</span>

            {count !== undefined && (
              <Badge
                variant="secondary"
                className="shrink-0 font-mono text-[0.65rem] tabular-nums sm:text-xs"
              >
                {count.toLocaleString()}
              </Badge>
            )}

            {dataSource && (
              <span className="shrink-0">
                <DataSourceBadge source={dataSource} />
              </span>
            )}
          </CardTitle>

          {actions && (
            <div className="flex w-full shrink-0 items-center justify-start sm:w-auto sm:justify-end">
              {actions}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          compact ? "px-3 pb-3 pt-3 sm:px-4 sm:pb-4" : "px-4 pb-4 pt-4 sm:px-5 sm:pb-5",
          noPadding && "p-0 pt-3",
        )}
      >
        <div className="min-w-0 overflow-hidden">
          {children}
        </div>
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
  accent = "primary",
  className,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  accent?: "primary" | "cyan" | "emerald" | "amber" | "rose";
  className?: string;
}) {
  const accentMap = {
    primary: { iconBg: "bg-primary/10 border-primary/20", iconText: "text-primary" },
    cyan: { iconBg: "bg-primary/10 border-primary/20", iconText: "text-primary" },
    emerald: { iconBg: "bg-primary/10 border-primary/20", iconText: "text-primary" },
    amber: { iconBg: "bg-primary/10 border-primary/20", iconText: "text-primary" },
    rose: { iconBg: "bg-destructive/10 border-destructive/20", iconText: "text-destructive" },
  };

  const a = accentMap[accent];
  const isEmptyValue = value === null || value === undefined || value.toString().includes("—");

  return (
    <Card
      className={cn(
        "group overflow-hidden border bg-card shadow-sm transition-colors duration-200 hover:border-primary/25",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <CardTitle className="truncate font-mono text-2xl tabular-nums">
            {isEmptyValue ? <Skeleton className="h-8 w-32" /> : typeof value === "number" ? value.toLocaleString() : value}
          </CardTitle>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200",
            a.iconBg,
            a.iconText,
          )}
        >
          {icon}
        </div>
      </CardHeader>
      {(sub || trend) && (
        <CardContent className="flex flex-col gap-1 p-4 pt-3">
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {trend && (
            <p
              className={cn(
                "text-xs font-medium tabular-nums",
                trend.direction === "up" && "text-primary",
                trend.direction === "down" && "text-destructive",
                trend.direction === "neutral" && "text-muted-foreground",
              )}
            >
              {trend.direction === "up" && "↑ "}
              {trend.direction === "down" && "↓ "}
              {trend.value}
            </p>
          )}
      </CardContent>
      )}
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
  searchPlaceholder = "Search…",
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
    direction?: "asc" | "desc";
    onDirectionToggle?: () => void;
  };
  children?: React.ReactNode;
  className?: string;
}) {
  const activeFilters = filters?.filter((f) => f.value) ?? [];

  return (
  <div className={cn("rounded-xl border bg-card p-3 shadow-sm", className)}>
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {/* Search */}
      {onSearch !== undefined && (
        <div className="group/search relative w-full min-w-0 sm:flex-1 sm:min-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within/search:text-primary" />

          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full pl-9 pr-10 text-sm"
          />

          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Controls row */}
      {(sort || children) && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Sort */}
          {sort && (
  <div className="flex w-full items-center gap-2 sm:w-auto">
    <div className="w-full">
      <Select value={sort.value} onValueChange={sort.onChange}>
      <SelectTrigger className="h-11 w-full  flex-1 text-sm sm:w-auto min-w-[140px]">
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
    </div>
    

    {sort.onDirectionToggle && (
      <button
        type="button"
        onClick={sort.onDirectionToggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={sort.direction === "asc" ? "Ascending" : "Descending"}
        aria-label={sort.direction === "asc" ? "Sort ascending" : "Sort descending"}
      >
        {sort.direction === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </button>
    )}
  </div>
)}

          {/* Extra controls */}
          {children && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {children}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Active filter chips */}
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
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active ? "text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-70" />
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
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4 sm:gap-5", colsMap[cols], className)}>{children}</div>
  );
}

/* ── ExplorerLiveDot ────────────────────────── */
export function ExplorerLiveDot({
  connected,
  className,
}: {
  connected?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant={connected ? "default" : "secondary"}
      className={cn("gap-1.5 px-2.5 py-1", className)}
    >
      <span className="relative flex h-1.5 w-1.5">
        {connected && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-50 motion-safe:animate-ping" />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-1.5 w-1.5",
            connected ? "bg-primary" : "bg-muted-foreground",
          )}
        />
      </span>
      {connected ? "Live" : "Offline"}
    </Badge>
  );
}

/* ── SectionDivider ─────────────────────────── */
export function SectionDivider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

/* ── ExplorerEmptyRow ───────────────────────── */
export function ExplorerEmptyRow({
  cols,
  message = "No data found",
}: {
  cols: number;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={cols} className="py-12 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </td>
    </tr>
  );
}

/* ── DataSourceBadge ────────────────────────── */
export function DataSourceBadge({
  source,
  className,
}: {
  source: "onchain" | "offchain" | "hybrid";
  className?: string;
}) {
  const config = {
    onchain: { label: "On-Chain", cls: "data-source-onchain" },
    offchain: { label: "Off-Chain", cls: "data-source-offchain" },
    hybrid: { label: "Hybrid", cls: "text-primary font-medium" },
  };
  const c = config[source];
  return <span className={cn(c.cls, "ml-2", className)}>{c.label}</span>;
}

/* ── ArenaCard (sci-fi elevated card) ────────── */
export function ArenaCard({
  children,
  className,
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: "primary" | "cyan" | "emerald";
}) {
  const glowMap = {
    primary: "hover:border-primary/30",
    cyan: "hover:border-primary/25",
    emerald: "hover:border-primary/25",
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm transition-colors duration-200",
        glow && glowMap[glow],
        className,
      )}
    >
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
    source: "onchain" | "offchain";
    accent?: "primary" | "cyan" | "emerald" | "amber";
  }>;
  className?: string;
}) {
  const accentColors = {
    primary: "text-primary",
    cyan: "text-primary",
    emerald: "text-primary",
    amber: "text-primary",
  };

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}
    >
      {items.map(({ label, value, source, accent }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-micro uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              accent ? accentColors[accent] : "text-foreground",
            )}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
          <span className={source === "onchain" ? "data-source-onchain" : "data-source-offchain"}>
            {source}
          </span>
        </div>
      ))}
    </div>
  );
}
