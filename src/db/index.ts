// src/db/index.ts — Database client singleton (server-only)
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as relations from './relations';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Allineato al CONNECTION LIMIT 30 del role (margine per manutenzione)
});

export const db = drizzle(pool, {
    schema: { ...schema, ...relations },
});

export type Database = typeof db;

