export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * POST /api/sap/agents/aggregate-reputation/batch
 *
 * Body: { wallets: string[]; weights?, minFeedbacks?, task? }
 * Max 25 wallets per call (mirrors FairScale `/v1/score/batch`).
 *
 * Returns: { results: BatchAggregateEntry[] } — each entry is
 * either { wallet, result: AggregatedReputation } or
 * { wallet, result: null, error }.
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { aggregateReputationBatch } from '~/lib/sap/aggregate-reputation';
import type { AggregateOptions } from '~/lib/sap/sdk-compat';

const MAX_WALLETS = 25;
const VALID_TASKS = new Set([
  'defi_execution',
  'trust_focused',
  'work_focused',
  'hiring',
]);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          wallets?: unknown;
          weights?: { sap?: number; fairscale?: number };
          minFeedbacks?: number;
          task?: string;
        }
      | null;

    if (!body || !Array.isArray(body.wallets)) {
      return synapseResponse(
        { error: 'body.wallets must be a string array' },
        { status: 400 },
      );
    }

    const wallets = body.wallets.filter(
      (w): w is string => typeof w === 'string' && w.length > 0,
    );
    if (wallets.length === 0) {
      return synapseResponse({ results: [] });
    }
    if (wallets.length > MAX_WALLETS) {
      return synapseResponse(
        { error: `max ${MAX_WALLETS} wallets per batch` },
        { status: 400 },
      );
    }

    const sapW = Number(body.weights?.sap ?? 0.5);
    const fsW = Number(body.weights?.fairscale ?? 0.5);
    if (
      !Number.isFinite(sapW) ||
      !Number.isFinite(fsW) ||
      sapW < 0 ||
      fsW < 0 ||
      Math.abs(sapW + fsW - 1) > 0.05
    ) {
      return synapseResponse(
        { error: 'weights.sap + weights.fairscale must equal 1.0 (±0.05)' },
        { status: 400 },
      );
    }

    const opts: AggregateOptions = {
      weights: { sap: sapW, fairscale: fsW },
      require: { sapMinFeedbacks: Number(body.minFeedbacks ?? 0) },
      task:
        body.task && VALID_TASKS.has(body.task)
          ? (body.task as AggregateOptions['task'])
          : undefined,
    };

    const results = await aggregateReputationBatch(wallets, opts);

    return synapseResponse(
      { results },
      {
        headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=600' },
      },
    );
  } catch (err: unknown) {
    console.error('[agent/aggregate-reputation/batch]', err);
    return synapseResponse(
      { error: (err as Error).message ?? 'batch_failed' },
      { status: 500 },
    );
  }
}
