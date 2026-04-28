'use client';

/**
 * Profile-page UI primitives
 *
 * Small, framework-light building blocks used by the agent profile page.
 * Each block enforces a single visual rule so the page composition stays
 * consistent without ad-hoc tailwind soup.
 *
 * Conventions:
 *   - Marked 'use client' because TokenAvatar holds error state. The other
 *     building blocks are pure and tree-shakeable.
 *   - Empty values render `EmptyValue` instead of "—" or "Not set" strings
 *     so the visual treatment is consistent.
 *   - All numbers are wrapped in `tabular-nums`.
 *   - Tooltips are provided via `title=` attribute (no JS required) so they
 *     work even if the page is server-rendered.
 */

import * as React from 'react';
import { cn } from '~/lib/utils';

/** Inline placeholder for missing values. Visually de-emphasised. */
export function EmptyValue({ label = '—' }: { label?: string }) {
  return <span className="text-neutral-600" aria-label="not available">{label}</span>;
}

/**
 * Small uppercase section label used above a content block.
 * Replaces ad-hoc `uppercase tracking-[0.15em] text-neutral-500` spans.
 */
export function SectionLabel({
  children,
  hint,
  className,
}: {
  children: React.ReactNode;
  /** Optional secondary hint shown after the label. */
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500', className)}>
      <span>{children}</span>
      {hint && <span className="font-normal normal-case tracking-normal text-neutral-600">{hint}</span>}
    </div>
  );
}

/**
 * A single label / value row. Used inside the QuickFacts panel, Overview,
 * and Identity Mapping. Renders nothing if value is null/undefined unless
 * `showEmpty` is true.
 */
export function DetailRow({
  label,
  value,
  hint,
  mono = false,
  showEmpty = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional small explanation appended after the label. */
  hint?: React.ReactNode;
  /** Render value in monospace + emerald (for addresses). */
  mono?: boolean;
  showEmpty?: boolean;
  className?: string;
}) {
  if (!showEmpty && (value == null || value === '' || value === '—' || value === 'Not set')) {
    return null;
  }
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-xs py-1.5', className)}>
      <span className="text-neutral-500 shrink-0" title={typeof hint === 'string' ? hint : undefined}>
        {label}
        {hint && <span className="ml-1 text-neutral-700 cursor-help" aria-hidden>ⓘ</span>}
      </span>
      <span className={cn('text-right break-all min-w-0 tabular-nums', mono ? 'font-mono text-emerald-300' : 'text-neutral-200')}>
        {value || <EmptyValue />}
      </span>
    </div>
  );
}

/**
 * Compact KPI tile used in the metrics row. Emerald accent.
 * Hides itself if the value is null/undefined and `hideIfEmpty` is true.
 */
export function MetricTile({
  label,
  value,
  hint,
  unit,
  tone = 'neutral',
  hideIfEmpty = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Tooltip explaining what the metric means / how it's computed. */
  hint?: string;
  /** Small suffix shown after the value (e.g. "SOL", "ms"). */
  unit?: string;
  tone?: 'neutral' | 'emerald' | 'amber' | 'cyan' | 'rose';
  hideIfEmpty?: boolean;
  className?: string;
}) {
  if (hideIfEmpty && (value == null || value === '' || value === '—')) return null;

  // Dim zero / null values so non-zero metrics actually pop.
  const isEmpty = value == null || value === '' || value === '—' || value === 0 || value === '0';

  const valueColor = isEmpty
    ? 'text-neutral-600'
    : tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'cyan'
          ? 'text-cyan-300'
          : tone === 'rose'
            ? 'text-rose-300'
            : 'text-neutral-100';

  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 transition-colors hover:border-neutral-700',
        className,
      )}
      title={hint}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-neutral-500">
        <span>{label}</span>
        {hint && <span className="text-neutral-700 cursor-help" aria-hidden>ⓘ</span>}
      </div>
      <div className={cn('mt-1 font-mono text-sm tabular-nums', valueColor)}>
        {value == null || value === '' ? <EmptyValue /> : value}
        {unit && value != null && value !== '' && <span className="ml-1 text-[11px] text-neutral-500">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * Verification pill — a checkbox-style badge that explains what was verified
 * and how. The tooltip is required: a verification claim without an audit
 * trail is worse than no claim at all.
 */
export function VerificationPill({
  label,
  verified,
  source,
  tone = 'emerald',
}: {
  label: string;
  verified: boolean;
  /** What was checked, e.g. "AgentAccount PDA exists". */
  source: string;
  tone?: 'emerald' | 'cyan' | 'amber';
}) {
  const okClasses =
    tone === 'cyan'
      ? 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30'
      : tone === 'amber'
        ? 'bg-amber-500/10 text-amber-200 border-amber-400/30'
        : 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]',
        verified ? okClasses : 'bg-neutral-900 text-neutral-500 border-neutral-800',
      )}
      title={`${verified ? 'Verified' : 'Not verified'} · ${source}`}
    >
      <span aria-hidden className="font-mono">{verified ? '✓' : '○'}</span>
      <span>{label}</span>
    </span>
  );
}

/**
 * Empty-state placeholder for sections that legitimately have no data yet.
 * Encourages a single next action (e.g. linking out to documentation).
 */
export function SectionEmpty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/30 px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center text-neutral-600">{icon}</div>}
      <p className="text-sm text-neutral-300">{title}</p>
      {description && <p className="mt-1 text-xs text-neutral-500 text-pretty">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Single circular token avatar. Falls back to a 2-letter monogram when no
 * logo URL is provided or the image fails to load.
 */
export function TokenAvatar({
  src,
  symbol,
  size = 20,
  className,
  title,
}: {
  src?: string | null;
  symbol: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  const showImg = src && !errored;
  const dim = { width: size, height: size };
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-800 ring-1 ring-neutral-900',
        className,
      )}
      style={dim}
      title={title ?? symbol}
      aria-label={symbol}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <span className="text-[8px] font-semibold uppercase text-neutral-400">{symbol.slice(0, 2)}</span>
      )}
    </span>
  );
}

/**
 * Overlapping stack of token avatars showing up to `max` items; remaining
 * tokens collapse into a "+N" pill on the right. Width-stable.
 */
export function TokenAvatarStack({
  tokens,
  max = 3,
  size = 20,
}: {
  tokens: Array<{ key: string; symbol: string; logo?: string | null; title?: string }>;
  max?: number;
  size?: number;
}) {
  const visible = tokens.slice(0, max);
  const rest = Math.max(0, tokens.length - visible.length);
  const overlap = Math.round(size * 0.35);
  return (
    <span className="inline-flex items-center" aria-label={`${tokens.length} tokens`}>
      {visible.map((t, i) => (
        <span
          key={t.key}
          style={{ marginLeft: i === 0 ? 0 : -overlap }}
          className="relative"
        >
          <TokenAvatar src={t.logo} symbol={t.symbol} size={size} title={t.title ?? t.symbol} />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{ marginLeft: -overlap, width: size, height: size }}
          className="relative inline-flex items-center justify-center overflow-hidden rounded-full bg-neutral-900 ring-1 ring-neutral-950 text-[9px] font-semibold tabular-nums text-neutral-300"
          title={`${rest} more`}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

/**
 * One row of the portfolio summary. An icon (token avatar or arbitrary
 * element), a primary label, the amount, and an optional USD subline.
 */
export function PortfolioRow({
  icon,
  label,
  sublabel,
  amount,
  usd,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  amount: React.ReactNode;
  usd?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-neutral-200 truncate">{label}</div>
        {sublabel && <div className="text-[10px] text-neutral-500 truncate">{sublabel}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-xs tabular-nums text-neutral-100">{amount}</div>
        {usd && <div className="font-mono text-[10px] tabular-nums text-neutral-500">{usd}</div>}
      </div>
    </div>
  );
}

// Re-import React for new client-state hook used in TokenAvatar

