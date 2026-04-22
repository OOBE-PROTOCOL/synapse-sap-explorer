'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '~/lib/utils'

/* ── Context ── */
type SelectCtx = {
  value: string
  onValueChange: (v: string) => void
  open: boolean
  setOpen: (o: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const SelectContext = React.createContext<SelectCtx>({
  value: '',
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
})

/* ── Select (root) ── */
function Select({
  value,
  defaultValue,
  onValueChange,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? '')
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const current = value ?? internal
  const setter = onValueChange ?? setInternal

  return (
    <SelectContext.Provider value={{ value: current, onValueChange: setter, open, setOpen, triggerRef }}>
      <div className="relative inline-block">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

/* ── SelectValue ── */
function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = React.useContext(SelectContext)
  return <span className="line-clamp-1">{value || placeholder}</span>
}

/* ── SelectTrigger ── */
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)

  const mergedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      (ctx.triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
    },
    [ref, ctx.triggerRef],
  )

  return (
    <button
      ref={mergedRef}
      type="button"
      role="combobox"
      aria-expanded={ctx.open}
      aria-controls="select-listbox"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/40 focus:border-primary/30 focus:shadow-[0_0_12px_-4px_hsl(var(--glow)/0.15)] hover:border-border/60 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
    </button>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

/* ── SelectContent ── */
const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { position?: string }
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!ctx.open) return
    function handleClick(e: MouseEvent) {
      if (
        contentRef.current && !contentRef.current.contains(e.target as Node) &&
        ctx.triggerRef.current && !ctx.triggerRef.current.contains(e.target as Node)
      ) {
        ctx.setOpen(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') ctx.setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [ctx.open, ctx])

  if (!ctx.open) return null

  return (
    <div
      ref={(node) => {
        (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      className={cn(
        'absolute left-0 top-full z-50 mt-1 max-h-96 min-w-[8rem] w-full overflow-auto rounded-md border border-border/40 bg-popover/90 backdrop-blur-xl text-popover-foreground shadow-[0_4px_20px_-4px_hsl(var(--glow)/0.1)] p-1 animate-in fade-in-0 zoom-in-95',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})
SelectContent.displayName = 'SelectContent'

/* ── SelectItem ── */
const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string; disabled?: boolean }
>(({ className, children, value, disabled, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)
  const selected = ctx.value === value

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      data-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return
        ctx.onValueChange(value)
        ctx.setOpen(false)
      }}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent/50 hover:text-accent-foreground transition-colors duration-100',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {selected && <Check className="h-4 w-4" />}
      </span>
      <span>{children}</span>
    </div>
  )
})
SelectItem.displayName = 'SelectItem'

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
