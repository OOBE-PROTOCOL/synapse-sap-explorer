/* ──────────────────────────────────────────────
 * GET /api/sap/events/stream
 * SSE endpoint — streams recent escrow events as they arrive.
 * Clients receive newline-delimited JSON objects:
 *   data: { id, event, data: EscrowEvent }
 * ────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '~/db';
import { escrowEvents } from '~/db/schema';
import { desc, gt } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_MS   = 5_000;   // poll DB every 5 s
const TTL_MS    = 60_000;  // close connection after 60 s to avoid zombie streams
const MAX_INIT  = 20;      // seed with latest N events on connect

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  // Seed with the latest events so clients have initial data
  let lastId = 0;
  try {
    const seed = await db
      .select()
      .from(escrowEvents)
      .orderBy(desc(escrowEvents.id))
      .limit(MAX_INIT);
    if (seed.length > 0) lastId = seed[seed.length - 1].id;

    const stream = new ReadableStream({
      async start(controller) {
        const startTs = Date.now();

        // Emit seed events in chronological order
        for (const ev of [...seed].reverse()) {
          const data = `data: ${JSON.stringify({ type: 'event', payload: ev })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        controller.enqueue(encoder.encode(': keep-alive\n\n'));

        // Poll for new events
        const interval = setInterval(async () => {
          if (Date.now() - startTs > TTL_MS) {
            clearInterval(interval);
            controller.enqueue(encoder.encode('data: {"type":"close"}\n\n'));
            controller.close();
            return;
          }

          try {
            const news = await db
              .select()
              .from(escrowEvents)
              .where(gt(escrowEvents.id, lastId))
              .orderBy(escrowEvents.id)
              .limit(50);

            for (const ev of news) {
              const data = `data: ${JSON.stringify({ type: 'event', payload: ev })}\n\n`;
              controller.enqueue(encoder.encode(data));
              if (ev.id > lastId) lastId = ev.id;
            }

            // Keep-alive ping
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch (e) {
            console.warn('[events/stream] DB poll failed:', (e as Error).message);
            // Keep stream alive, skip this tick
          }
        }, POLL_MS);

        req.signal.addEventListener('abort', () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('[events/stream]', err);
    return NextResponse.json({ error: 'Failed to start event stream' }, { status: 500 });
  }
}
