"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Wrench,
  Hash,
  User,
  Activity,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Search,
  X,
  Copy,
  Check,
} from "lucide-react";
import {
  EmptyState,
  StatusBadge,
  CategoryBadge,
  HttpMethodBadge,
  ExplorerPagination,
  usePagination,
  ExplorerPageShell,
  ExplorerMetric,
} from "~/components/ui";
import { AgentTag } from "~/components/ui/agent-tag";
import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useTools, useAgents, useEscrows } from "~/hooks/use-sap";
import { useToolSchemas, triggerSchemaScan } from "~/hooks/use-tool-schemas";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "~/components/ui/dialog";
import { asText, entityPath, short } from "~/lib/format";

type SortKey = "name" | "calls" | "params" | "created" | "updated";
type SortDir = "asc" | "desc";

function enumLabel(value: unknown, fallback: string) {
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)[0] ?? fallback;
  }
  return asText(value) || fallback;
}

function CopyValueButton({ value, label = "Copy address" }: { value: unknown; label?: string }) {
  const [copied, setCopied] = useState(false);
  const text = asText(value);
  if (!text) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-7 sm:w-7"
            aria-label={label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">{copied ? "Copied" : label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ToolsPage() {
  const router = useRouter();
  const { data, loading, error } = useTools();
  const { data: agentsData } = useAgents({ limit: "100" });
  const { data: escrowsData } = useEscrows();
  const { data: schemasData, refetch: refetchSchemas } = useToolSchemas();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("calls");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [scanning, setScanning] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<{ toolPda: string; toolName: string; schema: Record<string, unknown> } | null>(null);

  /* agentPda → sum of totalCallsSettled across all escrows for that agent */
  const agentCallsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of escrowsData?.escrows ?? []) {
      const agent = asText(e.agent);
      if (!agent) continue;
      const prev = map.get(agent) ?? 0;
      map.set(agent, prev + Number(e.totalCallsSettled));
    }
    return map;
  }, [escrowsData]);

  const enrichedTools = useMemo(() => {
    if (!data?.tools) return [];
    const schemasMap = new Map(
      schemasData?.schemas?.map((s) => [s.toolPda, s.schemaJson]) ?? []
    );
    return data.tools.map((t) => {
      const pda = asText(t.pda);
      const agentPda = asText(t.descriptor?.agent);
      const agent = agentsData?.agents.find(
        (a) => asText(a.pda) === agentPda,
      );
      const callsSettled = agentCallsMap.get(agentPda) ?? 0;
      const schema = schemasMap.get(pda);
      return {
        pda,
        agentPda,
        descriptor: t.descriptor,
        agentName: agent?.identity?.name ?? null,
        agentWallet: asText(agent?.identity?.wallet),
        callsSettled,
        hasInscribedSchema: !!schema || (t.hasInscribedSchema ?? false),
        inscribedSchemaCount: t.inscribedSchemaCount ?? 0,
        schemaJson: schema || null,
      };
    });
  }, [data, agentsData, agentCallsMap, schemasData]);

  const categories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories.map((c) => enumLabel(c.category, "")).filter(Boolean);
  }, [data]);

  const methods = useMemo(() => {
    const set = new Set<string>();
    enrichedTools.forEach((t) => {
      if (!t.descriptor) return;
      const m =
        enumLabel(t.descriptor.httpMethod, "GET");
      set.add(m);
    });
    return [...set].sort();
  }, [enrichedTools]);

  /* Stats */
  const stats = useMemo(() => {
    const total = enrichedTools.length;
    const active = enrichedTools.filter((t) => t.descriptor?.isActive).length;
    const totalCallsSettled = enrichedTools.reduce(
      (s, t) => s + t.callsSettled,
      0,
    );
    const compound = enrichedTools.filter(
      (t) => t.descriptor?.isCompound,
    ).length;
    const withSchema = enrichedTools.filter((t) => t.hasInscribedSchema).length;
    return { total, active, totalCallsSettled, compound, withSchema };
  }, [enrichedTools]);

  /* Filter */
  const filtered = useMemo(() => {
    const list = enrichedTools.filter((t) => {
      const d = t.descriptor;
      if (!d) return false;
      /* Category */
      if (categoryFilter !== "all") {
        const cat =
          enumLabel(d.category, "Custom");
        if (cat !== categoryFilter) return false;
      }
      /* Method */
      if (methodFilter !== "all") {
        const m =
          enumLabel(d.httpMethod, "GET");
        if (m !== methodFilter) return false;
      }
      /* Status */
      if (statusFilter === "active" && !d.isActive) return false;
      if (statusFilter === "inactive" && d.isActive) return false;
      /* Search — match name, agent name, or PDA */
      if (search) {
        const q = search.toLowerCase();
        const name = asText(d.toolName).toLowerCase();
        const agent = (t.agentName ?? "").toLowerCase();
        if (
          !name.includes(q) &&
          !agent.includes(q) &&
          !t.pda.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

    /* Sort */
    list.sort((a, b) => {
      const da = a.descriptor!;
      const db = b.descriptor!;
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = da.toolName.localeCompare(db.toolName);
          break;
        case "calls":
          cmp = (a.callsSettled ?? 0) - (b.callsSettled ?? 0);
          break;
        case "params":
          cmp = da.paramsCount - db.paramsCount;
          break;
        case "created":
          cmp = Number(da.createdAt) - Number(db.createdAt);
          break;
        case "updated":
          cmp = Number(da.updatedAt) - Number(db.updatedAt);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [
    enrichedTools,
    categoryFilter,
    methodFilter,
    statusFilter,
    search,
    sortKey,
    sortDir,
  ]);

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(
    filtered.length,
    25,
  );
  const paginatedTools = useMemo(
    () => paginate(filtered),
    [paginate, filtered],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleSchemaScan = async () => {
    setScanning(true);
    try {
      const result = await triggerSchemaScan(false);
      await refetchSchemas();
      toast.success(
        `Scan complete: ${result.withSchema} schemas found (${result.scanned}/${result.totalTools} tools scanned)`
      );
    } catch (err) {
      toast.error(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const handleViewSchema = (toolPda: string, toolName: string, schema: Record<string, unknown>) => {
    setSelectedSchema({ toolPda, toolName, schema });
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3 ml-1" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-1" />
    );
  };

  return (
    <ExplorerPageShell
      title="Tool Registry"
      subtitle="On-chain tool descriptors registered in the SAP program"
      icon={<Wrench className="h-5 w-5" />}
      badge={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs tabular-nums">
            {data?.total ?? 0} tools
          </Badge>
          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            {stats.withSchema} with schema
          </Badge>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSchemaScan}
            disabled={scanning}
            className="gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {scanning ? "Scanning..." : "Scan Schemas"}
          </Button>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools…"
              className="h-9 pl-9 pr-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      }
      stats={
        !loading ? (
          <>
            <ExplorerMetric
              icon={<Wrench className="h-3.5 w-3.5" />}
              label="Total Tools"
              value={stats.total}
              accent="primary"
            />
            <ExplorerMetric
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Active"
              value={stats.active}
              sub={
                stats.total > 0
                  ? `${Math.round((stats.active / stats.total) * 100)}%`
                  : undefined
              }
              accent="emerald"
            />
            <ExplorerMetric
              icon={<Hash className="h-3.5 w-3.5" />}
              label="Paid Calls Settled"
              value={stats.totalCallsSettled}
              accent="cyan"
            />
            <Card className="bg-neutral-900 border-neutral-700 hover:border-neutral-600 transition-all duration-300 flex flex-col justify-center">
              <div className="p-4 w-full">
                <div className="space-y-2">
                  <Select
                    value={`${sortKey}-${sortDir}`}
                    onValueChange={(v) => {
                      const [k, d] = v.split("-") as [SortKey, SortDir];
                      setSortKey(k);
                      setSortDir(d);
                    }}
                  >
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calls-desc">Most calls</SelectItem>
                      <SelectItem value="calls-asc">Fewest calls</SelectItem>
                      <SelectItem value="name-asc">Name A–Z</SelectItem>
                      <SelectItem value="name-desc">Name Z–A</SelectItem>
                      <SelectItem value="created-desc">Newest first</SelectItem>
                      <SelectItem value="created-asc">Oldest first</SelectItem>
                      <SelectItem value="updated-desc">
                        Recently updated
                      </SelectItem>
                      <SelectItem value="params-desc">Most params</SelectItem>
                    </SelectContent>
                  </Select>
                  {categories.length > 0 && (
                    <Select
                      value={categoryFilter}
                      onValueChange={setCategoryFilter}
                    >
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {methods.length > 0 && (
                    <Select
                      value={methodFilter}
                      onValueChange={setMethodFilter}
                    >
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue placeholder="All methods" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All methods</SelectItem>
                        {methods.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue placeholder="All status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </>
        ) : undefined
      }
    >
      {/* Results counter */}
      {!loading && (
        <div className="flex items-center">
          <p className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {filtered.length}
            </span>{" "}
            of {enrichedTools.length} tools
          </p>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            search ||
            categoryFilter !== "all" ||
            methodFilter !== "all" ||
            statusFilter !== "all"
              ? "No tools match your filters"
              : "No tools discovered on-chain"
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("name")}
                >
                  <span className="inline-flex items-center">
                    Tool <SortIcon col="name" />
                  </span>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">
                  <span className="inline-flex items-center">
                    <User className="h-3 w-3 mr-1" /> Creator
                  </span>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Schema</TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("calls")}
                >
                  <span className="inline-flex items-center justify-end">
                    Calls <SortIcon col="calls" />
                  </span>
                </TableHead>
                <TableHead
                  className="hidden lg:table-cell text-right cursor-pointer select-none"
                  onClick={() => toggleSort("params")}
                >
                  <span className="inline-flex items-center justify-end">
                    Params <SortIcon col="params" />
                  </span>
                </TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTools.map((tool, i) => {
                const d = tool.descriptor;
                if (!d) return null;
                const method =
                  enumLabel(d.httpMethod, "GET");
                const category =
                  enumLabel(d.category, "Custom");
                const hasInputSchema = d.inputSchemaHash?.some(
                  (b: number) => b !== 0,
                );
                const hasOutputSchema = d.outputSchemaHash?.some(
                  (b: number) => b !== 0,
                );
                const hasInscribedSchema = Boolean(tool.hasInscribedSchema);
                return (
                  <TableRow
                    key={tool.pda || `${tool.agentPda}-${i}`}
                    className="cursor-pointer group hover:bg-muted/30 transition-colors"
                    onClick={() => tool.pda && router.push(entityPath('/tools', tool.pda))}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-5/8 ring-1 ring-chart-5/20 shrink-0 group-hover:bg-chart-5/15 transition-colors">
                          <Wrench className="h-3.5 w-3.5 text-chart-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground block truncate group-hover:text-primary transition-colors">
                            {asText(d.toolName)}
                          </span>
                          <div className="mt-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground/60 [overflow-wrap:anywhere]">
                              {short(tool.pda, 10, 8)}
                            </span>
                            <CopyValueButton value={tool.pda} label="Copy tool PDA" />
                            {hasInscribedSchema && tool.schemaJson && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleViewSchema(tool.pda, asText(d.toolName), tool.schemaJson!);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25 shrink-0 hover:bg-violet-500/20 transition-colors cursor-pointer"
                                title={`View inscribed schema for ${asText(d.toolName)}`}
                              >
                                <BookOpen className="h-2.5 w-2.5" />
                                Schema
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <HttpMethodBadge method={method} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <CategoryBadge category={category} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <AgentTag
                        address={tool.agentWallet || tool.agentPda}
                        className="text-xs"
                        truncate={false}
                      />
                      <CopyValueButton value={tool.agentWallet || tool.agentPda} label="Copy creator address" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        {hasInputSchema ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold bg-blue-500/8 text-blue-400 ring-1 ring-blue-500/20"
                            title="Input schema inscribed on-chain"
                          >
                            <BookOpen className="h-2.5 w-2.5" /> IN
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs text-muted-foreground/40 ring-1 ring-border/30">
                            IN
                          </span>
                        )}
                        {hasOutputSchema ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/8 text-emerald-400 ring-1 ring-emerald-500/20"
                            title="Output schema inscribed on-chain"
                          >
                            <BookOpen className="h-2.5 w-2.5" /> OUT
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs text-muted-foreground/40 ring-1 ring-border/30">
                            OUT
                          </span>
                        )}
                        {d.isCompound && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold bg-primary/8 text-primary ring-1 ring-primary/20">
                            Multi
                          </span>
                        )}
                      </div>
                      {(hasInputSchema || hasOutputSchema) &&
                        tool.agentName && (
                          <p className="text-xs text-muted-foreground/50 mt-0.5 truncate max-w-[140px]">
                            by {tool.agentName}
                          </p>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        {tool.callsSettled.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        <span className="text-foreground font-medium">
                          {d.requiredParams}
                        </span>
                        /{d.paramsCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge active={d.isActive} size="xs" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ExplorerPagination
            page={page}
            total={filtered.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </Card>
      )}

      {/* Schema Viewer Dialog */}
      <Dialog open={!!selectedSchema} onOpenChange={() => setSelectedSchema(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-violet-400" />
              <span className="text-lg font-semibold">Schema: {selectedSchema?.toolName}</span>
            </div>
          </div>
          <div className="mt-4 overflow-auto flex-1">
            <pre className="bg-muted/30 rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto">
              <code>
                {JSON.stringify(selectedSchema?.schema, null, 2)}
              </code>
            </pre>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-mono">{selectedSchema?.toolPda && short(selectedSchema.toolPda, 8, 6)}</span>
              <CopyValueButton value={selectedSchema?.toolPda ?? ''} label="Copy tool PDA" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedSchema(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ExplorerPageShell>
  );
}
