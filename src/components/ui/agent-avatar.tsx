'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { cn } from '~/lib/utils';

type AgentAvatarProps = {
  name: string;
  endpoint?: string | null;
  /** Direct logo URL (e.g. from well-known data). Takes priority over favicon. */
  logo?: string | null;
  size?: number;
  className?: string;
};

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
 * Agent avatar: shows logo (from well-known) > favicon (from endpoint) > generative fallback.
 */
export function AgentAvatar({ name, endpoint, logo, size = 48, className }: AgentAvatarProps) {
  const [logoError, setLogoError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const logoUrl = logo && !logoError ? logo : null;
  const faviconUrl = !logoUrl && !faviconError ? resolveFavicon(endpoint) : null;
  const showImg = logoUrl || faviconUrl;

  // Deterministic hue from name
  const hue = Array.from(name).reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  const initials = name.split(/[\s-]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-3xl overflow-hidden border border-transparent',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        /* Plain <img> on purpose: avatars are 40-48px, Next/Image adds no
           value AND its server-side proxy spammed `⨯ upstream image response
           failed` for valid favicons that Google S2 occasionally 404s. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl || faviconUrl!}
          alt={`${name} avatar`}
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-contain bg-neutral-900 p-1"
          onError={() => {
            if (logoUrl) setLogoError(true);
            else setFaviconError(true);
          }}
        />
      ) : (
        <div
          className="h-full w-full flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 50% 18%), hsl(${(hue + 40) % 360} 40% 12%))`,
          }}
        >
          {initials ? (
            <span
              className="font-bold text-white/70 select-none"
              style={{ fontSize: size * 0.35 }}
            >
              {initials}
            </span>
          ) : (
            <Bot
              className="text-white/50"
              style={{ width: size * 0.4, height: size * 0.4 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
