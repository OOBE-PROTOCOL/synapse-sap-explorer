const DEFAULT_ORIGINS = '*';

export function getAllowedOrigins(): string[] {
  const raw = process.env.PUBLIC_API_CORS_ORIGINS?.trim();
  if (!raw) return [DEFAULT_ORIGINS];
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

export function applyCorsHeaders(headers: Headers, origin: string | null): void {
  const allowed = getAllowedOrigins();
  const any = allowed.includes('*');

  if (any) {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Request-Id');
  headers.set('Access-Control-Max-Age', '600');
}

