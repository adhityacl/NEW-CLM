import React, { useState, useEffect } from 'react';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { Contract, Partner, NoticeType, JenisDokumenContract, ContractStatus } from '../types';
import { FileText, Upload, Plus, X, Tag, Link2, Shield, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { DateInput } from './DateInput';
import { isGlobalRole } from '../lib/rbacScoping';
import { useDepartments } from '../hooks/useDepartments';
import { getSavedCategories, saveCategory, saveMultipleCategories } from '../lib/categoryUtils';
import { SUPPORTED_CURRENCIES, currencyLabel, formatMoney, fetchHistoricalRate, getDefaultUsdRate } from '../lib/currencyUtils';
import { formatContractFileName } from '../lib/fileNaming';

interface ContractModalProps {
  contractToEdit?: Contract | null;
  partners: Partner[];
  contracts?: Contract[];
  onClose: () => void;
  onSave: (contractData: any) => Promise<void>;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  contractToEdit,
  partners,
  contracts = [],
  onClose,
  onSave,
}) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { departments: ENTERPRISE_DEPARTMENTS } = useDepartments();

  const [jenisDokumen, setJenisDokumen] = useState<JenisDokumenContract>(
    contractToEdit?.jenis_dokumen || 'Master Agreement'
  );
  const [parentContractId, setParentContractId] = useState<string>(
    contractToEdit?.parent_contract_id || ''
  );
  const [nomorKontrak, setNomorKontrak] = useState(contractToEdit?.nomor_kontrak || '');
  const [partnerId, setPartnerId] = useState(contractToEdit?.partner_id || (partners[0]?.partner_id || ''));
  const [kategoriInput, setKategoriInput] = useState('');
  const [kategoriTags, setKategoriTags] = useState<string[]>(
    contractToEdit?.kategori_kerjasama || ['Advertising', 'Content']
  );
  const [savedTemplates, setSavedTemplates] = useState<string[]>(() => {
    const loaded = getSavedCategories();
    if (contractToEdit?.kategori_kerjasama && contractToEdit.kategori_kerjasama.length > 0) {
      return saveMultipleCategories(contractToEdit.kategori_kerjasama);
    }
    return loaded;
  });
  const [tanggalMulai, setTanggalMulai] = useState(contractToEdit?.tanggal_mulai || '2026-08-01');
  const [tanggalBerakhir, setTanggalBerakhir] = useState(contractToEdit?.tanggal_berakhir || '2027-07-31');
  const tenantCurrency = useTenantSettings().policy.settings.defaultCurrency;
  const [currency, setCurrency] = useState<string>(contractToEdit?.currency || tenantCurrency);
  const [nilaiKontrak, setNilaiKontrak] = useState<number>(contractToEdit?.nilai_kontrak ?? 0);
  const [historicalRate, setHistoricalRate] = useState<number>(() => getDefaultUsdRate(contractToEdit?.currency || tenantCurrency));

  useEffect(() => {
    let isMounted = true;
    if (currency === 'USD') {
      setHistoricalRate(1);
      return;
    }
    fetchHistoricalRate(currency, tanggalMulai).then((res) => {
      if (isMounted && res.rate) {
        setHistoricalRate(res.rate);
      }
    });
    return () => { isMounted = false; };
  }, [currency, tanggalMulai]);

  const estimatedUsd = currency === 'USD'
    ? Number(nilaiKontrak || 0)
    : Math.round(Number(nilaiKontrak || 0) * historicalRate * 100) / 100;

  const getVendorName = (pId: string) => {
    const p = partners.find((item) => item.partner_id === pId);
    return p ? p.nama_partner : 'Partner';
  };

  const generateAutoTitle = (
    pId: string,
    jenisDoc: JenisDokumenContract,
    tags: string[],
    tglMulai: string
  ) => {
    const vendorName = getVendorName(pId);
    const docTypeStr = jenisDoc === 'Agreement Addendum' ? 'Addendum Agreement' : 'Master Agreement';
    const tagStr = tags.length > 0 ? tags.join('-') : 'Tag';
    return `${vendorName}_${docTypeStr}_${tagStr}_${tglMulai}`;
  };

  const [isAutoTitle, setIsAutoTitle] = useState(!contractToEdit?.judul_kontrak);
  const [judulKontrak, setJudulKontrak] = useState(() => {
    if (contractToEdit?.judul_kontrak) return contractToEdit.judul_kontrak;
    const initialPartnerId = contractToEdit?.partner_id || (partners[0]?.partner_id || '');
    const initialJenis = contractToEdit?.jenis_dokumen || 'Master Agreement';
    const initialTags = contractToEdit?.kategori_kerjasama || ['Advertising', 'Content'];
    const initialStartDate = contractToEdit?.tanggal_mulai || '2026-08-01';
    return generateAutoTitle(initialPartnerId, initialJenis, initialTags, initialStartDate);
  });

  useEffect(() => {
    if (isAutoTitle) {
      setJudulKontrak(generateAutoTitle(partnerId, jenisDokumen, kategoriTags, tanggalMulai));
    }
  }, [partnerId, jenisDokumen, kategoriTags, tanggalMulai, isAutoTitle]);

  const [autoRenewal, setAutoRenewal] = useState(contractToEdit?.auto_renewal || false);
  const [status, setStatus] = useState<ContractStatus>(
    contractToEdit?.status === 'Terminated' ? 'Terminated' : 'Active'
  );
  const [noticePeriodHari, setNoticePeriodHari] = useState(contractToEdit?.notice_period_hari || 30);
  const [noticeTypeRequired, setNoticeTypeRequired] = useState<NoticeType>(
    contractToEdit?.notice_type_required || 'Termination'
  );
  const [picInternal, setPicInternal] = useState(() => {
    if (contractToEdit?.pic_internal) return contractToEdit.pic_internal;
    const initialPartnerId = contractToEdit?.partner_id || (partners[0]?.partner_id || '');
    const matchedPartner = partners.find((p) => p.partner_id === initialPartnerId);
    return matchedPartner?.pic_internal || user?.department || 'Commercial & Marketing';
  });
  const [internalNotes, setInternalNotes] = useState(
    contractToEdit?.internal_notes || ''
  );

  const [fieldYangBerubah, setFieldYangBerubah] = useState<string[]>(
    contractToEdit?.field_yang_berubah || ['Nilai Kontrak / IO', 'Jangka Waktu Periode']
  );
  const [ringkasanPerubahan, setRingkasanPerubahan] = useState<string>(
    contractToEdit?.ringkasan_perubahan || ''
  );

  const handleFieldToggle = (field: string) => {
    if (fieldYangBerubah.includes(field)) {
      setFieldYangBerubah(fieldYangBerubah.filter((f) => f !== field));
    } else {
      setFieldYangBerubah([...fieldYangBerubah, field]);
    }
  };

  const handleAutoRenewalChange = (checked: boolean) => {
    setAutoRenewal(checked);
    if (checked) {
      if (tanggalMulai && (!tanggalBerakhir || tanggalBerakhir.startsWith('9999'))) {
        // Default to until termination / indefinite if not set or previously indefinite
        const parts = tanggalMulai.split('-').map(Number);
        if (parts.length === 3) {
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          d.setDate(d.getDate() - 1);
          setTanggalBerakhir(
            `9999-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          );
        }
      }
    }
  };

  const availableMasterContracts = contracts.filter((c) => {
    const isMaster = (c.jenis_dokumen || 'Master Agreement') === 'Master Agreement';
    const notSelf = contractToEdit ? c.contract_id !== contractToEdit.contract_id : true;
    const matchPartner = partnerId ? c.partner_id === partnerId : true;
    return isMaster && notSelf && matchPartner;
  });

  const [fileName, setFileName] = useState(contractToEdit?.fileName || '');
  const [rawFileName, setRawFileName] = useState(contractToEdit?.fileName || '');
  const [fileData, setFileData] = useState<string | null>(null);
  const [rawFileObj, setRawFileObj] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isAddendumValid =
    jenisDokumen !== 'Agreement Addendum' ||
    (parentContractId && fieldYangBerubah.length > 0 && ringkasanPerubahan.trim());

  const isFormValid = Boolean(
    nomorKontrak.trim() &&
    judulKontrak.trim() &&
    partnerId &&
    tanggalMulai &&
    tanggalBerakhir &&
    nilaiKontrak !== undefined && nilaiKontrak !== null && String(nilaiKontrak) !== '' &&
    noticePeriodHari !== undefined && noticePeriodHari !== null && String(noticePeriodHari) !== '' &&
    isAddendumValid
  );

  const handleAddTag = () => {
    const trimmed = kategoriInput.trim();
    if (trimmed && !kategoriTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      const updated = saveCategory(trimmed);
      setSavedTemplates(updated);
      setKategoriTags([...kategoriTags, trimmed]);
      setKategoriInput('');
    }
  };

  const [isParsing, setIsParsing] = useState(false);
  const [parseSuccessMsg, setParseSuccessMsg] = useState<string | null>(null);

  const handleParseContract = async () => {
    if (!fileData && !rawFileObj) {
      setError(t('contracts.please_upload_a_pdf_file_first', 'Please upload a PDF file first.'));
      return;
    }
    setIsParsing(true);
    setError(null);
    setParseSuccessMsg(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout
      
      let response: Response;
      if (rawFileObj) {
        const formData = new FormData();
        formData.append('file', rawFileObj);
        response = await fetch('/api/contracts/parse', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
      } else {
        response = await fetch('/api/contracts/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: fileData }),
          signal: controller.signal,
        });
      }
      clearTimeout(timeoutId);
      const contentType = response.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text && text.trim().startsWith('<') ? t('contracts.koneksi_ai_server_timeout_atau_sibuk', 'Koneksi AI Server timeout atau sibuk. Silakan coba kembali beberapa saat lagi.') : (text || t('contracts.gagal_memproses_dokumen', 'Gagal memproses dokumen')));
      }
      if (!response.ok) {
        throw new Error(result.error || t('contracts.failed_to_parse', 'Failed to parse'));
      }
      if (result.success && result.data) {
        const parsed = result.data;
        if (parsed.jenis_dokumen) {
          const docType = parsed.jenis_dokumen.toLowerCase().includes('addendum') ? 'Agreement Addendum' : 'Master Agreement';
          setJenisDokumen(docType as any);
        }
        if (parsed.nomor_kontrak) setNomorKontrak(parsed.nomor_kontrak);
        if (parsed.tanggal_mulai) setTanggalMulai(parsed.tanggal_mulai);
        if (parsed.tanggal_berakhir) setTanggalBerakhir(parsed.tanggal_berakhir);
        if (parsed.nilai_kontrak !== undefined && parsed.nilai_kontrak !== null) setNilaiKontrak(Number(parsed.nilai_kontrak) || 0);
        if (parsed.currency && SUPPORTED_CURRENCIES.some((c) => c.code === String(parsed.currency).toUpperCase())) setCurrency(String(parsed.currency).toUpperCase());
        if (parsed.notice_period_hari !== undefined && parsed.notice_period_hari !== null) setNoticePeriodHari(Number(parsed.notice_period_hari) || 30);
        if (parsed.auto_renewal !== undefined) setAutoRenewal(Boolean(parsed.auto_renewal));
        if (parsed.internal_notes) setInternalNotes(String(parsed.internal_notes).trim());
        if (parsed.ringkasan_perubahan) setRingkasanPerubahan(String(parsed.ringkasan_perubahan).trim());
        if (Array.isArray(parsed.field_yang_berubah) && parsed.field_yang_berubah.length > 0) {
          setFieldYangBerubah(parsed.field_yang_berubah);
        }
        
        // Match partner name intelligently
        let matchedPartnerId = '';
        if (parsed.nama_partner) {
          const rawP = parsed.nama_partner.toLowerCase().trim();
          const cleanP = rawP.replace(/^(pt|cv|ltd|co\.|inc)\s+/i, '').replace(/[\.,]/g, '').trim();
          const matchedPartner = partners.find(p => {
            const cleanTarget = p.nama_partner.toLowerCase().replace(/^(pt|cv|ltd|co\.|inc)\s+/i, '').replace(/[\.,]/g, '').trim();
            return p.nama_partner.toLowerCase().includes(rawP) ||
                   rawP.includes(p.nama_partner.toLowerCase()) ||
                   cleanTarget.includes(cleanP) ||
                   cleanP.includes(cleanTarget);
          });
          if (matchedPartner) {
            matchedPartnerId = matchedPartner.partner_id;
            setPartnerId(matchedPartner.partner_id);
          }
        }

        // Match parent contract if Addendum
        if (parsed.nomor_kontrak_induk) {
          const rawInduk = parsed.nomor_kontrak_induk.toLowerCase().trim();
          const matchedMaster = contracts.find(c => 
            c.nomor_kontrak && (
              c.nomor_kontrak.toLowerCase().includes(rawInduk) ||
              rawInduk.includes(c.nomor_kontrak.toLowerCase())
            )
          );
          if (matchedMaster) {
            setParentContractId(matchedMaster.contract_id);
            if (!matchedPartnerId && matchedMaster.partner_id) {
              setPartnerId(matchedMaster.partner_id);
            }
          }
        }

        if (parsed.judul_kontrak) {
          setIsAutoTitle(false);
          setJudulKontrak(parsed.judul_kontrak);
        }

        if (result.cached) {
          setParseSuccessMsg(`⚡ Auto-fill didapat instan dari Cache SHA-256 dokumen!`);
          setTimeout(() => setParseSuccessMsg(null), 6000);
        } else if (result.performance) {
          setParseSuccessMsg(`⚡ Auto-fill berhasil diekstrak dalam ${(result.performance.durationMs / 1000).toFixed(1)}s! (${result.performance.processedPages} dari ${result.performance.originalPages} halaman penting dianalisis)`);
          setTimeout(() => setParseSuccessMsg(null), 6000);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError(t('contracts.parsing_timeout_server_terlalu_lama_merespon', 'Parsing timeout, server terlalu lama merespon. Silakan coba lagi.'));
      } else {
        setError(err.message || t('contracts.error_parsing_document', 'Error parsing document'));
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setKategoriTags(kategoriTags.filter((t) => t !== tag));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setError(t('contracts.ukuran_file_maksimal_20mb', 'Ukuran file maksimal 20MB.'));
        return;
      }
      setRawFileObj(file);
      setRawFileName(file.name);
      const selectedPartner = partners.find((p) => p.partner_id === partnerId);
      const autoRenamed = formatContractFileName({
        partnerName: selectedPartner?.nama_partner,
        documentType: jenisDokumen,
        contractNumber: nomorKontrak.trim(),
        startDate: tanggalMulai,
        rawFileName: file.name,
      });
      setFileName(autoRenamed);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!partnerId) {
      setError(t('form.contract.partner_vendor', 'Partner wajib dipilih.'));
      return;
    }
    if (jenisDokumen === 'Agreement Addendum') {
      if (!parentContractId) {
        setError(t('form.contract.no_master_warning', 'Harap pilih partner lain atau buat Master Agreement terlebih dahulu.'));
        return;
      }
      if (fieldYangBerubah.length === 0) {
        setError(t('contracts.pilih_minimal_1_elemen_field_yang', 'Pilih minimal 1 elemen / field yang berubah untuk Agreement Addendum.'));
        return;
      }
      if (!ringkasanPerubahan.trim()) {
        setError(t('contracts.ringkasan_detail_track_change_perubahan_wajib', 'Ringkasan detail track-change perubahan wajib diisi untuk Agreement Addendum.'));
        return;
      }
    }
    if (!nomorKontrak.trim()) {
      setError(t('form.contract.nomor_kontrak', 'Nomor Kontrak Legal wajib diisi.'));
      return;
    }
    if (!judulKontrak.trim()) {
      setError(t('form.contract.judul_kontrak', 'Judul Perjanjian Kontrak wajib diisi.'));
      return;
    }
    if (!tanggalMulai || !tanggalBerakhir) {
      setError(t('contracts.tanggal_mulai_dan_tanggal_berakhir_wajib', 'Tanggal Mulai dan Tanggal Berakhir wajib diisi.'));
      return;
    }
    if (new Date(tanggalBerakhir) <= new Date(tanggalMulai)) {
      setError(t('contracts.tanggal_berakhir_harus_setelah_tanggal_mulai', 'Tanggal Berakhir harus setelah Tanggal Mulai.'));
      return;
    }

    setSubmitting(true);

    try {
      const selectedMaster = availableMasterContracts.find((c) => c.contract_id === parentContractId);
      const selectedPartner = partners.find((p) => p.partner_id === partnerId);

      let finalFileName = fileName;
      if (fileName) {
        finalFileName = formatContractFileName({
          partnerName: selectedPartner?.nama_partner,
          documentType: jenisDokumen,
          contractNumber: nomorKontrak.trim(),
          startDate: tanggalMulai,
          rawFileName: fileName,
        });
      }

      if (kategoriTags.length > 0) {
        saveMultipleCategories(kategoriTags);
      }

      await onSave({
        jenis_dokumen: jenisDokumen,
        parent_contract_id: jenisDokumen === 'Agreement Addendum' ? parentContractId : undefined,
        parent_contract_nomor:
          jenisDokumen === 'Agreement Addendum' ? selectedMaster?.nomor_kontrak : undefined,
        nomor_kontrak: nomorKontrak.trim(),
        judul_kontrak: judulKontrak.trim(),
        partner_id: partnerId,
        kategori_kerjasama: kategoriTags,
        tanggal_mulai: tanggalMulai,
        tanggal_berakhir: tanggalBerakhir,
        currency,
        nilai_kontrak: Number(nilaiKontrak),
        nilai_kontrak_usd: estimatedUsd,
        auto_renewal: autoRenewal,
        notice_period_hari: Number(noticePeriodHari),
        notice_type_required: noticeTypeRequired,
        status,
        pic_internal: (contractToEdit?.pic_internal || selectedPartner?.pic_internal || selectedPartner?.internal_pic || user?.department || 'Commercial & Marketing').trim(),
        internal_notes: internalNotes.trim(),
        field_yang_berubah: jenisDokumen === 'Agreement Addendum' ? fieldYangBerubah : undefined,
        ringkasan_perubahan: jenisDokumen === 'Agreement Addendum' ? ringkasanPerubahan.trim() : undefined,
        fileName: finalFileName,
        fileData,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || t('contracts.gagal_menyimpan_data_kontrak_coba_lagi', 'Gagal menyimpan data kontrak. Coba lagi.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#06C755]" />
              <span>
                {contractToEdit?.contract_id
                  ? (jenisDokumen === 'Agreement Addendum'
                      ? t('form.contract.title_edit_addendum', 'Edit Agreement Addendum')
                      : t('form.contract.title_edit_master', 'Edit Kontrak Induk'))
                  : (jenisDokumen === 'Agreement Addendum'
                      ? t('form.contract.title_add_addendum', 'Buat & Upload Agreement Addendum Baru')
                      : t('form.contract.title_add_master', 'Buat & Upload Kontrak Baru'))}
              </span>
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1 text-slate-900 dark:text-slate-100">
            {/* Document Type Selection & Parent Contract Selector */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                    {t('form.contract.jenis_dokumen', 'Jenis Dokumen Perjanjian *')}
                  </label>
                  <select
                    value={jenisDokumen}
                    onChange={(e) => setJenisDokumen(e.target.value as JenisDokumenContract)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                  >
                    <option value="Master Agreement">
                      {t('form.contract.master_agreement_opt', 'Master Agreement (Kontrak Induk Utama)')}
                    </option>
                    <option value="Agreement Addendum">
                      {t('form.contract.agreement_addendum_opt', 'Agreement Addendum (Perubahan / Adendum)')}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                    {t('form.contract.partner_vendor', 'Partner *')}
                  </label>
                  <select
                    value={partnerId}
                    onChange={(e) => {
                      setPartnerId(e.target.value);
                      setParentContractId('');
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                  >
                    {partners.map((p) => (
                      <option key={p.partner_id} value={p.partner_id}>
                        {p.nama_partner} ({p.jenis_partner})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Referensi Master Agreement Field - Active when Agreement Addendum is chosen */}
              {jenisDokumen === 'Agreement Addendum' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 space-y-3">
                  <div>
                    <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5 text-xs">
                      <Link2 className="w-4 h-4 text-[#06C755]" />
                      <span>{t('form.contract.ref_master_agreement', 'Referensi Master Agreement (Kontrak Induk) *')}</span>
                    </label>
                    {availableMasterContracts.length === 0 ? (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs font-semibold">
                        {t('form.contract.no_master_warning', 'Harap pilih partner lain atau buat Master Agreement terlebih dahulu.')}
                      </div>
                    ) : (
                      <select
                        required={jenisDokumen === 'Agreement Addendum'}
                        value={parentContractId}
                        onChange={(e) => setParentContractId(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                      >
                        <option value="">{t('form.contract.select_master_placeholder', '-- Pilih Master Agreement Induk --')}</option>
                        {availableMasterContracts.map((m) => (
                          <option key={m.contract_id} value={m.contract_id}>
                            {m.nomor_kontrak} | {m.judul_kontrak}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-xl space-y-3">
                    <div>
                      <label className="block font-bold text-amber-950 dark:text-amber-300 mb-1.5 text-xs">
                        {t('form.contract.changed_fields', 'Elemen / Field Yang Berubah *')}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'Nilai Kontrak / IO',
                          'Jangka Waktu Periode',
                          'Ruang Lingkup / Deliverables',
                          'Syarat Pembayaran',
                          'Pihak Berwenang',
                        ].map((f) => {
                          const isSelected = fieldYangBerubah.includes(f);
                          return (
                            <button
                              type="button"
                              key={f}
                              onClick={() => handleFieldToggle(f)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer select-none transition-colors ${
                                isSelected
                                  ? 'bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border-[#06C755]/50 dark:border-emerald-500/50 font-bold'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                              }`}
                            >
                              {isSelected ? '✓ ' : '+ '}
                              {f}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-amber-950 dark:text-amber-300 mb-1.5 text-xs">
                        {t('form.contract.track_change_summary', 'Ringkasan Detail Track-Change Perubahan * (Wajib)')}
                      </label>
                      <textarea
                        required
                        rows={3}
                        placeholder={t('form.contract.track_change_placeholder', 'Jelaskan secara eksplisit nilai lama -> nilai baru, tanggal lama -> tanggal baru, atau perubahan pasal...')}
                        value={ringkasanPerubahan}
                        onChange={(e) => setRingkasanPerubahan(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {jenisDokumen === 'Agreement Addendum'
                    ? t('form.contract.nomor_addendum', 'Nomor Addendum *')
                    : t('form.contract.nomor_kontrak', 'Nomor Kontrak Legal *')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    jenisDokumen === 'Agreement Addendum'
                      ? t('contracts.contoh_01_add_its_xi_2024', 'contoh: 01/ADD-ITS/XI/2024 atau 01A/ADD-ITS/I/2023')
                      : t('contracts.contoh_01_pks_its_xi_2024', 'contoh: 01/PKS-ITS/XI/2024 atau 52/PKS-ITS/VII/2025')
                  }
                  value={nomorKontrak}
                  onChange={(e) => setNomorKontrak(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {jenisDokumen === 'Agreement Addendum'
                    ? t('form.contract.judul_addendum', 'Judul Perjanjian Addendum *')
                    : t('form.contract.judul_kontrak', 'Judul Perjanjian Kontrak *')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('form.contract.judul_ph', 'contoh: PT Telkomsel_Master Agreement_Advertising-Content_2026-08-01')}
                  value={judulKontrak}
                  onChange={(e) => {
                    setJudulKontrak(e.target.value);
                    setIsAutoTitle(false);
                  }}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>
            </div>

            {/* Kategori Tags */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                {t('form.contract.kategori_tag', 'Kategori Kerjasama Tag *')}
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  list="contract-category-templates-list"
                  placeholder={t('form.partner.tag_placeholder', 'Tambah tag kategori (mis. Advertising, IT, Logistics)...')}
                  value={kategoriInput}
                  onChange={(e) => setKategoriInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
                <datalist id="contract-category-templates-list">
                  {savedTemplates.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shrink-0"
                >
                  {t('form.partner.add_tag_btn', 'Tambah Tag')}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {kategoriTags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-[#EBFBF0] dark:bg-emerald-950/50 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-[#06C755] hover:text-[#048C3B] dark:hover:text-emerald-200 font-extrabold cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.contract.tanggal_mulai', 'Tanggal Mulai *')}
                </label>
                <DateInput
                  required
                  focusColor="emerald"
                  value={tanggalMulai}
                  onChange={(val) => setTanggalMulai(val)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs">
                    {t('form.contract.tanggal_berakhir', 'Tanggal Berakhir *')}
                  </label>
                  {autoRenewal && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      {t('contracts.auto_renewal', 'Auto-Renewal')}
                    </span>
                  )}
                </div>
                <DateInput
                  required
                  focusColor="emerald"
                  value={tanggalBerakhir}
                  onChange={(val) => setTanggalBerakhir(val)}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.contract.currency', 'Mata Uang')}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] transition-all"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {currencyLabel(c.code, language)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.contract.nilai_kontrak', 'Nilai Kontrak *')}
                </label>
                <input
                  type="number"
                  required
                  value={nilaiKontrak}
                  onChange={(e) => setNilaiKontrak(Number(e.target.value))}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>
            </div>

            {/* USD Conversion Info Banner */}
            <div className="bg-[#06C755]/5 dark:bg-emerald-950/20 border border-[#06C755]/20 dark:border-emerald-500/20 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{t('contracts.estimasi_konversi_usd_kurs', 'Estimasi Konversi USD (Kurs {tanggalMulai}):', { tanggalMulai })}</span>
                <span className="ml-2 font-bold text-[#06C755] dark:text-emerald-400">
                  {formatMoney(estimatedUsd, 'USD')}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                {currency === 'USD' ? t('contracts.sama_mata_uang_usd', 'Sama (Mata uang USD)') : t('contracts.1_usd', '1 {currency} ≈ {value} USD', { currency, value: historicalRate.toFixed(8) })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.contract.masa_notice', 'Masa Notice (Hari) *')}
                </label>
                <input
                  type="number"
                  required
                  value={noticePeriodHari}
                  onChange={(e) => setNoticePeriodHari(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.contract.notice_type', 'Notice Type Required *')}
                </label>
                <select
                  value={noticeTypeRequired}
                  onChange={(e) => setNoticeTypeRequired(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  <option value="Termination">{t('contracts.notice_of_termination', 'Notice of Termination')}</option>
                  <option value="Extension">{t('contracts.notice_of_extension', 'Notice of Extension')}</option>
                  <option value="Both">{t('contracts.keduanya_termination_extension', 'Keduanya (Termination & Extension)')}</option>
                  <option value="None">{t('common.none', 'None')}</option>
                </select>
              </div>
              <div className="flex items-center pt-4 sm:pt-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoRenewal}
                    onChange={(e) => handleAutoRenewalChange(e.target.checked)}
                    className="w-4 h-4 text-[#06C755] rounded border-slate-300 dark:border-slate-700 focus:ring-[#06C755]"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    {t('form.contract.auto_renewal', 'Auto Renewal')}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                {t('form.contract.status_kontrak', 'Status Kontrak *')}
              </label>
              <select
                value={status === 'Terminated' ? 'Terminated' : 'Active'}
                onChange={(e) => setStatus(e.target.value as ContractStatus)}
                className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
              >
                <option value="Active">{t('form.contract.status_normal', 'Normal (Sesuai tanggal berlaku)')}</option>
                <option value="Terminated">{t('form.contract.status_terminated', 'Dihentikan (Penghentian Perjanjian)')}</option>
              </select>
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                {t('form.contract.internal_notes', 'Internal Notes')}
              </label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={5}
                placeholder={t('form.contract.internal_notes_placeholder', 'Rangkuman kontrak...')}
                className="w-full min-h-[110px] max-h-[500px] resize-y bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium leading-relaxed focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
              />
            </div>

            {/* File Upload Area */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                {t('form.contract.upload_label', 'Dokumen Asli Kontrak (Drive PDF Upload)')}
              </label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#06C755] dark:hover:border-[#06C755] rounded-2xl p-4 text-center bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all">
                <Upload className="w-6 h-6 text-[#06C755] mx-auto mb-1.5" />
                {fileData || fileName ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('contracts.file_terpilih', '📄 File terpilih:')} <span className="font-normal font-mono text-slate-900 dark:text-white">{rawFileName || fileName}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t('form.contract.drag_pdf', 'Pilih atau Drag Dokumen Kontrak ke sini')}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {fileData && (
                    <button
                      type="button"
                      onClick={handleParseContract}
                      disabled={isParsing}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 hover:bg-[#06C755]/20 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isParsing ? t('contracts.parsing', 'Parsing...') : t('contracts.parse_file', 'Parse File')}
                    </button>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileChange}
                    className="w-[220px] text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#EBFBF0] dark:file:bg-emerald-950/60 file:text-[#048C3B] dark:file:text-emerald-400 hover:file:bg-[#06C755]/20 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {parseSuccessMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <span>{parseSuccessMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">
              {t('form.common.required_hint', 'Lengkapi semua kolom wajib (*) untuk menyimpan')}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {t('form.common.cancel', 'Batal')}
              </button>
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                title={!isFormValid ? t('form.common.required_hint', 'Lengkapi semua kolom wajib (*) untuk menyimpan') : ''}
                className="px-5 py-2.5 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? t('form.contract.saving_btn', 'Menyimpan Kontrak...')
                  : t('form.contract.save_btn', 'Simpan Data Kontrak')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
