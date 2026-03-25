/* ──────────────────────────────────────────────────────────
 * cn() — Tailwind class merging utility
 * ────────────────────────────────────────────────────────── */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Formatting helpers ─────────────────────────────────── */

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatLamports(lamports: number): string {
  return formatNumber(lamports / 1_000_000_000, 4);
}

export function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function truncateSignature(sig: string, chars = 20): string {
  if (sig.length <= chars + 3) return sig;
  return `${sig.slice(0, chars)}...`;
}

export function timeAgo(date: Date | number): string {
  const now = Date.now();
  const ts = typeof date === 'number' ? date * 1000 : date.getTime();
  const diff = now - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
