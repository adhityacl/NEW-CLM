import React, { useState, useRef } from 'react';
import { getActiveFormattingLocale } from '../lib/currencyUtils';
import { Upload, FileText, X, AlertCircle, Calendar, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { Partner, DDDokumenItem, DDFileItem } from '../types';
import { formatDueDiligenceFileName } from '../lib/fileNaming';
import { DateInput } from './DateInput';

interface UploadDDModalProps {
  partner: Partner;
  docName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPartner: Partner) => void;
  getAuthHeaders: () => Record<string, string>;
  userEmail?: string;
  userName?: string;
  userRole?: string;
}

export const UploadDDModal: React.FC<UploadDDModalProps> = ({
  partner,
  docName,
  isOpen,
  onClose,
  onSuccess,
  getAuthHeaders,
  userEmail,
  userName,
  userRole,
}) => {
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingDoc: DDDokumenItem | undefined = (partner.daftar_dokumen_dd || []).find((d) => d.nama === docName);
  
  // Normalize existing files
  const existingFiles: DDFileItem[] = existingDoc?.files && existingDoc.files.length > 0
    ? existingDoc.files
    : existingDoc?.linkDrive
    ? [
        {
          id: 'legacy_' + docName,
          fileName: `${docName}.pdf`,
          linkDrive: existingDoc.linkDrive,
          uploadedAt: existingDoc.uploadedAt || new Date().toISOString(),
          year: existingDoc.uploadedAt ? new Date(existingDoc.uploadedAt).getFullYear().toString() : new Date().getFullYear().toString(),
          tanggalKadaluarsa: existingDoc.tanggalKadaluarsa,
        },
      ]
    : [];

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [tanggalKadaluarsa, setTanggalKadaluarsa] = useState<string>(existingDoc?.tanggalKadaluarsa || '');
  const [tahunDokumen, setTahunDokumen] = useState<string>(new Date().getFullYear().toString());
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingFileId, setIsDeletingFileId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    // 25MB limit
    if (file.size > 25 * 1024 * 1024) {
      setError('Ukuran file melebihi batas maksimal 25MB.');
      return;
    }
    setError(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setFileBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDeleteExistingFile = async (fileId: string) => {
    const ok = await confirmDialog({ description: 'Hapus file dokumen ini?', tone: 'danger', confirmLabel: 'Hapus' });
    if (!ok) return;
    setIsDeletingFileId(fileId);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partner.partner_id}/dd-file`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          docName,
          fileId,
          userEmail: userEmail || 'user@app',
          userName: userName || 'User',
          userRole: userRole || 'Legal',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus file.');
      }
      if (data.partner) {
        onSuccess(data.partner);
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan saat menghapus file.');
    } finally {
      setIsDeletingFileId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !fileBase64) {
      setError('Silakan pilih file dokumen terlebih dahulu.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const docDate = tanggalKadaluarsa || (tahunDokumen ? `${tahunDokumen}-01-01` : new Date().toISOString());
      const nextSequence = existingFiles.length + 1;
      const finalFileName = formatDueDiligenceFileName({
        vendorName: partner.nama_partner,
        documentName: docName,
        documentDate: docDate,
        sequence: nextSequence,
        rawFileName: selectedFile.name,
      });

      const payload = {
        docName,
        fileName: finalFileName,
        fileData: fileBase64,
        tanggalKadaluarsa: tanggalKadaluarsa.trim(),
        userEmail: userEmail || 'user@app',
        userName: userName || 'User',
        userRole: userRole || 'Legal',
      };

      const res = await fetch(`/api/partners/${partner.partner_id}/upload-dd`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengunggah dokumen ke Google Drive.');
      }

      if (data.partner) {
        onSuccess(data.partner);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan saat mengunggah.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EBFBF0] dark:bg-emerald-950/60 border border-[#06C755]/30 flex items-center justify-center shrink-0 text-[#048C3B] dark:text-emerald-300">
              <Upload className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {t('partners.upload_dd_modal_title', 'Upload Dokumen Due Diligence')}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-bold text-[#048C3B] dark:text-emerald-400 truncate">
                  {docName}
                </span>
                <span className="text-[11px] text-slate-400">•</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate font-medium">
                  {partner.nama_partner}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* List of previously uploaded annual/versioned files */}
          {existingFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  File Dokumen Terunggah ({existingFiles.length})
                </span>
                <span className="text-[11px] text-slate-500">Mendukung multi-file tahunan</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {existingFiles.map((f, idx) => (
                  <div
                    key={f.id || idx}
                    className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-[#06C755] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {f.fileName || `${docName}.pdf`}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {f.year ? `Tahun ${f.year} • ` : ''}
                          Diunggah: {f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString(getActiveFormattingLocale()) : '-'}
                          {f.tanggalKadaluarsa ? ` • Exp: ${f.tanggalKadaluarsa}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {f.linkDrive && (
                        <a
                          href={f.linkDrive}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-[#048C3B] dark:text-emerald-300 rounded-lg text-[11px] font-medium flex items-center gap-1 border border-emerald-500/30 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Buka</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteExistingFile(f.id)}
                        disabled={isDeletingFileId === f.id}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                        title="Hapus File"
                      >
                        {isDeletingFileId === f.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Picker / Dropzone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Pilih File Dokumen DD *
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                isDragOver
                  ? 'border-[#06C755] bg-emerald-50/60 dark:bg-emerald-950/40'
                  : selectedFile
                  ? 'border-[#06C755]/50 bg-[#EBFBF0]/40 dark:bg-emerald-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-[#06C755] bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <div className="w-8 h-8 rounded-lg bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setFileBase64('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 text-[#06C755] mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t('partners.drag_file', 'Pilih atau drag file dokumen ke sini')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata: Tahun / Periode & Expiry (Nomor Dokumen intentionally removed per request) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Tahun / Periode
                </span>
              </label>
              <input
                type="text"
                value={tahunDokumen}
                onChange={(e) => setTahunDokumen(e.target.value)}
                placeholder="contoh: 2026"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#06C755]/30 focus:border-[#06C755]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {t('partners.expiry_date_label', 'Tanggal Kadaluarsa (Opsional)')}
                </span>
              </label>
              <DateInput
                value={tanggalKadaluarsa}
                onChange={setTanggalKadaluarsa}
                focusColor="emerald"
              />
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="px-4 py-2 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('partners.uploading_to_drive', 'Mengunggah ke Drive...')}</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t('partners.upload_to_drive_btn', 'Upload ke Google Drive')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
