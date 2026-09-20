import React, { useState, useRef } from 'react';
import { useLanguage, Language } from '../context/LanguageContext';
import {
  Download,
  Upload,
  RotateCcw,
  Search,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Edit2,
  Sparkles,
  Layers,
  X,
  Languages,
} from 'lucide-react';
import { TablePagination } from './ui/TablePagination';
import { getStatusBadgeClass } from './ui/badge';

interface UITextManagerModalProps {
  isOpen?: boolean;
  onClose: () => void;
}

export const UITextManagerModal: React.FC<UITextManagerModalProps> = ({ isOpen = true, onClose }) => {
  const {
    t,
    language,
    translations,
    customTranslations,
    exportToCSV,
    importFromCSV,
    resetCustomTranslations,
    updateSingleTranslation,
  } = useLanguage();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLang, setEditLang] = useState<Language>('ID');
  const [editValue, setEditValue] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Gather all keys
  const allKeys = Array.from(
    new Set([
      ...Object.keys(translations.ID),
      ...Object.keys(translations.EN),
      ...Object.keys(customTranslations.ID || {}),
      ...Object.keys(customTranslations.EN || {}),
    ])
  ).sort();

  // Extract unique modules
  const modules = Array.from(
    new Set(allKeys.map((k) => k.split('.')[0] || 'General'))
  ).sort();

  // Filter keys
  const filteredKeys = allKeys.filter((key) => {
    const mod = key.split('.')[0] || 'General';
    if (selectedModule !== 'ALL' && mod !== selectedModule) return false;

    if (!searchTerm) return true;

    const lowerSearch = searchTerm.toLowerCase();
    const valID = customTranslations.ID?.[key] || translations.ID?.[key] || '';
    const valEN = customTranslations.EN?.[key] || translations.EN?.[key] || '';

    return (
      key.toLowerCase().includes(lowerSearch) ||
      mod.toLowerCase().includes(lowerSearch) ||
      valID.toLowerCase().includes(lowerSearch) ||
      valEN.toLowerCase().includes(lowerSearch)
    );
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const totalPages = Math.ceil(filteredKeys.length / rowsPerPage);
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentKeys = filteredKeys.slice(indexOfFirst, indexOfLast);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = importFromCSV(content);
        if (result.success) {
          setNotice({
            type: 'success',
            message: `⚡ Berhasil mengimpor & memperbarui ${result.updatedCount} teks UI dari file CSV!`,
          });
        } else {
          setNotice({
            type: 'error',
            message: result.error || 'Gagal mengimpor file CSV.',
          });
        }
      }
    };
    reader.onerror = () => {
      setNotice({ type: 'error', message: 'Gagal membaca file CSV.' });
    };
    reader.readAsText(file, 'UTF-8');

    // Reset file input value
    e.target.value = '';
  };

  const handleStartEdit = (key: string, lang: Language) => {
    const current = customTranslations[lang]?.[key] || translations[lang]?.[key] || '';
    setEditingKey(key);
    setEditLang(lang);
    setEditValue(current);
  };

  const handleSaveEdit = () => {
    if (editingKey) {
      updateSingleTranslation(editingKey, editLang, editValue);
      setEditingKey(null);
      setNotice({ type: 'success', message: `Label untuk key '${editingKey}' (${editLang}) berhasil diperbarui.` });
    }
  };

  const handleReset = () => {
    if (window.confirm('Apakah Anda yakin ingin MERESET seluruh teks UI kembali ke pengaturan awal pabrik?')) {
      resetCustomTranslations();
      setNotice({ type: 'success', message: 'Seluruh teks UI berhasil direset ke standar sistem.' });
    }
  };

  const getModuleLabel = (mod: string) => {
    const map: Record<string, string> = {
      nav: 'Sidebar & Navigasi',
      header: 'Header & Profil',
      dashboard: 'Dashboard Utama',
      contracts: 'Manajemen Kontrak',
      io: 'Insertion Order (IO)',
      partners: 'Partner & Due Diligence',
      eval: 'Evaluasi Partner',
      amendments: 'Amendment & Addendum',
      notifications: 'Notifikasi & Reminder',
      admin: 'Akses Admin Whitelist',
      logs: 'Log Aktivitas Sesi',
      settings: 'Pengaturan Integration',
      hierarchy: 'Struktur Hierarki',
      login: 'Halaman Login / SSO',
      modals: 'Form & Dialog Modal',
      common: 'Tombol & Label Umum',
    };
    return map[mod] || mod.toUpperCase();
  };

  const totalCustomCount =
    Object.keys(customTranslations.ID || {}).length + Object.keys(customTranslations.EN || {}).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#06C755]" />
              <span>Struktur Teks UI & Ekspor / Impor CSV</span>
            </h3>
            {totalCustomCount > 0 && (
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {totalCustomCount} Custom Override Active
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportToCSV}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-[#EBFBF0] dark:hover:bg-emerald-950/60 hover:text-[#048C3B] dark:hover:text-emerald-300 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-[#E5E8EB] dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-[#06C755]" />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload CSV Hasil Revisi</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
            />

            {totalCustomCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                <span>Reset ke Default</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            <Languages className="w-4 h-4 text-emerald-500" />
            <span>Total Key Teks: <strong className="text-slate-800 dark:text-slate-200">{allKeys.length}</strong></span>
          </div>
        </div>

        {/* Notice Message */}
        {notice && (
          <div
            className={`px-6 py-3 border-b text-xs font-semibold flex items-center justify-between ${
              notice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{notice.message}</span>
            </div>
            <button
              onClick={() => setNotice(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={t('settings.search_ui_text', 'Cari kata kunci, ID key, atau teks UI...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none"
            />
          </div>

          <div>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none bg-slate-50 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">Semua Module ({allKeys.length})</option>
              {modules.map((mod) => (
                <option key={mod} value={mod}>
                  {getModuleLabel(mod)} ({allKeys.filter((k) => k.startsWith(mod + '.')).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Table Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/60">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="p-4 w-1/4">Key ID Teks</th>
                  <th className="p-4 w-1/6">Module</th>
                  <th className="p-4 w-1/4">Bahasa Indonesia (ID)</th>
                  <th className="p-4 w-1/4">English (EN)</th>
                  <th className="p-4 text-center w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredKeys.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                      Tidak ada data teks UI yang cocok dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  currentKeys.map((key) => {
                    const mod = key.split('.')[0] || 'General';
                    const customID = customTranslations.ID?.[key];
                    const customEN = customTranslations.EN?.[key];
                    const valID = customID !== undefined && customID !== '' ? customID : translations.ID?.[key] || '';
                    const valEN = customEN !== undefined && customEN !== '' ? customEN : translations.EN?.[key] || '';
                    const isCustom = Boolean(customID || customEN);

                    return (
                      <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 break-all">
                          {key}
                        </td>
                        <td className="py-4 px-4 text-left">
                          <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs ${getStatusBadgeClass('Neutral')}`}>
                            {getModuleLabel(mod)}
                          </span>
                        </td>

                        {/* ID Value Cell */}
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300">
                          {editingKey === key && editLang === 'ID' ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs border border-[#06C755] rounded-lg outline-none bg-white dark:bg-slate-800 font-normal text-slate-900 dark:text-slate-100"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveEdit}
                                className="p-1 bg-[#06C755] text-white rounded-lg hover:bg-[#05B34C] cursor-pointer shrink-0"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group">
                              <span className={customID ? 'font-medium text-[#06C755] dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}>
                                {valID}
                              </span>
                              <button
                                onClick={() => handleStartEdit(key, 'ID')}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#06C755] dark:hover:text-emerald-400 p-1 cursor-pointer transition-opacity shrink-0"
                                title="Edit langsung Bahasa Indonesia"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* EN Value Cell */}
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300">
                          {editingKey === key && editLang === 'EN' ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs border border-[#06C755] rounded-lg outline-none bg-white dark:bg-slate-800 font-normal text-slate-900 dark:text-slate-100"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveEdit}
                                className="p-1 bg-[#06C755] text-white rounded-lg hover:bg-[#05B34C] cursor-pointer shrink-0"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group">
                              <span className={customEN ? 'font-medium text-[#06C755] dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}>
                                {valEN}
                              </span>
                              <button
                                onClick={() => handleStartEdit(key, 'EN')}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#06C755] dark:hover:text-emerald-400 p-1 cursor-pointer transition-opacity shrink-0"
                                title="Edit langsung English"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Status Tag */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {isCustom ? (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs ${getStatusBadgeClass('Aktif')}`}>
                              CUSTOM
                            </span>
                          ) : (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs ${getStatusBadgeClass('Neutral')}`}>
                              DEFAULT
                            </span>
                          )}
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

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            <strong>Petunjuk:</strong> Ekspor CSV untuk mengunduh struktur teks lengkap, edit teks pada Excel/Google Sheets, lalu upload kembali file CSV tersebut di sini.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors"
          >
            Selesai & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
