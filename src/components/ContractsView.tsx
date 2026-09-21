import React, { useState } from 'react';
import { Contract, Partner, InsertionOrder } from '../types';
import { formatMoney } from '../lib/currencyUtils';
import { ActionMenu } from './ui/action-menu';
import { TablePagination } from './ui/TablePagination';
import { getStatusBadgeClass } from './ui/badge';
import { getSavedColumnPreferences, saveColumnPreferences } from '../lib/tablePreferences';
import {
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileDown,
  Download,
  ChevronRight,
  ExternalLink,
  Edit2,
  Trash2,
  GitCommit,
  Tag,
  Link2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  X,
  Scale,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  canViewContract,
  canEditContract,
  canCreateContract,
  canDeletePartner,
} from '../lib/rbacScoping';
import { ContractRedliningModal } from './ContractRedliningModal';
import { usePermissions } from '../lib/permissions';

interface ContractsViewProps {
  contracts: Contract[];
  partners: Partner[];
    ios: InsertionOrder[];
  onAddContract: () => void;
  onEditContract: (contract: Contract) => void;
  onDeleteContract: (contractId: string) => void;
  onOpenAddendumModal: (contract: Contract) => void;
  onUpdateContractData?: (updatedContract: Contract) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  contracts,
  partners,
    ios,
  onAddContract,
  onEditContract,
  onDeleteContract,
  onOpenAddendumModal,
  onUpdateContractData,
}) => {
  const { user, isLegal, isAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { t, language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  
  const [selectedJenisDokumen, setSelectedJenisDokumen] = useState<string>('ALL');
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const [redliningContract, setRedliningContract] = useState<Contract | null>(null);

  // Categories list
  const allCategories = Array.from(
    new Set(contracts.flatMap((c) => c.kategori_kerjasama || []))
  );

  // Filter logic
  const filteredContracts = contracts.filter((c) => {
    // 1. Department Scoping & RBAC restriction (based on internal PIC of partner)
    if (!canViewContract(c, partners, user)) {
      return false;
    }

    const jenis = c.jenis_dokumen || 'Master Agreement';
    const matchJenis = selectedJenisDokumen === 'ALL' || jenis === selectedJenisDokumen;

    const matchSearch =
      c.nomor_kontrak.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.judul_kontrak.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.partner_nama && c.partner_nama.toLowerCase().includes(searchTerm.toLowerCase())) ||
      c.pic_internal.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.parent_contract_nomor && c.parent_contract_nomor.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchCategory =
      selectedCategory === 'ALL' || (c.kategori_kerjasama && c.kategori_kerjasama.includes(selectedCategory));

    const matchStatus = selectedStatus === 'ALL' || c.status === selectedStatus;

    return matchJenis && matchSearch && matchCategory && matchStatus;
  });

  type SortField = 'no' | 'partner' | 'doc_type' | 'value' | 'duration' | 'status' | 'document';
  type SortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const DEFAULT_CONTRACT_COLUMNS = {
    jenis_dokumen: false,
    nomor_kontrak: true,
    judul_kontrak: true,
    partner: true,
    kategori: false,
    nilai: true,
    tanggal_mulai: false,
    tanggal_selesai: false,
    status: true,
    file: false,
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    getSavedColumnPreferences('contracts', DEFAULT_CONTRACT_COLUMNS)
  );
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveColumnPreferences('contracts', next);
      return next;
    });
  };


  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortField(null);
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedContracts = React.useMemo(() => {
    if (!sortField) return filteredContracts;

    return [...filteredContracts].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      const getPartnerName = (c: Contract) => {
        const partnerObj = partners.find((p) => p.partner_id === c.partner_id);
        return c.partner_nama || partnerObj?.nama_partner || '';
      };

      switch (sortField) {
        case 'no':
          valA = a.nomor_kontrak;
          valB = b.nomor_kontrak;
          break;
        case 'partner':
          valA = getPartnerName(a);
          valB = getPartnerName(b);
          break;
        case 'doc_type':
          valA = `${a.jenis_dokumen || ''}_${(a.kategori_kerjasama || []).join(', ')}`;
          valB = `${b.jenis_dokumen || ''}_${(b.kategori_kerjasama || []).join(', ')}`;
          break;
        case 'value':
          valA = a.nilai_kontrak_usd ?? a.nilai_kontrak;
          valB = b.nilai_kontrak_usd ?? b.nilai_kontrak;
          break;
        case 'duration':
          valA = a.tanggal_selesai || a.tanggal_mulai || '';
          valB = b.tanggal_selesai || b.tanggal_mulai || '';
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
        case 'document':
          valA = a.link_file_kontrak || '';
          valB = b.link_file_kontrak || '';
          break;
        default:
          return 0;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      const res = String(valA || '').localeCompare(String(valB || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortOrder === 'asc' ? res : -res;
    });
  }, [filteredContracts, sortField, sortOrder, partners]);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(sortedContracts.map(item => item.contract_id));
    else setSelectedRows([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const totalPages = Math.ceil(sortedContracts.length / rowsPerPage);
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentContracts = sortedContracts.slice(indexOfFirst, indexOfLast);


  const renderSortHeader = (label: string, field: SortField) => {
    const isSorted = sortField === field;
    return (
      <th
        scope="col"
        aria-sort={isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
        className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left select-none align-middle"
      >
        <button
          type="button"
          onClick={() => handleSort(field)}
          className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5"
          title={`Urutkan berdasarkan ${label}`}
        >
          <span>{label}</span>
          {isSorted ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
        </button>
      </th>
    );
  };

  const handleExportCSV = () => {
    const headers = [
      'Jenis Dokumen',
      'Nomor Perjanjian',
      'Judul Perjanjian',
      'Induk Kontrak',
      'Partner',
      'Kategori Kerjasama',
      'Tanggal Mulai',
      'Tanggal Selesai',
      'Currency',
      'Nilai Kontrak',
      'Nilai Kontrak (USD)',
      'Status',
      'Sisa Hari',
      'PIC Internal',
      'Notice Period (Hari)',
      'Notice Type',
      'Link File / Drive',
    ];

    const rows = currentContracts.map((c) => {
      const partnerObj = partners.find((p) => p.partner_id === c.partner_id);
      const partnerName = c.partner_nama || partnerObj?.nama_partner || '-';
      return [
        c.jenis_dokumen || 'Master Agreement',
        c.nomor_kontrak,
        c.judul_kontrak,
        c.parent_contract_nomor || '-',
        partnerName,
        (c.kategori_kerjasama || []).join('; '),
        c.tanggal_mulai,
        c.tanggal_selesai,
        c.currency || 'IDR',
        c.nilai_kontrak,
        c.nilai_kontrak_usd ?? (c.currency === 'USD' ? c.nilai_kontrak : c.nilai_kontrak * 0.000062),
        c.status,
        c.sisa_hari !== undefined ? c.sisa_hari : '',
        c.pic_internal,
        c.notice_period_hari,
        c.notice_type_required,
        c.link_file_kontrak || '',
      ];
    });

    const csvLines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Export_Agreement_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: Contract['status']) => {
    return getStatusBadgeClass(status);
  };

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{t('contracts.title')}</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {hasPermission('export.csv') && (
            <button
              onClick={handleExportCSV}
              disabled={filteredContracts.length === 0}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-600 font-bold flex items-center transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Ekspor CSV"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor CSV</span>
            </button>
          )}

          {canCreateContract(user) && (
            <button
              onClick={onAddContract}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Tambah</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      {/* Search & Filters Bar - Justified Responsive Grid/Flex */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('contracts.search_placeholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>
          {/* Jenis Dokumen Filter */}
          <select
            value={selectedJenisDokumen}
            onChange={(e) => setSelectedJenisDokumen(e.target.value)}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('contracts.all_types')}</option>
            <option value="Master Agreement">Master Agreement</option>
            <option value="Agreement Addendum">Agreement Addendum</option>
          </select>
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('contracts.all_categories')}</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('contracts.all_status')}</option>
            <option value="Aktif">{t('contracts.active')}</option>
            <option value="Akan Berakhir">{t('contracts.expiring')}</option>
            <option value="Expired">{t('contracts.expired')}</option>
            <option value="Terminated">{t('contracts.terminated')}</option>
          </select>

          {/* Column Toggle */}
          <div className="relative flex-initial">
            <button
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              className="h-9 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.98] w-full"
              title="Pengaturan Tampilan Kolom"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>View</span>
            </button>
            {isViewMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsViewMenuOpen(false)}></div>
                <div className="absolute right-0 top-11 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-2 animate-in fade-in zoom-in-95">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 border-b border-slate-100 dark:border-slate-800">
                  Toggle Kolom
                </div>
                {Object.keys(visibleColumns).map((col) => {
                  let label = col;
                  if (col === 'jenis_dokumen') label = t('contracts.col_doc_type', 'Jenis Dokumen');
                  else if (col === 'nomor_kontrak') label = t('contracts.col_no', 'Nomor Kontrak');
                  else if (col === 'judul_kontrak') label = t('contracts.col_title', 'Judul Kontrak');
                  else if (col === 'partner') label = t('contracts.col_partner', 'Partner');
                  else if (col === 'kategori') label = t('contracts.col_category', 'Kategori');
                  else if (col === 'nilai') label = t('contracts.col_value', 'Nilai Kontrak');
                  else if (col === 'tanggal_mulai') label = t('contracts.col_start_date', 'Tanggal Mulai');
                  else if (col === 'tanggal_selesai') label = t('contracts.col_end_date', 'Tanggal Selesai');
                  else if (col === 'status') label = t('contracts.col_status', 'Status');
                  else if (col === 'file') label = t('contracts.col_document', 'File Dokumen');

                  return (
                    <label key={col} className="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns[col]}
                        onChange={() => toggleColumnVisibility(col)}
                        className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                      />
                      <span className="capitalize">{label.replace(/_/g, ' ')}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>

      {/* Contracts Data Table */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedRows.length > 0 && selectedRows.length === currentContracts.length}
                      aria-label={t('table.select_all', 'Pilih semua kontrak')}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </div>
                </th>
                {visibleColumns.jenis_dokumen && renderSortHeader(t('contracts.col_doc_type', 'Jenis'), 'doc_type')}
                {visibleColumns.nomor_kontrak && renderSortHeader(t('contracts.col_no', 'Agreement No.'), 'no')}
                {visibleColumns.judul_kontrak && (
                  <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_title', 'Judul')}</th>
                )}
                {visibleColumns.partner && renderSortHeader(t('contracts.col_partner', 'Partner'), 'partner')}
                {visibleColumns.kategori && (
                  <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_category', 'Kategori')}</th>
                )}
                {visibleColumns.nilai && renderSortHeader(t('contracts.col_value', 'Nilai'), 'value')}
                {visibleColumns.tanggal_mulai && (
                  <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_start_date', 'Tanggal Mulai')}</th>
                )}
                {visibleColumns.tanggal_selesai && (
                  <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_end_date', 'Tanggal Selesai')}</th>
                )}
                {visibleColumns.status && renderSortHeader(t('contracts.col_status', 'Status'), 'status')}
                {visibleColumns.file && (
                  <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_document', 'File')}</th>
                )}
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('contracts.col_action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {currentContracts.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-8 text-center text-xs text-slate-500">
                    {t('contracts.no_data')}
                  </td>
                </tr>
              ) : (
                currentContracts.map((ctr) => {
                  const isAddendum = ctr.jenis_dokumen === 'Agreement Addendum';
                  const childAddendums = contracts.filter(
                    (c) => c.jenis_dokumen === 'Agreement Addendum' && c.parent_contract_id === ctr.contract_id
                  );
                  const ctrIOs = ios.filter((i) => i.contract_id === ctr.contract_id);

                  return (
                    <tr key={ctr.contract_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="pl-6 pr-2 py-4 text-left align-middle">
                        <div className="flex items-center justify-start">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(ctr.contract_id)}
                            onChange={() => handleSelectRow(ctr.contract_id)}
                            aria-label={`Pilih kontrak ${ctr.nomor_kontrak}`}
                            className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          />
                        </div>
                      </td>

                      {/* Jenis Dokumen */}
                      {visibleColumns.jenis_dokumen && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                          {isAddendum ? (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Addendum')}`}>
                              Agreement Addendum
                            </span>
                          ) : (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Aktif')}`}>
                              Master Agreement
                            </span>
                          )}
                        </td>
                      )}
                      {/* Nomor Kontrak */}
                      {visibleColumns.nomor_kontrak && (
                        <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 text-left">
                          {ctr.nomor_kontrak}
                        </td>
                      )}
                      {/* Judul Kontrak */}
                      {visibleColumns.judul_kontrak && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left max-w-[200px]">
                          <span className="line-clamp-2" title={ctr.judul_kontrak}>{ctr.judul_kontrak}</span>
                        </td>
                      )}

                      {/* 2. Partner */}
                      {visibleColumns.partner && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">{ctr.partner_nama}</td>
                      )}

                      {/* Kategori */}
                      {visibleColumns.kategori && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                          <div className="flex flex-wrap gap-1">
                            {(ctr.kategori_kerjasama || []).map((cat) => (
                              <span
                                key={cat}
                                className={`text-xs font-normal px-2.5 py-0.5 rounded-full border whitespace-nowrap ${getStatusBadgeClass('Neutral')}`}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}
                      {/* Nilai */}
                      {visibleColumns.nilai && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                          {formatMoney(ctr.nilai_kontrak, ctr.currency || 'IDR')}
                        </td>
                      )}

                      {/* Tanggal Mulai */}
                      {visibleColumns.tanggal_mulai && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                          {new Date(ctr.tanggal_mulai).toLocaleDateString(language === 'EN' ? 'en-US' : 'id-ID', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </td>
                      )}
                      {/* Tanggal Selesai */}
                      {visibleColumns.tanggal_selesai && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                          {new Date(ctr.tanggal_berakhir).toLocaleDateString(language === 'EN' ? 'en-US' : 'id-ID', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </td>
                      )}

                      {/* Status */}
                      {visibleColumns.status && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                          <span
                            className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs ${getStatusBadge(
                              ctr.status
                            )}`}
                          >
                            {t(`status.${(ctr.status || '').toLowerCase().replace(' ', '_')}`, ctr.status)}
                          </span>
                        </td>
                      )}
                      {/* File */}
                      {visibleColumns.file && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                          {ctr.link_file_kontrak ? (
                            <a
                              href={ctr.link_file_kontrak}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#06C755] hover:text-[#048C3B] font-normal hover:underline"
                            >
                              <FileDown className="w-3.5 h-3.5" /> PDF
                            </a>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}

                      {/* 6. Aksi */}
                      <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                        <div className="flex items-center justify-end">
                          <ActionMenu
                            items={[
                              {
                                label: 'Detail',
                                icon: <ExternalLink className="w-3.5 h-3.5" />,
                                onClick: () => setDetailContract(ctr),
                              },
                              {
                                label: t('contracts.action_redline', 'Redlining'),
                                icon: <Scale className="w-3.5 h-3.5" />,
                                onClick: () => setRedliningContract(ctr),
                              },
                              ...(canEditContract(ctr, partners, user)
                                ? [
                                    {
                                      label: 'Edit',
                                      icon: <Edit2 className="w-3.5 h-3.5" />,
                                      onClick: () => onEditContract(ctr),
                                    },
                                  ]
                                : []),
                              ...(canDeletePartner(user)
                                ? [
                                    {
                                      label: 'Hapus',
                                      icon: <Trash2 className="w-3.5 h-3.5" />,
                                      onClick: () => onDeleteContract(ctr.contract_id),
                                      variant: 'danger' as const,
                                      dividerBefore: true,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          rowsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={(size) => {
            setRowsPerPage(size);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Contract Timeline Detail Modal */}
      {detailContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between shrink-0 bg-white dark:bg-slate-900">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#06C755]" />
                  <span>{detailContract.nomor_kontrak}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{detailContract.judul_kontrak}</p>
              </div>

              <button
                type="button"
                onClick={() => setDetailContract(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-[#F7F8FA] dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Jenis Dokumen:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {detailContract.jenis_dokumen || 'Master Agreement'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Partner:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {detailContract.partner_nama || partners.find((p) => p.partner_id === detailContract.partner_id)?.nama_partner || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Nilai Komersial:</span>
                  <span className="font-bold text-[#048C3B] dark:text-emerald-400">
                    {formatMoney(detailContract.nilai_kontrak, detailContract.currency || 'IDR')}
                    {(detailContract.currency || 'IDR') !== 'USD' && (
                      <span className="text-slate-500 dark:text-slate-400 text-xs font-mono ml-1.5 font-normal">
                        (≈ {formatMoney(detailContract.nilai_kontrak_usd, 'USD')})
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Kewajiban Notice Period:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {detailContract.notice_period_hari || 0} Hari ({detailContract.notice_type_required || '-'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Status Perpanjangan Auto:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {detailContract.auto_renewal ? 'Ya (Auto Renewal)' : 'Tidak (Manual Notice)'}
                  </span>
                </div>
                {detailContract.jenis_dokumen === 'Agreement Addendum' && detailContract.parent_contract_nomor && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Master Agreement Induk:</span>
                    <span className="font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                      {detailContract.parent_contract_nomor}
                    </span>
                  </div>
                )}
                {detailContract.internal_notes && (
                  <div className="col-span-1 md:col-span-2 bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-300 font-bold text-xs block mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#06C755]" />
                      Rangkuman / Internal Notes Kontrak:
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-line font-normal">
                      {detailContract.internal_notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Child Agreement Addendums */}
              {detailContract.jenis_dokumen !== 'Agreement Addendum' && (
                <div>
                  <h4 className="font-bold text-purple-700 dark:text-purple-400 mb-2.5 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>{t('contract.addendum_list', 'Daftar Agreement Addendum Turunan')}</span>
                  </h4>
                  {contracts.filter(
                    (c) => c.jenis_dokumen === 'Agreement Addendum' && c.parent_contract_id === detailContract.contract_id
                  ).length === 0 ? (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 dark:text-slate-500 text-center text-xs">
                      Belum ada Agreement Addendum turunan untuk kontrak induk ini.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contracts
                        .filter(
                          (c) => c.jenis_dokumen === 'Agreement Addendum' && c.parent_contract_id === detailContract.contract_id
                        )
                        .map((add) => (
                          <div
                            key={add.contract_id}
                            className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl flex items-center justify-between gap-3 hover:border-purple-300 dark:hover:border-purple-700/80 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-purple-950 dark:text-purple-200 block font-mono text-xs tracking-tight">{add.nomor_kontrak}</span>
                                {add.status && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700/50">
                                    {add.status}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-700 dark:text-slate-300 text-[11px] block mt-0.5 truncate">{add.judul_kontrak}</span>
                              <span className="text-slate-500 dark:text-slate-400 text-[10px] block mt-0.5">
                                {language === 'EN' ? 'Validity:' : 'Berlaku:'}{' '}
                                {add.tanggal_mulai ? new Date(add.tanggal_mulai).toLocaleDateString(language === 'EN' ? 'en-US' : 'id-ID') : '-'}{' '}
                                -{' '}
                                {add.tanggal_berakhir ? new Date(add.tanggal_berakhir).toLocaleDateString(language === 'EN' ? 'en-US' : 'id-ID') : '-'}
                              </span>
                            </div>
                            {add.link_file_kontrak && (
                              <a
                                href={add.link_file_kontrak}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60 hover:bg-purple-100 dark:hover:bg-purple-800/60 font-semibold text-xs transition-colors shrink-0 shadow-2xs"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </a>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Addendum Timeline (Track-Change) */}
              <div>
                <h4 className="font-bold text-indigo-700 dark:text-indigo-400 mb-2.5 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <GitCommit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Histori Perubahan (Amendment Track-Change)</span>
                </h4>

                {contracts.filter(
                  (a) => a.jenis_dokumen === 'Agreement Addendum' && a.parent_contract_id === detailContract.contract_id
                ).length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 dark:text-slate-500 text-center">
                    Belum ada addendum/amendment tercatat untuk kontrak ini.
                  </div>
                ) : (
                  <div className="space-y-3 relative border-l-2 border-indigo-200 dark:border-indigo-800/60 ml-3 pl-4 pt-1">
                    {contracts
                      .filter((a) => a.jenis_dokumen === 'Agreement Addendum' && a.parent_contract_id === detailContract.contract_id)
                      .map((add) => {
                        const fieldsChanged = Array.isArray(add.field_yang_berubah)
                          ? add.field_yang_berubah
                          : typeof add.field_yang_berubah === 'string' && (add.field_yang_berubah as string).trim().length > 0
                          ? (add.field_yang_berubah as string).split(',').map((s) => s.trim())
                          : [];

                        return (
                          <div key={add.contract_id} className="relative bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <span className="absolute -left-[23px] top-4 w-3 h-3 bg-indigo-600 dark:bg-indigo-500 rounded-full border-2 border-white dark:border-slate-900" />
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-indigo-900 dark:text-indigo-300 text-xs font-mono">{add.nomor_kontrak}</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {add.tanggal_mulai ? new Date(add.tanggal_mulai).toLocaleDateString(language === 'EN' ? 'en-US' : 'id-ID') : '-'}
                              </span>
                            </div>
                            {fieldsChanged.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {fieldsChanged.map((f) => (
                                  <span key={f} className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                    {f}
                                  </span>
                                ))}
                              </div>
                            )}
                            {add.ringkasan_perubahan && (
                              <p className="text-slate-700 dark:text-slate-200 text-xs leading-relaxed bg-white dark:bg-slate-900/90 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 font-mono text-[11px] whitespace-pre-wrap">
                                {add.ringkasan_perubahan}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Linked IOs */}
              <div>
                <h4 className="font-bold text-emerald-700 dark:text-emerald-400 mb-2.5 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Insertion Orders (IO) Turunan</span>
                </h4>

                {ios.filter((i) => i.contract_id === detailContract.contract_id).length === 0 ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 dark:text-slate-500 text-center text-xs">
                    Tidak ada IO turunan di bawah kontrak ini.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ios
                      .filter((i) => i.contract_id === detailContract.contract_id)
                      .map((io) => (
                        <div key={io.io_id} className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100 text-xs font-mono">{io.nomor_io}</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{io.judul_io}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">Rp {(Number(io.nilai_io) || 0).toLocaleString('id-ID')}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{io.pricing_model || 'Flat Fee'} • {io.charging_type || '-'}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setDetailContract(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-medium text-xs rounded-xl cursor-pointer transition-colors"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Contract Risk & Compliance Analyzer (AI Redlining Modal) */}
      <ContractRedliningModal
        isOpen={Boolean(redliningContract)}
        contract={redliningContract}
        onClose={() => setRedliningContract(null)}
        onUpdateContract={(updatedContract) => {
          setRedliningContract(updatedContract);
          onUpdateContractData?.(updatedContract);
        }}
      />
    </div>
  );
};
