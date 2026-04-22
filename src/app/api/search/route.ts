import { NextResponse, type NextRequest } from 'next/server';
import { db } from '~/db';
import { agents, tools, escrows, transactions } from '~/db/schema';
import { like, or } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q || q.length < 3) {
    return NextResponse.json([]);
  }

  const pattern = `${q}%`;

  const [agentRows, toolRows, escrowRows, txRows] = await Promise.allSettled([
    db.select({ pda: agents.pda, wallet: agents.wallet, name: agents.name })
      .from(agents)
      .where(or(like(agents.wallet, pattern), like(agents.pda, pattern), like(agents.name, pattern)))
      .limit(5),
    db.select({ pda: tools.pda, toolName: tools.toolName, agentPda: tools.agentPda })
      .from(tools)
      .where(or(like(tools.pda, pattern), like(tools.toolName, pattern)))
      .limit(5),
    db.select({ pda: escrows.pda, depositor: escrows.depositor, agentPda: escrows.agentPda })
      .from(escrows)
      .where(or(like(escrows.pda, pattern), like(escrows.depositor, pattern)))
      .limit(5),
    db.select({ signature: transactions.signature, signer: transactions.signer })
      .from(transactions)
      .where(or(like(transactions.signature, pattern), like(transactions.signer, pattern)))
      .limit(5),
  ]);

  type SearchResult = {
    type: string;
    label: string;
    sub: string;
    href: string;
  };

  const results: SearchResult[] = [];

  if (agentRows.status === 'fulfilled') {
    for (const row of agentRows.value) {
      results.push({
        type: 'agent',
        label: row.name ?? row.wallet ?? row.pda,
        sub: row.pda,
        href: `/agents/${row.wallet ?? row.pda}`,
      });
    }
  }
  if (toolRows.status === 'fulfilled') {
    for (const row of toolRows.value) {
      results.push({
        type: 'tool',
        label: row.toolName ?? row.pda,
        sub: row.agentPda ?? '',
        href: `/tools/${row.pda}`,
      });
    }
  }
  if (escrowRows.status === 'fulfilled') {
    for (const row of escrowRows.value) {
      results.push({
        type: 'escrow',
        label: row.pda,
        sub: row.depositor ?? '',
        href: `/escrows/${row.pda}`,
      });
    }
  }
  if (txRows.status === 'fulfilled') {
    for (const row of txRows.value) {
      results.push({
        type: 'tx',
        label: row.signature,
        sub: row.signer ?? '',
        href: `/tx/${row.signature}`,
      });
    }
  }

  return NextResponse.json(results);
}
