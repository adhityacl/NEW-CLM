import React, { useState, useMemo } from 'react';
import { InsertionOrder, Contract, Partner } from '../types';
import { formatMoney } from '../lib/currencyUtils';
import { FileDown, FileSpreadsheet,
  Search,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  ExternalLink,
  Edit2,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  X,
  Building2,
  Eye,
  SlidersHorizontal,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  canViewIO,
  canEditIO,
  canCreateIO,
  canDeletePartner,
  isGlobalRole,
} from '../lib/rbacScoping';
import { cn } from '../lib/utils';
import { getStatusBadgeClass } from './ui/badge';
import { getSavedColumnPreferences, saveColumnPreferences } from '../lib/tablePreferences';
import { Button } from './ui/button';
import { ActionMenu } from './ui/action-menu';
import { TablePagination } from './ui/TablePagination';

interface IOViewProps {
  ios: InsertionOrder[];
  contracts: Contract[];
  partners: Partner[];
  onAddIO: () => void;
  onEditIO: (io: InsertionOrder) => void;
  onDeleteIO: (ioId: string) => void;
}

export const IOView: React.FC<IOViewProps> = ({
  ios,
  contracts,
  partners,
  onAddIO,
  onEditIO,
  onDeleteIO,
}) => {
  const { user, isLegal, isAdmin } = useAuth();
  const { t, language } = useLanguage();

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPricingModel, setSelectedPricingModel] = useState<string>('ALL');
  const [selectedChargingType, setSelectedChargingType] = useState<string>('ALL');

  // Row selection & Pagination State
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Sorting State
  type SortField = 'no' | 'judul' | 'partner' | 'pricing' | 'value' | 'duration' | 'status';
  type SortOrder = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Detail Modal State
  const [detailIO, setDetailIO] = useState<InsertionOrder | null>(null);

  // Action Menu State
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const DEFAULT_IO_COLUMNS = {
    nomor: true,
    judul: true,
    partner: true,
    kanal: true,
    nilai: true,
    model_pembayaran: false,
    skema_pembayaran: false,
    tanggal_mulai: false,
    tanggal_selesai: false,
    status: false,
    file: false,
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    getSavedColumnPreferences('io', DEFAULT_IO_COLUMNS)
  );
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveColumnPreferences('io', next);
      return next;
    });
  };

  // Filtering Logic
  const filteredIOs = useMemo(() => {
    return ios.filter((i) => {
      // 1. Department Scoping & RBAC restriction (based on internal PIC of partner)
      if (!canViewIO(i, partners, user)) {
        return false;
      }

      const matchSearch =
        searchTerm === '' ||
        i.nomor_io.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.judul_io.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.partner_nama && i.partner_nama.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (i.kanal_media && i.kanal_media.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus = selectedStatus === 'ALL' || i.status === selectedStatus;
      const matchPricing = selectedPricingModel === 'ALL' || (i.pricing_model || i.model_pembayaran) === selectedPricingModel;
      const matchCharging = selectedChargingType === 'ALL' || (i.charging_type || i.skema_pembayaran) === selectedChargingType;

      return matchSearch && matchStatus && matchPricing && matchCharging;
    });
  }, [ios, partners, user, searchTerm, selectedStatus, selectedPricingModel, selectedChargingType]);

  // Sorting Logic
  const sortedIOs = useMemo(() => {
    if (!sortField) return filteredIOs;

    return [...filteredIOs].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortField) {
        case 'no':
          valA = a.nomor_io || '';
          valB = b.nomor_io || '';
          break;
        case 'judul':
          valA = a.judul_io || '';
          valB = b.judul_io || '';
          break;
        case 'partner':
          valA = a.partner_nama || '';
          valB = b.partner_nama || '';
          break;
        case 'pricing':
          valA = a.pricing_model || a.model_pembayaran || '';
          valB = b.pricing_model || b.model_pembayaran || '';
          break;
        case 'value':
          valA = a.nilai_io || 0;
          valB = b.nilai_io || 0;
          break;
        case 'duration':
          valA = a.tanggal_berakhir || a.tanggal_selesai || a.tanggal_mulai || '';
          valB = b.tanggal_berakhir || b.tanggal_selesai || b.tanggal_mulai || '';
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
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
  }, [filteredIOs, sortField, sortOrder]);

  // Paginated Slices
  const pageCount = Math.ceil(sortedIOs.length / pageSize);
  const paginatedIOs = useMemo(() => {
    const start = pageIndex * pageSize;
    return sortedIOs.slice(start, start + pageSize);
  }, [sortedIOs, pageIndex, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else setSortField(null);
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

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
          className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5"
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
            <ArrowUpDown className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
          )}
        </button>
      </th>
    );
  };

  const isFiltered =
    searchTerm !== '' ||
    selectedStatus !== 'ALL' ||
    selectedPricingModel !== 'ALL' ||
    selectedChargingType !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedStatus('ALL');
    setSelectedPricingModel('ALL');
    setSelectedChargingType('ALL');
    setPageIndex(0);
  };

  // Row selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    if (checked) {
      const allIds = new Set(paginatedIOs.map((i) => i.io_id));
      setSelectedRowIds(allIds);
    } else {
      setSelectedRowIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllSelected =
    paginatedIOs.length > 0 && paginatedIOs.every((i) => selectedRowIds.has(i.io_id));

  // CSV Export
  const handleExportCSV = () => {
    const dataToExport =
      selectedRowIds.size > 0 ? ios.filter((i) => selectedRowIds.has(i.io_id)) : sortedIOs;

    const headers = [
      'Nomor IO',
      'Judul IO',
      'Induk Kontrak',
      'Partner / Vendor',
      'Kanal Media / Placement',
      'Pricing Model',
      'Charging Type',
      'Tanggal Mulai',
      'Tanggal Selesai',
      'Currency',
      'Nilai IO',
      'Status',
      'Deliverables',
      'Link File / Drive',
    ];

    const rows = dataToExport.map((i) => {
      return [
        i.nomor_io,
        i.judul_io,
        i.contract_id || '-',
        i.partner_nama || '-',
        i.kanal_media || '-',
        i.model_pembayaran || '-',
        i.skema_pembayaran || '-',
        i.tanggal_mulai,
        i.tanggal_berakhir || i.tanggal_selesai || '-',
        i.mata_uang || 'IDR',
        i.nilai_io,
        i.status,
        i.deliverables || '-',
        i.link_file_io || '',
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
    a.download = `Export_IO_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{t('io.title', 'Insertion Order Management')}</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={filteredIOs.length === 0}
            className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-600 font-bold flex items-center transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('io.export_csv', 'Ekspor CSV')}
          >
            <Download className="w-4 h-4" />
            <span>{t('io.export_csv', 'Ekspor CSV')}</span>
          </button>

          {user?.department && !isGlobalRole(user?.role) && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Dept: {user.department}</span>
            </div>
          )}

          {canCreateIO(user) && (
            <button
              onClick={onAddIO}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>{t('io.add_btn', 'Tambah')}</span>
            </button>
          )}
        </div>
      </div>

      {/* DataTable Toolbar - Justified Responsive Grid/Flex */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('io.search_ph', 'Cari insertion orders...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPageIndex(0);
              }}
              className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>

          {/* Simple Select Filter: Status */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('io.all_status', 'Semua Status')}</option>
            <option value="Berjalan">{t('io.status_berjalan', 'Berjalan')}</option>
            <option value="Selesai">{t('io.status_selesai', 'Selesai')}</option>
            <option value="Draft">{t('io.status_draft', 'Draft')}</option>
            <option value="Dibatalkan">{t('io.status_dibatalkan', 'Dibatalkan')}</option>
          </select>

          {/* Simple Select Filter: Pricing Model */}
          <select
            value={selectedPricingModel}
            onChange={(e) => setSelectedPricingModel(e.target.value)}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('io.all_pricing_models', 'Semua Model Pricing')}</option>
            <option value="CPM">CPM</option>
            <option value="CPC">CPC</option>
            <option value="Flat Fee">Flat Fee</option>
            <option value="Revenue Share">Revenue Share</option>
            <option value="Fixed Package">Fixed Package</option>
          </select>

          {/* Simple Select Filter: Charging Scheme */}
          <select
            value={selectedChargingType}
            onChange={(e) => setSelectedChargingType(e.target.value)}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('io.all_charging_types', 'Semua Skema Pembayaran')}</option>
            <option value="Prepaid">Prepaid</option>
            <option value="Postpaid">Postpaid</option>
            <option value="Milestone">Milestone</option>
          </select>

          {/* Reset Filters */}
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={resetFilters}
              className="h-9 px-2 lg:px-3 text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              {t('common.reset', 'Reset')}
              <X className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        
          {/* Column Toggle */}
          <div className="relative flex-initial">
            <button
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              className="h-9 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.98] w-full"
              title={t('io.view_settings', 'Pengaturan Tampilan Kolom')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{t('io.view', 'View')}</span>
            </button>
            {isViewMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsViewMenuOpen(false)}></div>
                <div className="absolute right-0 top-11 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-2 animate-in fade-in zoom-in-95">
                  <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 border-b border-slate-100 dark:border-slate-800">
                    {t('io.toggle_columns', 'Toggle Kolom')}
                  </div>
                  {Object.keys(visibleColumns)
                    .filter((col) => col !== 'detail_pembayaran')
                    .map((col) => {
                    let label = col;
                    if (col === 'nomor') label = t('io.col_no', 'Nomor IO');
                    else if (col === 'judul') label = t('io.col_title', 'Judul IO');
                    else if (col === 'partner') label = t('io.col_partner', 'Partner');
                    else if (col === 'kanal') label = t('io.col_channel', 'Kanal Media');
                    else if (col === 'nilai') label = t('io.col_value', 'Nilai Order');
                    else if (col === 'model_pembayaran') label = t('io.col_pricing_model', 'Model Pembayaran');
                    else if (col === 'skema_pembayaran') label = t('io.col_charging_type', 'Skema Pembayaran');
                    else if (col === 'tanggal_mulai') label = t('io.col_start_date', 'Tanggal Mulai');
                    else if (col === 'tanggal_selesai') label = t('io.col_end_date', 'Tanggal Selesai');
                    else if (col === 'status') label = t('io.col_status', 'Status');
                    else if (col === 'file') label = t('io.col_document', 'File PDF');

                    return (
                      <label key={col} className="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                        <input
                          type="checkbox"
                          checked={visibleColumns[col]}
                          onChange={() => toggleColumnVisibility(col)}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                        />
                        <span className="capitalize">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* DataTable Container */}
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
                      checked={isAllSelected}
                      aria-label={t('table.select_all', 'Pilih semua IO')}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </div>
                </th>
                {visibleColumns.nomor && renderSortHeader(t('io.col_no', 'No. IO'), 'no')}
                {visibleColumns.judul && renderSortHeader(t('io.col_title', 'Judul IO'), 'judul')}
                {visibleColumns.partner && renderSortHeader(t('io.col_partner', 'Partner'), 'partner')}
                {visibleColumns.kanal && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('io.col_channel', 'Kanal Media')}</span>
                  </th>
                )}
                {visibleColumns.model_pembayaran && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('io.col_pricing_model', 'Model')}</span>
                  </th>
                )}
                {visibleColumns.skema_pembayaran && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('io.col_charging_type', 'Skema')}</span>
                  </th>
                )}
                {visibleColumns.tanggal_mulai && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('io.col_start_date', 'Tgl Mulai')}</span>
                  </th>
                )}
                {visibleColumns.tanggal_selesai && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('io.col_end_date', 'Tgl Selesai')}</span>
                  </th>
                )}
                {visibleColumns.nilai && renderSortHeader(t('io.col_value', 'Nilai Order'), 'value')}
                {visibleColumns.status && renderSortHeader(t('io.col_status', 'Status'), 'status')}
                {visibleColumns.file && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('io.col_document', 'File')}</span>
                  </th>
                )}
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('io.col_action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedIOs.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-8 text-center text-xs text-slate-500">
                    {t('io.empty_filter_match', 'Tidak ada Insertion Order yang cocok dengan filter pencarian.')}
                  </td>
                </tr>
              ) : (
                paginatedIOs.map((io) => {
                  const isSelected = selectedRowIds.has(io.io_id);
                  return (
                    <tr
                      key={io.io_id}
                      className={cn(
                        'hover:bg-slate-50 transition-colors text-xs',
                        isSelected && 'bg-[#EBFBF0]/50'
                      )}
                    >
                      {/* Checkbox */}
                      <td className="pl-6 pr-2 py-4 text-left align-middle">
                        <div className="flex items-center justify-start">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(io.io_id)}
                            aria-label={`Pilih IO ${io.nomor_io}`}
                            className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          />
                        </div>
                      </td>
                      {/* Nomor IO */}
                      {visibleColumns.nomor && (
                        <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 text-left whitespace-nowrap">
                          {io.nomor_io}
                        </td>
                      )}
                      {/* Judul IO */}
                      {visibleColumns.judul && (
                        <td className="py-4 px-4 text-left text-xs font-normal text-slate-700">
                          <span
                            onClick={() => setDetailIO(io)}
                            className="hover:text-[#06C755] cursor-pointer"
                          >
                            {io.judul_io}
                          </span>
                        </td>
                      )}
                      {/* Partner */}
                      {visibleColumns.partner && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                          {io.partner_nama || '-'}
                        </td>
                      )}
                      {/* Kanal */}
                      {visibleColumns.kanal && (
                        <td className="py-4 px-4 text-slate-700 text-xs font-normal text-left">
                          {io.kanal_media || '-'}
                        </td>
                      )}
                      {/* Model Pembayaran */}
                      {visibleColumns.model_pembayaran && (
                        <td className="py-4 px-4 text-left text-xs font-normal text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {io.pricing_model || io.model_pembayaran || '-'}
                        </td>
                      )}
                      {/* Skema */}
                      {visibleColumns.skema_pembayaran && (
                        <td className="py-4 px-4 text-xs text-slate-700 dark:text-slate-300 text-left font-normal">
                          {io.skema_pembayaran || io.charging_type || '-'}
                        </td>
                      )}
                      {/* Tanggal Mulai */}
                      {visibleColumns.tanggal_mulai && (
                        <td className="py-4 px-4 text-xs text-slate-700 text-left font-normal whitespace-nowrap">
                          {io.tanggal_mulai || '-'}
                        </td>
                      )}
                      {/* Tanggal Selesai */}
                      {visibleColumns.tanggal_selesai && (
                        <td className="py-4 px-4 text-xs text-slate-700 text-left font-normal whitespace-nowrap">
                          {io.tanggal_berakhir || io.tanggal_selesai || '-'}
                        </td>
                      )}
                      {/* Nilai IO */}
                      {visibleColumns.nilai && (
                        <td className="py-4 px-4 text-left text-xs font-normal text-slate-700 whitespace-nowrap">
                          {formatMoney(io.nilai_io, io.mata_uang)}
                        </td>
                      )}
                      {/* Status */}
                      {visibleColumns.status && (
                        <td className="py-4 px-4 text-left text-xs font-normal text-slate-700 whitespace-nowrap">
                          <span
                            className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass(
                              io.status
                            )}`}
                          >
                            {io.status === 'Aktif' && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {io.status === 'Expired' && <Clock className="w-3.5 h-3.5" />}
                            <span>{io.status}</span>
                          </span>
                        </td>
                      )}
                      {/* File */}
                      {visibleColumns.file && (
                        <td className="py-4 px-4 text-left text-xs font-normal text-slate-700">
                          {io.link_file_io ? (
                            <a
                              href={io.link_file_io}
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
                      {/* Actions Menu */}
                      <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                        <div className="flex items-center justify-end">
                          <ActionMenu
                            items={[
                              {
                                label: t('io.action_detail', 'Detail'),
                                icon: <ExternalLink className="w-3.5 h-3.5" />,
                                onClick: () => setDetailIO(io),
                              },
                              ...(canEditIO(io, partners, user)
                                ? [
                                    {
                                      label: t('io.action_edit', 'Edit'),
                                      icon: <Edit2 className="w-3.5 h-3.5" />,
                                      onClick: () => onEditIO(io),
                                    },
                                  ]
                                : []),
                              ...(canDeletePartner(user)
                                ? [
                                    {
                                      label: t('io.action_delete', 'Hapus'),
                                      icon: <Trash2 className="w-3.5 h-3.5" />,
                                      onClick: () => onDeleteIO(io.io_id),
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
          currentPage={pageIndex + 1}
          totalPages={pageCount}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(page) => setPageIndex(page - 1)}
          onRowsPerPageChange={(size) => {
            setPageSize(size);
            setPageIndex(0);
          }}
        />
      </div>

      {/* Detail IO Modal Dialog */}
      {detailIO && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#06C755]" />
                  <span>{detailIO.nomor_io}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{detailIO.judul_io}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailIO(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#F7F8FA] dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">{t('io.detail_partner_label', 'Partner / Vendor:')}</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{detailIO.partner_nama || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">{t('io.detail_channel_label', 'Kanal Media Placement:')}</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{detailIO.kanal_media || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">{t('io.detail_total_value_label', 'Nilai Total IO:')}</span>
                  <span className="font-bold text-[#048C3B] dark:text-emerald-400 font-mono text-xs">
                    {formatMoney(detailIO.nilai_io, detailIO.mata_uang)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">{t('io.detail_pricing_scheme_label', 'Model Pembayaran & Skema:')}</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">
                    {detailIO.pricing_model || detailIO.model_pembayaran || '-'} • {detailIO.charging_type || detailIO.skema_pembayaran || '-'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('io.detail_deliverables_label', 'Deliverables & Lingkup Pekerjaan')}
                </label>
                <p className="text-slate-800 dark:text-slate-200 bg-[#F7F8FA] dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed font-mono text-xs whitespace-pre-line">
                  {detailIO.deliverables || t('io.detail_no_deliverables', 'Tidak ada catatan deliverables khusus.')}
                </p>
              </div>

              {detailIO.link_file_io && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => window.open(detailIO.link_file_io, '_blank')}
                    className="w-full py-2.5 px-4 bg-[#EBFBF0] dark:bg-emerald-950/50 text-[#048C3B] dark:text-emerald-400 hover:bg-[#06C755]/20 border border-[#06C755]/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{t('io.detail_open_drive', 'Buka Berkas IO di Google Drive')}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 bg-[#F7F8FA] dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setDetailIO(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {t('io.detail_close', 'Tutup Detail')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
