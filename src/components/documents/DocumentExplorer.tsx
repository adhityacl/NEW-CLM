import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  FilePlus2,
  FileText,
  FolderOpen,
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
import { FIELD_CLASS, INPUT_CLASS, STATUS_BADGE_CLASS, statusLabel, typeLabel } from './documentLabels';

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
const ICON_BUTTON =
  'inline-flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer';

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

  const isFiltered = Boolean(search) || Object.values(filters).some(Boolean);
  const data = state.status === 'ready' ? state.data : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const sortHeader = (sortKey: DocumentSortKey, label: string, className = '') => {
    const active = sort.key === sortKey;
    return (
      <th
        key={sortKey}
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-3 py-2 text-left font-semibold ${className}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          {label}
          {active && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden />)}
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
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
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
              <div className="relative overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">{t('documents.explorer.title', 'Dokumen Saya')}</caption>
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                    <tr>
                      {sortHeader('name', t('documents.field.name', 'Nama'))}
                      {sortHeader('type', t('documents.field.type', 'Jenis'), 'hidden md:table-cell')}
                      {sortHeader('status', t('documents.field.status', 'Status'))}
                      {sortHeader('created_at', t('documents.field.created', 'Dibuat'), 'hidden lg:table-cell')}
                      {sortHeader('modified_at', t('documents.field.modified', 'Diubah'))}
                      {sortHeader('created_by', t('documents.field.created_by', 'Dibuat oleh'), 'hidden md:table-cell')}
                      {sortHeader('file_size', t('documents.field.size', 'Ukuran'), 'hidden lg:table-cell')}
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        <span className="sr-only">{t('documents.field.actions', 'Aksi')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {data.documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 max-w-[280px]">
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
                              className="font-semibold text-left text-slate-900 dark:text-white hover:underline truncate block max-w-full cursor-pointer"
                              title={doc.name}
                            >
                              {doc.name}
                            </button>
                          )}
                          <span className="text-[10px] text-slate-400">v{doc.current_version}</span>
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">{typeLabel(t, doc.type)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_BADGE_CLASS[doc.status]}`}>
                            {statusLabel(t, doc.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">
                          <RelativeTime iso={doc.created_at} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <RelativeTime iso={doc.modified_at} />
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">{doc.created_by_name || '—'}</td>
                        <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">{formatBytes(doc.file_size)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => onOpen(doc.id)}
                              className="px-3 min-h-11 sm:min-h-8 rounded-lg text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-pointer"
                            >
                              {t('documents.action.open', 'Buka')}
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setRenaming({ id: doc.id, value: doc.name })}
                                  className={ICON_BUTTON}
                                  aria-label={`${t('documents.action.rename', 'Ganti nama')}: ${doc.name}`}
                                  title={t('documents.action.rename', 'Ganti nama')}
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleArchive(doc)}
                                  className={ICON_BUTTON}
                                  aria-label={`${doc.status === 'archived' ? t('documents.action.unarchive', 'Keluarkan dari arsip') : t('documents.action.archive', 'Arsipkan')}: ${doc.name}`}
                                  title={doc.status === 'archived' ? t('documents.action.unarchive', 'Keluarkan dari arsip') : t('documents.action.archive', 'Arsipkan')}
                                >
                                  {doc.status === 'archived' ? <ArchiveRestore className="w-3.5 h-3.5" aria-hidden /> : <Archive className="w-3.5 h-3.5" aria-hidden />}
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteDocument(doc)}
                                className={`${ICON_BUTTON} hover:!text-rose-600`}
                                aria-label={`${t('documents.action.delete', 'Hapus')}: ${doc.name}`}
                                title={t('documents.action.delete', 'Hapus')}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav
                aria-label={t('documents.pagination.label', 'Navigasi halaman')}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300"
              >
                <label className="flex items-center gap-1.5">
                  <span>{t('documents.pagination.per_page', 'Per halaman')}</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className={`${FIELD_CLASS} py-1`}
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{t('documents.pagination.summary', 'Halaman {page} dari {pages} · {total} dokumen', { page: data.page, pages: totalPages, total: data.total })}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 min-h-11 sm:min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {t('documents.pagination.previous', 'Sebelumnya')}
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 min-h-11 sm:min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {t('documents.pagination.next', 'Berikutnya')}
                  </button>
                </div>
              </nav>
            </>
          )}
        </section>
      </div>
    </section>
  );
};
