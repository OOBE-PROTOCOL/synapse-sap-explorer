import type { PublicDataSource } from '~/types';

export type ResponseHeaderOptions = {
  requestId: string;
  source?: PublicDataSource;
  dataAgeMs?: number;
  cacheControl?: string;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
};

export function buildResponseHeaders(opts: ResponseHeaderOptions): Headers {
  const headers = new Headers();

  headers.set('X-Request-Id', opts.requestId);
  headers.set('X-Data-Source', opts.source ?? 'internal');
  headers.set('X-Data-Age', String(opts.dataAgeMs ?? 0));
  headers.set('Cache-Control', opts.cacheControl ?? 'no-store');

  if (opts.rateLimit) {
    headers.set('X-RateLimit-Limit', String(opts.rateLimit.limit));
    headers.set('X-RateLimit-Remaining', String(opts.rateLimit.remaining));
    headers.set('X-RateLimit-Reset', String(opts.rateLimit.reset));
  }

  return headers;
}

export function getRequestIdFromHeaders(headers: Headers): string {
  return headers.get('x-request-id') ?? headers.get('X-Request-Id') ?? crypto.randomUUID();
}

