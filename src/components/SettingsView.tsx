import React, { useState, useEffect, useRef } from 'react';
import { GoogleSheetsConfig, Tenant } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTenant } from '../context/TenantContext';
import { getAuthHeaders } from '../App';
import { UITextManagerModal } from './UITextManagerModal';
import { SQLiteDatabaseCard } from './SQLiteDatabaseCard';
import {
  FileSpreadsheet,
  Folder,
  Save,
  RefreshCw,
  CheckCircle2,
  Database,
  Search,
  ExternalLink,
  LogOut,
  Sparkles,
  AlertCircle,
  Lock,
  Unlock,
  ShieldCheck,
  RotateCcw,
  Download,
  Upload,
  Languages,
  FileText,
  Mail,
  Bell,
  Bot,
  Cpu,
  Zap,
  ShieldAlert,
  Check,
  Copy,
  X,
  Key,
  Eye,
  EyeOff,
  Trash2,
  Building2,
  FolderPlus,
  FolderSync,
  Layers,
  HardDrive,
} from 'lucide-react';
import {
  signInWithGoogle,
  logoutGoogle,
  createNewSpreadsheet,
  createNewDriveFolder,
  fetchUserSpreadsheets,
  fetchUserFolders,
  getSavedGoogleUser,
  onGoogleAuthStateChange,
  isGoogleTokenValid,
  invalidateGoogleToken,
  silentRefreshGoogleToken,
  DriveFileItem,
  getCachedAccessToken,
} from '../lib/googleAuthService';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';

interface SettingsViewProps {
  config: GoogleSheetsConfig;
  onSaveConfig: (
    spreadsheetId: string,
    driveFolderId: string,
    autoSync: boolean,
    isLocked?: boolean,
    extraConfig?: Partial<GoogleSheetsConfig>
  ) => Promise<void>;
  onSyncNow: (mode?: 'fetch' | 'push') => Promise<void>;
  initialSection?: SettingsSection;
}

type SettingsSection = 'google' | 'ai' | 'notifications' | 'language' | 'security' | 'better_auth';

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  onSaveConfig,
  onSyncNow,
  initialSection,
}) => {
  const { user, isAdmin } = useAuth();
  const { language, t, exportToCSV, importFromCSV, resetCustomTranslations } = useLanguage();

  // Active Settings Section / Group Tab
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection || 'google');

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  // Form State
  const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId || '');
  const [masterSpreadsheetId, setMasterSpreadsheetId] = useState(config.masterSpreadsheetId || '');
  const [driveFolderId, setDriveFolderId] = useState(config.driveFolderId || '');
  const [autoSync, setAutoSync] = useState(config.autoSync ?? true);
  const [isLocked, setIsLocked] = useState<boolean>(config.isLocked ?? true);
  const [notificationEmails, setNotificationEmails] = useState(
    config.notificationEmails || 'legal.head@perusahaan.co.id, finance.team@perusahaan.co.id'
  );
  const [legalNotificationEmail, setLegalNotificationEmail] = useState(
    config.legalNotificationEmail || 'legal.head@perusahaan.co.id'
  );
  const [financeNotificationEmail, setFinanceNotificationEmail] = useState(
    config.financeNotificationEmail || 'finance.team@perusahaan.co.id'
  );
  const [aiModel, setAiModel] = useState<string>(config.aiModel || 'gemini-3.8-flash');
  const [savingAiModel, setSavingAiModel] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(config.geminiApiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // SMTP Relay State
  const [smtpEnabled, setSmtpEnabled] = useState<boolean>(config.smtpEnabled ?? false);
  const [smtpHost, setSmtpHost] = useState<string>(config.smtpHost || '');
  const [smtpPort, setSmtpPort] = useState<number>(config.smtpPort || 465);
  const [smtpSecure, setSmtpSecure] = useState<boolean>(config.smtpSecure ?? true);
  const [smtpUser, setSmtpUser] = useState<string>(config.smtpUser || '');
  const [smtpPassword, setSmtpPassword] = useState<string>(config.smtpPassword || '');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [smtpFromEmail, setSmtpFromEmail] = useState<string>(config.smtpFromEmail || '');
  const [smtpFromName, setSmtpFromName] = useState<string>(config.smtpFromName || 'Sistem Notifikasi Kontrak & IO');
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testSmtpRecipient, setTestSmtpRecipient] = useState<string>('');
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Google Option Mode State
  const [selectedOptionTab, setSelectedOptionTab] = useState<'auto' | 'picker' | 'manual'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('google_connection_mode');
      if (saved === 'auto' || saved === 'picker' || saved === 'manual') {
        return saved as 'auto' | 'picker' | 'manual';
      }
    }
    return 'manual';
  });

  const [saving, setSaving] = useState(false);
  const [savingNotifEmails, setSavingNotifEmails] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [resettingData, setResettingData] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [isEditUnlocked, setIsEditUnlocked] = useState(false);
  const [isOrgEditUnlocked, setIsOrgEditUnlocked] = useState(false);
  const [showUITextModal, setShowUITextModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyLink = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  // Multi-Tenant Drive & Sheet Management
  const { tenants, activeTenant, refreshTenants } = useTenant();
  const [syncingTenantId, setSyncingTenantId] = useState<string | null>(null);
  const [provisioningTenantId, setProvisioningTenantId] = useState<string | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantFolderInput, setTenantFolderInput] = useState<string>('');
  const [tenantSheetInput, setTenantSheetInput] = useState<string>('');
  const [savingTenantGoogle, setSavingTenantGoogle] = useState(false);
  const [isSyncingAllOrgs, setIsSyncingAllOrgs] = useState(false);

  const handleSyncTenantGoogle = async (tenant: Tenant) => {
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak memicu sinkronisasi Google Sheet.');
      return;
    }
    setSyncingTenantId(tenant.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) headers['x-google-access-token'] = accessToken;
      const res = await fetch(`/api/tenants/${tenant.id}/sync-google`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Gagal menyinkronkan data untuk ${tenant.name}`);
      }
      setSuccessMsg(`Sinkronisasi Google Sheet untuk ${tenant.name} berhasil diproses!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || `Gagal menyinkronkan ${tenant.name}`);
    } finally {
      setSyncingTenantId(null);
    }
  };

  const handleAutoProvisionTenantGoogle = async (tenant: Tenant) => {
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak membuat penyimpanan Google.');
      return;
    }
    if (!accessToken && !isGoogleTokenValid()) {
      setErrorMsg('Sesi Google belum aktif. Hubungkan akun Google terlebih dahulu.');
      return;
    }
    setProvisioningTenantId(tenant.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) headers['x-google-access-token'] = accessToken;
      const res = await fetch(`/api/tenants/${tenant.id}/setup-google`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          createNewFolder: true,
          createNewSheet: true,
          userEmail: user?.email,
          userName: user?.name,
          userRole: user?.role,
        }),
      });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Gagal membuat resource Google untuk ${tenant.name}`);
      }
      await refreshTenants();
      setSuccessMsg(`Folder Google Drive & Google Sheet untuk ${tenant.name} berhasil dibuat!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || `Gagal membuat resource Google untuk ${tenant.name}`);
    } finally {
      setProvisioningTenantId(null);
    }
  };

  const handleOpenEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setTenantFolderInput(tenant.driveFolderId || '');
    setTenantSheetInput(tenant.spreadsheetId || '');
  };

  const handleSaveTenantGoogleConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    setSavingTenantGoogle(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      };
      if (accessToken) headers['x-google-access-token'] = accessToken;
      const res = await fetch(`/api/tenants/${editingTenant.id}/setup-google`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          driveFolderId: tenantFolderInput.trim() || undefined,
          spreadsheetId: tenantSheetInput.trim() || undefined,
          userEmail: user?.email,
          userName: user?.name,
          userRole: user?.role,
        }),
      });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan konfigurasi Google organisasi.');
      }
      await refreshTenants();
      setSuccessMsg(`Konfigurasi Google untuk ${editingTenant.name} berhasil diperbarui!`);
      setEditingTenant(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan konfigurasi organisasi.');
    } finally {
      setSavingTenantGoogle(false);
    }
  };

  const handleComprehensiveSyncAll = async () => {
    setSyncing(true);
    setIsSyncingAllOrgs(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // 1. Pull / Sync Data Sheets
      await onSyncNow('fetch');

      // 2. Sync all organization folders and spreadsheets to Master Root
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['x-google-access-token'] = accessToken;
      
      await fetch('/api/tenants/auto-provision-folders', {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      // 3. Provision category subfolders for all partners
      const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('auth_session_token') : null;
      const provHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) provHeaders['x-google-access-token'] = accessToken;
      if (sessionToken) {
        provHeaders['Authorization'] = `Bearer ${sessionToken}`;
        provHeaders['x-session-token'] = sessionToken;
      }
      await fetch('/api/google-integration/provision-folders', {
        method: 'POST',
        headers: provHeaders,
      }).catch((e) => console.warn('Category provision warning:', e));

      await refreshTenants();
      setSuccessMsg('Berhasil menyinkronkan seluruh data sheet, folder organisasi, dan file ke Master Root!');
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyinkronkan data dan folder.');
    } finally {
      setSyncing(false);
      setIsSyncingAllOrgs(false);
    }
  };

  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Ensure non-admin users only access the Google & Database section
  useEffect(() => {
    if (!isAdmin && activeSection !== 'google') {
      setActiveSection('google');
    }
  }, [isAdmin, activeSection]);

  // Track previous config to prevent overwriting user input during polling
  const prevConfigRef = useRef(config);

  // Sync internal states when config updates from server
  useEffect(() => {
    const prev = prevConfigRef.current;
    if (config.spreadsheetId !== prev.spreadsheetId && config.spreadsheetId !== undefined) setSpreadsheetId(config.spreadsheetId);
    if (config.masterSpreadsheetId !== prev.masterSpreadsheetId && config.masterSpreadsheetId !== undefined) setMasterSpreadsheetId(config.masterSpreadsheetId);
    if (config.driveFolderId !== prev.driveFolderId && config.driveFolderId !== undefined) setDriveFolderId(config.driveFolderId);
    if (config.autoSync !== prev.autoSync && config.autoSync !== undefined) setAutoSync(config.autoSync);
    if (config.isLocked !== prev.isLocked && config.isLocked !== undefined) setIsLocked(config.isLocked);
    if (config.notificationEmails !== prev.notificationEmails && config.notificationEmails !== undefined) setNotificationEmails(config.notificationEmails);
    if (config.legalNotificationEmail !== prev.legalNotificationEmail && config.legalNotificationEmail !== undefined) setLegalNotificationEmail(config.legalNotificationEmail);
    if (config.financeNotificationEmail !== prev.financeNotificationEmail && config.financeNotificationEmail !== undefined) setFinanceNotificationEmail(config.financeNotificationEmail);
    if (config.aiModel !== prev.aiModel && config.aiModel !== undefined) setAiModel(config.aiModel);
    if (config.geminiApiKey !== prev.geminiApiKey && config.geminiApiKey !== undefined) setGeminiApiKey(config.geminiApiKey);
    if (config.smtpEnabled !== prev.smtpEnabled && config.smtpEnabled !== undefined) setSmtpEnabled(config.smtpEnabled);
    if (config.smtpHost !== prev.smtpHost && config.smtpHost !== undefined) setSmtpHost(config.smtpHost);
    if (config.smtpPort !== prev.smtpPort && config.smtpPort !== undefined) setSmtpPort(config.smtpPort);
    if (config.smtpSecure !== prev.smtpSecure && config.smtpSecure !== undefined) setSmtpSecure(config.smtpSecure);
    if (config.smtpUser !== prev.smtpUser && config.smtpUser !== undefined) setSmtpUser(config.smtpUser);
    if (config.smtpPassword !== prev.smtpPassword && config.smtpPassword !== undefined) setSmtpPassword(config.smtpPassword);
    if (config.smtpFromEmail !== prev.smtpFromEmail && config.smtpFromEmail !== undefined) setSmtpFromEmail(config.smtpFromEmail);
    if (config.smtpFromName !== prev.smtpFromName && config.smtpFromName !== undefined) setSmtpFromName(config.smtpFromName);
    
    prevConfigRef.current = config;
  }, [config]);

  // Google OAuth & Auto Connect State
  const [googleUser, setGoogleUser] = useState<{ email: string; name: string; photoURL?: string } | null>(
    getSavedGoogleUser()
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('google_access_token') : null
  );
  const [connectingAuth, setConnectingAuth] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);

  // Auto-restore Google Login Session
  useEffect(() => {
    const unsubscribe = onGoogleAuthStateChange((profile, token) => {
      if (profile) setGoogleUser(profile);
      if (token) setAccessToken(token);
    });
    return () => unsubscribe();
  }, []);

  // Drive Picker Modal State
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pickerType, setPickerType] = useState<'spreadsheet' | 'folder'>('spreadsheet');
  const [driveItems, setDriveItems] = useState<DriveFileItem[]>([]);
  const [loadingPickerItems, setLoadingPickerItems] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const isTokenActive =
    Boolean(googleUser) && Boolean(accessToken) && isGoogleTokenValid();

  const handleGoogleConnect = async () => {
    setConnectingAuth(true);
    setErrorMsg(null);
    try {
      const { profile, accessToken: token } = await signInWithGoogle();
      setGoogleUser(profile);
      setAccessToken(token);

      // Sinkronisasi otomatis status isConnected dan token ke konfigurasi server
      try {
        const headers = getAuthHeaders();
        if (token) headers['x-google-access-token'] = token;
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('google_refresh_token') : null;
        await fetch('/api/google-integration/connect', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            accessToken: token,
            refreshToken,
            googleUser: profile,
          }),
        });
      } catch (syncErr) {
        console.warn('[Google Connect] Gagal menyinkronkan token ke server:', syncErr);
      }

      setSuccessMsg(`Berhasil terhubung secara otomatis dengan akun Google: ${profile.email}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghubungkan akun Google.');
    } finally {
      setConnectingAuth(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      // Pemutusan akun yang bersih: update server database
      try {
        const headers = getAuthHeaders();
        await fetch('/api/google-integration/disconnect', {
          method: 'POST',
          headers,
          credentials: 'include',
        });
      } catch (discErr) {
        console.warn('[Google Disconnect] Gagal mengirim permintaan disconnect ke server:', discErr);
      }

      await logoutGoogle();
      invalidateGoogleToken();
      setGoogleUser(null);
      setAccessToken(null);
      setSuccessMsg('Akun Google berhasil diputuskan.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memutuskan akun Google.');
    }
  };

  const handleGoogleRefresh = async () => {
    setConnectingAuth(true);
    setErrorMsg(null);
    try {
      const { profile, accessToken: token } = await silentRefreshGoogleToken();
      setGoogleUser(profile);
      setAccessToken(token);

      // Sinkronisasi otomatis token hasil refresh ke server
      try {
        const headers = getAuthHeaders();
        if (token) headers['x-google-access-token'] = token;
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('google_refresh_token') : null;
        await fetch('/api/google-integration/connect', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            accessToken: token,
            refreshToken,
            googleUser: profile,
          }),
        });
      } catch (syncErr) {
        console.warn('[Google Refresh] Gagal menyinkronkan token ke server:', syncErr);
      }

      setSuccessMsg(`Sesi Google berhasil diperbarui untuk ${profile.email}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui sesi Google.');
    } finally {
      setConnectingAuth(false);
    }
  };

  const handleAutoProvisionMaster = async () => {
    if (!isAdmin) return;
    const token = getCachedAccessToken();
    if (!token && !isGoogleTokenValid()) {
      setErrorMsg('Sesi Google belum aktif. Hubungkan akun Google terlebih dahulu.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const headers = getAuthHeaders();
      if (token) headers['x-google-access-token'] = token;
      
      const res = await fetch('/api/google-integration/auto-provision-master', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ accessToken: token }),
      });
      
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? 'Akses ditolak: Hanya Admin/Superuser yang berhak membuat Master Root.'
              : `Gagal memproses permintaan (HTTP ${res.status}): ${text.slice(0, 150) || 'Server error'}`
          );
        }
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal membuat Master Root secara otomatis.');
      }
      
      setDriveFolderId(data.driveFolderId);
      setSpreadsheetId(data.spreadsheetId);
      if (data.masterSpreadsheetId) setMasterSpreadsheetId(data.masterSpreadsheetId);
      setIsEditUnlocked(false);
      setSuccessMsg(data.message || 'Master Root berhasil dibuat!');
      
      // Trigger parent update
      await onSaveConfig(data.spreadsheetId, data.driveFolderId, autoSync, isLocked, {});
      
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memproses pembuatan Master Root.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOption2Picker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Hanya pengguna dengan role Admin yang berhak menyimpan konfigurasi.');
      return;
    }
    const targetFolderId = driveFolderId || config.driveFolderId || '';
    const targetMasterSheetId = masterSpreadsheetId || config.masterSpreadsheetId || '';
    const targetSheetId = spreadsheetId || config.spreadsheetId || '';
    if (!targetFolderId) {
      setErrorMsg('Silakan pilih Folder Storage dari Google Drive terlebih dahulu.');
      return;
    }
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await onSaveConfig(targetSheetId, targetFolderId, autoSync, isLocked, {
        notificationEmails,
        legalNotificationEmail,
        financeNotificationEmail,
        aiModel,
        forceNewOrgResources: true,
        masterSpreadsheetId: targetMasterSheetId,
      } as any);
      setSelectedOptionTab('picker');
      if (typeof window !== 'undefined') {
        localStorage.setItem('google_connection_mode', 'picker');
      }
      setIsEditUnlocked(false);
      await refreshTenants();
      setSuccessMsg(t('settings.save_config_success_provisioned', 'Konfigurasi Master Root tersimpan, Folder Organisasi & Spreadsheet Database berhasil dibuat di Google Drive!'));
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan konfigurasi.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOption3Manual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Hanya pengguna dengan role Admin yang berhak menyimpan konfigurasi.');
      return;
    }
    const targetFolderId = driveFolderId || config.driveFolderId || '';
    const targetSheetId = spreadsheetId || config.spreadsheetId || '';
    if (!targetFolderId) {
      setErrorMsg('Silakan isi ID Folder Storage Google Drive.');
      return;
    }
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await onSaveConfig(targetSheetId, targetFolderId, autoSync, isLocked, {
        notificationEmails,
        legalNotificationEmail,
        financeNotificationEmail,
        aiModel,
        forceNewOrgResources: true,
      } as any);
      setSelectedOptionTab('manual');
      if (typeof window !== 'undefined') {
        localStorage.setItem('google_connection_mode', 'manual');
      }
      setIsEditUnlocked(false);
      await refreshTenants();
      setSuccessMsg(t('settings.save_config_success_provisioned', 'Konfigurasi Master Root tersimpan, Folder Organisasi & Spreadsheet Database berhasil dibuat di Google Drive!'));
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan konfigurasi.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDrivePicker = async (type: 'spreadsheet' | 'folder') => {
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak memilih file/folder dari Google Drive.');
      return;
    }
    if (!accessToken || !isGoogleTokenValid()) {
      setErrorMsg(
        'Sesi akun Google belum terhubung atau telah kadaluarsa. Silakan hubungkan akun Google terlebih dahulu.'
      );
      return;
    }

    setPickerType(type);
    setShowPickerModal(true);
    setLoadingPickerItems(true);
    setErrorMsg(null);

    try {
      if (type === 'spreadsheet') {
        const sheets = await fetchUserSpreadsheets(accessToken);
        setDriveItems(sheets);
      } else {
        const folders = await fetchUserFolders(accessToken);
        setDriveItems(folders);
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat item dari Google Drive.';
      setErrorMsg(msg);
      setShowPickerModal(false);
      if (msg.includes('kadaluarsa') || msg.includes('berakhir') || msg.includes('401')) {
        setAccessToken(null);
      }
    } finally {
      setLoadingPickerItems(false);
    }
  };

  const handleSelectItem = (item: DriveFileItem) => {
    if (pickerType === 'spreadsheet') {
      setMasterSpreadsheetId(item.id);
      setSuccessMsg(`Spreadsheet '${item.name}' dipilih.`);
    } else {
      setDriveFolderId(item.id);
      setSuccessMsg(`Folder '${item.name}' dipilih.`);
    }
    setShowPickerModal(false);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSaveNotificationEmails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Hanya pengguna dengan role Admin yang berhak mengubah email penerima notifikasi.');
      return;
    }
    setSavingNotifEmails(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await onSaveConfig(spreadsheetId, driveFolderId, autoSync, isLocked, {
        notificationEmails,
        legalNotificationEmail,
        financeNotificationEmail,
        aiModel,
      });
      setSuccessMsg('Email penerima alert notice period berhasil disimpan!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan email notifikasi.');
    } finally {
      setSavingNotifEmails(false);
    }
  };

  const handleSaveSmtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak mengubah konfigurasi SMTP Relay.');
      return;
    }
    setSavingSmtp(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await onSaveConfig(spreadsheetId, driveFolderId, autoSync, isLocked, {
        notificationEmails,
        legalNotificationEmail,
        financeNotificationEmail,
        aiModel,
        geminiApiKey,
        smtpEnabled,
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort) || (smtpSecure ? 465 : 587),
        smtpSecure,
        smtpUser: smtpUser.trim(),
        smtpPassword,
        smtpFromEmail: smtpFromEmail.trim(),
        smtpFromName: smtpFromName.trim(),
      });
      setSuccessMsg('Konfigurasi SMTP Relay berhasil disimpan!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan konfigurasi SMTP Relay.');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    const recipient = testSmtpRecipient.trim() || user?.email || '';
    if (!recipient) {
      setErrorMsg('Masukkan email penerima uji coba terlebih dahulu.');
      return;
    }
    if (!smtpHost.trim() || !smtpUser.trim()) {
      setErrorMsg('Harap isi SMTP Host dan Username sebelum melakukan pengujian.');
      return;
    }
    setTestingSmtp(true);
    setSmtpTestResult(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/smtp/test', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || (smtpSecure ? 465 : 587),
          smtpSecure,
          smtpUser: smtpUser.trim(),
          smtpPassword,
          smtpFromEmail: smtpFromEmail.trim(),
          smtpFromName: smtpFromName.trim(),
          testRecipient: recipient,
        }),
      });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok) {
        throw new Error(data.error || 'Gagal terhubung ke SMTP Relay.');
      }
      setSmtpTestResult({ success: true, message: data.message || 'Email uji coba berhasil dikirim!' });
    } catch (err: any) {
      setSmtpTestResult({ success: false, message: err.message || 'Gagal menguji koneksi SMTP Relay.' });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveAiModel = async (newModel: string) => {
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak mengubah model AI default.');
      return;
    }
    setSavingAiModel(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setAiModel(newModel);
      await onSaveConfig(spreadsheetId, driveFolderId, autoSync, isLocked, {
        notificationEmails,
        legalNotificationEmail,
        financeNotificationEmail,
        aiModel: newModel,
      });
      setSuccessMsg(`Model AI sistem berhasil diperbarui ke '${newModel}'!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan model AI.');
    } finally {
      setSavingAiModel(false);
    }
  };

  const handleSaveApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak mengubah Gemini API Key.');
      return;
    }
    const cleanKey = geminiApiKey.trim();
    setSavingApiKey(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setApiTestResult(null);
    try {
      await onSaveConfig(spreadsheetId, driveFolderId, autoSync, isLocked, {
        notificationEmails,
        legalNotificationEmail,
        financeNotificationEmail,
        aiModel,
        geminiApiKey: cleanKey,
      });
      setSuccessMsg('Google Gemini API Key berhasil disimpan dan diaktifkan!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan Gemini API Key.');
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleTestApiKey = async () => {
    const keyToTest = geminiApiKey.trim();
    if (!keyToTest) {
      setErrorMsg('Masukkan Google Gemini API Key terlebih dahulu untuk melakukan pengujian koneksi.');
      return;
    }
    setTestingApiKey(true);
    setApiTestResult(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: keyToTest, model: aiModel || 'gemini-3.6-flash' }),
      });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok) {
        throw new Error(data.error || 'Gagal terhubung ke Google Gemini API.');
      }
      setApiTestResult({ success: true, message: data.message || 'Koneksi ke Google Gemini API berhasil!' });
    } catch (err: any) {
      setApiTestResult({ success: false, message: err.message || 'Gagal terhubung ke Google Gemini API.' });
    } finally {
      setTestingApiKey(false);
    }
  };

  const handleProvisionFolders = async () => {
    if (!isAdmin) {
      setErrorMsg('Hanya Admin yang berhak menjalankan sinkronisasi folder kategori.');
      return;
    }
    setProvisioning(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = getCachedAccessToken();
      const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('auth_session_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-google-access-token'] = token;
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
        headers['x-session-token'] = sessionToken;
      }

      const res = await fetch('/api/google-integration/provision-folders', {
        method: 'POST',
        headers,
      });
      let data: any = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) throw new Error(data.error || `Gagal sinkronisasi folder (Status ${res.status})`);

      setSuccessMsg(
        `4 Subfolder Kategori (Contract, Invoice/Billing, IO, DD) berhasil dibuat/diperbarui untuk seluruh Partner!`
      );
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat folder kategori.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleSync = async (mode: 'fetch' | 'push' = 'fetch') => {
    setSyncing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await onSyncNow(mode);
      setSuccessMsg(
        mode === 'push'
          ? t('settings.sync_push_success', 'Berhasil menyimpan data ke Google Sheet!')
          : t('settings.sync_fetch_success', 'Berhasil menarik data dari Google Sheet!')
      );
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal sinkronisasi dengan Google Sheet.');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenResetModal = () => {
    if (!isAdmin) {
      setErrorMsg(t('settings.reset_admin_only', 'Hanya Admin yang berhak mereset data aplikasi.'));
      return;
    }
    setResetConfirmationText('');
    setShowResetModal(true);
  };

  const handleExecuteReset = async () => {
    if (!isAdmin) {
      setErrorMsg(t('settings.reset_admin_only', 'Hanya Admin yang berhak mereset data aplikasi.'));
      return;
    }
    if (resetConfirmationText.trim() !== 'RESET NOW') {
      setErrorMsg('Harap ketik "RESET NOW" untuk mengonfirmasi reset database.');
      return;
    }

    setResettingData(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = getCachedAccessToken();
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };

      const res = await fetch('/api/admin/reset-database', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          userEmail: user?.email,
          userName: user?.name,
          userRole: user?.role,
          accessToken: token,
          confirmKeyword: resetConfirmationText.trim(),
        }),
      });
      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }
      if (res.ok) {
        setShowResetModal(false);
        setResetConfirmationText('');
        setSpreadsheetId('');
        setDriveFolderId('');
        setMasterSpreadsheetId('');
        try {
          localStorage.removeItem('silegal_custom_translations');
          localStorage.removeItem('silegal_active_org_id');
        } catch (e) {}
        setSuccessMsg(data.message || t('settings.reset_success', 'Seluruh pengaturan sistem, organisasi, departemen, dan data transaksi berhasil direset ke kondisi awal bawaan.'));
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setErrorMsg(data.error || 'Gagal mereset database.');
      }
    } catch (err: any) {
      setErrorMsg('Gagal mereset database: ' + (err.message || String(err)));
    } finally {
      setResettingData(false);
    }
  };

  const handleQuickImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = importFromCSV(content);
        if (result.success) {
          setSuccessMsg(`Berhasil mengimpor & memperbarui ${result.updatedCount} teks UI dari file CSV!`);
          setTimeout(() => setSuccessMsg(null), 5000);
        } else {
          setErrorMsg(result.error || 'Gagal mengimpor file CSV.');
        }
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const filteredDriveItems = driveItems.filter((i) =>
    i.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  // Settings navigation groups
  const navigationItems: { id: SettingsSection; label: string; icon: React.ElementType; desc: string; adminOnly?: boolean }[] = [
    {
      id: 'google',
      label: t('settings.nav_google', 'Google Drive & SQLite'),
      icon: Database,
      desc: t('settings.nav_google_desc', 'Folder Drive untuk upload lampiran, Database SQLite'),
    },
    {
      id: 'ai',
      label: t('settings.nav_ai', 'Model AI & Parser'),
      icon: Bot,
      desc: t('settings.nav_ai_desc', 'Konfigurasi Google Gemini Extractor'),
      adminOnly: true,
    },
    {
      id: 'notifications',
      label: t('settings.nav_notifications', 'Penerima Notifikasi'),
      icon: Bell,
      desc: t('settings.nav_notifications_desc', 'Email alert legal & finance H-90, H-60, H-30'),
      adminOnly: true,
    },
    {
      id: 'language',
      label: t('settings.nav_language', 'Teks UI & Lokalisasi'),
      icon: Languages,
      desc: t('settings.nav_language_desc', 'Kustomisasi label dan kamus antarmuka'),
      adminOnly: true,
    },
    {
      id: 'security',
      label: t('settings.nav_security', 'Keamanan & Maintenance'),
      icon: ShieldAlert,
      desc: t('settings.nav_security_desc', 'Kunci konfigurasi dan reset data transaksi'),
      adminOnly: true,
    },
  ];

  const visibleNavigationItems = navigationItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <span>{t('nav.settings', 'Pengaturan Sistem')}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            {activeSection === 'google' && t('settings.nav_google', 'Google Drive & SQLite Engine')}
            {activeSection === 'ai' && t('settings.nav_ai', 'Model AI & Parser')}
            {activeSection === 'notifications' && t('settings.nav_notifications', 'Penerima Notifikasi')}
            {activeSection === 'language' && t('settings.nav_language', 'Teks UI & Lokalisasi')}
            {activeSection === 'security' && t('settings.nav_security', 'Keamanan & Maintenance')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold py-1.5 px-3 flex items-center gap-2 shadow-2xs">
            <span className="size-2 rounded-full bg-[#06C755] animate-pulse" />
            <span>SQLite Engine Active</span>
          </Badge>
        </div>
      </div>

      {/* Global Alerts for Settings */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl text-xs font-medium flex items-center justify-between animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs font-medium flex items-center justify-between animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Full-width Content Layout */}
      <div className="w-full space-y-6">
        {/* GROUP 1: GOOGLE INTEGRATION & DATABASE */}
          {activeSection === 'google' && (
            <div className="space-y-6">
              {/* Google OAuth Account Card */}
              <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold flex items-center justify-between">
                    <span>{t('settings.google_auth_title', 'Autentikasi Akun Google Workspace')}</span>
                    {isTokenActive ? (
                      <Badge className="text-[10px] bg-[#EBFBF0] dark:bg-emerald-950/60 text-[#048C3B] dark:text-emerald-300 border-transparent hover:bg-[#EBFBF0]">
                        {t('settings.oauth_active', 'OAuth Aktif')}
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 hover:bg-slate-200">
                        {t('settings.oauth_inactive', 'Belum Terhubung')}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.google_auth_desc', 'Koneksi OAuth 2.0 resmi untuk membaca & menulis Google Spreadsheet serta mengunggah berkas ke Google Drive.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#F5F6F6] dark:bg-slate-800/50 rounded-2xl border border-[#EBEBEB] dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#06C755]/10 text-[#06C755] flex items-center justify-center font-bold text-sm shrink-0">
                        {googleUser?.name?.charAt(0) || 'G'}
                      </div>
                      <div>
                        <p className="font-semibold text-[#111111] dark:text-slate-100">
                          {googleUser ? googleUser.name : t('settings.no_google_connected', 'Belum Ada Akun Google Terhubung')}
                        </p>
                        {googleUser?.email && (
                          <p className="text-[#777777] dark:text-slate-400 font-mono text-[11px]">
                            {googleUser.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isTokenActive ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGoogleRefresh}
                            disabled={connectingAuth}
                            className="h-9 px-4 rounded-full text-xs font-bold bg-white dark:bg-slate-800 border border-[#EBEBEB] dark:border-slate-700 text-[#111111] dark:text-slate-100 hover:bg-[#F5F6F6] dark:hover:bg-slate-700 cursor-pointer gap-1.5"
                          >
                            <RefreshCw className={cn('w-3.5 h-3.5', connectingAuth && 'animate-spin')} />
                            <span>{t('settings.refresh_session', 'Refresh Sesi')}</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGoogleDisconnect}
                            className="h-9 px-4 rounded-full text-xs font-bold bg-white dark:bg-slate-800 border border-red-200 dark:border-rose-800 text-red-500 hover:bg-red-50 dark:hover:bg-rose-950/40 cursor-pointer gap-1.5"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{t('settings.disconnect', 'Putuskan')}</span>
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleGoogleConnect}
                          disabled={connectingAuth}
                          className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{t('settings.connect_google_btn', 'Hubungkan Akun Google')}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>



              {/* Master Google Drive Storage Card (File Attachment Storage) */}
              {isAdmin && (
                <Card id="card-master-drive-org-database" className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                  <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Folder className="w-5 h-5 text-[#06C755]" />
                        <span>Penyimpanan File Dokumen (Google Drive)</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Folder induk Google Drive untuk menampung lampiran PDF, file dokumen, dan bukti pengeluaran.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {driveFolderId ? (
                        <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold py-1 px-2.5 flex items-center gap-1.5 shadow-2xs">
                          <span className="size-2 rounded-full bg-[#06C755] animate-pulse" />
                          <span>Folder Drive Terhubung</span>
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold py-1 px-2.5 flex items-center gap-1.5 shadow-2xs">
                          <AlertCircle className="size-3 text-amber-500" />
                          <span>{t('settings.not_configured', 'Belum Dikonfigurasi')}</span>
                        </Badge>
                      )}
                      {isAdmin && !isEditUnlocked && (
                        <Button
                          id="btn-edit-master-root"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEditConfirmModal(true)}
                          className="h-7 px-3 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer gap-1.5 shrink-0 shadow-2xs"
                        >
                          <Lock className="w-3 h-3 text-[#06C755]" />
                          <span>{t('settings.edit_config_btn', 'Ubah Konfigurasi')}</span>
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 text-xs">
                    <div className="space-y-3">
                      <div
                        id="master-storage-root-card"
                        className="p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 shadow-2xs hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all space-y-3"
                      >
                        {/* Master Storage Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs bg-[#06C755]">
                              <Folder className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                                  {t('settings.root_folder_title', 'Root Folder')}
                                </h4>
                                <Badge className="text-[10px] font-semibold py-0.5 px-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                  Root Drive
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                ID: <code className="font-mono text-[10px] text-slate-600 dark:text-slate-300">{driveFolderId || '-'}</code>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Read-Only or Edit Mode */}
                        {!isEditUnlocked ? (
                          <div className="p-3 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2.5">
                            <div className="min-w-0 flex-1 space-y-1">
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Folder className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                                <span className="truncate">{t('settings.master_root_id_label', 'Master Google Drive Storage Root Folder ID')}</span>
                              </span>
                              <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
                                {driveFolderId || '-'}
                              </p>
                            </div>
                            {driveFolderId && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(`https://drive.google.com/drive/folders/${driveFolderId}`, 'master-root')}
                                  title={t('common.copy_link', 'Salin Link')}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  {copiedKey === 'master-root' ? <Check className="w-3.5 h-3.5 text-[#06C755]" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors inline-flex items-center">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Edit Mode View */
                          <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium">
                              <button
                                type="button"
                                onClick={() => setSelectedOptionTab('picker')}
                                className={cn(
                                  'px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-medium text-xs flex items-center gap-2',
                                  selectedOptionTab === 'picker'
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                )}
                              >
                                <Folder className="w-3.5 h-3.5 text-[#06C755]" />
                                <span>{t('settings.picker_tab', 'Pilih dari Google Drive')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedOptionTab('manual')}
                                className={cn(
                                  'px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-medium text-xs flex items-center gap-2',
                                  selectedOptionTab === 'manual'
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                )}
                              >
                                <Folder className="w-3.5 h-3.5 text-[#06C755]" />
                                <span>{t('settings.manual_tab', 'Input Manual ID')}</span>
                              </button>
                            </div>

                            {selectedOptionTab === 'picker' && (
                              <form onSubmit={handleSaveOption2Picker} className="space-y-4">
                                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                                  <label className="block font-semibold text-slate-800 dark:text-slate-100">
                                    Folder Google Drive ID
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={driveFolderId || t('settings.no_folder_selected', 'Belum dipilih')}
                                      placeholder="ID Folder Drive..."
                                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none font-mono"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenDrivePicker('folder')}
                                      disabled={!isTokenActive}
                                      className="h-8 px-3.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer shrink-0 shadow-2xs"
                                    >
                                      {t('settings.pick_folder_btn', 'Pilih Folder')}
                                    </Button>
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setDriveFolderId(config.driveFolderId || '');
                                      setIsEditUnlocked(false);
                                    }}
                                    className="h-9 px-4 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 cursor-pointer"
                                  >
                                    {t('settings.cancel_edit_btn', 'Batal')}
                                  </Button>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    disabled={saving || !driveFolderId}
                                    className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5 shadow-2xs"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>{saving ? t('settings.saving_and_provisioning', 'Menyimpan...') : t('settings.save_config_btn', 'Simpan Konfigurasi')}</span>
                                  </Button>
                                </div>
                              </form>
                            )}

                            {selectedOptionTab === 'manual' && (
                              <form onSubmit={handleSaveOption3Manual} className="space-y-4">
                                <div>
                                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                                    {t('settings.master_root_id_label', 'Folder ID Google Drive')}
                                  </label>
                                  <input
                                    type="text"
                                    value={driveFolderId}
                                    onChange={(e) => setDriveFolderId(e.target.value)}
                                    placeholder="Contoh: 1xiFIvgWdDtYEzL7IoqVD9d-NaS7XcfYp"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#06C755]/20 transition-all font-mono"
                                    required
                                  />
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setDriveFolderId(config.driveFolderId || '');
                                      setIsEditUnlocked(false);
                                    }}
                                    className="h-9 px-4 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 cursor-pointer"
                                  >
                                    {t('settings.cancel_edit_btn', 'Batal')}
                                  </Button>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    disabled={saving}
                                    className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5 shadow-2xs"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>{saving ? t('settings.saving_and_provisioning', 'Menyimpan...') : t('settings.save_config_btn', 'Simpan Konfigurasi')}</span>
                                  </Button>
                                </div>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Part B: Folder Google Drive per Organisasi */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          Folder Storage Google Drive Per Organisasi ({(tenants || []).length})
                        </span>
                      </div>

                      {(tenants || []).map((tenant) => {
                        const isProvisioning = provisioningTenantId === tenant.id;
                        const hasFolder = Boolean(tenant.driveFolderId && tenant.driveFolderId !== '-' && !tenant.driveFolderId.startsWith('Folder_'));
                        const tenantDisplayName = tenant.name || tenant.brandName || 'Organisasi';

                        return (
                          <div
                            key={tenant.id}
                            id={`tenant-storage-card-${tenant.id}`}
                            className="p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 shadow-2xs hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all space-y-3"
                          >
                            {/* Organization Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                                  style={{ backgroundColor: tenant.primaryColor || '#06C755' }}
                                >
                                  {tenantDisplayName.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                                      {tenantDisplayName}
                                    </h4>
                                    <Badge className="text-[10px] font-semibold py-0.5 px-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                      {tenant.legalEntity || 'PT'}
                                    </Badge>
                                    {tenant.isDefault && (
                                      <Badge className="text-[10px] font-semibold py-0.5 px-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                        {t('settings.org_default_entity', 'Default Entity')}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    ID: <code className="font-mono text-[10px] text-slate-600 dark:text-slate-300">{tenant.id}</code>
                                  </p>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              {isAdmin && !hasFolder && (
                                <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                                  <Button
                                    id={`btn-provision-tenant-${tenant.id}`}
                                    type="button"
                                    size="sm"
                                    disabled={isProvisioning || !isTokenActive}
                                    onClick={() => handleAutoProvisionTenantGoogle(tenant)}
                                    className="h-7 px-3 rounded-full text-[11px] font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5 shadow-2xs"
                                    title={!isTokenActive ? t('settings.org_connect_google_first', 'Hubungkan akun Google terlebih dahulu') : t('settings.org_auto_provision_tooltip', 'Buat Folder otomatis di Google Drive')}
                                  >
                                    <Sparkles className={cn('w-3 h-3', isProvisioning && 'animate-spin')} />
                                    <span>{isProvisioning ? t('settings.org_creating', 'Membuat...') : t('settings.org_auto_provision_btn', 'Buat Folder di Drive')}</span>
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Folder Info */}
                            <div className="p-3 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2.5">
                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <Folder className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                                  <span className="truncate">{t('settings.org_folder_label', 'Folder Organisasi')}</span>
                                </span>
                                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
                                  {tenant.driveFolderId || '-'}
                                </p>
                              </div>
                              {tenant.driveFolderId && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyLink(
                                        `https://drive.google.com/drive/folders/${tenant.driveFolderId}`,
                                        `folder-${tenant.id}`
                                      )
                                    }
                                    title={t('common.copy_link', 'Salin Link')}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    {copiedKey === `folder-${tenant.id}` ? (
                                      <Check className="w-3.5 h-3.5 text-[#06C755]" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <a
                                    href={`https://drive.google.com/drive/folders/${tenant.driveFolderId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t('common.open_link', 'Buka Link')}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors inline-flex items-center"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SQLite Database Status & Browser Card */}
              {isAdmin && <SQLiteDatabaseCard />}
            </div>
          )}

          {/* GROUP 2: AI & SMART AUTOMATION */}
          {activeSection === 'ai' && (
            <div className="space-y-6">
              {/* CARD 1: GOOGLE GEMINI API KEY */}
              <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Key className="w-5 h-5 text-[#06C755]" />
                      <span>{t('settings.gemini_api_key_title', 'Google Gemini API Key')}</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      {t('settings.gemini_api_key_desc', 'API Key yang digunakan untuk auto-fill data dari dokumen PDF kontrak dan invoice melalui Google Gemini.')}
                    </CardDescription>
                  </div>
                  <div>
                    {geminiApiKey ? (
                      <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold py-1 px-2.5 flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{t('settings.api_key_active', 'API Key Aktif')}</span>
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold py-1 px-2.5 flex items-center gap-1.5">
                        <AlertCircle className="size-3 text-amber-500" />
                        <span>{t('settings.api_key_empty', 'Belum Diatur')}</span>
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <form onSubmit={handleSaveApiKey} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span>{t('settings.gemini_api_key_label', 'Gemini API Key (AI Studio)')}</span>
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#06C755] hover:underline flex items-center gap-1 font-normal"
                        >
                          <span>{t('settings.get_api_key_link', 'Dapatkan API Key di Google AI Studio')}</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder={t('settings.gemini_api_key_ph', 'Masukkan Google Gemini API Key (misal: AIzaSy...)')}
                          className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-xs text-[#111111] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#06C755] transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          title={showApiKey ? 'Sembunyikan' : 'Tampilkan'}
                        >
                          {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Test Result Alert Box */}
                    {apiTestResult && (
                      <div
                        className={cn(
                          'p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in',
                          apiTestResult.success
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                        )}
                      >
                        {apiTestResult.success ? (
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="size-4 text-rose-600 shrink-0" />
                        )}
                        <span>{apiTestResult.message}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <Button
                        type="submit"
                        disabled={savingApiKey || !isAdmin}
                        className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingApiKey ? 'Menyimpan...' : t('settings.save_api_key_btn', 'Simpan API Key')}</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestApiKey}
                        disabled={testingApiKey || !geminiApiKey.trim()}
                        className="h-9 px-4 rounded-full text-xs font-bold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer gap-1.5"
                      >
                        <Sparkles className={cn('w-3.5 h-3.5 text-amber-500', testingApiKey && 'animate-spin')} />
                        <span>{testingApiKey ? 'Menguji Koneksi...' : t('settings.test_api_key_btn', 'Uji Koneksi API')}</span>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* CARD 2: MODEL AI SELECTION */}
              <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Bot className="w-5 h-5 text-[#06C755]" />
                    <span>{t('settings.ai_config_title', 'Pilihan Model Google Gemini')}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.ai_config_desc', 'Model AI multimodal yang digunakan untuk mengekstrak data dari berkas PDF kontrak dan invoice secara otomatis.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="space-y-3">
                    {[
                      {
                        id: 'gemini-3.8-flash',
                        title: 'Gemini 3.8 Flash (Default Rekomendasi)',
                        desc: 'Ekstraksi dokumen berkecepatan tinggi, akurasi tinggi untuk tabel dan klausul legal.',
                        badge: 'Tercepat & Paling Akurat',
                      },
                      {
                        id: 'gemini-3.7-flash',
                        title: 'Gemini 3.7 Flash',
                        desc: 'Generasi terbaru multimodal untuk analisis klausul legal berlembar-lembar.',
                        badge: 'Generasi Terbaru',
                      },
                      {
                        id: 'gemini-3.6-flash',
                        title: 'Gemini 3.6 Flash',
                        desc: 'Performa ekstraksi stabil dan seimbang untuk parsing kontrak standar.',
                        badge: 'Stabil & Efisien',
                      },
                      {
                        id: 'gemini-3.5-flash',
                        title: 'Gemini 3.5 Flash',
                        desc: 'Model cepat dan hemat token untuk pemrosesan volume dokumen tinggi.',
                        badge: 'Cepat & Hemat Kuota',
                      },
                      {
                        id: 'gemini-3.1-flash-lite',
                        title: 'Gemini 3.1 Flash Lite',
                        desc: 'Model ultra-ringan dengan latensi pemrosesan instan dan hemat kuota.',
                        badge: 'Ringan & Instan',
                      },
                    ].map((model) => (
                      <div
                        key={model.id}
                        onClick={() => handleSaveAiModel(model.id)}
                        className={cn(
                          'p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3',
                          aiModel === model.id
                            ? 'border-[#06C755] bg-[#06C755]/5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border-none'
                            : 'border-[#EBEBEB] dark:border-slate-700 bg-card hover:bg-[#F5F6F6] dark:bg-slate-800/50'
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#111111] dark:text-slate-100 text-xs">{model.title}</span>
                            <Badge className="text-[10px] border border-[#EBEBEB] dark:border-slate-700 text-[#777777] dark:text-slate-400 bg-transparent hover:bg-[#F5F6F6] dark:bg-slate-800/50">
                              {model.badge}
                            </Badge>
                          </div>
                          <p className="text-[#777777] dark:text-slate-400 text-[11px] leading-relaxed">
                            {model.desc}
                          </p>
                        </div>

                        <div className="pt-0.5">
                          <div
                            className={cn(
                              'size-4 rounded-full border flex items-center justify-center transition-all',
                              aiModel === model.id
                                ? 'border-[#06C755] bg-[#06C755] text-[#06C755]-foreground'
                                : 'border-muted-foreground/40'
                            )}
                          >
                            {aiModel === model.id && <Check className="size-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* GROUP 3: NOTIFICATIONS & NOTICE PERIOD ALERTS */}
          {activeSection === 'notifications' && (
            <div className="space-y-6">
              {/* CARD 1: SMTP RELAY CONFIGURATION */}
              <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Mail className="w-5 h-5 text-[#06C755]" />
                      <span>{t('settings.smtp_card_title', 'Konfigurasi SMTP Relay Server (Email Nyata)')}</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      {t('settings.smtp_card_desc', 'Kirim email notifikasi dan alert notice period secara nyata ke kotak masuk (inbox) Google Workspace, Gmail, atau Outlook.')}
                    </CardDescription>
                  </div>
                  <div>
                    {smtpEnabled ? (
                      <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold py-1 px-2.5 flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>SMTP Aktif</span>
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold py-1 px-2.5">
                        <span>Nonaktif</span>
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <form onSubmit={handleSaveSmtp} className="space-y-4">
                    {/* Toggle Enable SMTP */}
                    <div className="p-3.5 bg-[#F5F6F6] dark:bg-slate-800/50 rounded-2xl border border-[#EBEBEB] dark:border-slate-700 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                          {t('settings.smtp_enable_label', 'Aktifkan Pengiriman Email via SMTP Relay')}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Jika aktif, reminder H-90, H-60, H-30, dan H-14 akan dikirimkan otomatis ke email nyata.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpEnabled}
                          onChange={(e) => setSmtpEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-[#06C755]"></div>
                      </label>
                    </div>

                    {/* SMTP Credentials Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          {t('settings.smtp_host_label', 'SMTP Host / Server')}
                        </label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="misal: smtp.gmail.com / smtp.office365.com"
                          className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                            {t('settings.smtp_port_label', 'SMTP Port')}
                          </label>
                          <input
                            type="number"
                            value={smtpPort}
                            onChange={(e) => setSmtpPort(Number(e.target.value))}
                            placeholder="465 / 587"
                            className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="flex items-center gap-2 p-2.5 bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                            <input
                              type="checkbox"
                              checked={smtpSecure}
                              onChange={(e) => setSmtpSecure(e.target.checked)}
                              className="rounded text-[#06C755] focus:ring-[#06C755]"
                            />
                            <span className="text-[11px] truncate">SSL/TLS</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          {t('settings.smtp_user_label', 'SMTP Username / Akun Email')}
                        </label>
                        <input
                          type="text"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          placeholder="misal: notif@perusahaan.com"
                          className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          {t('settings.smtp_password_label', 'SMTP Password / Google App Password')}
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type={showSmtpPassword ? 'text' : 'password'}
                            value={smtpPassword}
                            onChange={(e) => setSmtpPassword(e.target.value)}
                            placeholder="Password atau 16-digit App Password"
                            className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                            className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {showSmtpPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          {t('settings.smtp_from_email_label', 'Alamat Email Pengirim (From Email)')}
                        </label>
                        <input
                          type="email"
                          value={smtpFromEmail}
                          onChange={(e) => setSmtpFromEmail(e.target.value)}
                          placeholder="misal: noreply@perusahaan.com (opsional)"
                          className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          {t('settings.smtp_from_name_label', 'Nama Pengirim (From Name)')}
                        </label>
                        <input
                          type="text"
                          value={smtpFromName}
                          onChange={(e) => setSmtpFromName(e.target.value)}
                          placeholder="misal: Sistem Notifikasi Kontrak & IO"
                          className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                        />
                      </div>
                    </div>

                    {/* Test SMTP Connection Box */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span>{t('settings.smtp_test_title', 'Uji Koneksi & Kirim Email Percobaan')}</span>
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="email"
                          value={testSmtpRecipient}
                          onChange={(e) => setTestSmtpRecipient(e.target.value)}
                          placeholder={user?.email || t('settings.smtp_test_recipient_ph', 'Masukkan email tujuan uji coba...')}
                          className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTestSmtp}
                          disabled={testingSmtp || !smtpHost || !smtpUser}
                          className="h-9 px-4 rounded-xl text-xs font-bold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer gap-1.5 shrink-0"
                        >
                          <Sparkles className={cn('w-3.5 h-3.5 text-amber-500', testingSmtp && 'animate-spin')} />
                          <span>{testingSmtp ? t('settings.smtp_testing_btn', 'Mengirim Email Uji Coba...') : t('settings.smtp_test_btn', 'Uji Koneksi SMTP')}</span>
                        </Button>
                      </div>

                      {smtpTestResult && (
                        <div
                          className={cn(
                            'p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in',
                            smtpTestResult.success
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                          )}
                        >
                          {smtpTestResult.success ? (
                            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="size-4 text-rose-600 shrink-0" />
                          )}
                          <span>{smtpTestResult.message}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="submit"
                        disabled={savingSmtp || !isAdmin}
                        className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingSmtp ? t('settings.smtp_saving_btn', 'Menyimpan...') : t('settings.smtp_save_btn', 'Simpan Konfigurasi SMTP')}</span>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* CARD 2: DEFAULT NOTIFICATION RECIPIENTS */}
              <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Bell className="w-5 h-5 text-[#06C755]" />
                    <span>{t('settings.notif_recipients_title', 'Daftar Email Penerima Alert Notice Period')}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.notif_recipients_desc', 'Email yang akan menerima notifikasi otomatis sebelum kontrak berakhir (H-90, H-60, H-30, H-14).')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs">
                  <form onSubmit={handleSaveNotificationEmails} className="space-y-4">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        {t('settings.legal_email_label', 'Email Tim Legal (Master Notice Period Alert)')}
                      </label>
                      <input
                        type="text"
                        value={legalNotificationEmail}
                        onChange={(e) => setLegalNotificationEmail(e.target.value)}
                        placeholder="legal.lead@company.com, legal.officer@company.com"
                        className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                        required
                      />
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {t('settings.legal_email_hint', 'Gunakan tanda koma (,) untuk memisahkan beberapa alamat email.')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        {t('settings.finance_email_label', 'Email Tim Finance (Commercial & Spending Alert)')}
                      </label>
                      <input
                        type="text"
                        value={financeNotificationEmail}
                        onChange={(e) => setFinanceNotificationEmail(e.target.value)}
                        placeholder="finance.lead@company.com"
                        className="w-full bg-[#F5F6F6] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#06C755] transition-colors"
                        required
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingNotifEmails || !isAdmin}
                        className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingNotifEmails ? 'Menyimpan...' : t('settings.save_notif_emails_btn', 'Simpan Email Notifikasi')}</span>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* GROUP 4: LANGUAGE & UI TEXT LOCALIZATION */}
          {activeSection === 'language' && (
            <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Languages className="w-5 h-5 text-[#06C755]" />
                  <span>{t('settings.ui_customization_title', 'Kustomisasi Teks UI & Kamus Antarmuka')}</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings.ui_customization_desc', 'Ubah kata, label tombol, atau istilah pada aplikasi sesuai dengan standar legal perusahaan Anda.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="p-4 bg-[#F5F6F6] dark:bg-slate-800/50 rounded-2xl border border-[#EBEBEB] dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#111111] dark:text-slate-100">{t('settings.ui_editor_card_title', 'Editor Teks Antarmuka Lengkap')}</p>
                    <p className="text-[#777777] dark:text-slate-400 text-[11px] mt-0.5">
                      {t('settings.ui_editor_card_desc', 'Buka jendela dialog untuk mengubah setiap teks tombol, menu, tabel, atau pesan error.')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowUITextModal(true)}
                    className="h-9 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer shrink-0"
                  >
                    {t('settings.open_ui_editor_btn', 'Buka Editor Teks UI')}
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToCSV}
                    className="h-9 px-4 rounded-full text-xs font-bold bg-white dark:bg-slate-800 border border-[#EBEBEB] dark:border-slate-700 text-[#111111] dark:text-slate-100 hover:bg-[#F5F6F6] dark:hover:bg-slate-700 cursor-pointer gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#777777] dark:text-slate-400" />
                    <span>{t('settings.export_csv_dict', 'Ekspor Kamus CSV')}</span>
                  </Button>

                  <input
                    type="file"
                    ref={textFileInputRef}
                    onChange={handleQuickImportCSV}
                    accept=".csv"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => textFileInputRef.current?.click()}
                    className="h-9 px-4 rounded-full text-xs font-bold bg-white dark:bg-slate-800 border border-[#EBEBEB] dark:border-slate-700 text-[#111111] dark:text-slate-100 hover:bg-[#F5F6F6] dark:hover:bg-slate-700 cursor-pointer gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#777777] dark:text-slate-400" />
                    <span>{t('settings.import_csv_dict', 'Impor Kamus CSV')}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Reset seluruh kamus teks ke bahasa bawaan sistem?')) {
                        resetCustomTranslations();
                        setSuccessMsg('Kamus teks UI dikembalikan ke pengaturan awal.');
                      }
                    }}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10 cursor-pointer gap-1.5 ml-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('settings.reset_dict_btn', 'Reset ke Bawaan')}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* GROUP 5: SECURITY & DATABASE MAINTENANCE */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              {/* Danger Zone: Reset Database */}
              <Card className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold text-[#111111] dark:text-slate-100 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-500" />
                    <span>{t('settings.danger_zone_title', 'Danger Zone: Reset Database Sistem')}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.danger_zone_desc', 'Mereset seluruh pengaturan sistem ke kondisi awal bawaan (Manage Admin Access, Organisasi, Departemen, AI, Notifikasi, Penyimpanan) serta menghapus seluruh data transaksi.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs">
                  <div className="p-4 bg-[#F5F6F6] dark:bg-slate-800/50 rounded-2xl border border-[#EBEBEB] dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#111111] dark:text-slate-100">{t('settings.delete_all_transactions', 'Reset Seluruh Pengaturan & Data Transaksi')}</p>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleOpenResetModal}
                      disabled={resettingData}
                      className="h-9 px-4 rounded-full text-xs font-bold bg-red-500 text-white hover:bg-red-600 cursor-pointer shrink-0"
                    >
                      {resettingData ? t('settings.resetting_db', 'Mereset Database...') : t('settings.reset_db_btn', 'Reset Database Sistem')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

      {/* Confirmation Modal for Reset Database */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-rose-200 dark:border-rose-900/50 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-rose-100 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 flex items-center gap-3">
              <div className="p-2 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.reset_modal_title', 'Reset Database Sistem')}
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-0.5">
                  {t('settings.reset_modal_warning', 'Tindakan ini permanen dan tidak dapat dibatalkan.')}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3 text-xs">
              <label className="block text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                {t(
                  'settings.reset_modal_desc',
                  'Seluruh pengaturan sistem, organisasi, departemen, konfigurasi, dan data transaksi akan direset permanen ke bawaan awal. Akun pengguna terdaftar tetap aman. Ketik RESET NOW untuk konfirmasi:'
                )}
              </label>

              <div>
                <input
                  type="text"
                  value={resetConfirmationText}
                  onChange={(e) => setResetConfirmationText(e.target.value)}
                  placeholder={t('settings.reset_modal_input_placeholder', 'RESET NOW')}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-mono font-bold placeholder:font-mono placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmationText('');
                }}
                disabled={resettingData}
                className="h-9 px-4 rounded-xl text-xs font-bold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t('common.cancel', 'Batal')}
              </Button>

              <Button
                type="button"
                variant="destructive"
                onClick={handleExecuteReset}
                disabled={resetConfirmationText.trim() !== 'RESET NOW' || resettingData}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed gap-1.5"
              >
                {resettingData ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('settings.resetting_db', 'Mereset Database...')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('settings.confirm_reset_btn', 'Reset Database')}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Editing Database Configuration */}
      {showEditConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-hidden animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full shadow-2xl border border-[#EBEBEB] dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-[#EBEBEB] dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111111] dark:text-slate-100">
                  {t('settings.edit_confirm_title', 'Ubah Konfigurasi Database')}
                </h3>
              </div>
            </div>

            <div className="p-5 text-xs text-[#777777] dark:text-slate-400 leading-relaxed">
              {t(
                'settings.edit_confirm_desc',
                'Mengubah Spreadsheet ID atau Folder Storage akan mengalihkan sinkronisasi ke berkas baru. Pastikan ID sheet tujuan valid.'
              )}
            </div>

            <div className="p-4 bg-[#F5F6F6] dark:bg-slate-800/40 border-t border-[#EBEBEB] dark:border-slate-800 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowEditConfirmModal(false)}
                className="h-8 px-3.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-[#EBEBEB] dark:border-slate-700 text-[#111111] dark:text-slate-100 hover:bg-[#F5F6F6] cursor-pointer"
              >
                {t('settings.edit_confirm_cancel', 'Batal')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowEditConfirmModal(false);
                  setIsEditUnlocked(true);
                }}
                className="h-8 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer shadow-2xs"
              >
                {t('settings.edit_confirm_proceed', 'Lanjutkan Edit')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Picker Modal */}
      {showPickerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2">
                {pickerType === 'spreadsheet' ? (
                  <FileSpreadsheet className="w-5 h-5 text-[#06C755]" />
                ) : (
                  <Folder className="w-5 h-5 text-[#06C755]" />
                )}
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {pickerType === 'spreadsheet'
                      ? 'Pilih Spreadsheet dari Google Drive'
                      : 'Pilih Folder Storage dari Google Drive'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Akun: {googleUser?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPickerModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder={`Cari nama ${pickerType}...`}
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#F7F8FA] border border-[#E5E8EB] rounded-xl text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all"
                />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white">
                {loadingPickerItems ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Memuat item dari Google Drive...
                  </div>
                ) : filteredDriveItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Tidak ada {pickerType} yang ditemukan.
                  </div>
                ) : (
                  filteredDriveItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className="p-3 hover:bg-[#EBFBF0]/50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {pickerType === 'spreadsheet' ? (
                          <FileSpreadsheet className="w-4 h-4 text-[#06C755] shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <span className="truncate font-semibold text-slate-800">{item.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-2">
                        {item.id.slice(0, 8)}...
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-[#F7F8FA] border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowPickerModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configure Tenant Drive & Sheet */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-hidden animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-[#EBEBEB] dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-[#EBEBEB] dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{ backgroundColor: editingTenant.primaryColor || '#06C755' }}
                >
                  {(editingTenant.name || editingTenant.brandName || 'Org').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111111] dark:text-slate-100">
                    {t('settings.manage_org_modal_title', 'Konfigurasi Drive & Sheet Organisasi')}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">{editingTenant.name || editingTenant.brandName || ''}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTenant(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTenantGoogleConfig} className="p-5 space-y-4 text-xs">
              <p className="text-[#777777] dark:text-slate-400 leading-relaxed text-[11px]">
                {t(
                  'settings.manage_org_modal_desc',
                  'Atur atau hubungkan ID Google Drive Folder spesifik untuk organisasi ini sebagai tempat penyimpanan lampiran file.'
                )}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-[#111111] dark:text-slate-100 mb-1 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-[#06C755]" />
                    <span>{t('settings.org_folder_label', 'Folder Organisasi (Google Drive Folder ID)')}</span>
                  </label>
                  <input
                    type="text"
                    value={tenantFolderInput}
                    onChange={(e) => setTenantFolderInput(e.target.value)}
                    placeholder="Contoh: 1vX8Z..."
                    className="w-full bg-[#F5F6F6] dark:bg-slate-800/60 border border-[#EBEBEB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-[#111111] dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755]/20"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Folder spesifik organisasi ini yang terletak di dalam Master Root Drive untuk menyimpan dokumen kontrak, IO, vendor, dan billing.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#EBEBEB] dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTenant(null)}
                  className="h-8 px-3.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-[#EBEBEB] dark:border-slate-700 text-[#777777] hover:bg-[#F5F6F6] cursor-pointer"
                >
                  {t('settings.cancel_edit_btn', 'Batal')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingTenantGoogle}
                  className="h-8 px-4 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5 shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingTenantGoogle ? 'Menyimpan...' : t('settings.save_tenant_google_btn', 'Simpan Konfigurasi Organisasi')}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UI Text Manager Modal */}
      {showUITextModal && <UITextManagerModal isOpen={showUITextModal} onClose={() => setShowUITextModal(false)} />}
    </div>
  );
};
