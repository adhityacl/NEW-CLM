import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import {
  Radio,
  Search,
  ShieldAlert,
  Clock,
  Laptop,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { ConsoleSession } from './types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminSessionsTabProps {
  sessions: ConsoleSession[];
  onRevokeSession: (sessionId: string) => void;
  onRevokeAllUserSessions: (userId: string) => void;
}

export const AdminSessionsTab: React.FC<AdminSessionsTabProps> = ({
  sessions,
  onRevokeSession,
  onRevokeAllUserSessions,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      (s.userName || '').toLowerCase().includes(q) ||
      (s.userEmail || '').toLowerCase().includes(q) ||
      (s.ipAddress || '').toLowerCase().includes(q) ||
      (s.userAgent || '').toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.sess_search_ph', 'Cari sesi berdasarkan email, IP, browser, token...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
          <span>
            <strong className="text-slate-900 dark:text-slate-100">{sessions.length}</strong> {t('admin.active_sessions_in_database', 'Active Sessions in Database')}
          </span>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">{t('admin.col_identifier', 'Pengguna')}</th>
                <th className="py-3 px-4">{t('admin.col_token', 'Session Token')}</th>
                <th className="py-3 px-4">{t('admin.col_ip_agent', 'IP Address & Device')}</th>
                <th className="py-3 px-4">{t('admin.col_started', 'Mulai Login')}</th>
                <th className="py-3 px-4">{t('admin.col_expires', 'Kadaluarsa')}</th>
                <th className="py-3 px-4 text-right">{t('admin.col_action', 'Aksi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {t('admin.no_sessions_found', 'Tidak ada sesi aktif yang ditemukan.')}
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s) => {
                  const isCopied = copiedId === s.id;
                  const isExpired = new Date(s.expiresAt) < new Date();

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* User */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {s.userName || (t('admin.unnamed', 'Unnamed'))}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {s.userEmail}
                        </div>
                      </td>

                      {/* Token Preview */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {s.token ? `${s.token.slice(0, 12)}...` : `${(s.id || '').slice(0, 12)}...`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(s.token || s.id, s.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title={t('admin.copy_token', 'Copy Token')}
                          >
                            {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      {/* IP & User Agent */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {s.ipAddress || '127.0.0.1'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={s.userAgent}>
                          {s.userAgent || t('admin.standard_browser', 'Standard Browser')}
                        </div>
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(s.createdAt).toLocaleString(getActiveFormattingLocale(), {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Expires At */}
                      <td className="py-3 px-4">
                        {isExpired ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-medium">
                            {t('status.expired', 'Expired')}
                          </span>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                            {new Date(s.expiresAt).toLocaleDateString(getActiveFormattingLocale(), {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.userId && (
                            <button
                              type="button"
                              onClick={() => onRevokeAllUserSessions(s.userId)}
                              className="px-2 py-1 rounded-md text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors"
                              title={t('admin.revoke_all_user_sessions', 'Cabut Semua Sesi User')}
                            >
                              <RotateCcw className="w-3 h-3 inline mr-1" />
                              {t('admin.all_user_sessions', 'All User Sessions')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRevokeSession(s.id)}
                            className="px-2 py-1 rounded-md text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                            title={t('admin.revoke_session', 'Cabut Sesi')}
                          >
                            {t('admin.revoke_session', 'Cabut Sesi')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
