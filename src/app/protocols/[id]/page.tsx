'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Layers } from 'lucide-react';
import { useMemo } from 'react';
import { Skeleton, EmptyState, ScoreRing, StatusBadge, Address, ProtocolBadge } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';

export default function ProtocolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id);
  const router = useRouter();
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const loading = gLoading || aLoading;

  const protocol = useMemo(() => {
    if (!graphData) return null;
    return graphData.nodes.find(
      (n) => n.type === 'protocol' && (String(n.meta?.protocolId ?? n.name) === decodedId),
    ) ?? null;
  }, [graphData, decodedId]);

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
      };
    });
  }, [protocol, agentsData]);

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
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!protocol) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Protocol &ldquo;{decodedId}&rdquo; not found</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/protocols')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Protocols
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push('/protocols')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Protocols
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{decodedId}</h1>
              <ProtocolBadge protocol={decodedId} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{agents.length} agent{agents.length !== 1 ? 's' : ''} · {capabilities.length} capabilit{capabilities.length !== 1 ? 'ies' : 'y'}</p>
          </div>
        </div>
      </div>

      {/* Agents */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Agents using this protocol</CardTitle></CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents found</p>
          ) : (
            <div className="space-y-1">
              {agents.map((a) => (
                <Link key={a.pda} href={a.wallet ? `/agents/${a.wallet}` : '#'}
                  className="flex items-center gap-4 rounded-lg px-3 py-3 hover:bg-muted/50 transition-colors"
                >
                  <ScoreRing score={a.reputationScore} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{a.name ?? 'Unknown Agent'}</p>
                      <StatusBadge active={a.isActive} size="xs" />
                    </div>
                    <Address value={a.pda} />
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold tabular-nums text-foreground">{Number(a.totalCallsServed).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">calls</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Capabilities</CardTitle></CardHeader>
        <CardContent>
          {capabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No capabilities registered</p>
          ) : (
            <div className="space-y-2">
              {capabilities.map((c) => (
                <Link key={c.id} href={`/capabilities/${encodeURIComponent(c.id)}`}
                  className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className="text-[10px]">{c.id}</Badge>
                  {c.version && <Badge variant="secondary" className="text-[9px]">v{c.version}</Badge>}
                  <span className="flex-1 text-xs text-muted-foreground truncate">{c.description ?? ''}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{c.ownerCount} owner{c.ownerCount !== 1 ? 's' : ''}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
