import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { SQLiteBackups } from './sqliteBackups';
import { ApiError, appendAudit } from './organizationSettingsStore';
import { resolveIdentity, RequestDenied, sendError, type Identity } from './identity';
import { auditActorFor } from './organizationAdminRoutes';

export function createSQLiteBackupRouter(db: Database.Database, backups: SQLiteBackups) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const handler = (fn: (req: Request, res: Response, identity: Identity) => unknown) => async (req: Request, res: Response) => {
    try {
      const identity = resolveIdentity(db, req);
      if (identity.platformRole !== 'superuser') throw new RequestDenied(403, 'FORBIDDEN');
      await fn(req, res, identity);
    } catch (error: any) {
      if (error instanceof ApiError || error instanceof RequestDenied) return sendError(req, res, error.status, error.error, error.message);
      console.error('[sqlite-backups]', error.message);
      sendError(req, res, 500, 'BACKUP_FAILED', 'Backup operation failed. Check server storage and logs.');
    }
  };
  const audit = (req: Request, identity: Identity, action: string, id: string) => appendAudit(db, auditActorFor(req, identity), { organizationId: null, action, targetType: 'backup', targetId: id, outcome: 'success' });
  router.get('/', handler((_req, res) => res.json({ backups: backups.list() })));
  router.post('/', handler(async (req, res, identity) => {
    const entry = await backups.exclusive(res, () => backups.create());
    audit(req, identity, 'platform.backup.create', entry.id);
    res.status(201).json(entry);
  }));
  router.get('/:id/download', handler((req, res, identity) => {
    const archive = backups.archive(req.params.id);
    audit(req, identity, 'platform.backup.download', req.params.id);
    res.download(archive, `legalio-backup-${req.params.id}.tar.gz`);
  }));
  router.post('/:id/restore', handler(async (req, res, identity) => {
    const result = await backups.exclusive(res, () => backups.stageRestore(req.params.id, req.body?.confirmation));
    audit(req, identity, 'platform.backup.restore', req.params.id);
    // A supervisor restarts the process; manual deployments must start the backend again.
    res.once('finish', () => setTimeout(() => process.kill(process.pid, 'SIGTERM'), 250).unref());
    res.status(202).json(result);
  }));
  return router;
}
