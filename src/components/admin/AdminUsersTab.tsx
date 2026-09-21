import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Shield,
  KeyRound,
  Ban,
  CheckCircle2,
  Trash2,
  UserCheck,
  Sparkles,
  Building2,
} from 'lucide-react';
import { ConsoleUser, ConsoleOrganization } from './types';
import { UserRole } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminUsersTabProps {
  users: ConsoleUser[];
  organizations?: ConsoleOrganization[];
  onOpenAddUser: () => void;
  onOpenEditUser: (user: ConsoleUser) => void;
  onOpenResetPassword: (user: ConsoleUser) => void;
  onToggleBan: (user: ConsoleUser) => void;
  onImpersonate: (user: ConsoleUser) => void;
  onDeleteUser: (user: ConsoleUser) => void;
  onBulkAction: (action: 'ban' | 'unban' | 'delete', userIds: string[]) => void;
  canCreateUser?: boolean;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  users,
  organizations = [],
  onOpenAddUser,
  onOpenEditUser,
  onOpenResetPassword,
  onToggleBan,
  onImpersonate,
  onDeleteUser,
  onBulkAction,
  canCreateUser = false,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  React.useEffect(() => {
    setSelectedUserIds([]);
  }, [searchQuery, roleFilter, tenantFilter, statusFilter]);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    const matchesTenant =
      tenantFilter === 'all' ||
      (tenantFilter === 'global' && (user.role === 'superuser' || (!user.organizationId && user.role === 'admin'))) ||
      user.organizationId === tenantFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !user.banned) ||
      (statusFilter === 'banned' && user.banned);

    return matchesSearch && matchesRole && matchesTenant && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Controls Bar: Search, Filters, Add Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('admin.users_search_ph', 'Cari nama, email, atau role pengguna...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">{t('admin.filter_role_all', 'Semua Role')}</option>
            <option value="superuser">Superuser (System)</option>
            <option value="admin">Admin (Global)</option>
            <option value="manager">Manager (Group)</option>
            <option value="editor">Editor (Group)</option>
            <option value="viewer">Viewer (Read-Only)</option>
          </select>

          {/* Tenant / Organization Filter */}
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">{t('admin.filter_tenant_all', 'Semua Tenant')}</option>
            <option value="global">{t('admin.filter_tenant_global', 'Akses Global (Semua Tenant)')}</option>
            {(organizations || []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} {org.metadata?.brandName && org.metadata.brandName !== org.name ? `(${org.metadata.brandName})` : ''}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">{t('admin.filter_status_all', 'Semua Status')}</option>
            <option value="active">{t('admin.filter_active', 'Aktif')}</option>
            <option value="banned">{t('admin.filter_banned', 'Dicekal')}</option>
          </select>
        </div>

        {/* Add User Action */}
        {canCreateUser && (
          <button
            type="button"
            onClick={onOpenAddUser}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('admin.add_user_btn', 'Tambah Pengguna Baru')}</span>
          </button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedUserIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 p-3 rounded-xl shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-900 dark:text-purple-300">
            <Users className="w-4 h-4 text-purple-600" />
            <span>
              {selectedUserIds.length} {language === 'ID' ? 'pengguna terpilih' : 'users selected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onBulkAction('ban', selectedUserIds);
                setSelectedUserIds([]);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-medium transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{t('admin.bulk_ban', 'Cekal Massal')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onBulkAction('unban', selectedUserIds);
                setSelectedUserIds([]);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('admin.bulk_unban', 'Buka Cekal Massal')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onBulkAction('delete', selectedUserIds);
                setSelectedUserIds([]);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('admin.bulk_delete', 'Hapus Massal')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedUserIds([])}
              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-medium transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUserIds(filteredUsers.map((u) => u.id));
                      } else {
                        setSelectedUserIds([]);
                      }
                    }}
                    className="rounded-sm border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">{t('admin.col_identifier', 'Pengguna')}</th>
                <th className="py-3 px-4">{t('admin.col_role', 'Peran (Role)')}</th>
                <th className="py-3 px-4">{t('admin.col_account_status', 'Status Akun')}</th>
                <th className="py-3 px-4">{t('admin.col_sessions_count', 'Sesi Aktif')}</th>
                <th className="py-3 px-4">{t('admin.col_created', 'Terdaftar')}</th>
                <th className="py-3 px-4 text-right">{t('admin.col_action', 'Aksi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {t('admin.no_users_found', 'Tidak ada pengguna yang cocok dengan kriteria pencarian.')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds((prev) => [...prev, user.id]);
                          } else {
                            setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));
                          }
                        }}
                        className="rounded-sm border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </td>

                    {/* User info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 font-semibold shrink-0">
                          {user.image ? (
                            <img
                              src={user.image}
                              alt={user.name}
                              className="w-full h-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            user.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <span className="truncate">{user.name}</span>
                            {user.emailVerified && (
                              <span title={language === 'ID' ? 'Email Terverifikasi' : 'Verified Email'}>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role & Department */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                            user.role === 'superuser'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                              : user.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                              : user.role === 'manager' || user.role === 'legal'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : user.role === 'editor' || user.role === 'finance'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {user.role.toUpperCase()}
                        </span>
                        {user.department && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            {user.department}
                          </span>
                        )}
                        {user.role === 'superuser' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <Building2 className="w-2.5 h-2.5 shrink-0" />
                            <span>{t('admin.global_access', 'Akses Global (Semua Tenant)')}</span>
                          </span>
                        ) : user.role === 'admin' && !user.organizationId ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                            <Building2 className="w-2.5 h-2.5 shrink-0" />
                            <span>{t('admin.global_access', 'Akses Global (Semua Tenant)')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                            <Building2 className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate max-w-[140px]">
                              {user.organizationName ||
                                organizations.find((o) => o.id === user.organizationId)?.name ||
                                user.organizationId ||
                                '-'}
                            </span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {user.banned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                          <Ban className="w-3 h-3" />
                          {t('admin.filter_banned', 'Dicekal')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('admin.filter_active', 'Aktif')}
                        </span>
                      )}
                    </td>

                    {/* Active Sessions */}
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {user.sessionCount ?? 0} {language === 'ID' ? 'sesi' : 'sessions'}
                    </td>

                    {/* Joined Date */}
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                      {new Date(user.createdAt).toLocaleDateString(language === 'ID' ? 'id-ID' : 'en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onImpersonate(user)}
                          title={t('admin.action_impersonate', 'Login Sebagai Pengguna (Impersonate)')}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenEditUser(user)}
                          title={t('admin.action_edit_user', 'Ubah Informasi & Peran')}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenResetPassword(user)}
                          title={t('admin.action_reset_pwd', 'Reset Kata Sandi')}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleBan(user)}
                          title={user.banned ? t('admin.action_unban', 'Buka Cekal') : t('admin.action_ban', 'Cekal Pengguna')}
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.banned
                              ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                          }`}
                        >
                          {user.banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteUser(user)}
                          title={t('admin.action_delete', 'Hapus Pengguna')}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
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
