'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Skeleton, StatusBadge, Address, HttpMethodBadge, CategoryBadge } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  DIDIdentity,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
} from '~/components/ui/explorer';
import { useTools, useAgents } from '~/hooks/use-sap';

export default function ToolDetailPage() {
  const { pda } = useParams<{ pda: string }>();
  const router = useRouter();
  const { data: toolsData, loading: tLoading } = useTools();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const loading = tLoading || aLoading;

  const tool = useMemo(() => {
    if (!toolsData?.tools) return null;
    return toolsData.tools.find((t) => t.pda === pda) ?? null;
  }, [toolsData, pda]);

  const ownerAgent = useMemo(() => {
    if (!tool?.descriptor?.agent || !agentsData?.agents) return null;
    return agentsData.agents.find((a) => a.pda === tool.descriptor!.agent) ?? null;
  }, [tool, agentsData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tool || !tool.descriptor) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Tool not found: {pda}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/tools')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Tools
        </Button>
      </div>
    );
  }

  const d = tool.descriptor;
  const method = typeof d.httpMethod === 'object' ? Object.keys(d.httpMethod)[0] ?? 'GET' : String(d.httpMethod);
  const category = typeof d.category === 'object' ? Object.keys(d.category)[0] ?? 'Custom' : String(d.category);

  return (
    <DetailPageShell
      backHref="/tools"
      backLabel="All Tools"
      title={d.toolName}
      subtitle="On-chain tool descriptor"
      onBack={() => router.push('/tools')}
      badges={
        <>
          <HttpMethodBadge method={method} />
          <CategoryBadge category={category} />
          <StatusBadge active={d.isActive} />
          {d.isCompound && <Badge variant="destructive" className="text-[10px]">Compound</Badge>}
        </>
      }
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-5/10">
          <Wrench className="h-5 w-5 text-chart-5" />
        </div>
      }
    >
      {/* Overview */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Tool Information" />
          <CopyableField label="Tool PDA" value={tool.pda} />
          <CopyableField label="Tool Name" value={d.toolName} mono={false} />
          <CopyableField label="HTTP Method" value={method} mono={false} />
          <CopyableField label="Category" value={category} mono={false} />
          <CopyableField label="Version" value={String(d.version)} mono={false} />
          <CopyableField label="Status" value={d.isActive ? 'Active' : 'Inactive'} mono={false} />
          <CopyableField label="Compound" value={d.isCompound ? 'Yes' : 'No'} mono={false} />
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50">
            <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">Solscan</span>
            <SolscanLink type="account" value={tool.pda} label="View on Solscan →" />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">{Number(d.totalInvocations).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Total Invocations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">{d.requiredParams}/{d.paramsCount}</p>
            <p className="text-[10px] text-muted-foreground">Required / Total Params</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">v{d.version}</p>
            <p className="text-[10px] text-muted-foreground">Schema Version</p>
          </CardContent>
        </Card>
      </div>

      {/* Owner Agent */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Owner Agent" />
          <CopyableField label="Agent PDA" value={d.agent} href={`/address/${d.agent}`} />
          {ownerAgent?.identity && (
            <>
              <CopyableField label="Agent Name" value={ownerAgent.identity.name} mono={false} />
              <CopyableField label="Agent Wallet" value={ownerAgent.identity.wallet} href={`/agents/${ownerAgent.identity.wallet}`} truncate />
              <CopyableField label="Agent Status" value={ownerAgent.identity.isActive ? 'Active' : 'Inactive'} mono={false} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Timestamps" />
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Created</span>
              <TimestampDisplay unixSeconds={d.createdAt} />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Last Updated</span>
              <TimestampDisplay unixSeconds={d.updatedAt} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Raw On-Chain Data */}
      <OnChainDataSection title="Raw Tool Descriptor (On-Chain)" data={d as unknown as Record<string, unknown>} />
    </DetailPageShell>
  );
}
