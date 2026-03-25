'use client';

/* ──────────────────────────────────────────────────────────
 * Tools Page — On-chain ToolDescriptor registry
 *
 * Uses useTools() to fetch real tool descriptors from the
 * SAP program, showing PDA, category, HTTP method, params,
 * invocations, and linked agent.
 * ────────────────────────────────────────────────────────── */

import { useState, useMemo } from 'react';
import {
  PageHeader,
  Skeleton,
  EmptyState,
  Address,
  StatusBadge,
  CategoryBadge,
  HttpMethodBadge,
} from '~/components/ui';
import { useTools, useAgents } from '~/hooks/use-sap';

export default function ToolsPage() {
  const { data, loading, error } = useTools();
  const { data: agentsData } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  /* ── Enrich tools with agent names ────────────────── */
  const enrichedTools = useMemo(() => {
    if (!data?.tools) return [];
    return data.tools.map((t) => {
      const agent = agentsData?.agents.find((a) => a.pda === t.descriptor?.agent);
      return {
        pda: t.pda,
        descriptor: t.descriptor,
        agentName: agent?.identity?.name ?? null,
        agentWallet: agent?.identity?.wallet ?? null,
      };
    });
  }, [data, agentsData]);

  /* ── Categories for filter ─────────────────────────── */
  const categories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories.map((c) => c.category).filter(Boolean);
  }, [data]);

  /* ── Filter ────────────────────────────────────────── */
  const filtered = enrichedTools.filter((t) => {
    const d = t.descriptor;
    if (!d) return false;
    if (categoryFilter) {
      const cat = typeof d.category === 'object' ? Object.keys(d.category)[0] : String(d.category);
      if (cat !== categoryFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const name = d.toolName.toLowerCase();
      const agent = (t.agentName ?? '').toLowerCase();
      if (!name.includes(q) && !agent.includes(q) && !t.pda.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Tool Registry" subtitle="On-chain tool descriptors registered in the SAP program">
        <span className="text-[10px] tabular-nums text-white/25">
          {data?.total ?? 0} tools
        </span>
      </PageHeader>

      {/* ── Filters ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools…"
          className="input-field max-w-sm"
        />
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field max-w-[180px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Content ──────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card-static p-8 text-center">
          <p className="text-[13px] text-red-400/80">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || categoryFilter ? 'No tools match filters' : 'No tools discovered on-chain'} />
      ) : (
        <div className="space-y-4">
          {filtered.map((tool) => (
            <ToolCard key={tool.pda} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tool Card ────────────────────────────────────────── */

type EnrichedTool = {
  pda: string;
  descriptor: {
    bump: number;
    agent: string;
    toolName: string;
    version: number;
    httpMethod: any;
    category: any;
    paramsCount: number;
    requiredParams: number;
    isCompound: boolean;
    isActive: boolean;
    totalInvocations: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  agentName: string | null;
  agentWallet: string | null;
};

function ToolCard({ tool }: { tool: EnrichedTool }) {
  const d = tool.descriptor;
  if (!d) return null;

  const method = typeof d.httpMethod === 'object' ? Object.keys(d.httpMethod)[0] ?? 'GET' : String(d.httpMethod);
  const category = typeof d.category === 'object' ? Object.keys(d.category)[0] ?? 'Custom' : String(d.category);

  return (
    <div className="glass-card group">
      <div className="flex items-start justify-between gap-4">
        {/* Left — name + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/[0.08] border border-pink-500/10 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-pink-400">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{d.toolName}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <HttpMethodBadge method={method} />
                <CategoryBadge category={category} />
                {d.isCompound && <span className="badge-red text-[9px]">Compound</span>}
              </div>
            </div>
          </div>

          {/* PDA + Agent */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
            <span className="text-white/25">PDA</span>
            <Address value={tool.pda} copy />
            {tool.agentName && (
              <>
                <span className="text-white/25">Agent</span>
                <a
                  href={tool.agentWallet ? `/agents/${tool.agentWallet}` : '#'}
                  className="text-blue-400/70 hover:text-blue-400 transition-colors"
                >
                  {tool.agentName}
                </a>
              </>
            )}
            {!tool.agentName && d.agent && (
              <>
                <span className="text-white/25">Agent</span>
                <Address value={d.agent} copy />
              </>
            )}
          </div>
        </div>

        {/* Right — stats */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-white">{Number(d.totalInvocations).toLocaleString()}</p>
            <p className="text-[9px] text-white/25 uppercase tracking-wider">Invocations</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-white">{d.requiredParams}/{d.paramsCount}</p>
            <p className="text-[9px] text-white/25 uppercase tracking-wider">Params</p>
          </div>
          <StatusBadge active={d.isActive} />
        </div>
      </div>

      {/* Footer — timestamps + version */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.04]">
        <span className="text-[9px] text-white/15">v{d.version}</span>
        {d.createdAt && d.createdAt !== '0' && (
          <span className="text-[9px] text-white/15">
            Created {new Date(Number(d.createdAt) * 1000).toLocaleDateString()}
          </span>
        )}
        {d.updatedAt && d.updatedAt !== '0' && (
          <span className="text-[9px] text-white/15">
            Updated {new Date(Number(d.updatedAt) * 1000).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
