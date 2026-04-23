
/** Truncate any address/PDA/signature with ellipsis */
export function short(s: string, left = 4, right = 4): string {
  if (!s || s.length <= left + right + 3) return s ?? '';
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
export function cap(s: string): string {
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

/** Byte array → short hex preview (first 16 chars + …) */
export function hashToHex(arr: number[]): string {
  if (!arr || arr.length === 0) return '—';
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16) + '…';
}

/** Byte array → full hex string */
export function hashToFullHex(arr: number[] | undefined): string {
  if (!arr || arr.length === 0) return '—';
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Check if a hash byte array is all zeros */
export function hashIsEmpty(arr: number[]): boolean {
  return !arr || arr.every((b: number) => b === 0);
}
