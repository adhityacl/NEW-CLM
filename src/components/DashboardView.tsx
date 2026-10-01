import { AlphabeticalSelect } from './ui/alphabetical-select';
import { DashboardOverview } from './DashboardOverview';
import { RecentDocumentsTable } from './RecentDocumentsTable';
import { buildSpendingSeries, contractTotalInCurrency } from '../lib/dashboardMetrics';
import { useMediaQuery } from '../hooks/useMediaQuery';
import React, { useState, useMemo, useEffect } from 'react';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { convertToUsdWithFallback, getActiveFormattingLocale, getDefaultUsdRate } from '../lib/currencyUtils';
import { Contract, InsertionOrder, Partner, NotificationLog, PartnerSpending } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
  canViewPartner,
  canViewContract,
  canViewIO,
  canViewSpending,
} from '../lib/rbacScoping';
import { getSavedCategories } from '../lib/categoryUtils';
import { getStatusBadgeClass } from './ui/badge';
import { parseMonthStr, parseAllMonths, formatMonthTagDisplay } from '../lib/monthUtils';
import { NewsTicker } from './NewsTicker';
import { documentsApi, errorMessage } from '../lib/documentsApi';
import { formatDateTime, type DocumentSummary } from '../lib/documentModel';
import { typeLabel } from './documents/documentLabels';
import {
  FileText,
  FileSpreadsheet,
  AlertTriangle,
  Building2,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Bell,
  Calendar,
  DollarSign,
  TrendingUp,
  GitFork,
  FileClock,
} from 'lucide-react';
import {
  BarChart,
  CartesianGrid,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface DashboardViewProps {
  contracts: Contract[];
  ios: InsertionOrder[];
  partners: Partner[];
  spendings?: PartnerSpending[];
  notifications: NotificationLog[];
  onNavigateTab: (tab: string) => void;
  onSelectContract: (contract: Contract) => void;
  onSelectPartner: (partner: Partner) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  contracts,
  ios,
  partners,
  spendings = [],
  notifications,
  onNavigateTab,
  onSelectContract,
  onSelectPartner,
}) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isCompactChart = useMediaQuery('(max-width: 639px)');

  // Get time-based dynamic greeting
  const getGreetingText = () => {
    const currentHour = new Date().getHours();
    let greetingKey = 'greeting.morning';
    if (currentHour >= 5 && currentHour < 12) {
      greetingKey = 'greeting.morning';
    } else if (currentHour >= 12 && currentHour < 15) {
      greetingKey = 'greeting.afternoon';
    } else if (currentHour >= 15 && currentHour < 18) {
      greetingKey = 'greeting.evening';
    } else {
      greetingKey = 'greeting.night';
    }

    const greetingWord = t(greetingKey, 'Selamat Datang');
    const userName = user?.name?.trim() || 'Admin';
    return `${greetingWord}, ${userName}`;
  };

  // Documents awaiting review, for the "Pending Review" table below
  const [pendingReviewDocs, setPendingReviewDocs] = useState<DocumentSummary[]>([]);
  const [pendingReviewState, setPendingReviewState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    documentsApi
      .list({ status: 'pending_review', page: '1', limit: '5', sort_by: 'modified_at', sort_dir: 'desc' })
      .then((data) => {
        if (!cancelled) {
          setPendingReviewDocs(data.documents);
          setPendingReviewState('ready');
        }
      })
      .catch((err) => {
        console.error('Failed to load pending review documents:', errorMessage(err));
        if (!cancelled) setPendingReviewState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Department-scoped datasets based on RBAC and Internal PIC of Partner
  const scopedPartners = useMemo(() => (partners || []).filter((p) => canViewPartner(p, user)), [partners, user]);
  const scopedContracts = useMemo(() => (contracts || []).filter((c) => canViewContract(c, partners, user)), [contracts, partners, user]);
  const scopedIOs = useMemo(() => (ios || []).filter((i) => canViewIO(i, partners, user)), [ios, partners, user]);
  const scopedSpendings = useMemo(() => (spendings || []).filter((s) => canViewSpending(s, partners, user)), [spendings, partners, user]);

  // Stacked Spending Chart State & Filter Controls
  const [spendingFilterYear, setSpendingFilterYear] = useState<string>(() => String(new Date().getFullYear()));
  const [spendingCategoryFilter, setSpendingCategoryFilter] = useState<string>('ALL');
  const { policy } = useTenantSettings();
  // Reporting toggles between USD and the organization's own currency.
  const localCurrency = policy.settings.defaultCurrency;
  const [spendingCurrencyView, setSpendingCurrencyView] = useState<string>('USD');
  const currencyViews = Array.from(new Set(['USD', localCurrency]));
  const viewCurrency = currencyViews.includes(spendingCurrencyView) ? spendingCurrencyView : 'USD';
  const toViewCurrency = (s: PartnerSpending): number => {
    const usd = s.total_amount_usd ?? convertToUsdWithFallback(s.total_amount, s.currency || localCurrency);
    if (viewCurrency === 'USD') return usd;
    if ((s.currency || localCurrency) === viewCurrency) return s.total_amount;
    return usd / (getDefaultUsdRate(viewCurrency) || 1);
  };
  const formatView = (value: number, compact = false) => {
    try {
      return new Intl.NumberFormat(getActiveFormattingLocale(), {
        style: 'currency',
        currency: viewCurrency,
        currencyDisplay: 'code',
        maximumFractionDigits: compact ? 1 : 0,
        ...(compact ? { notation: 'compact' as const } : {}),
      }).format(value);
    } catch {
      return `${viewCurrency} ${Math.round(value)}`;
    }
  };

  // Available Cooperation Categories directly and exclusively from Contracts (c.kategori_kerjasama)
  const categoryOptions = useMemo(() => {
    const catSet = new Set<string>();
    (scopedContracts || []).forEach((c) => {
      (c.kategori_kerjasama || []).forEach((cat) => {
        if (cat && cat.trim()) catSet.add(cat.trim());
      });
    });

    return Array.from(catSet).sort((a, b) => a.localeCompare(b));
  }, [scopedContracts]);

  // Helper to parse usage month & year from invoice_month tag
  const parseUsageMonth = (mStr: string) => {
    const parsed = parseMonthStr(mStr);
    if (!parsed) return null;
    return {
      monthIndex: parsed.monthIndex,
      monthKey: parsed.monthShort,
      year: parsed.year,
    };
  };

  // Available Years from Spendings Data (Prioritizing Invoice Month)
  const availableSpendingYears = useMemo(() => {
    const yearsSet = new Set<string>();
    (scopedSpendings || []).forEach((s) => {
      let hasMonthYear = false;
      (s.invoice_month || []).forEach((m) => {
        const parsedList = parseAllMonths(m);
        parsedList.forEach((parsed) => {
          yearsSet.add(parsed.year);
          hasMonthYear = true;
        });
      });
      // Fallback to invoice_date if no invoice_month tag
      const invDate = String(s.invoice_date || '');
      if (!hasMonthYear && invDate.length >= 4) {
        const y = invDate.startsWith('20') ? invDate.slice(0, 4) : invDate.slice(-4);
        if (/^\d{4}$/.test(y)) yearsSet.add(y);
      }
    });
    if (yearsSet.size === 0) yearsSet.add(new Date().getFullYear().toString());
    return Array.from(yearsSet).sort().reverse();
  }, [scopedSpendings]);

  const spendingChart = useMemo(() => buildSpendingSeries(
    scopedSpendings, spendingFilterYear, spendingCategoryFilter,
    row => {
      const partner = scopedPartners.find(p => p.partner_id === row.vendor_id || p.nama_partner === row.vendor_name);
      const categories = scopedContracts.filter(c => c.partner_id === partner?.partner_id)
        .flatMap(c => c.kategori_kerjasama || []);
      return categories.length ? categories : [t('ui.other')];
    }, toViewCurrency, t('ui.other'),
  ), [scopedSpendings, scopedPartners, scopedContracts, spendingFilterYear, spendingCategoryFilter, viewCurrency, localCurrency, language]);
  const stackedData = spendingChart.data;
  const stackKeys = spendingChart.series.map(s => s.key);
  const stackColors = Object.fromEntries(spendingChart.series.map(s => [s.key, s.color]));
  const formatChartMonth = (period: string) => new Intl.DateTimeFormat(getActiveFormattingLocale(), {
    month: 'short', timeZone: 'UTC',
  }).format(new Date(`${/^\d{2}$/.test(period) ? `2000-${period}` : period}-01T00:00:00Z`));

  // Calculations
  const activeContracts = scopedContracts.filter((c) => c.status === 'Active' || c.status === 'Expiring');
  const activeIOs = scopedIOs.filter((i) => i.status === 'Active' || i.status === 'Expiring');
  const expiringContracts = scopedContracts.filter((c) => c.status === 'Expiring');
  const expiringIOs = scopedIOs.filter((i) => i.status === 'Expiring');
  const expiredContracts = scopedContracts.filter((c) => c.status === 'Expired');
  const requiringActionDocuments = [
    ...expiringContracts.map((contract) => ({
      id: contract.contract_id,
      name: contract.judul_kontrak,
      type: contract.jenis_dokumen === 'Agreement Addendum'
        ? t('contracts.agreement_addendum', 'Agreement Addendum')
        : t('contracts.master_agreement', 'Master Agreement'),
      partner: contract.partner_nama || '—',
      endDate: contract.tanggal_berakhir,
      remainingDays: contract.sisa_hari,
      onOpen: () => onSelectContract(contract),
    })),
    ...expiringIOs.map((io) => ({
      id: io.io_id,
      name: io.judul_io,
      type: t('dashboard.insertion_orders', 'IO / SO / SOW'),
      partner: io.partner_nama || '—',
      endDate: io.tanggal_berakhir || io.tanggal_selesai || '',
      remainingDays: io.sisa_hari,
      onOpen: () => onNavigateTab('ios'),
    })),
  ].sort((a, b) => Date.parse(a.endDate) - Date.parse(b.endDate));

  // Partner Aktif = minimal 1 kontrak dengan status Active atau Expiring
  const activePartnersCount = scopedPartners.filter((p) =>
    scopedContracts.some((c) => c.partner_id === p.partner_id && (c.status === 'Active' || c.status === 'Expiring'))
  ).length;

  const totalNilaiKontrak = contractTotalInCurrency(activeContracts, viewCurrency);
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <DashboardOverview
        greeting={getGreetingText()}
        expiring={expiringContracts.length}
        metrics={[
          { label: t('dashboard.active_partners'), value: activePartnersCount, total: scopedPartners.length, detail: t('dashboard.min_one_contract'), icon: Building2, tone: 'mint', onClick: () => onNavigateTab('partners') },
          { label: t('dashboard.active_contracts'), value: activeContracts.length, total: scopedContracts.length, detail: `${t('dashboard.value')}: ${formatView(totalNilaiKontrak, true)}`, icon: FileText, tone: 'blue', onClick: () => onNavigateTab('contracts') },
          { label: t('dashboard.insertion_orders'), value: activeIOs.length, total: scopedIOs.length, detail: t('dashboard.from_contracts', 'From {contracts} Contracts', { contracts: scopedContracts.length }), icon: FileSpreadsheet, tone: 'violet', onClick: () => onNavigateTab('ios') },
          { label: t('dashboard.expiring_contracts'), value: expiringContracts.length, detail: t('dashboard.extension_termination'), icon: AlertTriangle, tone: 'amber', onClick: () => onNavigateTab('contracts') },
        ]}
      />
      <NewsTicker />

      {/* Notice Period Tracker Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-500/30 shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {t('dashboard.expiring_table_title')}
              </h3>
            </div>
          </div>

        </div>

        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={t('dashboard.expiring_table_title')}>
          <table className="dashboard-data-table w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label={t('dashboard.select_all_requiring_action', 'Select all documents requiring action')}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                      disabled
                    />
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_name', 'Document Name')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_type', 'Type')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.partner', 'Partner')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.remaining_time', 'Sisa Waktu')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.end_date', 'Tanggal Berakhir')}</th>
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('dashboard.action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {requiringActionDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-slate-500 dark:text-slate-400">
                    {t('dashboard.no_expiring')}
                  </td>
                </tr>
              ) : (
                requiringActionDocuments.map((document) => (
                  <tr key={document.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="pl-6 pr-2 py-4 text-left align-middle">
                      <div className="flex items-center justify-start">
                        <input
                          type="checkbox"
                          aria-label={t('dashboard.select_requiring_action', 'Select {name}', { name: document.name })}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          disabled
                        />
                      </div>
                    </td>

                    {/* 1. Document Name */}
                    <td className="px-6 py-4 max-w-72 font-semibold text-slate-900 dark:text-slate-100">
                      <span className="line-clamp-2" title={document.name}>{document.name}</span>
                    </td>

                    {/* 2. Type */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 max-w-72">
                      {document.type}
                    </td>

                    {/* 3. Partner */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {document.partner}
                    </td>

                    {/* 4. Sisa Waktu */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Akan Berakhir')}`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>{document.remainingDays ?? Math.ceil((Date.parse(document.endDate) - Date.now()) / 86_400_000)} {t('dashboard.days_left', 'Days Left')}</span>
                      </span>
                    </td>

                    {/* 5. Tanggal Berakhir */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {new Date(document.endDate).toLocaleDateString(getActiveFormattingLocale(), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* 6. Aksi */}
                    <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                      <button
                        type="button"
                        onClick={document.onOpen}
                        aria-label={`${t('common.open', 'Open')} ${document.name}`}
                        className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-slate-800 dark:hover:text-emerald-300 cursor-pointer"
                      >
                        <ArrowUpRight className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RecentDocumentsTable contracts={scopedContracts} ios={scopedIOs} onNavigate={onNavigateTab} />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-500/30 shrink-0">
              <FileClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {t('dashboard.pending_review_table_title', 'Dokumen Menunggu Review (Pending Review)')}
              </h3>
            </div>
          </div>

        </div>

        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={t('dashboard.pending_review_table_title')}>
          <table className="dashboard-data-table w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label={t('dashboard.pilih_semua_dokumen_pending_review', 'Pilih semua dokumen pending review')}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                      disabled
                    />
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_name', 'Nama Dokumen')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_type', 'Jenis')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_modified_by', 'Diubah Oleh')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_created_at', 'Dibuat')}</th>
                <th scope="col" className="px-6 py-4 font-bold">{t('dashboard.doc_pending_col_modified_at', 'Terakhir Diubah')}</th>
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('dashboard.action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {pendingReviewState === 'loading' ? (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-slate-500 dark:text-slate-400">
                    {t('common.loading', 'Memuat Data...')}
                  </td>
                </tr>
              ) : pendingReviewDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-slate-500 dark:text-slate-400">
                    {t('dashboard.no_pending_review', 'Tidak ada dokumen yang menunggu review saat ini.')}
                  </td>
                </tr>
              ) : (
                pendingReviewDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="pl-6 pr-2 py-4 text-left align-middle">
                      <div className="flex items-center justify-start">
                        <input
                          type="checkbox"
                          aria-label={t('dashboard.pilih_dokumen', 'Pilih dokumen {nama}', { nama: doc.name })}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          disabled
                        />
                      </div>
                    </td>

                    {/* 1. Nama Dokumen */}
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100 max-w-72">
                      <span className="line-clamp-2" title={doc.name}>{doc.name}</span>
                    </td>

                    {/* 2. Jenis */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {typeLabel(t, doc.type)}
                    </td>

                    {/* 3. Diubah Oleh */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {doc.modified_by_name || '—'}
                    </td>

                    {/* 4. Dibuat */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatDateTime(doc.created_at, language)}
                    </td>

                    {/* 5. Terakhir Diubah */}
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatDateTime(doc.modified_at, language)}
                    </td>

                    {/* 6. Aksi */}
                    <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                      <button
                        type="button"
                        onClick={() => onNavigateTab('create-contract')}
                        aria-label={`${t('common.open', 'Open')} ${doc.name}`}
                        className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-slate-800 dark:hover:text-emerald-300 cursor-pointer"
                      >
                        <ArrowUpRight className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stacked Spending Chart Card (Under Table) */}
      <div className="min-w-0 bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 rounded-xl border border-[#06C755]/30 shrink-0">
              <DollarSign className="w-5 h-5 text-[#06C755]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('dashboard.spending_title', 'Tren Spending')}
              </h3>
            </div>
          </div>

          {/* Chart Filters */}
          <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 sm:w-auto">
            {/* 1. Year Filter */}
            <select
              aria-label={t('ui.filter_year')}
              value={spendingFilterYear}
              onChange={(e) => setSpendingFilterYear(e.target.value)}
              className="h-11 w-[92px] shrink-0 px-2 sm:h-9 sm:w-auto sm:px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#06C755] cursor-pointer"
            >
              <option value="ALL">{t('dashboard.all_years', 'Semua Tahun')}</option>
              {availableSpendingYears.map((y) => (
                <option key={y} value={y}>
                  {t('dashboard.year_prefix', 'Tahun')} {y}
                </option>
              ))}
            </select>

            {/* 2. Category Filter */}
            <AlphabeticalSelect
              aria-label={t('ui.filter_category')}
              value={spendingCategoryFilter}
              onChange={(e) => setSpendingCategoryFilter(e.target.value)}
              className="h-11 min-w-0 flex-1 px-2 sm:h-9 sm:w-48 sm:flex-none sm:px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#06C755] cursor-pointer truncate"
            >
              <option value="ALL">{t('dashboard.all_categories', 'Semua Kategori')}</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </AlphabeticalSelect>

            {/* 3. Currency Toggle */}
            <div role="group" aria-label={t('settings.region.reporting_currency', 'Reporting currency')} className="flex shrink-0 items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {currencyViews.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={viewCurrency === code}
                  onClick={() => setSpendingCurrencyView(code)}
                  className={`min-h-9 px-2.5 py-1 text-sm font-extrabold rounded-lg transition-all cursor-pointer ${
                    viewCurrency === code
                      ? 'bg-[#04803D] text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart Visualization */}
        <p className="text-sm text-slate-700 dark:text-slate-200">{t('ui.period_total')}: <strong className="tabular-nums">{formatView(spendingChart.total)}</strong> · {spendingFilterYear === 'ALL' ? t('dashboard.all_years') : spendingFilterYear} · {spendingCategoryFilter === 'ALL' ? t('dashboard.all_categories') : spendingCategoryFilter}</p>
        {spendingChart.skipped > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">{t('ui.skipped_dates', undefined, { count: spendingChart.skipped })}</p>}
        <div className="min-w-0 w-full" role="region" aria-label={t('dashboard.spending_title')}>
        <div className="w-full pt-2 h-24 sm:h-28" style={stackKeys.length ? { height: 'clamp(240px, 28vw, 360px)' } : undefined}>
          {stackKeys.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
              {t('dashboard.no_spending_data', 'Belum ada data spending untuk ditampilkan pada filter ini.')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackedData} margin={{ top: 10, right: isCompactChart ? 2 : 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatChartMonth}
                  interval={0}
                  stroke="var(--chart-label)"
                  fontSize={isCompactChart ? 10 : 12}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis
                  stroke="var(--chart-label)"
                  fontSize={isCompactChart ? 10 : 12}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  width={isCompactChart ? 64 : 85}
                  tick={({ y, payload }: any) => {
                    const val = payload?.value;
                    const label = formatView(Number(val) || 0, true);

                    return (
                      <text x={0} y={y} dy={4} fill="var(--chart-label)" fontSize={isCompactChart ? 10 : 12} fontWeight={500} textAnchor="start">
                        {label}
                      </text>
                    );
                  }}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry.value) || 0), 0);
                      const formattedTotal = formatView(total);

                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[170px]">
                          <div className="font-extrabold pb-2 mb-2 border-b border-slate-700/70 text-slate-200 flex justify-between items-center gap-2">
                            <span>{formatChartMonth(String(label))}</span>
                            <span className="text-[#06C755] font-black">({formattedTotal})</span>
                          </div>
                          <div className="space-y-1.5">
                            {payload.map((entry: any, index: number) => {
                              const val = Number(entry.value) || 0;
                              if (val === 0) return null;
                              const formattedVal = formatView(val);

                              return (
                                <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.fill }} />
                                    <span className="text-slate-300 font-medium truncate">{entry.name}</span>
                                  </div>
                                  <span className="font-bold text-white shrink-0">{formattedVal}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '12px', fontSize: '13px' }}
                  formatter={value => <span style={{ color: 'var(--chart-label)' }}>{value}</span>}
                />
                {stackKeys.map((key) => (
                  <Bar
                    isAnimationActive={false}
                    key={key}
                    dataKey={key}
                    name={spendingChart.series.find(series => series.key === key)?.name}
                    stackId="spendingStack"
                    fill={stackColors[key] || '#06C755'}
                    maxBarSize={isCompactChart ? 28 : 52}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
