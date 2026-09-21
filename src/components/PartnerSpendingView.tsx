import React, { useState, useMemo, useEffect } from 'react';
import { Partner, PartnerSpending } from '../types';
import {
  DollarSign,
  Plus,
  Search,
  Filter,
  Download,
  FolderOpen,
  FileText,
  FileCheck,
  FileDown,
  FileSpreadsheet,
  Building2,
  Calendar,
  CreditCard,
  Trash2,
  Edit,
  ExternalLink,
  X,
  Upload,
  CheckCircle2,
  Tag,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { ActionMenu } from './ui/action-menu';
import { TablePagination } from './ui/TablePagination';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
  canViewSpending,
  canEditSpending,
  canCreateContract,
  canDeletePartner,
  isGlobalRole,
} from '../lib/rbacScoping';
import { getCachedAccessToken } from '../lib/googleAuthService';
import { SUPPORTED_CURRENCIES, formatMoney, getDefaultUsdRate, getHistoricalUsdRate, fetchHistoricalRate } from '../lib/currencyUtils';
import { formatInvoiceFileName, formatBillingFileName } from '../lib/fileNaming';
import { usePermissions } from '../lib/permissions';
import {
  parseMonthStr,
  parseAllMonths,
  formatMonthTagDisplay,
  normalizeMonthToDate,
  getEndOfMonthDate,
} from '../lib/monthUtils';

// Re-export formatMonthTagDisplay for backwards compatibility with any external consumers
export { formatMonthTagDisplay };

interface PartnerSpendingViewProps {
  partners: Partner[];
  spendings: PartnerSpending[];
  onRefreshData: () => void;
  userEmail?: string;
  userName?: string;
  userRole?: string;
}

export const PartnerSpendingView: React.FC<PartnerSpendingViewProps> = ({
  partners,
  spendings = [],
  onRefreshData,
  userEmail,
  userName,
  userRole,
}) => {
  const { hasPermission } = usePermissions();
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('ALL');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('ALL');

  const [showModal, setShowModal] = useState(false);

  const [editingSpending, setEditingSpending] = useState<PartnerSpending | null>(null);

  const [formVendorName, setFormVendorName] = useState('');
  const [formVendorId, setFormVendorId] = useState('');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formInvoiceDate, setFormInvoiceDate] = useState('');
  const [formInvoiceMonths, setFormInvoiceMonths] = useState<string[]>([]);
  const [monthInput, setMonthInput] = useState('');
  const [formInvoiceDesc, setFormInvoiceDesc] = useState('');
  const [formCurrency, setFormCurrency] = useState('IDR');
  const [formTotalAmount, setFormTotalAmount] = useState<number | ''>('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccountNumber, setFormBankAccountNumber] = useState('');
  const [formBankAccountHolder, setFormBankAccountHolder] = useState('');

  const [invoiceFileObj, setInvoiceFileObj] = useState<{ fileName: string; fileData: string; rawFile?: File } | null>(null);
  const [billingFileObj, setBillingFileObj] = useState<{ fileName: string; fileData: string; rawFile?: File } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [parseSuccessMsg, setParseSuccessMsg] = useState<string | null>(null);

  const resetFormState = (item?: PartnerSpending | null) => {
    setEditingSpending(item || null);
    setFormVendorName(item?.vendor_name || '');
    setFormVendorId(item?.vendor_id || '');
    setFormInvoiceNumber(item?.invoice_number || '');
    setFormInvoiceDate(item?.invoice_date || '');
    const initialMonths = (item?.invoice_month || []).map((m) => normalizeMonthToDate(m)).filter(Boolean);
    setFormInvoiceMonths(initialMonths);
    setMonthInput('');
    setFormInvoiceDesc(item?.invoice_description || '');
    setFormCurrency(item?.currency || 'IDR');
    setFormTotalAmount(item?.total_amount ?? '');
    setFormBankName(item?.bank_name || '');
    setFormBankAccountNumber(item?.bank_account_number || '');
    setFormBankAccountHolder(item?.bank_account_holder_name || '');
    setInvoiceFileObj(null);
    setBillingFileObj(null);
    setErrorMessage('');
    setParseSuccessMsg(null);
  };

  const handleAddNew = () => {
    resetFormState(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (item: any) => {
    resetFormState(item);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    handleDeleteClick(id);
  };

  const handleVendorSelect = (name: string, id?: string) => {
    setFormVendorName(name);
    setFormVendorId(id || '');
  };

  const handleAddMonthTag = (e?: any) => {
    if (e) e.preventDefault();
    if (monthInput.trim()) {
      const normalized = normalizeMonthToDate(monthInput.trim());
      if (normalized && !formInvoiceMonths.includes(normalized)) {
        setFormInvoiceMonths((prev) => [...prev, normalized]);
      }
      setMonthInput('');
    }
  };

  const handleRemoveMonthTag = (tag: string) => {
    setFormInvoiceMonths((prev) => prev.filter((t) => t !== tag));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'invoice' | 'billing') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMessage('Ukuran file maksimal 20MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const fileObj = { fileName: file.name, fileData: reader.result as string, rawFile: file };
        if (type === 'invoice') {
          setInvoiceFileObj(fileObj);
        } else {
          setBillingFileObj(fileObj);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleParseSpending = async () => {
    if (!invoiceFileObj || (!invoiceFileObj.fileData && !invoiceFileObj.rawFile)) {
      setErrorMessage('Silakan pilih dokumen Invoice terlebih dahulu untuk parsing.');
      return;
    }
    setIsParsing(true);
    setErrorMessage('');
    setParseSuccessMsg(null);
    try {
      let response: Response;
      if (invoiceFileObj.rawFile) {
        const formData = new FormData();
        formData.append('file', invoiceFileObj.rawFile);
        response = await fetch('/api/spendings/parse', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/spendings/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: invoiceFileObj.fileData }),
        });
      }
      const contentType = response.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text && text.trim().startsWith('<') ? 'Koneksi AI Server timeout atau sibuk. Silakan coba kembali beberapa saat lagi.' : (text || 'Gagal mengekstrak dokumen invoice.'));
      }
      if (!response.ok) {
        throw new Error(result.error || 'Gagal mengekstrak dokumen invoice.');
      }
      if (result.success && result.data) {
        const p = result.data;
        if (p.invoice_number) setFormInvoiceNumber(p.invoice_number);
        if (p.invoice_date) {
          let formattedDate = p.invoice_date.trim();
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(formattedDate)) {
            const [d, m, y] = formattedDate.split('/');
            formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          setFormInvoiceDate(formattedDate);

          const dObj = new Date(formattedDate);
          if (!isNaN(dObj.getTime())) {
            const endOfMonth = getEndOfMonthDate(dObj.getFullYear(), dObj.getMonth() + 1);
            if (endOfMonth) {
              setFormInvoiceMonths((prev) => Array.from(new Set([...prev, endOfMonth])));
            }
          }
        }
        if (p.invoice_description) setFormInvoiceDesc(p.invoice_description);
        if (p.currency) {
          const upperCur = p.currency.toUpperCase().trim();
          if (SUPPORTED_CURRENCIES.some((c) => c.code === upperCur)) {
            setFormCurrency(upperCur);
          }
        }
        if (p.total_amount !== undefined && p.total_amount !== null && !isNaN(Number(p.total_amount))) {
          setFormTotalAmount(Number(p.total_amount));
        }
        if (p.bank_name) setFormBankName(p.bank_name);
        if (p.account_number) setFormBankAccountNumber(p.account_number);
        if (p.account_holder) {
          setFormBankAccountHolder(p.account_holder);
          if (!formVendorName) {
            const rawH = p.account_holder.toLowerCase();
            const matchedP = partners.find((vendor) => {
              const vName = vendor.nama_partner.toLowerCase();
              return vName.includes(rawH) || rawH.includes(vName);
            });
            if (matchedP) {
              setFormVendorName(matchedP.nama_partner);
              setFormVendorId(matchedP.partner_id);
            }
          }
        }
        if (result.cached) {
          setParseSuccessMsg('⚡ Hasil didapat instan dari Cache SHA-256 invoice!');
        } else {
          setParseSuccessMsg('⚡ Data invoice berhasil di-auto-fill oleh AI!');
        }
        setTimeout(() => setParseSuccessMsg(null), 6000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat parsing invoice.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!formVendorName) {
      setErrorMessage('Vendor Name wajib dipilih.');
      return;
    }
    if (!formInvoiceNumber.trim()) {
      setErrorMessage('Invoice Number wajib diisi.');
      return;
    }
    if (formTotalAmount === '' || isNaN(Number(formTotalAmount))) {
      setErrorMessage('Total Amount wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isEdit = Boolean(editingSpending && editingSpending.id);
      const url = isEdit ? `/api/partner-spendings/${editingSpending!.id}` : '/api/partner-spendings';
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        vendor_id: formVendorId || undefined,
        vendor_name: formVendorName,
        invoice_number: formInvoiceNumber.trim(),
        invoice_date: formInvoiceDate,
        invoice_month: formInvoiceMonths,
        invoice_description: formInvoiceDesc.trim(),
        currency: formCurrency,
        total_amount: Number(formTotalAmount),
        total_amount_usd: estimatedUsd,
        bank_name: formBankName.trim(),
        bank_account_number: formBankAccountNumber.trim(),
        bank_account_holder_name: formBankAccountHolder.trim(),
        invoice_file: invoiceFileObj || undefined,
        billing_file: billingFileObj || undefined,
        userEmail,
        userName,
        userRole,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Terjadi kesalahan saat menyimpan data spending.');
      }

      onRefreshData();
      setShowModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan data spending.');
    } finally {
      setIsSubmitting(false);
    }
  };
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ USD: 1 });
  const [historicalRate, setHistoricalRate] = useState<number>(() => getDefaultUsdRate('IDR'));

  useEffect(() => {
    let isMounted = true;
    if (formCurrency === 'USD') {
      setHistoricalRate(1);
      return;
    }
    fetchHistoricalRate(formCurrency, formInvoiceDate).then((res) => {
      if (isMounted && res.rate) {
        setHistoricalRate(res.rate);
      }
    });
    return () => { isMounted = false; };
  }, [formCurrency, formInvoiceDate]);

  const estimatedUsd = formCurrency === 'USD'
    ? Number(formTotalAmount || 0)
    : Math.round(Number(formTotalAmount || 0) * historicalRate * 100) / 100;

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const token = getCachedAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers['x-google-access-token'] = token;
        const res = await fetch('/api/exchange-rates', { headers, cache: 'no-store' });
        if (res.ok) {
           const data = await res.json();
           setExchangeRates(data);
        }
      } catch (err) {
        console.error("Failed to fetch exchange rates:", err);
      }
    };
    fetchRates();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    spendings.forEach((s) => {
      let hasMonthYear = false;
      if (s.invoice_month && s.invoice_month.length > 0) {
        s.invoice_month.forEach((m) => {
          const parsedList = parseAllMonths(m);
          parsedList.forEach((p) => {
            if (p.year) {
              years.add(p.year);
              hasMonthYear = true;
            }
          });
        });
      }
      if (!hasMonthYear && s.invoice_date && s.invoice_date.length >= 4) {
        const y = s.invoice_date.startsWith('20') ? s.invoice_date.slice(0, 4) : s.invoice_date.slice(-4);
        if (/^\d{4}$/.test(y)) years.add(y);
      }
    });
    if (years.size === 0) years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [spendings]);

  const filteredSpendings = useMemo(() => {
    return spendings.filter((s) => {
      // 1. Department Scoping & RBAC restriction (based on internal PIC of partner)
      if (!canViewSpending(s, partners, user)) {
        return false;
      }

      const matchSearch =
        (s.id && s.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        s.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.invoice_description && s.invoice_description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.bank_name && s.bank_name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchVendor =
        selectedVendorFilter === 'ALL' || s.vendor_name.toLowerCase() === selectedVendorFilter.toLowerCase();

      // Collect all parsed month info for this spending record
      const parsedMonths: ReturnType<typeof parseAllMonths> = [];
      if (s.invoice_month && s.invoice_month.length > 0) {
        s.invoice_month.forEach((m) => {
          const parsedList = parseAllMonths(m);
          parsedList.forEach((p) => parsedMonths.push(p));
        });
      } else if (s.invoice_date) {
        const parsed = parseMonthStr(s.invoice_date);
        if (parsed) parsedMonths.push(parsed);
      }

      let matchYear = true;
      if (selectedYear !== 'ALL') {
        const itemYears = new Set<string>();
        parsedMonths.forEach((p) => itemYears.add(p.year));
        if (s.invoice_date && s.invoice_date.length >= 4) {
          const y = s.invoice_date.startsWith('20') ? s.invoice_date.slice(0, 4) : s.invoice_date.slice(-4);
          if (/^\d{4}$/.test(y)) itemYears.add(y);
        }
        matchYear = itemYears.has(selectedYear);
      }

      let matchMonth = true;
      if (selectedMonthFilter !== 'ALL') {
        const itemMonths = new Set<string>();
        parsedMonths.forEach((p) => {
          if (selectedYear === 'ALL' || p.year === selectedYear) {
            itemMonths.add(p.month);
            itemMonths.add(p.monthShort);
          }
        });
        matchMonth = itemMonths.has(selectedMonthFilter);
      }

      return matchSearch && matchVendor && matchYear && matchMonth;
    });
  }, [spendings, partners, user, searchTerm, selectedVendorFilter, selectedYear, selectedMonthFilter]);

  type SortField = 'invoice_no' | 'vendor' | 'invoice_month' | 'amount' | 'invoice_date' | 'attachment';
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

  const sortedSpendings = useMemo(() => {
    if (!sortField) return filteredSpendings;
    return [...filteredSpendings].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'invoice_no') {
        comparison = (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'vendor') {
        comparison = (a.vendor_name || '').localeCompare(b.vendor_name || '', undefined, { sensitivity: 'base' });
      } else if (sortField === 'invoice_month') {
        const getEarliestMonthDate = (item: PartnerSpending) => {
          if (item.invoice_month && item.invoice_month.length > 0) {
            const dates = item.invoice_month
              .flatMap((m) => parseAllMonths(m).map((p) => p.endOfMonthDate))
              .filter(Boolean)
              .sort();
            if (dates.length > 0) return dates[0];
          }
          return item.invoice_date || '';
        };
        const dateA = getEarliestMonthDate(a);
        const dateB = getEarliestMonthDate(b);
        comparison = dateA.localeCompare(dateB);
      } else if (sortField === 'invoice_date') {
        const dateA = a.invoice_date || '';
        const dateB = b.invoice_date || '';
        comparison = dateA.localeCompare(dateB);
      } else if (sortField === 'amount') {
        const amtA = Number(a.total_amount_usd !== undefined && a.total_amount_usd !== null ? a.total_amount_usd : a.total_amount || 0);
        const amtB = Number(b.total_amount_usd !== undefined && b.total_amount_usd !== null ? b.total_amount_usd : b.total_amount || 0);
        comparison = amtA - amtB;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredSpendings, sortField, sortOrder]);

  const handleDeleteClick = async (id: string) => {
    if (!confirm('Hapus data spending ini?')) return;
    try {
      const res = await fetch(`/api/partner-spendings/${id}?userEmail=${encodeURIComponent(userEmail || '')}&userName=${encodeURIComponent(userName || '')}&userRole=${encodeURIComponent(userRole || '')}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus');
      onRefreshData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  
  const handleExportCSV = () => {
    const headers = [
      'Partner',
      'No. Invoice',
      'Tanggal Invoice',
      'Bulan Invoice (Periode)',
      'Deskripsi Invoice',
      'Currency',
      'Total Amount',
      'Total Amount (USD)',
      'Status Pembayaran',
      'Rekening Bank',
      'Nama Bank',
      'Nama Pemilik Rekening',
      'Link File Invoice',
      'Link File Billing'
    ];
    
    const rows = sortedSpendings.map(c => [
      c.vendor_name || '-',
      c.invoice_number || '-',
      c.invoice_date || '-',
      (c.invoice_month || []).map((m) => formatMonthTagDisplay(m, language)).join('; '),
      c.invoice_description || '-',
      c.currency || '-',
      c.total_amount || 0,
      c.total_amount_usd || 0,
      c.payment_status || '-',
      c.bank_account_number || '-',
      c.bank_name || '-',
      c.bank_account_holder_name || '-',
      c.invoice_file_url || '-',
      c.billing_file_url || '-'
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'partner_spending_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSortHeader = (label: string, field: SortField) => (
    <th
      scope="col"
      aria-sort={sortField === field ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="p-4 text-xs font-bold text-slate-700 dark:text-slate-300 text-left align-middle"
    >
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none rounded py-0.5"
      >
        <span>{label}</span>
        <div className="flex flex-col">
          <ArrowUp
            className={`w-2 h-2 ${
              sortField === field && sortOrder === 'asc' ? 'text-[#06C755]' : 'text-slate-300'
            }`}
          />
          <ArrowDown
            className={`w-2 h-2 -mt-0.5 ${
              sortField === field && sortOrder === 'desc' ? 'text-[#06C755]' : 'text-slate-300'
            }`}
          />
        </div>
      </button>
    </th>
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(sortedSpendings.map(item => item.id || ''));
    else setSelectedRows([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const totalPages = Math.ceil(sortedSpendings.length / rowsPerPage);
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentSpendings = sortedSpendings.slice(indexOfFirst, indexOfLast);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    invoice_no: true,
    vendor: true,
    invoice_month: true,
    invoice_date: true,
    amount: true,
    invoice_doc: true,
    billing_doc: true,
  });
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatMoney = (amount: number, currency = 'IDR') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
    }
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Partner Spending / Invoicing</span>
          </h2>
        </div>
        
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {hasPermission('export.csv') && (
            <button
              onClick={handleExportCSV}
              disabled={sortedSpendings.length === 0}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-600 font-bold flex items-center transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Ekspor CSV"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor CSV</span>
            </button>
          )}

          {user?.department && !isGlobalRole(user?.role) && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Dept: {user.department}</span>
            </div>
          )}
          
          {canCreateContract(user) && (
            <button
              onClick={handleAddNew}
              className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Tambah</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Filter Bar with 3 Dropdowns */}
      {/* Search & Filter Bar - Justified Responsive Grid/Flex */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {/* 1 Box Search */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('spending.search_placeholder', 'Cari invoice, partner, deskripsi...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>
          
          {/* Filter 1: Tahun */}
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">Semua Tahun</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          
          {/* Filter 2: Partner */}
          <select
            value={selectedVendorFilter}
            onChange={(e) => {
              setSelectedVendorFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('spending.all_vendors', 'Semua Partner')}</option>
            {Array.from(new Set(spendings.map(s => s.vendor_name).filter(Boolean))).sort().map(vendor => (
              <option key={vendor} value={vendor}>{vendor}</option>
            ))}
          </select>

          {/* Filter 3: Periode Bulan */}
          <select
            value={selectedMonthFilter}
            onChange={(e) => {
              setSelectedMonthFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">Semua Bulan</option>
            <option value="01">Januari (01)</option>
            <option value="02">Februari (02)</option>
            <option value="03">Maret (03)</option>
            <option value="04">April (04)</option>
            <option value="05">Mei (05)</option>
            <option value="06">Juni (06)</option>
            <option value="07">Juli (07)</option>
            <option value="08">Agustus (08)</option>
            <option value="09">September (09)</option>
            <option value="10">Oktober (10)</option>
            <option value="11">November (11)</option>
            <option value="12">Desember (12)</option>
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
                    if (col === 'invoice_no') label = t('spending.col_invoice_no', 'No. Invoice');
                    else if (col === 'vendor') label = t('spending.col_vendor', 'Partner');
                    else if (col === 'invoice_month') label = t('spending.col_month', 'Periode Bulan');
                    else if (col === 'invoice_date') label = t('spending.col_date', 'Tanggal Invoice');
                    else if (col === 'amount') label = t('spending.col_amount', 'Total Nilai');
                    else if (col === 'invoice_doc') label = t('spending.col_invoice_doc', 'Invoice');
                    else if (col === 'billing_doc') label = t('spending.col_billing_doc', 'Billing');

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

      {/* Table */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua spending"
                      onChange={handleSelectAll}
                      checked={selectedRows.length > 0 && selectedRows.length === currentSpendings.length}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </div>
                </th>
                {visibleColumns.invoice_no && renderSortHeader(t('spending.col_invoice_no', 'No. Invoice'), 'invoice_no')}
                {visibleColumns.vendor && renderSortHeader(t('spending.col_vendor', 'Partner'), 'vendor')}
                {visibleColumns.invoice_month && renderSortHeader(t('spending.col_month', 'Periode Bulan'), 'invoice_month')}
                {visibleColumns.invoice_date && renderSortHeader(t('spending.col_date', 'Tanggal Invoice'), 'invoice_date')}
                {visibleColumns.amount && renderSortHeader(t('spending.col_amount', 'Total Nilai'), 'amount')}
                {visibleColumns.invoice_doc && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('spending.col_invoice_doc', 'Invoice')}</span>
                  </th>
                )}
                {visibleColumns.billing_doc && (
                  <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                    <span>{t('spending.col_billing_doc', 'Billing')}</span>
                  </th>
                )}
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('spending.col_action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {sortedSpendings.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-12 text-center text-slate-400 text-xs font-medium">
                    {t('spending.no_data', 'Belum ada data spending yang tercatat.')}
                  </td>
                </tr>
              ) : (
                currentSpendings.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="pl-6 pr-2 py-4 text-left align-middle">
                      <div className="flex items-center justify-start">
                        <input
                          type="checkbox"
                          aria-label={`Pilih spending ${s.invoice_number || s.vendor_name || ''}`}
                          checked={selectedRows.includes(s.id || '')}
                          onChange={() => handleSelectRow(s.id || '')}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                        />
                      </div>
                    </td>

                    {/* 1. No. Invoice */}
                    {visibleColumns.invoice_no && (
                      <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 text-left whitespace-nowrap">
                        {s.invoice_number}
                      </td>
                    )}

                    {/* 2. Partner */}
                    {visibleColumns.vendor && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                        {s.vendor_name}
                      </td>
                    )}

                    {/* 3. Invoice Month */}
                    {visibleColumns.invoice_month && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                        {s.invoice_month && s.invoice_month.length > 0
                          ? s.invoice_month.map((m) => formatMonthTagDisplay(m, language)).join(', ')
                          : '-'}
                      </td>
                    )}

                    {/* 4. Invoice Date */}
                    {visibleColumns.invoice_date && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                        {s.invoice_date || '-'}
                      </td>
                    )}

                    {/* 5. Amount */}
                    {visibleColumns.amount && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 text-left whitespace-nowrap">
                        {formatMoney(s.total_amount, s.currency || 'IDR')}
                      </td>
                    )}

                    {/* 6. Invoice Doc */}
                    {visibleColumns.invoice_doc && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                        {s.invoice_file_url ? (
                          <a
                            href={s.invoice_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#06C755] hover:text-[#048C3B] font-normal hover:underline"
                          >
                            <FileDown className="w-3.5 h-3.5" /> PDF
                          </a>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                    )}

                    {/* 7. Billing Doc */}
                    {visibleColumns.billing_doc && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 text-left whitespace-nowrap">
                        {s.billing_file_url ? (
                          <a
                            href={s.billing_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#06C755] hover:text-[#048C3B] font-normal hover:underline"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Sheet
                          </a>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                    )}

                    {/* Actions */}
                    <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                      <div className="flex items-center justify-end">
                        <ActionMenu
                          items={[
                            ...(canEditSpending(s, partners, user)
                              ? [
                                  {
                                    label: 'Edit',
                                    icon: <Edit className="w-3.5 h-3.5" />,
                                    onClick: () => handleOpenEditModal(s),
                                  },
                                ]
                              : []),
                            ...(canDeletePartner(user)
                              ? [
                                  {
                                    label: 'Hapus',
                                    icon: <Trash2 className="w-3.5 h-3.5" />,
                                    onClick: () => handleDelete(s.id || ''),
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
                ))
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

      {/* 3. INPUT FORM MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#06C755]" />
                  <span>
                    {editingSpending
                      ? t('spending.modal_edit_title', 'Edit Data Spending')
                      : t('spending.modal_title', 'Input Data Spending')}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1 text-slate-900 dark:text-slate-100">
              {errorMessage && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium rounded-xl">
                  {errorMessage}
                </div>
              )}
              {parseSuccessMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[#048C3B] dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#06C755] shrink-0" />
                  <span>{parseSuccessMsg}</span>
                </div>
              )}

              {/* Vendor Name (Dropdown from existing partners) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('spending.vendor_name_label', 'Vendor Name')} <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formVendorName}
                  onChange={(e) => handleVendorSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800 cursor-pointer"
                >
                  <option value="">{t('spending.vendor_select_ph', '-- Pilih Partner / Vendor --')}</option>
                  {partners.map((p) => (
                    <option key={p.partner_id} value={p.nama_partner}>
                      {p.nama_partner} ({p.partner_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice Number & Invoice Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('spending.invoice_no_label', 'Invoice Number')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={t('spending.invoice_no_ph', 'Contoh: INV-2026-0801')}
                    value={formInvoiceNumber}
                    onChange={(e) => setFormInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800"
                  />
                  {formInvoiceNumber.trim() && spendings.some(s => s.invoice_number.toLowerCase() === formInvoiceNumber.trim().toLowerCase() && (!editingSpending || s.id !== editingSpending.id)) ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1 flex items-center gap-1">
                      <span>💡 Nomor invoice ini sudah dicatat sebelumnya. Diizinkan menginput nomor invoice sama untuk bulan/amount berbeda.</span>
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal mt-1">
                      Dapat menggunakan nomor invoice yang sama untuk billing/bulan yang berbeda.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('spending.invoice_date_label', 'Invoice Date')}
                  </label>
                  <input
                    type="date"
                    value={formInvoiceDate}
                    onChange={(e) => setFormInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800 cursor-pointer"
                  />
                </div>
              </div>

              {/* Invoice Month (Multi MMYYYY Date Picker) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('spending.invoice_month_label', 'Invoice Month')}
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="month"
                      value={monthInput}
                      onChange={(e) => setMonthInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handleAddMonthTag}
                      className="px-3.5 py-2 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 rounded-xl text-xs font-bold hover:bg-[#06C755] hover:text-white transition-colors cursor-pointer shrink-0"
                    >
                      {t('spending.add_month_btn', '+ Tambah Bulan')}
                    </button>
                  </div>

                  {/* Month Tags List */}
                  <div className="flex flex-wrap gap-1.5">
                    {formInvoiceMonths.map((m) => {
                      const displayTag = formatMonthTagDisplay(m);
                      const normDate = normalizeMonthToDate(m);
                      return (
                        <span
                          key={m}
                          className="px-2.5 py-1 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5"
                        >
                          <span>{displayTag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveMonthTag(m)}
                            className="hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Invoice Description (Long Text Format) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('spending.invoice_desc_label', 'Invoice Description')}
                </label>
                <textarea
                  rows={4}
                  placeholder={t('spending.invoice_desc_ph', 'Keterangan lengkap pengeluaran / rincian invoice...')}
                  value={formInvoiceDesc}
                  onChange={(e) => setFormInvoiceDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800 resize-y min-h-[100px]"
                />
              </div>

              {/* Currency & Total Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('spending.currency_label', 'Currency')}</label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('spending.total_amount_label', 'Total Amount')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder={t('spending.total_amount_ph', '150000000')}
                    value={formTotalAmount}
                    onChange={(e) =>
                      setFormTotalAmount(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-extrabold focus:outline-none focus:border-[#06C755] focus:bg-white dark:focus:bg-slate-800"
                  />
                  {formTotalAmount !== '' && Number(formTotalAmount) > 0 && (
                    <p className="text-[10px] text-[#048C3B] dark:text-emerald-400 font-bold mt-1">
                      {formatMoney(Number(formTotalAmount), formCurrency)}
                    </p>
                  )}
                </div>
              </div>

              {/* USD Conversion Info Banner */}
              <div className="bg-[#06C755]/5 dark:bg-emerald-950/20 border border-[#06C755]/20 dark:border-emerald-500/20 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2 mt-4">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Estimasi Konversi USD (Kurs {formInvoiceDate || 'Hari Ini'}):</span>
                  <span className="ml-2 font-bold text-[#06C755] dark:text-emerald-400">
                    {formatMoney(estimatedUsd, 'USD')}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                  {formCurrency === 'USD' ? 'Sama (Mata uang USD)' : `1 ${formCurrency} ≈ ${historicalRate.toFixed(8)} USD`}
                </span>
              </div>

              {/* Bank Account Info Section (Auto-fillable) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#06C755]" />
                  <span>{t('spending.bank_info_title', 'Bank Account Information (Auto-filled if previously entered)')}</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">{t('spending.bank_name_label', 'Bank Name')}</label>
                    <input
                      type="text"
                      placeholder="BCA / Mandiri / BNI"
                      value={formBankName}
                      onChange={(e) => setFormBankName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#06C755]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      {t('spending.bank_account_no_label', 'Account Number')}
                    </label>
                    <input
                      type="text"
                      placeholder="8820123984"
                      value={formBankAccountNumber}
                      onChange={(e) => setFormBankAccountNumber(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#06C755]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      {t('spending.bank_account_holder_label', 'Account Holder')}
                    </label>
                    <input
                      type="text"
                      placeholder="PT Vendor Indonesia"
                      value={formBankAccountHolder}
                      onChange={(e) => setFormBankAccountHolder(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#06C755]"
                    />
                  </div>
                </div>
              </div>

              {/* Upload Invoice File */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('spending.upload_invoice_label', 'Upload Invoice')}
                </label>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#06C755] dark:hover:border-[#06C755] rounded-xl transition-all">
                  <div className="mt-1 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      {invoiceFileObj && (
                        <button
                          type="button"
                          onClick={handleParseSpending}
                          disabled={isParsing}
                          className="py-1.5 px-3 rounded-lg border-0 text-xs font-bold bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-400 hover:bg-[#06C755] hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                          {isParsing ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Mengekstrak...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Parse Invoice AI</span>
                            </>
                          )}
                        </button>
                      )}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onChange={(e) => handleFileChange(e, 'invoice')}
                        className="block text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#EBFBF0] dark:file:bg-emerald-950/60 file:text-[#048C3B] dark:file:text-emerald-400 hover:file:bg-[#06C755] hover:file:text-white file:transition-colors cursor-pointer"
                      />
                    </div>
                    {invoiceFileObj && (
                      <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1 mt-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <span>📄 File terpilih:</span>
                          <span className="font-bold text-slate-900 dark:text-white">{invoiceFileObj.fileName}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload Billing File */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{t('spending.upload_billing_label', 'Upload Billing')}</label>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#06C755] dark:hover:border-[#06C755] rounded-xl transition-all">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => handleFileChange(e, 'billing')}
                    className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#EBFBF0] dark:file:bg-emerald-950/60 file:text-[#048C3B] dark:file:text-emerald-400 hover:file:bg-[#06C755] hover:file:text-white file:transition-colors cursor-pointer"
                  />
                  {billingFileObj && (
                    <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1 mt-2">
                      <p className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span>📄 File terpilih:</span>
                        <span className="font-bold text-slate-900 dark:text-white">{billingFileObj.fileName}</span>
                      </p>
                    </div>
                  )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">
                  {t('form.common.required_hint', 'Lengkapi semua kolom wajib (*) untuk menyimpan')}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {t('spending.cancel_btn', 'Batal')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? t('spending.saving_btn', 'Menyimpan...')
                      : t('spending.save_btn', 'Simpan Spending')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
