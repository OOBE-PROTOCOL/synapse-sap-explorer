export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/aggregate-reputation
 *
 * Returns the typed `AggregatedReputation` from the SDK
 * (FairScale × SAP blended). All shape/weights/cache logic
 * lives in `@oobe-protocol-labs/synapse-sap-sdk@^0.11.0`
 * (`FairScaleRegistry.aggregate`); this route only forwards
 * query params.
 *
 * Query params (all optional):
 *   - sapWeight       (0..1, default 0.5)
 *   - fsWeight        (0..1, default 0.5)
 *   - minFeedbacks    (int, default 0)
 *   - task            (defi_execution | trust_focused | work_focused | hiring)
 *   - strict          (true → 5xx if neither source available)
 * ────────────────────────────────────────────── */

import { synapseResponse } from '~/lib/synapse/client';
import { aggregateReputation } from '~/lib/sap/aggregate-reputation';
import type { AggregateOptions } from '~/lib/sap/sdk-compat';

const VALID_TASKS = new Set([
  'defi_execution',
  'trust_focused',
  'work_focused',
  'hiring',
]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;
    const url = new URL(req.url);
    const sapWeight = Number(url.searchParams.get('sapWeight') ?? 0.5);
    const fsWeight = Number(url.searchParams.get('fsWeight') ?? 0.5);
    const minFeedbacks = Number(url.searchParams.get('minFeedbacks') ?? 0);
    const taskRaw = url.searchParams.get('task');
    const strict = url.searchParams.get('strict') === 'true';

    if (
      !Number.isFinite(sapWeight) ||
      !Number.isFinite(fsWeight) ||
      sapWeight < 0 ||
      fsWeight < 0 ||
      Math.abs(sapWeight + fsWeight - 1) > 0.05
    ) {
      return synapseResponse(
        { error: 'sapWeight + fsWeight must equal 1.0 (±0.05)' },
        { status: 400 },
      );
    }

    const opts: AggregateOptions = {
      weights: { sap: sapWeight, fairscale: fsWeight },
      require: { sapMinFeedbacks: minFeedbacks },
      strict,
      task:
        taskRaw && VALID_TASKS.has(taskRaw)
          ? (taskRaw as AggregateOptions['task'])
          : undefined,
    };

    const result = await aggregateReputation(wallet, opts);

    return synapseResponse(result, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' },
    });
  } catch (err: unknown) {
    console.error('[agent/wallet/aggregate-reputation]', err);
    return synapseResponse(
      {
        error:
          (err as Error).message ?? 'Failed to compute aggregated reputation',
      },
      { status: 500 },
    );
  }
}
