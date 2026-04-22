'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Copy, Zap, Clock, TrendingUp, Shield, Activity, Loader2, DollarSign, Wallet, Coins, Rocket, Globe, Hash, ChevronRight } from 'lucide-react';
import { ScoreRing, ReputationBar, StatusBadge, Address, ProtocolBadge, Skeleton, Tabs, EmptyState, AgentAvatar, ExplorerPagination, usePagination } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { useAgent, useTools, useEscrows, useFeedbacks, useAttestations, useVaults, useAddressEvents, useAgentRevenue, useAgentMemory, useX402Payments, useAgentBalances, useAgentStaking } from '~/hooks/use-sap';
import type { SapEvent, X402PaymentRow, X402Stats } from '~/hooks/use-sap';
import { toast } from 'sonner';
import { cn } from '~/lib/utils';

const SOLSCAN = 'https://solscan.io';

function safeDateStr(raw: string | number | null | undefined): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!n || n <= 0 || isNaN(n)) return '—';
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AgentDetailPage() {
  const { wallet } = useParams<{ wallet: string }>();
  const router = useRouter();
  const { data, loading, error } = useAgent(wallet);
  const { data: toolsData } = useTools();
  const { data: escrowsData } = useEscrows();
  const { data: feedbacksData } = useFeedbacks();
  const { data: attestationsData } = useAttestations();
  const { data: vaultsData } = useVaults();
  const { data: eventsData, loading: evLoading } = useAddressEvents(data?.profile?.pda ?? null, { limit: 50 });
  const { data: revenueData, loading: revLoading } = useAgentRevenue(wallet, 30);
  const { data: memoryData, loading: memLoading } = useAgentMemory(data?.profile?.pda ?? undefined);
  const { data: x402Data, loading: x402Loading } = useX402Payments(wallet);
  const { data: balancesData, loading: balLoading } = useAgentBalances(wallet);
  const { data: stakingData } = useAgentStaking(data?.profile?.pda ?? null);
  const [activeTab, setActiveTab] = useState('overview');
  const [copied, setCopied] = useState<string | null>(null);

  const copyAddr = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast.success('Copied');
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 w-full lg:col-span-2" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data?.profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-destructive">{error ?? 'Agent not found'}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/agents')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Agents
        </Button>
      </div>
    );
  }

  const { profile } = data;
  const id = profile.identity;
  const computed = profile.computed ?? {
    isActive: id?.isActive ?? false,
    totalCalls: String(id?.totalCallsServed ?? '0'),
    reputationScore: id?.reputationScore ?? 0,
    hasX402: !!id?.x402Endpoint,
    capabilityCount: id?.capabilities?.length ?? 0,
    pricingTierCount: id?.pricing?.length ?? 0,
    protocols: id?.protocols ?? [],
  };

  const agentTools = toolsData?.tools.filter((t) => t.descriptor?.agent === profile.pda) ?? [];
  const agentEscrows = escrowsData?.escrows.filter((e) => e.agent === profile.pda) ?? [];
  const agentFeedbacks = feedbacksData?.feedbacks.filter((f) => f.agent === profile.pda) ?? [];
  const agentAttestations = attestationsData?.attestations.filter((a) => a.agent === profile.pda) ?? [];
  const agentVaults = vaultsData?.vaults.filter((v) => v.agent === profile.pda) ?? [];
  const agentEvents = eventsData?.events ?? [];
  const protocolSet = new Set<string>(computed.protocols);
  for (const cap of id.capabilities) {
    if (cap.protocolId) protocolSet.add(cap.protocolId);
  }
  const protocols = Array.from(protocolSet);

  const totalCallsSettled = agentEscrows.reduce((s, e) => s + Number(e.totalCallsSettled), 0);
  const totalSolSettled = agentEscrows.reduce((s, e) => s + Number(e.totalSettled), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Back ── */}
      <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white -ml-2" onClick={() => router.push('/agents')}>
        <ArrowLeft className="h-3 w-3 mr-1" /> All Agents
      </Button>

      {/* ═══════════ TOP IDENTITY BAR ═══════════ */}
      <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5">
        <div className="flex items-start gap-5">
          <div className="shrink-0">
            <AgentAvatar name={id.name} endpoint={id.x402Endpoint} size={72} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-white tracking-tight">{id.name}</h1>
              <StatusBadge active={computed.isActive} />
              {computed.hasX402 && (
                <Badge className="text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0">x402</Badge>
              )}
              {balancesData?.deployedTokens && balancesData.deployedTokens.length > 0 && (
                <Badge className="text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0">
                  <Rocket className="h-2.5 w-2.5 mr-0.5" /> Deployer
                </Badge>
              )}
              {stakingData && stakingData.stakedSol > 0 && (
                <Badge className="text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0">
                  <Coins className="h-2.5 w-2.5 mr-0.5" /> {stakingData.stakedSol.toFixed(2)} SOL staked
                </Badge>
              )}
            </div>

            {id.description && (
              <p className="mt-1 text-sm text-neutral-400 line-clamp-2">{id.description}</p>
            )}

            {/* Address row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">PDA</span>
                <button onClick={() => copyAddr(profile.pda)} className="flex items-center gap-1 text-[11px] font-mono text-neutral-300 hover:text-white transition-colors">
                  {profile.pda.slice(0, 12)}…{profile.pda.slice(-8)}
                  <Copy className={cn('h-3 w-3', copied === profile.pda ? 'text-primary' : 'text-neutral-600')} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">Wallet</span>
                <button onClick={() => copyAddr(id.wallet)} className="flex items-center gap-1 text-[11px] font-mono text-neutral-300 hover:text-white transition-colors">
                  {id.wallet.slice(0, 12)}…{id.wallet.slice(-8)}
                  <Copy className={cn('h-3 w-3', copied === id.wallet ? 'text-primary' : 'text-neutral-600')} />
                </button>
              </div>
              <a
                href={`${SOLSCAN}/account/${id.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-primary transition-colors"
              >
                Solscan <ExternalLink className="h-3 w-3" />
              </a>
              {id.x402Endpoint && (
                <a
                  href={id.x402Endpoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-primary transition-colors"
                >
                  <Globe className="h-3 w-3" /> Endpoint
                </a>
              )}
            </div>

            {/* Inline Stats Pills */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {[
                { label: 'Calls', value: totalCallsSettled.toLocaleString(), icon: Zap },
                { label: 'Latency', value: `${id.avgLatencyMs}ms`, icon: Clock },
                { label: 'Uptime', value: `${id.uptimePercent}%`, icon: TrendingUp },
                { label: 'Rep', value: `${computed.reputationScore}`, icon: Shield },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 rounded-md bg-neutral-800/60 px-2.5 py-1">
                  <s.icon className="h-3 w-3 text-primary/70" />
                  <span className="text-[11px] font-bold tabular-nums text-white font-mono">{s.value}</span>
                  <span className="text-[9px] text-neutral-600 uppercase">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ 2-COLUMN OVERVIEW ═══════════ */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── LEFT: Property Grid (2 cols on large) ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview Properties */}
          <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardHeader className="pb-0 px-5 pt-4">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Overview</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-3">
              <div className="divide-y divide-neutral-800">
                <PropertyRow label="Reputation Score" value={
                  <ReputationBar score={computed.reputationScore} />
                } />
                <PropertyRow label="Paid Calls Settled" value={
                  <span className="font-mono font-bold text-white tabular-nums">{totalCallsSettled.toLocaleString('en-US')}</span>
                } />
                <PropertyRow label="Avg Latency" value={
                  <span className="font-mono text-white">{id.avgLatencyMs}ms</span>
                } />
                <PropertyRow label="Uptime" value={
                  <span className="font-mono text-white">{id.uptimePercent}%</span>
                } />
                <PropertyRow label="Capabilities" value={
                  <span className="font-mono text-white">{computed.capabilityCount}</span>
                } />
                <PropertyRow label="Tools" value={
                  <span className="font-mono text-white">{agentTools.length}</span>
                } />
                <PropertyRow label="Pricing Tiers" value={
                  <span className="font-mono text-white">{computed.pricingTierCount}</span>
                } />
                <PropertyRow label="Escrows" value={
                  <span className="font-mono text-white">{agentEscrows.length}</span>
                } />
                <PropertyRow label="Protocols" value={
                  protocols.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {protocols.map((p) => (
                        <ProtocolBadge key={p} protocol={p} />
                      ))}
                    </div>
                  ) : <span className="text-neutral-600">—</span>
                } />
                <PropertyRow label="Version" value={
                  <Badge variant="secondary" className="text-[10px] font-mono tabular-nums">v{id.version}</Badge>
                } />
                <PropertyRow label="Created" value={
                  <span className="text-neutral-300 text-xs">{safeDateStr(id.createdAt)}</span>
                } />
                <PropertyRow label="Updated" value={
                  <span className="text-neutral-300 text-xs">{safeDateStr(id.updatedAt)}</span>
                } />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Portfolio / Balances ── */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {/* Balance Card */}
          <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardHeader className="pb-0 px-5 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> Portfolio
                </CardTitle>
                {balancesData?.totalUsd != null && (
                  <span className="text-sm font-bold tabular-nums text-white font-mono">
                    ${balancesData.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-5 pt-3 pb-4">
              {balLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : balancesData ? (
                <div className="space-y-3">
                  {/* SOL */}
                  <div className="flex items-center gap-3 rounded-lg bg-neutral-800/50 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" alt="SOL" className="h-8 w-8 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">Solana</p>
                      <p className="text-[10px] text-neutral-500">SOL</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-white font-mono">{balancesData.sol.toFixed(4)}</p>
                      {balancesData.solUsd != null && (
                        <p className="text-[10px] text-neutral-500 tabular-nums">${balancesData.solUsd.toFixed(2)}</p>
                      )}
                    </div>
                  </div>

                  {/* USDC */}
                  {balancesData.usdc > 0 && (
                    <div className="flex items-center gap-3 rounded-lg bg-neutral-800/50 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" alt="USDC" className="h-8 w-8 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">USD Coin</p>
                        <p className="text-[10px] text-neutral-500">USDC</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-white font-mono">{balancesData.usdc.toFixed(2)}</p>
                      </div>
                    </div>
                  )}

                  {/* Other tokens */}
                  {balancesData.tokens.length > 0 && (
                    <>
                      <div className="h-px bg-neutral-800" />
                      <p className="text-[9px] text-neutral-600 uppercase tracking-widest font-medium">Other Tokens</p>
                      <div className="space-y-1.5">
                        {balancesData.tokens.map((t) => (
                          <div key={t.mint} className="flex items-center gap-3 py-1.5">
                            {t.meta?.logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.meta.logo} alt={t.meta.symbol} className="h-6 w-6 rounded-full bg-neutral-800 object-cover" />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-[9px] font-bold text-neutral-500">
                                {(t.meta?.symbol ?? t.mint.slice(0, 2)).slice(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-white truncate">{t.meta?.name ?? 'Unknown'}</span>
                                {t.isDeployer && (
                                  <Badge className="text-[8px] bg-primary/15 text-primary border-primary/30 px-1 py-0">
                                    <Rocket className="h-2 w-2" />
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[9px] font-mono text-neutral-600">{t.mint.slice(0, 8)}…</span>
                            </div>
                            <span className="text-xs font-bold tabular-nums text-white font-mono shrink-0">{t.uiAmount.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Deployed tokens */}
                  {balancesData.deployedTokens.length > 0 && (
                    <>
                      <div className="h-px bg-neutral-800" />
                      <div className="flex items-center gap-1.5">
                        <Rocket className="h-3.5 w-3.5 text-primary" />
                        <p className="text-[9px] text-primary uppercase tracking-widest font-semibold">Token Deployer</p>
                        <Badge variant="secondary" className="text-[9px] tabular-nums ml-auto">{balancesData.deployedTokens.length}</Badge>
                      </div>
                      <div className="space-y-1.5">
                        {balancesData.deployedTokens.map((d) => (
                          <div key={d.mint} className="flex items-center gap-2.5 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                            <Coins className="h-3.5 w-3.5 text-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-white">{d.name}</p>
                              {d.symbol && <p className="text-[9px] text-neutral-500">{d.symbol}</p>}
                            </div>
                            <span className="text-[9px] font-mono text-neutral-600">{d.mint.slice(0, 6)}…</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Staking Collateral — always visible */}
                  <>
                    <div className="h-px bg-neutral-800" />
                    <div className="flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-primary" />
                      <p className="text-[9px] text-primary uppercase tracking-widest font-semibold">Staking Collateral</p>
                      {!stakingData && (
                        <span className="ml-auto text-[9px] text-neutral-600">Not initialized</span>
                      )}
                    </div>
                    {stakingData ? (
                      <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-500">Staked</span>
                          <span className="font-bold text-primary tabular-nums font-mono">{stakingData.stakedSol.toFixed(4)} SOL</span>
                        </div>
                        {stakingData.unstakeAmountSol > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-neutral-500">Unstaking</span>
                            <span className="font-bold text-amber-400 tabular-nums font-mono">{stakingData.unstakeAmountSol.toFixed(4)} SOL</span>
                          </div>
                        )}
                        {stakingData.slashedSol > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-neutral-500">Slashed</span>
                            <span className="font-bold text-destructive tabular-nums font-mono">{stakingData.slashedSol.toFixed(4)} SOL</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-500">Disputes W/L</span>
                          <span className="font-mono text-neutral-400">{stakingData.totalDisputesWon}/{stakingData.totalDisputesLost}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2">
                        <p className="text-[10px] text-neutral-600 text-center">No stake account on-chain</p>
                      </div>
                    )}
                  </>
                </div>
              ) : (
                <EmptyState message="Unable to load balances" />
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ═══════════ TABS ═══════════ */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'revenue', label: 'SAP Revenue' },
          { value: 'tools', label: 'Tools', count: agentTools.length },
          { value: 'escrows', label: 'Escrows', count: agentEscrows.length },
          { value: 'events', label: 'SAP Events', count: agentEvents.length },
          { value: 'feedbacks', label: 'Feedbacks', count: agentFeedbacks.length },
          { value: 'attestations', label: 'Attestations', count: agentAttestations.length },
          { value: 'vault', label: 'Memory Vaults', count: memoryData?.stats?.vaultCount ?? agentVaults.length },
          { value: 'x402', label: 'x402 Txns', count: x402Data?.total ?? 0 },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {(protocols.length > 0 || id.capabilities.length > 0) && (
            <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
              <CardHeader className="pb-0 px-5 pt-4">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Protocol & Capabilities</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-3 space-y-3">
                <div>
                  <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium mb-2">Protocols</p>
                  {protocols.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {protocols.map((p) => (
                        <ProtocolBadge key={p} protocol={p} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600">No protocol metadata available.</p>
                  )}
                </div>

                <div className="h-px bg-neutral-800" />

                <div>
                  <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium mb-2">Capabilities</p>
                  {id.capabilities.length > 0 ? (
                    <div className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
                      {id.capabilities.map((c) => (
                        <Link
                          key={c.id}
                          href={`/capabilities/${encodeURIComponent(c.id)}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/40 transition-colors group"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Zap className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-medium text-white">{c.id}</span>
                              {c.protocolId && <ProtocolBadge protocol={c.protocolId} />}
                            </div>
                            {c.description && <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{c.description}</p>}
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-neutral-700 group-hover:text-neutral-400 transition-colors shrink-0" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600">No capabilities published yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {id.pricing.length > 0 && (
            <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
              <CardHeader className="pb-0 px-5 pt-4">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Pricing Tiers</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pt-3 pb-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {id.pricing.map((p) => (
                    <div key={p.tierId} className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{p.tierId}</p>
                      <p className="mt-1 text-lg font-bold text-white font-mono">{formatPrice(p.pricePerCall, p.tokenDecimals)}</p>
                      <p className="text-[10px] text-neutral-500">{formatTokenType(p.tokenType)} per call</p>
                      <div className="h-px bg-neutral-800 my-2" />
                      <div className="space-y-1 text-[10px] text-neutral-500">
                        <p>Rate limit: <span className="text-neutral-300">{p.rateLimit}/s</span></p>
                        <p>Max/session: <span className="text-neutral-300">{p.maxCallsPerSession === 0 ? '∞' : p.maxCallsPerSession}</span></p>
                        <p>Settlement: <span className="text-neutral-300">{formatSettlement(p.settlementMode)}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab: Revenue */}
      {activeTab === 'revenue' && (
        <AgentRevenueTab
          revenueData={revenueData}
          loading={revLoading}
          escrows={agentEscrows}
          totalSolSettled={totalSolSettled}
          totalCallsSettled={totalCallsSettled}
        />
      )}

      {/* Tab: Tools */}
      {activeTab === 'tools' && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-0 px-5 pt-4">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Registered Tools</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pt-3 pb-4">
            {agentTools.length === 0 ? (
              <EmptyState message="No tools registered by this agent" />
            ) : (
              <div className="space-y-2">
                {agentTools.map((t) => (
                  <div key={t.pda} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
                    <span className="text-sm font-medium text-white">{t.descriptor?.toolName ?? 'Unnamed'}</span>
                    {t.descriptor?.httpMethod && (
                      <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">
                        {typeof t.descriptor.httpMethod === 'object' ? Object.keys(t.descriptor.httpMethod)[0] : t.descriptor.httpMethod}
                      </Badge>
                    )}
                    {t.descriptor?.category && (
                      <Badge variant="outline" className="text-[10px]">
                        {typeof t.descriptor.category === 'object' ? Object.keys(t.descriptor.category)[0] : t.descriptor.category}
                      </Badge>
                    )}
                    <span className="ml-auto text-[10px] text-neutral-500 tabular-nums">
                      {agentEscrows.reduce((s, e) => s + Number(e.totalCallsSettled), 0).toLocaleString()} calls settled
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Escrows */}
      {activeTab === 'escrows' && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-0 px-5 pt-4">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Escrow Accounts</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pt-3 pb-4">
            {agentEscrows.length === 0 ? (
              <EmptyState message="No escrows found for this agent" />
            ) : (
              <div className="space-y-3">
                {agentEscrows.map((e) => (
                  <div key={e.pda} className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Address value={e.pda} copy />
                      {Number(e.balance) > 0 ? (
                        <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">Funded</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">Empty</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-sm font-bold tabular-nums text-white font-mono">{e.balance}</p>
                        <p className="text-[10px] text-neutral-500">Balance</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-white font-mono">{e.totalDeposited}</p>
                        <p className="text-[10px] text-neutral-500">Deposited</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-white font-mono">{e.totalCallsSettled}</p>
                        <p className="text-[10px] text-neutral-500">Calls Settled</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Feedbacks */}
      {activeTab === 'feedbacks' && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-0 px-5 pt-4">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Feedback Received</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pt-3 pb-4">
            {agentFeedbacks.length === 0 ? (
              <EmptyState message="No feedback received yet" />
            ) : (
              <div className="space-y-2">
                {agentFeedbacks.map((f) => (
                  <div key={f.pda} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <span className="text-xs font-bold text-primary">{f.score}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Address value={f.reviewer} />
                        {f.tag && <Badge variant="outline" className="text-[10px]">{f.tag}</Badge>}
                      </div>
                      <p className="text-[10px] text-neutral-500">{new Date(Number(f.createdAt) * 1000).toLocaleDateString()}</p>
                    </div>
                    {f.isRevoked && <Badge variant="destructive" className="text-[10px]">Revoked</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Attestations */}
      {activeTab === 'attestations' && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-0 px-5 pt-4">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Attestations</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pt-3 pb-4">
            {agentAttestations.length === 0 ? (
              <EmptyState message="No attestations for this agent" />
            ) : (
              <div className="space-y-2">
                {agentAttestations.map((a) => (
                  <div key={a.pda} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{a.attestationType}</Badge>
                        <Address value={a.attester} />
                      </div>
                      <p className="text-[10px] text-neutral-500">{new Date(Number(a.createdAt) * 1000).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge active={a.isActive} size="xs" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Events */}
      {activeTab === 'events' && (
        <AgentEventTimeline events={agentEvents} scanned={eventsData?.scanned ?? 0} loading={evLoading} />
      )}

      {/* Tab: Vault / Memory */}
      {activeTab === 'vault' && (
        <AgentMemoryTab memoryData={memoryData} loading={memLoading} fallbackVaults={agentVaults} />
      )}

      {/* Tab: x402 Direct Payments */}
      {activeTab === 'x402' && (
        <AgentX402Tab
          payments={x402Data?.payments ?? []}
          stats={x402Data?.stats ?? null}
          total={x402Data?.total ?? 0}
          loading={x402Loading}
        />
      )}
    </div>
  );
}

/* ── Solscan-style property row ──────────────── */

function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <span className="text-xs text-neutral-500 shrink-0">{label}</span>
      <div className="text-right">{value}</div>
    </div>
  );
}

function formatPrice(lamportsStr: string, decimals?: number | null): string {
  const n = Number(lamportsStr);
  const dec = decimals ?? 9;
  return (n / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
}

function formatTokenType(t: unknown): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return Object.keys(t)[0] ?? 'token';
  return 'token';
}

function formatSettlement(s: unknown): string {
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') return Object.keys(s)[0] ?? 'x402';
  return 'x402';
}

/* ── Agent Revenue Tab ────────────────────────── */

import type { AgentRevenueResponse } from '~/hooks/use-sap';
import type { SerializedEscrow } from '~/lib/sap/discovery';

/* ── Agent x402 Direct Payments Tab ───────────── */

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const KNOWN_MINTS: Record<string, { symbol: string; icon: string; color: string }> = {
  [USDC_MINT]: { symbol: 'USDC', icon: '$', color: '#2775CA' },
};

function AgentX402Tab({
  payments,
  stats,
  total,
  loading,
}: {
  payments: X402PaymentRow[];
  stats: X402Stats | null;
  total: number;
  loading: boolean;
}) {
  const { page, perPage, setPage, setPerPage, paginate } = usePagination(payments.length, 10);
  const paged = paginate(payments);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Payments', value: String(stats?.totalPayments ?? 0) },
          { label: 'Total Volume', value: `$${Number(stats?.totalAmount ?? 0).toFixed(2)}` },
          { label: 'Unique Payers', value: String(stats?.uniquePayers ?? 0) },
          { label: 'With x402 Memo', value: String(stats?.withMemo ?? 0) },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-xl font-bold tabular-nums text-white font-mono">{kpi.value}</p>
              <p className="text-[10px] text-neutral-500 mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment list */}
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" />
            Direct Payments ({total})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pt-3 pb-0">
          {payments.length === 0 ? (
            <EmptyState icon={<DollarSign className="h-6 w-6" />} message="No x402 direct payments detected yet" />
          ) : (
            <div className="divide-y divide-neutral-800">
              {paged.map((p) => {
                const mintInfo = KNOWN_MINTS[p.mint];
                const symbol = mintInfo?.symbol ?? p.mint.slice(0, 6);
                return (
                  <div key={p.signature} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/tx/${p.signature}`}
                          className="text-xs font-mono text-primary hover:text-primary transition-colors truncate max-w-[200px]"
                        >
                          {p.signature.slice(0, 16)}…
                        </Link>
                        {p.hasX402Memo && (
                          <Badge className="text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0">x402</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                        <span>From:</span>
                        <span className="font-mono text-neutral-400">{p.payerWallet.slice(0, 12)}…{p.payerWallet.slice(-6)}</span>
                        {p.memo && (
                          <span className="ml-2 italic truncate max-w-[200px] text-neutral-600">{p.memo}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-sm font-bold tabular-nums font-mono" style={{ color: mintInfo?.color ?? '#f97316' }}>
                        +{Number(p.amount).toFixed(p.decimals > 2 ? 4 : 2)} {symbol}
                      </p>
                      <p className="text-[10px] text-neutral-600">
                        {p.blockTime ? new Date(p.blockTime).toLocaleString() : `Slot ${p.slot}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {payments.length > 0 && (
          <ExplorerPagination
            page={page}
            total={payments.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            perPageOptions={[10, 25, 50]}
          />
        )}
      </Card>
    </div>
  );
}

function AgentRevenueTab({
  revenueData,
  loading,
  escrows: agentEscrows,
  totalSolSettled,
  totalCallsSettled,
}: {
  revenueData: AgentRevenueResponse | null;
  loading: boolean;
  escrows: SerializedEscrow[];
  totalSolSettled: number;
  totalCallsSettled: number;
}) {
  const series = revenueData?.series ?? [];
  const maxLamports = series.length > 0 ? Math.max(...series.map((s) => Number(s.lamports)), 1) : 1;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Settled', value: `${(totalSolSettled / 1e9).toFixed(4)} SOL` },
          { label: 'Total Calls Settled', value: totalCallsSettled.toLocaleString('en-US') },
          { label: 'Total Escrows', value: String(agentEscrows.length) },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-xl font-bold tabular-nums text-white font-mono">{kpi.value}</p>
              <p className="text-[10px] text-neutral-500 mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily bar chart */}
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Daily Settlement (last 30d)</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pt-3 pb-4">
          {loading ? (
            <Skeleton className="h-24 w-full rounded" />
          ) : series.length === 0 ? (
            <p className="text-xs text-neutral-600 py-4 text-center">
              No settlement ledger data yet. Populate via the indexer sync job.
            </p>
          ) : (
            <div className="space-y-1.5">
              {series.map((s) => {
                const pct = Math.max(2, Math.round((Number(s.lamports) / maxLamports) * 100));
                return (
                  <div key={s.day} className="flex items-center gap-3">
                    <span className="text-[10px] text-neutral-500 w-20 shrink-0">
                      {new Date(s.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-4 bg-neutral-800/50 rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm bg-primary/50 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-neutral-300 w-20 text-right shrink-0">{s.sol} SOL</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Escrow breakdown */}
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Escrow Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pt-3 pb-4">
          <div className="divide-y divide-neutral-800">
            {agentEscrows.map((e) => (
              <div key={e.pda} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <Link href={`/escrows/${e.pda}`} className="text-xs font-mono text-neutral-300 hover:text-primary transition-colors">
                    {e.pda.slice(0, 12)}…{e.pda.slice(-8)}
                  </Link>
                  {Number(e.balance) > 0
                    ? <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0">Funded</Badge>
                    : <Badge className="text-[10px] bg-neutral-800 text-neutral-500 border border-neutral-700 px-1.5 py-0">Empty</Badge>
                  }
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className="font-mono tabular-nums">{(Number(e.totalSettled) / 1e9).toFixed(4)} SOL settled</span>
                  <span className="font-mono tabular-nums">{e.totalCallsSettled} calls</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Agent Event Timeline ─────────────────────── */

const EVENT_COLORS: Record<string, string> = {
  AgentRegisteredEvent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  AgentUpdatedEvent: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  AgentDeactivatedEvent: 'bg-red-500/10 text-red-500 border-red-500/20',
  AgentReactivatedEvent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  AgentClosedEvent: 'bg-red-500/10 text-red-500 border-red-500/20',
  ReputationUpdatedEvent: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CallsReportedEvent: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ToolPublishedEvent: 'bg-primary/10 text-primary border-primary/20',
  ToolUpdatedEvent: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ToolSchemaInscribedEvent: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  PaymentSettledEvent: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  EscrowDepositedEvent: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  EscrowClosedEvent: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

/* ── Agent Memory Tab ──────────────────────────── */

import type { AgentMemoryResponse } from '~/hooks/use-sap';
import type { SerializedVault } from '~/lib/sap/discovery';
import { Database, HardDrive, FileText, KeyRound, Users } from 'lucide-react';

function fmtBytes(n: number) {
  if (n >= 1_048_576) return (n / 1_048_576).toFixed(2) + ' MB';
  if (n >= 1_024) return (n / 1_024).toFixed(1) + ' KB';
  return `${n} B`;
}

function fmtTime(ts: number | null) {
  if (!ts || ts <= 0) return '—';
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString();
}

function AgentMemoryTab({
  memoryData,
  loading,
  fallbackVaults,
}: {
  memoryData: AgentMemoryResponse | null;
  loading: boolean;
  fallbackVaults: SerializedVault[];
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!memoryData || memoryData.vaults.length === 0) {
    if (fallbackVaults.length === 0) {
      return <EmptyState message="No memory vault for this agent" />;
    }
    // Fallback to basic vault data
    return (
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4"><CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Memory Vaults</CardTitle></CardHeader>
        <CardContent className="px-5 pt-3 pb-4">
          <div className="space-y-3">
            {fallbackVaults.map((v) => (
              <Link key={v.pda} href={`/vaults/${v.pda}`} className="block rounded-lg border border-neutral-800 bg-neutral-800/40 p-4 hover:bg-neutral-800/70 transition-colors">
                <Address value={v.pda} copy />
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-sm font-bold tabular-nums text-white font-mono">{v.totalSessions}</p><p className="text-[10px] text-neutral-500">Sessions</p></div>
                  <div><p className="text-sm font-bold tabular-nums text-white font-mono">{v.totalInscriptions}</p><p className="text-[10px] text-neutral-500">Inscriptions</p></div>
                  <div><p className="text-sm font-bold tabular-nums text-white font-mono">{v.totalBytesInscribed}</p><p className="text-[10px] text-neutral-500">Bytes</p></div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { stats, vaults } = memoryData;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Vaults', value: String(stats.vaultCount), icon: Database },
          { label: 'Sessions', value: String(stats.totalSessions), icon: FileText },
          { label: 'Inscriptions', value: stats.totalInscriptions.toLocaleString(), icon: HardDrive },
          { label: 'Bytes Inscribed', value: fmtBytes(stats.totalBytesInscribed), icon: KeyRound },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-3.5 w-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500">{kpi.label}</p>
              </div>
              <p className="text-xl font-bold tabular-nums text-white font-mono">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vault cards */}
      {vaults.map((v) => (
        <Card key={v.pda} className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-0 px-5 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <Link href={`/vaults/${v.pda}`} className="font-mono text-neutral-300 hover:text-primary transition-colors">
                  {v.pda.slice(0, 12)}…{v.pda.slice(-8)}
                </Link>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">v{v.protocolVersion}</Badge>
                <Badge variant="secondary" className="text-[10px]">Nonce v{v.nonceVersion}</Badge>
                {v.delegateCount > 0 && (
                  <Badge className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <Users className="h-2.5 w-2.5 mr-0.5" /> {v.delegateCount}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pt-3 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Sessions', value: String(v.totalSessions) },
                { label: 'Inscriptions', value: v.totalInscriptions.toLocaleString() },
                { label: 'Bytes', value: fmtBytes(v.totalBytesInscribed) },
                { label: 'Created', value: fmtTime(v.createdAt) },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg bg-neutral-800/50 p-2.5">
                  <p className="text-[10px] text-neutral-500">{cell.label}</p>
                  <p className="text-sm font-bold tabular-nums text-white font-mono">{cell.value}</p>
                </div>
              ))}
            </div>

            {v.sessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] text-neutral-600 font-semibold uppercase tracking-widest">Sessions</p>
                {v.sessions.map((s) => (
                  <div key={s.pda} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.isClosed
                        ? <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                        : <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />}
                      <span className="text-xs font-mono text-neutral-300 truncate">{s.pda.slice(0, 12)}…{s.pda.slice(-6)}</span>
                      <Badge variant="secondary" className="text-[10px] px-1">seq {s.sequenceCounter}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-500 shrink-0">
                      <span className="font-mono">{fmtBytes(s.totalBytes)}</span>
                      <span className="font-mono">{s.totalEpochs} epochs</span>
                      <span>{s.isClosed ? 'Closed' : 'Active'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Link href={`/vaults/${v.pda}`} className="text-xs text-primary hover:text-primary transition-colors">
                View full vault detail →
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AgentEventTimeline({
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
    <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
      <CardHeader className="px-5 pt-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">SAP Event Timeline</CardTitle>
          <div className="flex items-center gap-2">
            {scanned > 0 && (
              <span className="text-[10px] text-neutral-600">{scanned} txs scanned</span>
            )}
            {events.length > 0 && (
              <Badge variant="secondary" className="text-[9px] tabular-nums">{events.length}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-3 pb-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Scanning transaction logs for SAP events…</span>
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="h-6 w-6 text-neutral-700 mx-auto mb-2" />
            <p className="text-xs text-neutral-500">No SAP events found for this agent.</p>
            <p className="text-[10px] text-neutral-600 mt-1">
              Events are Anchor-encoded in transaction log messages.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((evt, idx) => {
              const isExpanded = expandedIdx === idx;
              const col = EVENT_COLORS[evt.name] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700';
              const label = evt.name.replace(/Event$/, '');
              const dataKeys = Object.keys(evt.data ?? {});

              return (
                <div key={`${evt.txSignature}-${idx}`} className="rounded-lg border border-neutral-800 overflow-hidden">
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-neutral-800/50 transition-colors text-left"
                  >
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${col}`}>
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-neutral-500 truncate">
                        {evt.txSignature.slice(0, 20)}…
                        {evt.blockTime
                          ? ` · ${new Date(evt.blockTime * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : ` · slot ${evt.slot}`}
                      </p>
                    </div>
                    {dataKeys.length > 0 && (
                      <span className="text-[10px] text-neutral-600 shrink-0">{dataKeys.length} fields</span>
                    )}
                    <svg
                      className={`h-3 w-3 text-neutral-600 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-neutral-800 px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap text-[10px] text-neutral-500 mb-2">
                        <span className="font-mono font-semibold text-neutral-300">{evt.name}</span>
                        <span>·</span>
                        <a
                          href={`/tx/${evt.txSignature}`}
                          className="text-primary hover:text-primary font-mono transition-colors"
                        >
                          {evt.txSignature.slice(0, 20)}… →
                        </a>
                        {evt.blockTime && (
                          <>
                            <span>·</span>
                            <span>{new Date(evt.blockTime * 1000).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                      {dataKeys.length > 0 ? (
                        <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
                          {dataKeys.map((k) => {
                            const v = evt.data[k];
                            const display = v === null ? 'null'
                              : typeof v === 'object' ? JSON.stringify(v)
                              : String(v);
                            return (
                              <div key={k} className="flex items-start justify-between gap-4 px-3 py-1.5">
                                <span className="text-[10px] font-mono text-primary shrink-0 min-w-[120px] pt-0.5">{k}</span>
                                <span className="text-[10px] font-mono text-neutral-300 text-right break-all max-w-[400px]">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-neutral-600 italic">No fields decoded</p>
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
