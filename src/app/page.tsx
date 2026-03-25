'use client';

import { Activity, Bot, Network, ArrowLeftRight, Wrench, Layers, Wallet, ShieldCheck, Trophy } from 'lucide-react';
import { StatCard, ScoreRing, StatusBadge, Address, ProtocolBadge, Skeleton, PageHeader } from '~/components/ui';
import { useMetrics, useAgents, useAnalytics } from '~/hooks/use-sap';

export default function OverviewPage() {
  const { data: metrics, loading: metricsLoading } = useMetrics();
  const { data: agentsData, loading: agentsLoading } = useAgents({ sortBy: 'reputation', limit: '5' });
  const { data: analytics, loading: analyticsLoading } = useAnalytics();

  const totalAgents = Number(metrics?.totalAgents ?? 0);
  const activeAgents = Number(metrics?.activeAgents ?? 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Network Overview"
        subtitle="Real-time SAP protocol state from on-chain discovery"
      />

      {/* ── Metrics Grid ─────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card"><Skeleton className="h-16 w-full" /></div>
          ))
        ) : metrics ? (
          <>
            <StatCard
              label="Total Agents"
              value={totalAgents}
              icon={<Bot className="h-4 w-4" />}
              className="stagger-1 animate-fade-in"
            />
            <StatCard
              label="Active Agents"
              value={activeAgents}
              icon={<Activity className="h-4 w-4" />}
              trend={totalAgents > 0 ? `${((activeAgents / totalAgents) * 100).toFixed(1)}% active` : undefined}
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

      {/* ── Two-column: Top Agents + Tool Categories */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Top Agents */}
        <div className="glass-card-static p-5 lg:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Top Agents by Reputation</h2>
            <span className="text-[10px] text-white/25 font-medium">on-chain</span>
          </div>

          {agentsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : agentsData?.agents.length ? (
            <div className="space-y-1">
              {agentsData.agents.map((agent, i) => {
                const id = agent.identity;
                if (!id) return null;
                return (
                  <a
                    key={agent.pda}
                    href={`/agents/${id.wallet}`}
                    className="flex items-center gap-4 rounded-2xl px-3 py-3 transition-all duration-state ease-out-smooth hover:bg-white/[0.02]"
                  >
                    <span className="w-5 text-center text-[11px] font-mono text-white/20">
                      {i + 1}
                    </span>
                    <ScoreRing score={id.reputationScore} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-white">{id.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Address value={agent.pda} />
                        <StatusBadge active={id.isActive} />
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-[12px] font-semibold text-white tabular-nums">
                        {Number(id.totalCallsServed).toLocaleString()} calls
                      </p>
                      <p className="text-[10px] text-white/25">
                        {id.avgLatencyMs}ms · {id.uptimePercent}%
                      </p>
                    </div>
                    <div className="hidden gap-1 lg:flex">
                      {id.capabilities.slice(0, 2).map((c) => (
                        <ProtocolBadge key={c.id} protocol={c.protocolId ?? c.id.split(':')[0]} />
                      ))}
                      {id.capabilities.length > 2 && (
                        <span className="badge-blue">+{id.capabilities.length - 2}</span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="py-12 text-center text-[13px] text-white/25">No agents discovered yet</p>
          )}

          {agentsData && (
            <div className="mt-4 flex items-center justify-between border-t border-white/[0.04] pt-3">
              <span className="text-[10px] text-white/20">
                {agentsData.total} agents registered on-chain
              </span>
              <a href="/agents" className="text-[11px] font-medium text-blue-400/70 hover:text-blue-400 transition-colors">
                View all agents →
              </a>
            </div>
          )}
        </div>

        {/* Tool Categories + Network Stats */}
        <div className="space-y-6 lg:col-span-3">
          {/* Tool Categories */}
          <div className="glass-card-static p-5">
            <h2 className="mb-4 text-[14px] font-semibold text-white">Tool Categories</h2>
            {analyticsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : analytics?.categories.length ? (
              <div className="space-y-3">
                {(() => {
                  const totalTools = analytics.categories.reduce((s, c) => s + c.toolCount, 0);
                  return analytics.categories.slice(0, 6).map((cat) => {
                    const pct = totalTools > 0 ? (cat.toolCount / totalTools) * 100 : 0;
                    return (
                      <div key={cat.category}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[12px] text-white/50">{cat.category}</span>
                          <span className="text-[10px] tabular-nums text-white/25">{cat.toolCount} tools · {pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${pct}%`,
                              background: 'linear-gradient(90deg, rgba(59,130,246,0.6), rgba(20,184,166,0.5))',
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="text-[13px] text-white/25">No tool data</p>
            )}
          </div>

          {/* Network Composition */}
          <div className="glass-card-static p-5">
            <h2 className="mb-4 text-[14px] font-semibold text-white">Network Composition</h2>
            {metricsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : metrics ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-white/40">Vaults</span>
                  <span className="text-[14px] font-semibold text-white">{metrics.totalVaults}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-white/40">Attestations</span>
                  <span className="text-[14px] font-semibold text-white">{metrics.totalAttestations}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-white/40">Feedbacks</span>
                  <span className="text-[14px] font-semibold text-white">{metrics.totalFeedbacks}</span>
                </div>
                <div className="glow-line mt-3" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-white">{metrics.totalCapabilities}</p>
                    <p className="text-[9px] text-white/25">Capabilities</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-white">{metrics.totalTools}</p>
                    <p className="text-[9px] text-white/25">Tools</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-white">{metrics.totalProtocols}</p>
                    <p className="text-[9px] text-white/25">Protocols</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Quick Links ──────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { href: '/agents', label: 'Browse Agents', icon: Bot, desc: 'Search & filter all registered agents' },
          { href: '/network', label: 'Network Graph', icon: Network, desc: 'Visualize agent connections' },
          { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight, desc: 'On-chain SAP transactions' },
          { href: '/tools', label: 'Tool Registry', icon: Wrench, desc: 'Browse published tools' },
          { href: '/protocols', label: 'Protocols', icon: Layers, desc: 'Protocols across the network' },
          { href: '/escrows', label: 'Escrow Monitor', icon: Wallet, desc: 'Active escrow accounts' },
          { href: '/attestations', label: 'Attestations', icon: ShieldCheck, desc: 'Web-of-trust attestations' },
          { href: '/reputation', label: 'Reputation', icon: Trophy, desc: 'Agent reputation leaderboard' },
        ].map(({ href, label, icon: Icon, desc }) => (
          <a key={href} href={href} className="glass-card group p-5">
            <div className="mb-3 icon-container h-10 w-10 bg-blue-500/[0.06] text-blue-400/70 group-hover:bg-blue-500/[0.1] transition-all duration-state ease-out-smooth">
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-[13px] font-medium text-white">{label}</p>
            <p className="mt-0.5 text-[11px] text-white/25">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
