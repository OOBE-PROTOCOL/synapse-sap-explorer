'use client';

import Link from 'next/link';
import { Activity, Bot, Network, ArrowLeftRight, Wrench, Layers, Wallet, ShieldCheck, Trophy } from 'lucide-react';
import { StatCard, ScoreRing, StatusBadge, Address, ProtocolBadge } from '~/components/ui';
import { Skeleton } from '~/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { useMetrics, useAgents, useAnalytics } from '~/hooks/use-sap';

export default function OverviewPage() {
  const { data: metrics, loading: metricsLoading } = useMetrics();
  const { data: agentsData, loading: agentsLoading } = useAgents({ sortBy: 'reputation', limit: '5' });
  const { data: analytics, loading: analyticsLoading } = useAnalytics();

  const totalAgents = Number(metrics?.totalAgents ?? 0);
  const activeAgents = Number(metrics?.activeAgents ?? 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Page Header ──────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Network Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real-time SAP protocol state from on-chain discovery</p>
      </div>

      {/* ── Metrics Grid ─────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : metrics ? (
          <>
            <StatCard label="Total Agents" value={totalAgents} icon={<Bot className="h-4 w-4" />} />
            <StatCard
              label="Active Agents"
              value={activeAgents}
              icon={<Activity className="h-4 w-4" />}
              trend={totalAgents > 0 ? `${((activeAgents / totalAgents) * 100).toFixed(1)}% active` : undefined}
            />
            <StatCard label="Registered Tools" value={metrics.totalTools} icon={<Wrench className="h-4 w-4" />} />
            <StatCard
              label="Protocols"
              value={metrics.totalProtocols}
              icon={<Layers className="h-4 w-4" />}
              trend={`${metrics.totalCapabilities} capabilities`}
            />
          </>
        ) : null}
      </div>

      {/* ── Two-column: Top Agents + Sidebar ─── */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Top Agents */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top Agents by Reputation</CardTitle>
              <Badge variant="outline" className="text-[10px]">on-chain</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
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
                    <Link
                      key={agent.pda}
                      href={`/agents/${id.wallet}`}
                      className="flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="w-5 text-center text-xs font-mono text-muted-foreground/50">
                        {i + 1}
                      </span>
                      <ScoreRing score={id.reputationScore} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{id.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Address value={agent.pda} />
                          <StatusBadge active={id.isActive} size="xs" />
                        </div>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="text-xs font-semibold text-foreground tabular-nums">
                          {Number(id.totalCallsServed).toLocaleString()} calls
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {id.avgLatencyMs}ms · {id.uptimePercent}%
                        </p>
                      </div>
                      <div className="hidden gap-1 lg:flex">
                        {id.capabilities.slice(0, 2).map((c) => (
                          <ProtocolBadge key={c.id} protocol={c.protocolId ?? c.id.split(':')[0]} />
                        ))}
                        {id.capabilities.length > 2 && (
                          <Badge variant="secondary" className="text-[10px]">+{id.capabilities.length - 2}</Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No agents discovered yet</p>
            )}

            {agentsData && (
              <>
                <Separator className="my-3" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {agentsData.total} agents registered on-chain
                  </span>
                  <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
                    <Link href="/agents">View all agents →</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tool Categories + Network Stats */}
        <div className="space-y-6 lg:col-span-3">
          {/* Tool Categories */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Tool Categories</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
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
                            <span className="text-xs text-muted-foreground">{cat.category}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground/60">{cat.toolCount} tools · {pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tool data</p>
              )}
            </CardContent>
          </Card>

          {/* Network Composition */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Network Composition</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {metricsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : metrics ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Vaults</span>
                    <span className="text-sm font-semibold text-foreground">{metrics.totalVaults}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Attestations</span>
                    <span className="text-sm font-semibold text-foreground">{metrics.totalAttestations}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Feedbacks</span>
                    <span className="text-sm font-semibold text-foreground">{metrics.totalFeedbacks}</span>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{metrics.totalCapabilities}</p>
                      <p className="text-[10px] text-muted-foreground">Capabilities</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{metrics.totalTools}</p>
                      <p className="text-[10px] text-muted-foreground">Tools</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{metrics.totalProtocols}</p>
                      <p className="text-[10px] text-muted-foreground">Protocols</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
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
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardContent className="p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
