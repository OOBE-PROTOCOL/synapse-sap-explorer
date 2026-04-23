'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { SerializedDiscoveredAgent } from '~/lib/sap/discovery';
import type { StreamEvent } from '~/hooks/use-sap';

/* ═══════════════════════════════════════════════════════════
 * Types
 * ═══════════════════════════════════════════════════════════ */

export type AgentMapEntry = { name: string; pda: string; score: number };
export type AgentMap = Record<string, AgentMapEntry>;

type AgentsData = {
  agents: SerializedDiscoveredAgent[];
  total: number;
};

type SapDataContextValue = {
  /* ── Agent Map (wallet → name/pda/score) ── */
  agentMap: AgentMap;
  agentMapLoading: boolean;
  refreshAgentMap: () => void;

  /* ── Full Agent List ── */
  agents: SerializedDiscoveredAgent[];
  agentsTotal: number;
  agentsLoading: boolean;
  refreshAgents: () => void;

  /* ── Global SSE Event Stream ── */
  events: StreamEvent[];
  sseConnected: boolean;

  /* ── Resolve helpers ── */
  resolveAgentName: (addressOrPda: string) => string | null;
  resolveAgentWallet: (pda: string) => string | null;
};

const SapDataContext = createContext<SapDataContextValue | null>(null);

/* ═══════════════════════════════════════════════════════════
 * Constants
 * ═══════════════════════════════════════════════════════════ */

const AGENT_MAP_POLL = 120_000;   // refresh agent map every 2 min

/* ═══════════════════════════════════════════════════════════
 * Provider
 * ═══════════════════════════════════════════════════════════ */

export function SapDataProvider({ children }: { children: ReactNode }) {
  /* ── Agent Map ───────────────────────────────────────── */
  const [agentMap, setAgentMap] = useState<AgentMap>({});
  const [agentMapLoading, setAgentMapLoading] = useState(true);

  const fetchAgentMap = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/sap/agents/map', { signal });
      if (!res.ok) return;
      const data: AgentMap = await res.json();
      setAgentMap(data);
      setAgentMapLoading(false);
    } catch {
      setAgentMapLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetchAgentMap(ac.signal);
    const id = setInterval(() => fetchAgentMap(ac.signal), AGENT_MAP_POLL);
    return () => { ac.abort(); clearInterval(id); };
  }, [fetchAgentMap]);

  /* ── Full Agent List ─────────────────────────────────── */
  const [agents, setAgents] = useState<SerializedDiscoveredAgent[]>([]);
  const [agentsTotal, setAgentsTotal] = useState(0);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const fetchAgents = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/sap/agents?limit=200', { signal });
      if (!res.ok) return;
      const data: AgentsData = await res.json();
      setAgents(data.agents);
      setAgentsTotal(data.total);
      setAgentsLoading(false);
    } catch {
      setAgentsLoading(false);
    }
  }, []);

  // Keep this dataset on-demand only: avoids an extra heavy global request
  // on every page load because most pages don't consume full agent list context.

  /* ── Global SSE Event Stream (lazy/on-demand) ──── */
  const [events] = useState<StreamEvent[]>([]);
  const [sseConnected] = useState(false);

  /* ── Resolve helpers ─────────────────────────────────── */

  /** Build PDA → wallet reverse map for quick lookup */
  const pdaToWallet = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [wallet, entry] of Object.entries(agentMap)) {
      if (entry.pda) m[entry.pda] = wallet;
    }
    return m;
  }, [agentMap]);

  const resolveAgentName = useCallback(
    (addressOrPda: string): string | null => {
      // Try as wallet first
      const byWallet = agentMap[addressOrPda];
      if (byWallet) return byWallet.name;
      // Try as PDA
      const wallet = pdaToWallet[addressOrPda];
      if (wallet) return agentMap[wallet]?.name ?? null;
      return null;
    },
    [agentMap, pdaToWallet],
  );

  const resolveAgentWallet = useCallback(
    (pda: string): string | null => pdaToWallet[pda] ?? null,
    [pdaToWallet],
  );

  /* ── Memoized context value ──────────────────────────── */

  const value = useMemo<SapDataContextValue>(
    () => ({
      agentMap,
      agentMapLoading,
      refreshAgentMap: () => { fetchAgentMap(); },
      agents,
      agentsTotal,
      agentsLoading,
      refreshAgents: () => { fetchAgents(); },
      events,
      sseConnected,
      resolveAgentName,
      resolveAgentWallet,
    }),
    [
      agentMap, agentMapLoading, fetchAgentMap,
      agents, agentsTotal, agentsLoading, fetchAgents,
      events, sseConnected,
      resolveAgentName, resolveAgentWallet,
    ],
  );

  return (
    <SapDataContext.Provider value={value}>
      {children}
    </SapDataContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Consumer hooks
 * ═══════════════════════════════════════════════════════════ */

function useSapData(): SapDataContextValue {
  const ctx = useContext(SapDataContext);
  if (!ctx) throw new Error('useSapData must be used within <SapDataProvider>');
  return ctx;
}

/** Drop-in replacement for the old useAgentMap() hook */
export function useAgentMapCtx(): { map: AgentMap; loading: boolean } {
  const { agentMap, agentMapLoading } = useSapData();
  return { map: agentMap, loading: agentMapLoading };
}

/** Access the full agent list from context */
export function useAgentsCtx() {
  const { agents, agentsTotal, agentsLoading, refreshAgents } = useSapData();
  return {
    data: agents.length > 0 ? { agents, total: agentsTotal } : null,
    loading: agentsLoading,
    refetch: refreshAgents,
  };
}

/** Access the global SSE event stream */
export function useGlobalEvents() {
  const { events, sseConnected } = useSapData();
  return { events, connected: sseConnected };
}

/** Resolve any address/PDA to an agent name */
export function useResolveAgent() {
  const { resolveAgentName, resolveAgentWallet, agentMap } = useSapData();
  return { resolveAgentName, resolveAgentWallet, agentMap };
}
