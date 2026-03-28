export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/escrows/events — Escrow lifecycle events
 *
 * Query params:
 *   ?escrow=<pda>  — filter by escrow PDA
 *   ?limit=100     — max events to return
 *
 * Events are extracted from indexed transactions and stored in DB.
 * ────────────────────────────────────────────── */

import { NextRequest } from 'next/server';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { peek, swr } from '~/lib/cache';
import {
  selectEscrowEvents,
  selectAllEscrows,
  upsertEscrowEvents,
} from '~/lib/db/queries';
import { dbEscrowEventToApi } from '~/lib/db/mappers';
import { extractEscrowEvents, type TxForEventExtraction } from '~/lib/escrow-events';
import { selectTransactions, selectTxDetails } from '~/lib/db/queries';

/**
 * Scan recent transactions for escrow events and upsert them.
 * This is the "event extraction" background job.
 */
async function extractAndStoreEvents() {
  // Get all known escrow PDAs
  const escrows = await selectAllEscrows();
  const escrowPdas = new Set(escrows.map((e) => e.pda));
  if (escrowPdas.size === 0) return [];

  // Get recent transactions
  const txRows = await selectTransactions(200);

  // Filter to only escrow-related txs
  const escrowTxs = txRows.filter((tx) =>
    (tx.sapInstructions ?? []).some((ix) =>
      /escrow|settle|deposit|withdraw|close/i.test(ix),
    ),
  );

  if (escrowTxs.length === 0) return [];

  // For each tx, try to get detail (accountKeys) for PDA matching
  const events: Parameters<typeof upsertEscrowEvents>[0] = [];

  for (const tx of escrowTxs) {
    const detail = await selectTxDetails(tx.signature);
    const accountKeys = detail?.accountKeys as any[] | undefined;

    const txForExtraction: TxForEventExtraction = {
      signature: tx.signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      signer: tx.signer,
      sapInstructions: tx.sapInstructions ?? [],
      accountKeys: accountKeys ?? undefined,
    };

    const extracted = extractEscrowEvents(txForExtraction, escrowPdas);
    for (const ev of extracted) {
      // Enrich with escrow data
      const escrow = escrows.find((e) => e.pda === ev.escrowPda);
      events.push({
        escrowPda: ev.escrowPda,
        txSignature: ev.txSignature,
        eventType: ev.eventType,
        slot: ev.slot,
        blockTime: ev.blockTime,
        signer: ev.signer,
        agentPda: escrow?.agentPda ?? ev.agentPda,
        depositor: escrow?.depositor ?? ev.depositor,
        indexedAt: new Date(),
      });
    }
  }

  if (events.length > 0) {
    await upsertEscrowEvents(events);
  }
  return events;
}

export const GET = withSynapseError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const escrowPda = searchParams.get('escrow') ?? undefined;
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500);

  const cacheKey = escrowPda ? `escrow-events:${escrowPda}` : 'escrow-events:all';

  // Step 1: cache peek
  const cached = peek<any>(cacheKey);
  if (cached) {
    // Fire-and-forget extraction + cache refresh
    swr(cacheKey, async () => {
      await extractAndStoreEvents();
      const rows = await selectEscrowEvents(escrowPda, limit);
      return { events: rows.map(dbEscrowEventToApi), total: rows.length };
    }, { ttl: 30_000, swr: 120_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  // Step 2: DB read (fast)
  try {
    const rows = await selectEscrowEvents(escrowPda, limit);
    if (rows.length > 0) {
      const result = { events: rows.map(dbEscrowEventToApi), total: rows.length };
      // Fire-and-forget extraction
      swr(cacheKey, async () => {
        await extractAndStoreEvents();
        const fresh = await selectEscrowEvents(escrowPda, limit);
        return { events: fresh.map(dbEscrowEventToApi), total: fresh.length };
      }, { ttl: 30_000, swr: 120_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[escrow-events] DB read failed:', (e as Error).message);
  }

  // Step 3: Cold start — extract events then read
  try {
    await extractAndStoreEvents();
  } catch (e) {
    console.warn('[escrow-events] Event extraction failed:', (e as Error).message);
  }

  const rows = await selectEscrowEvents(escrowPda, limit);
  const result = { events: rows.map(dbEscrowEventToApi), total: rows.length };
  swr(cacheKey, () => Promise.resolve(result), { ttl: 30_000, swr: 120_000 }).catch(() => {});
  return synapseResponse(result);
});
