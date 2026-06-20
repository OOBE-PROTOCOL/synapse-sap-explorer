/**
 * ReputationTab — Full FairScale × SAP reputation breakdown.
 *
 * Composes the typed `AggregatedReputation` payload from the SDK
 * into a panel: combined hero score, SAP breakdown, FairScale
 * pillars + signals, badges, red flags, verifications, work history.
 *
 * All shapes come from `@oobe-protocol-labs/synapse-sap-sdk@^0.11.0`
 * via the `useAggregatedReputation` hook — this component never
 * re-defines reputation types.
 */
'use client';

import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  BadgeCheck,
  Activity,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ExplorerSection } from '~/components/ui/explorer-primitives';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import {
  useAggregatedReputation,
  type AggregatedReputation,
} from '~/hooks/use-aggregated-reputation';

type Tier = AggregatedReputation['combined']['tier'];

const TIER_HERO: Record<Tier, string> = {
  low: 'border-rose-500/30 bg-rose-500/5',
  medium: 'border-amber-500/30 bg-amber-500/5',
  high: 'border-emerald-500/30 bg-emerald-500/5',
  elite: 'border-primary/30 bg-primary/5',
};

const TIER_TEXT: Record<Tier, string> = {
  low: 'text-rose-700 dark:text-rose-400',
  medium: 'text-amber-700 dark:text-amber-400',
  high: 'text-emerald-700 dark:text-emerald-400',
  elite: 'text-primary',
};

export function ReputationTab({ wallet }: { wallet: string }) {
  const { data, error, loading, refetch } = useAggregatedReputation(wallet);

  if (loading && !data) {
    return (
      <ExplorerSection title="Reputation" icon={<Sparkles className="h-4 w-4" />}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Aggregating FairScale × SAP signals…
        </div>
      </ExplorerSection>
    );
  }

  if (error) {
    return (
      <ExplorerSection title="Reputation" icon={<Sparkles className="h-4 w-4" />}>
        <div className="flex items-center justify-between gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="text-sm text-rose-700 dark:text-rose-400">Failed to load reputation: {error}</div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </ExplorerSection>
    );
  }

  if (!data) return null;

  const { combined, sap, fairscale, meta } = data;

  return (
    <div className="space-y-4">
      {/* ── Hero ── */}
      <div
        className={cn(
          'rounded-xl border p-5 shadow-sm',
          TIER_HERO[combined.tier],
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> FairScale × SAP
              <span className="text-[10px] text-muted-foreground/70">
                · provider {meta.provider}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-5xl font-bold tabular-nums text-foreground">
                {combined.score}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                  TIER_TEXT[combined.tier],
                )}
              >
                {combined.tier}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              confidence {(combined.confidence * 100).toFixed(0)}% · weights{' '}
              SAP {combined.weights.sap.toFixed(2)} / FairScale{' '}
              {combined.weights.fairscale.toFixed(2)}
            </div>
          </div>

          {fairscale?.recommendation && (
            <div className="rounded-md border border-border bg-card/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Recommendation
              </div>
              <div className="text-sm font-semibold text-foreground">
                {fairscale.recommendation.label}
              </div>
            </div>
          )}
        </div>

        {combined.notes.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-border/50 pt-3 text-xs text-muted-foreground">
            {combined.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ── SAP × FairScale side-by-side ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ExplorerSection title="SAP On-chain" icon={<ShieldCheck className="h-4 w-4" />} dataSource="onchain">
          <SapBlock sap={sap} />
        </ExplorerSection>

        <ExplorerSection title="FairScale Off-chain" icon={<Activity className="h-4 w-4" />} dataSource="offchain">
          <FairScaleBlock fs={fairscale} />
        </ExplorerSection>
      </div>

      {/* ── Pillars ── */}
      {fairscale?.pillars && (
        <ExplorerSection title="FairScale Pillars" icon={<Activity className="h-4 w-4" />}>
          <PillarsGrid pillars={fairscale.pillars as unknown as Record<string, unknown>} />
        </ExplorerSection>
      )}

      {/* ── Badges & Red flags ── */}
      {(fairscale?.badges?.length || fairscale?.red_flags?.length) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {fairscale?.badges?.length ? (
            <ExplorerSection title="Badges" icon={<BadgeCheck className="h-4 w-4" />} count={fairscale.badges.length}>
              <div className="flex flex-wrap gap-1.5">
                {fairscale.badges.map((b, i) => (
                  <Badge key={i} variant="secondary" className="font-mono text-[10px]">
                    {String(b)}
                  </Badge>
                ))}
              </div>
            </ExplorerSection>
          ) : null}

          {fairscale?.red_flags?.length ? (
            <ExplorerSection
              title="Red flags"
              icon={<AlertTriangle className="h-4 w-4" />}
              count={fairscale.red_flags.length}
            >
              <ul className="space-y-1 text-xs text-rose-700 dark:text-rose-400">
                {fairscale.red_flags.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-rose-500">·</span>
                    <span>{String(r)}</span>
                  </li>
                ))}
              </ul>
            </ExplorerSection>
          ) : null}
        </div>
      ) : null}

      {/* ── Verifications ── */}
      {fairscale?.verifications && Object.keys(fairscale.verifications).length > 0 && (
        <ExplorerSection title="Verifications" icon={<ShieldCheck className="h-4 w-4" />}>
          <KvGrid obj={fairscale.verifications as Record<string, unknown>} />
        </ExplorerSection>
      )}

      <div className="text-[10px] text-muted-foreground">
        Computed at {new Date(meta.computedAt).toLocaleString()}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
 * Subcomponents — narrow, typed, dumb
 * ────────────────────────────────────────────── */

function SapBlock({ sap }: { sap: AggregatedReputation['sap'] }) {
  if (!sap.registered) {
    return (
      <div className="text-xs text-muted-foreground">
        Wallet not registered on the SAP program.
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <Row label="Registered">
        <Badge variant="secondary" className="font-mono">
          yes
        </Badge>
      </Row>
      <Row label="Active">
        <Badge
          variant={sap.isActive ? 'default' : 'secondary'}
          className="font-mono"
        >
          {sap.isActive ? 'active' : 'inactive'}
        </Badge>
      </Row>
      <Row label="Score">
        <span className="font-mono tabular-nums">
          {sap.score ?? '—'} / 100
        </span>
      </Row>
      <Row label="Total feedbacks">
        <span className="font-mono tabular-nums">
          {sap.totalFeedbacks.toLocaleString()}
        </span>
      </Row>
      <Row label="Calls served">
        <span className="font-mono tabular-nums">
          {formatCallsServed(
            (sap as { totalCallsServed?: number | string }).totalCallsServed,
          )}
        </span>
      </Row>
    </div>
  );
}

function FairScaleBlock({
  fs,
}: {
  fs: AggregatedReputation['fairscale'];
}) {
  if (!fs) {
    return (
      <div className="text-xs text-muted-foreground">
        No FairScale signal available for this wallet.
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <Row label="Score">
        <span className="font-mono tabular-nums">{fs.score} / 100</span>
      </Row>
      <Row label="Tier">
        <Badge variant="secondary" className="font-mono uppercase">
          {fs.tier}
        </Badge>
      </Row>
      {fs.recommendation && (
        <Row label="Recommendation">
          <span className="font-medium text-foreground">
            {fs.recommendation.label}
          </span>
        </Row>
      )}
      {fs.description_alignment != null && (
        <Row label="Description alignment">
          <span className="font-mono tabular-nums">
            {typeof fs.description_alignment === 'number'
              ? `${(fs.description_alignment * 100).toFixed(0)}%`
              : String(fs.description_alignment)}
          </span>
        </Row>
      )}
      {fs.work_history_sources != null && (
        <Row label="Work history sources">
          <span className="font-mono tabular-nums">
            {Array.isArray(fs.work_history_sources)
              ? fs.work_history_sources.length
              : String(fs.work_history_sources)}
          </span>
        </Row>
      )}
    </div>
  );
}

function PillarsGrid({ pillars }: { pillars: Record<string, unknown> }) {
  const entries = Object.entries(pillars).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v as number),
  ) as Array<[string, number]>;

  if (entries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No pillar data.</div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => {
        const pct = Math.max(0, Math.min(100, v));
        const tone =
          pct >= 75 ? 'bg-emerald-500'
          : pct >= 50 ? 'bg-amber-400'
          : 'bg-rose-500';
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-muted-foreground">{k}</span>
              <span className="font-mono tabular-nums text-foreground">
                {pct.toFixed(0)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', tone)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KvGrid({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">No data.</div>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="rounded-md border border-border bg-card/40 px-3 py-2"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {k}
          </div>
          <div className="font-mono text-xs text-foreground break-all">
            {renderValue(v)}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatCallsServed(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString();
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString() : v;
  }
  return String(v);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs">{children}</span>
    </div>
  );
}
