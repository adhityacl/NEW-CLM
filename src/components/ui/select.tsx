import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "../../lib/utils"

/** Native select styled with the shadcn token contract (dependency-free). */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full appearance-none rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-3 py-2 pr-8 text-sm text-[var(--foreground)] shadow-xs transition-colors",
        "focus-visible:outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
  </div>
))
Select.displayName = "Select"

export { Select }
