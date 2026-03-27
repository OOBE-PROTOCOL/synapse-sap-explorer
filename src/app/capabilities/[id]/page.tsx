'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Skeleton, EmptyState, ScoreRing, StatusBadge, Address, ProtocolBadge } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useGraph, useAgents } from '~/hooks/use-sap';

export default function CapabilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id);
  const router = useRouter();
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const loading = gLoading || aLoading;

  const capability = useMemo(() => {
    if (!graphData) return null;
    return graphData.nodes.find(
      (n) => n.type === 'capability' && (String(n.meta?.capabilityId ?? n.name) === decodedId),
    ) ?? null;
  }, [graphData, decodedId]);

  const agents = useMemo(() => {
    if (!capability || !agentsData?.agents) return [];
    const ownerPdas = capability.meta?.owners ? String(capability.meta.owners).split(', ').filter(Boolean) : [];
    return ownerPdas.map((pda) => {
      const agent = agentsData.agents.find((a) => a.pda === pda);
      return {
        pda,
        name: agent?.identity?.name ?? null,
        wallet: agent?.identity?.wallet ?? null,
        reputationScore: agent?.identity?.reputationScore ?? 0,
        isActive: agent?.identity?.isActive ?? false,
        totalCallsServed: agent?.identity?.totalCallsServed ?? '0',
        avgLatencyMs: agent?.identity?.avgLatencyMs ?? 0,
        uptimePercent: agent?.identity?.uptimePercent ?? 0,
      };
    });
  }, [capability, agentsData]);

  const protocolId = capability?.meta?.protocolId ? String(capability.meta.protocolId) : null;
  const description = capability?.meta?.description ? String(capability.meta.description) : null;
  const version = capability?.meta?.version ? String(capability.meta.version) : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!capability) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Capability &ldquo;{decodedId}&rdquo; not found</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/capabilities')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Capabilities
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push('/capabilities')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Capabilities
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-2/10">
            <Star className="h-5 w-5 text-chart-2" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{decodedId}</h1>
              {version && <Badge variant="secondary">v{version}</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {protocolId && <ProtocolBadge protocol={protocolId} />}
              <span className="text-sm text-muted-foreground">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {description && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </CardContent>
        </Card>
      )}

      {/* Agents */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Agents with this capability</CardTitle></CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <EmptyState message="No agents have registered this capability" />
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
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-bold tabular-nums text-foreground">{Number(a.totalCallsServed).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">calls</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold tabular-nums text-foreground">{a.avgLatencyMs}ms</p>
                      <p className="text-[10px] text-muted-foreground">latency</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold tabular-nums text-foreground">{a.uptimePercent}%</p>
                      <p className="text-[10px] text-muted-foreground">uptime</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Protocol link */}
      {protocolId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Part of protocol:</span>
          <Link href={`/protocols/${encodeURIComponent(protocolId)}`} className="text-primary/80 hover:text-primary transition-colors">
            {protocolId} →
          </Link>
        </div>
      )}
    </div>
  );
}
