import React, { useState } from 'react';
import { Partner, PartyIdentifier } from '../types';
import { Building2, User, Mail, Phone, X, MapPin, Upload, Sparkles, Loader2, Shield } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { isGlobalRole } from '../lib/rbacScoping';
import { getSavedCategories, saveCategory, saveMultipleCategories } from '../lib/categoryUtils';
import { useDepartments } from '../hooks/useDepartments';
import { useTenantSettings } from '../context/TenantSettingsContext';
import { PartnerJurisdictionFields } from './partners/PartnerJurisdictionFields';

export const ENTERPRISE_DEPARTMENTS = [
  'Executive Office',
  'Commercial & Marketing',
  'Legal & Compliance',
  'Finance & Tax',
  'Operasional & HR',
  'Teknologi & IT',
];

interface PartnerModalProps {
  partnerToEdit?: Partner | null;
  onClose: () => void;
  onSave: (partnerData: any) => Promise<void>;
}

export const PartnerModal: React.FC<PartnerModalProps> = ({
  partnerToEdit,
  onClose,
  onSave,
}) => {
  const { t } = useLanguage();

  const getInitialNamaPic = () => {
    if (partnerToEdit?.nama_pic) return partnerToEdit.nama_pic;
    if (!partnerToEdit?.pic_partner) return '';
    const match = partnerToEdit.pic_partner.match(/^(.*?)\s*(?:\((.*?)\))?$/);
    return match ? match[1].trim() : partnerToEdit.pic_partner;
  };

  const getInitialEmailPic = () => {
    if (partnerToEdit?.email_pic) return partnerToEdit.email_pic;
    if (partnerToEdit?.kontak_pic) {
      const parts = partnerToEdit.kontak_pic.split(/[/|]/);
      const emailPart = parts.find((p) => p.includes('@'));
      if (emailPart) return emailPart.trim();
    }
    if (partnerToEdit?.pic_partner) {
      const match = partnerToEdit.pic_partner.match(/\((.*?)\)/);
      if (match) {
        const inside = match[1];
        const parts = inside.split(/[/|]/);
        const emailPart = parts.find((p) => p.includes('@'));
        if (emailPart) return emailPart.trim();
      }
    }
    return '';
  };

  const getInitialTeleponPic = () => {
    if (partnerToEdit?.telepon_pic) return partnerToEdit.telepon_pic;
    if (partnerToEdit?.kontak_pic) {
      const parts = partnerToEdit.kontak_pic.split(/[/|]/);
      const phonePart = parts.find((p) => !p.includes('@') && /\d/.test(p));
      if (phonePart) return phonePart.trim();
    }
    if (partnerToEdit?.pic_partner) {
      const match = partnerToEdit.pic_partner.match(/\((.*?)\)/);
      if (match) {
        const inside = match[1];
        const parts = inside.split(/[/|]/);
        const phonePart = parts.find((p) => !p.includes('@') && /\d/.test(p));
        if (phonePart) return phonePart.trim();
      }
    }
    return '';
  };


  const { user } = useAuth();
  const isGlobal = isGlobalRole(user?.role);
  const userDept = user?.department || 'Commercial & Marketing';
  const { departments: ENTERPRISE_DEPARTMENTS } = useDepartments();

  const [namaPartner, setNamaPartner] = useState(partnerToEdit?.nama_partner || '');
  const [codename, setCodename] = useState(partnerToEdit?.codename || '');
  const { policy } = useTenantSettings();
  // New partners default to the organization's own country.
  const [country, setCountry] = useState<string>(
    partnerToEdit ? (partnerToEdit.country ?? (partnerToEdit.badan_hukum === 'BHI' ? 'ID' : '')) : (policy.settings.countryCode === 'INTL' ? '' : policy.settings.countryCode),
  );
  const [entityType, setEntityType] = useState(partnerToEdit?.entity_type || '');
  const [identifiers, setIdentifiers] = useState<PartyIdentifier[]>(partnerToEdit?.identifiers || []);
  const [picInternal, setPicInternal] = useState(partnerToEdit?.pic_internal || userDept);
  
  // Update custom dept flag dynamically when departments load
  React.useEffect(() => {
    if (partnerToEdit?.pic_internal) {
      setIsCustomDept(!ENTERPRISE_DEPARTMENTS.includes(partnerToEdit.pic_internal));
    }
  }, [ENTERPRISE_DEPARTMENTS, partnerToEdit?.pic_internal]);

  const [isCustomDept, setIsCustomDept] = useState<boolean>(() => {
    if (partnerToEdit?.pic_internal) {
      return !ENTERPRISE_DEPARTMENTS.includes(partnerToEdit.pic_internal);
    }
    return false;
  });
  const [namaPic, setNamaPic] = useState(getInitialNamaPic);
  const [emailPic, setEmailPic] = useState(getInitialEmailPic);
  const [teleponPic, setTeleponPic] = useState(getInitialTeleponPic);
  const [alamatPic, setAlamatPic] = useState(partnerToEdit?.alamat_pic || '');
  const [catatan, setCatatan] = useState(partnerToEdit?.catatan || '');
  const [tags, setTags] = useState<string[]>(
    partnerToEdit?.tags && partnerToEdit.tags.length > 0 ? partnerToEdit.tags : []
  );
  const [savedTemplates, setSavedTemplates] = useState<string[]>(() => {
    const loaded = getSavedCategories(policy.industry.partnerCategories);
    if (partnerToEdit?.tags && partnerToEdit.tags.length > 0) {
      return saveMultipleCategories(partnerToEdit.tags);
    }
    return loaded;
  });
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [rawFileObj, setRawFileObj] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);

  const handleGenerateNotes = async () => {
    if (!namaPartner.trim()) {
      setError(t('partners.nama_legal_partner_wajib_diisi_terlebih', 'Nama Legal Partner wajib diisi terlebih dahulu untuk generate Catatan Due Diligence.'));
      return;
    }
    setIsGeneratingNotes(true);
    setError(null);
    try {
      const response = await fetch('/api/partners/generate-dd-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_partner: namaPartner.trim(),
          country,
          entity_type: entityType,
          tags: tags,
          pdfBase64: fileData || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || t('partners.gagal_menghasilkan_ringkasan_due_diligence_ai', 'Gagal menghasilkan ringkasan Due Diligence AI.'));
      }
      if (result.success && result.notes) {
        setCatatan(result.notes);
      }
    } catch (err: any) {
      setError(err.message || t('partners.error_generating_due_diligence_notes', 'Error generating Due Diligence notes'));
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setError(t('partners.ukuran_file_maksimal_20mb', 'Ukuran file maksimal 20MB.'));
        return;
      }
      setRawFileObj(file);
      setFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleParsePartner = async () => {
    if (!fileData && !rawFileObj) {
      setError(t('partners.please_upload_a_pdf_file_first', 'Please upload a PDF file first.'));
      return;
    }
    setIsParsing(true);
    setError(null);
    try {
      let response: Response;
      if (rawFileObj) {
        const formData = new FormData();
        formData.append('file', rawFileObj);
        response = await fetch('/api/partners/parse', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/partners/parse', {
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
        throw new Error(text && text.trim().startsWith('<') ? t('partners.koneksi_ai_server_timeout_atau_sibuk', 'Koneksi AI Server timeout atau sibuk. Silakan coba kembali beberapa saat lagi.') : (text || t('partners.gagal_memproses_dokumen', 'Gagal memproses dokumen')));
      }
      if (!response.ok) {
        throw new Error(result.error || t('partners.failed_to_parse', 'Failed to parse'));
      }
      if (result.success && result.data) {
        const parsed = result.data;
        if (parsed.nama_partner) setNamaPartner(parsed.nama_partner);
        if (typeof parsed.country === 'string' && /^[A-Z]{2}$/.test(parsed.country)) setCountry(parsed.country);
        if (parsed.entity_type) setEntityType(parsed.entity_type);
        if (parsed.nama_pic) setNamaPic(parsed.nama_pic);
        if (parsed.email_pic) setEmailPic(parsed.email_pic);
        if (parsed.telepon_pic) setTeleponPic(parsed.telepon_pic);
        if (parsed.alamat_pic) setAlamatPic(parsed.alamat_pic);
        if (parsed.notes && parsed.notes !== '-') setCatatan(parsed.notes);
      }
    } catch (err: any) {
      setError(err.message || t('partners.error_parsing_document', 'Error parsing document'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      const updatedTemplates = saveCategory(trimmed);
      setSavedTemplates(updatedTemplates);
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const isFormValid = Boolean(
    namaPartner.trim() &&
    namaPic.trim() &&
    emailPic.trim() &&
    teleponPic.trim() &&
    tags.length > 0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!namaPartner.trim()) {
      setError(t('form.partner.err_nama_legal', 'Nama Legal wajib diisi.'));
      return;
    }
    if (!namaPic.trim()) {
      setError(t('form.partner.err_nama_pic', 'Nama PIC wajib diisi.'));
      return;
    }
    if (!emailPic.trim()) {
      setError(t('form.partner.err_email_pic', 'Email PIC wajib diisi.'));
      return;
    }
    if (!teleponPic.trim()) {
      setError(t('form.partner.err_telepon_pic', 'Nomor Telepon PIC wajib diisi.'));
      return;
    }
    if (tags.length === 0) {
      setError(t('form.partner.err_tags', 'Minimal 1 tag kategori kerjasama harus ada.'));
      return;
    }

    setSubmitting(true);

    if (tags.length > 0) {
      saveMultipleCategories(tags);
    }

    const fullPicString = `${namaPic.trim()} (${emailPic.trim()} | ${teleponPic.trim()})`;
    const kontakString = `${emailPic.trim()} / ${teleponPic.trim()}`;

    await onSave({
      nama_partner: namaPartner.trim(),
      codename: codename.trim(),
      country,
      entity_type: entityType.trim(),
      identifiers: identifiers.filter((i) => i.value.trim()).map((i) => ({ ...i, value: i.value.trim() })),
      jenis_partner: partnerToEdit?.jenis_partner || 'Vendor',
      pic_partner: fullPicString,
      nama_pic: namaPic.trim(),
      email_pic: emailPic.trim(),
      telepon_pic: teleponPic.trim(),
      alamat_pic: alamatPic.trim(),
      kontak_pic: kontakString,
      pic_internal: picInternal.trim(),
      catatan: catatan.trim(),
      tags,
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
              <Building2 className="w-5 h-5 text-[#06C755]" />
              <span>
                {partnerToEdit
                  ? t('form.partner.title_edit', 'Edit Data Partner')
                  : t('form.partner.title_add', 'Tambah Partner / Vendor Baru')}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.partner.nama_legal', 'Nama Legal *')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('form.partner.nama_legal_placeholder', 'contoh: PT Telekomunikasi Selular')}
                  value={namaPartner}
                  onChange={(e) => setNamaPartner(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.partner.nama_channel', 'Nama Channel')}
                </label>
                <input
                  type="text"
                  placeholder={t('form.partner.nama_channel_placeholder', 'mis. TSEL, XL, INDOSAT')}
                  value={codename}
                  onChange={(e) => setCodename(e.target.value)}
                  className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>
            </div>

            <PartnerJurisdictionFields
              country={country}
              entityType={entityType}
              identifiers={identifiers}
              onCountryChange={setCountry}
              onEntityTypeChange={setEntityType}
              onIdentifiersChange={setIdentifiers}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-xs flex items-center justify-between">
                  <span>{t('form.partner.department', 'Department')}</span>
                </label>

                {isGlobal ? (
                  <div className="space-y-2">
                    {/* Primary Department Dropdown */}
                    <select
                      value={
                        ENTERPRISE_DEPARTMENTS.includes(picInternal)
                          ? picInternal
                          : (isCustomDept ? '__custom__' : (picInternal || (ENTERPRISE_DEPARTMENTS[0] || '')))
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setIsCustomDept(true);
                          setPicInternal('');
                        } else {
                          setIsCustomDept(false);
                          setPicInternal(val);
                        }
                      }}
                      className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all cursor-pointer"
                    >
                      <option value="" disabled>{t('partners.pilih_department', '-- Pilih Department --')}</option>
                      {ENTERPRISE_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                      <option value="__custom__">{t('partners.input_departemen_lainnya_kustom', '+ Input Departemen Lainnya / Kustom...')}</option>
                    </select>

                    {/* Custom Department text input if user selected custom */}
                    {isCustomDept && (
                      <input
                        type="text"
                        autoFocus
                        placeholder={t('partners.ketik_nama_departemen_kustom', 'Ketik nama departemen kustom...')}
                        value={picInternal}
                        onChange={(e) => setPicInternal(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      list="departments-list"
                      placeholder={t('form.partner.department_placeholder', 'contoh: Marketing')}
                      value={picInternal}
                      onChange={(e) => setPicInternal(e.target.value)}
                      className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                    />
                    <datalist id="departments-list">
                      {ENTERPRISE_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>
            </div>

            {/* Separated PIC Contact Person Section */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
              <div className="text-[11px] font-extrabold text-[#048C3B] dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#06C755]" />
                <span>{t('form.partner.contact_section_title', 'Informasi Kontak PIC (Person In Charge)')}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                  {t('form.partner.nama_pic', 'Nama PIC *')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('form.partner.nama_pic_placeholder', 'contoh: Andi Hermawan')}
                  value={namaPic}
                  onChange={(e) => setNamaPic(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>{t('form.partner.email_pic', 'Email PIC *')}</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={t('form.partner.email_pic_placeholder', 'contoh: andi@telkomsel.co.id')}
                    value={emailPic}
                    onChange={(e) => setEmailPic(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>{t('form.partner.telepon_pic', 'Nomor Telepon / WA PIC *')}</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('form.partner.telepon_pic_placeholder', 'contoh: 0811-2233-4455')}
                    value={teleponPic}
                    onChange={(e) => setTeleponPic(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                  />
                </div>

                <div className="md:col-span-2 mt-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>{t('form.partner.alamat_pic', 'Alamat *')}</span>
                  </label>
                  <textarea
                    required
                    placeholder={t('form.partner.alamat_pic_placeholder', 'contoh: Jl. Jend. Sudirman Kav 52-53...')}
                    value={alamatPic}
                    onChange={(e) => setAlamatPic(e.target.value)}
                    rows={2}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                {t('form.partner.kategori_kerjasama', 'Kategori Kerjasama *')}
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  list="partner-category-templates-list"
                  placeholder={t('form.partner.tag_placeholder', 'Tambah tag kategori (mis. Advertising, IT, Logistics)...')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
                <datalist id="partner-category-templates-list">
                  {savedTemplates.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
                >
                  {t('form.partner.add_tag_btn', 'Tambah Tag')}
                </button>
              </div>

              {/* Active Selected Tag Pills */}
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EBFBF0] dark:bg-emerald-950/50 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 dark:border-emerald-500/40 rounded-lg text-xs font-semibold shadow-2xs"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-[#06C755] hover:text-[#048C3B] dark:hover:text-emerald-200 font-extrabold leading-none cursor-pointer"
                      title={t('partners.hapus_tag', 'Hapus tag')}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs">
                  {t('form.partner.notes_label', 'Catatan Due Diligence / Internal Notes')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateNotes}
                    disabled={isGeneratingNotes || !namaPartner.trim()}
                    className="px-3 py-1 text-[11px] font-bold bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border border-[#06C755]/30 hover:bg-[#06C755]/20 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('partners.generate_analisis_due_diligence_ai_senior', 'Generate Analisis Due Diligence (AI Senior Analyst)')}
                  >
                    {isGeneratingNotes ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#06C755]" />
                        <span>{t('partners.menganalisis', 'Menganalisis...')}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#06C755]" />
                        <span>{t('partners.generate_ai_notes', 'Generate AI Notes')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                placeholder={t('partners.format_1_paragraf_narrative_analyst_nama', 'Format 1 Paragraf Narrative Analyst: [Nama Entitas] merupakan vendor digital/ad-tech berbadan hukum... (Mencakup: 1. Core Business, 2. Media Network, 3. Proprietary Tech/AI, 4. Strategic Function/Location)')}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className="w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all leading-relaxed"
              />
            </div>


            {/* File Upload Area for Parsing */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs">
                {t('form.partner.upload_label', 'Auto-fill dari Dokumen Kontrak (AI Parse)')}
              </label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#06C755] dark:hover:border-[#06C755] rounded-2xl p-4 text-center bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all">
                <Upload className="w-6 h-6 text-[#06C755] mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {fileName
                    ? `${t('form.contract.file_selected', 'File terpilih:')} ${fileName}`
                    : t('form.partner.drag_ref', 'Pilih atau Drag Dokumen Referensi ke sini')}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                  {fileData && (
                    <button
                      type="button"
                      onClick={handleParsePartner}
                      disabled={isParsing}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 hover:bg-[#06C755]/20 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isParsing ? t('partners.parsing', 'Parsing...') : t('partners.parse_file', 'Parse File')}
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
                  ? t('form.partner.saving_btn', 'Menyimpan Partner...')
                  : t('form.partner.save_btn', 'Simpan Partner')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
