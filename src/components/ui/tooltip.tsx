'use client'

import * as React from 'react'
import { Tooltip as FlowbiteTooltip } from 'flowbite-react'

/* ── TooltipProvider (no-op for compat) ── */
function TooltipProvider({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>
}

/* ── Tooltip (wrapper) ── */
const TooltipContext = React.createContext<{
  content: React.ReactNode
  setContent: (c: React.ReactNode) => void
  className: string
  setClassName: (c: string) => void
}>({ content: null, setContent: () => {}, className: '', setClassName: () => {} })

function Tooltip({ children }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; delayDuration?: number }) {
  const [content, setContent] = React.useState<React.ReactNode>(null)
  const [className, setClassName] = React.useState('')

  return (
    <TooltipContext.Provider value={{ content, setContent, className, setClassName }}>
      {children}
    </TooltipContext.Provider>
  )
}

/* ── TooltipTrigger ── */
function TooltipTrigger({
  children,
  asChild,
  className: triggerClassName,
  ...props
}: React.HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
  const { content, className } = React.useContext(TooltipContext)

  return (
    <FlowbiteTooltip
      content={content ?? ''}
      placement="top"
      theme={{ target: triggerClassName ?? 'w-fit' }}
      className={`z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md ${className}`}
    >
      {asChild && React.isValidElement(children) ? (
        children
      ) : (
        <span {...props}>{children}</span>
      )}
    </FlowbiteTooltip>
  )
}

/* ── TooltipContent ── */
function TooltipContent({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number; side?: 'top' | 'right' | 'bottom' | 'left'; className?: string }) {
  const { setContent, setClassName } = React.useContext(TooltipContext)

  React.useEffect(() => {
    setContent(children)
  }, [children, setContent])

  React.useEffect(() => {
    setClassName(className ?? '')
  }, [className, setClassName])

  // Content is rendered by FlowbiteTooltip, not here
  return null
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
