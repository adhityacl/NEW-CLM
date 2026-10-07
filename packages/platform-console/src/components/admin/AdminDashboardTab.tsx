import React from 'react';
import { getActiveFormattingLocale } from '@legalio/shared/currencyUtils';
import {
  Users,
  Radio,
  Building2,
  Layers,
  ShieldCheck,
  KeyRound,
  Plus,
  Clock,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import {
  ConsoleMetrics,
  ConsoleOrganization,
  ConsoleSession,
  ConsoleSubmenu,
  ConsoleUser,
} from './types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminDashboardTabProps {
  metrics: ConsoleMetrics | null;
  activeOrg: ConsoleOrganization | null;
  recentUsers: ConsoleUser[];
  recentSessions: ConsoleSession[];
  onNavigateTab: (tab: ConsoleSubmenu) => void;
  onOpenCreateOrg: () => void;
  onOpenCreateTeam: () => void;
  onOpenCreateApiKey: () => void;
  onRevokeSession: (sessionId: string) => void;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  metrics,
  activeOrg,
  recentUsers,
  recentSessions,
  onNavigateTab,
  onOpenCreateOrg,
  onOpenCreateTeam,
  onOpenCreateApiKey,
  onRevokeSession,
}) => {
  const { t, language } = useLanguage();
  const activeSessions = recentSessions.filter((session) => new Date(session.expiresAt) >= new Date());

  const statCards = [
    {
      label: t('admin.card_total_users', 'Total Pengguna'),
      value: metrics?.totalUsers ?? 0,
      sub: `${metrics?.activeUsers ?? 0} ${t('admin.status_active', 'aktif')}, ${metrics?.bannedUsers ?? 0} ${t('admin.status_banned', 'dicekal')}`,
      icon: Users,
      tab: 'users' as ConsoleSubmenu,
      accent: 'emerald',
    },
    {
      label: t('admin.card_active_sessions', 'Sesi Aktif'),
      value: metrics?.activeSessions ?? 0,
      sub: t('admin.sub_valid_tokens', 'Token valid realtime'),
      icon: Radio,
      tab: 'sessions' as ConsoleSubmenu,
      accent: 'blue',
      pulse: true,
    },
    {
      label: t('admin.card_enterprise_orgs', 'Organisasi Enterprise'),
      value: metrics?.totalOrgs ?? 0,
      sub: activeOrg ? `${t('admin.active_prefix', 'Aktif:')} ${activeOrg.name}` : t('admin.sub_tenant_isolate', 'Multi-tenant isolate'),
      icon: Building2,
      tab: 'organizations' as ConsoleSubmenu,
      accent: 'purple',
    },
    {
      label: t('admin.card_departments_teams', 'Departemen / Teams'),
      value: metrics?.totalTeams ?? 0,
      sub: 'Legal, Finance, Commercial',
      icon: Layers,
      tab: 'teams' as ConsoleSubmenu,
      accent: 'amber',
    },
    {
      label: t('admin.card_verified_accounts', 'Akun Terverifikasi'),
      value: metrics?.verifiedUsers ?? 0,
      sub: `${metrics?.credentialAccounts ?? 0} Password / ${metrics?.googleAccounts ?? 0} Google`,
      icon: ShieldCheck,
      tab: 'users' as ConsoleSubmenu,
      accent: 'teal',
    },
    {
      label: t('admin.card_active_apikeys', 'API Keys Aktif'),
      value: metrics?.totalApiKeys ?? 0,
      sub: t('admin.sub_machine_integration', 'Integrasi mesin & webhook'),
      icon: KeyRound,
      tab: 'apikeys' as ConsoleSubmenu,
      accent: 'slate',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => onNavigateTab(card.tab)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer group shadow-xs hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-600 dark:group-hover:bg-emerald-950/50 dark:group-hover:text-emerald-400 transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                  {card.value}
                </span>
                {card.pulse && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    {t('admin.online_status', 'Online')}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{card.sub}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Two Columns: Recent Users & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('admin.recent_users_title', 'Pengguna Terbaru')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('users')}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
            >
              {t('admin.view_all', 'Lihat Semua')}
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {t('admin.no_users_found', 'Belum ada pengguna terdaftar.')}
              </div>
            ) : (
              recentUsers.slice(0, 5).map((user) => (
                <div
                  key={user.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 font-semibold text-xs shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <div className="font-medium text-xs text-slate-900 dark:text-slate-100 truncate">
                        {user.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.role === 'superuser'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                          : user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                          : user.role === 'manager' || user.role === 'legal'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          : user.role === 'editor' || user.role === 'finance'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {user.role.toUpperCase()}
                    </span>
                    {user.banned ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-medium">
                        {t('admin.status_banned', 'Dicekal')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {new Date(user.createdAt).toLocaleDateString(getActiveFormattingLocale(), {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Active Sessions Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('admin.active_login_sessions_title', 'Sesi Login Aktif')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('sessions')}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
            >
              {t('admin.view_all', 'Lihat Semua')} ({activeSessions.length})
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activeSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {t('admin.no_sessions_found', 'Tidak ada sesi login aktif saat ini.')}
              </div>
            ) : (
              activeSessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs text-slate-900 dark:text-slate-100">
                        {session.userName || t('admin.generic_user', 'Pengguna')}
                      </span>
                      <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {session.ipAddress || t('admin.not_available', 'Tidak tersedia')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                      {t('admin.token', 'Token:')} {session.token ? `${session.token.slice(0, 10)}...` : (session.id || '').slice(0, 10)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      {t('admin.expires_prefix', 'Kadaluarsa:')} {new Date(session.expiresAt).toLocaleDateString(getActiveFormattingLocale())}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRevokeSession(session.id)}
                      className="px-2 py-1 rounded text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                      title={t('admin.btn_revoke_session', 'Cabut sesi login ini')}
                    >
                      {t('admin.btn_revoke', 'Cabut')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
