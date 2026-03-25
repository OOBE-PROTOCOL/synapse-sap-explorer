'use client';

/* ──────────────────────────────────────────────────────────
 * Transaction Detail Page — /tx/[signature]
 *
 * Solscan-style full transaction introspection:
 * Signature, slot, block time, fee, status, instructions,
 * log messages, account keys, balance changes, token changes.
 * ────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Layers, Terminal, Coins, ArrowUpDown } from 'lucide-react';
import { Skeleton, Tabs } from '~/components/ui';
import {
  CopyableField,
  TimestampDisplay,
  TxStatusBadge,
  SolscanLink,
  SlotDisplay,
  FeeDisplay,
  InstructionView,
  SectionHeader,
  DetailPageShell,
} from '~/components/ui/explorer';

type TxDetail = {
  signature: string;
  slot: number;
  blockTime: number | null;
  fee: number;
  status: 'success' | 'failed';
  error: any;
  version: string | number;
  accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
  instructions: Array<{
    programId: string;
    program?: string;
    type?: string;
    data?: string;
    accounts?: string[];
    parsed?: Record<string, unknown>;
    innerInstructions?: Array<{
      programId: string;
      program?: string;
      type?: string;
      parsed?: Record<string, unknown>;
    }>;
  }>;
  logs: string[];
  balanceChanges: Array<{ account: string; pre: number; post: number; change: number }>;
  tokenBalanceChanges: Array<{
    account: string;
    mint: string;
    owner: string | null;
    preAmount: string;
    postAmount: string;
    decimals: number;
  }>;
  computeUnitsConsumed: number | null;
};

export default function TransactionDetailPage() {
  const { signature } = useParams<{ signature: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!signature) return;
    fetch(`/api/sap/tx/${signature}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => { setTx(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [signature]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-96" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-red-400">{error ?? 'Transaction not found'}</p>
        <button onClick={() => router.push('/transactions')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> Back to Transactions
        </button>
      </div>
    );
  }

  return (
    <DetailPageShell
      backHref="/transactions"
      backLabel="All Transactions"
      title="Transaction Details"
      subtitle={`${tx.signature.slice(0, 20)}…${tx.signature.slice(-8)}`}
      badges={<TxStatusBadge success={tx.status === 'success'} />}
      onBack={() => router.push('/transactions')}
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/[0.08] border border-blue-500/10">
          <FileText className="h-5 w-5 text-blue-400" />
        </div>
      }
    >
      {/* ── Tabs ─────────────────────────────── */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'instructions', label: 'Instructions', count: tx.instructions.length },
          { value: 'logs', label: 'Logs', count: tx.logs.length },
          { value: 'accounts', label: 'Accounts', count: tx.accountKeys.length },
          { value: 'balances', label: 'Balance Changes', count: tx.balanceChanges.length + tx.tokenBalanceChanges.length },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Tab: Overview ────────────────────── */}
      {activeTab === 'overview' && (
        <div className="glass-card-static p-5">
          <CopyableField label="Signature" value={tx.signature} />
          <CopyableField
            label="Status"
            value={
              <TxStatusBadge success={tx.status === 'success'} />
            }
            mono={false}
          />
          <CopyableField
            label="Block (Slot)"
            value={tx.slot.toLocaleString()}
            href={`https://solscan.io/block/${tx.slot}`}
            external
          />
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
            <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Timestamp</span>
            <TimestampDisplay unixSeconds={tx.blockTime} />
          </div>
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
            <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Fee</span>
            <FeeDisplay lamports={tx.fee} />
          </div>
          {tx.computeUnitsConsumed !== null && (
            <CopyableField label="Compute Units" value={tx.computeUnitsConsumed.toLocaleString()} mono={false} />
          )}
          <CopyableField label="Version" value={String(tx.version)} mono={false} />
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
            <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Solscan</span>
            <SolscanLink type="tx" value={tx.signature} label="View on Solscan →" />
          </div>
          {tx.error && (
            <div className="mt-3 rounded-xl border border-red-500/10 bg-red-500/[0.04] p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400 block mb-1">Error</span>
              <pre className="text-[10px] font-mono text-red-400/70 break-all">{JSON.stringify(tx.error, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Instructions ────────────────── */}
      {activeTab === 'instructions' && (
        <div className="space-y-3">
          <SectionHeader title="Instructions" count={tx.instructions.length} />
          {tx.instructions.map((ix, i) => (
            <InstructionView key={i} instruction={ix} index={i} />
          ))}
        </div>
      )}

      {/* ── Tab: Logs ────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="glass-card-static p-5">
          <SectionHeader title="Program Logs" count={tx.logs.length} />
          {tx.logs.length === 0 ? (
            <p className="text-[13px] text-white/25">No logs available</p>
          ) : (
            <div className="rounded-xl bg-black/20 p-3 max-h-[600px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {tx.logs.map((log, i) => {
                const isInvoke = log.includes('invoke');
                const isSuccess = log.includes('success');
                const isFailed = log.includes('failed') || log.includes('error');
                const isLog = log.includes('Program log:');
                const isData = log.includes('Program data:');
                const isConsume = log.includes('consumed');

                return (
                  <div
                    key={i}
                    className={`flex gap-2 py-0.5 text-[10px] font-mono ${
                      isFailed ? 'text-red-400/80' :
                      isSuccess ? 'text-emerald-400/60' :
                      isInvoke ? 'text-blue-400/60' :
                      isData ? 'text-violet-400/50' :
                      isConsume ? 'text-amber-400/50' :
                      isLog ? 'text-white/50' :
                      'text-white/30'
                    }`}
                  >
                    <span className="text-white/10 w-6 text-right shrink-0 tabular-nums">{i}</span>
                    <span className="break-all">{log}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Accounts ────────────────────── */}
      {activeTab === 'accounts' && (
        <div className="glass-card-static overflow-hidden">
          <SectionHeader title="Account Keys" count={tx.accountKeys.length} className="px-5 pt-5" />
          <div className="grid grid-cols-12 gap-2 border-b border-white/[0.06] px-5 py-2.5">
            <span className="col-span-1 text-[9px] font-semibold uppercase tracking-wider text-white/25">#</span>
            <span className="col-span-6 text-[9px] font-semibold uppercase tracking-wider text-white/25">Address</span>
            <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25">Signer</span>
            <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25">Writable</span>
            <span className="col-span-1 text-[9px] font-semibold uppercase tracking-wider text-white/25"></span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {tx.accountKeys.map((acc, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-5 py-2.5 hover:bg-white/[0.01] transition-colors items-center">
                <span className="col-span-1 text-[10px] font-mono text-white/20 tabular-nums">{i}</span>
                <div className="col-span-6">
                  <a
                    href={`/address/${acc.pubkey}`}
                    className="text-[11px] font-mono text-blue-400/70 hover:text-blue-400 transition-colors truncate block"
                    title={acc.pubkey}
                  >
                    {acc.pubkey.slice(0, 12)}…{acc.pubkey.slice(-8)}
                  </a>
                </div>
                <div className="col-span-2">
                  {acc.signer && <span className="badge-emerald text-[8px]">Signer</span>}
                </div>
                <div className="col-span-2">
                  {acc.writable && <span className="badge-amber text-[8px]">Writable</span>}
                </div>
                <div className="col-span-1">
                  <SolscanLink type="account" value={acc.pubkey} label="" className="text-[9px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Balance Changes ─────────────── */}
      {activeTab === 'balances' && (
        <div className="space-y-6">
          {/* SOL Balance Changes */}
          {tx.balanceChanges.length > 0 && (
            <div className="glass-card-static overflow-hidden">
              <SectionHeader title="SOL Balance Changes" count={tx.balanceChanges.length} className="px-5 pt-5" />
              <div className="grid grid-cols-12 gap-2 border-b border-white/[0.06] px-5 py-2.5">
                <span className="col-span-6 text-[9px] font-semibold uppercase tracking-wider text-white/25">Account</span>
                <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">Before</span>
                <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">After</span>
                <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">Change</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {tx.balanceChanges.map((b, i) => {
                  const changeSol = b.change / 1e9;
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 px-5 py-2.5 hover:bg-white/[0.01] transition-colors items-center">
                      <div className="col-span-6">
                        <a href={`/address/${b.account}`} className="text-[10px] font-mono text-blue-400/60 hover:text-blue-400 transition-colors truncate block">
                          {b.account.slice(0, 10)}…{b.account.slice(-6)}
                        </a>
                      </div>
                      <span className="col-span-2 text-[10px] font-mono tabular-nums text-white/40 text-right">
                        {(b.pre / 1e9).toFixed(4)}
                      </span>
                      <span className="col-span-2 text-[10px] font-mono tabular-nums text-white/40 text-right">
                        {(b.post / 1e9).toFixed(4)}
                      </span>
                      <span className={`col-span-2 text-[10px] font-mono tabular-nums text-right font-semibold ${
                        changeSol > 0 ? 'text-emerald-400' : changeSol < 0 ? 'text-red-400' : 'text-white/30'
                      }`}>
                        {changeSol > 0 ? '+' : ''}{changeSol.toFixed(6)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Token Balance Changes */}
          {tx.tokenBalanceChanges.length > 0 && (
            <div className="glass-card-static overflow-hidden">
              <SectionHeader title="Token Balance Changes" count={tx.tokenBalanceChanges.length} className="px-5 pt-5" />
              <div className="grid grid-cols-12 gap-2 border-b border-white/[0.06] px-5 py-2.5">
                <span className="col-span-4 text-[9px] font-semibold uppercase tracking-wider text-white/25">Account</span>
                <span className="col-span-3 text-[9px] font-semibold uppercase tracking-wider text-white/25">Mint</span>
                <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">Before</span>
                <span className="col-span-3 text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">After</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {tx.tokenBalanceChanges.map((t, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-5 py-2.5 hover:bg-white/[0.01] transition-colors items-center">
                    <div className="col-span-4">
                      <a href={`/address/${t.account}`} className="text-[10px] font-mono text-blue-400/60 hover:text-blue-400 transition-colors truncate block">
                        {t.account.slice(0, 8)}…{t.account.slice(-4)}
                      </a>
                    </div>
                    <div className="col-span-3">
                      <a href={`/address/${t.mint}`} className="text-[10px] font-mono text-violet-400/60 hover:text-violet-400 transition-colors truncate block">
                        {t.mint.slice(0, 8)}…{t.mint.slice(-4)}
                      </a>
                    </div>
                    <span className="col-span-2 text-[10px] font-mono tabular-nums text-white/40 text-right">
                      {t.preAmount}
                    </span>
                    <span className="col-span-3 text-[10px] font-mono tabular-nums text-white/40 text-right">
                      {t.postAmount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tx.balanceChanges.length === 0 && tx.tokenBalanceChanges.length === 0 && (
            <div className="glass-card-static p-8 text-center">
              <p className="text-[13px] text-white/25">No balance changes in this transaction</p>
            </div>
          )}
        </div>
      )}
    </DetailPageShell>
  );
}
