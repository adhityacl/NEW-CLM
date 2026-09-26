import React, { useState, useEffect } from 'react';
import { CONTRACT_STATUS_LABEL_KEY, DD_STATUS_LABEL_KEY, DOC_STATUS_LABEL_KEY } from '../lib/domainStatus';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { getCountryPack, localizeName } from '../lib/policy';

/** Country of incorporation, falling back to the legacy BHI flag (BHI = Indonesia). */
const partnerCountry = (p: Partner): string => p.country ?? (p.badan_hukum === 'BHI' ? 'ID' : '');
import { Partner, Contract, DDDokumenItem, PartnerEvaluation } from '../types';
import {
  MoreHorizontal,
  Building2,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  ExternalLink,
  ShieldCheck,
  Edit2,
  FileCheck2,
  FileText,
  FileDown,
  Download,
  Filter,
  Trash2,
  ClipboardCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  X,
  Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { useDepartments } from '../hooks/useDepartments';
import {
  canViewPartner,
  canEditPartner,
  canCreatePartner,
  canDeletePartner,
  isGlobalRole,
} from '../lib/rbacScoping';
import { PartnerEvaluationView } from './PartnerEvaluationView';
import { TablePagination } from './ui/TablePagination';
import { ActionMenu } from './ui/action-menu';
import { getStatusBadgeClass } from './ui/badge';
import { getSavedColumnPreferences, saveColumnPreferences } from '../lib/tablePreferences';
import { UploadDDModal } from './UploadDDModal';
import { getAuthHeaders } from '../App';
import { usePermissions } from '../lib/permissions';

export function getValidPartnerTags(tags?: string[]): string[] {
  if (!tags || !Array.isArray(tags)) return ['Advertising'];
  const valid = tags.filter((t) => t && typeof t === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(t.trim()));
  return valid.length > 0 ? valid : ['Advertising'];
}

interface PartnersViewProps {
  partners: Partner[];
  contracts?: Contract[];
  evaluations?: PartnerEvaluation[];
  onRefreshData?: () => void;
  initialSubTab?: 'list' | 'evaluation';
  onAddPartner: () => void;
  onEditPartner: (partner: Partner) => void;
  onDeletePartner: (id: string, name: string) => void;
  onUploadDDDoc?: (partnerId: string, docName: string) => void;
}

export const PartnersView: React.FC<PartnersViewProps> = ({
  partners,
  contracts = [],
  evaluations = [],
  onRefreshData,
  initialSubTab = 'list',
  onAddPartner,
  onEditPartner,
  onDeletePartner,
  onUploadDDDoc,
}) => {
  const { hasPermission } = usePermissions();
  const { isLegal, user } = useAuth();
  const { t, language } = useLanguage();
  const confirmDialog = useConfirm();
  const { departments: ENTERPRISE_DEPARTMENTS } = useDepartments();
  const [subTab, setSubTab] = useState<'list' | 'evaluation'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDDStatus, setSelectedDDStatus] = useState<string>('ALL');
  const [selectedBadanHukum, setSelectedBadanHukum] = useState<string>('ALL');
  const { policy } = useTenantSettings();
  const homeCountry = policy.settings.countryCode;
  const countryLabel = (code: string) => (code ? `${code} · ${getCountryPack(code).code === code ? localizeName(getCountryPack(code).name, language) : code}` : t('common.unknown', 'Unknown'));
  const [selectedPartnerStatus, setSelectedPartnerStatus] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedPartnerDetail, setSelectedPartnerDetail] = useState<Partner | null>(null);
  const [uploadModalState, setUploadModalState] = useState<{
    partner: Partner;
    docName: string;
  } | null>(null);

  type SortField = 'channel' | 'name' | 'tags' | 'status' | 'pic' | 'status_dd';
  type SortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  // Key order is both the Toggle Kolom menu order and the table's column order.
  const DEFAULT_PARTNER_COLUMNS = {
    nama_partner: true,
    channel: false,
    badan_hukum: true,
    kategori: false,
    pic: true,
    email: false,
    telepon: false,
    status: true,
    due_diligence: true,
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    getSavedColumnPreferences('partners', DEFAULT_PARTNER_COLUMNS)
  );
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveColumnPreferences('partners', next);
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

  const getPartnerActiveContractsCount = (partnerId: string): number => {
    if (!contracts || contracts.length === 0) return 0;
    return contracts.filter(
      (c) => c.partner_id === partnerId && (c.status === 'Active' || c.status === 'Expiring')
    ).length;
  };

  const getPartnerStatus = (partnerId: string): 'Active' | 'Inactive' => {
    return getPartnerActiveContractsCount(partnerId) > 0 ? 'Active' : 'Inactive';
  };

  const filteredPartners = partners.filter((p) => {
    // 1. Department Scoping & RBAC restriction (based on internal_pic)
    if (!canViewPartner(p, user)) {
      return false;
    }

    const partnerTags = getValidPartnerTags(p.tags);
    const pCountry = partnerCountry(p);

    const matchSearch =
      p.nama_partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.codename && p.codename.toLowerCase().includes(searchTerm.toLowerCase())) ||
      countryLabel(pCountry).toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pic_partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.pic_internal && p.pic_internal.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.partner_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      partnerTags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchStatus = selectedDDStatus === 'ALL' || p.status_dd === selectedDDStatus;
    const matchBadanHukum =
      selectedBadanHukum === 'ALL' ||
      (selectedBadanHukum === 'DOMESTIC' && pCountry === homeCountry) ||
      (selectedBadanHukum === 'FOREIGN' && pCountry !== homeCountry) ||
      pCountry === selectedBadanHukum;

    const pStatus = getPartnerStatus(p.partner_id);
    const matchPartnerStatus =
      selectedPartnerStatus === 'ALL' || pStatus === selectedPartnerStatus;

    const matchDepartment =
      selectedDepartment === 'ALL' ||
      Boolean(p.pic_internal && p.pic_internal.toLowerCase() === selectedDepartment.toLowerCase());

    return matchSearch && matchStatus && matchBadanHukum && matchPartnerStatus && matchDepartment;
  });

  const sortedPartners = React.useMemo(() => {
    if (!sortField) return filteredPartners;

    return [...filteredPartners].sort((a, b) => {
      let valA = '';
      let valB = '';

      switch (sortField) {
        case 'channel':
          valA = (a.codename || a.partner_id || '').toLowerCase();
          valB = (b.codename || b.partner_id || '').toLowerCase();
          break;
        case 'name':
          valA = (a.nama_partner || '').toLowerCase();
          valB = (b.nama_partner || '').toLowerCase();
          break;
        case 'tags':
          valA = getValidPartnerTags(a.tags).join(', ').toLowerCase();
          valB = getValidPartnerTags(b.tags).join(', ').toLowerCase();
          break;
        case 'status':
          valA = getPartnerStatus(a.partner_id).toLowerCase();
          valB = getPartnerStatus(b.partner_id).toLowerCase();
          break;
        case 'pic':
          valA = (a.nama_pic || a.pic_partner || '').toLowerCase();
          valB = (b.nama_pic || b.pic_partner || '').toLowerCase();
          break;
        case 'status_dd':
          valA = (a.status_dd || '').toLowerCase();
          valB = (b.status_dd || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPartners, sortField, sortOrder, contracts]);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(sortedPartners.map(item => item.partner_id));
    else setSelectedRows([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const totalPages = Math.ceil(sortedPartners.length / rowsPerPage);
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentPartners = sortedPartners.slice(indexOfFirst, indexOfLast);

  const getDDStatusBadge = (status: Partner['status_dd']) => {
    return getStatusBadgeClass(status);
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
          className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5"
          title={t('partners.urutkan_berdasarkan', 'Urutkan berdasarkan {label}', { label })}
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
    if (currentPartners.length === 0) return;

    const headers = [
      'ID Partner',
      'Nama Partner',
      'Status Partner',
      'Kontrak Aktif',
      'Country',
      'Tags',
      'PIC & Kontak',
      'Status Due Diligence',
      'Progres DD (%)',
      'Dokumen Wajib Terisi',
      'Total Dokumen Wajib',
      'Tanggal Verifikasi DD',
      'Link Folder Drive',
      'Catatan Legal',
    ];

    const rows = currentPartners.map((p) => {
      const wajibDocs = p.daftar_dokumen_dd.filter((d) => d.wajib);
      const adaWajib = wajibDocs.filter((d) => d.status === 'Available');
      const totalDocs = p.daftar_dokumen_dd.length || 1;
      const adaDocs = p.daftar_dokumen_dd.filter((d) => d.status === 'Available').length;
      const progress = wajibDocs.length > 0
        ? Math.round((adaWajib.length / wajibDocs.length) * 100)
        : Math.round((adaDocs / totalDocs) * 100);

      const pTags = getValidPartnerTags(p.tags).join('; ');
      const pStatus = getPartnerStatus(p.partner_id);
      const activeContractsCount = getPartnerActiveContractsCount(p.partner_id);

      return [
        p.partner_id,
        `"${(p.nama_partner || '').replace(/"/g, '""')}"`,
        `"${pStatus}"`,
        `${activeContractsCount}`,
        `"${partnerCountry(p)}"`,
        `"${pTags.replace(/"/g, '""')}"`,
        `"${(p.pic_partner || '').replace(/"/g, '""')}"`,
        `"${(p.status_dd || '').replace(/"/g, '""')}"`,
        `${progress}%`,
        `${wajibDocs.length > 0 ? adaWajib.length : adaDocs}`,
        `${wajibDocs.length > 0 ? wajibDocs.length : totalDocs}`,
        p.tanggal_dd_diverifikasi || '-',
        `"${(p.link_folder_dd || '').replace(/"/g, '""')}"`,
        `"${(p.catatan || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Master_Partner_Due_Diligence_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteDDFile = async (partnerId: string, docName: string, fileId: string) => {
    const ok = await confirmDialog({ description: t('partners.hapus_file_ini_dari_dokumen', 'Hapus file ini dari dokumen {docName}?', { docName }), tone: 'danger', confirmLabel: t('io.action_delete', 'Hapus') });
    if (!ok) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/dd-file`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          docName,
          fileId,
          userEmail: user?.email,
          userName: user?.name,
          userRole: user?.role,
        }),
      });
      const data = await res.json();
      if (data.partner) {
        setSelectedPartnerDetail(data.partner);
        onRefreshData?.();
      }
    } catch (err) {
      console.error('Error deleting DD file:', err);
    }
  };

  return (
    <div className="space-y-6">
      {subTab === 'evaluation' ? (
        <PartnerEvaluationView
          partners={partners}
          contracts={contracts}
          evaluations={evaluations}
          onRefreshData={onRefreshData || (() => {})}
          userEmail={user?.email}
          userName={user?.name}
          userRole={user?.role}
        />
      ) : (
        <>
          {/* Header */}
          <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                <span>{t('partners.header_title', 'Manajemen Partner')}</span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {hasPermission('export.csv') && (
                <button
                  onClick={handleExportCSV}
                  disabled={filteredPartners.length === 0}
                  className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-600 font-bold flex items-center transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('contracts.export_csv', 'Ekspor CSV')}
                >
                  <Download className="w-4 h-4" />
                  <span>{t('contracts.export_csv', 'Ekspor CSV')}</span>
                </button>
              )}

              {canCreatePartner(user) && (
                <button
                  onClick={onAddPartner}
                  className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0"
                >
                  <Plus className="w-4 h-4 text-white" />
                  <span>{t('io.add_btn', 'Tambah')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar & View Toggle - Justified Responsive Grid/Flex */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 mb-6">
            <div className="flex flex-wrap items-center gap-2.5 w-full">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder={t('partners.search_placeholder')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
                />
              </div>

              {/* Partner Status Filter (Aktif / Nonaktif) */}
              <select
                value={selectedPartnerStatus}
                onChange={(e) => {
                  setSelectedPartnerStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
              >
                <option value="ALL">{t('partners.all_status')}</option>
                <option value="Active">{t('partners.active')}</option>
                <option value="Nonaktif">{t('partners.inactive')}</option>
              </select>

              {/* DD Status Filter */}
              <select
                value={selectedDDStatus}
                onChange={(e) => {
                  setSelectedDDStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
              >
                <option value="ALL">{t('partners.all_dd_status')}</option>
                <option value="Complete">{t('partners.dd_complete')}</option>
                <option value="Incomplete">{t('partners.dd_incomplete')}</option>
                <option value="Expired">{t('partners.dd_expired')}</option>
              </select>

              {/* Country of incorporation filter */}
              <select
                aria-label={t('partners.country_filter', 'Country of incorporation')}
                value={selectedBadanHukum}
                onChange={(e) => {
                  setSelectedBadanHukum(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
              >
                <option value="ALL">{t('partners.all_legal_entity')}</option>
                <option value="DOMESTIC">{t('partners.domestic', 'Domestic')}</option>
                <option value="FOREIGN">{t('partners.foreign', 'Foreign')}</option>
                {Array.from(new Set(partners.map(partnerCountry).filter(Boolean))).sort().map((code) => (
                  <option key={code} value={code}>{countryLabel(code)}</option>
                ))}
              </select>

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
                    <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 border-b border-slate-100 dark:border-slate-800">
                      {t('io.toggle_columns', 'Toggle Kolom')}
                    </div>
                    {Object.keys(visibleColumns).map((col) => {
                      let label = col;
                      if (col === 'nama_partner') label = t('partners.col_name', 'Nama Partner');
                      else if (col === 'channel') label = t('partners.col_channel', 'Nama Channel');
                      else if (col === 'badan_hukum') label = t('partners.col_entity', 'Badan Hukum');
                      else if (col === 'kategori') label = t('partners.col_category', 'Kategori Kerjasama');
                      else if (col === 'pic') label = t('partners.col_pic', 'PIC Partner');
                      else if (col === 'email') label = t('partners.col_email', 'Email');
                      else if (col === 'telepon') label = t('partners.col_phone', 'Telepon');
                      else if (col === 'status') label = t('partners.col_status', 'Status Partner');
                      else if (col === 'due_diligence') label = t('partners.col_dd_status', 'Status Due Diligence');

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

          {/* Partners List: TABLE VIEW */}
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
                            checked={selectedRows.length > 0 && selectedRows.length === currentPartners.length}
                            aria-label={t('partners.select_all', 'Pilih semua partner')}
                            className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          />
                        </div>
                      </th>
                      {visibleColumns.nama_partner && renderSortHeader(t('partners.col_name', 'Nama Partner'), 'name')}
                      {visibleColumns.channel && renderSortHeader(t('partners.col_channel', 'Nama Channel'), 'channel')}
                      {visibleColumns.badan_hukum && <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('partners.col_entity', 'Badan Hukum')}</th>}
                      {visibleColumns.kategori && renderSortHeader(t('partners.col_category', 'Kategori Kerjasama'), 'tags')}
                      {visibleColumns.pic && renderSortHeader(t('partners.col_pic', 'PIC Partner'), 'pic')}
                      {visibleColumns.email && <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('partners.col_email', 'Email')}</th>}
                      {visibleColumns.telepon && <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('partners.col_phone', 'Telepon')}</th>}
                      {visibleColumns.status && renderSortHeader(t('partners.col_status', 'Status Partner'), 'status')}
                      {visibleColumns.due_diligence && renderSortHeader(t('partners.col_dd_status', 'Status DD'), 'status_dd')}
                      <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                        <div className="flex items-center justify-end">
                          {t('partners.col_action', 'Aksi')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
                    {currentPartners.length === 0 ? (
                      <tr>
                        <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-8 text-center text-xs text-slate-500">
                          {t('partners.no_data')}
                        </td>
                      </tr>
                    ) : (
                      currentPartners.map((partner) => {
                        const pStatus = getPartnerStatus(partner.partner_id);

                        return (
                          <tr key={partner.partner_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="pl-6 pr-2 py-4 text-left align-middle">
                              <div className="flex items-center justify-start">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.includes(partner.partner_id)}
                                  onChange={() => handleSelectRow(partner.partner_id)}
                                  aria-label={t('partners.pilih', 'Pilih {nama_partner}', { nama_partner: partner.nama_partner })}
                                  className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                                />
                              </div>
                            </td>

                            {/* 1. Nama Partner */}
                            {visibleColumns.nama_partner && (
                              <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 text-left">
                                {partner.nama_partner}
                              </td>
                            )}

                            {visibleColumns.channel && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left">
                                {partner.codename || '—'}
                              </td>
                            )}

                            {/* 2. Country */}
                            {visibleColumns.badan_hukum && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                                <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs ${getStatusBadgeClass(partnerCountry(partner) === homeCountry ? 'BHI' : 'BHA')}`}>
                                  {partnerCountry(partner) || '—'}
                                </span>
                              </td>
                            )}

                            {visibleColumns.kategori && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left">
                                {getValidPartnerTags(partner.tags).length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {getValidPartnerTags(partner.tags).map((tag) => (
                                      <span key={tag} className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 whitespace-nowrap">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}

                            {/* 3. PIC Partner */}
                            {visibleColumns.pic && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                                {partner.nama_pic || partner.pic_partner || '-'}
                              </td>
                            )}

                            {visibleColumns.email && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                                {partner.email_pic ? (
                                  <a href={`mailto:${partner.email_pic}`} className="hover:underline hover:text-[#06C755]">
                                    {partner.email_pic}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}

                            {visibleColumns.telepon && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                                {partner.telepon_pic ? (
                                  <a href={`tel:${partner.telepon_pic.replace(/[^\d+]/g, '')}`} className="hover:underline hover:text-[#06C755]">
                                    {partner.telepon_pic}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}

                            {/* 4. Status Partner */}
                            {visibleColumns.status && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                                {pStatus === 'Active' ? (
                                  <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Aktif')}`}>
                                    <span>{t('status.aktif', 'Aktif')}</span>
                                  </span>
                                ) : (
                                  <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Inactive')}`}>
                                    <span>{t('status.nonaktif', 'Nonaktif')}</span>
                                  </span>
                                )}
                              </td>
                            )}

                            {/* 5. Status Due Diligence */}
                            {visibleColumns.due_diligence && (
                              <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left">
                                <button
                                  onClick={() => setSelectedPartnerDetail(partner)}
                                  className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 transition-all hover:scale-105 hover:shadow-xs cursor-pointer ${getDDStatusBadge(
                                    partner.status_dd
                                  )}`}
                                  title={t('partners.klik_untuk_audit_checklist_due_diligence', 'Klik untuk Audit Checklist Due Diligence')}
                                >
                                  {partner.status_dd === 'Complete' && <CheckCircle2 className="w-3.5 h-3.5 text-[#06C755]" />}
                                  {partner.status_dd === 'Incomplete' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                                  {partner.status_dd === 'Expired' && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                                  <span>{t(DD_STATUS_LABEL_KEY[partner.status_dd] || 'status.dd_incomplete', partner.status_dd)}</span>
                                </button>
                              </td>
                            )}

                            {/* Aksi */}
                            <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                              <div className="flex items-center justify-end">
                                <ActionMenu
                                  items={[
                                    {
                                      label: t('partners.audit_dd', 'Audit DD'),
                                      icon: <FileCheck2 className="w-3.5 h-3.5" />,
                                      onClick: () => setSelectedPartnerDetail(partner),
                                    },
                                    ...(canEditPartner(partner, user)
                                      ? [
                                          {
                                            label: t('hierarchy.edit_btn', 'Edit'),
                                            icon: <Edit2 className="w-3.5 h-3.5" />,
                                            onClick: () => onEditPartner(partner),
                                          },
                                        ]
                                      : []),
                                    ...(canDeletePartner(user)
                                      ? [
                                          {
                                            label: t('io.action_delete', 'Hapus'),
                                            icon: <Trash2 className="w-3.5 h-3.5" />,
                                            onClick: () => onDeletePartner(partner.partner_id, partner.nama_partner),
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

      {/* Due Diligence Audit Modal */}
      {selectedPartnerDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#06C755]" />
                  <span>{selectedPartnerDetail.nama_partner}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('partners.status_dd', 'Status DD:')} <strong className="text-slate-800">{selectedPartnerDetail.status_dd}</strong> {t('partners.pic', '• PIC: {pic_partner}', { pic_partner: selectedPartnerDetail.pic_partner })}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPartnerDetail(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Due Diligence Narrative Profile */}
              {selectedPartnerDetail.catatan && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-1.5 shadow-2xs">
                  <h4 className="text-xs font-bold text-[#048C3B] dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#06C755]" />
                    <span>{t('partners.profil_due_diligence_operasional_vendor_senior', 'Profil Due Diligence & Operasional Vendor (Senior Risk Analyst)')}</span>
                  </h4>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                    {selectedPartnerDetail.catatan}
                  </p>
                </div>
              )}

              {/* Checklist Items List with Upload Trigger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    {t('partners.req_docs_title', 'Dokumen Due Diligence')}
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {t('partners.nda_bersifat_wajib_dokumen_lain_opsional', '* NDA bersifat Wajib, dokumen lain Opsional')}
                  </span>
                </div>

                {(selectedPartnerDetail.daftar_dokumen_dd || []).map((doc) => {
                  const docFiles = doc.files && doc.files.length > 0
                    ? doc.files
                    : doc.linkDrive
                    ? [
                        {
                          id: 'legacy_' + doc.nama,
                          fileName: `${doc.nama}.pdf`,
                          linkDrive: doc.linkDrive,
                          uploadedAt: doc.uploadedAt || '',
                          year: doc.uploadedAt ? new Date(doc.uploadedAt).getFullYear().toString() : '',
                          tanggalKadaluarsa: doc.tanggalKadaluarsa,
                        },
                      ]
                    : [];

                  return (
                    <div
                      key={doc.nama}
                      className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{doc.nama}</span>
                          
                          {/* Wajib / Opsional Pill Badge (Refined) */}
                          {doc.wajib ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                              {t('settings.region.dd_required', 'Wajib')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                              {t('contract_creator.optional_badge', 'Opsional')}
                            </span>
                          )}

                          {/* Status Ada / Belum / Kadaluarsa Pill Badge */}
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              doc.status === 'Available'
                                ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : doc.status === 'Expired'
                                ? 'border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                : 'border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {t(DOC_STATUS_LABEL_KEY[doc.status] || 'status.doc_missing', doc.status)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setUploadModalState({
                                partner: selectedPartnerDetail,
                                docName: doc.nama,
                              });
                            }}
                            className="px-3 py-1.5 bg-[#06C755] hover:bg-[#05B34C] text-white rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{t('partners.upload_file', 'Upload File')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Multiple Files list for this DD Requirement */}
                      {docFiles.length > 0 && (
                        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                          {docFiles.map((f, fIdx) => (
                            <div
                              key={f.id || fIdx}
                              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-lg flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {f.fileName || `${doc.nama}.pdf`}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {f.linkDrive && (
                                  <a
                                    href={f.linkDrive}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-[#048C3B] dark:text-emerald-300 rounded text-[11px] font-medium transition-colors flex items-center gap-1 border border-emerald-500/30"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>{t('partners.view_file', 'Lihat File')}</span>
                                  </a>
                                )}
                                {isLegal && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDDFile(selectedPartnerDetail.partner_id, doc.nama, f.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                    title={t('partners.hapus_file_ini', 'Hapus file ini')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-[#F7F8FA] border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedPartnerDetail(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {t('partners.audit_done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Due Diligence Document to Vendor's Drive Modal */}
      {uploadModalState && (
        <UploadDDModal
          partner={uploadModalState.partner}
          docName={uploadModalState.docName}
          isOpen={true}
          onClose={() => setUploadModalState(null)}
          onSuccess={(updatedPartner) => {
            setSelectedPartnerDetail(updatedPartner);
            onRefreshData?.();
          }}
          getAuthHeaders={getAuthHeaders}
          userEmail={user?.email}
          userName={user?.name}
          userRole={user?.role}
        />
      )}
        </>
      )}
    </div>
  );
};
