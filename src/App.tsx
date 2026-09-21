import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Scale, FileSignature, ShieldCheck } from 'lucide-react';
import { SignInForm } from './components/SignInForm';
import InteractiveGridBackground from './components/lightswind/interactive-grid-background';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';

import { DashboardView } from './components/DashboardView';
import { HierarchyTreemapView } from './components/HierarchyTreemapView';
import { ContractsView } from './components/ContractsView';
import { ContractCreatorView } from './components/ContractCreatorView';
import { IOView } from './components/IOView';
import { PartnersView } from './components/PartnersView';
import { PartnerSpendingView } from './components/PartnerSpendingView';
import { AmendmentsView } from './components/AmendmentsView';
import { NotificationsView } from './components/NotificationsView';
import { AdminUsersView } from './components/AdminUsersView';
import { BulkImportView } from './components/BulkImportView';
import { ActivityLogsView } from './components/ActivityLogsView';
import { ConsoleSubmenu } from './components/admin/types';
import { TenantDashboard } from './components/TenantDashboard';
import { SettingsView } from './components/SettingsView';
import { AIChatWidget } from './components/AIChatWidget';
import { PrivacyPolicyView } from './components/PrivacyPolicyView';
import { TermsOfServiceView } from './components/TermsOfServiceView';
import { AlertTriangle, CheckCircle2, Info, X, ExternalLink } from 'lucide-react';

import { ContractModal } from './components/ContractModal';
import { IOModal } from './components/IOModal';
import { PartnerModal } from './components/PartnerModal';
import { AmendmentModal } from './components/AmendmentModal';

import {
  Contract,
  InsertionOrder,
  Partner,
  NotificationLog,
  GoogleSheetsConfig,
  PartnerEvaluation,
  PartnerSpending,
} from './types';
import { getCachedAccessToken, invalidateGoogleToken } from './lib/googleAuthService';
import { PermissionProvider } from './lib/permissions';
import { usePermissions } from './lib/permissions';

export const getAuthHeaders = () => {
  const token = getCachedAccessToken();
  const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('auth_session_token') : null;
  const activeOrgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrganizationId') : null;
  const googleProfileStr = typeof window !== 'undefined' ? localStorage.getItem('google_user_profile') : null;
  const authUserStr = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null;
  let userEmail = '';
  let userName = '';
  let userRole = '';
  if (authUserStr) {
    try {
      const u = JSON.parse(authUserStr);
      userEmail = u.email || '';
      userName = u.name || '';
      userRole = u.role || '';
    } catch {}
  }
  if (!userEmail && googleProfileStr) {
    try {
      const p = JSON.parse(googleProfileStr);
      userEmail = p.email || '';
      userName = p.name || '';
    } catch {}
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['x-google-access-token'] = token;
  }
  if (userEmail) {
    headers['x-user-email'] = userEmail;
    headers['x-google-user-email'] = userEmail;
  }
  if (userName) {
    headers['x-user-name'] = userName;
  }
  if (userRole) {
    headers['x-user-role'] = userRole;
    headers['x-role'] = userRole;
  }
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
    headers['x-session-token'] = sessionToken;
  }
  if (activeOrgId) {
    headers['x-tenant-id'] = activeOrgId;
    headers['x-organization-id'] = activeOrgId;
  }
  return headers;
};

const MainApp: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { activeTenantId, activeTenant } = useTenant();
  const { activeTab, setActiveTab } = useNavigation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (activeTab === 'create-contract' && !hasPermission('document.create')) {
      setActiveTab('dashboard');
    }
  }, [activeTab, hasPermission, setActiveTab]);

  // Data States
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [ios, setIos] = useState<InsertionOrder[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [evaluations, setEvaluations] = useState<PartnerEvaluation[]>([]);
  const [spendings, setSpendings] = useState<PartnerSpending[]>([]);
  const [googleConfig, setGoogleConfig] = useState<GoogleSheetsConfig>({
    spreadsheetId: '178lap6p6jwuVlbrVp7jmrgvgpAPLYRgpPDkJvgc_EgM',
    driveFolderId: '1xiFIvgWdDtYEzL7IoqVD9d-NaS7XcfYp',
    isConnected: true,
    autoSync: true,
  });
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(Date.now());

  // Modal States
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);

  const [showIOModal, setShowIOModal] = useState(false);
  const [ioToEdit, setIoToEdit] = useState<InsertionOrder | null>(null);

  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partnerToEdit, setPartnerToEdit] = useState<Partner | null>(null);

  const [showAmendmentModal, setShowAmendmentModal] = useState(false);
  const [amendmentParent, setAmendmentParent] = useState<Contract | InsertionOrder | undefined>(undefined);

  // Toast Notification System
  const [toasts, setToasts] = useState<Array<{
    id: string;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    actionText?: string;
    onAction?: () => void;
  }>>([]);

  const showToast = (toast: {
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    actionText?: string;
    onAction?: () => void;
  }) => {
    const id = 'toast-' + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Unified Aggregated Data Query via React Query & /api/init-data
  const { data: initData } = useQuery({
    queryKey: ['init-data', activeTenantId],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const res = await fetch('/api/init-data', { headers, cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch initial data');
      return await res.json();
    },
    enabled: Boolean(user?.email),
    refetchOnWindowFocus: true,
    staleTime: 10000,
  });

  // Sync query data to state
  useEffect(() => {
    if (!initData) return;
    if (Array.isArray(initData.contracts)) setContracts(initData.contracts);
    if (Array.isArray(initData.ios)) setIos(initData.ios);
    if (Array.isArray(initData.partners)) setPartners(initData.partners);
    if (Array.isArray(initData.notifications)) setNotifications(initData.notifications);
    if (initData.googleConfig && typeof initData.googleConfig === 'object') setGoogleConfig(initData.googleConfig);
    if (Array.isArray(initData.evaluations)) setEvaluations(initData.evaluations);
    if (Array.isArray(initData.spendings)) setSpendings(initData.spendings);
    setLastSyncTimestamp(initData.timestamp || Date.now());
  }, [initData]);

  const loadAllData = async (_shouldFetchFromSheet = false) => {
    await queryClient.invalidateQueries({ queryKey: ['init-data'] });
  };

  // Contract CRUD Handlers (Optimistic UI)
  const handleSaveContract = async (contractData: any) => {
    const isEditing = Boolean(contractToEdit && contractToEdit.contract_id);
    const url = isEditing ? `/api/contracts/${contractToEdit!.contract_id}` : '/api/contracts';
    const method = isEditing ? 'PUT' : 'POST';

    // 1. Optimistic UI Update (Client side instant update 0ms)
    if (isEditing && contractToEdit) {
      setContracts((prev) =>
        prev.map((c) =>
          c.contract_id === contractToEdit.contract_id
            ? { ...c, ...contractData, updated_at: new Date().toISOString() }
            : c
        )
      );
    } else {
      const tempId = contractData.contract_id || `CTR-${Date.now()}`;
      const optimisticContract: Contract = {
        contract_id: tempId,
        ...contractData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setContracts((prev) => [optimisticContract, ...prev]);
    }

    // 2. Dispatch background API call
    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...contractData,
          userEmail: user.email,
          userName: user.name,
          userRole: user.role,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast({
          type: 'error',
          title: 'Gagal Menyimpan Kontrak',
          message: errData.error || 'Terjadi kesalahan saat menyimpan ke backend.',
        });
      }
      loadAllData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error Koneksi',
        message: err?.message || 'Gagal terhubung ke server.',
      });
      loadAllData();
    }
  };

  const handleDeleteContract = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus data kontrak ini?')) {
      // 1. Optimistic UI update
      setContracts((prev) => prev.filter((c) => c.contract_id !== id));

      const headers = getAuthHeaders();
      try {
        const res = await fetch(
          `/api/contracts/${id}?userEmail=${encodeURIComponent(user.email)}&userName=${encodeURIComponent(
            user.name
          )}&userRole=${encodeURIComponent(user.role)}`,
          { method: 'DELETE', headers }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            title: 'Gagal Menghapus Kontrak',
            message: (await res.json()).error || 'Gagal menghapus',
          });
        }
        loadAllData();
      } catch (err: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: err?.message || 'Gagal menghapus kontrak.',
        });
        loadAllData();
      }
    }
  };

  // IO CRUD Handlers (Optimistic UI)
  const handleSaveIO = async (ioData: any) => {
    const isEditing = Boolean(ioToEdit && ioToEdit.io_id);
    const url = isEditing ? `/api/ios/${ioToEdit!.io_id}` : '/api/ios';
    const method = isEditing ? 'PUT' : 'POST';

    // 1. Optimistic UI update
    if (isEditing && ioToEdit) {
      setIos((prev) =>
        prev.map((i) =>
          i.io_id === ioToEdit.io_id
            ? { ...i, ...ioData, updated_at: new Date().toISOString() }
            : i
        )
      );
    } else {
      const tempId = ioData.io_id || `IO-${Date.now()}`;
      const optimisticIO: InsertionOrder = {
        io_id: tempId,
        ...ioData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setIos((prev) => [optimisticIO, ...prev]);
    }

    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...ioData,
          userEmail: user.email,
          userName: user.name,
          userRole: user.role,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast({
          type: 'error',
          title: 'Gagal Menyimpan IO',
          message: errData.error || 'Gagal menyimpan Insertion Order.',
        });
      }
      loadAllData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error Koneksi',
        message: err?.message || 'Gagal menghubungi server.',
      });
      loadAllData();
    }
  };

  const handleDeleteIO = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus IO ini?')) {
      setIos((prev) => prev.filter((i) => i.io_id !== id));

      const headers = getAuthHeaders();
      try {
        const res = await fetch(
          `/api/ios/${id}?userEmail=${encodeURIComponent(user.email)}&userName=${encodeURIComponent(
            user.name
          )}&userRole=${encodeURIComponent(user.role)}`,
          { method: 'DELETE', headers }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            title: 'Gagal Menghapus IO',
            message: (await res.json()).error || 'Gagal menghapus',
          });
        }
        loadAllData();
      } catch (e: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: e.message,
        });
        loadAllData();
      }
    }
  };

  // Partner CRUD Handlers (Optimistic UI)
  const handleSavePartner = async (partnerData: any) => {
    const isEditing = Boolean(partnerToEdit && partnerToEdit.partner_id);
    const url = isEditing ? `/api/partners/${partnerToEdit!.partner_id}` : '/api/partners';
    const method = isEditing ? 'PUT' : 'POST';

    // Optimistic UI update
    if (isEditing && partnerToEdit) {
      setPartners((prev) =>
        prev.map((p) =>
          p.partner_id === partnerToEdit.partner_id
            ? { ...p, ...partnerData, updated_at: new Date().toISOString() }
            : p
        )
      );
    } else {
      const tempId = partnerData.partner_id || `PTR-${Date.now()}`;
      const optimisticPartner: Partner = {
        partner_id: tempId,
        ...partnerData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPartners((prev) => [optimisticPartner, ...prev]);
    }

    try {
      await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...partnerData,
          userEmail: user.email,
          userName: user.name,
          userRole: user.role,
        }),
      });
      loadAllData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: err?.message || 'Gagal menyimpan partner.',
      });
      loadAllData();
    }
  };

  const handleDeletePartner = async (id: string, name: string) => {
    if (
      confirm(
        `PERINGATAN: Menghapus Partner "${name}" akan MENGHAPUS SEMUA dokumen penunjang seperti Kontrak, Insertion Order (IO), Adendum, dan Notifikasi terkait!\n\nApakah Anda yakin ingin melanjutkan penghapusan?`
      )
    ) {
      // Optimistic delete
      setPartners((prev) => prev.filter((p) => p.partner_id !== id));
      setContracts((prev) => prev.filter((c) => c.partner_id !== id));
      setIos((prev) => prev.filter((i) => i.partner_id !== id));

      const headers = getAuthHeaders();
      try {
        const res = await fetch(
          `/api/partners/${id}?userEmail=${encodeURIComponent(user.email)}&userName=${encodeURIComponent(
            user.name
          )}&userRole=${encodeURIComponent(user.role)}`,
          { method: 'DELETE', headers }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            title: 'Gagal Menghapus Partner',
            message: (await res.json()).error || 'Gagal menghapus',
          });
        }
        loadAllData();
      } catch (e: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: e.message,
        });
        loadAllData();
      }
    }
  };

  const handleUploadDDDoc = async (_partnerId: string, _docName: string) => {
    loadAllData();
  };

  // Amendment CRUD Handler
  const handleSaveAmendment = async (amendmentData: any) => {
    const tempId = amendmentData.contract_id || `AMD-${Date.now()}`;
    const optimisticAmd: Contract = {
      contract_id: tempId,
      ...amendmentData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setContracts((prev) => [optimisticAmd, ...prev]);

    try {
      await fetch('/api/contracts', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...amendmentData,
          userEmail: user.email,
          userName: user.name,
          userRole: user.role,
        }),
      });
      loadAllData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: err?.message || 'Gagal menyimpan adendum.',
      });
      loadAllData();
    }
  };

  // Google Config & Sync Handlers
  const handleSaveGoogleConfig = async (
    spreadsheetId: string,
    driveFolderId: string,
    autoSync: boolean,
    isLocked?: boolean,
    extraConfig?: Partial<GoogleSheetsConfig>
  ) => {
    const token = getCachedAccessToken();
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('google_refresh_token') || undefined : undefined;
    const googleProfileStr = typeof window !== 'undefined' ? localStorage.getItem('google_user_profile') : null;
    let adminEmail = '';
    let adminName = '';
    if (googleProfileStr) {
      try {
        const p = JSON.parse(googleProfileStr);
        adminEmail = p.email || '';
        adminName = p.name || '';
      } catch {}
    }
    const res = await fetch('/api/google-integration', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        spreadsheetId,
        driveFolderId,
        autoSync,
        isLocked,
        ...extraConfig,
        adminEmail: adminEmail || user?.email,
        adminName: adminName || user?.name,
        accessToken: token,
        refreshToken: refreshToken,
      }),
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      if (!res.ok) {
        throw new Error(`Server error (${res.status}): Gagal memproses data.`);
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        invalidateGoogleToken();
      }
      throw new Error(data.error || 'Gagal menyimpan konfigurasi.');
    }

    setGoogleConfig(data.config || { spreadsheetId, driveFolderId, autoSync, isLocked, ...extraConfig, isConnected: true });
    await loadAllData();

    if (data.syncWarning) {
      throw new Error(data.syncWarning);
    }
  };

  const handleSyncNow = async (mode: "fetch" | "push" = "fetch") => {
    const token = getCachedAccessToken();
    const res = await fetch('/api/google-integration/sync', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        spreadsheetId: googleConfig.masterSpreadsheetId || googleConfig.spreadsheetId,
        driveFolderId: googleConfig.driveFolderId,
        accessToken: token,
        mode: mode,
      }),
    });

    let data: any = {};
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!res.ok) {
      if (res.status === 401) {
        invalidateGoogleToken();
      }
      throw new Error(data.error || `Gagal sinkronisasi dengan Google Sheet (Status ${res.status}).`);
    }

    await fetch('/api/cron/trigger-check', { method: 'POST' });
    await loadAllData();
    return data;
  };

  const handleTriggerCheck = async () => {
    await fetch('/api/cron/trigger-check', { method: 'POST' });
    loadAllData();
  };

  const handleMarkReadNotifications = async (notifId?: string, markAll?: boolean) => {
    await fetch('/api/notification-logs/mark-read', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notif_id: notifId, markAll }),
    });
    loadAllData();
  };

  const handleDeleteNotifications = async (notifId?: string, notifIds?: string[], deleteAll?: boolean) => {
    await fetch('/api/notification-logs/delete', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notif_id: notifId, notif_ids: notifIds, deleteAll }),
    });
    loadAllData();
  };

  const expiringContractsCount = contracts.filter((c) => c.status === 'Akan Berakhir').length;
  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex h-screen w-full bg-canvas text-[var(--foreground)] font-sans overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unresolvedNotifsCount={unreadNotifsCount}
        expiringContractsCount={expiringContractsCount}
        googleConfig={googleConfig}
        lastSyncTimestamp={lastSyncTimestamp}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          notifications={notifications}
          googleConfig={googleConfig}
          onRefreshData={loadAllData}
          onNavigateToTab={setActiveTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        <main className="flex-1 p-3.5 sm:p-5 md:p-7 overflow-y-auto bg-canvas">
          <section className="w-full space-y-6">
            {activeTab === 'dashboard' && (
            <DashboardView
              contracts={contracts}
              ios={ios}
              partners={partners}
              spendings={spendings}
              notifications={notifications}
              onNavigateTab={setActiveTab}
              onSelectContract={(ctr) => {
                setActiveTab('contracts');
              }}
              onSelectPartner={(p) => {
                setActiveTab('partners');
              }}
            />
          )}

          {activeTab === 'hierarchy' && (
            <HierarchyTreemapView
              partners={partners}
              contracts={contracts}
              ios={ios}
              evaluations={evaluations}
              spendings={spendings}
              onOpenAddPartner={() => {
                setPartnerToEdit(null);
                setShowPartnerModal(true);
              }}
              onOpenAddContract={(partnerId) => {
                setContractToEdit(partnerId ? ({ partner_id: partnerId } as any) : null);
                setShowContractModal(true);
              }}
              onOpenAddIO={(contractId, partnerId) => {
                setIoToEdit(
                  contractId || partnerId
                    ? ({ contract_id: contractId, partner_id: partnerId } as any)
                    : null
                );
                setShowIOModal(true);
              }}
              onSelectPartner={(p) => {
                setPartnerToEdit(p);
                setShowPartnerModal(true);
              }}
              onSelectContract={(ctr) => {
                setContractToEdit(ctr);
                setShowContractModal(true);
              }}
              onSelectIO={(io) => {
                setIoToEdit(io);
                setShowIOModal(true);
              }}
            />
          )}

          {activeTab === 'contracts' && (
            <ContractsView
              contracts={contracts}
              partners={partners}
              ios={ios}
              onAddContract={() => {
                setContractToEdit(null);
                setShowContractModal(true);
              }}
              onEditContract={(ctr) => {
                setContractToEdit(ctr);
                setShowContractModal(true);
              }}
              onDeleteContract={handleDeleteContract}
              onOpenAddendumModal={(ctr) => {
                setAmendmentParent(ctr);
                setShowAmendmentModal(true);
              }}
              onUpdateContractData={(updated) => {
                setContracts((prev) =>
                  prev.map((c) => (c.contract_id === updated.contract_id ? updated : c))
                );
              }}
            />
          )}

          {activeTab === 'create-contract' && (
            <ContractCreatorView
              partners={partners}
              contracts={contracts}
              onSaveToSystem={async (data) => {
                await handleSaveContract(data);
              }}
              onNavigateToContracts={() => setActiveTab('contracts')}
            />
          )}

          {(activeTab === 'ios' || activeTab === 'io') && (
            <IOView
              ios={ios}
              contracts={contracts}
              partners={partners}
              onAddIO={() => {
                setIoToEdit(null);
                setShowIOModal(true);
              }}
              onEditIO={(io) => {
                setIoToEdit(io);
                setShowIOModal(true);
              }}
              onDeleteIO={handleDeleteIO}
            />
          )}

          {(activeTab === 'partners' || activeTab === 'partner-evaluation') && (
            <PartnersView
              partners={partners}
              contracts={contracts}
              evaluations={evaluations}
              onRefreshData={loadAllData}
              initialSubTab={activeTab === 'partner-evaluation' ? 'evaluation' : 'list'}
              onAddPartner={() => {
                setPartnerToEdit(null);
                setShowPartnerModal(true);
              }}
              onEditPartner={(p) => {
                setPartnerToEdit(p);
                setShowPartnerModal(true);
              }}
              onDeletePartner={handleDeletePartner}
              onUploadDDDoc={handleUploadDDDoc}
            />
          )}

          {activeTab === 'partner-spending' && (
            <PartnerSpendingView
              partners={partners}
              spendings={spendings}
              onRefreshData={loadAllData}
              userEmail={user.email}
              userName={user.name}
              userRole={user.role}
            />
          )}

          {activeTab === 'notifikasi' && (
            <NotificationsView
              notifications={notifications}
              onTriggerCheck={handleTriggerCheck}
              onMarkRead={handleMarkReadNotifications}
              onDeleteNotif={handleDeleteNotifications}
            />
          )}

          {isAdmin && (activeTab === 'admin-users' || activeTab.startsWith('admin-users-')) && (
            <AdminUsersView
              initialTab={
                activeTab === 'admin-users'
                  ? 'dashboard'
                  : (activeTab.replace('admin-users-', '') as ConsoleSubmenu)
              }
            />
          )}

          {activeTab === 'bulk-import' && isAdmin && (
            <BulkImportView
              partners={partners}
              contracts={contracts}
              ios={ios}
              onRefreshData={loadAllData}
              userEmail={user.email}
              userName={user.name}
              userRole={user.role}
            />
          )}

          {activeTab === 'activity-logs' && isAdmin && <ActivityLogsView />}

          {(activeTab === 'settings' || activeTab.startsWith('settings-')) && (
            <SettingsView
              config={googleConfig}
              onSaveConfig={handleSaveGoogleConfig}
              onSyncNow={handleSyncNow}
              initialSection={
                activeTab.startsWith('settings-')
                  ? (activeTab.replace('settings-', '') as any)
                  : undefined
              }
            />
          )}

          {activeTab === 'privacy' && (
            <PrivacyPolicyView onBack={() => setActiveTab('dashboard')} />
          )}

          {activeTab === 'terms' && (
            <TermsOfServiceView onBack={() => setActiveTab('dashboard')} />
          )}
        </section>
      </main>
    </div>

      {/* Modals */}
      {showContractModal && (
        <ContractModal
          contractToEdit={contractToEdit}
          partners={partners}
          contracts={contracts}
          onClose={() => setShowContractModal(false)}
          onSave={handleSaveContract}
        />
      )}

      {showIOModal && (
        <IOModal
          ioToEdit={ioToEdit}
          contracts={contracts}
          partners={partners}
          onClose={() => setShowIOModal(false)}
          onSave={handleSaveIO}
        />
      )}

      {showPartnerModal && (
        <PartnerModal
          partnerToEdit={partnerToEdit}
          onClose={() => setShowPartnerModal(false)}
          onSave={handleSavePartner}
        />
      )}

      {showAmendmentModal && (
        <AmendmentModal
          initialParent={amendmentParent}
          contracts={contracts}
          ios={ios}
          onClose={() => setShowAmendmentModal(false)}
          onSave={handleSaveAmendment}
        />
      )}

      {/* Floating Toast Notification Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border shadow-lg flex items-start gap-3 animate-in slide-in-from-bottom-5 fade-in duration-200 ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
                : toast.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/90 dark:border-amber-700 dark:text-amber-100'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/90 dark:border-emerald-700 dark:text-emerald-100'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              ) : toast.type === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight">{toast.title}</p>
              <p className="text-xs mt-1 leading-snug opacity-90">{toast.message}</p>
              {toast.actionText && toast.onAction && (
                <button
                  onClick={() => {
                    toast.onAction?.();
                    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  }}
                  className="mt-2 text-xs font-bold underline cursor-pointer hover:opacity-80 flex items-center gap-1"
                >
                  <span>{toast.actionText}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <AIChatWidget />
    </div>
  );
};

const isPrivacyRoute = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase().replace(/\/$/, '');
  const hash = window.location.hash.toLowerCase();
  return (
    path === '/privacy' ||
    path === '/privacy-policy' ||
    hash === '#privacy' ||
    hash === '#privacy-policy'
  );
};

const isTermsRoute = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase().replace(/\/$/, '');
  const hash = window.location.hash.toLowerCase();
  return (
    path === '/tos' ||
    path === '/terms' ||
    path === '/terms-of-service' ||
    hash === '#tos' ||
    hash === '#terms' ||
    hash === '#terms-of-service'
  );
};

const AppContent = () => {
  const { user, loading } = useAuth();
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState<boolean>(isPrivacyRoute);
  const [showTermsOfService, setShowTermsOfService] = useState<boolean>(isTermsRoute);

  useEffect(() => {
    const handleLocationChange = () => {
      setShowPrivacyPolicy(isPrivacyRoute());
      setShowTermsOfService(isTermsRoute());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleOpenPrivacy = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/privacy');
    }
    setShowPrivacyPolicy(true);
    setShowTermsOfService(false);
  };

  const handleOpenTerms = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/tos');
    }
    setShowTermsOfService(true);
    setShowPrivacyPolicy(false);
  };

  const handleBackToMain = () => {
    setShowPrivacyPolicy(false);
    setShowTermsOfService(false);
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase().replace(/\/$/, '');
      if (
        path === '/privacy' ||
        path === '/privacy-policy' ||
        path === '/tos' ||
        path === '/terms' ||
        path === '/terms-of-service' ||
        window.location.hash
      ) {
        window.history.pushState(null, '', '/');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-[var(--foreground)]">
        <p className="font-display text-lg">Memuat...</p>
      </div>
    );
  }

  if (showPrivacyPolicy) {
    return <PrivacyPolicyView onBack={handleBackToMain} />;
  }

  if (showTermsOfService) {
    return <TermsOfServiceView onBack={handleBackToMain} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full relative overflow-hidden bg-canvas">
        {/* Animated grid spans the whole screen now — both the brand panel and the form float on top of it.
            Wrapped in our own absolutely-positioned div: the component's root hardcodes `relative`,
            which fights a directly-passed `absolute` class depending on Tailwind's utility ordering. */}
        <div className="absolute inset-0">
          <InteractiveGridBackground
            gridSize={44}
            gridColor="#c9bc99"
            darkGridColor="#463f28"
            effectColor="rgba(6, 199, 85, 0.5)"
            darkEffectColor="rgba(31, 219, 110, 0.55)"
            trailLength={6}
            idleRandomCount={10}
            glow
            glowRadius={32}
            showFade
            fadeIntensity={82}
            className="w-full h-full"
          />
        </div>

        <div className="relative z-10 min-h-screen w-full flex">
          {/* Editorial panel — brand moment on its own static card, hidden below lg to keep mobile focused on the form */}
          <div className="hidden lg:flex lg:w-[40%] xl:w-[34%] items-stretch p-6 xl:p-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col justify-between w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm p-8 xl:p-10"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md shadow-[var(--primary)]/20">
                  <Scale className="h-5 w-5" />
                </span>
                <span className="font-display text-lg font-semibold tracking-tight">LMS</span>
              </div>

              <div>
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--seal)] mb-4">
                  <ShieldCheck className="h-3.5 w-3.5" /> Legal Management System
                </p>
                <h1 className="font-display text-4xl xl:text-[2.75rem] leading-[1.08] font-medium tracking-tight text-[var(--foreground)]">
                  Setiap kontrak, tercatat rapi &amp; siap ditelusuri.
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  Kontrak, Insertion Order, Due Diligence Mitra, dan riwayat perubahan —
                  dalam satu ruang kerja yang tenang.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <FileSignature className="h-3.5 w-3.5" />
                <span>2026 ACL. All rights reserved.</span>
              </div>
            </motion.div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            >
              <SignInForm
                onOpenPrivacyPolicy={handleOpenPrivacy}
                onOpenTermsOfService={handleOpenTerms}
              />
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return <MainApp />;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 10000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PermissionProvider>
            <LanguageProvider>
              <TenantProvider>
                <NavigationProvider>
                  <AppContent />
                </NavigationProvider>
              </TenantProvider>
            </LanguageProvider>
          </PermissionProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
