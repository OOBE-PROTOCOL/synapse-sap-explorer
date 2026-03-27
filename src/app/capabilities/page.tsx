'use client';

import { useState, useMemo } from 'react';
import { Search, Star, Users } from 'lucide-react';
import { PageHeader, Skeleton, EmptyState, Address, ProtocolBadge } from '~/components/ui';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

export default function CapabilitiesPage() {
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('all');

  const loading = gLoading || aLoading;

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

  const protocols = useMemo(
    () => [...new Set(capabilities.map((c) => c.protocolId).filter(Boolean))] as string[],
    [capabilities],
  );

  const filtered = capabilities.filter((c) => {
    if (protocolFilter !== 'all' && c.protocolId !== protocolFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q) ||
      c.owners.some((o) => (o.name ?? o.pda).toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Capabilities" subtitle="Capabilities advertised by SAP agents, grouped by protocol">
        <Badge variant="secondary" className="tabular-nums">{capabilities.length} capabilities</Badge>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search capabilities…"
            className="pl-9"
          />
        </div>
        <Select value={protocolFilter} onValueChange={setProtocolFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All protocols" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All protocols</SelectItem>
            {protocols.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || protocolFilter !== 'all' ? 'No capabilities match filters' : 'No capabilities discovered'} />
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
    <Card className="group hover:bg-muted/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-chart-2/10 shrink-0">
              <Star className="h-4 w-4 text-chart-2" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{capability.id}</p>
              {capability.protocolId && (
                <div className="mt-0.5">
                  <ProtocolBadge protocol={capability.protocolId} />
                </div>
              )}
            </div>
          </div>
          {capability.version && (
            <Badge variant="secondary" className="text-[10px] shrink-0">v{capability.version}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Description */}
        {capability.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{capability.description}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {capability.ownerCount} owner{capability.ownerCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Owners */}
        {capability.owners.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Owners</p>
            <div className="space-y-1">
              {capability.owners.map((owner) => (
                <div key={owner.pda} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0" />
                  {owner.name ? (
                    <span className="text-xs text-primary/80 truncate">{owner.name}</span>
                  ) : (
                    <Address value={owner.pda} className="text-[10px]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
