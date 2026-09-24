import * as React from "react";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "default"
  | "success"
  | "secondary"
  | "destructive"
  | "danger"
  | "warning"
  | "outline"
  | "purple"
  | "info"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
  children?: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function getStatusBadgeClass(status: string): string {
  const s = (status || "").toLowerCase().trim();
  
  // Success / Aktif / Lengkap / Recommended / Berjalan / Signed / BHI
  if (
    s === "aktif" ||
    s === "active" ||
    s === "lengkap" ||
    s === "complete" ||
    s === "available" ||
    s === "recommended" ||
    s === "berjalan" ||
    s === "signed" ||
    s === "success" ||
    s === "excellent" ||
    s === "sangat baik" ||
    s === "bhi" ||
    s === "never"
  ) {
    return "bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/40 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300";
  }

  // Warning / Akan Berakhir / Belum Lengkap / Recommended with notes / Review / Fair / Moderate / Rare / Sisa Waktu
  if (
    s === "akan berakhir" ||
    s === "expiring" ||
    s === "warning" ||
    s === "belum lengkap" ||
    s === "incomplete" ||
    s === "missing" ||
    s === "recommended with notes" ||
    s === "review" ||
    s === "fair" ||
    s === "baik" ||
    s === "moderate" ||
    s === "rare" ||
    s === "pending" ||
    s.includes("hari lagi") ||
    s.includes("days left")
  ) {
    return "bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/40 dark:border-amber-500/50 text-amber-800 dark:text-amber-300";
  }

  // Danger / Expired / Kadaluarsa / Terminated / Not Recommended / Inactive / Ditolak / Frequent
  if (
    s === "expired" ||
    s === "kadaluarsa" ||
    s === "terminated" ||
    s === "not recommended" ||
    s === "inactive" ||
    s === "nonaktif" ||
    s === "ditolak" ||
    s === "danger" ||
    s === "kurang baik" ||
    s === "frequent" ||
    s === "expensive" ||
    s === "delete"
  ) {
    return "bg-rose-500/10 dark:bg-rose-950/40 border-rose-500/40 dark:border-rose-500/50 text-rose-800 dark:text-rose-300";
  }

  // Legal / Good / Info / Selesai / BHA / Create / IO
  if (
    s === "legal" ||
    s === "good" ||
    s === "info" ||
    s === "selesai" ||
    s === "cheap" ||
    s === "bha" ||
    s === "create" ||
    s === "io" ||
    s === "contract"
  ) {
    return "bg-blue-500/10 dark:bg-blue-950/40 border-blue-500/40 dark:border-blue-500/50 text-blue-800 dark:text-blue-300";
  }

  // Admin / Addendum / Purple
  if (
    s === "admin" ||
    s === "addendum" ||
    s === "auth" ||
    s === "add_user"
  ) {
    return "bg-purple-500/10 dark:bg-purple-950/40 border-purple-500/40 dark:border-purple-500/50 text-purple-800 dark:text-purple-300";
  }

  // Finance / Cyan
  if (s === "finance" || s === "spending" || s === "invoice") {
    return "bg-cyan-500/10 dark:bg-cyan-950/40 border-cyan-500/40 dark:border-cyan-500/50 text-cyan-800 dark:text-cyan-300";
  }

  // Default / Neutral / Draft / Module / Update
  return "bg-slate-500/10 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200";
}

function Badge({ className, variant = "default", size = "md", children, ...props }: BadgeProps) {
  let variantClass = "";
  switch (variant) {
    case "success":
    case "default":
      variantClass = "bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/40 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300";
      break;
    case "warning":
      variantClass = "bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/40 dark:border-amber-500/50 text-amber-800 dark:text-amber-300";
      break;
    case "destructive":
    case "danger":
      variantClass = "bg-rose-500/10 dark:bg-rose-950/40 border-rose-500/40 dark:border-rose-500/50 text-rose-800 dark:text-rose-300";
      break;
    case "info":
      variantClass = "bg-blue-500/10 dark:bg-blue-950/40 border-blue-500/40 dark:border-blue-500/50 text-blue-800 dark:text-blue-300";
      break;
    case "purple":
      variantClass = "bg-purple-500/10 dark:bg-purple-950/40 border-purple-500/40 dark:border-purple-500/50 text-purple-800 dark:text-purple-300";
      break;
    case "secondary":
    case "neutral":
    case "outline":
    default:
      variantClass = "bg-slate-500/10 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200";
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-normal transition-colors whitespace-nowrap gap-1.5 select-none",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-0.5 text-xs",
        variantClass,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge };

