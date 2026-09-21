import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '../context/NavigationContext';
import { useTenant } from '../context/TenantContext';
import { NotificationLog, GoogleSheetsConfig } from '../types';
import {
  Bell,
  Menu,
  Sun,
  Moon,
  LogOut,
  User,
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
} from 'lucide-react';

interface HeaderProps {
  notifications: NotificationLog[];
  googleConfig: GoogleSheetsConfig;
  onRefreshData: () => void;
  onNavigateToTab: (tab: string) => void;
  onOpenMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  notifications,
  googleConfig: _googleConfig,
  onRefreshData: _onRefreshData,
  onNavigateToTab,
  onOpenMobileMenu,
}) => {
  const { user, logout, isAdmin } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { activeTab } = useNavigation();
  const { activeTenant } = useTenant();

  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Close dropdowns on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifDropdown(false);
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Map active tab to human-readable breadcrumb / section title
  const getTabLabel = (tab: string): string => {
    switch (tab) {
      case 'dashboard':
        return t('nav.dashboard', 'Dashboard');
      case 'hierarchy':
        return t('nav.hierarchy', 'Struktur & Hirarki');
      case 'partners':
      case 'partners-list':
        return t('nav.partners', 'Mitra Kerja');
      case 'partner-evaluation':
        return t('nav.partner_eval', 'Evaluasi Mitra');
      case 'partner-spending':
        return t('nav.partner_spending', 'Pengeluaran Mitra');
      case 'contracts':
        return t('nav.contracts', 'Kontrak');
      case 'create-contract':
        return t('nav.create_contract', 'Buat Kontrak Baru');
      case 'ios':
        return t('nav.ios', 'Insertion Order (IO)');
      case 'notifikasi':
        return t('nav.notifications', 'Notifikasi & Log');
      case 'admin-users':
      case 'admin-users-dashboard':
      case 'admin-users-users':
      case 'admin-users-sessions':
      case 'admin-users-organizations':
      case 'admin-users-teams':
      case 'admin-users-invitations':
      case 'admin-users-apikeys':
      case 'admin-users-rbac':
        return t('nav.admin_users', 'Manajemen Akses & Admin');
      case 'bulk-import':
        return t('nav.bulk_import', 'Import Data');
      case 'activity-logs':
        return t('nav.activity_logs', 'Log Aktivitas');
      case 'settings':
      case 'settings-google':
      case 'settings-ai':
      case 'settings-notifications':
      case 'settings-language':
      case 'settings-security':
        return t('nav.settings', 'Pengaturan Sistem');
      default:
        return t('nav.dashboard', 'Dashboard');
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const unreadCount = unreadNotifications.length;

  return (
    <header className="h-16 bg-[var(--sidebar)] border-b border-[var(--sidebar-border)] px-3 sm:px-6 md:px-8 flex items-center justify-between shrink-0 transition-colors z-20">
      {/* Left Section: Mobile Menu Trigger + Section Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Button with 44px touch target */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden min-w-[44px] min-h-[44px] rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:outline-none"
          title="Buka Navigasi"
          aria-label="Buka Menu Navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb & Current Context Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">
              {activeTenant?.brandName || activeTenant?.name || 'Locally inc.'}
            </span>
            <span className="text-slate-400 dark:text-slate-500 select-none font-medium">/</span>
          </div>
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">
            {getTabLabel(activeTab)}
          </h1>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Theme Toggle (Light / Dark) with 44px tap target */}
        <button
          type="button"
          onClick={toggleTheme}
          className="min-w-[44px] min-h-[44px] rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:outline-none"
          title={theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
          aria-label={theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          )}
        </button>

        {/* Language Switcher Pill with accessible tap targets */}
        <div
          role="group"
          aria-label="Pilih Bahasa"
          className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold min-h-[48px]"
        >
          <button
            type="button"
            onClick={() => setLanguage('ID')}
            className={`min-w-[44px] min-h-[44px] px-2.5 py-1.5 rounded-full transition-all cursor-pointer text-xs font-bold flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:outline-none ${
              language === 'ID'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
            title="Bahasa Indonesia"
            aria-pressed={language === 'ID'}
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => setLanguage('EN')}
            className={`min-w-[44px] min-h-[44px] px-2.5 py-1.5 rounded-full transition-all cursor-pointer text-xs font-bold flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:outline-none ${
              language === 'EN'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
            title="English"
            aria-pressed={language === 'EN'}
          >
            EN
          </button>
        </div>

        {/* Notifications Dropdown with 44px tap target */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifDropdown((prev) => !prev)}
            aria-expanded={showNotifDropdown}
            aria-haspopup="dialog"
            className="min-w-[44px] min-h-[44px] rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 relative transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:outline-none"
            title="Notifikasi"
            aria-label={`Notifikasi: ${unreadCount} belum dibaca`}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span
                className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900"
                aria-hidden="true"
              />
            )}
          </button>

          {showNotifDropdown && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[var(--primary)]" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                    {t('header.notice_notifications', 'Notifikasi')}
                  </span>
                </div>
                {unreadCount > 0 ? (
                  <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    {unreadCount} baru
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Semua sudah dibaca
                  </span>
                )}
              </div>

              {/* Notification Items List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <CheckCircle2 className="w-7 h-7 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t('header.no_notifications', 'Tidak ada notifikasi saat ini.')}
                    </p>
                  </div>
                ) : (
                  notifications.slice(0, 8).map((notif) => (
                    <button
                      key={notif.notif_id}
                      type="button"
                      onClick={() => {
                        setShowNotifDropdown(false);
                        onNavigateToTab('notifikasi');
                      }}
                      className="w-full p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left block focus-visible:outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/50">
                          {notif.jenis_notifikasi}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(notif.tanggal_terkirim).toLocaleDateString(
                            language === 'ID' ? 'id-ID' : 'en-US',
                            { day: 'numeric', month: 'short' }
                          )}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                        {notif.parent_nomor ? `${notif.parent_nomor} : ` : ''}{notif.parent_judul}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {notif.pesan}
                      </p>
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200/80 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifDropdown(false);
                    onNavigateToTab('notifikasi');
                  }}
                  className="w-full py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  {t('dashboard.view_all', 'Lihat Semua Notifikasi')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserDropdown((prev) => !prev)}
            aria-expanded={showUserDropdown}
            aria-haspopup="menu"
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800 focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:outline-none cursor-pointer transition-colors hover:bg-emerald-200/70 dark:hover:bg-emerald-900"
            title={user?.name || 'Profil Pengguna'}
            aria-label="Menu Pengguna"
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </button>

          {showUserDropdown && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl py-1.5 z-50 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                  {user?.name || 'Pengguna'}
                </div>
                <div className="text-[11px] truncate text-slate-500 dark:text-slate-400 mt-0.5">
                  {user?.email}
                </div>
                {isAdmin && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <Shield className="w-3 h-3" />
                    Administrator
                  </div>
                )}
              </div>

              <div className="p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserDropdown(false);
                    onNavigateToTab('settings');
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  {t('nav.settings', 'Pengaturan Profil & Sistem')}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Keluar (Sign Out)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
