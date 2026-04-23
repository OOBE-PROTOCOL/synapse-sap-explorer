'use client'

import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '~/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
      onChange?.(e)
    }

    return (
      <label className="relative inline-flex h-4 w-4 shrink-0 cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          className="peer sr-only"
          {...props}
        />
        <span
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-sm border border-primary ring-offset-background',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            'peer-checked:bg-primary peer-checked:text-primary-foreground',
            className,
          )}
        >
          {checked && <Check className="h-4 w-4" />}
        </span>
      </label>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
