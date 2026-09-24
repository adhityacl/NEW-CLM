import React, { useState, useMemo } from 'react';
import { Contract, InsertionOrder, Partner, NotificationLog, PartnerSpending } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
  canViewPartner,
  canViewContract,
  canViewIO,
  canViewSpending,
  isGlobalRole,
} from '../lib/rbacScoping';
import { getSavedCategories } from '../lib/categoryUtils';
import { ActionMenu } from './ui/action-menu';
import { getStatusBadgeClass } from './ui/badge';
import { parseMonthStr, parseAllMonths, formatMonthTagDisplay } from '../lib/monthUtils';
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
  ExternalLink,
} from 'lucide-react';
import {
  BarChart,
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

  // Department-scoped datasets based on RBAC and Internal PIC of Partner
  const scopedPartners = useMemo(() => (partners || []).filter((p) => canViewPartner(p, user)), [partners, user]);
  const scopedContracts = useMemo(() => (contracts || []).filter((c) => canViewContract(c, partners, user)), [contracts, partners, user]);
  const scopedIOs = useMemo(() => (ios || []).filter((i) => canViewIO(i, partners, user)), [ios, partners, user]);
  const scopedSpendings = useMemo(() => (spendings || []).filter((s) => canViewSpending(s, partners, user)), [spendings, partners, user]);

  // Stacked Spending Chart State & Filter Controls
  const [spendingFilterYear, setSpendingFilterYear] = useState<string>('ALL');
  const [spendingCategoryFilter, setSpendingCategoryFilter] = useState<string>('ALL');
  const [spendingCurrencyView, setSpendingCurrencyView] = useState<'USD' | 'IDR'>('USD');

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

  // Compute Stacked Bar Chart Data (Based on Invoice Month & Category Filter)
  const { stackedData, stackKeys, stackColors } = useMemo(() => {
    const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthBuckets: Record<string, Record<string, number>> = {};
    monthsOrder.forEach((m) => {
      monthBuckets[m] = {};
    });

    const vendorTotals: Record<string, number> = {};
    const presentCurrencies = new Set<string>();

    const getSpendingCategories = (s: PartnerSpending) => {
      const matchedPartner = (scopedPartners || []).find(
        (p) => p.partner_id === s.vendor_id || (p.nama_partner && s.vendor_name && p.nama_partner.toLowerCase() === s.vendor_name.toLowerCase())
      );
      const matchedContracts = (scopedContracts || []).filter(
        (c) => (matchedPartner && c.partner_id === matchedPartner.partner_id) || (c.partner_nama && s.vendor_name && c.partner_nama.toLowerCase() === s.vendor_name.toLowerCase())
      );

      const cats = new Set<string>();
      // HANYA sinkronkan dengan Kategori Kerjasama dari Kontrak (c.kategori_kerjasama)
      matchedContracts.forEach((c) => {
        (c.kategori_kerjasama || []).forEach((k) => k && cats.add(k.trim()));
      });

      if (cats.size === 0) {
        cats.add('Lainnya');
      }
      return Array.from(cats);
    };

    (scopedSpendings || []).forEach((s) => {
      const amt = spendingCurrencyView === 'USD'
        ? (s.total_amount_usd ?? (s.currency === 'USD' ? s.total_amount : s.total_amount * 0.000062))
        : (s.currency === 'IDR' ? s.total_amount : (s.total_amount_usd || s.total_amount) * 16000);

      let usageMonths: { monthKey: string; year: string }[] = [];
      if (s.invoice_month && s.invoice_month.length > 0) {
        s.invoice_month.forEach((m) => {
          const parsedList = parseAllMonths(m);
          parsedList.forEach((parsed) => {
            usageMonths.push({
              monthKey: parsed.monthShort,
              year: parsed.year,
            });
          });
        });
      }

      if (usageMonths.length === 0 && s.invoice_date && String(s.invoice_date).length >= 7) {
        const invDateStr = String(s.invoice_date);
        const dObj = new Date(invDateStr);
        if (!isNaN(dObj.getTime())) {
          const y = invDateStr.startsWith('20') ? invDateStr.slice(0, 4) : invDateStr.slice(-4);
          usageMonths.push({
            monthKey: monthsOrder[dObj.getMonth()],
            year: /^\d{4}$/.test(y) ? y : dObj.getFullYear().toString(),
          });
        }
      }

      if (usageMonths.length === 0) {
        usageMonths.push({
          monthKey: 'Jan',
          year: new Date().getFullYear().toString(),
        });
      }

      const matchingMonths = spendingFilterYear === 'ALL'
        ? usageMonths
        : usageMonths.filter((um) => um.year === spendingFilterYear);

      if (matchingMonths.length === 0) return;

      const perMonthAmt = amt / usageMonths.length;
      const curKey = s.currency || 'IDR';
      presentCurrencies.add(curKey);

      const sCats = getSpendingCategories(s);
      const vName = s.vendor_name || 'Vendor Lain';

      if (spendingCategoryFilter !== 'ALL' && spendingCategoryFilter !== 'CURRENCY') {
        const matchesFilter = sCats.some((c) => c.toLowerCase() === spendingCategoryFilter.toLowerCase());
        if (!matchesFilter) return;
      }

      matchingMonths.forEach(() => {
        vendorTotals[vName] = (vendorTotals[vName] || 0) + perMonthAmt;
      });
    });

    const sortedVendors = Object.keys(vendorTotals).sort((a, b) => vendorTotals[b] - vendorTotals[a]);
    const topVendors = sortedVendors.slice(0, 5);
    const hasOtherVendors = sortedVendors.length > 5;

    (spendings || []).forEach((s) => {
      const amt = spendingCurrencyView === 'USD'
        ? (s.total_amount_usd ?? (s.currency === 'USD' ? s.total_amount : s.total_amount * 0.000062))
        : (s.currency === 'IDR' ? s.total_amount : (s.total_amount_usd || s.total_amount) * 16000);

      let usageMonths: { monthKey: string; year: string }[] = [];
      if (s.invoice_month && s.invoice_month.length > 0) {
        s.invoice_month.forEach((m) => {
          const parsedList = parseAllMonths(m);
          parsedList.forEach((parsed) => {
            usageMonths.push({
              monthKey: parsed.monthShort,
              year: parsed.year,
            });
          });
        });
      }

      if (usageMonths.length === 0 && s.invoice_date && String(s.invoice_date).length >= 7) {
        const invDateStr = String(s.invoice_date);
        const dObj = new Date(invDateStr);
        if (!isNaN(dObj.getTime())) {
          const y = invDateStr.startsWith('20') ? invDateStr.slice(0, 4) : invDateStr.slice(-4);
          usageMonths.push({
            monthKey: monthsOrder[dObj.getMonth()],
            year: /^\d{4}$/.test(y) ? y : dObj.getFullYear().toString(),
          });
        }
      }

      if (usageMonths.length === 0) {
        usageMonths.push({
          monthKey: 'Jan',
          year: new Date().getFullYear().toString(),
        });
      }

      const matchingMonths = spendingFilterYear === 'ALL'
        ? usageMonths
        : usageMonths.filter((um) => um.year === spendingFilterYear);

      if (matchingMonths.length === 0) return;

      const perMonthAmt = amt / usageMonths.length;
      const sCats = getSpendingCategories(s);
      const vName = s.vendor_name || 'Vendor Lain';

      if (spendingCategoryFilter !== 'ALL' && spendingCategoryFilter !== 'CURRENCY') {
        const matchesFilter = sCats.some((c) => c.toLowerCase() === spendingCategoryFilter.toLowerCase());
        if (!matchesFilter) return;
      }

      matchingMonths.forEach((um) => {
        if (spendingCategoryFilter === 'CURRENCY') {
          const curKey = s.currency || 'IDR';
          monthBuckets[um.monthKey][curKey] = (monthBuckets[um.monthKey][curKey] || 0) + Math.round(perMonthAmt);
        } else {
          // Both 'ALL' and specific category filter stack by partner (vendor)
          const stackKey = topVendors.includes(vName) ? vName : 'Lainnya';
          monthBuckets[um.monthKey][stackKey] = (monthBuckets[um.monthKey][stackKey] || 0) + Math.round(perMonthAmt);
        }
      });
    });

    let keys: string[] = [];
    if (spendingCategoryFilter === 'CURRENCY') {
      keys = Array.from(presentCurrencies);
    } else {
      keys = hasOtherVendors ? [...topVendors, 'Lainnya'] : topVendors;
    }

    const palette = ['#06C755', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'];
    const colorsMap: Record<string, string> = {};
    keys.forEach((k, idx) => {
      colorsMap[k] = palette[idx % palette.length];
    });

    const chartData = monthsOrder.map((m) => ({
      month: m,
      ...monthBuckets[m],
    }));

    return { stackedData: chartData, stackKeys: keys, stackColors: colorsMap };
  }, [scopedSpendings, scopedPartners, scopedContracts, spendingFilterYear, spendingCategoryFilter, spendingCurrencyView]);

  // Calculations
  const activeContracts = scopedContracts.filter((c) => c.status === 'Aktif' || c.status === 'Akan Berakhir');
  const activeIOs = scopedIOs.filter((i) => i.status === 'Aktif' || i.status === 'Akan Berakhir');
  const expiringContracts = scopedContracts.filter((c) => c.status === 'Akan Berakhir');
  const expiredContracts = scopedContracts.filter((c) => c.status === 'Expired');

  // Partner Aktif = minimal 1 kontrak dengan status 'Aktif' atau 'Akan Berakhir'
  const activePartnersCount = scopedPartners.filter((p) =>
    scopedContracts.some((c) => c.partner_id === p.partner_id && (c.status === 'Aktif' || c.status === 'Akan Berakhir'))
  ).length;

  const totalNilaiKontrak = activeContracts.reduce((acc, curr) => acc + (curr.nilai_kontrak || 0), 0);
  const totalNilaiIO = scopedIOs.reduce((acc, curr) => acc + (curr.nilai_io || 0), 0);

  // Category breakdown chart data
  const categoryMap: Record<string, number> = {};
  scopedContracts.forEach((c) => {
    (c.kategori_kerjasama || ['Lainnya']).forEach((cat) => {
      categoryMap[cat] = (categoryMap[cat] || 0) + c.nilai_kontrak;
    });
  });

  const categoryChartData = Object.keys(categoryMap).map((key) => ({
    name: key,
    nilai: categoryMap[key] / 1000000, // In Millions
    formatted: `Rp ${(categoryMap[key] / 1000000000).toFixed(2)} M`,
  }));

  // Pricing model IO breakdown data
  const pricingModelMap: Record<string, number> = {};
  scopedIOs.forEach((io) => {
    pricingModelMap[io.pricing_model] = (pricingModelMap[io.pricing_model] || 0) + 1;
  });

  const pieChartData = Object.keys(pricingModelMap).map((key) => ({
    name: key,
    value: pricingModelMap[key],
  }));

  const COLORS = ['#06C755', '#05B34C', '#048C3B', '#34D399', '#F59E0B'];

  const formatRupiah = (val: number) => {
    if (val >= 1000000000) {
      return `Rp ${(val / 1000000000).toFixed(2)} ${language === 'EN' ? 'Billion' : 'Miliar'}`;
    }
    return `Rp ${(val / 1000000).toFixed(0)} ${language === 'EN' ? 'Million' : 'Juta'}`;
  };

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Top Banner Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 min-h-[84px]">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <span>{getGreetingText()}</span>
          </h2>
          {user?.department && !isGlobalRole(user?.role) && (
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Cakupan Data: Dept {user.department}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                Peran: <strong className="text-slate-700 dark:text-slate-300 uppercase">{user.role}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigateTab('contracts')}
            className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-700 font-bold flex items-center transition-all shrink-0"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>{t('dashboard.view_all_contracts', 'Lihat Semua Kontrak')}</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Partner Aktif */}
        <div
          onClick={() => onNavigateTab('partners')}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between cursor-pointer hover:border-[#06C755]/50 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.active_partners')}
            </span>
            <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 rounded-xl border border-[#06C755]/30 shrink-0">
              <Building2 className="w-5 h-5 text-[#06C755]" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {activePartnersCount}{' '}
              <span className="text-xs font-semibold text-slate-400">/ {partners.length} Total</span>
            </div>
            <p className="text-xs text-[#048C3B] dark:text-emerald-400 font-bold mt-1">
              {t('dashboard.min_one_contract')}
            </p>
          </div>
        </div>

        {/* Stat 2: Kontrak Aktif */}
        <div
          onClick={() => onNavigateTab('contracts')}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between cursor-pointer hover:border-[#06C755]/50 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.active_contracts')}
            </span>
            <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 rounded-xl border border-[#06C755]/30 shrink-0">
              <FileText className="w-5 h-5 text-[#06C755]" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {activeContracts.length}{' '}
              <span className="text-xs font-semibold text-slate-400">/ {contracts.length} Total</span>
            </div>
            <p className="text-xs text-[#048C3B] dark:text-emerald-400 font-bold mt-1">
              {t('dashboard.value')}: {formatRupiah(totalNilaiKontrak)}
            </p>
          </div>
        </div>

        {/* Stat 3: Insertion Orders */}
        <div
          onClick={() => onNavigateTab('ios')}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between cursor-pointer hover:border-[#06C755]/50 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.insertion_orders', 'Insertion Orders (IO)')}
            </span>
            <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 rounded-xl border border-[#06C755]/30 shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-[#06C755]" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {activeIOs.length}{' '}
              <span className="text-xs font-semibold text-slate-400">/ {ios.length} Total</span>
            </div>
            <p className="text-xs text-[#048C3B] dark:text-emerald-400 font-bold mt-1">
              {language === 'EN' ? `From ${contracts.length} Contracts` : `Dari ${contracts.length} Kontrak`}
            </p>
          </div>
        </div>

        {/* Stat 4: Kontrak Tenggang / Extension & Termination (Expiring Contracts) */}
        <div
          onClick={() => onNavigateTab('contracts')}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.expiring_contracts')}
            </span>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-500/30 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {expiringContracts.length}{' '}
              <span className="text-xs font-semibold text-slate-400">{t('dashboard.need_notice')}</span>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-400 font-bold mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Extension / Termination</span>
            </p>
          </div>
        </div>
      </div>

      {/* Notice Period Tracker Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

          <button
            onClick={() => onNavigateTab('contracts')}
            className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center transition-all shrink-0"
          >
            <span>{t('dashboard.view_all_contracts', 'Lihat Semua Kontrak')}</span>
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full min-w-[760px] text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua kontrak yang akan berakhir"
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                      disabled
                    />
                  </div>
                </th>
                <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_no', 'No. Kontrak')}</th>
                <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('contracts.col_title', 'Judul Kontrak')}</th>
                <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('dashboard.partner', 'Partner')}</th>
                <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('dashboard.end_date', 'Tanggal Berakhir')}</th>
                <th scope="col" className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle">{t('dashboard.remaining_time', 'Sisa Waktu')}</th>
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('dashboard.action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {expiringContracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    {t('dashboard.no_expiring')}
                  </td>
                </tr>
              ) : (
                expiringContracts.map((ctr) => (
                  <tr key={ctr.contract_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="pl-6 pr-2 py-4 text-left align-middle">
                      <div className="flex items-center justify-start">
                        <input
                          type="checkbox"
                          aria-label={`Pilih kontrak ${ctr.nomor_kontrak}`}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                          disabled
                        />
                      </div>
                    </td>

                    {/* 1. No. Kontrak */}
                    <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 text-left whitespace-nowrap">
                      {ctr.nomor_kontrak}
                    </td>

                    {/* 2. Judul Kontrak */}
                    <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left max-w-[200px]">
                      <span className="line-clamp-2" title={ctr.judul_kontrak}>{ctr.judul_kontrak}</span>
                    </td>

                    {/* 3. Partner */}
                    <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                      {ctr.partner_nama}
                    </td>

                    {/* 4. Tanggal Berakhir */}
                    <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                      {new Date(ctr.tanggal_berakhir).toLocaleDateString(language === 'ID' ? 'id-ID' : 'en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* 5. Sisa Waktu */}
                    <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                      <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${getStatusBadgeClass('Akan Berakhir')}`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>{ctr.sisa_hari} {language === 'EN' ? 'Days Left' : 'Hari Lagi'}</span>
                      </span>
                    </td>

                    {/* 6. Aksi */}
                    <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                      <div className="flex items-center justify-end">
                        <ActionMenu
                          items={[
                            {
                              label: 'Detail',
                              icon: <ExternalLink className="w-3.5 h-3.5" />,
                              onClick: () => onSelectContract(ctr),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stacked Spending Chart Card (Under Table) */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 rounded-xl border border-[#06C755]/30 shrink-0">
              <DollarSign className="w-5 h-5 text-[#06C755]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('dashboard.spending_title', 'Analisis Spending')}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('dashboard.spending_subtitle', 'Visualisasi tumpukan pengeluaran bulanan berdasarkan kategori kerjasama & vendor')}
              </p>
            </div>
          </div>

          {/* Chart Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Year Filter */}
            <select
              value={spendingFilterYear}
              onChange={(e) => setSpendingFilterYear(e.target.value)}
              className="h-9 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#06C755] cursor-pointer"
            >
              <option value="ALL">{t('dashboard.all_years', 'Semua Tahun')}</option>
              {availableSpendingYears.map((y) => (
                <option key={y} value={y}>
                  {t('dashboard.year_prefix', 'Tahun')} {y}
                </option>
              ))}
            </select>

            {/* 2. Category Filter */}
            <select
              value={spendingCategoryFilter}
              onChange={(e) => setSpendingCategoryFilter(e.target.value)}
              className="h-9 px-3 max-w-[150px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#06C755] cursor-pointer truncate"
            >
              <option value="ALL">{t('dashboard.all_categories', 'Semua Kategori')}</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* 3. Currency Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSpendingCurrencyView('USD')}
                className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
                  spendingCurrencyView === 'USD'
                    ? 'bg-[#06C755] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setSpendingCurrencyView('IDR')}
                className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
                  spendingCurrencyView === 'IDR'
                    ? 'bg-[#06C755] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                IDR (Rp)
              </button>
            </div>
          </div>
        </div>

        {/* Chart Visualization */}
        <div className="h-80 w-full pt-2">
          {stackKeys.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
              {t('dashboard.no_spending_data', 'Belum ada data spending untuk ditampilkan pada filter ini.')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackedData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  width={50}
                  tick={({ y, payload }: any) => {
                    const val = payload?.value;
                    let label = '';
                    if (val === 0) label = spendingCurrencyView === 'USD' ? '$0' : 'Rp 0';
                    else if (spendingCurrencyView === 'USD') {
                      if (val >= 1000000000) {
                        const num = parseFloat((val / 1000000000).toFixed(1));
                        label = `$${num}B`;
                      } else if (val >= 1000000) {
                        const num = parseFloat((val / 1000000).toFixed(1));
                        label = `$${num}M`;
                      } else if (val >= 1000) {
                        const num = parseFloat((val / 1000).toFixed(1));
                        label = `$${num}k`;
                      } else {
                        label = `$${val}`;
                      }
                    } else {
                      if (val >= 1000000000) {
                        const num = parseFloat((val / 1000000000).toFixed(1));
                        label = language === 'EN' ? `Rp ${num}B` : `Rp ${num}M`;
                      } else if (val >= 1000000) {
                        const num = parseFloat((val / 1000000).toFixed(1));
                        label = language === 'EN' ? `Rp ${num}M` : `Rp ${num}Jt`;
                      } else if (val >= 1000) {
                        const num = parseFloat((val / 1000).toFixed(1));
                        label = language === 'EN' ? `Rp ${num}k` : `Rp ${num}Rb`;
                      } else {
                        label = `Rp ${val}`;
                      }
                    }

                    return (
                      <text x={0} y={y} dy={4} fill="#94A3B8" fontSize={11} fontWeight={500} textAnchor="start">
                        {label}
                      </text>
                    );
                  }}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry.value) || 0), 0);
                      const formattedTotal = spendingCurrencyView === 'USD'
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total)
                        : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(total);

                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[170px]">
                          <div className="font-extrabold pb-2 mb-2 border-b border-slate-700/70 text-slate-200 flex justify-between items-center gap-2">
                            <span>{label}</span>
                            <span className="text-[#06C755] font-black">({formattedTotal})</span>
                          </div>
                          <div className="space-y-1.5">
                            {payload.map((entry: any, index: number) => {
                              const val = Number(entry.value) || 0;
                              if (val === 0) return null;
                              const formattedVal = spendingCurrencyView === 'USD'
                                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
                                : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

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
                  wrapperStyle={{ paddingTop: '15px', fontSize: '11px', fontWeight: 'bold' }}
                />
                {stackKeys.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="spendingStack"
                    fill={stackColors[key] || '#06C755'}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
