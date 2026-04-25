"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Vault, Database, FileText, Clock, Search, X } from "lucide-react";
import { ExplorerPageShell, ExplorerMetric, EmptyState } from "~/components/ui";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useVaults } from "~/hooks/use-sap";
import { timeAgo } from "~/lib/format";
import { cn } from "~/lib/utils";

export default function VaultsPage() {
  const router = useRouter();
  const { data, loading, error } = useVaults();
  const [search, setSearch] = useState("");

  const vaults = useMemo(() => data?.vaults ?? [], [data]);

  const stats = useMemo(() => {
    const total = vaults.length;
    const totalSessions = vaults.reduce((s, v) => s + v.totalSessions, 0);
    const totalInscriptions = vaults.reduce(
      (s, v) => s + Number(v.totalInscriptions),
      0,
    );
    const totalBytes = vaults.reduce(
      (s, v) => s + Number(v.totalBytesInscribed),
      0,
    );
    return { total, totalSessions, totalInscriptions, totalBytes };
  }, [vaults]);

  const filtered = useMemo(() => {
    if (!search) return vaults;
    const q = search.toLowerCase();
    return vaults.filter(
      (v) =>
        v.pda.toLowerCase().includes(q) ||
        v.agent.toLowerCase().includes(q) ||
        v.wallet.toLowerCase().includes(q),
    );
  }, [vaults, search]);

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <ExplorerPageShell
      title="Vaults"
      subtitle="On-chain memory vaults — agent inscription storage with session tracking"
      icon={<Vault className="h-5 w-5" />}
      badge={
        <Badge variant="outline" className="text-xs tabular-nums">
          {data?.total ?? 0} vaults
        </Badge>
      }
      actions={
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PDA, agent, wallet…"
            className="h-9 pl-9 pr-8 text-xs"
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
      }
      stats={
        !loading ? (
          <>
            <ExplorerMetric
              icon={<Vault className="h-3.5 w-3.5" />}
              label="Total Vaults"
              value={stats.total}
              accent="primary"
            />
            <ExplorerMetric
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Total Sessions"
              value={stats.totalSessions}
              accent="emerald"
            />
            <ExplorerMetric
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Inscriptions"
              value={stats.totalInscriptions.toLocaleString()}
              accent="cyan"
            />
            <ExplorerMetric
              icon={<Database className="h-3.5 w-3.5" />}
              label="Data Inscribed"
              value={formatBytes(stats.totalBytes)}
              accent="amber"
            />
          </>
        ) : undefined
      }
    >
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
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
            search ? "No vaults match your search" : "No vaults found on-chain"
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vault PDA</TableHead>
                <TableHead className="hidden md:table-cell">Agent</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  Inscriptions
                </TableHead>
                <TableHead className="text-right hidden lg:table-cell">
                  Data Size
                </TableHead>
                <TableHead className="text-right hidden lg:table-cell">
                  Memory Layers
                </TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((vault) => {
                const layers = vault.memoryLayers;
                return (
                  <TableRow
                    key={vault.pda}
                    className="cursor-pointer hover:bg-muted/30 transition-colors group"
                    onClick={() => router.push(`/agents/${vault.wallet}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Vault className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {vault.pda.slice(0, 8)}…{vault.pda.slice(-6)}
                          </span>
                          {vault.latestTxTime && (
                            <p className="text-xs text-muted-foreground/50 mt-0.5">
                              Last activity {timeAgo(vault.latestTxTime)}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">
                        {vault.wallet.slice(0, 4)}…{vault.wallet.slice(-4)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        {vault.totalSessions}
                      </span>
                      {vault.sessionsSummary.filter((s) => !s.isClosed).length >
                        0 && (
                        <span className="ml-1.5 text-[10px] text-emerald-400">
                          {
                            vault.sessionsSummary.filter((s) => !s.isClosed)
                              .length
                          }{" "}
                          open
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      <span className="text-sm tabular-nums">
                        {Number(vault.totalInscriptions).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right hidden lg:table-cell">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatBytes(Number(vault.totalBytesInscribed))}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {[
                          { key: "hasInscriptions", label: "INS" },
                          { key: "hasLedger", label: "LDG" },
                          { key: "hasEpochPages", label: "EPC" },
                          { key: "hasCheckpoints", label: "CKP" },
                          { key: "hasDelegates", label: "DEL" },
                        ].map(({ key, label }) => (
                          <span
                            key={key}
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ring-1",
                              layers[key as keyof typeof layers]
                                ? "bg-primary/10 text-primary ring-primary/20"
                                : "text-muted-foreground/30 ring-border/20",
                            )}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {vault.createdAt
                          ? new Date(
                              Number(vault.createdAt) *
                                (Number(vault.createdAt) > 1e12 ? 1 : 1000),
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </ExplorerPageShell>
  );
}
