import React, { useState, useEffect } from 'react';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { InsertionOrder, Contract, Partner, PricingModel, ChargingType } from '../types';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { DateInput } from './DateInput';
import { SUPPORTED_CURRENCIES, currencyLabel, formatMoney, fetchHistoricalRate, getDefaultUsdRate } from '../lib/currencyUtils';
import { formatIOFileName } from '../lib/fileNaming';

interface IOModalProps {
  ioToEdit?: InsertionOrder | null;
  contracts: Contract[];
  partners: Partner[];
  onClose: () => void;
  onSave: (ioData: any) => Promise<void>;
}

export const IOModal: React.FC<IOModalProps> = ({
  ioToEdit,
  contracts,
  partners,
  onClose,
  onSave,
}) => {
  const { t, language } = useLanguage();

  const [contractId, setContractId] = useState(ioToEdit?.contract_id || '');
  const [nomorIO, setNomorIO] = useState(ioToEdit?.nomor_io || '');
  const [partnerId, setPartnerId] = useState(ioToEdit?.partner_id || (partners[0]?.partner_id || ''));
  const [kanalMedia, setKanalMedia] = useState(ioToEdit?.kanal_media || 'Digital Banner & Social Media');

  // Filter contracts based on selected partner
  const availableContracts = React.useMemo(() => {
    if (!partnerId) return [];
    return contracts.filter((c) => c.partner_id === partnerId);
  }, [contracts, partnerId]);

  const handlePartnerChange = (newPartnerId: string) => {
    setPartnerId(newPartnerId);
    if (contractId) {
      const selectedContract = contracts.find((c) => c.contract_id === contractId);
      if (selectedContract && selectedContract.partner_id !== newPartnerId) {
        setContractId('');
      }
    }
  };

  const handleContractChange = (newContractId: string) => {
    setContractId(newContractId);
    if (newContractId) {
      const selectedContract = contracts.find((c) => c.contract_id === newContractId);
      if (selectedContract && selectedContract.partner_id) {
        setPartnerId(selectedContract.partner_id);
      }
    }
  };
  const [tanggalMulai, setTanggalMulai] = useState(ioToEdit?.tanggal_mulai || '2026-08-01');
  const [tanggalBerakhir, setTanggalBerakhir] = useState(ioToEdit?.tanggal_berakhir || '2026-11-30');
  const tenantCurrency = useTenantSettings().policy.settings.defaultCurrency;
  const [currency, setCurrency] = useState<string>(ioToEdit?.currency || tenantCurrency);
  const [nilaiIO, setNilaiIO] = useState<number>(ioToEdit?.nilai_io ?? 0);
  const [historicalRate, setHistoricalRate] = useState<number>(() => getDefaultUsdRate(ioToEdit?.currency || tenantCurrency));

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
    ? Number(nilaiIO || 0)
    : Math.round(Number(nilaiIO || 0) * historicalRate * 100) / 100;

  const getVendorName = (pId: string) => {
    const p = partners.find((item) => item.partner_id === pId);
    return p ? p.nama_partner : 'Vendor';
  };

  const generateAutoTitle = (pId: string, kanal: string, tglMulai: string) => {
    const vendorName = getVendorName(pId);
    const kanalStr = kanal.trim() || 'Kanal';
    return `${vendorName}_IO_${kanalStr}_${tglMulai}`;
  };

  const [isAutoTitle, setIsAutoTitle] = useState(!ioToEdit?.judul_io);
  const [judulIO, setJudulIO] = useState(() => {
    if (ioToEdit?.judul_io) return ioToEdit.judul_io;
    const initialPartnerId = ioToEdit?.partner_id || (partners[0]?.partner_id || '');
    const initialKanal = ioToEdit?.kanal_media || 'Digital Banner & Social Media';
    const initialStartDate = ioToEdit?.tanggal_mulai || '2026-08-01';
    return generateAutoTitle(initialPartnerId, initialKanal, initialStartDate);
  });

  useEffect(() => {
    if (isAutoTitle) {
      setJudulIO(generateAutoTitle(partnerId, kanalMedia, tanggalMulai));
    }
  }, [partnerId, kanalMedia, tanggalMulai, isAutoTitle]);

  const STANDARD_PRICING_MODELS = ['CPM', 'CPC', 'Flat Fee', 'Revenue Share', 'Fixed Package', 'Commission Fee'];
  const initialPricingModel = ioToEdit?.pricing_model || 'CPM';
  const isInitialCustom = Boolean(initialPricingModel && !STANDARD_PRICING_MODELS.includes(initialPricingModel));

  const [pricingModelSelect, setPricingModelSelect] = useState<string>(
    isInitialCustom ? '__CUSTOM__' : initialPricingModel
  );
  const [customPricingModel, setCustomPricingModel] = useState<string>(
    isInitialCustom ? initialPricingModel : ''
  );

  const effectivePricingModel = pricingModelSelect === '__CUSTOM__' ? customPricingModel.trim() : pricingModelSelect;

  const [chargingType, setChargingType] = useState<ChargingType>(ioToEdit?.charging_type || 'Milestone-based');
  const [deliverables, setDeliverables] = useState(
    ioToEdit?.deliverables || 'Guaranteed 5.000.000 Impressions banner 300x250 + 2x Native Advertorial Article'
  );
  const [noticePeriodHari, setNoticePeriodHari] = useState(ioToEdit?.notice_period_hari || 14);

  const [fileName, setFileName] = useState(ioToEdit?.fileName || '');
  const [rawFileName, setRawFileName] = useState(ioToEdit?.fileName || '');
  const [fileData, setFileData] = useState<string | null>(null);
  const [rawFileObj, setRawFileObj] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseSuccessMsg, setParseSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isFormValid = Boolean(
    nomorIO.trim() &&
    judulIO.trim() &&
    partnerId &&
    kanalMedia.trim() &&
    effectivePricingModel &&
    tanggalMulai &&
    tanggalBerakhir &&
    nilaiIO !== undefined && nilaiIO !== null && String(nilaiIO) !== '' &&
    deliverables.trim() &&
    noticePeriodHari !== undefined && noticePeriodHari !== null && String(noticePeriodHari) !== ''
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setError(t('io.ukuran_file_maksimal_20mb', 'Ukuran file maksimal 20MB.'));
        return;
      }
      setRawFileObj(file);
      setRawFileName(file.name);
      const selectedPartner = partners.find((p) => p.partner_id === partnerId);
      const autoRenamed = formatIOFileName({
        partnerName: selectedPartner?.nama_partner,
        mediaChannel: kanalMedia.trim(),
        ioNumber: nomorIO.trim(),
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

  const handleParseIO = async () => {
    if (!fileData && !rawFileObj) {
      setError(t('io.please_upload_a_pdf_file_first', 'Please upload a PDF file first.'));
      return;
    }
    setIsParsing(true);
    setError(null);
    setParseSuccessMsg(null);
    try {
      let response: Response;
      if (rawFileObj) {
        const formData = new FormData();
        formData.append('file', rawFileObj);
        response = await fetch('/api/ios/parse', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/ios/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: fileData })
        });
      }
      const contentType = response.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text && text.trim().startsWith('<') ? t('io.koneksi_ai_server_timeout_atau_sibuk', 'Koneksi AI Server timeout atau sibuk. Silakan coba kembali beberapa saat lagi.') : (text || t('io.gagal_memproses_io', 'Gagal memproses IO')));
      }
      if (!response.ok) {
        throw new Error(result.error || t('io.failed_to_parse_io', 'Failed to parse IO'));
      }
      if (result.success && result.data) {
        const parsed = result.data;
        if (parsed.nomor_io) setNomorIO(parsed.nomor_io);
        if (parsed.judul_io) setJudulIO(parsed.judul_io);
        if (parsed.kanal_media) setKanalMedia(parsed.kanal_media);
        
        if (parsed.pricing_model) {
          const matched = STANDARD_PRICING_MODELS.find(m => m.toLowerCase() === parsed.pricing_model.toLowerCase());
          if (matched) {
            setPricingModelSelect(matched);
          } else {
            setPricingModelSelect('__CUSTOM__');
            setCustomPricingModel(parsed.pricing_model);
          }
        }
        
        if (parsed.tanggal_mulai) setTanggalMulai(parsed.tanggal_mulai);
        if (parsed.tanggal_berakhir) setTanggalBerakhir(parsed.tanggal_berakhir);
        if (parsed.nilai_io !== undefined && parsed.nilai_io !== null) setNilaiIO(Number(parsed.nilai_io) || 0);
        if (parsed.deliverables) setDeliverables(parsed.deliverables);

        // Match partner
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
            setPartnerId(matchedPartner.partner_id);
          }
        }

        // Match contract
        if (parsed.contract_nomor) {
          const rawCtr = parsed.contract_nomor.toLowerCase().trim();
          const matchedContract = contracts.find(c =>
            c.nomor_kontrak && (
              c.nomor_kontrak.toLowerCase().includes(rawCtr) ||
              rawCtr.includes(c.nomor_kontrak.toLowerCase())
            )
          );
          if (matchedContract) {
            setContractId(matchedContract.contract_id);
          }
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
      setError(err.message || t('io.error_parsing_document', 'Error parsing document'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nomorIO.trim()) {
      setError(t('form.io.nomor_io', 'Nomor IO wajib diisi.'));
      return;
    }
    if (!judulIO.trim()) {
      setError(t('form.io.judul_campaign', 'Judul Insertion Order / Campaign wajib diisi.'));
      return;
    }
    if (!partnerId) {
      setError(t('form.io.partner_media', 'Partner / Media Vendor wajib dipilih.'));
      return;
    }
    if (!kanalMedia.trim()) {
      setError(t('form.io.kanal_media', 'Kanal Media / Placement wajib diisi.'));
      return;
    }
    if (!tanggalMulai || !tanggalBerakhir) {
      setError(t('io.tanggal_mulai_dan_tanggal_selesai_wajib', 'Tanggal Mulai dan Tanggal Selesai wajib diisi.'));
      return;
    }
    if (new Date(tanggalBerakhir) <= new Date(tanggalMulai)) {
      setError(t('io.tanggal_berakhir_harus_setelah_tanggal_mulai', 'Tanggal Berakhir harus setelah Tanggal Mulai.'));
      return;
    }
    if (nilaiIO === undefined || nilaiIO === null || isNaN(Number(nilaiIO))) {
      setError(t('form.io.nilai_io', 'Nilai IO wajib diisi.'));
      return;
    }
    if (!effectivePricingModel) {
      setError(t('form.io.pricing_model', 'Pricing Model wajib diisi.'));
      return;
    }
    if (!deliverables.trim()) {
      setError(t('form.io.deliverables', 'Rincian Deliverables wajib diisi.'));
      return;
    }

    setSubmitting(true);

    try {
      const selectedPartner = partners.find((p) => p.partner_id === partnerId);
      let finalFileName = fileName;
      if (fileName) {
        finalFileName = formatIOFileName({
          partnerName: selectedPartner?.nama_partner,
          mediaChannel: kanalMedia.trim(),
          ioNumber: nomorIO.trim(),
          startDate: tanggalMulai,
          rawFileName: fileName,
        });
      }

      await onSave({
        contract_id: contractId || undefined,
        nomor_io: nomorIO.trim(),
        judul_io: judulIO.trim(),
        partner_id: partnerId,
        kanal_media: kanalMedia.trim(),
        tanggal_mulai: tanggalMulai,
        tanggal_berakhir: tanggalBerakhir,
        tanggal_selesai: tanggalBerakhir,
        pricing_model: effectivePricingModel,
        charging_type: chargingType,
        currency,
        nilai_io: Number(nilaiIO),
        nilai_io_usd: estimatedUsd,
        deliverables: deliverables.trim(),
        notice_period_hari: Number(noticePeriodHari),
        notice_type_required: 'Termination',
        fileName: finalFileName,
        fileData,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || t('io.gagal_menyimpan_insertion_order_coba_lagi', 'Gagal menyimpan Insertion Order. Coba lagi.'));
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
              <FileSpreadsheet className="w-5 h-5 text-[#06C755]" />
              <span>
                {ioToEdit?.io_id
                  ? t('form.io.title_edit', 'Edit Insertion Order')
                  : t('form.io.title_add', 'Tambah Insertion Order Baru')}
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
            {/* Row 1: Partner & Induk Kontrak */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.partner_media', 'Partner / Media Vendor *')}
                </label>
                <select
                  value={partnerId}
                  onChange={(e) => handlePartnerChange(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  <option value="">{t('io.pilih_partner_vendor', '-- Pilih Partner / Vendor --')}</option>
                  {partners.map((p) => (
                    <option key={p.partner_id} value={p.partner_id}>
                      {p.nama_partner}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.select_master', 'Pilih Induk Kontrak (Opsional)')}
                </label>
                <select
                  value={contractId}
                  onChange={(e) => handleContractChange(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  <option value="">{t('form.io.standalone_opt', '-- IO Standalone (Tanpa Kontrak Induk) --')}</option>
                  {availableContracts.map((c) => (
                    <option key={c.contract_id} value={c.contract_id}>
                      {c.nomor_kontrak} ({(c.judul_kontrak || '').slice(0, 30)}...)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Nomor IO & Kanal Media */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.nomor_io', 'Nomor IO *')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('form.io.nomor_io_ph', 'contoh: IO/DETIK/2026/012')}
                  value={nomorIO}
                  onChange={(e) => setNomorIO(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.kanal_media', 'Kanal Media / Placement *')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('form.io.kanal_ph', 'contoh: Homepage Masthead & Instagram Live Session')}
                  value={kanalMedia}
                  onChange={(e) => setKanalMedia(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>
            </div>

            {/* Row 3: Judul Insertion Order / Campaign */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                {t('form.io.judul_campaign', 'Judul Insertion Order / Campaign *')}
              </label>
              <input
                type="text"
                required
                placeholder={t('form.io.judul_ph', 'contoh: PT Telkomsel_IO_Digital Banner & Social Media_2026-08-01')}
                value={judulIO}
                onChange={(e) => {
                  setJudulIO(e.target.value);
                  setIsAutoTitle(false);
                }}
                className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
              />
            </div>

            {/* Row 4: Pricing Model & Charging Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.pricing_model', 'Pricing Model *')}
                </label>
                <select
                  value={pricingModelSelect}
                  onChange={(e) => setPricingModelSelect(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  <option value="CPM">{t('io.cpm_cost_per_mille_1_000', 'CPM (Cost Per Mille / 1.000 Impresi)')}</option>
                  <option value="CPC">{t('io.cpc_cost_per_click', 'CPC (Cost Per Click)')}</option>
                  <option value="Flat Fee">{t('io.flat_fee_harga_tetap_paket', 'Flat Fee (Harga Tetap Paket)')}</option>
                  <option value="Revenue Share">{t('io.revenue_share_bagi_hasil', 'Revenue Share (Bagi Hasil)')}</option>
                  <option value="Fixed Package">{t('io.fixed_package', 'Fixed Package')}</option>
                  {isInitialCustom && !STANDARD_PRICING_MODELS.includes(initialPricingModel) && (
                    <option value={initialPricingModel}>{initialPricingModel}</option>
                  )}
                  <option value="__CUSTOM__">{t('io.input_pricing_model_baru_custom', '➕ Input Pricing Model Baru / Custom...')}</option>
                </select>

                {pricingModelSelect === '__CUSTOM__' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      required
                      placeholder={t('form.io.pricing_model_custom_ph', 'Ketik nama pricing model baru (misal: CPA, CPV, Hybrid)...')}
                      value={customPricingModel}
                      onChange={(e) => setCustomPricingModel(e.target.value)}
                      className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#06C755] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.charging_type', 'Skema Penagihan (Charging Type) *')}
                </label>
                <select
                  value={chargingType}
                  onChange={(e) => setChargingType(e.target.value as ChargingType)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  <option value="Prepaid">{t('io.prepaid_bayar_di_awal', 'Prepaid (Bayar di Awal)')}</option>
                  <option value="Postpaid">{t('io.postpaid_bayar_di_akhir_periode', 'Postpaid (Bayar di Akhir Periode)')}</option>
                  <option value="Milestone-based">{t('io.milestone_based_sesuai_tahapan_target', 'Milestone-based (Sesuai Tahapan Target)')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.tanggal_mulai', 'Tanggal Mulai *')}
                </label>
                <DateInput
                  required
                  focusColor="emerald"
                  value={tanggalMulai}
                  onChange={(val) => setTanggalMulai(val)}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.tanggal_selesai', 'Tanggal Selesai *')}
                </label>
                <DateInput
                  required
                  focusColor="emerald"
                  value={tanggalBerakhir}
                  onChange={(val) => setTanggalBerakhir(val)}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.io.currency', 'Mata Uang')}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] transition-all"
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
                  {t('form.io.nilai_io', 'Nilai IO *')}
                </label>
                <input
                  type="number"
                  required
                  value={nilaiIO}
                  onChange={(e) => setNilaiIO(Number(e.target.value))}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>
            </div>

            {/* USD Conversion Info Banner */}
            <div className="bg-[#06C755]/5 dark:bg-emerald-950/20 border border-[#06C755]/20 dark:border-emerald-500/20 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{t('io.estimasi_konversi_usd_kurs', 'Estimasi Konversi USD (Kurs {tanggalMulai}):', { tanggalMulai })}</span>
                <span className="ml-2 font-bold text-[#06C755] dark:text-emerald-400">
                  {formatMoney(estimatedUsd, 'USD')}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                {currency === 'USD' ? t('io.sama_mata_uang_usd', 'Sama (Mata uang USD)') : t('io.1_usd', '1 {currency} ≈ {value} USD', { currency, value: historicalRate.toFixed(8) })}
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                {t('form.io.deliverables', 'Rincian Terstruktur Deliverables *')}
              </label>
              <textarea
                required
                rows={6}
                placeholder={t('form.io.deliverables_ph', 'Sebutkan detail garansi impresi, kuota SMS, tayangan banner, atau jumlah artikel...')}
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                className="w-full min-h-[130px] max-h-[600px] resize-y bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl p-3.5 text-xs text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
              />
            </div>

            {/* File Upload Area */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                {t('form.io.upload_label', 'Dokumen Asli IO (Drive PDF Upload)')}
              </label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#06C755] dark:hover:border-[#06C755] rounded-2xl p-4 text-center bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all">
                <Upload className="w-6 h-6 text-[#06C755] mx-auto mb-1.5" />
                {fileData || fileName ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('io.file_terpilih', '📄 File terpilih:')} <span className="font-normal font-mono text-slate-900 dark:text-white">{rawFileName || fileName}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t('form.io.select_pdf', 'Pilih atau Drag Dokumen Insertion Order ke sini')}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {fileData && (
                    <button
                      type="button"
                      onClick={handleParseIO}
                      disabled={isParsing}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 hover:bg-[#06C755]/20 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isParsing ? t('io.parsing', 'Parsing...') : t('io.parse_file', 'Parse File')}
                    </button>
                  )}
                  <input
                    type="file"
                    accept=".pdf"
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
                  ? t('form.io.saving_btn', 'Menyimpan IO...')
                  : t('form.io.save_btn', 'Simpan Insertion Order')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
