import 'dotenv/config';
import { db } from '../src/db';
import { transactions, syncCursors } from '../src/db/schema';
import { sql, desc, asc } from 'drizzle-orm';

async function check() {
  // Transaction count + date range
  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(transactions);
  console.log('Transactions total:', countRow.count);

  const [oldest] = await db.select({ slot: transactions.slot, blockTime: transactions.blockTime }).from(transactions).orderBy(asc(transactions.slot)).limit(1);
  const [newest] = await db.select({ slot: transactions.slot, blockTime: transactions.blockTime }).from(transactions).orderBy(desc(transactions.slot)).limit(1);

  if (oldest) {
    const oldDate = oldest.blockTime ? new Date(Number(oldest.blockTime) * 1000).toISOString() : 'null';
    console.log('Oldest TX:', 'slot', oldest.slot, 'time', oldDate);
  }
  if (newest) {
    const newDate = newest.blockTime ? new Date(Number(newest.blockTime) * 1000).toISOString() : 'null';
    console.log('Newest TX:', 'slot', newest.slot, 'time', newDate);
  }

  // Events count (table may not exist)
  try {
    const evtResult = await db.execute(sql`SELECT count(*) as count FROM sap_exp.sap_events`);
    const evtCount = evtResult.rows?.[0];
    console.log('Events total:', (evtCount as any)?.count ?? 'unknown');
  } catch { console.log('Events table: not available'); }

  // Cursors
  const cursors = await db.select().from(syncCursors);
  console.log('\nSync cursors:');
  for (const c of cursors) {
    console.log(`  ${c.entity}: slot=${c.lastSlot} sig=${c.lastSignature?.slice(0, 12)}… synced=${c.lastSyncedAt.toISOString()}`);
  }

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
