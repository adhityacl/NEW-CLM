import * as React from "react"
import { cn } from "../../lib/utils"

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
export type ButtonSize = "default" | "sm" | "md" | "lg" | "icon"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
}

/**
 * Shared class-builder so non-<button> elements (e.g. Radix AlertDialog's
 * Action/Cancel, which render their own <button>) can match Button's look
 * without nesting a <button> inside a <button>.
 */
export function buttonVariants(variant: ButtonVariant = "default", size: ButtonSize = "default", className?: string) {
  return cn(
    "ui-button",
    `ui-button-${size === "default" || size === "icon" ? "md" : size}`,
    size === "icon" && "ui-button-icon",
    "inline-flex items-center justify-center gap-1.5 font-semibold transition-colors duration-150 cursor-pointer shrink-0",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40",
    "disabled:pointer-events-none disabled:opacity-50",
    {
      "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-95 shadow-xs": variant === "default",
      "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:brightness-95 shadow-xs": variant === "destructive",
      "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--muted)] shadow-xs": variant === "outline",
      "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:brightness-95": variant === "secondary",
      "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]": variant === "ghost",
      "text-accent-text underline-offset-4 hover:underline": variant === "link",
    },
    className
  )
}

/**
 * shadcn-standard button, now token driven.
 * Variant/size API is unchanged, so all existing call sites keep working.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", iconOnly = false, ...props }, ref) => {
    return <button ref={ref} data-button-size={size} className={buttonVariants(variant, size, cn(iconOnly && "ui-button-icon", className))} {...props} />
  }
)
Button.displayName = "Button"

export { Button }
