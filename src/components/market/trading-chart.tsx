'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  type DeepPartial,
  type ChartOptions,
} from 'lightweight-charts';
import type { OhlcvCandle, OhlcvResponse } from '~/app/api/market/genesis-ohlcv/[genesis]/route';

interface TradingChartProps {
  genesisAddress: string | null | undefined;
  /** Trade-side symbol used in the empty state. */
  symbol?: string | null;
}

const INTERVALS: Array<{ id: string; label: string }> = [
  { id: '1m',  label: '1m'  },
  { id: '5m',  label: '5m'  },
  { id: '15m', label: '15m' },
  { id: '1h',  label: '1H'  },
  { id: '4h',  label: '4H'  },
  { id: '1d',  label: '1D'  },
];

const CHART_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: 'transparent' },
    textColor: '#a3a3a3',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: 'rgba(120,120,120,0.06)' },
    horzLines: { color: 'rgba(120,120,120,0.06)' },
  },
  rightPriceScale: { borderColor: 'rgba(120,120,120,0.15)' },
  timeScale: {
    borderColor: 'rgba(120,120,120,0.15)',
    timeVisible: true,
    secondsVisible: false,
  },
  crosshair: { mode: 1 },
};

export function TradingChart({ genesisAddress, symbol }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [interval, setInterval] = useState('5m');
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);

  // Chart init (once per mount)
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: 360,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      borderVisible: false,
    });
    const volume = chart.addSeries(HistogramSeries, {
      color: 'rgba(120,120,120,0.4)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      chart.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // Fetch + push data on interval / address change
  useEffect(() => {
    if (!genesisAddress) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/market/genesis-ohlcv/${genesisAddress}?interval=${interval}&limit=500`)
      .then((r) => (r.ok ? (r.json() as Promise<OhlcvResponse>) : null))
      .then((j) => {
        if (cancelled || !j || !candleRef.current || !volumeRef.current) return;
        const candles = (j.candles ?? []) as OhlcvCandle[];
        setEmpty(candles.length === 0);

        const cd: CandlestickData<Time>[] = candles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const vd: HistogramData<Time>[] = candles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)',
        }));
        candleRef.current.setData(cd);
        volumeRef.current.setData(vd);
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => setEmpty(true))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [genesisAddress, interval]);

  return (
    <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/40">
      <div className="flex items-center justify-between border-b border-neutral-800/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-100">Price chart</h3>
          {loading && <span className="text-[10px] text-neutral-500">loading…</span>}
        </div>
        <div className="flex items-center gap-1 rounded-md bg-neutral-800/60 p-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv.id}
              onClick={() => setInterval(iv.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded transition ${
                interval === iv.id
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} className="w-full" style={{ height: 360 }} />
        {empty && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center px-6">
              <div className="text-sm text-neutral-400">No trades indexed yet</div>
              <div className="text-[11px] text-neutral-600 mt-1">
                Be the first to trade {symbol ?? 'this token'} — the chart populates as
                trades land on chain.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
