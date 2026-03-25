'use client';

/* ──────────────────────────────────────────────────────────
 * Reputation Page — Leaderboard sorted by reputation score
 *
 * Shows all agents ranked by on-chain reputation (0–10000),
 * including calls served, feedbacks received, and protocols.
 * ────────────────────────────────────────────────────────── */

import { useState, useMemo } from 'react';
import { PageHeader, Skeleton, EmptyState, ScoreRing, Address, StatusBadge, ProtocolBadge } from '~/components/ui';
import { useAgents, useFeedbacks } from '~/hooks/use-sap';

export default function ReputationPage() {
  const { data, loading, error } = useAgents({ limit: '100' });
  const { data: feedbackData } = useFeedbacks();
  const [onlyActive, setOnlyActive] = useState(false);

  /* ── Sort by reputation, enrich with feedback counts ── */
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
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Reputation Leaderboard" subtitle="Agents ranked by on-chain reputation score (0–10,000)">
        <span className="text-[10px] tabular-nums text-white/25">
          {ranked.length} agents
        </span>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-white/35 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="accent-blue-500"
          />
          Active only
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card-static p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : ranked.length === 0 ? (
        <EmptyState message="No agents to rank" />
      ) : (
        <div className="space-y-2">
          {ranked.map((agent, i) => (
            <a
              key={agent.pda}
              href={`/agents/${agent.wallet}`}
              className="glass-card group flex items-center gap-4 py-4 hover:bg-white/[0.02] transition-colors"
            >
              {/* Rank */}
              <div className="flex h-10 w-10 items-center justify-center shrink-0">
                {i < 3 ? (
                  <span className={`text-lg font-black tabular-nums ${
                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : 'text-amber-600'
                  }`}>
                    {i + 1}
                  </span>
                ) : (
                  <span className="text-sm font-mono text-white/20">{i + 1}</span>
                )}
              </div>

              {/* Score */}
              <ScoreRing score={agent.reputationScore} size={48} />

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
                  <StatusBadge active={agent.isActive} size="xs" />
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Address value={agent.pda} />
                  {agent.protocols.slice(0, 3).map((p) => (
                    <ProtocolBadge key={p} protocol={p} />
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-6 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-white">{Number(agent.totalCallsServed).toLocaleString()}</p>
                  <p className="text-[9px] text-white/25 uppercase tracking-wider">Calls</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-white">{agent.totalFeedbacks}</p>
                  <p className="text-[9px] text-white/25 uppercase tracking-wider">Reviews</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-white">{agent.uptimePercent}%</p>
                  <p className="text-[9px] text-white/25 uppercase tracking-wider">Uptime</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-white">{agent.avgLatencyMs}ms</p>
                  <p className="text-[9px] text-white/25 uppercase tracking-wider">Latency</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
