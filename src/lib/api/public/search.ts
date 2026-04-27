import { globalSearch } from '~/lib/db/queries';
import type { PublicDataSource, SearchResult } from '~/types';

export type PublicSearchResult = {
  results: SearchResult[];
  total: number;
  source: PublicDataSource;
};

export async function searchPublicEntities(query: string, limit: number): Promise<PublicSearchResult> {
  if (query.trim().length < 2) {
    return { results: [], total: 0, source: 'internal' };
  }

  const rows = await globalSearch(query, limit);
  const results = rows.map((r): SearchResult => ({
    pda: r.pda,
    name: r.name,
    wallet: r.wallet,
    type: r.type,
  }));

  return {
    results,
    total: results.length,
    source: 'db',
  };
}

