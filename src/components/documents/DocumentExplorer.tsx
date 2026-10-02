import { AlphabeticalSelect } from '../ui/alphabetical-select';
import { TableEmptyState } from '../ui/table-empty-state';
import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FilePlus2,
  FileText,
  FolderInput,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useAlertToast } from '../../context/AlertToastContext';
import { documentsApi, errorMessage } from '../../lib/documentsApi';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  PAGE_SIZES,
  formatBytes,
  type DocumentListResponse,
  type DocumentSortKey,
  type DocumentSummary,
} from '../../lib/documentModel';
import { RelativeTime } from './RelativeTime';
import { ActionMenu, type ActionMenuItem } from '../ui/action-menu';
import { TablePagination } from '../ui/TablePagination';
import { INPUT_CLASS, statusBadgeClass, statusLabel, typeBadgeClass, typeLabel } from './documentLabels';

interface DocumentExplorerProps {
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DocumentListResponse };

interface Filters {
  status: string;
  type: string;
  created_by: string;
}

const EMPTY_FILTERS: Filters = { status: '', type: '', created_by: '' };
const ASCENDING_FIRST: DocumentSortKey[] = ['name', 'type', 'status', 'created_by'];

export const DocumentExplorer: React.FC<DocumentExplorerProps> = ({ canEdit, canDelete, onOpen, onCreate }) => {
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const showAlert = useAlertToast();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    type: true,
    status: true,
    created: false,
    modified: true,
    createdBy: true,
    size: false,
  });
  const [sort, setSort] = useState<{ key: DocumentSortKey; dir: 'asc' | 'desc' }>({ key: 'modified_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isFetching, setIsFetching] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const params: Record<string, string> = { page: String(page), limit: String(limit), sort_by: sort.key, sort_dir: sort.dir };
    if (search) params.search = search;
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    setIsFetching(true);
    documentsApi
      .list(params, controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(err) });
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsFetching(false);
      });
    return () => controller.abort();
  }, [search, filters, sort, page, limit, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };
  const toggleColumnVisibility = (column: keyof typeof visibleColumns) => {
    setVisibleColumns((current) => ({ ...current, [column]: !current[column] }));
  };
  const toggleSort = (key: DocumentSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: ASCENDING_FIRST.includes(key) ? 'asc' : 'desc' },
    );
    setPage(1);
  };

  const runAction = async (action: () => Promise<unknown>, successTitle: string) => {
    try {
      await action();
      showAlert({ title: successTitle, variant: 'success' });
      reload();
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const submitRename = () => {
    if (!renaming) return;
    const { id, value } = renaming;
    setRenaming(null);
    if (value.trim()) runAction(() => documentsApi.update(id, { name: value.trim() }), t('documents.msg.renamed', 'Nama dokumen diperbarui'));
  };

  const toggleArchive = (doc: DocumentSummary) =>
    runAction(
      () => documentsApi.update(doc.id, { status: doc.status === 'archived' ? 'draft' : 'archived' }),
      doc.status === 'archived' ? t('documents.msg.unarchived', 'Dokumen dikembalikan dari arsip') : t('documents.msg.archived', 'Dokumen diarsipkan'),
    );

  const deleteDocument = async (doc: DocumentSummary) => {
    const ok = await confirmDialog({
      description: t(
        'documents.confirm.delete',
        'Hapus "{name}" beserta seluruh versi, metadata, dan komentarnya? Tindakan ini tidak bisa dibatalkan.',
        { name: doc.name },
      ),
      tone: 'danger',
      confirmLabel: t('contract_creator.confirm.delete_label', 'Hapus'),
    });
    if (ok) runAction(() => documentsApi.remove(doc.id), t('documents.msg.deleted', 'Dokumen dihapus'));
  };

  const rowActions = (doc: DocumentSummary): ActionMenuItem[] => {
    const archived = doc.status === 'archived';
    return [
      { label: t('documents.action.open', 'Buka'), icon: <FolderInput className="w-3.5 h-3.5" />, onClick: () => onOpen(doc.id) },
      ...(canEdit
        ? [
            {
              label: t('documents.action.rename', 'Ganti nama'),
              icon: <Pencil className="w-3.5 h-3.5" />,
              onClick: () => setRenaming({ id: doc.id, value: doc.name }),
            },
            {
              label: archived ? t('documents.action.unarchive', 'Keluarkan dari arsip') : t('documents.action.archive', 'Arsipkan'),
              icon: archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />,
              onClick: () => toggleArchive(doc),
            },
          ]
        : []),
      ...(canDelete
        ? [
            {
              label: t('documents.action.delete', 'Hapus'),
              icon: <Trash2 className="w-3.5 h-3.5" />,
              onClick: () => deleteDocument(doc),
              variant: 'danger' as const,
              dividerBefore: true,
            },
          ]
        : []),
    ];
  };

  const data = state.status === 'ready' ? state.data : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const sortHeader = (sortKey: DocumentSortKey, label: string, className = 'p-4') => {
    const active = sort.key === sortKey;
    return (
      <th
        key={sortKey}
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`${className} text-xs font-bold text-slate-700 dark:text-slate-300 text-left select-none align-middle`}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5"
        >
          <span>{label}</span>
          {active ? (
            sort.dir === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#06C755] shrink-0" aria-hidden />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#06C755] shrink-0" aria-hidden />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
          )}
        </button>
      </th>
    );
  };

  return (
    <section className="w-full min-w-0 bg-transparent" aria-labelledby="document-explorer-heading">
      <div className="w-full space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 id="document-explorer-heading" ref={headingRef} tabIndex={-1} className="outline-none text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('documents.explorer.title', 'Dokumen Saya')}
            </h1>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex w-fit shrink-0 items-center gap-1.5 px-4 min-h-11 sm:min-h-9 rounded-xl text-sm font-bold bg-[#04803D] hover:bg-[#036B33] text-white shadow-sm cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" aria-hidden />
              {t('documents.explorer.new', 'Dokumen Baru')}
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2.5 w-full">
            <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <label htmlFor="document-search" className="sr-only">
                {t('documents.explorer.search_label', 'Search Document')}
              </label>
              <input
                id="document-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('documents.explorer.search_placeholder', 'Search Documents…')}
                className="h-11 sm:h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
              />
            </div>
            <label htmlFor="document-status-filter" className="sr-only">
              {t('documents.filter.status_label', 'Document Status')}
            </label>
            <AlphabeticalSelect
              id="document-status-filter"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="min-h-11 sm:min-h-9 h-9 min-w-[130px] flex-1 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] cursor-pointer"
            >
              <option value="">{t('documents.filter.status_active', 'Semua status aktif')}</option>
              {DOCUMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(t, s)}
                </option>
              ))}
              <option value="all">{t('documents.filter.status_all', 'Semua (termasuk arsip)')}</option>
            </AlphabeticalSelect>

            <label htmlFor="document-type-filter" className="sr-only">
              {t('documents.filter.type_label', 'Document Type')}
            </label>
            <AlphabeticalSelect
              id="document-type-filter"
              value={filters.type}
              onChange={(e) => updateFilter('type', e.target.value)}
              className="min-h-11 sm:min-h-9 h-9 min-w-[130px] flex-1 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] cursor-pointer"
            >
              <option value="">{t('documents.filter.type_all', 'All Document Types')}</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(t, type)}
                </option>
              ))}
            </AlphabeticalSelect>

            <label htmlFor="document-creator-filter" className="sr-only">
              {t('documents.filter.created_by_label', 'Created By')}
            </label>
            <AlphabeticalSelect
              id="document-creator-filter"
              value={filters.created_by}
              onChange={(e) => updateFilter('created_by', e.target.value)}
              className="min-h-11 sm:min-h-9 h-9 min-w-[130px] flex-1 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] cursor-pointer"
            >
              <option value="">{t('documents.filter.created_by_all', 'All Creators')}</option>
              {(data?.creators ?? []).map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.name || creator.id}
                </option>
              ))}
            </AlphabeticalSelect>

            <div className="relative flex-initial">
              <button
                type="button"
                onClick={() => setIsViewMenuOpen((open) => !open)}
                aria-expanded={isViewMenuOpen}
                aria-haspopup="menu"
                className="min-h-11 sm:min-h-9 h-9 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden />
                <span>{t('documents.filter.view', 'View')}</span>
              </button>
              {isViewMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsViewMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-30 w-52 rounded-2xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-800 dark:bg-slate-900" role="menu">
                    <div className="mb-1 border-b border-slate-100 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                      {t('documents.filter.toggle_columns', 'Toggle Columns')}
                    </div>
                    {([
                      ['type', t('documents.field.type', 'Type')],
                      ['status', t('documents.field.status', 'Status')],
                      ['created', t('documents.field.created', 'Created')],
                      ['modified', t('documents.field.modified', 'Modified')],
                      ['createdBy', t('documents.field.created_by', 'Created by')],
                      ['size', t('documents.field.size', 'Size')],
                    ] as const).map(([column, label]) => (
                      <label key={column} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={visibleColumns[column]}
                          onChange={() => toggleColumnVisibility(column)}
                          className="rounded border-slate-300 text-[#06C755] focus:ring-[#06C755] dark:border-slate-700"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <section
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden"
          aria-busy={isFetching}
          aria-live="polite"
        >
          {state.status === 'loading' && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800" role="status">
              <span className="sr-only">{t('common.loading', 'Memuat…')}</span>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-14 px-3 flex items-center gap-3 animate-pulse motion-reduce:animate-none">
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800 ml-auto" />
                </div>
              ))}
            </div>
          )}

          {state.status === 'error' && (
            <div role="alert" className="p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                {t('documents.explorer.load_failed', 'Gagal memuat daftar dokumen.')}
              </p>
              <p className="text-xs text-slate-500">{state.message}</p>
              <button
                type="button"
                onClick={reload}
                className="inline-flex items-center gap-1.5 px-3 min-h-11 sm:min-h-9 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                {t('common.retry', 'Coba lagi')}
              </button>
            </div>
          )}

          {data && (
            <>
              <div className="relative overflow-x-auto bg-white dark:bg-slate-900">
                <table className="app-data-table document-data-table w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
                  <caption className="sr-only">{t('documents.explorer.title', 'Dokumen Saya')}</caption>
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                      {sortHeader('name', t('documents.field.name', 'Nama'), 'pl-6 pr-4 py-4')}
                      {visibleColumns.type && sortHeader('type', t('documents.field.type', 'Jenis'), 'p-4 hidden md:table-cell')}
                      {visibleColumns.status && sortHeader('status', t('documents.field.status', 'Status'))}
                      {visibleColumns.created && sortHeader('created_at', t('documents.field.created', 'Dibuat'), 'p-4 hidden lg:table-cell')}
                      {visibleColumns.modified && sortHeader('modified_at', t('documents.field.modified', 'Diubah'))}
                      {visibleColumns.createdBy && sortHeader('created_by', t('documents.field.created_by', 'Dibuat oleh'), 'p-4 hidden md:table-cell')}
                      {visibleColumns.size && sortHeader('file_size', t('documents.field.size', 'Ukuran'), 'p-4 hidden lg:table-cell')}
                      <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                        <div className="flex items-center justify-end">{t('documents.field.actions', 'Aksi')}</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
                    {data.documents.length === 0 ? <TableEmptyState colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} /> : data.documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="pl-6 pr-4 py-4 text-xs text-left align-middle max-w-[320px]">
                          {renaming?.id === doc.id ? (
                            <input
                              autoFocus
                              aria-label={t('documents.action.rename', 'Ganti nama')}
                              value={renaming.value}
                              onChange={(e) => setRenaming({ id: doc.id, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename();
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                              onBlur={submitRename}
                              className={INPUT_CLASS}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpen(doc.id)}
                              className="font-semibold text-left text-slate-900 dark:text-slate-100 hover:text-[#06C755] truncate block max-w-full cursor-pointer transition-colors"
                              title={doc.name}
                            >
                              {doc.name}
                            </button>
                          )}
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">v{doc.current_version}</span>
                        </td>
                        {visibleColumns.type && <td className="py-4 px-4 text-xs text-left align-middle hidden md:table-cell">
                          <span className={typeBadgeClass(doc.type)}>{typeLabel(t, doc.type)}</span>
                        </td>}
                        {visibleColumns.status && <td className="py-4 px-4 text-xs text-left align-middle">
                          <span className={statusBadgeClass(doc.status)}>{statusLabel(t, doc.status)}</span>
                        </td>}
                        {visibleColumns.created && <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle whitespace-nowrap hidden lg:table-cell">
                          <RelativeTime iso={doc.created_at} />
                        </td>}
                        {visibleColumns.modified && <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle whitespace-nowrap">
                          <RelativeTime iso={doc.modified_at} />
                        </td>}
                        {visibleColumns.createdBy && <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle hidden md:table-cell">
                          {doc.created_by_name || '—'}
                        </td>}
                        {visibleColumns.size && <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle whitespace-nowrap hidden lg:table-cell">
                          {formatBytes(doc.file_size)}
                        </td>}
                        <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                          <div className="flex items-center justify-end">
                            <ActionMenu items={rowActions(doc)} title={`${t('documents.field.actions', 'Aksi')}: ${doc.name}`} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <TablePagination
                currentPage={data.page}
                totalPages={totalPages}
                rowsPerPage={limit}
                rowsPerPageOptions={[...PAGE_SIZES]}
                onPageChange={setPage}
                onRowsPerPageChange={(size) => {
                  setLimit(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </section>
      </div>
    </section>
  );
};
