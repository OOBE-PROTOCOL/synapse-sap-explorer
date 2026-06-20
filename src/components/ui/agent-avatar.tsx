'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { cn } from '~/lib/utils';

type AgentAvatarProps = {
  name: string;
  endpoint?: string | null;
  /** Direct logo URL (e.g. from well-known data). Takes priority over MPL/favicon. */
  logo?: string | null;
  /**
   * Image URL recovered from the agent's MPL Core / Metaplex Agent NFT
   * (e.g. `agentTokenInfo.image`, `tokens[0].image`). Used as a second
   * fallback when `logo` is missing, errors, or matches a known
   * placeholder URL — so we always show a meaningful asset for agents
   * registered in the Metaplex Agents directory.
   */
  mplImage?: string | null;
  size?: number;
  className?: string;
  showSourceBadges?: boolean;
  showMetaplexBadge?: boolean;
  onMetaplex?: boolean;
};

const MLP_LOGO = "/metaplex_log.jpg";
const SAP_LOGO = "/explorer_logo.png";

/**
 * URLs we consider "placeholder" — if `logo` matches any of these we
 * skip straight to the MPL/favicon fallback chain. Keep the list short
 * and conservative; false positives swap a valid (if generic) image
 * for a derived one.
 */
const LOGO_PLACEHOLDER_PATTERNS: RegExp[] = [
  /\/placeholder(\.\w+)?$/i,
  /placeholder\.(png|jpg|jpeg|svg|webp)/i,
  /default[-_]?avatar/i,
  /no[-_]?image/i,
];

function isPlaceholderLogo(url: string | null | undefined): boolean {
  if (!url) return false;
  return LOGO_PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

function shouldTreatLoadedImageAsPlaceholder(img: HTMLImageElement): boolean {
  if (img.naturalWidth <= 1 || img.naturalHeight <= 1) return true;
  try {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let borderPixels = 0;
    let borderLum = 0;
    let centerPixels = 0;
    let centerLum = 0;
    let centerBright = 0;
    let alphaPixels = 0;
    const colors = new Set<string>();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const alpha = data[i + 3] ?? 0;
        if (alpha < 24) continue;
        alphaPixels += 1;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        colors.add(`${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`);

        const isBorder = x < 4 || x >= size - 4 || y < 4 || y >= size - 4;
        const dx = x - (size - 1) / 2;
        const dy = y - (size - 1) / 2;
        const isCenter = Math.sqrt(dx * dx + dy * dy) <= 7;
        if (isBorder) {
          borderPixels += 1;
          borderLum += lum;
        }
        if (isCenter) {
          centerPixels += 1;
          centerLum += lum;
          if (lum > 0.72) centerBright += 1;
        }
      }
    }

    if (alphaPixels < size * size * 0.2) return true;
    const avgBorderLum = borderPixels > 0 ? borderLum / borderPixels : 1;
    const avgCenterLum = centerPixels > 0 ? centerLum / centerPixels : 0;
    const brightCenterRatio = centerPixels > 0 ? centerBright / centerPixels : 0;
    const lowDetail = colors.size <= 18;

    return lowDetail && avgBorderLum < 0.22 && avgCenterLum > 0.48 && brightCenterRatio > 0.32;
  } catch {
    return false;
  }
}

/**
 * Resolve a high-quality favicon from the endpoint domain.
 * Uses Google's S2 service at 128px for crisp rendering.
 */
function resolveFavicon(endpoint: string | null | undefined): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();

    // Google S2 won't resolve local/private hosts and would spam logs with 404s.
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.startsWith('127.') ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.')
    ) {
      return null;
    }

    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
  } catch {
    return null;
  }
}

/**
 * Agent avatar: prefers MPL Core NFT identity image (on-chain, immutable)
 * over the off-chain `.well-known/agent.json` logo, then favicon, then a
 * deterministic generative fallback. Each tier independently tracks load
 * errors so a broken upstream image automatically demotes to the next
 * source without flashing the fallback letters.
 */
export function AgentAvatar({
  name,
  endpoint,
  logo,
  mplImage,
  size = 48,
  className,
  showSourceBadges = true,
  showMetaplexBadge = false,
}: AgentAvatarProps) {
  const [logoError, setLogoError] = useState(false);
  const [mplError, setMplError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);


  const mplUsable = mplImage && !mplError;
  const logoUsable = logo && !logoError && !isPlaceholderLogo(logo);
  // MPL NFT image first (on-chain identity), then well-known logo.
  const mplUrl = mplUsable ? mplImage : null;
  const logoUrl = !mplUrl && logoUsable ? logo : null;
  const faviconUrl = !mplUrl && !logoUrl && !faviconError ? resolveFavicon(endpoint) : null;
  const activeUrl = mplUrl ?? logoUrl ?? faviconUrl;
  const showImg = !!activeUrl;
  const showBadges = showSourceBadges && size >= 40;
  const badgeSize = Math.max(16, Math.min(22, Math.round(size * 0.36)));

  const initials = name.split(/[\s-]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-visible rounded-full',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <div className="size-full overflow-hidden rounded-full border border-border/60 bg-muted ring-1 ring-background">
        {showImg ? (
          /* Plain <img> on purpose: avatars are 40-48px, Next/Image adds no
             value AND its server-side proxy spammed `⨯ upstream image response
             failed` for valid favicons that Google S2 occasionally 404s. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeUrl!}
            alt={`${name} avatar`}
            width={size}
            height={size}
            loading="lazy"
            className="size-full bg-muted object-cover"
            onError={() => {
              // Demote one tier on error so the chain keeps walking
              // instead of jumping straight to initials.
              if (activeUrl === logoUrl) setLogoError(true);
              else if (activeUrl === mplUrl) setMplError(true);
              else setFaviconError(true);
            }}
            onLoad={(event) => {
              if (activeUrl === faviconUrl && (event.currentTarget.naturalWidth < 48 || event.currentTarget.naturalHeight < 48)) {
                setFaviconError(true);
                return;
              }
              if (!shouldTreatLoadedImageAsPlaceholder(event.currentTarget)) return;
              if (activeUrl === logoUrl) setLogoError(true);
              else if (activeUrl === mplUrl) setMplError(true);
              else setFaviconError(true);
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-primary/10 text-primary">
            {initials ? (
              <span
                className="select-none font-bold"
                style={{ fontSize: size * 0.35 }}
              >
                {initials}
              </span>
            ) : (
              <Bot
                style={{ width: size * 0.4, height: size * 0.4 }}
              />
            )}
          </div>
        )}
      </div>

      {showBadges && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/4 flex -translate-x-1/3 -translate-y-1/2 items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SAP_LOGO}
            alt="SAP source"
            loading="lazy"
            className="rounded-full border object-cover shadow-sm ring-1 ring-border"
            style={{ width: badgeSize , height: badgeSize  }}
          />
          
            {showMetaplexBadge  && (
              <img
                src={MLP_LOGO}
                alt="Metaplex source"
                loading="lazy"
                className="rounded-full  bg-background object-cover shadow-sm ring-1 ring-border"
                style={{
                width: badgeSize,
                height: badgeSize,
                marginLeft: -Math.round(badgeSize / 2.2),
                marginBottom: 27,
              }}
            />
            )}
        </div>
      )}
    </div>
  );
}
