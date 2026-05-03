export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { getSapClient, getSynapseConnection, getRpcConfig } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectToolSchemas, upsertToolSchemas } from '~/lib/db/queries';
import { isDbDown } from '~/db';
import { rawGetTransaction } from '~/lib/rpc';
import type { InscribedSchema } from '~/types';

const SCHEMA_TYPE_LABELS: Record<number, string> = {
  0: 'input',
  1: 'output',
  2: 'description',
};

/**
 * Result of a scan attempt. `expectedTypes` reflects which schema slots
 * the on-chain ToolDescriptor declares (non-zero hashes); the UI uses it
 * to differentiate "tool published no schema" from "we scanned but
 * inscription tx is older than our pagination cap".
 */
type ScanResult = {
  schemas: InscribedSchema[];
  expectedTypes: number[];
  scannedSignatures: number;
  reachedCap: boolean;
};

/**
 * Hard cap on signature pagination per request. Inscriptions are emitted
 * once at publish (and again on each `inscribeSchema` update) — they live
 * forever in tx history. Active tools accumulate thousands of invocations,
 * so we may need to paginate deep on the cold path. Persistence to DB
 * makes this a one-time cost per (tool, version).
 */
const SIG_PAGE_SIZE = 100;
const MAX_SIG_PAGES = 10; // up to 1000 most-recent sigs

/** Fetch the on-chain ToolDescriptor for a tool PDA. */
async function fetchToolDescriptor(toolPda: string): Promise<{
  agent: string;
  toolName: string;
  version: number;
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  hasDescription: boolean;
} | null> {
  try {
    const sap = getSapClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = (sap as any).program;
    if (!program?.account?.toolDescriptor) return null;
    const acct = await program.account.toolDescriptor.fetchNullable(
      new PublicKey(toolPda),
    );
    if (!acct) return null;
    const nonZero = (arr: unknown): boolean =>
      Array.isArray(arr) && arr.some((b: number) => b !== 0);
    return {
      agent: acct.agent.toBase58(),
      toolName: String(acct.toolName ?? ''),
      version: Number(acct.version ?? 0),
      hasInputSchema: nonZero(acct.inputSchemaHash),
      hasOutputSchema: nonZero(acct.outputSchemaHash),
      hasDescription: nonZero(acct.descriptionHash),
    };
  } catch (e) {
    console.warn('[tool-schemas] fetchToolDescriptor failed', (e as Error).message);
    return null;
  }
}

async function fetchToolSchemas(toolPda: string): Promise<ScanResult> {
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  const sap = getSapClient();
  const eventParser = sap.events;

  // Step 1: read the descriptor to know whether schemas are even expected.
  // If all schema hashes are zero, scanning sigs is pure waste.
  const descriptor = await fetchToolDescriptor(toolPda);
  const expectedTypes: number[] = [];
  if (descriptor) {
    if (descriptor.hasInputSchema) expectedTypes.push(0);
    if (descriptor.hasOutputSchema) expectedTypes.push(1);
    if (descriptor.hasDescription) expectedTypes.push(2);
  } else {
    // No descriptor reachable — be conservative: scan but don't paginate deep.
    expectedTypes.push(0, 1, 2);
  }

  if (expectedTypes.length === 0) {
    return { schemas: [], expectedTypes: [], scannedSignatures: 0, reachedCap: false };
  }

  const expectedSet = new Set(expectedTypes);

  // Step 2: paginate getSignaturesForAddress backward until we collect
  // all expected schema types or hit the page cap. Inscriptions live
  // forever in tx history; active tools accumulate thousands of
  // invocations, so deep pagination on the cold path is necessary.
  // Persistence to DB makes this a one-time cost.
  const schemas: InscribedSchema[] = [];
  const foundTypes = new Set<number>();
  let before: string | undefined;
  let scanned = 0;
  let pages = 0;

  outer: while (pages < MAX_SIG_PAGES) {
    pages++;
    let signatures: Array<{ signature: string }> = [];
    try {
      signatures = await conn.getSignaturesForAddress(
        new PublicKey(toolPda),
        { limit: SIG_PAGE_SIZE, before },
      );
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('StructError') || msg.includes('Expected the value to satisfy a union')) {
        console.warn('[tool-schemas] getSignaturesForAddress struct validation failed');
        break;
      }
      throw e;
    }
    if (signatures.length === 0) break;
    scanned += signatures.length;
    before = signatures[signatures.length - 1].signature;

    // Process page in batches of 10 parallel TX fetches.
    const BATCH = 10;
    for (let i = 0; i < signatures.length; i += BATCH) {
      const batch = signatures.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((sig) => rawGetTransaction(sig.signature, rpcUrl, rpcHeaders)),
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status !== 'fulfilled' || !r.value) continue;

        const tx = r.value;
        const meta = tx.meta;
        if (!meta) continue;
        if (meta.err) continue;

        const logMessages: string[] = meta.logMessages ?? [];
        if (logMessages.length === 0) continue;

        let events: Array<{ name: string; data: Record<string, unknown> }>;
        try {
          events = eventParser.parseLogs(logMessages);
        } catch {
          continue;
        }

        const schemaEvents = events.filter(
          (e) => e.name === 'toolSchemaInscribedEvent' || e.name === 'ToolSchemaInscribedEvent',
        );

        for (const event of schemaEvents) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = event.data as Record<string, any>;

          const eventToolPda: string = data.tool?.toBase58?.() ?? String(data.tool ?? '');
          if (eventToolPda && eventToolPda !== toolPda) continue;

        const schemaTypeRaw = Number(data.schemaType ?? data.schema_type ?? 0);
        const schemaType = SCHEMA_TYPE_LABELS[schemaTypeRaw] ?? `unknown(${schemaTypeRaw})`;
        const compressionRaw = Number(data.compression ?? 0);
        const version = Number(
          data.version?.toNumber?.() ?? data.version ?? 0,
        );

        // schemaData is Uint8Array or Buffer from the event decoder
        let rawData: Buffer;
        const sd = data.schemaData ?? data.schema_data;
        if (Buffer.isBuffer(sd)) {
          rawData = sd;
        } else if (sd instanceof Uint8Array) {
          rawData = Buffer.from(sd);
        } else if (Array.isArray(sd)) {
          rawData = Buffer.from(sd);
        } else {
          continue;
        }

        type Decoder = 'raw' | 'gzip' | 'deflateRaw' | 'deflate';

        // Try the declared compression first, then fall back through the
        // common formats. Some publishers set compression=0 even when the
        // payload is gzipped — be robust to that.
        const zlib = await import('zlib');
        const tryDecompress = (fn: () => Buffer): Buffer | null => {
          try { return fn(); } catch { return null; }
        };

        const candidates: Array<{ kind: Decoder; bytes: Buffer | null }> = [];
        if (compressionRaw === 1) {
          candidates.push({ kind: 'deflateRaw', bytes: tryDecompress(() => zlib.inflateRawSync(rawData)) });
          candidates.push({ kind: 'gzip',       bytes: tryDecompress(() => zlib.gunzipSync(rawData)) });
          candidates.push({ kind: 'deflate',    bytes: tryDecompress(() => zlib.inflateSync(rawData)) });
          candidates.push({ kind: 'raw',        bytes: rawData });
        } else {
          candidates.push({ kind: 'raw',        bytes: rawData });
          candidates.push({ kind: 'gzip',       bytes: tryDecompress(() => zlib.gunzipSync(rawData)) });
          candidates.push({ kind: 'deflateRaw', bytes: tryDecompress(() => zlib.inflateRawSync(rawData)) });
          candidates.push({ kind: 'deflate',    bytes: tryDecompress(() => zlib.inflateSync(rawData)) });
        }

        const hashData = data.schemaHash ?? data.schema_hash;
        let schemaHash = '';
        if (Buffer.isBuffer(hashData)) {
          schemaHash = hashData.toString('hex');
        } else if (hashData instanceof Uint8Array) {
          schemaHash = Buffer.from(hashData).toString('hex');
        } else if (Array.isArray(hashData)) {
          schemaHash = hashData
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join('');
        }

        // Pick the candidate that (a) parses as JSON OR (b) matches the
        // on-chain hash. Prefer hash-match over JSON-parses.
        let chosen: { kind: Decoder; bytes: Buffer; str: string; json: Record<string, unknown> | null; matches: boolean } | null = null;
        for (const c of candidates) {
          if (!c.bytes) continue;
          const str = c.bytes.toString('utf-8');
          let json: Record<string, unknown> | null = null;
          try { json = JSON.parse(str) as Record<string, unknown>; } catch { /* not JSON */ }
          const matches = !!schemaHash && createHash('sha256').update(c.bytes).digest('hex') === schemaHash;
          if (matches) { chosen = { kind: c.kind, bytes: c.bytes, str, json, matches }; break; }
          if (!chosen && json) chosen = { kind: c.kind, bytes: c.bytes, str, json, matches };
        }
        if (!chosen) {
          // last resort: use raw bytes as utf-8 (will look garbled but at least we record the event)
          chosen = { kind: 'raw', bytes: rawData, str: rawData.toString('utf-8'), json: null, matches: false };
        }
        const canonicalBytes: Buffer = chosen.bytes;
        const schemaStr: string = chosen.str;
        const schemaJson = chosen.json;
        const decompressedFrom: Decoder = chosen.kind;

        const agentPda = data.agent?.toBase58?.() ?? String(data.agent ?? '');
        const toolName: string = data.toolName ?? data.tool_name ?? '';

        // SHA256 verification on the chosen (canonical) bytes.
        const computedHash = createHash('sha256').update(canonicalBytes).digest('hex');
        const verified = !!(schemaHash && computedHash === schemaHash);

        schemas.push({
          schemaType,
          schemaTypeRaw,
          schemaData: schemaStr,
          schemaJson,
          schemaHash,
          computedHash,
          verified,
          compression: compressionRaw,
          version,
          toolName,
          agent: agentPda,
          txSignature: batch[j].signature,
          blockTime: tx.blockTime ?? null,
        });
        // log when we had to override the declared compression — surfaces
        // publisher bugs without breaking decoding.
        if ((compressionRaw === 1 && decompressedFrom === 'raw') ||
            (compressionRaw === 0 && decompressedFrom !== 'raw')) {
          console.warn(
            `[tool-schemas] ${toolPda} type=${schemaType} declared compression=${compressionRaw} but decoded as ${decompressedFrom}`,
          );
        }
        foundTypes.add(schemaTypeRaw);
      }
    }

      // Early exit: stop once we've found every expected schema type.
      if (expectedSet.size > 0 && [...expectedSet].every((t) => foundTypes.has(t))) {
        break outer;
      }
    }

    // RPC returned a partial page → no more history available.
    if (signatures.length < SIG_PAGE_SIZE) break;
  }

  const reachedCap =
    pages >= MAX_SIG_PAGES &&
    expectedSet.size > 0 &&
    ![...expectedSet].every((t) => foundTypes.has(t));

  // Sort: most recent first
  schemas.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));

  // Step 3: persist to DB so subsequent calls are instant.
  if (!isDbDown() && schemas.length > 0) {
    try {
      await upsertToolSchemas(
        schemas.map((s) => ({
          toolPda,
          agentPda: s.agent || (descriptor?.agent ?? ''),
          txSignature: s.txSignature,
          schemaType: s.schemaTypeRaw,
          schemaTypeLabel: s.schemaType,
          schemaData: s.schemaData,
          schemaJson: s.schemaJson,
          schemaHash: s.schemaHash,
          computedHash: s.computedHash,
          verified: s.verified,
          compression: s.compression,
          version: s.version,
          toolName: s.toolName || (descriptor?.toolName ?? null),
          blockTime: s.blockTime ? new Date(s.blockTime * 1000) : null,
        })),
      );
    } catch (e) {
      console.warn('[tool-schemas] persist failed', (e as Error).message);
    }
  }

  return { schemas, expectedTypes, scannedSignatures: scanned, reachedCap };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pda: string }> },
) {
  try {
    const { pda } = await params;

    // Validate PDA
    try {
      new PublicKey(pda);
    } catch {
      return NextResponse.json({ error: 'Invalid PDA' }, { status: 400 });
    }

    // DB cache (fast path) — but skip when any row is unverified, so we
    // re-decode with the latest decoder logic and overwrite the cache.
    if (!isDbDown()) {
      try {
        const dbSchemas = await selectToolSchemas(pda);
        const allVerified = dbSchemas.length > 0 && dbSchemas.every((s) => s.verified);
        if (allVerified) {
          const mapped = dbSchemas.map((s) => ({
            schemaType: s.schemaTypeLabel,
            schemaTypeRaw: s.schemaType,
            schemaData: s.schemaData,
            schemaJson: s.schemaJson,
            schemaHash: s.schemaHash,
            computedHash: s.computedHash,
            verified: s.verified,
            compression: s.compression,
            version: s.version,
            toolName: s.toolName ?? '',
            agent: s.agentPda,
            txSignature: s.txSignature,
            blockTime: s.blockTime ? Math.floor(s.blockTime.getTime() / 1000) : null,
          }));
          // Background refresh from RPC
          swr(`tool-schemas:${pda}`, () => fetchToolSchemas(pda), { ttl: 60_000, swr: 300_000 }).catch(() => {});
          return NextResponse.json({ schemas: mapped, total: mapped.length, source: 'db' });
        }
      } catch { /* DB down — fall through to RPC */ }
    }

    // RPC fetch (cold path)
    let result: ScanResult = { schemas: [], expectedTypes: [], scannedSignatures: 0, reachedCap: false };
    try {
      result = await swr(
        `tool-schemas:${pda}`,
        () => fetchToolSchemas(pda),
        { ttl: 60_000, swr: 300_000 }, // 1min fresh, 5min stale
      );
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('StructError') || msg.includes('Expected the value to satisfy a union')) {
        return NextResponse.json({ schemas: [], total: 0, warning: 'RPC schema parser temporary issue' });
      }
      throw e;
    }

    return NextResponse.json({
      schemas: result.schemas,
      total: result.schemas.length,
      expectedTypes: result.expectedTypes,
      scannedSignatures: result.scannedSignatures,
      reachedCap: result.reachedCap,
      source: 'rpc',
    });
  } catch (err: unknown) {
    console.error('[tool-schemas]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch tool schemas' },
      { status: 500 },
    );
  }
}
