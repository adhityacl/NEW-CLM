import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Check,
  Edit2,
  Trash2,
  Users,
  Layers,
  ExternalLink,
  ShieldCheck,
  FolderTree,
} from 'lucide-react';
import { ConsoleOrganization } from './types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminOrganizationsTabProps {
  organizations: ConsoleOrganization[];
  activeOrg: ConsoleOrganization | null;
  onSelectOrg?: (org: ConsoleOrganization) => void;
  onOpenCreateOrg: () => void;
  onOpenEditOrg: (org: ConsoleOrganization) => void;
  onDeleteOrg: (org: ConsoleOrganization) => void;
}

export const AdminOrganizationsTab: React.FC<AdminOrganizationsTabProps> = ({
  organizations,
  activeOrg,
  onSelectOrg,
  onOpenCreateOrg,
  onOpenEditOrg,
  onDeleteOrg,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOrgs = (organizations || []).filter(
    (org) =>
      (org?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (org?.slug || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (org?.id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.org_search_ph', 'Cari nama atau slug organisasi...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={onOpenCreateOrg}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('admin.btn_create_org', 'Buat Organisasi Baru')}</span>
        </button>
      </div>

      {/* Organizations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrgs.map((org) => {
          const isActive = activeOrg?.id === org.id;

          return (
            <div
              key={org.id}
              className={`rounded-xl border p-5 bg-white dark:bg-slate-900 transition-all shadow-xs flex flex-col justify-between overflow-hidden relative ${
                isActive
                  ? 'border-emerald-500 ring-1 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="min-w-0">
                {/* Header info */}
                <div className="flex items-start justify-between gap-2.5 mb-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 font-bold text-base shrink-0 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xs mt-0.5">
                      {org.logo && org.logo !== '/favicon.png' ? (
                        <img
                          src={org.logo}
                          alt={org.name || t('documents.info.organization', 'Organization')}
                          className="w-full h-full object-contain p-1 bg-white dark:bg-slate-900"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span>{(org.name || 'O').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate" title={org.name || ''}>
                        {org.name || t('documents.info.organization', 'Organisasi')}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                        <span className="truncate max-w-[120px]" title={`@${org.slug}`}>@{org.slug}</span>
                        <span className="text-slate-300 dark:text-slate-700 select-none">•</span>
                        <span
                          className="text-[10px] bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 font-mono inline-block max-w-full truncate"
                          title={org.id}
                        >
                          {t('admin.id_2', 'ID: {id}', { id: org.id })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap self-start">
                      <Check className="w-3 h-3 shrink-0" />
                      <span>{t('admin.badge_active', 'Aktif')}</span>
                    </span>
                  )}
                </div>

                {/* Tagline / metadata */}
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[32px] mb-4">
                  {org.metadata?.tagline || (t('admin.registered_enterprise_organization_in_better_aut', 'Registered enterprise organization in Better Auth ecosystem.'))}
                </p>

                {/* Metrics pill */}
                <div className="grid grid-cols-2 gap-2 mb-4 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">{t('admin.org_departments', 'Departemen')}</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                        {org.teamCount ?? 0} {t('admin.teams', 'Teams')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">{t('admin.org_currency', 'Mata Uang')}</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                        {org.metadata?.settings?.defaultCurrency || org.metadata?.currency || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Storage structure info */}
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-4">
                  <FolderTree className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('admin.org_folder_iso', 'Isolasi Folder')}: <strong>{t('admin.vendors_4', '/{name}/[Vendors]', { name: org.name })}</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenEditOrg(org)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>{t('admin.btn_edit', 'Edit')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteOrg(org)}
                    disabled={isActive || Boolean(org.metadata?.isDefault)}
                    title={
                      Boolean(org.metadata?.isDefault)
                        ? t('admin.cant_delete_default_org', 'Organisasi default sistem tidak dapat dihapus.')
                        : isActive
                        ? t('admin.cant_delete_active_org', 'Beralih ke organisasi lain terlebih dahulu sebelum menghapus.')
                        : t('admin.btn_delete_org', 'Hapus Organisasi')
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isActive || Boolean(org.metadata?.isDefault)
                        ? 'text-slate-400 dark:text-slate-600 opacity-40 cursor-not-allowed'
                        : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t('admin.btn_delete', 'Hapus')}</span>
                  </button>
                </div>

                {!isActive && onSelectOrg && (
                  <button
                    type="button"
                    onClick={() => onSelectOrg(org)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                  >
                    {t('admin.btn_set_active', 'Pilih Aktif')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
