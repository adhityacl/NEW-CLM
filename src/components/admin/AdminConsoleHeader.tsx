import React from 'react';
import {
  Building2,
  RefreshCw,
  Sliders,
  Shield,
  Users,
  Layers,
  Radio,
  Mail,
  Lock,
  FileCode2,
} from 'lucide-react';
import { ConsoleOrganization, ConsoleSubmenu } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { usePermissions } from '../../lib/permissions';

interface AdminConsoleHeaderProps {
  area: 'system' | 'organization';
  activeTab: ConsoleSubmenu;
  onTabChange: (tab: ConsoleSubmenu) => void;
  organizations: ConsoleOrganization[];
  activeOrg: ConsoleOrganization | null;
  onSelectOrg: (org: ConsoleOrganization) => void;
  onCreateOrgClick: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenInstanceModal: () => void;
  userCounts: {
    users: number;
    sessions: number;
    orgs: number;
    teams: number;
    invites: number;
    apiKeys: number;
  };
}

export const AdminConsoleHeader: React.FC<AdminConsoleHeaderProps> = ({
  area,
  activeTab,
  onTabChange,
  organizations,
  activeOrg,
  onSelectOrg,
  onCreateOrgClick: _onCreateOrgClick,
  onRefresh,
  isRefreshing,
  onOpenInstanceModal,
  userCounts,
}) => {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const isSystemArea = area === 'system';

  const navItems: Array<{
    id: ConsoleSubmenu;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    badgeColor?: string;
  }> = [
    { id: 'dashboard', label: t('admin.tab_dashboard', 'Dashboard'), icon: Sliders },
    { id: 'users', label: t('admin.tab_users', 'Pengguna'), icon: Users, count: userCounts.users },
    { id: 'sessions', label: t('admin.tab_sessions', 'Sesi'), icon: Radio, count: userCounts.sessions, badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    { id: 'organizations', label: t('admin.tab_organizations', 'Organisasi'), icon: Building2, count: userCounts.orgs },
    { id: 'teams', label: t('admin.tab_teams', 'Departemen'), icon: Layers, count: userCounts.teams },
    { id: 'invitations', label: t('admin.tab_invitations', 'Undangan'), icon: Mail, count: userCounts.invites },
    { id: 'apikeys', label: t('admin.tab_apikeys', 'API Keys'), icon: Lock, count: userCounts.apiKeys },
    { id: 'rbac', label: t('admin.tab_rbac', 'RBAC Matrix'), icon: Shield },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (!isSystemArea && ['sessions', 'organizations', 'apikeys', 'rbac'].includes(item.id)) return false;
    if (!isSystemArea && item.id === 'dashboard') return false;
    const requiredPermission: Record<ConsoleSubmenu, string> = {
      dashboard: 'admin.access',
      users: 'admin.user.manage',
      accounts: 'admin.access',
      sessions: 'admin.access',
      organizations: 'admin.tenant.manage',
      teams: 'admin.department.manage',
      invitations: 'user.invite',
      apikeys: 'admin.configuration.manage',
      rbac: 'admin.access',
    };
    return hasPermission(requiredPermission[item.id]);
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 px-4 dark:border-slate-800 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs dark:bg-emerald-500">
            {isSystemArea ? <Shield className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {isSystemArea ? 'System Admin' : 'Organization Admin'}
            </h1>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {isSystemArea ? 'Global platform controls' : 'Active organization controls'}
            </p>
          </div>

          {/* Org Selector Dropdown */}
          {isSystemArea && organizations.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2 pl-3 border-l border-slate-200 dark:border-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Pilih Organisasi"
                value={activeOrg?.id || ''}
                onChange={(e) => {
                  const selected = organizations.find((o) => o.id === e.target.value);
                  if (selected) onSelectOrg(selected);
                }}
                className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.slug ? `(${org.slug})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenInstanceModal}
            title={t('admin.instance_config_btn', 'Konfigurasi sistem')}
            className="hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:inline-flex"
          >
            Konfigurasi
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={t('admin.refresh_btn', 'Segarkan Data')}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto bg-slate-50/70 px-3 py-2 dark:bg-slate-950/30 sm:px-4">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    item.badgeColor || (isActive ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
