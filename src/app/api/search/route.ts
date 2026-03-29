import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stub search endpoint — returns empty results.
// Replace with fumadocs search index when ready.
export function GET() {
  return NextResponse.json([]);
}
