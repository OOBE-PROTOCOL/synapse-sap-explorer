/* ──────────────────────────────────────────────────────────
 * useSap — Client-side hooks to fetch SAP data from API routes
 *
 * Uses native fetch + React state. No external data-fetching lib.
 * All data comes from the real SAP SDK via API routes (server-only).
 * ────────────────────────────────────────────────────────── */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  SerializedDiscoveredAgent,
  SerializedAgentProfile,
  SerializedNetworkOverview,
  SerializedDiscoveredTool,
  SerializedToolDescriptor,
  SerializedEscrow,
  SerializedAttestation,
  SerializedFeedback,
  SerializedVault,
  GraphData,
} from '~/lib/sap/discovery';

/* ── Generic fetcher ──────────────────────────────────── */

type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
};

function useFetch<T>(url: string | null): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!url) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) { setData(json); setLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) { setError(err.message); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [url, tick]);

  return { data, error, loading, refetch };
}

/* ── Typed hooks ──────────────────────────────────────── */

/** Response from /api/sap/agents */
type AgentsResponse = {
  agents: SerializedDiscoveredAgent[];
  total: number;
};

/** Response from /api/sap/agents/[wallet] */
type AgentProfileResponse = {
  profile: SerializedAgentProfile;
};

/** Response from /api/sap/analytics */
type AnalyticsResponse = {
  categories: Array<{ category: string; categoryNum: number; toolCount: number }>;
};

/** Response from /api/sap/transactions */
type TransactionsResponse = {
  transactions: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    err: boolean;
    memo: string | null;
  }>;
};

/** Response from /api/sap/tools */
type ToolsResponse = {
  tools: SerializedDiscoveredTool[];
  categories: Array<{ category: string; categoryNum: number; toolCount: number }>;
  total: number;
};

export function useAgents(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useFetch<AgentsResponse>(`/api/sap/agents${qs}`);
}

export function useAgent(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}` : null;
  return useFetch<AgentProfileResponse>(url);
}

export function useMetrics() {
  return useFetch<SerializedNetworkOverview>('/api/sap/metrics');
}

export function useAnalytics() {
  return useFetch<AnalyticsResponse>('/api/sap/analytics');
}

export function useGraph(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useFetch<GraphData>(`/api/sap/graph${qs}`);
}

export function useTransactions(limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return useFetch<TransactionsResponse>(`/api/sap/transactions${qs}`);
}

export function useTools(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useFetch<ToolsResponse>(`/api/sap/tools${qs}`);
}

/* ── New entity hooks ─────────────────────────────────── */

/** Response from /api/sap/escrows */
type EscrowsResponse = {
  escrows: SerializedEscrow[];
  total: number;
};

/** Response from /api/sap/attestations */
type AttestationsResponse = {
  attestations: SerializedAttestation[];
  total: number;
};

/** Response from /api/sap/feedbacks */
type FeedbacksResponse = {
  feedbacks: SerializedFeedback[];
  total: number;
};

/** Response from /api/sap/vaults */
type VaultsResponse = {
  vaults: SerializedVault[];
  total: number;
};

export function useEscrows() {
  return useFetch<EscrowsResponse>('/api/sap/escrows');
}

export function useAttestations() {
  return useFetch<AttestationsResponse>('/api/sap/attestations');
}

export function useFeedbacks() {
  return useFetch<FeedbacksResponse>('/api/sap/feedbacks');
}

export function useVaults() {
  return useFetch<VaultsResponse>('/api/sap/vaults');
}
