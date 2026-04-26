/**
 * GET /api/sap/agents/[wallet]/nfts
 *
 * Lists all MPL Core NFTs owned by the wallet, flagging which ones
 * carry an EIP-8004 AgentIdentity plugin (and which point at this
 * wallet's SAP agent PDA).
 */
import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import {
  getMetaplexAssetsForWallet,
  getMetaplexAssetById,
  type MetaplexNftItem,
} from '~/lib/sap/metaplex-link';
import { listRegistryAgentsForWallet } from '~/lib/metaplex/registry';
import { getRpcConfig, getSapClient } from '~/lib/sap/discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet: walletOrId } = await params;
  const data = await swr(
    `agent:${walletOrId}:nfts`,
    async () => {
      const { url } = getRpcConfig();
      const resolved = await getSapClient().metaplex.resolveAgentIdentifier({
        identifier: walletOrId,
        rpcUrl: url,
      }).catch(() => null);
      const wallet = resolved?.wallet?.toBase58() ?? walletOrId;

      const owned = await getMetaplexAssetsForWallet(wallet);
      const registry = await listRegistryAgentsForWallet(wallet, 'solana-mainnet');
      const ownedSet = new Set(owned.items.map((i) => i.asset));

      const transferredFromRegistry = await Promise.all(
        (registry.agents ?? [])
          .filter((a) => !ownedSet.has(a.mintAddress) || a.walletAddress !== wallet)
          .map(async (a) => {
            const asset = await getMetaplexAssetById(a.mintAddress, owned.sapAgentPda).catch(() => null);
            const row: MetaplexNftItem = asset ?? {
              asset: a.mintAddress,
              name: a.name ?? null,
              description: a.description ?? null,
              image: a.image ?? null,
              updateAuthority: a.authority ?? null,
              agentIdentityUri: a.agentMetadataUri ?? null,
              linkedToThisAgent: false,
              hasAgentIdentity: true,
              identityHost: null,
              registration: null,
              ownedByWallet: false,
              currentOwner: a.walletAddress ?? null,
              wasTransferred: true,
              salePriceSol: null,
              source: 'registry',
            };
            return {
              ...row,
              ownedByWallet: false,
              currentOwner: a.walletAddress ?? row.currentOwner,
              wasTransferred: true,
              salePriceSol: row.salePriceSol ?? null,
              source: 'registry' as const,
            };
          }),
      );

      const mergedItems = [...owned.items, ...transferredFromRegistry];
      const deduped = mergedItems.filter((it, idx, arr) =>
        arr.findIndex((x) => x.asset === it.asset) === idx,
      );

      return {
        ...owned,
        items: deduped,
        total: deduped.length,
        withAgentIdentity: deduped.filter((i) => i.hasAgentIdentity).length,
        linkedToThisAgent: deduped.filter((i) => i.linkedToThisAgent).length,
      };
    },
    { ttl: 60_000, swr: 300_000 },
  );
  return synapseResponse(data);
}
