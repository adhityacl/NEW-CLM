import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import {
  Users,
  Search,
  UserPlus,
  Shield,
  KeyRound,
  Ban,
  CheckCircle2,
  Trash2,
  UserCheck,
  Building2,
} from 'lucide-react';
import { ConsoleUser, ConsoleOrganization } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/button';
import { Badge, type BadgeVariant } from '../ui/badge';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Card, CardContent } from '../ui/card';

interface AdminUsersTabProps {
  users: ConsoleUser[];
  organizations?: ConsoleOrganization[];
  onOpenAddUser: () => void;
  onOpenEditUser: (user: ConsoleUser) => void;
  onOpenResetPassword: (user: ConsoleUser) => void;
  onToggleBan: (user: ConsoleUser) => void;
  onDeleteUser: (user: ConsoleUser) => void;
  onBulkAction: (action: 'ban' | 'unban' | 'delete', userIds: string[]) => void;
  canCreateUser?: boolean;
}

const ROLE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  superuser: 'destructive',
  admin: 'purple',
  manager: 'info',
  legal: 'info',
  editor: 'success',
  finance: 'success',
};

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  users,
  organizations = [],
  onOpenAddUser,
  onOpenEditUser,
  onOpenResetPassword,
  onToggleBan,
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
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder={t('admin.users_search_ph', 'Cari nama, email, atau role pengguna...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-9 text-xs"
              />
            </div>

            {/* Role Filter */}
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label={t('admin.col_role', 'Peran (Role)')}
              className="h-8 w-auto text-xs"
            >
              <option value="all">{t('admin.filter_role_all', 'Semua Role')}</option>
              <option value="superuser">{t('admin.superuser_system', 'Superuser (System)')}</option>
              <option value="admin">{t('admin.admin_global', 'Admin (Global)')}</option>
              <option value="manager">{t('admin.manager_group', 'Manager (Group)')}</option>
              <option value="editor">{t('admin.editor_group', 'Editor (Group)')}</option>
              <option value="viewer">{t('admin.viewer_read_only', 'Viewer (Read-Only)')}</option>
            </Select>

            {/* Tenant / Organization Filter */}
            <Select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              aria-label={t('admin.filter_tenant_all', 'Semua Tenant')}
              className="h-8 w-auto text-xs"
            >
              <option value="all">{t('admin.filter_tenant_all', 'Semua Tenant')}</option>
              <option value="global">{t('admin.filter_tenant_global', 'Akses Global (Semua Tenant)')}</option>
              {(organizations || []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} {org.metadata?.brandName && org.metadata.brandName !== org.name ? `(${org.metadata.brandName})` : ''}
                </option>
              ))}
            </Select>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('admin.col_account_status', 'Status Akun')}
              className="h-8 w-auto text-xs"
            >
              <option value="all">{t('admin.filter_status_all', 'Semua Status')}</option>
              <option value="active">{t('admin.filter_active', 'Aktif')}</option>
              <option value="banned">{t('admin.filter_banned', 'Dicekal')}</option>
            </Select>
          </div>

          {/* Add User Action */}
          {canCreateUser && (
            <Button type="button" size="sm" onClick={onOpenAddUser} className="shrink-0">
              <UserPlus className="w-4 h-4" />
              <span>{t('admin.add_user_btn', 'Tambah Pengguna Baru')}</span>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedUserIds.length > 0 && (
        <div
          role="toolbar"
          aria-label={t('admin.bulk_actions_for_selected_users', 'Bulk actions for selected users')}
          className="flex items-center justify-between gap-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 p-3 rounded-xl shadow-xs"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-900 dark:text-purple-300">
            <Users className="w-4 h-4 text-purple-600" />
            <span>
              {selectedUserIds.length} {t('admin.users_selected', 'users selected')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onBulkAction('ban', selectedUserIds);
                setSelectedUserIds([]);
              }}
              className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{t('admin.bulk_ban', 'Cekal Massal')}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onBulkAction('unban', selectedUserIds);
                setSelectedUserIds([]);
              }}
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('admin.bulk_unban', 'Buka Cekal Massal')}</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                onBulkAction('delete', selectedUserIds);
                setSelectedUserIds([]);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('admin.bulk_delete', 'Hapus Massal')}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUserIds([])}>
              {t('admin.btn_cancel', 'Batal')}
            </Button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label={t('admin.select_all_users', 'Select all users')}
                      checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds(filteredUsers.map((u) => u.id));
                        } else {
                          setSelectedUserIds([]);
                        }
                      }}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755] cursor-pointer"
                    />
                  </div>
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_identifier', 'Pengguna')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_role', 'Peran (Role)')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.tab_teams', 'Departemen')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.select_tenant_label', 'Organisasi / Tenant')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_account_status', 'Status Akun')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_sessions_count', 'Sesi Aktif')}
                </th>
                <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  {t('admin.col_created', 'Terdaftar')}
                </th>
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('admin.col_action', 'Aksi')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-500">
                    {t('admin.no_users_found', 'Tidak ada pengguna yang cocok dengan kriteria pencarian.')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    {/* Checkbox */}
                    <td className="pl-6 pr-2 py-4 text-left align-middle">
                      <input
                        type="checkbox"
                        aria-label={`${t('admin.select', 'Select')} ${user.name}`}
                        checked={selectedUserIds.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds((prev) => [...prev, user.id]);
                          } else {
                            setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755] cursor-pointer"
                      />
                    </td>

                    {/* User info */}
                    <td className="py-4 px-4 text-left align-middle">
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
                            <span title={t('admin.verified_email', 'Verified Email')}>
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

                  {/* Role */}
                  <td className="py-4 px-4 text-left align-middle">
                    <Badge
                      variant={ROLE_BADGE_VARIANT[user.role] || 'secondary'}
                      className="gap-1 px-2.5 py-0.5 text-[11px] font-semibold"
                    >
                      <Shield className="w-3 h-3" />
                      {user.role.toUpperCase()}
                    </Badge>
                  </td>

                  {/* Department */}
                  <td className="py-4 px-4 text-left align-middle text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                    {user.role === 'superuser' || user.role === 'admin'
                      ? t('admin.all_departments', 'Semua Departemen (Akses Global)')
                      : user.department || '-'}
                  </td>

                  {/* Organization / Tenant */}
                  <td className="py-4 px-4 text-left align-middle">
                    {user.role === 'superuser' || (user.role === 'admin' && !user.organizationId) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span>{t('admin.global_access', 'Akses Global (Semua Tenant)')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-40">
                          {user.organizationName ||
                            organizations.find((o) => o.id === user.organizationId)?.name ||
                            user.organizationId ||
                            '-'}
                        </span>
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-4 px-4 text-left align-middle">
                    {user.banned ? (
                      <Badge variant="destructive" className="gap-1 px-2 py-0.5 text-[10px]">
                        <Ban className="w-3 h-3" />
                        {t('admin.filter_banned', 'Dicekal')}
                      </Badge>
                    ) : (
                      <Badge variant="success" className="gap-1 px-2 py-0.5 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('admin.filter_active', 'Aktif')}
                      </Badge>
                    )}
                  </td>

                  {/* Active Sessions */}
                  <td className="py-4 px-4 text-left align-middle font-mono text-slate-600 dark:text-slate-400">
                    {user.sessionCount ?? 0} {t('admin.sessions_2', 'sessions')}
                  </td>

                  {/* Joined Date */}
                  <td className="py-4 px-4 text-left align-middle text-slate-500 dark:text-slate-400 text-[11px]">
                    {new Date(user.createdAt).toLocaleDateString(getActiveFormattingLocale(), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>

                  {/* Actions */}
                  <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenEditUser(user)}
                        aria-label={t('admin.action_edit_user', 'Ubah Informasi & Peran')}
                        title={t('admin.action_edit_user', 'Ubah Informasi & Peran')}
                        className="h-7 w-7 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenResetPassword(user)}
                        aria-label={t('admin.action_reset_pwd', 'Reset Kata Sandi')}
                        title={t('admin.action_reset_pwd', 'Reset Kata Sandi')}
                        className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleBan(user)}
                        aria-label={user.banned ? t('admin.action_unban', 'Buka Cekal') : t('admin.action_ban', 'Cekal Pengguna')}
                        title={user.banned ? t('admin.action_unban', 'Buka Cekal') : t('admin.action_ban', 'Cekal Pengguna')}
                        className={`h-7 w-7 ${
                          user.banned
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                        }`}
                      >
                        {user.banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteUser(user)}
                        aria-label={t('admin.action_delete', 'Hapus Pengguna')}
                        title={t('admin.action_delete', 'Hapus Pengguna')}
                        className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
