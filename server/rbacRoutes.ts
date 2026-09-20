/**
 * Route RBAC (additif, tanpa mengubah perilaku yang ada).
 *
 * Pemasangan di `server.ts` (satu baris, setelah `const app = express();`
 * dan setelah middleware body-parser):
 *
 *   import { createRbacRouter } from "./server/rbacRoutes";
 *   app.use("/api/rbac", createRbacRouter({ resolveActor }));
 *
 * `resolveActor(req)` diisi aplikasi - cukup mengembalikan Actor dari sesi
 * yang sudah ada (better-auth `getSession` atau tabel `session` + `user`).
 * Route ini TIDAK menyentuh data user; hanya membaca katalog & keputusan.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  buildMatrix, decide, canInvite, canChangeRole, authzError, resolveTrustedScope,
  type Actor, type ScopeKind,
} from './rbac';

export interface RbacRouterOptions {
  /** Mengembalikan actor dari request, atau null bila belum terautentikasi. */
  resolveActor: (req: Request) => Promise<Actor | null> | Actor | null;
  /** Tulis audit event (opsional). */
  onAudit?: (event: unknown) => void | Promise<void>;
}

export function createRbacRouter(opts: RbacRouterOptions): Router {
  const router = Router();

  /** Menempelkan actor ke req (tanpa memblokir). */
  const attach = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req as any).actor = await opts.resolveActor(req);
    } catch {
      (req as any).actor = null;
    }
    next();
  };
  router.use(attach);

  /** Katalog + matriks lengkap (sumber tunggal untuk dokumen & UI). */
  router.get('/matrix', (_req, res) => {
    res.json({ ok: true, ...buildMatrix() });
  });

  router.get('/roles', (_req, res) => {
    res.json({ ok: true, roles: buildMatrix().roles });
  });

  /** Actor saat ini + permission efektifnya (untuk frontend). */
  router.get('/me', (req, res) => {
    const actor = (req as any).actor as Actor | null;
    if (!actor) return res.status(401).json(authzError('UNAUTHENTICATED'));
    const { matrix } = buildMatrix();
    const role = String(actor.role).toLowerCase();
    res.json({
      ok: true,
      actor: { id: actor.id, role, tenantId: actor.tenantId ?? null, departmentId: actor.departmentId ?? null },
      permissions: matrix[role as keyof typeof matrix] ?? [],
    });
  });

  /** Cek keputusan otorisasi tanpa efek samping (dipakai QC & UI). */
  router.post('/check', (req, res) => {
    const actor = (req as any).actor as Actor | null;
    const { permission, resource, scope } = req.body ?? {};
    if (typeof permission !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'permission wajib diisi.' });
    }
    const decision = decide({
      actor,
      permission,
      resource: resource ?? undefined,
      scope: (scope ?? 'department') as ScopeKind,
    });
    if (decision.allow) return res.json({ ok: true, allow: true });
    return res.status(decision.error.status).json({ ok: false, allow: false, ...decision.error });
  });

  /** Simulasi aturan hierarki (untuk QC impersonasi). */
  router.post('/simulate/invite', (req, res) => {
    const actor = (req as any).actor as Actor | null;
    if (!actor) return res.status(401).json(authzError('UNAUTHENTICATED'));
    const { targetRole, tenantId, departmentId } = req.body ?? {};
    const r = canInvite(actor, targetRole, { tenantId, departmentId });
    if (r.allowed) return res.json({ ok: true, allowed: true });
    return res.status(403).json({ ok: false, ...authzError(r.error) });
  });

  router.post('/simulate/role-change', (req, res) => {
    const actor = (req as any).actor as Actor | null;
    if (!actor) return res.status(401).json(authzError('UNAUTHENTICATED'));
    const { targetId, targetTenantId, targetDepartmentId, newRole } = req.body ?? {};
    const r = canChangeRole(actor, {
      id: String(targetId), tenantId: targetTenantId, departmentId: targetDepartmentId,
    }, newRole);
    if (r.allowed) return res.json({ ok: true, allowed: true });
    return res.status(403).json({ ok: false, ...authzError(r.error) });
  });

  return router;
}

/**
 * Middleware wajib-permission untuk endpoint terproteksi (PRD �17).
 *
 * PRD �25: tenant/department dari client TIDAK dipercaya. Nilai dari
 * request hanya dipakai sebagai *permintaan*; `resolveTrustedScope` memaksa
 * scope milik user untuk non-superuser sebelum pengecekan dilakukan.
 */
export function requirePermission(permission: string, scope: ScopeKind = 'department') {
  return (req: Request, res: Response, next: NextFunction) => {
    const actor = (req as any).actor as Actor | null;
    const requested = {
      tenantId: (req.params as any)?.tenantId || (req.body?.tenantId ?? req.query?.tenantId),
      departmentId: (req.params as any)?.departmentId || (req.body?.departmentId ?? req.query?.departmentId),
    };
    // Paksa ke scope tepercaya (mengabaikan tenant/department palsu dari client).
    const resource = actor ? resolveTrustedScope(actor, requested) : requested;
    const decision = decide({ actor, permission, resource, scope });
    if (decision.allow) return next();
    return res.status(decision.error.status).json(decision.error);
  };
}
