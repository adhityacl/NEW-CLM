import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import { Mail, Search, Clock, CheckCircle2, XCircle, RotateCw, Trash2, Copy, Check } from 'lucide-react';
import { ConsoleInvitation, ConsoleOrganization } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { TableEmptyState } from '../ui/table-empty-state';

interface AdminInvitationsTabProps {
  invitations: ConsoleInvitation[];
  activeOrg: ConsoleOrganization | null;
  onOpenInviteModal: () => void;
  onResendInvitation: (inviteId: string) => void;
  onCancelInvitation: (inviteId: string) => void;
}

export const AdminInvitationsTab: React.FC<AdminInvitationsTabProps> = ({
  invitations,
  activeOrg,
  onOpenInviteModal,
  onResendInvitation,
  onCancelInvitation,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');

  const filteredInvites = invitations.filter((inv) =>
    inv.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyInviteLink = async (inv: ConsoleInvitation) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?accept_invite=${inv.id}&email=${encodeURIComponent(inv.email)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyError('');
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      setCopyError(t('admin.copy_failed', 'Tautan tidak dapat disalin. Salin dari browser secara manual.'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="mobile-controls-bar flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label={t('admin.inv_search_ph', 'Cari email undangan...')}
            type="text"
            placeholder={t('admin.inv_search_ph', 'Cari email undangan...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={onOpenInviteModal}
          className="ui-button ui-button-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors shadow-xs"
        >
          <Mail className="w-4 h-4" />
          <span>{t('admin.btn_send_invitation', 'Kirim Undangan Baru')}</span>
        </button>
      </div>
      {copyError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{copyError}</div>}

      {/* Invitations Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-xs">
                <th className="py-3 px-4">{t('admin.col_target_email', 'Email Tujuan')}</th>
                <th className="py-3 px-4">{t('admin.col_role_requested', 'Peran Diminta')}</th>
                <th className="py-3 px-4">{t('admin.col_status', 'Status')}</th>
                <th className="py-3 px-4">{t('admin.col_expires', 'Kadaluarsa')}</th>
                <th className="py-3 px-4">{t('admin.col_inviter', 'Pengundang')}</th>
                <th className="py-3 px-4 text-right">{t('admin.col_action', 'Aksi & Link')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredInvites.length === 0 ? (
                <TableEmptyState colSpan={6} />
              ) : (
                filteredInvites.map((inv) => {
                  const isExpired = new Date(inv.expiresAt) < new Date();
                  const canUseLink = inv.status === 'pending' && !isExpired;
                  const canResend = inv.status === 'pending' || inv.status === 'expired';
                  const canCancel = inv.status === 'pending' || inv.status === 'expired';
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100 font-mono">
                          {inv.email}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {inv.status === 'pending' && !isExpired && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            <Clock className="w-3 h-3" />
                            {t('admin.status_pending', 'Menunggu Konfirmasi')}
                          </span>
                        )}
                        {inv.status === 'accepted' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('admin.status_accepted', 'Diterima')}
                          </span>
                        )}
                        {(inv.status === 'expired' || (inv.status === 'pending' && isExpired)) && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            <XCircle className="w-3 h-3" />
                            {t('admin.status_expired', 'Kadaluarsa')}
                          </span>
                        )}
                        {inv.status === 'canceled' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <XCircle className="h-3 w-3" />
                            {t('admin.status_canceled', 'Dibatalkan')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">
                        {new Date(inv.expiresAt).toLocaleDateString(getActiveFormattingLocale())}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">
                        {inv.inviterName || t('admin.admin', 'Admin')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canUseLink && <button
                            type="button"
                            onClick={() => handleCopyInviteLink(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                            title={t('admin.salin_tautan_undangan_langsung', 'Salin Tautan Undangan Langsung')}
                            aria-label={t('admin.salin_tautan_undangan_langsung', 'Salin Tautan Undangan Langsung')}
                          >
                            {copiedId === inv.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600">{t('redline.copied', 'Tersalin!')}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-500" />
                                <span>{t('admin.salin_link', 'Salin Link')}</span>
                              </>
                            )}
                          </button>}

                          {canResend && <button
                            type="button"
                            onClick={() => onResendInvitation(inv.id)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md transition-colors"
                            title={t('admin.title_resend_invite', 'Kirim Ulang Undangan (SMTP)')}
                            aria-label={t('admin.title_resend_invite', 'Kirim Ulang Undangan (SMTP)')}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>}
                          {canCancel && <button
                            type="button"
                            onClick={() => onCancelInvitation(inv.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors"
                            title={t('admin.title_cancel_invite', 'Batalkan Undangan')}
                            aria-label={t('admin.title_cancel_invite', 'Batalkan Undangan')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>}
                          {!canUseLink && !canResend && !canCancel && <span className="text-slate-400">—</span>}
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
