'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wrench, Hash, FileJson, Clock, ExternalLink, Shield, Zap, BookOpen, CheckCircle2, AlertCircle, Loader2, Activity, Copy } from 'lucide-react';
import { Skeleton, StatusBadge, HttpMethodBadge, CategoryBadge, ScoreRing, AgentAvatar, ExplorerMetric } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
} from '~/components/ui/explorer';
import { useTools, useAgents, useEscrows, useToolSchemas, useAddressEvents, useToolEvents } from '~/hooks/use-sap';
import type { InscribedSchema, SapEvent, ToolEvent } from '~/hooks/use-sap';
import type { SerializedToolDescriptor, SerializedDiscoveredAgent } from '~/types/sap';
import { hashToHex, hashToFullHex, hashIsEmpty, parseAnchorEnum, formatTimestamp, isDefaultPubkey, formatLamports } from '~/lib/format';

export default function ToolDetailPage() {
  const { pda } = useParams<{ pda: string }>();
  const router = useRouter();
  const { data: toolsData, loading: tLoading } = useTools();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const { data: escrowsData } = useEscrows();
  const { data: schemasData, loading: sLoading } = useToolSchemas(pda);
  const { data: eventsData, loading: evLoading } = useAddressEvents(pda, { limit: 50 });
  const { data: toolEventsData, loading: teLoading } = useToolEvents(pda, 100);
  const loading = tLoading || aLoading;

  const tool = useMemo(() => {
    if (!toolsData?.tools) return null;
    return toolsData.tools.find((t) => t.pda === pda) ?? null;
  }, [toolsData, pda]);

  const ownerAgent = useMemo(() => {
    if (!tool?.descriptor?.agent || !agentsData?.agents) return null;
    return agentsData.agents.find((a) => a.pda === tool.descriptor!.agent) ?? null;
  }, [tool, agentsData]);

  /* Escrow stats for THIS tool's agent PDA */
  const escrowStats = useMemo(() => {
    if (!tool?.descriptor?.agent || !escrowsData?.escrows) return null;
    const agentEscrows = escrowsData.escrows.filter((e) => e.agent === tool.descriptor!.agent);
    const totalSettled = agentEscrows.reduce((s, e) => s + Number(e.totalSettled), 0);
    const totalCallsSettled = agentEscrows.reduce((s, e) => s + Number(e.totalCallsSettled), 0);
    const avgPrice = agentEscrows.length > 0
      ? agentEscrows.reduce((s, e) => s + Number(e.pricePerCall), 0) / agentEscrows.length
      : 0;
    return { count: agentEscrows.length, totalSettled, totalCallsSettled, avgPrice };
  }, [tool, escrowsData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
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
  const hasInputSchema = !hashIsEmpty(d.inputSchemaHash);
  const hasOutputSchema = !hashIsEmpty(d.outputSchemaHash);
  const hasDescHash = !hashIsEmpty(d.descriptionHash);

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
      {/* Key Metrics */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <ExplorerMetric
          label="Paid Calls Settled"
          value={(escrowStats?.totalCallsSettled ?? 0).toLocaleString()}
          icon={<Zap className="h-4 w-4" />}
          accent="primary"
        />
        <ExplorerMetric
          label="Required / Total Params"
          value={`${d.requiredParams} / ${d.paramsCount}`}
          icon={<Hash className="h-4 w-4" />}
          accent="cyan"
        />
        <ExplorerMetric
          label="Schema Version"
          value={`v${d.version}`}
          icon={<FileJson className="h-4 w-4" />}
          accent="emerald"
        />
        <ExplorerMetric
          label="Total SOL Settled"
          value={escrowStats ? formatLamports(escrowStats.totalSettled) : '—'}
          icon={<Shield className="h-4 w-4" />}
          accent="amber"
        />
      </div>

      {/* Tool Identity */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Tool Identity" />
          <CopyableField label="Tool PDA" value={tool.pda} />
          <CopyableField label="Tool Name" value={d.toolName} mono={false} />
          <CopyableField label="HTTP Method" value={method} mono={false} />
          <CopyableField label="Category" value={category} mono={false} />
          <CopyableField label="Schema Version" value={`v${d.version}`} mono={false} />
          <CopyableField label="Status" value={d.isActive ? 'Active' : 'Inactive'} mono={false} />
          <CopyableField label="Type" value={d.isCompound ? 'Compound (multi-step)' : 'Simple (single call)'} mono={false} />
          <CopyableField label="Parameters" value={`${d.requiredParams} required, ${d.paramsCount - d.requiredParams} optional (${d.paramsCount} total)`} mono={false} />
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50">
            <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">Solscan</span>
            <SolscanLink type="account" value={tool.pda} label="View on Solscan →" />
          </div>
        </CardContent>
      </Card>

      {/* Schema Hashes */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-chart-3/20 to-transparent" />
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-3/8 ring-1 ring-chart-3/20">
              <Shield className="h-4 w-4 text-chart-3" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight">Schema Hashes</h3>
              <p className="text-[10px] text-muted-foreground/60">SHA-256 digests stored on the tool PDA</p>
            </div>
          </div>
          <div className="space-y-1">
            {[
              { label: 'Input Schema', tag: 'IN', has: hasInputSchema, hash: d.inputSchemaHash, style: 'text-blue-400 bg-blue-500/8 ring-blue-500/15' },
              { label: 'Output Schema', tag: 'OUT', has: hasOutputSchema, hash: d.outputSchemaHash, style: 'text-emerald-400 bg-emerald-500/8 ring-emerald-500/15' },
              { label: 'Description', tag: 'DESC', has: hasDescHash, hash: d.descriptionHash, style: 'text-amber-400 bg-amber-500/8 ring-amber-500/15' },
              { label: 'Protocol', tag: 'PROTO', has: true, hash: d.protocolHash, style: 'text-muted-foreground bg-muted/30 ring-border/30' },
            ].map(({ label: hashLabel, tag, has, hash, style }) => (
              <div key={tag} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/15 transition-colors group/hash">
                <span className={`inline-flex items-center justify-center w-10 px-1.5 py-0.5 rounded-md text-[9px] font-bold ring-1 ${style}`}>
                  {tag}
                </span>
                <span className="text-[11px] text-muted-foreground/70 min-w-[100px]">{hashLabel}</span>
                <span className="flex-1 text-[10px] font-mono text-foreground/50 truncate text-right select-all">
                  {has ? hashToHex(hash) : <span className="italic text-muted-foreground/30">Not inscribed</span>}
                </span>
                {has && (
                  <button
                    onClick={() => navigator.clipboard.writeText(hashToFullHex(hash))}
                    className="opacity-0 group-hover/hash:opacity-100 transition-opacity text-muted-foreground/40 hover:text-foreground"
                    title="Copy full hash"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Creator / Owner Agent */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-chart-2/20 to-transparent" />
        <CardContent className="pt-6">
          <SectionHeader title="Creator" />
          {ownerAgent?.identity ? (
            <Link href={`/agents/${ownerAgent.identity.wallet}`} className="block rounded-xl p-4 -mx-2 hover:bg-muted/30 transition-all duration-200 group/creator">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <AgentAvatar name={ownerAgent.identity.name} endpoint={ownerAgent.identity.x402Endpoint} size={52} />
                  <div className="absolute -bottom-1 -right-1">
                    <ScoreRing score={ownerAgent.identity.reputationScore ?? 0} size={22} className="ring-2 ring-background rounded-full" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate group-hover/creator:text-primary transition-colors">{ownerAgent.identity.name}</p>
                    <StatusBadge active={ownerAgent.identity.isActive} size="xs" />
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{ownerAgent.identity.wallet}</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
                  <div>
                    <p className="text-xs font-bold tabular-nums">{Number(ownerAgent.identity.totalCallsServed ?? 0).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">calls</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold tabular-nums">{ownerAgent.identity.avgLatencyMs ?? 0}ms</p>
                    <p className="text-[10px] text-muted-foreground">latency</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold tabular-nums">{ownerAgent.identity.uptimePercent ?? 0}%</p>
                    <p className="text-[10px] text-muted-foreground">uptime</p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ) : (
            <>
              <CopyableField label="Agent PDA" value={d.agent} href={`/address/${d.agent}`} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Escrow / Pricing Info */}
      {escrowStats && escrowStats.count > 0 && (
        <Card>
          <CardContent className="pt-6">
            <SectionHeader title="Pricing & Settlements" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-3">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-lg font-bold tabular-nums">{escrowStats.count}</p>
                <p className="text-[10px] text-muted-foreground">Active Escrows</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-lg font-bold tabular-nums">{formatLamports(escrowStats.totalSettled)}</p>
                <p className="text-[10px] text-muted-foreground">Total Settled</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-lg font-bold tabular-nums">{escrowStats.totalCallsSettled.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Calls Settled</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-lg font-bold tabular-nums">{formatLamports(escrowStats.avgPrice)}</p>
                <p className="text-[10px] text-muted-foreground">Avg Price/Call</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Version History */}
      {d.previousVersion && d.previousVersion !== '11111111111111111111111111111111' && (
        <Card>
          <CardContent className="pt-6">
            <SectionHeader title="Version History" />
            <CopyableField label="Previous Version PDA" value={d.previousVersion} href={`/tools/${d.previousVersion}`} />
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Timestamps" />
          <div className="grid gap-4 sm:grid-cols-2 mt-2">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Created</p>
                <TimestampDisplay unixSeconds={d.createdAt} />
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Updated</p>
                <TimestampDisplay unixSeconds={d.updatedAt} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inscribed Schemas (from TX logs) */}
      <InscribedSchemasSection schemas={schemasData?.schemas ?? []} loading={sLoading} descriptor={d} ownerAgent={ownerAgent} />

      {/* Tool Lifecycle Events (from DB) */}
      <ToolLifecycleTimeline events={toolEventsData?.events ?? []} loading={teLoading} />

      {/* SAP Event Timeline */}
      <SapEventTimeline events={eventsData?.events ?? []} scanned={eventsData?.scanned ?? 0} loading={evLoading} />

      {/* Full Deserialized Descriptor */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Full Deserialized Descriptor" />
          <p className="text-[10px] text-muted-foreground -mt-2 mb-4">
            Every field from the on-chain PDA account, decoded and human-readable.
          </p>

          {/* Account Meta */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Account Meta</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/50">
              <DescriptorRow label="bump" value={String(d.bump)} />
              <DescriptorRow label="version" value={String(d.version)} />
              <DescriptorRow label="isActive" value={d.isActive ? 'true' : 'false'} badge={d.isActive ? 'active' : 'inactive'} />
              <DescriptorRow label="isCompound" value={d.isCompound ? 'true' : 'false'} badge={d.isCompound ? 'compound' : undefined} />
            </div>
          </div>

          {/* Identity */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Identity</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/50">
              <DescriptorRow label="toolName" value={d.toolName} />
              <DescriptorRow label="agent" value={d.agent} mono copyable />
              <DescriptorRow label="httpMethod" raw={JSON.stringify(d.httpMethod)} value={parseAnchorEnum(d.httpMethod).toUpperCase()} />
              <DescriptorRow label="category" raw={JSON.stringify(d.category)} value={parseAnchorEnum(d.category)} />
            </div>
          </div>

          {/* Parameters */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Parameters</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/50">
              <DescriptorRow label="paramsCount" value={String(d.paramsCount)} />
              <DescriptorRow label="requiredParams" value={String(d.requiredParams)} />
              <DescriptorRow label="totalInvocations" value={Number(d.totalInvocations).toLocaleString()} raw={d.totalInvocations} />
            </div>
          </div>

          {/* Schema Hashes (full hex) */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Schema Hashes (SHA-256)</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/50">
              <DescriptorHashRow label="toolNameHash" arr={d.toolNameHash} />
              <DescriptorHashRow label="protocolHash" arr={d.protocolHash} />
              <DescriptorHashRow label="descriptionHash" arr={d.descriptionHash} />
              <DescriptorHashRow label="inputSchemaHash" arr={d.inputSchemaHash} />
              <DescriptorHashRow label="outputSchemaHash" arr={d.outputSchemaHash} />
            </div>
          </div>

          {/* Versioning */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Versioning</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/50">
              <DescriptorRow
                label="previousVersion"
                value={isDefaultPubkey(d.previousVersion) ? 'None (genesis version)' : d.previousVersion}
                mono={!isDefaultPubkey(d.previousVersion)}
                copyable={!isDefaultPubkey(d.previousVersion)}
              />
            </div>
          </div>

          {/* Timestamps */}
          <div className="mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Timestamps</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/50">
              <DescriptorRow label="createdAt" value={formatTimestamp(d.createdAt)} raw={d.createdAt} />
              <DescriptorRow label="updatedAt" value={formatTimestamp(d.updatedAt)} raw={d.updatedAt} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Raw JSON fallback */}
      <OnChainDataSection title="Raw JSON (unprocessed)" data={d as unknown as Record<string, unknown>} />
    </DetailPageShell>
  );
}

/* ── Descriptor field row ─────────────────────── */
function DescriptorRow({
  label,
  value,
  raw,
  mono,
  copyable,
  badge,
}: {
  label: string;
  value: string;
  raw?: string;
  mono?: boolean;
  copyable?: boolean;
  badge?: 'active' | 'inactive' | 'compound';
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 group">
      <span className="text-[10px] font-mono text-chart-2 shrink-0 min-w-[150px]">{label}</span>
      <div className="flex items-center gap-2 min-w-0 justify-end">
        {badge === 'active' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-500">Active</span>
        )}
        {badge === 'inactive' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-500">Inactive</span>
        )}
        {badge === 'compound' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary">Compound</span>
        )}
        {raw && raw !== value && (
          <span className="text-[9px] text-muted-foreground/50 hidden sm:inline">({raw})</span>
        )}
        <span className={`text-xs truncate max-w-[400px] ${mono ? 'font-mono' : ''} text-foreground/90`}>
          {value}
        </span>
        {copyable && (
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            title="Copy"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Hash row with full hex + copy ────────────── */
function DescriptorHashRow({ label, arr }: { label: string; arr: number[] }) {
  const isEmpty = !arr || arr.every((b) => b === 0);
  const hex = hashToFullHex(arr);

  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2 group">
      <span className="text-[10px] font-mono text-chart-2 shrink-0 min-w-[150px] pt-0.5">{label}</span>
      <div className="min-w-0 text-right">
        {isEmpty ? (
          <span className="text-[10px] italic text-muted-foreground">Empty (all zeros)</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-foreground/80 break-all leading-relaxed select-all">{hex}</span>
            <button
              onClick={() => navigator.clipboard.writeText(hex)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
              title="Copy hex"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        )}
        <span className="text-[9px] text-muted-foreground/50">{arr?.length ?? 0} bytes</span>
      </div>
    </div>
  );
}

/* ── Inscribed Schemas Section ────────────────── */
const SCHEMA_TYPE_STYLES: Record<string, { bg: string; text: string; ring: string; icon: string }> = {
  input:       { bg: 'bg-blue-500/6', text: 'text-blue-400', ring: 'ring-blue-500/15', icon: '↓' },
  output:      { bg: 'bg-emerald-500/6', text: 'text-emerald-400', ring: 'ring-emerald-500/15', icon: '↑' },
  description: { bg: 'bg-amber-500/6', text: 'text-amber-400', ring: 'ring-amber-500/15', icon: '¶' },
};

const SCHEMA_TYPE_LABELS: Record<string, string> = {
  input: 'Input Schema',
  output: 'Output Schema',
  description: 'Description Schema',
};

function InscribedSchemasSection({
  schemas,
  loading,
  descriptor,
  ownerAgent,
}: {
  schemas: InscribedSchema[];
  loading: boolean;
  descriptor: SerializedToolDescriptor;
  ownerAgent: SerializedDiscoveredAgent | null;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const verified = schemas.map((s) => {
    let onChainHash = '';
    if (s.schemaType === 'input') onChainHash = hashToFullHex(descriptor.inputSchemaHash);
    else if (s.schemaType === 'output') onChainHash = hashToFullHex(descriptor.outputSchemaHash);
    else if (s.schemaType === 'description') onChainHash = hashToFullHex(descriptor.descriptionHash);
    const matchesOnChain = onChainHash && s.schemaHash && onChainHash === s.schemaHash;
    return { ...s, onChainHash, matchesOnChain, integrityVerified: s.verified };
  });

  const deduped = Object.values(
    verified.reduce<Record<string, typeof verified[0]>>((acc, s) => {
      if (!acc[s.schemaType] || (s.blockTime ?? 0) > (acc[s.schemaType].blockTime ?? 0)) {
        acc[s.schemaType] = s;
      }
      return acc;
    }, {}),
  ).sort((a, b) => a.schemaTypeRaw - b.schemaTypeRaw);

  const agentName = ownerAgent?.identity?.name;
  const agentEndpoint = ownerAgent?.identity?.x402Endpoint;

  return (
    <Card className="relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <CardContent className="pt-6">
        {/* Header with inscriber info */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/20">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight">Inscribed Schemas</h3>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Deserialized from on-chain TX log events
              </p>
            </div>
          </div>
          {deduped.length > 0 && (
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground bg-muted/40 px-2 py-1 rounded-md">
              {deduped.length} schema{deduped.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Inscriber badge */}
        {deduped.length > 0 && agentName && (
          <div className="flex items-center gap-2.5 mb-5 px-3 py-2.5 rounded-lg bg-muted/20 ring-1 ring-border/30">
            <AgentAvatar name={agentName} endpoint={agentEndpoint} size={28} />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground/60 leading-none mb-0.5">Inscribed by</p>
              <Link
                href={`/agents/${ownerAgent.identity?.wallet}`}
                className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate block"
              >
                {agentName}
              </Link>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-[9px] font-medium text-emerald-400">Verified Owner</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground/60">Scanning transaction logs for inscribed schemas…</p>
          </div>
        ) : deduped.length === 0 ? (
          <div className="py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/30 mx-auto mb-3">
              <BookOpen className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <p className="text-xs font-medium text-muted-foreground/60">No schemas inscribed yet</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1 max-w-[280px] mx-auto">
              Tool schemas are inscribed via <code className="text-[10px] font-semibold">inscribeSchema()</code> and emitted as Anchor events in TX logs.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {deduped.map((schema, idx) => {
              const isExpanded = expandedIdx === idx;
              const style = SCHEMA_TYPE_STYLES[schema.schemaType] ?? { bg: 'bg-muted/50', text: 'text-muted-foreground', ring: 'ring-border/50', icon: '•' };
              const label = SCHEMA_TYPE_LABELS[schema.schemaType] ?? schema.schemaType;
              const bothVerified = schema.integrityVerified && schema.matchesOnChain;

              return (
                <div
                  key={`${schema.schemaType}-${schema.txSignature}`}
                  className={`rounded-xl ring-1 overflow-hidden transition-all duration-200 ${
                    isExpanded ? `${style.ring} shadow-sm` : 'ring-border/30 hover:ring-border/50'
                  }`}
                >
                  {/* Header — clickable */}
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="flex items-center gap-3.5 w-full px-4 py-3.5 text-left group/schema"
                  >
                    {/* Type indicator */}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.bg} ring-1 ${style.ring} shrink-0 transition-colors group-hover/schema:brightness-110`}>
                      <span className={`text-sm font-bold ${style.text}`}>{style.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-foreground/90 tracking-tight">{label}</p>
                        {schema.version > 0 && (
                          <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/30 px-1.5 py-0.5 rounded">v{schema.version}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {schema.blockTime ? formatTimestamp(schema.blockTime) : `TX ${schema.txSignature.slice(0, 12)}…`}
                      </p>
                    </div>

                    {/* Verification badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      {bothVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/8 ring-1 ring-emerald-500/15 text-[9px] font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Verified
                        </span>
                      ) : schema.integrityVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/8 ring-1 ring-amber-500/15 text-[9px] font-semibold text-amber-400">
                          <AlertCircle className="h-3 w-3" /> Outdated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/8 ring-1 ring-red-500/15 text-[9px] font-semibold text-red-400">
                          <AlertCircle className="h-3 w-3" /> Mismatch
                        </span>
                      )}
                      <svg
                        className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                      >
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded — schema body */}
                  {isExpanded && (
                    <div className="border-t border-border/20">
                      {/* Hash verification strip */}
                      <div className="grid gap-px sm:grid-cols-3 bg-border/10">
                        {[
                          { label: 'Inscribed Hash', value: schema.schemaHash, ok: true },
                          { label: 'Computed SHA-256', value: schema.computedHash, ok: schema.integrityVerified },
                          { label: 'On-Chain Hash', value: schema.onChainHash, ok: schema.matchesOnChain },
                        ].map(({ label: hashLabel, value, ok }) => (
                          <div key={hashLabel} className="px-4 py-2.5 bg-background">
                            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 mb-1">{hashLabel}</p>
                            <p className={`text-[10px] font-mono break-all select-all leading-relaxed ${ok ? 'text-foreground/60' : 'text-red-400/70'}`}>
                              {value || '—'}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* JSON Schema body */}
                      <div className="px-4 pt-4 pb-3">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <FileJson className="h-3.5 w-3.5 text-muted-foreground/40" />
                            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                              {schema.schemaJson ? 'JSON Schema' : 'Raw Content'}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const text = schema.schemaJson ? JSON.stringify(schema.schemaJson, null, 2) : schema.schemaData;
                              navigator.clipboard.writeText(text);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                        </div>

                        {schema.schemaJson ? (
                          <SchemaJsonView data={schema.schemaJson} />
                        ) : (
                          <pre className="text-[11px] font-mono text-foreground/60 bg-muted/20 rounded-lg p-4 overflow-x-auto max-h-[420px] overflow-y-auto leading-relaxed ring-1 ring-border/20" style={{ scrollbarWidth: 'thin' }}>
                            {schema.schemaData}
                          </pre>
                        )}
                      </div>

                      {/* Meta strip */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border/10 text-[10px] text-muted-foreground/50">
                        <span>{schema.compression === 0 ? 'Uncompressed' : schema.compression === 1 ? 'Deflate' : `Compression ${schema.compression}`}</span>
                        <span className="text-muted-foreground/20">·</span>
                        <span>{schema.schemaData.length.toLocaleString()} bytes</span>
                        <span className="text-muted-foreground/20">·</span>
                        <a
                          href={`https://solscan.io/tx/${schema.txSignature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary/60 hover:text-primary transition-colors"
                        >
                          View TX →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {schemas.length > deduped.length && (
              <p className="text-[10px] text-muted-foreground/40 text-center pt-1">
                {schemas.length} total inscriptions found — showing latest per type
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── JSON Schema Viewer — structured, not just a dump ── */
function SchemaJsonView({ data }: { data: Record<string, unknown> }) {
  // If it has typical JSON Schema properties, render them structured
  const title = data.title || data.name;
  const desc = data.description;
  const type = data.type;
  const properties = data.properties as Record<string, Record<string, unknown>> | undefined;
  const required = data.required as string[] | undefined;

  if (!properties || typeof properties !== 'object') {
    // Fallback to formatted JSON
    return (
      <pre className="text-[11px] font-mono text-foreground/60 bg-muted/20 rounded-lg p-4 overflow-x-auto max-h-[420px] overflow-y-auto leading-relaxed ring-1 ring-border/20" style={{ scrollbarWidth: 'thin' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  const titleStr = typeof title === 'string' ? title : undefined;
  const descStr = typeof desc === 'string' ? desc : undefined;
  const typeStr = typeof type === 'string' ? type : undefined;
  const propEntries = Object.entries(properties);

  return (
    <div className="rounded-lg ring-1 ring-border/20 overflow-hidden">
      {/* Schema header */}
      {(titleStr || descStr || typeStr) && (
        <div className="px-4 py-3 bg-muted/15 border-b border-border/15">
          {titleStr && <p className="text-xs font-semibold text-foreground/80">{titleStr}</p>}
          {descStr && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{descStr}</p>}
          {typeStr && <span className="inline-block mt-1.5 text-[9px] font-mono text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded">{typeStr}</span>}
        </div>
      )}

      {/* Properties */}
      <div className="divide-y divide-border/10">
        {propEntries.map(([key, prop]) => {
          const isRequired = required?.includes(key);
          const propType = prop?.type as string | undefined;
          const propDesc = prop?.description as string | undefined;
          const propEnum = prop?.enum as string[] | undefined;
          const propDefault = prop?.default;

          return (
            <div key={key} className="flex items-start gap-3 px-4 py-2.5 group/prop hover:bg-muted/10 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-foreground/80">{key}</span>
                  {propType && (
                    <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/30 px-1 py-0.5 rounded">{propType}</span>
                  )}
                  {isRequired && (
                    <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400/70">required</span>
                  )}
                </div>
                {propDesc && (
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-relaxed">{propDesc}</p>
                )}
                {propEnum && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {propEnum.map((v) => (
                      <span key={v} className="text-[9px] font-mono text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded ring-1 ring-primary/10">{String(v)}</span>
                    ))}
                  </div>
                )}
                {propDefault !== undefined && (
                  <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">default: {JSON.stringify(propDefault)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Raw JSON toggle */}
      <details className="border-t border-border/10">
        <summary className="px-4 py-2 text-[10px] text-muted-foreground/40 cursor-pointer hover:text-muted-foreground/60 transition-colors select-none">
          View raw JSON
        </summary>
        <pre className="text-[10px] font-mono text-foreground/50 bg-muted/10 px-4 py-3 overflow-x-auto max-h-[300px] overflow-y-auto leading-relaxed" style={{ scrollbarWidth: 'thin' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/* ── Tool Lifecycle Timeline ───────────────────── */

const LIFECYCLE_ICONS: Record<string, { icon: string; color: string }> = {
  ToolPublished:         { icon: '🚀', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  ToolUpdated:           { icon: '✏️', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  ToolDeactivated:       { icon: '⏸', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
  ToolReactivated:       { icon: '▶️', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  ToolClosed:            { icon: '🗑', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
  ToolSchemaInscribed:   { icon: '📜', color: 'bg-primary/10 text-primary border-primary/20' },
  ToolInvocationReported:{ icon: '⚡', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
};

const LIFECYCLE_LABELS: Record<string, string> = {
  ToolPublished: 'Published',
  ToolUpdated: 'Updated',
  ToolDeactivated: 'Deactivated',
  ToolReactivated: 'Reactivated',
  ToolClosed: 'Closed',
  ToolSchemaInscribed: 'Schema Inscribed',
  ToolInvocationReported: 'Invocation',
};

function ToolLifecycleTimeline({
  events,
  loading,
}: {
  events: ToolEvent[];
  loading: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const types = useMemo(() => {
    const s = new Set(events.map((e) => e.eventType));
    return Array.from(s).sort();
  }, [events]);

  const filtered = filterType ? events.filter((e) => e.eventType === filterType) : events;

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader title="Tool Lifecycle Events" count={filtered.length}>
          <span className="text-[10px] text-muted-foreground">
            {events.length} total event{events.length !== 1 ? 's' : ''} from DB
          </span>
        </SectionHeader>

        {/* Filter pills */}
        {types.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setFilterType(null)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                !filterType ? 'bg-foreground/10 text-foreground border-foreground/20' : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50'
              }`}
            >
              All
            </button>
            {types.map((t) => {
              const meta = LIFECYCLE_ICONS[t];
              return (
                <button
                  key={t}
                  onClick={() => setFilterType(filterType === t ? null : t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    filterType === t
                      ? (meta?.color ?? 'bg-muted text-muted-foreground border-border')
                      : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50'
                  }`}
                >
                  {meta?.icon} {LIFECYCLE_LABELS[t] ?? t}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading tool lifecycle events…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {filterType ? `No "${LIFECYCLE_LABELS[filterType] ?? filterType}" events found.` : 'No lifecycle events recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {filtered.map((evt, idx) => {
              const isExpanded = expandedIdx === idx;
              const meta = LIFECYCLE_ICONS[evt.eventType] ?? { icon: '•', color: 'bg-muted text-muted-foreground border-border' };
              const label = LIFECYCLE_LABELS[evt.eventType] ?? evt.eventType;

              const details: [string, string][] = [];
              if (evt.toolName) details.push(['Tool', evt.toolName]);
              if (evt.oldVersion != null && evt.newVersion != null && evt.oldVersion !== evt.newVersion) {
                details.push(['Version', `v${evt.oldVersion} → v${evt.newVersion}`]);
              } else if (evt.newVersion != null) {
                details.push(['Version', `v${evt.newVersion}`]);
              }
              if (evt.invocations != null) details.push(['Invocations', Number(evt.invocations).toLocaleString()]);
              if (evt.schemaType != null) details.push(['Schema Type', String(evt.schemaType)]);

              return (
                <div key={`${evt.txSignature}-${evt.eventType}-${idx}`} className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${meta.color}`}>
                      <span>{meta.icon}</span> {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {evt.txSignature.slice(0, 16)}…
                        {evt.blockTime
                          ? ` · ${new Date(evt.blockTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : evt.slot ? ` · slot ${evt.slot}` : ''}
                      </p>
                    </div>
                    {details.length > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{details.length} fields</span>
                    )}
                    <svg
                      className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground mb-2">
                        <span className="font-mono font-semibold text-foreground/70">{evt.eventType}</span>
                        <span>·</span>
                        <a
                          href={`https://solscan.io/tx/${evt.txSignature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 font-mono transition-colors"
                        >
                          {evt.txSignature.slice(0, 20)}… →
                        </a>
                        {evt.blockTime && (
                          <>
                            <span>·</span>
                            <span>{new Date(evt.blockTime).toLocaleString()}</span>
                          </>
                        )}
                        {evt.slot && (
                          <>
                            <span>·</span>
                            <span>Slot {evt.slot.toLocaleString()}</span>
                          </>
                        )}
                      </div>
                      {details.length > 0 ? (
                        <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                          {details.map(([k, v]) => (
                            <div key={k} className="flex items-start justify-between gap-4 px-3 py-1.5">
                              <span className="text-[10px] font-mono text-chart-2 shrink-0 min-w-[120px] pt-0.5">{k}</span>
                              <span className="text-[10px] font-mono text-foreground/80 text-right break-all max-w-[400px]">{v}</span>
                            </div>
                          ))}
                          {evt.agentPda && (
                            <div className="flex items-start justify-between gap-4 px-3 py-1.5">
                              <span className="text-[10px] font-mono text-chart-2 shrink-0 min-w-[120px] pt-0.5">Agent</span>
                              <Link href={`/agents/${evt.agentPda}`} className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors">
                                {evt.agentPda.slice(0, 16)}… →
                              </Link>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No additional fields</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── SAP Event Timeline ───────────────────────── */

const EVENT_COLORS: Record<string, string> = {
  ToolPublishedEvent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  ToolUpdatedEvent: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  ToolDeactivatedEvent: 'bg-red-500/10 text-red-500 border-red-500/20',
  ToolReactivatedEvent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  ToolClosedEvent: 'bg-red-500/10 text-red-500 border-red-500/20',
  ToolSchemaInscribedEvent: 'bg-primary/10 text-primary border-primary/20',
  ToolInvocationReportedEvent: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  PaymentSettledEvent: 'bg-chart-1/10 text-chart-1 border-chart-1/20',
  EscrowDepositedEvent: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  EscrowClosedEvent: 'bg-muted text-muted-foreground border-border',
  CallsReportedEvent: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  AgentRegisteredEvent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  ReputationUpdatedEvent: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
};

const EVENT_SHORT: Record<string, string> = {
  ToolPublishedEvent: 'Published',
  ToolUpdatedEvent: 'Updated',
  ToolDeactivatedEvent: 'Deactivated',
  ToolReactivatedEvent: 'Reactivated',
  ToolClosedEvent: 'Closed',
  ToolSchemaInscribedEvent: 'Schema Inscribed',
  ToolInvocationReportedEvent: 'Invocation Reported',
  PaymentSettledEvent: 'Payment Settled',
  EscrowDepositedEvent: 'Escrow Deposited',
  EscrowClosedEvent: 'Escrow Closed',
  CallsReportedEvent: 'Calls Reported',
  AgentRegisteredEvent: 'Agent Registered',
  ReputationUpdatedEvent: 'Reputation Updated',
};

function SapEventTimeline({
  events,
  scanned,
  loading,
}: {
  events: SapEvent[];
  scanned: number;
  loading: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader title="SAP Event Timeline" count={events.length}>
          {scanned > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Scanned {scanned} transaction{scanned !== 1 ? 's' : ''}
            </span>
          )}
        </SectionHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Scanning transaction logs for SAP events…</span>
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No SAP events found for this address.</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Events are Anchor-encoded in transaction log messages.
            </p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {events.map((evt, idx) => {
              const isExpanded = expandedIdx === idx;
              const colors = EVENT_COLORS[evt.name] ?? 'bg-muted text-muted-foreground border-border';
              const label = EVENT_SHORT[evt.name] ?? evt.name.replace(/Event$/, '');
              const dataKeys = Object.keys(evt.data ?? {});

              return (
                <div key={`${evt.txSignature}-${idx}`} className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${colors}`}>
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {evt.txSignature.slice(0, 16)}…
                        {evt.blockTime
                          ? ` · ${new Date(evt.blockTime * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : ` · slot ${evt.slot}`}
                      </p>
                    </div>
                    {dataKeys.length > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{dataKeys.length} fields</span>
                    )}
                    <svg
                      className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground mb-2">
                        <span className="font-mono font-semibold text-foreground/70">{evt.name}</span>
                        <span>·</span>
                        <a
                          href={`/tx/${evt.txSignature}`}
                          className="text-primary hover:text-primary/80 font-mono transition-colors"
                        >
                          {evt.txSignature.slice(0, 20)}… →
                        </a>
                        {evt.blockTime && (
                          <>
                            <span>·</span>
                            <span>{formatTimestamp(evt.blockTime)}</span>
                          </>
                        )}
                      </div>
                      {dataKeys.length > 0 ? (
                        <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                          {dataKeys.map((k) => {
                            const v = evt.data[k];
                            const display = v === null ? 'null'
                              : typeof v === 'object' ? JSON.stringify(v)
                              : String(v);
                            return (
                              <div key={k} className="flex items-start justify-between gap-4 px-3 py-1.5">
                                <span className="text-[10px] font-mono text-chart-2 shrink-0 min-w-[120px] pt-0.5">{k}</span>
                                <span className="text-[10px] font-mono text-foreground/80 text-right break-all max-w-[400px]">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No fields decoded</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
