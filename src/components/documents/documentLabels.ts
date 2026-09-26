import type { DocumentStatus, DocumentType } from '../../lib/documentModel';
import { getStatusBadgeClass } from '../ui/badge';

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

const STATUS_BADGE_KEY: Record<DocumentStatus, string> = {
  draft: 'draft',
  pending_review: 'pending',
  approved: 'success',
  archived: 'inactive',
};

/** Same pill styling as the Partners / Contracts / Service Orders tables. */
export const BADGE_CLASS = 'text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs';
export const statusBadgeClass = (status: DocumentStatus) => `${BADGE_CLASS} ${getStatusBadgeClass(STATUS_BADGE_KEY[status])}`;
export const typeBadgeClass = (type: DocumentType) => `${BADGE_CLASS} ${getStatusBadgeClass(type)}`;

/** Field styling without width, for inline controls; INPUT_CLASS is the full-width default. */
export const FIELD_CLASS =
  'text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500';
export const INPUT_CLASS = `w-full ${FIELD_CLASS}`;
