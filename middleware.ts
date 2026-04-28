import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applyCorsHeaders } from '~/lib/api/security/cors';

function ensureRequestId(request: NextRequest): { requestId: string; requestHeaders: Headers } {
  const requestHeaders = new Headers(request.headers);
  const requestId = requestHeaders.get('x-request-id') ?? crypto.randomUUID();
  requestHeaders.set('x-request-id', requestId);
  return { requestId, requestHeaders };
}

export function middleware(request: NextRequest) {
  const { requestId, requestHeaders } = ensureRequestId(request);

  if (request.method === 'OPTIONS') {
    const preflight = new NextResponse(null, { status: 204 });
    preflight.headers.set('X-Request-Id', requestId);
    applyCorsHeaders(preflight.headers, request.headers.get('origin'));
    return preflight;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('X-Request-Id', requestId);
  applyCorsHeaders(response.headers, request.headers.get('origin'));

  return response;
}

export const config = {
  matcher: ['/api/v1/:path*'],
};

