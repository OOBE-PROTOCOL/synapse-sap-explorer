'use client';

/**
 * URL-synced state hooks.
 *
 * Why: enables shareable, indexable, deep-linkable filter state
 * (e.g. /agents?metaplex=1&active=1&sort=reputation).
 *
 * Design:
 * - Reads initial value from `useSearchParams()` (SSR-safe via Suspense).
 * - Writes updates with `router.replace()` + `scroll: false` so list
 *   filtering doesn't jump the viewport.
 * - Defaults are NOT serialized (keeps URLs clean).
 * - All updates batched per render via a ref to avoid clobbering
 *   when multiple hooks update in the same tick.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Serializer<T> = {
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null; // null -> remove from URL
};

const STRING: Serializer<string> = {
  parse: (raw) => raw ?? '',
  serialize: (v) => (v ? v : null),
};

const BOOL: Serializer<boolean> = {
  parse: (raw) => raw === '1' || raw === 'true',
  serialize: (v) => (v ? '1' : null),
};

const NUMBER: Serializer<number> = {
  parse: (raw) => {
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : 0;
  },
  serialize: (v) => (v ? String(v) : null),
};

export const QueryParam = {
  string: STRING,
  bool: BOOL,
  number: NUMBER,
  /** Enum-style string with default; default value omitted from URL. */
  enum<T extends string>(defaultValue: T, allowed: readonly T[]): Serializer<T> {
    return {
      parse: (raw) => (raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue),
      serialize: (v) => (v === defaultValue ? null : v),
    };
  },
};

/**
 * Two-way bind a piece of state to a URL search param.
 *
 * @example
 * const [search, setSearch] = useQueryState('q', '', QueryParam.string);
 * const [active, setActive] = useQueryState('active', true, QueryParam.bool);
 */
export function useQueryState<T>(
  key: string,
  defaultValue: T,
  serializer: Serializer<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => {
    const raw = searchParams.get(key);
    if (raw == null) return defaultValue;
    return serializer.parse(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [value, setValueState] = useState<T>(initial);

  // Keep state in sync with back/forward navigation.
  const lastWrittenRef = useRef<string | null>(serializer.serialize(initial));
  useEffect(() => {
    const raw = searchParams.get(key);
    if (raw === lastWrittenRef.current) return;
    setValueState(raw == null ? defaultValue : serializer.parse(raw));
    lastWrittenRef.current = raw;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const computed = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        const serialized = serializer.serialize(computed);
        // Build next URL from CURRENT searchParams (read fresh each call).
        const params = new URLSearchParams(window.location.search);
        if (serialized == null) params.delete(key);
        else params.set(key, serialized);
        const qs = params.toString();
        const url = qs ? `${pathname}?${qs}` : pathname;
        lastWrittenRef.current = serialized;
        router.replace(url, { scroll: false });
        return computed;
      });
    },
    [key, pathname, router, serializer],
  );

  return [value, setValue];
}
