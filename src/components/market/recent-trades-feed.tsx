'use client';

import { useEffect, useState } from 'react';
import type { TradesResponse, TradeRow } from '~/app/api/market/genesis-trades/[genesis]/route';

interface RecentTradesFeedProps {
  genesisAddress: string | null | undefined;
  symbol?: string | null;
  /** Increment to force a refetch (e.g. after a successful swap). */
  refreshKey?: number;
}

const SHORT = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const TIME_AGO = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
};

export function RecentTradesFeed({ genesisAddress, symbol, refreshKey = 0 }: RecentTradesFeedProps) {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!genesisAddress) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/market/genesis-trades/${genesisAddress}?limit=50`)
      .then((r) => (r.ok ? (r.json() as Promise<TradesResponse>) : null))
      .then((j) => {
        if (cancelled || !j) return;
        setTrades(j.trades ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [genesisAddress, refreshKey]);

  return (
    <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/40">
      <div className="flex items-center justify-between border-b border-neutral-800/60 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-neutral-100">Recent trades</h3>
        {loading && <span className="text-[10px] text-neutral-500">syncing…</span>}
      </div>

      {trades.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-neutral-500">
          No trades yet for {symbol ?? 'this token'}.
        </div>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-neutral-900/95 backdrop-blur">
              <tr className="border-b border-neutral-800/60 text-left text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 font-medium tabular-nums">{symbol ?? 'Token'}</th>
                <th className="px-3 py-2 font-medium tabular-nums">SOL</th>
                <th className="px-3 py-2 font-medium tabular-nums">Price</th>
                <th className="px-3 py-2 font-medium">Trader</th>
                <th className="px-3 py-2 font-medium text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.signature}
                  className="border-b border-neutral-900/60 hover:bg-neutral-800/30 transition"
                >
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        t.side === 'buy'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {t.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-neutral-200">
                    {t.baseUi.toLocaleString(undefined, {
                      maximumFractionDigits: t.baseUi < 1 ? 4 : 2,
                    })}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-neutral-200">
                    {t.quoteUi.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-neutral-400">
                    {t.price > 0
                      ? t.price.toLocaleString(undefined, {
                          maximumSignificantDigits: 4,
                        })
                      : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <a
                      href={`https://solscan.io/tx/${t.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-neutral-400 hover:text-neutral-100"
                    >
                      {SHORT(t.trader)}
                    </a>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">
                    {TIME_AGO(t.blockTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
