import * as React from 'react'

import { cn } from '~/lib/utils'

const base =
  'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer'

const variantStyles: Record<string, string> = {
  default:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/85',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  outline:
    'border border-border bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
  secondary:
    'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent/60 hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
}

const sizeStyles: Record<string, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-10 rounded-md px-3 text-xs',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
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
