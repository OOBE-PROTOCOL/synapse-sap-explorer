import * as React from 'react'

import { cn } from '~/lib/utils'

const base =
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const variants: Record<string, string> = {
  default: 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15',
  secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15',
  outline: 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  neon: 'border-primary/20 bg-primary/8 text-primary hover:bg-primary/12',
  'neon-orange': 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15',
  'neon-emerald': 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400',
  'neon-amber': 'border-primary/20 bg-primary/8 text-primary hover:bg-primary/12',
  'neon-rose': 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15',
  hud: 'rounded-md border-border bg-muted text-muted-foreground font-mono text-micro uppercase',
  glass: 'rounded-lg border-border bg-card text-card-foreground shadow-sm hover:bg-accent',
  holographic: 'rounded-lg border-primary/15 bg-primary/5 text-foreground hover:border-primary/25',
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
