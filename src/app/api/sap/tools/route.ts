export const dynamic = 'force-dynamic';

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findToolsByCategory, findAllTools, getToolCategorySummary, serializeDiscoveredTool } from '~/lib/sap/discovery';
import type { DiscoveredTool } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllTools, selectToolSchemaCounts, upsertTools } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbToolToApi, apiToolToDb } from '~/lib/db/mappers';
import type { SerializedDiscoveredTool } from '~/types';

async function rpcFetchTools(category: string | null) {
  const summary = await getToolCategorySummary();
  let tools: DiscoveredTool[] = [];
  if (category) {
    try { tools = await findToolsByCategory(category); } catch (e) { console.warn('[tools] category lookup failed:', (e as Error).message); }
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

  const cached = peek<{ tools: SerializedDiscoveredTool[]; total: number }>(cacheKey);
  if (cached && cached.tools?.length > 0) {
    swr(cacheKey, () => rpcFetchTools(category), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  let schemaCountMap = new Map<string, number>();
  if (!isDbDown()) {
    try {
      const counts = await selectToolSchemaCounts();
      schemaCountMap = new Map(counts.map((r) => [r.toolPda, Number(r.count ?? 0)]));
    } catch {
      // tool_schemas may not be present in some deployments; keep map empty.
    }
  }

  if (!isDbDown()) try {
    const dbRows = await selectAllTools();
    if (dbRows.length > 0) {
      let mapped = dbRows.map(dbToolToApi);
      if (category) {
        mapped = mapped.filter((t) => {
          const cat = typeof t.descriptor?.category === 'object'
            ? Object.keys(t.descriptor.category)[0]
            : String(t.descriptor?.category ?? '');
          return cat === category;
        });
      }

      mapped = mapped.map((t) => {
        const c = schemaCountMap.get(t.pda) ?? 0;
        return {
          ...t,
          hasInscribedSchema: c > 0,
          inscribedSchemaCount: c,
        };
      });

      const result = { tools: mapped, categories: [], total: mapped.length };
      swr(cacheKey, () => rpcFetchTools(category), { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[tools] DB read failed:', (e as Error).message);
    markDbDown();
  }

  const data = await rpcFetchTools(category);
  const enriched = {
    ...data,
    tools: data.tools.map((t) => {
      const c = schemaCountMap.get(t.pda) ?? 0;
      return {
        ...t,
        hasInscribedSchema: c > 0,
        inscribedSchemaCount: c,
      };
    }),
  };
  swr(cacheKey, () => Promise.resolve(enriched), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(enriched);
});
