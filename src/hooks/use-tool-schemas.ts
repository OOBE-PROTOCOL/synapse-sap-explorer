'use client';

import { useSapQuery } from '~/hooks/use-sap-query';

export type ToolSchemaEntry = {
  toolPda: string;
  schemaHash: string;
  schemaJson: Record<string, unknown>;
  inscribedAt: number;
};

type ToolSchemasResponse = {
  schemas: ToolSchemaEntry[];
  total: number;
};

/**
 * Fetch cached tool schemas from DB.
 * These are JSON schemas reconstructed from on-chain inscription events.
 */
export function useToolSchemas() {
  return useSapQuery<ToolSchemasResponse>({
    queryKey: ['tool-schemas'],
    url: '/api/sap/tools/schemas',
    pollInterval: 60_000, // 1 minute
  });
}

/**
 * Trigger a scan to inscribe missing tool schemas.
 * POST /api/sap/tools/schemas
 */
export async function triggerSchemaScan(force = false): Promise<{
  totalTools: number;
  scanned: number;
  withSchema: number;
  errors: string[];
}> {
  const res = await fetch('/api/sap/tools/schemas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Scan failed: ${error}`);
  }
  
  return res.json();
}
