// src/indexer/refresh-queue.ts — Coalesced targeted account refresh queue
import { log, logErr } from '~/indexer/utils';
import { refreshAccountsByPdas } from '~/indexer/entity-delta';

const pendingPdas = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;

const FLUSH_DEBOUNCE_MS = 3500;

export function enqueuePdaRefresh(pda: string) {
  if (!pda) return;
  pendingPdas.add(pda);

  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushPdaRefreshQueue();
  }, FLUSH_DEBOUNCE_MS);
}

export function enqueuePdaRefreshMany(pdas: Iterable<string>) {
  for (const pda of pdas) {
    if (!pda) continue;
    pendingPdas.add(pda);
  }
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushPdaRefreshQueue();
  }, FLUSH_DEBOUNCE_MS);
}

export async function flushPdaRefreshQueue() {
  if (flushing) return;
  if (pendingPdas.size === 0) return;

  flushing = true;
  const targets = Array.from(pendingPdas);
  pendingPdas.clear();

  log('refresh', `Flushing targeted PDAs: ${targets.length}`);

  try {
    await refreshAccountsByPdas(targets);
  } catch (e: unknown) {
    logErr('refresh', `Flush failed: ${(e as Error).message}`);
  } finally {
    flushing = false;
  }
}
