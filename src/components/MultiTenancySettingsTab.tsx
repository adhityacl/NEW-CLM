import React, { useState } from 'react';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Tenant, TenantBranding } from '../types';
import {
  Building2,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Check,
  CheckCircle2,
  Palette,
  Image as ImageIcon,
  Save,
  Globe,
  DollarSign,
  Layers,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const PRESET_COLORS = [
  { name: 'Emerald Green', hex: '#06C755' },
  { name: 'Corporate Blue', hex: '#2563EB' },
  { name: 'Royal Violet', hex: '#7C3AED' },
  { name: 'Amber Gold', hex: '#D97706' },
  { name: 'Crimson Red', hex: '#DC2626' },
  { name: 'Dark Slate', hex: '#334155' },
];

export const MultiTenancySettingsTab: React.FC = () => {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const {
    tenants,
    activeTenant,
    branding,
    switchTenant,
    createTenant,
    updateTenant,
    deleteTenant,
    updateBranding,
  } = useTenant();

  // Branding form state
  const [appName, setAppName] = useState(branding.appName || 'LMS - Legal Management System');
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl || '/favicon.png');
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor || '#06C755');
  const [footerText, setFooterText] = useState(
    branding.footerText || '© 2026 PT Info Tekno Siaga (Adapundi). All rights reserved.'
  );
  const [loginHeadline, setLoginHeadline] = useState(
    branding.loginHeadline || 'Portal Manajemen Kontrak, Vendor & Insertion Order'
  );
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null);

  // Tenant modal state
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [legalEntity, setLegalEntity] = useState('PT');
  const [brandName, setBrandName] = useState('');
  const [tagline, setTagline] = useState('');
  const [domainSlug, setDomainSlug] = useState('');
  const [currency, setCurrency] = useState('IDR');
  const [savingTenant, setSavingTenant] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantSuccess, setTenantSuccess] = useState<string | null>(null);

  const handleOpenAddTenant = () => {
    setEditingTenant(null);
    setTenantName('');
    setLegalEntity('PT');
    setBrandName('');
    setTagline('');
    setDomainSlug('');
    setCurrency('IDR');
    setTenantError(null);
    setShowTenantModal(true);
  };

  const handleOpenEditTenant = (tItem: Tenant) => {
    setEditingTenant(tItem);
    setTenantName(tItem.name);
    setLegalEntity(tItem.legalEntity || 'PT');
    setBrandName(tItem.brandName || '');
    setTagline(tItem.tagline || '');
    setDomainSlug(tItem.domainSlug || '');
    setCurrency(tItem.currency || 'IDR');
    setTenantError(null);
    setShowTenantModal(true);
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName.trim() || !brandName.trim()) {
      setTenantError('Nama Entitas dan Nama Merek wajib diisi.');
      return;
    }
    setSavingTenant(true);
    setTenantError(null);
    try {
      if (editingTenant) {
        const ok = await updateTenant(editingTenant.id, {
          name: tenantName.trim(),
          legalEntity,
          brandName: brandName.trim(),
          tagline: tagline.trim(),
          domainSlug: domainSlug.trim() || brandName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          currency,
        });
        if (ok) {
          setShowTenantModal(false);
          setTenantSuccess(`Entitas '${tenantName}' berhasil diperbarui!`);
          setTimeout(() => setTenantSuccess(null), 4000);
        } else {
          setTenantError('Gagal memperbarui entitas bisnis.');
        }
      } else {
        const ok = await createTenant({
          name: tenantName.trim(),
          legalEntity,
          brandName: brandName.trim(),
          tagline: tagline.trim(),
          domainSlug: domainSlug.trim() || brandName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          currency,
          primaryColor,
          logoUrl: '/favicon.png',
        });
        if (ok) {
          setShowTenantModal(false);
          setTenantSuccess(`Entitas bisnis baru '${tenantName}' berhasil didaftarkan!`);
          setTimeout(() => setTenantSuccess(null), 4000);
        } else {
          setTenantError('Gagal membuat entitas bisnis baru.');
        }
      }
    } catch (err: any) {
      setTenantError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSavingTenant(false);
    }
  };

  const handleDeleteTenant = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus entitas '${name}'?`)) return;
    const ok = await deleteTenant(id);
    if (ok) {
      setTenantSuccess(`Entitas '${name}' berhasil dihapus.`);
      setTimeout(() => setTenantSuccess(null), 4000);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    setBrandingSuccess(null);
    try {
      const ok = await updateBranding({
        appName: appName.trim(),
        logoUrl: logoUrl.trim(),
        primaryColor,
        footerText: footerText.trim(),
        loginHeadline: loginHeadline.trim(),
      });
      if (ok) {
        setBrandingSuccess('Pengaturan branding visual portal berhasil disimpan!');
        setTimeout(() => setBrandingSuccess(null), 4000);
      }
    } catch (err: any) {
      console.warn(err);
    } finally {
      setSavingBranding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
      {tenantSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          {tenantSuccess}
        </div>
      )}
      {brandingSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          {brandingSuccess}
        </div>
      )}

      {/* CARD 1: MULTI-TENANCY / ENTITAS BISNIS */}
      <Card className="border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-[#F7F8FA] dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-[#06C755]/15 text-[#06C755] flex items-center justify-center shrink-0">
              <Building2 className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('settings.tenant_management_title', 'Manajemen Entitas Bisnis & Multi-Tenancy')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                {t(
                  'settings.tenant_management_desc',
                  'Kelola entitas anak perusahaan, workspace, atau unit bisnis yang terdaftar dalam sistem CLM.'
                )}
              </CardDescription>
            </div>
          </div>

          {isAdmin && (
            <Button
              onClick={handleOpenAddTenant}
              className="bg-[#06C755] hover:bg-[#05B34C] text-white text-xs font-bold rounded-xl px-4 py-2 h-9 cursor-pointer gap-1.5 shadow-xs shrink-0"
            >
              <Plus className="size-3.5" />
              {t('settings.add_tenant_btn', 'Tambah Entitas Bisnis')}
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tenants.map((tItem) => {
              const isActive = tItem.id === activeTenant?.id;
              return (
                <div
                  key={tItem.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isActive
                      ? 'border-[#06C755] bg-[#06C755]/5 dark:bg-[#06C755]/10 shadow-xs ring-1 ring-[#06C755]'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`size-10 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
                          isActive
                            ? 'bg-[#06C755] text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {tItem.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                            {tItem.name}
                          </h4>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {tItem.legalEntity || 'PT'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#06C755] mt-0.5">
                          {tItem.brandName || '-'}
                        </p>
                        {tItem.tagline && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {tItem.tagline}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1 font-mono">
                            <Globe className="size-3 text-slate-400" />
                            {tItem.domainSlug || 'main'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                            <DollarSign className="size-3 text-slate-400" />
                            {tItem.currency || 'IDR'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {isActive ? (
                        <Badge className="bg-[#06C755] text-white font-bold text-[10px] flex items-center gap-1">
                          <Check className="size-3" />
                          {t('settings.active_tenant_badge', 'Entitas Aktif')}
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => switchTenant(tItem.id)}
                          className="h-7 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#06C755] hover:text-[#06C755] rounded-lg cursor-pointer"
                        >
                          {t('settings.switch_tenant_btn', 'Jadikan Aktif')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditTenant(tItem)}
                        className="h-7 px-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer gap-1"
                      >
                        <Edit2 className="size-3" />
                        Edit
                      </Button>
                      {tenants.length > 1 && !tItem.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTenant(tItem.id, tItem.name)}
                          className="h-7 px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer gap-1"
                        >
                          <Trash2 className="size-3" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* CARD 2: CUSTOM BRANDING & VISUAL IDENTITY */}
      <Card className="border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-[#F7F8FA] dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
              <Palette className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('settings.branding_title', 'Kustomisasi Branding & Identitas Visual (White-Labeling)')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                {t(
                  'settings.branding_desc',
                  'Sesuaikan nama aplikasi, logo portal, dan palet warna tema untuk klien atau organisasi Anda.'
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSaveBranding}>
          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* App Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('settings.app_name_label', 'Nama Aplikasi / Judul Portal')}
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                  placeholder="LMS - Legal Management System"
                  required
                />
              </div>

              {/* Logo URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{t('settings.logo_url_label', 'URL Logo Kustom (PNG/SVG)')}</span>
                  <button
                    type="button"
                    onClick={() => setLogoUrl('/favicon.png')}
                    className="text-[10px] text-[#06C755] hover:underline font-semibold cursor-pointer"
                  >
                    Gunakan Logo Default
                  </button>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                    placeholder="/favicon.png atau https://domain.com/logo.png"
                  />
                  <div className="size-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                    <img src={logoUrl || '/favicon.png'} alt="Preview" className="size-7 object-contain rounded-lg" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Accent Color Palette */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('settings.primary_color_label', 'Warna Aksen Brand Utama')}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {PRESET_COLORS.map((color) => {
                  const isSelected = primaryColor.toLowerCase() === color.hex.toLowerCase();
                  return (
                    <button
                      type="button"
                      key={color.hex}
                      onClick={() => setPrimaryColor(color.hex)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'border-slate-900 dark:border-white shadow-xs scale-105 bg-slate-50 dark:bg-slate-800'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <span className="size-3.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: color.hex }} />
                      <span className="text-slate-800 dark:text-slate-200">{color.name}</span>
                      {isSelected && <Check className="size-3 text-slate-900 dark:text-white ml-0.5" />}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1.5 ml-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="size-8 rounded-lg cursor-pointer border border-slate-200"
                    title="Pilih Warna Kustom"
                  />
                  <span className="text-xs font-mono font-bold text-slate-500">{primaryColor}</span>
                </div>
              </div>
            </div>

            {/* Tagline & Footer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Headline Tagline Login / Header
                </label>
                <input
                  type="text"
                  value={loginHeadline}
                  onChange={(e) => setLoginHeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                  placeholder="Portal Manajemen Kontrak, Vendor & Insertion Order"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('settings.footer_text_label', 'Teks Footer & Disclaimer Legal')}
                </label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                  placeholder="© 2026 PT Info Tekno Siaga (Adapundi). All rights reserved."
                />
              </div>
            </div>
          </CardContent>

          {isAdmin && (
            <CardFooter className="bg-[#F7F8FA] dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 p-4 flex justify-end">
              <Button
                type="submit"
                disabled={savingBranding}
                className="bg-[#06C755] hover:bg-[#05B34C] text-white text-xs font-bold rounded-xl px-5 py-2 h-9 cursor-pointer gap-1.5 shadow-xs"
              >
                <Save className="size-3.5" />
                {savingBranding ? 'Menyimpan...' : t('settings.save_branding_btn', 'Simpan Branding')}
              </Button>
            </CardFooter>
          )}
        </form>
      </Card>

      {/* MODAL: ADD / EDIT TENANT */}
      {showTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-[#06C755]/15 text-[#06C755] flex items-center justify-center">
                  <Building2 className="size-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {editingTenant ? 'Edit Entitas Bisnis' : 'Tambah Entitas Bisnis Baru'}
                </h3>
              </div>
              <button
                onClick={() => setShowTenantModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTenant}>
              <div className="p-5 space-y-4 text-xs">
                {tenantError && (
                  <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">
                    {tenantError}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      {t('settings.tenant_name_label', 'Nama Entitas / Perusahaan')}
                    </label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Contoh: PT Inovasi Digital Nusantara"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      {t('settings.tenant_legal_label', 'Badan Hukum')}
                    </label>
                    <select
                      value={legalEntity}
                      onChange={(e) => setLegalEntity(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none cursor-pointer"
                    >
                      <option value="PT">PT (Perseroan Terbatas)</option>
                      <option value="CV">CV (Commanditaire Vennootschap)</option>
                      <option value="Ltd">Ltd (Limited)</option>
                      <option value="Inc">Inc (Incorporated)</option>
                      <option value="Holding">Holding Group</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      {t('settings.tenant_brand_label', 'Nama Merek / Divisi')}
                    </label>
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Contoh: IDN FinTech"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      {t('settings.tenant_currency_label', 'Mata Uang Utama')}
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none cursor-pointer"
                    >
                      <option value="IDR">IDR (Rupiah Indonesia)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="SGD">SGD (Singapore Dollar)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Tagline / Keterangan Unit Bisnis
                  </label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Contoh: Divisi Layanan Finansial & Pembayaran Digital"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    {t('settings.tenant_slug_label', 'Domain Slug / Workspace ID')}
                  </label>
                  <input
                    type="text"
                    value={domainSlug}
                    onChange={(e) => setDomainSlug(e.target.value)}
                    placeholder="idn-fintech"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-medium focus:ring-2 focus:ring-[#06C755] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-[#F7F8FA] dark:bg-slate-800/40">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTenantModal(false)}
                  className="rounded-xl cursor-pointer"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={savingTenant}
                  size="sm"
                  className="bg-[#06C755] hover:bg-[#05B34C] text-white font-bold rounded-xl cursor-pointer"
                >
                  {savingTenant ? 'Menyimpan...' : 'Simpan Entitas'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
