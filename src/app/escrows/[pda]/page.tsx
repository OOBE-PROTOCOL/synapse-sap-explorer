'use client';

/* ──────────────────────────────────────────────────────────
 * Escrow Detail Page — /escrows/[pda]
 *
 * Full escrow account data: parties (agent ↔ depositor),
 * balance, settlement history, pricing, expiry, volume curve,
 * timestamps, raw on-chain data.
 * ────────────────────────────────────────────────────────── */

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Skeleton, Address } from '~/components/ui';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
} from '~/components/ui/explorer';
import { useEscrows, useAgents } from '~/hooks/use-sap';

export default function EscrowDetailPage() {
  const { pda } = useParams<{ pda: string }>();
  const router = useRouter();
  const { data, loading: eLoading } = useEscrows();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const loading = eLoading || aLoading;

  const escrow = useMemo(() => {
    if (!data?.escrows) return null;
    return data.escrows.find((e) => e.pda === pda) ?? null;
  }, [data, pda]);

  const agent = useMemo(() => {
    if (!escrow || !agentsData?.agents) return null;
    return agentsData.agents.find((a) => a.pda === escrow.agent) ?? null;
  }, [escrow, agentsData]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-[13px] text-white/25">Escrow not found: {pda}</p>
        <button onClick={() => router.push('/escrows')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> All Escrows
        </button>
      </div>
    );
  }

  const dec = escrow.tokenDecimals ?? 9;
  const formatAmount = (v: string | number) => (Number(v) / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
  const balance = Number(escrow.balance);
  const isExpired = escrow.expiresAt !== '0' && Number(escrow.expiresAt) * 1000 < Date.now();
  const hasBalance = balance > 0;

  return (
    <DetailPageShell
      backHref="/escrows"
      backLabel="All Escrows"
      title="Escrow Account"
      subtitle={`${escrow.pda.slice(0, 12)}…${escrow.pda.slice(-8)}`}
      onBack={() => router.push('/escrows')}
      badges={
        <>
          {isExpired ? (
            <span className="badge-red">Expired</span>
          ) : hasBalance ? (
            <span className="badge-emerald">Funded</span>
          ) : (
            <span className="badge-blue">Empty</span>
          )}
        </>
      }
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/[0.08] border border-emerald-500/10">
          <Wallet className="h-5 w-5 text-emerald-400" />
        </div>
      }
    >
      {/* ── Balance Stats ────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <p className="metric-value text-emerald-400">{formatAmount(escrow.balance)}</p>
          <p className="metric-label">Current Balance</p>
        </div>
        <div className="stat-card">
          <p className="metric-value">{formatAmount(escrow.totalDeposited)}</p>
          <p className="metric-label">Total Deposited</p>
        </div>
        <div className="stat-card">
          <p className="metric-value">{formatAmount(escrow.totalSettled)}</p>
          <p className="metric-label">Total Settled</p>
        </div>
        <div className="stat-card">
          <p className="metric-value">{Number(escrow.totalCallsSettled).toLocaleString()}</p>
          <p className="metric-label">Calls Settled</p>
        </div>
      </div>

      {/* ── Account Info ─────────────────────── */}
      <div className="glass-card-static p-5">
        <SectionHeader title="Account Information" />
        <CopyableField label="Escrow PDA" value={escrow.pda} />
        <CopyableField
          label="Agent"
          value={agent?.identity?.name ? `${agent.identity.name} (${escrow.agent.slice(0, 8)}…)` : escrow.agent}
          href={`/address/${escrow.agent}`}
        />
        <CopyableField label="Agent Wallet" value={escrow.agentWallet} href={`/address/${escrow.agentWallet}`} truncate />
        <CopyableField label="Depositor" value={escrow.depositor} href={`/address/${escrow.depositor}`} truncate />
        {escrow.tokenMint && (
          <CopyableField label="Token Mint" value={escrow.tokenMint} href={`/address/${escrow.tokenMint}`} truncate />
        )}
        <CopyableField label="Token Decimals" value={String(escrow.tokenDecimals)} mono={false} />
        <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
          <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Solscan</span>
          <SolscanLink type="account" value={escrow.pda} label="View on Solscan →" />
        </div>
      </div>

      {/* ── Pricing ──────────────────────────── */}
      <div className="glass-card-static p-5">
        <SectionHeader title="Pricing Configuration" />
        <CopyableField label="Price Per Call" value={`${formatAmount(escrow.pricePerCall)} tokens`} mono={false} />
        <CopyableField label="Max Calls" value={escrow.maxCalls === '0' ? '∞ (Unlimited)' : Number(escrow.maxCalls).toLocaleString()} mono={false} />
      </div>

      {/* ── Volume Curve ─────────────────────── */}
      {escrow.volumeCurve && escrow.volumeCurve.length > 0 && (
        <div className="glass-card-static p-5">
          <SectionHeader title="Volume Discount Curve" count={escrow.volumeCurve.length} />
          <div className="overflow-hidden rounded-xl border border-white/[0.04]">
            <div className="grid grid-cols-2 gap-2 border-b border-white/[0.06] px-4 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-white/25">After X Calls</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">Price Per Call</span>
            </div>
            {escrow.volumeCurve.map((tier: any, i: number) => (
              <div key={i} className="grid grid-cols-2 gap-2 px-4 py-2 border-b border-white/[0.03] last:border-0">
                <span className="text-[11px] font-mono tabular-nums text-white/50">{Number(tier.afterCalls).toLocaleString()}</span>
                <span className="text-[11px] font-mono tabular-nums text-white/50 text-right">{formatAmount(tier.pricePerCall)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timestamps ───────────────────────── */}
      <div className="glass-card-static p-5">
        <SectionHeader title="Timestamps" />
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Created</span>
            <TimestampDisplay unixSeconds={escrow.createdAt} />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Last Settled</span>
            <TimestampDisplay unixSeconds={escrow.lastSettledAt} />
          </div>
          {escrow.expiresAt !== '0' && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Expires</span>
              <TimestampDisplay unixSeconds={escrow.expiresAt} />
            </div>
          )}
        </div>
      </div>

      {/* ── Raw On-Chain Data ────────────────── */}
      <OnChainDataSection
        title="Raw Escrow Account (On-Chain)"
        data={escrow as unknown as Record<string, unknown>}
      />
    </DetailPageShell>
  );
}
