import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import { KeyRound, Shield, Search, CheckCircle2, Lock, Mail, Globe } from 'lucide-react';
import { ConsoleAccount } from './types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminAccountsTabProps {
  accounts: ConsoleAccount[];
}

export const AdminAccountsTab: React.FC<AdminAccountsTabProps> = ({ accounts }) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      (acc.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.accountId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProvider =
      providerFilter === 'all' || acc.providerId === providerFilter;

    return matchesSearch && matchesProvider;
  });

  const credentialCount = accounts.filter((a) => a.providerId === 'credential').length;
  const googleCount = accounts.filter((a) => a.providerId === 'google').length;

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="text-xs text-slate-500 mb-1">{t('admin.acc_total_linked', 'Total Akun Terhubung')}</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {accounts.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">{t('admin.acc_multi_provider', 'Multi-provider authentication')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{t('admin.acc_pwd_label', 'Email & Password')}</span>
            <Lock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
            {credentialCount}
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
            {t('admin.acc_pwd_desc', 'Terenkripsi Argon2 / SHA-256')}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{t('admin.acc_google_label', 'Google Workspace SSO')}</span>
            <Globe className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
            {googleCount}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {t('admin.acc_google_desc', 'OAuth 2.0 OpenID Connect')}
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.acc_search_ph', 'Cari user, email, atau account ID...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
        >
          <option value="all">{t('admin.filter_prov_all', 'Semua Provider')}</option>
          <option value="credential">{t('admin.credential_password', 'Credential (Password)')}</option>
          <option value="google">{t('admin.google_oauth', 'Google OAuth')}</option>
        </select>
      </div>

      {/* Accounts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">{t('admin.col_identifier', 'Pengguna')}</th>
                <th className="py-3 px-4">{t('admin.col_provider', 'Provider Auth')}</th>
                <th className="py-3 px-4">{t('admin.col_acc_id', 'Identifier Akun')}</th>
                <th className="py-3 px-4">{t('admin.col_pwd_hash', 'Enkripsi Kata Sandi')}</th>
                <th className="py-3 px-4">{t('admin.col_created_at', 'Dibuat Pada')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    {t('admin.no_accounts_found', 'Tidak ada akun terhubung yang cocok.')}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {acc.userName || (t('admin.unnamed', 'Unnamed'))}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {acc.userEmail}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] ${
                          acc.providerId === 'credential'
                            ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {acc.providerId === 'credential' ? (
                          <Lock className="w-3 h-3 text-slate-600" />
                        ) : (
                          <Globe className="w-3 h-3 text-blue-600" />
                        )}
                        {acc.providerId}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                      {acc.accountId}
                    </td>
                    <td className="py-3 px-4">
                      {acc.hasPassword ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('admin.hashed_scrypt', 'Hashed (Scrypt)')}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">{t('admin.oauth_delegated', 'OAuth Delegated')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {new Date(acc.createdAt).toLocaleString(getActiveFormattingLocale(), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
