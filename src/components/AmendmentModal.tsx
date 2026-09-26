import { useLanguage } from '../context/LanguageContext';
import React, { useState } from 'react';
import { Contract, InsertionOrder } from '../types';
import { GitCommit, Upload, X } from 'lucide-react';
import { DateInput } from './DateInput';
import { formatContractFileName, formatIOFileName } from '../lib/fileNaming';

interface AmendmentModalProps {
  initialParent?: Contract | InsertionOrder;
  contracts: Contract[];
  ios: InsertionOrder[];
  onClose: () => void;
  onSave: (amendmentData: any) => Promise<void>;
}

export const AmendmentModal: React.FC<AmendmentModalProps> = ({
  initialParent,
  contracts,
  ios,
  onClose,
  onSave,
}) => {
  const { t } = useLanguage();
  const isInitialIO = initialParent && 'io_id' in initialParent;
  const [parentType, setParentType] = useState<'Contract' | 'IO'>(isInitialIO ? 'IO' : 'Contract');
  const [parentId, setParentId] = useState<string>(
    initialParent
      ? 'contract_id' in initialParent
        ? initialParent.contract_id
        : initialParent.io_id
      : contracts[0]?.contract_id || ''
  );

  const [nomorAddendum, setNomorAddendum] = useState(`ADD/01/${Date.now().toString().slice(-6)}`);
  const [tanggalAddendum, setTanggalAddendum] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFields, setSelectedFields] = useState<string[]>(['Nilai Kontrak', 'Jangka Waktu']);
  const [ringkasanPerubahan, setRingkasanPerubahan] = useState('');

  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseSuccessMsg, setParseSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParseAmendment = async () => {
    if (!fileData) {
      setError(t('amendments.please_upload_a_pdf_file_first', 'Please upload a PDF file first.'));
      return;
    }
    setIsParsing(true);
    setError(null);
    setParseSuccessMsg(null);
    try {
      const response = await fetch('/api/contracts/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: fileData })
      });
      const contentType = response.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text && text.trim().startsWith('<') ? t('amendments.koneksi_ai_server_timeout_atau_sibuk', 'Koneksi AI Server timeout atau sibuk. Silakan coba kembali beberapa saat lagi.') : (text || t('amendments.gagal_memproses_dokumen', 'Gagal memproses dokumen')));
      }
      if (!response.ok) {
        throw new Error(result.error || t('amendments.failed_to_parse_document', 'Failed to parse document'));
      }
      if (result.success && result.data) {
        const parsed = result.data;
        if (parsed.nomor_kontrak) setNomorAddendum(parsed.nomor_kontrak);
        if (parsed.tanggal_mulai) setTanggalAddendum(parsed.tanggal_mulai);
        if (parsed.ringkasan_perubahan) setRingkasanPerubahan(parsed.ringkasan_perubahan);
        if (Array.isArray(parsed.field_yang_berubah) && parsed.field_yang_berubah.length > 0) {
          setSelectedFields(parsed.field_yang_berubah);
        }

        // Match parent contract if available
        if (parsed.nomor_kontrak_induk) {
          const rawInduk = parsed.nomor_kontrak_induk.toLowerCase().trim();
          const matchedContract = contracts.find(c => 
            c.nomor_kontrak && (
              c.nomor_kontrak.toLowerCase().includes(rawInduk) ||
              rawInduk.includes(c.nomor_kontrak.toLowerCase())
            )
          );
          if (matchedContract) {
            setParentType('Contract');
            setParentId(matchedContract.contract_id);
          }
        }

        if (result.performance) {
          setParseSuccessMsg(`⚡ Auto-fill berhasil diekstrak dalam ${(result.performance.durationMs / 1000).toFixed(1)}s!`);
          setTimeout(() => setParseSuccessMsg(null), 6000);
        }
      }
    } catch (err: any) {
      setError(err.message || t('amendments.gagal_memproses_dokumen_2', 'Gagal memproses dokumen.'));
    } finally {
      setIsParsing(false);
    }
  };

  const isFormValid = Boolean(
    parentId &&
    nomorAddendum.trim() &&
    tanggalAddendum &&
    selectedFields.length > 0 &&
    ringkasanPerubahan.trim()
  );

  const handleFieldToggle = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter((f) => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
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

    if (!parentId) {
      setError(t('amendments.pilih_perjanjian_induk_terlebih_dahulu', 'Pilih Perjanjian Induk terlebih dahulu.'));
      return;
    }
    if (!nomorAddendum.trim()) {
      setError(t('amendments.nomor_addendum_wajib_diisi', 'Nomor Addendum wajib diisi.'));
      return;
    }
    if (!tanggalAddendum) {
      setError(t('amendments.tanggal_addendum_wajib_diisi', 'Tanggal Addendum wajib diisi.'));
      return;
    }
    if (selectedFields.length === 0) {
      setError(t('amendments.pilih_minimal_1_elemen_field_yang', 'Pilih minimal 1 elemen / field yang berubah.'));
      return;
    }
    if (!ringkasanPerubahan.trim()) {
      setError(t('amendments.ringkasan_detail_track_change_perubahan_wajib', 'Ringkasan detail track-change perubahan wajib diisi dengan jelas.'));
      return;
    }

    setSubmitting(true);

    let finalFileName = fileName;
    if (fileName) {
      if (parentType === 'Contract') {
        const parentContract = contracts.find((c) => c.contract_id === parentId);
        finalFileName = formatContractFileName({
          partnerName: parentContract?.partner_nama,
          documentType: 'Agreement Addendum',
          contractNumber: nomorAddendum.trim(),
          startDate: tanggalAddendum,
          rawFileName: fileName,
        });
      } else {
        const parentIO = ios.find((i) => i.io_id === parentId);
        finalFileName = formatIOFileName({
          partnerName: parentIO?.partner_nama,
          mediaChannel: parentIO?.kanal_media || 'Addendum',
          ioNumber: nomorAddendum.trim(),
          startDate: tanggalAddendum,
          rawFileName: fileName,
        });
      }
    }

    await onSave({
      parent_type: parentType,
      parent_id: parentId,
      nomor_addendum: nomorAddendum.trim(),
      tanggal_addendum: tanggalAddendum,
      field_yang_berubah: selectedFields,
      ringkasan_perubahan: ringkasanPerubahan.trim(),
      fileName: finalFileName,
      fileData,
    });

    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <GitCommit className="w-5 h-5 text-[#06C755]" />
              <span>{t('amendments.tambah_addendum_amendment_baru', 'Tambah Addendum / Amendment Baru')}</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">{t('amendments.tipe_induk_perjanjian', 'Tipe Induk Perjanjian *')}</label>
                <select
                  value={parentType}
                  onChange={(e) => {
                    const val = e.target.value as 'Contract' | 'IO';
                    setParentType(val);
                    setParentId(val === 'Contract' ? contracts[0]?.contract_id || '' : ios[0]?.io_id || '');
                  }}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  <option value="Contract">{t('amendments.kontrak_utama_master_contract', 'Kontrak Utama (Master Contract)')}</option>
                  <option value="IO">{t('import.type_io', 'Insertion Order (IO)')}</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">{t('amendments.pilih_perjanjian_induk', 'Pilih Perjanjian Induk *')}</label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                >
                  {parentType === 'Contract'
                    ? contracts.map((c) => (
                        <option key={c.contract_id} value={c.contract_id}>
                          {c.nomor_kontrak} ({c.partner_nama})
                        </option>
                      ))
                    : ios.map((i) => (
                        <option key={i.io_id} value={i.io_id}>
                          {i.nomor_io} ({i.partner_nama})
                        </option>
                      ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">{t('form.contract.nomor_addendum', 'Nomor Addendum *')}</label>
                <input
                  type="text"
                  required
                  value={nomorAddendum}
                  onChange={(e) => setNomorAddendum(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">{t('amendments.tanggal_addendum', 'Tanggal Addendum *')}</label>
                <DateInput
                  required
                  value={tanggalAddendum}
                  onChange={(val) => setTanggalAddendum(val)}
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">{t('form.contract.changed_fields', 'Elemen / Field Yang Berubah *')}</label>
              <div className="flex flex-wrap gap-1.5">
                {['Nilai Kontrak / IO', 'Jangka Waktu Periode', 'Ruang Lingkup / Deliverables', 'Syarat Pembayaran', 'Pihak Berwenang'].map(
                  (f) => (
                    <label
                      key={f}
                      onClick={() => handleFieldToggle(f)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer select-none transition-all ${
                        selectedFields.includes(f)
                          ? 'bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border-[#06C755]/40 dark:border-emerald-500/40 font-bold'
                          : 'bg-[#F7F8FA] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-[#E5E8EB] dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {selectedFields.includes(f) ? '✓ ' : '+ '}
                      {f}
                    </label>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                {t('form.contract.track_change_summary', 'Ringkasan Detail Track-Change Perubahan * (Wajib)')}
              </label>
              <textarea
                required
                rows={4}
                placeholder={t('form.amendment.notes_ph', 'Jelaskan secara eksplisit nilai lama -> nilai baru, tanggal lama -> tanggal baru, atau perubahan pasal...')}
                value={ringkasanPerubahan}
                onChange={(e) => setRingkasanPerubahan(e.target.value)}
                className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl p-3.5 text-slate-900 dark:text-slate-100 text-xs leading-relaxed focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">{t('amendments.file_dokumen_addendum_pdf_drive_upload', 'File Dokumen Addendum PDF (Drive Upload)')}</label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#06C755] dark:hover:border-[#06C755] rounded-2xl p-4 text-center bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all">
                <Upload className="w-6 h-6 text-[#06C755] mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {fileName ? t('amendments.file_terpilih', 'File terpilih: {fileName}', { fileName }) : t('amendments.pilih_file_pdf_addendum', 'Pilih File PDF Addendum')}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-3">
                  {fileData && (
                    <button
                      type="button"
                      onClick={handleParseAmendment}
                      disabled={isParsing}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 hover:bg-[#06C755]/20 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isParsing ? t('amendments.parsing', 'Parsing...') : t('amendments.parse_file', 'Parse File')}
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
                {t('eval.btn_cancel', 'Batal')}
              </button>
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                title={!isFormValid ? t('form.common.required_hint', 'Lengkapi semua kolom wajib (*) untuk menyimpan') : ''}
                className="px-5 py-2.5 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? t('eval.btn_saving', 'Menyimpan...') : t('amendments.simpan_track_change_addendum', 'Simpan Track-Change Addendum')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
