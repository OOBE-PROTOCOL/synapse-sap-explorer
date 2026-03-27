'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Layers, Users, Star } from 'lucide-react';
import { PageHeader, Skeleton, EmptyState, ProtocolBadge, Address } from '~/components/ui';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

export default function ProtocolsPage() {
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');

  const loading = gLoading || aLoading;

  const protocols = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes
      .filter((n): n is GraphNode & { type: 'protocol' } => n.type === 'protocol')
      .map((n) => {
        const agentPdas = n.meta?.agents ? String(n.meta.agents).split(', ').filter(Boolean) : [];
        const agentNames = agentPdas.map((pda) => {
          const agent = agentsData?.agents.find((a) => a.pda === pda);
          return agent?.identity?.name ?? pda;
        });
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
  }, [graphData, agentsData]);

  const filtered = protocols.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.id.toLowerCase().includes(q) || p.agentNames.some((n) => n.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Protocols" subtitle="On-chain protocols discovered across the SAP network">
        <Badge variant="secondary" className="tabular-nums">{protocols.length} protocols</Badge>
      </PageHeader>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search protocols…"
            className="pl-9"
          />
        </div>
      </div>

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

type ProtocolInfo = {
  id: string;
  agentCount: number;
  agentPdas: string[];
  agentNames: string[];
  capabilities: { id: string; description: string | null; ownerCount: number }[];
};

function ProtocolCard({ protocol }: { protocol: ProtocolInfo }) {
  return (
    <Card className="group hover:bg-muted/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Layers className="h-[18px] w-[18px] text-primary" />
            </div>
            <ProtocolBadge protocol={protocol.id} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex items-center gap-4">
          <div>
            <p className="text-lg font-bold tabular-nums text-foreground">{protocol.agentCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</p>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div>
            <p className="text-lg font-bold tabular-nums text-foreground">{protocol.capabilities.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Capabilities</p>
          </div>
        </div>

        {/* Agents */}
        {protocol.agentNames.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Agents</p>
            <div className="space-y-1">
              {protocol.agentNames.map((name, i) => (
                <Link
                  key={protocol.agentPdas[i]}
                  href={`/agents/${protocol.agentPdas[i]}`}
                  className="flex items-center gap-2 text-xs text-primary/80 hover:text-primary transition-colors truncate"
                >
                  <Users className="h-3 w-3 shrink-0" />
                  {name.length > 20 ? `${name.slice(0, 6)}…${name.slice(-4)}` : name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Capabilities */}
        {protocol.capabilities.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {protocol.capabilities.map((cap) => (
                <Badge key={cap.id} variant="outline" className="text-[10px]">{cap.id}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
