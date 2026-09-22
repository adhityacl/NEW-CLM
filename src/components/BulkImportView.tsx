import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Building2,
  FileText,
  ClipboardCheck,
  CreditCard,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { Partner, Contract, InsertionOrder } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportType = 'partners' | 'contracts' | 'ios' | 'evaluations' | 'spendings';

interface ImportResult {
  rowIndex: number;
  identifier: string;
  message: string;
}

interface ImportReport {
  succeeded: ImportResult[];
  skipped: ImportResult[];
  failed: ImportResult[];
}

interface BulkImportViewProps {
  partners: Partner[];
  contracts: Contract[];
  ios: InsertionOrder[];
  onRefreshData: () => void;
  userEmail: string;
  userName: string;
  userRole: string;
}

// ─── CSV Templates ─────────────────────────────────────────────────────────────

const TEMPLATES: Record<ImportType, { headers: string[]; example: string[] }> = {
  partners: {
    headers: [
      'nama_partner', 'partner_channel', 'internal_pic', 'jenis_partner', 'pic_partner', 'nama_pic', 'email_pic',
      'telepon_pic', 'alamat_pic', 'badan_hukum', 'catatan', 'tags',
    ],
    example: [
      'PT Contoh Mitra Sejati', 'Digital Ads / Media Channel', 'Budi Santoso (Legal)', 'Vendor', 'Budi Santoso', 'Budi Santoso', 'budi@contoh.com',
      '081234567890', 'Jl. Sudirman No. 1', 'BHI', 'Vendor media digital', 'Advertising',
    ],
  },
  contracts: {
    headers: [
      'nomor_kontrak', 'judul_kontrak', 'partner_nama', 'jenis_dokumen', 'kategori_kerjasama',
      'tanggal_mulai', 'tanggal_berakhir', 'currency', 'nilai_kontrak',
      'notice_period_hari', 'notice_type_required', 'pic_internal', 'internal_notes',
    ],
    example: [
      '001/PKS/I/2026', 'Kontrak Kerjasama Media', 'PT Contoh Mitra Sejati', 'Master Agreement',
      'Advertising', '2026-01-01', '2027-01-01', 'IDR', '500000000', '30', 'Both', 'Legal Team', 'Kontrak tahunan',
    ],
  },
  ios: {
    headers: [
      'nomor_io', 'judul_io', 'partner_nama', 'contract_nomor', 'kanal_media',
      'tanggal_mulai', 'tanggal_berakhir', 'pricing_model', 'charging_type', 'currency',
      'nilai_io', 'deliverables', 'notice_period_hari', 'notice_type_required', 'internal_notes',
    ],
    example: [
      'IO-001/2026', 'Campaign Q1 2026', 'PT Contoh Mitra Sejati', '001/PKS/I/2026', 'Social Media',
      '2026-01-01', '2026-03-31', 'Flat Fee', 'Prepaid', 'IDR', '100000000',
      '10 konten/bulan', '14', 'Termination', '',
    ],
  },
  evaluations: {
    headers: [
      'supplier_name', 'review_date', 'type_of_work', 'sla_score',
      'obligation_target', 'incident_frequency', 'communication', 'pricing', 'final_evaluation', 'notes',
    ],
    example: [
      'PT Contoh Mitra Sejati', '2026-06-30', 'Media Placement', '85',
      'Baik', 'Rare', 'Baik', 'Moderate', 'Recommended', 'Performa baik secara keseluruhan',
    ],
  },
  spendings: {
    headers: [
      'vendor_name', 'invoice_number', 'invoice_date', 'invoice_month', 'invoice_description',
      'currency', 'total_amount', 'bank_name', 'bank_account_number', 'bank_account_holder_name',
    ],
    example: [
      'PT Contoh Mitra Sejati', 'INV/2026/001', '2026-01-31', '012026',
      'Biaya media placement Januari 2026', 'IDR', '100000000', 'Bank BCA', '1234567890', 'PT Contoh Mitra Sejati',
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function downloadTemplate(type: ImportType) {
  const { headers, example } = TEMPLATES[type];
  const escape = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  const csvContent = [headers.join(','), example.map(escape).join(',')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `template_import_${type}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const BulkImportView: React.FC<BulkImportViewProps> = ({
  partners,
  contracts,
  ios,
  onRefreshData,
  userEmail,
  userName,
  userRole,
}) => {
  const { t, language } = useLanguage();

  const [activeType, setActiveType] = useState<ImportType>('partners');
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const IMPORT_TYPES: { id: ImportType; label: string; icon: React.FC<{ className?: string }>; color: string }[] = [
    { id: 'partners',    label: t('import.type_partner',    'Partner'),           icon: Building2,     color: 'text-[#06C755]' },
    { id: 'contracts',   label: t('import.type_contract',   'Contract'),          icon: FileText,      color: 'text-blue-500'  },
    { id: 'ios',         label: t('import.type_io',         'IO'),                icon: FileSpreadsheet, color: 'text-purple-500' },
    { id: 'evaluations', label: t('import.type_evaluation', 'Evaluation'),        icon: ClipboardCheck, color: 'text-amber-600 dark:text-amber-400' },
    { id: 'spendings',   label: t('import.type_spending',   'Spending'),          icon: CreditCard,    color: 'text-rose-500'  },
  ];

  const handleTypeChange = (type: ImportType) => {
    setActiveType(type);
    setParsedRows(null);
    setParsedHeaders([]);
    setFileName('');
    setParseError('');
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);
    setParseError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseCSV(text);
      if (!result || result.rows.length === 0) {
        setParseError(t('import.invalid_csv', 'Format CSV tidak valid atau file kosong.'));
        setParsedRows(null);
        return;
      }
      setParsedHeaders(result.headers);
      setParsedRows(result.rows);
    };
    reader.readAsText(file);
  }, [t]);

  const handleImport = async () => {
    if (!parsedRows || parsedRows.length === 0) return;
    setIsImporting(true);
    setReport(null);
    try {
      const res = await fetch('/api/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeType,
          rows: parsedRows,
          userEmail,
          userName,
          userRole,
        }),
      });
      const data = await res.json();
      if (res.ok) { setReport(data); onRefreshData(); }
      else { setParseError(data.error || 'Import gagal.'); }
    } catch (err: any) {
      setParseError(err.message || 'Import gagal.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setParsedRows(null);
    setParsedHeaders([]);
    setFileName('');
    setParseError('');
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const activeTypeInfo = IMPORT_TYPES.find((item) => item.id === activeType)!;

  const RESULT_SECTIONS = [
    {
      key: 'succeeded' as const,
      label: t('import.succeeded', 'Berhasil Dibuat'),
      items: report?.succeeded ?? [],
      count: report?.succeeded.length ?? 0,
      rowClass: 'text-[#048C3B] dark:text-emerald-400',
      headerBg: 'bg-[#EBFBF0] dark:bg-emerald-950/40',
      pillBg: 'bg-[#EBFBF0] dark:bg-emerald-950/40 border-[#06C755]/30',
      icon: <CheckCircle2 className="w-4 h-4 text-[#06C755]" />,
      pillIcon: <CheckCircle2 className="w-6 h-6 text-[#06C755] mb-1" />,
    },
    {
      key: 'skipped' as const,
      label: t('import.skipped', 'Dilewati (Duplikat)'),
      items: report?.skipped ?? [],
      count: report?.skipped.length ?? 0,
      rowClass: 'text-amber-700 dark:text-amber-400',
      headerBg: 'bg-amber-50 dark:bg-amber-950/40',
      pillBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      pillIcon: <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 mb-1" />,
    },
    {
      key: 'failed' as const,
      label: t('import.failed', 'Gagal Diimpor'),
      items: report?.failed ?? [],
      count: report?.failed.length ?? 0,
      rowClass: 'text-rose-700 dark:text-rose-400',
      headerBg: 'bg-rose-50 dark:bg-rose-950/40',
      pillBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/30',
      icon: <XCircle className="w-4 h-4 text-rose-500" />,
      pillIcon: <XCircle className="w-6 h-6 text-rose-500 mb-1" />,
    },
  ];

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 rounded-xl border border-[#06C755]/30 shrink-0">
            <Upload className="w-5 h-5 text-[#06C755]" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('import.title', 'Import Data Massal (Excel / CSV)')}
            </h2>
          </div>
        </div>
      </div>

      {/* ── Type Selector ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          {t('import.select_type', 'Pilih Tipe Data')}
        </p>
        <div className="flex flex-wrap gap-2">
          {IMPORT_TYPES.map((item) => {
            const Icon = item.icon;
            const isActive = activeType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTypeChange(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#06C755] text-white border-[#06C755] shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#06C755]/50 hover:text-[#06C755]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.color}`} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-white" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Template Download + Upload ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">

        {/* Template Download */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 rounded-xl border border-blue-200 dark:border-blue-500/30 shrink-0">
                <Download className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('import.download_template', 'Unduh Template CSV')}
                </h3>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
              <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Kolom Template:</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES[activeType].headers.map((h) => (
                  <span
                    key={h}
                    className="text-[10px] font-semibold bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded-md"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 mt-auto">
            <button
              type="button"
              onClick={() => downloadTemplate(activeType)}
              className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>
                {language === 'ID'
                  ? `Unduh Template ${activeTypeInfo.label}`
                  : `Download ${activeTypeInfo.label} Template`}
              </span>
            </button>
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 rounded-xl border border-[#06C755]/30 shrink-0">
                <Upload className="w-5 h-5 text-[#06C755]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('import.upload_label', 'Unggah File CSV')}
                </h3>
              </div>
            </div>

            <label className="block w-full border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-[#06C755]/60 rounded-xl p-6 text-center cursor-pointer transition-colors group">
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
              <FileSpreadsheet className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2 group-hover:text-[#06C755]/60 transition-colors" />
              {fileName
                ? <p className="text-xs font-bold text-[#048C3B] dark:text-emerald-400 truncate px-2">{fileName}</p>
                : <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('import.choose_file', 'Pilih File CSV')} (.csv)</p>
              }
            </label>

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-400 font-medium">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {parsedRows && parsedRows.length > 0 && !parseError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#EBFBF0] dark:bg-emerald-950/40 border border-[#06C755]/30 text-xs text-[#048C3B] dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{parsedRows.length} {t('import.preview_rows', 'baris data ditemukan')}</span>
              </div>
            )}
          </div>

          <div className="pt-4 mt-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleImport}
                disabled={!parsedRows || parsedRows.length === 0 || isImporting}
                className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-bold bg-[#06C755] hover:bg-[#05B34C] text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>{t('import.importing', 'Mengimpor...')}</span></>
                  : <><Upload className="w-4 h-4" /><span>{t('import.start_import', 'Mulai Import')}</span></>
                }
              </button>
              {(parsedRows || report) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title={t('import.reset', 'Reset & Mulai Lagi')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── CSV Preview ──────────────────────────────────────────────────────── */}
      {parsedRows && parsedRows.length > 0 && !report && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {t('import.preview_title', 'Pratinjau Data CSV')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {parsedRows.length} {t('import.preview_rows', 'baris data ditemukan')} | {fileName}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 w-12">#</th>
                  {parsedHeaders.map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {parsedRows.slice(0, 20).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-medium">{idx + 1}</td>
                    {parsedHeaders.map((h) => (
                      <td key={h} className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={row[h]}>
                        {row[h] || <span className="text-slate-400 dark:text-slate-500">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {parsedRows.length > 20 && (
                  <tr>
                    <td colSpan={parsedHeaders.length + 1} className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400 italic">
                      ... dan {parsedRows.length - 20} baris lainnya tidak ditampilkan di pratinjau
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Import Result Report ─────────────────────────────────────────────── */}
      {report && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-[#EBFBF0] dark:bg-emerald-950/60 rounded-xl border border-[#06C755]/30 shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-[#06C755]" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {t('import.result_title', 'Laporan Hasil Import')}
              </h3>
            </div>
          </div>

          {/* Summary Pills */}
          <div className="p-6 grid grid-cols-3 gap-4">
            {RESULT_SECTIONS.map((s) => (
              <div key={s.key} className={`flex flex-col items-center justify-center p-4 rounded-2xl border gap-1 ${s.pillBg}`}>
                {s.pillIcon}
                <span className={`text-2xl font-extrabold ${s.rowClass}`}>{s.count}</span>
                <span className={`text-[11px] font-bold text-center ${s.rowClass}`}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Detail Tables per category */}
          {RESULT_SECTIONS.filter((s) => s.items.length > 0).map((section) => (
            <div key={section.key} className="border-t border-slate-100 dark:border-slate-800">
              <div className={`px-6 py-3 flex items-center gap-2 ${section.headerBg}`}>
                {section.icon}
                <span className={`text-xs font-extrabold ${section.rowClass}`}>
                  {section.label} ({section.items.length})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-3 font-bold text-slate-500 dark:text-slate-400 w-16">{t('import.col_row', 'Baris')}</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">{t('import.col_identifier', 'Identifikasi')}</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">{t('import.col_reason', 'Keterangan')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {section.items.map((item) => (
                      <tr key={item.rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 font-semibold text-slate-500 dark:text-slate-400">{item.rowIndex}</td>
                        <td className={`px-4 py-3 font-semibold ${section.rowClass} max-w-[250px] truncate`} title={item.identifier}>{item.identifier}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-[400px]">{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button type="button" onClick={handleReset}
              className="flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
              <RotateCcw className="w-4 h-4" />
              <span>{t('import.reset', 'Reset & Mulai Lagi')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

