import { isDbDown, markDbDown } from '~/db';
import { apiEscrowToDb, dbEscrowToApi } from '~/lib/db/mappers';
import { selectAllEscrows, selectEscrowByPda, upsertEscrows } from '~/lib/db/queries';
import { findAllEscrows, serialize } from '~/lib/sap/discovery';
import type { PublicDataSource } from '~/types';

export type PublicEscrowsResult = {
  escrows: Array<Record<string, unknown>>;
  total: number;
  source: PublicDataSource;
};

export type PublicEscrowDetailResult = {
  escrow: Record<string, unknown>;
  source: PublicDataSource;
};

export async function listPublicEscrows(input: { limit: number }): Promise<PublicEscrowsResult> {
  const { limit } = input;

  if (!isDbDown()) {
    try {
      const rows = await selectAllEscrows();
      if (rows.length > 0) {
        const escrows = rows.map((row) => dbEscrowToApi(row)).slice(0, limit);
        return {
          escrows,
          total: escrows.length,
          source: 'db',
        };
      }
    } catch {
      markDbDown();
    }
  }

  const rpcRows = await findAllEscrows();
  const serialized = rpcRows.map((e) => ({
    pda: e.pda.toBase58(),
    ...serialize(e.account as Record<string, unknown>),
    status: 'active',
  }));

  if (!isDbDown()) {
    upsertEscrows(serialized.map((e) => apiEscrowToDb(e))).catch(() => {
      markDbDown();
    });
  }

  const limited = serialized.slice(0, limit);
  return {
    escrows: limited,
    total: limited.length,
    source: 'rpc',
  };
}

export async function getPublicEscrowByPda(pda: string): Promise<PublicEscrowDetailResult | null> {
  if (!isDbDown()) {
    try {
      const row = await selectEscrowByPda(pda);
      if (row) {
        return {
          escrow: dbEscrowToApi(row) as Record<string, unknown>,
          source: 'db',
        };
      }
    } catch {
      markDbDown();
    }
  }

  const rows = await findAllEscrows();
  const match = rows.find((e) => e.pda.toBase58() === pda);
  if (!match) return null;

  const serialized = {
    pda: match.pda.toBase58(),
    ...serialize(match.account as Record<string, unknown>),
    status: 'active',
  };

  return {
    escrow: serialized,
    source: 'rpc',
  };
}

