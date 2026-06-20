/* ──────────────────────────────────────────────────────────────
 * Tool Schema Inscriber Microservice
 *
 * Scans all tools for inscribed JSON schemas on-chain.
 * Reconstructs schema from transaction logs and saves to DB.
 *
 * Usage: POST /api/sap/tools/schemas/scan
 * ────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { getSharedPool } from '~/db';
import { Connection, PublicKey } from '@solana/web3.js';
import { withTimeout } from '~/lib/async-timeout';

type ToolSchemaSummaryRow = {
  tool_pda: string;
  schema_hash: string | null;
  schema_json: unknown;
  inscribed_at: number | null;
};

type ToolSchemasSummaryResponse = {
  schemas: Array<{
    toolPda: string;
    schemaHash: string | null;
    schemaJson: unknown;
    inscribedAt: number | null;
  }>;
  total: number;
  source?: string;
  error?: string;
};

/* ── Configuration ──────────────────────────────────────────── */

const MAINNET_RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const OOBEP_RPC_BASE = process.env.OOBEP_RPC_URL || 'https://us-1-mainnet.oobeprotocol.ai';
const OOBEP_API_KEY = process.env.OOBEP_API_KEY || '';

// Build OOBEP RPC URL with API key as query param
const OOBEP_RPC = OOBEP_API_KEY 
  ? `${OOBEP_RPC_BASE}?api_key=${OOBEP_API_KEY}`
  : OOBEP_RPC_BASE;

// Rate limiting configuration
const BATCH_SIZE = 3; // Even smaller batches to avoid rate limits
const BATCH_DELAY_MS = 3000; // Increased delay between batches
const RPC_TIMEOUT_MS = 15000; // 15 second timeout per RPC call
const MAX_RETRIES = 3; // Max retries per tool
const SCHEMA_DB_TIMEOUT_MS = 5_000;
let lastGoodSchemasResponse: ToolSchemasSummaryResponse | null = null;

// Round-robin RPC configuration for free endpoints
const FREE_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com',
];

let rpcIndex = 0;

function getNextFreeRpc(): string {
  const url = FREE_RPC_ENDPOINTS[rpcIndex];
  rpcIndex = (rpcIndex + 1) % FREE_RPC_ENDPOINTS.length;
  return url;
}

// Create connections with intelligent routing
function createMainnetConnection(): Connection {
  return new Connection(MAINNET_RPC, 'confirmed');
}

function createOobepConnection(): Connection {
  return new Connection(OOBEP_RPC, 'confirmed');
}

function createFreeRpcConnection(): Connection {
  return new Connection(getNextFreeRpc(), 'confirmed');
}

// SAP Program ID (used for filtering events)
// const SAP_PROGRAM_ID = new PublicKey('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ');

/* ── Types ──────────────────────────────────────────────────── */

interface InscribedSchema {
  toolPda: string;
  schemaHash: string;
  schemaJson: Record<string, unknown>;
  inscribedAt: number;
  txSignature: string;
  slot: number;
}

interface ScanResult {
  totalTools: number;
  scanned: number;
  withSchema: number;
  errors: string[];
}

/* ── Helper: Parse schema from transaction logs ─────────────── */

function extractSchemaFromLogs(logs: string[]): Record<string, unknown> | null {
  // Look for schema inscription events in logs
  // Pattern: "Program log: SchemaInscribed: {schema_json}"
  for (const log of logs) {
    if (log.includes('SchemaInscribed:')) {
      try {
        const jsonStr = log.split('SchemaInscribed:')[1].trim();
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        // Try to extract JSON from log
        const match = log.match(/\{.*\}/s);
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return null;
}

/* ── Helper: Sleep with optional jitter ─────────────────────── */

async function sleep(ms: number, jitter = true): Promise<void> {
  const delay = jitter ? ms + Math.random() * 100 : ms;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/* ── Helper: Fetch with retry and exponential backoff ───────── */

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  context: string = 'RPC call',
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), RPC_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a rate limit error
      const isRateLimit = lastError.message.includes('429') || 
                         lastError.message.includes('rate limit');
      
      if (attempt === maxRetries || !isRateLimit) {
        break;
      }

      // Exponential backoff with jitter
      const waitTime = delay + Math.random() * 500;
      console.log(`${context} rate limited. Retrying after ${Math.round(waitTime)}ms... (attempt ${attempt}/${maxRetries})`);
      
      await sleep(waitTime, false);
      delay = Math.min(delay * 2, 8000); // Cap at 8 seconds
    }
  }

  throw lastError;
}

/* ── Fetch tool schema from on-chain data ───────────────────── */

async function fetchToolSchemaFromChain(
  toolPda: string,
  connection: Connection
): Promise<InscribedSchema | null> {
  try {
    const toolPubkey = new PublicKey(toolPda);
    
    // Get account info with retry
    const accountInfo = await fetchWithRetry(
      () => connection.getAccountInfo(toolPubkey),
      `getAccountInfo(${toolPda.slice(0, 8)}...)`
    );
    
    if (!accountInfo) return null;

    // Get recent transactions involving this tool with retry
    const signatures = await fetchWithRetry(
      () => connection.getSignaturesForAddress(toolPubkey, { limit: 10 }),
      `getSignaturesForAddress(${toolPda.slice(0, 8)}...)`
    );
    
    for (const sig of signatures) {
      const tx = await fetchWithRetry(
        () => connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        }),
        `getTransaction(${sig.signature.slice(0, 8)}...)`,
        2 // Fewer retries for tx fetch
      );
      
      if (!tx) continue;

      // Check if this is a schema inscription event
      const logs = tx.meta?.logMessages || [];
      const schema = extractSchemaFromLogs(logs);
      
      if (schema) {
        return {
          toolPda,
          schemaHash: '', // Would compute from schema content
          schemaJson: schema,
          inscribedAt: tx.blockTime || 0,
          txSignature: sig.signature,
          slot: tx.slot,
        };
      }
    }
  } catch (error) {
    console.error(`Error fetching schema for tool ${toolPda}:`, error instanceof Error ? error.message : error);
  }
  
  return null;
}

/* ── Parallel RPC fetch with fallback ───────────────────────── */

/**
 * Try multiple RPC endpoints in sequence until one succeeds.
 * Uses intelligent timeout (5s) for each attempt.
 */
async function fetchWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  tertiary?: () => Promise<T>
): Promise<T> {
  // Try primary
  try {
    return await Promise.race([
      primary(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      ),
    ]);
  } catch (primaryError) {
    console.log('[fetchWithFallback] Primary failed, trying fallback...', primaryError);
    
    // Try fallback
    try {
      return await fallback();
    } catch (fallbackError) {
      console.log('[fetchWithFallback] Fallback failed', fallbackError);
      
      // Try tertiary if provided
      if (tertiary) {
        try {
          return await tertiary();
        } catch (tertiaryError) {
          console.log('[fetchWithFallback] Tertiary failed', tertiaryError);
          throw new Error('All RPC endpoints failed');
        }
      }
      
      throw fallbackError;
    }
  }
}

/* ── Save schema to DB ──────────────────────────────────────── */

async function saveSchemaToDb(
  pool: ReturnType<typeof getSharedPool>,
  schema: InscribedSchema
): Promise<void> {
  await pool.query(
    `INSERT INTO sap_exp.tool_schemas 
     (tool_pda, schema_hash, schema_json, inscribed_at, tx_signature, slot, indexed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (tool_pda) 
     DO UPDATE SET 
       schema_json = EXCLUDED.schema_json,
       inscribed_at = EXCLUDED.inscribed_at,
       tx_signature = EXCLUDED.tx_signature,
       slot = EXCLUDED.slot,
       indexed_at = NOW()`,
    [
      schema.toolPda,
      schema.schemaHash,
      JSON.stringify(schema.schemaJson),
      schema.inscribedAt,
      schema.txSignature,
      schema.slot,
    ]
  );
}

/* ── GET: List all cached schemas ───────────────────────────── */

export async function GET() {
  try {
    const pool = getSharedPool();
    
    const { rows } = await withTimeout(
      pool.query<ToolSchemaSummaryRow>(
        `SELECT tool_pda, schema_hash, schema_json, inscribed_at
         FROM sap_exp.tool_schemas
         ORDER BY indexed_at DESC`
      ),
      SCHEMA_DB_TIMEOUT_MS,
      'tool schemas db read',
    );

    const response: ToolSchemasSummaryResponse = {
      schemas: rows.map((r) => ({
        toolPda: r.tool_pda,
        schemaHash: r.schema_hash,
        schemaJson: typeof r.schema_json === 'string' 
          ? JSON.parse(r.schema_json) 
          : r.schema_json,
        inscribedAt: r.inscribed_at,
      })),
      total: rows.length,
      source: 'db',
    };
    lastGoodSchemasResponse = response;
    return NextResponse.json(response);
  } catch (error) {
    console.warn('[tools/schemas] DB unavailable:', (error as Error).message);
    if (lastGoodSchemasResponse) {
      return NextResponse.json(
        {
          ...lastGoodSchemasResponse,
          source: 'stale-cache',
          error: (error as Error).message,
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        },
      );
    }
    return NextResponse.json(
      { schemas: [], total: 0, source: 'db-unavailable', error: (error as Error).message },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      },
    );
  }
}

/* ── POST: Scan all tools and inscribe schemas ──────────────── */

export async function POST(req: NextRequest) {
  const { force = false } = await req.json().catch(() => ({}));
  
  try {
    const pool = getSharedPool();
    
    // Create connections with intelligent routing
    const mainnetConn = createMainnetConnection();
    const oobepConn = createOobepConnection();

    // Fetch all tools from DB (use tool_name, not name)
    const { rows: tools } = await pool.query<{ pda: string; tool_name: string }>(
      `SELECT pda, tool_name FROM sap_exp.tools WHERE is_active = true`
    );

    const result: ScanResult = {
      totalTools: tools.length,
      scanned: 0,
      withSchema: 0,
      errors: [],
    };

    console.log(`Found ${tools.length} active tools to scan`);

    // Process tools in small batches with rate limiting
    for (let i = 0; i < tools.length; i += BATCH_SIZE) {
      const batch = tools.slice(i, i + BATCH_SIZE);
      
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tools.length / BATCH_SIZE)} (${batch.length} tools)...`);
      
      const promises = batch.map(async (tool) => {
        try {
          // Check if already cached (unless force)
          if (!force) {
            const { rows: existing } = await pool.query(
              `SELECT 1 FROM sap_exp.tool_schemas WHERE tool_pda = $1`,
              [tool.pda]
            );
            if (existing.length > 0) return;
          }

          // Fetch schema with intelligent RPC routing:
          // 1. Try OOBEP (primary, with API key)
          // 2. Try mainnet RPC
          // 3. Try free RPC round-robin
          const schema = await fetchWithRetry(
            () => fetchWithFallback(
              () => fetchToolSchemaFromChain(tool.pda, oobepConn),
              () => fetchToolSchemaFromChain(tool.pda, mainnetConn),
              () => fetchToolSchemaFromChain(tool.pda, createFreeRpcConnection())
            ),
            `Schema scan (${tool.pda.slice(0, 8)}...)`
          );

          if (schema) {
            await saveSchemaToDb(pool, schema);
            result.withSchema++;
          }
          
          result.scanned++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`Tool ${tool.pda}: ${errorMsg}`);
        }
      });

      await Promise.all(promises);
      
      // Rate limiting: wait between batches to avoid 429
      if (i + BATCH_SIZE < tools.length) {
        console.log(`Rate limiting: waiting ${BATCH_DELAY_MS}ms before next batch...`);
        await sleep(BATCH_DELAY_MS, false);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error scanning schemas:', error);
    return NextResponse.json(
      { error: 'Failed to scan schemas', details: String(error) },
      { status: 500 }
    );
  }
}
