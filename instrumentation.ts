/* Next.js instrumentation hook — runs once per server process before
 * any route handler executes. We use it to bump the default Node
 * EventEmitter listener cap; otherwise high-fan-out routes like
 * /api/sap/agents/[wallet]/launch-tokens (which spawn 8+ concurrent
 * `fetch(..., { signal: AbortSignal.timeout(...) })` calls per request)
 * trip Node's 10-listener guard on `process.stdout`/`stderr` and emit
 *   MaxListenersExceededWarning: Possible EventEmitter memory leak …
 * That noise is harmless (each fetch attaches one listener that gets
 * cleaned up on resolution) but pollutes the dev console.
 *
 * Bumping to 64 is generous enough for our worst-case parallel-fetch
 * pattern while still surfacing genuine leaks (which would push past
 * 64 quickly). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    process.setMaxListeners(64);
    const events = await import('node:events');
    events.EventEmitter.defaultMaxListeners = 64;
  }
}
