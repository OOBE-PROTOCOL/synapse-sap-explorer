'use client';

/* ──────────────────────────────────────────────────────────
 * Protocol Detail Page — Shows all agents & capabilities
 * for a given protocol ID (e.g. "jupiter", "A2A").
 * ────────────────────────────────────────────────────────── */

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, ScoreRing, StatusBadge, Address, ProtocolBadge } from '~/components/ui';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

export default function ProtocolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id);
  const router = useRouter();
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });

  const loading = gLoading || aLoading;

  /* ── Extract protocol node ─────────────────────────── */
  const protocol = useMemo(() => {
    if (!graphData) return null;
    return graphData.nodes.find(
      (n) => n.type === 'protocol' && (String(n.meta?.protocolId ?? n.name) === decodedId),
    ) ?? null;
  }, [graphData, decodedId]);

  /* ── Agents using this protocol ────────────────────── */
  const agents = useMemo(() => {
    if (!protocol || !agentsData?.agents) return [];
    const agentPdas = protocol.meta?.agents ? String(protocol.meta.agents).split(', ').filter(Boolean) : [];
    return agentPdas.map((pda) => {
      const agent = agentsData.agents.find((a) => a.pda === pda);
      return {
        pda,
        name: agent?.identity?.name ?? null,
        wallet: agent?.identity?.wallet ?? null,
        reputationScore: agent?.identity?.reputationScore ?? 0,
        isActive: agent?.identity?.isActive ?? false,
        totalCallsServed: agent?.identity?.totalCallsServed ?? '0',
        description: agent?.identity?.description ?? '',
      };
    });
  }, [protocol, agentsData]);

  /* ── Capabilities under this protocol ──────────────── */
  const capabilities = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes
      .filter((n): n is GraphNode => n.type === 'capability' && String(n.meta?.protocolId) === decodedId)
      .map((c) => ({
        id: String(c.meta?.capabilityId ?? c.name),
        description: c.meta?.description ? String(c.meta.description) : null,
        version: c.meta?.version ? String(c.meta.version) : null,
        ownerCount: Number(c.meta?.ownerCount ?? 0),
      }));
  }, [graphData, decodedId]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!protocol) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-[13px] text-white/25">Protocol &ldquo;{decodedId}&rdquo; not found</p>
        <button onClick={() => router.push('/protocols')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> All Protocols
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Back + Header ────────────────────── */}
      <div>
        <button onClick={() => router.push('/protocols')} className="mb-4 flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors">
          <ArrowLeft className="h-3 w-3" /> All Protocols
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/[0.08] border border-cyan-500/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white">{decodedId}</h1>
              <ProtocolBadge protocol={decodedId} />
            </div>
            <p className="mt-0.5 text-[13px] text-white/30">{agents.length} agent{agents.length !== 1 ? 's' : ''} · {capabilities.length} capabilit{capabilities.length !== 1 ? 'ies' : 'y'}</p>
          </div>
        </div>
      </div>

      {/* ── Agents ───────────────────────────── */}
      <div className="glass-card-static p-5">
        <h2 className="mb-4 text-[14px] font-semibold text-white">Agents using this protocol</h2>
        {agents.length === 0 ? (
          <p className="text-[13px] text-white/25">No agents found</p>
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
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold tabular-nums text-white">{Number(a.totalCallsServed).toLocaleString()}</p>
                  <p className="text-[9px] text-white/25">calls</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Capabilities ─────────────────────── */}
      <div className="glass-card-static p-5">
        <h2 className="mb-4 text-[14px] font-semibold text-white">Capabilities</h2>
        {capabilities.length === 0 ? (
          <p className="text-[13px] text-white/25">No capabilities registered</p>
        ) : (
          <div className="space-y-2">
            {capabilities.map((c) => (
              <a
                key={c.id}
                href={`/capabilities/${encodeURIComponent(c.id)}`}
                className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
              >
                <span className="badge-amber text-[10px]">{c.id}</span>
                {c.version && <span className="badge-blue text-[9px]">v{c.version}</span>}
                <span className="flex-1 text-[11px] text-white/30 truncate">{c.description ?? ''}</span>
                <span className="text-[10px] text-white/20 tabular-nums">{c.ownerCount} owner{c.ownerCount !== 1 ? 's' : ''}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
