import React, { useRef, useState } from 'react';
import { LANGUAGE_OPTIONS, useLanguage, type Language } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { AlertCircle, Check, Download, Edit2, FileSpreadsheet, Languages, RotateCcw, Search, Sparkles, Upload, X } from 'lucide-react';
import { TablePagination } from './ui/TablePagination';
import { getStatusBadgeClass } from './ui/badge';

interface UITextManagerModalProps {
  isOpen?: boolean;
  onClose: () => void;
}

const CODES: Language[] = ['ID', 'EN', 'ZH'];
const BADGE = 'text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs';

/** Built-in and customised UI texts in every language, with inline editing and CSV round-trip. */
export const UITextManagerModal: React.FC<UITextManagerModalProps> = ({ isOpen = true, onClose }) => {
  const { t, translations, customTranslations, exportToCSV, importFromCSV, resetCustomTranslations, updateSingleTranslation } =
    useLanguage();
  const confirmDialog = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [editing, setEditing] = useState<{ key: string; lang: Language; value: string } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const valueOf = (key: string, lang: Language) => {
    const custom = customTranslations[lang]?.[key];
    return custom !== undefined && custom !== '' ? custom : translations[lang]?.[key] || '';
  };
  const moduleOf = (key: string) => (key.includes('.') ? key.split('.')[0] : key.split('_')[0]) || 'General';
  const moduleLabel = (mod: string) => t(`ui_text.module.${mod}`, mod);

  const allKeys = Array.from(
    new Set(CODES.flatMap((code) => [...Object.keys(translations[code]), ...Object.keys(customTranslations[code] || {})])),
  ).sort();
  const modules = Array.from(new Set(allKeys.map(moduleOf))).sort();
  const search = searchTerm.trim().toLowerCase();
  const filteredKeys = allKeys.filter((key) => {
    const mod = moduleOf(key);
    if (selectedModule !== 'ALL' && mod !== selectedModule) return false;
    if (!search) return true;
    return [key, mod, moduleLabel(mod), ...CODES.map((code) => valueOf(key, code))].some((v) => v.toLowerCase().includes(search));
  });

  const totalPages = Math.ceil(filteredKeys.length / rowsPerPage);
  const currentKeys = filteredKeys.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const totalCustomCount = CODES.reduce((sum, code) => sum + Object.keys(customTranslations[code] || {}).length, 0);
  const languageName = (code: Language) => LANGUAGE_OPTIONS.find((o) => o.code === code)?.nativeName || code;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const result = importFromCSV(content);
      setNotice(
        result.success
          ? { type: 'success', message: t('ui_text.import_success', 'Berhasil mengimpor & memperbarui {n} teks UI dari file CSV.', { n: result.updatedCount }) }
          : { type: 'error', message: result.error || t('ui_text.import_failed', 'Gagal memproses file CSV.') },
      );
    };
    reader.onerror = () => setNotice({ type: 'error', message: t('ui_text.read_failed', 'Gagal membaca file CSV.') });
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    updateSingleTranslation(editing.key, editing.lang, editing.value);
    setNotice({
      type: 'success',
      message: t('ui_text.saved_label', 'Teks untuk key "{key}" ({lang}) berhasil diperbarui.', { key: editing.key, lang: languageName(editing.lang) }),
    });
    setEditing(null);
  };

  const handleReset = async () => {
    const ok = await confirmDialog({
      description: t('ui_text.reset_confirm', 'Reset seluruh teks UI ke pengaturan bawaan?'),
      tone: 'danger',
      confirmLabel: t('ui_text.reset_label', 'Reset'),
    });
    if (ok) {
      resetCustomTranslations();
      setNotice({ type: 'success', message: t('ui_text.reset_done', 'Seluruh teks UI berhasil dikembalikan ke bawaan sistem.') });
    }
  };

  const renderCell = (key: string, lang: Language) => {
    const custom = customTranslations[lang]?.[key];
    if (editing?.key === key && editing.lang === lang) {
      return (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveEdit();
          }}
        >
          <label className="sr-only" htmlFor={`ui-text-${key}-${lang}`}>
            {t('ui_text.edit_in', 'Edit dalam {lang}', { lang: languageName(lang) })}
          </label>
          <input
            id={`ui-text-${key}-${lang}`}
            type="text"
            lang={LANGUAGE_OPTIONS.find((o) => o.code === lang)?.htmlLang}
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
            className="w-full px-2.5 py-1 text-xs border border-[#06C755] rounded-lg outline-none bg-white dark:bg-slate-800 font-normal text-slate-900 dark:text-slate-100"
            autoFocus
          />
          <button
            type="submit"
            className="p-1 bg-[#06C755] text-white rounded-lg hover:bg-[#05B34C] cursor-pointer shrink-0"
            aria-label={t('common.save', 'Simpan')}
          >
            <Check className="w-3.5 h-3.5" aria-hidden />
          </button>
        </form>
      );
    }
    return (
      <div className="flex items-center justify-between gap-1 group">
        <span
          lang={LANGUAGE_OPTIONS.find((o) => o.code === lang)?.htmlLang}
          className={custom ? 'font-medium text-[#06C755] dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}
        >
          {valueOf(key, lang) || <em className="text-rose-600 dark:text-rose-400 not-italic">{t('ui_text.missing', '(belum diterjemahkan)')}</em>}
        </span>
        <button
          type="button"
          onClick={() => setEditing({ key, lang, value: valueOf(key, lang) })}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-400 hover:text-[#06C755] dark:hover:text-emerald-400 p-1 cursor-pointer transition-opacity shrink-0"
          aria-label={t('ui_text.edit_in', 'Edit dalam {lang}', { lang: languageName(lang) })}
          title={t('ui_text.edit_in', 'Edit dalam {lang}', { lang: languageName(lang) })}
        >
          <Edit2 className="w-3 h-3" aria-hidden />
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-text-manager-title"
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="ui-text-manager-title" className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#06C755]" aria-hidden />
              <span>{t('ui_text.title', 'Struktur Teks UI & Ekspor / Impor CSV')}</span>
            </h3>
            {totalCustomCount > 0 && (
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <Sparkles className="w-3 h-3" aria-hidden />
                {t('ui_text.custom_active', '{n} teks kustom aktif', { n: totalCustomCount })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Tutup')}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportToCSV}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-[#EBFBF0] dark:hover:bg-emerald-950/60 hover:text-[#048C3B] dark:hover:text-emerald-300 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-[#E5E8EB] dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-[#06C755]" aria-hidden />
              <span>{t('ui_text.export', 'Ekspor CSV')}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" aria-hidden />
              <span>{t('ui_text.import', 'Unggah CSV Hasil Revisi')}</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
            {totalCustomCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-500" aria-hidden />
                <span>{t('ui_text.reset_to_default', 'Kembalikan ke Bawaan')}</span>
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            <Languages className="w-4 h-4 text-emerald-500" aria-hidden />
            <span>{t('ui_text.total_keys', 'Total key teks: {n}', { n: allKeys.length })}</span>
          </div>
        </div>

        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={`px-6 py-3 border-b text-xs font-semibold flex items-center justify-between ${
              notice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden />
              )}
              <span>{notice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label={t('common.close', 'Tutup')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer text-xs"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        )}

        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" aria-hidden />
            <input
              type="search"
              aria-label={t('settings.search_ui_text', 'Cari kata kunci, ID key, atau teks UI...')}
              placeholder={t('settings.search_ui_text', 'Cari kata kunci, ID key, atau teks UI...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none"
            />
          </div>
          <select
            aria-label={t('ui_text.module_filter', 'Filter modul')}
            value={selectedModule}
            onChange={(e) => {
              setSelectedModule(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none bg-slate-50 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">{t('ui_text.all_modules', 'Semua modul ({n})', { n: allKeys.length })}</option>
            {modules.map((mod) => (
              <option key={mod} value={mod}>
                {moduleLabel(mod)} ({allKeys.filter((k) => moduleOf(k) === mod).length})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/60">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                <tr>
                  <th scope="col" className="p-4 w-1/5">{t('ui_text.col_key', 'Key teks')}</th>
                  <th scope="col" className="p-4 w-1/8">{t('ui_text.col_module', 'Modul')}</th>
                  {CODES.map((code) => (
                    <th key={code} scope="col" className="p-4 w-1/5">
                      {languageName(code)} ({LANGUAGE_OPTIONS.find((o) => o.code === code)?.label})
                    </th>
                  ))}
                  <th scope="col" className="p-4 text-center w-20">{t('ui_text.col_status', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredKeys.length === 0 ? (
                  <tr>
                    <td colSpan={CODES.length + 3} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                      {t('ui_text.no_match', 'Tidak ada teks UI yang cocok dengan pencarian.')}
                    </td>
                  </tr>
                ) : (
                  currentKeys.map((key) => {
                    const isCustom = CODES.some((code) => customTranslations[code]?.[key]);
                    return (
                      <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors align-top">
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 break-all">{key}</td>
                        <td className="py-4 px-4 text-left">
                          <span className={`${BADGE} ${getStatusBadgeClass('Neutral')}`}>{moduleLabel(moduleOf(key))}</span>
                        </td>
                        {CODES.map((code) => (
                          <td key={code} className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300">
                            {renderCell(key, code)}
                          </td>
                        ))}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <span className={`${BADGE} ${getStatusBadgeClass(isCustom ? 'Aktif' : 'Neutral')}`}>
                            {isCustom ? t('ui_text.status_custom', 'Kustom') : t('ui_text.status_default', 'Bawaan')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(n) => {
                setRowsPerPage(n);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t(
              'ui_text.hint',
              'Petunjuk: ekspor CSV untuk mengunduh semua teks (Indonesia, Inggris, Mandarin), edit di Excel / Google Sheets, lalu unggah kembali file CSV tersebut di sini.',
            )}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0"
          >
            {t('ui_text.done', 'Selesai & Tutup')}
          </button>
        </div>
      </div>
    </div>
  );
};
