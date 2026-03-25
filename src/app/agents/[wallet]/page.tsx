'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Copy, Zap, Clock, TrendingUp, Shield, Activity } from 'lucide-react';
import { ScoreRing, StatusBadge, Address, ProtocolBadge, Skeleton, PageHeader, Tabs, EmptyState } from '~/components/ui';
import { useAgent, useTools, useEscrows, useFeedbacks, useAttestations, useVaults } from '~/hooks/use-sap';
import { toast } from 'sonner';

export default function AgentDetailPage() {
  const { wallet } = useParams<{ wallet: string }>();
  const router = useRouter();
  const { data, loading, error } = useAgent(wallet);
  const { data: toolsData } = useTools();
  const { data: escrowsData } = useEscrows();
  const { data: feedbacksData } = useFeedbacks();
  const { data: attestationsData } = useAttestations();
  const { data: vaultsData } = useVaults();
  const [activeTab, setActiveTab] = useState('overview');

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data?.profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-red-400">{error ?? 'Agent not found'}</p>
        <button onClick={() => router.push('/agents')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> Back to Agents
        </button>
      </div>
    );
  }

  const { profile } = data;
  const id = profile.identity;
  const computed = profile.computed;

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  /* ── Filter related entities for this agent ────────── */
  const agentTools = useMemo(() =>
    toolsData?.tools.filter((t) => t.descriptor?.agent === profile.pda) ?? [],
    [toolsData, profile.pda],
  );
  const agentEscrows = useMemo(() =>
    escrowsData?.escrows.filter((e) => e.agent === profile.pda) ?? [],
    [escrowsData, profile.pda],
  );
  const agentFeedbacks = useMemo(() =>
    feedbacksData?.feedbacks.filter((f) => f.agent === profile.pda) ?? [],
    [feedbacksData, profile.pda],
  );
  const agentAttestations = useMemo(() =>
    attestationsData?.attestations.filter((a) => a.agent === profile.pda) ?? [],
    [attestationsData, profile.pda],
  );
  const agentVaults = useMemo(() =>
    vaultsData?.vaults.filter((v) => v.agent === profile.pda) ?? [],
    [vaultsData, profile.pda],
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ───────────────────────────── */}
      <div>
        <button onClick={() => router.push('/agents')} className="mb-4 flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors">
          <ArrowLeft className="h-3 w-3" /> All Agents
        </button>
        <div className="flex items-start gap-5">
          <ScoreRing score={computed.reputationScore} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{id.name}</h1>
              <StatusBadge active={computed.isActive} />
              {computed.hasX402 && <span className="badge-amber">x402</span>}
            </div>
            <p className="mt-1 text-[13px] text-white/35">{id.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button onClick={() => copyAddress(profile.pda)} className="flex items-center gap-1 text-[12px] text-blue-400/60 hover:text-blue-400 transition-colors" title="Copy PDA">
                <span className="font-mono">{profile.pda.slice(0, 8)}…{profile.pda.slice(-6)}</span>
                <Copy className="h-3 w-3" />
              </button>
              <button onClick={() => copyAddress(id.wallet)} className="flex items-center gap-1 text-[12px] text-white/30 hover:text-white/50 transition-colors" title="Copy Wallet">
                <span className="font-mono">{id.wallet.slice(0, 8)}…{id.wallet.slice(-6)}</span>
                <Copy className="h-3 w-3" />
              </button>
              {id.x402Endpoint && (
                <a href={id.x402Endpoint} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-teal-400/70 hover:text-teal-400 transition-colors">
                  x402 endpoint <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Computed Summary ─────────────────── */}
      <div className="glass-card-static p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white">Agent Summary</h2>
          <span className={`badge ${computed.isActive ? 'badge-emerald' : 'badge-red'}`}>
            {computed.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{computed.reputationScore}</p>
            <p className="text-[10px] text-white/25">Reputation</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{Number(computed.totalCalls).toLocaleString()}</p>
            <p className="text-[10px] text-white/25">Total Calls</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{computed.capabilityCount}</p>
            <p className="text-[10px] text-white/25">Capabilities</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{computed.pricingTierCount}</p>
            <p className="text-[10px] text-white/25">Pricing Tiers</p>
          </div>
        </div>

        {computed.protocols.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {computed.protocols.map((p) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
        )}
      </div>

      {/* ── Stats Grid ───────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <Zap className="mb-2 h-4 w-4 text-blue-400" />
          <p className="metric-value">{Number(id.totalCallsServed).toLocaleString()}</p>
          <p className="metric-label">Total Calls</p>
        </div>
        <div className="stat-card">
          <Clock className="mb-2 h-4 w-4 text-teal-400" />
          <p className="metric-value">{id.avgLatencyMs}ms</p>
          <p className="metric-label">Avg Latency</p>
        </div>
        <div className="stat-card">
          <TrendingUp className="mb-2 h-4 w-4 text-emerald-400" />
          <p className="metric-value">{id.uptimePercent}%</p>
          <p className="metric-label">Uptime</p>
        </div>
        <div className="stat-card">
          <Shield className="mb-2 h-4 w-4 text-amber-400" />
          <p className="metric-value">{id.reputationScore}</p>
          <p className="metric-label">Reputation (0–1000)</p>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────── */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'tools', label: 'Tools', count: agentTools.length },
          { value: 'escrows', label: 'Escrows', count: agentEscrows.length },
          { value: 'feedbacks', label: 'Feedbacks', count: agentFeedbacks.length },
          { value: 'attestations', label: 'Attestations', count: agentAttestations.length },
          { value: 'vault', label: 'Vault', count: agentVaults.length },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Tab: Overview ────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Capabilities */}
          {id.capabilities.length > 0 && (
            <div className="glass-card-static p-5">
              <h2 className="mb-4 text-[14px] font-semibold text-white">Capabilities</h2>
              <div className="space-y-2">
                {id.capabilities.map((c) => (
                  <a key={c.id} href={`/capabilities/${encodeURIComponent(c.id)}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.01] px-4 py-3 hover:bg-white/[0.03] transition-all duration-state ease-out-smooth">
                    <span className="font-mono text-[12px] text-white">{c.id}</span>
                    {c.protocolId && <ProtocolBadge protocol={c.protocolId} />}
                    {c.description && <span className="text-[11px] text-white/30">{c.description}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Pricing Tiers */}
          {id.pricing.length > 0 && (
            <div className="glass-card-static p-5">
              <h2 className="mb-4 text-[14px] font-semibold text-white">Pricing Tiers</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {id.pricing.map((p) => (
                  <div key={p.tierId} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400/70">{p.tierId}</p>
                    <p className="mt-1 text-lg font-bold text-white">{formatPrice(p.pricePerCall, p.tokenDecimals)}</p>
                    <p className="text-[10px] text-white/25">{formatTokenType(p.tokenType)} per call</p>
                    <div className="glow-line my-2" />
                    <div className="space-y-1 text-[10px] text-white/30">
                      <p>Rate limit: {p.rateLimit}/s</p>
                      <p>Max/session: {p.maxCallsPerSession === 0 ? '∞' : p.maxCallsPerSession}</p>
                      <p>Settlement: {formatSettlement(p.settlementMode)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Tab: Tools ───────────────────────── */}
      {activeTab === 'tools' && (
        <div className="glass-card-static p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-white">Registered Tools</h2>
          {agentTools.length === 0 ? (
            <EmptyState message="No tools registered by this agent" />
          ) : (
            <div className="space-y-2">
              {agentTools.map((t) => (
                <div key={t.pda} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
                  <span className="text-sm font-medium text-white">{t.descriptor?.toolName ?? 'Unnamed'}</span>
                  {t.descriptor?.httpMethod && (
                    <span className="badge-emerald text-[9px]">{typeof t.descriptor.httpMethod === 'object' ? Object.keys(t.descriptor.httpMethod)[0] : t.descriptor.httpMethod}</span>
                  )}
                  {t.descriptor?.category && (
                    <span className="badge-cyan text-[9px]">{typeof t.descriptor.category === 'object' ? Object.keys(t.descriptor.category)[0] : t.descriptor.category}</span>
                  )}
                  <span className="ml-auto text-[10px] text-white/20 tabular-nums">
                    {t.descriptor?.totalInvocations ?? 0} invocations
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Escrows ─────────────────────── */}
      {activeTab === 'escrows' && (
        <div className="glass-card-static p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-white">Escrow Accounts</h2>
          {agentEscrows.length === 0 ? (
            <EmptyState message="No escrows found for this agent" />
          ) : (
            <div className="space-y-3">
              {agentEscrows.map((e) => (
                <div key={e.pda} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Address value={e.pda} copy />
                    <span className={Number(e.balance) > 0 ? 'badge-emerald' : 'badge-red'}>
                      {Number(e.balance) > 0 ? 'Funded' : 'Empty'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-sm font-bold text-white tabular-nums">{e.balance}</p>
                      <p className="text-[9px] text-gray-500">Balance</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white tabular-nums">{e.totalDeposited}</p>
                      <p className="text-[9px] text-gray-500">Deposited</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white tabular-nums">{e.totalCallsSettled}</p>
                      <p className="text-[9px] text-gray-500">Calls Settled</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Feedbacks ────────────────────── */}
      {activeTab === 'feedbacks' && (
        <div className="glass-card-static p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-white">Feedback Received</h2>
          {agentFeedbacks.length === 0 ? (
            <EmptyState message="No feedback received yet" />
          ) : (
            <div className="space-y-2">
              {agentFeedbacks.map((f) => (
                <div key={f.pda} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/[0.08]">
                    <span className="text-xs font-bold text-amber-400">{f.score}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Address value={f.reviewer} />
                      {f.tag && <span className="badge-cyan text-[9px]">{f.tag}</span>}
                    </div>
                    <p className="text-[10px] text-white/20">{new Date(Number(f.createdAt) * 1000).toLocaleDateString()}</p>
                  </div>
                  {f.isRevoked && <span className="badge-red text-[9px]">Revoked</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Attestations ────────────────── */}
      {activeTab === 'attestations' && (
        <div className="glass-card-static p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-white">Attestations</h2>
          {agentAttestations.length === 0 ? (
            <EmptyState message="No attestations for this agent" />
          ) : (
            <div className="space-y-2">
              {agentAttestations.map((a) => (
                <div key={a.pda} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="badge-blue text-[9px]">{a.attestationType}</span>
                      <Address value={a.attester} />
                    </div>
                    <p className="text-[10px] text-white/20">{new Date(Number(a.createdAt) * 1000).toLocaleDateString()}</p>
                  </div>
                  <span className={a.isActive ? 'badge-emerald' : 'badge-red'}>{a.isActive ? 'Active' : 'Expired'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Vault ───────────────────────── */}
      {activeTab === 'vault' && (
        <div className="glass-card-static p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-white">Memory Vault</h2>
          {agentVaults.length === 0 ? (
            <EmptyState message="No memory vault for this agent" />
          ) : (
            <div className="space-y-3">
              {agentVaults.map((v) => (
                <div key={v.pda} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                  <Address value={v.pda} copy />
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-sm font-bold text-white tabular-nums">{v.totalSessions}</p>
                      <p className="text-[9px] text-gray-500">Sessions</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white tabular-nums">{v.totalInscriptions}</p>
                      <p className="text-[9px] text-gray-500">Inscriptions</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white tabular-nums">{v.totalBytesInscribed}</p>
                      <p className="text-[9px] text-gray-500">Bytes</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-gray-600">
                    Protocol v{v.protocolVersion} · Nonce v{v.nonceVersion}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Timestamps ───────────────────────── */}
      <div className="flex flex-wrap gap-4 text-[10px] text-white/20">
        <span>Created: {new Date(Number(id.createdAt) * 1000).toLocaleDateString()}</span>
        <span>Updated: {new Date(Number(id.updatedAt) * 1000).toLocaleDateString()}</span>
        <span>Version: {id.version}</span>
      </div>
    </div>
  );
}

function formatPrice(lamportsStr: string, decimals?: number | null): string {
  const n = Number(lamportsStr);
  const dec = decimals ?? 9;
  return (n / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
}

function formatTokenType(t: any): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return Object.keys(t)[0] ?? 'token';
  return 'token';
}

function formatSettlement(s: any): string {
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') return Object.keys(s)[0] ?? 'x402';
  return 'x402';
}
