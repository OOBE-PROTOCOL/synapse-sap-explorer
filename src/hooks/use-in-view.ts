'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight IntersectionObserver hook for progressive loading.
 *
 * Returns a ref to attach to an element + whether it has been visible at
 * least once. The "once" semantics matches the Solscan pattern: trigger
 * the heavy fetch the first time a row scrolls into view and never
 * re-fire even if the user scrolls past it.
 *
 * Usage:
 *   const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '200px' });
 *   const enrich = useAgentEnrichment(wallet, { enabled: inView });
 */
export function useInView<T extends HTMLElement = HTMLElement>(options?: {
  rootMargin?: string;
  threshold?: number | number[];
  /** Re-trigger when leaving and re-entering. Defaults to false (sticky). */
  reentrant?: boolean;
}): { ref: React.RefObject<T>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (!options?.reentrant) {
              obs.disconnect();
              return;
            }
          } else if (options?.reentrant) {
            setInView(false);
          }
        }
      },
      {
        rootMargin: options?.rootMargin ?? '200px',
        threshold: options?.threshold ?? 0,
      },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [options?.rootMargin, options?.threshold, options?.reentrant]);

  return { ref, inView };
}
