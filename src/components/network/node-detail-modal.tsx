'use client';

/* ──────────────────────────────────────────────────────────
 * NodeDetailModal — shadcn Dialog for graph node click
 *
 * Shows full detail for any node type (agent/tool/protocol/
 * capability) with a "View Page →" link to navigate to the
 * dedicated entity page.
 * ────────────────────────────────────────────────────────── */

import { useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { X, ArrowRight } from 'lucide-react';
import type { SimNode } from '~/components/network/force-graph';
import { Address, ScoreRing, StatusBadge, ProtocolBadge } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';

/* ── Color palette (mirrors force-graph) ──────────────── */
const TYPE_COLORS: Record<string, { dot: string; label: string }> = {
  agent:      { dot: '#7c3aed', label: 'Agent' },
  protocol:   { dot: '#06b6d4', label: 'Protocol' },
  capability: { dot: '#f59e0b', label: 'Capability' },
  tool:       { dot: '#ec4899', label: 'Tool' },
};

/* ── Helper: page href for each node type ─────────────── */
function nodeHref(node: SimNode): string | null {
  switch (node.type) {
    case 'agent':
      return node.meta?.wallet ? `/agents/${node.meta.wallet}` : `/agents`;
    case 'tool':
      return `/tools`;
    case 'protocol':
      return `/protocols`;
    case 'capability':
      return `/capabilities`;
    default:
      return null;
  }
}

type Props = {
  node: SimNode;
  onClose: () => void;
};

export default function NodeDetailModal({ node, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => { if (e.target === backdropRef.current) onClose(); },
    [onClose],
  );

  const color = TYPE_COLORS[node.type] ?? TYPE_COLORS.agent;
  const href = nodeHref(node);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <Card className="relative w-[420px] max-w-[90vw] max-h-[80vh] overflow-y-auto shadow-2xl" style={{ scrollbarWidth: 'none' }}>
        {/* ── Close button ──────────────────────── */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 h-7 w-7"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>

        <CardContent className="pt-6">
          {/* ── Header ────────────────────────────── */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="mt-0.5 h-4 w-4 rounded-full shrink-0"
              style={{ background: color.dot, boxShadow: `0 0 16px ${color.dot}55` }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold truncate">{node.name}</h2>
              <p className="text-[10px] uppercase tracking-[0.2em] font-medium mt-0.5" style={{ color: color.dot }}>
                {color.label}
              </p>
            </div>
            {node.type === 'agent' && <ScoreRing score={node.score} size={44} />}
          </div>

          <Separator className="mb-4" />

          {/* ── Body (type-specific) ──────────────── */}
          <div className="space-y-3">
            {node.type === 'agent' && <AgentDetail node={node} />}
            {node.type === 'tool' && <ToolDetail node={node} />}
            {node.type === 'protocol' && <ProtocolDetail node={node} />}
            {node.type === 'capability' && <CapabilityDetail node={node} />}
          </div>

          {/* ── Footer ────────────────────────────── */}
          <Separator className="mt-4 mb-3" />
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>
              Close
            </Button>
            {href && (
              <Button variant="default" size="sm" className="text-xs" asChild>
                <Link href={href}>
                  Open Page <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Agent Detail ─────────────────────────────────────── */
function AgentDetail({ node }: { node: SimNode }) {
  const m = node.meta ?? {};
  const protocols = m.protocols ? String(m.protocols).split(', ').filter(Boolean) : [];
  const capabilities = m.capabilities ? String(m.capabilities).split(', ').filter(Boolean) : [];

  return (
    <>
      <Section title="Identity">
        <Row label="PDA" value={<Address value={node.id} copy />} />
        {m.wallet && <Row label="Wallet" value={<Address value={String(m.wallet)} copy />} />}
        {m.agentId && <Row label="Agent ID" value={<span className="font-mono text-xs">{String(m.agentId)}</span>} />}
        {m.version != null && <Row label="Version" value={String(m.version)} />}
      </Section>

      <Section title="Status">
        <Row label="Status" value={<StatusBadge active={node.isActive} />} />
        <Row label="Calls" value={Number(node.calls).toLocaleString()} />
        {Number(m.avgLatencyMs) > 0 && <Row label="Avg Latency" value={`${m.avgLatencyMs}ms`} />}
        {Number(m.uptimePercent) > 0 && <Row label="Uptime" value={`${m.uptimePercent}%`} />}
        {m.totalFeedbacks != null && <Row label="Feedbacks" value={String(m.totalFeedbacks)} />}
        {m.reputationSum != null && <Row label="Reputation Sum" value={String(m.reputationSum)} />}
      </Section>

      {protocols.length > 0 && (
        <Section title="Protocols">
          <div className="flex flex-wrap gap-1.5">
            {protocols.map((p) => <ProtocolBadge key={p} protocol={p} />)}
          </div>
        </Section>
      )}

      {capabilities.length > 0 && (
        <Section title={`Capabilities (${capabilities.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((c) => (
              <Badge key={c} variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-600/20 dark:border-amber-400/20 text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {m.description && String(m.description).length > 0 && (
        <Section title="Description">
          <p className="text-xs text-muted-foreground leading-relaxed">{String(m.description)}</p>
        </Section>
      )}

      {m.x402 && (
        <Section title="x402 Endpoint">
          <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400 break-all">{String(m.x402)}</span>
        </Section>
      )}

      {(m.createdAt || m.updatedAt) && (
        <Section title="Timestamps">
          {m.createdAt && <Row label="Created" value={new Date(Number(m.createdAt) * 1000).toLocaleString()} />}
          {m.updatedAt && <Row label="Updated" value={new Date(Number(m.updatedAt) * 1000).toLocaleString()} />}
        </Section>
      )}
    </>
  );
}

/* ── Tool Detail ──────────────────────────────────────── */
function ToolDetail({ node }: { node: SimNode }) {
  const m = node.meta ?? {};
  return (
    <>
      <Section title="Identity">
        <Row label="Tool PDA" value={<Address value={String(m.toolPda ?? node.id)} copy />} />
        {m.agentPda && <Row label="Agent PDA" value={<Address value={String(m.agentPda)} copy />} />}
        <Row label="Tool Name" value={String(m.toolName ?? node.name)} />
      </Section>
      <Section title="Specification">
        <Row label="Category" value={String(m.category ?? '—')} />
        <Row label="HTTP Method" value={<span className="font-mono text-xs text-cyan-600 dark:text-cyan-400">{String(m.method ?? '—')}</span>} />
        <Row label="Required Params" value={String(m.requiredParams ?? 0)} />
        <Row label="Total Params" value={String(m.paramsCount ?? 0)} />
        <Row label="Compound" value={m.isCompound ? 'Yes' : 'No'} />
      </Section>
      <Section title="Usage">
        <Row label="Invocations" value={Number(m.totalInvocations ?? node.calls).toLocaleString()} />
        <Row label="Active" value={<StatusBadge active={node.isActive} />} />
        {m.version != null && <Row label="Version" value={String(m.version)} />}
      </Section>
      {(m.createdAt || m.updatedAt) && (
        <Section title="Timestamps">
          {m.createdAt && <Row label="Created" value={new Date(Number(m.createdAt) * 1000).toLocaleString()} />}
          {m.updatedAt && <Row label="Updated" value={new Date(Number(m.updatedAt) * 1000).toLocaleString()} />}
        </Section>
      )}
    </>
  );
}

/* ── Protocol Detail ──────────────────────────────────── */
function ProtocolDetail({ node }: { node: SimNode }) {
  const m = node.meta ?? {};
  const agents = m.agents ? String(m.agents).split(', ').filter(Boolean) : [];
  return (
    <>
      <Section title="Protocol">
        <Row label="Protocol ID" value={<span className="font-mono text-xs text-cyan-600 dark:text-cyan-400">{String(m.protocolId ?? node.name)}</span>} />
        <Row label="Agents" value={String(m.agentCount ?? agents.length)} />
      </Section>
      {agents.length > 0 && (
        <Section title="Linked Agents">
          <div className="space-y-1.5">
            {agents.map((a) => <Address key={a} value={a} copy className="block" />)}
          </div>
        </Section>
      )}
    </>
  );
}

/* ── Capability Detail ────────────────────────────────── */
function CapabilityDetail({ node }: { node: SimNode }) {
  const m = node.meta ?? {};
  const owners = m.owners ? String(m.owners).split(', ').filter(Boolean) : [];
  return (
    <>
      <Section title="Capability">
        <Row label="Capability ID" value={<span className="font-mono text-xs text-amber-600 dark:text-amber-400">{String(m.capabilityId ?? node.name)}</span>} />
        {m.description && String(m.description).length > 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{String(m.description)}</p>
        )}
      </Section>
      <Section title="Protocol">
        {m.protocolId && <Row label="Protocol" value={<ProtocolBadge protocol={String(m.protocolId)} />} />}
        {m.version && <Row label="Version" value={String(m.version)} />}
      </Section>
      <Section title={`Owners (${m.ownerCount ?? owners.length})`}>
        {owners.length > 0 ? (
          <div className="space-y-1.5">
            {owners.map((o) => <Address key={o} value={o} copy className="block" />)}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">No owner information available</p>
        )}
      </Section>
    </>
  );
}

/* ── Shared sub-components ────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right truncate">
        {typeof value === 'string' ? value : value}
      </span>
    </div>
  );
}
