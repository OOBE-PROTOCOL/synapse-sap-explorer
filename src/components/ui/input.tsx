import * as React from 'react'

import { cn } from '~/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2 text-sm',
          'ring-offset-background placeholder:text-muted-foreground/50',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:border-primary/30',
          'focus-visible:shadow-[0_0_12px_-4px_hsl(var(--glow)/0.15)]',
          'hover:border-border/60',
          'transition-all duration-200',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
