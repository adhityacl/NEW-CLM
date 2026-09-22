import React, { useState } from 'react';
import { Partner, PartnerEvaluation, Contract } from '../types';
import { DateInput } from './DateInput';
import { XCircle, Clock, Filter, ClipboardCheck,
  Plus,
  Search,
  Download,
  Calendar,
  Building2,
  AlertCircle,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  Award,
  FileText,
  Calculator,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react';
import { ActionMenu } from './ui/action-menu';
import { TablePagination } from './ui/TablePagination';
import { getStatusBadgeClass } from './ui/badge';
import { getSavedColumnPreferences, saveColumnPreferences } from '../lib/tablePreferences';
import { getCachedAccessToken } from '../lib/googleAuthService';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { useAlertToast } from '../context/AlertToastContext';
import { usePermissions } from '../lib/permissions';

interface PartnerEvaluationViewProps {
  partners: Partner[];
  contracts?: Contract[];
  evaluations: PartnerEvaluation[];
  onRefreshData: () => void;
  userEmail?: string;
  userName?: string;
  userRole?: string;
}

export const computeScoreFromFields = (
  obligationTarget: string,
  incidentFreq: string,
  comm: string,
  pricing: string
): number => {
  let targetScore = 10;
  if (obligationTarget === 'Sangat baik' || obligationTarget === 'Met') targetScore = 30;
  else if (obligationTarget === 'Baik') targetScore = 20;
  else if (obligationTarget === 'Kurang baik' || obligationTarget === 'Not met') targetScore = 10;

  let incidentScore = 10;
  if (incidentFreq === 'Never') incidentScore = 20;
  else if (incidentFreq === 'Rare') incidentScore = 15;
  else if (incidentFreq === 'Frequent') incidentScore = 10;

  let commScore = 10;
  if (comm === 'Sangat baik' || comm === 'Good') commScore = 20;
  else if (comm === 'Baik') commScore = 15;
  else if (comm === 'Kurang baik' || comm === 'Poor/Needs Improvement') commScore = 10;

  let pricingScore = 10;
  if (pricing === 'Cheap') pricingScore = 30;
  else if (pricing === 'Moderate') pricingScore = 20;
  else if (pricing === 'Expensive') pricingScore = 10;

  return targetScore + incidentScore + commScore + pricingScore;
};

export const PartnerEvaluationView: React.FC<PartnerEvaluationViewProps> = ({
  partners,
  contracts = [],
  evaluations = [],
  onRefreshData,
  userEmail,
  userName,
  userRole,
}) => {
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const showAlert = useAlertToast();
  
  const DEFAULT_EVAL_COLUMNS = {
    vendor: true,
    target: true,
    skor: true,
    hasil: true,
    tanggal: true,
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    getSavedColumnPreferences('evaluations', DEFAULT_EVAL_COLUMNS)
  );
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveColumnPreferences('evaluations', next);
      return next;
    });
  };

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return new Date().getFullYear().toString();
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvaluationFilter, setSelectedEvaluationFilter] = useState<string>('ALL');
  const [selectedObligationTarget, setSelectedObligationTarget] = useState<string>('ALL');
  const filterStatus = selectedEvaluationFilter;
  const filterYear = selectedYear;

  const [showFormModal, setShowFormModal] = useState(false);
  const canCreateEvaluation = hasPermission('document.create');
  const canEditEvaluation = hasPermission('document.edit');
  const canDeleteEvaluation = hasPermission('document.delete');

  const handleInputNotReviewed = (item: PartnerEvaluation) => {
    if (!canCreateEvaluation) return;
    const newItem = { ...item, id: '', created_at: '', updated_at: '' };
    setEditingItem(newItem);
    setFormData({
      review_date: newItem.review_date || new Date().toISOString().split('T')[0],
      partner_id: newItem.partner_id || '',
      supplier_name: newItem.supplier_name || '',
      type_of_work: newItem.type_of_work || 'General Service',
      obligation_target: newItem.obligation_target || 'Kurang baik',
      incident_frequency: newItem.incident_frequency || 'Frequent',
      communication: newItem.communication || 'Kurang baik',
      pricing: newItem.pricing || 'Expensive',
      final_evaluation: newItem.final_evaluation === 'Not reviewed' ? 'Not recommended' : newItem.final_evaluation,
      notes: newItem.notes || ''
    });
    setShowFormModal(true);
  };

  const handleOpenEditModal = (item: PartnerEvaluation, mode?: any) => {
    if (!canEditEvaluation) return;
    setEditingItem(item);
    setFormData({
      review_date: item.review_date || new Date().toISOString().split('T')[0],
      partner_id: item.partner_id || '',
      supplier_name: item.supplier_name || '',
      type_of_work: item.type_of_work || 'General Service',
      obligation_target: item.obligation_target || 'Sangat baik',
      incident_frequency: item.incident_frequency || 'Never',
      communication: item.communication || 'Sangat baik',
      pricing: item.pricing || 'Moderate',
      final_evaluation: item.final_evaluation || 'Recommended',
      notes: item.notes || ''
    });
    setShowFormModal(true);
  };

  const [formData, setFormData] = useState<any>({
    review_date: new Date().toISOString().split('T')[0],
    partner_id: '',
    supplier_name: '',
    type_of_work: 'General Service',
    obligation_target: 'Sangat baik',
    incident_frequency: 'Never',
    communication: 'Sangat baik',
    pricing: 'Moderate',
    final_evaluation: 'Recommended',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    try {
      const isEdit = editingItem && editingItem.id && !editingItem.id.startsWith('NOT_REVIEWED');
      const url = isEdit ? `/api/partner-evaluations/${editingItem.id}` : '/api/partner-evaluations';
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        userEmail,
        userName,
        userRole,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Terjadi kesalahan saat menyimpan evaluasi.');
      }

      onRefreshData();
      setShowFormModal(false);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data.');
      console.warn(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateLiveBreakdown = () => {
    let tScore = 10;
    if (formData.obligation_target === 'Sangat baik' || formData.obligation_target === 'Met' || formData.obligation_target === 'Very Good') tScore = 30;
    else if (formData.obligation_target === 'Baik' || formData.obligation_target === 'Good') tScore = 20;

    let fScore = 10;
    if (formData.incident_frequency === 'Never') fScore = 20;
    else if (formData.incident_frequency === 'Rare') fScore = 15;

    let cScore = 10;
    if (formData.communication === 'Sangat baik' || formData.communication === 'Good' || formData.communication === 'Very Good') cScore = 20;
    else if (formData.communication === 'Baik') cScore = 15;

    let pScore = 10;
    if (formData.pricing === 'Cheap') pScore = 30;
    else if (formData.pricing === 'Moderate') pScore = 20;

    return {
      tScore,
      fScore,
      cScore,
      pScore,
      total: tScore + fScore + cScore + pScore
    };
  };

  const liveBreakdown = calculateLiveBreakdown();

  const [editingItem, setEditingItem] = useState<PartnerEvaluation | null>(null);
  const [viewingDetailItem, setViewingDetailItem] = useState<PartnerEvaluation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const availableYears = React.useMemo(() => {
    const currentYr = new Date().getFullYear().toString();
    const yrSet = new Set<string>([currentYr, '2026', '2025', '2024', '2023']);
    evaluations.forEach((e) => {
      if (e.review_date) {
        const yr = e.review_date.split('-')[0];
        if (yr && yr.length === 4) {
          yrSet.add(yr);
        }
      }
    });
    contracts.forEach((c) => {
      if (c.tanggal_mulai) {
        const yr = c.tanggal_mulai.split('-')[0];
        if (yr && yr.length === 4) yrSet.add(yr);
      }
      if (c.tanggal_berakhir && !c.tanggal_berakhir.toLowerCase().includes('unlimited')) {
        const yr = c.tanggal_berakhir.split('-')[0];
        if (yr && yr.length === 4) yrSet.add(yr);
      }
    });
    return Array.from(yrSet).sort((a, b) => Number(b) - Number(a));
  }, [evaluations, contracts]);

  const targetPartnersList = React.useMemo(() => {
    const selectedYrNum = Number(selectedYear);
    if (isNaN(selectedYrNum)) return partners;

    return partners.filter((p) => {
      const partnerContracts = contracts.filter((c) => c.partner_id === p.partner_id);

      if (partnerContracts.length > 0) {
        return partnerContracts.some((c) => {
          let startYr = 2023;
          if (c.tanggal_mulai) {
            const yr = parseInt(c.tanggal_mulai.split('-')[0], 10);
            if (!isNaN(yr)) startYr = yr;
          }

          const endStr = (c.tanggal_berakhir || '').toLowerCase().trim();
          const isUnlimited =
            !c.tanggal_berakhir ||
            endStr === '' ||
            endStr.includes('unlimited') ||
            endStr.includes('tanpa batas') ||
            endStr.includes('seumur hidup') ||
            c.auto_renewal;

          let endYr = Infinity;
          if (!isUnlimited && c.tanggal_berakhir) {
            const parsedEnd = parseInt(c.tanggal_berakhir.split('-')[0], 10);
            if (!isNaN(parsedEnd)) {
              endYr = parsedEnd;
            }
          }

          if (c.status === 'Terminated') {
            if (!isUnlimited && endYr !== Infinity) {
            } else if (c.updated_at) {
              const termYr = parseInt(c.updated_at.split('-')[0], 10);
              if (!isNaN(termYr)) endYr = termYr;
            } else if (c.tanggal_berakhir) {
              const parsedEnd = parseInt(c.tanggal_berakhir.split('-')[0], 10);
              if (!isNaN(parsedEnd)) endYr = parsedEnd;
            }
          }

          return selectedYrNum >= startYr && selectedYrNum <= endYr;
        });
      }

      return false;
    });
  }, [partners, contracts, selectedYear]);

  const combinedYearItems = React.useMemo(() => {
    const realEvalsInYear = evaluations.filter((e) => {
      if (!e.review_date) return false;
      const yr = e.review_date.split('-')[0];
      return yr === selectedYear;
    });

    const evaluatedPartnerIds = new Set(realEvalsInYear.map((e) => e.partner_id).filter(Boolean));
    const evaluatedPartnerNames = new Set(
      realEvalsInYear.map((e) => e.supplier_name.toLowerCase())
    );

    const unEvaluatedItems: PartnerEvaluation[] = targetPartnersList
      .filter((p) => {
        const hasById = evaluatedPartnerIds.has(p.partner_id);
        const hasByName = evaluatedPartnerNames.has(p.nama_partner.toLowerCase());
        return !hasById && !hasByName;
      })
      .map((p) => ({
        id: `NOT_REVIEWED_${p.partner_id}_${selectedYear}`,
        review_date: `${selectedYear}`,
        partner_id: p.partner_id,
        supplier_name: p.nama_partner,
        obligation_target: 'Kurang baik',
        incident_frequency: 'Frequent',
        communication: 'Kurang baik',
        pricing: 'Expensive',
        final_evaluation: 'Not reviewed' as const,
        notes: `Belum dilakukan evaluasi vendor untuk tahun ${selectedYear}.`,
        created_at: '',
        updated_at: '',
      }));

    return [...realEvalsInYear, ...unEvaluatedItems];
  }, [evaluations, targetPartnersList, selectedYear]);

  const filteredEvaluations = combinedYearItems.filter((item) => {
    const matchSearch =
      item.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.partner_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.notes.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter =
      selectedEvaluationFilter === 'ALL' || item.final_evaluation === selectedEvaluationFilter;
    const matchTarget =
      selectedObligationTarget === 'ALL' || item.obligation_target === selectedObligationTarget;
    return matchSearch && matchFilter && matchTarget;
  });

  type SortField = 'id' | 'review_date' | 'vendor' | 'cooperation' | 'criteria' | 'calculated_score' | 'final_eval';
  type SortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

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

  const sortedEvaluations = React.useMemo(() => {
    if (!sortField) return filteredEvaluations;

    return [...filteredEvaluations].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      const getScore = (item: PartnerEvaluation) =>
        item.final_evaluation === 'Not reviewed'
          ? -1
          : item.calculated_score !== undefined
          ? item.calculated_score
          : computeScoreFromFields(
              item.obligation_target,
              item.incident_frequency,
              item.communication,
              item.pricing
            );

      if (sortField === 'vendor') {
        valA = a.supplier_name;
        valB = b.supplier_name;
      } else if (sortField === 'calculated_score') {
        valA = getScore(a);
        valB = getScore(b);
      } else if (sortField === 'review_date') {
        valA = a.review_date;
        valB = b.review_date;
      } else if (sortField === 'final_eval') {
        valA = a.final_evaluation;
        valB = b.final_evaluation;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEvaluations, sortField, sortOrder]);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(sortedEvaluations.map(item => item.id || ''));
    else setSelectedRows([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const totalPages = Math.ceil(sortedEvaluations.length / rowsPerPage);
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentEvaluations = sortedEvaluations.slice(indexOfFirst, indexOfLast);

  const getEvalBadgeClass = (status: string) => {
    switch (status) {
      case 'Excellent': return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'Good': return 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'Fair': return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      case 'Poor': return 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800';
      case 'Not reviewed': return 'bg-slate-100 text-slate-500 border-slate-200 dark:border-slate-800 opacity-80';
      default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:border-slate-800';
    }
  };

  const getEvalDotClass = (status: string) => {
    switch (status) {
      case 'Excellent': return 'bg-emerald-500';
      case 'Good': return 'bg-blue-500';
      case 'Fair': return 'bg-amber-500';
      case 'Poor': return 'bg-rose-500';
      case 'Not reviewed': return 'bg-slate-400';
      default: return 'bg-slate-500';
    }
  };

  const getRelatedContractsCount = (pid: string | undefined) => {
    if (!pid) return 0;
    return contracts.filter((c) => c.partner_id === pid).length;
  };

  const handleDelete = async (id: string | undefined, name?: string) => {
    if (!canDeleteEvaluation) return;
    if (!id || id.startsWith('NOT_REVIEWED')) return;
    if (
      await confirmDialog({
        description: t('evaluation.delete_confirm', 'Hapus evaluasi ini?'),
        tone: 'danger',
      })
    ) {
      try {
        const res = await fetch(`/api/partner-evaluations/${id}?userEmail=${encodeURIComponent(userEmail || '')}&userName=${encodeURIComponent(userName || '')}&userRole=${encodeURIComponent(userRole || '')}`, { method: 'DELETE' });
        if (res.ok) {
          onRefreshData();
        } else {
          showAlert({ title: 'Gagal menghapus data evaluasi', variant: 'destructive' });
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };

  
  const handleExportCSV = () => {
    const headers = ['Tahun', 'Partner', 'Skor Akhir', 'Status Rekomendasi', 'Tanggal Review', 'Obligation Target', 'Incident Frequency', 'Comm & Price'];
    const rows = sortedEvaluations.map(c => [
      c.year,
      c.supplier_name,
      c.total_score,
      c.recommendation_status,
      c.review_date,
      c.obligation_target,
      c.incident_frequency,
      c.communication
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'partner_evaluation_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddNew = () => {
    if (!canCreateEvaluation) return;
    setEditingItem({
      id: '',
      year: new Date().getFullYear(),
      supplier_name: '',
      total_score: 0,
      recommendation_status: '',
      review_date: new Date().toISOString().split('T')[0],
      obligation_target: 'Sangat baik',
      incident_frequency: 'Never',
      communication: 'Sangat baik',
      pricing: 'Moderate',
      final_evaluation: 'Not reviewed',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setShowFormModal(true);
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

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <span>{t('eval.annual_title', 'Evaluasi Vendor Tahunan')}</span>
          </h2>
        </div>
        
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {hasPermission('export.csv') && (
            <button
              onClick={handleExportCSV}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-600 font-bold flex items-center transition-all shrink-0"
              title={t('eval.export_csv', 'Ekspor CSV')}
            >
              <Download className="w-4 h-4" />
              <span>{t('eval.export_csv', 'Ekspor CSV')}</span>
            </button>
          )}
          
          {canCreateEvaluation && (
            <button
              onClick={handleAddNew}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>{t('eval.add_btn', 'Tambah')}</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Filter Bar & View Toggle - Justified Responsive Grid/Flex */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {/* 1 Box Search */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('eval.search_placeholder', 'Cari vendor, reviewer, atau notes...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>

          {/* Filter 1: Tahun Review */}
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="2026">{t('eval.year_prefix', 'Tahun')} 2026</option>
            <option value="2025">{t('eval.year_prefix', 'Tahun')} 2025</option>
            <option value="2024">{t('eval.year_prefix', 'Tahun')} 2024</option>
            <option value="2023">{t('eval.year_prefix', 'Tahun')} 2023</option>
          </select>

          {/* Filter 2: Keputusan Rekomendasi */}
          <select
            value={selectedEvaluationFilter}
            onChange={(e) => {
              setSelectedEvaluationFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('eval.all_decisions', 'Semua Keputusan')}</option>
            <option value="Recommended">{t('eval.decision_recommended', 'Lanjutkan Kerjasama')}</option>
            <option value="Recommended with notes">{t('eval.decision_rec_notes', 'Tinjauan Khusus')}</option>
            <option value="Not recommended">{t('eval.decision_not_rec', 'Putuskan Kerjasama')}</option>
            <option value="Not reviewed">{t('eval.decision_not_reviewed', 'Belum Dinilai')}</option>
          </select>

          {/* Filter 3: Target Kewajiban */}
          <select
            value={selectedObligationTarget}
            onChange={(e) => {
              setSelectedObligationTarget(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('eval.all_obligation_targets', 'Semua Target Kewajiban')}</option>
            <option value="Sangat baik">{t('eval.opt_sangat_baik', 'Sangat baik')}</option>
            <option value="Baik">{t('eval.opt_baik', 'Baik')}</option>
            <option value="Kurang baik">{t('eval.opt_kurang_baik', 'Kurang baik')}</option>
          </select>

          {/* View Toggle */}
          <div className="relative flex-initial">
            <button
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              className="h-9 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.98] w-full"
              title={t('eval.view_settings', 'Pengaturan Tampilan Kolom')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{t('eval.view', 'View')}</span>
            </button>
            {isViewMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsViewMenuOpen(false)}></div>
                <div className="absolute right-0 top-11 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-2 animate-in fade-in zoom-in-95">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 border-b border-slate-100 dark:border-slate-800">
                  {t('eval.toggle_columns', 'Toggle Kolom')}
                </div>
                {Object.keys(visibleColumns).map((col) => {
                  let label = col;
                  if (col === 'vendor') label = t('eval.col_vendor', 'Partner');
                  else if (col === 'target') label = t('eval.col_target', 'Target Kewajiban');
                  else if (col === 'skor') label = t('eval.col_calculated_score', 'Skor');
                  else if (col === 'hasil') label = t('eval.col_recommendation', 'Hasil Rekomendasi');
                  else if (col === 'tanggal') label = t('eval.col_review_date', 'Tanggal Review');

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

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua evaluasi"
                      onChange={handleSelectAll}
                      checked={selectedRows.length > 0 && selectedRows.length === currentEvaluations.length}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </div>
                </th>
                {visibleColumns.vendor && (
                  <th scope="col" aria-sort={sortField === 'vendor' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">
                    <button type="button" onClick={() => handleSort('vendor')} className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5">
                      <span>{t('eval.col_vendor', 'Partner')}</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </th>
                )}
                {visibleColumns.target && <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('eval.col_target', 'Target Kewajiban')}</th>}
                {visibleColumns.skor && (
                  <th scope="col" aria-sort={sortField === 'calculated_score' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">
                    <button type="button" onClick={() => handleSort('calculated_score')} className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5">
                      <span>{t('eval.col_calculated_score', 'Skor')}</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </th>
                )}
                {visibleColumns.hasil && (
                  <th scope="col" aria-sort={sortField === 'final_eval' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">
                    <button type="button" onClick={() => handleSort('final_eval')} className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5">
                      <span>{t('eval.col_recommendation', 'Hasil Rekomendasi')}</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </th>
                )}
                {visibleColumns.tanggal && (
                  <th scope="col" aria-sort={sortField === 'review_date' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">
                    <button type="button" onClick={() => handleSort('review_date')} className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5">
                      <span>{t('eval.col_review_date', 'Tanggal Review')}</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </th>
                )}
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('eval.col_action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {currentEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-12 text-center text-slate-400">
                    {t('eval.no_data')} {selectedYear}.
                  </td>
                </tr>
              ) : (
                currentEvaluations.map((item) => {
                  const isNotReviewed = item.final_evaluation === 'Not reviewed';
                  const score =
                    item.calculated_score !== undefined
                      ? item.calculated_score
                      : computeScoreFromFields(
                          item.obligation_target,
                          item.incident_frequency,
                          item.communication,
                          item.pricing
                        );

                  const formatDisplayDate = (dateStr?: string) => {
                    if (!dateStr) return '-';
                    const clean = dateStr.trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
                      const [y, m, d] = clean.split('-');
                      return `${d}/${m}/${y}`;
                    }
                    if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(clean)) {
                      return clean.replace(/-/g, '/');
                    }
                    return clean;
                  };

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="pl-6 pr-2 py-4 text-left align-middle">
                        <div className="flex items-center justify-start">
                          <input
                            type="checkbox"
                            aria-label={`Pilih evaluasi ${item.supplier_name}`}
                            checked={selectedRows.includes(item.id)}
                            onChange={() => handleSelectRow(item.id)}
                            className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          />
                        </div>
                      </td>

                      {/* 1. Vendor */}
                      {visibleColumns.vendor && (
                        <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 text-left">
                          {item.supplier_name}
                        </td>
                      )}

                      {/* 2. Target Kewajiban */}
                      {visibleColumns.target && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left">
                          {isNotReviewed ? '-' : item.obligation_target}
                        </td>
                      )}

                      {/* 3. Skor */}
                      {visibleColumns.skor && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left">
                          {isNotReviewed ? (
                            <span className="text-slate-400 dark:text-slate-500">-</span>
                          ) : (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{score} / 100</span>
                          )}
                        </td>
                      )}

                      {/* 4. Hasil Rekomendasi */}
                      {visibleColumns.hasil && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                          {item.final_evaluation === 'Recommended' && (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Recommended')}`}>
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#06C755]" />
                              <span>{t('eval.status_rec', 'Recommended')}</span>
                            </span>
                          )}
                          {item.final_evaluation === 'Recommended with notes' && (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Recommended with notes')}`}>
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              <span>{t('eval.status_rec_notes', 'Recommended with notes')}</span>
                            </span>
                          )}
                          {item.final_evaluation === 'Not recommended' && (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Not recommended')}`}>
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span>{t('eval.status_not_rec', 'Not recommended')}</span>
                            </span>
                          )}
                          {isNotReviewed && (
                            <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Draft')}`}>
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{t('eval.status_not_reviewed', 'Belum Dinilai')}</span>
                            </span>
                          )}
                        </td>
                      )}

                      {/* 5. Tanggal Review */}
                      {visibleColumns.tanggal && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                          {formatDisplayDate(item.review_date)}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                        <div className="flex items-center justify-end">
                          {isNotReviewed ? (
                            canCreateEvaluation && (
                              <button
                                onClick={() => handleInputNotReviewed(item)}
                                className="px-3 py-1.5 bg-[#06C755] hover:bg-[#05B34C] text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs whitespace-nowrap"
                                title={`${t('eval.input_eval')} - ${item.supplier_name}`}
                              >
                                <Plus className="w-3.5 h-3.5 text-white" />
                                <span>{t('eval.input_eval')}</span>
                              </button>
                            )
                          ) : (
                            <ActionMenu
                              items={[
                                {
                                  label: t('eval.action_detail', 'Detail'),
                                  icon: <Award className="w-3.5 h-3.5" />,
                                  onClick: () => setViewingDetailItem(item),
                                },
                                canEditEvaluation && {
                                  label: t('eval.action_edit', 'Edit'),
                                  icon: <Edit2 className="w-3.5 h-3.5" />,
                                  onClick: () => handleOpenEditModal(item),
                                },
                                canDeleteEvaluation && {
                                  label: t('eval.action_delete', 'Hapus'),
                                  icon: <Trash2 className="w-3.5 h-3.5" />,
                                  onClick: () => handleDelete(item.id, item.supplier_name),
                                  variant: 'danger' as const,
                                  dividerBefore: true,
                                },
                              ].filter(Boolean)}
                            />
                          )}
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

      {/* FORM MODAL: Submit / Edit Evaluasi Tahunan Vendor */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <ClipboardCheck className="w-5 h-5 text-[#06C755]" />
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {editingItem?.id && !editingItem.id.startsWith('NOT_REVIEWED')
                      ? t('eval.modal_title_edit', 'Edit Evaluasi Partner')
                      : t('eval.modal_title_add', 'Form Evaluasi Partner')}
                  </h3>
                  {editingItem?.supplier_name && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{editingItem.supplier_name}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-900 dark:text-slate-100">
              {formError && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* BAGIAN 1: Informasi Dasar */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 font-black text-xs flex items-center justify-center shrink-0">
                    1
                  </span>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">{t('eval.section1')}</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tanggal Review */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('eval.review_date')} <span className="text-rose-500">*</span>
                    </label>
                    <DateInput
                      required
                      value={formData.review_date}
                      onChange={(val) => setFormData({ ...formData, review_date: val })}
                    />
                  </div>

                  {/* Supplier Name (Dropdown Tersinkron) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('eval.supplier_name')} <span className="text-rose-500">*</span>
                    </label>
                    {partners.length > 0 ? (
                      <select
                        required
                        value={formData.supplier_name}
                        onChange={(e) => {
                          const selectedPartnerName = e.target.value;
                          const found = partners.find((p) => p.nama_partner === selectedPartnerName);
                          setFormData({
                            ...formData,
                            supplier_name: selectedPartnerName,
                            partner_id: found ? found.partner_id : '',
                          });
                        }}
                        className="w-full py-2.5 px-3 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-[#06C755]"
                      >
                        <option value="" disabled>
                          {t('eval.select_partner_ph')}
                        </option>
                        {partners.map((p) => (
                          <option key={p.partner_id} value={p.nama_partner}>
                            {p.nama_partner} ({p.partner_id} - {p.jenis_partner})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-300">
                        {t('eval.no_partners_warning')}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BAGIAN 2: Kriteria Penilaian */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 font-black text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">{t('eval.section2')}</h3>
                  </div>
                </div>

                {/* Obligation / Target */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('eval.obligation_target')} <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { value: 'Sangat baik', label: t('eval.opt_sangat_baik'), points: `30 ${t('eval.points')}` },
                      { value: 'Baik', label: t('eval.opt_baik'), points: `20 ${t('eval.points')}` },
                      { value: 'Kurang baik', label: t('eval.opt_kurang_baik'), points: `10 ${t('eval.points')}` },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          formData.obligation_target === opt.value
                            ? 'bg-[#EBFBF0] dark:bg-emerald-950/50 border-[#06C755] dark:border-emerald-500 text-slate-900 dark:text-slate-100 font-bold shadow-2xs'
                            : 'bg-[#F7F8FA] dark:bg-slate-800/80 border-[#E5E8EB] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="obligation_target"
                            value={opt.value}
                            checked={formData.obligation_target === opt.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                obligation_target: e.target.value as any,
                              })
                            }
                            className="accent-[#06C755]"
                          />
                          <span className="text-xs">{opt.label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#048C3B] dark:text-emerald-300 bg-[#EBFBF0] dark:bg-emerald-950/60 border border-[#06C755]/30 dark:border-emerald-500/40 px-2 py-0.5 rounded-md">
                          {opt.points}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Incident Frequency */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('eval.incident_freq')} <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { value: 'Never', label: t('eval.opt_never'), points: `20 ${t('eval.points')}` },
                      { value: 'Rare', label: t('eval.opt_rare'), points: `15 ${t('eval.points')}` },
                      { value: 'Frequent', label: t('eval.opt_frequent'), points: `10 ${t('eval.points')}` },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          formData.incident_frequency === opt.value
                            ? 'bg-[#EBFBF0] dark:bg-emerald-950/50 border-[#06C755] dark:border-emerald-500 text-slate-900 dark:text-slate-100 font-bold shadow-2xs'
                            : 'bg-[#F7F8FA] dark:bg-slate-800/80 border-[#E5E8EB] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="incident_frequency"
                            value={opt.value}
                            checked={formData.incident_frequency === opt.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                incident_frequency: e.target.value as any,
                              })
                            }
                            className="accent-[#06C755]"
                          />
                          <span className="text-xs">{opt.label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#048C3B] dark:text-emerald-300 bg-[#EBFBF0] dark:bg-emerald-950/60 border border-[#06C755]/30 dark:border-emerald-500/40 px-2 py-0.5 rounded-md">
                          {opt.points}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Communication */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('eval.communication')} <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { value: 'Sangat baik', label: t('eval.opt_sangat_baik'), points: `20 ${t('eval.points')}` },
                      { value: 'Baik', label: t('eval.opt_baik'), points: `15 ${t('eval.points')}` },
                      { value: 'Kurang baik', label: t('eval.opt_kurang_baik'), points: `10 ${t('eval.points')}` },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          formData.communication === opt.value
                            ? 'bg-[#EBFBF0] dark:bg-emerald-950/50 border-[#06C755] dark:border-emerald-500 text-slate-900 dark:text-slate-100 font-bold shadow-2xs'
                            : 'bg-[#F7F8FA] dark:bg-slate-800/80 border-[#E5E8EB] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="communication"
                            value={opt.value}
                            checked={formData.communication === opt.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                communication: e.target.value as any,
                              })
                            }
                            className="accent-[#06C755]"
                          />
                          <span className="text-xs">{opt.label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#048C3B] dark:text-emerald-300 bg-[#EBFBF0] dark:bg-emerald-950/60 border border-[#06C755]/30 dark:border-emerald-500/40 px-2 py-0.5 rounded-md">
                          {opt.points}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('eval.pricing')} <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { value: 'Cheap', label: t('eval.opt_cheap'), points: `30 ${t('eval.points')}` },
                      { value: 'Moderate', label: t('eval.opt_moderate'), points: `20 ${t('eval.points')}` },
                      { value: 'Expensive', label: t('eval.opt_expensive'), points: `10 ${t('eval.points')}` },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          formData.pricing === opt.value
                            ? 'bg-[#EBFBF0] dark:bg-emerald-950/50 border-[#06C755] dark:border-emerald-500 text-slate-900 dark:text-slate-100 font-bold shadow-2xs'
                            : 'bg-[#F7F8FA] dark:bg-slate-800/80 border-[#E5E8EB] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="pricing"
                            value={opt.value}
                            checked={formData.pricing === opt.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                pricing: e.target.value as any,
                              })
                            }
                            className="accent-[#06C755]"
                          />
                          <span className="text-xs">{opt.label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#048C3B] dark:text-emerald-300 bg-[#EBFBF0] dark:bg-emerald-950/60 border border-[#06C755]/30 dark:border-emerald-500/40 px-2 py-0.5 rounded-md">
                          {opt.points}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* BAGIAN 3: Evaluasi Akhir & Catatan */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 font-black text-xs flex items-center justify-center shrink-0">
                    3
                  </span>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {t('eval.section3')}
                  </h3>
                </div>

                {/* Live Score Calculation Display */}
                <div className="p-4 bg-[#EBFBF0] dark:bg-emerald-950/30 border border-[#06C755]/30 dark:border-emerald-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-[#06C755] dark:text-emerald-400" />
                      <span className="text-xs font-extrabold text-[#048C3B] dark:text-emerald-300 uppercase tracking-wider">
                        {t('eval.calc_score_breakdown')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-[#06C755] text-white px-3 py-1 rounded-xl shadow-2xs">
                      <span className="text-xs font-semibold">Total:</span>
                      <span className="text-base font-black">{liveBreakdown.total}</span>
                      <span className="text-[10px] opacity-80">/ 100 {t('eval.points')}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-[#06C755]/20 dark:border-emerald-500/20">
                    <div className="p-2 bg-white/90 dark:bg-slate-800/90 rounded-lg border border-[#06C755]/20 dark:border-emerald-500/20">
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">Obligation / Target</span>
                      <span className="font-extrabold text-[#048C3B] dark:text-emerald-400">
                        {liveBreakdown.tScore} {t('eval.points')}
                      </span>
                    </div>
                    <div className="p-2 bg-white/90 dark:bg-slate-800/90 rounded-lg border border-[#06C755]/20 dark:border-emerald-500/20">
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">Incident Freq</span>
                      <span className="font-extrabold text-[#048C3B] dark:text-emerald-400">
                        {liveBreakdown.fScore} {t('eval.points')}
                      </span>
                    </div>
                    <div className="p-2 bg-white/90 dark:bg-slate-800/90 rounded-lg border border-[#06C755]/20 dark:border-emerald-500/20">
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">Communication</span>
                      <span className="font-extrabold text-[#048C3B] dark:text-emerald-400">
                        {liveBreakdown.cScore} {t('eval.points')}
                      </span>
                    </div>
                    <div className="p-2 bg-white/90 dark:bg-slate-800/90 rounded-lg border border-[#06C755]/20 dark:border-emerald-500/20">
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">Pricing</span>
                      <span className="font-extrabold text-[#048C3B] dark:text-emerald-400">
                        {liveBreakdown.pScore} {t('eval.points')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Final Evaluation Option */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('eval.col_final_eval')} <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        value: 'Recommended',
                        label: t('eval.status_rec'),
                        desc: t('eval.opt_rec_desc'),
                        activeClass: 'bg-[#EBFBF0] dark:bg-emerald-950/50 border-[#06C755] dark:border-emerald-500 text-slate-900 dark:text-slate-100',
                      },
                      {
                        value: 'Recommended with notes',
                        label: t('eval.rec_with_notes'),
                        desc: t('eval.opt_rec_notes_desc'),
                        activeClass: 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 dark:border-amber-500 text-slate-900 dark:text-slate-100',
                      },
                      {
                        value: 'Not recommended',
                        label: t('eval.status_not_rec'),
                        desc: t('eval.opt_not_rec_desc'),
                        activeClass: 'bg-rose-50 dark:bg-rose-950/50 border-rose-400 dark:border-rose-500 text-slate-900 dark:text-slate-100',
                      },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                          formData.final_evaluation === opt.value
                            ? `${opt.activeClass} font-bold shadow-2xs`
                            : 'bg-[#F7F8FA] dark:bg-slate-800/80 border-[#E5E8EB] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="final_evaluation"
                            value={opt.value}
                            checked={formData.final_evaluation === opt.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                final_evaluation: e.target.value as any,
                              })
                            }
                            className="accent-[#06C755]"
                          />
                          <span className="text-xs">{opt.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Notes / Alasan Evaluasi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('eval.notes_label')}
                  </label>
                  <textarea
                    rows={4}
                    placeholder={t('eval.notes_ph')}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full p-3 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-medium focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-[#06C755]"
                  />
                </div>
              </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">
                  {t('form.common.required_hint', 'Lengkapi semua kolom wajib (*) untuk menyimpan')}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {t('eval.btn_cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? t('eval.btn_saving')
                      : editingItem
                      ? t('eval.btn_update')
                      : t('eval.btn_submit')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL: View Single Evaluation Report */}
      {viewingDetailItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-[#06C755]" />
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {t('eval.detail_modal_title', 'Laporan Evaluasi Partner')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{viewingDetailItem.supplier_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDetailItem(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-800 dark:text-slate-200 flex-1">
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">
                    {t('eval.col_id_date')} ID
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{viewingDetailItem.id}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">
                    {t('eval.review_date')}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{viewingDetailItem.review_date}</span>
                </div>
              </div>

              <div className="p-3 bg-[#EBFBF0] dark:bg-emerald-950/40 rounded-xl border border-[#06C755]/30 dark:border-emerald-500/40 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#048C3B] dark:text-emerald-300 font-bold uppercase block">
                    {t('eval.col_calculated_score')}
                  </span>
                  <span className="text-xs text-[#048C3B] dark:text-emerald-300 font-semibold">{t('eval.auto_score_text')}</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-[#048C3B] dark:text-emerald-300">
                    {viewingDetailItem.calculated_score !== undefined
                      ? viewingDetailItem.calculated_score
                      : computeScoreFromFields(
                          viewingDetailItem.obligation_target,
                          viewingDetailItem.incident_frequency,
                          viewingDetailItem.communication,
                          viewingDetailItem.pricing
                        )}
                  </span>
                  <span className="text-xs font-semibold text-[#048C3B] dark:text-emerald-300"> / 100 {t('eval.points')}</span>
                </div>
              </div>

              <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex justify-between pb-1.5 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Obligation / Target</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {viewingDetailItem.obligation_target}
                  </span>
                </div>
                <div className="flex justify-between pb-1.5 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Incident Frequency</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {viewingDetailItem.incident_frequency}
                  </span>
                </div>
                <div className="flex justify-between pb-1.5 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Communication</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {viewingDetailItem.communication}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Pricing</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{viewingDetailItem.pricing}</span>
                </div>
              </div>

              <div className="pt-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block mb-1">
                  {t('eval.rec_result')}
                </span>
                <div className="font-bold">
                  {viewingDetailItem.final_evaluation === 'Recommended' && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#06C755]" />
                      <span>{t('eval.status_rec')}</span>
                    </span>
                  )}
                  {viewingDetailItem.final_evaluation === 'Recommended with notes' && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 inline-flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>{t('eval.status_rec_notes')}</span>
                    </span>
                  )}
                  {viewingDetailItem.final_evaluation === 'Not recommended' && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 inline-flex items-center gap-1.5">
                      <X className="w-3.5 h-3.5 text-rose-600" />
                      <span>{t('eval.status_not_rec')}</span>
                    </span>
                  )}
                </div>
              </div>

              {viewingDetailItem.notes && (
                <div className="p-3 bg-[#F7F8FA] rounded-xl border border-[#E5E8EB]">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                    {t('eval.notes_title')}
                  </span>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">
                    {viewingDetailItem.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 bg-[#F7F8FA] border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingDetailItem(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {t('eval.btn_close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
