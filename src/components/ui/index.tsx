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
  const pct = Math.min(score, 1000) / 1000;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  const color = score >= 800
    ? 'url(#scoreGradHigh)'
    : score >= 500
      ? 'url(#scoreGradMid)'
      : 'url(#scoreGradLow)';

  return (
    <div className={cn('relative inline-flex items-center justify-center shrink-0', className)}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="scoreGradHigh" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="scoreGradMid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="scoreGradLow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={2.5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={2.5}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-foreground tabular-nums">{score}</span>
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
    <Card className={cn('', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {trend && (
              <p className={cn('text-xs font-medium', delta === 'down' ? 'text-destructive' : 'text-emerald-500 dark:text-emerald-400')}>
                {trend}
              </p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Protocol Badge ──────────────────────────── */
export function ProtocolBadge({ protocol }: { protocol: string }) {
  const variant = (() => {
    const map: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      jupiter: 'secondary',
      raydium: 'secondary',
      A2A: 'default',
      x402: 'outline',
      das: 'secondary',
      solana: 'default',
    };
    return map[protocol] ?? 'outline';
  })();

  return <Badge variant={variant} className="text-[10px] font-medium">{protocol}</Badge>;
}

/* ── Status Badge ────────────────────────────── */
export function StatusBadge({ active, size = 'sm' }: { active: boolean; size?: 'sm' | 'xs' }) {
  return (
    <Badge
      variant={active ? 'default' : 'secondary'}
      className={cn(
        'gap-1.5',
        active
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20'
          : 'bg-muted text-muted-foreground',
        size === 'xs' ? 'text-[9px] px-1.5 py-0' : 'text-[10px]',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/* ── Category Badge ──────────────────────────── */
export function CategoryBadge({ category }: { category: string }) {
  return <Badge variant="outline" className="text-[10px] font-medium">{category}</Badge>;
}

/* ── HTTP Method Badge ───────────────────────── */
export function HttpMethodBadge({ method }: { method: string }) {
  const label = typeof method === 'object' ? Object.keys(method)[0] ?? 'GET' : method;
  const colorMap: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    POST: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    PUT: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    PATCH: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] font-mono font-semibold', colorMap[label.toUpperCase()] ?? '')}>
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
export function Address({ value, className, copy }: { value: string; className?: string; copy?: boolean }) {
  if (!value) return null;
  const truncated = value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  if (copy) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(); }}
        className={cn('font-mono text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer', className)}
        title={`Copy: ${value}`}
      >
        {truncated}
      </button>
    );
  }

  return (
    <span className={cn('font-mono text-xs text-primary/70', className)} title={value}>
      {truncated}
    </span>
  );
}

/* ── Empty State ─────────────────────────────── */
export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
        {icon ?? (
          <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ── Progress Bar ────────────────────────────── */
export function ProgressBar({ value, max, label, className, color }: {
  value: number;
  max: number;
  label?: string;
  className?: string;
  color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground/70">{value} / {max}</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
          style={{
            width: `${pct}%`,
            ...(color ? { background: color } : {}),
          }}
        />
      </div>
    </div>
  );
}

/* ── Tabs (wrapper around shadcn Tabs) ────────── */
export function CustomTabs({ tabs, active, onChange, className }: {
  tabs: { value: string; label: string; count?: number }[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <ShadTabs value={active} onValueChange={onChange} className={className}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[10px] tabular-nums opacity-60">{tab.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </ShadTabs>
  );
}

// Backward compat alias
export { CustomTabs as Tabs };

/* ── DataRow ─────────────────────────────────── */
export function DataRow({ label, value, mono, className }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between py-2.5 border-b border-border/50 last:border-0', className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-foreground', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
