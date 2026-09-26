import React, { useState, useEffect, useCallback } from 'react';
import { getActiveFormattingLocale } from '../lib/currencyUtils';
import { Contract, RedlineAnalysisData } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RotateCw,
  X,
  Scale,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

interface ContractRedliningModalProps {
  isOpen: boolean;
  contract: Contract | null;
  onClose: () => void;
  onUpdateContract?: (updated: Contract) => void;
}

export const ContractRedliningModal: React.FC<ContractRedliningModalProps> = ({
  isOpen,
  contract,
  onClose,
  onUpdateContract,
}) => {
  const { t } = useLanguage();
  const [analysis, setAnalysis] = useState<RedlineAnalysisData | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clauses' | 'summary'>('clauses');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [copiedClauseIdx, setCopiedClauseIdx] = useState<number | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [customClauseText, setCustomClauseText] = useState('');

  // Eksekusi analisis redlining (hanya panggil Gemini jika belum ada data atau user klik "Analisis Ulang")
  const executeAnalysis = useCallback(
    async (force: boolean = false) => {
      if (!contract) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contracts/${contract.contract_id}/redline-analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            force,
            customClauseText: customClauseText.trim() || undefined,
          }),
        });

        let data: any = {};
        try {
          data = await res.json();
        } catch {
          if (!res.ok) {
            throw new Error(t('redline.server_error_server_belum_siap_atau', 'Server error ({status}): Server belum siap atau route tidak ditemukan.', { status: res.status }));
          }
        }

        if (!res.ok) {
          throw new Error(data.error || t('redline.gagal_memproses_analisis_redlining', 'Gagal memproses analisis redlining.'));
        }

        if (data.analysis) {
          setAnalysis(data.analysis);
          const at = data.analyzed_at || data.analysis.analyzed_at || new Date().toISOString();
          setAnalyzedAt(at);
          const updatedContract: Contract = {
            ...contract,
            redline_analysis: data.analysis,
            redline_analyzed_at: at,
          };
          onUpdateContract?.(updatedContract);
        }
      } catch (err: any) {
        setError(err.message || t('redline.terjadi_kesalahan_saat_memproses_analisis', 'Terjadi kesalahan saat memproses analisis.'));
      } finally {
        setLoading(false);
      }
    },
    [contract, customClauseText, onUpdateContract]
  );

  // Periksa apakah sudah pernah dijalankan; jika sudah ada gunakan hasil tersimpan
  const checkAndLoadSavedAnalysis = useCallback(async () => {
    if (!contract) return;
    setError(null);

    // 1. Cek langsung pada contract object lokal
    if (contract.redline_analysis) {
      setAnalysis(contract.redline_analysis);
      setAnalyzedAt(contract.redline_analyzed_at || contract.redline_analysis.analyzed_at || null);
      setLoading(false);
      return;
    }

    // 2. Cek ke backend apakah sudah ada di database
    setLoading(true);
    try {
      const res = await fetch(`/api/contracts/${contract.contract_id}/redline-analysis`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasAnalysis && data.analysis) {
          setAnalysis(data.analysis);
          const at = data.analyzed_at || data.analysis.analyzed_at || null;
          setAnalyzedAt(at);
          setLoading(false);
          const updatedContract: Contract = {
            ...contract,
            redline_analysis: data.analysis,
            redline_analyzed_at: at || undefined,
          };
          onUpdateContract?.(updatedContract);
          return;
        }
      }

      // 3. Jika belum pernah dianalisis sama sekali (pertama kali), jalankan analisis otomatis
      await executeAnalysis(false);
    } catch (err: any) {
      setError(err.message || t('redline.gagal_memuat_analisis', 'Gagal memuat analisis.'));
      setLoading(false);
    }
  }, [contract, executeAnalysis, onUpdateContract]);

  useEffect(() => {
    if (isOpen && contract) {
      checkAndLoadSavedAnalysis();
    } else {
      setAnalysis(null);
      setAnalyzedAt(null);
      setError(null);
    }
  }, [isOpen, contract?.contract_id]);

  if (!isOpen || !contract) return null;

  const getRiskScoreColor = (score: number) => {
    if (score <= 25) return 'text-emerald-600 dark:text-emerald-400 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40';
    if (score <= 55) return 'text-amber-600 dark:text-amber-400 border-amber-500 bg-amber-50 dark:bg-amber-950/40';
    if (score <= 75) return 'text-orange-600 dark:text-orange-400 border-orange-500 bg-orange-50 dark:bg-orange-950/40';
    return 'text-rose-600 dark:text-rose-400 border-rose-500 bg-rose-50 dark:bg-rose-950/40';
  };

  const getRiskLevelBadge = (level: string) => {
    switch (level) {
      case 'LOW':
        return (
          <Badge className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 px-3 py-1 font-bold text-xs gap-1.5">
            <ShieldCheck className="size-3.5" />
            {t('redline.risk_level_low', 'Risiko Rendah (Aman)')}
          </Badge>
        );
      case 'MEDIUM':
        return (
          <Badge className="bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 px-3 py-1 font-bold text-xs gap-1.5">
            <AlertTriangle className="size-3.5" />
            {t('redline.risk_level_medium', 'Risiko Sedang (Perlu Penyesuaian)')}
          </Badge>
        );
      case 'HIGH':
        return (
          <Badge className="bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800 px-3 py-1 font-bold text-xs gap-1.5">
            <ShieldAlert className="size-3.5" />
            {t('redline.risk_level_high', 'Risiko Tinggi (Klausul Perlu Diwaspadai)')}
          </Badge>
        );
      case 'CRITICAL':
      default:
        return (
          <Badge className="bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 px-3 py-1 font-bold text-xs gap-1.5">
            <AlertCircle className="size-3.5" />
            {t('redline.risk_level_critical', 'Risiko Kritis (Wajib Negosiasi Ulang)')}
          </Badge>
        );
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'LOW':
        return <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 text-[10px]">{t('redline.low_risk', 'Low Risk')}</Badge>;
      case 'MEDIUM':
        return <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 text-[10px]">{t('redline.medium_risk', 'Medium Risk')}</Badge>;
      case 'HIGH':
        return <Badge className="bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 text-[10px]">{t('redline.high_risk', 'High Risk')}</Badge>;
      case 'CRITICAL':
      default:
        return <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 text-[10px]">{t('redline.filter_critical', 'Critical')}</Badge>;
    }
  };

  const handleCopyClause = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedClauseIdx(index);
    setTimeout(() => setCopiedClauseIdx(null), 2500);
  };

  const handleCopyFullReport = () => {
    if (!analysis) return;
    const reportText = `
=== LAPORAN AI CONTRACT RISK & REDLINING ===
Kontrak: ${contract.nomor_kontrak} - ${contract.judul_kontrak}
Partner: ${contract.partner_nama}
Skor Risiko: ${analysis.overallRiskScore}/100 (${analysis.riskLevel})

--- RINGKASAN EKSEKUTIF ---
${analysis.executiveSummary}

--- TEMUAN UTAMA ---
${analysis.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

--- DAFTAR REKOMENDASI REDLINING KLAUSUL ---
${analysis.analyzedClauses
  .map(
    (c, i) => `
[Klausul ${i + 1}] ${c.clauseTitle} (${c.severity})
• Isu/Asal: ${c.originalTextOrIssue}
• Potensi Risiko: ${c.identifiedRisk}
• Usulan Redline: ${c.recommendedRedline}
• Pertimbangan: ${c.legalRationale}
`
  )
  .join('\n')}
    `.trim();

    navigator.clipboard.writeText(reportText);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 3000);
  };

  const filteredClauses = analysis?.analyzedClauses.filter((c) => {
    if (severityFilter === 'ALL') return true;
    return c.severity === severityFilter;
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-50/60 via-transparent to-transparent dark:from-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-[#06C755]/10 text-[#06C755] flex items-center justify-center border border-[#06C755]/20 shadow-xs">
              <Scale className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {t('redline.modal_title', 'Analisis Risiko & Kepatuhan Klausul Kontrak (Redlining)')}
                </h3>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 tracking-wide">
                  {t('redline.badge_audit', 'Audit Kepatuhan Klausul')}
                </span>
                {analysis && !loading && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                    {analyzedAt
                      ? `${t('redline.saved_indicator', 'Hasil Tersimpan')} • ${new Date(analyzedAt).toLocaleDateString(getActiveFormattingLocale(), {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}`
                      : t('redline.saved_indicator', 'Hasil Tersimpan')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{contract.nomor_kontrak}</span> • {contract.judul_kontrak} ({contract.partner_nama || t('redline.vendor', 'Vendor')})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="relative">
                <div className="size-16 rounded-full border-4 border-[#06C755]/20 border-t-[#06C755] animate-spin" />
                <Scale className="size-6 text-[#06C755] absolute inset-0 m-auto" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  {t('redline.analyzing', 'Menganalisis Kontrak & Memeriksa Risiko...')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  {t('redline.analyzing_desc', 'Sistem membedah klausul, menakar liabilitas hukum, dan menyiapkan rekomendasi redline...')}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-center space-y-3 my-6">
              <AlertCircle className="size-8 text-rose-600 mx-auto" />
              <div>
                <p className="font-bold text-rose-900 dark:text-rose-200 text-sm">{t('redline.analisis_gagal', 'Analisis Gagal')}</p>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => executeAnalysis(true)}
                className="cursor-pointer border-rose-300 text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900"
              >
                <RotateCw className="size-3.5 mr-1.5" />
                {t('redline.coba_lagi', 'Coba Lagi')}
              </Button>
            </div>
          ) : analysis ? (
            <>
              {/* TOP SUMMARY CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Score Card */}
                <div className="md:col-span-4 p-5 rounded-2xl bg-[#F5F6F6] dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('redline.risk_score', 'Skor Risiko Hukum')}
                      </span>
                      <Scale className="size-4 text-slate-400" />
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-4xl font-extrabold tracking-tight ${getRiskScoreColor(analysis.overallRiskScore).split(' ')[0]}`}>
                        {analysis.overallRiskScore}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">/ 100</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60">
                    {getRiskLevelBadge(analysis.riskLevel)}
                  </div>
                </div>

                {/* Executive Summary Card */}
                <div className="md:col-span-8 p-5 rounded-2xl bg-[#F5F6F6] dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Info className="size-3.5 text-[#06C755]" />
                      {t('redline.executive_summary', 'Ringkasan Eksekutif Legal')}
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed line-clamp-4">
                      {analysis.executiveSummary}
                    </p>
                  </div>
                  {analysis.keyFindings && analysis.keyFindings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {analysis.keyFindings.slice(0, 3).map((finding, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                        >
                          ⚠️ {finding}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* TABS HEADER */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('clauses')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      activeTab === 'clauses'
                        ? 'bg-[#06C755] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t('redline.tab_clauses', 'Analisis Klausul & Redlining')} ({analysis.analyzedClauses?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      activeTab === 'summary'
                        ? 'bg-[#06C755] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t('redline.tab_summary', 'Kepatuhan Regulasi & Standar OJK')} ({analysis.complianceChecklist?.length || 0})
                  </button>
                </div>

                {activeTab === 'clauses' && (
                  <div className="flex items-center gap-1">
                    <SlidersHorizontal className="size-3 text-slate-400 mr-1" />
                    {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setSeverityFilter(lvl)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          severityFilter === lvl
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {lvl === 'ALL' ? t('redline.filter_all', 'Semua') : lvl}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TAB 1: CLAUSE ANALYSIS & REDLINING */}
              {activeTab === 'clauses' && (
                <div className="space-y-4">
                  {filteredClauses.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      {t('redline.tidak_ada_klausul_dengan_tingkat_risiko', 'Tidak ada klausul dengan tingkat risiko \'{severityFilter}\'.', { severityFilter })}
                    </div>
                  ) : (
                    filteredClauses.map((clause, idx) => (
                      <Card
                        key={idx}
                        className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs hover:border-[#06C755]/40 transition-colors"
                      >
                        <div className="p-4 space-y-3">
                          {/* Clause Header */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white text-xs">
                                {idx + 1}. {clause.clauseTitle}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                                {clause.riskCategory}
                              </span>
                            </div>
                            <div>{getSeverityBadge(clause.severity)}</div>
                          </div>

                          {/* Original / Issue Box */}
                          <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 text-xs">
                            <p className="font-semibold text-rose-900 dark:text-rose-300 text-[11px] mb-1 flex items-center gap-1">
                              <AlertTriangle className="size-3 text-rose-500" />
                              {t('redline.original_issue', 'Klausul Asal / Masalah Teridentifikasi')}
                            </p>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-mono text-[11px]">
                              {clause.originalTextOrIssue}
                            </p>
                            <p className="text-rose-800 dark:text-rose-400 text-[11px] mt-2 italic">
                              <strong>{t('redline.dampak', 'Dampak:')}</strong> {clause.identifiedRisk}
                            </p>
                          </div>

                          {/* Recommended Redline Box */}
                          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-xs relative group">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-[11px] flex items-center gap-1">
                                <Sparkles className="size-3 text-emerald-500" />
                                {t('redline.recommended_redline', 'Rekomendasi Redlining (Revisi Lebih Adil & Patuh OJK)')}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyClause(clause.recommendedRedline, idx)}
                                className="h-6 px-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer gap-1 rounded-md"
                              >
                                {copiedClauseIdx === idx ? (
                                  <>
                                    <Check className="size-3 text-emerald-600" />
                                    {t('redline.copied', 'Tersalin!')}
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3" />
                                    {t('redline.copy_clause', 'Salin Revisi')}
                                  </>
                                )}
                              </Button>
                            </div>
                            <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium text-xs bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                              "{clause.recommendedRedline}"
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                              <strong>{t('redline.pertimbangan', 'Pertimbangan:')}</strong> {clause.legalRationale}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: COMPLIANCE CHECKLIST (INCL. OJK REGULATIONS) */}
              {activeTab === 'summary' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                    <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">{t('redline.standar_kepatuhan_ojk_regulasi_finansial_korpora', 'Standar Kepatuhan OJK & Regulasi Finansial / Korporasi')}</p>
                      <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                        {t('redline.daftar_periksa_ini_mencakup_pojk_kerja', 'Daftar periksa ini mencakup POJK Kerja Sama Pihak Ketiga, POJK Tata Kelola TI, Hak Audit Regulator OJK, serta kepatuhan UU PDP & KUHPerdata.')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.complianceChecklist?.map((item, idx) => {
                      const isOjkItem = item.item.toUpperCase().includes('OJK') || item.item.toUpperCase().includes('POJK') || item.item.toUpperCase().includes('REGULATOR');
                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-2xl bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-start gap-3 relative overflow-hidden"
                        >
                          {item.status === 'COMPLIANT' ? (
                            <div className="size-7 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle2 className="size-4" />
                            </div>
                          ) : item.status === 'NEEDS_REVIEW' ? (
                            <div className="size-7 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                              <AlertTriangle className="size-4" />
                            </div>
                          ) : (
                            <div className="size-7 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                              <AlertCircle className="size-4" />
                            </div>
                          )}
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-900 dark:text-white text-xs">{item.item}</p>
                              {isOjkItem && (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[9px] font-bold shrink-0">
                                  {t('redline.ojk_standard', 'OJK Standard')}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{item.notes}</p>
                            <div>
                              {item.status === 'COMPLIANT' ? (
                                <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                  {t('redline.memenuhi_standar_kepatuhan', '✓ Memenuhi Standar Kepatuhan')}
                                </span>
                              ) : item.status === 'NEEDS_REVIEW' ? (
                                <span className="inline-flex items-center text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                  {t('redline.perlu_penyesuaian_klausul', '⚠️ Perlu Penyesuaian Klausul')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] font-bold text-rose-700 dark:text-rose-400">
                                  {t('redline.tidak_sesuai_berisiko_regulasi', '✗ Tidak Sesuai / Berisiko Regulasi')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Key Findings List */}
                  <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-2">
                    <p className="font-bold text-amber-900 dark:text-amber-300 text-xs flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5 text-amber-600" />
                      {t('redline.key_findings', 'Temuan Risiko Utama')}
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
                      {analysis.keyFindings?.map((finding, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {finding}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => executeAnalysis(true)}
              disabled={loading}
              className="h-9 px-3 text-xs font-bold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer gap-1.5"
            >
              <RotateCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{t('redline.reanalyze', 'Analisis Ulang')}</span>
            </Button>

            {analysis && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyFullReport}
                className="h-9 px-3 text-xs font-bold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer gap-1.5"
              >
                {copiedFull ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                <span>{copiedFull ? t('redline.copied', 'Tersalin!') : t('redline.copy_full_report', 'Salin Seluruh Laporan')}</span>
              </Button>
            )}
          </div>

          <Button
            size="sm"
            onClick={onClose}
            className="h-9 px-5 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer"
          >
            {t('redline.close', 'Tutup')}
          </Button>
        </div>
      </div>
    </div>
  );
};
