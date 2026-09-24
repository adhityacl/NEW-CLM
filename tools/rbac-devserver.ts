/**
 * Server RBAC standalone (tanpa dependensi) untuk MEMBUKTIKAN secara runtime
 * bahwa engine `server/rbac.ts` menegakkan matriks PRD di tingkat HTTP.
 *
 * Bukan pengganti app penuh (app butuh Express + better-auth + kredensial),
 * melainkan harness eksekusi untuk QC impersonasi per level.
 *
 * Jalankan:  npx tsx tools/rbac-devserver.ts [port]
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { decide, canInvite, canChangeRole, buildMatrix, authzError, normalizeRole, resolveTrustedScope, type Actor, type ScopeKind } from '../server/rbac';

const PORT = Number(process.argv[2] || 3999);
/** --legacy = replika perilaku middleware LAMA (anonim diperlakukan sebagai Viewer, baca selalu lolos). */
const LEGACY = process.argv.includes('--legacy');

interface User { id: string; name: string; role: string; tenantId: string | null; departmentId: string | null; }

const users: User[] = [
  { id: 'U-SUPER', name: 'Super User', role: 'superuser', tenantId: null, departmentId: null },
  { id: 'U-ADMIN', name: 'Admin Tenant A', role: 'admin', tenantId: 't1', departmentId: null },
  { id: 'U-MANAGER', name: 'Manager Dept 1', role: 'manager', tenantId: 't1', departmentId: 'd1' },
  { id: 'U-EDITOR', name: 'Editor Dept 1', role: 'editor', tenantId: 't1', departmentId: 'd1' },
  { id: 'U-VIEWER', name: 'Viewer Dept 1', role: 'viewer', tenantId: 't1', departmentId: 'd1' },
];

const sessions = new Map<string, string>();
sessions.set('SUPER-TOKEN', 'U-SUPER');
for (const u of users) sessions.set(`TOKEN-${u.id}`, u.id);

const documents = [
  { id: 'doc-t1-d1', tenantId: 't1', departmentId: 'd1' },
  { id: 'doc-t2-d1', tenantId: 't2', departmentId: 'd1' }, // tenant lain
  { id: 'doc-t1-d2', tenantId: 't1', departmentId: 'd2' }, // departemen lain
];

const audit: any[] = [];

function actorFor(token: string | null): Actor | null {
  if (!token) return null;
  const uid = sessions.get(token);
  if (!uid) return null;
  const u = users.find((x) => x.id === uid);
  if (!u) return null;
  return { id: u.id, role: normalizeRole(u.role), tenantId: u.tenantId, departmentId: u.departmentId };
}

function bearer(req: IncomingMessage): string | null {
  const h = (req.headers['authorization'] || '').toString();
  return h.startsWith('Bearer ') ? h.slice(7).trim() : (h || null);
}

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

/** Gerbang otorisasi (setara requirePermission pada app nyata). */
function guard(actor: Actor | null, permission: string, scope: ScopeKind = 'department', resource?: { tenantId?: string | null; departmentId?: string | null }, method?: string) {
  if (LEGACY) {
    // Replika middleware lama: anonim → Viewer; hanya metode tulis yang diblokir.
    const effective: Actor = actor ?? { id: 'anon', role: 'viewer', tenantId: null, departmentId: null };
    const isViewer = normalizeRole(effective.role) === 'viewer';
    if (isViewer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method ?? 'GET'))) {
      return authzError('INSUFFICIENT_PERMISSION');
    }
    return null; // baca selalu lolos -> inilah kebocoran yang terbukti di QA live
  }
  const d = decide({ actor, permission, resource, scope });
  if ('error' in d) return d.error;
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const actor = actorFor(bearer(req));

  /* --- Emulasi middleware app (berjalan SEBELUM routing) --- */
  const PUBLIC_PATHS = ['/api/rbac/matrix', '/api/health'];
  const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/api/auth/');
  if (!isPublic) {
    if (LEGACY) {
      const effRole = normalizeRole(actor?.role ?? 'viewer');
      if (effRole === 'viewer' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method))) {
        return send(res, 403, authzError('INSUFFICIENT_PERMISSION'));
      }
    } else if (!actor) {
      return send(res, 401, authzError('UNAUTHENTICATED'));
    }
  }

  try {
    /* ---- katalog RBAC (publik, read-only) ---- */
    if (req.method === 'GET' && path === '/api/rbac/matrix') return send(res, 200, { ok: true, ...buildMatrix() });
    if (req.method === 'GET' && path === '/api/rbac/me') {
      if (!actor) return send(res, 401, authzError('UNAUTHENTICATED'));
      const { matrix } = buildMatrix();
      return send(res, 200, { ok: true, actor, permissions: matrix[normalizeRole(actor.role)] });
    }

    /* ---- impersonasi (hanya SUPERUSER) ---- */
    const impMatch = path.match(/^\/api\/auth-console\/users\/([^/]+)\/impersonate$/);
    if (req.method === 'POST' && impMatch) {
      if (!actor) return send(res, 401, authzError('UNAUTHENTICATED'));
      if (normalizeRole(actor.role) !== 'superuser') return send(res, 403, authzError('INSUFFICIENT_PERMISSION'));
      const targetId = impMatch[1];
      const target = users.find((u) => u.id === targetId);
      if (!target) return send(res, 404, authzError('RESOURCE_NOT_FOUND'));
      const token = `IMP-${targetId}-${Date.now()}`;
      sessions.set(token, targetId);
      audit.push({ actorId: actor.id, action: 'user.impersonate', targetType: 'SESSION', targetId,
        impersonatedBy: actor.id, timestamp: new Date().toISOString() });
      return send(res, 200, { success: true, sessionToken: token, userId: targetId });
    }

    /* ---- endpoint terproteksi (PRD §18) ---- */
    if (req.method === 'GET' && path === '/api/rbac/trusted-scope') {
      if (!actor) return send(res, 401, authzError('UNAUTHENTICATED'));
      const requested = { tenantId: url.searchParams.get('tenantId'), departmentId: url.searchParams.get('departmentId') };
      return send(res, 200, { ok: true, requested, trusted: resolveTrustedScope(actor, requested) });
    }
    if (req.method === 'GET' && path === '/api/contracts') {
      const e = guard(actor, 'document.view', 'tenant', undefined, req.method);
      if (e) return send(res, e.status, e);
      const scoped = !actor ? documents : (normalizeRole(actor.role) === 'superuser' ? documents
        : documents.filter((d) => d.tenantId === actor!.tenantId));
      return send(res, 200, { ok: true, count: scoped.length, items: scoped.map((d) => d.id) });
    }
    if (req.method === 'POST' && path === '/api/contracts') {
      const e = guard(actor, 'document.create', 'department', { tenantId: 't1', departmentId: 'd1' }, req.method);
      if (e) return send(res, e.status, e);
      return send(res, 201, { ok: true, created: 'doc-new' });
    }
    if (req.method === 'GET' && path === '/api/auth-console/users') {
      const e = guard(actor, 'user.view', 'tenant', undefined, req.method);
      if (e) return send(res, e.status, e);
      return send(res, 200, { ok: true, count: users.length });
    }
    if (req.method === 'GET' && path === '/api/auth-console/sessions') {
      const e = guard(actor, 'admin.access', 'tenant', undefined, req.method);
      if (e) return send(res, e.status, e);
      return send(res, 200, { ok: true, count: sessions.size });
    }
    if (req.method === 'GET' && path === '/api/partners') {
      const e = guard(actor, 'document.view', 'tenant', undefined, req.method);
      if (e) return send(res, e.status, e);
      return send(res, 200, { ok: true, count: 10 });
    }
    if (req.method === 'POST' && path === '/api/tenants/switch') {
      const e = guard(actor, 'workspace.switch', 'global', undefined, req.method);
      if (e) return send(res, e.status, e);
      return send(res, 200, { ok: true, switched: true });
    }
    /* Endpoint ini di app nyata memang menuntut sesi (terbukti 401 di QA live). */
    if (req.method === 'GET' && path === '/api/user/my-role') {
      if (!actor) return send(res, 401, authzError('UNAUTHENTICATED'));
      return send(res, 200, { ok: true, actor });
    }
    if (req.method === 'POST' && path === '/api/rbac/simulate/invite') {
      if (!actor) return send(res, 401, authzError('UNAUTHENTICATED'));
      const body = await readBody(req);
      const r = canInvite(actor, body.targetRole, { tenantId: body.tenantId, departmentId: body.departmentId });
      return 'error' in r ? send(res, 403, authzError(r.error))
        : send(res, 200, { ok: true, allowed: true });
    }
    if (req.method === 'POST' && path === '/api/rbac/simulate/role-change') {
      if (!actor) return send(res, 401, authzError('UNAUTHENTICATED'));
      const body = await readBody(req);
      const r = canChangeRole(actor, { id: String(body.targetId), tenantId: body.targetTenantId, departmentId: body.targetDepartmentId }, body.newRole);
      return 'error' in r ? send(res, 403, authzError(r.error)) : send(res, 200, { ok: true, allowed: true });
    }
    if (req.method === 'GET' && path === '/api/audit-logs') {
      return send(res, 200, { ok: true, count: audit.length, items: audit });
    }
    if (req.method === 'GET' && path === '/api/activity-logs') {
      const e = guard(actor, 'admin.access', 'tenant', undefined, req.method);
      if (e) return send(res, e.status, e);
      return send(res, 200, { ok: true, count: audit.length });
    }
    if (path === '/api/health') return send(res, 200, { ok: true });

    return send(res, 404, { error: 'NOT_FOUND', message: `No route: ${req.method} ${path}` });
  } catch (err: any) {
    return send(res, 500, { error: 'INTERNAL', message: err?.message || 'error' });
  }
});

server.listen(PORT, () => console.log(`RBAC standalone server on http://localhost:${PORT} (users: ${users.map((u) => u.id).join(', ')})`));
