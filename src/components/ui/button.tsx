import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

/**
 * shadcn-standard button, now token driven.
 * Variant/size API is unchanged, so all existing call sites keep working.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-semibold transition-all duration-200 ease-out cursor-pointer shrink-0 active:translate-y-px active:duration-75",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:ring-[var(--ring)]/50",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-95 hover:-translate-y-px shadow-xs hover:shadow-md hover:shadow-[var(--primary)]/20": variant === "default",
            "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:brightness-95 hover:-translate-y-px shadow-xs": variant === "destructive",
            "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--muted)] hover:border-[var(--ring)]/40 shadow-xs": variant === "outline",
            "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:brightness-95": variant === "secondary",
            "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]": variant === "ghost",
            "text-[var(--primary)] underline-offset-4 hover:underline": variant === "link",
            "h-9 px-4 text-xs rounded-[var(--radius)]": size === "default",
            "h-8 px-3 text-xs rounded-[var(--radius)]": size === "sm",
            "h-10 px-5 text-sm rounded-[var(--radius)]": size === "lg",
            "h-9 w-9 p-0 rounded-[var(--radius)]": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
