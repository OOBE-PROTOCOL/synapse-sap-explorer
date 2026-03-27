/* ──────────────────────────────────────────────
 * GET /api/og?type=tx&sig=...&status=...&block=...&time=...&fee=...&programs=...
 * GET /api/og?type=agent&name=...&score=...&calls=...&tools=...&status=...
 *
 * Generates dynamic OG images using Next.js ImageResponse (Satori)
 * ────────────────────────────────────────────── */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'default';

  if (type === 'tx') return renderTxOG(searchParams);
  if (type === 'agent') return renderAgentOG(searchParams);
  return renderDefaultOG();
}

/* ── Transaction OG ── */
function renderTxOG(p: URLSearchParams) {
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
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace',
          padding: '60px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: 'white',
            }}
          >
            S
          </div>
          <span style={{ color: '#a1a1aa', fontSize: '20px', letterSpacing: '0.2em' }}>SYNAPSE EXPLORER</span>
          <span style={{ color: '#52525b', fontSize: '18px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <span style={{ color: '#e4e4e7', fontSize: '28px', fontWeight: 600 }}>Transaction</span>
          <div
            style={{
              padding: '4px 16px',
              borderRadius: '9999px',
              background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isSuccess ? '#34d399' : '#f87171',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            {isSuccess ? 'Success' : 'Failed'}
          </div>
        </div>

        {/* Signature */}
        <div style={{ display: 'flex', marginBottom: '40px' }}>
          <span style={{ color: '#a78bfa', fontSize: '22px', fontFamily: 'monospace' }}>{shortSig}</span>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'flex', gap: '40px', marginTop: 'auto' }}>
          {[
            { label: 'Block', value: block },
            { label: 'Timestamp', value: time },
            { label: 'Fee', value: fee },
            { label: 'Programs', value: programs },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#71717a', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                {item.label}
              </span>
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
function renderAgentOG(p: URLSearchParams) {
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
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace',
          padding: '60px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: 'white',
            }}
          >
            S
          </div>
          <span style={{ color: '#a1a1aa', fontSize: '20px', letterSpacing: '0.2em' }}>SYNAPSE EXPLORER</span>
          <span style={{ color: '#52525b', fontSize: '18px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
        </div>

        {/* Agent name + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <span style={{ color: '#e4e4e7', fontSize: '36px', fontWeight: 700 }}>{name}</span>
          <div
            style={{
              padding: '4px 16px',
              borderRadius: '9999px',
              background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(113, 113, 122, 0.15)',
              color: isActive ? '#34d399' : '#71717a',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            {status}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '60px', marginTop: 'auto' }}>
          {[
            { label: 'Reputation', value: `${score}/100` },
            { label: 'Calls Served', value: calls },
            { label: 'Tools', value: tools },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#71717a', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                {item.label}
              </span>
              <span style={{ color: '#e4e4e7', fontSize: '32px', fontWeight: 700 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Default OG ── */
function renderDefaultOG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0e0b16 0%, #1a1230 50%, #0e0b16 100%)',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '40px',
            color: 'white',
            marginBottom: '24px',
          }}
        >
          S
        </div>
        <span style={{ color: '#e4e4e7', fontSize: '40px', fontWeight: 700, marginBottom: '12px' }}>
          Synapse Explorer
        </span>
        <span style={{ color: '#a1a1aa', fontSize: '22px' }}>
          Solana Agent Protocol — Real-time On-chain State
        </span>
        <span style={{ color: '#52525b', fontSize: '16px', marginTop: '24px' }}>
          explorer.oobeprotocol.ai
        </span>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
