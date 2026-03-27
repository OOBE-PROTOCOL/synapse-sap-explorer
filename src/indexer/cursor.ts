// src/indexer/cursor.ts — sync_cursors read/write
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { syncCursors } from '~/db/schema';

export type CursorData = {
  lastSlot: number | null;
  lastSignature: string | null;
  lastSyncedAt: Date;
};

export async function getCursor(entity: string): Promise<CursorData> {
  const row = await db
    .select()
    .from(syncCursors)
    .where(eq(syncCursors.entity, entity))
    .limit(1);

  if (row.length === 0) {
    return { lastSlot: null, lastSignature: null, lastSyncedAt: new Date(0) };
  }

  return {
    lastSlot: row[0].lastSlot,
    lastSignature: row[0].lastSignature,
    lastSyncedAt: row[0].lastSyncedAt,
  };
}

export async function setCursor(
  entity: string,
  data: { lastSlot?: number | null; lastSignature?: string | null },
): Promise<void> {
  await db
    .insert(syncCursors)
    .values({
      entity,
      lastSlot: data.lastSlot ?? null,
      lastSignature: data.lastSignature ?? null,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: syncCursors.entity,
      set: {
        lastSlot: data.lastSlot ?? null,
        lastSignature: data.lastSignature ?? null,
        lastSyncedAt: new Date(),
      },
    });
}

