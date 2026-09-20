/**
 * RBAC Engine - implementasi tunggal sesuai
 * "Engineering PRD - RBAC Structure & Authorization" (v1.0).
 *
 * Prinsip PRD:
 *   ROLE ? AUTHORIZATION
 *   AUTHORIZATION = ROLE + PERMISSION + TENANT SCOPE + DEPARTMENT SCOPE + RESOURCE SCOPE
 *
 * Modul ini SENGAJA bebas-dependensi (tanpa import dari app) agar dapat diuji
 * secara terisolasi (lihat tests/rbac.test.ts).
 */

/* ------------------------------------------------------------------ */
/* 1. Peran & hierarki (PRD �3)                                        */
/* ------------------------------------------------------------------ */

export type RoleCode = 'superuser' | 'admin' | 'manager' | 'editor' | 'viewer';

/** Lower numeric level = higher authority (PRD �3.1). */
export const ROLE_LEVEL: Record<RoleCode, number> = {
  superuser: 1,
  admin: 2,
  manager: 3,
  editor: 4,
  viewer: 5,
};

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  level: number;
  scope: 'Global' | 'Tenant' | 'Tenant + Department';
  description: string;
}

/** Seed resmi (PRD �7 Seed Data). */
export const ROLES: RoleDefinition[] = [
  { code: 'superuser', name: 'Superuser', level: 1, scope: 'Global', description: 'Global owner with access to all tenants' },
  { code: 'admin', name: 'Admin', level: 2, scope: 'Tenant', description: 'Tenant administrator' },
  { code: 'manager', name: 'Manager', level: 3, scope: 'Tenant + Department', description: 'Department-level supervisor' },
  { code: 'editor', name: 'Editor', level: 4, scope: 'Tenant + Department', description: 'Operational user with write access' },
  { code: 'viewer', name: 'Viewer', level: 5, scope: 'Tenant + Department', description: 'Read-only user' },
];

/** Pemetaan role legacy ? role standar (menjaga kompatibilitas data lama). */
export const LEGACY_ROLE_MAP: Record<string, RoleCode> = {
  owner: 'superuser',
  'super admin': 'superuser',
  super_admin: 'superuser',
  legal: 'manager',
  finance: 'editor',
  staff: 'viewer',
  member: 'viewer',
};

/** Normalisasi role apa pun ke RoleCode standar. Default aman = `viewer` (deny by default). */
export function normalizeRole(role?: string | null): RoleCode {
  const r = (role ?? '').toString().toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (r in ROLE_LEVEL) return r as RoleCode;
  const spaced = (role ?? '').toString().toLowerCase().trim();
  if (spaced in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[spaced];
  if (r in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[r];
  return 'viewer';
}

/* ------------------------------------------------------------------ */
/* 2. Katalog permission (PRD �9-�10)                                  */
/* ------------------------------------------------------------------ */

export interface PermissionDefinition {
  code: string;
  resource: string;
  action: string;
  description: string;
}

function def(code: string, description = ''): PermissionDefinition {
  const [resource, action] = code.split('.');
  return { code, resource, action, description };
}

/** Permission code mengikuti konvensi `<resource>.<action>` (PRD �9). */
export const PERMISSIONS: PermissionDefinition[] = [
  // User Management (PRD �10)
  def('user.view'), def('user.create'), def('user.edit'), def('user.delete'),
  def('user.invite'), def('user.role.assign'), def('user.status.update'),
  // Document Management
  def('document.view'), def('document.create'), def('document.edit'),
  def('document.delete'), def('document.export'), def('document.download'),
  // Tenant Management
  def('tenant.view'), def('tenant.create'), def('tenant.edit'), def('tenant.delete'),
  // Department Management
  def('department.view'), def('department.create'), def('department.edit'), def('department.delete'),
  // Workspace
  def('workspace.view'), def('workspace.switch'),
  // Export
  def('export.csv'), def('export.document'),
  // Administration
  def('admin.access'), def('admin.user.manage'), def('admin.role.manage'),
  def('admin.tenant.manage'), def('admin.department.manage'), def('admin.configuration.manage'),
  // Audit (PRD �27)
  def('audit.view'),
];

export const PERMISSION_CODES: string[] = PERMISSIONS.map((p) => p.code);

export type PermissionCode = string;

/* ------------------------------------------------------------------ */
/* 3. Pemetaan role ? permission (PRD �12 & �33)                       */
/* ------------------------------------------------------------------ */

/**
 * `'*'` = seluruh permission (SUPERUSER, PRD �12 "ALL PERMISSIONS").
 *
 * Catatan keputusan terbuka PRD �34.2: `document.delete` untuk EDITOR
 * tertulis TBD di �18/�21 tetapi DIPEROLEH di �12/�33. Default di sini
 * mengikuti �33 (diberikan) dan dapat dimatikan lewat EDITOR_CAN_DELETE_DOCUMENT.
 */
export const EDITOR_CAN_DELETE_DOCUMENT = true;

export const ROLE_PERMISSIONS: Record<RoleCode, '*' | string[]> = {
  superuser: '*',

  admin: [
    'user.view', 'user.create', 'user.edit', 'user.delete', 'user.invite',
    'user.role.assign', 'user.status.update',
    'document.view', 'document.create', 'document.edit', 'document.delete',
    'document.export', 'document.download',
    'department.view', 'department.create', 'department.edit',
    'export.csv', 'export.document',
    'admin.access', 'admin.user.manage', 'admin.department.manage',
    'tenant.view',
  ],

  manager: [
    'user.view', 'user.create', 'user.edit', 'user.invite',
    'user.role.assign', 'user.status.update',
    'document.view', 'document.create', 'document.edit', 'document.delete',
    'document.export', 'document.download',
    'department.view',
    'export.csv', 'export.document',
    'admin.access', 'admin.user.manage',
  ],

  editor: [
    'document.view', 'document.create', 'document.edit',
    ...(EDITOR_CAN_DELETE_DOCUMENT ? ['document.delete'] : []),
    'document.download',
  ],

  viewer: ['document.view'],
};

/** Permission yang secara eksplisit DILARANG meski ada di daftar lain (PRD �12). */
export const ROLE_DENYLIST: Record<RoleCode, string[]> = {
  superuser: [],
  admin: ['workspace.switch', 'tenant.create', 'tenant.delete', 'admin.configuration.manage'],
  manager: ['workspace.switch', 'tenant.create', 'tenant.delete', 'admin.role.manage',
    'admin.department.manage', 'admin.configuration.manage', 'user.delete'],
  editor: ['user.invite', 'user.role.assign', 'user.delete', 'admin.access',
    'export.csv', 'export.document', 'workspace.switch', 'audit.view'],
  viewer: ['document.create', 'document.edit', 'document.delete', 'document.export',
    'document.download', 'user.invite', 'admin.access', 'export.csv', 'export.document',
    'workspace.switch', 'audit.view'],
};

/** Daftar permission efektif untuk sebuah role (deny-by-default + denylist). */
export function permissionsFor(role: RoleCode): string[] {
  const base = ROLE_PERMISSIONS[role];
  const deny = new Set(ROLE_DENYLIST[role]);
  const list = base === '*' ? PERMISSION_CODES.slice() : base.slice();
  return list.filter((p) => !deny.has(p));
}

/* ------------------------------------------------------------------ */
/* 4. Pemeriksaan permission (PRD �4, �32)                             */
/* ------------------------------------------------------------------ */

export function hasPermission(role: RoleCode | string, permission: PermissionCode): boolean {
  const r = normalizeRole(typeof role === 'string' ? role : role);
  const deny = new Set(ROLE_DENYLIST[r]);
  if (deny.has(permission)) return false; // deny selalu menang
  const base = ROLE_PERMISSIONS[r];
  if (base === '*') return true;
  return base.includes(permission);
}

/* ------------------------------------------------------------------ */
/* 5. Scope tenant & department (PRD �14, �19, �24-�25)                */
/* ------------------------------------------------------------------ */

export interface Actor {
  id: string;
  role: RoleCode | string;
  tenantId?: string | null;
  departmentId?: string | null;
}

export interface ScopedResource {
  tenantId?: string | null;
  departmentId?: string | null;
  ownerId?: string | null;
}

export type ScopeKind = 'global' | 'tenant' | 'department';

export const isGlobalRole = (role: RoleCode | string): boolean => normalizeRole(role) === 'superuser';

/** Validasi constraint kolom sesuai PRD �6.1. */
export function validateActorScope(actor: Actor): { ok: boolean; errors: string[] } {
  const role = normalizeRole(actor.role);
  const errors: string[] = [];
  const tenant = actor.tenantId ?? null;
  const dept = actor.departmentId ?? null;
  switch (role) {
    case 'superuser':
      break; // tenant NULL / global
    case 'admin':
      if (!tenant) errors.push('ADMIN wajib punya tenantId');
      if (dept) errors.push('ADMIN tidak boleh punya departmentId');
      break;
    default: // manager/editor/viewer
      if (!tenant) errors.push(`${role.toUpperCase()} wajib punya tenantId`);
      if (!dept) errors.push(`${role.toUpperCase()} wajib punya departmentId`);
  }
  return { ok: errors.length === 0, errors };
}

export type ScopeResult =
  | { allowed: true }
  | { allowed: false; error: 'TENANT_SCOPE_VIOLATION' | 'DEPARTMENT_SCOPE_VIOLATION' | 'RESOURCE_SCOPE_VIOLATION' };

/** Scope maksimum yang boleh dinikmati sebuah peran (PRD �3.1 scope). */
export function maxScopeFor(role: RoleCode | string): ScopeKind {
  const r = normalizeRole(role);
  if (r === 'superuser') return 'global';
  if (r === 'admin') return 'tenant';
  return 'department';
}

const SCOPE_WIDTH: Record<ScopeKind, number> = { department: 0, tenant: 1, global: 2 };

/**
 * Mengecilkan scope yang diminta pemanggil agar tidak melebihi scope perannya.
 * PRD �4/�25: scope TIDAK boleh ditentukan pemanggil. Meminta yang lebih lebar
 * akan dipersempit otomatis (mis. editor minta 'tenant' ? menjadi 'department').
 */
export function clampScope(role: RoleCode | string, requested: ScopeKind): ScopeKind {
  const max = maxScopeFor(role);
  return SCOPE_WIDTH[requested] <= SCOPE_WIDTH[max] ? requested : max;
}

/**
 * Inti aturan scope (PRD �19 canEditDocument + �24 + �25 + �32.4 "Scope Is Mandatory").
 *
 * Fail-closed: untuk peran ber-scope departemen, resource tanpa `departmentId`
 * DITOLAK (bukan diloloskan). Pemanggil tidak dapat memperlebar scope.
 */
export function checkScope(actor: Actor, resource: ScopedResource, scope: ScopeKind = 'department'): ScopeResult {
  const role = normalizeRole(actor.role);

  if (role === 'superuser') return { allowed: true };

  const eff = clampScope(role, scope);

  if (resource.tenantId && resource.tenantId !== actor.tenantId) {
    return { allowed: false, error: 'TENANT_SCOPE_VIOLATION' };
  }

  // ADMIN: seluruh departemen di dalam tenant-nya.
  if (role === 'admin') {
    if (eff === 'global') return { allowed: false, error: 'TENANT_SCOPE_VIOLATION' };
    return { allowed: true };
  }

  // MANAGER / EDITOR / VIEWER: wajib departemennya sendiri (fail-closed).
  if (resource.departmentId == null) {
    return { allowed: false, error: 'DEPARTMENT_SCOPE_VIOLATION' };
  }
  if (resource.departmentId !== actor.departmentId) {
    return { allowed: false, error: 'DEPARTMENT_SCOPE_VIOLATION' };
  }
  return { allowed: true };
}

/**
 * Filter scope yang HARUS diterapkan ke query (PRD �24).
 * `tenantId: null` HANYA bermakna "tanpa filter" untuk SUPERUSER.
 * Untuk peran lain tanpa tenantId ? melempar (fail-closed), bukan mengembalikan
 * null yang bisa disalahartikan konsumen query sebagai "tanpa filter".
 */
export function buildScopeFilter(actor: Actor, scope: ScopeKind = 'department'):
  { tenantId: string | null; departmentId: string | null } {
  const role = normalizeRole(actor.role);
  if (role === 'superuser') return { tenantId: null, departmentId: null };
  if (!actor.tenantId) throw new Error('RBAC: actor non-superuser tanpa tenantId (scope wajib).');
  const eff = clampScope(role, scope);
  if (role === 'admin') return { tenantId: actor.tenantId, departmentId: null };
  if (!actor.departmentId) throw new Error('RBAC: actor ber-scope departemen tanpa departmentId.');
  return { tenantId: actor.tenantId, departmentId: eff === 'department' ? actor.departmentId : null };
}

/** PRD �25 - scope dari client TIDAK boleh dipercaya untuk non-superuser. */
export function resolveTrustedScope(actor: Actor, clientSupplied?: Partial<ScopedResource>): ScopedResource {
  const role = normalizeRole(actor.role);
  if (role === 'superuser') {
    return { tenantId: clientSupplied?.tenantId ?? null, departmentId: clientSupplied?.departmentId ?? null };
  }
  if (role === 'admin') {
    return { tenantId: actor.tenantId ?? null, departmentId: clientSupplied?.departmentId ?? null };
  }
  return { tenantId: actor.tenantId ?? null, departmentId: actor.departmentId ?? null };
}

/* ------------------------------------------------------------------ */
/* 6. Invitation hierarchy (PRD �13-�14)                               */
/* ------------------------------------------------------------------ */

export type InviteDeny = 'INSUFFICIENT_PERMISSION' | 'INVALID_ROLE_ASSIGNMENT'
  | 'TENANT_SCOPE_VIOLATION' | 'DEPARTMENT_SCOPE_VIOLATION';

export function canInvite(
  actor: Actor,
  targetRole: RoleCode | string,
  target?: { tenantId?: string | null; departmentId?: string | null },
): { allowed: true } | { allowed: false; error: InviteDeny } {
  const actorRole = normalizeRole(actor.role);
  const tRole = normalizeRole(targetRole);

  if (!hasPermission(actorRole, 'user.invite')) {
    return { allowed: false, error: 'INSUFFICIENT_PERMISSION' };
  }
  // hierarki: target harus level lebih rendah (angka lebih besar)
  if (ROLE_LEVEL[tRole] <= ROLE_LEVEL[actorRole]) {
    return { allowed: false, error: 'INVALID_ROLE_ASSIGNMENT' };
  }

  if (actorRole === 'superuser') return { allowed: true };

  // sama tenant untuk semua di bawah superuser (fail-closed bila tak diketahui)
  if (target?.tenantId == null || target.tenantId !== actor.tenantId) {
    return { allowed: false, error: 'TENANT_SCOPE_VIOLATION' };
  }
  if (actorRole === 'admin') return { allowed: true };

  // MANAGER: hanya departemennya sendiri (fail-closed)
  if (target?.departmentId == null || target.departmentId !== actor.departmentId) {
    return { allowed: false, error: 'DEPARTMENT_SCOPE_VIOLATION' };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* 7. Perubahan role (PRD �26)                                         */
/* ------------------------------------------------------------------ */

export type RoleChangeDeny = InviteDeny | 'SELF_ROLE_CHANGE_FORBIDDEN';

export function canChangeRole(
  actor: Actor,
  targetUser: { id: string; tenantId?: string | null; departmentId?: string | null },
  newRole: RoleCode | string,
): { allowed: true } | { allowed: false; error: RoleChangeDeny } {
  const actorRole = normalizeRole(actor.role);
  const nRole = normalizeRole(newRole);

  if (targetUser.id === actor.id) return { allowed: false, error: 'SELF_ROLE_CHANGE_FORBIDDEN' };

  if (actorRole === 'superuser') return { allowed: true };

  if (!hasPermission(actorRole, 'user.role.assign')) {
    return { allowed: false, error: 'INSUFFICIENT_PERMISSION' };
  }
  if (ROLE_LEVEL[nRole] <= ROLE_LEVEL[actorRole]) {
    return { allowed: false, error: 'INVALID_ROLE_ASSIGNMENT' };
  }
  if (targetUser.tenantId == null || targetUser.tenantId !== actor.tenantId) {
    return { allowed: false, error: 'TENANT_SCOPE_VIOLATION' };
  }
  if (actorRole === 'manager' && (targetUser.departmentId == null || targetUser.departmentId !== actor.departmentId)) {
    return { allowed: false, error: 'DEPARTMENT_SCOPE_VIOLATION' };
  }
  return { allowed: true };
}

/**
 * Daftar role yang boleh di-assign oleh actor (untuk dropdown UI).
 * Aturan tunggal PRD �3.1: hanya role dengan level LEBIH BESAR (otoritas lebih rendah).
 * Berlaku juga untuk SUPERUSER - target tetap harus `target_level > actor_level`.
 */
export function assignableRoles(actor: Actor): RoleCode[] {
  const actorRole = normalizeRole(actor.role);
  const canAssign = actorRole === 'superuser'
    || hasPermission(actorRole, 'user.invite')
    || hasPermission(actorRole, 'user.role.assign');
  if (!canAssign) return [];
  return (Object.keys(ROLE_LEVEL) as RoleCode[]).filter((r) => ROLE_LEVEL[r] > ROLE_LEVEL[actorRole]);
}

/* ------------------------------------------------------------------ */
/* 8. Audit log (PRD �27)                                              */
/* ------------------------------------------------------------------ */

export const AUDITABLE_ACTIONS = [
  'user.invite', 'user.create', 'user.edit', 'user.delete', 'user.role.assign',
  'user.status.update', 'tenant.create', 'tenant.edit', 'tenant.delete',
  'department.create', 'department.edit', 'department.delete', 'workspace.switch',
  'document.create', 'document.edit', 'document.delete', 'document.export',
] as const;

export type AuditableAction = (typeof AUDITABLE_ACTIONS)[number] | string;

export interface AuditEvent {
  actorId: string;
  action: AuditableAction;
  targetType: 'USER' | 'TENANT' | 'DEPARTMENT' | 'DOCUMENT' | 'WORKSPACE' | 'SESSION';
  targetId: string;
  tenantId?: string | null;
  departmentId?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: string;
  /** Diisi bila aksi dilakukan di dalam sesi impersonasi (PRD �27 + acceptance "impersonation-audit-trail"). */
  impersonatedBy?: string | null;
}

export function buildAuditEvent(
  actor: Actor,
  action: AuditableAction,
  targetType: AuditEvent['targetType'],
  targetId: string,
  metadata?: Record<string, unknown>,
  impersonatedBy?: string | null,
): AuditEvent {
  return {
    actorId: actor.id,
    action,
    targetType,
    targetId,
    tenantId: actor.tenantId ?? null,
    departmentId: actor.departmentId ?? null,
    metadata: metadata ?? {},
    timestamp: new Date().toISOString(),
    impersonatedBy: impersonatedBy ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* 9. Error standar (PRD �29)                                          */
/* ------------------------------------------------------------------ */

export interface AuthzError {
  status: 401 | 403 | 404;
  error: string;
  message: string;
}

export const AUTHZ_ERRORS: Record<string, AuthzError> = {
  UNAUTHENTICATED: { status: 401, error: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  INSUFFICIENT_PERMISSION: { status: 403, error: 'INSUFFICIENT_PERMISSION', message: 'You do not have permission to perform this action.' },
  INVALID_ROLE_ASSIGNMENT: { status: 403, error: 'INVALID_ROLE_ASSIGNMENT', message: 'You cannot assign a role equal to or higher than your own.' },
  TENANT_SCOPE_VIOLATION: { status: 403, error: 'TENANT_SCOPE_VIOLATION', message: 'The resource is outside your assigned tenant.' },
  DEPARTMENT_SCOPE_VIOLATION: { status: 403, error: 'DEPARTMENT_SCOPE_VIOLATION', message: 'The resource is outside your assigned department.' },
  RESOURCE_SCOPE_VIOLATION: { status: 403, error: 'RESOURCE_SCOPE_VIOLATION', message: 'The resource is outside your permitted scope.' },
  RESOURCE_NOT_FOUND: { status: 404, error: 'RESOURCE_NOT_FOUND', message: 'Resource not found.' },
  SELF_ROLE_CHANGE_FORBIDDEN: { status: 403, error: 'INVALID_ROLE_ASSIGNMENT', message: 'You cannot change your own role.' },
};

export function authzError(code: keyof typeof AUTHZ_ERRORS | string): AuthzError {
  return AUTHZ_ERRORS[code] ?? AUTHZ_ERRORS.INSUFFICIENT_PERMISSION;
}

/* ------------------------------------------------------------------ */
/* 10. Keputusan otorisasi terpadu (PRD �4)                            */
/* ------------------------------------------------------------------ */

export type Decision =
  | { allow: true }
  | { allow: false; error: AuthzError };

export interface AuthorizeInput {
  actor: Actor | null;
  permission: PermissionCode;
  resource?: ScopedResource;
  scope?: ScopeKind;
}

/** Can User U perform Action A on Resource R? (PRD �4) */
export function decide({ actor, permission, resource, scope = 'department' }: AuthorizeInput): Decision {
  if (!actor) return { allow: false, error: authzError('UNAUTHENTICATED') };

  if (!hasPermission(actor.role, permission)) {
    return { allow: false, error: authzError('INSUFFICIENT_PERMISSION') };
  }

  if (!resource) return { allow: true };

  const scoped = checkScope(actor, resource, scope);
  if (!scoped.allowed) return { allow: false, error: authzError(scoped.error) };

  return { allow: true };
}

/* ------------------------------------------------------------------ */
/* 11. Matriks (untuk endpoint /api/rbac/matrix & dokumen)             */
/* ------------------------------------------------------------------ */

export function buildMatrix(): {
  roles: RoleDefinition[];
  permissions: PermissionDefinition[];
  matrix: Record<RoleCode, string[]>;
} {
  const matrix = {} as Record<RoleCode, string[]>;
  for (const r of ROLES) matrix[r.code] = permissionsFor(r.code);
  return { roles: ROLES, permissions: PERMISSIONS, matrix };
}

/** Ringkasan aturan hierarki untuk dokumen/QC. */
export function describeHierarchyRules(): string[] {
  return [
    'Lower numeric level = higher authority (superuser(1) > admin(2) > manager(3) > editor(4) > viewer(5)).',
    'Actor hanya boleh mengundang/mengangkat role dengan level LEBIH BESAR (lebih rendah otoritasnya).',
    'Hanya SUPERUSER boleh workspace.switch dan tenant.create/delete.',
    'ADMIN: seluruh departemen dalam tenant-nya; tidak boleh lintas tenant.',
    'MANAGER/EDITOR/VIEWER: hanya departemennya sendiri.',
    'Deny by default: permission yang tidak diberikan eksplisit = DITOLAK.',
  ];
}
