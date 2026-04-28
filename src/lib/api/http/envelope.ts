import { NextResponse } from 'next/server';
import type { PublicApiErrorBody, PublicApiMeta, PublicApiSuccess, PublicDataSource } from '~/types';
import { buildResponseHeaders } from './headers';
import { getErrorStatus, normalizeError, PublicApiError } from './errors';

type SuccessOptions = {
  requestId: string;
  source?: PublicDataSource;
  dataAgeMs?: number;
  status?: number;
  meta?: Omit<PublicApiMeta, 'requestId' | 'source' | 'dataAgeMs'>;
  cacheControl?: string;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
};

export function ok<T>(data: T, opts: SuccessOptions): NextResponse<PublicApiSuccess<T>> {
  const body: PublicApiSuccess<T> = {
    data,
    meta: {
      requestId: opts.requestId,
      source: opts.source,
      dataAgeMs: opts.dataAgeMs,
      ...(opts.meta ?? {}),
    },
  };

  return NextResponse.json(body, {
    status: opts.status ?? 200,
    headers: buildResponseHeaders({
      requestId: opts.requestId,
      source: opts.source,
      dataAgeMs: opts.dataAgeMs,
      cacheControl: opts.cacheControl,
      rateLimit: opts.rateLimit,
    }),
  });
}

type ErrorOptions = {
  requestId: string;
  cacheControl?: string;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
};

export function fail(code: PublicApiError['code'], message: string, opts: ErrorOptions, retryAfter?: number): NextResponse<PublicApiErrorBody> {
  const status = getErrorStatus(code);
  const body: PublicApiErrorBody = {
    error: {
      code,
      message,
      requestId: opts.requestId,
      ...(retryAfter ? { retryAfter } : {}),
    },
  };

  const headers = buildResponseHeaders({
    requestId: opts.requestId,
    source: 'internal',
    dataAgeMs: 0,
    cacheControl: opts.cacheControl,
    rateLimit: opts.rateLimit,
  });
  if (retryAfter) headers.set('Retry-After', String(retryAfter));

  return NextResponse.json(body, { status, headers });
}

export function failFromUnknown(error: unknown, opts: ErrorOptions): NextResponse<PublicApiErrorBody> {
  const normalized = normalizeError(error);
  return fail(normalized.code, normalized.message, opts, normalized.retryAfter);
}

