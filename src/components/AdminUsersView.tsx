import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { useTenant } from '../context/TenantContext';
import { getAuthHeaders } from '../App';
import {
  ConsoleSubmenu,
  ConsoleUser,
  ConsoleAccount,
  ConsoleSession,
  ConsoleOrganization,
  ConsoleTeam,
  ConsoleInvitation,
  ConsoleApiKey,
  ConsoleMetrics,
} from './admin/types';
import { AdminDashboardTab } from './admin/AdminDashboardTab';
import { AdminConsoleHeader } from './admin/AdminConsoleHeader';
import { AdminUsersTab } from './admin/AdminUsersTab';
import { AdminAccountsTab } from './admin/AdminAccountsTab';
import { AdminSessionsTab } from './admin/AdminSessionsTab';
import { AdminOrganizationsTab } from './admin/AdminOrganizationsTab';
import { AdminTeamsTab } from './admin/AdminTeamsTab';
import { AdminInvitationsTab } from './admin/AdminInvitationsTab';
import { AdminApiKeysTab } from './admin/AdminApiKeysTab';
import { AdminRbacMatrixTab } from './admin/AdminRbacMatrixTab';
import {
  AddUserModal,
  EditUserModal,
  ResetPasswordModal,
  CreateOrganizationModal,
  EditOrganizationModal,
  DeleteOrganizationModal,
  CreateTeamModal,
  EditDepartmentModal,
  DeleteDepartmentModal,
  AddTeamMemberModal,
  InviteMemberModal,
  GenerateApiKeyModal,
  InstancesConfigModal,
} from './admin/AdminModals';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { usePermissions } from '../lib/permissions';

interface AdminUsersViewProps {
  initialTab?: ConsoleSubmenu;
  area?: 'system' | 'organization';
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({ initialTab = 'dashboard', area = 'organization' }) => {
  const { user: currentUser, refreshUser } = useAuth();
  const { t, language } = useLanguage();
  const confirmDialog = useConfirm();
  const { switchTenant } = useTenant();
  const { hasPermission, role } = usePermissions();
  const isSystemArea = area === 'system';

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ConsoleSubmenu>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Data states
  const [metrics, setMetrics] = useState<ConsoleMetrics | null>(null);
  const [users, setUsers] = useState<ConsoleUser[]>([]);
  const [accounts, setAccounts] = useState<ConsoleAccount[]>([]);
  const [sessions, setSessions] = useState<ConsoleSession[]>([]);
  const [organizations, setOrganizations] = useState<ConsoleOrganization[]>([]);
  const [activeOrg, setActiveOrg] = useState<ConsoleOrganization | null>(null);
  const [teams, setTeams] = useState<ConsoleTeam[]>([]);
  const [invitations, setInvitations] = useState<ConsoleInvitation[]>([]);
  const [apiKeys, setApiKeys] = useState<ConsoleApiKey[]>([]);
  const [matrixData, setMatrixData] = useState<any>(null);

  // Modal dialog states
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<ConsoleUser | null>(null);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<ConsoleUser | null>(null);
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  const [selectedOrgForEdit, setSelectedOrgForEdit] = useState<ConsoleOrganization | null>(null);
  const [selectedOrgForDelete, setSelectedOrgForDelete] = useState<ConsoleOrganization | null>(null);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [selectedTeamForEdit, setSelectedTeamForEdit] = useState<ConsoleTeam | null>(null);
  const [selectedTeamForDelete, setSelectedTeamForDelete] = useState<ConsoleTeam | null>(null);
  const [selectedTeamForAddMember, setSelectedTeamForAddMember] = useState<ConsoleTeam | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isCreateApiKeyOpen, setIsCreateApiKeyOpen] = useState(false);
  const [isInstanceConfigOpen, setIsInstanceConfigOpen] = useState(false);

  // Inline toast state
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch all console data
  const loadConsoleData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setIsRefreshing(true);

    try {
      const headers = getAuthHeaders();

      // Parallel fetching for high performance
      const [
        overviewRes,
        usersRes,
        accountsRes,
        sessionsRes,
        orgsRes,
        teamsRes,
        invitesRes,
        apiKeysRes,
        matrixRes,
      ] = await Promise.all([
        isSystemArea
          ? fetch('/api/auth-console/overview', { headers, credentials: 'include' })
          : Promise.resolve(null),
        fetch('/api/auth-console/users', { headers, credentials: 'include' }),
        isSystemArea
          ? fetch('/api/auth-console/accounts', { headers, credentials: 'include' })
          : Promise.resolve(null),
        isSystemArea
          ? fetch('/api/auth-console/sessions', { headers, credentials: 'include' })
          : Promise.resolve(null),
        fetch('/api/auth-console/organizations', { headers, credentials: 'include' }),
        fetch('/api/auth-console/teams', { headers, credentials: 'include' }),
        fetch('/api/auth-console/invitations', { headers, credentials: 'include' }),
        isSystemArea
          ? fetch('/api/auth-console/api-keys', { headers, credentials: 'include' })
          : Promise.resolve(null),
        isSystemArea
          ? fetch('/api/auth-console/rbac-matrix', { headers, credentials: 'include' })
          : Promise.resolve(null),
      ]);

      if (overviewRes?.ok) {
        const data = await overviewRes.json();
        if (data.success && data.data) {
          setMetrics(data.data.metrics);
        }
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        if (data.success && Array.isArray(data.users)) {
          setUsers(data.users);
        }
      }

      if (accountsRes?.ok) {
        const data = await accountsRes.json();
        if (data.success && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
        }
      }

      if (sessionsRes?.ok) {
        const data = await sessionsRes.json();
        if (data.success && Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      }

      if (orgsRes.ok) {
        const data = await orgsRes.json();
        if (data.success && Array.isArray(data.organizations)) {
          setOrganizations(data.organizations);
          // Set active org if none selected yet
          if (!activeOrg && data.organizations.length > 0) {
            setActiveOrg(data.organizations[0]);
          }
        }
      }

      if (teamsRes.ok) {
        const data = await teamsRes.json();
        if (data.success && Array.isArray(data.teams)) {
          setTeams(data.teams);
        }
      }

      if (invitesRes.ok) {
        const data = await invitesRes.json();
        if (data.success && Array.isArray(data.invitations)) {
          setInvitations(data.invitations);
        }
      }

      if (apiKeysRes?.ok) {
        const data = await apiKeysRes.json();
        if (data.success && Array.isArray(data.apiKeys)) {
          setApiKeys(data.apiKeys);
        }
      }

      if (matrixRes?.ok) {
        const data = await matrixRes.json();
        if (data.success && data.matrix) {
          setMatrixData(data.matrix);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Better Auth Console data:', err);
      showToast(t('admin.toast.load_failed', 'Failed to load authentication console data'), 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeOrg, isSystemArea, t]);

  useEffect(() => {
    loadConsoleData();
  }, [loadConsoleData]);

  const handleSelectOrg = (org: ConsoleOrganization) => {
    setActiveOrg(org);
    if (org.id) {
      switchTenant(org.id);
    }
  };

  // Handler: Add User
  const handleAddUser = async (formData: {
    name: string;
    email: string;
    role: string;
    password?: string;
    department?: string;
    organizationId?: string;
  }) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch('/api/auth-console/users', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(formData),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.add_user_failed', 'Failed to add user'));
    }
    showToast(`${t('admin.toast.user', 'User')} ${formData.name} ${t('admin.toast.added_success', 'successfully added.')}`);
    loadConsoleData(true);
  };

  // Handler: Edit User Info
  const handleEditUser = async (
    userId: string,
    newRole: string,
    newDepartment?: string,
    organizationId?: string,
    newName?: string,
    newEmail?: string
  ) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/auth-console/users/${userId}/role`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        role: newRole,
        department: newDepartment,
        organizationId,
        name: newName,
        email: newEmail,
      }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.role_update_failed', 'Failed to update user info'));
    }
    showToast(t('admin.toast.user_updated', 'Informasi pengguna berhasil diperbarui.'));
    loadConsoleData(true);
    try {
      await refreshUser();
    } catch {
      // non-fatal
    }
  };

  // Handler: Reset Password
  const handleResetPassword = async (userId: string, newPass: string) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/auth-console/users/${userId}/password`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({ password: newPass }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.reset_pass_failed', 'Failed to reset password'));
    }
    showToast(t('admin.toast.reset_pass_success', 'New password successfully saved and encrypted.'));
  };

  // Handler: Ban / Unban User
  const handleToggleBan = async (user: ConsoleUser) => {
    const newBannedState = !user.banned;
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      const res = await fetch(`/api/auth-console/users/${user.id}/ban`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          banned: newBannedState,
          banReason: newBannedState ? t('admin.toast.banned_reason', 'Banned by Administrator') : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.ban_status_failed', 'Failed to change ban status'));
      }
      showToast(
        newBannedState
          ? `${t('admin.toast.user', 'User')} ${user.name} ${t('admin.toast.banned_success', 'has been successfully banned.')}`
          : `${t('admin.toast.user', 'User')} ${user.name} ${t('admin.toast.unbanned_success', 'ban status has been lifted.')}`
      );
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Delete User
  const handleDeleteUser = async (user: ConsoleUser) => {
    const ok = await confirmDialog({
      description: `Hapus pengguna "${user.name}"? Akun ini akan dihapus permanen.`,
      tone: 'danger',
      confirmLabel: t('admin.action_delete', 'Hapus'),
    });
    if (!ok) {
      return;
    }
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/users/${user.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.delete_user_failed', 'Failed to delete user'));
      }
      showToast(`${t('admin.toast.user', 'User')} ${user.name} ${t('admin.toast.deleted_success', 'has been deleted.')}`);
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Bulk Action (ban, unban, delete)
  const handleBulkAction = async (action: 'ban' | 'unban' | 'delete', userIds: string[]) => {
    if (userIds.length === 0) return;
    
    // Confirmation for bulk action
    if (action === 'delete') {
      const ok = await confirmDialog({
        description: `Hapus ${userIds.length} pengguna terpilih secara permanen?`,
        tone: 'danger',
        confirmLabel: t('admin.action_delete', 'Hapus'),
      });
      if (!ok) {
        return;
      }
    } else {
      const confirmMsg =
        action === 'ban'
          ? `Cekal ${userIds.length} pengguna terpilih?`
          : `Batalkan cekal ${userIds.length} pengguna terpilih?`;
      const ok = await confirmDialog({ description: confirmMsg, tone: action === 'ban' ? 'danger' : 'default' });
      if (!ok) {
        return;
      }
    }

    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      const res = await fetch('/api/auth-console/users/bulk-action', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ action, userIds }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.bulk_action_failed', 'Failed to execute bulk action'));
      }
      showToast(result.message || t('admin.toast.bulk_action_success', 'Bulk action executed successfully.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/sessions/${sessionId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.revoke_session_failed', 'Failed to revoke session'));
      }
      showToast(t('admin.toast.revoke_session_success', 'Login session successfully revoked.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Revoke All User Sessions
  const handleRevokeAllUserSessions = async (userId: string) => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/sessions/revoke-all/${userId}`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.revoke_all_sessions_failed', 'Failed to revoke all user sessions'));
      }
      showToast(t('admin.toast.revoke_all_sessions_success', 'All active sessions for user successfully revoked.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Create Organization
  const handleCreateOrganization = async (data: {
    name: string;
    slug: string;
    logo?: string;
    tagline?: string;
    currency?: string;
  }) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch('/api/auth-console/organizations', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        name: data.name,
        slug: data.slug,
        logo: data.logo,
        metadata: {
          tagline: data.tagline,
          currency: data.currency,
        },
      }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.create_org_failed', 'Failed to create organization'));
    }
    showToast(`${t('admin.toast.org', 'Organization')} "${data.name}" ${t('admin.toast.created_success', 'successfully created.')}`);
    loadConsoleData(true);
    window.dispatchEvent(new CustomEvent('organization-updated'));
  };

  // Handler: Update Organization
  const handleUpdateOrganization = async (
    orgId: string,
    data: { name: string; slug: string; logo?: string; metadata?: any }
  ) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/auth-console/organizations/${orgId}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.update_org_failed', 'Gagal memperbarui data organisasi'));
    }
    showToast(
      `${t('admin.toast.org', 'Organisasi')} "${data.name}" ${t('admin.toast.updated_success', 'berhasil diperbarui.')}`
    );
    loadConsoleData(true);
    window.dispatchEvent(new CustomEvent('organization-updated'));
  };

  // Handler: Delete Organization
  const handleDeleteOrganization = async (org: ConsoleOrganization) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/auth-console/organizations/${org.id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.delete_org_failed', 'Gagal menghapus organisasi.'));
    }
    showToast(
      `${t('admin.toast.org', 'Organisasi')} "${org.name}" ${t('admin.toast.org_deleted_success', 'berhasil dihapus.')}`
    );
    loadConsoleData(true);
    window.dispatchEvent(new CustomEvent('organization-updated'));
  };

  // Handler: Create Team
  const handleCreateTeam = async (name: string) => {
    if (!activeOrg) throw new Error(t('admin.error.select_org_first', 'Please select an organization first'));
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch('/api/auth-console/teams', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ name, organizationId: activeOrg.id }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.create_team_failed', 'Failed to create team'));
    }
    showToast(`${t('admin.toast.team', 'Team')} "${name}" ${t('admin.toast.created_success', 'successfully created.')}`);
    loadConsoleData(true);
    window.dispatchEvent(new CustomEvent('departments-updated'));
  };

  // Handler: Add Team Member
  const handleAddTeamMember = async (teamId: string, userId: string) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/auth-console/teams/${teamId}/members`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ userId }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.add_member_failed', 'Failed to add member to team'));
    }
    showToast(t('admin.toast.add_member_success', 'Member successfully added to team.'));
    loadConsoleData(true);
  };

  // Handler: Remove Team Member
  const handleRemoveTeamMember = async (teamId: string, userId: string) => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.remove_member_failed', 'Failed to remove member'));
      }
      showToast(t('admin.toast.remove_member_success', 'Member successfully removed from team.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Update Team / Department
  const handleUpdateTeam = async (teamId: string, name: string) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/auth-console/teams/${teamId}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({ name }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.update_team_failed', 'Gagal memperbarui departemen'));
    }
    showToast(
      `${t('admin.toast.department', 'Departemen')} "${name}" ${t('admin.toast.updated_success', 'berhasil diperbarui.')}`
    );
    loadConsoleData(true);
    window.dispatchEvent(new CustomEvent('departments-updated'));
  };

  // Handler: Delete Team / Department
  const handleDeleteTeam = async (team: ConsoleTeam) => {
    const headers = getAuthHeaders();
    const res = await fetch(`/api/auth-console/teams/${team.id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.delete_department_failed', 'Gagal menghapus departemen.'));
    }
    showToast(
      `${t('admin.toast.department', 'Departemen')} "${team.name}" ${t('admin.toast.department_deleted_success', 'berhasil dihapus.')}`
    );
    loadConsoleData(true);
    window.dispatchEvent(new CustomEvent('departments-updated'));
  };

  // Handler: Create Invitation
  const handleCreateInvitation = async (data: {
    email: string;
    role: string;
    teamId?: string;
  }) => {
    if (!activeOrg) throw new Error(t('admin.error.select_org_first', 'Please select an organization first'));
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch('/api/auth-console/invitations', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ ...data, organizationId: activeOrg.id }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.invite_failed', 'Gagal mengirim undangan'));
    }
    showToast(`${t('admin.toast.invite_success', 'Undangan berhasil dicatat ke')} ${data.email}.`);
    loadConsoleData(true);
  };

  // Handler: Resend Invitation
  const handleResendInvitation = async (inviteId: string) => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/invitations/${inviteId}/resend`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.resend_failed', 'Failed to resend invitation'));
      }
      showToast(t('admin.toast.resend_success', 'Invitation successfully updated and resent.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Cancel Invitation
  const handleCancelInvitation = async (inviteId: string) => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/invitations/${inviteId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.cancel_invite_failed', 'Failed to cancel invitation'));
      }
      showToast(t('admin.toast.cancel_invite_success', 'Invitation successfully canceled.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Generate API Key
  const handleGenerateApiKey = async (data: { name: string; scopes: string[] }) => {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch('/api/auth-console/api-keys', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || t('admin.toast.generate_key_failed', 'Failed to generate API Key'));
    }
    showToast(t('admin.toast.generate_key_success', 'API Key successfully generated.'));
    loadConsoleData(true);
    return { secret: result.apiKey.secret }; // Fixed to use result.apiKey based on backend response
  };

  // Handler: Revoke API Key
  const handleRevokeApiKey = async (keyId: string) => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/api-keys/${keyId}/revoke`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.revoke_key_failed', 'Failed to revoke API Key'));
      }
      showToast(t('admin.toast.revoke_key_success', 'API Key has been revoked.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Delete API Key
  const handleDeleteApiKey = async (keyId: string) => {
    const ok = await confirmDialog({
      description: t('admin.confirm.delete_key', 'Hapus API Key ini? Aplikasi yang memakainya akan berhenti berfungsi.'),
      tone: 'danger',
      confirmLabel: t('admin.action_delete', 'Hapus'),
    });
    if (!ok) return;
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/auth-console/api-keys/${keyId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('admin.toast.delete_key_failed', 'Failed to delete API Key'));
      }
      showToast(t('admin.toast.delete_key_success', 'API Key has been deleted.'));
      loadConsoleData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="w-full flex flex-col space-y-6 text-slate-900 dark:text-slate-100">
      {/* Toast Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-medium animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/90 dark:border-red-800 dark:text-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label={t('admin.toast.dismiss', 'Tutup notifikasi')}
            className="p-1 hover:bg-slate-200/50 rounded-md ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Admin Header with integrated Tabs and Org Switcher */}
      <AdminConsoleHeader
        area={area}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onCreateOrgClick={() => setIsCreateOrgOpen(true)}
        onRefresh={() => loadConsoleData(true)}
        isRefreshing={isRefreshing}
        onOpenInstanceModal={() => setIsInstanceConfigOpen(true)}
        userCounts={{
          users: users.length,
          sessions: sessions.length,
          orgs: organizations.length,
          teams: teams.length,
          invites: invitations.length,
          apiKeys: apiKeys.length,
        }}
      />

      {/* Main Tab Content */}
      <div className="w-full">
        {activeTab === 'dashboard' && (
          <AdminDashboardTab
            metrics={metrics}
            activeOrg={activeOrg}
            recentUsers={users}
            recentSessions={sessions}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenAddUser={() => setIsAddUserOpen(true)}
            onOpenCreateOrg={() => setIsCreateOrgOpen(true)}
            onOpenCreateTeam={() => setIsCreateTeamOpen(true)}
            onOpenCreateApiKey={() => setIsCreateApiKeyOpen(true)}
            onRevokeSession={handleRevokeSession}
            canCreateUser={hasPermission('user.create') || hasPermission('user.invite')}
          />
        )}

        {activeTab === 'users' && (
          <AdminUsersTab
            users={users}
            organizations={organizations}
            canCreateUser={hasPermission('user.create') || hasPermission('user.invite')}
            onOpenAddUser={() => {
              if (hasPermission('user.create') || hasPermission('user.invite')) {
                setIsAddUserOpen(true);
              }
            }}
            onOpenEditUser={(user) => setSelectedUserForEdit(user)}
            onOpenResetPassword={(user) => setSelectedUserForPassword(user)}
            onToggleBan={handleToggleBan}
            onDeleteUser={handleDeleteUser}
            onBulkAction={handleBulkAction}
          />
        )}

        {activeTab === 'sessions' && (
          <AdminSessionsTab
            sessions={sessions}
            onRevokeSession={handleRevokeSession}
            onRevokeAllUserSessions={handleRevokeAllUserSessions}
          />
        )}

        {activeTab === 'organizations' && (
          <AdminOrganizationsTab
            organizations={organizations}
            activeOrg={activeOrg}
            onSelectOrg={handleSelectOrg}
            onOpenCreateOrg={() => setIsCreateOrgOpen(true)}
            onOpenEditOrg={(org) => setSelectedOrgForEdit(org)}
            onDeleteOrg={(org) => setSelectedOrgForDelete(org)}
          />
        )}

        {activeTab === 'teams' && (
          <AdminTeamsTab
            teams={teams}
            activeOrg={activeOrg}
            onOpenCreateTeam={() => setIsCreateTeamOpen(true)}
            onOpenEditTeam={(team) => setSelectedTeamForEdit(team)}
            onOpenAddTeamMember={(team) => setSelectedTeamForAddMember(team)}
            onRemoveTeamMember={handleRemoveTeamMember}
            onDeleteTeam={(team) => setSelectedTeamForDelete(team)}
          />
        )}

        {activeTab === 'invitations' && (
          <AdminInvitationsTab
            invitations={invitations}
            activeOrg={activeOrg}
            onOpenInviteModal={() => setIsInviteOpen(true)}
            onResendInvitation={handleResendInvitation}
            onCancelInvitation={handleCancelInvitation}
          />
        )}

        {activeTab === 'apikeys' && (
          <AdminApiKeysTab
            apiKeys={apiKeys}
            onOpenCreateKey={() => setIsCreateApiKeyOpen(true)}
            onRevokeKey={handleRevokeApiKey}
            onDeleteKey={handleDeleteApiKey}
          />
        )}

        {activeTab === 'rbac' && <AdminRbacMatrixTab matrixData={matrixData} />}
      </div>

      {/* Modals */}
      <AddUserModal
        isOpen={isAddUserOpen}
        teams={teams}
        organizations={organizations}
        activeOrgId={activeOrg?.id}
        allowedRoles={isSystemArea
          // Per server/rbac.ts assignableRoles(): the hierarchy rule
          // (target level strictly greater than actor level) applies to
          // Superuser too, so Superuser can create Admin down to Viewer but
          // never another Superuser via this form — the backend rejects it
          // with INVALID_ROLE_ASSIGNMENT if attempted.
          ? ['admin', 'manager', 'editor', 'viewer']
          : role === 'manager'
          ? ['editor', 'viewer']
          : ['manager', 'editor', 'viewer']}
        onClose={() => setIsAddUserOpen(false)}
        onSubmit={handleAddUser}
      />

      <EditUserModal
        user={selectedUserForEdit}
        teams={teams}
        organizations={organizations}
        isOpen={Boolean(selectedUserForEdit)}
        onClose={() => setSelectedUserForEdit(null)}
        onSubmit={handleEditUser}
      />

      <ResetPasswordModal
        user={selectedUserForPassword}
        isOpen={Boolean(selectedUserForPassword)}
        onClose={() => setSelectedUserForPassword(null)}
        onSubmit={handleResetPassword}
      />

      <CreateOrganizationModal
        isOpen={isCreateOrgOpen}
        onClose={() => setIsCreateOrgOpen(false)}
        onSubmit={handleCreateOrganization}
      />

      <EditOrganizationModal
        org={selectedOrgForEdit}
        isOpen={Boolean(selectedOrgForEdit)}
        onClose={() => setSelectedOrgForEdit(null)}
        onSubmit={handleUpdateOrganization}
        onDelete={(org) => setSelectedOrgForDelete(org)}
      />

      <DeleteOrganizationModal
        isOpen={Boolean(selectedOrgForDelete)}
        org={selectedOrgForDelete}
        isActive={activeOrg?.id === selectedOrgForDelete?.id}
        onClose={() => setSelectedOrgForDelete(null)}
        onConfirm={handleDeleteOrganization}
      />

      <CreateTeamModal
        isOpen={isCreateTeamOpen}
        activeOrg={activeOrg}
        onClose={() => setIsCreateTeamOpen(false)}
        onSubmit={handleCreateTeam}
      />

      <EditDepartmentModal
        isOpen={Boolean(selectedTeamForEdit)}
        team={selectedTeamForEdit}
        onClose={() => setSelectedTeamForEdit(null)}
        onSubmit={handleUpdateTeam}
        onDelete={(team) => setSelectedTeamForDelete(team)}
      />

      <DeleteDepartmentModal
        isOpen={Boolean(selectedTeamForDelete)}
        team={selectedTeamForDelete}
        onClose={() => setSelectedTeamForDelete(null)}
        onConfirm={handleDeleteTeam}
      />

      <AddTeamMemberModal
        team={selectedTeamForAddMember}
        users={users}
        isOpen={Boolean(selectedTeamForAddMember)}
        onClose={() => setSelectedTeamForAddMember(null)}
        onSubmit={handleAddTeamMember}
      />

      <InviteMemberModal
        isOpen={isInviteOpen}
        activeOrg={activeOrg}
        teams={teams}
        onClose={() => setIsInviteOpen(false)}
        onSubmit={handleCreateInvitation}
      />

      <GenerateApiKeyModal
        isOpen={isCreateApiKeyOpen}
        onClose={() => setIsCreateApiKeyOpen(false)}
        onSubmit={handleGenerateApiKey}
      />

      <InstancesConfigModal
        isOpen={isInstanceConfigOpen}
        onClose={() => setIsInstanceConfigOpen(false)}
      />
    </div>
  );
};
