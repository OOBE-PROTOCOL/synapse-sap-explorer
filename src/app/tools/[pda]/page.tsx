'use client';

/* ──────────────────────────────────────────────────────────
 * Tool Detail Page — /tools/[pda]
 *
 * Solscan-style full tool descriptor introspection:
 * PDA, agent owner, category, HTTP method, params,
 * invocation count, timestamps, version history, raw data.
 * ────────────────────────────────────────────────────────── */

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Skeleton, StatusBadge, Address, HttpMethodBadge, CategoryBadge } from '~/components/ui';
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
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tool || !tool.descriptor) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-[13px] text-white/25">Tool not found: {pda}</p>
        <button onClick={() => router.push('/tools')} className="btn-ghost mt-4">
          <ArrowLeft className="h-3 w-3" /> All Tools
        </button>
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
          {d.isCompound && <span className="badge-red text-[9px]">Compound</span>}
        </>
      }
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/[0.08] border border-pink-500/10">
          <Wrench className="h-5 w-5 text-pink-400" />
        </div>
      }
    >
      {/* ── Overview ─────────────────────────── */}
      <div className="glass-card-static p-5">
        <SectionHeader title="Tool Information" />
        <CopyableField label="Tool PDA" value={tool.pda} />
        <CopyableField label="Tool Name" value={d.toolName} mono={false} />
        <CopyableField label="HTTP Method" value={method} mono={false} />
        <CopyableField label="Category" value={category} mono={false} />
        <CopyableField label="Version" value={String(d.version)} mono={false} />
        <CopyableField label="Status" value={d.isActive ? 'Active' : 'Inactive'} mono={false} />
        <CopyableField label="Compound" value={d.isCompound ? 'Yes' : 'No'} mono={false} />
        <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03]">
          <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">Solscan</span>
          <SolscanLink type="account" value={tool.pda} label="View on Solscan →" />
        </div>
      </div>

      {/* ── Stats ────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="stat-card">
          <p className="metric-value">{Number(d.totalInvocations).toLocaleString()}</p>
          <p className="metric-label">Total Invocations</p>
        </div>
        <div className="stat-card">
          <p className="metric-value">{d.requiredParams}/{d.paramsCount}</p>
          <p className="metric-label">Required / Total Params</p>
        </div>
        <div className="stat-card">
          <p className="metric-value">v{d.version}</p>
          <p className="metric-label">Schema Version</p>
        </div>
      </div>

      {/* ── Owner Agent ──────────────────────── */}
      <div className="glass-card-static p-5">
        <SectionHeader title="Owner Agent" />
        <CopyableField label="Agent PDA" value={d.agent} href={`/address/${d.agent}`} />
        {ownerAgent?.identity && (
          <>
            <CopyableField label="Agent Name" value={ownerAgent.identity.name} mono={false} />
            <CopyableField
              label="Agent Wallet"
              value={ownerAgent.identity.wallet}
              href={`/agents/${ownerAgent.identity.wallet}`}
              truncate
            />
            <CopyableField label="Agent Status" value={ownerAgent.identity.isActive ? 'Active' : 'Inactive'} mono={false} />
          </>
        )}
      </div>

      {/* ── Timestamps ───────────────────────── */}
      <div className="glass-card-static p-5">
        <SectionHeader title="Timestamps" />
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Created</span>
            <TimestampDisplay unixSeconds={d.createdAt} />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Last Updated</span>
            <TimestampDisplay unixSeconds={d.updatedAt} />
          </div>
        </div>
      </div>

      {/* ── Raw On-Chain Data ────────────────── */}
      <OnChainDataSection
        title="Raw Tool Descriptor (On-Chain)"
        data={d as unknown as Record<string, unknown>}
      />
    </DetailPageShell>
  );
}
