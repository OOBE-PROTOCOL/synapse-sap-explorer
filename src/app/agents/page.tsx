/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import {
  useCallback,
  useMemo,
  useState,
  Suspense,
  type ReactNode,
} from "react";
import {
  Bot,
  Activity,
  BarChart3,
  LayoutGrid,
  LayoutList,
  ShieldCheck,
  Clock,
  Store,
  TrendingUp,
  Badge,
  X,
} from "lucide-react";
import {
  EmptyState,
  Skeleton,
  ExplorerPagination,
  usePagination,
  ExplorerPageShell,
  ExplorerFilterBar,
  VolumeMetricCard,
} from "~/components/ui";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  useEnrichedAgents,
  useEscrows,
  type AgentBalanceSummary,
  type EnrichedAgent,
  type AgentStakeSummary,
} from "~/hooks/use-sap";
import { useAggregatedReputationBatch } from "~/hooks/use-aggregated-reputation";
import {
  AgentCard as DirectoryAgentCard,
  AgentListRow as DirectoryAgentListRow,
  type AgentCommerceVolume,
} from "~/components/agents/agent-card";
import { useQueryState, QueryParam } from "~/hooks/use-query-state";
import { asPublicKeyText, asText, fmtNum } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { FilterChip } from "~/components/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";

/* ═══════════════════════════════════════════════════════
   Health derivation
   ═══════════════════════════════════════════════════════ */

type HealthLevel =
  | "excellent"
  | "good"
  | "untested"
  | "degraded"
  | "critical"
  | "offline";
type CardData = EnrichedAgent & {
  health: { level: HealthLevel; score: number };
};

function deriveHealth(agent: EnrichedAgent): {
  level: HealthLevel;
  score: number;
} {
  const id = agent.agent.identity;
  if (!id?.isActive) return { level: "offline", score: 0 };

  const feedbacks = Number(id.totalFeedbacks ?? 0);
  const rep = Number(id.reputationScore ?? 0);
  let score = 30;

  if (feedbacks === 0) score += 15;
  else score += Math.min(rep / 10000, 1) * 30;

  const uptime = Number(id.uptimePercent ?? 0);
  score += (uptime / 100) * 20;

  const latency = Number(id.avgLatencyMs ?? 0);
  if (latency === 0) score += 10;
  else if (latency < 500) score += 20;
  else if (latency < 2000) score += 15;
  else if (latency < 5000) score += 10;
  else score += 5;

  const level: HealthLevel =
    feedbacks === 0
      ? "untested"
      : score >= 85
        ? "excellent"
        : score >= 65
          ? "good"
          : score >= 40
            ? "degraded"
            : "critical";

  return { level, score: Math.round(score) };
}

const MLP_LOGO = "https://pbs.twimg.com/profile_images/2054187326415220736/kjHxRctc_400x400.jpg"

/* ═══════════════════════════════════════════════════════
   Micro helpers
   ═══════════════════════════════════════════════════════ */

const SORT_OPTIONS = [
  { value: "activity", label: "Usage" },
  { value: "health", label: "Health" },
  { value: "reputation", label: "Reputation" },
  { value: "balance", label: "Balance" },
  { value: "staking", label: "Staking" },
  { value: "capabilities", label: "Capabilities" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

function lamportsToSolValue(raw: unknown): number {
  if (typeof raw === "string") return Number(raw) / 1e9;
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value / 1e9 : 0;
}

function rawUsdcToValue(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value / 1e6 : 0;
}

function fmtUsdcCompact(rawAmount: unknown): string {
  const usdc = rawUsdcToValue(rawAmount);
  if (usdc >= 1_000_000) return `${formatNumber(usdc / 1_000_000, 2)}M USDC`;
  if (usdc >= 1_000) return `${formatNumber(usdc / 1_000, 2)}K USDC`;
  if (usdc >= 100) return `${formatNumber(usdc, 2)} USDC`;
  if (usdc >= 1) return `${formatNumber(usdc, 3)} USDC`;
  if (usdc >= 0.01) return `${formatNumber(usdc, 4)} USDC`;
  if (usdc > 0) return `${formatNumber(usdc, 6)} USDC`;
  return "0 USDC";
}

function fmtSolCompact(rawLamports: unknown): string {
  const sol = lamportsToSolValue(rawLamports);
  if (sol >= 1_000) return `${formatNumber(sol / 1_000, 2)}K SOL`;
  if (sol >= 100) return `${formatNumber(sol, 2)} SOL`;
  if (sol >= 1) return `${formatNumber(sol, 4)} SOL`;
  if (sol >= 0.01) return `${formatNumber(sol, 4)} SOL`;
  if (sol >= 0.0001) return `${formatNumber(sol, 6)} SOL`;
  if (sol > 0) return `${formatNumber(sol, 8)} SOL`;
  return "0 SOL";
}

function formatNumber(value: number, maxFractionDigits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function fmtUsd(value: number): string {
  const abs = Math.abs(value);
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    maximumFractionDigits: abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6,
  })} USD`;
}

function fmtUsdApprox(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "~$0";
  const abs = Math.abs(value);
  return `~$${value.toLocaleString("en-US", {
    minimumFractionDigits: abs >= 100 ? 0 : 2,
    maximumFractionDigits: abs >= 100 ? 0 : 2,
  })}`;
}

function formatSettlementAssets(solRaw: number, usdcRaw: number): string {
  const parts: string[] = [];
  if (solRaw > 0) parts.push(fmtSolCompact(solRaw));
  if (usdcRaw > 0) parts.push(fmtUsdcCompact(usdcRaw));
  return parts.length > 0 ? parts.join(" + ") : "0 SOL";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function lamportsToUsdValue(rawLamports: unknown, solPrice: number): number {
  const sol = lamportsToSolValue(rawLamports);
  return sol * solPrice;
}

function getToolsCount(agent: EnrichedAgent): number {
  return (
    (agent as { onChainToolCount?: number }).onChainToolCount ??
    agent.metadata?.tools?.length ??
    0
  );
}

function getCalls7d(agent: EnrichedAgent): number {
  return Number(agent.revenue?.calls7d ?? agent.revenue?.totalCalls ?? 0);
}

function volumeLamports(agent: EnrichedAgent): number {
  return Math.max(
    Number(agent.revenue?.volume24hLamports ?? 0),
    Number(agent.revenue?.volume7dLamports ?? 0),
    Number(agent.revenue?.totalSettledLamports ?? 0),
  );
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function settlementTokenKind(
  tokenMint: string,
  decimals: number,
): "SOL" | "USDC" {
  if (tokenMint === USDC_MINT || decimals === 6) return "USDC";
  if (!tokenMint || tokenMint === SOL_MINT) return "SOL";
  return "SOL";
}

function activityScore(agent: CardData): number {
  const tools = getToolsCount(agent);
  const volume = Math.max(
    lamportsToSolValue(agent.revenue?.volume7dLamports),
    lamportsToSolValue(agent.revenue?.totalSettledLamports),
  );
  const calls7d = getCalls7d(agent);
  const totalCalls = Number(agent.agent.identity?.totalCallsServed ?? 0);
  const caps = agent.agent.identity?.capabilities.length ?? 0;
  return (
    (tools > 0 ? 1_000_000_000 : 0) +
    tools * 10_000_000 +
    volume * 100_000 +
    calls7d * 1_000 +
    totalCalls +
    caps * 25 +
    (hasMetaplexSignal(agent) ? 15 : 0) +
    agent.health.score
  );
}

function hasMetaplexSignal(agent: EnrichedAgent): boolean {
  const m = (
    agent as { metaplex?: import("~/hooks/use-sap").AgentMetaplexBadge | null }
  ).metaplex;
  const logos = (
    agent as {
      logos?: { mplAsset?: string | null; mplImage?: string | null } | null;
    }
  ).logos;
  const agentUri = asText(agent.agent.identity?.agentUri).toLowerCase();
  const metadataText = agent.metadata
    ? JSON.stringify(agent.metadata).toLowerCase()
    : "";
  return Boolean(
    m?.linked ||
    (m?.pluginCount ?? 0) > 0 ||
    (m?.registryCount ?? 0) > 0 ||
    logos?.mplAsset ||
    logos?.mplImage ||
    agentUri.includes("metaplex") ||
    metadataText.includes("metaplex"),
  );
}

/* ═══════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════ */

export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsSkeleton />}>
      <AgentsInner />
    </Suspense>
  );
}

function DirectoryMetricCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string | JSX.Element;
  tone?: "default" | "success";
}) {
  return (
    <Card className="rounded-xl min-h-[180px] relative border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 truncate font-mono text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            tone === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-primary/20 bg-primary/10 text-primary",
          )}
        >
          {icon}
        </div>
      </div>
      <div className=" absolute right-4 bottom-4 text-xs text-muted-foreground">
        {sub}
      </div>
    </Card>
  );
}

function AgentsInner() {
  const [search, setSearch] = useQueryState("q", "", QueryParam.string);
  const [sortBy, setSortBy] = useQueryState(
    "sort",
    "activity",
    QueryParam.enum("activity", [
      "activity",
      "health",
      "reputation",
      "balance",
      "staking",
      "capabilities",
      "newest",
      "oldest",
    ] as const),
  );
  const [activeOnly, setActiveOnly] = useQueryState("active", true, {
    parse: (raw) => (raw == null ? true : raw !== "0" && raw !== "false"),
    serialize: (v) => (v ? null : "0"),
  });
  const [mplOnly, setMplOnly] = useQueryState(
    "metaplex",
    false,
    QueryParam.bool,
  );
  const [recentOnly, setRecentOnly] = useQueryState(
    "recent",
    false,
    QueryParam.bool,
  );
  const [merchantOnly, setMerchantOnly] = useQueryState(
    "merchant",
    false,
    QueryParam.bool,
  );
  const [volumeSort, setVolumeSort] = useQueryState<"desc" | "asc" | null>(
    "volume",
    null,
    {
      parse: (raw) => (raw === "desc" || raw === "asc" ? raw : null),
      serialize: (v) => v,
    },
  );
  const [view, setView] = useQueryState(
    "view",
    "grid",
    QueryParam.enum("grid", ["grid", "list"] as const),
  );

  const { data, loading, error } = useEnrichedAgents();
  const { data: escrowData } = useEscrows();
  const agents = useMemo(() => data?.agents ?? [], [data]);
  const [balanceOverrides, setBalanceOverrides] = useState<
    Record<string, AgentBalanceSummary>
  >({});
  const handleBalanceResolved = useCallback(
    (wallet: string, balances: AgentBalanceSummary) => {
      setBalanceOverrides((prev) => {
        const current = prev[wallet];
        if (
          current &&
          current.sol === balances.sol &&
          current.usdc === balances.usdc &&
          current.solUsd === balances.solUsd &&
          current.tokens.length === balances.tokens.length
        ) {
          return prev;
        }
        return { ...prev, [wallet]: balances };
      });
    },
    [],
  );

  const enriched = useMemo(
    () => agents.map((a) => ({ ...a, health: deriveHealth(a) })),
    [agents],
  );

  const filtered = useMemo(() => {
    let list = enriched;
    if (activeOnly) list = list.filter((a) => a.agent.identity?.isActive);
    if (mplOnly) {
      list = list.filter(hasMetaplexSignal);
    }
    if (recentOnly) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((a) => {
        const raw = a.agent.identity?.createdAt;
        if (!raw) return false;
        const n = Number(raw);
        const ms = n > 1e12 ? n : n * 1000;
        return ms >= cutoff;
      });
    }
    if (merchantOnly) {
      list = list.filter((a) => getToolsCount(a) > 0);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        const id = a.agent.identity;
        if (!id) return false;
        const pda = asPublicKeyText(a.agent.pda).toLowerCase();
        const wallet = asPublicKeyText(id.wallet).toLowerCase();
        return (
          id.name.toLowerCase().includes(q) ||
          id.description.toLowerCase().includes(q) ||
          pda.includes(q) ||
          wallet.includes(q)
        );
      });
    }
    return list;
  }, [enriched, search, activeOnly, mplOnly, recentOnly, merchantOnly]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const parseTs = (raw: string | null | undefined): number => {
      if (!raw) return 0;
      const n = Number(raw);
      return n > 1e12 ? n : n * 1000;
    };
    const balanceSol = (agent: CardData) => {
      const wallet = asPublicKeyText(agent.agent.identity?.wallet);
      return balanceOverrides[wallet]?.sol ?? agent.balances?.sol ?? 0;
    };

    if (volumeSort) {
      return copy.sort((a, b) => {
        const byVolume =
          volumeSort === "desc"
            ? volumeLamports(b) - volumeLamports(a)
            : volumeLamports(a) - volumeLamports(b);
        return byVolume || activityScore(b) - activityScore(a);
      });
    }

    switch (sortBy) {
      case "activity":
        return copy.sort((a, b) => activityScore(b) - activityScore(a));
      case "health":
        return copy.sort((a, b) => b.health.score - a.health.score);
      case "reputation":
        return copy.sort(
          (a, b) =>
            (b.agent.identity?.reputationScore ?? 0) -
            (a.agent.identity?.reputationScore ?? 0),
        );
      case "balance":
        return copy.sort((a, b) => balanceSol(b) - balanceSol(a));
      case "staking":
        return copy.sort(
          (a, b) =>
            ((b as CardData & { staking?: AgentStakeSummary | null }).staking
              ?.stakedSol ?? 0) -
            ((a as CardData & { staking?: AgentStakeSummary | null }).staking
              ?.stakedSol ?? 0),
        );
      case "capabilities":
        return copy.sort(
          (a, b) =>
            (b.agent.identity?.capabilities.length ?? 0) -
            (a.agent.identity?.capabilities.length ?? 0),
        );
      case "newest":
        return copy.sort(
          (a, b) =>
            parseTs(b.agent.identity?.createdAt) -
            parseTs(a.agent.identity?.createdAt),
        );
      case "oldest":
        return copy.sort(
          (a, b) =>
            parseTs(a.agent.identity?.createdAt) -
            parseTs(b.agent.identity?.createdAt),
        );
      default:
        return copy;
    }
  }, [balanceOverrides, filtered, sortBy, volumeSort]);

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(
    sorted.length,
    6,
  );
  const paginated = useMemo(() => paginate(sorted), [paginate, sorted]);

  // ── Batch FairScale × SAP reputation for visible wallets only ──
  const visibleWallets = useMemo(
    () =>
      paginated
        .map((p) => p.agent.identity?.wallet)
        .map(asPublicKeyText)
        .filter((w) => w.length > 0),
    [paginated],
  );
  const { byWallet: reputationByWallet } =
    useAggregatedReputationBatch(visibleWallets);

  const commerceVolumeByAgent = useMemo(() => {
    const map = new Map<string, AgentCommerceVolume>();
    for (const escrow of (escrowData?.escrows ?? []) as Array<{
      agent?: unknown;
      tokenMint?: unknown;
      tokenDecimals?: unknown;
      totalSettled?: unknown;
      totalCallsSettled?: unknown;
      pda?: unknown;
    }>) {
      const agentPda = asPublicKeyText(escrow.agent);
      if (!agentPda) continue;
      const tokenMint = asPublicKeyText(escrow.tokenMint);
      const decimals = Number(
        escrow.tokenDecimals ?? (tokenMint === USDC_MINT ? 6 : 9),
      );
      const rawSettled = Number(escrow.totalSettled ?? 0);
      const calls = Number(escrow.totalCallsSettled ?? 0);
      const current = map.get(agentPda) ?? {
        solRaw: 0,
        usdcRaw: 0,
        calls: 0,
        escrows: 0,
      };
      if (settlementTokenKind(tokenMint, decimals) === "USDC")
        current.usdcRaw += rawSettled;
      else current.solRaw += rawSettled;
      current.calls += Number.isFinite(calls) ? calls : 0;
      current.escrows += 1;
      map.set(agentPda, current);
    }
    return map;
  }, [escrowData?.escrows]);

  const stats = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((a) => a.agent.identity?.isActive).length;
    const avgHealth =
      enriched.length > 0
        ? Math.round(
            enriched.reduce((s, a) => s + a.health.score, 0) / enriched.length,
          )
        : 0;
    const excellent = enriched.filter(
      (a) => a.health.level === "excellent",
    ).length;
    const mpl = enriched.filter(hasMetaplexSignal).length;
    const merchants = enriched.filter((a) => getToolsCount(a) > 0).length;

    // Use the same current-volume source as the dashboard cards: 24h, then 7d, then settled total.
    const fallbackUsdcRaw = enriched.reduce((sum, agent) => {
      return sum + volumeLamports(agent);
    }, 0);
    const commerceTotals = Array.from(commerceVolumeByAgent.values()).reduce(
      (acc, item) => {
        acc.usdcRaw += item.usdcRaw;
        acc.solRaw += item.solRaw;
        acc.calls += item.calls;
        return acc;
      },
      { usdcRaw: 0, solRaw: 0, calls: 0 },
    );

    // Calculate SOL price from first agent with revenue data (or use default)
    const solPrice = data?.solPrice ?? 0;
    const hasCommerceVolume =
      commerceTotals.usdcRaw > 0 || commerceTotals.solRaw > 0;
    const totalVolumeUsdcRaw = hasCommerceVolume ? commerceTotals.usdcRaw : 0;
    const totalVolumeSolRaw = hasCommerceVolume
      ? commerceTotals.solRaw
      : fallbackUsdcRaw;
    const totalVolumeUsd =
      lamportsToSolValue(totalVolumeSolRaw) * solPrice +
      rawUsdcToValue(totalVolumeUsdcRaw);
    const totalCalls =
      commerceTotals.calls > 0
        ? commerceTotals.calls
        : enriched.reduce(
            (sum, agent) => sum + Number(agent.revenue?.totalCalls ?? 0),
            0,
          );
    const depositedTotals = (
      (escrowData?.escrows ?? []) as Array<{
        tokenMint?: unknown;
        tokenDecimals?: unknown;
        totalDeposited?: unknown;
      }>
    ).reduce(
      (acc, escrow) => {
        const tokenMint = asPublicKeyText(escrow.tokenMint);
        const decimals = Number(
          escrow.tokenDecimals ?? (tokenMint === USDC_MINT ? 6 : 9),
        );
        const rawDeposited = Number(escrow.totalDeposited ?? 0);
        if (!Number.isFinite(rawDeposited) || rawDeposited <= 0) return acc;
        if (settlementTokenKind(tokenMint, decimals) === "USDC")
          acc.usdcRaw += rawDeposited;
        else acc.solRaw += rawDeposited;
        return acc;
      },
      { solRaw: 0, usdcRaw: 0 },
    );
    const depositedUsd =
      lamportsToSolValue(depositedTotals.solRaw) * solPrice +
      rawUsdcToValue(depositedTotals.usdcRaw);
    const utilization =
      depositedUsd > 0
        ? Math.min((totalVolumeUsd / depositedUsd) * 100, 100)
        : null;

    return {
      total,
      active,
      avgHealth,
      excellent,
      mpl,
      merchants,
      totalVolumeUsdcRaw,
      totalVolumeSolRaw,
      totalVolumeUsd,
      totalCalls,
      solPrice,
      utilization,
    };
  }, [
    agents,
    commerceVolumeByAgent,
    enriched,
    data?.solPrice,
    escrowData?.escrows,
  ]);

  const mplCount = stats.mpl;

  const isMobile = window.innerWidth < 280;

  const filterChips: FilterChip[] = [];
  if (activeOnly)
    filterChips.push({
      key: "active",
      label: "Active only",
      value: "true",
      onClear: () => setActiveOnly(false),
    });
  if (mplOnly)
    filterChips.push({
      key: "mpl",
      label: "Metaplex",
      value: "on",
      onClear: () => setMplOnly(false),
    });
  if (recentOnly)
    filterChips.push({
      key: "recent",
      label: "Recently added",
      value: "on",
      onClear: () => setRecentOnly(false),
    });
  if (merchantOnly)
    filterChips.push({
      key: "merchant",
      label: "Merchant only",
      value: "on",
      onClear: () => setMerchantOnly(false),
    });
  if (volumeSort)
    filterChips.push({
      key: "volume",
      label: `Volume ${volumeSort === "desc" ? "↓" : "↑"}`,
      value: volumeSort,
      onClear: () => setVolumeSort(null),
    });
  if (sortBy !== "activity")
    filterChips.push({
      key: "sort",
      label: "Sort",
      value: SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy,
      onClear: () => setSortBy("activity"),
    });

  return (
    <ExplorerPageShell
      title="Agent Directory"
      subtitle={`${data?.total ?? "..."} agents registered on the Synapse Agent Protocol. Live registry, merchant activity, balances, and immutable settlement history in one view.`}
      icon={<Bot className="h-5 w-5" />}
      stats={
        <>
          <DirectoryMetricCard
            icon={<Bot className="h-4 w-4" aria-hidden="true" />}
            label="Total agents"
            value={loading ? "..." : fmtNum(stats.total)}
            sub={<AvatarGroup>
              {
                enriched.filter((agent) => !!agent.logos?.mplImage || !!agent.logos?.mplAsset).slice(0,5).map((agent) => {
                  return (
                    <Avatar key={agent.agent.pda} className="h-8 w-8">
                      <AvatarImage
                        src={
                          agent.logos?.mplImage ??
                          agent.logos?.mplAsset ??
                          undefined
                        }
                        alt={agent.agent.identity?.name ?? "Agent logo"}
                      />
                      <AvatarFallback>
                        {agent.agent.identity?.name
                          ? agent.agent.identity.name[0]
                          : "?"}
                      </AvatarFallback>
                      
                    </Avatar>
                  );
                })
              }
              <AvatarGroupCount>
                +{enriched.length - 4}
              </AvatarGroupCount>
            </AvatarGroup>}
          />
          <DirectoryMetricCard
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            label="Active agents"
            value={loading ? "..." : fmtNum(stats.active)}
            sub={<span> <span className="text-lg text-white font-bold">{stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%</span> online</span>}
            tone="success"
          />
          <VolumeMetricCard
            icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
            value={
              loading
                ? "..."
                : formatSettlementAssets(
                    stats.totalVolumeSolRaw,
                    stats.totalVolumeUsdcRaw,
                  )
            }
            fiatValue={
              stats.solPrice > 0 ? fmtUsdApprox(stats.totalVolumeUsd) : null
            }
            calls={fmtNum(stats.totalCalls)}
            utilization={stats.utilization}
            loading={loading}
          />
          <DirectoryMetricCard
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            label="Avg health"
            value={loading ? "..." : `${stats.avgHealth}%`}
            sub={ <span><span className="text-lg text-white font-bold">{fmtNum(stats.mpl)}</span> MPL x SAP</span> }
          />
        </>
      }
      actions={isMobile ? <></> : 
        
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
          <button
            onClick={() => setView("grid")}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              view === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              view === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label="List view"
          >
            <LayoutList className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        
      }
    >
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name, PDA, or wallet..."
        sort={{
          value: sortBy,
          options: SORT_OPTIONS,
          onChange: (v) => setSortBy(v as typeof sortBy),
        }}
        filters={filterChips}
      >
        <Button
          variant={activeOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveOnly(!activeOnly)}
        >
          {activeOnly ? "Active only" : "All agents"}
        </Button>
        <Button
          variant={mplOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setMplOnly(!mplOnly)}
          disabled={mplCount === 0}
          className={cn(
            mplOnly
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
          )}
          title={
            mplCount === 0
              ? "No Metaplex-coordinated agents discovered yet"
              : `${mplCount} of ${stats.total} SAP agents have a Metaplex signal`
          }
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          MPL × SAP
          <span className="ml-1.5 tabular-nums opacity-80">
            {mplCount}/{stats.total}
          </span>
        </Button>
        <Button
          variant={recentOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setRecentOnly(!recentOnly);
            if (!recentOnly) setSortBy("newest");
            else setSortBy("activity");
          }}
          className={cn(
            recentOnly
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border text-foreground hover:bg-accent",
          )}
          title="Show agents registered in the last 30 days"
        >
          <Clock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Recently Added
        </Button>
        <Button
          variant={merchantOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setMerchantOnly(!merchantOnly)}
          className={cn(
            merchantOnly
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
          )}
          title="Show only agents with published tools (merchants)"
        >
          <Store className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Merchants Only
        </Button>
        <Button
          variant={volumeSort ? "default" : "outline"}
          size="sm"
          onClick={() =>
            setVolumeSort(
              volumeSort === "desc"
                ? "asc"
                : volumeSort === "asc"
                  ? null
                  : "desc",
            )
          }
          className={cn(
            volumeSort
              ? "border-emerald-500 bg-emerald-600 text-primary-foreground hover:bg-emerald-700"
              : "border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
          )}
          title="Sort by 24h volume"
        >
          <TrendingUp className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Volume{" "}
          {volumeSort === "desc" ? "↓" : volumeSort === "asc" ? "↑" : "↓↑"}
        </Button>
      </ExplorerFilterBar>

      {loading ? (
        <AgentsSkeleton />
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            search
              ? "No agents match your search"
              : "No agents discovered on-chain"
          }
        />
      ) : (
        <>
          {view === "grid" ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {paginated.map((item, i) => (
                <DirectoryAgentCard
                  key={
                    asPublicKeyText(item.agent.pda) ||
                    asPublicKeyText(item.agent.identity?.wallet) ||
                    i
                  }
                  data={item}
                  solPrice={data?.solPrice ?? null}
                  commerceVolume={
                    commerceVolumeByAgent.get(
                      asPublicKeyText(item.agent.pda),
                    ) ?? null
                  }
                  reputation={
                    item.agent.identity?.wallet
                      ? (reputationByWallet.get(
                          asPublicKeyText(item.agent.identity.wallet),
                        ) ?? null)
                      : null
                  }
                  onBalanceResolved={handleBalanceResolved}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {paginated.map((item, i) => (
                <DirectoryAgentListRow
                  key={
                    asPublicKeyText(item.agent.pda) ||
                    asPublicKeyText(item.agent.identity?.wallet) ||
                    i
                  }
                  data={item}
                  solPrice={data?.solPrice ?? null}
                  commerceVolume={
                    commerceVolumeByAgent.get(
                      asPublicKeyText(item.agent.pda),
                    ) ?? null
                  }
                  index={(page - 1) * perPage + i + 1}
                  reputation={
                    item.agent.identity?.wallet
                      ? (reputationByWallet.get(
                          asPublicKeyText(item.agent.identity.wallet),
                        ) ?? null)
                      : null
                  }
                  onBalanceResolved={handleBalanceResolved}
                />
              ))}
            </div>
          )}
          <ExplorerPagination
            page={page}
            total={sorted.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            perPageOptions={[12, 24, 48, 96]}
            className="mt-6"
          />
        </>
      )}
    </ExplorerPageShell>
  );
}

/* ═══════════════════════════════════════════════════════
   Skeleton
   ═══════════════════════════════════════════════════════ */

function AgentsSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
