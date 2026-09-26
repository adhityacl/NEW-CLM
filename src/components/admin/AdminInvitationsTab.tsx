import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import { Mail, Search, Clock, CheckCircle2, XCircle, RotateCw, Trash2, Copy, Check, Send, ShieldCheck, AlertCircle } from 'lucide-react';
import { ConsoleInvitation, ConsoleOrganization } from './types';
import { useLanguage } from '../../context/LanguageContext';

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

  const filteredInvites = invitations.filter((inv) =>
    inv.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyInviteLink = (inv: ConsoleInvitation) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?accept_invite=${inv.id}&email=${encodeURIComponent(inv.email)}`;
    navigator.clipboard.writeText(link);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
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
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs shrink-0"
        >
          <Mail className="w-4 h-4" />
          <span>{t('admin.btn_send_invitation', 'Kirim Undangan Baru')}</span>
        </button>
      </div>

      {/* Invitations Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
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
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {t('admin.no_invitations_found', 'Belum ada undangan anggota yang terkirim.')}
                  </td>
                </tr>
              ) : (
                filteredInvites.map((inv) => {
                  const isExpired = new Date(inv.expiresAt) < new Date();
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {inv.status === 'pending' && !isExpired && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            <Clock className="w-3 h-3" />
                            {t('admin.status_pending', 'Menunggu Konfirmasi')}
                          </span>
                        )}
                        {inv.status === 'accepted' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('admin.status_accepted', 'Diterima')}
                          </span>
                        )}
                        {(inv.status === 'expired' || (inv.status === 'pending' && isExpired)) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            <XCircle className="w-3 h-3" />
                            {t('admin.status_expired', 'Kadaluarsa')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(inv.expiresAt).toLocaleDateString(getActiveFormattingLocale())}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {inv.inviterName || t('admin.admin', 'Admin')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyInviteLink(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                            title={t('admin.salin_tautan_undangan_langsung', 'Salin Tautan Undangan Langsung')}
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
                          </button>

                          <button
                            type="button"
                            onClick={() => onResendInvitation(inv.id)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md transition-colors"
                            title={t('admin.title_resend_invite', 'Kirim Ulang Undangan (SMTP)')}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancelInvitation(inv.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors"
                            title={t('admin.title_cancel_invite', 'Batalkan Undangan')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
