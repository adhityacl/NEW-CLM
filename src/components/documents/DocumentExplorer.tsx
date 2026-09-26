import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FilePlus2,
  FileText,
  FolderOpen,
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
  type MetadataField,
} from '../../lib/documentModel';
import { RelativeTime } from './RelativeTime';
import { ActionMenu, type ActionMenuItem } from '../ui/action-menu';
import { TablePagination } from '../ui/TablePagination';
import { FIELD_CLASS, INPUT_CLASS, statusBadgeClass, statusLabel, typeBadgeClass, typeLabel } from './documentLabels';

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
  from: string;
  to: string;
  meta_field: string;
  meta_value: string;
}

const EMPTY_FILTERS: Filters = { status: '', type: '', created_by: '', from: '', to: '', meta_field: '', meta_value: '' };
const ASCENDING_FIRST: DocumentSortKey[] = ['name', 'type', 'status', 'created_by'];

export const DocumentExplorer: React.FC<DocumentExplorerProps> = ({ canEdit, canDelete, onOpen, onCreate }) => {
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const showAlert = useAlertToast();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: DocumentSortKey; dir: 'asc' | 'desc' }>({ key: 'modified_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isFetching, setIsFetching] = useState(false);
  const [fields, setFields] = useState<MetadataField[]>([]);
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
    documentsApi.listFields().then(setFields).catch(() => setFields([]));
  }, []);

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
  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput('');
    setPage(1);
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

  const isFiltered = Boolean(search) || Object.values(filters).some(Boolean);
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
    <section className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 sm:p-6" aria-labelledby="document-explorer-heading">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 id="document-explorer-heading" ref={headingRef} tabIndex={-1} className="outline-none text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#06C755]" aria-hidden />
              {t('documents.explorer.title', 'Dokumen Saya')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('documents.explorer.subtitle', 'Lanjutkan draf yang tersimpan atau mulai dokumen baru.')}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-1.5 px-4 min-h-11 sm:min-h-9 rounded-xl text-sm font-bold bg-[#06C755] hover:bg-[#05a847] text-white shadow-xs cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" aria-hidden />
              {t('documents.explorer.new', 'Dokumen Baru')}
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
              <label htmlFor="document-search" className="sr-only">
                {t('documents.explorer.search_label', 'Cari dokumen')}
              </label>
              <input
                id="document-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('documents.explorer.search_placeholder', 'Cari nama dokumen atau nilai metadata…')}
                className={`${INPUT_CLASS} pl-8 min-h-11 sm:min-h-9`}
              />
            </div>
            <label htmlFor="document-status-filter" className="sr-only">
              {t('documents.field.status', 'Status')}
            </label>
            <select
              id="document-status-filter"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className={`${FIELD_CLASS} min-h-11 sm:min-h-9`}
            >
              <option value="">{t('documents.filter.status_active', 'Semua status aktif')}</option>
              {DOCUMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(t, s)}
                </option>
              ))}
              <option value="all">{t('documents.filter.status_all', 'Semua (termasuk arsip)')}</option>
            </select>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="document-advanced-filters"
              className="inline-flex items-center gap-1.5 px-3 min-h-11 sm:min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
              {t('documents.filter.more', 'Filter')}
            </button>
          </div>

          {showFilters && (
            <div id="document-advanced-filters" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <label className="space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span>{t('documents.field.type', 'Jenis')}</span>
                <select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)} className={INPUT_CLASS}>
                  <option value="">{t('documents.filter.any', 'Semua')}</option>
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(t, type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span>{t('documents.field.created_by', 'Dibuat oleh')}</span>
                <select value={filters.created_by} onChange={(e) => updateFilter('created_by', e.target.value)} className={INPUT_CLASS}>
                  <option value="">{t('documents.filter.any', 'Semua')}</option>
                  {data?.creators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span>{t('documents.filter.created_from', 'Dibuat sejak')}</span>
                <input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span>{t('documents.filter.created_to', 'Dibuat sampai')}</span>
                <input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} className={INPUT_CLASS} />
              </label>
              {fields.length > 0 && (
                <>
                  <label className="space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>{t('documents.filter.meta_field', 'Kolom metadata')}</span>
                    <select value={filters.meta_field} onChange={(e) => updateFilter('meta_field', e.target.value)} className={INPUT_CLASS}>
                      <option value="">{t('documents.filter.any', 'Semua')}</option>
                      {fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>{t('documents.filter.meta_value', 'Nilai metadata')}</span>
                    <input
                      type="text"
                      value={filters.meta_value}
                      disabled={!filters.meta_field}
                      onChange={(e) => updateFilter('meta_value', e.target.value)}
                      className={`${INPUT_CLASS} disabled:opacity-50`}
                    />
                  </label>
                </>
              )}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="min-h-11 sm:min-h-9 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {t('documents.filter.reset', 'Reset filter')}
                </button>
              </div>
            </div>
          )}
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

          {data && data.total === 0 && (
            <div className="p-10 text-center space-y-3">
              <FileText className="w-8 h-8 mx-auto text-slate-300" aria-hidden />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {isFiltered
                  ? t('documents.explorer.no_match', 'Tidak ada dokumen yang cocok — coba ubah pencarian atau filter.')
                  : t('documents.explorer.empty', 'Belum ada dokumen tersimpan.')}
              </p>
              {isFiltered ? (
                <button type="button" onClick={resetFilters} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline cursor-pointer">
                  {t('documents.filter.reset', 'Reset filter')}
                </button>
              ) : (
                canEdit && (
                  <button type="button" onClick={onCreate} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline cursor-pointer">
                    {t('documents.explorer.new', 'Dokumen Baru')}
                  </button>
                )
              )}
            </div>
          )}

          {data && data.total > 0 && (
            <>
              <div className="relative overflow-x-auto bg-white dark:bg-slate-900">
                <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
                  <caption className="sr-only">{t('documents.explorer.title', 'Dokumen Saya')}</caption>
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                      {sortHeader('name', t('documents.field.name', 'Nama'), 'pl-6 pr-4 py-4')}
                      {sortHeader('type', t('documents.field.type', 'Jenis'), 'p-4 hidden md:table-cell')}
                      {sortHeader('status', t('documents.field.status', 'Status'))}
                      {sortHeader('created_at', t('documents.field.created', 'Dibuat'), 'p-4 hidden lg:table-cell')}
                      {sortHeader('modified_at', t('documents.field.modified', 'Diubah'))}
                      {sortHeader('created_by', t('documents.field.created_by', 'Dibuat oleh'), 'p-4 hidden md:table-cell')}
                      {sortHeader('file_size', t('documents.field.size', 'Ukuran'), 'p-4 hidden lg:table-cell')}
                      <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                        <div className="flex items-center justify-end">{t('documents.field.actions', 'Aksi')}</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
                    {data.documents.map((doc) => (
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
                        <td className="py-4 px-4 text-xs text-left align-middle hidden md:table-cell">
                          <span className={typeBadgeClass(doc.type)}>{typeLabel(t, doc.type)}</span>
                        </td>
                        <td className="py-4 px-4 text-xs text-left align-middle">
                          <span className={statusBadgeClass(doc.status)}>{statusLabel(t, doc.status)}</span>
                        </td>
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle whitespace-nowrap hidden lg:table-cell">
                          <RelativeTime iso={doc.created_at} />
                        </td>
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle whitespace-nowrap">
                          <RelativeTime iso={doc.modified_at} />
                        </td>
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle hidden md:table-cell">
                          {doc.created_by_name || '—'}
                        </td>
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left align-middle whitespace-nowrap hidden lg:table-cell">
                          {formatBytes(doc.file_size)}
                        </td>
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
