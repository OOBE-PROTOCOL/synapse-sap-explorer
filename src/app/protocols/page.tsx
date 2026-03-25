'use client';

/* ──────────────────────────────────────────────────────────
 * Protocols Page — Lists all protocols discovered on-chain
 *
 * Extracts protocols from the graph data (which already
 * enriches protocol nodes with agent counts & linked PDAs).
 * ────────────────────────────────────────────────────────── */

import { useState, useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, Address, ProtocolBadge } from '~/components/ui';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

export default function ProtocolsPage() {
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');

  const loading = gLoading || aLoading;

  /* ── Build protocol list from graph nodes ──────────── */
  const protocols = useMemo(() => {
    if (!graphData) return [];

    const protos = graphData.nodes
      .filter((n): n is GraphNode & { type: 'protocol' } => n.type === 'protocol')
      .map((n) => {
        const agentPdas = n.meta?.agents ? String(n.meta.agents).split(', ').filter(Boolean) : [];
        // Match agent PDAs to agent names from agentsData
        const agentNames = agentPdas.map((pda) => {
          const agent = agentsData?.agents.find((a) => a.pda === pda);
          return agent?.identity?.name ?? pda;
        });

        // Collect capabilities associated with this protocol
        const relatedCaps = graphData.nodes.filter(
          (cap) => cap.type === 'capability' && cap.meta?.protocolId === (n.meta?.protocolId ?? n.name),
        );

        return {
          id: String(n.meta?.protocolId ?? n.name),
          agentCount: Number(n.meta?.agentCount ?? agentPdas.length),
          agentPdas,
          agentNames,
          capabilities: relatedCaps.map((c) => ({
            id: String(c.meta?.capabilityId ?? c.name),
            description: c.meta?.description ? String(c.meta.description) : null,
            ownerCount: Number(c.meta?.ownerCount ?? 0),
          })),
        };
      })
      .sort((a, b) => b.agentCount - a.agentCount);

    return protos;
  }, [graphData, agentsData]);

  /* ── Search filter ─────────────────────────────────── */
  const filtered = protocols.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.id.toLowerCase().includes(q) || p.agentNames.some((n) => n.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Protocols" subtitle="On-chain protocols discovered across the SAP network">
        <span className="text-[10px] tabular-nums text-white/25">
          {protocols.length} protocols
        </span>
      </PageHeader>

      {/* ── Search ───────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search protocols…"
          className="input-field max-w-sm"
        />
      </div>

      {/* ── Content ──────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No protocols match your search' : 'No protocols discovered'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((proto) => (
            <ProtocolCard key={proto.id} protocol={proto} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Protocol Card ────────────────────────────────────── */

type ProtocolInfo = {
  id: string;
  agentCount: number;
  agentPdas: string[];
  agentNames: string[];
  capabilities: { id: string; description: string | null; ownerCount: number }[];
};

function ProtocolCard({ protocol }: { protocol: ProtocolInfo }) {
  return (
    <div className="glass-card group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/[0.08] border border-cyan-500/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <ProtocolBadge protocol={protocol.id} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4">
        <div>
          <p className="text-lg font-bold text-white tabular-nums">{protocol.agentCount}</p>
          <p className="text-[9px] text-white/25 uppercase tracking-wider">Agents</p>
        </div>
        <div className="h-8 w-px bg-white/[0.06]" />
        <div>
          <p className="text-lg font-bold text-white tabular-nums">{protocol.capabilities.length}</p>
          <p className="text-[9px] text-white/25 uppercase tracking-wider">Capabilities</p>
        </div>
      </div>

      {/* Agents */}
      {protocol.agentNames.length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25 mb-1.5">Agents</p>
          <div className="space-y-1">
            {protocol.agentNames.map((name, i) => (
              <div key={protocol.agentPdas[i]} className="flex items-center gap-2">
                <a
                  href={`/agents/${protocol.agentPdas[i]}`}
                  className="text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors truncate"
                >
                  {name.length > 20 ? `${name.slice(0, 6)}…${name.slice(-4)}` : name}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {protocol.capabilities.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25 mb-1.5">Capabilities</p>
          <div className="flex flex-wrap gap-1">
            {protocol.capabilities.map((cap) => (
              <span key={cap.id} className="badge-amber text-[9px]">{cap.id}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
