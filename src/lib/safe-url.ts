import { asText } from '~/lib/format';

const SAFE_WEB_PROTOCOLS = new Set(['http:', 'https:']);

export function safeExternalUrl(value: unknown): string | null {
  const raw = asText(value).trim();
  if (!raw) return null;

  if (/^ipfs:\/\//i.test(raw)) {
    const path = raw.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '');
    return path ? `https://ipfs.io/ipfs/${path}` : null;
  }

  if (/^ar:\/\//i.test(raw)) {
    const id = raw.replace(/^ar:\/\//i, '');
    return id ? `https://arweave.net/${id}` : null;
  }

  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(candidate);
    return SAFE_WEB_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
