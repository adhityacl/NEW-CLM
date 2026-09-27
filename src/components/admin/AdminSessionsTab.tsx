import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import {
  Radio,
  Search,
  Copy,
  Check,
  RotateCcw,
  X,
} from 'lucide-react';
import { ConsoleSession } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

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
  const { t } = useLanguage();
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
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder={t('admin.sess_search_ph', 'Cari sesi berdasarkan email, IP, browser, token...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
            <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">{sessions.length}</strong> {t('admin.active_sessions_in_database', 'Active Sessions in Database')}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_identifier', 'Pengguna')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_token', 'Session Token')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_ip_agent', 'IP Address & Device')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_started', 'Mulai Login')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_expires', 'Kadaluarsa')}
                </th>
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('admin.col_action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    {t('admin.no_sessions_found', 'Tidak ada sesi aktif yang ditemukan.')}
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s) => {
                  const isCopied = copiedId === s.id;
                  const isExpired = new Date(s.expiresAt) < new Date();
                  const displayName = s.userName || t('admin.unnamed', 'Unnamed');

                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      {/* User */}
                      <td className="py-4 px-4 text-left align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 font-semibold shrink-0">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {displayName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {s.userEmail}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Token Preview */}
                      <td className="py-4 px-4 text-left align-middle font-mono">
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
                      <td className="py-4 px-4 text-left align-middle">
                        <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {s.ipAddress || '127.0.0.1'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={s.userAgent}>
                          {s.userAgent || t('admin.standard_browser', 'Standard Browser')}
                        </div>
                      </td>

                      {/* Created At */}
                      <td className="py-4 px-4 text-left align-middle text-slate-500 dark:text-slate-400 text-[11px]">
                        {new Date(s.createdAt).toLocaleString(getActiveFormattingLocale(), {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Expires At */}
                      <td className="py-4 px-4 text-left align-middle">
                        {isExpired ? (
                          <Badge variant="destructive" className="gap-1 px-2 py-0.5 text-[10px]">
                            {t('status.expired', 'Expired')}
                          </Badge>
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
                      <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                        <div className="flex items-center justify-end gap-1">
                          {s.userId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => onRevokeAllUserSessions(s.userId)}
                              aria-label={t('admin.revoke_all_user_sessions', 'Cabut Semua Sesi User')}
                              title={t('admin.revoke_all_user_sessions', 'Cabut Semua Sesi User')}
                              className="h-7 w-7 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onRevokeSession(s.id)}
                            aria-label={t('admin.revoke_session', 'Cabut Sesi')}
                            title={t('admin.revoke_session', 'Cabut Sesi')}
                            className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
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
