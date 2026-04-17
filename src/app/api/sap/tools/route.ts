export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/tools — Tool registry (all categories)
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findToolsByCategory, findAllTools, getToolCategorySummary, serializeDiscoveredTool } from '~/lib/sap/discovery';
import type { DiscoveredTool } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllTools, upsertTools } from '~/lib/db/queries';
import { dbToolToApi, apiToolToDb } from '~/lib/db/mappers';

async function rpcFetchTools(category: string | null) {
  const summary = await getToolCategorySummary();
  let tools: DiscoveredTool[] = [];
  if (category) {
    try { tools = await findToolsByCategory(category); } catch { /* empty */ }
  } else {
    tools = await findAllTools();
  }
  const seen = new Set<string>();
  const unique = tools.filter((t) => {
    const key = t.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const serialized = unique.map(serializeDiscoveredTool);
  upsertTools(serialized.map(apiToolToDb)).catch((e) =>
    console.warn('[tools] DB write failed:', (e as Error).message),
  );
  return { tools: serialized, categories: summary, total: serialized.length };
}

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const cacheKey = `tools:${category ?? 'all'}`;

  // Step 1: cache peek (0ms)
  const cached = peek<any>(cacheKey);
  if (cached && cached.tools?.length > 0) {
    swr(cacheKey, () => rpcFetchTools(category), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  // Step 2: DB read
  try {
    const dbRows = await selectAllTools();
    if (dbRows.length > 0) {
      let mapped = dbRows.map(dbToolToApi);
      if (category) {
        mapped = mapped.filter((t: any) => {
          const cat = typeof t.descriptor?.category === 'object'
            ? Object.keys(t.descriptor.category)[0]
            : String(t.descriptor?.category ?? '');
          return cat === category;
        });
      }
      const result = { tools: mapped, categories: [], total: mapped.length };
      swr(cacheKey, () => rpcFetchTools(category), { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[tools] DB read failed:', (e as Error).message, '| cause:', (e as any).cause?.message ?? 'none');
  }

  // Step 3: cold start
  const data = await rpcFetchTools(category);
  swr(cacheKey, () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
