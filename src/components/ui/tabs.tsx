import * as React from "react"
import { cn } from "../../lib/utils"

/**
 * Lightweight, dependency-free tabs following shadcn composition
 * (Tabs / TabsList / TabsTrigger / TabsContent). Controlled via props so
 * it works with the app's existing tab state.
 */
interface TabsCtx { value: string; onChange: (v: string) => void }
const TabsContext = React.createContext<TabsCtx | null>(null)

export function Tabs({ value, onValueChange, className, children }: { value: string; onValueChange: (v: string) => void; className?: string; children: React.ReactNode }) {
  return (
    <TabsContext.Provider value={{ value, onChange: onValueChange }}>
      <div className={cn("flex flex-col gap-2", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="tablist" className={cn("inline-flex h-9 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] p-[3px] text-[var(--muted-foreground)]", className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(TabsContext)
  const active = ctx?.value === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx?.onChange(value)}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--shadcn-radius-sm)] px-3 py-1 text-sm font-medium transition-all cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40",
        active
          ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(TabsContext)
  if (ctx && ctx.value !== value) return null
  return <div role="tabpanel" className={cn("text-sm", className)}>{children}</div>
}
