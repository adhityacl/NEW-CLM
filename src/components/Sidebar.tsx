import React, { useState } from 'react';
import {
  Globe2,
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileText,
  FileSignature,
  FileSpreadsheet,
  GitFork,
  Bell,
  Users,
  Clock,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Upload,
  X,
  Sliders,
  Radio,
  Layers,
  Mail,
  Lock,
  Shield,
  Database,
  Bot,
  Languages,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { GoogleSheetsConfig } from '../types';
import { isGoogleTokenValid, getGoogleTokenRemainingMinutes } from '../lib/googleAuthService';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { usePermissions } from '../lib/permissions';
import { useTenantSettings } from '../context/TenantSettingsContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unresolvedNotifsCount: number;
  expiringContractsCount: number;
  googleConfig?: GoogleSheetsConfig;
  lastSyncTimestamp?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
  badgeColor?: string;
  adminOnly?: boolean;
  systemOnly?: boolean;
  tenantOnly?: boolean;
  permission?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  unresolvedNotifsCount,
  expiringContractsCount,
  googleConfig,
  lastSyncTimestamp: _lastSyncTimestamp,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { standardRole } = useAuth();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();
  const { policy } = useTenantSettings();
  const modules = policy.settings.modules;
  const { theme, toggleTheme } = useTheme();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const [isPartnerExpanded, setIsPartnerExpanded] = useState<boolean>(() => {
    return activeTab === 'partners' || activeTab === 'partner-evaluation' || activeTab === 'partner-spending';
  });

  const [isAdminExpanded, setIsAdminExpanded] = useState<boolean>(() => {
    return activeTab.startsWith('admin-users');
  });

  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(() => {
    return activeTab === 'settings' || activeTab.startsWith('settings-');
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  // Google OAuth Drive Storage Status
  const isDriveConfigured = Boolean(googleConfig?.driveFolderId);
  const hasGoogleToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('google_access_token'));
  const isTokenValid = isGoogleTokenValid();
  const tokenMinutes = getGoogleTokenRemainingMinutes();

  let driveDotClass = 'bg-slate-400 ring-slate-400/20';
  let driveTooltip = 'Google Drive: Belum Dikonfigurasi (Unggahan file disimpan lokal)';

  if (isDriveConfigured) {
    if (!hasGoogleToken || !isTokenValid || tokenMinutes <= 0) {
      driveDotClass = 'bg-red-500 ring-red-500/20';
      driveTooltip = 'Google Drive: Sesi Google kadaluarsa atau belum terhubung';
    } else if (tokenMinutes <= 10) {
      driveDotClass = 'bg-amber-500 ring-amber-500/20';
      driveTooltip = `Google Drive: Token akan kadaluarsa (Sisa ~${tokenMinutes} menit)`;
    } else {
      driveDotClass = 'bg-emerald-500 ring-emerald-500/20';
      driveTooltip = `Google Drive: Terhubung & Siap (Sisa ~${tokenMinutes} menit)`;
    }
  }

  // Navigation Items
  const mainNavItems: SidebarNavItem[] = [
    {
      id: 'dashboard',
      label: t('nav.dashboard', 'Dashboard'),
      icon: LayoutDashboard,
    },
    {
      id: 'hierarchy',
      label: t('nav.hierarchy', 'Struktur & Hirarki'),
      icon: GitFork,
    },
    {
      id: 'partners',
      label: t('nav.partners', 'Mitra Kerja'),
      icon: Building2,
    },
    {
      id: 'contracts',
      label: t('nav.contracts', 'Kontrak'),
      icon: FileText,
      badge: expiringContractsCount > 0 ? `${expiringContractsCount}` : null,
      badgeColor: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    },
    ...(modules.commercialDocuments
      ? [{
          id: 'ios',
          label: t('nav.ios', '{docs}'),
          icon: FileSpreadsheet,
        }]
      : []),
    {
      id: 'notifikasi',
      label: t('nav.notifications', 'Notifikasi'),
      icon: Bell,
      badge: unresolvedNotifsCount > 0 ? `${unresolvedNotifsCount}` : null,
      badgeColor: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800',
    },
  ];

  const docNavItems: SidebarNavItem[] = [
    {
      id: 'create-contract',
      label: t('nav.create_contract', 'Buat Kontrak'),
      icon: FileSignature,
      permission: 'document.create',
    },
  ];

  const adminNavItems: SidebarNavItem[] = [
    {
      id: 'admin-system',
      label: 'System Admin',
      icon: Users,
      permission: 'admin.system.access',
      adminOnly: true,
      systemOnly: true,
    },
    {
      id: 'admin-organization',
      label: 'Organization Admin',
      icon: Building2,
      permission: 'admin.access',
      tenantOnly: true,
    },
    {
      id: 'bulk-import',
      label: t('nav.bulk_import', 'Import Data'),
      icon: Upload,
      permission: 'admin.department.manage',
    },
    {
      id: 'activity-logs',
      label: t('nav.activity_logs', 'Log Aktivitas'),
      icon: Clock,
      permission: 'audit.view',
    },
    {
      id: 'settings',
      label: t('nav.settings', 'Pengaturan'),
      icon: Settings,
      permission: 'admin.access',
    },
  ];

  const navSections = [
    {
      id: 'main',
      title: t('nav.main_title', 'Menu Utama'),
      items: mainNavItems.filter((item) =>
        (!item.adminOnly || standardRole === 'admin' || standardRole === 'superuser') &&
        (!item.systemOnly || standardRole === 'superuser') &&
        (!item.tenantOnly || standardRole !== 'superuser') &&
        (!item.permission || hasPermission(item.permission)),
      ),
    },
    {
      id: 'documents',
      title: t('nav.doc_title', 'Dokumen'),
      items: docNavItems.filter((item) =>
        (!item.adminOnly || standardRole === 'admin' || standardRole === 'superuser') &&
        (!item.systemOnly || standardRole === 'superuser') &&
        (!item.tenantOnly || standardRole !== 'superuser') &&
        (!item.permission || hasPermission(item.permission)),
      ),
    },
    {
      id: 'admin',
      title: t('nav.admin_title', 'Administrasi'),
      items: adminNavItems.filter((item) =>
        (!item.adminOnly || standardRole === 'admin' || standardRole === 'superuser') &&
        (!item.systemOnly || standardRole === 'superuser') &&
        (!item.tenantOnly || standardRole !== 'superuser') &&
        (!item.permission || hasPermission(item.permission)),
      ),
    },
  ].filter((section) => section.items.length > 0);

  // Submenu definition for Admin Access
  const systemAdminSubItems = [
    { id: 'admin-users-dashboard', label: t('admin.tab_dashboard', 'Dashboard'), icon: Sliders },
    { id: 'admin-users-users', label: t('admin.tab_users', 'Pengguna'), icon: Users },
    { id: 'admin-users-sessions', label: t('admin.tab_sessions', 'Sesi Aktif'), icon: Radio },
    { id: 'admin-users-organizations', label: t('admin.tab_organizations', 'Organisasi'), icon: Building2 },
    { id: 'admin-users-apikeys', label: t('admin.tab_apikeys', 'API Keys'), icon: Lock },
    { id: 'admin-users-rbac', label: t('admin.tab_rbac', 'Matriks Hak Akses'), icon: Shield },
  ];

  const organizationAdminSubItems = [
    { id: 'admin-users-users', label: t('admin.tab_users', 'Pengguna'), icon: Users },
    { id: 'admin-users-teams', label: t('admin.tab_teams', 'Departemen'), icon: Layers },
    { id: 'admin-users-invitations', label: t('admin.tab_invitations', 'Undangan'), icon: Mail },
  ];

  // Submenu definition for Partners
  const partnerSubItems = [
    { id: 'partners', label: t('nav.partners_list', 'Daftar Mitra'), icon: Building2 },
    ...(modules.evaluation ? [{ id: 'partner-evaluation', label: t('nav.partner_eval', 'Evaluasi Kinerja'), icon: ClipboardCheck }] : []),
    ...(modules.spending ? [{ id: 'partner-spending', label: t('nav.partner_spending', 'Pengeluaran Mitra'), icon: CreditCard }] : []),
  ];

  // Submenu definition for Settings
  const settingsSubItems = [
    { id: 'settings-region', label: t('settings.nav_region', 'Organization & region'), icon: Globe2, adminOnly: true },
    { id: 'settings-google', label: t('settings.nav_google', 'Google & Database'), icon: Database },
    { id: 'settings-ai', label: t('settings.nav_ai', 'Model AI & Parser'), icon: Bot, adminOnly: true },
    { id: 'settings-notifications', label: t('settings.nav_notifications', 'Penerima Notifikasi'), icon: Bell, adminOnly: true },
    { id: 'settings-language', label: t('settings.nav_language', 'Teks UI & Lokalisasi'), icon: Languages, adminOnly: true },
    { id: 'settings-security', label: t('settings.nav_security', 'Keamanan & Maintenance'), icon: ShieldAlert, adminOnly: true },
  ].filter((sub) => !sub.adminOnly || standardRole === 'admin' || standardRole === 'superuser');

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  // Reusable Nav List Renderer for both Desktop and Mobile
  const renderNavList = (isMobile: boolean) => {
    return (
      <div className="space-y-4">
        {navSections.map((section, sectionIdx) => (
          <div key={section.id} className="space-y-1">
            {!isCollapsed || isMobile ? (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-3 pt-1 pb-1">
                {section.title}
              </p>
            ) : (
              sectionIdx > 0 && <div className="w-8 h-px bg-slate-200 dark:bg-slate-800 mx-auto my-2" />
            )}

            <nav className="space-y-1" role="navigation" aria-label={section.title}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isPartnerActive =
                  activeTab === 'partners' ||
                  activeTab === 'partner-evaluation' ||
                  activeTab === 'partner-spending';
                const isAdminActive =
                  item.id === 'admin-system'
                    ? activeTab.startsWith('admin-system-')
                    : item.id === 'admin-organization'
                    ? activeTab.startsWith('admin-organization-')
                    : activeTab === 'admin-users' || activeTab.startsWith('admin-users-');
                const isSettingsActive =
                  activeTab === 'settings' || activeTab.startsWith('settings-');

                // Collapsed desktop mode
                if (isCollapsed && !isMobile) {
                  const collapsedActive =
                    item.id === 'partners'
                      ? isPartnerActive
                      : item.id === 'admin-system' || item.id === 'admin-organization'
                      ? isAdminActive
                      : item.id === 'settings'
                      ? isSettingsActive
                      : isActive;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        handleNavClick(
                          item.id === 'admin-system'
                            ? 'admin-system-dashboard'
                            : item.id === 'admin-organization'
                            ? 'admin-organization-users'
                            : item.id === 'settings'
                            ? 'settings-region'
                            : item.id
                        )
                      }
                      title={item.label}
                      aria-label={item.label}
                      aria-current={collapsedActive ? 'page' : undefined}
                      className={`relative w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
                        collapsedActive
                          ? 'bg-[#06C755] text-white shadow-2xs font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.badge && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                }

                // Partner Item with Submenu
                if (item.id === 'partners') {
                  return (
                    <div key={item.id} className="space-y-0.5">
                      <div
                        className={`w-full flex items-center justify-between px-3 py-2 ${
                          isMobile ? 'min-h-11' : 'min-h-9.5'
                        } rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none ${
                          isPartnerActive
                            ? 'bg-[#06C755] text-white shadow-2xs'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        onClick={() => {
                          handleNavClick('partners');
                          setIsPartnerExpanded((prev) => !prev);
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPartnerExpanded((prev) => !prev);
                          }}
                          className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus-visible:outline-none"
                          aria-label={isPartnerExpanded ? 'Tutup Submenu' : 'Buka Submenu'}
                          aria-expanded={isPartnerExpanded}
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isPartnerExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </button>
                      </div>

                      {isPartnerExpanded && (
                        <div className="pl-3.5 pr-1 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-3.5 mt-0.5 animate-in fade-in duration-150">
                          {partnerSubItems.map((sub) => {
                            const SubIcon = sub.icon;
                            const isSubActive = activeTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleNavClick(sub.id)}
                                aria-current={isSubActive ? 'page' : undefined}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 ${
                                  isMobile ? 'min-h-10' : 'min-h-8'
                                } rounded-lg text-xs font-medium transition-colors cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
                                  isSubActive
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                }`}
                              >
                                <SubIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Admin Item with Submenu
                if (item.id === 'admin-system' || item.id === 'admin-organization') {
                  const isSystemAdminItem = item.id === 'admin-system';
                  const submenuItems = isSystemAdminItem ? systemAdminSubItems : organizationAdminSubItems;
                  const adminPrefix = isSystemAdminItem ? 'admin-system-' : 'admin-organization-';
                  return (
                    <div key={item.id} className="space-y-0.5">
                      <div
                        className={`w-full flex items-center justify-between px-3 py-2 ${
                          isMobile ? 'min-h-11' : 'min-h-9.5'
                        } rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none ${
                          isAdminActive
                            ? 'bg-[#06C755] text-white shadow-2xs'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        onClick={() => {
                          handleNavClick(isSystemAdminItem ? `${adminPrefix}dashboard` : `${adminPrefix}users`);
                          setIsAdminExpanded((prev) => !prev);
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsAdminExpanded((prev) => !prev);
                          }}
                          className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus-visible:outline-none"
                          aria-label={isAdminExpanded ? 'Tutup Submenu' : 'Buka Submenu'}
                          aria-expanded={isAdminExpanded}
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isAdminExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </button>
                      </div>

                      {isAdminExpanded && (
                        <div className="pl-3.5 pr-1 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-3.5 mt-0.5 animate-in fade-in duration-150">
                          {submenuItems.map((sub) => {
                            const SubIcon = sub.icon;
                            const subTab = `${adminPrefix}${sub.id.replace('admin-users-', '')}`;
                            const isSubActive = activeTab === subTab;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleNavClick(subTab)}
                                aria-current={isSubActive ? 'page' : undefined}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 ${
                                  isMobile ? 'min-h-10' : 'min-h-8'
                                } rounded-lg text-xs font-medium transition-colors cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
                                  isSubActive
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                }`}
                              >
                                <SubIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Settings Item with Submenu
                if (item.id === 'settings') {
                  return (
                    <div key={item.id} className="space-y-0.5">
                      <div
                        className={`w-full flex items-center justify-between px-3 py-2 ${
                          isMobile ? 'min-h-11' : 'min-h-9.5'
                        } rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none ${
                          isSettingsActive
                            ? 'bg-[#06C755] text-white shadow-2xs'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        onClick={() => {
                          handleNavClick('settings-region');
                          setIsSettingsExpanded((prev) => !prev);
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSettingsExpanded((prev) => !prev);
                          }}
                          className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus-visible:outline-none"
                          aria-label={isSettingsExpanded ? 'Tutup Submenu' : 'Buka Submenu'}
                          aria-expanded={isSettingsExpanded}
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isSettingsExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </button>
                      </div>

                      {isSettingsExpanded && (
                        <div className="pl-3.5 pr-1 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-3.5 mt-0.5 animate-in fade-in duration-150">
                          {settingsSubItems.map((sub) => {
                            const SubIcon = sub.icon;
                            const isSubActive =
                              activeTab === sub.id ||
                              (sub.id === 'settings-region' && activeTab === 'settings');
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleNavClick(sub.id)}
                                aria-current={isSubActive ? 'page' : undefined}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 ${
                                  isMobile ? 'min-h-10' : 'min-h-8'
                                } rounded-lg text-xs font-medium transition-colors cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
                                  isSubActive
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                }`}
                              >
                                <SubIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Regular Nav Item
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2 ${
                      isMobile ? 'min-h-11' : 'min-h-9.5'
                    } rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
                      isActive
                        ? 'bg-[#06C755] text-white shadow-2xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.badgeColor ||
                          'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex ${
          isCollapsed ? 'w-18' : 'w-64'
        } bg-white dark:bg-slate-900 flex-col shrink-0 text-slate-900 dark:text-slate-100 border-r border-slate-200/80 dark:border-slate-800 transition-all duration-300 ease-in-out z-30 sticky top-0 h-screen`}
      >
        {/* Workspace Switcher + Collapse Button */}
        <div
          className={`h-16 px-3 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between gap-1.5'
          } border-b border-slate-200/80 dark:border-slate-800 shrink-0 relative`}
        >
          {isCollapsed ? (
            <button
              type="button"
              onClick={toggleCollapse}
              className="min-w-11 min-h-11 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#06C755] dark:hover:text-[#06C755] flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none"
              title={t('nav.expand_menu', 'Perluas Menu')}
              aria-label={t('nav.expand_menu', 'Perluas Menu')}
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <WorkspaceSwitcher
                  isCollapsed={false}
                  onNavigateToSettings={() => setActiveTab('settings')}
                />
              </div>

              <button
                type="button"
                onClick={toggleCollapse}
                className="min-w-11 min-h-11 flex items-center justify-center p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none"
                title={t('nav.collapse_menu', 'Kecilkan Menu')}
                aria-label={t('nav.collapse_menu', 'Kecilkan Menu')}
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Desktop Navigation Scroll Container */}
        <div className="flex-1 p-3 overflow-y-auto">
          {renderNavList(false)}
        </div>

        {/* Footer: System Status Indicators & Version */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 select-none">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <div
                title={driveTooltip}
                className={`w-2.5 h-2.5 rounded-full ring-2 ${driveDotClass} transition-colors`}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  title={driveTooltip}
                  className={`w-2.5 h-2.5 rounded-full ring-2 ${driveDotClass} transition-colors cursor-help`}
                />
              </div>

              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {t('nav.version', 'v2.5.0 • ACL')}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 transition-opacity duration-200 md:hidden ${
          isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseMobile}
        aria-hidden={!isMobileOpen}
      />

      {/* Mobile Drawer Sheet */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 z-50 flex flex-col shadow-2xl border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!isMobileOpen}
        role="dialog"
        aria-label="Menu Navigasi Mobile"
      >
        {/* Mobile Header: Workspace Switcher + Close Button */}
        <div className="h-16 px-3 flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <div className="flex-1 min-w-0">
            <WorkspaceSwitcher
              isCollapsed={false}
              onNavigateToSettings={() => {
                setActiveTab('settings');
                onCloseMobile?.();
              }}
            />
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="min-w-11 min-h-11 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Nav Menu List */}
        <div className="flex-1 p-3 overflow-y-auto">
          {renderNavList(true)}
        </div>

        {/* Mobile Drawer Footer */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <div
              title={driveTooltip}
              className={`w-2.5 h-2.5 rounded-full ring-2 ${driveDotClass}`}
            />
          </div>

          <span className="text-[10px] font-medium">
            {t('nav.version', 'v2.5.0 • ACL')}
          </span>
        </div>
      </aside>
    </>
  );
};
