import type { PublicApiErrorCode } from '~/types';

const ERROR_STATUS: Record<PublicApiErrorCode, number> = {
  DB_UNAVAILABLE: 503,
  RPC_UNAVAILABLE: 503,
  NOT_FOUND: 404,
  INVALID_PARAM: 400,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
  STALE_DATA: 200,
};

export class PublicApiError extends Error {
  code: PublicApiErrorCode;
  status: number;
  retryAfter?: number;

  constructor(code: PublicApiErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    this.retryAfter = retryAfter;
  }
}

export function getErrorStatus(code: PublicApiErrorCode): number {
  return ERROR_STATUS[code] ?? 500;
}

export function normalizeError(error: unknown): PublicApiError {
  if (error instanceof PublicApiError) return error;

  const msg = (error as Error)?.message ?? 'Unexpected internal error';
  const lower = msg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('econn') || lower.includes('database')) {
    return new PublicApiError('DB_UNAVAILABLE', msg);
  }
  if (lower.includes('rpc') || lower.includes('502') || lower.includes('503')) {
    return new PublicApiError('RPC_UNAVAILABLE', msg);
  }

  return new PublicApiError('INTERNAL_ERROR', msg);
}

