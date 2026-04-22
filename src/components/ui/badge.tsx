import * as React from 'react'

import { cn } from '~/lib/utils'

const base =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring/40'

const variants: Record<string, string> = {
  default: 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15',
  secondary: 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
  destructive: 'border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/15',
  outline: 'border-neutral-700 bg-transparent text-neutral-400 hover:bg-neutral-800',
  neon: 'border-primary/20 bg-primary/8 text-primary hover:bg-primary/12',
  'neon-orange': 'border-neutral-600 bg-neutral-800 text-white hover:bg-neutral-700',
  'neon-emerald': 'border-neutral-600 bg-neutral-800 text-white hover:bg-neutral-700',
  'neon-amber': 'border-primary/20 bg-primary/8 text-primary hover:bg-primary/12',
  'neon-rose': 'border-red-500/20 bg-red-500/8 text-red-400 hover:bg-red-500/12',
  hud: 'rounded-md border-neutral-700 bg-neutral-800 text-neutral-300 font-mono text-micro tracking-wider uppercase',
  glass: 'rounded-lg border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800',
  holographic: 'rounded-lg border-primary/15 bg-primary/5 text-neutral-300 hover:border-primary/25',
}

function badgeVariants({ variant = 'default', className }: { variant?: string | null; className?: string } = {}) {
  return cn(base, variants[variant ?? 'default'], className)
}

export type BadgeVariant = keyof typeof variants

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant | null
}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={badgeVariants({ variant, className })} {...props} />
}

export { Badge, badgeVariants }
