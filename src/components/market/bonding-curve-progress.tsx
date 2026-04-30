'use client';

import { useMemo } from 'react';

interface BondingCurveProgressProps {
  /** Current proceeds in SOL (from /api/market/genesis-onchain). */
  proceedsSol: number | null | undefined;
  /** Allocation progress 0..1 (alternative metric, fallback when proceeds unknown). */
  allocationProgress: number | null | undefined;
  /** Whether the curve has finalised (graduated). */
  finalized: boolean | null | undefined;
  /** Optional graduation target in SOL. Defaults to 85 SOL — Metaplex Genesis V2 launches usually aim for ~85 SOL of raised SOL before LP migration. */
  graduationTargetSol?: number;
  /** Token symbol for label clarity. */
  symbol?: string | null;
  /** Loading state from the genesis-onchain hook. */
  loading?: boolean;
}

const DEFAULT_TARGET_SOL = 85;

/**
 * Prominent gradient progress bar showing how close a bonding-curve launch is
 * to graduating into a permanent AMM pool.
 *
 * Two display modes:
 *   - Pre-graduation: shows raised SOL / target with animated gradient bar.
 *   - Post-graduation: shows a "Graduated" success badge and stops animating.
 *
 * Numbers use intl-style formatting (e.g. "12.34 SOL / 85 SOL"). When
 * proceeds aren't available we fall back to the allocation-progress ratio
 * so we still surface *something* while waiting for RPC.
 */
export function BondingCurveProgress({
  proceedsSol,
  allocationProgress,
  finalized,
  graduationTargetSol = DEFAULT_TARGET_SOL,
  symbol,
  loading = false,
}: BondingCurveProgressProps) {
  const pct = useMemo(() => {
    if (finalized) return 1;
    if (typeof proceedsSol === 'number' && proceedsSol >= 0) {
      return Math.min(1, proceedsSol / graduationTargetSol);
    }
    if (typeof allocationProgress === 'number') {
      return Math.min(1, Math.max(0, allocationProgress));
    }
    return 0;
  }, [proceedsSol, allocationProgress, finalized, graduationTargetSol]);

  const pctLabel = `${(pct * 100).toFixed(pct >= 0.1 ? 1 : 2)}%`;
  const remaining =
    typeof proceedsSol === 'number'
      ? Math.max(0, graduationTargetSol - proceedsSol)
      : null;

  return (
    <div className="rounded-xl border border-neutral-800/70 bg-gradient-to-br from-neutral-900/60 to-neutral-950/60 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Bonding curve
            </span>
            {finalized ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Graduated
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-neutral-100">
            {finalized
              ? `${symbol ?? 'Token'} migrated to AMM`
              : `Progress to graduation`}
          </h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-neutral-100">
            {pctLabel}
          </div>
          {!finalized && (
            <div className="text-[11px] text-neutral-500 tabular-nums">
              {typeof proceedsSol === 'number'
                ? `${proceedsSol.toFixed(2)} / ${graduationTargetSol} SOL`
                : loading
                  ? '…'
                  : '—'}
            </div>
          )}
        </div>
      </div>

      {/* Progress track with gradient fill + grad markers */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-neutral-800/80 ring-1 ring-inset ring-neutral-700/50">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            finalized
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400'
          }`}
          style={{ width: `${Math.max(0.5, pct * 100)}%` }}
        />
        {/* Shimmer overlay (only while live) */}
        {!finalized && pct > 0 && pct < 1 && (
          <div
            className="absolute inset-y-0 left-0 h-full w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)] bg-[length:200%_100%] animate-[shimmer_2.4s_linear_infinite]"
            style={{ width: `${Math.max(0.5, pct * 100)}%` }}
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
        <span>
          {finalized
            ? 'Liquidity pool deployed — trade via Raydium / Jupiter'
            : remaining !== null
              ? `${remaining.toFixed(2)} SOL until graduation`
              : 'Trade via the bonding curve to advance the bar'}
        </span>
        <span className="tabular-nums">
          {!finalized && typeof allocationProgress === 'number'
            ? `${(allocationProgress * 100).toFixed(1)}% supply allocated`
            : ''}
        </span>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}
