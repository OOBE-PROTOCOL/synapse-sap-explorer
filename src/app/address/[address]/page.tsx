'use client';

/* ──────────────────────────────────────────────────────────
 * Address Page — /address/[address]
 *
 * Universal address resolver — identifies what an on-chain
 * address is (agent, tool, escrow, wallet, etc.) and shows
 * all related data: balance, entity info, transactions.
 * ────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Globe, Bot, Wrench, Wallet, ShieldCheck, MessageSquare, Database } from 'lucide-react';
import { Skeleton, StatusBadge, Tabs, Address as AddressDisplay, ScoreRing, ProtocolBadge } from '~/components/ui';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  DIDIdentity,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
  FeeDisplay,
} from '~/components/ui/explorer';

const ENTITY_LABELS: Record<string, { label: string; color: string; Icon: any }> = {
  agent:       { label: 'SAP Agent',       color: 'badge-violet', Icon: Bot },
  tool:        { label: 'Tool Descriptor', color: 'badge-pink',   Icon: Wrench },
  escrow:      { label: 'Escrow Account',  color: 'badge-emerald', Icon: Wallet },
  attestation: { label: 'Attestation',     color: 'badge-cyan',   Icon: ShieldCheck },
  feedback:    { label: 'Feedback',        color: 'badge-amber',  Icon: MessageSquare },
  vault:       { label: 'Memory Vault',    color: 'badge-blue',   Icon: Database },
  wallet:      { label: 'Agent Wallet',    color: 'badge-violet', Icon: Bot },
  account:     { label: 'Account',         color: 'badge-blue',   Icon: Globe },
  unknown:     { label: 'Unknown',         color: 'badge-blue',   Icon: Globe },
};

type AddressData = {
  address: string;
  entityType: string;
  balance: number;
  owner: string | null;
  executable: boolean;
  rentEpoch: number | null;
  dataSize: number;
  agent: any;
  tool: any;
  escrow: any;
  attestation: any;
  feedback: any;
  vault: any;
  relatedTools: any[];
  relatedEscrows: any[];
  relatedAttestations: any[];
  relatedFeedbacks: any[];
  recentTransactions: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    err: boolean;
    memo: string | null;
  }>;
};

export default function AddressPage() {
  const { address } = useParams<{ address: string }>();
  const router = useRouter();
  const [data, setData] = useState<AddressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!address) return;
    fetch(`/api/sap/address/${address}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [address]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-96" />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-red-400">{error ?? 'Address not found'}</p>
        <button onClick={() => router.push('/')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> Home
        </button>
      </div>
    );
  }

  const entity = ENTITY_LABELS[data.entityType] ?? ENTITY_LABELS.unknown;
  const hasAgent = data.agent?.identity;
  const hasTool = data.tool?.descriptor;
  const totalRelated =
    data.relatedTools.length +
    data.relatedEscrows.length +
    data.relatedAttestations.length +
    data.relatedFeedbacks.length;

  return (
    <DetailPageShell
      backHref="/"
      backLabel="Home"
      title="Address"
      subtitle={`${data.address.slice(0, 16)}…${data.address.slice(-8)}`}
      onBack={() => router.back()}
      badges={<span className={entity.color}>{entity.label}</span>}
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/[0.08] border border-blue-500/10">
          <entity.Icon className="h-5 w-5 text-blue-400" />
        </div>
      }
    >
      {/* ── Tabs ─────────────────────────────── */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          ...(hasAgent ? [{ value: 'agent', label: 'Agent Data' }] : []),
          ...(hasTool ? [{ value: 'tool', label: 'Tool Data' }] : []),
          ...(totalRelated > 0 ? [{ value: 'related', label: 'Related', count: totalRelated }] : []),
          { value: 'transactions', label: 'Transactions', count: data.recentTransactions.length },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Tab: Overview ────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Balance & Account Info */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="stat-card">
              <p className="metric-value text-emerald-400">{(data.balance / 1e9).toFixed(6)}</p>
              <p className="metric-label">SOL Balance</p>
            </div>
            <div className="stat-card">
              <p className="metric-value">{data.dataSize.toLocaleString()}</p>
              <p className="metric-label">Data Size (bytes)</p>
            </div>
            <div className="stat-card">
              <p className="metric-value">{data.executable ? 'Yes' : 'No'}</p>
              <p className="metric-label">Executable</p>
            </div>
          </div>

          <div className="glass-card-static p-5">
            <SectionHeader title="Account Information" />
            <CopyableField label="Address" value={data.address} />
            <CopyableField label="Entity Type" value={entity.label} mono={false} />
            {data.owner && (
              <CopyableField label="Owner Program" value={data.owner} href={`/address/${data.owner}`} truncate />
            )}
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
              <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Balance</span>
              <FeeDisplay lamports={data.balance} />
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
              <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Solscan</span>
              <SolscanLink type="account" value={data.address} label="View on Solscan →" />
            </div>
          </div>

          {/* DID if agent */}
          {hasAgent && (
            <DIDIdentity
              agentId={data.agent.identity.agentId}
              agentUri={data.agent.identity.agentUri}
              wallet={data.agent.identity.wallet}
            />
          )}

          {/* Quick SAP entity summary */}
          {data.escrow && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Escrow Data" />
              <CopyableField label="Balance" value={`${Number(data.escrow.balance) / 1e9} SOL`} mono={false} />
              <CopyableField label="Agent" value={data.escrow.agent ?? ''} href={data.escrow.agent ? `/address/${data.escrow.agent}` : undefined} truncate />
              <CopyableField label="Depositor" value={data.escrow.depositor ?? ''} href={data.escrow.depositor ? `/address/${data.escrow.depositor}` : undefined} truncate />
              <a href={`/escrows/${data.address}`} className="text-[11px] text-blue-400/70 hover:text-blue-400 mt-2 block">View full escrow details →</a>
            </div>
          )}

          {data.attestation && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Attestation Data" />
              <CopyableField label="Type" value={data.attestation.attestationType ?? ''} mono={false} />
              <CopyableField label="Agent" value={data.attestation.agent ?? ''} href={data.attestation.agent ? `/address/${data.attestation.agent}` : undefined} truncate />
              <CopyableField label="Attester" value={data.attestation.attester ?? ''} href={data.attestation.attester ? `/address/${data.attestation.attester}` : undefined} truncate />
              <a href={`/attestations/${data.address}`} className="text-[11px] text-blue-400/70 hover:text-blue-400 mt-2 block">View full attestation details →</a>
            </div>
          )}

          {data.feedback && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Feedback Data" />
              <CopyableField label="Score" value={String(data.feedback.score ?? 0)} mono={false} />
              <CopyableField label="Tag" value={data.feedback.tag ?? ''} mono={false} />
              <CopyableField label="Reviewer" value={data.feedback.reviewer ?? ''} href={data.feedback.reviewer ? `/address/${data.feedback.reviewer}` : undefined} truncate />
            </div>
          )}

          {data.vault && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Memory Vault" />
              <CopyableField label="Sessions" value={String(data.vault.totalSessions ?? 0)} mono={false} />
              <CopyableField label="Inscriptions" value={String(data.vault.totalInscriptions ?? 0)} mono={false} />
              <CopyableField label="Bytes" value={String(data.vault.totalBytesInscribed ?? 0)} mono={false} />
            </div>
          )}
        </>
      )}

      {/* ── Tab: Agent Data ──────────────────── */}
      {activeTab === 'agent' && hasAgent && (
        <>
          <div className="glass-card-static p-5">
            <SectionHeader title="Agent Identity" />
            <div className="flex items-center gap-3 mb-4">
              <ScoreRing score={data.agent.identity.reputationScore} size={56} />
              <div>
                <p className="text-lg font-semibold text-white">{data.agent.identity.name}</p>
                <p className="text-[12px] text-white/30">{data.agent.identity.description}</p>
              </div>
              <StatusBadge active={data.agent.identity.isActive} />
            </div>
            <CopyableField label="Agent PDA" value={data.agent.pda} />
            <CopyableField label="Wallet" value={data.agent.identity.wallet} href={`/agents/${data.agent.identity.wallet}`} truncate />
            <CopyableField label="Reputation" value={`${data.agent.identity.reputationScore} / 1000`} mono={false} />
            <CopyableField label="Total Calls" value={Number(data.agent.identity.totalCallsServed).toLocaleString()} mono={false} />
            <CopyableField label="Avg Latency" value={`${data.agent.identity.avgLatencyMs}ms`} mono={false} />
            <CopyableField label="Uptime" value={`${data.agent.identity.uptimePercent}%`} mono={false} />
            <CopyableField label="Feedbacks" value={String(data.agent.identity.totalFeedbacks)} mono={false} />
            <CopyableField label="Version" value={String(data.agent.identity.version)} mono={false} />
            <div className="space-y-2 mt-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Created</span>
                <TimestampDisplay unixSeconds={data.agent.identity.createdAt} />
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Updated</span>
                <TimestampDisplay unixSeconds={data.agent.identity.updatedAt} />
              </div>
            </div>
          </div>

          <DIDIdentity
            agentId={data.agent.identity.agentId}
            agentUri={data.agent.identity.agentUri}
            wallet={data.agent.identity.wallet}
          />

          {/* Protocols */}
          {data.agent.identity.protocols?.length > 0 && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Protocols" count={data.agent.identity.protocols.length} />
              <div className="flex flex-wrap gap-2">
                {data.agent.identity.protocols.map((p: string) => (
                  <a key={p} href={`/protocols/${encodeURIComponent(p)}`}>
                    <ProtocolBadge protocol={p} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Capabilities */}
          {data.agent.identity.capabilities?.length > 0 && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Capabilities" count={data.agent.identity.capabilities.length} />
              <div className="space-y-1">
                {data.agent.identity.capabilities.map((c: any) => (
                  <a key={c.id} href={`/capabilities/${encodeURIComponent(c.id)}`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-mono text-[11px] text-white">{c.id}</span>
                    {c.protocolId && <ProtocolBadge protocol={c.protocolId} />}
                  </a>
                ))}
              </div>
            </div>
          )}

          <OnChainDataSection
            title="Raw Agent Account (On-Chain)"
            data={data.agent as Record<string, unknown>}
          />
        </>
      )}

      {/* ── Tab: Tool Data ───────────────────── */}
      {activeTab === 'tool' && hasTool && (
        <>
          <div className="glass-card-static p-5">
            <SectionHeader title="Tool Descriptor" />
            <CopyableField label="Tool Name" value={data.tool.descriptor.toolName} mono={false} />
            <CopyableField label="Tool PDA" value={data.tool.pda} />
            <CopyableField label="Agent" value={data.tool.descriptor.agent} href={`/address/${data.tool.descriptor.agent}`} truncate />
            <CopyableField label="Category" value={typeof data.tool.descriptor.category === 'object' ? Object.keys(data.tool.descriptor.category)[0] : String(data.tool.descriptor.category)} mono={false} />
            <CopyableField label="HTTP Method" value={typeof data.tool.descriptor.httpMethod === 'object' ? Object.keys(data.tool.descriptor.httpMethod)[0] : String(data.tool.descriptor.httpMethod)} mono={false} />
            <CopyableField label="Invocations" value={Number(data.tool.descriptor.totalInvocations).toLocaleString()} mono={false} />
            <CopyableField label="Params" value={`${data.tool.descriptor.requiredParams} required / ${data.tool.descriptor.paramsCount} total`} mono={false} />
          </div>

          <OnChainDataSection
            title="Raw Tool Descriptor (On-Chain)"
            data={data.tool as Record<string, unknown>}
          />
        </>
      )}

      {/* ── Tab: Related Entities ────────────── */}
      {activeTab === 'related' && (
        <div className="space-y-6">
          {data.relatedTools.length > 0 && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Related Tools" count={data.relatedTools.length} />
              <div className="space-y-1">
                {data.relatedTools.map((t: any) => (
                  <a key={t.pda} href={`/tools/${t.pda}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors">
                    <Wrench className="h-3.5 w-3.5 text-pink-400/60" />
                    <span className="text-[12px] text-white">{t.descriptor?.toolName ?? t.pda.slice(0, 12)}</span>
                    <span className="ml-auto text-[10px] text-white/20">{t.descriptor?.totalInvocations ?? 0} invocations</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {data.relatedEscrows.length > 0 && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Related Escrows" count={data.relatedEscrows.length} />
              <div className="space-y-1">
                {data.relatedEscrows.map((e: any) => (
                  <a key={e.pda} href={`/escrows/${e.pda}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors">
                    <Wallet className="h-3.5 w-3.5 text-emerald-400/60" />
                    <AddressDisplay value={e.pda} />
                    <span className="ml-auto text-[10px] text-white/20">{Number(e.account?.balance ?? 0) / 1e9} SOL</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {data.relatedAttestations.length > 0 && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Related Attestations" count={data.relatedAttestations.length} />
              <div className="space-y-1">
                {data.relatedAttestations.map((a: any) => (
                  <a key={a.pda} href={`/attestations/${a.pda}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors">
                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-400/60" />
                    <AddressDisplay value={a.pda} />
                    <span className="badge-cyan text-[8px] ml-auto">{a.account?.attestationType ?? 'attestation'}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {data.relatedFeedbacks.length > 0 && (
            <div className="glass-card-static p-5">
              <SectionHeader title="Related Feedbacks" count={data.relatedFeedbacks.length} />
              <div className="space-y-1">
                {data.relatedFeedbacks.map((f: any) => (
                  <a key={f.pda} href={`/address/${f.pda}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors">
                    <MessageSquare className="h-3.5 w-3.5 text-amber-400/60" />
                    <AddressDisplay value={f.pda} />
                    <span className="text-[10px] text-amber-400/60 ml-auto">Score: {f.account?.score ?? '—'}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Transactions ────────────────── */}
      {activeTab === 'transactions' && (
        <div className="glass-card-static overflow-hidden">
          <SectionHeader title="Recent Transactions" count={data.recentTransactions.length} className="px-5 pt-5" />
          {data.recentTransactions.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-white/25">No recent transactions</p>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-2 border-b border-white/[0.06] px-5 py-2.5">
                <span className="col-span-5 text-[9px] font-semibold uppercase tracking-wider text-white/25">Signature</span>
                <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25">Slot</span>
                <span className="col-span-3 text-[9px] font-semibold uppercase tracking-wider text-white/25">Time</span>
                <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wider text-white/25 text-right">Status</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {data.recentTransactions.map((tx) => (
                  <a
                    key={tx.signature}
                    href={`/tx/${tx.signature}`}
                    className="grid grid-cols-12 gap-2 px-5 py-3 hover:bg-white/[0.01] transition-colors items-center"
                  >
                    <div className="col-span-5">
                      <span className="font-mono text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors truncate block">
                        {tx.signature.slice(0, 20)}…{tx.signature.slice(-8)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-mono text-[11px] tabular-nums text-white/35">
                        {tx.slot.toLocaleString()}
                      </span>
                    </div>
                    <div className="col-span-3">
                      <TimestampDisplay unixSeconds={tx.blockTime} compact />
                    </div>
                    <div className="col-span-2 text-right">
                      <span className={`text-[10px] font-semibold ${tx.err ? 'text-red-400' : 'text-emerald-400'}`}>
                        {tx.err ? 'Failed' : 'Success'}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </DetailPageShell>
  );
}
