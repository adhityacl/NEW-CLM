import { AlphabeticalSelect } from './alphabetical-select'
import * as React from "react"
import { cn } from "../../lib/utils"

/** Native select styled with the shadcn token contract (dependency-free). */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <AlphabeticalSelect
      ref={ref}
      className={cn(
        "flex h-11 w-full appearance-none rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-3 py-2 pr-8 text-sm text-[var(--foreground)] shadow-xs transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </AlphabeticalSelect>
  </div>
))
Select.displayName = "Select"

export { Select }
