'use client';

/* ──────────────────────────────────────────────────────────
 * Capability Detail Page — Shows all agents that advertise
 * a specific capability (e.g. "jupiter:swap:v1").
 * ────────────────────────────────────────────────────────── */

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, ScoreRing, StatusBadge, Address, ProtocolBadge } from '~/components/ui';
import { useGraph, useAgents } from '~/hooks/use-sap';

export default function CapabilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id);
  const router = useRouter();
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });

  const loading = gLoading || aLoading;

  /* ── Find the capability node ──────────────────────── */
  const capability = useMemo(() => {
    if (!graphData) return null;
    return graphData.nodes.find(
      (n) => n.type === 'capability' && (String(n.meta?.capabilityId ?? n.name) === decodedId),
    ) ?? null;
  }, [graphData, decodedId]);

  /* ── Agents that own this capability ───────────────── */
  const agents = useMemo(() => {
    if (!capability || !agentsData?.agents) return [];
    const ownerPdas = capability.meta?.owners ? String(capability.meta.owners).split(', ').filter(Boolean) : [];
    return ownerPdas.map((pda) => {
      const agent = agentsData.agents.find((a) => a.pda === pda);
      return {
        pda,
        name: agent?.identity?.name ?? null,
        wallet: agent?.identity?.wallet ?? null,
        reputationScore: agent?.identity?.reputationScore ?? 0,
        isActive: agent?.identity?.isActive ?? false,
        totalCallsServed: agent?.identity?.totalCallsServed ?? '0',
        avgLatencyMs: agent?.identity?.avgLatencyMs ?? 0,
        uptimePercent: agent?.identity?.uptimePercent ?? 0,
      };
    });
  }, [capability, agentsData]);

  const protocolId = capability?.meta?.protocolId ? String(capability.meta.protocolId) : null;
  const description = capability?.meta?.description ? String(capability.meta.description) : null;
  const version = capability?.meta?.version ? String(capability.meta.version) : null;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!capability) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-[13px] text-white/25">Capability &ldquo;{decodedId}&rdquo; not found</p>
        <button onClick={() => router.push('/capabilities')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> All Capabilities
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Back + Header ────────────────────── */}
      <div>
        <button onClick={() => router.push('/capabilities')} className="mb-4 flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors">
          <ArrowLeft className="h-3 w-3" /> All Capabilities
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/[0.08] border border-amber-500/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white">{decodedId}</h1>
              {version && <span className="badge-blue">v{version}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {protocolId && <ProtocolBadge protocol={protocolId} />}
              <span className="text-[13px] text-white/30">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Description ──────────────────────── */}
      {description && (
        <div className="glass-card-static p-5">
          <h2 className="mb-2 text-[14px] font-semibold text-white">Description</h2>
          <p className="text-[13px] text-white/40 leading-relaxed">{description}</p>
        </div>
      )}

      {/* ── Agents with this capability ──────── */}
      <div className="glass-card-static p-5">
        <h2 className="mb-4 text-[14px] font-semibold text-white">Agents with this capability</h2>
        {agents.length === 0 ? (
          <EmptyState message="No agents have registered this capability" />
        ) : (
          <div className="space-y-1">
            {agents.map((a) => (
              <a
                key={a.pda}
                href={a.wallet ? `/agents/${a.wallet}` : '#'}
                className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <ScoreRing score={a.reputationScore} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{a.name ?? 'Unknown Agent'}</p>
                    <StatusBadge active={a.isActive} size="xs" />
                  </div>
                  <Address value={a.pda} />
                </div>
                <div className="hidden sm:flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-white">{Number(a.totalCallsServed).toLocaleString()}</p>
                    <p className="text-[9px] text-white/25">calls</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-white">{a.avgLatencyMs}ms</p>
                    <p className="text-[9px] text-white/25">latency</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-white">{a.uptimePercent}%</p>
                    <p className="text-[9px] text-white/25">uptime</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Protocol link ────────────────────── */}
      {protocolId && (
        <div className="flex items-center gap-2 text-[10px] text-white/20">
          <span>Part of protocol:</span>
          <a href={`/protocols/${encodeURIComponent(protocolId)}`} className="text-blue-400/70 hover:text-blue-400 transition-colors">
            {protocolId} →
          </a>
        </div>
      )}
    </div>
  );
}
