import * as React from 'react'

import { cn } from '~/lib/utils'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer'

const variantStyles: Record<string, string> = {
  default:
    'bg-primary text-primary-foreground shadow-[0_0_12px_-4px_hsl(var(--glow)/0.3)] hover:bg-primary/90 hover:shadow-[0_0_18px_-4px_hsl(var(--glow)/0.4)] active:scale-[0.98]',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_12px_-4px_hsl(var(--destructive)/0.2)]',
  outline:
    'border border-border/40 bg-card/50 backdrop-blur-sm hover:bg-card/80 hover:border-border/60 text-foreground',
  secondary:
    'bg-secondary/80 text-secondary-foreground backdrop-blur-sm hover:bg-secondary',
  ghost: 'hover:bg-accent/60 hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
}

const sizeStyles: Record<string, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-9 w-9',
}

function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: string | null; size?: string | null; className?: string } = {}) {
  return cn(base, variantStyles[variant ?? 'default'], sizeStyles[size ?? 'default'], className)
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null
  size?: 'default' | 'sm' | 'lg' | 'icon' | null
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const classes = buttonVariants({ variant, size, className })

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        className: cn(classes, (children as React.ReactElement<{ className?: string }>).props.className),
        ref,
        ...props,
      })
    }

    return (
      <button className={classes} ref={ref} {...props}>
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
