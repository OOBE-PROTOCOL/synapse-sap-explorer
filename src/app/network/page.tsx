'use client';

/* ──────────────────────────────────────────────────────────
 * Network Page — Force graph + unified side panel
 *  • Node details + live events inside the same right panel
 *  • Mobile: panel becomes bottom sheet
 *  • Uses text-xs / text-sm tokens (no arbitrary sizes)
 * ────────────────────────────────────────────────────────── */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useGraph, useMetrics, useEscrowEvents, useAllEvents } from '~/hooks/use-sap';
import type { StreamEvent } from '~/hooks/use-sap-stream';
import ForceGraph from '~/components/network/force-graph';
import type { SimNode } from '~/components/network/force-graph';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { X, Radio, ArrowLeftRight, Activity, ExternalLink, Copy, PanelRightOpen } from 'lucide-react';
import { short } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { ApiEscrowEvent } from '~/types/api';

const TYPE_COLORS: Record<string, { dot: string; label: string }> = {
  agent:      { dot: '#07A4B5', label: 'Agents' },
  protocol:   { dot: '#0891B2', label: 'Protocols' },
  capability: { dot: '#22D3EE', label: 'Capabilities' },
  tool:       { dot: '#0E7490', label: 'Tools' },
};

const LINK_LEGEND: { color: string; label: string }[] = [
  { color: 'rgba(8, 145, 178, 0.7)',  label: 'Protocol' },
  { color: 'rgba(34, 211, 238, 0.7)', label: 'Capability' },
  { color: 'rgba(14, 116, 144, 0.7)', label: 'Tool' },
  { color: 'rgba(7, 164, 181, 0.7)',  label: 'Shared' },
];

const STREAM_COLORS: Record<string, string> = {
  sap_event:    '#07A4B5',
  escrow_event: '#22D3EE',
  transaction:  '#0891B2',
  connected:    '#0E7490',
  close:        '#64748b',
};

function escrowColor(t: string) {
  const l = t.toLowerCase();
  if (l.includes('fund'))   return '#10b981';
  if (l.includes('settl'))  return '#0891B2';
  if (l.includes('disput')) return '#22D3EE';
  if (l.includes('releas')) return '#07A4B5';
  if (l.includes('cancel')) return '#ef4444';
  return '#64748b';
}

type FilterKey = 'all' | 'agent' | 'protocol' | 'capability' | 'tool';

export default function NetworkPage() {
  const { data, loading, error } = useGraph();
  const { data: metrics } = useMetrics();
  const { data: escrowEventsData } = useEscrowEvents();
  const { events: streamEvents, connected: streamConnected } = useAllEvents();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [eventsTab, setEventsTab] = useState<'live' | 'escrow'>('live');
  const [filterAgent, setFilterAgent] = useState<string | null>(null);

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

  const filteredData = useMemo(() => {
    if (!data || activeFilter === 'all') return data;
    const vis = new Set<string>();
    data.nodes.forEach((n) => { if (n.type === activeFilter || n.type === 'agent') vis.add(n.id); });
    return {
      nodes: data.nodes.filter((n) => vis.has(n.id)),
      links: data.links.filter((l) => vis.has(l.source as string) && vis.has(l.target as string)),
    };
  }, [data, activeFilter]);

  const nodeCounts = useMemo(() => data ? {
    agents:       data.nodes.filter((n) => n.type === 'agent').length,
    protocols:    data.nodes.filter((n) => n.type === 'protocol').length,
    capabilities: data.nodes.filter((n) => n.type === 'capability').length,
    tools:        data.nodes.filter((n) => n.type === 'tool').length,
    links:        data.links.length,
  } : null, [data]);

  const escrowEvents = useMemo<ApiEscrowEvent[]>(() => {
    const evts = escrowEventsData?.events ?? [];
    if (!filterAgent) return evts.slice(0, 50);
    return evts.filter((e) =>
      e.agentPda === filterAgent || e.depositor === filterAgent || e.signer === filterAgent
    ).slice(0, 50);
  }, [escrowEventsData, filterAgent]);

  const liveEvents = useMemo<StreamEvent[]>(() => {
    const evts = streamEvents.slice(0, 60);
    if (!filterAgent) return evts;
    return evts.filter((e) => JSON.stringify(e.payload).includes(filterAgent));
  }, [streamEvents, filterAgent]);

  const handleNodeClick = useCallback((node: SimNode) => {
    setSelectedNode(node);
    setPanelOpen(true);
    if (node.type === 'agent') setFilterAgent(node.id);
  }, []);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleClearSelected = useCallback(() => {
    setSelectedNode(null);
    setFilterAgent(null);
  }, []);

  const handleNodeHover = useCallback((node: SimNode | null) => setHoveredNode(node), []);

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(186 93% 12%) 0%, hsl(186 93% 6%) 40%, hsl(0 0% 4%) 100%)',
      }}
    >

      {/* ── Top bar ───────────────────────────────────── */}
      <div className="z-30 flex flex-col gap-2 border-b border-border/40 bg-background/60 backdrop-blur-sm px-3 py-2 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">

        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight">Network Explorer</h1>
            <p className="text-xs text-muted-foreground tracking-wider uppercase">SAP — Live Map</p>
          </div>

          {/* Mobile: live status + panel toggle on right */}
          <div className="ml-auto flex items-center gap-2 sm:hidden">
            <LiveDot connected={streamConnected} />
            <Button
              variant={panelOpen ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setPanelOpen((v) => !v)}
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Filter pills — scrollable on mobile */}
        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {(['all', 'agent', 'protocol', 'capability', 'tool'] as FilterKey[]).map((key) => (
            <Button
              key={key}
              variant={activeFilter === key ? 'default' : 'outline'}
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              onClick={() => setActiveFilter(key)}
            >
              {key === 'all' ? 'All' : (
                <>
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLORS[key]?.dot }} />
                  {TYPE_COLORS[key]?.label ?? key}
                </>
              )}
            </Button>
          ))}
        </div>

        {/* Desktop: live status + panel toggle */}
        <div className="hidden items-center gap-3 sm:flex">
          <LiveDot connected={streamConnected} />
          <Button
            variant={panelOpen ? 'default' : 'outline'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <Radio className="h-3.5 w-3.5" />
            Panel
            {streamEvents.length > 0 && (
              <span className="ml-0.5 rounded bg-primary/20 px-1 text-xs tabular-nums">
                {streamEvents.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ── Canvas + Side panel ──────────────────────── */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">

        {/* Canvas */}
        <div ref={containerRef} className="relative flex-1 min-h-0">
          {loading ? (
            <CenterSpinner label="Loading network graph…" />
          ) : error ? (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          ) : filteredData && filteredData.nodes.length > 0 && dimensions.w > 0 ? (
            <ForceGraph
              data={filteredData}
              width={dimensions.w}
              height={dimensions.h}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-xs text-muted-foreground">No network data</p>
            </div>
          )}

          {/* Hover preview (desktop only) */}
          {hoveredNode && hoveredNode.id !== selectedNode?.id && (
            <div className="pointer-events-none absolute left-3 top-3 z-20 hidden w-60 rounded-xl border border-border/40 bg-background/90 px-3 py-2 shadow-xl backdrop-blur-xl sm:block">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    background: TYPE_COLORS[hoveredNode.type]?.dot ?? '#07A4B5',
                    boxShadow: `0 0 10px ${TYPE_COLORS[hoveredNode.type]?.dot ?? '#07A4B5'}66`,
                  }}
                />
                <span className="truncate text-xs font-semibold">{hoveredNode.name}</span>
                <span className="ml-auto text-xs uppercase tracking-widest text-muted-foreground">
                  {hoveredNode.type}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">click for details →</p>
            </div>
          )}

          {/* Legend (desktop only) */}
          <div className="absolute bottom-3 left-3 z-20 hidden rounded-xl border border-border/30 bg-background/70 px-3 py-2 shadow-lg backdrop-blur-lg sm:block">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Nodes</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(TYPE_COLORS).map(([key, { dot, label }]) => (
                <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: dot, boxShadow: `0 0 6px ${dot}44` }}
                  />
                  {label}
                  {nodeCounts && (
                    <span className="ml-0.5 text-muted-foreground/50">
                      {key === 'agent' ? nodeCounts.agents
                        : key === 'protocol' ? nodeCounts.protocols
                        : key === 'capability' ? nodeCounts.capabilities
                        : nodeCounts.tools}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {LINK_LEGEND.map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Stats badges (desktop, when panel closed) */}
          {!panelOpen && nodeCounts && (
            <div className="absolute bottom-3 right-3 z-20 hidden rounded-xl border border-border/30 bg-background/70 px-3 py-2 shadow-lg backdrop-blur-lg sm:block">
              <div className="flex items-center gap-4">
                <StatBadge value={nodeCounts.agents}    label="agents" color="#07A4B5" />
                <StatBadge value={nodeCounts.protocols} label="protos" color="#0891B2" />
                <StatBadge value={nodeCounts.tools}     label="tools"  color="#0E7490" />
                <StatBadge value={nodeCounts.links}     label="links"  color="#64748b" />
              </div>
              {metrics && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {metrics.totalAgents ?? 0} registered · {metrics.activeAgents ?? 0} active
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Side panel: node details + events ───── */}
        {panelOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
              onClick={handleClosePanel}
            />

            <aside
              className={cn(
                'flex flex-col overflow-hidden border-border/30 bg-background/90 backdrop-blur-lg',
                /* Mobile: bottom sheet */
                'fixed inset-x-0 bottom-0 z-40 h-[80vh] rounded-t-2xl border-t shadow-2xl',
                /* Desktop: side panel */
                'sm:static sm:inset-auto sm:h-auto sm:w-[340px] sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none',
              )}
            >
              {/* Mobile drag handle */}
              <div className="flex justify-center pt-2 pb-1 sm:hidden">
                <span className="h-1 w-10 rounded-full bg-border" />
              </div>

              {/* Panel header */}
              <div className="shrink-0 flex items-center justify-between border-b border-border/20 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Radio className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-semibold">Network Activity</span>
                </div>
                <button
                  onClick={handleClosePanel}
                  className="text-muted-foreground/60 transition-colors hover:text-foreground"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

                {/* ── Selected node card (top) ── */}
                {selectedNode && (
                  <NodeDetailCard node={selectedNode} onClear={handleClearSelected} />
                )}

                {/* ── Events section ── */}
                <div className="border-t border-border/20">
                  <div className="sticky top-0 z-10 flex bg-background/95 backdrop-blur-md border-b border-border/20">
                    {([
                      ['live',   'Live Stream', Activity,        liveEvents.length],
                      ['escrow', 'Escrow',      ArrowLeftRight,  escrowEvents.length],
                    ] as const).map(([tab, label, Icon, count]) => (
                      <button
                        key={tab}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                          eventsTab === tab
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => setEventsTab(tab)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        {count > 0 && (
                          <span className="rounded bg-primary/15 px-1 text-xs tabular-nums text-primary">
                            {count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {filterAgent && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/10 bg-primary/5">
                      <span className="text-xs text-muted-foreground">Filtered by:</span>
                      <span className="font-mono text-xs text-primary truncate">{short(filterAgent)}</span>
                      <button
                        onClick={() => setFilterAgent(null)}
                        className="ml-auto text-muted-foreground/60 hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {eventsTab === 'live' ? (
                    liveEvents.length === 0 ? (
                      <EmptyFeed icon={<Radio className="h-6 w-6 animate-pulse text-muted-foreground/20" />} label="Listening for events…" />
                    ) : (
                      <div className="divide-y divide-border/10">
                        {liveEvents.map((ev, i) => (
                          <div key={i} className="px-4 py-2.5 transition-colors hover:bg-muted/5">
                            <div className="mb-1 flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{
                                  background: STREAM_COLORS[ev.type] ?? '#64748b',
                                  boxShadow: `0 0 6px ${STREAM_COLORS[ev.type] ?? '#64748b'}66`,
                                }}
                              />
                              <span className="flex-1 truncate text-xs font-semibold">
                                {ev.type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {Object.keys(ev.payload).length > 0 && (
                              <div className="space-y-0.5 pl-3.5">
                                {Object.entries(ev.payload).slice(0, 4).map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-1.5 text-xs">
                                    <span className="shrink-0 text-muted-foreground/50">{k}:</span>
                                    <span className="truncate font-mono text-muted-foreground/80">
                                      {String(v).slice(0, 28)}{String(v).length > 28 ? '…' : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    escrowEvents.length === 0 ? (
                      <EmptyFeed icon={<ArrowLeftRight className="h-6 w-6 text-muted-foreground/20" />} label="No escrow events" />
                    ) : (
                      <div className="divide-y divide-border/10">
                        {escrowEvents.map((ev, i) => {
                          const c   = escrowColor(ev.eventType);
                          const sol = ev.amountChanged ? (Number(ev.amountChanged) / 1e9).toFixed(4) : null;
                          return (
                            <div key={ev.id ?? i} className="px-4 py-2.5 transition-colors hover:bg-muted/5">
                              <div className="mb-1 flex items-center gap-2">
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: c, boxShadow: `0 0 6px ${c}66` }}
                                />
                                <span className="flex-1 truncate text-xs font-semibold">
                                  {ev.eventType.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                {ev.slot != null && (
                                  <span className="text-xs text-muted-foreground/50">
                                    #{Number(ev.slot).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-0.5 pl-3.5">
                                {ev.agentPda && <EventRow label="agent"  value={short(ev.agentPda)} color="#07A4B5" />}
                                {(ev.depositor ?? ev.signer) && <EventRow label="payer" value={short((ev.depositor ?? ev.signer)!)} color="#0891B2" />}
                                {sol && Number(sol) !== 0 && <EventRow label="amount" value={`${sol} SOL`} color="#10b981" />}
                                {ev.txSignature && (
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="shrink-0 text-muted-foreground/50">tx:</span>
                                    <a
                                      href={`https://solscan.io/tx/${ev.txSignature}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="truncate font-mono text-primary/70 transition-colors hover:text-primary"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {short(ev.txSignature)}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Footer stats */}
              {nodeCounts && (
                <div className="shrink-0 border-t border-border/20 px-4 py-2.5">
                  <div className="flex items-center gap-4">
                    <StatBadge value={nodeCounts.agents}    label="agents" color="#07A4B5" />
                    <StatBadge value={nodeCounts.protocols} label="protos" color="#0891B2" />
                    <StatBadge value={nodeCounts.tools}     label="tools"  color="#0E7490" />
                    <StatBadge value={nodeCounts.links}     label="links"  color="#64748b" />
                  </div>
                  {metrics && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {metrics.totalAgents ?? 0} registered · {metrics.activeAgents ?? 0} active
                    </p>
                  )}
                </div>
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────── */

function NodeDetailCard({ node, onClear }: { node: SimNode; onClear: () => void }) {
  const palette = TYPE_COLORS[node.type] ?? TYPE_COLORS.agent;
  return (
    <div className="border-b border-border/20 bg-gradient-to-b from-primary/5 to-transparent">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ background: palette.dot, boxShadow: `0 0 12px ${palette.dot}66` }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{node.type}</p>
          <p className="truncate text-sm font-semibold">{node.name}</p>
        </div>
        <button
          onClick={onClear}
          className="text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body — type-specific */}
      <div className="space-y-1.5 px-4 pb-3">
        {node.type === 'agent' && (
          <>
            <DetailRow label="PDA"    value={node.id} mono copyable />
            {node.meta?.wallet && <DetailRow label="Wallet" value={String(node.meta.wallet)} mono copyable />}
            <Separator className="my-2" />
            <DetailRow label="Score"  value={String(node.score)} accent />
            <DetailRow label="Calls"  value={Number(node.calls).toLocaleString()} />
            <DetailRow label="Status" value={node.isActive ? '● Active' : '○ Inactive'} active={node.isActive} />
            {node.meta?.avgLatencyMs != null && Number(node.meta.avgLatencyMs) > 0 && (
              <DetailRow label="Latency" value={`${node.meta.avgLatencyMs}ms`} />
            )}
            {node.meta?.capCount   != null && <DetailRow label="Capabilities" value={String(node.meta.capCount)} />}
            {node.meta?.protoCount != null && <DetailRow label="Protocols"    value={String(node.meta.protoCount)} />}
            {node.meta?.description && String(node.meta.description).length > 0 && (
              <>
                <Separator className="my-2" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {String(node.meta.description)}
                </p>
              </>
            )}
            <Separator className="my-2" />
            <a
              href={`/agents/${node.id}`}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              View full agent profile
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}

        {node.type === 'tool' && node.meta && (
          <>
            <DetailRow label="Name"        value={String(node.meta.toolName ?? node.name)} />
            <DetailRow label="Category"    value={String(node.meta.category ?? '—')} />
            <DetailRow label="HTTP"        value={String(node.meta.method ?? '—')} mono />
            <DetailRow label="Invocations" value={Number(node.meta.totalInvocations ?? node.calls).toLocaleString()} />
            <DetailRow label="Active"      value={node.isActive ? '● Yes' : '○ No'} active={node.isActive} />
          </>
        )}

        {node.type === 'protocol' && (
          <>
            <DetailRow label="Protocol" value={String(node.meta?.protocolId ?? node.name)} mono />
            <DetailRow label="Agents"   value={String(node.meta?.agentCount ?? 0)} />
          </>
        )}

        {node.type === 'capability' && (
          <>
            <DetailRow label="Capability" value={String(node.meta?.capabilityId ?? node.name)} mono />
            {node.meta?.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {String(node.meta.description)}
              </p>
            )}
            {node.meta?.protocolId && <DetailRow label="Protocol" value={String(node.meta.protocolId)} mono />}
            <DetailRow label="Owners" value={String(node.meta?.ownerCount ?? 0)} />
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label, value, mono, accent, active, copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  active?: boolean;
  copyable?: boolean;
}) {
  const display = copyable && value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  const onCopy = copyable
    ? (e: React.MouseEvent) => { e.preventDefault(); navigator.clipboard?.writeText(value).catch(() => {}); }
    : undefined;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          'truncate text-xs font-medium',
          accent ? 'text-primary'
            : active !== undefined ? (active ? 'text-emerald-400' : 'text-muted-foreground')
            : 'text-foreground/80',
          mono && 'font-mono',
        )}
        title={copyable ? value : undefined}
      >
        {display}
        {copyable && (
          <button onClick={onCopy} className="ml-1 inline-flex align-middle text-muted-foreground/50 hover:text-foreground">
            <Copy className="h-2.5 w-2.5" />
          </button>
        )}
      </span>
    </div>
  );
}

function EventRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground/50">{label}:</span>
      <span className="truncate font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function EmptyFeed({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12">
      {icon}
      <p className="text-xs text-muted-foreground/50">{label}</p>
    </div>
  );
}

function StatBadge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground/50">{label}</span>
    </div>
  );
}

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
      </span>
      <span className={cn('text-xs font-semibold', connected ? 'text-emerald-400' : 'text-muted-foreground')}>
        {connected ? 'LIVE' : 'offline'}
      </span>
    </div>
  );
}

function CenterSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-primary" style={{ animationDuration: '3s' }}>
            <circle cx="12" cy="12" r="10" strokeDasharray="30 60" />
          </svg>
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
