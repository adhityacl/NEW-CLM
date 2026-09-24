import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../lib/currencyUtils';
import { Contract, InsertionOrder } from '../types';
import {
  GitCommit,
  Search,
  Plus,
  FileDown,
  Calendar,
  Layers,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface AmendmentsViewProps {
  contracts: Contract[];
  ios: InsertionOrder[];
  onOpenAddendumModal: (parentItem?: Contract | InsertionOrder) => void;
}

export const AmendmentsView: React.FC<AmendmentsViewProps> = ({
  contracts,
  ios,
  onOpenAddendumModal,
}) => {
  const { isLegal } = useAuth();
  const { t, language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'Contract' | 'IO'>('ALL');

  const amendments = contracts.filter(c => c.jenis_dokumen === 'Agreement Addendum');
  
  const filteredAmendments = amendments.filter((a) => {
    const matchSearch =
      a.nomor_kontrak.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.parent_contract_nomor && a.parent_contract_nomor.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.ringkasan_perubahan || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchType = filterType === 'ALL' || (filterType === 'Contract' ? true : false); // Since they are now all Contracts, or IOs. But actually, if they are IO addendums, they might still be stored as Contracts. 

    return matchSearch && matchType;
  });

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <span>{t('amendments.title')}</span>
          </h2>
        </div>

        {isLegal && (
          <button
            onClick={() => onOpenAddendumModal()}
            className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Tambah</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 transition-colors">
        <div className="flex flex-1 flex-wrap items-center gap-2 w-full">
          <div className="relative flex-1 min-w-[200px] md:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('amendments.search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="h-9 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[140px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2313192B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('amendments.filter_all')}</option>
            <option value="Contract">{t('amendments.filter_contract')}</option>
            <option value="IO">{t('amendments.filter_io')}</option>
          </select>
        </div>
      </div>

      {/* Amendments List */}
      <div className="space-y-4">
        {filteredAmendments.length === 0 ? (
          <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center text-slate-400 dark:text-slate-500 text-xs">
            {t('amendments.no_data')}
          </div>
        ) : (
          filteredAmendments.map((add) => (
            <div
              key={add.contract_id || add.addendum_id}
              className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs hover:border-[#06C755]/50 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#EBFBF0] dark:bg-emerald-950/40 text-[#06C755] dark:text-emerald-400 rounded-xl">
                    <GitCommit className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{add.nomor_kontrak || add.nomor_addendum}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                      <span>{t('amendments.parent_doc')} ({add.parent_type || 'Contract'}):</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-mono">{add.parent_contract_nomor || add.parent_nomor || add.parent_contract_id || add.parent_id}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                    {t('amendments.date')} {new Date(add.tanggal_mulai || add.tanggal_addendum).toLocaleDateString(getActiveFormattingLocale())}
                  </span>
                  {(add.link_file_kontrak || add.link_file_addendum) && (
                    <a
                      href={add.link_file_kontrak || add.link_file_addendum}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5 text-[#06C755]" />
                      <span>{t('amendments.pdf_btn')}</span>
                    </a>
                  )}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('amendments.changed_elements')}</span>
                  {(Array.isArray(add.field_yang_berubah) ? add.field_yang_berubah : []).map((f) => (
                    <span
                      key={f}
                      className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-[10px] font-bold px-2 py-0.5 rounded"
                    >
                      {f}
                    </span>
                  ))}
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono text-xs leading-relaxed">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-sans font-bold uppercase mb-1">
                    {t('amendments.summary_label')}
                  </span>
                  {add.ringkasan_perubahan}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
