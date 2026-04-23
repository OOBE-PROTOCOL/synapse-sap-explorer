'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Star,
  Users,
  Shield,
  Layers,
  AlertCircle,
  RotateCcw,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { ExplorerPageShell, ExplorerMetric, ExplorerFilterBar, Skeleton, EmptyState, ProtocolBadge, ScoreRing, StatusBadge } from '~/components/ui';
import type { FilterChip } from '~/components/ui/explorer-primitives';
import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Button } from '~/components/ui/button';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

type SortKey = 'name' | 'owners' | 'protocol' | 'version';
type SortDir = 'asc' | 'desc';

export default function CapabilitiesPage() {
  const router = useRouter();
  const { data: graphData, loading: gLoading, error: graphError, refetch: refetchGraph } = useGraph();
  const { data: agentsData, loading: aLoading, error: agentsError, refetch: refetchAgents } = useAgents({ limit: '200' });
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('owners');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loading = gLoading || aLoading;
  const error = graphError || agentsError;

  /* ── Parse capabilities from graph data ── */
  const capabilities = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes
      .filter((n): n is GraphNode & { type: 'capability' } => n.type === 'capability')
      .map((n) => {
        const ownerPdas = n.meta?.owners ? String(n.meta.owners).split(', ').filter(Boolean) : [];
        const ownerAgents = ownerPdas.map((pda) => {
          const agent = agentsData?.agents.find((a) => a.pda === pda);
          return {
            pda,
            name: agent?.identity?.name ?? null,
            wallet: agent?.identity?.wallet ?? null,
            isActive: agent?.identity?.isActive ?? false,
            reputationScore: agent?.identity?.reputationScore ?? 0,
            totalCallsServed: Number(agent?.identity?.totalCallsServed ?? 0),
          };
        });
        return {
          id: String(n.meta?.capabilityId ?? n.name),
          name: n.name,
          description: n.meta?.description ? String(n.meta.description) : null,
          protocolId: n.meta?.protocolId ? String(n.meta.protocolId) : null,
          version: n.meta?.version ? String(n.meta.version) : null,
          ownerCount: Number(n.meta?.ownerCount ?? ownerPdas.length),
          owners: ownerAgents,
        };
      });
  }, [graphData, agentsData]);

  /* ── Derived lists for filters ── */
  const protocols = useMemo(
    () => [...new Set(capabilities.map((c) => c.protocolId).filter(Boolean))] as string[],
    [capabilities],
  );

  const allOwnerNames = useMemo(() => {
    const set = new Map<string, string>();
    capabilities.forEach((c) =>
      c.owners.forEach((o) => {
        if (o.name && !set.has(o.pda)) set.set(o.pda, o.name);
      }),
    );
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [capabilities]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = capabilities.length;
    const uniqueProtocols = protocols.length;
    const totalOwners = new Set(capabilities.flatMap((c) => c.owners.map((o) => o.pda))).size;
    const avgOwners = total > 0 ? Math.round(capabilities.reduce((s, c) => s + c.ownerCount, 0) / total * 10) / 10 : 0;
    return { total, uniqueProtocols, totalOwners, avgOwners };
  }, [capabilities, protocols]);

  /* ── Filter ── */
  const filtered = useMemo(() => {
    const list = capabilities.filter((c) => {
      if (protocolFilter !== 'all' && c.protocolId !== protocolFilter) return false;
      if (ownerFilter !== 'all' && !c.owners.some((o) => o.pda === ownerFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q) ||
          (c.protocolId ?? '').toLowerCase().includes(q) ||
          c.owners.some((o) => (o.name ?? o.pda).toLowerCase().includes(q))
        );
      }
      return true;
    });

    /* Sort */
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'owners':
          cmp = a.ownerCount - b.ownerCount;
          break;
        case 'protocol':
          cmp = (a.protocolId ?? '').localeCompare(b.protocolId ?? '');
          break;
        case 'version':
          cmp = Number(a.version ?? 0) - Number(b.version ?? 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [capabilities, protocolFilter, ownerFilter, search, sortKey, sortDir]);

  const hasActiveFilters = protocolFilter !== 'all' || ownerFilter !== 'all' || search !== '';

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'protocol' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-primary" />
      : <ChevronDown className="h-3 w-3 text-primary" />;
  }

  const filterChips: FilterChip[] = [
    ...(protocolFilter !== 'all' ? [{ key: 'protocol', label: 'Protocol', value: protocolFilter, onClear: () => setProtocolFilter('all') }] : []),
    ...(ownerFilter !== 'all' ? [{ key: 'agent', label: 'Agent', value: allOwnerNames.find(([p]) => p === ownerFilter)?.[1] ?? ownerFilter.slice(0, 8), onClear: () => setOwnerFilter('all') }] : []),
  ];

  return (
    <ExplorerPageShell
      title="Capabilities"
      subtitle="On-chain capabilities advertised by SAP agents, grouped by protocol"
      icon={<Star className="h-5 w-5" />}
      badge={<Badge variant="secondary" className="tabular-nums text-xs">{capabilities.length} total</Badge>}
      stats={
        !loading ? (
          <>
            <ExplorerMetric icon={<Star className="h-3.5 w-3.5" />} label="Capabilities" value={stats.total} accent="primary" />
            <ExplorerMetric icon={<Shield className="h-3.5 w-3.5" />} label="Protocols" value={stats.uniqueProtocols} accent="cyan" />
            <ExplorerMetric icon={<Users className="h-3.5 w-3.5" />} label="Unique Agents" value={stats.totalOwners} accent="emerald" />
            <ExplorerMetric icon={<Layers className="h-3.5 w-3.5" />} label="Avg Owners" value={stats.avgOwners} accent="amber" />
          </>
        ) : undefined
      }
    >
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search capability, protocol, owner..."
        filters={filterChips}
        sort={{
          value: `${sortKey}-${sortDir}`,
          options: [
            { value: 'name-asc', label: 'Name A→Z' },
            { value: 'name-desc', label: 'Name Z→A' },
            { value: 'owners-desc', label: 'Most Owners' },
            { value: 'owners-asc', label: 'Fewest Owners' },
            { value: 'protocol-asc', label: 'Protocol A→Z' },
            { value: 'version-desc', label: 'Newest Version' },
            { value: 'version-asc', label: 'Oldest Version' },
          ],
          onChange: (v) => {
            const [k, d] = v.split('-') as [SortKey, SortDir];
            setSortKey(k); setSortDir(d);
          },
        }}
      >
        <Select value={protocolFilter} onValueChange={setProtocolFilter}>
          <SelectTrigger className="h-8 w-44 text-xs bg-neutral-900 border-neutral-700 text-neutral-300">
            <SelectValue placeholder="All protocols" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All protocols</SelectItem>
            {protocols.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="h-8 w-44 text-xs bg-neutral-900 border-neutral-700 text-neutral-300">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {allOwnerNames.map(([pda, name]) => (
              <SelectItem key={pda} value={pda}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            onClick={() => {
              setSearch('');
              setProtocolFilter('all');
              setOwnerFilter('all');
              setSortKey('owners');
              setSortDir('desc');
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </ExplorerFilterBar>

      {/* Table */}
      {error ? (
        <Card className="bg-neutral-900 border-red-900/40">
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <p className="text-sm text-neutral-200">Unable to load capabilities right now.</p>
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
          </div>
        </Card>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={hasActiveFilters ? 'No capabilities match filters' : 'No capabilities discovered'} />
      ) : (
        <Card className="overflow-hidden bg-neutral-900 border-neutral-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Capability <SortIcon col="name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort('protocol')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Protocol <SortIcon col="protocol" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort('version')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Version <SortIcon col="version" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort('owners')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Agents <SortIcon col="owners" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Top Agent</TableHead>
                <TableHead className="hidden xl:table-cell">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cap) => {
                const topAgent = [...cap.owners].sort((a, b) => b.totalCallsServed - a.totalCallsServed)[0] ?? null;
                return (
                  <TableRow
                    key={cap.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/capabilities/${encodeURIComponent(cap.id)}`)}
                  >
                    {/* Name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                          <Star className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate max-w-[220px]">{cap.id}</p>
                          {cap.name !== cap.id && (
                            <p className="text-[10px] text-neutral-500 truncate max-w-[220px]">{cap.name}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Protocol */}
                    <TableCell>
                      {cap.protocolId ? <ProtocolBadge protocol={cap.protocolId} /> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>

                    {/* Version */}
                    <TableCell>
                      {cap.version ? (
                        <Badge variant="secondary" className="text-[10px] tabular-nums bg-neutral-800 text-neutral-300 border border-neutral-700">v{cap.version}</Badge>
                      ) : (
                        <span className="text-neutral-600 text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Agents count */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3 w-3 text-neutral-500" />
                        <span className="text-sm font-medium tabular-nums text-white">{cap.ownerCount}</span>
                      </div>
                    </TableCell>

                    {/* Top Agent */}
                    <TableCell className="hidden lg:table-cell">
                      {topAgent ? (
                        <div className="flex items-center gap-2">
                          <ScoreRing score={topAgent.reputationScore} size={24} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate max-w-[120px] text-neutral-200">{topAgent.name ?? 'Unknown'}</p>
                            <p className="text-[10px] text-neutral-500 tabular-nums">
                              {topAgent.totalCallsServed.toLocaleString()} calls
                            </p>
                          </div>
                          <StatusBadge active={topAgent.isActive} size="xs" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Description */}
                    <TableCell className="hidden xl:table-cell">
                      <p className="text-xs text-neutral-500 truncate max-w-[200px]">
                        {cap.description ?? '—'}
                      </p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </ExplorerPageShell>
  );
}

