import React, { useState } from 'react';
import {
  KeyRound,
  Plus,
  Search,
  Copy,
  Check,
  Shield,
  Ban,
  Trash2,
  Lock,
} from 'lucide-react';
import { ConsoleApiKey } from './types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminApiKeysTabProps {
  apiKeys: ConsoleApiKey[];
  onOpenCreateKey: () => void;
  onRevokeKey: (keyId: string) => void;
  onDeleteKey: (keyId: string) => void;
}

export const AdminApiKeysTab: React.FC<AdminApiKeysTabProps> = ({
  apiKeys,
  onOpenCreateKey,
  onRevokeKey,
  onDeleteKey,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredKeys = apiKeys.filter((k) =>
    k.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.key_search_ph', 'Cari nama API Key...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={onOpenCreateKey}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('admin.btn_generate_key', 'Generate API Key')}</span>
        </button>
      </div>

      {/* Keys Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">{t('admin.col_key_name', 'Nama Kunci')}</th>
                <th className="py-3 px-4">{t('admin.col_key_token', 'Key Token')}</th>
                <th className="py-3 px-4">{t('admin.col_scopes', 'Cakupan Izin (Scopes)')}</th>
                <th className="py-3 px-4">{t('admin.col_status', 'Status')}</th>
                <th className="py-3 px-4">{t('admin.col_created_at', 'Dibuat')}</th>
                <th className="py-3 px-4 text-right">{t('admin.col_action', 'Aksi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {t('admin.no_keys_found', 'Belum ada API Key yang digenerate untuk integrasi mesin/sistem eksternal.')}
                  </td>
                </tr>
              ) : (
                filteredKeys.map((k) => (
                  <tr
                    key={k.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{k.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                          {k.keyPreview}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {k.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {t('admin.status_active', 'Aktif')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          {t('admin.status_revoked', 'Dicabut (Revoked)')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {new Date(k.createdAt).toLocaleDateString(language === 'ID' ? 'id-ID' : 'en-US')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {k.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => onRevokeKey(k.id)}
                            className="px-2 py-1 rounded text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                          >
                            {t('admin.btn_revoke', 'Cabut')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteKey(k.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                          title={t('admin.title_delete_key', 'Hapus Kunci')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
