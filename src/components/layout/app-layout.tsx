"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  BookOpen,
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
  { href: '/docs', label: 'Documentation', icon: BookOpen },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Docs pages use their own fumadocs layout — skip explorer chrome
  if (pathname.startsWith('/docs')) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          "hidden lg:block flex-shrink-0 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] relative sticky top-0 h-screen",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 z-20 h-6 w-6 rounded-full border border-border bg-background shadow-sm"
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-toggle"
          aria-label={collapsed ? "Expand" : "Collapse"}
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
              "flex items-center gap-3 shrink-0 transition-all duration-300",
              collapsed ? "h-16 justify-center px-3" : "h-16 px-5",
            )}
            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div
              className="relative flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(20,184,166,0.08))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <Hexagon className="h-4 w-4 text-blue-400" />
              <div className="absolute inset-0 rounded-xl ring-1 ring-blue-500/15" />
            </div>
            {!collapsed && (
              <Link href="/" className="truncate">
                <span className="text-sm font-semibold gradient-text">
                  Synapse
                </span>
                <span className="ml-1.5 text-[10px] font-medium text-white/25 uppercase tracking-widest">
                  Explorer
                </span>
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
                  className="w-full rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 pl-9 pr-3 text-[12px] text-white/70 placeholder-white/20 outline-none transition-all focus:border-blue-500/25 focus:bg-white/[0.05] focus:ring-1 focus:ring-blue-500/10"
                  style={{ backdropFilter: "blur(12px)" }}
                />
              </div>
            </div>
          )}

          {!collapsed && (
            <div className="px-5 pb-1 pt-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/20">
                Protocol
              </span>
            </div>
          )}

          {/* Nav */}
          <nav
            className={cn(
              "space-y-0.5 flex-1",
              collapsed ? "px-2 py-3" : "px-3",
            )}
          >
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <div key={href}>
                  {href === '/docs' && (
                    <>
                      <Separator className="my-2" />
                      {!collapsed && (
                        <div className="px-3 pb-1 pt-1">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Resources</span>
                        </div>
                      )}
                    </>
                  )}
                  <Link
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
                </div>
              );
            })}
          </nav>

          {/* Bottom */}
          <div
            className={cn("shrink-0", collapsed ? "p-2 pb-4" : "p-4")}
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            {!collapsed ? (
              <div
                className="rounded-2xl p-3"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(59,130,246,0.05), rgba(20,184,166,0.03))",
                  border: "1px solid rgba(59,130,246,0.08)",
                  backdropFilter: "blur(12px)",
                }}
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
                <p className="mt-1 font-mono text-[10px] text-blue-400/60 truncate">
                  SAPp...FETZ
                </p>
                <p className="mt-0.5 text-[9px] text-white/20">
                  synapse-client-sdk v2.0.5
                </p>
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
        {/* Mobile header with burger menu */}
        <div className="sticky top-0 z-50 flex h-14 items-center gap-3 px-4 lg:hidden mobile-header">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition-all"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Hexagon className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-semibold gradient-text">
            Synapse Explorer
          </span>
        </div>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* ── Mobile Sidebar (Overlay) ─────────────────────────────── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sidebar */}
          <aside className="fixed left-0 top-0 z-50 h-full w-[280px] lg:hidden flex-shrink-0 transition-transform duration-300 animate-in slide-in-from-left">
            <div className="absolute inset-0 sidebar-glass" />

            <div className="relative z-10 flex h-full flex-col overflow-y-auto">
              {/* Header with close button */}
              <div
                className="flex h-16 items-center justify-between px-5 shrink-0"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="relative flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(20,184,166,0.08))",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    <Hexagon className="h-4 w-4 text-blue-400" />
                    <div className="absolute inset-0 rounded-xl ring-1 ring-blue-500/15" />
                  </div>
                  <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                    <span className="text-sm font-semibold gradient-text">
                      Synapse
                    </span>
                    <span className="ml-1.5 text-[10px] font-medium text-white/25 uppercase tracking-widest">
                      Explorer
                    </span>
                  </Link>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-all"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search */}
              <div className="px-4 py-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
                  <input
                    type="text"
                    placeholder="Search agents, PDAs..."
                    className="w-full rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 pl-9 pr-3 text-[12px] text-white/70 placeholder-white/20 outline-none transition-all focus:border-blue-500/25 focus:bg-white/[0.05] focus:ring-1 focus:ring-blue-500/10"
                    style={{ backdropFilter: "blur(12px)" }}
                  />
                </div>
              </div>

              <div className="px-5 pb-1 pt-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/20">
                  Protocol
                </span>
              </div>

              {/* Navigation */}
              <nav className="space-y-0.5 flex-1 px-3">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const isActive =
                    href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all duration-300",
                        isActive
                          ? "nav-active text-white"
                          : "text-white/35 hover:bg-white/[0.03] hover:text-white/60",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors duration-300",
                          isActive ? "text-blue-400" : "text-white/25",
                        )}
                      />
                      {label}
                    </Link>
                  );
                })}
              </nav>

              {/* Bottom */}
              <div
                className="shrink-0 p-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div
                  className="rounded-2xl p-3"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59,130,246,0.05), rgba(20,184,166,0.03))",
                    border: "1px solid rgba(59,130,246,0.08)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                    <span className="text-[10px] text-white/35">
                      SAP Program
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-blue-400/60 truncate">
                    SAPp...FETZ
                  </p>
                  <p className="mt-0.5 text-[9px] text-white/20">
                    synapse-client-sdk v2.0.5
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
