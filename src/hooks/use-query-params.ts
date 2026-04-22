'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo, useTransition } from 'react';

/**
 * useQueryParams — Sync component state with URL search params.
 *
 * Reads initial values from the URL and provides a setter that
 * updates the URL (shallow, no scroll) so filters survive reload/back.
 *
 * @example
 *   const { params, set, setMany, remove } = useQueryParams<{
 *     q: string; sort: 'time' | 'amount'; page: string;
 *   }>();
 *   set('q', 'Alice');
 *   setMany({ sort: 'amount', page: '0' });
 *   remove('q');
 */
export function useQueryParams<T extends Record<string, string> = Record<string, string>>() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  /** Current params as a plain object */
  const params = useMemo(() => {
    const obj = {} as Record<string, string>;
    searchParams.forEach((v, k) => { obj[k] = v; });
    return obj as Partial<T>;
  }, [searchParams]);

  /** Get a single param with optional default */
  const get = useCallback(
    <K extends keyof T & string>(key: K, fallback?: T[K]): T[K] | undefined =>
      (searchParams.get(key) as T[K] | null) ?? fallback,
    [searchParams],
  );

  /** Build new URLSearchParams from current + patch */
  const buildParams = useCallback(
    (patch: Partial<T>, removals?: string[]) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (removals) removals.forEach((k) => next.delete(k));
      return next;
    },
    [searchParams],
  );

  const push = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [pathname, router, startTransition],
  );

  /** Set a single param */
  const set = useCallback(
    <K extends keyof T & string>(key: K, value: T[K] | undefined) => {
      push(buildParams({ [key]: value } as Partial<T>));
    },
    [buildParams, push],
  );

  /** Set multiple params at once */
  const setMany = useCallback(
    (patch: Partial<T>) => { push(buildParams(patch)); },
    [buildParams, push],
  );

  /** Remove one or more params */
  const remove = useCallback(
    (...keys: (keyof T & string)[]) => { push(buildParams({}, keys)); },
    [buildParams, push],
  );

  /** Reset all params */
  const clear = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [pathname, router, startTransition]);

  return { params, get, set, setMany, remove, clear };
}
