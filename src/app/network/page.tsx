"use client";

/* ──────────────────────────────────────────────────────────
 * Network Page — BubbleMaps v2 style
 *
 * Full-viewport canvas graph with:
 *  • Draggable / zoomable nodes
 *  • Glassmorphism overlay panels
 *  • Animated glow links per type
 *  • Node detail panel on hover
 *  • Legend overlay
 *  • iOS-style "glass water" effects
 * ────────────────────────────────────────────────────────── */

import { useRef, useEffect, useState, useCallback } from "react";
import { useGraph, useMetrics } from "~/hooks/use-sap";
import ForceGraph from "~/components/network/force-graph";
import type { SimNode } from "~/components/network/force-graph";
import NodeDetailModal from "~/components/network/node-detail-modal";

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

/* ── Active filter type ───────────────────────────────── */

type FilterKey = "all" | "agent" | "protocol" | "capability" | "tool";

/* ── Page ─────────────────────────────────────────────── */

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
      if (n.type === activeFilter) {
        visibleNodes.add(n.id);
        return true;
      }
      // Always keep agents that connect to filtered type
      if (n.type === "agent") {
        visibleNodes.add(n.id);
        return true;
      }
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
  const handleNodeClick = useCallback((node: SimNode) => {
    setSelectedNode(node);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeHover = useCallback((node: SimNode | null) => {
    setHoveredNode(node);
  }, []);

  return (
    <div className="network-fullbleed relative flex flex-col overflow-hidden bg-[#080612]">
      {/* ── Top bar (glassmorphism) ─────────────────── */}
      <div className="glass-bar z-30 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-violet-400"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white/90 tracking-tight">
                Network Explorer
              </h1>
              <p className="text-[9px] text-white/30 font-medium tracking-wider uppercase">
                SAP Protocol — Live Map
              </p>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          {(
            ["all", "agent", "protocol", "capability", "tool"] as FilterKey[]
          ).map((key) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`filter-pill ${activeFilter === key ? "filter-pill-active" : ""}`}
            >
              {key === "all" ? (
                "All"
              ) : (
                <>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: TYPE_COLORS[key]?.dot }}
                  />
                  {TYPE_COLORS[key]?.label ?? key}
                </>
              )}
            </button>
          ))}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] text-emerald-400/80 font-medium">
            LIVE
          </span>
        </div>
      </div>

      {/* ── Main canvas area ────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center animate-pulse">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-violet-400 animate-spin"
                  style={{ animationDuration: "3s" }}
                >
                  <circle cx="12" cy="12" r="10" strokeDasharray="30 60" />
                </svg>
              </div>
              <p className="text-xs text-white/30 font-medium">
                Loading network graph…
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="glass-panel-s p-6 text-center max-w-xs">
              <p className="text-xs text-red-400/80">{error}</p>
            </div>
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
            <div className="glass-panel-s p-6 text-center">
              <p className="text-xs text-white/30">No network data</p>
            </div>
          </div>
        )}

        {/* ── Hover detail panel (glassmorphism) ──── */}
        {hoveredNode && (
          <div
            className="glass-panel absolute left-4 top-4 z-20 w-72 max-h-[calc(100%-2rem)] overflow-y-auto animate-fade-in"
            style={{ scrollbarWidth: "none" }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{
                  background: TYPE_COLORS[hoveredNode.type]?.dot ?? "#7c3aed",
                  boxShadow: `0 0 12px ${TYPE_COLORS[hoveredNode.type]?.dot ?? "#7c3aed"}44`,
                }}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {hoveredNode.name}
                </p>
                <p className="text-[9px] uppercase tracking-widest text-white/30 font-medium">
                  {hoveredNode.type}
                </p>
              </div>
            </div>

            <div className="glass-divider" />

            {/* ─ Agent detail ─ */}
            {hoveredNode.type === "agent" && (
              <div className="mt-2.5 space-y-1.5">
                <DetailRow label="PDA" value={hoveredNode.id} mono copyable />
                {hoveredNode.meta?.wallet && (
                  <DetailRow
                    label="Wallet"
                    value={String(hoveredNode.meta.wallet)}
                    mono
                    copyable
                  />
                )}
                <div className="glass-divider my-1" />
                <DetailRow
                  label="Score"
                  value={String(hoveredNode.score)}
                  accent
                />
                <DetailRow
                  label="Calls"
                  value={Number(hoveredNode.calls).toLocaleString()}
                />
                <DetailRow
                  label="Status"
                  value={hoveredNode.isActive ? "● Active" : "○ Inactive"}
                  active={hoveredNode.isActive}
                />
                {hoveredNode.meta?.avgLatencyMs != null &&
                  Number(hoveredNode.meta.avgLatencyMs) > 0 && (
                    <DetailRow
                      label="Latency"
                      value={`${hoveredNode.meta.avgLatencyMs}ms`}
                    />
                  )}
                {hoveredNode.meta?.uptimePercent != null &&
                  Number(hoveredNode.meta.uptimePercent) > 0 && (
                    <DetailRow
                      label="Uptime"
                      value={`${hoveredNode.meta.uptimePercent}%`}
                    />
                  )}
                {hoveredNode.meta?.totalFeedbacks != null && (
                  <DetailRow
                    label="Feedbacks"
                    value={String(hoveredNode.meta.totalFeedbacks)}
                  />
                )}
                {hoveredNode.meta?.description &&
                  String(hoveredNode.meta.description).length > 0 && (
                    <>
                      <div className="glass-divider my-1" />
                      <p className="text-[9px] text-white/40 leading-relaxed">
                        {String(hoveredNode.meta.description)}
                      </p>
                    </>
                  )}
                <div className="glass-divider my-1" />
                {hoveredNode.meta?.capCount != null && (
                  <DetailRow
                    label="Capabilities"
                    value={String(hoveredNode.meta.capCount)}
                  />
                )}
                {hoveredNode.meta?.capabilities &&
                  String(hoveredNode.meta.capabilities).length > 0 && (
                    <p className="text-[9px] text-cyan-400/60 font-mono leading-relaxed">
                      {String(hoveredNode.meta.capabilities)}
                    </p>
                  )}
                {hoveredNode.meta?.protoCount != null && (
                  <DetailRow
                    label="Protocols"
                    value={String(hoveredNode.meta.protoCount)}
                  />
                )}
                {hoveredNode.meta?.protocols &&
                  String(hoveredNode.meta.protocols).length > 0 && (
                    <p className="text-[9px] text-cyan-400/60 font-mono">
                      {String(hoveredNode.meta.protocols)}
                    </p>
                  )}
                {hoveredNode.meta?.x402 && (
                  <DetailRow
                    label="x402"
                    value={String(hoveredNode.meta.x402)}
                    mono
                  />
                )}
                {hoveredNode.meta?.agentId && (
                  <DetailRow
                    label="Agent ID"
                    value={String(hoveredNode.meta.agentId)}
                    mono
                  />
                )}
                {hoveredNode.meta?.version != null && (
                  <DetailRow
                    label="Version"
                    value={String(hoveredNode.meta.version)}
                  />
                )}
                <p className="text-[9px] text-violet-400/50 mt-2 cursor-pointer hover:text-violet-400 transition-colors">
                  Click for details →
                </p>
              </div>
            )}

            {/* ─ Tool detail ─ */}
            {hoveredNode.type === "tool" && hoveredNode.meta && (
              <div className="mt-2.5 space-y-1.5">
                <DetailRow
                  label="Tool PDA"
                  value={String(hoveredNode.meta.toolPda ?? "")}
                  mono
                  copyable
                />
                <DetailRow
                  label="Agent PDA"
                  value={String(hoveredNode.meta.agentPda ?? "")}
                  mono
                  copyable
                />
                <div className="glass-divider my-1" />
                <DetailRow
                  label="Name"
                  value={String(hoveredNode.meta.toolName ?? hoveredNode.name)}
                />
                <DetailRow
                  label="Category"
                  value={String(hoveredNode.meta.category ?? "—")}
                />
                <DetailRow
                  label="HTTP"
                  value={String(hoveredNode.meta.method ?? "—")}
                  mono
                />
                <DetailRow
                  label="Params"
                  value={`${hoveredNode.meta.requiredParams ?? 0} req / ${hoveredNode.meta.paramsCount ?? 0} total`}
                />
                <DetailRow
                  label="Compound"
                  value={hoveredNode.meta.isCompound ? "Yes" : "No"}
                />
                <DetailRow
                  label="Invocations"
                  value={Number(
                    hoveredNode.meta.totalInvocations ?? hoveredNode.calls,
                  ).toLocaleString()}
                />
                <DetailRow
                  label="Version"
                  value={String(hoveredNode.meta.version ?? 0)}
                />
                <DetailRow
                  label="Active"
                  value={hoveredNode.isActive ? "● Yes" : "○ No"}
                  active={hoveredNode.isActive}
                />
              </div>
            )}

            {/* ─ Protocol detail ─ */}
            {hoveredNode.type === "protocol" && (
              <div className="mt-2.5 space-y-1.5">
                <DetailRow
                  label="Protocol"
                  value={String(
                    hoveredNode.meta?.protocolId ?? hoveredNode.name,
                  )}
                  mono
                />
                <DetailRow
                  label="Agents"
                  value={String(hoveredNode.meta?.agentCount ?? 0)}
                />
                {hoveredNode.meta?.agents &&
                  String(hoveredNode.meta.agents).length > 0 && (
                    <>
                      <div className="glass-divider my-1" />
                      <p className="text-[9px] text-white/30 mb-0.5">
                        Linked agent PDAs
                      </p>
                      <p className="text-[9px] text-cyan-400/60 font-mono leading-relaxed">
                        {String(hoveredNode.meta.agents)}
                      </p>
                    </>
                  )}
              </div>
            )}

            {/* ─ Capability detail ─ */}
            {hoveredNode.type === "capability" && (
              <div className="mt-2.5 space-y-1.5">
                <DetailRow
                  label="Capability"
                  value={String(
                    hoveredNode.meta?.capabilityId ?? hoveredNode.name,
                  )}
                  mono
                />
                {hoveredNode.meta?.description &&
                  String(hoveredNode.meta.description).length > 0 && (
                    <p className="text-[9px] text-white/40 leading-relaxed">
                      {String(hoveredNode.meta.description)}
                    </p>
                  )}
                {hoveredNode.meta?.protocolId &&
                  String(hoveredNode.meta.protocolId).length > 0 && (
                    <DetailRow
                      label="Protocol"
                      value={String(hoveredNode.meta.protocolId)}
                      mono
                    />
                  )}
                {hoveredNode.meta?.version &&
                  String(hoveredNode.meta.version).length > 0 && (
                    <DetailRow
                      label="Version"
                      value={String(hoveredNode.meta.version)}
                    />
                  )}
                <DetailRow
                  label="Owners"
                  value={String(hoveredNode.meta?.ownerCount ?? 0)}
                />
                {hoveredNode.meta?.owners &&
                  String(hoveredNode.meta.owners).length > 0 && (
                    <>
                      <div className="glass-divider my-1" />
                      <p className="text-[9px] text-white/30 mb-0.5">
                        Owner agent PDAs
                      </p>
                      <p className="text-[9px] text-violet-400/60 font-mono leading-relaxed">
                        {String(hoveredNode.meta.owners)}
                      </p>
                    </>
                  )}
              </div>
            )}
          </div>
        )}

        {/* ── Legend panel (bottom-left) ──────────── */}
        <div className="glass-panel-s absolute bottom-4 left-4 z-20">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-2">
            Nodes
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {Object.entries(TYPE_COLORS).map(([key, { dot, label }]) => (
              <span
                key={key}
                className="flex items-center gap-1.5 text-[10px] text-white/50"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: dot, boxShadow: `0 0 6px ${dot}44` }}
                />
                {label}
                {nodeCounts && (
                  <span className="text-white/25 ml-0.5">
                    {key === "agent"
                      ? nodeCounts.agents
                      : key === "protocol"
                        ? nodeCounts.protocols
                        : key === "capability"
                          ? nodeCounts.capabilities
                          : nodeCounts.tools}
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="glass-divider my-2" />
          <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">
            Links
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {LINK_LEGEND.map(({ color, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 text-[10px] text-white/40"
              >
                <span
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ background: color }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Stats panel (bottom-right) ─────────── */}
        <div className="glass-panel-s absolute bottom-4 right-4 z-20 text-right">
          {nodeCounts && (
            <div className="flex items-center gap-4">
              <StatBadge
                value={nodeCounts.agents}
                label="agents"
                color="#7c3aed"
              />
              <StatBadge
                value={nodeCounts.protocols}
                label="protos"
                color="#06b6d4"
              />
              <StatBadge
                value={nodeCounts.tools}
                label="tools"
                color="#ec4899"
              />
              <StatBadge
                value={nodeCounts.links}
                label="links"
                color="#64748b"
              />
            </div>
          )}
          {metrics && (
            <p className="text-[9px] text-white/20 mt-1.5">
              Network: {metrics.totalAgents ?? 0} registered ·{" "}
              {metrics.activeAgents ?? 0} active
            </p>
          )}
        </div>

        {/* ── Controls hint (top-right) ──────────── */}
        <div className="glass-panel-xs absolute top-4 right-4 z-20">
          <p className="text-[9px] text-white/25 leading-relaxed">
            <span className="text-white/40">Click</span> node for details
            <br />
            <span className="text-white/40">Drag</span> nodes to reposition
            <br />
            <span className="text-white/40">Scroll</span> to zoom ·{" "}
            <span className="text-white/40">Pan</span> empty space
          </p>
        </div>
      </div>

      {/* ── Node detail modal ────────────────────── */}
      {selectedNode && (
        <NodeDetailModal node={selectedNode} onClose={handleCloseModal} />
      )}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────── */

function DetailRow({
  label,
  value,
  mono,
  accent,
  active,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  active?: boolean;
  copyable?: boolean;
}) {
  // For long addresses, show truncated with full title
  const display =
    copyable && value.length > 16
      ? value.slice(0, 6) + "…" + value.slice(-4)
      : value;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/30 flex-shrink-0">{label}</span>
      <span
        className={`text-[10px] font-medium truncate ${
          accent
            ? "text-violet-400"
            : active !== undefined
              ? active
                ? "text-emerald-400"
                : "text-white/30"
              : "text-white/70"
        } ${mono ? "font-mono" : ""} ${copyable ? "cursor-copy select-all" : ""}`}
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
      <span className="text-sm font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-[8px] text-white/25 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
