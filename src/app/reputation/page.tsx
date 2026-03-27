'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Trophy, Medal } from 'lucide-react';
import { PageHeader, Skeleton, EmptyState, ScoreRing, Address, StatusBadge, ProtocolBadge } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import { useAgents, useFeedbacks } from '~/hooks/use-sap';

export default function ReputationPage() {
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
      <PageHeader title="Reputation Leaderboard" subtitle="Agents ranked by on-chain reputation score (0–10,000)">
        <Badge variant="secondary" className="tabular-nums">{ranked.length} agents</Badge>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="active-only"
            checked={onlyActive}
            onCheckedChange={(v) => setOnlyActive(v === true)}
          />
          <Label htmlFor="active-only" className="text-sm text-muted-foreground cursor-pointer">
            Active only
          </Label>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
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
                <TableHead className="w-14">#</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Reviews</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Uptime</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((agent, i) => (
                <TableRow key={agent.pda}>
                  <Link
                    href={`/agents/${agent.wallet}`}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      {i < 3 ? (
                        <span className={`text-lg font-black tabular-nums ${
                          i === 0 ? 'text-amber-500' : i === 1 ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-600'
                        }`}>
                          {i + 1}
                        </span>
                      ) : (
                        <span className="text-sm font-mono text-muted-foreground">{i + 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ScoreRing score={agent.reputationScore} size={40} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
                            <StatusBadge active={agent.isActive} size="xs" />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Address value={agent.pda} />
                            {agent.protocols.slice(0, 3).map((p) => (
                              <ProtocolBadge key={p} protocol={p} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="text-sm font-bold tabular-nums text-foreground">{Number(agent.totalCallsServed).toLocaleString()}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="text-sm font-bold tabular-nums text-foreground">{agent.totalFeedbacks}</p>
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      <p className="text-sm font-bold tabular-nums text-foreground">{agent.uptimePercent}%</p>
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      <p className="text-sm font-bold tabular-nums text-foreground">{agent.avgLatencyMs}ms</p>
                    </TableCell>
                  </Link>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
