'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Layers, ArrowUpRight, Bot } from 'lucide-react';
import { useMemo } from 'react';
import { Skeleton, ScoreRing, StatusBadge, Address } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useGraph, useAgents } from '~/hooks/use-sap';
import type { GraphNode } from '~/lib/sap/discovery';
import type { SerializedDiscoveredAgent } from '~/types/sap';

function normalizeProtocolId(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export default function ProtocolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id);
  const normalizedId = normalizeProtocolId(decodedId);
  const router = useRouter();
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '250' });
  const loading = gLoading || aLoading;

  const protocol = useMemo(() => {
    if (!graphData) return null;
    return graphData.nodes.find(
      (n) => n.type === 'protocol' && normalizeProtocolId(String(n.meta?.protocolId ?? n.name)) === normalizedId,
    ) ?? null;
  }, [graphData, normalizedId]);

  const agents = useMemo(() => {
    return (agentsData?.agents ?? [])
      .filter((a: SerializedDiscoveredAgent) => {
        const identity = a.identity;
        if (!identity) return false;
        const inProtocols = (identity.protocols ?? []).some((p) => normalizeProtocolId(p) === normalizedId);
        const inCapabilities = (identity.capabilities ?? []).some((c) => normalizeProtocolId(c.protocolId) === normalizedId);
        return inProtocols || inCapabilities;
      })
      .map((agent: SerializedDiscoveredAgent) => ({
        pda: agent.pda,
        name: agent.identity?.name ?? null,
        wallet: agent.identity?.wallet ?? null,
        reputationScore: agent.identity?.reputationScore ?? 0,
        isActive: agent.identity?.isActive ?? false,
        totalCallsServed: agent.identity?.totalCallsServed ?? '0',
      }))
      .sort((a, b) => Number(b.totalCallsServed) - Number(a.totalCallsServed));
  }, [agentsData, normalizedId]);

  const capabilities = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes
      .filter((n): n is GraphNode => n.type === 'capability' && normalizeProtocolId(String(n.meta?.protocolId ?? '')) === normalizedId)
      .map((c) => ({
        id: String(c.meta?.capabilityId ?? c.name),
        description: c.meta?.description ? String(c.meta.description) : null,
        version: c.meta?.version ? String(c.meta.version) : null,
        ownerCount: Number(c.meta?.ownerCount ?? 0),
      }));
  }, [graphData, normalizedId]);

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
    <div className="space-y-8 animate-fade-in">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 text-neutral-500 hover:text-white" onClick={() => router.push('/protocols')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Protocols
        </Button>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Protocol</p>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{decodedId}</h1>
                <p className="mt-0.5 text-sm text-neutral-400">{agents.length} agent{agents.length !== 1 ? 's' : ''} · {capabilities.length} capabilit{capabilities.length !== 1 ? 'ies' : 'y'}</p>
              </div>
            </div>
            <Link
              href={`/protocols/${encodeURIComponent(decodedId)}`}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/80 px-2.5 text-xs text-neutral-300 hover:border-primary/35 hover:text-primary"
            >
              Route
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Agents */}
      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader><CardTitle className="text-sm text-white">Agents using this protocol</CardTitle></CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-neutral-500">No agents found</p>
          ) : (
            <div className="space-y-1.5">
              {agents.map((a) => (
                <Link key={a.pda} href={`/agents/${a.wallet ?? a.pda}`}
                  className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-3 transition-colors hover:border-primary/35 hover:bg-neutral-800/70"
                >
                  <ScoreRing score={a.reputationScore} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                      <p className="text-sm font-medium text-white truncate">{a.name ?? 'Unnamed Agent'}</p>
                      <StatusBadge active={a.isActive} size="xs" />
                    </div>
                    <Address value={a.pda} />
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold tabular-nums text-white">{Number(a.totalCallsServed).toLocaleString()}</p>
                    <p className="text-xs text-neutral-500">calls</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader><CardTitle className="text-sm text-white">Capabilities</CardTitle></CardHeader>
        <CardContent>
          {capabilities.length === 0 ? (
            <p className="text-sm text-neutral-500">No capabilities registered</p>
          ) : (
            <div className="space-y-2">
              {capabilities.map((c) => (
                <Link key={c.id} href={`/capabilities/${encodeURIComponent(c.id)}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 px-3 py-2.5 transition-colors hover:border-primary/35 hover:bg-neutral-800/60"
                >
                  <Badge variant="outline" className="text-xs">{c.id}</Badge>
                  {c.version && <Badge variant="secondary" className="text-xs">v{c.version}</Badge>}
                  <span className="flex-1 text-xs text-neutral-400 truncate">{c.description ?? ''}</span>
                  <span className="text-xs text-neutral-500 tabular-nums">{c.ownerCount} owner{c.ownerCount !== 1 ? 's' : ''}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
