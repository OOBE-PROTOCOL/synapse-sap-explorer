'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Network,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronBreadcrumb,
  ChevronDown,
  Bot,
  Layers,
  Sun,
  Moon,
  ExternalLink,
  Github,
  Globe,
  BookOpen,
  BarChart2,
  Shield,
  Lock,
  Receipt,
  Swords,
  Activity,
  Home,
  Vault,
  X,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { SearchCommand } from '~/components/search-command';
import Image from 'next/image';

type NavSection = {
  label: string;
  items: { href: string; label: string; icon: typeof BarChart2 }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Protocol',
    items: [
      { href: '/', label: 'Dashboard', icon: BarChart2 },
      { href: '/network', label: 'Network', icon: Network },
      { href: '/transactions', label: 'Transactions', icon: Receipt },
    ],
  },
  {
    label: 'Registry',
    items: [
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/tools', label: 'Tools', icon: Wrench },
      { href: '/protocols', label: 'P&C', icon: Layers },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/escrows', label: 'Escrows', icon: Lock },
      { href: '/disputes', label: 'Disputes', icon: Swords },
      { href: '/attestations', label: 'Attestations', icon: Shield },
    ],
  },
  {
    label: 'Memory',
    items: [
      { href: '/vaults', label: 'Vaults', icon: Vault },
    ],
  },
  {
    label: 'Activity',
    items: [
      { href: '/protocol-flow', label: 'Protocol Flow', icon: Activity },
      { href: '/docs', label: 'Documentation', icon: BookOpen },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

/* ── Scroll-aware nav with animated indicator ── */
function NavScrollable({ collapsed, isNavActive, pathname }: { collapsed: boolean; isNavActive: (href: string) => boolean; pathname: string }) {
  const ref = React.useRef<HTMLElement>(null);
  const [canScrollDown, setCanScrollDown] = React.useState(false);
  const savedScrollRef = React.useRef(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      savedScrollRef.current = el.scrollTop;
      setCanScrollDown(el.scrollHeight - el.scrollTop > el.clientHeight + 4);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [collapsed]);

  // Restore scroll position after navigation so the sidebar doesn't jump to top
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = savedScrollRef.current;
  }, [pathname]);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      <nav
        ref={ref}
        className={cn('flex-1 overflow-y-auto scrollbar-none', collapsed ? 'px-2 py-3' : 'px-3 py-1')}
      >
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.label}>
            {!collapsed ? (
              <div className={cn('flex items-center gap-2 mx-1', sIdx === 0 ? 'mt-2 mb-1.5' : 'mt-5 mb-1.5')}>
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 shrink-0">{section.label}</span>
                <div className="flex-1 h-px bg-muted-foreground/50" />
              </div>
            ) : (
              sIdx > 0 && <div className="my-3 mx-1 h-px bg-muted-foreground/20" />
            )}
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isNavActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg text-xs font-medium transition-all duration-200',
                      collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground',
                    )} />
                    {!collapsed && label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Scroll indicator: 3 chevrons pulsing sequentially ── */}
      {canScrollDown && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-1 pt-4 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--sidebar-background)) 70%)' }}
        >
          {[0, 1, 2].map((i) => (
            <ChevronDown
              key={i}
              className="h-3 w-3 text-primary"
              style={{ animation: `scroll-pulse 1.2s ease-in-out ${i * 0.2}s infinite`, marginTop: i === 0 ? 0 : -4 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Breadcrumb builder ── */
function useBreadcrumbs(pathname: string) {
  return useMemo(() => {
    if (pathname === '/' || pathname === '/dashboard') return [{ label: 'Dashboard', href: '/' }];
    const segments = pathname.split('/').filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];
    let path = '';
    for (const seg of segments) {
      path += `/${seg}`;
      const navItem = NAV_ITEMS.find(n => n.href === path);
      crumbs.push({
        label: navItem?.label ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
        href: path,
      });
    }
    return crumbs;
  }, [pathname]);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const breadcrumbs = useBreadcrumbs(pathname);
  useEffect(() => setMounted(true), []);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function isNavActive(href: string): boolean {
    if (href === '/') return pathname === '/' || pathname === '/dashboard';
    if (href === '/tools') return pathname.startsWith('/tools');
    if (href === '/protocols') return pathname.startsWith('/protocols') || pathname.startsWith('/capabilities');
    if (href === '/escrows') return pathname.startsWith('/escrows');
    if (href === '/attestations') return pathname.startsWith('/attestations');
    if (href === '/transactions') return pathname.startsWith('/transactions') || pathname.startsWith('/tx');
    if (href === '/agents') return pathname.startsWith('/agents');
    if (href === '/vaults') return pathname.startsWith('/vaults');
    return pathname.startsWith(href);
  }

  // Docs pages use their own fumadocs layout — skip explorer chrome
  if (pathname.startsWith('/docs')) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Mobile overlay backdrop ──────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          'sidebar z-50 transition-all duration-300',
          /* desktop */
          'hidden lg:flex',
          collapsed ? 'lg:w-[68px]' : 'lg:w-[260px]',
          /* mobile: fixed slide-in from left */
          mobileOpen && '!flex fixed inset-y-0 left-0 w-[260px]',
        )}
      >
        {/* Collapse toggle (desktop only — overlaps drawer on mobile) */}
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:flex absolute -right-3 top-20 z-50 h-6 w-6 rounded-full bg-card border-border shadow-sm hover:bg-accent transition-colors items-center justify-center"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>

        {/* ── Sidebar Header ── */}
        <div
          className={cn(
            'sidebar-header flex items-center gap-3 transition-all duration-300',
            collapsed ? 'h-12 justify-center px-3' : 'h-14 px-5',
          )}
        >
          {collapsed ? (
            <Link href="/" className="flex items-center justify-center">
              <Image src="/explorer_logo.png" alt="Synapse Explorer" width={32} height={32} />
            </Link>
          ) : (
            <Link href="/" className="truncate flex-1">
              <span className="text-sm font-bold text-foreground tracking-wide">SYNAPSE</span>
              <span className="ml-1.5 text-[10px] font-medium font-sans text-primary uppercase tracking-widest">EXPLORER</span>
            </Link>
          )}
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Search ── */}
        {!collapsed && (
          <div className="shrink-0 px-4 pb-3 pt-4">
            <SearchCommand />
          </div>
        )}

        {/* ── Nav ── */}
        <NavScrollable collapsed={collapsed} isNavActive={isNavActive} pathname={pathname} />

        {/* ── Sidebar Footer ── */}
        <div className={cn('sidebar-footer', collapsed ? 'p-2 pb-3' : 'p-4')}>
          {/* Theme toggle */}
          <div className={cn('mb-3', collapsed ? 'flex justify-center' : '')}>
            <Button
              variant="outline"
              size={collapsed ? 'icon' : 'sm'}
              className={cn(
                'h-8 rounded-lg border-border bg-card hover:bg-accent text-muted-foreground',
                !collapsed && 'w-full justify-start gap-2 text-xs',
              )}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              {!collapsed && <span>{mounted ? (theme === 'dark' ? 'Dark Mode' : 'Light Mode') : '\u00A0'}</span>}
            </Button>
          </div>

          {/* External links */}
          <div className={cn('mb-3 space-y-0.5', collapsed && 'space-y-1')}>
            {[
              { href: 'https://oobeprotocol.ai', label: 'OOBE Protocol', icon: Globe },
              { href: 'https://synapse.oobeprotocol.ai', label: 'Synapse RPC Gateway', icon: ExternalLink },
              { href: 'https://github.com/oobe-protocol/synapse-sap-sdk', label: 'SAP Client SDK', icon: Github },
            ].map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors',
                  collapsed ? 'justify-center py-1.5' : 'px-2 py-1.5',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </a>
            ))}
          </div>

          {/* Program status */}
          {!collapsed ? (
            <div className="rounded-lg bg-card border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="text-xs text-muted-foreground">SAP Program</span>
                <span className="ml-auto text-[9px] font-mono text-muted-foreground/60">v0.7.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground/60">SDK · Anchor 1.0.0</span>
                <a href="https://synapse.oobeprotocol.ai/skills.md" target="_blank" rel="noopener noreferrer" className="text-[9px] font-medium text-primary hover:text-primary transition-colors">Skill</a>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          )}
        </div>
      </aside>

      {/* ── Content ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex h-12 items-center gap-2 px-3 lg:hidden border-b border-border bg-card">
          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Link href="/" className="flex items-baseline gap-1.5 min-w-0 truncate">
            <span className="text-sm font-bold text-foreground tracking-wide">SYNAPSE</span>
            <span className="hidden xs:inline text-[10px] font-medium text-primary uppercase tracking-widest">EXPLORER</span>
          </Link>

          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            {/* Theme toggle on mobile */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {NAV_ITEMS.slice(0, 3).map(({ href, icon: Icon }) => {
              const active = isNavActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'rounded-lg p-2 transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Breadcrumb + Status Bar ── */}
        <div className="content-topbar hidden lg:flex items-center h-10 px-6 gap-4 bg-card border-b border-border">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-[12px] min-w-0">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <Home className="h-3.5 w-3.5" />
            </Link>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1 min-w-0">
                <ChevronBreadcrumb className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                {i === breadcrumbs.length - 1 ? (
                  <span className="text-foreground font-medium truncate">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          {/* Network status */}
          <div className="ml-auto flex items-center gap-3 text-[10px] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[data-tick_2s_ease-in-out_infinite]" />
              <span className="text-foreground font-medium uppercase tracking-widest">Mainnet</span>
            </div>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground font-mono select-all">SAPpUhs…FETZ</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">v0.7.0</span>
            <a
              href="https://solscan.io/account/SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              Solscan <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>

        {/* ── Main Content ── */}
        <main className={cn('content-main', pathname === '/network' ? 'overflow-hidden' : 'p-3 sm:p-4 lg:p-6')}>
          {pathname === '/network' ? children : (
            <div className="max-w-[1440px] mx-auto relative">{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}
