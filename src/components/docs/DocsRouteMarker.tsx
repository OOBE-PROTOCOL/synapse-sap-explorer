'use client';

import { useEffect } from 'react';

/**
 * Marks <html> as `.docs-active` while a docs page is mounted, so the
 * global mobile overrides in globals.css can be scoped to skip the
 * fumadocs subtree (which has its own mobile layout).
 */
export function DocsRouteMarker() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.add('docs-active');
    return () => document.documentElement.classList.remove('docs-active');
  }, []);
  return null;
}
