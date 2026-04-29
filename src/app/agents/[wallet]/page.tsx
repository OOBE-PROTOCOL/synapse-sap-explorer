/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Copy, Zap, Activity, Loader2, DollarSign, Coins, Rocket, Globe, ChevronRight, ChevronsDown, Sparkles, HelpCircle, LineChart } from 'lucide-react';
import { StatusBadge, Address, ProtocolBadge, Skeleton, EmptyState, AgentAvatar, ExplorerPagination, usePagination } from '~/components/ui';
import { DetailRow, MetricTile, PortfolioRow, SectionLabel, TokenAvatar, TokenAvatarStack, VerificationPill } from '~/components/ui/agent-profile-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useAgent, useTools, useEscrows, useFeedbacks, useAttestations, useVaults, useAddressEvents, useAgentRevenue, useAgentMemory, useX402Payments, useAgentBalances, useAgentStaking, useAgentMetaplex, useAgentNfts, useMetaplexRegistry, useCanonicalEip8004, useAgentLaunchTokens, type CanonicalEip8004Card, type AgentLaunchTokenEntry } from '~/hooks/use-sap';
import { useQueryState, QueryParam } from '~/hooks/use-query-state';
import type { SapEvent, X402PaymentRow, X402Stats } from '~/hooks/use-sap';
import type {
  MetaplexGenesisLaunch,
  MetaplexGenesisTokenLaunchesPayload,
} from '~/lib/metaplex/genesis-types';
import type { GenesisOnchainPayload } from '~/app/api/market/genesis-onchain/[genesis]/route';
import { toast } from 'sonner';
import { cn } from '~/lib/utils';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

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

const AGENT_TABS = ['overview', 'revenue', 'tools', 'escrows', 'feedbacks', 'attestations', 'events', 'vault', 'x402', 'metaplex', 'tokens'] as const;
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
    setActiveTab(section);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const panel = document.getElementById(`agent-tab-${section}`);
        if (!panel) return;
        // `nearest` keeps the viewport stable when the panel is already
        // visible (typical sub-tab click) and only scrolls when the user
        // is far away. Avoids the empty-space-above-sidebar artefact
        // that `block:'start'` produced because the sticky aside sat at
        // top:5rem while the panel snapped to viewport top:0.
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  // Must be declared before any early-return to satisfy Rules of Hooks.
  const profilePda = data?.profile?.pda ?? null;
  // Real Genesis launches only — server validates each candidate against
  // api.metaplex.com/v1/tokens/{mint} so MPL Core identity NFTs (which
  // pass the SPL/Token-2022 program filter) are never surfaced here.
  const { data: launchTokensData } = useAgentLaunchTokens(canonicalWallet);
  const agentLaunchTokens: AgentLaunchToken[] = useMemo(() => {
    if (!profilePda) return [];
    return (launchTokensData?.tokens ?? []).map((t) => ({
      mint: t.mint,
      name: t.name,
      registryAgentMint: t.registryAgentMint || profilePda,
    }));
  }, [launchTokensData?.tokens, profilePda]);

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
    { value: 'tokens', label: 'Token Launch', count: agentLaunchTokens.length },
  ];

  // ── 2-tier tab grouping ──────────────────────────────────────────
  // Top-level groups collapse the 10 raw tabs into 5 semantic buckets so
  // the strip never overflows. Each group renders an inner chip-row of
  // its sub-tabs (only when the group has >1 sub-tab).
  type TabGroup = 'overview' | 'activity' | 'economy' | 'capabilities' | 'identity';
  const TAB_GROUP_OF: Record<AgentTab, TabGroup> = {
    overview: 'overview',
    events: 'activity',
    x402: 'activity',
    revenue: 'economy',
    escrows: 'economy',
    feedbacks: 'economy',
    tools: 'capabilities',
    attestations: 'capabilities',
    vault: 'capabilities',
    metaplex: 'identity',
    tokens: 'identity',
  };
  const tabGroups: Array<{ key: TabGroup; label: string; tabs: AgentTab[] }> = [
    { key: 'overview', label: 'Overview', tabs: ['overview'] },
    { key: 'activity', label: 'Activity', tabs: ['events', 'x402'] },
    { key: 'economy', label: 'Economy', tabs: ['revenue', 'escrows', 'feedbacks'] },
    { key: 'capabilities', label: 'Capabilities', tabs: ['tools', 'attestations', 'vault'] },
    {
      key: 'identity',
      label: 'Metaplex',
      // Always render both sub-tabs so the partition between Identity
      // (014 Registry / Core Asset) and Usage (Genesis token launch)
      // mirrors Metaplex Explorer's own model. Token Launch reads as
      // "0" when the agent hasn't minted yet — informative, not hidden.
      tabs: ['metaplex', 'tokens'],
    },
  ];
  const activeGroup: TabGroup = TAB_GROUP_OF[activeTab];
  const activeGroupMeta = tabGroups.find((g) => g.key === activeGroup) ?? tabGroups[0];
  const groupCount = (g: { tabs: AgentTab[] }) =>
    g.tabs.reduce((s, t) => s + (sidebarSections.find((x) => x.value === t)?.count ?? 0), 0);
  const openGroup = (g: TabGroup) => {
    const target = tabGroups.find((x) => x.key === g)?.tabs[0];
    if (target) openSection(target);
  };

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
    <div className="space-y-4 motion-safe:animate-fade-in">
      {/* ═══════════ HERO RIBBON (Solscan-style identity strip) ═══════════ */}
      {(() => {
        const totalNfts = nftsData?.total ?? 0;
        const pluginCount = nftsData?.withAgentIdentity ?? 0;
        const registrySet = new Set((registryData?.agents ?? []).map((a) => a.mintAddress));
        const verifiedBoth = (nftsData?.items ?? []).filter((n) => n.hasAgentIdentity && registrySet.has(n.asset)).length;
        return (
          <div className="rounded-lg border border-border/30 bg-card/60 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => router.push('/agents')}
                aria-label="Back to all agents"
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Agents</span>
              </button>
              <span aria-hidden className="text-neutral-700">/</span>
              <span className="font-mono text-neutral-400 truncate" title={id.wallet}>
                {id.wallet.slice(0, 6)}…{id.wallet.slice(-4)}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3 min-w-0 lg:flex-1">
                <div className="relative shrink-0">
                  <AgentAvatar
                    name={id.name}
                    endpoint={id.x402Endpoint}
                    className="rounded-full p-0 ring-2 ring-neutral-800"
                    size={44}
                  />
                  {computed.isActive && (
                    <span
                      aria-label="Agent is active"
                      title="Active in the last 7 days"
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-neutral-950"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold tracking-tight text-neutral-50 truncate text-balance">{id.name}</h1>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => copyAddr(id.wallet)}
                      aria-label={`Copy wallet address ${id.wallet}`}
                      className="group inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    >
                      <span>{id.wallet.slice(0, 8)}…{id.wallet.slice(-6)}</span>
                      <Copy className={cn('h-3 w-3', copied === id.wallet ? 'text-emerald-400' : 'opacity-60 group-hover:opacity-100')} />
                    </button>
                    <a
                      href={`${SOLSCAN}/account/${id.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open wallet on Solscan"
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Solscan</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Right side: verification pills + primary CTA */}
              <div className="flex items-center gap-1.5 flex-wrap lg:justify-end lg:max-w-[60%]">
                <VerificationPill
                  label="SAP"
                  verified
                  source="AgentAccount PDA exists on-chain (program SAPpUhsW…)"
                />
                <VerificationPill
                  label="MPL"
                  verified={!!metaplexData?.linked}
                  source={
                    metaplexData?.linked
                      ? 'Indexed by api.metaplex.com — peer-trust attestation'
                      : 'Not indexed by api.metaplex.com'
                  }
                  tone="amber"
                />
                {/* Show the strongest single signal instead of stacking 3 overlapping pills */}
                {verifiedBoth > 0 ? (
                  <VerificationPill
                    label={`Bound (${verifiedBoth})`}
                    verified
                    source={`${verifiedBoth} asset(s) appear in BOTH on-chain plugin AND api.metaplex.com — strongest signal`}
                  />
                ) : pluginCount > 0 ? (
                  <VerificationPill
                    label={`8004 (${pluginCount})`}
                    verified
                    source={`${pluginCount} owned MPL Core asset(s) carry an EIP-8004 AgentIdentity plugin`}
                    tone="cyan"
                  />
                ) : null}
                {uriBound && (
                  <VerificationPill
                    label="URI"
                    verified
                    source="At least one AgentIdentity plugin URI resolves to this SAP host"
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant={metaplexData?.linked ? 'default' : 'outline'}
                  onClick={() => openSection('metaplex')}
                  aria-label="Jump to Metaplex section"
                  className={cn(
                    'h-7 px-2.5 text-xs shrink-0',
                    metaplexData?.linked && 'bg-amber-500/80 text-neutral-950 hover:bg-amber-400',
                  )}
                >
                  Metaplex <ChevronRight className="ml-0.5 h-3 w-3" />
                </Button>
                {/* Hidden tooltip target for totalNfts so SR users get context */}
                <span className="sr-only">{totalNfts} owned MPL Core assets total</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════ DASHBOARD LAYOUT ═══════════
       * Top row  → identity (left, col-5) + stats (right, col-7).
       * Bottom   → full-width tabs panel.
       * Header-strip pattern frees the tab body to use the full
       * viewport width — needed for wide tabs (Token Launch chart
       * + swap UI, Revenue curves, x402 transaction tables). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

        {/* ── SECTION 1 — Identity (left, col-span-5) ──
         * Bio + Identifiers stacked. No sticky: this is a header strip
         * meant to scroll out of view, not a sidebar. */}
        <section aria-label="Agent identity" className="lg:col-span-5 min-w-0 flex flex-col">
          <div className="rounded-lg border border-border/30 bg-card/60 overflow-hidden h-full flex flex-col">
            {/* Description */}
            {id.description && (
              <div className="px-5 py-4 border-b border-neutral-800/60">
                <SectionLabel>Bio</SectionLabel>
                <p className="mt-1.5 text-xs text-neutral-300 leading-relaxed text-pretty">{id.description}</p>
              </div>
            )}

            {/* Identifiers */}
            <div className="px-5 py-4 border-b border-neutral-800/60">
              <SectionLabel>Identifiers</SectionLabel>
              <div className="mt-1.5 divide-y divide-neutral-800/60">
                <DetailRow
                  label="PDA"
                  hint="Canonical SAP AgentAccount derived from the wallet pubkey"
                  mono
                  value={
                    <button
                      type="button"
                      onClick={() => copyAddr(profile.pda)}
                      aria-label={`Copy PDA ${profile.pda}`}
                      className="group inline-flex items-center gap-1 rounded px-1 hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    >
                      <span>{profile.pda.slice(0, 6)}…{profile.pda.slice(-6)}</span>
                      <Copy className={cn('h-3 w-3', copied === profile.pda ? 'text-emerald-400' : 'opacity-60 group-hover:opacity-100')} />
                    </button>
                  }
                />
                <DetailRow
                  label="Wallet"
                  mono
                  value={
                    <button
                      type="button"
                      onClick={() => copyAddr(id.wallet)}
                      aria-label={`Copy wallet ${id.wallet}`}
                      className="group inline-flex items-center gap-1 rounded px-1 hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    >
                      <span>{id.wallet.slice(0, 6)}…{id.wallet.slice(-6)}</span>
                      <Copy className={cn('h-3 w-3', copied === id.wallet ? 'text-emerald-400' : 'opacity-60 group-hover:opacity-100')} />
                    </button>
                  }
                />
                {id.x402Endpoint && (
                  <DetailRow
                    label="x402"
                    hint="HTTP 402 micropayment endpoint advertised by the agent"
                    value={
                      <a
                        href={id.x402Endpoint}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open x402 endpoint"
                        className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                      >
                        <Globe className="h-3 w-3" />
                        <span className="truncate max-w-[180px]">{id.x402Endpoint.replace(/^https?:\/\//, '')}</span>
                      </a>
                    }
                  />
                )}
              </div>
            </div>

            {/* Identity layer — Metaplex 014 Agent Registry / Core Asset.
             * Mirrors the partition Metaplex Explorer enforces between
             * IDENTITY (Core Asset NFT) and USAGE (Genesis token). Hidden
             * when the wallet has no MPL footprint to keep the strip compact. */}
            {((nftsData?.total ?? 0) > 0 || registryAgentCount > 0) && (
              <div className="px-5 py-4 border-t border-neutral-800/60">
                <SectionLabel>Agent identity · 014 Registry</SectionLabel>
                <div className="mt-2 divide-y divide-neutral-800/60">
                  <DetailRow
                    label="MPL Core owned"
                    hint="All MPL Core NFTs owned by this wallet"
                    value={
                      <span className={cn('tabular-nums', (nftsData?.total ?? 0) > 0 ? 'text-neutral-200' : 'text-neutral-600')}>
                        {nftsData?.total ?? 0}
                      </span>
                    }
                  />
                  <DetailRow
                    label="With 8004 plugin"
                    hint="MPL Core assets carrying an AgentIdentity external plugin"
                    value={
                      <span className={cn('tabular-nums', (nftsData?.withAgentIdentity ?? 0) > 0 ? 'text-cyan-300' : 'text-neutral-600')}>
                        {nftsData?.withAgentIdentity ?? 0}
                      </span>
                    }
                  />
                  <DetailRow
                    label="In MPL registry"
                    hint="Entries on api.metaplex.com indexed for this wallet"
                    value={
                      <span className={cn('tabular-nums', registryAgentCount > 0 ? 'text-amber-300' : 'text-neutral-600')}>
                        {registryAgentCount}
                      </span>
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 2 — Stats (right, col-span-7) ──
         * Performance metrics + Portfolio + Staking. The "how does this
         * agent perform / what does it hold" half. Identity assets live
         * in Section 1 to keep the two columns roughly balanced. */}
        <section aria-label="Agent stats" className="lg:col-span-7 min-w-0 flex flex-col">
          <div className="rounded-lg border border-border/30 bg-card/60 overflow-hidden h-full flex flex-col">

            {/* Agent Token (Genesis layer) — partitioned from Identity per
             * Metaplex's own model: the 014 Registry Core Asset is the
             * agent's identity, the Genesis bonding-curve token is its
             * utility/market. Surface the canonical token prominently here
             * so users land on the same hierarchy Metaplex Explorer uses.
             * When the wallet has NOT launched a token yet, render a CTA
             * pointing to the synapse-sap agent skills so users know how
             * to mint one with their agent. */}
            <div className="px-5 py-4 border-b border-neutral-800/60">
              <SectionLabel>
                {/* Label tracks the actual classification: "Genesis" only
                 * when the canonical Metaplex Genesis on-chain GPA (or the
                 * Genesis API enrichment) reports at least one launch for
                 * the surfaced mint. Otherwise it's a generic launched
                 * token (pump.fun graduated, raw SPL, etc.). */}
                Agent token{' '}
                {(() => {
                  const t = launchTokensData?.tokens?.[0];
                  if (!t) return '';
                  if (t.launchCount > 0) return '· Genesis';
                  return t.tokenProgram === 'token-2022' ? '· Token-2022' : '· SPL';
                })()}
              </SectionLabel>
              {agentLaunchTokens.length > 0 && launchTokensData?.tokens?.[0] ? (
                <AgentTokenCard
                  token={launchTokensData.tokens[0]}
                  extraCount={Math.max(0, launchTokensData.tokens.length - 1)}
                  onOpenDetails={() => openSection('tokens')}
                  onCopy={copyAddr}
                  copied={copied}
                />
              ) : (
                <AgentTokenEmptyCta dense />
              )}
            </div>

            {/* Performance metrics */}
            <div className="px-5 py-4 border-b border-neutral-800/60">
              <SectionLabel>Performance</SectionLabel>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <MetricTile
                  label="Calls"
                  value={totalCallsSettled.toLocaleString()}
                  hint={`Total settled calls across ${agentEscrows.length} escrow(s)`}
                  tone="emerald"
                />
                <MetricTile
                  label="Reputation"
                  value={computed.reputationScore}
                  hint="Reputation score from SAP on-chain reputation events"
                  tone="cyan"
                />
                <MetricTile
                  label="Latency"
                  value={id.avgLatencyMs}
                  unit="ms"
                  hint="Reported average response latency"
                />
                <MetricTile
                  label="Uptime"
                  value={id.uptimePercent}
                  unit="%"
                  hint="Reported uptime percentage"
                />
              </div>
            </div>

            {/* Portfolio summary */}
            <div className="px-5 py-4 border-b border-neutral-800/60">
              <div className="flex items-center justify-between">
                <SectionLabel>Portfolio</SectionLabel>
                {balancesData?.totalUsd != null && balancesData.totalUsd > 0 && (
                  <span
                    className="font-mono text-sm tabular-nums text-neutral-100"
                    title="SOL + USDC + all priced SPL / Token-2022 holdings (Jupiter prices)"
                  >
                    ${balancesData.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              {balLoading ? (
                <div className="mt-2 space-y-1.5">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ) : balancesData ? (
                (() => {
                  const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
                  const USDC_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png';
                  const fmt = (n: number, d = 4) =>
                    n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : d });
                  const tokens = balancesData.tokens;
                  const tokensUsd = tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0);
                  const stackTokens = tokens.map((t) => ({
                    key: t.mint,
                    symbol: t.meta?.symbol ?? t.mint.slice(0, 4),
                    logo: t.meta?.logo ?? null,
                    title: `${t.meta?.symbol ?? t.mint.slice(0, 4)} \u2014 ${fmt(t.uiAmount)}${
                      t.usdValue != null ? ` ($${t.usdValue.toFixed(2)})` : ''
                    }`,
                  }));
                  return (
                    <div className="mt-2 divide-y divide-neutral-800/60">
                      <PortfolioRow
                        icon={<TokenAvatar src={SOL_LOGO} symbol="SOL" size={22} />}
                        label="Solana"
                        sublabel="SOL"
                        amount={fmt(balancesData.sol)}
                        usd={balancesData.solUsd != null ? `$${balancesData.solUsd.toFixed(2)}` : undefined}
                      />
                      {balancesData.usdc > 0 && (
                        <PortfolioRow
                          icon={<TokenAvatar src={USDC_LOGO} symbol="USDC" size={22} />}
                          label="USD Coin"
                          sublabel="USDC"
                          amount={fmt(balancesData.usdc, 2)}
                          usd={`$${balancesData.usdc.toFixed(2)}`}
                        />
                      )}
                      {tokens.length > 0 && (
                        <PortfolioRow
                          icon={<TokenAvatarStack tokens={stackTokens} max={3} size={22} />}
                          label={
                            <span className="inline-flex items-center gap-1.5">
                              <span>Tokens</span>
                              <span className="rounded bg-neutral-800 px-1 text-[10px] font-mono tabular-nums text-neutral-400">
                                {tokens.length}
                              </span>
                            </span>
                          }
                          sublabel={
                            tokens
                              .slice(0, 3)
                              .map((t) => t.meta?.symbol ?? t.mint.slice(0, 4))
                              .join(' \u00b7 ')
                              + (tokens.length > 3 ? ` \u00b7 +${tokens.length - 3}` : '')
                          }
                          amount={tokensUsd > 0 ? `$${tokensUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014'}
                          usd={tokensUsd > 0 ? 'priced' : 'unpriced'}
                        />
                      )}
                      {balancesData.deployedTokens.length > 0 && (
                        <DetailRow
                          label="Deployed"
                          hint="Tokens this wallet was the deployer/authority of"
                          value={
                            <span className="inline-flex items-center gap-1 text-emerald-300 tabular-nums">
                              <Rocket className="h-3 w-3" />
                              {balancesData.deployedTokens.length}
                            </span>
                          }
                        />
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="mt-2 text-xs text-neutral-600">No balance data available</p>
              )}
            </div>

            {/* Staking summary */}
            {stakingData && stakingData.stakedSol > 0 && (
              <div className="px-5 py-4 border-b border-neutral-800/60">
                <SectionLabel>Stake</SectionLabel>
                <div className="mt-2 divide-y divide-neutral-800/60">
                  <DetailRow
                    label="Staked"
                    mono
                    value={<span className="text-emerald-300">{stakingData.stakedSol.toFixed(4)} SOL</span>}
                  />
                  <DetailRow
                    label="Disputes W/L"
                    mono
                    value={
                      <span className="text-neutral-200">
                        <span className="text-emerald-400">{stakingData.totalDisputesWon}</span>
                        <span className="text-neutral-600">/</span>
                        <span className="text-rose-400">{stakingData.totalDisputesLost}</span>
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            {/* (Identity assets section moved to Section 1 for height
             * balance — see left column.) */}
          </div>
        </section>

      </div>

      {/* ═══════════ SECTION 3 — Full-width tabs ═══════════ */}
      <section aria-label="Agent details" className="space-y-3 min-w-0">
        {/* Primary group strip */}
        <div
          role="tablist"
          aria-label="Agent profile sections"
          className="flex items-center gap-1 rounded-lg border border-border/30 bg-card/60 p-1 overflow-x-auto scrollbar-thin"
        >
          {tabGroups.map((g) => {
            const isActive = g.key === activeGroup;
            const count = groupCount(g);
            return (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`agent-tab-${activeTab}`}
                onClick={() => openGroup(g.key)}
                className={cn(
                  'inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
                  isActive
                    ? 'bg-neutral-100 text-neutral-900 shadow-sm'
                    : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100',
                )}
              >
                <span className="whitespace-nowrap">{g.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-1 text-[10px] font-mono tabular-nums',
                      isActive ? 'bg-neutral-900/10 text-neutral-700' : 'bg-neutral-800 text-neutral-400',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Secondary sub-tab bar — ribbon attached to the panel below.
         * Each sub-tab sits flush with the panel (zero gap), has rounded
         * BOTTOM corners only, and the active one shares its background
         * with the panel — producing a folder-tab effect that visually
         * "drops down" out of the primary group strip and into the
         * tabpanel container. Standard ARIA tablist semantics, novel
         * shape language. */}
        {activeGroupMeta.tabs.length > 1 && (
          <div
            role="tablist"
            aria-label={`${activeGroupMeta.label} sub-sections`}
            className="-mt-1 -mb-px relative z-10 flex items-stretch gap-0.5 px-1 overflow-x-auto scrollbar-thin"
          >
            {activeGroupMeta.tabs.map((value) => {
              const meta = sidebarSections.find((s) => s.value === value);
              if (!meta) return null;
              const isActive = value === activeTab;
              const count = typeof meta.count === 'number' ? meta.count : null;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`agent-tab-${value}`}
                  onClick={() => openSection(value)}
                  className={cn(
                    'group/subtab relative inline-flex shrink-0 items-center gap-1.5 px-3.5 pt-1.5 pb-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40',
                    // Bottom-rounded folder tab. Active tab adopts the
                    // panel's background + border colour so it looks
                    // joined; inactive tabs have a subtle tinted background.
                    'rounded-b-md border-x border-b',
                    isActive
                      ? 'bg-card/60 border-border/30 text-emerald-300 shadow-[0_4px_12px_-6px_rgba(16,185,129,0.35)]'
                      : 'bg-neutral-900/40 border-transparent text-neutral-500 hover:bg-neutral-900/70 hover:text-neutral-200',
                  )}
                >
                  <span className="whitespace-nowrap">{meta.label}</span>
                  {count != null && (
                    <span
                      className={cn(
                        'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-mono tabular-nums transition-colors',
                        isActive
                          ? 'bg-emerald-400/15 text-emerald-200'
                          : count > 0
                            ? 'bg-neutral-800/80 text-neutral-400 group-hover/subtab:text-neutral-200'
                            : 'bg-neutral-900/60 text-neutral-600',
                      )}
                    >
                      {count}
                    </span>
                  )}
                  {/* Top accent line on the active tab — ties it to the
                   * primary group strip above. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute inset-x-2 top-0 h-[2px] rounded-b-sm transition-opacity',
                      isActive ? 'bg-emerald-400 opacity-100' : 'opacity-0',
                    )}
                  />
                </button>
              );
            })}
          </div>
        )}

        <div
          id={`agent-tab-${activeTab}`}
          role="tabpanel"
          aria-label={`${activeTab} content`}
          className={cn(
            'scroll-mt-20 border  bg-transparent p-4 sm:p-6 space-y-4',
            // When sub-tabs are present, the active one drops INTO the
            // panel: drop the top-left rounding so the panel reads as a
            // continuous folder body. Otherwise keep the full rounded box.
            activeGroupMeta.tabs.length > 1 ? 'rounded-b-lg rounded-tr-lg' : 'rounded-lg',
          )}
        >
        {/* Panel header — group › sub-tab */}
        {(() => {
          const subMeta = sidebarSections.find((s) => s.value === activeTab);
          const subCount = typeof subMeta?.count === 'number' ? subMeta.count : null;
          return (
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral-800/60">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-600 shrink-0">
                  {activeGroupMeta.label}
                </span>
                <span className="text-neutral-700" aria-hidden>›</span>
                <h2 className="text-sm font-semibold text-neutral-100 truncate text-balance">
                  {subMeta?.label ?? activeTab}
                </h2>
                {subCount != null && subCount > 0 && (
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-neutral-400 shrink-0">
                    {subCount}
                  </span>
                )}
              </div>
            </div>
          );
        })()}
        {/* Tab: Overview
         * Visual contract matches the dashboard strip above:
         *   • Same surface tokens (`bg-card/60 border-border/40`) so cards
         *     read as continuations, not a new container.
         *   • Same SectionLabel pattern, same px-5 py-4 padding.
         *   • Two-column responsive grid: Capabilities (col-span-2) +
         *     Pricing tiers stack on lg, single column on mobile. */}
        {activeTab === 'overview' && (
          <div className="motion-safe:animate-fade-in space-y-4">
            {(protocols.length > 0 || id.capabilities.length > 0 || id.pricing.length > 0) ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Capabilities (left, span-2): the agent's published
                 * surface area. Anchors the tab and gets the most width
                 * since each row carries id + protocol + description. */}
                <section
                  aria-label="Protocol & Capabilities"
                  className="lg:col-span-2 min-w-0"
                >
                  <div className="rounded-lg border border-border/40 bg-card/60 overflow-hidden h-full flex flex-col backdrop-blur-sm">
                    <div className="px-5 py-4 border-b border-neutral-800/60">
                      <SectionLabel>Protocols</SectionLabel>
                      {protocols.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {protocols.map((p) => (
                            <ProtocolBadge key={p} protocol={p} />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-600">No protocol metadata available.</p>
                      )}
                    </div>

                    <div className="px-5 py-4 flex-1 flex flex-col">
                      <SectionLabel>Capabilities</SectionLabel>
                      {id.capabilities.length > 0 ? (
                        <div className="mt-2 divide-y divide-neutral-800/60 rounded-md border border-neutral-800/60 bg-neutral-950/40">
                          {id.capabilities.map((c) => (
                            <Link
                              key={c.id}
                              href={`/capabilities/${encodeURIComponent(c.id)}`}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/40 transition-colors group focus-visible:outline-none focus-visible:bg-neutral-800/40"
                            >
                              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0 ring-1 ring-primary/20">
                                <Zap className="h-3 w-3 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-medium text-neutral-100 truncate">{c.id}</span>
                                  {c.protocolId && <ProtocolBadge protocol={c.protocolId} />}
                                </div>
                                {c.description && (
                                  <p className="text-[11px] text-neutral-500 mt-0.5 truncate leading-snug">{c.description}</p>
                                )}
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-neutral-700 group-hover:text-neutral-400 transition-colors shrink-0" />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-600">No capabilities published yet.</p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Pricing tiers (right, span-1): vertical stack so each
                 * tier reads as a self-contained price card. Uses the
                 * same outer surface as the left column for visual
                 * continuity. Renders an empty-state CTA when no tiers
                 * are defined so the column never collapses. */}
                <section aria-label="Pricing" className="min-w-0">
                  <div className="rounded-lg border border-border/40 bg-card/60 overflow-hidden h-full flex flex-col backdrop-blur-sm">
                    <div className="px-5 py-4 flex-1">
                      <SectionLabel>Pricing tiers</SectionLabel>
                      {id.pricing.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {id.pricing.map((p) => (
                            <div
                              key={p.tierId}
                              className="rounded-md border border-neutral-800/60 bg-neutral-950/40 p-3 hover:border-primary/30 transition-colors"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary truncate">
                                  {p.tierId}
                                </p>
                                <span className="text-[10px] text-neutral-600 uppercase tracking-wider shrink-0">
                                  {formatTokenType(p.tokenType)}/call
                                </span>
                              </div>
                              <p className="mt-1 text-base font-bold text-neutral-100 font-mono tabular-nums">
                                {formatPrice(p.pricePerCall, p.tokenDecimals)}
                              </p>
                              <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
                                <div className="rounded bg-neutral-900/60 px-1.5 py-1 border border-neutral-800/60">
                                  <p className="text-neutral-600 uppercase tracking-wider text-[9px]">Rate</p>
                                  <p className="text-neutral-200 font-mono tabular-nums">{p.rateLimit}/s</p>
                                </div>
                                <div className="rounded bg-neutral-900/60 px-1.5 py-1 border border-neutral-800/60">
                                  <p className="text-neutral-600 uppercase tracking-wider text-[9px]">Max</p>
                                  <p className="text-neutral-200 font-mono tabular-nums">{p.maxCallsPerSession === 0 ? '∞' : p.maxCallsPerSession}</p>
                                </div>
                                <div className="rounded bg-neutral-900/60 px-1.5 py-1 border border-neutral-800/60">
                                  <p className="text-neutral-600 uppercase tracking-wider text-[9px]">Mode</p>
                                  <p className="text-neutral-200 truncate">{formatSettlement(p.settlementMode)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-md border border-dashed border-neutral-700/60 bg-neutral-950/40 px-3 py-6 text-center">
                          <p className="text-xs text-neutral-500">No pricing tiers published</p>
                          <p className="mt-1 text-[10px] text-neutral-600 leading-relaxed">
                            Agents define tiers via the SAP <span className="font-mono text-neutral-400">register_pricing</span> instruction
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/40 bg-card/40 px-6 py-10 text-center">
                <p className="text-sm text-neutral-400">No protocol, capability, or pricing metadata published yet.</p>
                <p className="mt-1 text-xs text-neutral-600">All other tabs remain available for inspection.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Revenue */}
        {activeTab === 'revenue' && (
          <div className="space-y-3">
            {(revenueData as { degraded?: boolean } | null)?.degraded && (
              <DegradedBanner label="Revenue" />
            )}
            <AgentRevenueTab
              revenueData={revenueData}
              loading={revLoading}
              escrows={agentEscrows}
              totalSolSettled={totalSolSettled}
              totalCallsSettled={totalCallsSettled}
            />
          </div>
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
                    <div key={t.pda} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
                      <span className="text-sm font-medium text-white truncate min-w-0 flex-1">{t.descriptor?.toolName ?? 'Unnamed'}</span>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
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
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {agentEscrows.reduce((s, e) => s + Number(e.totalCallsSettled), 0).toLocaleString()} calls settled
                      </span>
                      </div>
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
          <div className="space-y-3">
            {(memoryData as { degraded?: boolean } | null)?.degraded && (
              <DegradedBanner label="Memory" />
            )}
            <AgentMemoryTab memoryData={memoryData} loading={memLoading} fallbackVaults={agentVaults} />
          </div>
        )}

        {/* Tab: x402 Direct Payments */}
        {activeTab === 'x402' && (
          <div className="space-y-3">
            {(x402Data as { degraded?: boolean } | null)?.degraded && (
              <DegradedBanner label="x402 payments" />
            )}
            <AgentX402Tab
              payments={x402Data?.payments ?? []}
              stats={x402Data?.stats ?? null}
              total={x402Data?.total ?? 0}
              loading={x402Loading}
            />
          </div>
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

        {activeTab === 'tokens' && (
          agentLaunchTokens.length > 0 ? (
            <AgentTokenMarketSection tokens={agentLaunchTokens} />
          ) : (
            <EmptyState
              icon={<Coins className="h-6 w-6" />}
              message="This agent has not launched a Metaplex Agent Token yet."
            />
          )
        )}
        </div>
      </section>
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

/* ── Degraded data banner ────────────────────────────────
 * Rendered inside a tab panel when its API route returned
 * `degraded: true` (transient DB failure with graceful fallback).
 * Tells the user the surface is intentionally empty, not broken.
 * ───────────────────────────────────────────────────── */
function DegradedBanner({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90"
    >
      <span aria-hidden="true" className="text-amber-400">⚠</span>
      <span className="text-pretty">
        {label} data is temporarily unavailable — the indexer is recovering. Refresh in a moment.
      </span>
    </div>
  );
}

/* ── Solscan-style property row ──────────────── */

function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5">
      <span className="text-xs text-neutral-500 shrink-0">{label}</span>
      <div className="text-right min-w-0 [overflow-wrap:anywhere]">{value}</div>
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
              <div key={e.pda} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Link href={`/escrows/${e.pda}`} className="text-xs font-mono text-neutral-300 hover:text-primary transition-colors truncate">
                    {e.pda.slice(0, 12)}…{e.pda.slice(-8)}
                  </Link>
                  {Number(e.balance) > 0
                    ? <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0 shrink-0">Funded</Badge>
                    : <Badge className="text-xs bg-neutral-800 text-neutral-500 border border-neutral-700 px-1.5 py-0 shrink-0">Empty</Badge>
                  }
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500 shrink-0">
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                <Database className="h-4 w-4 text-primary shrink-0" />
                <Link href={`/vaults/${v.pda}`} className="font-mono text-neutral-300 hover:text-primary transition-colors truncate">
                  {v.pda.slice(0, 12)}…{v.pda.slice(-8)}
                </Link>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
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
                  <div key={s.pda} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.isClosed
                        ? <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                        : <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />}
                      <span className="text-xs font-mono text-neutral-300 truncate">{s.pda.slice(0, 12)}…{s.pda.slice(-6)}</span>
                      <Badge variant="secondary" className="text-xs px-1">seq {s.sequenceCounter}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap sm:shrink-0">
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
                                <span className="text-xs font-mono text-primary shrink-0 min-w-[80px] pt-0.5">{k}</span>
                                <span className="text-xs font-mono text-neutral-300 text-right break-all min-w-0 flex-1">{display}</span>
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
  // Hooks must run unconditionally — keep all React hooks above any
  // early returns. The sub-tab state is initialized to 'mapping' (always
  // visible) so the initial value is valid even when `data`/`loading`
  // short-circuits below.
  const [mplSubTab, setMplSubTab] = useState<string>('mapping');

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

  // ── Inner sub-tabs (gold/amber strip) ──────────────────────────────
  // Each Metaplex sub-section can be navigated independently so users
  // don't have to scroll through 1500+ px of stacked cards.
  const subSections: Array<{ key: string; label: string; count?: number; visible: boolean }> = [
    { key: 'mapping', label: 'Identity Mapping', visible: true },
    { key: 'card', label: 'EIP-8004 Card', visible: !!sapPda && (canonicalLoading || !!canonicalCard) },
    { key: 'registration', label: 'Registration', visible: !!registration },
    { key: 'registry', label: 'Registry', count: registryAgents.length, visible: !!registry && (registryAgents.length > 0 || !!registry?.error) },
    { key: 'nfts', label: 'AgentIdentity NFTs', count: identityNfts.length, visible: identityNfts.length > 0 },
  ].filter((s) => s.visible);
  // If the currently selected sub-tab disappeared (e.g. registration data
  // arrived asynchronously and now we're on a no-longer-visible tab),
  // fall back to the first visible section in render — purely derived,
  // no extra effect needed.
  const activeSubTab = subSections.some((s) => s.key === mplSubTab)
    ? mplSubTab
    : subSections[0]?.key ?? 'mapping';

  return (
    <div className="space-y-4">
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
              <h3 className="text-sm font-semibold text-foreground text-balance">Metaplex Core Bridge</h3>
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

      {/* Gold sub-tab strip */}
      {subSections.length > 1 && (
        <div
          role="tablist"
          aria-label="Metaplex Core Bridge sections"
          className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-1 scrollbar-thin [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]"
        >
          {subSections.map((s) => {
            const isActive = activeSubTab === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`mpl-sub-${s.key}`}
                onClick={() => setMplSubTab(s.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50',
                  isActive
                    ? 'bg-amber-400/90 text-neutral-950 shadow-sm'
                    : 'text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-100',
                )}
              >
                <span className="whitespace-nowrap">{s.label}</span>
                {typeof s.count === 'number' && s.count > 0 && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-1 text-[10px] font-mono tabular-nums',
                      isActive ? 'bg-neutral-950/15 text-neutral-900' : 'bg-amber-500/15 text-amber-200',
                    )}
                  >
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Identity rows */}
      {activeSubTab === 'mapping' && (
      <div id="mpl-sub-mapping" role="tabpanel"><Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
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
              <Link href={expectedUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 break-all">
                {expectedUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </Link>
            }
          />
          {agentIdentityUri && agentIdentityUri !== expectedUrl && (
            <PropertyRow
              label="On-chain AgentIdentity URI"
              value={
                <Link href={agentIdentityUri} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 break-all">
                  {agentIdentityUri}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Link>
              }
            />
          )}
        </CardContent>
      </Card></div>
      )}

      {/* Canonical EIP-8004 Card — single source of truth served at
          /agents/<sapPda>/eip-8004.json. Same JSON third-party
          consumers receive (Metaplex, peer agents, indexers). */}
      {activeSubTab === 'card' && sapPda && (canonicalLoading || canonicalCard) && (
        <div id="mpl-sub-card" role="tabpanel"><Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
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
        </Card></div>
      )}

      {/* Registration */}
      {activeSubTab === 'registration' && registration && (
        <div id="mpl-sub-registration" role="tabpanel"><Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
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
        </Card></div>
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
      {activeSubTab === 'registry' && registry && (registryAgents.length > 0 || registry.error) && (
        <div id="mpl-sub-registry" role="tabpanel"><Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
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
        </Card></div>
      )}

      {/* Discovered AgentIdentity NFTs (foreign + canonical) */}
      {activeSubTab === 'nfts' && identityNfts.length > 0 && (
        <div id="mpl-sub-nfts" role="tabpanel"><Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
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
                    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2.5 py-1.5 text-xs">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-0.5">URI</div>
                      <Link
                        href={n.agentIdentityUri}
                        target="_blank"
                        rel="noreferrer"
                        title={n.agentIdentityUri}
                        className={cn(
                          'block truncate hover:underline',
                          isCanonical ? 'text-amber-400' : 'text-neutral-400',
                        )}
                      >
                        {n.agentIdentityUri}
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
        </Card></div>
      )}
    </div>
  );
}

type AgentLaunchToken = {
  mint: string;
  name: string;
  registryAgentMint: string;
};

type DexPairPayload = {
  pairAddress: string | null;
  dexId: string | null;
  url: string | null;
  priceUsd: string | null;
  priceNative: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  priceChange24h: number | null;
  fdv: number | null;
  marketCap: number | null;
};

type CurveHolder = {
  address: string;
  amount: number;
  percentage: number;
  rank: number;
};

type BondingCurvePayload = {
  mint: string;
  supply: number;
  decimals: number;
  /** 'spl-token' or 'token-2022' — detected server-side from mint owner. */
  tokenProgram?: 'spl-token' | 'token-2022';
  holders: CurveHolder[];
  topHolderPercent: number;
  top10Percent: number;
  top50Percent: number;
  holderCount: number;
};

function fmtCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

/* ── Agent Token card (Genesis layer) ──────────────
 * Compact, Metaplex-style summary of the agent's canonical Genesis
 * token. Lives in Section 2 (right column) and partitions cleanly from
 * Section 1's Identity layer (Core Asset / 014 Registry). Click → deep
 * Token Launch tab. Stays purely presentational — all validation already
 * happened server-side in /api/sap/agents/[wallet]/launch-tokens. */
function AgentTokenCard({
  token,
  extraCount,
  onOpenDetails,
  onCopy,
  copied,
}: {
  token: AgentLaunchTokenEntry;
  extraCount: number;
  onOpenDetails: () => void;
  onCopy: (addr: string) => void;
  copied: string | null;
}) {
  const statusTone =
    token.primaryLaunchStatus === 'live'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : token.primaryLaunchStatus === 'graduated'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : token.primaryLaunchStatus === 'upcoming'
          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
          : 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';

  // No Genesis launch → surface the token program as the badge instead
  // (e.g. Token-2022 / SPL Token) so the partition stays informative.
  const badgeLabel = token.primaryLaunchStatus
    ? token.primaryLaunchStatus.toUpperCase()
    : token.tokenProgram === 'token-2022'
      ? 'TOKEN-2022'
      : 'SPL TOKEN';

  return (
    <div className="mt-2 rounded-md border border-neutral-800/60 bg-neutral-950/40 p-3">
      <div className="flex items-start gap-3">
        <TokenAvatar src={token.image} symbol={token.symbol ?? token.name.slice(0, 3).toUpperCase()} size={44} title={token.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-neutral-100 truncate">{token.name}</span>
            {token.symbol && (
              <span className="text-[11px] font-mono text-neutral-400">{token.symbol}</span>
            )}
            <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide', statusTone)}>
              {badgeLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onCopy(token.mint)}
            aria-label={`Copy mint ${token.mint}`}
            className="mt-1 inline-flex items-center gap-1 rounded px-1 -mx-1 font-mono text-[11px] text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          >
            <span>{token.mint.slice(0, 6)}…{token.mint.slice(-6)}</span>
            <Copy className={cn('h-3 w-3', copied === token.mint ? 'text-emerald-400' : 'opacity-60')} />
          </button>
          {token.launchCount > 0 && (
            <p className="mt-1 text-[11px] text-neutral-500">
              {token.launchCount} Genesis launch{token.launchCount === 1 ? '' : 'es'} indexed
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDetails}
          className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded px-1 -mx-1"
        >
          Open token launch details <ChevronRight className="h-3 w-3" />
        </button>
        <div className="flex items-center gap-2">
          {token.launchCount > 0 && (
            <a
              href={`https://www.metaplex.com/agents/${encodeURIComponent(token.registryAgentMint)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200"
              title="Open on Metaplex Explorer"
            >
              <Globe className="h-3 w-3" /> Metaplex
            </a>
          )}
          <a
            href={`https://dexscreener.com/solana/${encodeURIComponent(token.mint)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200"
            title="Open on DexScreener"
          >
            <ExternalLink className="h-3 w-3" /> DexScreener
          </a>
        </div>
      </div>
      {extraCount > 0 && (
        <p className="mt-2 text-[10px] text-neutral-500">
          +{extraCount} additional token{extraCount === 1 ? '' : 's'} — see Token Launch tab
        </p>
      )}
    </div>
  );
}

/* ── Agent Token empty-state CTA ───────────────────
 * Rendered when the wallet has no Genesis launch yet. Two variants:
 *   - `dense` (Section 2 column slot): compact, single CTA row.
 *   - default (Token Launch tab body): roomier, with the Rocket icon
 *     centered above the headline so the empty state mirrors Metaplex
 *     Explorer's visual rhythm.
 *
 * Copy is intentionally English to match the rest of the explorer chrome
 * and points users at the canonical agent skills doc in the synapse-sap
 * SDK — that file is the source of truth for the launch flow. */
const SYNAPSE_SAP_SKILLS_URL =
  'https://github.com/oobe-protocol/synapse-sap-sdk/blob/main/skills/skills.md';

function AgentTokenEmptyCta({ dense = false }: { dense?: boolean }) {
  if (dense) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-neutral-700/70 bg-neutral-950/40 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
            <Rocket className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-neutral-200">
              No token launched yet
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
              Use the synapse-sap agent skills to launch a Metaplex Genesis token with your agent.
            </p>
            <a
              href={SYNAPSE_SAP_SKILLS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 rounded px-1 -mx-1 text-[11px] text-emerald-300 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            >
              Read the agent skills <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-neutral-700/70 bg-neutral-950/40 px-4 py-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
        <Rocket className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-neutral-100">
        No token launched yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-neutral-400">
        Use the{' '}
        <a
          href={SYNAPSE_SAP_SKILLS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-emerald-300 underline-offset-2 hover:underline"
        >
          synapse-sap agent skills
        </a>{' '}
        to create a token with your agent. The skills doc walks through
        Metaplex Genesis launch coordination (presale / bonding curve)
        and pins the resulting mint to the agent registry.
      </p>
      <a
        href={SYNAPSE_SAP_SKILLS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
      >
        Open agent skills.md <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function AgentTokenMarketSection({ tokens }: { tokens: AgentLaunchToken[] }) {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const [selectedMint, setSelectedMint] = useState(tokens[0]?.mint ?? '');
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketPair, setMarketPair] = useState<DexPairPayload | null>(null);
  const [curveLoading, setCurveLoading] = useState(false);
  const [curveError, setCurveError] = useState<string | null>(null);
  const [curveData, setCurveData] = useState<BondingCurvePayload | null>(null);
  const [genesisLoading, setGenesisLoading] = useState(false);
  const [genesisError, setGenesisError] = useState<string | null>(null);
  const [genesisTokenData, setGenesisTokenData] = useState<MetaplexGenesisTokenLaunchesPayload['token']>(null);
  const [genesisPrimaryLaunch, setGenesisPrimaryLaunch] = useState<MetaplexGenesisLaunch | null>(null);
  const [genesisOnchain, setGenesisOnchain] = useState<GenesisOnchainPayload | null>(null);
  const [genesisOnchainLoading, setGenesisOnchainLoading] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedMint && tokens.length > 0) {
      setSelectedMint(tokens[0].mint);
    }
  }, [selectedMint, tokens]);

  useEffect(() => {
    if (!selectedMint) return;

    const ac = new AbortController();
    setMarketLoading(true);
    setMarketError(null);

    fetch(`/api/market/dexscreener/${selectedMint}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Market API failed (${res.status})`);
        const json = await res.json() as { pair: DexPairPayload | null; error?: string };
        if (json.error) throw new Error(json.error);
        setMarketPair(json.pair ?? null);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setMarketError((err as Error).message);
        setMarketPair(null);
      })
      .finally(() => setMarketLoading(false));

    return () => ac.abort();
  }, [selectedMint]);

  useEffect(() => {
    if (!selectedMint) return;

    const ac = new AbortController();
    setGenesisLoading(true);
    setGenesisError(null);

    fetch(`/api/market/metaplex-genesis/${selectedMint}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Metaplex launch API failed (${res.status})`);
        const json = (await res.json()) as MetaplexGenesisTokenLaunchesPayload;
        if (json.error) throw new Error(json.error);
        setGenesisTokenData(json.token ?? null);
        setGenesisPrimaryLaunch(json.primaryLaunch ?? null);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setGenesisError((err as Error).message);
        setGenesisTokenData(null);
        setGenesisPrimaryLaunch(null);
      })
      .finally(() => setGenesisLoading(false));

    return () => ac.abort();
  }, [selectedMint]);

  // ── On-chain GenesisAccountV2 fetch ──────────────────────────────────
  // Triggered once the REST primary launch resolves. Surfaces the live
  // graduation/proceeds state that the read-only API does not expose.
  useEffect(() => {
    const address = genesisPrimaryLaunch?.genesisAddress;
    if (!address) {
      setGenesisOnchain(null);
      return;
    }
    const ac = new AbortController();
    setGenesisOnchainLoading(true);
    fetch(`/api/market/genesis-onchain/${address}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Genesis on-chain API failed (${res.status})`);
        const json = (await res.json()) as GenesisOnchainPayload;
        setGenesisOnchain(json);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setGenesisOnchain(null);
      })
      .finally(() => setGenesisOnchainLoading(false));

    return () => ac.abort();
  }, [genesisPrimaryLaunch?.genesisAddress]);

  useEffect(() => {
    if (!selectedMint) return;

    const ac = new AbortController();
    setCurveLoading(true);
    setCurveError(null);

    fetch(`/api/market/bonding-curve/${selectedMint}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Bonding curve API failed (${res.status})`);
        const json = (await res.json()) as { data: BondingCurvePayload | null; error?: string };
        if (json.error) throw new Error(json.error);
        setCurveData(json.data ?? null);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setCurveError((err as Error).message);
        setCurveData(null);
      })
      .finally(() => setCurveLoading(false));

    return () => ac.abort();
  }, [selectedMint]);

  useEffect(() => {
    let cancelled = false;
    const loadBalances = async () => {
      if (!publicKey || !selectedMint) {
        setSolBalance(null);
        setTokenBalance(null);
        return;
      }
      try {
        const [lamports, tokenAccounts] = await Promise.all([
          connection.getBalance(publicKey, 'confirmed'),
          connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(selectedMint) }, 'confirmed'),
        ]);
        if (cancelled) return;
        const parsedTotal = tokenAccounts.value.reduce((sum, acc) => {
          const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
          return sum + (typeof amount === 'number' ? amount : 0);
        }, 0);
        setSolBalance(lamports / LAMPORTS_PER_SOL);
        setTokenBalance(parsedTotal);
      } catch {
        if (cancelled) return;
        setSolBalance(null);
        setTokenBalance(null);
      }
    };
    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, selectedMint]);

  const selected = useMemo(
    () => tokens.find((t) => t.mint === selectedMint) ?? tokens[0],
    [selectedMint, tokens],
  );

  const buyUrl = selectedMint ? `https://jup.ag/swap/SOL-${selectedMint}` : null;
  const sellUrl = selectedMint ? `https://jup.ag/swap/${selectedMint}-SOL` : null;
  const chartUrl = marketPair?.pairAddress
    ? `https://dexscreener.com/solana/${marketPair.pairAddress}?embed=1&theme=dark&trades=0&info=0`
    : null;

  return (
    <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
      <CardHeader className="pb-3 px-5 pt-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-2 flex-wrap">
          <Coins className="h-3.5 w-3.5 text-emerald-400" />
          Agent Token Launches
          <InfoTip label={'Tradeable agent token coordinated through Metaplex Genesis (launchpool / presale / bonding curve). After graduation the supply migrates to a Raydium CPMM pool and is tradeable on Jupiter. Live market metrics come from DexScreener; on-chain holder distribution comes from Solana RPC.'} />
          <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-neutral-500 tabular-nums">
            {tokens.length} {tokens.length === 1 ? 'token' : 'tokens'}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-5 pb-4 pt-0 space-y-4">
        {tokens.length === 0 && (
          <AgentTokenEmptyCta />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {tokens.map((token) => (
            <Button
              key={token.mint}
              size="sm"
              variant={token.mint === selectedMint ? 'default' : 'outline'}
              onClick={() => setSelectedMint(token.mint)}
              className={cn(
                'h-8 rounded-md text-xs',
                token.mint === selectedMint
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30 hover:bg-emerald-500/30'
                  : 'border-neutral-700 text-neutral-300 hover:text-emerald-300 hover:border-emerald-400/30',
              )}
            >
              {token.name}
            </Button>
          ))}
        </div>

        {selected && (
          <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-3 text-xs space-y-1.5">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-neutral-600">Token mint ·</span>
              <Link
                href={`${SOLSCAN}/token/${selected.mint}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-emerald-300 hover:underline inline-flex items-center gap-1 break-all"
              >
                {selected.mint}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </Link>
              <Badge
                variant="outline"
                className="border-neutral-700 bg-neutral-900/60 text-[9px] uppercase tracking-wider text-neutral-400"
              >
                {/* Token program is detected server-side from the mint's
                 * owner program. Metaplex Genesis launches via Token-2022
                 * when extensions (transfer hook, metadata pointer) are
                 * required, otherwise the legacy SPL Token program. */}
                {curveData?.tokenProgram === 'token-2022'
                  ? 'Token-2022'
                  : curveData?.tokenProgram === 'spl-token'
                    ? 'SPL Token'
                    : 'Token'}
              </Badge>
            </div>

            <div className="pt-2 mt-2 border-t border-neutral-800/80 space-y-2">
              {/* ── METAPLEX GENESIS PANEL ─────────────────────────────────
                 Genesis is the launch coordinator (launchpool / presale /
                 bonding curve). Each token mint can have multiple historical
                 launches. We render the full set + base-token identity. */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-neutral-600">Metaplex Genesis ·</span>
                {genesisLoading ? (
                  <Badge variant="secondary" className="text-[10px]">Syncing…</Badge>
                ) : genesisPrimaryLaunch ? (
                  <>
                    <Badge
                      className={cn(
                        'text-[10px] uppercase tracking-wider border',
                        genesisPrimaryLaunch.status === 'live'
                          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                          : genesisPrimaryLaunch.status === 'graduated'
                            ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30'
                            : genesisPrimaryLaunch.status === 'upcoming'
                              ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                              : 'bg-neutral-800 text-neutral-300 border-neutral-700',
                      )}
                    >
                      {genesisPrimaryLaunch.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-neutral-700 text-neutral-300 font-mono">
                      {genesisPrimaryLaunch.type}
                    </Badge>
                    {genesisPrimaryLaunch.spotlight && (
                      <Badge className="text-[10px] bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30">
                        ★ spotlight
                      </Badge>
                    )}
                    {(genesisTokenData?.launches.length ?? 0) > 1 && (
                      <Badge variant="outline" className="text-[10px] border-neutral-700 text-neutral-400">
                        {genesisTokenData!.launches.length} launches
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-neutral-500">No launch indexed</span>
                )}
                {genesisError && <span className="text-amber-400">{genesisError}</span>}
              </div>

              {/* Base token identity from Genesis (canonical name/symbol/image) */}
              {genesisTokenData?.baseToken && (
                <div className="flex items-start gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-2.5">
                  {genesisTokenData.baseToken.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={genesisTokenData.baseToken.image}
                      alt={genesisTokenData.baseToken.name}
                      className="h-12 w-12 rounded-md object-cover border border-neutral-800 shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-neutral-100 truncate">
                        {genesisTokenData.baseToken.name}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-300">
                        ${genesisTokenData.baseToken.symbol}
                      </span>
                    </div>
                    {genesisTokenData.baseToken.description && (
                      <p className="text-[11px] text-neutral-400 line-clamp-2">
                        {genesisTokenData.baseToken.description}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* All launches for this mint (chronological — newest first) */}
              {genesisTokenData && genesisTokenData.launches.length > 0 && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950/40 overflow-hidden">
                  <div className="px-2.5 py-1.5 border-b border-neutral-800 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Launch Timeline
                  </div>
                  <div className="divide-y divide-neutral-800">
                    {genesisTokenData.launches.map((l) => {
                      const startMs = Date.parse(l.startTime);
                      const endMs = Date.parse(l.endTime);
                      const grad = l.graduatedAt ? Date.parse(l.graduatedAt) : null;
                      return (
                        <div key={l.genesisAddress} className="flex flex-col gap-1 px-2.5 py-2 text-[11px] sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <Badge
                              className={cn(
                                'text-[9px] uppercase tracking-wider border shrink-0',
                                l.status === 'live'
                                  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                                  : l.status === 'graduated'
                                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30'
                                    : l.status === 'upcoming'
                                      ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                                      : 'bg-neutral-800 text-neutral-300 border-neutral-700',
                              )}
                            >
                              {l.status}
                            </Badge>
                            <span className="font-mono text-neutral-300 shrink-0">{l.mechanic}</span>
                            <Link
                              href={`${SOLSCAN}/account/${l.genesisAddress}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-neutral-500 hover:text-emerald-300 hover:underline truncate"
                            >
                              {l.genesisAddress.slice(0, 8)}…{l.genesisAddress.slice(-4)}
                            </Link>
                          </div>
                          <div className="flex items-center gap-3 text-neutral-500 sm:justify-end shrink-0">
                            {!Number.isNaN(startMs) && (
                              <span title={`Start ${new Date(startMs).toISOString()}`}>
                                {new Date(startMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {!Number.isNaN(endMs) && (
                                  <> → {new Date(endMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                                )}
                              </span>
                            )}
                            {grad && (
                              <span className="text-cyan-300" title={`Graduated ${new Date(grad).toISOString()}`}>
                                graduated {new Date(grad).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            <Link
                              href={l.launchPage}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                            >
                              open <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* On-chain Genesis Account state — graduation progress, raised SOL,
                  finalized flag, bucket count. Fetched live from RPC. */}
              {(genesisOnchainLoading || genesisOnchain?.account) && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-2.5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-semibold">
                    On-chain state
                    {genesisOnchainLoading && (
                      <Badge variant="secondary" className="text-[9px]">Syncing…</Badge>
                    )}
                    {genesisOnchain?.account?.finalized != null && (
                      <Badge
                        className={cn(
                          'text-[9px] uppercase tracking-wider border',
                          genesisOnchain.account.finalized
                            ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                            : 'bg-amber-500/15 text-amber-200 border-amber-400/30',
                        )}
                      >
                        {genesisOnchain.account.finalized ? 'finalized' : 'configurable'}
                      </Badge>
                    )}
                  </div>
                  {genesisOnchain?.account && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5">
                          <div className="text-neutral-600">Raised</div>
                          <div className="font-mono text-emerald-300 tabular-nums">
                            {genesisOnchain.proceedsSol == null
                              ? '—'
                              : `${genesisOnchain.proceedsSol.toFixed(genesisOnchain.proceedsSol >= 100 ? 2 : 4)} SOL`}
                          </div>
                        </div>
                        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5">
                          <div className="text-neutral-600">Allocated</div>
                          <div className="font-mono text-neutral-200 tabular-nums">
                            {genesisOnchain.allocationProgress == null
                              ? '—'
                              : `${(genesisOnchain.allocationProgress * 100).toFixed(2)}%`}
                          </div>
                        </div>
                        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5">
                          <div className="text-neutral-600">Buckets</div>
                          <div className="font-mono text-neutral-200 tabular-nums">
                            {genesisOnchain.account.bucketCount}
                          </div>
                        </div>
                        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5">
                          <div className="text-neutral-600">Launch type</div>
                          <div className="font-mono text-neutral-200 tabular-nums" title="0 = Uninitialized · 3 = LaunchPoolV1">
                            {genesisOnchain.account.launchType}
                          </div>
                        </div>
                      </div>
                      {genesisOnchain.allocationProgress != null && (
                        <div className="space-y-1">
                          <div className="flex items-baseline justify-between text-[10px] text-neutral-500">
                            <span>Supply allocated to buckets</span>
                            <span className="font-mono text-neutral-300">
                              {(genesisOnchain.allocationProgress * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                              style={{ width: `${Math.min(genesisOnchain.allocationProgress * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="text-[10px] text-neutral-600 font-mono break-all">
                        authority · {genesisOnchain.account.authority}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Website + socials (from Genesis token metadata) */}
              {(genesisTokenData?.website || genesisTokenData?.socials?.x || genesisTokenData?.socials?.telegram || genesisTokenData?.socials?.discord) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-neutral-600">Links ·</span>
                  {genesisTokenData?.website && (
                    <Link href={genesisTokenData.website} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-emerald-300 hover:underline inline-flex items-center gap-1">
                      website <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {genesisTokenData?.socials?.x && (
                    <Link href={genesisTokenData.socials.x} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-emerald-300 hover:underline inline-flex items-center gap-1">
                      x <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {genesisTokenData?.socials?.telegram && (
                    <Link href={genesisTokenData.socials.telegram} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-emerald-300 hover:underline inline-flex items-center gap-1">
                      telegram <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {genesisTokenData?.socials?.discord && (
                    <Link href={genesisTokenData.socials.discord} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-emerald-300 hover:underline inline-flex items-center gap-1">
                      discord <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <WalletMultiButton className="!h-9 !rounded-md !bg-neutral-800 !text-neutral-100 hover:!bg-neutral-700 !border !border-neutral-700" />
          <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-neutral-600">SOL</span>
              <span className="font-mono text-neutral-200 tabular-nums">{connected ? (solBalance == null ? '—' : solBalance.toFixed(4)) : 'connect wallet'}</span>
            </span>
            <span className="text-neutral-700">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-neutral-600">Token</span>
              <span className="font-mono text-emerald-300 tabular-nums">{connected ? (tokenBalance == null ? '—' : tokenBalance.toFixed(4)) : 'connect wallet'}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Genesis launch CTA — primary when an active/upcoming launch exists */}
          {genesisPrimaryLaunch && (genesisPrimaryLaunch.status === 'live' || genesisPrimaryLaunch.status === 'upcoming') && (
            <Button asChild size="sm" className="h-9 bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-400/30 hover:bg-fuchsia-500/30">
              <Link href={genesisPrimaryLaunch.launchPage} target="_blank" rel="noreferrer">
                {genesisPrimaryLaunch.status === 'live' ? 'Participate on Metaplex' : 'View on Metaplex'}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          )}

          {/* Jupiter — only meaningful once a Raydium pool exists (graduated or DexScreener-listed) */}
          {(() => {
            const tradable = !!marketPair?.pairAddress || genesisPrimaryLaunch?.status === 'graduated';
            return (
              <>
                <Button
                  asChild={tradable}
                  size="sm"
                  disabled={!tradable}
                  className="h-9 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
                  title={tradable ? undefined : 'Available after Genesis graduation → Raydium CPMM pool'}
                >
                  {tradable ? (
                    <Link href={buyUrl ?? '#'} target="_blank" rel="noreferrer">Buy on Jupiter</Link>
                  ) : (
                    <span>Buy on Jupiter</span>
                  )}
                </Button>
                <Button
                  asChild={tradable}
                  size="sm"
                  variant="outline"
                  disabled={!tradable}
                  className="h-9 border-rose-400/30 text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                  title={tradable ? undefined : 'Available after Genesis graduation → Raydium CPMM pool'}
                >
                  {tradable ? (
                    <Link href={sellUrl ?? '#'} target="_blank" rel="noreferrer">Sell on Jupiter</Link>
                  ) : (
                    <span>Sell on Jupiter</span>
                  )}
                </Button>
              </>
            );
          })()}
        </div>

        {/* MARKET METRICS TAB */}
        <div className="border-t border-neutral-800 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Market Metrics</span>
            {marketError && <span className="text-xs text-amber-400">{marketError}</span>}
          </div>

          {marketLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">Price USD</div>
                <div className="font-mono text-neutral-100 text-sm">{marketPair?.priceUsd ? `$${marketPair.priceUsd}` : '—'}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">24h Change</div>
                <div className={cn('font-mono text-sm', (marketPair?.priceChange24h ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                  {marketPair?.priceChange24h == null ? '—' : `${marketPair.priceChange24h.toFixed(2)}%`}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">Liquidity</div>
                <div className="font-mono text-neutral-100 text-sm">{marketPair?.liquidityUsd == null ? '—' : `$${fmtCompact(marketPair.liquidityUsd)}`}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">24h Volume</div>
                <div className="font-mono text-neutral-100 text-sm">{marketPair?.volume24h == null ? '—' : `$${fmtCompact(marketPair.volume24h)}`}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">Market Cap</div>
                <div className="font-mono text-neutral-100 text-sm">{marketPair?.marketCap == null ? '—' : `$${fmtCompact(marketPair.marketCap)}`}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">FDV</div>
                <div className="font-mono text-neutral-100 text-sm">{marketPair?.fdv == null ? '—' : `$${fmtCompact(marketPair.fdv)}`}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">24h Buys</div>
                <div className="font-mono text-emerald-300 text-sm">{marketPair?.buys24h ?? '—'}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="text-neutral-600">24h Sells</div>
                <div className="font-mono text-rose-300 text-sm">{marketPair?.sells24h ?? '—'}</div>
              </div>
            </div>
          )}
        </div>

        {/* BONDING CURVE STATS */}
        <div className="border-t border-neutral-800 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">Holder Distribution</span>
            {curveError && <span className="text-xs text-amber-400">{curveError}</span>}
          </div>

          {curveLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-12" />
            </div>
          ) : curveData ? (
            <div className="space-y-3">
              {/* Holder Distribution Progress */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-neutral-600">Top Holder</span>
                  <span className="font-mono text-emerald-300">{curveData.topHolderPercent.toFixed(2)}%</span>
                </div>
                <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                    style={{ width: `${Math.min(curveData.topHolderPercent, 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                  <div className="text-neutral-600">Top 10 Holders</div>
                  <div className="font-mono text-emerald-300">{curveData.top10Percent.toFixed(2)}%</div>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                  <div className="text-neutral-600">Top 50 Holders</div>
                  <div className="font-mono text-emerald-300">{curveData.top50Percent.toFixed(2)}%</div>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                  <div className="text-neutral-600">Total Holders</div>
                  <div className="font-mono text-neutral-200">{curveData.holderCount}</div>
                </div>
              </div>

              {/* Top Holders Table */}
              {curveData.holders && curveData.holders.length > 0 && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950/30 overflow-hidden">
                  <div className="px-3 py-2 border-b border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-[0.1em]">
                    Top {Math.min(10, curveData.holders.length)} Holders
                  </div>
                  <div className="divide-y divide-neutral-800 max-h-48 overflow-y-auto">
                    {curveData.holders.slice(0, 10).map((holder: CurveHolder, idx: number) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-neutral-800/30 transition">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-neutral-600 w-6 text-right">#{holder.rank}</span>
                          <Link
                            href={`${SOLSCAN}/address/${holder.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-emerald-300 hover:underline truncate"
                          >
                            {holder.address.slice(0, 8)}…{holder.address.slice(-4)}
                          </Link>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-mono text-neutral-200 tabular-nums">{holder.percentage.toFixed(2)}%</div>
                          <div className="text-neutral-600 tabular-nums">{fmtCompact(holder.amount / Math.pow(10, curveData.decimals))} tokens</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-neutral-500 text-center py-4">
              No on-chain holder data available for this token mint.
            </div>
          )}
        </div>

        {/* CHART */}
        <div className="border-t border-neutral-800 pt-4 rounded-lg bg-neutral-950/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 text-xs">
            <span className="inline-flex items-center gap-1.5 text-neutral-300">
              <LineChart className="h-3.5 w-3.5 text-emerald-300" />
              Live Chart
            </span>
            {marketPair?.url && (
              <Link href={marketPair.url} target="_blank" rel="noreferrer" className="text-emerald-300 hover:underline inline-flex items-center gap-1">
                open on dexscreener
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {marketLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : chartUrl ? (
            <iframe
              title="DexScreener chart"
              src={chartUrl}
              className="h-[420px] w-full"
              loading="lazy"
            />
          ) : (
            <div className="h-[420px] w-full flex items-center justify-center text-xs text-neutral-500 px-6 text-center">
              Chart not available yet for this token pair.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
