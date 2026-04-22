export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { getSapClient, getSynapseConnection, getRpcConfig } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectToolSchemas } from '~/lib/db/queries';
import { isDbDown } from '~/db';
import { rawGetTransaction } from '~/lib/rpc';
import type { InscribedSchema } from '~/types';

const SCHEMA_TYPE_LABELS: Record<number, string> = {
  0: 'input',
  1: 'output',
  2: 'description',
};

async function fetchToolSchemas(toolPda: string): Promise<InscribedSchema[]> {
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  const sap = getSapClient();
  const eventParser = sap.events;

  let signatures: Array<{ signature: string }> = [];
  try {
    signatures = await conn.getSignaturesForAddress(
      new PublicKey(toolPda),
      { limit: 25 },
    );
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? '';
    // Some RPC providers occasionally throw StructError on this call.
    if (msg.includes('StructError') || msg.includes('Expected the value to satisfy a union')) {
      console.warn('[tool-schemas] getSignaturesForAddress struct validation failed, returning empty schemas');
      return [];
    }
    throw e;
  }

  const schemas: InscribedSchema[] = [];
  const foundTypes = new Set<number>();

  // Process in batches of 10
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
        (e) => e.name === 'ToolSchemaInscribedEvent',
      );

      for (const event of schemaEvents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = event.data as Record<string, any>;

        // Verify event is for our tool PDA
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

        let schemaStr: string;
        if (compressionRaw === 1) {
          try {
            const zlib = await import('zlib');
            schemaStr = zlib.inflateRawSync(rawData).toString('utf-8');
          } catch {
            schemaStr = rawData.toString('utf-8');
          }
        } else {
          schemaStr = rawData.toString('utf-8');
        }

        let schemaJson: Record<string, unknown> | null = null;
        try {
          schemaJson = JSON.parse(schemaStr) as Record<string, unknown>;
        } catch {}

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

        const agentPda = data.agent?.toBase58?.() ?? String(data.agent ?? '');
        const toolName: string = data.toolName ?? data.tool_name ?? '';

        // SHA256 verification
        const computedHash = createHash('sha256').update(rawData).digest('hex');
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
        foundTypes.add(schemaTypeRaw);
      }
    }

    // Early exit: stop scanning once we've found all 3 schema types
    if (foundTypes.size >= 3) break;
  }

  // Sort: most recent first
  schemas.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));

  return schemas;
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

    // DB cache (fast path)
    if (!isDbDown()) {
      try {
        const dbSchemas = await selectToolSchemas(pda);
        if (dbSchemas.length > 0) {
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
    let schemas: InscribedSchema[] = [];
    try {
      schemas = await swr(
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

    return NextResponse.json({ schemas, total: schemas.length });
  } catch (err: unknown) {
    console.error('[tool-schemas]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch tool schemas' },
      { status: 500 },
    );
  }
}
