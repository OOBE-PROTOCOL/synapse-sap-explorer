'use client'

import * as React from 'react'
import { Modal } from 'flowbite-react'
import { X } from 'lucide-react'

import { cn } from '~/lib/utils'

/* ── Context ── */
const DialogContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>({ open: false, onOpenChange: () => {} })

/* ── Dialog (root) ── */
function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogContext.Provider value={{ open: open ?? false, onOpenChange: onOpenChange ?? (() => {}) }}>
      {children}
    </DialogContext.Provider>
  )
}

/* ── DialogContent ── */
const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, onOpenChange } = React.useContext(DialogContext)
  return (
    <Modal
      show={open}
      onClose={() => onOpenChange(false)}
      size="lg"
      className="[&>div]:bg-transparent"
    >
      <div
        ref={ref}
        className={cn(
          'relative w-full max-w-lg mx-auto gap-4 border bg-background p-6 shadow-lg rounded-xl',
          className,
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </Modal>
  )
})
DialogContent.displayName = 'DialogContent'

export { Dialog, DialogContent }
