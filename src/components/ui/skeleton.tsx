import { cn } from '~/lib/utils'

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-muted/50 relative overflow-hidden',
        'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-muted-foreground/[0.04] after:to-transparent after:animate-shimmer after:bg-[length:280%_100%]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
