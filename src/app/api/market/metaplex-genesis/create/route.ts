import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createGenesisLaunch } from '~/lib/metaplex/genesis';
import type {
  MetaplexGenesisCreateLaunchRequest,
} from '~/lib/metaplex/genesis-types';

function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function validatePayload(payload: MetaplexGenesisCreateLaunchRequest): string | null {
  if (!payload.wallet || !isValidPubkey(payload.wallet)) {
    return 'Invalid wallet public key';
  }

  if (!payload.launch) return 'Missing launch payload';

  const l = payload.launch;
  if (!l.name || l.name.length < 1 || l.name.length > 32) return 'Invalid token name';
  if (!l.symbol || l.symbol.length < 1 || l.symbol.length > 10) return 'Invalid token symbol';
  if (!l.image || !l.image.startsWith('https://')) return 'Invalid token image URL';
  if (l.type !== 'launchpool' && l.type !== 'presale') return 'Invalid launch type';
  if (!l.publicKey || !isValidPubkey(l.publicKey)) return 'Invalid launch publicKey';
  if (!Array.isArray(l.allocations) || l.allocations.length === 0) return 'Missing allocations';

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as MetaplexGenesisCreateLaunchRequest | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const validationError = validatePayload(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const result = await createGenesisLaunch(body);
  if (result.error || !result.data) {
    return NextResponse.json(
      {
        success: false,
        error: result.error ?? 'Create launch failed',
      },
      { status: result.status >= 400 ? result.status : 502 },
    );
  }

  return NextResponse.json(result.data, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
