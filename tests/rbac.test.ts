/**
 * Suite pengujian otorisasi RBAC — memetakan langsung ke
 * "Engineering PRD — RBAC Structure & Authorization" §30 (QA Test Matrix),
 * §13 (invitation), §26 (role change), §29 (errors), §32 (prinsip).
 *
 * Jalankan:  npx tsx --test tests/rbac.test.ts
 *         (atau) node --import tsx --test tests/rbac.test.ts
 *
 * Test ini GAGAL bila matriks izin berubah tanpa sengaja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLES, ROLE_LEVEL, normalizeRole, hasPermission, permissionsFor,
  canInvite, canChangeRole, assignableRoles, checkScope, buildScopeFilter,
  resolveTrustedScope, decide, authzError, buildAuditEvent, buildMatrix,
  validateActorScope, clampScope, canEditDocument, maskCrossTenantAsNotFound, type Actor,
} from '../server/rbac';

/* --------------------------- fixtures --------------------------- */

const SH = { id: 'u-super', role: 'superuser' as const, tenantId: null, departmentId: null };
const AD = { id: 'u-admin', role: 'admin' as const, tenantId: 't1', departmentId: null };
const MG = { id: 'u-mgr', role: 'manager' as const, tenantId: 't1', departmentId: 'd1' };
const ED = { id: 'u-ed', role: 'editor' as const, tenantId: 't1', departmentId: 'd1' };
const VW = { id: 'u-vw', role: 'viewer' as const, tenantId: 't1', departmentId: 'd1' };
const ALL: Actor[] = [SH, AD, MG, ED, VW];

const ok = (r: { allowed: true } | { allowed: false; error: string }) => r.allowed === true;
const err = (r: { allowed: true } | { allowed: false; error: string }) =>
  r.allowed === false ? r.error : `ALLOWED(${(r as any).error ?? ''})`;

/* ---------------------- §3 hierarki & level ---------------------- */

test('§3 hierarki: level menurun sesuai PRD', () => {
  assert.deepEqual(ROLE_LEVEL, { superuser: 1, admin: 2, manager: 3, editor: 4, viewer: 5 });
  assert.equal(ROLES.length, 5);
});

test('§3 normalisasi role: legacy dipetakan, unknown → viewer (deny by default)', () => {
  assert.equal(normalizeRole('Legal'), 'manager');
  assert.equal(normalizeRole('finance'), 'editor');
  assert.equal(normalizeRole('staff'), 'viewer');
  assert.equal(normalizeRole('SUPER_ADMIN'), 'superuser');
  assert.equal(normalizeRole('owner'), 'superuser');
  assert.equal(normalizeRole(''), 'viewer');
  assert.equal(normalizeRole('nonsense'), 'viewer');
});

test('§6.1 constraint scope per role', () => {
  assert.equal(validateActorScope(SH).ok, true);
  assert.equal(validateActorScope(AD).ok, true);
  assert.equal(validateActorScope({ ...AD, departmentId: 'd1' }).ok, false); // admin tak boleh punya dept
  assert.equal(validateActorScope(MG).ok, true);
  assert.equal(validateActorScope({ ...MG, departmentId: null }).ok, false); // manager wajib dept
});

/* ------------------- §12/§33 matriks permission ------------------- */

test('§33 SUPERUSER = ALL permissions', () => {
  const m = permissionsFor('superuser');
  assert.ok(m.includes('document.delete'));
  assert.ok(m.includes('workspace.switch'));
  assert.ok(m.includes('tenant.create'));
  assert.ok(m.includes('admin.system.access'));
  assert.ok(m.includes('audit.view'));
});

test('§12 ADMIN: punya akses user & department, TIDAK punya workspace.switch/tenant.create', () => {
  assert.ok(hasPermission('admin', 'user.invite'));
  assert.ok(hasPermission('admin', 'user.role.assign'));
  assert.ok(hasPermission('admin', 'department.create'));
  assert.ok(hasPermission('admin', 'export.csv'));
  assert.equal(hasPermission('admin', 'workspace.switch'), false);
  assert.equal(hasPermission('admin', 'tenant.create'), false);
  assert.equal(hasPermission('admin', 'tenant.delete'), false);
});

test('§33 MANAGER: tanpa department.create dan tanpa user.delete', () => {
  assert.ok(hasPermission('manager', 'user.invite'));
  assert.ok(hasPermission('manager', 'document.export'));
  assert.ok(hasPermission('manager', 'admin.access'));
  assert.equal(hasPermission('manager', 'department.create'), false);
  assert.equal(hasPermission('manager', 'department.edit'), false);
  assert.equal(hasPermission('manager', 'user.delete'), false);
  assert.equal(hasPermission('manager', 'admin.department.manage'), false);
});

test('§33 EDITOR: hanya dokumen, tanpa invite/admin/export/workspace.switch', () => {
  assert.ok(hasPermission('editor', 'document.create'));
  assert.ok(hasPermission('editor', 'document.download'));
  assert.equal(hasPermission('editor', 'user.invite'), false);
  assert.equal(hasPermission('editor', 'admin.access'), false);
  assert.equal(hasPermission('editor', 'export.csv'), false);
  assert.equal(hasPermission('editor', 'workspace.switch'), false);
  assert.equal(hasPermission('editor', 'user.role.assign'), false);
});

test('§33 VIEWER: read-only', () => {
  assert.ok(hasPermission('viewer', 'document.view'));
  for (const p of ['document.create', 'document.edit', 'document.delete',
    'document.export', 'document.download', 'user.invite', 'admin.access',
    'export.csv', 'export.document', 'workspace.switch']) {
    assert.equal(hasPermission('viewer', p), false, `viewer seharusnya TIDAK punya ${p}`);
  }
});

test('§32 deny by default: permission tak dikenal ditolak', () => {
  for (const r of ['admin', 'manager', 'editor', 'viewer'] as const) {
    assert.equal(hasPermission(r, 'document.nuke'), false, `${r} seharusnya menolak permission tak dikenal`);
  }
});

/* ------------------ §30 Invitation role tests -------------------- */

test('§30 SUPERUSER dapat mengundang semua role di bawahnya', () => {
  for (const t of ['admin', 'manager', 'editor', 'viewer'] as const) {
    assert.equal(ok(canInvite(SH, t, { tenantId: 't9', departmentId: 'd9' })), true, `superuser→${t}`);
  }
});

test('§30 ADMIN dapat mengundang manager/editor/viewer, tidak admin/superuser', () => {
  for (const t of ['manager', 'editor', 'viewer'] as const) {
    assert.equal(ok(canInvite(AD, t, { tenantId: 't1' })), true, `admin→${t}`);
  }
  assert.equal(err(canInvite(AD, 'admin', { tenantId: 't1' })), 'INVALID_ROLE_ASSIGNMENT');
  assert.equal(err(canInvite(AD, 'superuser', { tenantId: 't1' })), 'INVALID_ROLE_ASSIGNMENT');
});

test('§30 MANAGER dapat mengundang editor/viewer, tidak manager/admin/superuser', () => {
  for (const t of ['editor', 'viewer'] as const) {
    assert.equal(ok(canInvite(MG, t, { tenantId: 't1', departmentId: 'd1' })), true, `manager→${t}`);
  }
  assert.equal(err(canInvite(MG, 'manager', { tenantId: 't1', departmentId: 'd1' })), 'INVALID_ROLE_ASSIGNMENT');
  assert.equal(err(canInvite(MG, 'admin', { tenantId: 't1', departmentId: 'd1' })), 'INVALID_ROLE_ASSIGNMENT');
  assert.equal(err(canInvite(MG, 'superuser', { tenantId: 't1', departmentId: 'd1' })), 'INVALID_ROLE_ASSIGNMENT');
});

test('§30 EDITOR & VIEWER tidak dapat mengundang siapa pun', () => {
  assert.equal(err(canInvite(ED, 'viewer', { tenantId: 't1', departmentId: 'd1' })), 'INSUFFICIENT_PERMISSION');
  assert.equal(err(canInvite(VW, 'editor', { tenantId: 't1', departmentId: 'd1' })), 'INSUFFICIENT_PERMISSION');
});

test('§14 invitation scope: lintas tenant & lintas departemen ditolak', () => {
  assert.equal(err(canInvite(AD, 'editor', { tenantId: 't2' })), 'TENANT_SCOPE_VIOLATION');
  assert.equal(err(canInvite(MG, 'editor', { tenantId: 't1', departmentId: 'd2' })), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(err(canInvite(MG, 'editor', { tenantId: 't2', departmentId: 'd1' })), 'TENANT_SCOPE_VIOLATION');
});

test('§13 assignableRoles sesuai hierarki', () => {
  assert.deepEqual(assignableRoles(SH).sort(), ['admin', 'editor', 'manager', 'viewer']);
  assert.deepEqual(assignableRoles(AD).sort(), ['editor', 'manager', 'viewer']);
  assert.deepEqual(assignableRoles(MG).sort(), ['editor', 'viewer']);
  assert.deepEqual(assignableRoles(ED), []);
  assert.deepEqual(assignableRoles(VW), []);
});

/* -------------------- §30 Tenant isolation ---------------------- */

test('§30 isolasi tenant: non-superuser tidak bisa lintas tenant', () => {
  const otherTenantDoc = { tenantId: 't2', departmentId: 'd1' };
  for (const a of [AD, MG, ED, VW]) {
    assert.equal(err(checkScope(a, otherTenantDoc, 'tenant')), 'TENANT_SCOPE_VIOLATION', `${a.role} lintas tenant`);
  }
});

test('§30 SUPERUSER dapat mengakses seluruh tenant', () => {
  assert.equal(ok(checkScope(SH, { tenantId: 't2', departmentId: 'd9' }, 'department')), true);
});

/* ------------------ §30 Department isolation -------------------- */

test('§30 isolasi departemen: manager/editor/viewer terkunci ke departemennya', () => {
  const otherDeptDoc = { tenantId: 't1', departmentId: 'd2' };
  for (const a of [MG, ED, VW]) {
    assert.equal(err(checkScope(a, otherDeptDoc, 'department')), 'DEPARTMENT_SCOPE_VIOLATION', `${a.role} lintas departemen`);
  }
});

test('§30 ADMIN dapat mengakses seluruh departemen dalam tenant-nya', () => {
  assert.equal(ok(checkScope(AD, { tenantId: 't1', departmentId: 'd2' }, 'department')), true);
  assert.equal(ok(checkScope(AD, { tenantId: 't1', departmentId: 'd99' }, 'department')), true);
});

/* ---------------------- §30 API bypass tests -------------------- */

test('§30 bypass: viewer tidak bisa create/edit/delete dokumen', () => {
  assert.equal(decide({ actor: VW, permission: 'document.create' }).allow, false);
  assert.equal(decide({ actor: VW, permission: 'document.edit' }).allow, false);
  assert.equal(decide({ actor: VW, permission: 'document.delete' }).allow, false);
  assert.equal(decide({ actor: VW, permission: 'document.view' }).allow, true);
});

test('§30 bypass: editor tidak bisa memanggil user.invite', () => {
  const d = decide({ actor: ED, permission: 'user.invite' });
  assert.equal(d.allow, false);
  if (!d.allow) assert.equal(d.error.error, 'INSUFFICIENT_PERMISSION');
});

test('§30 bypass: manager tidak bisa mengundang admin lewat request yang dimanipulasi', () => {
  // role target dimanipulasi menjadi admin dari body request
  assert.equal(err(canInvite(MG, 'admin', { tenantId: 't1', departmentId: 'd1' })), 'INVALID_ROLE_ASSIGNMENT');
});

test('§30 bypass: manager tidak bisa memindahkan target ke departemen lain', () => {
  assert.equal(err(canInvite(MG, 'editor', { tenantId: 't1', departmentId: 'd2' })), 'DEPARTMENT_SCOPE_VIOLATION');
});

test('§25 bypass: non-superuser tidak bisa memanipulasi tenantId dari client', () => {
  const spoofed = { tenantId: 't-999', departmentId: 'finance' };
  assert.deepEqual(resolveTrustedScope(MG, spoofed), { tenantId: 't1', departmentId: 'd1' });
  assert.deepEqual(resolveTrustedScope(ED, spoofed), { tenantId: 't1', departmentId: 'd1' });
  assert.deepEqual(resolveTrustedScope(AD, spoofed), { tenantId: 't1', departmentId: 'finance' }); // admin boleh pilih dept di tenant-nya
  assert.deepEqual(resolveTrustedScope(SH, spoofed), spoofed); // superuser global
});

test('§24 buildScopeFilter: filter query wajib per role (scope dipersempit sesuai peran)', () => {
  // Sejak dukungan multi-departemen: filter mengembalikan `departmentIds`
  // (array) alih-alih satu `departmentId`, karena seorang aktor kini bisa
  // punya lebih dari satu departemen sekaligus.
  assert.deepEqual(buildScopeFilter(SH), { tenantId: null, departmentIds: null });
  assert.deepEqual(buildScopeFilter(AD), { tenantId: 't1', departmentIds: null });
  assert.deepEqual(buildScopeFilter(MG), { tenantId: 't1', departmentIds: ['d1'] });
  // editor meninta scope 'tenant' → DIPERSEMPIT ke departemennya (tidak boleh melebar)
  assert.deepEqual(buildScopeFilter(ED, 'tenant'), { tenantId: 't1', departmentIds: ['d1'] });
});

test('§24 buildScopeFilter: aktor dengan lebih dari satu departemen', () => {
  const MG2 = { id: 'u-mgr2', role: 'manager' as const, tenantId: 't1', departmentIds: ['d1', 'd2'] };
  assert.deepEqual(buildScopeFilter(MG2), { tenantId: 't1', departmentIds: ['d1', 'd2'] });
  assert.equal(ok(checkScope(MG2, { tenantId: 't1', departmentId: 'd2' })), true);
  assert.equal(ok(checkScope(MG2, { tenantId: 't1', departmentId: 'd3' })), false);
});

test('§25/§4 pemanggil tidak bisa memperlebar scope (clamp)', () => {
  assert.equal(err(checkScope(ED, { tenantId: 't1', departmentId: 'd2' }, 'tenant')), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(decide({ actor: VW, permission: 'document.view', resource: { tenantId: 't1', departmentId: 'd2' }, scope: 'tenant' }).allow, false);
  assert.equal(err(checkScope(AD, { tenantId: 't2', departmentId: 'd1' }, 'global')), 'TENANT_SCOPE_VIOLATION');
  assert.equal(clampScope('editor', 'tenant'), 'department');
  assert.equal(clampScope('admin', 'global'), 'tenant');
  assert.equal(clampScope('superuser', 'department'), 'department');
});

test('§32.4 scope wajib: fail-closed bila resource tanpa departmentId', () => {
  assert.equal(err(checkScope(ED, {}, 'department')), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(err(checkScope(MG, { tenantId: 't1' }, 'department')), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(err(checkScope(VW, { tenantId: 't1' }, 'department')), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(ok(checkScope(AD, { tenantId: 't1' }, 'department')), true);
  assert.equal(err(canInvite(MG, 'editor', { tenantId: 't1' })), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(err(canInvite(AD, 'editor', {})), 'TENANT_SCOPE_VIOLATION');
});

test('§24 buildScopeFilter fail-closed bila actor non-superuser tanpa tenant', () => {
  assert.throws(() => buildScopeFilter({ id: 'x', role: 'manager', tenantId: null, departmentId: 'd1' }));
});

test('peran departemen tanpa data departemen diperlakukan tenant-level (kasus app nyata)', () => {
  const mgrNoDept = { id: 'u-mgr2', role: 'manager' as const, tenantId: 't1', departmentId: null };
  // guard scope 'tenant' → tidak memblokir hanya karena departemen belum diisi
  assert.equal(ok(checkScope(mgrNoDept, { tenantId: 't1' }, 'tenant')), true);
  // tetapi isolasi tenant TETAP ditegakkan
  assert.equal(err(checkScope(mgrNoDept, { tenantId: 't2' }, 'tenant')), 'TENANT_SCOPE_VIOLATION');
  // dan bila guard meminta scope departemen secara eksplisit, resource tanpa dept tetap ditolak
  assert.equal(err(checkScope(mgrNoDept, { tenantId: 't1' }, 'department')), 'DEPARTMENT_SCOPE_VIOLATION');
});

test('manager yang PUNYA departemen tetap terkunci (fail-closed tidak dilonggarkan)', () => {
  assert.equal(err(checkScope(MG, { tenantId: 't1', departmentId: 'd2' }, 'tenant')), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(ok(checkScope(MG, { tenantId: 't1', departmentId: 'd1' }, 'tenant')), true);
});

test('§12 ADMIN tidak menerima audit.view (tidak ada di PRD)', () => {
  assert.equal(hasPermission('admin', 'audit.view'), false);
  assert.equal(hasPermission('superuser', 'audit.view'), true);
});

/* ---------------------- §26 role change rules ------------------- */

test('§26 tidak boleh mengubah role sendiri', () => {
  assert.equal(err(canChangeRole(AD, { id: AD.id, tenantId: 't1' }, 'editor')), 'SELF_ROLE_CHANGE_FORBIDDEN');
  assert.equal(err(canChangeRole(MG, { id: MG.id, tenantId: 't1', departmentId: 'd1' }, 'viewer')), 'SELF_ROLE_CHANGE_FORBIDDEN');
});

test('§26 admin tidak bisa mengangkat ke admin/superuser, tidak lintas tenant', () => {
  assert.equal(err(canChangeRole(AD, { id: 'u-x', tenantId: 't1' }, 'superuser')), 'INVALID_ROLE_ASSIGNMENT');
  assert.equal(err(canChangeRole(AD, { id: 'u-x', tenantId: 't1' }, 'admin')), 'INVALID_ROLE_ASSIGNMENT');
  assert.equal(ok(canChangeRole(AD, { id: 'u-x', tenantId: 't1' }, 'manager')), true);
  assert.equal(err(canChangeRole(AD, { id: 'u-y', tenantId: 't2' }, 'manager')), 'TENANT_SCOPE_VIOLATION');
});

test('§26 manager hanya dalam departemennya, tidak bisa mengangkat manager', () => {
  assert.equal(ok(canChangeRole(MG, { id: 'u-x', tenantId: 't1', departmentId: 'd1' }, 'editor')), true);
  assert.equal(err(canChangeRole(MG, { id: 'u-x', tenantId: 't1', departmentId: 'd2' }, 'editor')), 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(err(canChangeRole(MG, { id: 'u-x', tenantId: 't1', departmentId: 'd1' }, 'manager')), 'INVALID_ROLE_ASSIGNMENT');
});

test('§26 editor/viewer tidak bisa mengganti role', () => {
  assert.equal(err(canChangeRole(ED, { id: 'u-x', tenantId: 't1', departmentId: 'd1' }, 'viewer')), 'INSUFFICIENT_PERMISSION');
  assert.equal(err(canChangeRole(VW, { id: 'u-x', tenantId: 't1', departmentId: 'd1' }, 'editor')), 'INSUFFICIENT_PERMISSION');
});

/* ---------------------- §29 error standar ----------------------- */

test('§29 error standar tidak membocorkan info sensitif', () => {
  assert.equal(authzError('TENANT_SCOPE_VIOLATION').status, 403);
  assert.equal(authzError('RESOURCE_NOT_FOUND').status, 404);
  assert.ok(!/other tenant|tenant lain/i.test(authzError('TENANT_SCOPE_VIOLATION').message));
});

test('§4 decide(): unauthenticated → 401', () => {
  const d = decide({ actor: null, permission: 'document.view' });
  assert.equal(d.allow, false);
  if (!d.allow) assert.equal(d.error.status, 401);
});

/* ---------------------- §27 audit trail ------------------------- */

test('§27 audit: event berisi actor, action, target, scope, timestamp', () => {
  const ev = buildAuditEvent(MG, 'user.role.assign', 'USER', 'u-x', { previousRole: 'viewer', newRole: 'editor' });
  assert.equal(ev.actorId, 'u-mgr');
  assert.equal(ev.action, 'user.role.assign');
  assert.equal(ev.tenantId, 't1');
  assert.equal(ev.departmentId, 'd1');
  assert.ok(Date.parse(ev.timestamp) > 0);
  assert.equal(ev.impersonatedBy, null);
});

test('§27 audit: sesi impersonasi tercatat terpisah dari identitas admin', () => {
  const ev = buildAuditEvent(ED, 'document.edit', 'DOCUMENT', 'doc-1', {}, 'u-super');
  assert.equal(ev.actorId, 'u-ed');          // pelaku efektif (user yang disamari)
  assert.equal(ev.impersonatedBy, 'u-super'); // admin asli, jejak terpisah
});

/* ---------------------- matriks & kelengkapan ------------------- */

test('matriks: setiap permission role valid & terdaftar di katalog', () => {
  const { permissions, matrix } = buildMatrix();
  const known = new Set(permissions.map((p) => p.code));
  for (const [role, list] of Object.entries(matrix)) {
    for (const p of list) {
      assert.ok(known.has(p), `${role} memakai permission tak terdaftar: ${p}`);
    }
  }
});

test('matriks: 5 role, katalog permission lengkap', () => {
  const { roles, permissions } = buildMatrix();
  assert.equal(roles.length, 5);
  assert.ok(permissions.length >= 30, `katalog permission terlalu sedikit: ${permissions.length}`);
});

test('setiap role punya minimal document.view (kecuali yang sengaja dikunci)', () => {
  assert.deepEqual(ALL.map((a) => hasPermission(a.role, 'document.view')), [true, true, true, true, true]);
});

/* ---------------------- §19 ownership / resource authz ------------ */

test('§19 canEditDocument: sesuai pseudo PRD', () => {
  const doc = { tenantId: 't1', departmentId: 'd1' };
  assert.equal(canEditDocument(SH, { tenantId: 't2', departmentId: 'd9' }), true); // superuser
  assert.equal(canEditDocument(AD, doc), true);            // admin, departemen apa pun di tenant-nya
  assert.equal(canEditDocument(MG, doc), true);            // manager departemennya
  assert.equal(canEditDocument(ED, doc), true);            // editor departemennya
  assert.equal(canEditDocument(VW, doc), false);           // viewer tak punya document.edit
});

test('§19 canEditDocument: tolak lintas tenant/departemen & fail-closed', () => {
  assert.equal(canEditDocument(MG, { tenantId: 't2', departmentId: 'd1' }), false); // lintas tenant
  assert.equal(canEditDocument(MG, { tenantId: 't1', departmentId: 'd2' }), false); // lintas departemen
  assert.equal(canEditDocument(MG, { tenantId: 't1' }), false);                    // departemen tak diketahui → tolak
  assert.equal(canEditDocument(null, { tenantId: 't1', departmentId: 'd1' }), false); // tanpa actor
});

/* ---------------------- §29 anti-enumeration ---------------------- */

test('§29 anti-enumeration: penolakan lintas tenant disamarkan jadi 404', () => {
  const foreign = { tenantId: 't2', departmentId: 'd1' };
  const d = decide({ actor: MG, permission: 'document.edit', resource: foreign, scope: 'department' });
  assert.equal(d.allow, false);
  const masked = maskCrossTenantAsNotFound(MG, foreign, d);
  assert.equal(masked.allow, false);
  if (!masked.allow) assert.equal(masked.error.error, 'RESOURCE_NOT_FOUND');
});

test('§29 anti-enumeration: penolakan dalam tenant tetap 403 (bukan 404)', () => {
  const sameDept = { tenantId: 't1', departmentId: 'd2' };
  const d = decide({ actor: MG, permission: 'document.edit', resource: sameDept, scope: 'department' });
  const masked = maskCrossTenantAsNotFound(MG, sameDept, d);
  assert.equal(masked.allow, false);
  if (!masked.allow) assert.equal(masked.error.error, 'DEPARTMENT_SCOPE_VIOLATION');
  assert.equal(maskCrossTenantAsNotFound(SH, sameDept, { allow: true }).allow, true);
});
