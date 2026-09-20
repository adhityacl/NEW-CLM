/**
 * Helper permission sisi klien (PRD §20–§22).
 *
 * Cerminan `server/rbac.ts` — dipakai HANYA untuk visibilitas UI.
 * Backend tetap otoritatif (PRD §22, §28, §32).
 */
import { createContext, useContext, type ReactNode } from 'react';

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
    'tenant.view'],
  manager: ['user.view', 'user.create', 'user.edit', 'user.invite', 'user.role.assign', 'user.status.update',
    'document.view', 'document.create', 'document.edit', 'document.delete', 'document.export',
    'document.download', 'department.view', 'export.csv', 'export.document', 'admin.access', 'admin.user.manage'],
  editor: ['document.view', 'document.create', 'document.edit',
    ...(EDITOR_CAN_DELETE_DOCUMENT ? ['document.delete'] : []), 'document.download'],
  viewer: ['document.view'],
};

export interface PermissionContextValue {
  role: RoleCode;
  permissions: string[];
  tenantId?: string | null;
  departmentId?: string | null;
}

export const PermissionContext = createContext<PermissionContextValue>({
  role: 'viewer', permissions: BOOTSTRAP_ROLE_PERMISSIONS.viewer as string[],
});

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
