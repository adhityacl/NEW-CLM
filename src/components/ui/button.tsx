import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/40 disabled:pointer-events-none disabled:opacity-50 shrink-0 gap-1.5 cursor-pointer active:scale-[0.98]",
          {
            "bg-[#06C755] hover:bg-[#05B34C] text-white shadow-xs rounded-xl": variant === "default",
            "bg-rose-600 text-white hover:bg-rose-700 shadow-xs rounded-xl": variant === "destructive",
            "bg-white border border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-xs rounded-xl": variant === "outline",
            "bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl": variant === "secondary",
            "hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl": variant === "ghost",
            "text-[#06C755] underline-offset-4 hover:underline": variant === "link",
            "h-9 px-4 text-xs": size === "default",
            "h-8 px-3 text-xs": size === "sm",
            "h-10 px-5 text-sm": size === "lg",
            "h-9 w-9 p-0 rounded-xl": size === "icon",
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
