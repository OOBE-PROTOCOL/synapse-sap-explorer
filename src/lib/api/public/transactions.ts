import { isDbDown, markDbDown } from '~/db';
import { dbTxToApi } from '~/lib/db/mappers';
import { countTransactions, selectTransactions, selectTxDetails } from '~/lib/db/queries';
import type { ApiTransaction, PublicDataSource } from '~/types';

export type PublicTransactionsResult = {
  transactions: ApiTransaction[];
  total: number;
  source: PublicDataSource;
};

export type PublicTransactionDetailResult = {
  detail: Record<string, unknown>;
  source: PublicDataSource;
};

export async function listPublicTransactions(input: { perPage: number; offset: number }): Promise<PublicTransactionsResult> {
  const { perPage, offset } = input;

  if (!isDbDown()) {
    try {
      const [rows, total] = await Promise.all([
        selectTransactions(perPage, offset),
        countTransactions(),
      ]);

      if (rows.length > 0) {
        return {
          transactions: rows.map((row: (typeof rows)[number]) => dbTxToApi(row)),
          total,
          source: 'db',
        };
      }
    } catch {
      markDbDown();
    }
  }

  return {
    transactions: [],
    total: 0,
    source: 'internal',
  };
}

export async function getPublicTransactionBySignature(signature: string): Promise<PublicTransactionDetailResult | null> {
  if (isDbDown()) return null;

  try {
    const row = await selectTxDetails(signature);
    if (!row) return null;

    const blockTime = row.blockTime
      ? Math.floor(new Date(row.blockTime).getTime() / 1000)
      : null;

    return {
      detail: {
        signature: row.signature,
        slot: row.slot ?? null,
        blockTime,
        fee: row.fee ?? 0,
        status: row.status,
        error: row.errorData ?? null,
        version: row.version ?? 'legacy',
        accountKeys: row.accountKeys ?? [],
        instructions: row.instructions ?? [],
        logs: row.logs ?? [],
        balanceChanges: row.balanceChanges ?? [],
        tokenBalanceChanges: row.tokenBalanceChanges ?? [],
        computeUnitsConsumed: row.computeUnits ?? null,
      },
      source: 'db',
    };
  } catch {
    markDbDown();
    return null;
  }
}

