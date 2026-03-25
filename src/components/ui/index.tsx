import { cn } from '~/lib/utils';

/* ═══════════════════════════════════════════════════════════
 * UI Component Library — iOS 18 / macOS Sequoia Glassy Water
 *
 * Frosted glass surfaces, liquid gradients, pill shapes,
 * Apple-grade refinement with Solana on-chain data.
 * ═══════════════════════════════════════════════════════════ */

/* ── Score Ring (Aqua Gradient) ──────────────── */
export function ScoreRing({ score, size = 48, className }: { score: number; size?: number; className?: string }) {
  const pct = Math.min(score, 1000) / 1000;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  // Aqua-to-green gradient based on score
  const hue = 160 + pct * 60; // teal → green
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={2.5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={2.5}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-white/90 tabular-nums">{score}</span>
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
    <div className={cn('stat-card', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="metric-label">{label}</p>
          <p className="metric-value">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {trend && (
            <p className={cn('text-[10px] font-medium', delta === 'down' ? 'text-red-400/80' : 'text-emerald-400/80')}>
              {trend}
            </p>
          )}
        </div>
        <div className="icon-container h-10 w-10 bg-blue-500/[0.06] text-blue-400/80">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ── Protocol Badge ──────────────────────────── */
export function ProtocolBadge({ protocol }: { protocol: string }) {
  const colors: Record<string, string> = {
    jupiter: 'badge-emerald',
    raydium: 'badge-cyan',
    A2A: 'badge-blue',
    x402: 'badge-amber',
    das: 'badge-cyan',
    solana: 'badge-violet',
    pyth: 'badge-amber',
    switchboard: 'badge-emerald',
    wormhole: 'badge-red',
    marinade: 'badge-cyan',
    jito: 'badge-emerald',
    tensor: 'badge-amber',
    custom: 'badge-violet',
  };

  return <span className={colors[protocol] ?? 'badge-blue'}>{protocol}</span>;
}

/* ── Status Badge ────────────────────────────── */
export function StatusBadge({ active, size = 'sm' }: { active: boolean; size?: 'sm' | 'xs' }) {
  return (
    <span className={cn(
      'flex items-center gap-1.5 font-medium',
      active ? 'text-emerald-400/90' : 'text-white/30',
      size === 'xs' ? 'text-[9px]' : 'text-[11px]',
    )}>
      <span className={active ? 'status-active' : 'status-inactive'} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/* ── Category Badge ──────────────────────────── */
export function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    Swap: 'badge-emerald',
    Lend: 'badge-cyan',
    Stake: 'badge-violet',
    Nft: 'badge-amber',
    Payment: 'badge-emerald',
    Data: 'badge-blue',
    Governance: 'badge-violet',
    Bridge: 'badge-amber',
    Analytics: 'badge-cyan',
    Custom: 'badge-red',
  };
  return <span className={colors[category] ?? 'badge-blue'}>{category}</span>;
}

/* ── HTTP Method Badge ───────────────────────── */
export function HttpMethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'badge-emerald',
    POST: 'badge-blue',
    PUT: 'badge-amber',
    DELETE: 'badge-red',
    PATCH: 'badge-violet',
  };
  const label = typeof method === 'object' ? Object.keys(method)[0] ?? 'GET' : method;
  return <span className={colors[label.toUpperCase()] ?? 'badge-blue'}>{label.toUpperCase()}</span>;
}

/* ── Skeleton ────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

/* ── Page Header (Apple-style) ───────────────── */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-white/35">{subtitle}</p>}
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
        className={cn('font-mono text-[11px] text-blue-400/70 hover:text-blue-300 transition-colors cursor-pointer', className)}
        title={`Copy: ${value}`}
      >
        {truncated}
      </button>
    );
  }

  return (
    <span className={cn('font-mono text-[11px] text-blue-400/60', className)} title={value}>
      {truncated}
    </span>
  );
}

/* ── Empty State ─────────────────────────────── */
export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 icon-container h-14 w-14 bg-white/[0.04]">
        {icon ?? (
          <svg className="h-6 w-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <p className="text-[13px] text-white/30">{message}</p>
    </div>
  );
}

/* ── Progress Bar (Liquid Fill) ──────────────── */
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
          <span className="text-[12px] text-white/50">{label}</span>
          <span className="text-[10px] tabular-nums text-white/30">{value} / {max}</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${pct}%`,
            background: color ?? 'linear-gradient(90deg, rgba(59,130,246,0.7), rgba(20,184,166,0.6))',
          }}
        />
      </div>
    </div>
  );
}

/* ── Tabs (iOS Segmented Control) ────────────── */
export function Tabs({ tabs, active, onChange, className }: {
  tabs: { value: string; label: string; count?: number }[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-2xl p-1', className)}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'rounded-xl px-4 py-2 text-[12px] font-medium transition-all duration-300 relative',
            active === tab.value
              ? 'text-white'
              : 'text-white/35 hover:text-white/55',
          )}
          style={active === tab.value ? {
            background: 'rgba(59, 130, 246, 0.12)',
            boxShadow: '0 2px 8px -2px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
          } : {
            border: '1px solid transparent',
          }}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[9px] tabular-nums opacity-50">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── DataRow ─────────────────────────────────── */
export function DataRow({ label, value, mono, className }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between py-2.5', className)}>
      <span className="text-[12px] text-white/35">{label}</span>
      <span className={cn('text-[13px] text-white/80', mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}
