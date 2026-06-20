/**
 * FairScaleAggregatedChip — full-width "Reputation Aggregation"
 * panel rendered between the identity/performance grid and the
 * Merchant Readiness band.
 *
 * Anatomy (per shadcn-explorer skill — Page Anatomy):
 *  ┌─ header ──────────────────────────────────────────────┐
 *  │  Reputation Aggregation        [logo group] [tier]    │
 *  │  caption                                              │
 *  ├─ body (3 columns on lg) ──────────────────────────────│
 *  │  Combined score │ SAP block │ FairScale block         │
 *  └───────────────────────────────────────────────────────┘
 *
 * - Typography: numeric values use `tabular-nums`. Labels are
 *   uppercase 10px tracked, matching `SectionLabel` elsewhere.
 * - Colors: semantic design tokens plus status colors.
 * - Hover detail is exposed via `Tooltip` (shadcn) — no in-flow
 *   raw error lines / debug strings.
 * - Source attribution: an avatar pair (FairScale + Synapse
 *   Explorer) sits at the right edge of the header, mirroring how
 *   data-source badges appear in shadcn dashboards.
 */
'use client';

import { Sparkles, Loader2, Info, TrendingUp } from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import {
  useAggregatedReputation,
  type AggregatedReputation,
} from '~/hooks/use-aggregated-reputation';

type Tier = AggregatedReputation['combined']['tier'];

const TIER_BADGE: Record<Tier, string> = {
  low: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  elite: 'border-primary/30 bg-primary/10 text-primary',
};

const TIER_HINT: Record<Tier, string> = {
  low: 'Below threshold — limited public signal or weak track record.',
  medium: 'Some history available; not yet enough to recommend at scale.',
  high: 'Strong combined signal — safe for routine routing.',
  elite: 'Top-tier blended score across SAP and FairScale.',
};

const NOTE_LABELS: Record<string, string> = {
  sap_no_feedback_yet: 'No SAP feedbacks recorded yet for this agent.',
  fairscale_unavailable:
    'FairScale signal could not be retrieved right now (rate limit or API error).',
  fairscale_no_signal: 'FairScale has no recorded signal for this wallet.',
  sap_below_min_feedbacks:
    'SAP feedback count is below the minimum required for trust.',
  sap_not_registered: 'Wallet is not registered on the SAP program.',
};

function humanizeNote(note: string): string {
  const tag = note.split(':', 1)[0]?.trim() ?? note;
  return NOTE_LABELS[tag] ?? note;
}

/* ── Source avatar group ─────────────────────────────── */

function SourceAvatars() {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex items-center -space-x-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border bg-background ring-2 ring-card"
              aria-label="FairScale"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://fairscale.xyz/favicon.ico"
                alt=""
                className="h-3.5 w-3.5"
                onError={(e) => {
                  // Fallback to letter avatar
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  el.parentElement!.textContent = 'F';
                  el.parentElement!.classList.add(
                    'text-[10px]',
                    'font-semibold',
                    'text-primary',
                  );
                }}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>FairScale Agent &amp; Credit API</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border bg-background ring-2 ring-card"
              aria-label="Synapse Explorer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/explorer_logo.png"
                alt=""
                className="h-4 w-4 object-contain"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>Synapse SAP on-chain registry</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/* ── Source block (SAP / FairScale) ──────────────────── */

function SourceBlock({
  label,
  weight,
  score,
  caption,
  hint,
}: {
  label: string;
  weight: number;
  score: number | null | undefined;
  caption: string;
  hint: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em]">
        <span className="text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help font-mono normal-case tracking-normal text-muted-foreground tabular-nums">
              w {weight.toFixed(2)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px] text-[11px] leading-relaxed">
            {hint}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {score ?? '—'}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────── */

export function FairScaleAggregatedChip({
  wallet,
}: {
  wallet: string | null | undefined;
}) {
  const { data, error, loading } = useAggregatedReputation(wallet ?? null);

  if (!wallet) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* ── Header ────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Reputation Aggregation
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="What is this?"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
                  Blended reputation across the on-chain SAP registry
                  and the off-chain FairScale agent score. The combined
                  weight is rebalanced when a source has no signal.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              On-chain SAP signal merged with the FairScale Agent &amp;
              Credit score.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <SourceAvatars />
            {data && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'cursor-help rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      TIER_BADGE[data.combined.tier],
                    )}
                  >
                    {data.combined.tier}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-[11px] leading-relaxed">
                  {TIER_HINT[data.combined.tier]}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        {/* ── Loading / error ───────────────────────── */}
        {loading && !data && (
          <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Aggregating reputation sources…
          </div>
        )}
        {error && !data && (
          <div className="flex items-center gap-2 px-5 py-6 text-xs text-rose-700 dark:text-rose-400">
            <Info className="h-3.5 w-3.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">Reputation unavailable</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
                {error}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Body ──────────────────────────────────── */}
        {data && (
          <div className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Combined score */}
            <div className="rounded-md border bg-background px-4 py-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Combined score
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help font-mono normal-case tracking-normal text-muted-foreground tabular-nums">
                      conf {(data.combined.confidence * 100).toFixed(0)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-[11px] leading-relaxed">
                    Confidence reflects how much signal the score is
                    built on. It drops when one source has little or
                    no data.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums text-foreground leading-none">
                  {data.combined.score}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              {data.combined.notes.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Info className="h-3 w-3" />
                      Why this score
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[300px] text-[11px] leading-relaxed">
                    <ul className="space-y-1">
                      {data.combined.notes.map((n, i) => (
                        <li key={i}>· {humanizeNote(n)}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* SAP source */}
            <SourceBlock
              label="SAP"
              weight={data.combined.weights.sap}
              score={data.sap.score}
              caption={`${data.sap.totalFeedbacks} feedback${
                data.sap.totalFeedbacks === 1 ? '' : 's'
              }`}
              hint="On-chain Solana Agent Protocol score derived from registered feedbacks and calls served."
            />

            {/* FairScale source */}
            <SourceBlock
              label="FairScale"
              weight={data.combined.weights.fairscale}
              score={data.fairscale?.score ?? null}
              caption={
                data.fairscale?.recommendation?.label
                ?? data.fairscale?.tier
                ?? 'no signal'
              }
              hint="Off-chain FairScale agent score (description alignment, work history, verifications)."
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
