// src/indexer/refresh-queue.ts — Coalesced refresh queue for touched entities
import type { EntityGroup } from '~/indexer/entity-impact';
import { syncAgents } from '~/indexer/sync-agents';
import { syncTools } from '~/indexer/sync-tools';
import { syncEscrows } from '~/indexer/sync-escrows';
import { syncAttestations } from '~/indexer/sync-attestations';
import { syncFeedbacks } from '~/indexer/sync-feedbacks';
import { syncVaults } from '~/indexer/sync-vaults';
import { log, logErr } from '~/indexer/utils';

const pending = new Set<EntityGroup>();
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;

const FLUSH_DEBOUNCE_MS = 3500;

async function runOne(entity: EntityGroup) {
  switch (entity) {
    case 'agents':
      await syncAgents();
      break;
    case 'tools':
      await syncTools();
      break;
    case 'escrows':
      await syncEscrows();
      break;
    case 'attestations':
      await syncAttestations();
      break;
    case 'feedbacks':
      await syncFeedbacks();
      break;
    case 'vaults':
      await syncVaults();
      break;
  }
}

export function enqueueEntityRefresh(entity: EntityGroup) {
  pending.add(entity);

  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushEntityRefreshQueue();
  }, FLUSH_DEBOUNCE_MS);
}

export function enqueueEntityRefreshMany(entities: Iterable<EntityGroup>) {
  for (const e of entities) pending.add(e);
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushEntityRefreshQueue();
  }, FLUSH_DEBOUNCE_MS);
}

export async function flushEntityRefreshQueue() {
  if (flushing) return;
  if (pending.size === 0) return;

  flushing = true;
  const targets = Array.from(pending);
  pending.clear();

  log('refresh', `Flushing touched entities: ${targets.join(', ')}`);

  try {
    // Root-first ordering to respect FKs
    if (targets.includes('agents')) await runOne('agents');
    if (targets.includes('tools')) await runOne('tools');
    if (targets.includes('escrows')) await runOne('escrows');
    if (targets.includes('attestations')) await runOne('attestations');
    if (targets.includes('feedbacks')) await runOne('feedbacks');
    if (targets.includes('vaults')) await runOne('vaults');
  } catch (e: any) {
    logErr('refresh', `Flush failed: ${e.message}`);
  } finally {
    flushing = false;
  }
}

