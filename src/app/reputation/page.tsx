'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ScoreRing, Address, Skeleton, EmptyState, PageHeader } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import { useAgents, useFeedbacks } from '~/hooks/use-sap';

export default function ReputationPage() {
  const router = useRouter();
  const { data, loading, error } = useAgents({ limit: '100' });
  const { data: feedbackData } = useFeedbacks();
  const [onlyActive, setOnlyActive] = useState(false);

  const ranked = useMemo(() => {
    if (!data?.agents) return [];
    return data.agents
      .filter((a) => a.identity)
      .filter((a) => !onlyActive || a.identity!.isActive)
      .map((a) => {
        const id = a.identity!;
        const agentFeedbacks = feedbackData?.feedbacks.filter(
          (f) => f.agent === a.pda && !f.isRevoked,
        ) ?? [];
        const avgScore = agentFeedbacks.length > 0
          ? agentFeedbacks.reduce((sum, f) => sum + f.score, 0) / agentFeedbacks.length
          : 0;
        return {
          pda: a.pda,
          wallet: id.wallet,
          name: id.name,
          description: id.description,
          reputationScore: id.reputationScore,
          totalFeedbacks: id.totalFeedbacks,
          totalCallsServed: id.totalCallsServed,
          avgLatencyMs: id.avgLatencyMs,
          uptimePercent: id.uptimePercent,
          isActive: id.isActive,
          protocols: id.protocols,
          feedbackCount: agentFeedbacks.length,
          avgFeedbackScore: avgScore,
          capabilities: id.capabilities.length,
        };
      })
      .sort((a, b) => b.reputationScore - a.reputationScore);
  }, [data, feedbackData, onlyActive]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Reputation Leaderboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Agents ranked by on-chain reputation score (0 -- 10,000)</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{ranked.length} agents</span>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="active-only"
          checked={onlyActive}
          onCheckedChange={(v) => setOnlyActive(v === true)}
        />
        <Label htmlFor="active-only" className="text-xs text-muted-foreground cursor-pointer">
          Active only
        </Label>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : ranked.length === 0 ? (
        <EmptyState message="No agents to rank" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right w-20">Score</TableHead>
                <TableHead className="text-right w-20">Calls</TableHead>
                <TableHead className="text-right w-20">Reviews</TableHead>
                <TableHead className="text-right w-20 hidden sm:table-cell">Uptime</TableHead>
                <TableHead className="text-right w-20 hidden sm:table-cell">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((agent, i) => (
                <TableRow
                  key={agent.pda}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/agents/${agent.wallet}`)}
                >
                  <TableCell className="text-center">
                    {i < 3 ? (
                      <span className={`text-sm font-bold tabular-nums ${
                        i === 0 ? 'text-amber-500' : i === 1 ? 'text-zinc-400' : 'text-amber-700 dark:text-amber-600'
                      }`}>
                        {i + 1}
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ScoreRing score={agent.reputationScore} size={36} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${agent.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Address value={agent.pda} />
                          {agent.protocols.length > 0 && (
                            <span className="text-[10px] text-muted-foreground/50">{agent.protocols.length} protocol{agent.protocols.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">{agent.reputationScore.toLocaleString()}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="text-sm tabular-nums text-foreground">{Number(agent.totalCallsServed).toLocaleString()}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="text-sm tabular-nums text-foreground">{agent.totalFeedbacks}</p>
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    <p className="text-sm tabular-nums text-foreground">{agent.uptimePercent}%</p>
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    <p className="text-sm tabular-nums text-foreground">{agent.avgLatencyMs}ms</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
