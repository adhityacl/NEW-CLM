import * as React from "react"
import { cn } from "./utils"

/**
 * Lightweight, dependency-free tabs following shadcn composition
 * (Tabs / TabsList / TabsTrigger / TabsContent). Controlled via props so
 * it works with the app's existing tab state.
 *
 * WAI-ARIA tabs pattern: tablist/tab/tabpanel roles, roving tabindex,
 * Arrow/Home/End keys move focus and activate, and each tab is linked to its
 * panel with aria-controls / aria-labelledby.
 */
interface TabsCtx { value: string; onChange: (v: string) => void; baseId: string }
const TabsContext = React.createContext<TabsCtx | null>(null)

const tabId = (base: string, value: string) => `${base}-tab-${value}`
const panelId = (base: string, value: string) => `${base}-panel-${value}`

export function Tabs({ value, onValueChange, className, children, id }: { value: string; onValueChange: (v: string) => void; className?: string; children: React.ReactNode; id?: string }) {
  const generated = React.useId().replace(/:/g, "")
  return (
    <TabsContext.Provider value={{ value, onChange: onValueChange, baseId: id || `tabs${generated}` }}>
      <div className={cn("flex flex-col gap-2", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children, "aria-label": ariaLabel }: { className?: string; children: React.ReactNode; "aria-label"?: string }) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'))
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: tabs.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = tabs[(next + tabs.length) % tabs.length]
    target.focus()
    target.click()
  }
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cn("inline-flex h-9 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] p-[3px] text-[var(--muted-foreground)]", className)}>
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
      id={ctx ? tabId(ctx.baseId, value) : undefined}
      aria-controls={ctx ? panelId(ctx.baseId, value) : undefined}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
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
  return (
    <div
      role="tabpanel"
      id={ctx ? panelId(ctx.baseId, value) : undefined}
      aria-labelledby={ctx ? tabId(ctx.baseId, value) : undefined}
      tabIndex={0}
      className={cn("text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 rounded-[var(--radius)]", className)}
    >
      {children}
    </div>
  )
}
