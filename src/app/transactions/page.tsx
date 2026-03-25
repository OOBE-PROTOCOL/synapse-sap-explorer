'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader, Skeleton, EmptyState } from '~/components/ui';

/* ── Types ──────────────────────────────────── */
type TxProgram = { id: string; name: string | null };

type SapTx = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  memo: string | null;
  signer: string | null;
  fee: number;
  feeSol: number;
  programs: TxProgram[];
  sapInstructions: string[];
  instructionCount: number;
  innerInstructionCount: number;
  computeUnitsConsumed: number | null;
  signerBalanceChange: number;
  version: string;
};

/* ── Helpers ────────────────────────────────── */
function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ProgramBadge({ program }: { program: TxProgram }) {
  const isSAP = program.id === 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';
  const label = program.name ?? `${program.id.slice(0, 6)}…`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
        isSAP
          ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
          : 'bg-white/[0.04] text-white/50 border border-white/[0.06]'
      }`}
      title={program.id}
    >
      {label}
    </span>
  );
}

function InstructionBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
      {name}
    </span>
  );
}

/* ── Page ───────────────────────────────────── */
export default function TransactionsPage() {
  const [txs, setTxs] = useState<SapTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/sap/transactions')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setTxs(data.transactions ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Transactions" subtitle="On-chain SAP program transactions — full instruction traceability">
        <span className="text-[10px] tabular-nums text-white/25">
          {txs.length} transactions
        </span>
      </PageHeader>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card-static p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : txs.length === 0 ? (
        <EmptyState message="No SAP transactions found" />
      ) : (
        <div className="glass-card-static overflow-x-auto">
          {/* ── Table Header ─────────────────── */}
          <div className="grid grid-cols-[1fr_140px_1fr_110px_80px_70px_60px] gap-3 border-b border-white/[0.06] px-5 py-2.5">
            <span className="section-title">Signature</span>
            <span className="section-title">Signer</span>
            <span className="section-title">Programs & Instructions</span>
            <span className="section-title">Time</span>
            <span className="section-title text-right">Fee</span>
            <span className="section-title text-right">CU</span>
            <span className="section-title text-right">Status</span>
          </div>

          {/* ── Rows ─────────────────────────── */}
          <div className="divide-y divide-white/[0.03]">
            {txs.map((tx) => (
              <Link
                key={tx.signature}
                href={`/tx/${tx.signature}`}
                className="grid grid-cols-[1fr_140px_1fr_110px_80px_70px_60px] gap-3 px-5 py-3 hover:bg-white/[0.015] transition-all duration-150 items-start group"
              >
                {/* Signature */}
                <div className="min-w-0">
                  <span
                    className="font-mono text-[11px] text-blue-400/70 group-hover:text-blue-400 transition-colors truncate block"
                    title={tx.signature}
                  >
                    {tx.signature.slice(0, 20)}…{tx.signature.slice(-6)}
                  </span>
                  <span className="text-[9px] text-white/15 font-mono">
                    Slot {tx.slot.toLocaleString()}
                    {tx.version !== 'legacy' && ` · v${tx.version}`}
                  </span>
                </div>

                {/* Signer */}
                <div className="min-w-0">
                  {tx.signer ? (
                    <span
                      className="font-mono text-[10px] text-white/40 truncate block"
                      title={tx.signer}
                    >
                      {tx.signer.slice(0, 6)}…{tx.signer.slice(-4)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/15">—</span>
                  )}
                </div>

                {/* Programs & Instructions */}
                <div className="flex flex-wrap gap-1 min-w-0">
                  {tx.programs.map((p) => (
                    <ProgramBadge key={p.id} program={p} />
                  ))}
                  {tx.sapInstructions.map((name, i) => (
                    <InstructionBadge key={`${name}-${i}`} name={name} />
                  ))}
                  {tx.programs.length === 0 && tx.sapInstructions.length === 0 && (
                    <span className="text-[10px] text-white/15">—</span>
                  )}
                  <span className="text-[8px] text-white/15 self-center ml-1">
                    {tx.instructionCount} ix
                    {tx.innerInstructionCount > 0 && ` · ${tx.innerInstructionCount} inner`}
                  </span>
                </div>

                {/* Time */}
                <div>
                  {tx.blockTime ? (
                    <div>
                      <span className="text-[11px] text-white/35 block">
                        {timeAgo(tx.blockTime)}
                      </span>
                      <span className="text-[9px] text-white/15">
                        {new Date(tx.blockTime * 1000).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-white/15">—</span>
                  )}
                </div>

                {/* Fee */}
                <div className="text-right">
                  <span className="font-mono text-[10px] tabular-nums text-white/35">
                    {tx.feeSol > 0 ? `◎ ${tx.feeSol.toFixed(6)}` : '—'}
                  </span>
                </div>

                {/* Compute Units */}
                <div className="text-right">
                  <span className="font-mono text-[9px] tabular-nums text-white/25">
                    {tx.computeUnitsConsumed != null
                      ? tx.computeUnitsConsumed.toLocaleString()
                      : '—'}
                  </span>
                </div>

                {/* Status */}
                <div className="text-right">
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                      tx.err
                        ? 'bg-red-500/10 text-red-400 border border-red-500/15'
                        : 'bg-emerald-500/8 text-emerald-400 border border-emerald-500/10'
                    }`}
                  >
                    {tx.err ? 'Failed' : 'OK'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
