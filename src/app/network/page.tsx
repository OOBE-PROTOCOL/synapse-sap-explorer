"use client";

/* ──────────────────────────────────────────────────────────
 * Network Page — BubbleMaps v2 style
 *
 * Full-viewport canvas graph with Card overlay panels.
 * ────────────────────────────────────────────────────────── */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useGraph, useMetrics } from '~/hooks/use-sap';
import ForceGraph from '~/components/network/force-graph';
import type { SimNode } from '~/components/network/force-graph';
import NodeDetailModal from '~/components/network/node-detail-modal';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';

/* ── Color map (matches force-graph palette) ──────────── */
const TYPE_COLORS: Record<string, { dot: string; label: string }> = {
  agent: { dot: "#7c3aed", label: "Agents" },
  protocol: { dot: "#06b6d4", label: "Protocols" },
  capability: { dot: "#f59e0b", label: "Capabilities" },
  tool: { dot: "#ec4899", label: "Tools" },
};

const LINK_LEGEND: { color: string; label: string }[] = [
  { color: "rgba(6, 182, 212, 0.5)", label: "Protocol link" },
  { color: "rgba(251, 191, 36, 0.5)", label: "Capability" },
  { color: "rgba(236, 72, 153, 0.5)", label: "Tool → Agent" },
  { color: "rgba(52, 211, 153, 0.5)", label: "Shared protocol" },
];

type FilterKey = 'all' | 'agent' | 'protocol' | 'capability' | 'tool';

export default function NetworkPage() {
  const { data, loading, error } = useGraph();
  const { data: metrics } = useMetrics();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  /* ── Resize observer ──────────────────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setDimensions({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Filter data ──────────────────────────────────── */
  const filteredData = (() => {
    if (!data || activeFilter === "all") return data;
    const visibleNodes = new Set<string>();
    const filtered = data.nodes.filter((n) => {
      if (n.type === activeFilter) { visibleNodes.add(n.id); return true; }
      if (n.type === 'agent') { visibleNodes.add(n.id); return true; }
      return false;
    });
    const filteredLinks = data.links.filter(
      (l) =>
        visibleNodes.has(l.source as string) &&
        visibleNodes.has(l.target as string),
    );
    return { nodes: filtered, links: filteredLinks };
  })();

  /* ── Node stats ───────────────────────────────────── */
  const nodeCounts = data
    ? {
        agents: data.nodes.filter((n) => n.type === "agent").length,
        protocols: data.nodes.filter((n) => n.type === "protocol").length,
        capabilities: data.nodes.filter((n) => n.type === "capability").length,
        tools: data.nodes.filter((n) => n.type === "tool").length,
        links: data.links.length,
      }
    : null;

  /* ── Callbacks ────────────────────────────────────── */
  const handleNodeClick = useCallback((node: SimNode) => setSelectedNode(node), []);
  const handleCloseModal = useCallback(() => setSelectedNode(null), []);
  const handleNodeHover = useCallback((node: SimNode | null) => setHoveredNode(node), []);

  return (
    <div className="relative flex flex-col overflow-hidden bg-background" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Top bar ─────────────────────────────── */}
      <div className="z-30 flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Network Explorer</h1>
            <p className="text-[9px] text-muted-foreground font-medium tracking-wider uppercase">SAP Protocol — Live Map</p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          {(['all', 'agent', 'protocol', 'capability', 'tool'] as FilterKey[]).map((key) => (
            <Button
              key={key}
              variant={activeFilter === key ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setActiveFilter(key)}
            >
              {key === 'all' ? 'All' : (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5" style={{ background: TYPE_COLORS[key]?.dot }} />
                  {TYPE_COLORS[key]?.label ?? key}
                </>
              )}
            </Button>
          ))}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">LIVE</span>
        </div>
      </div>

      {/* ── Main canvas area ────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 min-h-0 bg-zinc-950 dark:bg-[#080612]">

        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary animate-spin" style={{ animationDuration: '3s' }}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="30 60" />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Loading network graph…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full w-full items-center justify-center">
            <Card className="max-w-xs">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-destructive">{error}</p>
              </CardContent>
            </Card>
          </div>
        ) : filteredData &&
          filteredData.nodes.length > 0 &&
          dimensions.w > 0 ? (
          <ForceGraph
            data={filteredData}
            width={dimensions.w}
            height={dimensions.h}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Card className="max-w-xs">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground">No network data</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Hover detail panel ────────────────── */}
        {hoveredNode && (
          <Card className="absolute left-4 top-4 z-20 w-72 max-h-[calc(100%-2rem)] overflow-y-auto bg-card/95 backdrop-blur-xl shadow-xl animate-in fade-in duration-150" style={{ scrollbarWidth: 'none' }}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[hoveredNode.type]?.dot ?? '#7c3aed', boxShadow: `0 0 12px ${TYPE_COLORS[hoveredNode.type]?.dot ?? '#7c3aed'}44` }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{hoveredNode.name}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">{hoveredNode.type}</p>
                </div>
              </div>

              <Separator className="my-2" />

              {/* ─ Agent detail ─ */}
              {hoveredNode.type === 'agent' && (
                <div className="mt-2.5 space-y-1.5">
                  <HoverRow label="PDA" value={hoveredNode.id} mono copyable />
                  {hoveredNode.meta?.wallet && <HoverRow label="Wallet" value={String(hoveredNode.meta.wallet)} mono copyable />}
                  <Separator className="my-1" />
                  <HoverRow label="Score" value={String(hoveredNode.score)} accent />
                  <HoverRow label="Calls" value={Number(hoveredNode.calls).toLocaleString()} />
                  <HoverRow label="Status" value={hoveredNode.isActive ? '● Active' : '○ Inactive'} active={hoveredNode.isActive} />
                  {hoveredNode.meta?.avgLatencyMs != null && Number(hoveredNode.meta.avgLatencyMs) > 0 && <HoverRow label="Latency" value={`${hoveredNode.meta.avgLatencyMs}ms`} />}
                  {hoveredNode.meta?.uptimePercent != null && Number(hoveredNode.meta.uptimePercent) > 0 && <HoverRow label="Uptime" value={`${hoveredNode.meta.uptimePercent}%`} />}
                  {hoveredNode.meta?.totalFeedbacks != null && <HoverRow label="Feedbacks" value={String(hoveredNode.meta.totalFeedbacks)} />}
                  {hoveredNode.meta?.description && String(hoveredNode.meta.description).length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-[9px] text-muted-foreground leading-relaxed">{String(hoveredNode.meta.description)}</p>
                    </>
                  )}
                  <Separator className="my-1" />
                  {hoveredNode.meta?.capCount != null && <HoverRow label="Capabilities" value={String(hoveredNode.meta.capCount)} />}
                  {hoveredNode.meta?.capabilities && String(hoveredNode.meta.capabilities).length > 0 && (
                    <p className="text-[9px] text-cyan-600 dark:text-cyan-400 font-mono leading-relaxed">{String(hoveredNode.meta.capabilities)}</p>
                  )}
                  {hoveredNode.meta?.protoCount != null && <HoverRow label="Protocols" value={String(hoveredNode.meta.protoCount)} />}
                  {hoveredNode.meta?.protocols && String(hoveredNode.meta.protocols).length > 0 && (
                    <p className="text-[9px] text-cyan-600 dark:text-cyan-400 font-mono">{String(hoveredNode.meta.protocols)}</p>
                  )}
                  {hoveredNode.meta?.x402 && <HoverRow label="x402" value={String(hoveredNode.meta.x402)} mono />}
                  {hoveredNode.meta?.agentId && <HoverRow label="Agent ID" value={String(hoveredNode.meta.agentId)} mono />}
                  {hoveredNode.meta?.version != null && <HoverRow label="Version" value={String(hoveredNode.meta.version)} />}
                  <p className="text-[9px] text-primary/60 mt-2 cursor-pointer hover:text-primary transition-colors">
                    Click for details →
                  </p>
                </div>
              )}

              {/* ─ Tool detail ─ */}
              {hoveredNode.type === 'tool' && hoveredNode.meta && (
                <div className="mt-2.5 space-y-1.5">
                  <HoverRow label="Tool PDA" value={String(hoveredNode.meta.toolPda ?? '')} mono copyable />
                  <HoverRow label="Agent PDA" value={String(hoveredNode.meta.agentPda ?? '')} mono copyable />
                  <Separator className="my-1" />
                  <HoverRow label="Name" value={String(hoveredNode.meta.toolName ?? hoveredNode.name)} />
                  <HoverRow label="Category" value={String(hoveredNode.meta.category ?? '—')} />
                  <HoverRow label="HTTP" value={String(hoveredNode.meta.method ?? '—')} mono />
                  <HoverRow label="Params" value={`${hoveredNode.meta.requiredParams ?? 0} req / ${hoveredNode.meta.paramsCount ?? 0} total`} />
                  <HoverRow label="Compound" value={hoveredNode.meta.isCompound ? 'Yes' : 'No'} />
                  <HoverRow label="Invocations" value={Number(hoveredNode.meta.totalInvocations ?? hoveredNode.calls).toLocaleString()} />
                  <HoverRow label="Version" value={String(hoveredNode.meta.version ?? 0)} />
                  <HoverRow label="Active" value={hoveredNode.isActive ? '● Yes' : '○ No'} active={hoveredNode.isActive} />
                </div>
              )}

              {/* ─ Protocol detail ─ */}
              {hoveredNode.type === 'protocol' && (
                <div className="mt-2.5 space-y-1.5">
                  <HoverRow label="Protocol" value={String(hoveredNode.meta?.protocolId ?? hoveredNode.name)} mono />
                  <HoverRow label="Agents" value={String(hoveredNode.meta?.agentCount ?? 0)} />
                  {hoveredNode.meta?.agents && String(hoveredNode.meta.agents).length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-[9px] text-muted-foreground mb-0.5">Linked agent PDAs</p>
                      <p className="text-[9px] text-cyan-600 dark:text-cyan-400 font-mono leading-relaxed">{String(hoveredNode.meta.agents)}</p>
                    </>
                  )}
                </div>
              )}

              {/* ─ Capability detail ─ */}
              {hoveredNode.type === 'capability' && (
                <div className="mt-2.5 space-y-1.5">
                  <HoverRow label="Capability" value={String(hoveredNode.meta?.capabilityId ?? hoveredNode.name)} mono />
                  {hoveredNode.meta?.description && String(hoveredNode.meta.description).length > 0 && (
                    <p className="text-[9px] text-muted-foreground leading-relaxed">{String(hoveredNode.meta.description)}</p>
                  )}
                  {hoveredNode.meta?.protocolId && String(hoveredNode.meta.protocolId).length > 0 && (
                    <HoverRow label="Protocol" value={String(hoveredNode.meta.protocolId)} mono />
                  )}
                  {hoveredNode.meta?.version && String(hoveredNode.meta.version).length > 0 && (
                    <HoverRow label="Version" value={String(hoveredNode.meta.version)} />
                  )}
                  <HoverRow label="Owners" value={String(hoveredNode.meta?.ownerCount ?? 0)} />
                  {hoveredNode.meta?.owners && String(hoveredNode.meta.owners).length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-[9px] text-muted-foreground mb-0.5">Owner agent PDAs</p>
                      <p className="text-[9px] text-violet-600 dark:text-violet-400 font-mono leading-relaxed">{String(hoveredNode.meta.owners)}</p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Legend panel (bottom-left) ──────────── */}
        <Card className="absolute bottom-4 left-4 z-20 bg-card/90 backdrop-blur-xl shadow-lg">
          <CardContent className="py-3 px-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Nodes</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.entries(TYPE_COLORS).map(([key, { dot, label }]) => (
                <span key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot, boxShadow: `0 0 6px ${dot}44` }} />
                  {label}
                  {nodeCounts && (
                    <span className="text-muted-foreground/50 ml-0.5">
                      {key === 'agent' ? nodeCounts.agents : key === 'protocol' ? nodeCounts.protocols : key === 'capability' ? nodeCounts.capabilities : nodeCounts.tools}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <Separator className="my-2" />
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Links</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {LINK_LEGEND.map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Stats panel (bottom-right) ─────────── */}
        <Card className="absolute bottom-4 right-4 z-20 bg-card/90 backdrop-blur-xl shadow-lg">
          <CardContent className="py-3 px-4 text-right">
            {nodeCounts && (
              <div className="flex items-center gap-4">
                <StatBadge value={nodeCounts.agents} label="agents" color="#7c3aed" />
                <StatBadge value={nodeCounts.protocols} label="protos" color="#06b6d4" />
                <StatBadge value={nodeCounts.tools} label="tools" color="#ec4899" />
                <StatBadge value={nodeCounts.links} label="links" color="#64748b" />
              </div>
            )}
            {metrics && (
              <p className="text-[9px] text-muted-foreground mt-1.5">
                Network: {metrics.totalAgents ?? 0} registered · {metrics.activeAgents ?? 0} active
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Controls hint (top-right) ──────────── */}
        <Card className="absolute top-4 right-4 z-20 bg-card/90 backdrop-blur-xl shadow-lg">
          <CardContent className="py-2.5 px-3.5">
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              <span className="font-medium">Click</span> node for details<br />
              <span className="font-medium">Drag</span> nodes to reposition<br />
              <span className="font-medium">Scroll</span> to zoom · <span className="font-medium">Pan</span> empty space
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Node detail modal ────────────────────── */}
      {selectedNode && (
        <NodeDetailModal node={selectedNode} onClose={handleCloseModal} />
      )}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────── */

function HoverRow({ label, value, mono, accent, active, copyable }: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  active?: boolean;
  copyable?: boolean;
}) {
  const display = copyable && value.length > 16
    ? value.slice(0, 6) + '…' + value.slice(-4)
    : value;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-muted-foreground flex-shrink-0">{label}</span>
      <span
        className={`text-[10px] font-medium truncate ${
          accent ? 'text-violet-600 dark:text-violet-400' :
          active !== undefined ? (active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground') :
          'text-foreground/70'
        } ${mono ? 'font-mono' : ''} ${copyable ? 'cursor-copy select-all' : ''}`}
        title={copyable ? value : undefined}
      >
        {display}
      </span>
    </div>
  );
}

function StatBadge({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[8px] text-muted-foreground/50 uppercase tracking-wider">{label}</span>
    </div>
  );
}
