/**
 * Server-only on-chain reader for Metaplex Genesis launches.
 *
 * Wraps `@metaplex-foundation/genesis` Umi calls behind a small JSON-safe
 * surface so route handlers don't have to deal with `bigint`/`PublicKey`
 * types directly.
 *
 * Why a wrapper:
 *   - The REST API at api.metaplex.com only returns metadata. To show
 *     graduation progress, raised SOL, finalized state, and bucket count
 *     we must read `GenesisAccountV2` directly from chain.
 *   - Umi types use `bigint` and Umi `PublicKey` (string-branded). API
 *     routes serialize to JSON and clients want plain numbers/strings.
 */

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import {
  genesis,
  safeFetchGenesisAccountV2,
  getGenesisAccountV2GpaBuilder,
  getGenesisAccountV1GpaBuilder,
} from '@metaplex-foundation/genesis';
import { getRpcConfig } from '~/lib/sap/discovery';

export interface GenesisAccountOnchain {
  address: string;
  authority: string;
  baseMint: string;
  quoteMint: string;
  finalized: boolean;
  /** Numeric on-chain enum. 0 = Uninitialized, 3 = LaunchPoolV1. */
  launchType: number;
  bucketCount: number;
  /** Total token supply in base units (no decimals applied). */
  totalSupplyBaseToken: string;
  /** Supply allocated across buckets in base units. */
  totalAllocatedSupplyBaseToken: string;
  /** Total deposits collected, in quote-token base units (lamports for wSOL). */
  totalProceedsQuoteToken: string;
  fundingMode: number;
  index: number;
}

let _umi: ReturnType<typeof createUmi> | null = null;

function getUmi() {
  if (_umi) return _umi;
  const { url } = getRpcConfig();
  _umi = createUmi(url).use(genesis());
  return _umi;
}

/**
 * Fetch GenesisAccountV2 by its on-chain address (as returned by the
 * Integration API as `genesisAddress`). Returns `null` if the account
 * does not exist or RPC fails.
 */
export async function fetchGenesisAccountByAddress(
  address: string,
): Promise<GenesisAccountOnchain | null> {
  try {
    const umi = getUmi();
    const account = await safeFetchGenesisAccountV2(umi, publicKey(address));
    if (!account) return null;

    return {
      address: account.publicKey.toString(),
      authority: account.authority.toString(),
      baseMint: account.baseMint.toString(),
      quoteMint: account.quoteMint.toString(),
      finalized: account.finalized,
      launchType: Number(account.launchType),
      bucketCount: Number(account.bucketCount),
      totalSupplyBaseToken: account.totalSupplyBaseToken.toString(),
      totalAllocatedSupplyBaseToken: account.totalAllocatedSupplyBaseToken.toString(),
      totalProceedsQuoteToken: account.totalProceedsQuoteToken.toString(),
      fundingMode: Number(account.fundingMode),
      index: Number(account.index),
    };
  } catch {
    return null;
  }
}

/* ── On-chain GPA — Genesis launches by authority ────────
 *
 * Canonical Metaplex Genesis source-of-truth. Every Genesis launch
 * stores the launch creator in `GenesisAccountV2.authority`. We query
 * `getProgramAccounts` (via the SDK's GpaBuilder) filtered by that
 * field — this is exactly what the official SDK docs prescribe:
 *
 *   getGenesisAccountV2GpaBuilder(umi)
 *     .whereField('authority', wallet)
 *     .getDeserialized()
 *
 * For backwards compatibility we also query `GenesisAccountV1` (the
 * legacy account) the same way and merge the results. V1 is rare in
 * production but still indexed by Metaplex Explorer.
 *
 * Returns one entry per launch (an authority can have multiple
 * launches across distinct base mints / genesis indices). Entries are
 * de-duplicated by `baseMint` keeping the V2 record when both exist
 * — V2 carries `launchType`, V1 does not.
 *
 * Failure mode: returns `[]` on any RPC error rather than throwing,
 * so callers can degrade gracefully.
 */
export interface GenesisLaunchByAuthority {
  address: string;
  baseMint: string;
  authority: string;
  finalized: boolean;
  /** 0 = Uninitialized (crank pending), 3 = LaunchPoolV1, undefined for V1 accounts. */
  launchType: number | undefined;
  /** Account schema version that surfaced this launch. */
  version: 'v1' | 'v2';
}

export async function fetchGenesisLaunchesByAuthority(
  authority: string,
): Promise<GenesisLaunchByAuthority[]> {
  const out: GenesisLaunchByAuthority[] = [];
  const umi = getUmi();
  const authorityPk = publicKey(authority);

  // V2 — current schema. This is what `initializeV2` writes today.
  try {
    const v2 = await getGenesisAccountV2GpaBuilder(umi)
      .whereField('authority', authorityPk)
      .getDeserialized();
    for (const acc of v2) {
      out.push({
        address: acc.publicKey.toString(),
        baseMint: acc.baseMint.toString(),
        authority: acc.authority.toString(),
        finalized: acc.finalized,
        launchType: Number(acc.launchType),
        version: 'v2',
      });
    }
  } catch {
    // V2 query failed (RPC issue); fall through and try V1.
  }

  // V1 — legacy schema. Drop V1 hits whose mint already exists in V2.
  // Note: V1 calls the field `mint` (not `baseMint`) and has no
  // `launchType` / `bucketCount` — only `buckets` array.
  try {
    const v1 = await getGenesisAccountV1GpaBuilder(umi)
      .whereField('authority', authorityPk)
      .getDeserialized();
    const seenMints = new Set(out.map((x) => x.baseMint));
    for (const acc of v1) {
      const baseMint = acc.mint.toString();
      if (seenMints.has(baseMint)) continue;
      out.push({
        address: acc.publicKey.toString(),
        baseMint,
        authority: acc.authority.toString(),
        finalized: acc.finalized,
        launchType: undefined,
        version: 'v1',
      });
    }
  } catch {
    // ignore
  }

  return out;
}
