'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Copy, Zap, Clock, TrendingUp, Shield, Activity, Loader2, DollarSign, Wallet, Coins, Rocket, Globe, ChevronRight, ChevronsDown, Sparkles, Package, HelpCircle, Search } from 'lucide-react';
import { ReputationBar, StatusBadge, Address, ProtocolBadge, Skeleton, EmptyState, AgentAvatar, ExplorerPagination, usePagination } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useAgent, useTools, useEscrows, useFeedbacks, useAttestations, useVaults, useAddressEvents, useAgentRevenue, useAgentMemory, useX402Payments, useAgentBalances, useAgentStaking, useAgentMetaplex, useAgentNfts, useMetaplexRegistry, useCanonicalEip8004, type CanonicalEip8004Card } from '~/hooks/use-sap';
import { useQueryState, QueryParam } from '~/hooks/use-query-state';
import type { SapEvent, X402PaymentRow, X402Stats } from '~/hooks/use-sap';
import { toast } from 'sonner';
import { cn } from '~/lib/utils';

const SOLSCAN = 'https://solscan.io';

/* ── CAIP-10 chain decoder ─────────────────────────────────
 * Decodes Metaplex / EIP-8004 cross-chain agent registry
 * pointers like `solana:101:metaplex`, `eip155:8453:0x8004…`.
 * Returns a friendly chain label + an explorer URL for the
 * registry contract when known.
 * ───────────────────────────────────────────────────────── */
const EVM_REGISTRIES: Record<string, { name: string; explorer: string }> = {
  '8453': { name: 'Base', explorer: 'https://basescan.org' },
  '1': { name: 'Ethereum', explorer: 'https://etherscan.io' },
  '10': { name: 'Optimism', explorer: 'https://optimistic.etherscan.io' },
  '42161': { name: 'Arbitrum', explorer: 'https://arbiscan.io' },
  '1187947933': { name: 'EVM Testnet', explorer: '' },
};
function decodeAgentRegistry(s: string): { chain: string; registryLabel: string; explorer: string | null } {
  const parts = s.split(':');
  if (parts[0] === 'solana') {
    return { chain: 'Solana mainnet', registryLabel: parts[2] ?? 'registry', explorer: SOLSCAN };
  }
  if (parts[0] === 'eip155') {
    const meta = EVM_REGISTRIES[parts[1] ?? ''];
    const addr = parts[2] ?? '';
    return {
      chain: meta?.name ?? `EVM ${parts[1]}`,
      registryLabel: addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : 'registry',
      explorer: meta?.explorer && addr ? `${meta.explorer}/address/${addr}` : null,
    };
  }
  return { chain: parts[0] ?? 'unknown', registryLabel: parts.slice(1).join(':'), explorer: null };
}

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
  return (
    <Suspense fallback={null}>
      <AgentDetailInner />
    </Suspense>
  );
}

const AGENT_TABS = ['overview', 'revenue', 'tools', 'escrows', 'feedbacks', 'attestations', 'events', 'vault', 'x402', 'metaplex'] as const;
type AgentTab = (typeof AGENT_TABS)[number];

function AgentDetailInner() {
  const { wallet } = useParams<{ wallet: string }>();
  const router = useRouter();
  const { data, loading, error } = useAgent(wallet);
  const canonicalWallet = data?.profile?.identity?.wallet ?? null;
  const { data: toolsData } = useTools();
  const { data: escrowsData } = useEscrows();
  const { data: feedbacksData } = useFeedbacks();
  const { data: attestationsData } = useAttestations();
  const { data: vaultsData } = useVaults();
  const { data: eventsData, loading: evLoading } = useAddressEvents(data?.profile?.pda ?? null, { limit: 50 });
  const { data: revenueData, loading: revLoading } = useAgentRevenue(canonicalWallet, 30);
  const { data: memoryData, loading: memLoading } = useAgentMemory(data?.profile?.pda ?? undefined);
  const { data: x402Data, loading: x402Loading } = useX402Payments(canonicalWallet);
  const { data: balancesData, loading: balLoading } = useAgentBalances(canonicalWallet);
  const { data: stakingData } = useAgentStaking(data?.profile?.pda ?? null);
  const { data: metaplexData, loading: metaplexLoading } = useAgentMetaplex(canonicalWallet);
  const { data: nftsData } = useAgentNfts(canonicalWallet);
  const { data: registryData, loading: registryLoading } = useMetaplexRegistry(canonicalWallet);
  const { data: canonicalCard, loading: canonicalLoading } = useCanonicalEip8004(data?.profile?.pda ?? null);
  const [activeTab, setActiveTab] = useQueryState('tab', 'overview' as AgentTab, QueryParam.enum('overview', AGENT_TABS));
  const [sectionFilter, setSectionFilter] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState(false);
  const [resolveAttempted, setResolveAttempted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tryResolve = async () => {
      if (!wallet || loading || resolveAttempted) return;
      if (data?.profile && !error) return;

      setResolvingId(true);
      try {
        const res = await fetch(`/api/sap/agents/resolve/${wallet}`);
        if (!res.ok) return;
        const json = await res.json();
        const nextWallet = json?.wallet as string | null;
        if (!cancelled && nextWallet && nextWallet !== wallet) {
          router.replace(`/agents/${nextWallet}`);
          return;
        }
      } catch {
        // no-op
      } finally {
        if (!cancelled) {
          setResolvingId(false);
          setResolveAttempted(true);
        }
      }
    };

    void tryResolve();
    return () => { cancelled = true; };
  }, [wallet, loading, data?.profile, error, resolveAttempted, router]);

  const copyAddr = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast.success('Copied');
    setTimeout(() => setCopied(null), 1500);
  };

  const openSection = (section: AgentTab) => {
    setSectionFilter('');
    setActiveTab(section);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById('agent-detail-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
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

  if ((error || !data?.profile) && resolvingId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Resolving agent identifier...</p>
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

  const sidebarSections: Array<{ value: AgentTab; label: string; count?: number }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'revenue', label: 'SAP Revenue' },
    { value: 'tools', label: 'Tools', count: agentTools.length },
    { value: 'escrows', label: 'Escrows', count: agentEscrows.length },
    { value: 'events', label: 'SAP Events', count: agentEvents.length },
    { value: 'feedbacks', label: 'Feedbacks', count: agentFeedbacks.length },
    { value: 'attestations', label: 'Attestations', count: agentAttestations.length },
    { value: 'vault', label: 'Memory Vaults', count: memoryData?.stats?.vaultCount ?? agentVaults.length },
    { value: 'x402', label: 'x402 Txns', count: x402Data?.total ?? 0 },
    { value: 'metaplex', label: 'Metaplex', count: metaplexData?.linked ? 1 : 0 },
  ];
  const normalizedSectionFilter = sectionFilter.trim().toLowerCase();
  const visibleSections = sidebarSections.filter((s) =>
    normalizedSectionFilter.length === 0
      ? true
      : s.label.toLowerCase().includes(normalizedSectionFilter),
  );
  const activeSectionVisible = visibleSections.some((s) => s.value === activeTab);

  // ── Registry coordination ────────────────────────────────────────────────
  // Reaching this render means SAP registration is a given (we read the
  // AgentAccount PDA above). The only question is whether Metaplex
  // *also* knows about this agent — via any of three independent signals:
  //   1. SAP-canonical URI binding   (metaplexData.linked)
  //   2. On-chain AgentIdentity plugin on any owned MPL Core asset
  //   3. Public Metaplex Agents Registry entry (api.metaplex.com)
  // ANY signal proves dual registration. The URI-binding flag is a
  // sub-fact ("coordinated" vs "parallel"), not the headline state.
  const uriBound = !!metaplexData?.linked;
  const hasOnChainPlugin =
    !!nftsData && nftsData.items.some((n) => n.hasAgentIdentity);
  const registryAgentCount = registryData?.agents.length ?? 0;
  const onMetaplexRegistry = registryAgentCount > 0;
  const onMetaplex = uriBound || hasOnChainPlugin || onMetaplexRegistry;
  // Two-state primary: dual-registered or SAP-only.
  const linkState: 'both' | 'sap-only' = onMetaplex ? 'both' : 'sap-only';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Back ── */}
      <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white -ml-2" onClick={() => router.push('/agents')}>
        <ArrowLeft className="h-3 w-3 mr-1" /> All Agents
      </Button>

      <Card className={cn(
        'overflow-hidden border transition-colors',
        'pt-4',
        linkState === 'both'
          ? 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_22px_-12px_hsl(var(--neon-amber)/0.55)]'
          : 'bg-neutral-900 border-neutral-800',
      )}>
        <CardContent className="px-4 sm:px-5 py-3.5">
          {(() => {
            const totalNfts = nftsData?.total ?? 0;
            const pluginCount = nftsData?.withAgentIdentity ?? 0;
            const registrySet = new Set((registryData?.agents ?? []).map((a) => a.mintAddress));
            const verifiedBoth = (nftsData?.items ?? []).filter((n) => n.hasAgentIdentity && registrySet.has(n.asset)).length;
            const isLoading = metaplexLoading || registryLoading;
            return (
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  {/* Header row — single line */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className={cn('h-3.5 w-3.5', linkState === 'both' ? 'text-amber-300' : 'text-neutral-500')} />
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Registry Coordination</p>
                    <InfoTip label={"How this agent is recognized across the two registries that index Solana agents: SAP (canonical on-chain PDA) and Metaplex (MPL Core AgentIdentity plugin + the public api.metaplex.com index). Each row below tells you which signals are present."} />
                    {isLoading ? (
                      <Badge variant="secondary" className="text-xs">Syncing…</Badge>
                    ) : (
                      <Badge
                        className={cn(
                          'text-xs px-1.5 py-0 border',
                          linkState === 'both'
                            ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                            : 'bg-neutral-800 text-neutral-400 border-neutral-700',
                        )}
                      >
                        {linkState === 'both' ? 'SAP + Metaplex' : 'SAP only'}
                      </Badge>
                    )}
                  </div>

                  {/* Inline metric strip */}
                  {!isLoading && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1.5" title="SAP agent PDA exists on-chain on the Solana mainnet (SAPpUhsW… program). This is always true on this page.">
                        <span className="text-neutral-600">SAP</span>
                        <span className="text-emerald-400">●</span>
                        <span className="text-neutral-300">on-chain</span>
                      </span>
                      <span className="text-neutral-700">·</span>
                      <span className="inline-flex items-center gap-1.5" title="All MPL Core NFTs owned by this wallet — with or without an AgentIdentity plugin. Source: on-chain fetchAssetsByOwner.">
                        <span className="text-neutral-600">MPL Core</span>
                        <span className="font-mono tabular-nums text-neutral-300">{totalNfts}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5" title="How many of those MPL Core NFTs carry an EIP-8004 AgentIdentity external plugin. Each plugin URI points to one agent card — either on the SAP host or on api.metaplex.com.">
                        <span className="text-neutral-600">EIP-8004 plugin</span>
                        <span className={cn('font-mono tabular-nums', pluginCount > 0 ? 'text-amber-300' : 'text-neutral-500')}>{pluginCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5" title="Entries this wallet has on the public Metaplex Agents Registry. Independent peer-trust signal: a third-party indexer confirmed the agent exists. May differ from on-chain plugins (off-chain-only cards or unindexed plugins).">
                        <span className="text-neutral-600">api.metaplex.com</span>
                        <span className={cn('font-mono tabular-nums', registryAgentCount > 0 ? 'text-amber-300' : 'text-neutral-500')}>{registryAgentCount}</span>
                      </span>
                      {verifiedBoth > 0 && (
                        <span className="inline-flex items-center gap-1.5" title="Strongest signal: NFTs that are both on-chain (AgentIdentity plugin) AND indexed by api.metaplex.com. Cryptographic proof + peer-trust attestation.">
                          <span className="text-neutral-600">plugin ∩ registry</span>
                          <span className="font-mono tabular-nums text-emerald-400">{verifiedBoth}</span>
                        </span>
                      )}
                      {uriBound && (
                        <span className="inline-flex items-center gap-1 text-emerald-400" title="At least one MPL Core NFT's AgentIdentity plugin URI resolves to this SAP host — making the NFT the canonical, transferable handle for this on-chain agent.">
                          <span>✓</span><span>SAP-bound URI</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                  <Button
                    type="button"
                    variant={linkState === 'both' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-9 w-full md:w-auto',
                      linkState === 'both' && 'bg-amber-500/80 text-neutral-950 hover:bg-amber-400',
                    )}
                    onClick={() => openSection('metaplex')}
                  >
                Open Metaplex Panel
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ═══════════ STACKED: Identity+Portfolio on top, Overview below ═══════════ */}
      <div className="flex flex-col-reverse gap-6">

        {/* ── Property Grid (rendered second in DOM, displayed below) ── */}
        <div className="space-y-6">
          {/* Overview Properties */}
          <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardHeader className="pb-0 px-5 pt-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Overview</CardTitle>
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
                  <Badge variant="secondary" className="text-xs font-mono tabular-nums">v{id.version}</Badge>
                } />
                {stakingData && (
                  <>
                    <PropertyRow label="Staking · Collateral" value={
                      <span className="font-mono text-primary font-bold tabular-nums">{stakingData.stakedSol.toFixed(4)} SOL</span>
                    } />
                    {stakingData.unstakeAmountSol > 0 && (
                      <PropertyRow label="Unstaking" value={
                        <span className="font-mono text-amber-400 font-bold tabular-nums">{stakingData.unstakeAmountSol.toFixed(4)} SOL</span>
                      } />
                    )}
                    {stakingData.slashedSol > 0 && (
                      <PropertyRow label="Slashed" value={
                        <span className="font-mono text-destructive font-bold tabular-nums">{stakingData.slashedSol.toFixed(4)} SOL</span>
                      } />
                    )}
                    <PropertyRow label="Disputes W/L" value={
                      <span className="font-mono text-neutral-400">{stakingData.totalDisputesWon}/{stakingData.totalDisputesLost}</span>
                    } />
                  </>
                )}
                <PropertyRow label="Created" value={
                  safeDateStr(id.createdAt) !== '—' ? <span className="text-neutral-300 text-xs">{safeDateStr(id.createdAt)}</span> : <span className="text-neutral-600 text-xs">Not set</span>
                } />
                <PropertyRow label="Updated" value={
                  safeDateStr(id.updatedAt) !== '—' ? <span className="text-neutral-300 text-xs">{safeDateStr(id.updatedAt)}</span> : <span className="text-neutral-600 text-xs">Not set</span>
                } />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Identity + Portfolio (unified card) ── */}
        <div>
          <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
            {/* Identity header — professional grid-based layout */}
            <div className="px-5 pt-5 pb-4">
              {/* ─── Section 1: Identity + Status ─── */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                {/* Avatar */}
                <div className="shrink-0 self-start">
                  <div className="relative">
                    <AgentAvatar name={id.name} endpoint={id.x402Endpoint} className='rounded-full p-0 ring-2 ring-transparent' size={64} />
                    {computed.isActive && (
                      <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-neutral-900 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                    )}
                  </div>
                </div>

                {/* Identity details */}
                <div className="min-w-0 flex-1">
                  {/* Name + Status Badges */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight break-words">{id.name}</h1>

                    {metaplexData?.linked && (
                      <Badge
                        className="text-xs px-2 py-1 border border-amber-400/50 bg-gradient-to-r from-amber-500/25 via-yellow-400/20 to-amber-500/25 text-amber-200 shadow-[0_0_12px_-2px_rgba(251,191,36,0.45)]"
                        title="Registered in Metaplex Core registry (EIP-8004 AgentIdentity)"
                      >
                        <Sparkles className="h-2.5 w-2.5 mr-1" /> MPL Registry
                      </Badge>
                    )}

                    {stakingData && stakingData.stakedSol > 0 && (
                      <Badge className="text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-1">
                        <Coins className="h-2.5 w-2.5 mr-1" /> {stakingData.stakedSol.toFixed(2)} SOL
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  {id.description && (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{id.description}</p>
                  )}
                </div>
              </div>

              {/* ─── Divider ─── */}
              <div className="h-px bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 my-4" />

              {/* ─── Section 2: Links + Stats (2-column grid) ─── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                {/* Links column — fills height */}
                <div className="flex flex-col space-y-1.5 min-h-fit">
                  <p className="text-xs text-muted-foreground/70 uppercase tracking-wider font-semibold px-1">Addresses & Links</p>
                  <div className="space-y-1 flex-1 flex flex-col">
                    {/* PDA */}
                    <button
                      onClick={() => copyAddr(profile.pda)}
                      className="w-full flex items-center gap-2 rounded-lg border border-neutral-800/60 bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors p-2.5 group"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 shrink-0">
                        <Package className="h-3 w-3 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1 py-1 text-left">
                        <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium">PDA</p>
                        <p className="text-xs font-mono text-neutral-300 break-all line-clamp-1 group-hover:text-foreground transition-colors">{profile.pda}</p>
                      </div>
                      <Copy className={cn('h-3.5 w-3.5 shrink-0', copied === profile.pda ? 'text-emerald-400' : 'text-neutral-600')} />
                    </button>

                    {/* Wallet */}
                    <button
                      onClick={() => copyAddr(id.wallet)}
                      className="w-full flex items-center gap-2 rounded-lg border border-neutral-800/60 bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors p-2.5 group"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 shrink-0">
                        <Wallet className="h-3 w-3 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1 py-1 text-left">
                        <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium">Wallet</p>
                        <p className="text-xs font-mono text-neutral-300 break-all line-clamp-1 group-hover:text-foreground transition-colors">{id.wallet}</p>
                      </div>
                      <Copy className={cn('h-3.5 w-3.5 shrink-0', copied === id.wallet ? 'text-emerald-400' : 'text-neutral-600')} />
                    </button>

                    {/* External links */}
                    <div className="mt-auto flex gap-1.5">
                      <a
                        href={`${SOLSCAN}/account/${id.wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex h-full items-center justify-center gap-1 rounded-lg border border-neutral-800/60 bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors p-2 text-xs font-medium text-neutral-400 hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" /> Solscan
                      </a>
                      {id.x402Endpoint && (
                        <a
                          href={id.x402Endpoint}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-neutral-800/60 bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors p-2 text-xs font-medium text-neutral-400 hover:text-foreground"
                        >
                          <Globe className="h-3 w-3" /> x402
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats column — full height */}
                <div className="flex flex-col space-y-1.5 min-h-fit">
                  <p className="text-xs text-muted-foreground/70 uppercase tracking-wider font-semibold px-1">Performance</p>
                  <div className="grid grid-cols-2 gap-1 flex-1">
                    {[
                      { label: 'Calls', value: totalCallsSettled.toLocaleString(), icon: Zap },
                      { label: 'Latency', value: `${id.avgLatencyMs}ms`, icon: Clock },
                      { label: 'Uptime', value: `${id.uptimePercent}%`, icon: TrendingUp },
                      { label: 'Rep', value: `${computed.reputationScore}`, icon: Shield },
                    ].map((s) => (
                      <div key={s.label} className="flex flex-col rounded-lg border border-neutral-800/60 bg-neutral-800/30 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <s.icon className="h-3 w-3 text-primary/70" />
                          <span className="text-xs text-neutral-600 uppercase tracking-wider font-medium">{s.label}</span>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-foreground font-mono">{s.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status badges */}
                  <div className="mt-auto grid grid-cols-2 gap-1.5">
                    {computed.hasX402 && (
                      <Badge className="text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-1.5 justify-center">
                        <Zap className="h-2.5 w-2.5 mr-1" /> x402
                      </Badge>
                    )}
                    {balancesData?.deployedTokens && balancesData.deployedTokens.length > 0 && (
                      <Badge className="text-xs bg-accent/15 text-primary border border-primary/30 px-2 py-1.5 justify-center">
                        <Rocket className="h-2.5 w-2.5 mr-1" /> Deployer
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-neutral-800" />

            <CardHeader className="pb-0 px-5 pt-4 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-1.5">
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
                (() => {
                  /* ── shared helpers ── */
                  const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
                  const USDC_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png';
                  const fmtAmount = (n: number) => {
                    if (!isFinite(n)) return '0';
                    const abs = Math.abs(n);
                    if (abs >= 10_000) return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
                    if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
                    return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
                  };
                  type Row = {
                    key: string;
                    logo?: string | null;
                    name: string;
                    symbol: string;
                    mintShort?: string;
                    amount: string;
                    usd?: string;
                    isDeployer?: boolean;
                  };
                  const rows: Row[] = [];
                  rows.push({
                    key: 'sol',
                    logo: SOL_LOGO,
                    name: 'Solana',
                    symbol: 'SOL',
                    amount: fmtAmount(balancesData.sol),
                    usd: balancesData.solUsd != null ? `$${balancesData.solUsd.toFixed(2)}` : undefined,
                  });
                  if (balancesData.usdc > 0) {
                    rows.push({ key: 'usdc', logo: USDC_LOGO, name: 'USD Coin', symbol: 'USDC', amount: fmtAmount(balancesData.usdc) });
                  }
                  for (const t of balancesData.tokens) {
                    rows.push({
                      key: t.mint,
                      logo: t.meta?.logo ?? null,
                      name: t.meta?.name ?? 'Unknown',
                      symbol: t.meta?.symbol ?? t.mint.slice(0, 4),
                      mintShort: `${t.mint.slice(0, 8)}…`,
                      amount: fmtAmount(t.uiAmount),
                      isDeployer: t.isDeployer,
                    });
                  }

                  /* ── desktop: 12-col grid · mobile: stacked ── */
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* LEFT — Tokens + Deployer (lg:7) */}
                      <div className="lg:col-span-7 space-y-3">
                        <div className="flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 text-primary" />
                          <p className="text-xs text-primary uppercase tracking-widest font-semibold">Tokens</p>
                          <Badge variant="secondary" className="text-xs tabular-nums ml-auto">{rows.length}</Badge>
                        </div>
                        <ScrollableList itemCount={rows.length} maxVisible={4} approxItemPx={64}>
                          <div className="space-y-2 pr-1 pb-4">
                            {rows.map((r) => (
                              <div key={r.key} className="flex h-[56px] items-center gap-3 rounded-lg border border-neutral-800/60 bg-neutral-800/40 px-3 transition-colors hover:border-primary/30 hover:bg-neutral-800/60">
                                {r.logo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={r.logo} alt={r.symbol} className="h-8 w-8 shrink-0 rounded-full bg-neutral-800 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-500">{r.symbol.slice(0, 2)}</div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium text-white truncate">{r.name}</p>
                                    {r.isDeployer && (
                                      <Badge className="text-xs bg-primary/15 text-primary border-primary/30 px-1 py-0 shrink-0"><Rocket className="h-2 w-2" /></Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-neutral-500 truncate">
                                    {r.symbol}
                                    {r.mintShort && <span className="ml-1.5 font-mono text-neutral-600">{r.mintShort}</span>}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 max-w-[40%]">
                                  <p className="text-sm font-bold tabular-nums text-white font-mono whitespace-nowrap">{r.amount}</p>
                                  {r.usd && <p className="text-xs text-neutral-500 tabular-nums whitespace-nowrap">{r.usd}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollableList>

                        {balancesData.deployedTokens.length > 0 && (
                          <>
                            <div className="flex items-center gap-1.5 pt-2">
                              <Rocket className="h-3.5 w-3.5 text-primary" />
                              <p className="text-xs text-primary uppercase tracking-widest font-semibold">Token Deployer</p>
                              <Badge variant="secondary" className="text-xs tabular-nums ml-auto">{balancesData.deployedTokens.length}</Badge>
                            </div>
                            <ScrollableList itemCount={balancesData.deployedTokens.length} maxVisible={2} approxItemPx={50}>
                              <div className="space-y-1.5 pr-1">
                                {balancesData.deployedTokens.map((d) => (
                                  <div key={d.mint} className="flex items-center gap-2.5 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                                    <Coins className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-white">{d.name}</p>
                                      {d.symbol && <p className="text-xs text-neutral-500">{d.symbol}</p>}
                                    </div>
                                    <span className="text-xs font-mono text-neutral-600">{d.mint.slice(0, 6)}…</span>
                                  </div>
                                ))}
                              </div>
                            </ScrollableList>
                          </>
                        )}
                      </div>

                      {/* RIGHT — NFTs (fills) + Staking (pinned bottom) (lg:5) */}
                      <div className="lg:col-span-5 flex flex-col gap-3 lg:border-l lg:border-neutral-800 lg:pl-4">
                        {/* NFTs (MPL Core / EIP-8004) — flex-1 to fill column height */}
                        <div className="flex flex-col gap-2 lg:flex-1 lg:min-h-0">
                          {nftsData && nftsData.items.length > 0 ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5 text-pink-400" />
                                <p className="text-xs text-pink-400 uppercase tracking-widest font-semibold">NFTs · EIP-8004</p>
                                <Badge variant="secondary" className="text-xs tabular-nums ml-auto">{nftsData.withAgentIdentity}/{nftsData.total}</Badge>
                              </div>
                              {/* Mobile: capped via ScrollableList; Desktop: fills available space */}
                              <div className="lg:hidden">
                                <ScrollableList itemCount={Math.ceil(nftsData.items.length / 2)} maxVisible={1} approxItemPx={170} gapPx={8}>
                                  <div className="grid grid-cols-2 gap-2 pr-1 pb-3">
                                    {nftsData.items.map((n) => (
                                      <Link
                                        key={n.asset}
                                        href={`${SOLSCAN}/token/${n.asset}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={cn(
                                          'group relative flex flex-col gap-2 rounded-lg border p-2 transition-colors',
                                          n.linkedToThisAgent
                                            ? 'border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/15 shadow-[0_0_12px_-4px_rgba(236,72,153,0.4)]'
                                            : n.hasAgentIdentity
                                              ? 'border-pink-500/20 bg-pink-500/5 hover:bg-pink-500/10'
                                              : 'border-neutral-800 bg-neutral-800/30 hover:bg-neutral-800/50',
                                        )}
                                      >
                                        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-950">
                                          {n.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={n.image}
                                              alt={n.name ?? 'NFT'}
                                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                              loading="lazy"
                                              referrerPolicy="no-referrer"
                                              onError={(e) => {
                                                const el = e.currentTarget as HTMLImageElement;
                                                el.style.display = 'none';
                                                el.parentElement?.classList.add('bg-gradient-to-br', 'from-neutral-900', 'to-neutral-800');
                                              }}
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-800">
                                              <div className="flex flex-col items-center gap-1 text-neutral-600">
                                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>
                                                <span className="text-xs font-mono">NFT</span>
                                              </div>
                                            </div>
                                          )}
                                          {n.hasAgentIdentity && (
                                            <span className={cn(
                                              'absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-xs font-bold tracking-wide backdrop-blur',
                                              n.linkedToThisAgent ? 'bg-pink-500/80 text-white' : 'bg-pink-500/40 text-pink-100',
                                            )}>EIP-8004</span>
                                          )}
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <p className="truncate text-xs font-medium text-white">{n.name ?? 'Unnamed NFT'}</p>
                                            {n.linkedToThisAgent && (
                                              <Badge className="text-xs bg-pink-500/15 text-pink-300 border-pink-500/30 px-1 py-0 shrink-0">Agent</Badge>
                                            )}
                                            {n.wasTransferred && (
                                              <Badge className="text-xs bg-amber-500/15 text-amber-300 border-amber-500/30 px-1 py-0 shrink-0">Transferred</Badge>
                                            )}
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-xs text-neutral-500 truncate">Asset: {n.asset.slice(0, 8)}…{n.asset.slice(-4)}</p>
                                            {n.wasTransferred && (
                                              <p className="text-xs text-amber-300">
                                                Transferred{n.currentOwner ? ` to ${n.currentOwner.slice(0, 6)}…${n.currentOwner.slice(-4)}` : ''}
                                              </p>
                                            )}
                                            {n.salePriceSol != null && (
                                              <p className="text-xs text-emerald-300 font-mono">Sale price: {n.salePriceSol.toFixed(4)} SOL</p>
                                            )}
                                            {n.wasTransferred && n.salePriceSol == null && (
                                              <p className="text-xs text-neutral-500">Sale price unavailable from public RPC data</p>
                                            )}
                                            {n.description && (
                                              <p className="text-xs text-neutral-400 line-clamp-2">{n.description}</p>
                                            )}
                                          </div>
                                          {n.linkedToThisAgent && (
                                            <div className="pt-0.5 border-t border-pink-500/20 space-y-0.5">
                                              <p className="text-xs text-pink-400/70 font-semibold">✓ Metaplex Core</p>
                                            </div>
                                          )}
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                </ScrollableList>
                              </div>
                              {/* Desktop variant: scroll container that fills remaining height */}
                              <div className="hidden lg:block relative flex-1 min-h-0">
                                <div className="absolute inset-0 overflow-y-auto scroll-smooth scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent pr-1">
                                  <div className="grid grid-cols-2 gap-2 pb-3">
                                    {nftsData.items.map((n) => (
                                      <Link
                                        key={n.asset}
                                        href={`${SOLSCAN}/token/${n.asset}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={cn(
                                          'group relative flex flex-col gap-2 rounded-lg border p-2 transition-colors',
                                          n.linkedToThisAgent
                                            ? 'border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/15 shadow-[0_0_12px_-4px_rgba(236,72,153,0.4)]'
                                            : n.hasAgentIdentity
                                              ? 'border-pink-500/20 bg-pink-500/5 hover:bg-pink-500/10'
                                              : 'border-neutral-800 bg-neutral-800/30 hover:bg-neutral-800/50',
                                        )}
                                      >
                                        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-950">
                                          {n.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={n.image}
                                              alt={n.name ?? 'NFT'}
                                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                              loading="lazy"
                                              referrerPolicy="no-referrer"
                                              onError={(e) => {
                                                const el = e.currentTarget as HTMLImageElement;
                                                el.style.display = 'none';
                                                el.parentElement?.classList.add('bg-gradient-to-br', 'from-neutral-900', 'to-neutral-800');
                                              }}
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-800">
                                              <div className="flex flex-col items-center gap-1 text-neutral-600">
                                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>
                                                <span className="text-xs font-mono">NFT</span>
                                              </div>
                                            </div>
                                          )}
                                          {n.hasAgentIdentity && (
                                            <span className={cn(
                                              'absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-xs font-bold tracking-wide backdrop-blur',
                                              n.linkedToThisAgent ? 'bg-pink-500/80 text-white' : 'bg-pink-500/40 text-pink-100',
                                            )}>EIP-8004</span>
                                          )}
                                        </div>
                                        <div className="min-w-0 space-y-1.5">
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <p className="truncate text-xs font-medium text-white">{n.name ?? 'Unnamed NFT'}</p>
                                            {n.linkedToThisAgent && (
                                              <Badge className="text-xs bg-pink-500/15 text-pink-300 border-pink-500/30 px-1 py-0 shrink-0">Agent</Badge>
                                            )}
                                            {n.wasTransferred && (
                                              <Badge className="text-xs bg-amber-500/15 text-amber-300 border-amber-500/30 px-1 py-0 shrink-0">Transferred</Badge>
                                            )}
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-xs text-neutral-500 truncate">Asset: {n.asset.slice(0, 8)}…{n.asset.slice(-4)}</p>
                                            {n.wasTransferred && (
                                              <p className="text-xs text-amber-300">
                                                Transferred{n.currentOwner ? ` to ${n.currentOwner.slice(0, 6)}…${n.currentOwner.slice(-4)}` : ''}
                                              </p>
                                            )}
                                            {n.salePriceSol != null && (
                                              <p className="text-xs text-emerald-300 font-mono">Sale price: {n.salePriceSol.toFixed(4)} SOL</p>
                                            )}
                                            {n.wasTransferred && n.salePriceSol == null && (
                                              <p className="text-xs text-neutral-500">Sale price unavailable from public RPC data</p>
                                            )}
                                            {n.description && (
                                              <p className="text-xs text-neutral-400 line-clamp-2">{n.description}</p>
                                            )}
                                          </div>
                                          {n.linkedToThisAgent && (
                                            <div className="pt-0.5 border-t border-pink-500/20 space-y-0.5">
                                              <p className="text-xs text-pink-400/70 font-semibold">✓ Metaplex Core Agent</p>
                                            </div>
                                          )}
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                                {/* Bottom fade hint */}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-neutral-900 to-transparent" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-800 bg-neutral-800/20 px-3 py-6 text-center">
                              <Globe className="mb-1 h-4 w-4 text-neutral-700" />
                              <p className="text-xs text-neutral-600">No MPL Core NFTs</p>
                            </div>
                          )}
                        </div>

                        {/* Staking Collateral — pinned to bottom */}
                        <div className="mt-auto space-y-2 pt-2">
                          <div className="flex items-center gap-1.5">
                            <Coins className="h-4 w-4 text-yellow-500" />
                            <p className="text-xs text-yellow-500 uppercase tracking-widest font-semibold">Staking Collateral</p>
                            {!stakingData && <span className="ml-auto text-xs text-neutral-600">Not initialized</span>}
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
                              <p className="text-xs text-neutral-600 text-center">No stake account on-chain</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <EmptyState message="Unable to load balances" />
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ═══════════ SIDEBAR + CONTENT ═══════════ */}
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border/30 bg-card/60 p-3 sm:p-4 h-fit lg:sticky lg:top-20">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-2">Sections</p>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-500" />
            <input
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              placeholder="Filter sections"
              className="h-8 w-full rounded-md border border-neutral-800 bg-neutral-900/70 pl-8 pr-2 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none ring-0 focus:border-primary/50"
            />
          </div>

          {!activeSectionVisible && normalizedSectionFilter.length > 0 && (
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
              Current section is filtered out.
              <button
                onClick={() => setSectionFilter('')}
                className="ml-1.5 underline underline-offset-2 hover:text-white"
              >
                Clear filter
              </button>
            </div>
          )}

          {visibleSections.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-800 bg-neutral-900/40 px-3 py-3 text-xs text-neutral-500">
              No section matches this filter.
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleSections.map((s) => {
                const isActive = s.value === activeTab;
                return (
                  <button
                    key={s.value}
                    onClick={() => openSection(s.value)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-colors flex items-center gap-2.5',
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-neutral-800/60 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800/60 hover:text-white',
                    )}
                  >
                    <span className="text-xs font-medium truncate">{s.label}</span>
                    {typeof s.count === 'number' && (
                      <Badge
                        variant="secondary"
                        className={cn('ml-auto text-[10px] px-1.5 py-0 tabular-nums', isActive ? 'bg-primary/15 text-primary' : 'bg-neutral-800 text-neutral-400')}
                      >
                        {s.count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div id="agent-detail-content" className="rounded-lg border border-border/30 bg-card/60 p-4 sm:p-6 space-y-6">
        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {(protocols.length > 0 || id.capabilities.length > 0) && (
              <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
                <CardHeader className="pb-0 px-5 pt-4">
                  <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Protocol & Capabilities</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-3 space-y-3">
                  <div>
                    <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium mb-2">Protocols</p>
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
                    <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium mb-2">Capabilities</p>
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
                              {c.description && <p className="text-xs text-neutral-500 mt-0.5 truncate">{c.description}</p>}
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
                  <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Pricing Tiers</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pt-3 pb-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {id.pricing.map((p) => (
                      <div key={p.tierId} className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{p.tierId}</p>
                        <p className="mt-1 text-lg font-bold text-white font-mono">{formatPrice(p.pricePerCall, p.tokenDecimals)}</p>
                        <p className="text-xs text-neutral-500">{formatTokenType(p.tokenType)} per call</p>
                        <div className="h-px bg-neutral-800 my-2" />
                        <div className="space-y-1 text-xs text-neutral-500">
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
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Registered Tools</CardTitle>
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
                        <Badge className="bg-emerald-500/15 text-emerald-400 text-xs">
                          {typeof t.descriptor.httpMethod === 'object' ? Object.keys(t.descriptor.httpMethod)[0] : t.descriptor.httpMethod}
                        </Badge>
                      )}
                      {t.descriptor?.category && (
                        <Badge variant="outline" className="text-xs">
                          {typeof t.descriptor.category === 'object' ? Object.keys(t.descriptor.category)[0] : t.descriptor.category}
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-neutral-500 tabular-nums">
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
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Escrow Accounts</CardTitle>
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
                          <Badge className="bg-emerald-500/15 text-emerald-400 text-xs">Funded</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Empty</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-sm font-bold tabular-nums text-white font-mono">{e.balance}</p>
                          <p className="text-xs text-neutral-500">Balance</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-white font-mono">{e.totalDeposited}</p>
                          <p className="text-xs text-neutral-500">Deposited</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-white font-mono">{e.totalCallsSettled}</p>
                          <p className="text-xs text-neutral-500">Calls Settled</p>
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
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Feedback Received</CardTitle>
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
                          {f.tag && <Badge variant="outline" className="text-xs">{f.tag}</Badge>}
                        </div>
                        <p className="text-xs text-neutral-500">{new Date(Number(f.createdAt) * 1000).toLocaleDateString()}</p>
                      </div>
                      {f.isRevoked && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
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
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Attestations</CardTitle>
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
                          <Badge variant="outline" className="text-xs">{a.attestationType}</Badge>
                          <Address value={a.attester} />
                        </div>
                        <p className="text-xs text-neutral-500">{new Date(Number(a.createdAt) * 1000).toLocaleDateString()}</p>
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

        {activeTab === 'metaplex' && (
          <AgentMetaplexTab
            data={metaplexData}
            loading={metaplexLoading}
            nfts={nftsData?.items ?? null}
            registry={registryData ?? null}
            canonicalCard={canonicalCard}
            canonicalLoading={canonicalLoading}
            sapPda={data?.profile?.pda ?? null}
          />
        )}
        </div>
      </div>
    </div>
  );
}

/* ── InfoTip ─────────────────────────────────────────────
 * Small `(?)` icon button with a native title-attr tooltip.
 * Use to attach concise explanations to labels and section
 * headers without pulling in heavy popover machinery.
 * ───────────────────────────────────────────────────── */
function InfoTip({
  label,
  className,
  side = 'top',
}: {
  label: string;
  className?: string;
  side?: 'top' | 'bottom';
}) {
  return (
    <span
      role="img"
      aria-label={label}
      tabIndex={0}
      className={cn('group/tip relative inline-flex shrink-0 cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 rounded-full', className)}
    >
      <HelpCircle
        aria-hidden="true"
        className="size-3.5 text-neutral-500 transition-colors group-hover/tip:text-amber-300 group-focus-visible/tip:text-amber-300"
      />
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 w-64 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-normal normal-case tracking-normal text-neutral-200 text-pretty shadow-md',
          'opacity-0 transition-opacity duration-150 ease-out group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100 motion-reduce:transition-none',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {label}
      </span>
    </span>
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
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[
          { label: 'Total Payments', value: String(stats?.totalPayments ?? 0) },
          { label: 'Total Volume', value: `$${Number(stats?.totalAmount ?? 0).toFixed(2)}` },
          { label: 'Unique Payers', value: String(stats?.uniquePayers ?? 0) },
          { label: 'With x402 Memo', value: String(stats?.withMemo ?? 0) },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardContent className="mt-5 pb-4 text-center">
              <p className="text-xl font-bold tabular-nums text-white font-mono">{kpi.value}</p>
              <p className="text-xs text-neutral-500 mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment list */}
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-2">
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
                          <Badge className="text-xs bg-primary/15 text-primary border border-primary/20 px-1.5 py-0">x402</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
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
                      <p className="text-xs text-neutral-600">
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
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[
          { label: 'Total Settled', value: `${(totalSolSettled / 1e9).toFixed(4)} SOL` },
          { label: 'Total Calls Settled', value: totalCallsSettled.toLocaleString('en-US') },
          { label: 'Total Escrows', value: String(agentEscrows.length) },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <CardContent className="mt-5 pb-4 text-center">
              <p className="text-xl font-bold tabular-nums text-white font-mono">{kpi.value}</p>
              <p className="text-xs text-neutral-500 mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily bar chart */}
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Daily Settlement (last 30d)</CardTitle>
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
                    <span className="text-xs text-neutral-500 w-20 shrink-0">
                      {new Date(s.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-4 bg-neutral-800/50 rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm bg-primary/50 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-neutral-300 w-20 text-right shrink-0">{s.sol} SOL</span>
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
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Escrow Breakdown</CardTitle>
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
                    ? <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0">Funded</Badge>
                    : <Badge className="text-xs bg-neutral-800 text-neutral-500 border border-neutral-700 px-1.5 py-0">Empty</Badge>
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
        <CardHeader className="pb-0 px-5 pt-4"><CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Memory Vaults</CardTitle></CardHeader>
        <CardContent className="px-5 pt-3 pb-4">
          <div className="space-y-3">
            {fallbackVaults.map((v) => (
              <Link key={v.pda} href={`/vaults/${v.pda}`} className="block rounded-lg border border-neutral-800 bg-neutral-800/40 p-4 hover:bg-neutral-800/70 transition-colors">
                <Address value={v.pda} copy />
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-sm font-bold tabular-nums text-white font-mono">{v.totalSessions}</p><p className="text-xs text-neutral-500">Sessions</p></div>
                  <div><p className="text-sm font-bold tabular-nums text-white font-mono">{v.totalInscriptions}</p><p className="text-xs text-neutral-500">Inscriptions</p></div>
                  <div><p className="text-sm font-bold tabular-nums text-white font-mono">{v.totalBytesInscribed}</p><p className="text-xs text-neutral-500">Bytes</p></div>
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
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
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
                <Badge variant="secondary" className="text-xs">v{v.protocolVersion}</Badge>
                <Badge variant="secondary" className="text-xs">Nonce v{v.nonceVersion}</Badge>
                {v.delegateCount > 0 && (
                  <Badge className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30">
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
                  <p className="text-xs text-neutral-500">{cell.label}</p>
                  <p className="text-sm font-bold tabular-nums text-white font-mono">{cell.value}</p>
                </div>
              ))}
            </div>

            {v.sessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-neutral-600 font-semibold uppercase tracking-widest">Sessions</p>
                {v.sessions.map((s) => (
                  <div key={s.pda} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.isClosed
                        ? <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                        : <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />}
                      <span className="text-xs font-mono text-neutral-300 truncate">{s.pda.slice(0, 12)}…{s.pda.slice(-6)}</span>
                      <Badge variant="secondary" className="text-xs px-1">seq {s.sequenceCounter}</Badge>
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
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">SAP Event Timeline</CardTitle>
          <div className="flex items-center gap-2">
            {scanned > 0 && (
              <span className="text-xs text-neutral-600">{scanned} txs scanned</span>
            )}
            {events.length > 0 && (
              <Badge variant="secondary" className="text-xs tabular-nums">{events.length}</Badge>
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
            <p className="text-xs text-neutral-600 mt-1">
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
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${col}`}>
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-neutral-500 truncate">
                        {evt.txSignature.slice(0, 20)}…
                        {evt.blockTime
                          ? ` · ${new Date(evt.blockTime * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : ` · slot ${evt.slot}`}
                      </p>
                    </div>
                    {dataKeys.length > 0 && (
                      <span className="text-xs text-neutral-600 shrink-0">{dataKeys.length} fields</span>
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
                      <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500 mb-2">
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
                                <span className="text-xs font-mono text-primary shrink-0 min-w-[120px] pt-0.5">{k}</span>
                                <span className="text-xs font-mono text-neutral-300 text-right break-all max-w-[400px]">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-neutral-600 italic">No fields decoded</p>
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

/* ── Agent Metaplex Core Tab (SDK 0.9.0 bridge) ───────────── */

import type { AgentMetaplexLink, AgentNftItem, MetaplexRegistryResponse } from '~/hooks/use-sap';

/* ── Pill ─────────────────────────────────────────────────
 * Three flat variants used everywhere in the Metaplex tab.
 * No border + bg + color stacking; each variant picks one
 * cue. Status carries no chrome, just colored text.
 * ──────────────────────────────────────────────────────── */
type PillVariant = 'status' | 'kind' | 'sap' | 'mpl';
function Pill({
  variant = 'kind',
  className,
  title,
  children,
}: {
  variant?: PillVariant;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const base =
    'inline-flex items-center gap-1 text-[10px] font-medium leading-none whitespace-nowrap';
  const styles: Record<PillVariant, string> = {
    status: 'uppercase tracking-wider text-emerald-300/90',
    kind: 'rounded-md bg-neutral-800/60 px-1.5 py-1 font-mono text-neutral-300',
    sap: 'rounded-md bg-pink-500/10 px-1.5 py-1 font-mono text-pink-300',
    mpl: 'rounded-md bg-amber-500/10 px-1.5 py-1 font-mono text-amber-300',
  };
  return <span className={cn(base, styles[variant], className)} title={title}>{children}</span>;
}

function AgentMetaplexTab({
  data,
  loading,
  nfts,
  registry,
  canonicalCard,
  canonicalLoading,
  sapPda,
}: {
  data: AgentMetaplexLink | null;
  loading: boolean;
  nfts: AgentNftItem[] | null;
  registry: MetaplexRegistryResponse | null;
  canonicalCard: CanonicalEip8004Card | null;
  canonicalLoading: boolean;
  sapPda: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="py-10">
          <EmptyState
            icon={<Globe className="h-6 w-6" />}
            message="Metaplex link discovery returned no data"
          />
        </CardContent>
      </Card>
    );
  }

  const { linked, asset, agentIdentityUri, expectedUrl, sapAgentPda, registration, error } = data;

  const identityNfts = (nfts ?? []).filter((n) => n.hasAgentIdentity);
  const registryAgents = registry?.agents ?? [];
  // O(1) mint-address lookup for registry membership — used to mark NFTs
  // that are independently confirmed by api.metaplex.com (highest trust).
  const registryMintSet = new Set(registryAgents.map((a) => a.mintAddress));
  // SAP registration is a given on this page (we read the AgentAccount PDA).
  // The only question is whether Metaplex *also* knows about the agent — via
  // any of three independent signals (URI binding, on-chain plugin, registry).
  // ANY signal proves dual registration.
  const onMetaplex =
    !!linked || identityNfts.length > 0 || registryAgents.length > 0;
  const heroState: 'both' | 'sap-only' = onMetaplex ? 'both' : 'sap-only';

  return (
    <div className="space-y-6">
      {/* Status hero */}
      <Card className={cn(
        'overflow-hidden border',
        heroState === 'both'
          ? 'bg-pink-500/5 border-pink-500/20'
          : 'bg-neutral-900 border-neutral-800',
      )}>
        <CardContent className="px-5 py-2 lg:mt-4 mt-2 flex items-center align-middle gap-4">
          <div className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            heroState === 'both'
              ? 'bg-pink-500/15 text-pink-400'
              : 'bg-neutral-800 text-neutral-500',
          )}>
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">Metaplex Core Bridge</h3>
              <Pill variant={heroState === 'both' ? 'sap' : 'kind'}>
                {heroState === 'both' ? 'SAP + METAPLEX' : 'SAP ONLY'}
              </Pill>
              {linked && <Pill variant="status">URI-BOUND</Pill>}
            </div>
            <p className="text-xs text-neutral-500">
              {heroState === 'both'
                ? (() => {
                    const parts: string[] = [];
                    if (linked) parts.push('AgentIdentity URI bound to SAP host');
                    else if (identityNfts.length > 0) parts.push(`${identityNfts.length} on-chain AgentIdentity plugin${identityNfts.length === 1 ? '' : 's'}`);
                    if (registryAgents.length > 0) parts.push(`${registryAgents.length} entry${registryAgents.length === 1 ? '' : 'ies'} on api.metaplex.com`);
                    return `Registered on SAP (on-chain PDA) and on Metaplex · ${parts.join(' + ')}.`;
                  })()
                : error
                  ? `Discovery error: ${error}`
                  : 'Registered on SAP only. No Metaplex AgentIdentity plugin or registry entry found for this wallet.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Identity rows */}
      <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">
            Identity Mapping
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-2 divide-y divide-neutral-800">
          <PropertyRow
            label="SAP PDA"
            value={
              <span className="font-mono text-xs text-neutral-300 break-all">{sapAgentPda}</span>
            }
          />
          <PropertyRow
            label="MPL Core Asset"
            value={
              asset ? (
                <div className="flex items-center gap-2 justify-end flex-wrap">
                  <Link
                    href={`${SOLSCAN}/token/${asset}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-pink-400 hover:underline break-all inline-flex items-center gap-1"
                  >
                    {asset}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                  <Pill variant="sap">SAP-BOUND</Pill>
                </div>
              ) : identityNfts.length > 0 ? (
                <div className="flex items-center gap-2 justify-end flex-wrap">
                  <span
                    className="inline-flex shrink-0 cursor-help"
                    aria-label="Discovered MPL Core asset"
                    title={
                      identityNfts.length > 1
                        ? `${identityNfts.length} MPL Core assets owned by this wallet carry an AgentIdentity plugin but none point to the SAP host — see NFT cards below for full details.`
                        : `Discovered on ${identityNfts[0].identityHost ?? 'a foreign host'} — AgentIdentity plugin URI is not bound to the SAP host. See NFT cards below for full details.`
                    }
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  </span>
                  <Link
                    href={`${SOLSCAN}/token/${identityNfts[0].asset}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-amber-400 hover:underline break-all inline-flex items-center gap-1"
                  >
                    {identityNfts[0].asset}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                </div>
              ) : (
                <span className="text-xs text-neutral-600 italic">none discovered</span>
              )
            }
          />
          <PropertyRow
            label="Expected EIP-8004 URL"
            value={
              <Link href={expectedUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 max-w-[20rem] truncate">
                {expectedUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </Link>
            }
          />
          {agentIdentityUri && agentIdentityUri !== expectedUrl && (
            <PropertyRow
              label="On-chain AgentIdentity URI"
              value={
                <Link href={agentIdentityUri} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 max-w-[20rem] truncate">
                  {agentIdentityUri}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Canonical EIP-8004 Card — single source of truth served at
          /agents/<sapPda>/eip-8004.json. Same JSON third-party
          consumers receive (Metaplex, peer agents, indexers). */}
      {sapPda && (canonicalLoading || canonicalCard) && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-3 px-5 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-2 flex-wrap">
              <Sparkles className="h-3.5 w-3.5 text-pink-400" />
              Canonical EIP-8004 Card
              <InfoTip label={"Hybrid card served at /agents/<sapPda>/eip-8004.json. Merges SAP on-chain state, the MPL Core AgentIdentity plugin (if any) and the public Metaplex registry into one canonical JSON. This is exactly what third-party consumers see when they resolve this agent."} />
              {canonicalCard && (
                <Pill variant="status" className="ml-auto">LIVE</Pill>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            {canonicalLoading && !canonicalCard ? (
              <Skeleton className="h-24 w-full" />
            ) : canonicalCard ? (
              <>
                {/* JSON URL */}
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">Canonical URL</div>
                  <Link
                    href={`/agents/${sapPda}/eip-8004.json`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-pink-300 hover:underline inline-flex items-center gap-1 [overflow-wrap:anywhere]"
                  >
                    /agents/{sapPda}/eip-8004.json
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                </div>

                {/* Identity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div><span className="text-neutral-600">Name · </span><span className="text-neutral-200">{canonicalCard.name}</span></div>
                  <div><span className="text-neutral-600">Version · </span><span className="text-neutral-300 font-mono">{canonicalCard.version}</span></div>
                  <div className="sm:col-span-2 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-neutral-600 shrink-0">Owner · </span>
                    <Link href={`/agents/${canonicalCard.owner}`} className="font-mono text-neutral-300 hover:text-pink-300 [overflow-wrap:anywhere]">
                      {canonicalCard.owner}
                    </Link>
                  </div>
                  {canonicalCard.issuedAt && (
                    <div><span className="text-neutral-600">Issued · </span><span className="text-neutral-300">{safeDateStr(canonicalCard.issuedAt)}</span></div>
                  )}
                  {canonicalCard.updatedAt && canonicalCard.updatedAt !== canonicalCard.issuedAt && (
                    <div><span className="text-neutral-600">Updated · </span><span className="text-neutral-300">{safeDateStr(canonicalCard.updatedAt)}</span></div>
                  )}
                </div>

                {canonicalCard.description && (
                  <p className="text-xs text-neutral-300 leading-relaxed text-pretty">{canonicalCard.description}</p>
                )}

                {/* Endpoints */}
                {(canonicalCard.agentUri || canonicalCard.x402Endpoint) && (
                  <div className="space-y-1.5 text-xs">
                    {canonicalCard.agentUri && (
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-neutral-600 shrink-0">Agent URI · </span>
                        <Link href={canonicalCard.agentUri} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-pink-300 inline-flex items-center gap-1 [overflow-wrap:anywhere]">
                          {canonicalCard.agentUri}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </Link>
                      </div>
                    )}
                    {canonicalCard.x402Endpoint && (
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-neutral-600 shrink-0">x402 · </span>
                        <Link href={canonicalCard.x402Endpoint} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline inline-flex items-center gap-1 [overflow-wrap:anywhere]">
                          {canonicalCard.x402Endpoint}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Protocols */}
                {canonicalCard.protocols.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-600">Protocols</p>
                    <div className="flex flex-wrap gap-1.5">
                      {canonicalCard.protocols.map((p) => (
                        <Pill key={p}>{p}</Pill>
                      ))}
                    </div>
                  </div>
                )}

                {/* Capabilities */}
                {canonicalCard.capabilities.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-600">Capabilities <span className="text-neutral-500 normal-case tracking-normal tabular-nums">· {canonicalCard.capabilities.length}</span></p>
                    <div className="rounded-md border border-neutral-800/80 divide-y divide-neutral-800/80">
                      {canonicalCard.capabilities.map((c, i) => (
                        <div key={i} className="px-2.5 py-1.5 text-xs space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Pill variant="sap">{c.id}</Pill>
                            {c.version && <span className="text-neutral-600 font-mono">v{c.version}</span>}
                            {c.protocolId && <span className="text-neutral-600">· {c.protocolId}</span>}
                          </div>
                          {c.description && (
                            <p className="text-neutral-500 leading-relaxed">{c.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Services */}
                {canonicalCard.services.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-600">Services</p>
                    <div className="rounded-md border border-neutral-800/80 divide-y divide-neutral-800/80">
                      {canonicalCard.services.map((s, i) => (
                        <div key={`${s.id}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Pill className="shrink-0">{s.type}</Pill>
                            <span className="text-neutral-300 [overflow-wrap:anywhere]">{s.id}</span>
                          </div>
                          {s.url && (
                            <Link href={s.url} target="_blank" rel="noreferrer" className="text-pink-300 hover:underline inline-flex items-center gap-1 shrink-0">
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources summary */}
                <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-600">Sources</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        canonicalCard.diagnostics?.sap === 'ok' ? 'bg-emerald-400' : 'bg-neutral-600',
                      )} />
                      <span className="text-neutral-400">SAP</span>
                      <span className="text-neutral-600 font-mono">v{canonicalCard.sources.sap.version ?? '?'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        canonicalCard.sources.metaplex.linked ? 'bg-emerald-400' : 'bg-neutral-700',
                      )} />
                      <span className="text-neutral-400">Metaplex link</span>
                      <span className="text-neutral-600">{canonicalCard.sources.metaplex.linked ? 'bound' : 'none'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        canonicalCard.sources.metaplex.registry.agents.length > 0 ? 'bg-emerald-400' : 'bg-neutral-700',
                      )} />
                      <span className="text-neutral-400">Registry</span>
                      <span className="text-neutral-600 tabular-nums">{canonicalCard.sources.metaplex.registry.agents.length}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        canonicalCard.reputation.isActive ? 'bg-emerald-400' : 'bg-neutral-600',
                      )} />
                      <span className="text-neutral-400">Reputation</span>
                      <span className="text-neutral-600 tabular-nums">{canonicalCard.reputation.score} · {canonicalCard.reputation.totalFeedbacks} fb</span>
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Registration */}
      {registration && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-0 px-5 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">
              EIP-8004 Registration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-2 divide-y divide-neutral-800">
            <PropertyRow label="Schema" value={<span className="text-xs text-neutral-400 font-mono">{registration.schema ?? '—'}</span>} />
            <PropertyRow label="Name" value={<span className="text-xs text-neutral-300">{registration.name ?? '—'}</span>} />
            <PropertyRow label="Version" value={<span className="text-xs text-neutral-400 font-mono">{registration.version ?? '—'}</span>} />
            {registration.synapseAgent && (
              <PropertyRow label="Synapse Agent" value={<span className="text-xs text-neutral-400 font-mono break-all">{registration.synapseAgent}</span>} />
            )}
            {registration.owner && (
              <PropertyRow label="Owner" value={<span className="text-xs text-neutral-400 font-mono break-all">{registration.owner}</span>} />
            )}
            {registration.issuedAt && (
              <PropertyRow label="Issued" value={<span className="text-xs text-neutral-400">{safeDateStr(registration.issuedAt)}</span>} />
            )}
          </CardContent>

          {/* Capabilities */}
          {registration.capabilities && registration.capabilities.length > 0 && (
            <CardContent className="px-5 pt-3 pb-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium mb-2">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {registration.capabilities.map((c, i) => (
                  <Pill key={i}>{String(c)}</Pill>
                ))}
              </div>
            </CardContent>
          )}

          {/* Executives */}
          {registration.executives && registration.executives.length > 0 && (
            <CardContent className="px-5 pt-3 pb-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium mb-2">Executives</p>
              <div className="space-y-1.5">
                {registration.executives.map((ex, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 px-3.5 py-2.5 text-xs">
                    <span className="font-mono text-neutral-300 break-all min-w-0 flex-1">{ex.address}</span>
                    <div className="flex items-center gap-2 text-neutral-500 shrink-0">
                      {typeof ex.permissions === 'number' && (
                        <span className="font-mono">perm 0x{ex.permissions.toString(16)}</span>
                      )}
                      {ex.expiresAt && (
                        <span>exp {safeDateStr(ex.expiresAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}

          {/* Services */}
          {registration.services && registration.services.length > 0 && (
            <CardContent className="px-5 pt-3 pb-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-600 uppercase tracking-wider font-medium mb-2">Services</p>
              <div className="space-y-1.5">
                {registration.services.map((svc, i) => (
                  <div key={i} className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3.5 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-neutral-300 font-medium break-all">{svc.id}</span>
                        <Pill className="shrink-0">{svc.type}</Pill>
                      </div>
                      {svc.url && (
                        <Link href={svc.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                          {svc.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Error fallback */}
      {error && !linked && (
        <Card className="bg-amber-500/5 border border-amber-500/20">
          <CardContent className="px-5 py-4 text-xs text-amber-400">
            <strong className="block mb-1">Discovery warning</strong>
            <span className="text-amber-300/70">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Metaplex Registry (api.metaplex.com) — agents this wallet has minted on the public registry */}
      {registry && (registryAgents.length > 0 || registry.error) && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-3 px-5 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-amber-400" />
              Metaplex Registry
              <span className="text-xs font-normal text-neutral-600 normal-case tracking-normal">api.metaplex.com</span>
              <InfoTip label={"Public peer-trust index hosted by Metaplex. Lists every agent minted through MPL Core's AgentIdentity bridge — independent of the SAP host. An entry here proves a third party indexed this agent. Not all on-chain plugins end up here, and the registry can list off-chain-only cards."} />
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-neutral-500 tabular-nums">{registryAgents.length} {registryAgents.length === 1 ? 'entry' : 'entries'}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            {registry.error ? (
              <p className="text-xs text-amber-400">Registry unreachable: {registry.error}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {registryAgents.map((a) => {
                    const hasToken = !!a.agentToken;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'relative rounded-lg border p-4 space-y-3 transition-colors',
                          hasToken
                            ? 'border-amber-400/40 bg-amber-500/5'
                            : 'border-neutral-800 bg-neutral-950/50',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {a.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.image}
                              alt={a.name ?? 'agent'}
                              className="size-10 rounded-md object-cover bg-neutral-900 shrink-0"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="size-10 rounded-md bg-neutral-900 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-medium text-white truncate">{a.name ?? 'Unnamed agent'}</p>
                              {hasToken && (
                                <Pill variant="mpl" title="This agent has launched its own SPL token via the Metaplex Agent Token feature (typically a Meteora DBC bonding curve). The token is bound to the agent's MPL Core asset and tradeable.">
                                  <Coins className="h-3 w-3" />
                                  AGENT TOKEN
                                </Pill>
                              )}
                            </div>
                            {a.description && (
                              <p className="text-xs text-neutral-500 line-clamp-2">{a.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-neutral-600 shrink-0">Mint ·</span>
                            <Link
                              href={`${SOLSCAN}/token/${a.mintAddress}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-neutral-400 hover:text-amber-300 inline-flex items-center gap-1 break-all"
                            >
                              {a.mintAddress}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </Link>
                          </div>
                          {hasToken && (
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-amber-400/80 inline-flex items-center gap-1 shrink-0">
                                <Coins className="h-3 w-3" />
                                Token ·
                              </span>
                              <Link
                                href={`${SOLSCAN}/token/${a.agentToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-amber-300 hover:underline inline-flex items-center gap-1 break-all"
                              >
                                {a.agentToken!}
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </Link>
                            </div>
                          )}
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-neutral-600 shrink-0">Metadata ·</span>
                            <Link
                              href={a.agentMetadataUri}
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-400 hover:underline inline-flex items-center gap-1 break-all"
                            >
                              {a.agentMetadataUri}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Discovered AgentIdentity NFTs (foreign + canonical) */}
      {identityNfts.length > 0 && (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
          <CardHeader className="pb-3 px-5 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Discovered AgentIdentity NFTs
              <InfoTip label={"Direct on-chain proof. MPL Core assets owned by this wallet that carry the AgentIdentity external plugin (EIP-8004 agent-card extension). The plugin URI is the source of truth — pointing it at the SAP host (gold cards) means this NFT is the canonical, transferable handle for this agent."} />
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-neutral-500 tabular-nums">{identityNfts.length} {identityNfts.length === 1 ? 'asset' : 'assets'}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-3 space-y-3">
            {/* Compact one-line summary + legend */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1.5 text-neutral-500">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-amber-300 font-medium">SAP × METAPLEX</span>
                  <span className="text-neutral-600">URI bound to SAP host</span>
                </span>
                <span className="text-neutral-700">·</span>
                <span className="inline-flex items-center gap-1.5 text-neutral-500">
                  <span className="inline-block h-2 w-2 rounded-full bg-neutral-500" />
                  <span className="text-neutral-300 font-medium">METAPLEX</span>
                  <span className="text-neutral-600">peer registry only</span>
                </span>
                <span className="text-neutral-700">·</span>
                <span className="inline-flex items-center gap-1.5 text-neutral-500">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300 font-medium">✓ REGISTRY</span>
                  <span className="text-neutral-600">indexed on api.metaplex.com</span>
                </span>
              </div>
              {registryAgents.length !== identityNfts.length && (
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200 select-none">
                    Why on-chain plugins ({identityNfts.length}) and registry entries ({registryAgents.length}) differ
                  </summary>
                  <p className="mt-1.5 pl-4 leading-relaxed">
                    {registryAgents.length > identityNfts.length
                      ? 'Registry entries can exist without an on-chain plugin (off-chain card only) or be tied to mints not currently held by this wallet.'
                      : 'On-chain plugins exist that have not been registered on api.metaplex.com — they remain valid identities, just not indexed by the public registry.'}
                  </p>
                </details>
              )}
            </div>
            {identityNfts.map((n) => {
              const isCanonical = n.linkedToThisAgent;
              const inRegistry = registryMintSet.has(n.asset);
              const reg = n.registration;
              return (
                <div
                  key={n.asset}
                  className={cn(
                    'rounded-lg border p-3 space-y-2.5',
                    isCanonical
                      ? 'border-amber-400/40 bg-amber-500/5 shadow-[0_0_18px_-12px_hsl(var(--neon-amber)/0.6)]'
                      : 'border-neutral-700 bg-neutral-950/40',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {n.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.image}
                        alt={n.name ?? 'NFT'}
                        className="h-12 w-12 rounded-md object-cover bg-neutral-950 shrink-0"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white truncate">{n.name ?? reg?.name ?? 'Unnamed asset'}</p>
                        <Pill variant={isCanonical ? 'sap' : 'mpl'}>
                          {isCanonical ? 'SAP × METAPLEX' : `METAPLEX · ${n.identityHost ?? 'registry'}`}
                        </Pill>
                        {inRegistry && (
                          <Pill variant="status" title="Mint listed on api.metaplex.com Agents Registry">
                            ✓ REGISTRY
                          </Pill>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`${SOLSCAN}/token/${n.asset}`}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            'font-mono text-xs break-all inline-flex items-center gap-1 hover:underline',
                            isCanonical ? 'text-amber-300/80' : 'text-neutral-400',
                          )}
                        >
                          {n.asset}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  {n.agentIdentityUri && (
                    <div className="text-xs text-neutral-500">
                      <span className="text-neutral-600">URI · </span>
                      <Link
                        href={n.agentIdentityUri}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          'hover:underline inline-flex items-center gap-1 max-w-full break-all',
                          isCanonical ? 'text-amber-400' : 'text-neutral-400',
                        )}
                      >
                        {n.agentIdentityUri}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                    </div>
                  )}

                  {/* EIP-8004 JSON content (foreign or canonical) */}
                  {reg ? (() => {
                    const rawOwner = reg.owner ?? reg.authority ?? null;
                    const regOwner = typeof rawOwner === 'string' && rawOwner.length > 0 ? rawOwner : null;
                    const services = Array.isArray(reg.services) ? reg.services : [];
                    const registrations = Array.isArray(reg.registrations) ? reg.registrations : [];
                    const trust = Array.isArray(reg.supportedTrust) ? reg.supportedTrust : [];
                    return (
                      <div className={cn(
                        'rounded-md border p-3 space-y-2.5',
                        isCanonical
                          ? 'border-amber-500/25 bg-amber-500/[0.04]'
                          : 'border-neutral-800 bg-neutral-950/50',
                      )}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={cn(
                            'text-xs uppercase tracking-wider font-semibold inline-flex items-center gap-1.5',
                            isCanonical ? 'text-amber-300' : 'text-neutral-400',
                          )}>
                            <Sparkles className="h-3 w-3" />
                            EIP-8004 Card
                          </p>
                          {reg.active && <Pill variant="status">ACTIVE</Pill>}
                          {reg.x402Support && <Pill>x402</Pill>}
                          {trust.length > 0 && (
                            <span className="inline-flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Trust ·</span>
                              {trust.map((t) => (
                                <Pill key={String(t)}>{String(t)}</Pill>
                              ))}
                            </span>
                          )}
                        </div>

                        {reg.description && (
                          <p className="text-xs text-neutral-300 leading-relaxed text-pretty">{reg.description}</p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {reg.name && (
                            <div className="truncate"><span className="text-neutral-600">Name · </span><span className="text-neutral-200">{reg.name}</span></div>
                          )}
                          {reg.version && (
                            <div className="truncate"><span className="text-neutral-600">Version · </span><span className="text-neutral-300 font-mono">{reg.version}</span></div>
                          )}
                          {regOwner && (
                            <div className="sm:col-span-2 flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-neutral-600 shrink-0">Owner · </span>
                              <Link
                                href={`/agents/${regOwner}`}
                                className="font-mono text-neutral-300 hover:text-amber-300 break-all"
                              >
                                {regOwner}
                              </Link>
                            </div>
                          )}
                          {reg.issuedAt && (
                            <div><span className="text-neutral-600">Issued · </span><span className="text-neutral-300">{safeDateStr(reg.issuedAt)}</span></div>
                          )}
                          {reg.synapseAgent && (
                            <div className="sm:col-span-2 truncate"><span className="text-neutral-600">Synapse · </span><span className="text-neutral-300 font-mono">{String(reg.synapseAgent)}</span></div>
                          )}
                        </div>

                        {services.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wider text-neutral-600">Services</p>
                            <div className="rounded-md border border-neutral-800/80 divide-y divide-neutral-800/80">
                              {services.map((svc, i) => {
                                const label = svc.name ?? svc.type ?? svc.id ?? `service-${i + 1}`;
                                const endpoint = svc.endpoint ?? svc.url ?? null;
                                return (
                                  <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Pill variant={isCanonical ? 'mpl' : 'kind'} className="shrink-0">
                                        {label}
                                      </Pill>
                                      {svc.version && (
                                        <span className="text-xs text-neutral-600 font-mono">v{svc.version}</span>
                                      )}
                                    </div>
                                    {endpoint && (
                                      <Link
                                        href={endpoint}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-neutral-400 hover:text-amber-300 truncate inline-flex items-center gap-1 min-w-0"
                                      >
                                        <span className="truncate">{endpoint}</span>
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                      </Link>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {registrations.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wider text-neutral-600 inline-flex items-center gap-1.5">
                              Cross-chain identity
                              <InfoTip label={"This same agent is registered across multiple chains and registries (CAIP-10 format). Other apps can resolve this identity from any of these networks — making the agent portable, multi-chain discoverable, and decoupled from any single registry."} />
                            </p>
                            <div className="space-y-1">
                              {registrations.map((r, i) => {
                                const decoded = decodeAgentRegistry(r.agentRegistry);
                                return (
                                  <div key={i} className="flex items-center justify-between gap-2 text-xs rounded border border-neutral-800/80 bg-neutral-950/40 px-3 py-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Pill className="shrink-0">{decoded.chain}</Pill>
                                      {decoded.explorer ? (
                                        <Link
                                          href={decoded.explorer}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="font-mono text-neutral-500 hover:text-amber-300 break-all inline-flex items-center gap-1"
                                        >
                                          {decoded.registryLabel}
                                          <ExternalLink className="h-3 w-3 shrink-0" />
                                        </Link>
                                      ) : (
                                        <span className="font-mono text-neutral-500 break-all">{decoded.registryLabel}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-neutral-600">id ·</span>
                                      <span className="font-mono text-neutral-300">{r.agentId}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })() : n.agentIdentityUri ? (
                    <p className="text-xs text-neutral-600 italic">EIP-8004 JSON unreachable or invalid.</p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── ScrollableList ─────────────────────────────────────────
 * Caps a list to ~`maxVisible` rows and scrolls the rest.
 * Shows a 3-chevron-down animated indicator when overflowing.
 * ──────────────────────────────────────────────────────── */

/* ── StatPill ─────────────────────────────────────────────
 * Compact "label · value" badge used in the registry-coordination banner
 * to surface concrete numeric facts (NFT counts, registry hits, etc).
 * ──────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'neutral' | 'pink' | 'emerald' | 'amber';
}) {
  const cls =
    tone === 'pink'
      ? 'bg-pink-500/10 text-pink-200 border-pink-500/30'
      : tone === 'emerald'
        ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30'
        : tone === 'amber'
          ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
          : 'bg-neutral-800/60 text-neutral-300 border-neutral-700';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums', cls)}>
      <span className="font-bold">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </span>
  );
}

function ScrollableList({
  itemCount,
  maxVisible,
  approxItemPx,
  gapPx = 8,
  children,
}: {
  itemCount: number;
  maxVisible: number;
  approxItemPx: number;
  gapPx?: number;
  children: React.ReactNode;
}) {
  const overflows = itemCount > maxVisible;
  const maxHeight = maxVisible * approxItemPx + (maxVisible - 1) * gapPx;

  if (!overflows) {
    return <div>{children}</div>;
  }

  return (
    <div className="relative">
      <div
        className="overflow-y-auto scroll-smooth scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {children}
      </div>
      {/* Bottom fade + animated chevrons indicator */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-neutral-900 via-neutral-900/85 to-transparent pb-0.5">
        <ChevronsDown className="h-3.5 w-3.5 text-primary/70 animate-bounce" />
      </div>
    </div>
  );
}
