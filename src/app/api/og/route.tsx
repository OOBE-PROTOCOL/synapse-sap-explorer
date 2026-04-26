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
const OG_LOGO_SRC = `${SITE_URL}/synapse-metadata-logo.png`;

/* ── Inlined 64×64 Synapse logo as data-uri ── */
// prettier-ignore
const LOGO_SRC = 'data:image/png;base64,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';

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
    <img src={OG_LOGO_SRC ?? LOGO_SRC} width={size} height={size} style={{ borderRadius: size * 0.25 }} alt="" />
  );
}

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
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: `linear-gradient(135deg, rgba(3, 13, 25, 0.62) 0%, rgba(5, 19, 35, 0.74) 52%, rgba(3, 13, 25, 0.86) 100%), url(${OG_BG_SRC}) center/cover no-repeat`,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          padding: '52px',
        }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={34} />
              <span style={{ color: '#7dd3fc', fontSize: '18px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                Synapse Explorer
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
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: `linear-gradient(135deg, rgba(3, 13, 25, 0.62) 0%, rgba(5, 19, 35, 0.74) 52%, rgba(3, 13, 25, 0.86) 100%), url(${OG_BG_SRC}) center/cover no-repeat`,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          padding: '52px',
        }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={34} />
              <span style={{ color: '#7dd3fc', fontSize: '18px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                Synapse Explorer
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
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: `linear-gradient(135deg, rgba(3, 13, 25, 0.62) 0%, rgba(5, 19, 35, 0.74) 52%, rgba(3, 13, 25, 0.86) 100%), url(${OG_BG_SRC}) center/cover no-repeat`,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          padding: '52px',
        }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={34} />
              <span style={{ color: '#7dd3fc', fontSize: '18px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                Synapse Explorer
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
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: `linear-gradient(135deg, rgba(3, 13, 25, 0.62) 0%, rgba(5, 19, 35, 0.74) 52%, rgba(3, 13, 25, 0.86) 100%), url(${OG_BG_SRC}) center/cover no-repeat`,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          padding: '52px',
        }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: '34px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Logo size={34} />
              <span style={{ color: '#7dd3fc', fontSize: '18px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                Synapse Explorer Docs
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
      <div
        style={{
          width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
          background: `linear-gradient(135deg, rgba(3, 13, 25, 0.62) 0%, rgba(5, 19, 35, 0.74) 52%, rgba(3, 13, 25, 0.86) 100%), url(${OG_BG_SRC}) center/cover no-repeat`,
          fontFamily: 'monospace', padding: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <Logo />
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
function renderDefaultOG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(3, 13, 25, 0.62) 0%, rgba(5, 19, 35, 0.74) 52%, rgba(3, 13, 25, 0.86) 100%), url(${OG_BG_SRC}) center/cover no-repeat`,
          fontFamily: 'monospace',
        }}
      >
        <Logo size={100} />
        <span style={{ color: '#e4e4e7', fontSize: '48px', fontWeight: 700, marginTop: '28px', marginBottom: '12px' }}>
          Synapse Explorer
        </span>
        <span style={{ color: '#a1a1aa', fontSize: '24px' }}>
          Synapse Agent Protocol — Real-time On-chain State
        </span>
        <span style={{ color: '#52525b', fontSize: '16px', marginTop: '28px' }}>
          explorer.oobeprotocol.ai
        </span>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
