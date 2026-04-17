// src/db/index.ts — Database client singleton (server-only)
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as relations from './relations';

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL ?? '';

const pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Allineato al CONNECTION LIMIT 30 del role (margine per manutenzione)
    // Production DBs often require SSL; allow self-signed certs unless explicitly disabled
    ...(isProduction && !databaseUrl.includes('sslmode=disable') ? { ssl: { rejectUnauthorized: false } } : {}),
});

// Surface pool-level errors so they don't silently swallow connection issues
pool.on('error', (err) => {
    console.error('[db/pool] Unexpected pool error:', err.message);
});

export const db = drizzle(pool, {
    schema: { ...schema, ...relations },
});

/**
 * One-shot connection test — call from API health endpoints or startup scripts.
 * Resolves with true if the connection works, throws with the real PG error otherwise.
 */
export async function testConnection(): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        return true;
    } finally {
        client.release();
    }
}

export type Database = typeof db;
