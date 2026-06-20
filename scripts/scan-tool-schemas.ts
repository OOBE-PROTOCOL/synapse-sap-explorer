#!/usr/bin/env node

/**
 * Tool Schema Auto-Scanner Cron Job
 * 
 * Scans all tools for inscribed schemas every 24 hours.
 * Runs via GitHub Actions, Vercel Cron, or manual execution.
 * 
 * Usage:
 *   pnpm tsx scripts/scan-tool-schemas.ts [--force]
 * 
 * Environment:
 *   - NEXT_PUBLIC_RPC_URL (optional, defaults to mainnet)
 *   - OOBEP_RPC_URL (optional, fallback RPC)
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const FORCE_SCAN = process.argv.includes('--force');

// Retry configuration with exponential backoff
const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;
const RATE_LIMIT_DELAY_MS = 2000; // Delay between batches

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute fetch with exponential backoff retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  context: string = 'API request'
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Success or non-retryable error
      if (response.ok || response.status < 500) {
        return response;
      }

      // Server error (5xx) - retry with backoff
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : delay + Math.random() * 1000; // Add jitter

      console.log(`Server responded with ${response.status}. Retrying after ${Math.round(waitTime)}ms delay... (attempt ${attempt}/${MAX_RETRIES})`);
      
      await sleep(waitTime);
      delay = Math.min(delay * 2, MAX_DELAY_MS); // Exponential backoff
      lastError = new Error(`HTTP ${response.status}`);
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === MAX_RETRIES) {
        break;
      }

      const waitTime = delay + Math.random() * 1000;
      console.log(`${context} failed. Retrying after ${Math.round(waitTime)}ms delay... (attempt ${attempt}/${MAX_RETRIES})`);
      
      await sleep(waitTime);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

async function scanToolSchemas() {
  console.log('🔍 Starting tool schema scan...');
  console.log(`   API: ${API_URL}`);
  console.log(`   Force: ${FORCE_SCAN ? 'yes' : 'no'}`);
  console.log(`   Max retries: ${MAX_RETRIES}`);
  console.log(`   Rate limit delay: ${RATE_LIMIT_DELAY_MS}ms`);
  console.log('');

  try {
    const startTime = Date.now();
    
    const response = await fetchWithRetry(
      `${API_URL}/api/sap/tools/schemas`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: FORCE_SCAN }),
      },
      'Schema scan'
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${error}`);
    }

    const result = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('✅ Scan completed successfully!');
    console.log('');
    console.log('📊 Results:');
    console.log(`   Total tools:     ${result.totalTools}`);
    console.log(`   Scanned:         ${result.scanned}`);
    console.log(`   With schema:     ${result.withSchema}`);
    console.log(`   Coverage:        ${((result.withSchema / result.totalTools) * 100).toFixed(1)}%`);
    console.log(`   Duration:        ${duration}s`);
    
    if (result.errors && result.errors.length > 0) {
      console.log('');
      console.log('⚠️  Errors:');
      result.errors.forEach((err: string, i: number) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    console.log('');
    console.log('💾 Schemas cached in database');
    console.log('🌐 Available at: /api/sap/tools/schemas');
    
    return result;
  } catch (error) {
    console.error('❌ Scan failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  scanToolSchemas();
}

export { scanToolSchemas };
