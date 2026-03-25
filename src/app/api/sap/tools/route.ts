export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/tools — Tool registry (all categories)
 *
 * Returns all tools across all categories with full
 * descriptor data from on-chain ToolDescriptor accounts.
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findToolsByCategory, findAllTools, getToolCategorySummary, serializeDiscoveredTool } from '~/lib/sap/discovery';
import type { DiscoveredTool } from '~/lib/sap/discovery';

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  // Get category summary first  
  const summary = await getToolCategorySummary();

  let tools: DiscoveredTool[] = [];

  if (category) {
    // Single category
    try {
      tools = await findToolsByCategory(category);
    } catch { /* empty category */ }
  } else {
    // Fetch ALL tools via program.account.toolDescriptor.all()
    tools = await findAllTools();
  }

  // Deduplicate by PDA
  const seen = new Set<string>();
  const unique = tools.filter((t) => {
    const key = t.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return synapseResponse({
    tools: unique.map(serializeDiscoveredTool),
    categories: summary,
    total: unique.length,
  });
});
