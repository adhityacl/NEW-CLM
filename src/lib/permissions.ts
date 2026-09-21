/**
 * Helper permission sisi klien (PRD §20–§22).
 *
 * Cerminan `server/rbac.ts` — dipakai HANYA untuk visibilitas UI.
 * Backend tetap otoritatif (PRD §22, §28, §32).
 */
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

export type RoleCode = 'superuser' | 'admin' | 'manager' | 'editor' | 'viewer';

export const ROLE_LEVEL: Record<RoleCode, number> = {
  superuser: 1, admin: 2, manager: 3, editor: 4, viewer: 5,
};

const LEGACY: Record<string, RoleCode> = {
  owner: 'superuser', 'super admin': 'superuser', super_admin: 'superuser',
  legal: 'manager', finance: 'editor', staff: 'viewer', member: 'viewer',
};

export function normalizeRole(role?: string | null, fallback: RoleCode = 'viewer'): RoleCode {
  const raw = (role ?? '').toString().toLowerCase().trim();
  const key = raw.replace(/[\s-]+/g, '_');
  if (key in ROLE_LEVEL) return key as RoleCode;
  if (raw in LEGACY) return LEGACY[raw];
  if (key in LEGACY) return LEGACY[key];
  return fallback;
}

/**
 * Matriks BOOTSTRAP minimal sisi klien.
 *
 * ⚠️ PRD §20 melarang frontend menghardcode logika otorisasi yang kompleks.
 * Nilai di sini HANYA untuk render pertama sebelum `GET /api/rbac/me` menjawab.
 * Sumber kebenaran tetap server; setelah respons `/api/rbac/me` masuk,
 * `permissionValueFromMe()` memakai daftar permission dari server.
 */
export const EDITOR_CAN_DELETE_DOCUMENT = true;

export const BOOTSTRAP_ROLE_PERMISSIONS: Record<RoleCode, '*' | string[]> = {
  superuser: '*',
  admin: ['user.view', 'user.create', 'user.edit', 'user.delete', 'user.invite', 'user.role.assign',
    'user.status.update', 'document.view', 'document.create', 'document.edit', 'document.delete',
    'document.export', 'document.download', 'department.view', 'department.create', 'department.edit',
    'export.csv', 'export.document', 'admin.access', 'admin.user.manage', 'admin.department.manage',
    'tenant.view', 'workspace.view'],
  manager: ['user.view', 'user.create', 'user.edit', 'user.invite', 'user.role.assign', 'user.status.update',
    'document.view', 'document.create', 'document.edit', 'document.delete', 'document.export',
    'workspace.view',
    'document.download', 'department.view', 'export.csv', 'export.document', 'admin.access', 'admin.user.manage'],
  editor: ['document.view', 'document.create', 'document.edit', 'workspace.view',
    ...(EDITOR_CAN_DELETE_DOCUMENT ? ['document.delete'] : []), 'document.download'],
  viewer: ['document.view', 'workspace.view'],
};

export interface PermissionContextValue {
  role: RoleCode;
  permissions: string[];
  tenantId?: string | null;
  departmentId?: string | null;
  loading: boolean;
}

export const PermissionContext = createContext<PermissionContextValue>({
  role: 'viewer', permissions: BOOTSTRAP_ROLE_PERMISSIONS.viewer as string[], loading: true,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizationRevision, setOrganizationRevision] = useState(0);
  const [value, setValue] = useState<PermissionContextValue>(() =>
    ({ ...permissionValueFromMe(null, user?.role), loading: true }),
  );

  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_session_token') : null;
    const activeOrganizationId = typeof window !== 'undefined'
      ? localStorage.getItem('activeOrganizationId')
      : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers['x-session-token'] = token;
    }
    if (activeOrganizationId) {
      headers['x-organization-id'] = activeOrganizationId;
      headers['x-tenant-id'] = activeOrganizationId;
    }

    if (!user || !token) {
      setValue({ ...permissionValueFromMe(null, user?.role), loading: false });
      return () => {
        cancelled = true;
      };
    }

    setValue((previous) => ({ ...previous, loading: true }));
    fetch('/api/rbac/me', {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((me) => {
        if (!cancelled) setValue({ ...permissionValueFromMe(me, user.role), loading: false });
      })
      .catch(() => {
        if (!cancelled) setValue({ ...permissionValueFromMe(null, user.role), loading: false });
      });

    const refreshForOrganization = () => {
      if (!cancelled) setOrganizationRevision((revision) => revision + 1);
    };
    window.addEventListener('organization-updated', refreshForOrganization);

    return () => {
      cancelled = true;
      window.removeEventListener('organization-updated', refreshForOrganization);
    };
  }, [user, organizationRevision]);

  return createElement(PermissionContext.Provider, { value }, children);
}

/** Menghasilkan nilai context dari respons `GET /api/rbac/me`. */
export function permissionValueFromMe(me: {
  actor?: { role?: string; tenantId?: string | null; departmentId?: string | null };
  permissions?: string[];
} | null, fallbackRole?: string | null): PermissionContextValue {
  const role = normalizeRole(me?.actor?.role ?? fallbackRole);
  const permissions = me?.permissions?.length
    ? me.permissions
    : (BOOTSTRAP_ROLE_PERMISSIONS[role] === '*' ? ['*'] : (BOOTSTRAP_ROLE_PERMISSIONS[role] as string[]));
  return {
    role,
    permissions,
    tenantId: me?.actor?.tenantId ?? null,
    departmentId: me?.actor?.departmentId ?? null,
    loading: false,
  };
}

/** PRD §20 — `hasPermission("document.edit")`. */
export function hasPermission(permission: string): boolean {
  const ctx = useContext(PermissionContext);
  return ctx.permissions.includes('*') || ctx.permissions.includes(permission);
}

/** PRD §20 alternatif — `can("document","edit")`. */
export function can(resource: string, action: string): boolean {
  return hasPermission(`${resource}.${action}`);
}

export function usePermissions(): PermissionContextValue & {
  hasPermission: (p: string) => boolean;
  can: (r: string, a: string) => boolean;
} {
  const ctx = useContext(PermissionContext);
  const has = (p: string) => ctx.permissions.includes('*') || ctx.permissions.includes(p);
  return { ...ctx, hasPermission: has, can: (r, a) => has(`${r}.${a}`) };
}

/**
 * PRD §22 — wrapper visibilitas.
 *   <Can permission="user.invite"><InviteUserButton /></Can>
 * Hanya mengatur tampilan; TIDAK menggantikan otorisasi backend.
 */
export function Can({
  permission, anyOf, fallback = null, children,
}: {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const ctx = useContext(PermissionContext);
  const all = ctx.permissions.includes('*');
  const allowed = all
    || (permission ? ctx.permissions.includes(permission) : false)
    || (anyOf ? anyOf.some((p) => ctx.permissions.includes(p)) : false);
  return allowed ? (children as any) : (fallback as any);
}

/** PRD §23 — proteksi route berbasis permission. */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/documents': 'document.view',
  '/admin': 'admin.access',
  '/admin/users': 'user.view',
  '/admin/rbac': 'admin.access',
};
