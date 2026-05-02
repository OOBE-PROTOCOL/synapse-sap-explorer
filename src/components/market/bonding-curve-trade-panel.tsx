'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { ArrowDownUp, Sparkles, Wallet, ExternalLink } from 'lucide-react';
import { cn } from '~/lib/utils';

interface BondingCurveTradePanelProps {
  genesisAddress: string | null | undefined;
  symbol?: string | null;
  baseMint?: string | null;
  finalized?: boolean | null;
  /** Latest known price (SOL/token) — used for output preview + slippage maths. */
  priceSolPerToken?: number | null;
  /** Base-token decimals (default 9). */
  decimals?: number;
  /** Called once a swap lands; parent should refresh trades/chart. */
  onTradeLanded?: (sig: string, side: 'buy' | 'sell') => void;
}

const DEFAULT_DECIMALS = 9;
const PRESET_SLIPPAGE = [50, 100, 300, 1000];
const PERCENT_PRESETS = [25, 50, 75, 100] as const;
const QUOTE_DEBOUNCE_MS = 350;
const QUOTE_REFRESH_MS = 6_000;

interface LiveQuote {
  amountIn: string;
  amountOut: string;
  fee: string;
  creatorFee: string;
  swappable: boolean;
  firstBuyPending: boolean;
  fillPct: number;
  baseDecimals: number;
  quoteDecimals: number;
}

async function readJsonSafe(res: Response): Promise<unknown> {
  // Next.js sometimes returns empty bodies on uncaught crashes — read
  // text first so JSON.parse never throws "Unexpected end of JSON input"
  // and we can surface the actual server status to the user.
  const text = await res.text();
  if (!text) {
    return { error: `Empty response from server (HTTP ${res.status})` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/**
 * Pro-grade Buy/Sell panel for bonding-curve launches.
 *
 * Design references: Hyperliquid, Drift, Jupiter — single-card flow with
 * a 0→100% balance slider, big-number readout, slippage chips, and a
 * full-width sticky CTA.
 */
export function BondingCurveTradePanel({
  genesisAddress,
  symbol,
  baseMint,
  finalized,
  priceSolPerToken,
  decimals = DEFAULT_DECIMALS,
  onTradeLanded,
}: BondingCurveTradePanelProps) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [busy, setBusy] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string; sig?: string }>({
    kind: 'idle',
  });
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const tickSym = symbol ?? 'TOKEN';
  const amountUnit = side === 'buy' ? 'SOL' : tickSym;
  const previewUnit = side === 'buy' ? tickSym : 'SOL';
  const amtNum = Number(amount);

  // Output preview: prefer the server quote (true bonding-curve math
  // including fees + first-buy waiver). Fall back to indexed price when
  // the quote endpoint hasn't responded yet.
  const quoteOutUi = useMemo(() => {
    if (!quote) return null;
    const dec = side === 'buy' ? quote.baseDecimals : quote.quoteDecimals;
    try {
      const raw = BigInt(quote.amountOut);
      return Number(raw) / 10 ** dec;
    } catch {
      return null;
    }
  }, [quote, side]);

  const fallbackOut =
    Number.isFinite(amtNum) && amtNum > 0 && priceSolPerToken && priceSolPerToken > 0
      ? side === 'buy'
        ? amtNum / priceSolPerToken
        : amtNum * priceSolPerToken
      : null;

  const previewOut = quoteOutUi ?? fallbackOut;

  const currentBalance = side === 'buy' ? solBalance : tokenBalance;
  const balanceLabel = side === 'buy' ? 'SOL' : tickSym;

  /* ── Balance fetch (SOL + base-token ATA) ─────────────── */
  const refreshBalances = useCallback(async () => {
    if (!connected || !publicKey) {
      setSolBalance(null);
      setTokenBalance(null);
      return;
    }
    // Fetch SOL and token balance independently so a failure on one doesn't
    // wipe the other (the token ATA call can fail for fresh mints / rate-limited RPC).
    connection
      .getBalance(publicKey, 'confirmed')
      .then((lamports) => setSolBalance(lamports / 1e9))
      .catch((err) => {
        console.warn('[trade-panel] SOL balance fetch failed:', err);
        setSolBalance(null);
      });

    if (!baseMint) {
      setTokenBalance(0);
      return;
    }
    try {
      const parsed = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: new PublicKey(baseMint) },
        'confirmed',
      );
      const acc = parsed.value[0]?.account.data.parsed?.info?.tokenAmount as
        | { uiAmount?: number | null; amount?: string; decimals?: number }
        | undefined;
      const ui =
        acc?.uiAmount ??
        (acc?.amount ? Number(acc.amount) / 10 ** (acc.decimals ?? decimals) : 0);
      setTokenBalance(Number.isFinite(ui) ? Number(ui) : 0);
    } catch (err) {
      console.warn('[trade-panel] Token balance fetch failed:', err);
      setTokenBalance(0);
    }
  }, [connection, publicKey, baseMint, connected, decimals]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  /* ── Live on-chain quote (debounced + auto-refresh) ────── */
  useEffect(() => {
    if (!genesisAddress || finalized) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }

    const rawAmount =
      side === 'buy'
        ? BigInt(Math.floor(amtNum * 1_000_000_000))
        : BigInt(Math.floor(amtNum * 10 ** decimals));
    if (rawAmount <= 0n) {
      setQuote(null);
      return;
    }

    const ctrl = new AbortController();
    let cancelled = false;

    const fetchQuote = async () => {
      setQuoting(true);
      try {
        const r = await fetch(`/api/market/genesis-quote/${genesisAddress}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ side, amount: rawAmount.toString() }),
          signal: ctrl.signal,
        });
        const j = (await readJsonSafe(r)) as LiveQuote | { error: string };
        if (cancelled) return;
        if (!r.ok || 'error' in j) {
          setQuote(null);
          setQuoteErr('error' in j ? j.error : `HTTP ${r.status}`);
        } else {
          setQuote(j);
          setQuoteErr(null);
        }
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === 'AbortError')) return;
        setQuoteErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setQuoting(false);
      }
    };

    const debounce = setTimeout(fetchQuote, QUOTE_DEBOUNCE_MS);
    const interval = setInterval(fetchQuote, QUOTE_REFRESH_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(debounce);
      clearInterval(interval);
    };
  }, [genesisAddress, finalized, side, amtNum, decimals]);

  /* ── Slider (% of balance) ─────────────────────────────── */
  const sliderPct = useMemo(() => {
    if (!currentBalance || currentBalance <= 0 || !amtNum || amtNum <= 0) return 0;
    return Math.min(100, (amtNum / currentBalance) * 100);
  }, [amtNum, currentBalance]);

  function applyPercent(pct: number) {
    if (!currentBalance || currentBalance <= 0) return;
    // For SOL buy, leave a small fee buffer when pressing MAX.
    const safeMax =
      side === 'buy' && pct === 100 ? Math.max(0, currentBalance - 0.01) : currentBalance;
    const next = (safeMax * pct) / 100;
    setAmount(next > 0 ? next.toFixed(side === 'buy' ? 4 : 2) : '');
  }

  /* ── Swap handler ───────────────────────────────────────── */
  async function handleSwap() {
    if (!genesisAddress || !connected || !publicKey) return;
    if (!Number.isFinite(amtNum) || amtNum <= 0) return;

    setBusy(true);
    setStatus({ kind: 'idle' });

    try {
      const rawAmount =
        side === 'buy'
          ? BigInt(Math.floor(amtNum * 1_000_000_000))
          : BigInt(Math.floor(amtNum * 10 ** decimals));

      // Prefer the server quote's exact `amountOut` (real curve math
      // including fees + first-buy waiver). Fall back to indexed price
      // when the quote endpoint hasn't responded yet.
      let minOut = 0n;
      if (quote) {
        try {
          const expectedRaw = BigInt(quote.amountOut);
          minOut = (expectedRaw * BigInt(10_000 - slippageBps)) / 10_000n;
        } catch {
          minOut = 0n;
        }
      } else if (priceSolPerToken && priceSolPerToken > 0) {
        const expectedUi =
          side === 'buy' ? amtNum / priceSolPerToken : amtNum * priceSolPerToken;
        const expectedRaw =
          side === 'buy'
            ? BigInt(Math.floor(expectedUi * 10 ** decimals))
            : BigInt(Math.floor(expectedUi * 1_000_000_000));
        minOut = (expectedRaw * BigInt(10_000 - slippageBps)) / 10_000n;
      }

      const buildRes = await fetch(`/api/market/genesis-swap/${genesisAddress}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trader: publicKey.toBase58(),
          side,
          amount: rawAmount.toString(),
          minAmountOutScaled: minOut.toString(),
        }),
      });
      const buildJson = (await readJsonSafe(buildRes)) as
        | { transaction: string; lastValidBlockHeight: number; blockhash: string }
        | { error: string };
      if (!buildRes.ok || 'error' in buildJson) {
        throw new Error('error' in buildJson ? buildJson.error : 'Swap build failed');
      }

      const tx = VersionedTransaction.deserialize(
        Uint8Array.from(Buffer.from(buildJson.transaction, 'base64')),
      );
      const sig = await sendTransaction(tx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });
      setStatus({ kind: 'ok', msg: 'Submitted — confirming…', sig });

      connection
        .confirmTransaction(
          {
            signature: sig,
            blockhash: buildJson.blockhash,
            lastValidBlockHeight: buildJson.lastValidBlockHeight,
          },
          'confirmed',
        )
        .then(() => {
          setStatus({ kind: 'ok', msg: 'Confirmed', sig });
          setAmount('');
          refreshBalances();
          onTradeLanded?.(sig, side);
        })
        .catch((e: unknown) => {
          setStatus({
            kind: 'err',
            msg: `Confirm failed: ${e instanceof Error ? e.message : String(e)}`,
            sig,
          });
        });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  /* ── Graduated state ──────────────────────────────────── */
  if (finalized) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-card p-5">
        <div className="absolute inset-0 opacity-30 pointer-events-none [background:radial-gradient(circle_at_top_right,hsl(var(--neon-emerald)/0.18),transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Graduated · Live on AMM
            </span>
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {tickSym} migrated to Raydium
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            The bonding curve has finalised. Trade now via Jupiter for best routing across
            Raydium, Meteora, Orca and other pools.
          </p>
          <a
            href={`https://jup.ag/swap/SOL-${baseMint ?? genesisAddress ?? ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400"
          >
            Trade on Jupiter
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  }

  /* ── Active curve UI ──────────────────────────────────── */
  const sideAccent =
    side === 'buy' ? 'from-emerald-500/15 to-transparent' : 'from-rose-500/15 to-transparent';
  const ctaClass =
    side === 'buy'
      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-neutral-950 hover:brightness-110 shadow-[0_8px_24px_-12px_rgb(16_185_129_/_0.7)]'
      : 'bg-gradient-to-r from-rose-500 to-rose-400 text-neutral-50 hover:brightness-110 shadow-[0_8px_24px_-12px_rgb(244_63_94_/_0.7)]';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card backdrop-blur-xl">
      {/* Tinted glow according to side */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-32 pointer-events-none transition-opacity duration-500 bg-gradient-to-b',
          sideAccent,
        )}
      />

      <div className="relative p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <ArrowDownUp className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-tight">
                Trade {tickSym}
              </h3>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Bonding curve · native
              </p>
            </div>
          </div>
        </div>

        {/* Side toggle — segmented */}
        <div className="relative grid grid-cols-2 rounded-xl bg-muted/40 p-1">
          <div
            className={cn(
              'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-transform duration-300 ease-out',
              side === 'buy'
                ? 'translate-x-0 bg-emerald-500/15 ring-1 ring-emerald-400/40'
                : 'translate-x-[calc(100%+4px)] bg-rose-500/15 ring-1 ring-rose-400/40',
            )}
          />
          <button
            onClick={() => setSide('buy')}
            className={cn(
              'relative z-10 py-2 text-sm font-semibold transition',
              side === 'buy' ? 'text-emerald-300' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Buy
          </button>
          <button
            onClick={() => setSide('sell')}
            className={cn(
              'relative z-10 py-2 text-sm font-semibold transition',
              side === 'sell' ? 'text-rose-300' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Sell
          </button>
        </div>

        {/* Balance row — full-width, flex-end, refreshable */}
        <button
          onClick={refreshBalances}
          disabled={!connected}
          title="Refresh balance"
          className="flex w-full items-center justify-end gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition disabled:opacity-40"
        >
          <Wallet className="h-3 w-3" />
          <span className="text-muted-foreground/70">Balance</span>
          <span className="tabular-nums font-mono text-foreground">
            {!connected
              ? 'connect wallet'
              : currentBalance !== null
                ? `${currentBalance.toLocaleString(undefined, {
                    maximumFractionDigits: side === 'buy' ? 4 : 2,
                  })} ${balanceLabel}`
                : 'loading…'}
          </span>
        </button>

        {/* Amount input — big number */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-3 transition focus-within:border-primary/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              You {side === 'buy' ? 'pay' : 'sell'}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {sliderPct.toFixed(0)}% of balance
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-3xl font-bold text-foreground outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="shrink-0 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground">
              {amountUnit}
            </span>
          </div>

          {/* Native range slider — themed via .trade-slider */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(sliderPct)}
            disabled={!currentBalance || currentBalance <= 0}
            onChange={(e) => applyPercent(Number(e.target.value))}
            className={cn('trade-slider mt-3 w-full', side === 'sell' && 'is-sell')}
            style={{ ['--pct' as string]: `${sliderPct}%` }}
          />

          {/* Percent presets */}
          <div className="mt-2 grid grid-cols-4 gap-1">
            {PERCENT_PRESETS.map((pct) => (
              <button
                key={pct}
                onClick={() => applyPercent(pct)}
                disabled={!currentBalance || currentBalance <= 0}
                className={cn(
                  'rounded-md py-1 text-[10px] font-semibold uppercase tracking-wider transition',
                  'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Output preview — driven by live on-chain quote */}
        <div className="rounded-xl border border-border/40 bg-background/20 px-3 py-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              You receive ≈
            </span>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
              {previewOut !== null
                ? `${previewOut.toLocaleString(undefined, {
                    maximumFractionDigits: previewOut < 1 ? 6 : 4,
                  })} ${previewUnit}`
                : `— ${previewUnit}`}
            </span>
          </div>
          {quote && quote.fee !== '0' && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
              <span>Protocol fee</span>
              <span className="font-mono tabular-nums">
                {(Number(BigInt(quote.fee)) / 1e9).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}{' '}
                SOL
              </span>
            </div>
          )}
          {quote?.firstBuyPending && (
            <div className="text-[10px] text-amber-300">
              ⚠ First-buy restriction active — only the designated buyer can trade now
            </div>
          )}
          {quoteErr && !quote && (
            <div className="text-[10px] text-rose-300">Quote: {quoteErr}</div>
          )}
          {quoting && !quote && (
            <div className="text-[10px] text-muted-foreground/60">Pricing on-chain…</div>
          )}
        </div>

        {/* Slippage */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Slippage tolerance
            </span>
            <span className="text-[11px] tabular-nums font-semibold text-foreground">
              {(slippageBps / 100).toFixed(slippageBps < 100 ? 2 : 1)}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {PRESET_SLIPPAGE.map((bps) => (
              <button
                key={bps}
                onClick={() => setSlippageBps(bps)}
                className={cn(
                  'rounded-md py-1.5 text-[11px] font-medium transition tabular-nums',
                  slippageBps === bps
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleSwap}
          disabled={!connected || busy || !amount || amtNum <= 0}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wider transition',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:bg-none',
            ctaClass,
          )}
        >
          {!connected
            ? 'Connect wallet to trade'
            : busy
              ? 'Submitting…'
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${tickSym}`}
        </button>

        {/* Status */}
        {status.kind !== 'idle' && (
          <div
            className={cn(
              'rounded-md px-3 py-2 text-[11px]',
              status.kind === 'ok'
                ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20'
                : 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20',
            )}
          >
            <div className="font-medium">{status.msg}</div>
            {status.sig && (
              <a
                href={`https://solscan.io/tx/${status.sig}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block break-all underline-offset-2 hover:underline"
              >
                {status.sig.slice(0, 10)}…{status.sig.slice(-6)} ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
