/* ──────────────────────────────────────────────
 * GET /api/og — Dynamic OG image generator
 *
 * Modes:
 *   ?type=tx&sig=...&status=...&block=...&time=...&fee=...&programs=...
 *   ?type=agent&name=...&score=...&calls=...&tools=...&status=...
 *   ?type=entity&kind=...&title=...&id=...&desc=...&m1=...&v1=...&m2=...&v2=...&m3=...&v3=...
 *   ?type=docs&title=...&desc=...&section=...
 *   ?type=page&title=...&desc=...
 *   (default) — branded homepage card
 *
 * Logo is inlined as a 64×64 base64 PNG (no self-fetch needed).
 * ────────────────────────────────────────────── */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';
const SITE_URL = 'https://explorer.oobeprotocol.ai';
const OG_BG_SRC = `${SITE_URL}/og-bg.png`;
const OG_LOGO_SRC = `${SITE_URL}/explorer_logo.png`;
const BRAND_NAME = 'SAP EXPLORER';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'default';

  if (type === 'tx') return renderTxOG(searchParams);
  if (type === 'agent') return renderAgentOG(searchParams);
  if (type === 'entity') return renderEntityOG(searchParams);
  if (type === 'docs') return renderDocsOG(searchParams);
  if (type === 'page') return renderPageOG(searchParams);
  return renderDefaultOG();
}

/* ── Logo element ── */
function Logo({ size = 48 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={OG_LOGO_SRC} width={size} height={size} style={{ borderRadius: size * 0.22 }} alt="" />
  );
}

/* ── Background layers (Satori does not support CSS background:url, must use <img>) ── */
function Background({ overlayOpacity = 0.78 }: { overlayOpacity?: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={OG_BG_SRC}
        alt=""
        width={1200}
        height={630}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1200px',
          height: '630px',
          objectFit: 'cover',
          filter: 'blur(18px) saturate(120%)',
          transform: 'scale(1.08)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: `linear-gradient(135deg, rgba(3, 13, 25, ${overlayOpacity * 0.85}) 0%, rgba(5, 19, 35, ${overlayOpacity * 0.92}) 52%, rgba(3, 13, 25, ${overlayOpacity}) 100%)`,
        }}
      />
    </>
  );
}

/* ── Root container shared style ── */
const ROOT_STYLE = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  position: 'relative' as const,
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  padding: '52px',
  backgroundColor: '#030d19',
};

/* ── Transaction OG ── */
function renderTxOG(p: URLSearchParams) {
  const sig = p.get('sig') ?? '';
  const status = p.get('status') ?? 'unknown';
  const block = p.get('block') ?? '--';
  const time = p.get('time') ?? '--';
  const fee = p.get('fee') ?? '--';
  const programs = p.get('programs') ?? '--';
  const isSuccess = status === 'success';
  const shortSig = sig.length > 28 ? `${sig.slice(0, 18)}...${sig.slice(-8)}` : sig;

  return new ImageResponse(
    (
      <div style={ROOT_STYLE}>
        <Background />
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={44} />
              <span style={{ color: '#7dd3fc', fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
                {BRAND_NAME}
              </span>
              <span style={{ color: '#3f5571', fontSize: '14px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '48px', gap: '14px' }}>
              <span style={{ color: '#e2e8f0', fontSize: '56px', fontWeight: 800, lineHeight: 1 }}>Transaction</span>
              <span style={{ color: '#9fb6cf', fontSize: '28px' }}>Real-time on-chain details</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                <div
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    background: isSuccess ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.18)',
                    color: isSuccess ? '#34d399' : '#f87171',
                    fontSize: '16px',
                    fontWeight: 700,
                  }}
                >
                  {isSuccess ? 'Success' : 'Failed'}
                </div>
                <span style={{ color: '#64748b', fontSize: '14px' }}>Block {block}</span>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#64748b', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Signature</span>
              <span style={{ color: '#c4b5fd', fontSize: '20px', fontFamily: 'ui-monospace, Menlo, Monaco, monospace' }}>{shortSig}</span>
            </div>
          </div>

          <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'Timestamp', value: time },
              { label: 'Fee', value: fee },
              { label: 'Programs', value: programs },
              { label: 'Network', value: 'Solana Mainnet' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  borderRadius: '14px',
                  border: '1px solid rgba(71, 85, 105, 0.42)',
                  background: 'rgba(7, 18, 34, 0.75)',
                  padding: '14px 16px',
                }}
              >
                <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{item.label}</span>
                <span style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 'auto', color: '#334155', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              tx/{shortSig}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Agent OG ── */
function renderAgentOG(p: URLSearchParams) {
  const name = p.get('name') ?? 'Unknown Agent';
  const wallet = p.get('wallet') ?? '--';
  const score = p.get('score') ?? '0';
  const calls = p.get('calls') ?? '0';
  const tools = p.get('tools') ?? '0';
  const status = p.get('status') === 'active' ? 'Active' : 'Inactive';
  const isActive = status === 'Active';
  const shortWallet = wallet.length > 20 ? `${wallet.slice(0, 10)}...${wallet.slice(-8)}` : wallet;

  return new ImageResponse(
    (
      <div style={ROOT_STYLE}>
        <Background />
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={44} />
              <span style={{ color: '#7dd3fc', fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
                {BRAND_NAME}
              </span>
              <span style={{ color: '#3f5571', fontSize: '14px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '46px', gap: '14px', maxWidth: '730px' }}>
              <span style={{ color: '#e2e8f0', fontSize: '52px', fontWeight: 800, lineHeight: 1.05 }}>{name}</span>
              <span style={{ color: '#9fb6cf', fontSize: '26px' }}>SAP Agent Profile</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                <div
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    background: isActive ? 'rgba(16, 185, 129, 0.16)' : 'rgba(113, 113, 122, 0.2)',
                    color: isActive ? '#34d399' : '#94a3b8',
                    fontSize: '16px',
                    fontWeight: 700,
                  }}
                >
                  {status}
                </div>
                <span style={{ color: '#64748b', fontSize: '14px' }}>Score {score}/100</span>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#64748b', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent Wallet</span>
              <span style={{ color: '#c4b5fd', fontSize: '20px', fontFamily: 'ui-monospace, Menlo, Monaco, monospace' }}>{shortWallet}</span>
            </div>
          </div>

          <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'Calls Served', value: calls },
              { label: 'Capabilities', value: tools },
              { label: 'Status', value: status },
              { label: 'Network', value: 'Solana Mainnet' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  borderRadius: '14px',
                  border: '1px solid rgba(71, 85, 105, 0.42)',
                  background: 'rgba(7, 18, 34, 0.75)',
                  padding: '14px 16px',
                }}
              >
                <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{item.label}</span>
                <span style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 'auto', color: '#334155', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              agents/profile
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Generic Entity OG (tools/escrows/attestations/etc.) ── */
function renderEntityOG(p: URLSearchParams) {
  const kind = p.get('kind') ?? 'Entity';
  const title = p.get('title') ?? kind;
  const id = p.get('id') ?? '--';
  const desc = p.get('desc') ?? 'Synapse Agent Protocol detail page';
  const m1 = p.get('m1') ?? 'Identifier';
  const v1 = p.get('v1') ?? id;
  const m2 = p.get('m2') ?? 'Network';
  const v2 = p.get('v2') ?? 'Solana Mainnet';
  const m3 = p.get('m3') ?? 'Source';
  const v3 = p.get('v3') ?? 'Synapse Explorer';

  return new ImageResponse(
    (
      <div style={ROOT_STYLE}>
        <Background />
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={44} />
              <span style={{ color: '#7dd3fc', fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
                {BRAND_NAME}
              </span>
              <span style={{ color: '#3f5571', fontSize: '14px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '46px', gap: '14px', maxWidth: '730px' }}>
              <span style={{ color: '#9fb6cf', fontSize: '18px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>{kind}</span>
              <span style={{ color: '#e2e8f0', fontSize: '52px', fontWeight: 800, lineHeight: 1.05 }}>{title}</span>
              <span style={{ color: '#9fb6cf', fontSize: '24px', lineHeight: 1.35 }}>{desc}</span>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: '#64748b', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Reference</span>
              <span style={{ color: '#c4b5fd', fontSize: '20px', fontFamily: 'ui-monospace, Menlo, Monaco, monospace' }}>{id}</span>
            </div>
          </div>

          <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: m1, value: v1 },
              { label: m2, value: v2 },
              { label: m3, value: v3 },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  borderRadius: '14px',
                  border: '1px solid rgba(71, 85, 105, 0.42)',
                  background: 'rgba(7, 18, 34, 0.75)',
                  padding: '14px 16px',
                }}
              >
                <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{item.label}</span>
                <span style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 'auto', color: '#334155', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {kind.toLowerCase()} detail
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Docs OG ── */
function renderDocsOG(p: URLSearchParams) {
  const title = p.get('title') ?? 'Synapse Docs';
  const desc = p.get('desc') ?? 'Technical documentation for the Synapse Agent Protocol.';
  const section = p.get('section') ?? 'Overview';

  return new ImageResponse(
    (
      <div style={ROOT_STYLE}>
        <Background />
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={44} />
              <span style={{ color: '#7dd3fc', fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
                {BRAND_NAME} DOCS
              </span>
              <span style={{ color: '#3f5571', fontSize: '14px', marginLeft: 'auto' }}>explorer.oobeprotocol.ai/docs</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '46px', gap: '14px', maxWidth: '730px' }}>
              <span style={{ color: '#e2e8f0', fontSize: '52px', fontWeight: 800, lineHeight: 1.06 }}>{title}</span>
              <span style={{ color: '#9fb6cf', fontSize: '25px', lineHeight: 1.3 }}>{desc}</span>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#64748b', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Section</span>
              <span style={{ color: '#c4b5fd', fontSize: '20px', fontWeight: 700 }}>{section}</span>
            </div>
          </div>

          <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {['Architecture', 'Instructions', 'Accounts', 'Events', 'Security'].map((item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '14px',
                  border: '1px solid rgba(71, 85, 105, 0.42)',
                  background: 'rgba(7, 18, 34, 0.75)',
                  padding: '14px 16px',
                  color: item === section ? '#e2e8f0' : '#94a3b8',
                  fontSize: '18px',
                  fontWeight: item === section ? 700 : 500,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Page OG (for static section pages) ── */
function renderPageOG(p: URLSearchParams) {
  const title = p.get('title') ?? 'Synapse Explorer';
  const desc = p.get('desc') ?? 'Synapse Agent Protocol — Real-time On-chain State';

  return new ImageResponse(
    (
      <div style={{ ...ROOT_STYLE, flexDirection: 'column', padding: '60px' }}>
        <Background />
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
            <Logo size={56} />
            <span style={{ color: '#7dd3fc', fontSize: '22px', letterSpacing: '0.2em', fontWeight: 700 }}>{BRAND_NAME}</span>
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
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/* ── Default OG (homepage) ── */
function renderDefaultOG() {
  return new ImageResponse(
    (
      <div style={{ ...ROOT_STYLE, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        <Background overlayOpacity={0.7} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
        >
          <Logo size={120} />
          <span style={{ color: '#e4e4e7', fontSize: '64px', fontWeight: 800, marginTop: '32px', marginBottom: '12px', letterSpacing: '0.04em' }}>
            {BRAND_NAME}
          </span>
          <span style={{ color: '#9fb6cf', fontSize: '24px' }}>
            Synapse Agent Protocol — Real-time On-chain State
          </span>
          <span style={{ color: '#52525b', fontSize: '16px', marginTop: '28px' }}>
            explorer.oobeprotocol.ai
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
