import { cn } from "../../lib/utils"

/** shadcn-standard skeleton loader. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-[var(--radius)] bg-[var(--muted)]", className)} {...props} />
}
