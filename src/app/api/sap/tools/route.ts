export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/tools — Tool registry (all categories)
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findToolsByCategory, findAllTools, getToolCategorySummary, serializeDiscoveredTool } from '~/lib/sap/discovery';
import type { DiscoveredTool } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectAllTools, upsertTools } from '~/lib/db/queries';
import { dbToolToApi, apiToolToDb } from '~/lib/db/mappers';

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const cacheKey = `tools:${category ?? 'all'}`;

  const data = await swr(cacheKey, async () => {
    // 1. Try DB first
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
        return { tools: mapped, categories: [], total: mapped.length };
      }
    } catch (e) {
      console.warn('[tools] DB read failed:', (e as Error).message);
    }

    // 2. Fallback to RPC
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

    // 3. Write to DB
    upsertTools(serialized.map(apiToolToDb)).catch((e) =>
      console.warn('[tools] DB write failed:', (e as Error).message),
    );

    return { tools: serialized, categories: summary, total: serialized.length };
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
