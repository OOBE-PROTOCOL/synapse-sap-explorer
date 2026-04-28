import type {
  MetaplexGenesisApiFailure,
  MetaplexGenesisCreateLaunchRequest,
  MetaplexGenesisCreateLaunchResponse,
  MetaplexGenesisErrorResponse,
  MetaplexGenesisLaunchData,
  MetaplexGenesisListLaunchesData,
  MetaplexGenesisNetwork,
  MetaplexGenesisRegisterLaunchRequest,
  MetaplexGenesisRegisterLaunchResponse,
  MetaplexGenesisTokenData,
} from '~/lib/metaplex/genesis-types';

const BASE_URL = 'https://api.metaplex.com/v1';
const DEFAULT_TIMEOUT_MS = 5000;

type FetchResult<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getErrorMessage(value: unknown): string | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const err = asRecord(rec.error);
  if (!err) return null;
  return typeof err.message === 'string' ? err.message : null;
}

function getSuccessFalseMessage(value: unknown): string | null {
  const rec = asRecord(value);
  if (!rec) return null;
  if (rec.success === false && typeof rec.error === 'string') {
    return rec.error;
  }
  return null;
}

function getAnyApiErrorMessage(value: unknown): string | null {
  return getErrorMessage(value) ?? getSuccessFalseMessage(value);
}

function toNetworkQuery(network: MetaplexGenesisNetwork): string {
  return network === 'solana-devnet' ? '?network=solana-devnet' : '';
}

async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchResult<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    const status = res.status;
    const raw = (await res.json().catch(() => null)) as T | MetaplexGenesisErrorResponse | null;

    if (!res.ok) {
      const message = getAnyApiErrorMessage(raw) ?? `Metaplex API request failed (${status})`;
      return { data: null, error: message, status };
    }

    if (!raw) return { data: null, error: 'Empty Metaplex API response', status };
    return { data: raw as T, error: null, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metaplex API request failed';
    return { data: null, error: message, status: 502 };
  }
}

async function postJson<TResponse, TBody>(
  path: string,
  body: TBody,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchResult<TResponse>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const status = res.status;
    const raw = (await res.json().catch(() => null)) as TResponse | MetaplexGenesisErrorResponse | MetaplexGenesisApiFailure | null;

    if (!res.ok) {
      const message = getAnyApiErrorMessage(raw) ?? `Metaplex API request failed (${status})`;
      return { data: null, error: message, status };
    }

    if (!raw) return { data: null, error: 'Empty Metaplex API response', status };

    const successFalseMessage = getSuccessFalseMessage(raw);
    if (successFalseMessage) {
      return { data: null, error: successFalseMessage, status };
    }

    return { data: raw as TResponse, error: null, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metaplex API request failed';
    return { data: null, error: message, status: 502 };
  }
}

export async function getGenesisLaunchByAddress(
  genesisPubkey: string,
  network: MetaplexGenesisNetwork = 'solana-mainnet',
): Promise<FetchResult<MetaplexGenesisLaunchData>> {
  return fetchJson<MetaplexGenesisLaunchData>(
    `/launches/${encodeURIComponent(genesisPubkey)}${toNetworkQuery(network)}`,
  );
}

export async function getGenesisTokenLaunches(
  mint: string,
  network: MetaplexGenesisNetwork = 'solana-mainnet',
): Promise<FetchResult<MetaplexGenesisTokenData>> {
  return fetchJson<MetaplexGenesisTokenData>(
    `/tokens/${encodeURIComponent(mint)}${toNetworkQuery(network)}`,
  );
}

export async function listGenesisLaunches(
  network: MetaplexGenesisNetwork = 'solana-mainnet',
): Promise<FetchResult<MetaplexGenesisListLaunchesData>> {
  return fetchJson<MetaplexGenesisListLaunchesData>(`/launches${toNetworkQuery(network)}`);
}

export async function createGenesisLaunch(
  input: MetaplexGenesisCreateLaunchRequest,
): Promise<FetchResult<MetaplexGenesisCreateLaunchResponse>> {
  return postJson<MetaplexGenesisCreateLaunchResponse, MetaplexGenesisCreateLaunchRequest>(
    '/launches/create',
    input,
  );
}

export async function registerGenesisLaunch(
  input: MetaplexGenesisRegisterLaunchRequest,
): Promise<FetchResult<MetaplexGenesisRegisterLaunchResponse>> {
  return postJson<MetaplexGenesisRegisterLaunchResponse, MetaplexGenesisRegisterLaunchRequest>(
    '/launches/register',
    input,
  );
}
