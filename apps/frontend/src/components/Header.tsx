import { Dialog } from 'radix-ui';
import { notificationMessage } from '../lib/notificationText';
import React, { useState, useRef, useEffect } from 'react';
import { getActiveFormattingLocale } from '@legalio/shared/currencyUtils';
import { useAuth } from '../context/AuthContext';
import { AccountProfileDialog, PreferencesDialog } from './account/AccountDialogs';
import { SlidersHorizontal, UserRound } from 'lucide-react';
import { LANGUAGE_OPTIONS, useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '../context/NavigationContext';
import { useTenant } from '../context/TenantContext';
import { NotificationLog, GoogleSheetsConfig } from '@legalio/types';
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
  X,
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
  const { user, identity, logout, isPlatformAdmin } = useAuth();
  const [accountDialog, setAccountDialog] = useState<null | 'preferences' | 'security'>(null);
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { activeTab } = useNavigation();
  const { activeTenant, loading: tenantLoading } = useTenant();

  const [showLanguageModal, setShowLanguageModal] = useState(false);
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
        return t('nav.hierarchy', 'Struktur Dokumen');
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
        return t('nav.create_contract', 'Dokumen Saya');
      case 'ios':
        return t('nav.ios', 'Insertion Order (IO)');
      case 'notifikasi':
        return t('nav.notifications', 'Notifikasi & Log');
      case 'bulk-import':
        return t('nav.bulk_import', 'Import Data');
      case 'settings-organization':
      case 'settings-access':
      case 'settings-integrations':
        return t('nav.settings', 'Pengaturan Sistem');
      default:
        // Same labels as the sidebar entries that open these areas.
        if (tab.startsWith('admin-system-')) return t('nav.system_admin', 'System Admin');
        return t('nav.dashboard', 'Dashboard');
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const unreadCount = unreadNotifications.length;

  return (
    <header className="app-header sticky top-0 z-20 min-h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-6 md:px-8 flex items-center justify-between shrink-0 transition-colors">
      {/* Left Section: Mobile Menu Trigger + Section Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Button with 44px touch target */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="app-header-control md:hidden rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          title={t('header.buka_navigasi', 'Buka Navigasi')}
          aria-label={t('header.buka_menu_navigasi', 'Buka Menu Navigasi')}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb & Current Context Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="font-medium truncate max-w-30 sm:max-w-45">
              {activeTenant?.brandName || activeTenant?.name || (tenantLoading ? t('common.loading', 'Memuat Data...') : '')}
            </span>
            <span className="text-slate-400 dark:text-slate-500 select-none font-medium">/</span>
          </div>
          <h1 className="app-page-title text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight sm:truncate">
            {getTabLabel(activeTab)}
          </h1>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2.5">
        {/* Theme Toggle (Light / Dark) with 44px tap target */}
        <button
          type="button"
          onClick={toggleTheme}
          className="app-header-control rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          title={theme === 'dark' ? t('header.beralih_ke_mode_terang', 'Beralih ke Mode Terang') : t('header.beralih_ke_mode_gelap', 'Beralih ke Mode Gelap')}
          aria-label={theme === 'dark' ? t('header.beralih_ke_mode_terang', 'Beralih ke Mode Terang') : t('header.beralih_ke_mode_gelap', 'Beralih ke Mode Gelap')}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          )}
        </button>

        <Dialog.Root open={showLanguageModal} onOpenChange={setShowLanguageModal}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="app-header-control rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
              title={t('header.switch_language', 'Pilih bahasa')}
              aria-label={t('header.switch_language', 'Pilih bahasa')}
            >
              {language}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs" />
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('header.switch_language', 'Pilih bahasa')}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label={t('common.close', 'Tutup')}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="space-y-2">
                {LANGUAGE_OPTIONS.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    lang={option.htmlLang}
                    aria-pressed={language === option.code}
                    onClick={() => {
                      setLanguage(option.code);
                      setShowLanguageModal(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ${
                      language === option.code
                        ? 'border-accent/30 bg-accent/10 text-accent-strong dark:text-accent'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      language === option.code
                        ? 'bg-accent-strong text-white'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {option.label}
                    </span>
                    <span className="flex-1 text-sm font-medium">{option.nativeName}</span>
                    {language === option.code && <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Notifications Dropdown with 44px tap target */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifDropdown((prev) => !prev)}
            aria-expanded={showNotifDropdown}
            aria-haspopup="dialog"
            className="app-header-control rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 relative transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
            title={t('header.notifikasi', 'Notifikasi')}
            aria-label={t('header.notifikasi_belum_dibaca', 'Notifikasi: {unreadCount} belum dibaca', { unreadCount })}
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
            <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:top-auto sm:right-0 mt-2 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-accent-text" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                    {t('header.notice_notifications', 'Notifikasi')}
                  </span>
                </div>
                {unreadCount > 0 ? (
                  <span className="bg-accent-soft text-accent-text text-xs font-bold px-2 py-0.5 rounded-full border border-accent/30">
                    {t('header.baru', '{unreadCount} baru', { unreadCount })}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('header.semua_sudah_dibaca', 'Semua sudah dibaca')}
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
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/50">
                          {notif.jenis_notifikasi}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(notif.tanggal_terkirim).toLocaleDateString(
                            getActiveFormattingLocale(),
                            { day: 'numeric', month: 'short' }
                          )}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                        {notif.parent_nomor ? `${notif.parent_nomor} : ` : ''}{notif.parent_judul}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {notificationMessage(notif, t)}
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
                  className="w-full py-1.5 text-xs font-semibold text-accent-text hover:text-accent-text transition-colors cursor-pointer rounded-lg hover:bg-accent-soft"
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
            className="app-header-control relative flex items-center justify-center overflow-hidden rounded-full bg-accent-soft text-accent-text font-bold text-xs border border-accent/30 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none cursor-pointer transition-colors hover:bg-accent-soft"
            title={user?.name || t('header.profil_pengguna', 'Profil Pengguna')}
            aria-label={t('header.menu_pengguna', 'Menu Pengguna')}
          >
            {identity?.image ? <img src={identity.image} alt="" className="h-full w-full object-cover" /> : user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </button>

          {showUserDropdown && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl py-1.5 z-50 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                  {user?.name || t('admin.generic_user', 'Pengguna')}
                </div>
                <div className="text-xs truncate text-slate-500 dark:text-slate-400 mt-0.5">
                  {user?.email}
                </div>
                {isPlatformAdmin && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-accent-text bg-accent-soft px-2 py-0.5 rounded-full border border-accent/30">
                    <Shield className="w-3 h-3" />
                    {t('tb.platform_administrator', 'Platform administrator')}
                  </div>
                )}
              </div>

              <div className="p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserDropdown(false);
                    setAccountDialog('preferences');
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  {t('tb.preferences', 'Preferences')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserDropdown(false);
                    setAccountDialog('security');
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                >
                  <UserRound className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  {t('tb.account_profile', 'Account Profile')}
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
                  {t('header.keluar_sign_out', 'Keluar (Sign Out)')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {accountDialog === 'preferences' && <PreferencesDialog onClose={() => setAccountDialog(null)} />}
      {accountDialog === 'security' && <AccountProfileDialog onClose={() => setAccountDialog(null)} />}
    </header>
  );
};
