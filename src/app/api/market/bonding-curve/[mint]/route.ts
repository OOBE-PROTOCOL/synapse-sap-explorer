import { NextResponse } from 'next/server';
import { PublicKey, Connection } from '@solana/web3.js';
import { getRpcConfig } from '~/lib/sap/discovery';

type Holder = {
  address: string;
  amount: number;
  percentage: number;
  rank: number;
};

type TokenProgramKind = 'spl-token' | 'token-2022';

type BondingCurveData = {
  mint: string;
  supply: number;
  decimals: number;
  /** Owning program of the mint — drives UI badge + holder query path. */
  tokenProgram: TokenProgramKind;
  holders: Holder[];
  topHolderPercent: number;
  top10Percent: number;
  top50Percent: number;
  holderCount: number;
};

/* Solana SPL Token program IDs. */
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJsyFbPVwwQQfq5x5nnwrA8Cuu');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/* Token-account data sizes per program. Legacy SPL = 165 bytes; Token-2022
 * accounts are at least 165 but may be larger when extensions are present —
 * we drop the dataSize filter for Token-2022 and rely on the mint memcmp. */
const SPL_TOKEN_ACCOUNT_SIZE = 165;

async function fetchHolders(mint: string): Promise<BondingCurveData | null> {
  try {
    const rpcConfig = getRpcConfig();
    const connection = new Connection(rpcConfig.url, 'confirmed');

    const mintPubkey = new PublicKey(mint);

    // Fetch mint metadata. The account `owner` tells us which token program
    // controls this mint (legacy SPL vs Token-2022). Metaplex Genesis can
    // launch under either depending on whether extensions (transfer hook,
    // metadata pointer, …) are required, so we MUST detect dynamically.
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey, 'confirmed');
    if (!mintInfo.value || !mintInfo.value.data) return null;

    const ownerProgram = mintInfo.value.owner.toBase58();
    const tokenProgramId =
      ownerProgram === TOKEN_2022_PROGRAM_ID.toBase58() ? TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
    const tokenProgram: TokenProgramKind =
      tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? 'token-2022' : 'spl-token';

    const parsedData = mintInfo.value.data as any;
    if (parsedData.type !== 'mint' || !parsedData.parsed?.info) return null;

    const supply = parseInt(parsedData.parsed.info.supply || '0');
    const decimals = parsedData.parsed.info.decimals || 0;
    const supplyDisplay = supply / Math.pow(10, decimals);

    // Get all token accounts for this mint, scoped to the correct program.
    // Token-2022 accounts have variable size (extensions), so omit dataSize
    // and rely solely on the mint memcmp filter.
    const tokenAccounts = await connection.getParsedProgramAccounts(
      tokenProgramId,
      {
        filters: [
          ...(tokenProgram === 'spl-token'
            ? [{ dataSize: SPL_TOKEN_ACCOUNT_SIZE }]
            : []),
          {
            memcmp: {
              offset: 0, // Mint address offset in token account
              bytes: mint,
            },
          },
        ],
      },
    );

    // Parse and sort holders by balance
    const holders: Holder[] = tokenAccounts
      .map((acc) => {
        const data = acc.account.data as any;
        if (data.type !== 'account' || !data.parsed?.info) return null;
        
        const amount = parseInt(data.parsed.info.tokenAmount?.amount || '0');
        return {
          address: acc.pubkey.toBase58(),
          amount,
          percentage: supply > 0 ? (amount / supply) * 100 : 0,
        };
      })
      .filter((h): h is Omit<Holder, 'rank'> => h !== null)
      .sort((a, b) => b.amount - a.amount)
      .map((h, idx) => ({ ...h, rank: idx + 1 }))
      .slice(0, 50); // Top 50 holders

    const topHolderPercent = holders[0]?.percentage ?? 0;
    const top10Percent = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
    const top50Percent = holders.reduce((sum, h) => sum + h.percentage, 0);

    return {
      mint,
      supply: supplyDisplay,
      decimals,
      tokenProgram,
      holders,
      topHolderPercent,
      top10Percent,
      top50Percent,
      holderCount: tokenAccounts.length,
    };
  } catch (error) {
    console.error('[bonding-curve API] Error fetching holders:', error);
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;

  // Validate mint
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 });
  }

  try {
    const data = await fetchHolders(mint);
    
    return NextResponse.json({ data }, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
