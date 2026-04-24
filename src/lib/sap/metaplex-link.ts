/* ──────────────────────────────────────────────────────────
 * SAP × Metaplex Core — server-side bridge helpers
 *
 * Discovers MPL Core assets linked to a SAP agent via the
 * AgentIdentity external plugin (mpl-core >= 1.9.0, EIP-8004).
 *
 * Strategy (Phase 1, aligned with Metaplex docs):
 *   1. Derive the SAP agent PDA from the wallet.
 *   2. Enumerate MPL Core assets owned by the wallet directly
 *      on-chain via mpl-core's `fetchAssetsByOwner` (uses
 *      `getProgramAccounts` against the MPL Core program — no
 *      DAS/RPC indexer dependency).
 *   3. Read `asset.agentIdentities[0].uri` straight from the
 *      deserialized AssetV1 plugin data — canonical per
 *      `Read Agent Data` and `Register an Agent` docs.
 *   4. Fetch the EIP-8004 / NFT metadata JSON via `asset.uri`
 *      to extract description and image (with IPFS gateway
 *      normalization).
 *
 * The on-chain pass works even when the DAS gRPC plugin has
 * not indexed historical accounts.
 *
 * All functions are server-only.
 * ────────────────────────────────────────────────────────── */

import { PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { deriveAgent } from '@oobe-protocol-labs/synapse-sap-sdk/pda';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey as umiPublicKey, type Umi } from '@metaplex-foundation/umi';
import {
  fetchAssetsByOwner,
  fetchAsset,
  type AssetV1,
} from '@metaplex-foundation/mpl-core';
import { getRpcConfig, getSapClient, getSynapseConnection } from './discovery';
import { env } from '~/lib/env';
import { SAP_EXPLORER_BASE_URL } from '../constants';
import type {
  RegisterAgentInput,
  TripleCheckResult,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries';

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
  /** Which enumeration tier returned the data ('das' | 'on-chain' | 'none'). */
  source: 'das' | 'on-chain' | 'none';
  /** Per-tier diagnostics (always populated; useful when items=[]). */
  diagnostics: string[];
  error: string | null;
};

/* ── Helpers ───────────────────────────────────────────── */

/**
 * Canonical SAP Explorer host used as the EIP-8004 registration base URL.
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` (preview/staging override)
 *   2. `SITE_URL` (server-only override)
 *   3. `SAP_EXPLORER_BASE_URL` constant (default `https://explorer.oobeprotocol.ai`)
 */
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  SAP_EXPLORER_BASE_URL;

function buildExpectedUrl(sapAgentPda: string, baseUrl = DEFAULT_BASE_URL): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/agents/${sapAgentPda}/eip-8004.json`;
}

/* ── Authenticated Umi singleton ───────────────────────── */

let _umi: Umi | null = null;

/**
 * Build a Umi instance pointed at the Synapse RPC with the
 * required `x-api-key` header injected on every JSON-RPC call.
 * Without the header Synapse returns 401 and silently breaks
 * mpl-core fetchers.
 */
function getAuthenticatedUmi(): Umi {
  if (_umi) return _umi;
  const { url } = getRpcConfig();
  _umi = createUmi(url, {
    httpHeaders: { 'x-api-key': env.SYNAPSE_API_KEY },
  });
  return _umi;
}

/* ── IPFS / metadata helpers ───────────────────────────── */

function normalizeIpfsUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const value = uri.trim();
  if (!value) return null;
  if (value.startsWith('ipfs://')) {
    const path = value.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return `https://gateway.irys.xyz/ipfs/${path}`;
  }
  return value;
}

function resolveMetadataImageUrl(
  json: Record<string, unknown>,
  metadataUrl: string,
): string | null {
  const rootCandidates = [
    json.image,
    json.image_url,
    (json as { imageUrl?: unknown }).imageUrl,
    (json as { imageURI?: unknown }).imageURI,
  ];
  for (const candidate of rootCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const norm = normalizeIpfsUri(candidate);
      if (norm) return norm;
    }
  }

  const props = json.properties;
  if (props && typeof props === 'object') {
    const propImage = (props as { image?: unknown }).image;
    if (typeof propImage === 'string' && propImage.trim()) {
      return normalizeIpfsUri(propImage);
    }
    const files = (props as { files?: unknown }).files;
    if (Array.isArray(files)) {
      for (const file of files) {
        if (!file || typeof file !== 'object') continue;
        const uri = (file as { uri?: unknown }).uri;
        const type =
          (file as { type?: unknown; mime?: unknown }).type ??
          (file as { type?: unknown; mime?: unknown }).mime;
        if (typeof uri !== 'string' || !uri.trim()) continue;
        const normalized = normalizeIpfsUri(uri);
        if (!normalized) continue;
        if (typeof type === 'string' && type.startsWith('image/')) return normalized;
        if (!type) return normalized;
      }
    }
  }

  // Final fallback: relative paths against metadata URL origin
  const relative = typeof json.image === 'string' ? json.image.trim() : '';
  if (relative && !/^(https?:|ipfs:)/i.test(relative)) {
    try {
      return new URL(relative, metadataUrl).toString();
    } catch {
      // ignore
    }
  }
  return null;
}

async function fetchMetadataJson(
  uri: string | null,
): Promise<{ name: string | null; description: string | null; image: string | null } | null> {
  const metadataUrl = normalizeIpfsUri(uri);
  if (!metadataUrl) return null;
  try {
    const res = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const parsed = await res.json();
    if (!parsed || typeof parsed !== 'object') return null;
    const json = parsed as Record<string, unknown>;
    return {
      name: typeof json.name === 'string' ? json.name : null,
      description: typeof json.description === 'string' ? json.description : null,
      image: resolveMetadataImageUrl(json, metadataUrl),
    };
  } catch {
    return null;
  }
}

/* ── Asset enumeration: DAS-first, on-chain fallback ──── */

/**
 * Read the AgentIdentity plugin URI off a deserialized AssetV1.
 * Per Metaplex docs the canonical accessor is `asset.agentIdentities?.[0].uri`.
 */
function readAgentIdentityUri(asset: AssetV1): string | null {
  const list = (asset as unknown as { agentIdentities?: Array<{ uri?: unknown }> })
    .agentIdentities;
  if (!Array.isArray(list) || list.length === 0) return null;
  const uri = list[0]?.uri;
  return typeof uri === 'string' && uri.trim() ? uri : null;
}

/**
 * Source of the asset enumeration — surfaced in responses so UIs can
 * indicate which path returned data (DAS hit vs on-chain backfill).
 */
type EnumerationSource = 'das' | 'on-chain' | 'none';

interface EnumerationResult {
  source: EnumerationSource;
  assets: AssetV1[];
  diagnostics: string[];
}

/**
 * Enumerate MPL Core assets owned by `wallet` using a tiered strategy:
 *
 *   Tier 1 — DAS `getAssetsByOwner` (fast, indexed). Filters to mpl-core
 *           assets and re-hydrates each one to a typed `AssetV1` via
 *           `fetchAsset` for plugin access.
 *   Tier 2 — On-chain `fetchAssetsByOwner` (heavy `getProgramAccounts`,
 *           often disabled on shared RPCs but indexer-independent).
 *
 * Diagnostics are appended for each tier attempted so callers can show
 * meaningful empty-state errors instead of silent zeros.
 */
async function enumerateAssetsForWallet(
  wallet: PublicKey,
): Promise<EnumerationResult> {
  const diagnostics: string[] = [];

  // Tier 1 — DAS (preferred).
  try {
    const dasAssets = await fetchAssetsViaDas(wallet);
    if (dasAssets.length > 0) {
      return { source: 'das', assets: dasAssets, diagnostics };
    }
    diagnostics.push('DAS returned 0 assets');
  } catch (e) {
    diagnostics.push(`DAS lookup failed: ${(e as Error).message}`);
  }

  // Tier 2 — direct on-chain enumeration.
  try {
    const umi = getAuthenticatedUmi();
    const assets = await fetchAssetsByOwner(umi, umiPublicKey(wallet.toBase58()));
    if (assets.length > 0) {
      return { source: 'on-chain', assets, diagnostics };
    }
    diagnostics.push('On-chain fetchAssetsByOwner returned 0 assets');
  } catch (e) {
    diagnostics.push(`On-chain lookup failed: ${(e as Error).message}`);
  }

  return { source: 'none', assets: [], diagnostics };
}

/**
 * Tier 1 — DAS `getAssetsByOwner`. Returns hydrated AssetV1 entries by
 * re-fetching each Core asset id via `fetchAsset` (DAS-side plugin shape
 * is unreliable per the 2026-04 audit).
 */
async function fetchAssetsViaDas(wallet: PublicKey): Promise<AssetV1[]> {
  const { url, headers } = getRpcConfig();
  const body = {
    jsonrpc: '2.0',
    id: 'sap-explorer-getAssetsByOwner',
    method: 'getAssetsByOwner',
    params: {
      ownerAddress: wallet.toBase58(),
      page: 1,
      limit: 1000,
      displayOptions: { showCollectionMetadata: false },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`DAS HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    result?: { items?: Array<{ id: string; interface?: string }> };
    error?: { message?: string };
  };
  if (json.error) throw new Error(`DAS error: ${json.error.message ?? 'unknown'}`);
  const items = json.result?.items ?? [];
  // Keep only MPL Core assets (interface = "MplCoreAsset").
  const coreIds = items
    .filter((it) => it.interface === 'MplCoreAsset')
    .map((it) => it.id);
  if (coreIds.length === 0) return [];

  const umi = getAuthenticatedUmi();
  const hydrated = await Promise.allSettled(
    coreIds.map((id) => fetchAsset(umi, umiPublicKey(id))),
  );
  return hydrated
    .filter((r): r is PromiseFulfilledResult<AssetV1> => r.status === 'fulfilled')
    .map((r) => r.value);
}

async function toItem(asset: AssetV1, sapAgentPda: string | null): Promise<MetaplexNftItem> {
  const uri = readAgentIdentityUri(asset);
  const expectedSuffix = sapAgentPda ? `/agents/${sapAgentPda}/eip-8004.json` : null;
  const linkedToThisAgent = !!uri && !!expectedSuffix && uri.endsWith(expectedSuffix);

  const updateAuthorityField = (asset as unknown as {
    updateAuthority?: { address?: { toString(): string } };
  }).updateAuthority;
  const updateAuthority = updateAuthorityField?.address
    ? updateAuthorityField.address.toString()
    : null;

  const meta = await fetchMetadataJson(asset.uri ?? null);

  return {
    asset: asset.publicKey.toString(),
    name: asset.name ?? meta?.name ?? null,
    description: meta?.description ?? null,
    image: meta?.image ?? null,
    updateAuthority,
    agentIdentityUri: uri,
    linkedToThisAgent,
    hasAgentIdentity: !!uri,
  };
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

  const enumeration = await enumerateAssetsForWallet(walletPk);
  const assets = enumeration.assets;

  for (const a of assets) {
    const uri = readAgentIdentityUri(a);
    if (!uri) continue;
    if (!uri.endsWith(expectedSuffix)) continue;

    let registration: unknown = null;
    try {
      const res = await fetch(uri, { signal: AbortSignal.timeout(5000) });
      if (res.ok) registration = await res.json();
    } catch {
      // best-effort; link itself is verified
    }

    return {
      sapAgentPda,
      asset: a.publicKey.toString(),
      expectedUrl,
      linked: true,
      agentIdentityUri: uri,
      registration,
      error: null,
    };
  }

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

/**
 * Resolve a single asset (by Core asset id) into our portfolio item shape.
 * Useful when an asset id is known but ownership enumeration missed it.
 */
export async function getMetaplexAssetById(
  assetId: string,
  sapAgentPda: string | null = null,
): Promise<MetaplexNftItem | null> {
  let assetPk: PublicKey;
  try {
    assetPk = new PublicKey(assetId);
  } catch {
    return null;
  }
  let asset: AssetV1;
  try {
    asset = await fetchAsset(getAuthenticatedUmi(), umiPublicKey(assetPk.toBase58()));
  } catch {
    return null;
  }
  return await toItem(asset, sapAgentPda);
}

/**
 * List all MPL Core assets owned by `wallet` and flag which ones
 * carry an EIP-8004 AgentIdentity plugin (and which point to this wallet's SAP agent).
 *
 * Source of truth: on-chain `fetchAssetsByOwner` — independent of DAS indexers.
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
      source: 'none',
      diagnostics: [],
      error: 'Invalid wallet pubkey',
    };
  }

  const [sapPdaPk] = deriveAgent(walletPk);
  const sapAgentPda = sapPdaPk.toBase58();
  const expectedUrl = buildExpectedUrl(sapAgentPda);

  const enumeration = await enumerateAssetsForWallet(walletPk);
  const assets = enumeration.assets;
  const enumerationError =
    assets.length === 0 && enumeration.diagnostics.length > 0
      ? enumeration.diagnostics.join(' | ')
      : null;

  const items = await Promise.all(assets.map((a) => toItem(a, sapAgentPda)));

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
    source: enumeration.source,
    diagnostics: enumeration.diagnostics,
    error: enumerationError,
  };
}

/* ──────────────────────────────────────────────────────────
 * Triple-check verification + register flows (v0.9.3)
 *
 * The following API surface bridges the explorer to the canonical
 * SDK `MetaplexBridge` so server endpoints can:
 *
 *   1. Verify a SAP × MPL link with three independent layers
 *      (mpl-core on-chain plugin + EIP-8004 JSON cross-check + SAP
 *      AgentAccount existence on-chain).
 *   2. Build unsigned/partial-signed transactions for the three
 *      register flows (SAP→MPL, MPL→SAP, atomic both).
 *
 * All endpoints return a `base64Tx` ready for the client wallet
 * adapter to sign and submit. Asset keypairs (when minting MPL
 * Core) are generated server-side, used to partial-sign the tx,
 * and never returned to the client.
 * ────────────────────────────────────────────────────────── */

export type LinkTripleCheck = {
  asset: string;
  sapAgentPda: string;
  layers: {
    mplOnChain: boolean;
    eip8004Json: boolean;
    sapOnChain: boolean;
  };
  linked: boolean;
  agentIdentityUri: string | null;
  registration: unknown | null;
  agentName: string | null;
  error: string | null;
};

export type RegisterFlowResult = {
  ok: boolean;
  /** Base64-serialized v0 transaction ready for wallet adapter signing. */
  base64Tx: string | null;
  sapAgentPda: string;
  /** New MPL Core asset address (only for mint flows). */
  assetAddress: string | null;
  /** Canonical EIP-8004 URL the AgentIdentity plugin will point to. */
  registrationUrl: string | null;
  alreadyRegistered: boolean;
  message: string | null;
  error: string | null;
};

/**
 * Triple-check the SAP × MPL link for a single MPL Core asset.
 *
 *   Layer 1 — mplOnChain : asset readable + has AgentIdentity plugin
 *   Layer 2 — eip8004Json: registration JSON resolves and `synapseAgent`
 *                          matches the derived SAP PDA
 *   Layer 3 — sapOnChain : SAP `AgentAccount` exists at that PDA
 *
 * `linked === true` only when all three layers pass. UIs may still
 * surface partial states (e.g. plugin present, JSON pending).
 */
export async function tripleCheckMetaplexLink(
  assetId: string,
  expectedOwner?: string,
): Promise<LinkTripleCheck> {
  let assetPk: PublicKey;
  try {
    assetPk = new PublicKey(assetId);
  } catch {
    return {
      asset: assetId,
      sapAgentPda: '',
      layers: { mplOnChain: false, eip8004Json: false, sapOnChain: false },
      linked: false,
      agentIdentityUri: null,
      registration: null,
      agentName: null,
      error: 'Invalid asset pubkey',
    };
  }
  let ownerPk: PublicKey | undefined;
  if (expectedOwner) {
    try {
      ownerPk = new PublicKey(expectedOwner);
    } catch {
      ownerPk = undefined;
    }
  }

  const { url, headers } = getRpcConfig();
  const client = getSapClient();
  let result: TripleCheckResult;
  try {
    result = await client.metaplex.tripleCheckLink({
      asset: assetPk,
      expectedOwner: ownerPk,
      rpcUrl: url,
      rpcHeaders: headers,
    });
  } catch (e) {
    return {
      asset: assetId,
      sapAgentPda: '',
      layers: { mplOnChain: false, eip8004Json: false, sapOnChain: false },
      linked: false,
      agentIdentityUri: null,
      registration: null,
      agentName: null,
      error: `tripleCheckLink failed: ${(e as Error).message}`,
    };
  }

  return {
    asset: result.asset.toBase58(),
    sapAgentPda: result.sapAgentPda.toBase58(),
    layers: {
      mplOnChain: result.mplOnChain,
      eip8004Json: result.eip8004Json,
      sapOnChain: result.sapOnChain,
    },
    linked: result.linked,
    agentIdentityUri: result.agentIdentityUri,
    registration: result.registration,
    agentName: result.identity ? (result.identity as { name?: string }).name ?? null : null,
    error: result.error,
  };
}

/* ── Internal: build a wallet-ready base64 tx ──────────── */

async function buildBase64Tx(
  feePayer: PublicKey,
  instructions: readonly { programId: PublicKey; keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]; data: Buffer }[],
  partialSigners: Keypair[] = [],
): Promise<string> {
  const conn = getSynapseConnection();
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer, recentBlockhash: blockhash });
  for (const ix of instructions) tx.add(ix);
  for (const signer of partialSigners) tx.partialSign(signer);
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}

/* ── Flow 1 — SAP → MPL ─────────────────────────────────
 *
 * Wallet already has a SAP agent. Mint a fresh MPL Core asset and
 * attach the AgentIdentity plugin in one transaction.
 * Caller wallet must own / be the authority of the asset operations.
 */
export async function buildSapToMetaplexFlow(input: {
  walletAddress: string;
  name: string;
  metadataUri: string;
}): Promise<RegisterFlowResult> {
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(input.walletAddress);
  } catch {
    return _flowError('Invalid wallet pubkey');
  }

  const [sapPda] = deriveAgent(walletPk);
  const { url } = getRpcConfig();
  const client = getSapClient();

  // Pre-check: SAP agent must exist (otherwise use buildLinkBothFlow).
  let sapExists = false;
  try {
    await (client.agent as unknown as {
      fetch(p: PublicKey): Promise<unknown>;
    }).fetch(sapPda);
    sapExists = true;
  } catch {
    sapExists = false;
  }
  if (!sapExists) {
    return {
      ok: false,
      base64Tx: null,
      sapAgentPda: sapPda.toBase58(),
      assetAddress: null,
      registrationUrl: null,
      alreadyRegistered: false,
      message: 'No SAP agent found for this wallet — use the atomic both-register flow.',
      error: 'sap-agent-missing',
    };
  }

  try {
    const mint = await client.metaplex.buildMintAndAttachIxs({
      sapAgentOwner: walletPk,
      authority: walletPk,
      payer: walletPk,
      owner: walletPk,
      name: input.name,
      metadataUri: input.metadataUri,
      registrationBaseUrl: DEFAULT_BASE_URL,
      rpcUrl: url,
    });
    const assetKp = Keypair.fromSecretKey(mint.assetSecretKey);
    const base64Tx = await buildBase64Tx(walletPk, mint.instructions, [assetKp]);
    return {
      ok: true,
      base64Tx,
      sapAgentPda: sapPda.toBase58(),
      assetAddress: mint.assetAddress.toBase58(),
      registrationUrl: mint.registrationUrl,
      alreadyRegistered: false,
      message: 'Sign with wallet to mint MPL Core asset and attach AgentIdentity.',
      error: null,
    };
  } catch (e) {
    return _flowError((e as Error).message, sapPda.toBase58());
  }
}

/* ── Flow 2 — MPL → SAP ─────────────────────────────────
 *
 * Wallet already owns an MPL Core asset (with or without AgentIdentity).
 * Build the SAP `registerAgent` instruction for the asset's owner.
 * Idempotent: if a SAP agent already exists, returns alreadyRegistered=true.
 */
export async function buildMetaplexToSapFlow(input: {
  assetAddress: string;
  registerArgs: RegisterAgentInput;
}): Promise<RegisterFlowResult> {
  let assetPk: PublicKey;
  try {
    assetPk = new PublicKey(input.assetAddress);
  } catch {
    return _flowError('Invalid asset pubkey');
  }

  const { url } = getRpcConfig();
  const client = getSapClient();

  let result;
  try {
    result = await client.metaplex.buildRegisterSapForMplOwnerIx({
      asset: assetPk,
      registerArgs: input.registerArgs,
      rpcUrl: url,
    });
  } catch (e) {
    return _flowError((e as Error).message);
  }

  if (result.alreadyRegistered || !result.instruction) {
    return {
      ok: true,
      base64Tx: null,
      sapAgentPda: result.sapAgentPda.toBase58(),
      assetAddress: assetPk.toBase58(),
      registrationUrl: buildExpectedUrl(result.sapAgentPda.toBase58()),
      alreadyRegistered: true,
      message: 'Asset owner already has a SAP agent — nothing to do.',
      error: null,
    };
  }

  try {
    const base64Tx = await buildBase64Tx(result.assetOwner, [result.instruction], []);
    return {
      ok: true,
      base64Tx,
      sapAgentPda: result.sapAgentPda.toBase58(),
      assetAddress: assetPk.toBase58(),
      registrationUrl: buildExpectedUrl(result.sapAgentPda.toBase58()),
      alreadyRegistered: false,
      message: 'Asset owner must sign to create the SAP agent.',
      error: null,
    };
  } catch (e) {
    return _flowError((e as Error).message, result.sapAgentPda.toBase58());
  }
}

/* ── Flow 3 — Atomic both ───────────────────────────────
 *
 * Wallet has neither side. Single transaction:
 *   [SAP registerAgent, MPL Core create, MPL AgentIdentity attach].
 */
export async function buildLinkBothFlow(input: {
  walletAddress: string;
  registerArgs: RegisterAgentInput;
  mintName: string;
  mintMetadataUri: string;
}): Promise<RegisterFlowResult> {
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(input.walletAddress);
  } catch {
    return _flowError('Invalid wallet pubkey');
  }

  const { url } = getRpcConfig();
  const client = getSapClient();

  try {
    const result = await client.metaplex.buildRegisterBothIxs({
      wallet: walletPk,
      payer: walletPk,
      registerArgs: input.registerArgs,
      mintName: input.mintName,
      mintMetadataUri: input.mintMetadataUri,
      registrationBaseUrl: DEFAULT_BASE_URL,
      rpcUrl: url,
    });
    const assetKp = Keypair.fromSecretKey(result.assetSecretKey);
    const base64Tx = await buildBase64Tx(walletPk, result.instructions, [assetKp]);
    return {
      ok: true,
      base64Tx,
      sapAgentPda: result.sapAgentPda.toBase58(),
      assetAddress: result.assetAddress.toBase58(),
      registrationUrl: result.registrationUrl,
      alreadyRegistered: false,
      message: 'Sign with wallet to atomically register SAP agent + mint MPL Core asset + attach AgentIdentity.',
      error: null,
    };
  } catch (e) {
    return _flowError((e as Error).message);
  }
}

function _flowError(message: string, sapAgentPda = ''): RegisterFlowResult {
  return {
    ok: false,
    base64Tx: null,
    sapAgentPda,
    assetAddress: null,
    registrationUrl: null,
    alreadyRegistered: false,
    message: null,
    error: message,
  };
}
