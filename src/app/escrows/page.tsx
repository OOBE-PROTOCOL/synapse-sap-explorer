"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Wallet,
  CreditCard,
  Clock,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  PlusCircle,
  History,
  CircleDollarSign,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  asText,
  entityPath,
  fmtNum,
  formatTokenAmount,
  short,
} from "~/lib/format";
import {
  Skeleton,
  EmptyState,
  Address,
  ExplorerPagination,
  usePagination,
  ExplorerPageShell,
  ExplorerMetric,
  ExplorerFilterBar,
  VolumeMetricCard,
  AgentAvatar,
} from "~/components/ui";
import { useQueryState, QueryParam } from "~/hooks/use-query-state";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  useEscrows,
  useAgents,
  useEscrowEvents,
  useTokenMetadata,
  useEnrichedAgents,
} from "~/hooks/use-sap";
import { useAgentMapCtx } from "~/providers/sap-data-provider";
import Image from "next/image";
import { AgentTag } from "~/components/ui/agent-tag";

type AgentVisual = {
  name: string;
  wallet: string;
  pda: string;
  endpoint: string | null;
  logo: string | null;
  mplImage: string | null;
  onMetaplex: boolean;
};

type AgentVisualMap = Record<string, AgentVisual>;

/* ── Escrow status derivation ────────────────── */

type EscrowData = {
  pda: string;
  agent: string;
  agentName: string | null;
  depositor: string;
  balance: number | string;
  totalDeposited: number | string;
  totalSettled: number | string;
  totalCallsSettled: number | string;
  maxCalls: number | string;
  pricePerCall: number | string;
  expiresAt: string | number | null;
  closedAt: string | null;
  status: string;
  tokenMint: string | null;
  tokenDecimals: number | null;
  volumeCurve: Array<{ label: string; value: number }> | null;
};

type EscrowEvent = {
  id: string;
  escrowPda: string;
  eventType: string;
  txSignature: string;
  blockTime: number | string | null;
  signer: string | null;
  amountChanged: number | string | null;
  callsSettled: number | string | null;
};

type EscrowStatus =
  | "active"
  | "closed"
  | "depleted"
  | "expired"
  | "settled"
  | "unfunded";
type EnrichedEscrow = Omit<EscrowData, "status"> & {
  status: EscrowStatus;
  eventCount: number;
};

const STATUS_CONFIG: Record<
  EscrowStatus,
  { label: string; className: string; dot: string }
> = {
  active: {
    label: "Active",
    className:
      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  closed: {
    label: "Closed",
    className: "bg-neutral-800 text-neutral-400 border border-neutral-700",
    dot: "bg-neutral-500",
  },
  depleted: {
    label: "Depleted",
    className: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
    dot: "bg-amber-400",
  },
  expired: {
    label: "Expired",
    className: "bg-red-500/15 text-red-400 border border-red-500/20",
    dot: "bg-red-400",
  },
  settled: {
    label: "Fully Settled",
    className: "bg-primary/15 text-primary border border-primary/20",
    dot: "bg-primary",
  },
  unfunded: {
    label: "Unfunded",
    className: "bg-neutral-800 text-neutral-500 border border-neutral-700",
    dot: "bg-neutral-600",
  },
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function tokenSymbol(
  mint: string | null,
  decimals: number | null,
  meta?: { symbol?: string } | null,
): string {
  if (!mint || mint === SOL_MINT) return "SOL";
  if (mint === USDC_MINT || decimals === 6) return "USDC";
  return meta?.symbol || short(mint, 4, 4);
}

function inferTokenDecimals({
  mint,
  declaredDecimals,
  symbol,
}: {
  mint: string | null;
  declaredDecimals: number | string | null | undefined;
  symbol?: string | null;
}): number {
  if (!mint || mint === SOL_MINT) return 9;
  if (mint === USDC_MINT || symbol?.toUpperCase() === "USDC") return 6;
  const declared = Number(declaredDecimals);
  if (Number.isInteger(declared) && declared >= 0 && declared <= 18)
    return declared;
  return 9;
}

// function formatTokenValue(
//   raw: number | string,
//   decimals: number | null,
//   symbol: string,
// ): string {
//   return `${formatTokenAmount(Number(raw ?? 0), decimals ?? (symbol === "USDC" ? 6 : 9))} ${symbol}`;
// }

function formatSignedTokenValue(
  raw: number | string | null | undefined,
  decimals: number,
  symbol: string,
): string {
  const value = Number(raw ?? 0);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatTokenAmount(Math.abs(value), decimals)} ${symbol}`;
}

function compactTokenValue(
  raw: number,
  decimals: number,
  symbol: string,
): string {
  const value = raw / 10 ** decimals;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ${symbol}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K ${symbol}`;
  if (value >= 100) return `${value.toFixed(2)} ${symbol}`;
  if (value >= 1) return `${value.toFixed(3)} ${symbol}`;
  if (value > 0)
    return `${value.toFixed(Math.min(decimals, 6)).replace(/0+$/, "").replace(/\.$/, "")} ${symbol}`;
  return `0 ${symbol}`;
}

function fmtUsdApprox(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "~$0";
  return `~$${value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function deriveStatus(escrow: EscrowData): EscrowStatus {
  // If the DB/API already reports a status, respect it
  if (escrow.status === "closed") return "closed";
  // closedAt being set is a reliable secondary signal (escrow was closed on-chain)
  if (escrow.closedAt) return "closed";

  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const maxCalls = Number(escrow.maxCalls);
  const callsSettled = Number(escrow.totalCallsSettled);

  // Parse expiry: handle ISO strings or unix timestamps
  let expiryMs = 0;
  if (escrow.expiresAt && escrow.expiresAt !== "0") {
    const raw = escrow.expiresAt;
    const asNum = Number(raw);
    expiryMs =
      asNum > 1e12
        ? asNum
        : asNum > 0
          ? asNum * 1000
          : new Date(raw as string | number).getTime();
  }
  const isExpired = expiryMs > 0 && expiryMs < Date.now();

  // Expired takes priority
  if (isExpired) return "expired";

  // Fully settled (if maxCalls is configured and reached)
  if (maxCalls > 0 && callsSettled >= maxCalls) return "settled";

  // Has funds → active
  if (balance > 0) return "active";

  // Was funded before but now empty
  if (totalDeposited > 0) return "depleted";

  // Never funded
  return "unfunded";
}

/* ── Status filter toggle ────────────────────── */

function StatusFilter({
  status,
  count,
  active,
  onClick,
}: {
  status: EscrowStatus;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-card border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors",
          active ? "bg-primary" : cfg.dot,
        )}
      />
      {cfg.label}
      <span className="text-xs text-neutral-500 tabular-nums">({count})</span>
    </button>
  );
}

export default function EscrowsPage() {
  const { data, loading, error, refetch } = useEscrows();
  const { data: agentsData } = useAgents({ limit: "100" });
  const { data: enrichedAgentsData } = useEnrichedAgents();
  const { data: eventsData } = useEscrowEvents();
  const { map: walletAgentMap } = useAgentMapCtx();
  const [search, setSearch] = useQueryState("q", "", QueryParam.string);
  const [statusFilter, setStatusFilter] = useState<EscrowStatus | null>(null);
  const [expandedEscrow, setExpandedEscrow] = useState<string | null>(null);

  // Collect unique token mints from escrows for metadata resolution
  const tokenMints = useMemo(() => {
    if (!data?.escrows) return [];
    const mints = new Set<string>();
    for (const e of data.escrows as unknown as EscrowData[]) {
      const tokenMint = asText(e.tokenMint);
      if (
        tokenMint &&
        tokenMint !== "So11111111111111111111111111111111111111112"
      ) {
        mints.add(tokenMint);
      }
    }
    return [...mints];
  }, [data]);
  const { tokens: tokenMetaMap } = useTokenMetadata(tokenMints);

  const agentVisualMap = useMemo<AgentVisualMap>(() => {
    const map: AgentVisualMap = {};
    for (const item of enrichedAgentsData?.agents ?? []) {
      const identity = item.agent.identity;
      const wallet = asText(identity?.wallet);
      const pda = asText(item.agent.pda);
      const name = identity?.name || walletAgentMap[wallet]?.name || walletAgentMap[pda]?.name || short(wallet || pda, 6, 4);
      const visual: AgentVisual = {
        name,
        wallet,
        pda,
        endpoint: identity?.x402Endpoint ?? null,
        logo: item.logos?.wellKnownLogo ?? item.wellKnown?.logo ?? null,
        mplImage: item.logos?.mplImage ?? null,
        onMetaplex: Boolean(
          item.metaplex?.linked ||
          Number(item.metaplex?.pluginCount ?? 0) > 0 ||
          Number(item.metaplex?.registryCount ?? 0) > 0,
        ),
      };
      if (wallet) map[wallet] = visual;
      if (pda) map[pda] = visual;
    }
    return map;
  }, [enrichedAgentsData?.agents, walletAgentMap]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      refetch?.();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Build event counts per escrow PDA
  const eventsByEscrow = useMemo(() => {
    if (!eventsData?.events) return new Map<string, EscrowEvent[]>();
    const map = new Map<string, EscrowEvent[]>();
    for (const ev of eventsData.events as unknown as EscrowEvent[]) {
      const escrowPda = asText(ev.escrowPda);
      if (!escrowPda) continue;
      const list = map.get(escrowPda) ?? [];
      list.push({
        ...ev,
        id: asText(ev.id),
        escrowPda,
        txSignature: asText(ev.txSignature),
        signer: asText(ev.signer) || null,
      });
      map.set(escrowPda, list);
    }
    return map;
  }, [eventsData]);

  const enriched = useMemo(() => {
    if (!data?.escrows) return [];
    const byPda = new Map<string, EnrichedEscrow>();
    for (const e of data.escrows as unknown as EscrowData[]) {
      const pda = asText(e.pda);
      const agentPda = asText(e.agent);
      const depositor = asText(e.depositor);
      const tokenMint = asText(e.tokenMint) || null;
      const agent = agentsData?.agents.find((a) => asText(a.pda) === agentPda);
      const normalized = { ...e, pda, agent: agentPda, depositor, tokenMint };
      const row: EnrichedEscrow = {
        ...normalized,
        agentName: agent?.identity?.name ?? null,
        status: deriveStatus(normalized) as EscrowStatus,
        eventCount: eventsByEscrow.get(pda)?.length ?? 0,
      };
      const prev = byPda.get(pda);
      if (
        !prev ||
        Number(row.totalSettled ?? 0) >= Number(prev.totalSettled ?? 0) ||
        row.status === "active"
      ) {
        byPda.set(pda, row);
      }
    }
    return Array.from(byPda.values());
  }, [data, agentsData, eventsByEscrow]);

  // Count per status
  const statusCounts = useMemo(() => {
    const counts: Record<EscrowStatus, number> = {
      active: 0,
      closed: 0,
      depleted: 0,
      expired: 0,
      settled: 0,
      unfunded: 0,
    };
    for (const e of enriched) counts[e.status]++;
    return counts;
  }, [enriched]);

  const overview = useMemo(() => {
    const totals = new Map<
      string,
      { raw: number; decimals: number; symbol: string }
    >();
    const deposited = new Map<
      string,
      { raw: number; decimals: number; symbol: string }
    >();
    const locked = new Map<
      string,
      { raw: number; decimals: number; symbol: string }
    >();
    let calls = 0;
    let settledSolRaw = 0;
    let settledUsdcRaw = 0;
    let depositedSolRaw = 0;
    let depositedUsdcRaw = 0;
    for (const e of enriched) {
      const tokenMint = asText(e.tokenMint) || null;
      const meta = tokenMetaMap[tokenMint ?? ""];
      const decimals = inferTokenDecimals({
        mint: tokenMint,
        declaredDecimals: e.tokenDecimals,
        symbol: meta?.symbol,
      });
      const symbol = tokenSymbol(tokenMint, decimals, meta);
      const key = `${tokenMint ?? SOL_MINT}:${symbol}:${decimals}`;
      const add = (
        map: Map<string, { raw: number; decimals: number; symbol: string }>,
        raw: number,
      ) => {
        const prev = map.get(key) ?? { raw: 0, decimals, symbol };
        prev.raw += Number.isFinite(raw) ? raw : 0;
        map.set(key, prev);
      };
      add(totals, Number(e.totalSettled ?? 0));
      add(deposited, Number(e.totalDeposited ?? 0));
      add(locked, Number(e.balance ?? 0));
      const settled = Number(e.totalSettled ?? 0);
      const depositedRaw = Number(e.totalDeposited ?? 0);
      if (symbol === "SOL")
        settledSolRaw += Number.isFinite(settled) ? settled : 0;
      if (symbol === "USDC")
        settledUsdcRaw += Number.isFinite(settled) ? settled : 0;
      if (symbol === "SOL")
        depositedSolRaw += Number.isFinite(depositedRaw) ? depositedRaw : 0;
      if (symbol === "USDC")
        depositedUsdcRaw += Number.isFinite(depositedRaw) ? depositedRaw : 0;
      calls += Number(e.totalCallsSettled ?? 0);
    }
    const formatMulti = (
      map: Map<string, { raw: number; decimals: number; symbol: string }>,
    ) => {
      const rows = Array.from(map.values())
        .filter((v) => v.raw > 0)
        .sort((a, b) => b.raw / 10 ** b.decimals - a.raw / 10 ** a.decimals);
      if (rows.length === 0) return "0";
      return rows
        .slice(0, 2)
        .map((v) => compactTokenValue(v.raw, v.decimals, v.symbol))
        .join(" + ");
    };
    return {
      settled: formatMulti(totals),
      deposited: formatMulti(deposited),
      locked: formatMulti(locked),
      calls,
      settledSolRaw,
      settledUsdcRaw,
      depositedSolRaw,
      depositedUsdcRaw,
    };
  }, [enriched, tokenMetaMap]);

  const settledUsdDisplay = enrichedAgentsData?.solPrice
    ? fmtUsdApprox(
        (overview.settledSolRaw / 1e9) * enrichedAgentsData.solPrice +
          overview.settledUsdcRaw / 1e6,
      )
    : null;
  const settledUsdRaw = enrichedAgentsData?.solPrice
    ? (overview.settledSolRaw / 1e9) * enrichedAgentsData.solPrice +
      overview.settledUsdcRaw / 1e6
    : null;
  const depositedUsdRaw = enrichedAgentsData?.solPrice
    ? (overview.depositedSolRaw / 1e9) * enrichedAgentsData.solPrice +
      overview.depositedUsdcRaw / 1e6
    : null;
  const overviewUtilization =
    settledUsdRaw !== null && depositedUsdRaw && depositedUsdRaw > 0
      ? Math.min((settledUsdRaw / depositedUsdRaw) * 100, 100)
      : null;

  const filtered = useMemo(
    () =>
      enriched.filter((e) => {
        // Status filter
        if (statusFilter && e.status !== statusFilter) return false;

        // Text search
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          e.pda.toLowerCase().includes(q) ||
          e.agent.toLowerCase().includes(q) ||
          e.depositor.toLowerCase().includes(q) ||
          (e.agentName ?? "").toLowerCase().includes(q)
        );
      }),
    [enriched, search, statusFilter],
  );

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(
    filtered.length,
    10,
  );
  const paginatedEscrows = useMemo(
    () => paginate(filtered),
    [paginate, filtered],
  );

  return (
    <ExplorerPageShell
      title="Escrow Accounts"
      subtitle="Pre-funded payment escrows between depositors and agents — full lifecycle tracked"
      icon={<CreditCard className="h-5 w-5" />}
      badge={
        <Badge variant="secondary" className="tabular-nums">
          {data?.total ?? 0} escrows
        </Badge>
      }
      stats={
        <>
          <ExplorerMetric
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Escrows"
            value={enriched.length || data?.total || 0}
            sub={`${statusCounts.active} active · ${statusCounts.closed + statusCounts.depleted + statusCounts.expired} inactive`}
            accent="primary"
          />
          <VolumeMetricCard
            icon={<CircleDollarSign className="h-3.5 w-3.5" />}
            label="Settled Volume"
            value={overview.settled}
            fiatValue={settledUsdDisplay}
            calls={fmtNum(overview.calls)}
            utilization={overviewUtilization}
          />
          <ExplorerMetric
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Locked Balance"
            value={overview.locked}
            sub={`${overview.deposited} deposited`}
            accent="cyan"
          />
          <ExplorerMetric
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Fully Settled"
            value={statusCounts.settled + statusCounts.depleted}
            sub={`${statusCounts.unfunded} unfunded`}
            accent="amber"
          />
        </>
      }
    >
      {/* Filters */}
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search escrows…"
      >
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            statusFilter === null
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          All{" "}
          <span className="tabular-nums text-muted-foreground">
            ({enriched.length})
          </span>
        </button>
        {(Object.keys(STATUS_CONFIG) as EscrowStatus[]).map((s) =>
          statusCounts[s] > 0 ? (
            <StatusFilter
              key={s}
              status={s}
              count={statusCounts[s]}
              active={statusFilter === s}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            />
          ) : null,
        )}
        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="ml-1 inline-flex min-h-10 items-center rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Clear
          </button>
        )}
      </ExplorerFilterBar>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center bg-neutral-900 border-neutral-700">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            search
              ? "No escrows match search"
              : "No escrow accounts found on-chain"
          }
        />
      ) : (
        <>
          <div className="space-y-4">
            {paginatedEscrows.map((e, index) => (
              <EscrowCard
                key={`${e.pda || `${e.agent}-${e.depositor}`}-${index}`}
                escrow={e}
                events={eventsByEscrow.get(e.pda) ?? []}
                expanded={expandedEscrow === e.pda}
                onToggle={() =>
                  setExpandedEscrow(expandedEscrow === e.pda ? null : e.pda)
                }
                walletAgentMap={walletAgentMap}
                agentVisualMap={agentVisualMap}
                tokenMetaMap={tokenMetaMap}
              />
            ))}
          </div>
          <ExplorerPagination
            page={page}
            total={filtered.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            perPageOptions={[10, 25, 50]}
            className="mt-5 rounded-xl border border-border/40 bg-card"
          />
        </>
      )}
    </ExplorerPageShell>
  );
}

/* ── Event type config ────────────────────────── */

const EVENT_CONFIG: Record<
  string,
  { label: string; icon: typeof PlusCircle; color: string }
> = {
  create_escrow: {
    label: "Created",
    icon: PlusCircle,
    color: "text-emerald-400",
  },
  deposit_escrow: {
    label: "Deposit",
    icon: ArrowDownLeft,
    color: "text-blue-400",
  },
  settle_calls: { label: "Settled", icon: CheckCircle2, color: "text-primary" },
  withdraw_escrow: {
    label: "Withdrawal",
    icon: ArrowUpRight,
    color: "text-amber-400",
  },
  close_escrow: { label: "Closed", icon: XCircle, color: "text-red-400" },
};

function resolveAgentVisual(
  addressValue: unknown,
  walletAgentMap: import("~/types/api").AgentMap,
  agentVisualMap: AgentVisualMap,
  fallbackName?: string | null,
): AgentVisual {
  const address = asText(addressValue);
  const direct = agentVisualMap[address];
  if (direct) return direct;
  const directMap = walletAgentMap[address];
  if (directMap) {
    return {
      name: directMap.name || fallbackName || short(address, 6, 4),
      wallet: address,
      pda: directMap.pda,
      endpoint: null,
      logo: null,
      mplImage: null,
      onMetaplex: false,
    };
  }
  for (const [wallet, entry] of Object.entries(walletAgentMap)) {
    if (entry?.pda !== address) continue;
    return agentVisualMap[wallet] ?? agentVisualMap[address] ?? {
      name: entry.name || fallbackName || short(address, 6, 4),
      wallet,
      pda: address,
      endpoint: null,
      logo: null,
      mplImage: null,
      onMetaplex: false,
    };
  }
  return {
    name: fallbackName || short(address, 6, 4),
    wallet: address,
    pda: address,
    endpoint: null,
    logo: null,
    mplImage: null,
    onMetaplex: false,
  };
}

function EscrowPartyFlow({
  agent,
  depositor,
  agentName,
  walletAgentMap,
  agentVisualMap,
  inactive,
}: {
  agent: string;
  depositor: string;
  agentName: string | null;
  walletAgentMap: import("~/types/api").AgentMap;
  agentVisualMap: AgentVisualMap;
  inactive: boolean;
}) {
  const agentVisual = resolveAgentVisual(agent, walletAgentMap, agentVisualMap, agentName);
  const depositorVisual = resolveAgentVisual(depositor, walletAgentMap, agentVisualMap);
  const agentHref = entityPath("/agents", agentVisual.wallet || agentVisual.pda || agent);
  const depositorHref = agentVisualMap[depositor] || walletAgentMap[depositor]
    ? entityPath("/agents", depositorVisual.wallet || depositorVisual.pda || depositor)
    : entityPath("/address", depositor);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border bg-background p-1 shadow-sm",
        inactive && "opacity-70",
      )}
      aria-label="Escrow communication participants"
    >
      <Link
        href={agentHref}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={`Agent: ${agentVisual.name}`}
      >
        <AgentAvatar
          name={agentVisual.name}
          endpoint={agentVisual.endpoint}
          logo={agentVisual.logo}
          mplImage={agentVisual.mplImage}
          size={36}
          className="rounded-full"
          showSourceBadges={false}
          showMetaplexBadge={agentVisual.onMetaplex}
        />
      </Link>
      <span className="relative flex size-7 items-center justify-center rounded-full bg-muted text-primary">
        <ArrowRight className="size-3.5 motion-safe:animate-pulse" aria-hidden="true" />
        <span className="sr-only">communicates with</span>
      </span>
      <Link
        href={depositorHref}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={`Depositor: ${depositorVisual.name}`}
      >
        <AgentAvatar
          name={depositorVisual.name}
          endpoint={depositorVisual.endpoint}
          logo={depositorVisual.logo}
          mplImage={depositorVisual.mplImage}
          size={36}
          className="rounded-full"
          showSourceBadges={false}
          showMetaplexBadge={depositorVisual.onMetaplex}
        />
      </Link>
    </div>
  );
}

function EscrowCard({
  escrow,
  events,
  expanded,
  onToggle,
  walletAgentMap,
  agentVisualMap,
  tokenMetaMap,
}: {
  escrow: EscrowData;
  events: EscrowEvent[];
  expanded: boolean;
  onToggle: () => void;
  walletAgentMap: import("~/types/api").AgentMap;
  agentVisualMap: AgentVisualMap;
  tokenMetaMap: Record<
    string,
    { mint: string; symbol: string; name: string; logo: string | null }
  >;
}) {
  const balance = Number(escrow.balance);
  const totalDeposited = Number(escrow.totalDeposited);
  const totalSettled = Number(escrow.totalSettled);
  const pricePerCall = Number(escrow.pricePerCall);
  const callsSettled = Number(escrow.totalCallsSettled);
  const maxCalls = Number(escrow.maxCalls);
  const status = escrow.status as EscrowStatus;
  const cfg = STATUS_CONFIG[status];
  const pda = asText(escrow.pda);
  const agent = asText(escrow.agent);
  const depositor = asText(escrow.depositor);
  const tokenMint = asText(escrow.tokenMint);

  const isNativeSol = !tokenMint || tokenMint === SOL_MINT;

  // Resolve token label and logo from shared metadata
  const tokenMeta = !isNativeSol && tokenMint ? tokenMetaMap[tokenMint] : null;
  const dec = inferTokenDecimals({
    mint: tokenMint || null,
    declaredDecimals: escrow.tokenDecimals,
    symbol: tokenMeta?.symbol,
  });
  const tokenLabel = tokenSymbol(tokenMint || null, dec, tokenMeta);
  const tokenLogo = isNativeSol
    ? "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
    : (tokenMeta?.logo ?? null);

  const formatAmount = (lamports: number) => formatTokenAmount(lamports, dec);

  // Parse expiry safely
  let expiryMs = 0;
  if (escrow.expiresAt && escrow.expiresAt !== "0") {
    const raw = escrow.expiresAt;
    const asNum = Number(raw);
    expiryMs =
      asNum > 1e12
        ? asNum
        : asNum > 0
          ? asNum * 1000
          : new Date(raw as string | number).getTime();
  }
  const isExpired = expiryMs > 0 && expiryMs < Date.now();

  // Utilization: if maxCalls configured, use calls ratio; otherwise use funds ratio
  const utilization =
    maxCalls > 0
      ? Math.min((callsSettled / maxCalls) * 100, 100)
      : totalDeposited > 0
        ? Math.min((totalSettled / totalDeposited) * 100, 100)
        : 0;
  const remainingBalance = Math.max(balance, 0);
  const remainingCalls =
    maxCalls > 0 ? Math.max(maxCalls - callsSettled, 0) : null;
  const eventCount = events.length;

  return (
    <Card
      className={cn(
        "group rounded-xl border bg-card shadow-sm transition-colors duration-200",
        status === "closed" ? "opacity-75" : "hover:border-primary/25",
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left */}
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-start gap-3">
              <EscrowPartyFlow
                agent={agent}
                depositor={depositor}
                agentName={escrow.agentName}
                walletAgentMap={walletAgentMap}
                agentVisualMap={agentVisualMap}
                inactive={status === "closed"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={entityPath("/agents", agent)}
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors [overflow-wrap:anywhere]"
                    title={escrow.agentName ?? agent}
                  >
                    {escrow.agentName ?? "Unknown Agent"}
                  </Link>
                  <Badge className={cn("text-xs gap-1", cfg.className)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </Badge>
                  {escrow.closedAt && (
                    <span className="text-xs text-muted-foreground">
                      Closed {new Date(escrow.closedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex mt-2 items-baseline gap-2  min-w-0 flex-wrap">
                  <span className="text-xs text-muted-foreground shrink-0">
                    PDA
                  </span>
                  <Address value={pda} copy />
                </div>
              </div>
            </div>

            {/* Parties */}
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 rounded-lg border bg-background p-3 text-xs">
              <span className="text-muted-foreground shrink-0">Agent</span>
              <AgentTag
                address={agent}
                agentMap={walletAgentMap}
                className="text-xs"
                truncate={false}
              />
              <span className="text-muted-foreground shrink-0">Depositor</span>
              <AgentTag
                address={depositor}
                agentMap={walletAgentMap}
                className="text-xs"
                truncate={false}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Deposited
                </p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                  {formatAmount(totalDeposited)} {tokenLabel}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Settled
                </p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                  {formatAmount(totalSettled)} {tokenLabel}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Remaining
                </p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                  {formatAmount(remainingBalance)} {tokenLabel}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                
              <div className="min-w-0 text-left">
                <p className="truncate font-mono text-sm font-bold tabular-nums text-foreground sm:text-lg">
                  {callsSettled}
                  {maxCalls > 0 ? `/${maxCalls}` : ""}
                </p>

                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {remainingCalls != null
                    ? `${fmtNum(remainingCalls)} left`
                    : "Calls"}
                </p>
              </div>
              </div>
            </div>
          </div>

          {/* Right — stats stacked */}
          <div className="grid w-full grid-cols-1 grid-rows-[auto_auto] gap-3 rounded-lg border bg-background p-3 sm:w-auto sm:min-w-[260px] sm:shrink-0">
            {/* First row — Price + Balance */}
            <div className="grid w-full grid-cols-1 gap-3">
              {pricePerCall > 0 && (
                <div className="w-full rounded-md bg-muted/30 p-3 text-left">
                  <p className="truncate text-sm font-bold tabular-nums text-foreground sm:text-lg">
                    {formatAmount(pricePerCall)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {tokenLabel}
                    </span>
                  </p>

                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Price/Call
                  </p>
                </div>
              )}

              <div className="w-full rounded-md bg-muted/30 p-3 text-left">
                <div className="flex w-full items-center gap-2">
                  {tokenLogo && (
                    <Image
                      src={tokenLogo}
                      alt={tokenLabel}
                      width={18}
                      height={18}
                      className="shrink-0 rounded-full"
                      unoptimized
                    />
                  )}

                  <p
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono text-sm font-bold tabular-nums sm:text-lg",
                      balance > 0 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {formatAmount(balance)}
                  </p>

                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {tokenLabel}
                  </span>
                </div>

                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Balance
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Utilization bar */}
        {(totalDeposited > 0 || maxCalls > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                {maxCalls > 0
                  ? `Calls ${callsSettled}/${maxCalls}`
                  : "Funds Utilization"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground font-mono">
                {utilization.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  utilization >= 100
                    ? "bg-primary"
                    : utilization > 75
                      ? "bg-amber-500/70"
                      : "bg-primary/60",
                )}
                style={{ width: `${utilization}%` }}
              />
            </div>
          </div>
        )}

        {/* Details row + event toggle */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-xs">
          <span className="text-muted-foreground">
            Escrow:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {short(pda, 8, 6)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Price/call:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatAmount(pricePerCall)} {tokenLabel}
            </span>
          </span>
          <span className="text-muted-foreground">
            Deposited:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatAmount(totalDeposited)} {tokenLabel}
            </span>
          </span>
          <span className="text-muted-foreground">
            Settled:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatAmount(totalSettled)} {tokenLabel}
            </span>
          </span>
          <span className="text-muted-foreground">
            Events:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {eventCount}
            </span>
          </span>
          {expiryMs > 0 && (
            <span className="text-muted-foreground">
              Expires:{" "}
              <span
                className={isExpired ? "text-destructive" : "text-foreground"}
              >
                {new Date(expiryMs).toLocaleDateString()}
              </span>
            </span>
          )}
          {(escrow.volumeCurve ?? []).length > 0 && (
            <Badge variant="outline" className="text-xs">
              Volume curve ({escrow.volumeCurve!.length} tiers)
            </Badge>
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                expanded
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <History className="h-3 w-3" />
              {events.length > 0 ? `${events.length} events` : "Events"}
            </button>
          </div>
        </div>

        {/* Event Timeline */}
        {expanded && (
          <div className="mt-4 border-t pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Event History
            </h4>
            {events.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-background p-4 text-xs text-muted-foreground">
                No events tracked yet for this escrow.
              </p>
            ) : (
              <div className="relative space-y-0">
                {/* Timeline line */}
                <div className="absolute bottom-2 left-[9px] top-2 w-px bg-border" />
                {events.map((ev, i) => {
                  const evCfg = EVENT_CONFIG[ev.eventType] ?? {
                    label: ev.eventType,
                    icon: Clock,
                    color: "text-muted-foreground",
                  };
                  const Icon = evCfg.icon;
                  return (
                    <div
                      key={ev.id || `${ev.txSignature}-${i}`}
                      className="relative flex items-start gap-3 py-2"
                    >
                      <div
                        className={cn(
                          "relative z-10 mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-card",
                          evCfg.color,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("text-xs font-medium", evCfg.color)}
                          >
                            {evCfg.label}
                          </span>
                          {ev.amountChanged &&
                            Number(ev.amountChanged) !== 0 && (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatSignedTokenValue(
                                  ev.amountChanged,
                                  dec,
                                  tokenLabel,
                                )}
                              </span>
                            )}
                          {ev.callsSettled && Number(ev.callsSettled) > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {ev.callsSettled} calls
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ev.blockTime && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(
                                Number(ev.blockTime) > 1e12
                                  ? Number(ev.blockTime)
                                  : Number(ev.blockTime) * 1000,
                              ).toLocaleString()}
                            </span>
                          )}
                          {ev.signer && (
                            <span className="text-xs text-muted-foreground">
                              by <Address value={ev.signer} copy />
                            </span>
                          )}
                          {ev.txSignature && (
                            <Link
                              href={entityPath("/tx", ev.txSignature)}
                              className="text-xs text-primary/70 hover:text-primary transition-colors"
                            >
                              {short(ev.txSignature, 8, 4)}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
