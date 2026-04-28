import { PublicApiError } from './errors';

export type PagePagination = {
  page: number;
  perPage: number;
  offset: number;
};

export type OffsetPagination = {
  limit: number;
  offset: number;
};

export function parsePagePagination(searchParams: URLSearchParams, defaults?: { page?: number; perPage?: number; maxPerPage?: number }): PagePagination {
  const pageDefault = defaults?.page ?? 1;
  const perPageDefault = defaults?.perPage ?? 25;
  const maxPerPage = defaults?.maxPerPage ?? 200;

  const pageRaw = Number(searchParams.get('page') ?? pageDefault);
  const perPageRaw = Number(searchParams.get('perPage') ?? perPageDefault);

  if (!Number.isFinite(pageRaw) || pageRaw < 1) {
    throw new PublicApiError('INVALID_PARAM', 'Invalid "page" value');
  }
  if (!Number.isFinite(perPageRaw) || perPageRaw < 1) {
    throw new PublicApiError('INVALID_PARAM', 'Invalid "perPage" value');
  }

  const perPage = Math.min(Math.trunc(perPageRaw), maxPerPage);
  const page = Math.trunc(pageRaw);

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
  };
}

export function parseOffsetPagination(searchParams: URLSearchParams, defaults?: { limit?: number; offset?: number; maxLimit?: number }): OffsetPagination {
  const limitDefault = defaults?.limit ?? 50;
  const offsetDefault = defaults?.offset ?? 0;
  const maxLimit = defaults?.maxLimit ?? 500;

  const limitRaw = Number(searchParams.get('limit') ?? limitDefault);
  const offsetRaw = Number(searchParams.get('offset') ?? offsetDefault);

  if (!Number.isFinite(limitRaw) || limitRaw < 1) {
    throw new PublicApiError('INVALID_PARAM', 'Invalid "limit" value');
  }
  if (!Number.isFinite(offsetRaw) || offsetRaw < 0) {
    throw new PublicApiError('INVALID_PARAM', 'Invalid "offset" value');
  }

  return {
    limit: Math.min(Math.trunc(limitRaw), maxLimit),
    offset: Math.trunc(offsetRaw),
  };
}

export function computeHasMore(total: number, offset: number, limit: number): boolean {
  return offset + limit < total;
}

