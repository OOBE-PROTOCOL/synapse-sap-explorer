'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Copy, Zap, Clock, TrendingUp, Shield } from 'lucide-react';
import { ScoreRing, StatusBadge, Address, ProtocolBadge, Skeleton, PageHeader, Tabs, EmptyState } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { useAgent, useTools, useEscrows, useFeedbacks, useAttestations, useVaults } from '~/hooks/use-sap';
import { toast } from 'sonner';

export default function AgentDetailPage() {
  const { wallet } = useParams<{ wallet: string }>();
  const router = useRouter();
  const { data, loading, error } = useAgent(wallet);
  const { data: toolsData } = useTools();
  const { data: escrowsData } = useEscrows();
  const { data: feedbacksData } = useFeedbacks();
  const { data: attestationsData } = useAttestations();
  const { data: vaultsData } = useVaults();
  const [activeTab, setActiveTab] = useState('overview');

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
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

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const agentTools = toolsData?.tools.filter((t) => t.descriptor?.agent === profile.pda) ?? [];
  const agentEscrows = escrowsData?.escrows.filter((e) => e.agent === profile.pda) ?? [];
  const agentFeedbacks = feedbacksData?.feedbacks.filter((f) => f.agent === profile.pda) ?? [];
  const agentAttestations = attestationsData?.attestations.filter((a) => a.agent === profile.pda) ?? [];
  const agentVaults = vaultsData?.vaults.filter((v) => v.agent === profile.pda) ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push('/agents')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Agents
        </Button>
        <div className="flex items-start gap-5">
          <ScoreRing score={computed.reputationScore} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">{id.name}</h1>
              <StatusBadge active={computed.isActive} />
              {computed.hasX402 && <Badge variant="outline">x402</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{id.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button onClick={() => copyAddress(profile.pda)} className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors" title="Copy PDA">
                <span className="font-mono">{profile.pda.slice(0, 8)}…{profile.pda.slice(-6)}</span>
                <Copy className="h-3 w-3" />
              </button>
              <button onClick={() => copyAddress(id.wallet)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" title="Copy Wallet">
                <span className="font-mono">{id.wallet.slice(0, 8)}…{id.wallet.slice(-6)}</span>
                <Copy className="h-3 w-3" />
              </button>
              {id.x402Endpoint && (
                <a href={id.x402Endpoint} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors">
                  x402 endpoint <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Computed Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Agent Summary</CardTitle>
            <StatusBadge active={computed.isActive} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{computed.reputationScore}</p>
              <p className="text-[10px] text-muted-foreground">Reputation</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground tabular-nums">{Number(computed.totalCalls).toLocaleString('en-US')}</p>
              <p className="text-[10px] text-muted-foreground">Total Calls</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{computed.capabilityCount}</p>
              <p className="text-[10px] text-muted-foreground">Capabilities</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{computed.pricingTierCount}</p>
              <p className="text-[10px] text-muted-foreground">Pricing Tiers</p>
            </div>
          </div>
          {computed.protocols.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {computed.protocols.map((p) => (
                <ProtocolBadge key={p} protocol={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Zap className="mb-2 mx-auto h-4 w-4 text-primary" />
            <p className="text-lg font-bold tabular-nums text-foreground">{Number(id.totalCallsServed).toLocaleString('en-US')}</p>
            <p className="text-[10px] text-muted-foreground">Total Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="mb-2 mx-auto h-4 w-4 text-chart-3" />
            <p className="text-lg font-bold tabular-nums text-foreground">{id.avgLatencyMs}ms</p>
            <p className="text-[10px] text-muted-foreground">Avg Latency</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <TrendingUp className="mb-2 mx-auto h-4 w-4 text-chart-4" />
            <p className="text-lg font-bold tabular-nums text-foreground">{id.uptimePercent}%</p>
            <p className="text-[10px] text-muted-foreground">Uptime</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Shield className="mb-2 mx-auto h-4 w-4 text-chart-2" />
            <p className="text-lg font-bold tabular-nums text-foreground">{id.reputationScore}</p>
            <p className="text-[10px] text-muted-foreground">Reputation (0–1000)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'tools', label: 'Tools', count: agentTools.length },
          { value: 'escrows', label: 'Escrows', count: agentEscrows.length },
          { value: 'feedbacks', label: 'Feedbacks', count: agentFeedbacks.length },
          { value: 'attestations', label: 'Attestations', count: agentAttestations.length },
          { value: 'vault', label: 'Vault', count: agentVaults.length },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <>
          {id.capabilities.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Capabilities</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {id.capabilities.map((c) => (
                  <Link key={c.id} href={`/capabilities/${encodeURIComponent(c.id)}`}
                    className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-mono text-xs text-foreground">{c.id}</span>
                    {c.protocolId && <ProtocolBadge protocol={c.protocolId} />}
                    {c.description && <span className="text-xs text-muted-foreground">{c.description}</span>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {id.pricing.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Pricing Tiers</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {id.pricing.map((p) => (
                    <div key={p.tierId} className="rounded-lg border border-border/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">{p.tierId}</p>
                      <p className="mt-1 text-lg font-bold text-foreground">{formatPrice(p.pricePerCall, p.tokenDecimals)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatTokenType(p.tokenType)} per call</p>
                      <Separator className="my-2" />
                      <div className="space-y-1 text-[10px] text-muted-foreground">
                        <p>Rate limit: {p.rateLimit}/s</p>
                        <p>Max/session: {p.maxCallsPerSession === 0 ? '∞' : p.maxCallsPerSession}</p>
                        <p>Settlement: {formatSettlement(p.settlementMode)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Tab: Tools */}
      {activeTab === 'tools' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Registered Tools</CardTitle></CardHeader>
          <CardContent>
            {agentTools.length === 0 ? (
              <EmptyState message="No tools registered by this agent" />
            ) : (
              <div className="space-y-2">
                {agentTools.map((t) => (
                  <div key={t.pda} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5">
                    <span className="text-sm font-medium text-foreground">{t.descriptor?.toolName ?? 'Unnamed'}</span>
                    {t.descriptor?.httpMethod && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px]">
                        {typeof t.descriptor.httpMethod === 'object' ? Object.keys(t.descriptor.httpMethod)[0] : t.descriptor.httpMethod}
                      </Badge>
                    )}
                    {t.descriptor?.category && (
                      <Badge variant="outline" className="text-[10px]">
                        {typeof t.descriptor.category === 'object' ? Object.keys(t.descriptor.category)[0] : t.descriptor.category}
                      </Badge>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      {t.descriptor?.totalInvocations ?? 0} invocations
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
        <Card>
          <CardHeader><CardTitle className="text-sm">Escrow Accounts</CardTitle></CardHeader>
          <CardContent>
            {agentEscrows.length === 0 ? (
              <EmptyState message="No escrows found for this agent" />
            ) : (
              <div className="space-y-3">
                {agentEscrows.map((e) => (
                  <div key={e.pda} className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Address value={e.pda} copy />
                      {Number(e.balance) > 0 ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px]">Funded</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">Empty</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{e.balance}</p>
                        <p className="text-[10px] text-muted-foreground">Balance</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{e.totalDeposited}</p>
                        <p className="text-[10px] text-muted-foreground">Deposited</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{e.totalCallsSettled}</p>
                        <p className="text-[10px] text-muted-foreground">Calls Settled</p>
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
        <Card>
          <CardHeader><CardTitle className="text-sm">Feedback Received</CardTitle></CardHeader>
          <CardContent>
            {agentFeedbacks.length === 0 ? (
              <EmptyState message="No feedback received yet" />
            ) : (
              <div className="space-y-2">
                {agentFeedbacks.map((f) => (
                  <div key={f.pda} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/10">
                      <span className="text-xs font-bold text-chart-2">{f.score}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Address value={f.reviewer} />
                        {f.tag && <Badge variant="outline" className="text-[10px]">{f.tag}</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{new Date(Number(f.createdAt) * 1000).toLocaleDateString()}</p>
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
        <Card>
          <CardHeader><CardTitle className="text-sm">Attestations</CardTitle></CardHeader>
          <CardContent>
            {agentAttestations.length === 0 ? (
              <EmptyState message="No attestations for this agent" />
            ) : (
              <div className="space-y-2">
                {agentAttestations.map((a) => (
                  <div key={a.pda} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{a.attestationType}</Badge>
                        <Address value={a.attester} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{new Date(Number(a.createdAt) * 1000).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge active={a.isActive} size="xs" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Vault */}
      {activeTab === 'vault' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Memory Vault</CardTitle></CardHeader>
          <CardContent>
            {agentVaults.length === 0 ? (
              <EmptyState message="No memory vault for this agent" />
            ) : (
              <div className="space-y-3">
                {agentVaults.map((v) => (
                  <div key={v.pda} className="rounded-lg border border-border/50 p-4">
                    <Address value={v.pda} copy />
                    <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{v.totalSessions}</p>
                        <p className="text-[10px] text-muted-foreground">Sessions</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{v.totalInscriptions}</p>
                        <p className="text-[10px] text-muted-foreground">Inscriptions</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{v.totalBytesInscribed}</p>
                        <p className="text-[10px] text-muted-foreground">Bytes</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Protocol v{v.protocolVersion} · Nonce v{v.nonceVersion}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Created: {new Date(Number(id.createdAt) * 1000).toLocaleDateString()}</span>
        <span>Updated: {new Date(Number(id.updatedAt) * 1000).toLocaleDateString()}</span>
        <span>Version: {id.version}</span>
      </div>
    </div>
  );
}

function formatPrice(lamportsStr: string, decimals?: number | null): string {
  const n = Number(lamportsStr);
  const dec = decimals ?? 9;
  return (n / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
}

function formatTokenType(t: any): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return Object.keys(t)[0] ?? 'token';
  return 'token';
}

function formatSettlement(s: any): string {
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') return Object.keys(s)[0] ?? 'x402';
  return 'x402';
}
