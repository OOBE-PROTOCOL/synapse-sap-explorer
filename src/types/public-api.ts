/* Public API v1 contracts (stable external surface) */

export type PublicDataSource = 'db' | 'cache' | 'rpc' | 'mixed' | 'internal';

export type PublicApiMeta = {
  requestId: string;
  source?: PublicDataSource;
  dataAgeMs?: number;
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  warnings?: string[];
};

export type PublicApiSuccess<T> = {
  data: T;
  meta: PublicApiMeta;
};

export type PublicApiErrorCode =
  | 'DB_UNAVAILABLE'
  | 'RPC_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'INVALID_PARAM'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'STALE_DATA';

export type PublicApiErrorBody = {
  error: {
    code: PublicApiErrorCode;
    message: string;
    retryAfter?: number;
    requestId: string;
  };
};

export type ApiComponentHealth = {
  status: 'ok' | 'degraded' | 'error';
  latencyMs?: number;
  error?: string;
};

export type StatusResponseV1 = {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  timestamp: string;
  components: {
    database: ApiComponentHealth;
    rpc: ApiComponentHealth;
    indexer: {
      status: 'ok' | 'stale' | 'degraded' | 'down';
      cursors: Array<{
        entity: string;
        lastSyncAgoSec: number;
        stale: boolean;
        maxAgeSec: number;
      }>;
    };
  };
};

