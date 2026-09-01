import { NextResponse } from 'next/server';
import {
  fetchGenesisAccountByAddress,
  type GenesisAccountOnchain,
} from '~/lib/metaplex/genesis-onchain';

export const dynamic = 'force-dynamic';

const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidAddress(address: string): boolean {
  return BASE58_ADDRESS_RE.test(address);
}

export interface GenesisOnchainPayload {
  genesisAddress: string;
  account: GenesisAccountOnchain | null;
  /** Allocated / total supply, scaled to [0, 1]. `null` if total supply is 0. */
  allocationProgress: number | null;
  /** Total proceeds in SOL (assuming wSOL quote mint). `null` otherwise. */
  proceedsSol: number | null;
}

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ genesis: string }> },
) {
  const { genesis: genesisAddress } = await params;
  if (!isValidAddress(genesisAddress)) {
    return NextResponse.json({ error: 'Invalid genesis address' }, { status: 400 });
  }

  const account = await fetchGenesisAccountByAddress(genesisAddress);

  let allocationProgress: number | null = null;
  let proceedsSol: number | null = null;

  if (account) {
    const total = BigInt(account.totalSupplyBaseToken);
    const allocated = BigInt(account.totalAllocatedSupplyBaseToken);
    if (total > 0n) {
      // Scale via Number to keep precision good enough for a 0..1 ratio.
      allocationProgress = Number((allocated * 10_000n) / total) / 10_000;
    }
    if (account.quoteMint === WRAPPED_SOL_MINT) {
      proceedsSol = Number(BigInt(account.totalProceedsQuoteToken)) / 1_000_000_000;
    }
  }

  const payload: GenesisOnchainPayload = {
    genesisAddress,
    account,
    allocationProgress,
    proceedsSol,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
    },
  });
}
