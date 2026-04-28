import { PublicKey } from '@solana/web3.js';
import { PublicApiError } from './errors';

export function requiredString(value: string | null, field: string): string {
  const v = value?.trim();
  if (!v) throw new PublicApiError('INVALID_PARAM', `Missing required parameter: ${field}`);
  return v;
}

export function optionalBoolean(value: string | null, field: string): boolean | undefined {
  if (value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new PublicApiError('INVALID_PARAM', `Invalid boolean for ${field}`);
}

export function optionalPositiveInt(value: string | null, field: string, max: number): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new PublicApiError('INVALID_PARAM', `Invalid numeric value for ${field}`);
  }
  return Math.min(Math.trunc(n), max);
}

export function validatePublicKey(value: string, field: string): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new PublicApiError('INVALID_PARAM', `${field} is not a valid Solana address`);
  }
}

export function getValidatedPathPublicKey(value: string | undefined, field: string): string {
  if (!value) throw new PublicApiError('INVALID_PARAM', `Missing path parameter: ${field}`);
  return validatePublicKey(value, field);
}

