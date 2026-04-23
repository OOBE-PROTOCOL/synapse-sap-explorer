'use client'

import * as React from 'react'

import { cn } from '~/lib/utils'

/* ── Context ── */
const TabsContext = React.createContext<{
  value: string
  onValueChange: (v: string) => void
}>({ value: '', onValueChange: () => {} })

/* ── Tabs (root) ── */
function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? '')
  const current = value ?? internal
  const setter = onValueChange ?? setInternal

  return (
    <TabsContext.Provider value={{ value: current, onValueChange: setter }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

/* ── TabsList ── */
const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      'inline-flex h-9 items-center gap-1 rounded-lg bg-muted/40 backdrop-blur-sm p-1 text-muted-foreground border border-border/30',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

/* ── TabsTrigger ── */
const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(TabsContext)
  const active = ctx.value === value

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium tracking-wide',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-card/90 text-foreground shadow-[0_0_8px_-3px_hsl(var(--glow)/0.15)] border border-border/40'
          : 'hover:text-foreground/70 hover:bg-muted/40',
        className,
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = 'TabsTrigger'

/* ── TabsContent ── */
const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(TabsContext)
  if (ctx.value !== value) return null

  return (
    <div
      ref={ref}
      role="tabpanel"
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
