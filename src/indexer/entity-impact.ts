// src/indexer/entity-impact.ts — Heuristic mapping tx -> touched SAP entity groups

export type EntityGroup =
  | 'agents'
  | 'tools'
  | 'escrows'
  | 'attestations'
  | 'feedbacks'
  | 'vaults';

/**
 * Determine which entity groups should be refreshed based on SAP instruction names.
 * This is intentionally heuristic; full consistency is guaranteed by periodic fallback polling.
 */
export function inferTouchedEntities(sapInstructions: string[]): Set<EntityGroup> {
  const touched = new Set<EntityGroup>();

  for (const raw of sapInstructions) {
    const ix = raw.toLowerCase();

    if (ix.includes('tool')) touched.add('tools');
    if (ix.includes('escrow') || ix.includes('settle') || ix.includes('deposit')) touched.add('escrows');
    if (ix.includes('attest')) touched.add('attestations');
    if (ix.includes('feedback') || ix.includes('review') || ix.includes('reputation')) touched.add('feedbacks');
    if (ix.includes('vault') || ix.includes('memory') || ix.includes('inscription')) touched.add('vaults');
    if (ix.includes('agent') || ix.includes('register') || ix.includes('profile') || ix.includes('stats')) touched.add('agents');
  }

  // If we only see generic SAP calls, refresh at least agents (most central relation root).
  if (touched.size === 0) touched.add('agents');

  return touched;
}

