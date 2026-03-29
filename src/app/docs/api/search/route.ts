import { source } from '@/lib/source';

// Ensure this route is always dynamic and runs on Node.js to avoid static evaluation issues during build
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Delegate to central search stub to avoid build-time indexing
export { GET } from '@/app/api/search/route';
