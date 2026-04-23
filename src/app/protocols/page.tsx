'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Layers, Users, Sparkles, Filter, RotateCcw, AlertCircle, Bot, ArrowUpRight } from 'lucide-react';
import { ExplorerPageShell, ExplorerFilterBar, ExplorerMetric, Skeleton, EmptyState, StatusBadge } from '~/components/ui';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import type { FilterChip } from '~/components/ui/explorer-primitives';
import { Button } from '~/components/ui/button';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';
import type { SerializedDiscoveredAgent } from '~/types/sap';

type SortKey = 'agents' | 'name' | 'caps';
type SortDir = 'asc' | 'desc';

function normalizeProtocolId(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function shortAddress(value: string, lead = 6, tail = 4): string {
  if (!value) return 'unknown';
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

export default function ProtocolsPage() {
  const { data: graphData, loading: gLoading, error: graphError, refetch: refetchGraph } = useGraph();
  const { data: agentsData, loading: aLoading, error: agentsError, refetch: refetchAgents } = useAgents({ limit: '200' });

  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('agents');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loading = gLoading || aLoading;
  const error = graphError || agentsError;

  const capabilityByProtocol = useMemo(() => {
    const map = new Map<string, Array<{ id: string; description: string | null; ownerCount: number; protocolId: string }>>();
    const capabilityNodes = (graphData?.nodes ?? []).filter(
      (n): n is GraphNode & { type: 'capability' } => n.type === 'capability',
    );

    for (const node of capabilityNodes) {
      const protocolId = String(node.meta?.protocolId ?? '').trim();
      if (!protocolId) continue;
      const key = normalizeProtocolId(protocolId);

      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push({
        id: String(node.meta?.capabilityId ?? node.name),
        description: node.meta?.description ? String(node.meta.description) : null,
        ownerCount: Number(node.meta?.ownerCount ?? 0),
        protocolId,
      });
    }
    return map;
  }, [graphData]);

  const protocols = useMemo(() => {
    const protocolDisplayByNorm = new Map<string, string>();
    const addProtocol = (raw: string | null | undefined) => {
      const display = String(raw ?? '').trim();
      if (!display) return;
      const norm = normalizeProtocolId(display);
      if (!protocolDisplayByNorm.has(norm)) protocolDisplayByNorm.set(norm, display);
    };

    for (const node of graphData?.nodes ?? []) {
      if (node.type === 'protocol') addProtocol(String(node.meta?.protocolId ?? node.name));
      if (node.type === 'capability') addProtocol(String(node.meta?.protocolId ?? ''));
    }

    for (const a of agentsData?.agents ?? []) {
      for (const proto of a.identity?.protocols ?? []) addProtocol(proto);
      for (const cap of a.identity?.capabilities ?? []) addProtocol(cap.protocolId);
    }

    const list = Array.from(protocolDisplayByNorm.entries()).map(([normId, displayId]) => {
      const agents = (agentsData?.agents ?? []).filter((agent: SerializedDiscoveredAgent) => {
        const id = agent.identity;
        if (!id) return false;
        const inProtocols = (id.protocols ?? []).some((proto) => normalizeProtocolId(proto) === normId);
        const inCapabilities = (id.capabilities ?? []).some((cap) => normalizeProtocolId(cap.protocolId) === normId);
        return inProtocols || inCapabilities;
      }).map((agent: SerializedDiscoveredAgent) => ({
        pda: agent.pda,
        wallet: agent.identity?.wallet ?? null,
        name: agent.identity?.name ?? null,
        isActive: agent.identity?.isActive ?? false,
        reputationScore: agent.identity?.reputationScore ?? 0,
        totalCalls: Number(agent.identity?.totalCallsServed ?? 0),
      }));

      const caps = capabilityByProtocol.get(normId) ?? [];
      const topAgent = [...agents].sort((a, b) => b.totalCalls - a.totalCalls)[0] ?? null;

      return {
        id: displayId,
        normId,
        agentCount: agents.length,
        agents,
        topAgent,
        capabilities: caps,
      };
    });

    return list.sort((a, b) => b.agentCount - a.agentCount || a.id.localeCompare(b.id));
  }, [graphData, agentsData, capabilityByProtocol]);

  const filterAgents = useMemo(() => {
    const uniq = new Map<string, string>();
    for (const p of protocols) {
      for (const a of p.agents) {
        if (!uniq.has(a.pda)) {
          uniq.set(a.pda, a.name ?? `${a.pda.slice(0, 6)}...${a.pda.slice(-4)}`);
        }
      }
    }
    return [...uniq.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [protocols]);

  const stats = useMemo(() => {
    const total = protocols.length;
    const active = protocols.filter((p) => p.agentCount > 0).length;
    const totalAgentLinks = protocols.reduce((sum, p) => sum + p.agentCount, 0);
    const totalCapabilities = protocols.reduce((sum, p) => sum + p.capabilities.length, 0);
    return {
      total,
      active,
      totalAgentLinks,
      avgCaps: total > 0 ? (totalCapabilities / total).toFixed(1) : '0.0',
    };
  }, [protocols]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = protocols.filter((p) => {
      if (agentFilter !== 'all' && !p.agents.some((a) => a.pda === agentFilter)) return false;

      if (activityFilter === 'high' && p.agentCount < 5) return false;
      if (activityFilter === 'medium' && (p.agentCount < 2 || p.agentCount >= 5)) return false;
      if (activityFilter === 'low' && p.agentCount >= 2) return false;

      if (capabilityFilter === 'with' && p.capabilities.length === 0) return false;
      if (capabilityFilter === 'without' && p.capabilities.length > 0) return false;

      if (!query) return true;

      return (
        p.id.toLowerCase().includes(query) ||
        p.agents.some((a) => (a.name ?? a.pda).toLowerCase().includes(query)) ||
        p.capabilities.some((c) => c.id.toLowerCase().includes(query) || (c.description ?? '').toLowerCase().includes(query))
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'agents') cmp = a.agentCount - b.agentCount;
      if (sortKey === 'name') cmp = a.id.localeCompare(b.id);
      if (sortKey === 'caps') cmp = a.capabilities.length - b.capabilities.length;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [protocols, search, agentFilter, activityFilter, capabilityFilter, sortKey, sortDir]);

  const hasActiveFilters = Boolean(search) || agentFilter !== 'all' || activityFilter !== 'all' || capabilityFilter !== 'all';

  const filterChips: FilterChip[] = [
    ...(agentFilter !== 'all'
      ? [{ key: 'agent', label: 'Agent', value: filterAgents.find(([pda]) => pda === agentFilter)?.[1] ?? agentFilter, onClear: () => setAgentFilter('all') }]
      : []),
    ...(activityFilter !== 'all'
      ? [{ key: 'activity', label: 'Activity', value: activityFilter, onClear: () => setActivityFilter('all') }]
      : []),
    ...(capabilityFilter !== 'all'
      ? [{ key: 'capability', label: 'Capabilities', value: capabilityFilter, onClear: () => setCapabilityFilter('all') }]
      : []),
  ];

  return (
    <ExplorerPageShell
      title="Protocols"
      subtitle="On-chain protocols discovered across the SAP network"
      icon={<Layers className="h-5 w-5" />}
      badge={<Badge variant="secondary" className="tabular-nums text-xs">{stats.total} protocols</Badge>}
      stats={
        !loading ? (
          <>
            <ExplorerMetric icon={<Layers className="h-3.5 w-3.5" />} label="Protocols" value={stats.total} accent="primary" />
            <ExplorerMetric icon={<Users className="h-3.5 w-3.5" />} label="Linked Agents" value={stats.totalAgentLinks} accent="cyan" />
            <ExplorerMetric icon={<Sparkles className="h-3.5 w-3.5" />} label="Active Protocols" value={stats.active} accent="emerald" />
            <ExplorerMetric icon={<Filter className="h-3.5 w-3.5" />} label="Avg Capabilities" value={stats.avgCaps} accent="amber" />
          </>
        ) : undefined
      }
    >
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search protocol, capability or agent name..."
        filters={filterChips}
        sort={{
          value: `${sortKey}-${sortDir}`,
          options: [
            { value: 'agents-desc', label: 'Most Agents' },
            { value: 'agents-asc', label: 'Fewest Agents' },
            { value: 'caps-desc', label: 'Most Capabilities' },
            { value: 'caps-asc', label: 'Fewest Capabilities' },
            { value: 'name-asc', label: 'Name A-Z' },
            { value: 'name-desc', label: 'Name Z-A' },
          ],
          onChange: (v) => {
            const [k, d] = v.split('-') as [SortKey, SortDir];
            setSortKey(k);
            setSortDir(d);
          },
        }}
      >
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="h-8 w-44 text-xs bg-neutral-900 border-neutral-700 text-neutral-300">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {filterAgents.map(([pda, name]) => (
              <SelectItem key={pda} value={pda}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activityFilter} onValueChange={setActivityFilter}>
          <SelectTrigger className="h-8 w-36 text-xs bg-neutral-900 border-neutral-700 text-neutral-300">
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="high">High (5+ agents)</SelectItem>
            <SelectItem value="medium">Medium (2-4)</SelectItem>
            <SelectItem value="low">Low (0-1)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
          <SelectTrigger className="h-8 w-44 text-xs bg-neutral-900 border-neutral-700 text-neutral-300">
            <SelectValue placeholder="Capabilities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All capabilities</SelectItem>
            <SelectItem value="with">With capabilities</SelectItem>
            <SelectItem value="without">Without capabilities</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            onClick={() => {
              setSearch('');
              setAgentFilter('all');
              setActivityFilter('all');
              setCapabilityFilter('all');
              setSortKey('agents');
              setSortDir('desc');
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </ExplorerFilterBar>

      {error ? (
        <Card className="bg-neutral-900 border-red-900/40">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <p className="text-sm text-neutral-200">Unable to load protocols right now.</p>
            <p className="text-xs text-neutral-500">Try again to refresh graph and agent metadata from DB.</p>
            <Button
              size="sm"
              variant="outline"
              className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              onClick={() => {
                refetchGraph();
                refetchAgents();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={hasActiveFilters ? 'No protocols match current filters' : 'No protocols discovered'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((proto) => (
            <ProtocolCard key={proto.id} protocol={proto} />
          ))}
        </div>
      )}
    </ExplorerPageShell>
  );
}

type ProtocolInfo = {
  id: string;
  agentCount: number;
  agents: Array<{
    pda: string;
    wallet: string | null;
    name: string | null;
    isActive: boolean;
    reputationScore: number;
    totalCalls: number;
  }>;
  topAgent: {
    pda: string;
    wallet: string | null;
    name: string | null;
    isActive: boolean;
    reputationScore: number;
    totalCalls: number;
  } | null;
  capabilities: { id: string; description: string | null; ownerCount: number }[];
};

function ProtocolCard({ protocol }: { protocol: ProtocolInfo }) {
  const visibleAgents = protocol.agents.slice(0, 5);

  return (
    <Card className="group relative overflow-hidden border-neutral-800 bg-neutral-900 transition-colors hover:border-primary/35">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
      <CardHeader className="pb-0 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Protocol</p>
              <Link
                href={`/protocols/${encodeURIComponent(protocol.id)}`}
                className="group/title mt-0.5 inline-flex items-center gap-1.5 text-base font-semibold text-white transition-colors hover:text-primary"
              >
                <span className="truncate">{protocol.id}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover/title:opacity-100" />
              </Link>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">
            {protocol.agentCount} agents
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-5 pt-3 pb-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <p className="text-lg font-bold tabular-nums text-white font-mono">{protocol.agentCount}</p>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Agents</p>
          </div>
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <p className="text-lg font-bold tabular-nums text-white font-mono">{protocol.capabilities.length}</p>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Capabilities</p>
          </div>
        </div>

        {protocol.topAgent && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Top Agent</p>
              <StatusBadge active={protocol.topAgent.isActive} size="xs" />
            </div>
            <Link href={`/agents/${protocol.topAgent.wallet ?? protocol.topAgent.pda}`} className="mt-1 flex items-center gap-2 text-xs text-neutral-200 hover:text-primary transition-colors min-w-0">
              <Bot className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">{protocol.topAgent.name ?? shortAddress(protocol.topAgent.wallet ?? protocol.topAgent.pda)}</span>
            </Link>
          </div>
        )}

        {/* Agents */}
        {protocol.agents.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Agents (DB)</p>
            <div className="flex flex-wrap gap-1.5">
              {visibleAgents.map((agent) => (
                <Link
                  key={agent.pda}
                  href={`/agents/${agent.wallet ?? agent.pda}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:border-primary/40 hover:bg-neutral-800 hover:text-primary"
                  title={agent.name ?? agent.pda}
                >
                  <Users className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[170px]">{agent.name ?? shortAddress(agent.wallet ?? agent.pda)}</span>
                </Link>
              ))}
              {protocol.agents.length > visibleAgents.length && (
                <Badge variant="secondary" className="text-[10px] tabular-nums">+{protocol.agents.length - visibleAgents.length}</Badge>
              )}
            </div>
          </div>
        )}

        {/* Capabilities */}
        {protocol.capabilities.length > 0 && (
          <div className="border-t border-neutral-800 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {protocol.capabilities.slice(0, 6).map((cap) => (
                <Badge key={cap.id} variant="outline" className="text-[10px] border-neutral-700 text-neutral-300">{cap.id}</Badge>
              ))}
              {protocol.capabilities.length > 6 && <Badge variant="secondary" className="text-[10px]">+{protocol.capabilities.length - 6}</Badge>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
