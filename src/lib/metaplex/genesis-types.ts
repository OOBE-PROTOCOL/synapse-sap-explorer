export type MetaplexGenesisNetwork = 'solana-mainnet' | 'solana-devnet';

export type MetaplexGenesisLaunchStatus =
  | 'upcoming'
  | 'live'
  | 'graduated'
  | 'ended';

export type MetaplexGenesisLaunchType =
  | 'launchpool'
  | 'presale'
  | 'bondingCurve'
  | 'auction';

/** Known mechanic variants returned by the Genesis Integration API. */
export type MetaplexGenesisMechanic =
  | 'launchpoolV2'
  | 'presaleV2'
  | 'bondingCurveV2'
  | 'auction'
  | (string & {});

export interface MetaplexGenesisLaunch {
  launchPage: string;
  mechanic: string;
  genesisAddress: string;
  spotlight: boolean;
  startTime: string;
  endTime: string;
  status: MetaplexGenesisLaunchStatus;
  heroUrl: string | null;
  graduatedAt: string | null;
  lastActivityAt: string;
  type: MetaplexGenesisLaunchType;
}

export interface MetaplexGenesisBaseToken {
  address: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
}

export interface MetaplexGenesisSocials {
  x?: string;
  telegram?: string;
  discord?: string;
}

export interface MetaplexGenesisLaunchData {
  launch: MetaplexGenesisLaunch;
  baseToken: MetaplexGenesisBaseToken;
  website?: string | null;
  socials?: MetaplexGenesisSocials | null;
}

export interface MetaplexGenesisTokenData {
  launches: MetaplexGenesisLaunch[];
  baseToken: MetaplexGenesisBaseToken;
  website?: string | null;
  socials?: MetaplexGenesisSocials | null;
}

export interface MetaplexGenesisListLaunchesData {
  launches: MetaplexGenesisLaunch[];
}

export interface MetaplexGenesisErrorResponse {
  error: {
    message: string;
  };
}

export interface MetaplexGenesisApiFailure {
  success: false;
  error: string;
  details?: unknown[];
}

export type MetaplexGenesisAllocationType =
  | 'launchpoolV2'
  | 'raydiumV2'
  | 'unlockedV2'
  | 'lockedV2'
  | 'presaleV2';

export interface MetaplexGenesisAllocationBase {
  type: MetaplexGenesisAllocationType;
  [key: string]: unknown;
}

export interface MetaplexGenesisExternalLinks {
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface MetaplexGenesisCreateLaunchConfig {
  name: string;
  symbol: string;
  image: string;
  description?: string;
  decimals?: number;
  supply?: number;
  network?: MetaplexGenesisNetwork;
  quoteMint?: string;
  type: MetaplexGenesisLaunchType;
  finalize?: boolean;
  allocations: MetaplexGenesisAllocationBase[];
  externalLinks?: MetaplexGenesisExternalLinks;
  publicKey: string;
}

export interface MetaplexGenesisCreateLaunchRequest {
  wallet: string;
  launch: MetaplexGenesisCreateLaunchConfig;
}

export interface MetaplexGenesisBlockhashWithExpiry {
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface MetaplexGenesisCreateLaunchSuccess {
  success: true;
  transactions: string[];
  blockhash: MetaplexGenesisBlockhashWithExpiry;
  mintAddress: string;
  genesisAccount: string;
}

export type MetaplexGenesisCreateLaunchResponse =
  | MetaplexGenesisCreateLaunchSuccess
  | MetaplexGenesisApiFailure;

export interface MetaplexGenesisRegisterLaunchRequest {
  genesisAccount: string;
  network?: MetaplexGenesisNetwork;
  launch: MetaplexGenesisCreateLaunchConfig;
}

export interface MetaplexGenesisRegisterLaunchSuccess {
  success: true;
  existing?: boolean;
  launch: {
    id: string;
    link: string;
  };
  token: {
    id: string;
    mintAddress: string;
  };
}

export type MetaplexGenesisRegisterLaunchResponse =
  | MetaplexGenesisRegisterLaunchSuccess
  | MetaplexGenesisApiFailure;

export interface MetaplexGenesisTokenLaunchesPayload {
  mint: string;
  network: MetaplexGenesisNetwork;
  token: MetaplexGenesisTokenData | null;
  primaryLaunch: MetaplexGenesisLaunch | null;
  error?: string;
}
