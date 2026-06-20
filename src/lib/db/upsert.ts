import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Build the `set` object for onConflictDoUpdate using `excluded.*` references.
 * Excludes the specified columns, typically primary keys.
 */
export function conflictUpdateSet<T extends PgTable>(
  table: T,
  exclude: string[] = [],
): Record<string, ReturnType<typeof sql.raw>> {
  const cols = getTableColumns(table);
  const set: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [tsKey, col] of Object.entries(cols)) {
    if (exclude.includes(tsKey)) continue;
    set[tsKey] = sql.raw(`excluded."${(col as { name: string }).name}"`);
  }
  return set;
}

/**
 * Only run an upsert update when persisted chain-backed state changed.
 * Exclude volatile indexer metadata such as `indexedAt` from the comparison.
 */
export function conflictUpdateWhere<T extends PgTable>(
  table: T,
  exclude: string[] = [],
): SQL | undefined {
  const cols = getTableColumns(table);
  const predicates: SQL[] = [];
  for (const [tsKey, col] of Object.entries(cols)) {
    if (exclude.includes(tsKey)) continue;
    const name = (col as { name: string }).name;
    predicates.push(sql`${col} IS DISTINCT FROM ${sql.raw(`excluded."${name}"`)}`);
  }
  return predicates.length ? sql.join(predicates, sql` OR `) : undefined;
}
