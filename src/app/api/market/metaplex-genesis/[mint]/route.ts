import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  getGenesisTokenLaunches,
} from '~/lib/metaplex/genesis';
import type {
  MetaplexGenesisNetwork,
  MetaplexGenesisTokenLaunchesPayload,
} from '~/lib/metaplex/genesis-types';

function isValidMint(mint: string): boolean {
  try {
    new PublicKey(mint);
    return true;
  } catch {
    return false;
  }
}

function parseNetwork(req: Request): MetaplexGenesisNetwork {
  const { searchParams } = new URL(req.url);
  return searchParams.get('network') === 'solana-devnet'
    ? 'solana-devnet'
    : 'solana-mainnet';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;
  if (!isValidMint(mint)) {
    return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 });
  }

  const network = parseNetwork(request);
  const result = await getGenesisTokenLaunches(mint, network);
  const isNotFound = result.status === 404;

  const primaryLaunch =
    result.data?.launches.find((l) => l.status === 'live') ??
    result.data?.launches[0] ??
    null;

  const payload: MetaplexGenesisTokenLaunchesPayload = {
    mint,
    network,
    token: result.data,
    primaryLaunch,
    ...(!isNotFound && result.error ? { error: result.error } : {}),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=120',
    },
  });
}
