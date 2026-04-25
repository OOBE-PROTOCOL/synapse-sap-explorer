'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';
import { Star, Users, Shield, Zap, Activity, ExternalLink } from 'lucide-react';
import { Skeleton, EmptyState, ScoreRing, StatusBadge, Address, ProtocolBadge, StatCard } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { CopyableField, SectionHeader, DetailPageShell } from '~/components/ui/explorer';
import { useGraph, useAgents, useEscrows } from '~/hooks/use-sap';

export default function CapabilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id);
  const router = useRouter();
  const { data: graphData, loading: gLoading } = useGraph();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const { data: escrowsData } = useEscrows();
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
      const wallet = agent?.identity?.wallet;
      /* Escrow data for this agent */
      const agentEscrows = wallet && escrowsData?.escrows
        ? escrowsData.escrows.filter((e) => e.agentWallet === wallet)
        : [];
      const totalSettled = agentEscrows.reduce((s, e) => s + Number(e.totalSettled), 0);
      return {
        pda,
        name: agent?.identity?.name ?? null,
        wallet: wallet ?? null,
        reputationScore: agent?.identity?.reputationScore ?? 0,
        isActive: agent?.identity?.isActive ?? false,
        totalCallsServed: Number(agent?.identity?.totalCallsServed ?? 0),
        avgLatencyMs: agent?.identity?.avgLatencyMs ?? 0,
        uptimePercent: agent?.identity?.uptimePercent ?? 0,
        escrowCount: agentEscrows.length,
        totalSettled,
      };
    }).sort((a, b) => b.totalCallsServed - a.totalCallsServed);
  }, [capability, agentsData, escrowsData]);

  const protocolId = capability?.meta?.protocolId ? String(capability.meta.protocolId) : null;
  const description = capability?.meta?.description ? String(capability.meta.description) : null;
  const version = capability?.meta?.version ? String(capability.meta.version) : null;

  /* ── Stats ── */
  const stats = useMemo(() => {
    const totalCalls = agents.reduce((s, a) => s + a.totalCallsServed, 0);
    const activeAgents = agents.filter((a) => a.isActive).length;
    const avgScore = agents.length > 0
      ? Math.round(agents.reduce((s, a) => s + a.reputationScore, 0) / agents.length)
      : 0;
    const avgLatency = agents.length > 0
      ? Math.round(agents.reduce((s, a) => s + a.avgLatencyMs, 0) / agents.length)
      : 0;
    return { totalCalls, activeAgents, avgScore, avgLatency };
  }, [agents]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!capability) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Capability &ldquo;{decodedId}&rdquo; not found</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/capabilities')}>
          All Capabilities
        </Button>
      </div>
    );
  }

  return (
    <DetailPageShell
      backHref="/capabilities"
      backLabel="All Capabilities"
      title={decodedId}
      subtitle="On-chain capability descriptor"
      onBack={() => router.push('/capabilities')}
      badges={
        <>
          {protocolId && <ProtocolBadge protocol={protocolId} />}
          {version && <Badge variant="secondary" className="text-xs">v{version}</Badge>}
          <Badge variant="outline" className="text-xs tabular-nums">{agents.length} agent{agents.length !== 1 ? 's' : ''}</Badge>
        </>
      }
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-2/10">
          <Star className="h-5 w-5 text-chart-2" />
        </div>
      }
    >
      {/* Key Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Active Agents" value={`${stats.activeAgents}/${agents.length}`} />
        <StatCard icon={<Zap className="h-4 w-4" />} label="Total Calls" value={stats.totalCalls} />
        <StatCard icon={<Shield className="h-4 w-4" />} label="Avg Reputation" value={stats.avgScore} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Avg Latency" value={`${stats.avgLatency}ms`} />
      </div>

      {/* Capability Identity */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Capability Identity" />
          <CopyableField label="Capability ID" value={decodedId} mono={false} />
          {protocolId && <CopyableField label="Protocol" value={protocolId} mono={false} />}
          {version && <CopyableField label="Version" value={`v${version}`} mono={false} />}
          <CopyableField label="Owner Count" value={String(agents.length)} mono={false} />
        </CardContent>
      </Card>

      {/* Description */}
      {description && (
        <Card>
          <CardContent className="pt-6">
            <SectionHeader title="Description" />
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </CardContent>
        </Card>
      )}

      {/* Agents Table */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Agents" count={agents.length} />
          {agents.length === 0 ? (
            <EmptyState message="No agents have registered this capability" />
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Latency</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Uptime</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Escrows</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a, i) => (
                    <TableRow
                      key={a.pda}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => a.wallet && router.push(`/agents/${a.wallet}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 text-right tabular-nums">{i + 1}</span>
                          <ScoreRing score={a.reputationScore} size={32} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[180px]">
                              {a.name ?? 'Unknown Agent'}
                            </p>
                            <Address value={a.pda} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-bold tabular-nums">{a.reputationScore}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums">{a.totalCallsServed.toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="text-sm tabular-nums">{a.avgLatencyMs}ms</span>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="text-sm tabular-nums">{a.uptimePercent}%</span>
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className="text-sm tabular-nums">{a.escrowCount}</span>
                        {a.totalSettled > 0 && (
                          <p className="text-xs text-muted-foreground">{(a.totalSettled / 1e9).toFixed(4)} SOL</p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge active={a.isActive} size="xs" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Protocol link */}
      {protocolId && (
        <Card>
          <CardContent className="pt-6">
            <SectionHeader title="Protocol" />
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-chart-1" />
                <div>
                  <p className="text-sm font-medium text-foreground">{protocolId}</p>
                  <p className="text-xs text-muted-foreground">Parent protocol for this capability</p>
                </div>
              </div>
              <Link
                href={`/protocols/${encodeURIComponent(protocolId)}`}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                View <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </DetailPageShell>
  );
}
