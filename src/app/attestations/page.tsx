'use client';

/* ──────────────────────────────────────────────────────────
 * Attestations Page — Web-of-Trust explorer
 *
 * Shows all on-chain attestations (agent ↔ attester pairs),
 * forming the decentralized trust graph of the SAP network.
 * ────────────────────────────────────────────────────────── */

import { useState, useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, Address, StatusBadge } from '~/components/ui';
import { useAttestations, useAgents } from '~/hooks/use-sap';

export default function AttestationsPage() {
  const { data, loading, error } = useAttestations();
  const { data: agentsData } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);

  /* ── Enrich with agent names ───────────────────────── */
  const enriched = useMemo(() => {
    if (!data?.attestations) return [];
    return data.attestations.map((a) => {
      const agent = agentsData?.agents.find((ag) => ag.pda === a.agent);
      return {
        ...a,
        agentName: agent?.identity?.name ?? null,
      };
    });
  }, [data, agentsData]);

  /* ── Unique attestation types ──────────────────────── */
  const types = useMemo(
    () => [...new Set(enriched.map((a) => a.attestationType).filter(Boolean))],
    [enriched],
  );

  /* ── Filter ────────────────────────────────────────── */
  const filtered = enriched.filter((a) => {
    if (onlyActive && !a.isActive) return false;
    if (typeFilter && a.attestationType !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.pda.toLowerCase().includes(q) ||
      a.agent.toLowerCase().includes(q) ||
      a.attester.toLowerCase().includes(q) ||
      a.attestationType.toLowerCase().includes(q) ||
      (a.agentName ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Attestations" subtitle="Web-of-Trust — on-chain attestations between agents and attesters">
        <span className="text-[10px] tabular-nums text-white/25">
          {data?.total ?? 0} attestations
        </span>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search attestations…"
          className="input-field max-w-sm"
        />
        {types.length > 0 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field max-w-[180px]"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-[12px] text-white/35 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="accent-blue-500"
          />
          Active only
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card-static p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || typeFilter || onlyActive ? 'No attestations match filters' : 'No attestations found on-chain'} />
      ) : (
        <div className="glass-card-static overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 border-b border-white/[0.06] px-5 py-2.5">
            <span className="col-span-3 section-title">Agent</span>
            <span className="col-span-3 section-title">Attester</span>
            <span className="col-span-2 section-title">Type</span>
            <span className="col-span-2 section-title">Created</span>
            <span className="col-span-2 section-title text-right">Status</span>
          </div>

          <div className="divide-y divide-white/[0.03]">
            {filtered.map((a) => {
              const isExpired = a.expiresAt !== '0' && Number(a.expiresAt) * 1000 < Date.now();
              return (
                <div key={a.pda} className="grid grid-cols-12 gap-2 px-5 py-3 hover:bg-white/[0.01] transition-colors items-center">
                  <div className="col-span-3">
                    <p className="text-xs text-white truncate">{a.agentName ?? 'Unknown'}</p>
                    <Address value={a.agent} copy className="text-[10px]" />
                  </div>
                  <div className="col-span-3">
                    <Address value={a.attester} copy />
                  </div>
                  <div className="col-span-2">
                    <span className="badge-cyan text-[9px]">{a.attestationType || 'unknown'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[12px] text-white/35">
                      {a.createdAt !== '0' ? new Date(Number(a.createdAt) * 1000).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    {isExpired ? (
                      <span className="badge-red text-[9px]">Expired</span>
                    ) : (
                      <StatusBadge active={a.isActive} size="xs" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
