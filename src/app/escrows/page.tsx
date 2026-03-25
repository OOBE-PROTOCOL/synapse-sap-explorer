'use client';

/* ──────────────────────────────────────────────────────────
 * Escrows Page — On-chain escrow accounts (pre-funded payments)
 *
 * Shows all escrow accounts between depositors and agents,
 * including balance, settlement history, pricing, and expiry.
 * ────────────────────────────────────────────────────────── */

import { useState, useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, Address, StatusBadge } from '~/components/ui';
import { useEscrows, useAgents } from '~/hooks/use-sap';

export default function EscrowsPage() {
  const { data, loading, error } = useEscrows();
  const { data: agentsData } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');

  /* ── Enrich escrows with agent names ──────────────── */
  const enriched = useMemo(() => {
    if (!data?.escrows) return [];
    return data.escrows.map((e) => {
      const agent = agentsData?.agents.find((a) => a.pda === e.agent);
      return {
        ...e,
        agentName: agent?.identity?.name ?? null,
      };
    });
  }, [data, agentsData]);

  /* ── Filter ────────────────────────────────────────── */
  const filtered = enriched.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.pda.toLowerCase().includes(q) ||
      e.agent.toLowerCase().includes(q) ||
      e.depositor.toLowerCase().includes(q) ||
      (e.agentName ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Escrow Accounts" subtitle="Pre-funded payment escrows between depositors and agents">
        <span className="text-[10px] tabular-nums text-white/25">
          {data?.total ?? 0} escrows
        </span>
      </PageHeader>

      {/* filter */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search escrows…"
          className="input-field max-w-sm"
        />
      </div>

      {/* content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card-static p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No escrows match search' : 'No escrow accounts found on-chain'} />
      ) : (
        <div className="space-y-4">
          {filtered.map((e) => (
            <EscrowCard key={e.pda} escrow={e} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Escrow Card ──────────────────────────────────────── */

function EscrowCard({ escrow }: { escrow: any }) {
  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const totalSettled = Number(escrow.totalSettled);
  const pricePerCall = Number(escrow.pricePerCall);
  const callsSettled = Number(escrow.totalCallsSettled);
  const dec = escrow.tokenDecimals ?? 9;

  const formatAmount = (lamports: number) => (lamports / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
  const isExpired = escrow.expiresAt !== '0' && Number(escrow.expiresAt) * 1000 < Date.now();
  const hasBalance = balance > 0;

  return (
    <div className="glass-card group">
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/[0.08] border border-emerald-500/10 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
                <rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20M6 14h.01M10 14h.01" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {escrow.agentName ?? 'Unknown Agent'}
                </span>
                {isExpired ? (
                  <span className="badge-red text-[9px]">Expired</span>
                ) : hasBalance ? (
                  <span className="badge-emerald text-[9px]">Funded</span>
                ) : (
                  <span className="badge-blue text-[9px]">Empty</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-white/25">Escrow PDA</span>
                <Address value={escrow.pda} copy />
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] mt-1">
            <span className="text-white/25">Agent</span>
            <Address value={escrow.agent} copy />
            <span className="text-white/25">Depositor</span>
            <Address value={escrow.depositor} copy />
          </div>
        </div>

        {/* Right — stats */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-emerald-400">{formatAmount(balance)}</p>
            <p className="text-[9px] text-white/25 uppercase tracking-wider">Balance</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-white">{callsSettled.toLocaleString()}</p>
            <p className="text-[9px] text-white/25 uppercase tracking-wider">Calls Settled</p>
          </div>
        </div>
      </div>

      {/* Details row */}
      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-white/[0.04] text-[10px]">
        <span className="text-white/30">Price/call: <span className="text-white/60">{formatAmount(pricePerCall)}</span></span>
        <span className="text-white/30">Total deposited: <span className="text-white/60">{formatAmount(totalDeposited)}</span></span>
        <span className="text-white/30">Total settled: <span className="text-white/60">{formatAmount(totalSettled)}</span></span>
        {escrow.expiresAt !== '0' && (
          <span className="text-white/30">
            Expires: <span className={isExpired ? 'text-red-400' : 'text-white/60'}>
              {new Date(Number(escrow.expiresAt) * 1000).toLocaleDateString()}
            </span>
          </span>
        )}
        {escrow.volumeCurve.length > 0 && (
          <span className="text-cyan-400/60">📊 Volume curve ({escrow.volumeCurve.length} tiers)</span>
        )}
      </div>
    </div>
  );
}
