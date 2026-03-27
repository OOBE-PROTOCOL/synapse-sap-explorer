/* ──────────────────────────────────────────────
 * GET /api/og — Dynamic OG image generator
 *
 * Modes:
 *   ?type=tx&sig=...&status=...&block=...&time=...&fee=...&programs=...
 *   ?type=agent&name=...&score=...&calls=...&tools=...&status=...
 *   ?type=page&title=...&desc=...
 *   (default) — branded homepage card
 *
 * Uses the actual Synapse logo from /public/images/synapse.png
 * ────────────────────────────────────────────── */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const SITE_URL = 'https://explorer.oobeprotocol.ai';

/** Fetch the Synapse logo and return a data-uri for Satori */
async function getLogoSrc(origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/images/synapse.png`);
    const buf = await res.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `data:image/png;base64,${b64}`;
  } catch {
    return '';
  }
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const type = searchParams.get('type') ?? 'default';
  const logoSrc = await getLogoSrc(origin || SITE_URL);

  if (type === 'tx') return renderTxOG(searchParams, logoSrc);
  if (type === 'agent') return renderAgentOG(searchParams, logoSrc);
  if (type === 'page') return renderPageOG(searchParams, logoSrc);
  return renderDefaultOG(logoSrc);
}

/* ── Logo element (real image or fallback "S") ── */
function Logo({ src, size = 48 }: { src: string; size?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={size} height={size} style={{ borderRadius: size * 0.25 }} alt="" />
    );
  }
  return (
    <div
      style={{
        width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.25}px`,
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: `${size * 0.5}px`, color: 'white',
      }}
    >
      S
    </div>
  );
}

/* ── Transaction OG ── */
function renderTxOG(p: URLSearchParams, logoSrc: string) {
  const sig = p.get('sig') ?? '';
  const status = p.get('status') ?? 'unknown';
  const block = p.get('block') ?? '--';
  const time = p.get('time') ?? '--';
  const fee = p.get('fee') ?? '--';
  const programs = p.get('programs') ?? '--';
  const shortSig = sig.length > 20 ? `${sig.slice(0, 12)}...${sig.slice(-8)}` : sig;
  const isSuccess = status === 'success';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace', padding: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <Logo src={logoSrc} />
          <span style={{ color: '#a1a1aa', fontSize: '20px', letterSpacing: '0.2em' }}>SYNAPSE EXPLORER</span>
          <span style={{ color: '#52525b', fontSize: '18px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <span style={{ color: '#e4e4e7', fontSize: '28px', fontWeight: 600 }}>Transaction</span>
          <div style={{
            padding: '4px 16px', borderRadius: '9999px',
            background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isSuccess ? '#34d399' : '#f87171', fontSize: '18px', fontWeight: 600,
          }}>
            {isSuccess ? 'Success' : 'Failed'}
          </div>
        </div>
        <div style={{ display: 'flex', marginBottom: '40px' }}>
          <span style={{ color: '#a78bfa', fontSize: '22px', fontFamily: 'monospace' }}>{shortSig}</span>
        </div>
        <div style={{ display: 'flex', gap: '40px', marginTop: 'auto' }}>
          {[
            { label: 'Block', value: block },
            { label: 'Timestamp', value: time },
            { label: 'Fee', value: fee },
            { label: 'Programs', value: programs },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#71717a', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{item.label}</span>
              <span style={{ color: '#e4e4e7', fontSize: '22px', fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Agent OG ── */
function renderAgentOG(p: URLSearchParams, logoSrc: string) {
  const name = p.get('name') ?? 'Unknown Agent';
  const score = p.get('score') ?? '0';
  const calls = p.get('calls') ?? '0';
  const tools = p.get('tools') ?? '0';
  const status = p.get('status') === 'active' ? 'Active' : 'Inactive';
  const isActive = status === 'Active';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace', padding: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <Logo src={logoSrc} />
          <span style={{ color: '#a1a1aa', fontSize: '20px', letterSpacing: '0.2em' }}>SYNAPSE EXPLORER</span>
          <span style={{ color: '#52525b', fontSize: '18px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <span style={{ color: '#e4e4e7', fontSize: '36px', fontWeight: 700 }}>{name}</span>
          <div style={{
            padding: '4px 16px', borderRadius: '9999px',
            background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(113, 113, 122, 0.15)',
            color: isActive ? '#34d399' : '#71717a', fontSize: '18px', fontWeight: 600,
          }}>
            {status}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '60px', marginTop: 'auto' }}>
          {[
            { label: 'Reputation', value: `${score}/100` },
            { label: 'Calls Served', value: calls },
            { label: 'Tools', value: tools },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#71717a', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{item.label}</span>
              <span style={{ color: '#e4e4e7', fontSize: '32px', fontWeight: 700 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Page OG (for static section pages) ── */
function renderPageOG(p: URLSearchParams, logoSrc: string) {
  const title = p.get('title') ?? 'Synapse Explorer';
  const desc = p.get('desc') ?? 'Solana Agent Protocol — Real-time On-chain State';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace', padding: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <Logo src={logoSrc} />
          <span style={{ color: '#a1a1aa', fontSize: '20px', letterSpacing: '0.2em' }}>SYNAPSE EXPLORER</span>
          <span style={{ color: '#52525b', fontSize: '18px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <span style={{ color: '#e4e4e7', fontSize: '48px', fontWeight: 700, marginBottom: '16px' }}>{title}</span>
          <span style={{ color: '#a1a1aa', fontSize: '24px', lineHeight: '1.5' }}>{desc}</span>
        </div>
        <div style={{ display: 'flex', gap: '32px', marginTop: '24px' }}>
          {['Agents', 'Tools', 'Escrows', 'Transactions', 'Network'].map((item) => (
            <span key={item} style={{ color: '#52525b', fontSize: '14px', letterSpacing: '0.1em' }}>{item}</span>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Default OG (homepage) ── */
function renderDefaultOG(logoSrc: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace',
        }}
      >
        <Logo src={logoSrc} size={100} />
        <span style={{ color: '#e4e4e7', fontSize: '48px', fontWeight: 700, marginTop: '28px', marginBottom: '12px' }}>
          Synapse Explorer
        </span>
        <span style={{ color: '#a1a1aa', fontSize: '24px' }}>
          Solana Agent Protocol — Real-time On-chain State
        </span>
        <span style={{ color: '#52525b', fontSize: '16px', marginTop: '28px' }}>
          explorer.oobeprotocol.ai
        </span>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
