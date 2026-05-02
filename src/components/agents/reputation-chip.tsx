/**
 * ReputationChip — Compact tier+score badge for agent listing cards.
 *
 * Stateless: receives the resolved `AggregatedReputation` (typically
 * from `useAggregatedReputationBatch().byWallet`) so the listing
 * fires ONE batch request instead of N per-card requests.
 */
'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { AggregatedReputation } from '~/hooks/use-aggregated-reputation';

type Tier = AggregatedReputation['combined']['tier'];

const TIER_STYLE: Record<Tier, string> = {
  low: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  elite: 'border-violet-400/40 bg-violet-500/15 text-violet-200',
};

export function ReputationChip({
  data,
  size = 'sm',
}: {
  data: AggregatedReputation | null | undefined;
  size?: 'xs' | 'sm';
}) {
  if (!data) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/20 text-muted-foreground/60',
          size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
        )}
        title="FairScale × SAP reputation pending"
      >
        <Sparkles className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        <span className="font-mono">—</span>
      </span>
    );
  }

  const { combined } = data;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums',
        TIER_STYLE[combined.tier],
        size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
      )}
      title={`FairScale × SAP · ${combined.tier} · confidence ${(combined.confidence * 100).toFixed(0)}%`}
    >
      <Sparkles className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      <span className="font-mono">{combined.score}</span>
      <span className="uppercase tracking-wider opacity-80">
        {combined.tier}
      </span>
    </span>
  );
}
