'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Activity,
  Search,
  Network,
  ArrowLeftRight,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Bot,
  Hexagon,
  Layers,
  Sparkles,
  Wallet,
  ShieldCheck,
  Trophy,
  Sun,
  Moon,
  ExternalLink,
  Github,
  Globe,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: Activity },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/network', label: 'Network', icon: Network },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/protocols', label: 'Protocols', icon: Layers },
  { href: '/capabilities', label: 'Capabilities', icon: Sparkles },
  { href: '/escrows', label: 'Escrows', icon: Wallet },
  { href: '/attestations', label: 'Attestations', icon: ShieldCheck },
  { href: '/reputation', label: 'Reputation', icon: Trophy },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          'hidden flex-shrink-0 lg:flex flex-col transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] relative sticky top-0 h-screen border-r border-border bg-sidebar-background',
          collapsed ? 'w-[72px]' : 'w-[260px]',
        )}
      >
        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 z-20 h-6 w-6 rounded-full border border-border bg-background shadow-sm"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </Button>

        <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">
          {/* Logo */}
          <div
            className={cn(
              'flex items-center gap-3 shrink-0 border-b border-border transition-all duration-300',
              collapsed ? 'h-16 justify-center px-3' : 'h-16 px-5',
            )}
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl shrink-0 bg-primary/10">
              <Hexagon className="h-4 w-4 text-primary" />
            </div>
            {!collapsed && (
              <Link href="/" className="truncate">
                <span className="text-sm font-semibold">Synapse</span>
                <span className="ml-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Explorer</span>
              </Link>
            )}
          </div>

          {/* Search */}
          {!collapsed && (
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search agents, PDAs..."
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          {!collapsed && (
            <div className="px-5 pb-1 pt-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Protocol</span>
            </div>
          )}

          {/* Nav */}
          <nav className={cn('space-y-0.5 flex-1', collapsed ? 'px-2 py-3' : 'px-3')}>
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className={cn(
                    'h-4 w-4 shrink-0 transition-colors duration-200',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )} />
                  {!collapsed && label}
                </Link>
              );
            })}
          </nav>

          {/* Bottom section */}
          <div className={cn('shrink-0 border-t border-border', collapsed ? 'p-2 pb-4' : 'p-4')}>
            {/* Theme toggle */}
            <div className={cn('mb-3', collapsed ? 'flex justify-center' : 'flex items-center gap-2')}>
              <Button
                variant="outline"
                size={collapsed ? 'icon' : 'sm'}
                className={cn('h-8', !collapsed && 'w-full justify-start gap-2 text-xs')}
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
                { href: 'https://github.com/oobe-protocol/synapse-sap', label: 'SAP GitHub', icon: Github },
                { href: 'https://github.com/oobe-protocol/synapse-sap-sdk', label: 'SAP Client SDK', icon: Github },
              ].map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl text-[11px] text-muted-foreground hover:text-foreground transition-colors',
                    collapsed ? 'justify-center py-1.5' : 'px-2 py-1.5',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </a>
              ))}
            </div>

            {!collapsed ? (
              <div className="rounded-xl p-3 bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                  <span className="text-[10px] text-muted-foreground">SAP Program Skill</span>
                  <a href="https://synapse.oobeprotocol.ai/skills.md" target="_blank" rel="noopener noreferrer" className="ml-auto text-[12px] font-medium text-primary hover:underline">DOWNLOAD</a>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <div className="sticky top-0 z-50 flex h-14 items-center gap-3 px-4 lg:hidden border-b border-border bg-background/80 backdrop-blur-sm">
          <Hexagon className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Synapse Explorer</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            {NAV_ITEMS.slice(0, 6).map(({ href, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'rounded-xl p-2 transition-all duration-200',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>
        </div>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
