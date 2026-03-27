"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  Bot,
  Network,
  ArrowLeftRight,
  Wrench,
  Layers,
  Wallet,
  ShieldCheck,
  Trophy,
  ChevronRight,
  TrendingUp,
  Zap,
  Database,
} from "lucide-react";
import {
  StatCard,
  ScoreRing,
  StatusBadge,
  Address,
  ProtocolBadge,
  Skeleton,
  PageHeader,
} from "~/components/ui";
import { useMetrics, useAgents, useAnalytics } from "~/hooks/use-sap";

export default function OverviewPage() {
  const { data: metrics, loading: metricsLoading } = useMetrics();
  const { data: agentsData, loading: agentsLoading } = useAgents({
    sortBy: "reputation",
    limit: "5",
  });
  const { data: analytics, loading: analyticsLoading } = useAnalytics();

  const [isMobile, setIsMobile] = useState(false);
  const [visibleAgents, setVisibleAgents] = useState(5);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const totalAgents = Number(metrics?.totalAgents ?? 0);
  const activeAgents = Number(metrics?.activeAgents ?? 0);

  // Quick links with mobile-first priority
  const quickLinks = [
    {
      href: "/agents",
      label: "Browse Agents",
      icon: Bot,
      desc: "Search & filter all registered agents",
      priority: 1,
    },
    {
      href: "/network",
      label: "Network Graph",
      icon: Network,
      desc: "Visualize agent connections",
      priority: 2,
    },
    {
      href: "/transactions",
      label: "Transactions",
      icon: ArrowLeftRight,
      desc: "On-chain SAP transactions",
      priority: 3,
    },
    {
      href: "/tools",
      label: "Tool Registry",
      icon: Wrench,
      desc: "Browse published tools",
      priority: 4,
    },
    {
      href: "/protocols",
      label: "Protocols",
      icon: Layers,
      desc: "Protocols across the network",
      priority: 5,
    },
    {
      href: "/escrows",
      label: "Escrow Monitor",
      icon: Wallet,
      desc: "Active escrow accounts",
      priority: 6,
    },
    {
      href: "/attestations",
      label: "Attestations",
      icon: ShieldCheck,
      desc: "Web-of-trust attestations",
      priority: 7,
    },
    {
      href: "/reputation",
      label: "Reputation",
      icon: Trophy,
      desc: "Agent reputation leaderboard",
      priority: 8,
    },
  ];

  // Su mobile mostra solo i primi 4 link
  const displayedLinks = isMobile ? quickLinks.slice(0, 4) : quickLinks;

  return (
    <div className="space-y-4 md:space-y-6 lg:space-y-8 animate-fade-in pb-20 md:pb-0">
      <PageHeader
        title="Network Overview"
        subtitle="Real-time SAP protocol state from on-chain discovery"
      />

      {/* ── Metrics Grid ── Mobile ottimizzato */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card">
              <Skeleton className="h-20 md:h-16 w-full" />
            </div>
          ))
        ) : metrics ? (
          <>
            <StatCard
              label="Total Agents"
              value={totalAgents}
              icon={<Bot className="h-4 w-4" />}
              trend={
                totalAgents > 0
                  ? `${totalAgents.toLocaleString()} total`
                  : undefined
              }
              className="stagger-1 animate-fade-in"
            />
            <StatCard
              label="Active Agents"
              value={activeAgents}
              icon={<Activity className="h-4 w-4" />}
              trend={
                totalAgents > 0
                  ? `${((activeAgents / totalAgents) * 100).toFixed(1)}% active`
                  : undefined
              }
              className="stagger-2 animate-fade-in"
            />
            <StatCard
              label="Registered Tools"
              value={metrics.totalTools}
              icon={<Wrench className="h-4 w-4" />}
              className="stagger-3 animate-fade-in"
            />
            <StatCard
              label="Protocols"
              value={metrics.totalProtocols}
              icon={<Layers className="h-4 w-4" />}
              trend={`${metrics.totalCapabilities} capabilities`}
              className="stagger-4 animate-fade-in"
            />
          </>
        ) : null}
      </div>

      {/* ── Two-column: Top Agents + Tool Categories ── Layout responsive */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-7">
        {/* Top Agents Section - Scrollabile su mobile */}
        <div className="glass-card-static p-4 md:p-5 lg:col-span-4">
          <div className="mb-3 md:mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] md:text-[14px] font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-400" />
              Top Agents by Reputation
            </h2>
            <span className="text-[9px] md:text-[10px] text-white/25 font-medium">
              on-chain
            </span>
          </div>

          {agentsLoading ? (
            <div className="space-y-2 md:space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 md:h-14 w-full" />
              ))}
            </div>
          ) : agentsData?.agents.length ? (
            <>
              <div className="space-y-1 max-h-[400px] md:max-h-none overflow-y-auto md:overflow-visible">
                {agentsData.agents.slice(0, visibleAgents).map((agent, i) => {
                  const id = agent.identity;
                  if (!id) return null;
                  return (
                    <a
                      key={agent.pda}
                      href={`/agents/${id.wallet}`}
                      className="flex flex-wrap items-center gap-2 md:gap-4 rounded-2xl px-2 md:px-3 py-2.5 md:py-3 transition-all duration-state ease-out-smooth hover:bg-white/[0.02] active:bg-white/[0.04]"
                    >
                      <span className="w-5 text-center text-[10px] md:text-[11px] font-mono text-white/20">
                        {i + 1}
                      </span>
                      <ScoreRing
                        score={id.reputationScore}
                        size={32}
                        className="md:hidden"
                      />
                      <ScoreRing
                        score={id.reputationScore}
                        size={36}
                        className="hidden md:block"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] md:text-[13px] font-medium text-white">
                          {id.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-0.5">
                          <Address value={agent.pda} />
                          <StatusBadge active={id.isActive} />
                        </div>
                      </div>

                      {/* Stats - Mobile hidden, Tablet+ visible */}
                      <div className="hidden sm:block text-right">
                        <p className="text-[11px] md:text-[12px] font-semibold text-white tabular-nums">
                          {Number(id.totalCallsServed).toLocaleString()} calls
                        </p>
                        <p className="text-[9px] md:text-[10px] text-white/25">
                          {id.avgLatencyMs}ms · {id.uptimePercent}%
                        </p>
                      </div>

                      {/* Badges - Mobile hidden */}
                      <div className="hidden lg:flex gap-1">
                        {id.capabilities.slice(0, 2).map((c) => (
                          <ProtocolBadge
                            key={c.id}
                            protocol={c.protocolId ?? c.id.split(":")[0]}
                          />
                        ))}
                        {id.capabilities.length > 2 && (
                          <span className="badge-blue text-[10px]">
                            +{id.capabilities.length - 2}
                          </span>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>

              {/* Show more/less button per mobile */}
              {agentsData.agents.length > 5 && (
                <button
                  onClick={() =>
                    setVisibleAgents(
                      visibleAgents === 5 ? agentsData.agents.length : 5,
                    )
                  }
                  className="mt-3 w-full flex items-center justify-center gap-1 py-2 text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors md:hidden"
                >
                  {visibleAgents === 5 ? (
                    <>
                      Show all {agentsData.agents.length} agents{" "}
                      <ChevronRight className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Show less <ChevronRight className="h-3 w-3 rotate-90" />
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            <p className="py-8 md:py-12 text-center text-[12px] md:text-[13px] text-white/25">
              No agents discovered yet
            </p>
          )}

          {agentsData && (
            <div className="mt-3 md:mt-4 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/[0.04] pt-3">
              <span className="text-[9px] md:text-[10px] text-white/20">
                {agentsData.total} agents registered on-chain
              </span>
              <a
                href="/agents"
                className="text-[10px] md:text-[11px] font-medium text-blue-400/70 hover:text-blue-400 transition-colors"
              >
                View all agents →
              </a>
            </div>
          )}
        </div>

        {/* Right Column - Tool Categories + Network Stats */}
        <div className="space-y-4 md:space-y-6 lg:col-span-3">
          {/* Tool Categories with better mobile layout */}
          <div className="glass-card-static p-4 md:p-5">
            <h2 className="mb-3 md:mb-4 text-[13px] md:text-[14px] font-semibold text-white flex items-center gap-2">
              <Database className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-400" />
              Tool Categories
            </h2>
            {analyticsLoading ? (
              <div className="space-y-2 md:space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 md:h-8 w-full" />
                ))}
              </div>
            ) : analytics?.categories.length ? (
              <div className="space-y-2 md:space-y-3">
                {(() => {
                  const totalTools = analytics.categories.reduce(
                    (s, c) => s + c.toolCount,
                    0,
                  );
                  return analytics.categories.slice(0, 6).map((cat) => {
                    const pct =
                      totalTools > 0 ? (cat.toolCount / totalTools) * 100 : 0;
                    return (
                      <div key={cat.category}>
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[11px] md:text-[12px] text-white/50 truncate max-w-[60%]">
                            {cat.category}
                          </span>
                          <span className="text-[9px] md:text-[10px] tabular-nums text-white/25 whitespace-nowrap">
                            {cat.toolCount} tools · {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1 md:h-1.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${pct}%`,
                              background:
                                "linear-gradient(90deg, rgba(59,130,246,0.6), rgba(20,184,166,0.5))",
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="text-[12px] md:text-[13px] text-white/25">
                No tool data
              </p>
            )}
          </div>

          {/* Network Composition - Grid mobile friendly */}
          <div className="glass-card-static p-4 md:p-5">
            <h2 className="mb-3 md:mb-4 text-[13px] md:text-[14px] font-semibold text-white flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 md:h-4 md:w-4 text-cyan-400" />
              Network Composition
            </h2>
            {metricsLoading ? (
              <Skeleton className="h-28 md:h-24 w-full" />
            ) : metrics ? (
              <>
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] md:text-[12px] text-white/40">
                      Vaults
                    </span>
                    <span className="text-[13px] md:text-[14px] font-semibold text-white">
                      {metrics.totalVaults?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] md:text-[12px] text-white/40">
                      Attestations
                    </span>
                    <span className="text-[13px] md:text-[14px] font-semibold text-white">
                      {metrics.totalAttestations?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] md:text-[12px] text-white/40">
                      Feedbacks
                    </span>
                    <span className="text-[13px] md:text-[14px] font-semibold text-white">
                      {metrics.totalFeedbacks?.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="glow-line my-3 md:my-4" />

                {/* Stats grid - responsive columns */}
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[12px] md:text-[13px] font-semibold text-white">
                      {metrics.totalCapabilities}
                    </p>
                    <p className="text-[8px] md:text-[9px] text-white/25">
                      Capabilities
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[12px] md:text-[13px] font-semibold text-white">
                      {metrics.totalTools}
                    </p>
                    <p className="text-[8px] md:text-[9px] text-white/25">
                      Tools
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[12px] md:text-[13px] font-semibold text-white">
                      {metrics.totalProtocols}
                    </p>
                    <p className="text-[8px] md:text-[9px] text-white/25">
                      Protocols
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Quick Links ── Responsive grid con priorità mobile */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {displayedLinks.map(({ href, label, icon: Icon, desc }) => (
          <a
            key={href}
            href={href}
            className="glass-card group p-3 md:p-4 lg:p-5 hover:scale-[1.02] transition-all duration-300 active:scale-[0.98]"
          >
            <div className="mb-2 md:mb-3 icon-container h-8 w-8 md:h-10 md:w-10 bg-blue-500/[0.06] text-blue-400/70 group-hover:bg-blue-500/[0.1] transition-all duration-state ease-out-smooth">
              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </div>
            <p className="text-[11px] md:text-[12px] lg:text-[13px] font-medium text-white">
              {label}
            </p>
            <p className="hidden md:block mt-0.5 text-[10px] md:text-[11px] text-white/25 line-clamp-2">
              {desc}
            </p>
          </a>
        ))}
      </div>

      {/* Mobile bottom padding per migliorare lo scrolling */}
      <div className="h-4 md:h-0" />
    </div>
  );
}
