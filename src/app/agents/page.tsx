'use client';

import { useState } from 'react';
import { Bot, Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader, ScoreRing, StatusBadge, Address, ProtocolBadge, Skeleton, EmptyState } from '~/components/ui';
import { useAgents } from '~/hooks/use-sap';
import type { SerializedDiscoveredAgent } from '~/lib/sap/discovery';

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'reputation', label: 'Reputation' },
  { value: 'calls', label: 'Calls' },
  { value: 'latency', label: 'Latency' },
  { value: 'uptime', label: 'Uptime' },
  { value: 'price', label: 'Price' },
];

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('reputation');
  const [activeOnly, setActiveOnly] = useState(true);

  const { data, loading, error } = useAgents({
    sortBy,
    activeOnly: String(activeOnly),
    limit: '100',
  });

  const agents = data?.agents ?? [];

  // Client-side name/description search
  const filtered = search
    ? agents.filter((a) => {
        const id = a.identity;
        if (!id) return false;
        const q = search.toLowerCase();
        return (
          id.name.toLowerCase().includes(q) ||
          id.description.toLowerCase().includes(q) ||
          a.pda.toLowerCase().includes(q) ||
          id.wallet.toLowerCase().includes(q)
        );
      })
    : agents;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Agents" subtitle={`${data?.total ?? '—'} agents discovered on-chain`} />

      {/* ── Filters ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, PDA, or wallet…"
            className="input-field pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-white/30" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input-field max-w-[140px]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className={`btn-ghost text-[11px] ${activeOnly ? '!border-emerald-500/20 !text-emerald-400' : ''}`}
        >
          {activeOnly ? '● Active only' : '○ All agents'}
        </button>
      </div>

      {/* ── Agent List ───────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card-static p-4">
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass-card-static p-8 text-center">
          <p className="text-[13px] text-red-400/80">Error: {error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No agents match your search' : 'No agents discovered on-chain'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((agent) => (
            <AgentCard key={agent.pda} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Agent Card ──────────────────────────────────────── */

function AgentCard({ agent }: { agent: SerializedDiscoveredAgent }) {
  const id = agent.identity;
  if (!id) return null;

  return (
    <a href={`/agents/${id.wallet}`} className="glass-card block p-5">
      <div className="flex items-start gap-4">
        <ScoreRing score={id.reputationScore} size={48} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold text-white">{id.name}</h3>
            <StatusBadge active={id.isActive} />
            {id.x402Endpoint && <span className="badge-amber">x402</span>}
          </div>

          <p className="mt-0.5 line-clamp-1 text-[12px] text-white/30">{id.description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Address value={agent.pda} />
            <span className="text-[10px] text-white/10">·</span>
            <span className="text-[10px] tabular-nums text-white/35">
              {Number(id.totalCallsServed).toLocaleString()} calls
            </span>
            <span className="text-[10px] text-white/10">·</span>
            <span className="text-[10px] tabular-nums text-white/35">
              {id.avgLatencyMs}ms
            </span>
            <span className="text-[10px] text-white/10">·</span>
            <span className="text-[10px] tabular-nums text-white/35">
              {id.uptimePercent}% uptime
            </span>
          </div>
        </div>

        <div className="hidden flex-col items-end gap-2 lg:flex">
          <div className="flex gap-1">
            {id.capabilities.slice(0, 3).map((c) => (
              <ProtocolBadge key={c.id} protocol={c.protocolId ?? c.id.split(':')[0]} />
            ))}
            {id.capabilities.length > 3 && (
              <span className="badge-blue">+{id.capabilities.length - 3}</span>
            )}
          </div>
          {id.pricing.length > 0 && (
            <span className="text-[10px] text-white/25">
              {formatTokenType(id.pricing[0].tokenType)} · {formatSettlement(id.pricing[0].settlementMode)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

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
