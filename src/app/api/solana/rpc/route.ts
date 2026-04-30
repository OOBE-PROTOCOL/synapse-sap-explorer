import { NextResponse } from 'next/server';
import { getRpcConfig } from '~/lib/sap/discovery';

/**
 * Server-side RPC proxy.
 * Forwards JSON-RPC calls from the browser to the Synapse gateway
 * (which requires an API key via x-api-key header). Lets the client
 * use a `new Connection('/api/solana/rpc')` without exposing the key.
 */
export async function POST(req: Request) {
  const { url, headers } = getRpcConfig();
  const body = await req.text();
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: (err as Error).message } },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
