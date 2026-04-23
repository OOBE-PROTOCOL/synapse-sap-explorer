/* ──────────────────────────────────────────────────────────
 * SAP × Metaplex Core — server-side bridge helpers
 *
 * Discovers MPL Core assets linked to a SAP agent via the
 * AgentIdentity external plugin (mpl-core >= 1.9.0, EIP-8004).
 *
 * Strategy:
 *   1. Derive the SAP agent PDA from the wallet.
 *   2. Use Synapse RPC's DAS (`getAssetsByOwner`) to enumerate
 *      MPL Core assets owned by the wallet.
 *   3. Filter to assets that carry an AgentIdentity adapter
 *      whose URI ends with `/agents/<sapAgentPda>/eip-8004.json`.
 *   4. Use `client.metaplex.getUnifiedProfile({ asset, rpcUrl })`
 *      to fetch the merged SAP + MPL + EIP-8004 view.
 *
 * All functions are server-only.
 * ────────────────────────────────────────────────────────── */

import { PublicKey } from '@solana/web3.js';
import { deriveAgent } from '@oobe-protocol-labs/synapse-sap-sdk/pda';
import { getSapClient, getRpcConfig } from './discovery';

/* ── Types ─────────────────────────────────────────────── */

export type MetaplexLinkSnapshot = {
  /** SAP agent PDA (base58). Always present. */
  sapAgentPda: string;
  /** Linked MPL Core asset address (base58), or null if no link found. */
  asset: string | null;
  /** Canonical EIP-8004 registration URL the asset SHOULD point to. */
  expectedUrl: string;
  /** Whether the link is cryptographically verified bidirectionally. */
  linked: boolean;
  /** Raw plugin URI from the asset, or null. */
  agentIdentityUri: string | null;
  /** Decoded EIP-8004 registration JSON, or null. */
  registration: unknown | null;
  /** Last error encountered (debug only), or null. */
  error: string | null;
};

/* ── DAS shape we care about ───────────────────────────── */

interface DasMplCoreAsset {
  id: string;
  interface: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
    files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>;
    json_uri?: string;
  };
  external_plugins?: Array<{
    type?: string;
    plugin_type?: string;
    adapter_config?: { uri?: string } | null;
    data?: { uri?: string } | null;
  }>;
}

interface DasGetAssetsByOwnerResponse {
  result?: { items?: DasMplCoreAsset[] };
  error?: { message?: string };
}

/* ── Helpers ───────────────────────────────────────────── */

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  'https://explorer.oobeprotocol.ai';

function buildExpectedUrl(sapAgentPda: string, baseUrl = DEFAULT_BASE_URL): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/agents/${sapAgentPda}/eip-8004.json`;
}

/**
 * Find the URI carried by an MPL Core asset's AgentIdentity external plugin,
 * regardless of which DAS field shape the RPC returns it in.
 */
function extractAgentIdentityUri(asset: DasMplCoreAsset): string | null {
  const plugins = asset.external_plugins ?? [];
  for (const p of plugins) {
    const kind = (p.type ?? p.plugin_type ?? '').toString();
    if (!/agentidentity/i.test(kind)) continue;
    const uri = p.adapter_config?.uri ?? p.data?.uri ?? null;
    if (uri) return uri;
  }
  return null;
}

/**
 * Query the configured Synapse RPC for MPL Core assets owned by `wallet`.
 * Returns the raw items list (already filtered to MplCoreAsset interface).
 */
async function dasGetMplCoreAssetsByOwner(wallet: string): Promise<DasMplCoreAsset[]> {
  const { url, headers } = getRpcConfig();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'mpl-link',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: wallet,
        page: 1,
        limit: 100,
        displayOptions: { showCollectionMetadata: false },
      },
    }),
  });
  if (!res.ok) throw new Error(`DAS getAssetsByOwner ${res.status}`);
  const json = (await res.json()) as DasGetAssetsByOwnerResponse;
  if (json.error) throw new Error(json.error.message ?? 'DAS error');
  const items = json.result?.items ?? [];
  return items.filter((a) => /MplCoreAsset/i.test(a.interface ?? ''));
}

/* ── Public API ────────────────────────────────────────── */

/**
 * Resolve the SAP × MPL link for a wallet.
 *
 * Returns a snapshot with `linked: false` and `asset: null` when no MPL Core
 * asset owned by the wallet carries an AgentIdentity URI matching this
 * SAP agent's canonical registration URL.
 *
 * Never throws; all errors are captured in `snapshot.error`.
 */
export async function getMetaplexLinkSnapshot(
  wallet: string,
): Promise<MetaplexLinkSnapshot> {
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
  } catch {
    return {
      sapAgentPda: wallet,
      asset: null,
      expectedUrl: '',
      linked: false,
      agentIdentityUri: null,
      registration: null,
      error: 'Invalid wallet pubkey',
    };
  }

  const [sapPdaPk] = deriveAgent(walletPk);
  const sapAgentPda = sapPdaPk.toBase58();
  const expectedUrl = buildExpectedUrl(sapAgentPda);
  const expectedSuffix = `/agents/${sapAgentPda}/eip-8004.json`;

  // 1. Enumerate MPL Core assets via DAS.
  let candidates: DasMplCoreAsset[];
  try {
    candidates = await dasGetMplCoreAssetsByOwner(wallet);
  } catch (e) {
    return {
      sapAgentPda,
      asset: null,
      expectedUrl,
      linked: false,
      agentIdentityUri: null,
      registration: null,
      error: `DAS lookup failed: ${(e as Error).message}`,
    };
  }

  // 2. Pick the first asset whose AgentIdentity URI points to this PDA.
  let pickedAsset: string | null = null;
  let pickedUri: string | null = null;
  for (const a of candidates) {
    const uri = extractAgentIdentityUri(a);
    if (uri && uri.endsWith(expectedSuffix)) {
      pickedAsset = a.id;
      pickedUri = uri;
      break;
    }
  }

  if (!pickedAsset) {
    return {
      sapAgentPda,
      asset: null,
      expectedUrl,
      linked: false,
      agentIdentityUri: null,
      registration: null,
      error: null,
    };
  }

  // 3. Use the bridge to verify + hydrate the registration JSON.
  try {
    const { url } = getRpcConfig();
    const profile = await getSapClient().metaplex.getUnifiedProfile({
      asset: new PublicKey(pickedAsset),
      rpcUrl: url,
    });
    return {
      sapAgentPda,
      asset: pickedAsset,
      expectedUrl,
      linked: profile.linked,
      agentIdentityUri: profile.mpl?.agentIdentityUri ?? pickedUri,
      registration: profile.mpl?.registration ?? null,
      error: null,
    };
  } catch (e) {
    return {
      sapAgentPda,
      asset: pickedAsset,
      expectedUrl,
      linked: false,
      agentIdentityUri: pickedUri,
      registration: null,
      error: `Bridge fetch failed: ${(e as Error).message}`,
    };
  }
}

/* ── MPL Core / EIP-8004 NFT listing ───────────────────── */

export type MetaplexNftItem = {
  asset: string;
  name: string | null;
  description: string | null;
  image: string | null;
  updateAuthority: string | null;
  agentIdentityUri: string | null;
  /** True when the AgentIdentity URI matches this wallet's SAP agent PDA. */
  linkedToThisAgent: boolean;
  /** True when the asset has any EIP-8004 AgentIdentity plugin (linked to any agent). */
  hasAgentIdentity: boolean;
};

export type MetaplexAssetsResponse = {
  sapAgentPda: string;
  expectedUrl: string;
  total: number;
  withAgentIdentity: number;
  linkedToThisAgent: number;
  items: MetaplexNftItem[];
  error: string | null;
};

/**
 * Fetch metadata JSON from URI (if present)
 */
async function fetchMetadataJson(uri: string | null): Promise<{ description?: string; image?: string } | null> {
  if (!uri) return null;
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    return { description: json.description ?? null, image: json.image ?? null };
  } catch {
    return null;
  }
}

function pickImage(asset: DasMplCoreAsset): string | null {
  const img = asset.content?.links?.image;
  if (img) return img;
  const file = asset.content?.files?.find((f) => f.mime?.startsWith('image/'));
  return file?.cdn_uri ?? file?.uri ?? null;
}

/**
 * List all MPL Core assets owned by `wallet` and flag which ones
 * carry an EIP-8004 AgentIdentity plugin (and which point to this wallet's SAP agent).
 */
export async function getMetaplexAssetsForWallet(
  wallet: string,
): Promise<MetaplexAssetsResponse> {
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
  } catch {
    return {
      sapAgentPda: wallet,
      expectedUrl: '',
      total: 0,
      withAgentIdentity: 0,
      linkedToThisAgent: 0,
      items: [],
      error: 'Invalid wallet pubkey',
    };
  }

  const [sapPdaPk] = deriveAgent(walletPk);
  const sapAgentPda = sapPdaPk.toBase58();
  const expectedUrl = buildExpectedUrl(sapAgentPda);
  const expectedSuffix = `/agents/${sapAgentPda}/eip-8004.json`;

  let assets: DasMplCoreAsset[];
  try {
    assets = await dasGetMplCoreAssetsByOwner(wallet);
  } catch (e) {
    return {
      sapAgentPda,
      expectedUrl,
      total: 0,
      withAgentIdentity: 0,
      linkedToThisAgent: 0,
      items: [],
      error: `DAS lookup failed: ${(e as Error).message}`,
    };
  }

  const items: MetaplexNftItem[] = await Promise.all(assets.map(async (a) => {
    const uri = extractAgentIdentityUri(a);
    const linkedToThisAgent = !!uri && uri.endsWith(expectedSuffix);
    const updateAuthority = (a as unknown as { authorities?: Array<{ address?: string | null }> })
      .authorities?.[0]?.address ?? null;
    
    // Fetch metadata JSON to get description
    let description: string | null = null;
    if (a.content?.json_uri) {
      const metadata = await fetchMetadataJson(a.content.json_uri);
      description = metadata?.description ?? null;
    }
    
    return {
      asset: a.id,
      name: a.content?.metadata?.name ?? null,
      description,
      image: pickImage(a),
      updateAuthority,
      agentIdentityUri: uri,
      linkedToThisAgent,
      hasAgentIdentity: !!uri,
    };
  }));

  // Sort: linked-to-this-agent → has AgentIdentity → others
  items.sort((a, b) => {
    if (a.linkedToThisAgent !== b.linkedToThisAgent) return a.linkedToThisAgent ? -1 : 1;
    if (a.hasAgentIdentity !== b.hasAgentIdentity) return a.hasAgentIdentity ? -1 : 1;
    return 0;
  });

  return {
    sapAgentPda,
    expectedUrl,
    total: items.length,
    withAgentIdentity: items.filter((i) => i.hasAgentIdentity).length,
    linkedToThisAgent: items.filter((i) => i.linkedToThisAgent).length,
    items,
    error: null,
  };
}
