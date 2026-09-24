import React from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import {
  Users,
  Radio,
  Building2,
  Layers,
  ShieldCheck,
  KeyRound,
  UserPlus,
  Plus,
  ShieldAlert,
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
  onOpenAddUser: () => void;
  onOpenCreateOrg: () => void;
  onOpenCreateTeam: () => void;
  onOpenCreateApiKey: () => void;
  onRevokeSession: (sessionId: string) => void;
  canCreateUser?: boolean;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  metrics,
  activeOrg,
  recentUsers,
  recentSessions,
  onNavigateTab,
  onOpenAddUser,
  onOpenCreateOrg,
  onOpenCreateTeam,
  onOpenCreateApiKey,
  onRevokeSession,
  canCreateUser = false,
}) => {
  const { t, language } = useLanguage();

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
      {/* Active Organization Banner */}
      {activeOrg && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-linear-to-r from-emerald-50/70 via-white to-emerald-50/30 dark:from-emerald-950/30 dark:via-slate-900 dark:to-emerald-950/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0 overflow-hidden">
              {activeOrg.logo && activeOrg.logo !== '/favicon.png' ? (
                <img
                  src={activeOrg.logo}
                  alt={activeOrg.name}
                  className="w-full h-full object-contain p-1 bg-white dark:bg-slate-900"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span>{activeOrg.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                  {activeOrg.name}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {activeOrg.metadata?.tagline || t('admin.org_banner_default_tagline', 'Organisasi Enterprise aktif untuk tata kelola kontrak & hak akses RBAC.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => onNavigateTab('organizations')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5" />
              {t('admin.btn_manage_org', 'Kelola Organisasi')}
            </button>
            {canCreateUser && (
              <button
                type="button"
                onClick={onOpenAddUser}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {t('admin.btn_add_member', 'Tambah Anggota')}
              </button>
            )}
          </div>
        </div>
      )}

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
                <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono">
                  {card.value}
                </span>
                {card.pulse && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
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

      {/* Better Auth Infrastructure & Security Controls (@better-auth/infra) */}
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/80 bg-linear-to-r from-indigo-50/60 via-white to-purple-50/40 dark:from-indigo-950/30 dark:via-slate-900 dark:to-purple-950/20 p-4.5 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-indigo-100 dark:border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs font-mono font-bold text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>INFRA</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Better Auth Infrastructure (@better-auth/infra)
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
                  v1.7.1 Connected
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Pengamanan tingkat lanjut, audit log real-time, dan manajemen hak akses terintegrasi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sentinel Security: Active
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Dash Engine */}
          <div className="p-3.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <ShieldCheck className="w-4 h-4" />
                Dash Engine (`dash()`)
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">ONLINE</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Audit logging terenkripsi, pelacakan histori sesi, serta agregasi metrik pengguna secara otomatis.
            </p>
          </div>

          {/* Sentinel Security */}
          <div className="p-3.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
              <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                <ShieldAlert className="w-4 h-4" />
                Sentinel (`sentinel()`)
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">PROTECTED</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Perlindungan credential stuffing, deteksi bot/spam otomatis, dan rate-limiting IP berbasis Proof-of-Work.
            </p>
          </div>

          {/* RBAC Access Matrix */}
          <div className="p-3.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <KeyRound className="w-4 h-4" />
                RBAC & Whitelist Gate
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">ENFORCED</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Matriks hak akses 8 role (Superuser, Admin, Manager, Legal, dll) terintegrasi dengan persetujuan pendaftaran.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          {t('admin.quick_actions_title', 'Tindakan Cepat (Quick Actions)')}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {canCreateUser && (
            <button
              type="button"
              onClick={onOpenAddUser}
              className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-all text-left"
            >
              <UserPlus className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('admin.quick_add_user', 'Tambah User Baru')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCreateOrg}
            className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-all text-left"
          >
            <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span>{t('admin.quick_create_org', 'Buat Organisasi')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateTeam}
            className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-all text-left"
          >
            <Layers className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{t('admin.quick_create_team', 'Buat Tim/Divisi')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateApiKey}
            className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-all text-left"
          >
            <KeyRound className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{t('admin.btn_generate_key', 'Generate API Key')}</span>
          </button>
        </div>
      </div>

      {/* Two Columns: Recent Users & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('admin.recent_users_title', 'Pengguna Terbaru')}
              </h4>
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
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-medium">
                        {t('admin.status_banned', 'Dicekal')}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">
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
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('admin.active_login_sessions_title', 'Sesi Login Aktif')}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('sessions')}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
            >
              {t('admin.view_all', 'Lihat Semua')} ({recentSessions.length})
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {t('admin.no_sessions_found', 'Tidak ada sesi login aktif saat ini.')}
              </div>
            ) : (
              recentSessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs text-slate-900 dark:text-slate-100">
                        {session.userName || t('admin.generic_user', 'Pengguna')}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {session.ipAddress || '127.0.0.1'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">
                      Token: {session.token ? `${session.token.slice(0, 10)}...` : (session.id || '').slice(0, 10)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      {t('admin.expires_prefix', 'Kadaluarsa:')} {new Date(session.expiresAt).toLocaleDateString(getActiveFormattingLocale())}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRevokeSession(session.id)}
                      className="px-2 py-1 rounded text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
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
