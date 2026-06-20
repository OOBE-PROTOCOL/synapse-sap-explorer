
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decimalPublicKeyToBase58(decimal: unknown): string | null {
  const raw = typeof decimal === 'string' || typeof decimal === 'number' || typeof decimal === 'bigint'
    ? String(decimal)
    : typeof (decimal as { toString?: unknown })?.toString === 'function'
      ? (decimal as { toString: () => string }).toString()
      : '';
  if (!/^\d+$/.test(raw)) return null;

  let n: bigint;
  try {
    n = BigInt(raw);
  } catch {
    return null;
  }

  const bytes = new Array<number>(32).fill(0);
  for (let i = 31; i >= 0 && n > 0n; i--) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n > 0n) return null;

  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);

  let encoded = '';
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }

  for (const byte of bytes) {
    if (byte === 0) encoded = BASE58_ALPHABET[0] + encoded;
    else break;
  }

  return encoded || BASE58_ALPHABET[0];
}

export function asPublicKeyText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"_bn"')) {
      try {
        return asPublicKeyText(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof (value as { toBase58?: unknown }).toBase58 === 'function') {
    return (value as { toBase58: () => string }).toBase58();
  }
  if (typeof (value as { toString?: unknown }).toString === 'function') {
    const text = (value as { toString: () => string }).toString();
    if (text && text !== '[object Object]') return text;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('_bn' in obj) {
      const pubkey = decimalPublicKeyToBase58(obj._bn);
      if (pubkey) return pubkey;
    }
    for (const key of ['address', 'pubkey', 'publicKey', 'pda', 'wallet', 'owner', 'mint', 'agent', 'depositor', 'signature', 'txSignature', 'id']) {
      const nested = asPublicKeyText(obj[key]);
      if (nested && nested !== '[object Object]') return nested;
    }
  }
  return '';
}

/** Convert an arbitrary display value to text without assuming BN objects are addresses. */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof (value as { toBase58?: unknown }).toBase58 === 'function') {
    return (value as { toBase58: () => string }).toBase58();
  }
  if (typeof (value as { toString?: unknown }).toString === 'function') {
    const text = (value as { toString: () => string }).toString();
    if (text && text !== '[object Object]') return text;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['address', 'pubkey', 'publicKey', 'pda', 'wallet', 'owner', 'mint', 'agent', 'depositor', 'signature', 'txSignature', 'id']) {
      const nested = asPublicKeyText(obj[key]) || asText(obj[key]);
      if (nested && nested !== '[object Object]') return nested;
    }
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : '';
    } catch {
      return '';
    }
  }
  return String(value);
}

/** URL-safe dynamic route segment from any chain value. */
export function pathSegment(value: unknown): string {
  const text = asPublicKeyText(value) || asText(value);
  return text ? encodeURIComponent(text) : '';
}

/** Build an internal entity path without leaking [object Object] into hrefs. */
export function entityPath(base: string, value: unknown): string {
  const segment = pathSegment(value);
  return segment ? `${base}/${segment}` : base;
}

export function short(value: unknown, left = 4, right = 4): string {
  const s = asPublicKeyText(value) || asText(value);
  if (!s || s.length <= left + right + 3) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}`;
}

/** Human-readable relative time from a unix timestamp (seconds) or ISO string */
export function timeAgo(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined) return '—';
  // Handle ISO date strings
  const num = typeof ts === 'string' && ts.includes('-')
    ? Math.floor(new Date(ts).getTime() / 1000)
    : Number(ts);
  if (isNaN(num) || num === 0) return '—';
  const sec = Math.floor(Date.now() / 1000 - num);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Format lamports → SOL string */
export function fmtSol(lamports: number | string, decimals = 4): string {
  const sol = Number(lamports) / 1e9;
  if (sol === 0) return '0 SOL';
  // Show full decimals instead of scientific notation for small values
  const maxDec = Math.max(decimals, 9);
  if (sol < 0.0001) return sol.toFixed(maxDec).replace(/0+$/, '0') + ' SOL';
  return sol.toFixed(decimals) + ' SOL';
}

/** Compact number formatting (1.2K, 3.5M) */
export function fmtNum(n: number | string): string {
  const v = Number(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toLocaleString();
}

/** Format USDC amounts (raw on-chain units with 6 decimals) */
export function fmtUsdc(rawAmount: number | string, decimals = 2): string {
  const usdc = Number(rawAmount) / 1e6;
  if (usdc === 0) return '0 USDC';
  if (usdc < 0.01) return usdc.toFixed(6).replace(/0+$/, '0') + ' USDC';
  return usdc.toFixed(decimals) + ' USDC';
}

/** Score → color class */
export function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-primary';
  return 'text-red-400';
}

/** Score → background class */
export function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10';
  if (score >= 60) return 'bg-yellow-500/10';
  if (score >= 40) return 'bg-primary/10';
  return 'bg-red-500/10';
}

/** Solscan URL generator */
export function solscanUrl(type: 'account' | 'tx', value: string): string {
  return `https://solscan.io/${type}/${value}`;
}

/** Format a Date or ISO string to short date */
export function fmtDate(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format lamports to SOL as a number (for calculations) */
export function lamportsToSol(lamports: number | string): number {
  return Number(lamports) / 1e9;
}

/** Convert raw on-chain USDC (6 decimals) to a number */
export function lamportsToUsdc(raw: number | string): number {
  return Number(raw) / 1e6;
}

/** Format lamports → SOL with locale formatting (accepts string | number, returns dash for null) */
export function formatLamports(lamports: string | number | null): string {
  if (lamports === null || lamports === undefined) return '—';
  const val = Number(lamports);
  if (isNaN(val)) return '—';
  if (val === 0) return '0 SOL';
  return `${(val / 1e9).toFixed(4)} SOL`;
}

/** Format raw token amount by decimals (generic: SOL=9, USDC=6, etc.) */
export function formatTokenAmount(raw: string | number, decimals: number): string {
  const value = Number(raw) / 10 ** decimals;
  if (value === 0) return '0';
  if (value < 0.001) return value.toFixed(6);
  if (value < 1) return value.toFixed(4);
  return value.toFixed(2);
}

/** Format a unix timestamp (seconds) to human-readable date string */
export function formatTimestamp(ts: string | number | undefined): string {
  if (!ts) return '—';
  const num = Number(ts);
  if (isNaN(num) || num === 0) return '—';
  const date = new Date(num * 1000);
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Capitalize first letter */
export function cap(value: unknown): string {
  const s = asText(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Check if a pubkey is the system program default (all 1s) */
export function isDefaultPubkey(addr: string): boolean {
  return !addr || addr === '11111111111111111111111111111111';
}

/** Extract key from Anchor enum variant, e.g. { defi: {} } → "defi" */
export function enumKey(v: unknown): string {
  if (v == null) return 'Unknown';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length > 0) return keys[0];
  }
  return String(v);
}

/** Parse Anchor enum to display string (capitalized first letter) */
export function parseAnchorEnum(obj: unknown): string {
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object' && obj !== null) {
    const key = Object.keys(obj)[0];
    return key ? cap(key) : '—';
  }
  return String(obj);
}

type HashLike =
  | string
  | number[]
  | Uint8Array
  | ArrayBuffer
  | { type?: unknown; data?: unknown }
  | null
  | undefined;

function hashBytes(input: HashLike): number[] {
  if (!input) return [];
  if (typeof input === 'string') {
    const hex = input.startsWith('0x') ? input.slice(2) : input;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    }
    return [];
  }
  if (Array.isArray(input)) return input;
  if (input instanceof Uint8Array) return Array.from(input);
  if (input instanceof ArrayBuffer) return Array.from(new Uint8Array(input));
  if (typeof input === 'object') {
    const data = (input as { data?: unknown }).data;
    if (Array.isArray(data)) return data.filter((byte): byte is number => typeof byte === 'number');
    const nested = hashBytes(data as HashLike);
    if (nested.length > 0) return nested;
  }
  return [];
}

function hashToHexString(input: HashLike): string {
  if (typeof input === 'string') {
    const hex = input.startsWith('0x') ? input.slice(2) : input;
    return /^[0-9a-fA-F]+$/.test(hex) ? hex.toLowerCase() : '';
  }
  const bytes = hashBytes(input);
  if (bytes.length === 0) return '';
  const ascii = String.fromCharCode(...bytes);
  if (/^[0-9a-fA-F]+$/.test(ascii) && ascii.length % 2 === 0) {
    return ascii.toLowerCase();
  }
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Byte array → short hex preview (first 16 chars + …) */
export function hashToHex(arr: HashLike): string {
  const hex = hashToHexString(arr);
  if (!hex) return '—';
  return hex.slice(0, 16) + '…';
}

/** Byte array → full hex string */
export function hashToFullHex(arr: HashLike): string {
  return hashToHexString(arr) || '—';
}

/** Check if a hash byte array is all zeros */
export function hashIsEmpty(arr: HashLike): boolean {
  const hex = hashToHexString(arr);
  return !hex || /^0+$/.test(hex);
}
