import type { DocumentStatus, DocumentType } from '../../lib/documentModel';

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const STATUS_FALLBACK: Record<DocumentStatus, string> = {
  draft: 'Draf',
  pending_review: 'Menunggu Review',
  approved: 'Disetujui',
  archived: 'Diarsipkan',
};

const TYPE_FALLBACK: Record<DocumentType, string> = {
  contract: 'Kontrak',
  nda: 'NDA',
  agreement: 'Perjanjian',
  addendum: 'Adendum',
  io: 'IO',
  other: 'Lainnya',
};

export const statusLabel = (t: Translate, status: DocumentStatus) => t(`documents.status.${status}`, STATUS_FALLBACK[status]);
export const typeLabel = (t: Translate, type: DocumentType) => t(`documents.type.${type}`, TYPE_FALLBACK[type]);

export const STATUS_BADGE_CLASS: Record<DocumentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
  pending_review: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700',
  archived: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600',
};

/** Field styling without width, for inline controls; INPUT_CLASS is the full-width default. */
export const FIELD_CLASS =
  'text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500';
export const INPUT_CLASS = `w-full ${FIELD_CLASS}`;
