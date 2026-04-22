export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/health/endpoints — Agent endpoint health check
 *
 * Pings each agent's x402Endpoint (HEAD, 5s timeout)
 * and returns liveness + latency.
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { selectAllAgents } from '~/lib/db/queries';

type EndpointHealth = {
  agentPda: string;
  name: string | null;
  wallet: string;
  endpoint: string;
  status: 'up' | 'down' | 'timeout' | 'no-endpoint';
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
};

async function checkEndpoint(url: string): Promise<{ status: 'up' | 'down' | 'timeout'; latencyMs: number; statusCode: number | null; error: string | null }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return { status: 'up', latencyMs: Date.now() - start, statusCode: res.status, error: null };
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = (err as Error).name === 'AbortError';
    return {
      status: isTimeout ? 'timeout' : 'down',
      latencyMs: Date.now() - start,
      statusCode: null,
      error: isTimeout ? 'Timeout (5s)' : (err as Error).message,
    };
  }
}

export async function GET() {
  try {
    const allAgents = await selectAllAgents();
    const withEndpoint = allAgents.filter((a) => a.x402Endpoint);

    // Check up to 20 endpoints concurrently
    const BATCH = 20;
    const results: EndpointHealth[] = [];

    // Include agents without endpoints
    for (const a of allAgents) {
      if (!a.x402Endpoint) {
        results.push({
          agentPda: a.pda,
          name: a.name,
          wallet: a.wallet,
          endpoint: '',
          status: 'no-endpoint',
          latencyMs: null,
          statusCode: null,
          error: null,
        });
      }
    }

    for (let i = 0; i < withEndpoint.length; i += BATCH) {
      const batch = withEndpoint.slice(i, i + BATCH);
      const checks = await Promise.allSettled(
        batch.map(async (a) => {
          const check = await checkEndpoint(a.x402Endpoint!);
          return {
            agentPda: a.pda,
            name: a.name,
            wallet: a.wallet,
            endpoint: a.x402Endpoint!,
            ...check,
          } satisfies EndpointHealth;
        }),
      );

      for (const c of checks) {
        if (c.status === 'fulfilled') results.push(c.value);
      }
    }

    const up = results.filter((r) => r.status === 'up').length;
    const down = results.filter((r) => r.status === 'down').length;
    const timeout = results.filter((r) => r.status === 'timeout').length;
    const noEndpoint = results.filter((r) => r.status === 'no-endpoint').length;
    const avgLatency = results.filter((r) => r.latencyMs !== null).length > 0
      ? Math.round(results.filter((r) => r.latencyMs !== null).reduce((s, r) => s + r.latencyMs!, 0) / results.filter((r) => r.latencyMs !== null).length)
      : null;

    return NextResponse.json({
      endpoints: results.sort((a, b) => {
        const order = { up: 0, timeout: 1, down: 2, 'no-endpoint': 3 };
        return order[a.status] - order[b.status];
      }),
      summary: { total: results.length, up, down, timeout, noEndpoint, avgLatency },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
