"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Bot,
  Network,
  ArrowLeftRight,
  Wrench,
  Layers,
  Wallet,
  ShieldCheck,
  Trophy,
  ArrowRight,
  Server,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  useMetrics,
  useAgents,
  useEscrows,
  useAttestations,
  useFeedbacks,
  useVaults,
  useTools,
} from "~/hooks/use-sap";

/* -- Inline tx types -- */
type TxProgram = { id: string; name: string | null };
type SapTx = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  sapInstructions: string[];
  programs: TxProgram[];
  feeSol: number;
  signer: string;
};

const SAP_MAINNET = "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ";
const SAP_DEVNET = "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ";

function timeAgo(ts: number): string {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 5) return "just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function short(s: string, l = 4, r = 4) {
  if (s.length <= l + r + 3) return s;
  return `${s.slice(0, l)}...${s.slice(-r)}`;
}

/* -- Tiny Solana logo -- */
function SolLogo({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-sm"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #9945FF, #14F195)",
      }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 397 312"
        fill="none"
      >
        <path
          d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
          fill="#fff"
        />
        <path
          d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
          fill="#fff"
        />
        <path
          d="M332.1 120c-2.4-2.4-5.7-3.8-9.2-3.8H5.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1L332.1 120z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}

export default function OverviewPage() {
  const { data: metrics, loading: metricsLoading } = useMetrics();
  const { data: agentsData, loading: agentsLoading } = useAgents({
    sortBy: "reputation",
    limit: "20",
  });
  const { data: escrowData, loading: escrowLoading } = useEscrows();
  const { data: attestationData } = useAttestations();
  const { data: feedbackData } = useFeedbacks();
  const { data: vaultData } = useVaults();
  const { data: toolsData, loading: toolsLoading } = useTools();

  /* -- Inline tx fetch -- */
  const [txs, setTxs] = useState<SapTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  const fetchTxs = useCallback(async () => {
    try {
      const res = await fetch("/api/sap/transactions?limit=8");
      if (res.ok) {
        const data = await res.json();
        setTxs(data.transactions ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTxs();
    const t = setInterval(fetchTxs, 15_000);
    return () => clearInterval(t);
  }, [fetchTxs]);

  const totalAgents = Number(metrics?.totalAgents ?? 0);
  const activeAgents = Number(metrics?.activeAgents ?? 0);
  const totalEscrows = escrowData?.total ?? 0;
  const totalAttestations =
    attestationData?.total ?? Number(metrics?.totalAttestations ?? 0);
  const totalFeedbacks =
    feedbackData?.total ?? Number(metrics?.totalFeedbacks ?? 0);
  const totalVaults = vaultData?.total ?? Number(metrics?.totalVaults ?? 0);
  const totalTools = toolsData?.total ?? Number(metrics?.totalTools ?? 0);
  const totalProtocols = Number(metrics?.totalProtocols ?? 0);
  const totalCapabilities = Number(metrics?.totalCapabilities ?? 0);

  /* -- Chart data: calls served per agent -- */
  const agentChartData = useMemo(() => {
    if (!agentsData?.agents) return [];
    return agentsData.agents
      .filter((a) => a.identity)
      .slice(0, 10)
      .map((a) => ({
        name:
          a.identity!.name.length > 12
            ? a.identity!.name.slice(0, 10) + ".."
            : a.identity!.name,
        calls: Number(a.identity!.totalCallsServed),
        score: a.identity!.reputationScore,
      }));
  }, [agentsData]);

  /* -- Tool list from /tools -- */
  const toolList = useMemo(() => {
    if (!toolsData?.tools) return [];
    return toolsData.tools
      .filter((t: any) => t.descriptor)
      .map((t: any) => ({
        name: t.descriptor.toolName as string,
        category: String(t.descriptor.category ?? "Unknown"),
        invocations: Number(t.descriptor.totalInvocations ?? 0),
        isActive: t.descriptor.isActive as boolean,
      }))
      .sort((a: any, b: any) => b.invocations - a.invocations);
  }, [toolsData]);

  /* -- Escrow aggregated stats -- */
  const escrowStats = useMemo(() => {
    if (!escrowData?.escrows) return null;
    const escrows = escrowData.escrows;
    const totalBalance = escrows.reduce(
      (s: number, e: any) => s + Number(e.balance),
      0,
    );
    const totalDeposited = escrows.reduce(
      (s: number, e: any) => s + Number(e.totalDeposited),
      0,
    );
    const totalSettled = escrows.reduce(
      (s: number, e: any) => s + Number(e.totalSettled),
      0,
    );
    const totalCalls = escrows.reduce(
      (s: number, e: any) => s + Number(e.totalCallsSettled),
      0,
    );
    const active = escrows.filter((e: any) => Number(e.balance) > 0).length;
    return {
      totalBalance,
      totalDeposited,
      totalSettled,
      totalCalls,
      active,
      total: escrows.length,
    };
  }, [escrowData]);

  const CHART_COLORS = [
    "hsl(262, 80%, 60%)",
    "hsl(262, 70%, 50%)",
    "hsl(262, 60%, 45%)",
    "hsl(262, 50%, 40%)",
    "hsl(200, 60%, 50%)",
    "hsl(170, 50%, 45%)",
    "hsl(340, 60%, 50%)",
    "hsl(30, 70%, 50%)",
    "hsl(280, 65%, 55%)",
    "hsl(120, 40%, 45%)",
  ];

  return (
    <div className="space-y-6">
      {/* PROGRAM ADDRESS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Synapse Explorer
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synapse Agent Protocol - Real-time on-chain state
          </p>
        </div>
        <div className="flex flex-col gap-1.5 text-right">
          <div className="flex items-center gap-2 justify-end">
            <SolLogo size={14} />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Mainnet / Devnet
            </span>
            <span className="font-mono text-[11px] text-foreground/80 select-all">
              {SAP_MAINNET}
            </span>
          </div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Bot className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Agents</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{totalAgents}</p>
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    Active{" "}
                    <span className="font-semibold text-emerald-500">
                      {activeAgents}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Inactive{" "}
                    <span className="font-semibold text-foreground/60">
                      {totalAgents - activeAgents}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Wrench className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Tools</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{totalTools}</p>
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    Protocols{" "}
                    <span className="font-semibold text-foreground/80">
                      {totalProtocols}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Capabilities{" "}
                    <span className="font-semibold text-foreground/80">
                      {totalCapabilities}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Trust</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {totalAttestations}
                </p>
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    Feedbacks{" "}
                    <span className="font-semibold text-foreground/80">
                      {totalFeedbacks}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Vaults{" "}
                    <span className="font-semibold text-foreground/80">
                      {totalVaults}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Escrows</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {totalEscrows}
                </p>
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    Vaults{" "}
                    <span className="font-semibold text-foreground/80">
                      {totalVaults}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Protocols{" "}
                    <span className="font-semibold text-foreground/80">
                      {totalProtocols}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* TWO COLUMNS: Transactions + Top Agents */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Latest SAP Transactions
              </CardTitle>
              <Link
                href="/transactions"
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {txLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : txs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">
                No transactions found
              </p>
            ) : (
              <div className="divide-y divide-border/30">
                {txs.slice(0, 8).map((tx) => {
                  const action = tx.sapInstructions[0] ?? "Transfer";
                  return (
                    <Link
                      key={tx.signature}
                      href={`/tx/${tx.signature}`}
                      className="flex items-center gap-3 py-2.5 hover:bg-muted/20 -mx-2 px-2 rounded transition-colors"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${tx.err ? "bg-red-500" : "bg-emerald-500"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary truncate">
                            {short(tx.signature, 12, 4)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                            {action.length > 22
                              ? action.slice(0, 19) + "..."
                              : action}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {short(tx.signer ?? "", 4, 4)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/40">
                            |
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {tx.programs.length} program
                            {tx.programs.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
                        {tx.blockTime ? timeAgo(tx.blockTime) : "--"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Protocol Usage by Agent
              </CardTitle>
              <Link
                href="/agents"
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {agentsLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : agentChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">
                No agent data
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={agentChartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    className="text-muted-foreground"
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                  />
                  <Bar
                    dataKey="calls"
                    name="Calls Served"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  >
                    {agentChartData.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* REGISTERED TOOLS + ESCROW OVERVIEW */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Registered Tools */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Registered Tools
              </CardTitle>
              <Link
                href="/tools"
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {toolsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : toolList.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tools registered
              </p>
            ) : (
              <div className="divide-y divide-border/30">
                {toolList.slice(0, 8).map((tool: any, i: number) => (
                  <div
                    key={`${tool.name}-${i}`}
                    className="flex items-center gap-3 py-2"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${tool.isActive ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {tool.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {tool.category}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-medium tabular-nums text-foreground">
                        {tool.invocations.toLocaleString()}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        invocations
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Escrow Overview */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Escrow Overview
              </CardTitle>
              <Link
                href="/escrows"
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {escrowLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !escrowStats ? (
              <p className="text-xs text-muted-foreground">No escrow data</p>
            ) : (
              <div className="space-y-4">
                {/* Summary grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {escrowStats.total}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-500">
                      {escrowStats.active}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Active</p>
                  </div>
                  <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {escrowStats.totalCalls.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Calls Settled
                    </p>
                  </div>
                </div>

                {/* Balance breakdown */}
                <div className="space-y-2">
                  {[
                    {
                      label: "Total Deposited",
                      value: escrowStats.totalDeposited,
                      color: "bg-primary",
                    },
                    {
                      label: "Total Settled",
                      value: escrowStats.totalSettled,
                      color: "bg-emerald-500",
                    },
                    {
                      label: "Balance Remaining",
                      value: escrowStats.totalBalance,
                      color: "bg-amber-500",
                    },
                  ].map(({ label, value, color }) => {
                    const max = Math.max(escrowStats.totalDeposited, 1);
                    const pct = (value / max) * 100;
                    const sol = value / 1e9;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">
                            {label}
                          </span>
                          <span className="text-[11px] font-medium tabular-nums text-foreground">
                            {sol === 0
                              ? "0 SOL"
                              : sol < 0.001
                                ? sol.toFixed(6) + " SOL"
                                : sol.toFixed(4) + " SOL"}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${color} transition-all duration-700`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* NETWORK COMPOSITION */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Network Composition
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {metricsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: "Agents", value: totalAgents, icon: Bot },
                { label: "Tools", value: totalTools, icon: Wrench },
                { label: "Protocols", value: totalProtocols, icon: Layers },
                {
                  label: "Attestations",
                  value: totalAttestations,
                  icon: ShieldCheck,
                },
                { label: "Feedbacks", value: totalFeedbacks, icon: FileText },
                { label: "Vaults", value: totalVaults, icon: Server },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="rounded-lg bg-muted/20 border border-border/40 p-3 text-center"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1.5" />
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXPLORE LINKS */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Explore
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { href: "/agents", label: "Agents", icon: Bot },
            { href: "/network", label: "Network", icon: Network },
            {
              href: "/transactions",
              label: "Transactions",
              icon: ArrowLeftRight,
            },
            { href: "/tools", label: "Tools", icon: Wrench },
            { href: "/protocols", label: "Protocols", icon: Layers },
            { href: "/escrows", label: "Escrows", icon: Wallet },
            { href: "/attestations", label: "Attestations", icon: ShieldCheck },
            { href: "/reputation", label: "Reputation", icon: Trophy },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 transition-colors hover:bg-muted/30 hover:border-border/60">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground">
                  {label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
