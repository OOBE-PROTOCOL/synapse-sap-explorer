import { isDbDown, markDbDown } from '~/db';
import { apiToolToDb, dbToolToApi } from '~/lib/db/mappers';
import { selectAllTools, selectToolSchemaCounts, upsertTools } from '~/lib/db/queries';
import {
  findAllTools,
  findToolsByCategory,
  getToolCategorySummary,
  serializeDiscoveredTool,
} from '~/lib/sap/discovery';
import type { PublicDataSource, SerializedDiscoveredTool } from '~/types';

export type PublicToolsResult = {
  tools: SerializedDiscoveredTool[];
  categories: unknown[];
  total: number;
  source: PublicDataSource;
};

function readCategory(tool: SerializedDiscoveredTool): string {
  const category = tool.descriptor?.category;
  if (typeof category === 'object' && category !== null) {
    return Object.keys(category)[0] ?? '';
  }
  return String(category ?? '');
}

export async function listPublicTools(input: { category?: string }): Promise<PublicToolsResult> {
  const { category } = input;

  if (!isDbDown()) {
    try {
      const [rows, schemaCounts] = await Promise.all([
        selectAllTools(),
        selectToolSchemaCounts().catch(() => []),
      ]);

      if (rows.length > 0) {
        const countMap = new Map(schemaCounts.map((r) => [r.toolPda, Number(r.count ?? 0)]));
        let tools = rows.map((row) => dbToolToApi(row) as unknown as SerializedDiscoveredTool);
        if (category) {
          tools = tools.filter((t) => readCategory(t) === category);
        }
        const enriched = tools.map((t) => {
          const count = countMap.get(t.pda) ?? 0;
          return {
            ...t,
            hasInscribedSchema: count > 0,
            inscribedSchemaCount: count,
          };
        });

        return {
          tools: enriched,
          categories: [],
          total: enriched.length,
          source: 'db',
        };
      }
    } catch {
      markDbDown();
    }
  }

  const [summary, rpcTools] = await Promise.all([
    getToolCategorySummary().catch(() => []),
    category ? findToolsByCategory(category) : findAllTools(),
  ]);

  const seen = new Set<string>();
  const unique = rpcTools.filter((t) => {
    const pda = t.pda.toBase58();
    if (seen.has(pda)) return false;
    seen.add(pda);
    return true;
  });

  const serialized = unique.map((t) => serializeDiscoveredTool(t) as SerializedDiscoveredTool);

  if (!isDbDown()) {
    upsertTools(serialized.map(apiToolToDb)).catch(() => {
      markDbDown();
    });
  }

  return {
    tools: serialized,
    categories: summary,
    total: serialized.length,
    source: 'rpc',
  };
}

