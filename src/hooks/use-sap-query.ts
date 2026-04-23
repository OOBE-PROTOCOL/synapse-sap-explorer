'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';


export type SapQueryOptions<T> = {
  /** TanStack Query key (must be unique per endpoint). */
  queryKey: readonly unknown[];
  /** URL to fetch (null = disabled). */
  url: string | null;
  /** Polling interval in ms. 0 = no polling. */
  pollInterval?: number;
  /** Extra TanStack Query options. */
  queryOptions?: Partial<UseQueryOptions<T, Error>>;
};

async function sapFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generic SAP data hook powered by TanStack Query.
 *
 * @example
 *   const { data, isLoading, error, refetch } = useSapQuery<AgentsResponse>({
 *     queryKey: ['sap', 'agents', params],
 *     url: `/api/sap/agents?${qs}`,
 *     pollInterval: 30_000,
 *   });
 */
export function useSapQuery<T>({ queryKey, url, pollInterval, queryOptions }: SapQueryOptions<T>) {
  const result = useQuery<T, Error>({
    queryKey,
    queryFn: () => sapFetcher<T>(url!),
    enabled: url !== null,
    refetchInterval: pollInterval && pollInterval > 0 ? pollInterval : false,
    ...queryOptions,
  });

  return {
    data: result.data ?? null,
    error: result.error?.message ?? null,
    loading: result.isLoading,
    isFetching: result.isFetching,
    refetch: result.refetch,
  };
}
