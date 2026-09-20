import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const alertVariants = cva(
  "relative w-full rounded-[var(--radius)] border px-4 py-3 text-sm grid grid-cols-[0_1fr] gap-x-3 has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] items-start",
  {
    variants: {
      variant: {
        default: "bg-[var(--card)] text-[var(--card-foreground)] border-[var(--border)]",
        destructive:
          "border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-[var(--destructive)]",
        warning: "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]",
        success: "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold leading-none tracking-tight col-start-2", className)} {...props} />
  )
)
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm leading-relaxed col-start-2 [&_p]:leading-relaxed", className)} {...props} />
  )
)
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
