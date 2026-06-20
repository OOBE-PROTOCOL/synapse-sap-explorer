export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

const MAX_TOOLS_PER_BATCH = 50;
const CONCURRENCY = 4;

type PrefetchResult = {
  pda: string;
  ok: boolean;
  total: number;
  source?: string;
  warning?: string;
  error?: string;
};

function uniqueToolPdas(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== 'string') continue;
    try {
      const pda = new PublicKey(value).toBase58();
      if (!seen.has(pda)) {
        seen.add(pda);
        out.push(pda);
      }
    } catch {
      // Skip invalid entries; response remains successful for valid tools.
    }
    if (out.length >= MAX_TOOLS_PER_BATCH) break;
  }
  return out;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await fn(current));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const toolPdas = uniqueToolPdas(body?.toolPdas ?? body?.tools ?? []);

  if (toolPdas.length === 0) {
    return NextResponse.json({ total: 0, scanned: 0, results: [] });
  }

  const origin = new URL(req.url).origin;
  const results = await mapLimit<string, PrefetchResult>(
    toolPdas,
    CONCURRENCY,
    async (pda) => {
      try {
        const response = await fetch(
          `${origin}/api/sap/tools/${encodeURIComponent(pda)}/schemas?deep=1`,
          {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(25_000),
          },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            pda,
            ok: false,
            total: 0,
            error: String(json?.error ?? response.statusText),
          };
        }
        return {
          pda,
          ok: true,
          total: Number(json?.total ?? json?.schemas?.length ?? 0),
          source: typeof json?.source === 'string' ? json.source : undefined,
          warning: typeof json?.warning === 'string' ? json.warning : undefined,
        };
      } catch (error) {
        return {
          pda,
          ok: false,
          total: 0,
          error: (error as Error).message,
        };
      }
    },
  );

  return NextResponse.json({
    total: toolPdas.length,
    scanned: results.length,
    withSchemas: results.filter((result) => result.total > 0).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}
