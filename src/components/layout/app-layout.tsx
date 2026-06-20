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
  Menu,
  Vault,
  X,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { SearchCommand } from '~/components/search-command';
import Image from 'next/image';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

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
      { href: '/developer-docs', label: 'Developer Docs', icon: BookOpen },
      { href: '/docs', label: 'Documentation', icon: BookOpen },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

/* ── Scroll-aware navigation ── */
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
    <div className="relative flex-1  flex flex-col overflow-hidden">
      <nav
        ref={ref}
        className={cn('flex-1 overflow-y-auto scrollbar-none', collapsed ? 'px-2 py-3' : 'px-3 py-1')}
      >
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.label}>
            {!collapsed ? (
              <div className={cn('flex items-center gap-2 mx-1', sIdx === 0 ? 'mt-2 mb-1.5' : 'mt-5 mb-1.5')}>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{section.label}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            ) : (
              sIdx > 0 && <div className="mx-1 my-3 h-px bg-border" />
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

      {/* ── Scroll indicator ── */}
      {canScrollDown && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-1 pt-4 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--sidebar-background)) 70%)' }}
        >
          <ChevronDown className="h-4 w-4 text-primary" />
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
  const [isMobile, setIsMobile] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const breadcrumbs = useBreadcrumbs(pathname);
  useEffect(() => setMounted(true), []);

  // Track viewport: <1024px => mobile rail mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 1023px)');
    const apply = () => setIsMobile(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  // On mobile, the sidebar is always icon-rail unless drawer is open
  const effectiveCollapsed = isMobile ? !mobileOpen : collapsed;

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('drawer-open', mobileOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [mobileOpen]);

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
    <div className="flex h-dvh overflow-hidden bg-background">

      {/* ── Mobile overlay backdrop ──────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[55] bg-foreground/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          'sidebar flex flex-col transition-all duration-300',
          /* mobile: hidden by default, becomes fixed overlay drawer when open */
          mobileOpen
            ? 'fixed inset-y-0 left-0 z-[60] flex w-[280px] max-w-[86vw] shadow-2xl'
            : 'hidden',
          /* desktop: always visible, width depends on collapsed state */
          collapsed ? 'lg:flex lg:w-[72px]' : 'lg:flex lg:w-[268px]',
        )}
      >
        {/* Collapse / expand toggle — visible everywhere */}
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-4 top-[50%] z-50 hidden h-9 w-9 items-center justify-center rounded-full border-border bg-card shadow-sm transition-colors hover:bg-accent lg:flex"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>

        {/* ── Sidebar Header ── */}
        <div
          className={cn(
            'sidebar-header flex items-center gap-2 transition-all duration-300',
            effectiveCollapsed ? 'h-14 justify-center px-2' : 'h-16 px-4 lg:px-5',
          )}
        >
          {/* Brand text: desktop expanded only */}
          {!effectiveCollapsed && !isMobile && (
            <Link href="/" className="truncate flex-1">
              <Image src="/explorer_logo.png" alt="Synapse Explorer" width={28} height={28} className="inline-block mr-2" />
              <span className="text-sm font-semibold text-foreground">Synapse</span>
              <span className="ml-1.5 text-xs font-medium text-primary">Explorer</span>
            </Link>
          )}
          {/* Logo: desktop collapsed */}
          {effectiveCollapsed && !isMobile && (
            <Link href="/" className="flex items-center justify-center">
              <Image src="/explorer_logo.png" alt="Synapse Explorer" width={28} height={28} />
            </Link>
          )}
          {/* Mobile drawer: logo left + brand text + X right */}
          {isMobile && mobileOpen && (
            <>
              <Link href="/" className="flex items-center gap-2 min-w-0 flex-1">
                <Image src="/explorer_logo.png" alt="Synapse Explorer" width={26} height={26} className="shrink-0" />
                <span className="truncate text-sm font-semibold text-foreground">Synapse</span>
                <span className="text-xs font-medium text-primary">Explorer</span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* ── Search ── */}
        {!effectiveCollapsed && (
          <div className="shrink-0 px-4 pb-3 pt-2 lg:hidden">
            <SearchCommand />
          </div>
        )}

        {/* ── Nav ── */}
        <NavScrollable collapsed={effectiveCollapsed} isNavActive={isNavActive} pathname={pathname} />

        {/* ── Sidebar Footer ── */}
          <div className={cn('sidebar-footer space-y-2', effectiveCollapsed ? 'p-2 pb-3' : 'p-3')}>
          {/* Compact icon row: external links + theme toggle.
              Expanded → horizontal row. Collapsed → vertical stack. */}
          <TooltipProvider delayDuration={150}>
            <div
              className={cn(
                'flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1',
                effectiveCollapsed ? 'flex-col' : 'justify-between',
              )}
            >
              {[
                { href: 'https://oobeprotocol.ai', label: 'OOBE Protocol', icon: Globe },
                { href: 'https://github.com/oobe-protocol/synapse-sap-sdk', label: 'SDK', icon: Github },
                { href: '/developer-docs', label: 'Developer Docs', icon: BookOpen },
              ].map(({ href, label, icon: Icon }) => (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <a
                      href={href}
                      target={href.startsWith('http') ? '_blank' : undefined}
                      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      aria-label={label}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side={effectiveCollapsed ? 'right' : 'top'} sideOffset={6}>
                    {label}
                  </TooltipContent>
                </Tooltip>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    aria-label="Toggle theme"
                    className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={effectiveCollapsed ? 'right' : 'top'} sideOffset={6}>
                  {mounted ? (theme === 'dark' ? 'Switch to light' : 'Switch to dark') : 'Theme'}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          

          {/* Wallet connect — primary CTA at bottom of sidebar */}
          <div className={cn('wallet-trigger-sidebar', effectiveCollapsed && 'is-collapsed flex justify-center')}>
            <WalletMultiButton />
          </div>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Mobile Topbar (Solscan-style) ── */}
        <div className="lg:hidden flex items-center h-12 px-3 gap-2 bg-card border-b border-border shrink-0">
          <Link href="/" className="flex items-center gap-2 min-w-0 flex-1">
            <Image src="/explorer_logo.png" alt="Synapse Explorer" width={26} height={26} className="shrink-0" />
            <span className="truncate text-sm font-semibold text-foreground">Synapse</span>
            <span className="hidden text-xs font-medium text-primary xs:inline">Explorer</span>
          </Link>
          <a
            href="/developer-docs"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Open developer docs"
            title="Developer Docs"
          >
            <BookOpen className="h-4 w-4" />
          </a>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Mainnet
          </span>
          <button
            onClick={() => setMobileOpen(true)}
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Breadcrumb + Status Bar ── */}
        <div className="content-topbar hidden h-16 items-center gap-4 border-b bg-card px-4 lg:flex">
          {/* Breadcrumbs */}
          <nav className="flex min-w-0 flex-1 items-center gap-1 text-xs">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <Home className="h-3.5 w-3.5" />
            </Link>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1 min-w-0">
                <ChevronBreadcrumb className="h-3 w-3 text-muted-foreground shrink-0" />
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

          <div className="w-[360px] max-w-[34vw] shrink-0">
            <SearchCommand />
          </div>

          {/* Network status */}
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <svg className="size-4" width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.9162 11.0381L13.2749 13.809C13.2178 13.8692 13.1486 13.9172 13.0716 13.95C12.9947 13.9829 12.9117 13.9999 12.8277 14H0.306886C0.247168 14 0.188756 13.9829 0.138801 13.9509C0.0888472 13.9189 0.0495192 13.8733 0.0256329 13.8197C0.00174657 13.7662 -0.00566129 13.707 0.00431634 13.6494C0.014294 13.5918 0.0412241 13.5383 0.0818091 13.4954L2.72013 10.7246C2.77725 10.6644 2.84644 10.6164 2.92338 10.5835C3.00031 10.5507 3.08335 10.5336 3.1673 10.5336H15.6881C15.7484 10.5323 15.8077 10.5486 15.8585 10.5803C15.9094 10.6119 15.9495 10.6576 15.9739 10.7115C15.9983 10.7655 16.0058 10.8253 15.9955 10.8834C15.9853 10.9415 15.9577 10.9953 15.9162 11.0381ZM13.2749 5.45712C13.2175 5.39721 13.1483 5.34937 13.0714 5.31652C12.9945 5.28368 12.9116 5.26651 12.8277 5.26608H0.306886C0.247168 5.26611 0.188756 5.28318 0.138801 5.3152C0.0888472 5.34721 0.0495192 5.39279 0.0256329 5.44633C0.00174657 5.49988 -0.00566129 5.55908 0.00431634 5.61669C0.014294 5.67429 0.0412241 5.7278 0.0818091 5.77066L2.72013 8.54294C2.77747 8.60285 2.84671 8.65069 2.92359 8.68354C3.00048 8.71639 3.0834 8.73355 3.1673 8.73398H15.6881C15.7477 8.73367 15.8059 8.71639 15.8557 8.68427C15.9054 8.65214 15.9445 8.60655 15.9682 8.55306C15.9919 8.49957 15.9992 8.44049 15.9891 8.38302C15.9791 8.32554 15.9522 8.27217 15.9117 8.2294L13.2749 5.45712ZM0.306886 3.46651H12.8277C12.9117 3.46644 12.9947 3.44944 13.0716 3.41657C13.1486 3.3837 13.2178 3.33566 13.2749 3.27547L15.9162 0.504645C15.9471 0.472622 15.9705 0.434302 15.9846 0.392425C15.9986 0.350548 16.0031 0.306148 15.9975 0.262399C15.992 0.21865 15.9767 0.176632 15.9527 0.13935C15.9286 0.102067 15.8965 0.0704405 15.8585 0.0467307C15.8076 0.0150784 15.7484 -0.00115781 15.6881 6.42451e-05H3.1673C3.08335 0.000150701 3.00031 0.0171585 2.92338 0.0500271C2.84644 0.0828956 2.77725 0.13092 2.72013 0.191105L0.0818091 2.96193C0.0412241 3.00479 0.014294 3.05829 0.00431634 3.1159C-0.00566129 3.1735 0.00174657 3.2327 0.0256329 3.28625C0.0495192 3.3398 0.0888472 3.38537 0.138801 3.41739C0.188756 3.4494 0.247168 3.46647 0.306886 3.46651Z" fill="url(#_r_6_)"></path><defs><linearGradient id="_r_6_" x1="1.35029" y1="14.334" x2="14.1587" y2="-0.425393" gradientUnits="userSpaceOnUse"><stop offset="0.08" stop-color="#9945FF"></stop><stop offset="0.3" stop-color="#8752F3"></stop><stop offset="0.5" stop-color="#5497D5"></stop><stop offset="0.6" stop-color="#43B4CA"></stop><stop offset="0.72" stop-color="#28E0B9"></stop><stop offset="0.97" stop-color="#14F195"></stop></linearGradient></defs></svg>
              <span className="font-medium text-foreground">Mainnet</span>
            </div>
            <a
              href="/developer-docs"
              className="flex h-9 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Developer Docs
            </a>
            <a
              href="https://solscan.io/account/SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Solscan <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>

        {/* ── Main Content ── */}
        <main className={cn('content-main', pathname === '/network' ? 'overflow-hidden' : 'p-2 sm:p-3 lg:p-4')}>
          {pathname === '/network' ? children : (
            <div className="relative mx-auto w-full max-w-[1600px]">{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}
