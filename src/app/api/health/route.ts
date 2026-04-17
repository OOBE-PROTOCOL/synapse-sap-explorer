export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { testConnection } from '~/db';

/**
 * GET /api/health — Quick DB connectivity check.
 * Returns the real PG error so you can debug connection/SSL/permission issues.
 */
export async function GET() {
  try {
    await testConnection();
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch (err: any) {
    const detail = {
      status: 'error',
      message: err.message,
      code: err.code,           // e.g. ECONNREFUSED, 28P01, 3D000…
      cause: err.cause?.message,
    };
    console.error('[health] DB connection test failed:', detail);
    return NextResponse.json(detail, { status: 503 });
  }
}

