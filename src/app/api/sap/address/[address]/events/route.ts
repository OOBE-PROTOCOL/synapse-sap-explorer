export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ──────────────────────────────────────────────
 * GET /api/sap/address/[addr]/events
 *
 * Universal entity event timeline.
 * Fetches transactions for any PDA (tool, agent, escrow, etc.),
 * parses ALL SAP events from TX logs using the SDK EventParser,
 * and returns a chronological event timeline.
 *
 * Query params:
 *   ?limit=50   — max signatures to scan (default 50, max 200)
 *   ?filter=ToolPublishedEvent,ToolInvocationReportedEvent — comma-separated event names
 *
 * Response:
 * {
 *   events: [{ name, data, txSignature, blockTime, slot }],
 *   total: number,
 *   scanned: number,
 * }
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { swr } from '~/lib/cache';
import { rawGetTransaction, serializeEventData } from '~/lib/rpc';
import type { SapEvent, ParsedAnchorEvent } from '~/types/api';
import { asPublicKeyText } from '~/lib/format';
import { getSynapseRpcConfig } from '~/lib/sap/rpc-config';

export type { SapEvent as SapEventRecord };

interface RawSignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
}

const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Raw JSON-RPC getSignaturesForAddress — avoids web3.js superstruct validation */
async function rawGetSignaturesForAddress(
  address: string,
  limit: number,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<RawSignatureInfo[]> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit }],
    }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return (json.result ?? []) as RawSignatureInfo[];
}

async function fetchAddressEvents(
  addr: string,
  limit: number,
  filterNames: string[] | null,
): Promise<{ events: SapEvent[]; scanned: number }> {
  const { url: rpcUrl, headers: rpcHeaders } = getSynapseRpcConfig();
  const { getSapClient } = await import('~/lib/sap/discovery');
  const sap = getSapClient();
  const eventParser = sap.events;

  const signatures = await rawGetSignaturesForAddress(addr, limit, rpcUrl, rpcHeaders);

  const events: SapEvent[] = [];
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
      if (!meta || meta.err) continue;

      const logMessages: string[] = meta.logMessages ?? [];
      if (logMessages.length === 0) continue;

      let parsed: ParsedAnchorEvent[];
      try {
        parsed = eventParser.parseLogs(logMessages);
      } catch {
        continue;
      }

      for (const evt of parsed) {
        if (filterNames && filterNames.length > 0 && !filterNames.includes(evt.name)) continue;
        events.push({
          name: evt.name,
          data: serializeEventData(evt.data),
          txSignature: batch[j].signature,
          blockTime: tx.blockTime ?? null,
          slot: tx.slot ?? batch[j].slot ?? 0,
        });
      }
    }

    // No delay needed — SWR cache prevents hammering on repeat requests
  }

  // Most recent first
  events.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));

  return { events, scanned: signatures.length };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    const { address } = await params;
    const addr = asPublicKeyText(address) || address;

    // Validate address
    if (!BASE58_ADDRESS_RE.test(addr)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 200);
    const filterParam = searchParams.get('filter');
    const filterNames = filterParam ? filterParam.split(',').map((s) => s.trim()).filter(Boolean) : null;

    const cacheKey = `addr-events:${addr}:${limit}:${filterParam ?? 'all'}`;

    const result = await swr(
      cacheKey,
      () => fetchAddressEvents(addr, limit, filterNames),
      { ttl: 60_000, swr: 300_000 },
    );

    return NextResponse.json({
      events: result.events,
      total: result.events.length,
      scanned: result.scanned,
    });
  } catch (err: unknown) {
    console.error('[address-events]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch events' },
      { status: 500 },
    );
  }
}
