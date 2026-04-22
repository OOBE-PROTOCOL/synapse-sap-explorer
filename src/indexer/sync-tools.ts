// src/indexer/sync-tools.ts — Fetch all tools → upsert DB
import { db } from '~/db';
import { tools } from '~/db/schema';
import { findAllTools } from '~/lib/sap/discovery';
import { log, logErr, withRetry, pk, bn, num, bnToDate, enumKey, hashToHex, conflictUpdateSet } from './utils';
import { setCursor } from './cursor';
import { ToolDescriptorData } from '@oobe-protocol-labs/synapse-sap-sdk/types';

export async function syncTools(): Promise<number> {
  log('tools', 'Fetching all tools from RPC...');

  const rawTools = await withRetry(() => findAllTools(), 'tools:fetch');
  log('tools', `Fetched ${rawTools.length} tools`);

  if (rawTools.length === 0) {
    await setCursor('tools', {});
    return 0;
  }

  let upserted = 0;
  const BATCH = 20;

  for (let i = 0; i < rawTools.length; i += BATCH) {
    const batch = rawTools.slice(i, i + BATCH);

    const rows = batch
      .filter((t) => t.descriptor)
      .map((t) => {
        const desc = t.descriptor as ToolDescriptorData;
        return {
          pda: pk(t.pda),
          agentPda: pk(desc.agent),
          toolName: desc.toolName ?? '',
          toolNameHash: hashToHex(desc.toolNameHash),
          protocolHash: hashToHex(desc.protocolHash),
          descriptionHash: hashToHex(desc.descriptionHash),
          inputSchemaHash: hashToHex(desc.inputSchemaHash),
          outputSchemaHash: hashToHex(desc.outputSchemaHash),
          httpMethod: enumKey(desc.httpMethod),
          category: enumKey(desc.category),
          paramsCount: num(desc.paramsCount),
          requiredParams: num(desc.requiredParams),
          isCompound: Boolean(desc.isCompound),
          isActive: desc.isActive ?? true,
          totalInvocations: bn(desc.totalInvocations),
          version: num(desc.version),
          previousVersion: desc.previousVersion ? pk(desc.previousVersion) : null,
          bump: num(desc.bump),
          createdAt: bnToDate(desc.createdAt) ?? new Date(),
          updatedAt: bnToDate(desc.updatedAt) ?? new Date(),
          indexedAt: new Date(),
        };
      });

    if (rows.length === 0) continue;

    try {
      await db
        .insert(tools)
        .values(rows)
        .onConflictDoUpdate({
          target: tools.pda,
          set: conflictUpdateSet(tools, ['pda']),
        });
      upserted += rows.length;
    } catch (e: unknown) {
      logErr('tools', `Batch failed (i=${i}): ${(e as Error).message}`);
      for (const row of rows) {
        try {
          await db.insert(tools).values(row).onConflictDoUpdate({
            target: tools.pda,
            set: conflictUpdateSet(tools, ['pda']),
          });
          upserted++;
        } catch (e2: unknown) {
          logErr('tools', `Single failed pda=${row.pda.slice(0, 8)}: ${(e2 as Error).message}`);
        }
      }
    }
  }

  await setCursor('tools', {});
  log('tools', `Done: ${upserted} tools upserted`);
  return upserted;
}

