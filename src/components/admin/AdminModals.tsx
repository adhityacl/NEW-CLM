import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Shield,
  KeyRound,
  Building2,
  Layers,
  Mail,
  Lock,
  Copy,
  Check,
  FileCode2,
  AlertTriangle,
  Pencil,
  Upload,
  Image,
  Trash2,
  Link2,
  Key,
  Eye,
  EyeOff,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import {
  ConsoleUser,
  ConsoleOrganization,
  ConsoleTeam,
} from './types';
import { useLanguage } from '../../context/LanguageContext';
import { useDepartments } from '../../hooks/useDepartments';

// Add user modal

interface AddUserModalProps {
  isOpen: boolean;
  teams?: ConsoleTeam[];
  organizations?: ConsoleOrganization[];
  activeOrgId?: string;
  allowedRoles?: string[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    email: string;
    role: string;
    password?: string;
    department?: string;
    organizationId?: string;
  }) => Promise<void>;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  teams,
  organizations = [],
  activeOrgId,
  allowedRoles = ['manager', 'editor', 'viewer'],
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const { departments: DEFAULT_DEPARTMENTS } = useDepartments();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(allowedRoles.includes('editor') ? 'editor' : allowedRoles[0] || 'viewer');
  const [department, setDepartment] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setError('');
      if (!allowedRoles.includes(role)) {
        setRole(allowedRoles[0] || 'viewer');
      }
      // Default to active organization or first available
      if (activeOrgId && organizations?.some((org) => org.id === activeOrgId)) {
        setOrganizationId(activeOrgId);
      } else if (organizations && organizations.length > 0) {
        setOrganizationId(organizations[0].id);
      } else {
        setOrganizationId('');
      }
    }
  }, [isOpen, activeOrgId, organizations, allowedRoles, role]);

  React.useEffect(() => {
    if (!department) {
      if (teams && teams.length > 0) {
        setDepartment(teams[0].name);
      } else if (DEFAULT_DEPARTMENTS && DEFAULT_DEPARTMENTS.length > 0) {
        setDepartment(DEFAULT_DEPARTMENTS[0]);
      }
    }
  }, [teams, DEFAULT_DEPARTMENTS, department]);

  const deptOptions = Array.from(
    new Set([
      ...(teams && teams.length > 0 ? teams.map((tm) => tm.name) : DEFAULT_DEPARTMENTS),
      ...(department ? [department] : []),
    ])
  ).filter(Boolean);

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === 'superuser') {
      setOrganizationId('');
    } else if (!organizationId && organizations && organizations.length > 0) {
      setOrganizationId(activeOrgId || organizations[0].id);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError(t('admin.err_required', 'Nama Lengkap Pengguna dan Alamat Email wajib diisi.'));
      return;
    }
    // Roles below Superuser and Admin MUST be assigned to 1 tenant
    if (role !== 'superuser' && role !== 'admin' && !organizationId) {
      setError(t('admin.err_tenant_required', 'Peran di bawah Superuser dan Admin wajib masuk ke 1 organisasi/tenant.'));
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        password: password ? password : undefined,
        department: department.trim(),
        organizationId: role === 'superuser' ? undefined : (organizationId || undefined),
      });
      setName('');
      setEmail('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.err_add_user', 'Gagal menambahkan user'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_add_user', 'Tambah Pengguna Sistem Baru')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.fullname_label', 'Nama Lengkap Pengguna *')}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Rina Melati"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.email_label', 'Alamat Email (Google / Corporate) *')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@adapundi.com"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.role_label', 'Role Hak Akses Aplikasi *')}
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-medium"
              >
                {allowedRoles.includes('superuser') && <option value="superuser">Superuser (System Level)</option>}
                {allowedRoles.includes('admin') && <option value="admin">Admin (Tenant Level)</option>}
                {allowedRoles.includes('manager') && <option value="manager">Manager (Group Approval)</option>}
                {allowedRoles.includes('editor') && <option value="editor">Editor (Group Draft & Upload)</option>}
                {allowedRoles.includes('viewer') && <option value="viewer">Viewer (Read-Only Final)</option>}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.tab_teams', 'Departemen')}
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-medium"
              >
                {deptOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            * Pilihan Departmens akan otomatis menjadi <strong>Internal PIC default</strong> saat user menambahkan mitra baru dan menentukan cakupan file.
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('admin.select_tenant_label', 'Organisasi / Tenant')} {role !== 'superuser' && role !== 'admin' && <span className="text-red-500">*</span>}
              </label>
              {role !== 'superuser' && role !== 'admin' && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  {t('admin.must_one_tenant', '(Wajib Masuk ke 1 Tenant)')}
                </span>
              )}
            </div>
            <select
              value={role === 'superuser' ? '' : organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              disabled={role === 'superuser'}
              required={role !== 'superuser' && role !== 'admin'}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-medium disabled:opacity-60"
            >
              {role === 'superuser' ? (
                <option value="">{t('admin.all_tenants', 'Semua Tenant / Organisasi (Akses Global)')}</option>
              ) : role === 'admin' ? (
                <>
                  <option value="">{t('admin.all_tenants', 'Semua Tenant / Organisasi (Akses Global)')}</option>
                  {(organizations || []).map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.metadata?.brandName && org.metadata?.brandName !== org.name ? `(${org.metadata.brandName})` : ''}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  <option value="">-- {t('admin.select_tenant', 'Pilih Organisasi / Tenant')} --</option>
                  {(organizations || []).map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.metadata?.brandName && org.metadata?.brandName !== org.name ? `(${org.metadata.brandName})` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
            {role === 'superuser' ? (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                * Superuser secara otomatis memiliki akses sistem penuh ke seluruh tenant/organisasi.
              </p>
            ) : role === 'admin' ? (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                * Admin dapat mengelola semua tenant (Akses Global) atau dibatasi pada satu tenant terpilih.
              </p>
            ) : (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                * Role di bawah Superuser dan Admin harus masuk ke 1 tenant.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.pwd_init_label', 'Kata Sandi Awal (Opsional)')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kosongkan jika menggunakan Google Login SSO"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              {t('admin.pwd_init_hint', 'Jika diisi, user dapat langsung login dengan email dan kata sandi ini.')}
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.saving', 'Menyimpan...') : t('admin.btn_save_user', 'Simpan Pengguna')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Edit user modal
interface EditUserModalProps {
  user: ConsoleUser | null;
  teams?: ConsoleTeam[];
  organizations?: ConsoleOrganization[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userId: string, newRole: string, newDepartment?: string, organizationId?: string, newName?: string, newEmail?: string) => Promise<void>;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  teams,
  organizations,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const { departments: DEFAULT_DEPARTMENTS } = useDepartments();
  const [role, setRole] = useState(user?.role || 'editor');
  const [department, setDepartment] = useState(user?.department || '');
  const [organizationId, setOrganizationId] = useState(user?.organizationId || '');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (user) {
      setError('');
      setRole(user.role);
      setDepartment(user.department || '');
      setOrganizationId(user.organizationId || '');
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const deptOptions = Array.from(
    new Set([
      ...(teams && teams.length > 0 ? teams.map((tm) => tm.name) : DEFAULT_DEPARTMENTS),
      ...(user?.department ? [user.department] : []),
      ...(department ? [department] : []),
    ])
  ).filter(Boolean);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'superuser' && role !== 'admin' && !organizationId) {
      setError(t('admin.err_tenant_required', 'Peran di bawah Superuser dan Admin wajib masuk ke 1 organisasi/tenant.'));
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit(user.id, role, department, role === 'superuser' ? undefined : (organizationId || undefined), name, email);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_edit_user', 'Ubah Informasi & Hak Akses Pengguna')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('admin.col_name', 'Nama Lengkap')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium focus:ring-1 focus:ring-purple-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('admin.col_email', 'Alamat Email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium focus:ring-1 focus:ring-purple-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.select_new_role', 'Pilih Peran Baru (Role)')}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="superuser">Superuser</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('admin.select_tenant_label', 'Organisasi / Tenant')} {role !== 'superuser' && role !== 'admin' && <span className="text-red-500">*</span>}
              </label>
              {role !== 'superuser' && role !== 'admin' && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  {t('admin.must_one_tenant', '(Wajib Masuk ke 1 Tenant)')}
                </span>
              )}
            </div>
            <select
              value={role === 'superuser' ? '' : organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              disabled={role === 'superuser'}
              required={role !== 'superuser' && role !== 'admin'}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium disabled:opacity-60"
            >
              {role === 'superuser' ? (
                <option value="">{t('admin.all_tenants', 'Semua Tenant / Organisasi (Akses Global)')}</option>
              ) : role === 'admin' ? (
                <>
                  <option value="">{t('admin.all_tenants', 'Semua Tenant / Organisasi (Akses Global)')}</option>
                  {(organizations || []).map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.metadata?.brandName && org.metadata?.brandName !== org.name ? `(${org.metadata.brandName})` : ''}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  <option value="">-- {t('admin.select_tenant', 'Pilih Tenant / Organisasi')} --</option>
                  {(organizations || []).map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.metadata?.brandName && org.metadata?.brandName !== org.name ? `(${org.metadata.brandName})` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
            {role === 'superuser' ? (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                * Superuser secara otomatis memiliki akses ke semua tenant/organisasi.
              </p>
            ) : role === 'admin' ? (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                * Admin dapat mengelola semua tenant (Akses Global) atau dibatasi pada satu tenant terpilih.
              </p>
            ) : (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                * Role di bawah Superuser dan Admin harus masuk ke 1 tenant.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.tab_teams', 'Departmens / Tim')}
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
            >
              {deptOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.saving', 'Menyimpan...') : t('admin.btn_update_user', 'Perbarui Pengguna')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Reset password modal
interface ResetPasswordModalProps {
  user: ConsoleUser | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userId: string, newPass: string) => Promise<void>;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  user,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(t('admin.err_pwd_min', 'Kata sandi minimal 6 karakter.'));
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(user.id, password);
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.err_reset_pwd', 'Gagal mereset kata sandi'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_reset_pwd', 'Reset Kata Sandi Pengguna')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <div className="text-xs text-slate-500">{t('admin.target_user', 'Target Pengguna')}:</div>
            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{user.name}</div>
            <div className="text-[11px] text-slate-400">{user.email}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.new_pwd_label', 'Kata Sandi Baru')}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.saving', 'Menyimpan...') : t('admin.btn_update_pwd', 'Perbarui Kata Sandi')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Logo upload helper component
interface LogoUploadFieldProps {
  logo: string;
  name: string;
  onChange: (logo: string) => void;
  label?: string;
}

export const LogoUploadField: React.FC<LogoUploadFieldProps> = ({
  logo,
  name,
  onChange,
  label,
}) => {
  const { t } = useLanguage();
  const [isUrlMode, setIsUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState(logo || '');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fallbackLetter = (name.trim() || 'O').charAt(0).toUpperCase();

  const handleFileChange = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(t('admin.err_image_type', 'Harap pilih file gambar (PNG, JPG, SVG, WebP).'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert(t('admin.err_image_size', 'Ukuran file gambar maksimal 2MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange(result);
        setUrlInput(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemove = () => {
    onChange('');
    setUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyUrl = () => {
    onChange(urlInput.trim());
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          {label || t('admin.org_logo_label', 'Logo Organisasi / Workspace')}
        </label>
        <button
          type="button"
          onClick={() => setIsUrlMode(!isUrlMode)}
          className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <Link2 className="w-3 h-3" />
          {isUrlMode
            ? t('admin.logo_mode_upload', 'Unggah File Gambar')
            : t('admin.logo_mode_url', 'Gunakan URL Gambar')}
        </button>
      </div>

      <div className="flex items-start gap-3.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
        {/* Preview Container */}
        <div className="relative shrink-0 group">
          <div className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shadow-xs">
            {logo ? (
              <img
                src={logo}
                alt={name || 'Logo'}
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center">
                {fallbackLetter}
              </div>
            )}
          </div>
          {logo && (
            <button
              type="button"
              onClick={handleRemove}
              title={t('admin.btn_remove_logo', 'Hapus Logo')}
              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-md transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Input / Dropzone Area */}
        <div className="flex-1 min-w-0">
          {!isUrlMode ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 hover:bg-white dark:hover:bg-slate-900'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t('admin.logo_upload_cta', 'Pilih atau Tarik Logo')}</span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                PNG, JPG, SVG, WebP (Maks. 2MB)
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                >
                  {t('admin.btn_apply', 'Terapkan')}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {t('admin.logo_url_hint', 'Masukkan tautan gambar langsung (HTTPS).')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Create organization modal
interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; slug: string; logo?: string; tagline?: string; currency?: string }) => Promise<void>;
}

export const CreateOrganizationModal: React.FC<CreateOrgModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState('');
  const [tagline, setTagline] = useState('');
  const [currency, setCurrency] = useState('IDR');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 30)
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setError(t('admin.err_org_required', 'Nama dan slug organisasi wajib diisi.'));
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), slug: slug.trim().toLowerCase(), logo: logo.trim(), tagline, currency });
      setName('');
      setSlug('');
      setLogo('');
      setTagline('');
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.err_create_org', 'Gagal membuat organisasi'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_create_org', 'Buat Organisasi Enterprise Baru')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.org_name_label', 'Nama Resmi Organisasi / Entitas PT')}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Contoh: PT Fintek Digital Mandiri"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Logo Uploader */}
          <LogoUploadField
            logo={logo}
            name={name}
            onChange={setLogo}
          />

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.org_slug_label', 'Identifier Slug (Unik)')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                @
              </span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="fintek-mandiri"
                className="w-full pl-7 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {t('admin.org_slug_hint', 'Digunakan untuk pemetaan folder root dan tenant routing')}: <code className="font-mono text-emerald-600">/{slug}/[vendors]</code>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.org_currency_label', 'Mata Uang Utama')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="IDR">IDR (Rupiah)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="SGD">SGD (Singapore Dollar)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.org_tagline_label', 'Sifat Kerjasama')}
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Fintech & P2P Lending"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.creating', 'Membuat...') : t('admin.btn_create_org', 'Buat Organisasi')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Edit organization modal
interface EditOrganizationModalProps {
  isOpen: boolean;
  org: ConsoleOrganization | null;
  onClose: () => void;
  onSubmit: (orgId: string, data: { name: string; slug: string; logo?: string; metadata?: any }) => Promise<void>;
  onDelete?: (org: ConsoleOrganization) => void;
}

export const EditOrganizationModal: React.FC<EditOrganizationModalProps> = ({
  isOpen,
  org,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState('');
  const [currency, setCurrency] = useState('IDR');
  const [tagline, setTagline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (org) {
      setName(org.name || '');
      setSlug(org.slug || '');
      setLogo(org.logo && org.logo !== '/favicon.png' ? org.logo : '');
      setCurrency(org.metadata?.currency || 'IDR');
      setTagline(org.metadata?.tagline || '');
      setError(null);
    }
  }, [org]);

  if (!isOpen || !org) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('admin.org_err_name_required', 'Nama organisasi wajib diisi'));
      return;
    }
    if (!slug.trim()) {
      setError(t('admin.org_err_slug_required', 'Slug organisasi wajib diisi'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(org.id, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        logo: logo.trim() || '/favicon.png',
        metadata: {
          ...(org.metadata || {}),
          currency,
          tagline: tagline.trim(),
        },
      });
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.error_update_org', 'Gagal memperbarui organisasi'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <Pencil className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {t('admin.modal_edit_org_title', 'Edit Profil & Pengaturan Organisasi')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('admin.modal_edit_org_desc', 'Sesuaikan nama legal, slug, logo, dan metadata tenant')}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/40">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.org_name_label', 'Nama Resmi Organisasi / Entitas PT')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: PT Info Tekno Siaga"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Logo Uploader */}
          <LogoUploadField
            logo={logo}
            name={name}
            onChange={setLogo}
          />

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.org_slug_label', 'Identifier Slug (Unik)')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                @
              </span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="adapundi"
                className="w-full pl-7 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {t('admin.org_slug_hint', 'Pemetaan tenant routing')}: <code className="font-mono text-emerald-600 dark:text-emerald-400">/{slug || 'tenant'}/[vendors]</code>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.org_currency_label', 'Mata Uang Utama')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none"
              >
                <option value="IDR">IDR (Rupiah)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="SGD">SGD (Singapore Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.org_tagline_label', 'Sifat Kerjasama / Tagline')}
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Legal & Commercial Contract Management"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>ID Organisasi:</span>
              <code className="font-mono text-slate-700 dark:text-slate-300">{org.id}</code>
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>Folder Isolasi:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">/{name || org.name}/[Vendors]</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            {onDelete && org.slug !== 'adapundi' ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(org);
                }}
                className="px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('admin.btn_delete_org', 'Hapus Organisasi')}</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {t('admin.btn_cancel', 'Batal')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {isSubmitting ? t('admin.saving', 'Menyimpan...') : t('admin.btn_save_changes', 'Simpan Perubahan')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// Delete organization modal
interface DeleteOrganizationModalProps {
  isOpen: boolean;
  org: ConsoleOrganization | null;
  isActive: boolean;
  onClose: () => void;
  onConfirm: (org: ConsoleOrganization) => Promise<void>;
}

export const DeleteOrganizationModal: React.FC<DeleteOrganizationModalProps> = ({
  isOpen,
  org,
  isActive,
  onClose,
  onConfirm,
}) => {
  const { t } = useLanguage();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !org) return null;

  const isDefault = org.slug === 'adapundi';

  const handleDelete = async () => {
    if (isDefault || isActive) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(org);
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.toast.delete_org_failed', 'Gagal menghapus organisasi.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-700 dark:text-rose-400">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {t('admin.delete_org_title', 'Hapus Organisasi')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {org.name} (@{org.slug})
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/40">
              {error}
            </div>
          )}

          {isDefault ? (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>{t('admin.cant_delete_default_org', 'Organisasi default sistem tidak dapat dihapus.')}</strong>
                <p className="mt-1 text-[11px] opacity-90">
                  Organisasi utama ini bertindak sebagai anchor default untuk sistem dan tenant fallback.
                </p>
              </div>
            </div>
          ) : isActive ? (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>{t('admin.cant_delete_active_org', 'Beralih ke organisasi lain terlebih dahulu sebelum menghapus.')}</strong>
                <p className="mt-1 text-[11px] opacity-90">
                  Organisasi ini sedang digunakan pada sesi aktif saat ini. Beralihlah ke organisasi lain untuk dapat menghapusnya.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{t('admin.delete_org_confirm_msg', 'Apakah Anda yakin ingin menghapus organisasi ini secara permanen?')}</p>
                  <p className="mt-1 text-[11px] opacity-90">
                    {t('admin.delete_org_warning', 'Tindakan ini tidak dapat dibatalkan. Seluruh data tim, undangan, dan relasi pengguna dalam organisasi ini akan dihapus.')}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>Nama Organisasi:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{org.name}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>Slug Tenant:</span>
                  <code className="font-mono text-emerald-600 dark:text-emerald-400">@{org.slug}</code>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>ID:</span>
                  <code className="font-mono text-slate-600 dark:text-slate-400">{org.id}</code>
                </div>
              </div>
            </>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            {!isDefault && !isActive && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? t('admin.deleting', 'Menghapus...') : t('admin.btn_confirm_delete', 'Hapus Permanen')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Create team modal
interface CreateTeamModalProps {
  isOpen: boolean;
  activeOrg: ConsoleOrganization | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({
  isOpen,
  activeOrg,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmit(name.trim());
      setName('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan tim / departemen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_create_team', 'Buat Tim / Divisi Baru')}
            </h3>
          </div>
          <button type="button" onClick={() => { setErrorMsg(null); onClose(); }} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {errorMsg}
            </div>
          )}

          <div>
            <div className="text-xs text-slate-500">{t('admin.col_org', 'Organisasi')}:</div>
            <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
              {activeOrg?.name || t('admin.active_org_fallback', 'Organisasi Aktif')}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.team_name_label', 'Nama Tim / Divisi')}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => { setName(e.target.value); setErrorMsg(null); }}
              placeholder="Contoh: Procurement & Vendor Sourcing"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setErrorMsg(null); onClose(); }}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.creating', 'Membuat...') : t('admin.btn_create_team', 'Buat Tim')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Edit department / team modal
interface EditDepartmentModalProps {
  isOpen: boolean;
  team: ConsoleTeam | null;
  onClose: () => void;
  onSubmit: (teamId: string, name: string) => Promise<void>;
  onDelete?: (team: ConsoleTeam) => void;
}

export const EditDepartmentModal: React.FC<EditDepartmentModalProps> = ({
  isOpen,
  team,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (team) {
      setName(team.name || '');
      setErrorMsg(null);
    }
  }, [team]);

  if (!isOpen || !team) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmit(team.id, name.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan perubahan departemen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {t('admin.edit_department_title', 'Edit Tim / Departemen')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {team.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setErrorMsg(null); onClose(); }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.team_name_label', 'Nama Tim / Divisi')}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => { setName(e.target.value); setErrorMsg(null); }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>{t('admin.col_members', 'Jumlah Anggota')}:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{team.members.length}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>ID Tim:</span>
              <code className="font-mono text-slate-600 dark:text-slate-400">{team.id}</code>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(team);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('admin.btn_delete', 'Hapus')}</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setErrorMsg(null); onClose(); }}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {t('admin.btn_cancel', 'Batal')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? t('admin.saving', 'Menyimpan...') : t('admin.btn_save_changes', 'Simpan Perubahan')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// Delete department / team modal
interface DeleteDepartmentModalProps {
  isOpen: boolean;
  team: ConsoleTeam | null;
  onClose: () => void;
  onConfirm: (team: ConsoleTeam) => Promise<void>;
}

export const DeleteDepartmentModal: React.FC<DeleteDepartmentModalProps> = ({
  isOpen,
  team,
  onClose,
  onConfirm,
}) => {
  const { t } = useLanguage();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !team) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(team);
      onClose();
    } catch (err: any) {
      setError(err.message || t('admin.toast.delete_department_failed', 'Gagal menghapus departemen.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-700 dark:text-rose-400">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {t('admin.delete_department_title', 'Hapus Departemen / Tim')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {team.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/40">
              {error}
            </div>
          )}

          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t('admin.delete_department_confirm_msg', 'Apakah Anda yakin ingin menghapus departemen ini secara permanen?')}</p>
              <p className="mt-1 text-[11px] opacity-90">
                {t('admin.delete_department_warning', 'Tindakan ini tidak dapat dibatalkan. Seluruh anggota dalam departemen ini akan dilepaskan dari penugasan tim.')}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>{t('admin.team_name_label', 'Nama Departemen')}:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{team.name}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>{t('admin.department_members_count', 'Jumlah Anggota')}:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {team.members?.length || 0} {t('admin.team_members', 'Anggota')}
              </span>
            </div>
            {team.organizationName && (
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                <span>{t('admin.col_org', 'Organisasi')}:</span>
                <span className="text-slate-700 dark:text-slate-300">{team.organizationName}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>ID:</span>
              <code className="font-mono text-slate-600 dark:text-slate-400">{team.id}</code>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? t('admin.deleting', 'Menghapus...') : t('admin.btn_confirm_delete_department', 'Hapus Departemen')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Add team member modal
interface AddTeamMemberModalProps {
  team: ConsoleTeam | null;
  users: ConsoleUser[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (teamId: string, userId: string) => Promise<void>;
}

export const AddTeamMemberModal: React.FC<AddTeamMemberModalProps> = ({
  team,
  users,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !team) return null;

  // Filter out users already in team
  const availableUsers = users.filter(
    (u) => !team.members.some((m) => m.userId === u.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setIsSubmitting(true);
    try {
      await onSubmit(team.id, selectedUserId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_add_team_member', 'Tambah Anggota ke Tim')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <div className="text-xs text-slate-500">{t('admin.target_team', 'Tim Tujuan')}:</div>
            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{team.name}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.select_user', 'Pilih Pengguna')}
            </label>
            {availableUsers.length === 0 ? (
              <div className="text-xs text-slate-500 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                {t('admin.all_users_in_team', 'Semua pengguna yang terdaftar sudah tergabung dalam tim ini.')}
              </div>
            ) : (
              <select
                required
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="">{t('admin.select_user_ph', 'Pilih pengguna...')}</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) - {u.role.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedUserId}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.adding', 'Menambahkan...') : t('admin.btn_add', 'Tambahkan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Invite member modal
interface InviteMemberModalProps {
  isOpen: boolean;
  activeOrg: ConsoleOrganization | null;
  teams: ConsoleTeam[];
  onClose: () => void;
  onSubmit: (data: { email: string; role: string; teamId?: string }) => Promise<void>;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  activeOrg,
  teams,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [teamId, setTeamId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ email: email.trim().toLowerCase(), role, teamId: teamId || undefined });
      setEmail('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.modal_create_inv', 'Undang Anggota Organisasi')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pengiriman via Email (SMTP Relay)</span>
            </p>
            <p className="text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              Undangan akan dikirimkan langsung ke inbox email calon anggota menggunakan server SMTP yang terkonfigurasi.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.col_user_email', 'Email Rekan Kerja')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@adapundi.com"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.inv_col_role', 'Peran Diminta')}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="superuser">Superuser (System Level)</option>
              <option value="admin">Admin (Global Level)</option>
              <option value="manager">Manager (Group Approval)</option>
              <option value="editor">Editor (Group Draft & Upload)</option>
              <option value="viewer">Viewer (Read-Only Final)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('admin.team_optional_label', 'Divisi / Tim (Opsional)')}
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="">{t('admin.no_specific_team', 'Tanpa tim khusus')}</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('admin.btn_cancel', 'Batal')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('admin.sending', 'Mengirim...') : t('admin.btn_send_inv', 'Kirim Undangan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Generate API key modal
interface GenerateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; scopes: string[] }) => Promise<{ secret: string }>;
}

export const GenerateApiKeyModal: React.FC<GenerateApiKeyModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'contract:read',
    'partner:read',
  ]);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const availableScopes = [
    { id: 'contract:read', label: t('admin.scope_contract_read', 'Baca Data Kontrak') },
    { id: 'contract:write', label: t('admin.scope_contract_write', 'Buat & Edit Kontrak') },
    { id: 'partner:read', label: t('admin.scope_partner_read', 'Baca Direktori Mitra/Vendor') },
    { id: 'partner:write', label: t('admin.scope_partner_write', 'Kelola Profil & DD Vendor') },
    { id: 'report:read', label: t('admin.scope_report_read', 'Ekspor Laporan Keuangan') },
  ];

  const handleToggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await onSubmit({ name: name.trim(), scopes: selectedScopes });
      setGeneratedSecret(res.secret);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (generatedSecret) {
      navigator.clipboard.writeText(generatedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFinish = () => {
    setGeneratedSecret(null);
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {generatedSecret
                ? t('admin.key_generated_success', 'API Key Berhasil Dibuat')
                : t('admin.modal_gen_key', 'Generate API Key Baru')}
            </h3>
          </div>
          <button type="button" onClick={handleFinish} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {generatedSecret ? (
          <div className="p-5 space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>{t('admin.key_save_now', 'Simpan kunci ini sekarang!')}</strong> {t('admin.key_copy_warn', 'Kunci rahasia ini hanya ditampilkan sekali demi keamanan.')}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.api_secret_label', 'API Secret Key')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedSecret}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('admin.copied', 'Tersalin') : t('admin.copy', 'Salin')}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleFinish}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                {t('admin.done', 'Selesai')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('admin.api_name_label', 'Nama Kunci / Sistem Pengguna')}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: ERP SAP Integration / Bot Webhook"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('admin.api_col_scopes', 'Cakupan Izin (Permission Scopes)')}
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {availableScopes.map((scope) => (
                  <label
                    key={scope.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope.id)}
                      onChange={() => handleToggleScope(scope.id)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                        {scope.id}
                      </div>
                      <div className="text-[10px] text-slate-400">{scope.label}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleFinish}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t('admin.btn_cancel', 'Batal')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || selectedScopes.length === 0}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {isSubmitting ? t('admin.creating', 'Membuat...') : t('admin.api_generate_btn', 'Generate Kunci')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// Instances config viewer modal
interface InstancesConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstancesConfigModal: React.FC<InstancesConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const codeSnippet = `// instances.config.ts (Project Root)
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";

const sqliteDb = new Database("./auth.db");

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "console-production-secret",
  database: sqliteDb,
  plugins: [
    admin({ defaultRole: "staff" }),
    organization({
      teams: { enabled: true, maximumTeams: 20 },
      ac: { /* RBAC Policies for legal, finance, admin */ },
    }),
  ],
});

export default [
  {
    id: "production",
    name: "Production (Adapundi Enterprise)",
    env: "production",
    auth,
  },
];`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {t('admin.instances_config_title', 'Better Auth Console Instances Configuration')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {t(
              'admin.instances_config_desc',
              'Konsol administrasi terhubung langsung ke file konfigurasi resmi instances.config.ts sesuai dokumentasi resmi Better Auth Console.'
            )}
          </p>

          <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 overflow-x-auto">
            <pre className="text-xs font-mono text-slate-200 leading-relaxed">
              <code>{codeSnippet}</code>
            </pre>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {t('admin.close', 'Tutup')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

