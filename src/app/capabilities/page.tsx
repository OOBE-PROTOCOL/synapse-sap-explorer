'use client';

/* ──────────────────────────────────────────────────────────
 * Capabilities Page — Lists all capabilities discovered on-chain
 *
 * Extracts capabilities from the graph data which enriches
 * each capability with protocolId, description, owners, etc.
 * ────────────────────────────────────────────────────────── */

import { useState, useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, Address, ProtocolBadge } from '~/components/ui';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

export default function CapabilitiesPage() {
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('');

  const loading = gLoading || aLoading;

  /* ── Build capability list from graph nodes ────────── */
  const capabilities = useMemo(() => {
    if (!graphData) return [];

    return graphData.nodes
      .filter((n): n is GraphNode & { type: 'capability' } => n.type === 'capability')
      .map((n) => {
        const ownerPdas = n.meta?.owners ? String(n.meta.owners).split(', ').filter(Boolean) : [];
        const ownerNames = ownerPdas.map((pda) => {
          const agent = agentsData?.agents.find((a) => a.pda === pda);
          return { pda, name: agent?.identity?.name ?? null };
        });

        return {
          id: String(n.meta?.capabilityId ?? n.name),
          name: n.name,
          description: n.meta?.description ? String(n.meta.description) : null,
          protocolId: n.meta?.protocolId ? String(n.meta.protocolId) : null,
          version: n.meta?.version ? String(n.meta.version) : null,
          ownerCount: Number(n.meta?.ownerCount ?? ownerPdas.length),
          owners: ownerNames,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [graphData, agentsData]);

  /* ── Unique protocols for the filter dropdown ──────── */
  const protocols = useMemo(
    () => [...new Set(capabilities.map((c) => c.protocolId).filter(Boolean))] as string[],
    [capabilities],
  );

  /* ── Search + filter ───────────────────────────────── */
  const filtered = capabilities.filter((c) => {
    if (protocolFilter && c.protocolId !== protocolFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q) ||
      c.owners.some((o) => (o.name ?? o.pda).toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Capabilities" subtitle="Capabilities advertised by SAP agents, grouped by protocol">
        <span className="text-[10px] tabular-nums text-white/25">
          {capabilities.length} capabilities
        </span>
      </PageHeader>

      {/* ── Filters ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search capabilities…"
          className="input-field max-w-sm"
        />
        <select
          value={protocolFilter}
          onChange={(e) => setProtocolFilter(e.target.value)}
          className="input-field max-w-[180px]"
        >
          <option value="">All protocols</option>
          {protocols.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* ── Content ──────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || protocolFilter ? 'No capabilities match filters' : 'No capabilities discovered'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cap) => (
            <CapabilityCard key={cap.id} capability={cap} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Capability Card ──────────────────────────────────── */

type CapInfo = {
  id: string;
  name: string;
  description: string | null;
  protocolId: string | null;
  version: string | null;
  ownerCount: number;
  owners: { pda: string; name: string | null }[];
};

function CapabilityCard({ capability }: { capability: CapInfo }) {
  return (
    <div className="glass-card group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/[0.08] border border-amber-500/10 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{capability.id}</p>
            {capability.protocolId && (
              <div className="mt-0.5">
                <ProtocolBadge protocol={capability.protocolId} />
              </div>
            )}
          </div>
        </div>
        {capability.version && (
          <span className="badge-blue text-[9px] shrink-0">v{capability.version}</span>
        )}
      </div>

      {/* Description */}
      {capability.description && (
        <p className="text-[11px] text-white/45 leading-relaxed mb-3 line-clamp-2">{capability.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400/60">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span className="text-[10px] text-white/40">{capability.ownerCount} owner{capability.ownerCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Owners */}
      {capability.owners.length > 0 && (
        <div className="border-t border-white/[0.04] pt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25 mb-1.5">Owners</p>
          <div className="space-y-1">
            {capability.owners.map((owner) => (
              <div key={owner.pda} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400/40 shrink-0" />
                {owner.name ? (
                  <span className="text-[11px] text-blue-400/70 truncate">{owner.name}</span>
                ) : (
                  <Address value={owner.pda} className="text-[10px]" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
