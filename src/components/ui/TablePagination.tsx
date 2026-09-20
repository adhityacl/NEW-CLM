import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
  rowsPerPageOptions?: number[];
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [5, 10, 20, 50],
  className = '',
}) => {
  const { t } = useLanguage();
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage || 1), safeTotalPages);

  return (
    <div
      className={`p-4 sm:px-6 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs select-none ${className}`}
    >
      {/* Left: Rows per page selector */}
      <div className="flex items-center gap-2.5">
        <div className="relative inline-flex items-center">
          <select
            value={rowsPerPage}
            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            className="h-8 pl-3 pr-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#06C755] cursor-pointer appearance-none transition-colors shadow-2xs"
          >
            {rowsPerPageOptions.map((opt) => (
              <option
                key={opt}
                value={opt}
                className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              >
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-slate-500 dark:text-slate-400 pointer-events-none" />
        </div>
        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
          {t('pagination.rows_per_page', 'Rows per page')}
        </span>
      </div>

      {/* Right: Page indicator & 4 Nav buttons */}
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
          {t('pagination.page', 'Page')} {safeCurrentPage} {t('pagination.of', 'of')} {safeTotalPages}
        </span>

        <div className="flex items-center gap-1.5">
          {/* First Page */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safeCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
            title={t('pagination.first_page', 'First Page')}
            aria-label={t('pagination.first_page', 'First Page')}
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Previous Page */}
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            disabled={safeCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
            title={t('pagination.prev_page', 'Previous Page')}
            aria-label={t('pagination.prev_page', 'Previous Page')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Next Page */}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))}
            disabled={safeCurrentPage >= safeTotalPages}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
            title={t('pagination.next_page', 'Next Page')}
            aria-label={t('pagination.next_page', 'Next Page')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Last Page */}
          <button
            type="button"
            onClick={() => onPageChange(safeTotalPages)}
            disabled={safeCurrentPage >= safeTotalPages}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
            title={t('pagination.last_page', 'Last Page')}
            aria-label={t('pagination.last_page', 'Last Page')}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
