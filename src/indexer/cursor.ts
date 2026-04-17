// src/indexer/cursor.ts — sync_cursors read/write
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { syncCursors } from '~/db/schema';

export type CursorData = {
  lastSlot: number | null;
  lastSignature: string | null;
  lastSyncedAt: Date;
};

const MAX_CURSOR_RETRIES = 4;
const CURSOR_BASE_DELAY  = 1_000;

/** Internal retry for cursor DB operations (PG restarts, shared-memory, etc.) */
async function cursorRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= MAX_CURSOR_RETRIES; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (i === MAX_CURSOR_RETRIES) throw err;
      const delay = CURSOR_BASE_DELAY * 2 ** i + Math.random() * 300;
      console.warn(`[cursor:${label}] attempt ${i + 1}/${MAX_CURSOR_RETRIES} failed — retry in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function getCursor(entity: string): Promise<CursorData> {
  return cursorRetry(async () => {
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
  }, `get:${entity}`);
}

export async function setCursor(
  entity: string,
  data: { lastSlot?: number | null; lastSignature?: string | null },
): Promise<void> {
  return cursorRetry(async () => {
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
  }, `set:${entity}`);
}

