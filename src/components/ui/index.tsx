import { cn } from '~/lib/utils';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import {
  Tabs as ShadTabs,
  TabsList,
  TabsTrigger,
} from '~/components/ui/tabs';

/* ═══════════════════════════════════════════════════════════
 * Shared UI Component Library — shadcn-based
 *
 * Semantic color tokens for full light + dark support.
 * ═══════════════════════════════════════════════════════════ */

/* ── Score Ring ──────────────────────────────── */
export function ScoreRing({ score, size = 48, className }: { score: number; size?: number; className?: string }) {
  const pct = Math.min(score, 10000) / 10000;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  const color = score >= 8000
    ? 'url(#scoreGradHigh)'
    : score >= 5000
      ? 'url(#scoreGradMid)'
      : 'url(#scoreGradLow)';

  const showLabel = size >= 40;

  return (
    <div className={cn('relative inline-flex items-center justify-center shrink-0', className)}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="scoreGradHigh" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="scoreGradMid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
          <linearGradient id="scoreGradLow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#737373" />
            <stop offset="100%" stopColor="#525252" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#262626" strokeWidth={2.5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={2.5}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      {showLabel && <span className="absolute text-xs font-semibold text-white tabular-nums">{score}</span>}
    </div>
  );
}

/** Inline reputation bar — compact alternative to ScoreRing for small spaces */
export function ReputationBar({ score, max = 10000, className }: { score: number; max?: number; className?: string }) {
  const pct = Math.min(score, max) / max * 100;
  const barColor = score >= 8000 ? 'bg-gradient-to-r from-white to-primary'
    : score >= 5000 ? 'bg-gradient-to-r from-primary to-primary'
    : score > 0 ? 'bg-gradient-to-r from-neutral-500 to-neutral-400'
    : 'bg-neutral-700';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="font-mono font-bold text-white text-sm tabular-nums">{score.toLocaleString()}</span>
      <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden min-w-[60px] max-w-[100px]">
        <div className={cn('h-full rounded-full transition-all duration-700', barColor)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="text-xs text-neutral-600 tabular-nums">/ {max.toLocaleString()}</span>
    </div>
  );
}

/* ── Stat Card ───────────────────────────────── */
export function StatCard({ label, value, icon, trend, className, delta }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  delta?: 'up' | 'down' | 'neutral';
  className?: string;
}) {
  return (
    <Card className={cn('group overflow-hidden', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {trend && (
              <p className={cn('text-xs font-medium', delta === 'down' ? 'text-destructive' : 'text-emerald-500 dark:text-emerald-400')}>
                {trend}
              </p>
            )}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Protocol Badge ──────────────────────────── */
export function ProtocolBadge({ protocol }: { protocol: string }) {
  const colorMap: Record<string, string> = {
    A2A: 'border-primary/20 bg-primary/8 text-primary',
    x402: 'border-neutral-600 bg-neutral-800 text-white',
    jupiter: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    raydium: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    solana: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    das: 'border-primary/20 bg-primary/8 text-primary',
  };
  return (
    <Badge variant="outline" className={cn('text-xs font-medium tracking-wide', colorMap[protocol] ?? 'border-border/40 bg-muted/20 text-muted-foreground')}>
      {protocol}
    </Badge>
  );
}

/* ── Status Badge ────────────────────────────── */
export function StatusBadge({ active, size = 'sm' }: { active: boolean; size?: 'sm' | 'xs' }) {
  return (
    <Badge
      variant={active ? 'neon-emerald' : 'secondary'}
      className={cn(
        'gap-1.5',
        size === 'xs' ? 'text-xs px-1.5 py-0' : '',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : 'bg-neutral-500')} />
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/* ── Category Badge ──────────────────────────── */
export function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    DeFi: 'border-primary/20 bg-primary/8 text-primary',
    AI: 'border-neutral-600 bg-neutral-800 text-white',
    Oracle: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    Analytics: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    Infrastructure: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    Social: 'border-neutral-600 bg-neutral-800 text-neutral-300',
    Custom: 'border-neutral-700 bg-neutral-800/50 text-neutral-400',
  };
  return <Badge variant="outline" className={cn('text-xs font-medium', colorMap[category] ?? 'border-border/40 bg-muted/20 text-muted-foreground')}>{category}</Badge>;
}

/* ── HTTP Method Badge ───────────────────────── */
export function HttpMethodBadge({ method }: { method: string }) {
  const label = typeof method === 'object' ? Object.keys(method)[0] ?? 'GET' : method;
  const colorMap: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    POST: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    PUT: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    PATCH: 'bg-primary/15 text-primary dark:text-primary border-primary/20',
  };
  return (
    <Badge variant="outline" className={cn('text-xs font-mono font-semibold', colorMap[label.toUpperCase()] ?? '')}>
      {label.toUpperCase()}
    </Badge>
  );
}

/* ── Skeleton (re-export shadcn) ─────────────── */
export { Skeleton } from '~/components/ui/skeleton';

/* ── Page Header ─────────────────────────────── */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ── Truncated Address ───────────────────────── */
export function Address({
  value,
  className,
  copy,
  truncate,
}: {
  value: string;
  className?: string;
  copy?: boolean;
  truncate?: boolean;
}) {
  if (!value) return null;
  const display = truncate && value.length > 12
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  const wrapClass = truncate ? '' : '[overflow-wrap:anywhere]';

  if (copy) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(); }}
        className={cn('font-mono text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer text-left', wrapClass, className)}
        title={`Copy: ${value}`}
      >
        {display}
      </button>
    );
  }

  return (
    <span className={cn('font-mono text-xs text-primary/70', wrapClass, className)} title={value}>
      {display}
    </span>
  );
}

/* ── Empty State ─────────────────────────────── */
export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
        {icon ?? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ── Tabs (wrapper around shadcn Tabs) ────────── */
export function Tabs({ tabs, active, onChange, className }: {
  tabs: { value: string; label: string; count?: number }[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <ShadTabs value={active} onValueChange={onChange} className={className}>
      <TabsList className="rounded-b-none border-b-0 bg-card/60 overflow-x-auto max-w-full justify-start">
        {tabs.map((tab) => {
          const isMetaplex = tab.value === 'metaplex';
          const isActive = active === tab.value;
          const metaplexClass = isMetaplex && isActive
            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-[0_0_12px_-3px_rgba(251,191,36,0.2)]'
            : isMetaplex
              ? 'text-amber-300 hover:bg-amber-500/10'
              : '';

          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={metaplexClass}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs tabular-nums opacity-60">{tab.count}</span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </ShadTabs>
  );
}

/* ── USDC Icon ───────────────────────────────── */
export { UsdcIcon } from '~/components/ui/usdc-icon';

/* ── Agent Avatar ────────────────────────────── */
export { AgentAvatar } from '~/components/ui/agent-avatar';

/* ── Explorer Pagination ─────────────────────── */
export { ExplorerPagination, usePagination } from '~/components/ui/explorer-pagination';

/* ── Explorer Primitives ─────────────────────── */
export {
  ExplorerPageShell,
  ExplorerSection,
  ExplorerMetric,
  ExplorerFilterBar,
  ExplorerSortHeader,
  ExplorerGrid,
  ExplorerLiveDot,
  SectionDivider,
  ExplorerEmptyRow,
} from '~/components/ui/explorer-primitives';
export type { FilterChip } from '~/components/ui/explorer-primitives';


