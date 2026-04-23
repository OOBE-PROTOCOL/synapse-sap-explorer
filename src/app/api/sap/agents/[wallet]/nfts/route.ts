/**
 * GET /api/sap/agents/[wallet]/nfts
 *
 * Lists all MPL Core NFTs owned by the wallet, flagging which ones
 * carry an EIP-8004 AgentIdentity plugin (and which point at this
 * wallet's SAP agent PDA).
 */
import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import { getMetaplexAssetsForWallet } from '~/lib/sap/metaplex-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await params;
  const data = await swr(
    `agent:${wallet}:nfts`,
    () => getMetaplexAssetsForWallet(wallet),
    { ttl: 60_000, swr: 300_000 },
  );
  return synapseResponse(data);
}
