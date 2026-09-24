import { Router, Request, Response } from 'express';
import { sqliteDb, ac, roles, statement } from '../lib/auth';
import { hashPassword } from 'better-auth/crypto';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { authzError, buildAuditEvent, canChangeRole, canInvite, type Actor } from '../../server/rbac';
import { getDefaultTenantId } from '../../server/tenantPolicy';
import { resolveTenantSettings } from '../lib/policy';

export const authConsoleRouter = Router();
function getConsoleTenantScope(req: Request): string | null {
  const actor = (req as any).actor as Actor | null;
  if (!actor || actor.role === 'superuser') return null;
  return actor.tenantId ?? null;
}

/* RBAC-ADMIN-AREA-GUARD-V1 */
// Guard area admin: hanya peran admin ke atas (identitas dari token sesi, bukan header email).
const _adminAreaRoles = new Set(["superuser", "admin", "manager"]);
authConsoleRouter.use(["/overview", "/accounts", "/sessions", "/organizations", "/teams", "/invitations", "/api-keys", "/rbac-matrix", "/sqlite"], (req: Request, res: Response, next: any) => {
  try {
    const token = ((req.headers["authorization"] || "").toString().replace(/^Bearer\s+/i, "")
      || (req.headers["x-session-token"] || "").toString()).trim();
    if (!token || !sqliteDb) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
    const session = sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(token) as any;
    if (!session?.userId) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
    const user = sqliteDb.prepare("SELECT role, banned FROM user WHERE id = ?").get(session.userId) as any;
    if (!user || user.banned === 1) {
      return res.status(403).json({ error: "INSUFFICIENT_PERMISSION", message: "You do not have permission to access this area." });
    }
    const role = String(user.role || "").toLowerCase().trim();
    if (!_adminAreaRoles.has(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_PERMISSION", message: "You do not have permission to access this area." });
    }
    const actor = (req as any).actor as Actor | null;
    // `req.path` is relative to whichever entry in this middleware's path array
    // matched (Express strips that prefix for `.use(pathsArray, handler)`), so it
    // can never actually start with the prefix that just matched it — every check
    // below silently evaluated to false, defeating this gate entirely. Use
    // `req.originalUrl`, which routing never rewrites, and strip the router's own
    // fixed mount point (`/api/auth-console`, set in server.ts) instead.
    const fullPath = req.originalUrl.split('?')[0].replace(/^\/api\/auth-console/, '') || '/';
    const systemOnly = fullPath.startsWith('/overview')
      || fullPath.startsWith('/accounts')
      || fullPath.startsWith('/sessions')
      || (fullPath.startsWith('/organizations') && req.method !== 'GET')
      || fullPath.startsWith('/api-keys')
      || fullPath.startsWith('/rbac-matrix')
      || fullPath.startsWith('/sqlite');
    if (systemOnly && actor?.role !== 'superuser') {
      return res.status(403).json({ error: "INSUFFICIENT_PERMISSION", message: "System Admin access is required." });
    }
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
  }
});

let globalDbRef: any = null;
let saveDbFnRef: (() => void) | null = null;

export function setConsoleDbReference(dbStore: any, saveFn: () => void) {
  globalDbRef = dbStore;
  saveDbFnRef = saveFn;
  if (globalDbRef) {
    hydrateAuthConsoleFromDataStore(globalDbRef);
    ensureUserAccountsExist();
  }
}


export async function ensureUserAccountsExist(defaultPassword = process.env.DEMO_ADMIN_PASSWORD || '123456789') {
  try {
    const users = sqliteDb.prepare('SELECT id, email FROM user').all() as any[];
    if (!users || users.length === 0) return;
    const now = new Date().toISOString();
    let hashedDef: string | null = null;

    for (const u of users) {
      const existing = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").get(u.id);
      if (!existing) {
        if (!hashedDef) {
          hashedDef = await hashPassword(defaultPassword);
        }
        const accountId = 'acc_' + u.id;
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
          VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
        `).run(accountId, u.id, u.id, hashedDef, now, now, 'local:credential');
      }
    }
  } catch (err) {
    console.warn('Error ensuring user accounts:', err);
  }
}


export function hydrateAuthConsoleFromDataStore(dbStore: any) {
  ensureUserAccountsExist();
  if (!dbStore) return;
  const now = new Date().toISOString();

  // 1. Hydrate Organizations
  if (Array.isArray(dbStore.tenants)) {
    for (const t of dbStore.tenants) {
      try {
        const slug = t.domainSlug || (t.name ? t.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'org');
        const metadata = JSON.stringify({
          legalEntity: t.legalEntity || '',
          brandName: t.brandName || t.name,
          primaryColor: t.primaryColor || '#06C755',
          currency: t.currency || resolveTenantSettings(t).defaultCurrency,
          settings: resolveTenantSettings(t),
          isDefault: Boolean(t.isDefault),
          spreadsheetId: t.spreadsheetId,
          spreadsheetUrl: t.spreadsheetUrl,
          driveFolderId: t.driveFolderId,
          driveFolderLink: t.driveFolderLink,
        });
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO organization (id, name, slug, logo, createdAt, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(t.id || `org_${Date.now()}`, t.name, slug, t.logoUrl || '/favicon.png', t.created_at || now, metadata);
      } catch (e) {}
    }
  }

  // 2. Hydrate Departments / Teams
  if (Array.isArray(dbStore.departments)) {
    for (const dept of dbStore.departments) {
      try {
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
          VALUES (?, ?, 0, ?, ?, ?)
        `).run(dept.id || `team_${Date.now()}`, dept.name, dept.organizationId || getDefaultTenantId(), dept.created_at || now, dept.updated_at || now);
      } catch (e) {}
    }
  }

  // 3. Hydrate Allowed Users
  if (Array.isArray(dbStore.allowedUsers)) {
    for (const u of dbStore.allowedUsers) {
      if (!u.email) continue;
      try {
        const userId = u.id || `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const finalRole = (u.role || 'staff').toLowerCase();
        const banned = u.status === 'Inactive' || u.status === 'Banned' ? 1 : 0;
        const orgId = u.organizationId || getDefaultTenantId();

        sqliteDb.prepare(`
          INSERT OR REPLACE INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        `).run(userId, u.name || 'User', u.email.toLowerCase(), finalRole, banned, u.createdAt || now, now);

        sqliteDb.prepare(`
          INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${userId}`, orgId, userId, finalRole, u.createdAt || now);

        // Superuser and Admin span every department by design — never tie them to just one.
        if (u.department && finalRole !== 'superuser' && finalRole !== 'admin') {
          const deptName = u.department.trim();
          let teamRow = sqliteDb.prepare('SELECT id FROM team WHERE LOWER(name) = LOWER(?)').get(deptName) as any;
          if (!teamRow) {
            const teamId = `team_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            sqliteDb.prepare(`
              INSERT INTO team (id, name, organizationId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?)
            `).run(teamId, deptName, orgId, now, now);
            teamRow = { id: teamId };
          }
          sqliteDb.prepare(`
            INSERT OR REPLACE INTO teamMember (id, teamId, userId, createdAt)
            VALUES (?, ?, ?, ?)
          `).run(`tm_${userId}`, teamRow.id, userId, now);
        }
      } catch (e) {}
    }
  }
}

export function syncUsersToDataStoreAndSheet() {
  try {
    const users = sqliteDb.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.banned, u.createdAt, u.updatedAt,
             m.organizationId,
             (SELECT t.name FROM team t JOIN teamMember tm ON tm.teamId = t.id WHERE tm.userId = u.id ORDER BY tm.createdAt ASC LIMIT 1) as departmentName
      FROM user u
      LEFT JOIN member m ON u.id = m.userId
    `).all();

    if (globalDbRef) {
      const allowed = users.map((u: any) => ({
        id: u.id,
        organizationId: u.organizationId || getDefaultTenantId(),
        email: u.email ? u.email.toLowerCase() : '',
        name: u.name || 'User',
        role: (u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Staff') as any,
        department: u.departmentName || '',
        status: u.banned ? 'Inactive' : 'Active',
        addedBy: 'Admin',
        createdAt: u.createdAt || new Date().toISOString(),
      }));

      globalDbRef.allowedUsers = allowed;
      if (saveDbFnRef) saveDbFnRef();
    }
  } catch (err) {
    console.warn('Error syncing users to data store:', err);
  }
}

// Helper to get active organization id
function getActiveOrgId(req: Request): string {
  const actor = (req as any).actor as Actor | null;
  if (actor && actor.role !== 'superuser') return actor.tenantId || getDefaultTenantId();
  
  try {
    const firstOrg = sqliteDb.prepare('SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1').get() as any;
    return firstOrg?.id || getDefaultTenantId();
  } catch (err) {
    return getDefaultTenantId();
  }
}

function recordRbacAudit(
  req: Request,
  actor: Actor | null,
  action: string,
  targetType: any,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  if (!actor || !globalDbRef) return;
  const event = buildAuditEvent(actor, action, targetType, targetId, metadata);
  if (!Array.isArray(globalDbRef.activityLogs)) globalDbRef.activityLogs = [];
  globalDbRef.activityLogs.unshift({
    id: `rbac-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: event.timestamp,
    userEmail: (req as any).user?.email || actor.id,
    userName: (req as any).user?.name || actor.id,
    role: actor.role,
    actionType: event.action,
    module: 'RBAC',
    description: `${event.action} on ${event.targetType}:${event.targetId}`,
    metadata: event.metadata,
  });
  globalDbRef.activityLogs = globalDbRef.activityLogs.slice(0, 500);
  saveDbFnRef?.();
}

// 1. GET /overview - High-level metrics for Console Dashboard
authConsoleRouter.get('/overview', (req: Request, res: Response) => {
  try {
    const totalUsers = (sqliteDb.prepare('SELECT COUNT(*) as count FROM user').get() as any)?.count || 0;
    const activeUsers = (sqliteDb.prepare("SELECT COUNT(*) as count FROM user WHERE banned = 0 OR banned IS NULL").get() as any)?.count || 0;
    const bannedUsers = (sqliteDb.prepare('SELECT COUNT(*) as count FROM user WHERE banned = 1').get() as any)?.count || 0;
    const verifiedUsers = (sqliteDb.prepare('SELECT COUNT(*) as count FROM user WHERE emailVerified = 1').get() as any)?.count || 0;
    
    // Active sessions (not expired)
    const now = new Date().toISOString();
    const activeSessions = (sqliteDb.prepare('SELECT COUNT(*) as count FROM session WHERE expiresAt > ?').get(now) as any)?.count || 0;
    
    // Total accounts & providers
    const totalAccounts = (sqliteDb.prepare('SELECT COUNT(*) as count FROM account').get() as any)?.count || 0;
    const credentialAccounts = (sqliteDb.prepare("SELECT COUNT(*) as count FROM account WHERE providerId = 'credential'").get() as any)?.count || 0;
    const googleAccounts = (sqliteDb.prepare("SELECT COUNT(*) as count FROM account WHERE providerId = 'google'").get() as any)?.count || 0;

    // Organizations & Teams
    const totalOrgs = (sqliteDb.prepare('SELECT COUNT(*) as count FROM organization').get() as any)?.count || 0;
    const totalTeams = (sqliteDb.prepare('SELECT COUNT(*) as count FROM team').get() as any)?.count || 0;
    const pendingInvitations = (sqliteDb.prepare("SELECT COUNT(*) as count FROM invitation WHERE status = 'pending'").get() as any)?.count || 0;
    const totalApiKeys = (sqliteDb.prepare("SELECT COUNT(*) as count FROM apikey WHERE status = 'active'").get() as any)?.count || 0;

    // Roles breakdown
    const roleRows = sqliteDb.prepare('SELECT role, COUNT(*) as count FROM user GROUP BY role').all() as any[];
    const roleDistribution: Record<string, number> = {
      superuser: 0,
      admin: 0,
      manager: 0,
      editor: 0,
      viewer: 0,
      legal: 0,
      finance: 0,
      staff: 0,
    };
    roleRows.forEach(r => {
      const roleKey = (r.role || 'viewer').toLowerCase();
      roleDistribution[roleKey] = (roleDistribution[roleKey] || 0) + Number(r.count);
    });

    // Recent users
    const recentUsers = sqliteDb.prepare('SELECT id, name, email, role, banned, createdAt FROM user ORDER BY createdAt DESC LIMIT 5').all();

    // Recent sessions
    const recentSessions = sqliteDb.prepare(`
      SELECT s.id, s.token, s.ipAddress, s.userAgent, s.createdAt, s.expiresAt, u.name as userName, u.email as userEmail
      FROM session s
      LEFT JOIN user u ON s.userId = u.id
      ORDER BY s.createdAt DESC LIMIT 5
    `).all();

    return res.json({
      success: true,
      data: {
        instance: {
          id: 'production',
          name: 'Production',
          env: 'production',
          adapter: 'Better-Auth Native (SQLite)',
          plugins: ['admin', 'organization', 'teams', 'accessControl'],
        },
        metrics: {
          totalUsers,
          activeUsers,
          bannedUsers,
          verifiedUsers,
          activeSessions,
          totalAccounts,
          credentialAccounts,
          googleAccounts,
          totalOrgs,
          totalTeams,
          pendingInvitations,
          totalApiKeys,
        },
        roleDistribution,
        providerDistribution: {
          credential: credentialAccounts,
          google: googleAccounts,
          other: Math.max(0, totalAccounts - credentialAccounts - googleAccounts),
        },
        recentUsers,
        recentSessions,
      },
    });
  } catch (err: any) {
    console.error('Error fetching console overview:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch console overview' });
  }
});

// 2. GET /users - List all users with account info and status
authConsoleRouter.get('/users', (req: Request, res: Response) => {
  try {
    const tenantId = getConsoleTenantScope(req);
    const users = sqliteDb.prepare(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.emailVerified, 
        u.image, 
        u.createdAt, 
        u.updatedAt, 
        u.role, 
        u.banned, 
        u.banReason, 
        u.banExpires,
        (SELECT t.name FROM team t JOIN teamMember tm ON tm.teamId = t.id WHERE tm.userId = u.id LIMIT 1) as department,
        (SELECT COUNT(*) FROM session WHERE userId = u.id) as sessionCount,
        (SELECT providerId FROM account WHERE userId = u.id LIMIT 1) as primaryProvider,
        (SELECT m.organizationId FROM member m WHERE m.userId = u.id LIMIT 1) as organizationId,
        (SELECT o.name FROM organization o JOIN member m ON m.organizationId = o.id WHERE m.userId = u.id LIMIT 1) as organizationName
      FROM user u
      LEFT JOIN member scopedMember ON scopedMember.userId = u.id
      WHERE (? IS NULL OR scopedMember.organizationId = ?)
      ORDER BY u.createdAt DESC
    `).all(tenantId, tenantId);

    return res.json({
      success: true,
      users: users.map((u: any) => ({
        ...u,
        banned: Boolean(u.banned),
        emailVerified: Boolean(u.emailVerified),
      })),
    });
  } catch (err: any) {
    console.error('Error listing users:', err);
    return res.status(500).json({ error: err.message || 'Failed to list users' });
  }
});

// POST /users - Create new user in Better Auth
authConsoleRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const { name, email, role = 'staff', password, department, organizationId } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const normRole = String(role).toLowerCase();
    const actor = (req as any).actor as Actor | null;
    if (!actor) return res.status(401).json(authzError('UNAUTHENTICATED'));
    const targetOrganizationId = actor.role === 'superuser' ? organizationId : actor.tenantId;
    const inviteDecision = canInvite(actor, normRole, {
      tenantId: targetOrganizationId,
      departmentId: actor.role === 'manager' ? actor.departmentId : undefined,
    });
    if ('error' in inviteDecision) {
      return res.status(403).json(authzError(inviteDecision.error));
    }
    // Rule: roles below Superuser and Admin MUST be assigned to 1 tenant/organization
    if (normRole !== 'superuser' && normRole !== 'admin' && !organizationId) {
      return res.status(400).json({ 
        error: 'Organisasi/Tenant wajib dipilih untuk peran di bawah Superuser dan Admin.' 
      });
    }

    const existing = sqliteDb.prepare('SELECT id FROM user WHERE LOWER(email) = LOWER(?)').get(email) as any;
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const finalRole = normRole;

    sqliteDb.prepare(`
      INSERT INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, 0, ?, ?)
    `).run(userId, name, email, finalRole, now, now);

    // If password provided, create account record
    if (password) {
      const hashed = await hashPassword(password);
      const accountId = `acc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      sqliteDb.prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
      `).run(accountId, userId, userId, hashed, now, now, 'local:credential');
    }

    // Determine target organization membership:
    // Superuser: Global (no member row or global)
    // Admin: If organizationId provided, assigned to that tenant, otherwise global (null)
    // Below Superuser & Admin: MUST be assigned to specified organizationId
    const targetOrgId = finalRole === 'superuser'
      ? null
      : (targetOrganizationId || (finalRole === 'admin' ? null : getActiveOrgId(req)));

    if (targetOrgId) {
      const memberId = `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO member (id, organizationId, userId, role, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(memberId, targetOrgId, userId, finalRole, now);
    }

    // Assign to department / team if provided — Superuser and Admin span every
    // department by design, so they're never tied to just one.
    if (finalRole !== 'superuser' && finalRole !== 'admin' && department && department.trim()) {
      const deptName = department.trim();
      const teamOrgId = targetOrgId || getActiveOrgId(req);
      let teamRow = sqliteDb.prepare('SELECT id FROM team WHERE LOWER(name) = LOWER(?) AND organizationId = ?').get(deptName, teamOrgId) as any;
      if (!teamRow) {
        teamRow = sqliteDb.prepare('SELECT id FROM team WHERE LOWER(name) = LOWER(?)').get(deptName) as any;
      }
      if (!teamRow) {
        const teamId = `team_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        sqliteDb.prepare(`
          INSERT INTO team (id, name, organizationId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(teamId, deptName, teamOrgId, now, now);
        teamRow = { id: teamId };
      }
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO teamMember (id, teamId, userId, createdAt)
        VALUES (?, ?, ?, ?)
      `).run(`tm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, teamRow.id, userId, now);
    }

    syncUsersToDataStoreAndSheet();
    recordRbacAudit(req, actor, 'user.create', 'USER', userId, { role: finalRole, tenantId: targetOrgId });
    return res.json({
      success: true,
      user: {
        id: userId,
        name,
        email,
        role: finalRole,
        organizationId: targetOrgId || undefined,
        banned: false,
        createdAt: now,
      },
    });
  } catch (err: any) {
    console.error('Error creating user:', err);
    return res.status(500).json({ error: err.message || 'Failed to create user' });
  }
});

// PUT /users/:id - Update user details or role
authConsoleRouter.put('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, banned, banReason } = req.body;

    const user = sqliteDb.prepare('SELECT * FROM user WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(String(role).toLowerCase());
    }
    if (banned !== undefined) {
      updates.push('banned = ?');
      values.push(banned ? 1 : 0);
      updates.push('banReason = ?');
      values.push(banned ? (banReason || 'Banned by admin') : null);
    }

    updates.push('updatedAt = ?');
    values.push(new Date().toISOString());

    values.push(id);

    sqliteDb.prepare(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    syncUsersToDataStoreAndSheet();
    const updatedUser = sqliteDb.prepare('SELECT * FROM user WHERE id = ?').get(id);
    return res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    console.error('Error updating user:', err);
    return res.status(500).json({ error: err.message || 'Failed to update user' });
  }
});

// POST /users/:id/reset-password - Set new password for user
authConsoleRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = sqliteDb.prepare('SELECT id, email FROM user WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashed = await hashPassword(password);
    const now = new Date().toISOString();

    const existingAccount = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").get(id) as any;
    if (existingAccount) {
      sqliteDb.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').run(hashed, now, existingAccount.id);
    } else {
      const accountId = `acc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      sqliteDb.prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
      `).run(accountId, id, id, hashed, now, now, 'local:credential');
    }

    return res.json({ success: true, message: `Password reset successful for ${user.email}` });
  } catch (err: any) {
    console.error('Error resetting password:', err);
    return res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
});

// PUT /users/:id/password - Direct update password endpoint
authConsoleRouter.put('/users/:id/password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = sqliteDb.prepare('SELECT id, email FROM user WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashed = await hashPassword(password);
    const now = new Date().toISOString();

    const existingAccount = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").get(id) as any;
    if (existingAccount) {
      sqliteDb.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').run(hashed, now, existingAccount.id);
    } else {
      const accountId = `acc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      sqliteDb.prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
      `).run(accountId, id, id, hashed, now, now, 'local:credential');
    }

    return res.json({ success: true, message: `Password updated for ${user.email}` });
  } catch (err: any) {
    console.error('Error updating password:', err);
    return res.status(500).json({ error: err.message || 'Failed to update password' });
  }
});

// PUT /users/:id/role - Update user system & organization role
authConsoleRouter.put('/users/:id/role', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, organizationId, department, name, email } = req.body;
    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    const user = sqliteDb.prepare('SELECT * FROM user WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const actor = (req as any).actor as Actor | null;
    if (!actor) return res.status(401).json(authzError('UNAUTHENTICATED'));
    const currentMember = sqliteDb.prepare('SELECT organizationId FROM member WHERE userId = ?').get(id) as any;
    // Every department the target belongs to, not just the first — a Manager
    // who shares ANY one of them with the target may still act on them.
    const targetTeams = sqliteDb.prepare('SELECT t.id as departmentId FROM team t JOIN teamMember tm ON tm.teamId = t.id WHERE tm.userId = ? ORDER BY tm.createdAt ASC').all(id) as any[];
    const roleDecision = canChangeRole(actor, {
      id,
      tenantId: currentMember?.organizationId,
      departmentIds: targetTeams.map((t) => t.departmentId),
    }, role);
    if ('error' in roleDecision) return res.status(403).json(authzError(roleDecision.error));

    if (name) {
      sqliteDb.prepare('UPDATE user SET name = ? WHERE id = ?').run(String(name).trim(), id);
    }
    if (email) {
      const emailTrim = String(email).trim().toLowerCase();
      const duplicate = sqliteDb.prepare('SELECT id FROM user WHERE LOWER(email) = ? AND id != ?').get(emailTrim, id) as any;
      if (duplicate) {
        return res.status(400).json({ error: 'Email address is already in use by another user' });
      }
      sqliteDb.prepare('UPDATE user SET email = ? WHERE id = ?').run(emailTrim, id);
    }

    const normRole = String(role).toLowerCase();
    if (normRole !== 'superuser' && normRole !== 'admin') {
      const existingMember = sqliteDb.prepare('SELECT organizationId FROM member WHERE userId = ?').get(id) as any;
      if (!organizationId && !existingMember?.organizationId) {
        return res.status(400).json({ error: 'Organisasi/Tenant wajib dipilih untuk peran di bawah Superuser dan Admin.' });
      }
    }

    sqliteDb.prepare('UPDATE user SET role = ?, updatedAt = ? WHERE id = ?').run(normRole, new Date().toISOString(), id);

    if (normRole === 'superuser') {
      sqliteDb.prepare('DELETE FROM member WHERE userId = ?').run(id);
    } else if (organizationId) {
      const existingMember = sqliteDb.prepare('SELECT id FROM member WHERE userId = ?').get(id) as any;
      if (existingMember) {
        sqliteDb.prepare('UPDATE member SET organizationId = ?, role = ? WHERE userId = ?').run(organizationId, normRole, id);
      } else {
        sqliteDb.prepare(`
          INSERT INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, organizationId, id, normRole, new Date().toISOString());
      }
    } else {
      sqliteDb.prepare('UPDATE member SET role = ? WHERE userId = ?').run(normRole, id);
    }

    // Superuser and Admin operate across every department by design — never tie
    // them to a single team/department, and drop any membership they already had.
    if (normRole === 'superuser' || normRole === 'admin') {
      sqliteDb.prepare('DELETE FROM teamMember WHERE userId = ?').run(id);
    } else if (department !== undefined) {
      // If department was passed, update user's team membership
      const activeOrgId = organizationId || getActiveOrgId(req);
      const deptName = String(department).trim();
      if (deptName) {
        let teamRow = sqliteDb.prepare('SELECT id FROM team WHERE LOWER(name) = LOWER(?)').get(deptName) as any;
        if (!teamRow) {
          const teamId = `team_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          sqliteDb.prepare(`
            INSERT INTO team (id, name, organizationId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(teamId, deptName, activeOrgId, new Date().toISOString(), new Date().toISOString());
          teamRow = { id: teamId };
        }
        // Remove existing team memberships and add new one
        sqliteDb.prepare('DELETE FROM teamMember WHERE userId = ?').run(id);
        sqliteDb.prepare(`
          INSERT INTO teamMember (id, teamId, userId, createdAt)
          VALUES (?, ?, ?, ?)
        `).run(`tm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, teamRow.id, id, new Date().toISOString());
      }
    }

    recordRbacAudit(req, actor, 'user.role.assign', 'USER', id, { newRole: normRole });
    syncUsersToDataStoreAndSheet();
    const updatedUser = sqliteDb.prepare('SELECT * FROM user WHERE id = ?').get(id);
    return res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    console.error('Error updating user role:', err);
    return res.status(500).json({ error: err.message || 'Failed to update user role' });
  }
});

// POST /users/:id/ban - Ban or unban a user
authConsoleRouter.post('/users/:id/ban', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { banned, banReason } = req.body;

    const user = sqliteDb.prepare('SELECT * FROM user WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isBanned = Boolean(banned);
    const reason = isBanned ? (banReason || 'Dicekal oleh admin sistem') : null;
    sqliteDb.prepare('UPDATE user SET banned = ?, banReason = ?, updatedAt = ? WHERE id = ?')
      .run(isBanned ? 1 : 0, reason, new Date().toISOString(), id);

    if (isBanned) {
      // Revoke all sessions for banned user immediately
      sqliteDb.prepare('DELETE FROM session WHERE userId = ?').run(id);
    }

    syncUsersToDataStoreAndSheet();
    const updatedUser = sqliteDb.prepare('SELECT * FROM user WHERE id = ?').get(id);
    return res.json({ success: true, user: updatedUser, message: isBanned ? 'Pengguna berhasil dicekal' : 'Status cekal pengguna telah dicabut' });
  } catch (err: any) {
    console.error('Error updating ban status:', err);
    return res.status(500).json({ error: err.message || 'Failed to update ban status' });
  }
});

// DELETE /users/:id - Delete user and associated records
authConsoleRouter.delete('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare('DELETE FROM session WHERE userId = ?').run(id);
    sqliteDb.prepare('DELETE FROM account WHERE userId = ?').run(id);
    sqliteDb.prepare('DELETE FROM member WHERE userId = ?').run(id);
    sqliteDb.prepare('DELETE FROM teamMember WHERE userId = ?').run(id);
    sqliteDb.prepare('DELETE FROM user WHERE id = ?').run(id);
    syncUsersToDataStoreAndSheet();
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
});

// POST /users/bulk-action - Perform bulk actions (ban, unban, delete)
authConsoleRouter.post('/users/bulk-action', (req: Request, res: Response) => {
  try {
    const { action, userIds } = req.body;
    if (!action || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Action and non-empty userIds array are required' });
    }

    if (action === 'ban') {
      const stmt = sqliteDb.prepare('UPDATE user SET banned = 1, banReason = ?, updatedAt = ? WHERE id = ?');
      const deleteSessionStmt = sqliteDb.prepare('DELETE FROM session WHERE userId = ?');
      
      const transaction = sqliteDb.transaction((ids: string[]) => {
        for (const id of ids) {
          stmt.run('Dicekal secara massal oleh admin', new Date().toISOString(), id);
          deleteSessionStmt.run(id);
        }
      });
      transaction(userIds);
      
      syncUsersToDataStoreAndSheet();
      return res.json({ success: true, message: `${userIds.length} pengguna berhasil dicekal secara massal` });
    } 
    
    if (action === 'unban') {
      const stmt = sqliteDb.prepare('UPDATE user SET banned = 0, banReason = NULL, updatedAt = ? WHERE id = ?');
      
      const transaction = sqliteDb.transaction((ids: string[]) => {
        for (const id of ids) {
          stmt.run(new Date().toISOString(), id);
        }
      });
      transaction(userIds);
      
      syncUsersToDataStoreAndSheet();
      return res.json({ success: true, message: `Status cekal ${userIds.length} pengguna berhasil dicabut` });
    } 
    
    if (action === 'delete') {
      const deleteSession = sqliteDb.prepare('DELETE FROM session WHERE userId = ?');
      const deleteAccount = sqliteDb.prepare('DELETE FROM account WHERE userId = ?');
      const deleteMember = sqliteDb.prepare('DELETE FROM member WHERE userId = ?');
      const deleteTeamMember = sqliteDb.prepare('DELETE FROM teamMember WHERE userId = ?');
      const deleteUser = sqliteDb.prepare('DELETE FROM user WHERE id = ?');
      
      const transaction = sqliteDb.transaction((ids: string[]) => {
        for (const id of ids) {
          deleteSession.run(id);
          deleteAccount.run(id);
          deleteMember.run(id);
          deleteTeamMember.run(id);
          deleteUser.run(id);
        }
      });
      transaction(userIds);
      
      syncUsersToDataStoreAndSheet();
      return res.json({ success: true, message: `${userIds.length} pengguna berhasil dihapus secara massal` });
    }

    return res.status(400).json({ error: 'Invalid bulk action' });
  } catch (err: any) {
    console.error('Error executing bulk action:', err);
    return res.status(500).json({ error: err.message || 'Failed to execute bulk action' });
  }
});

// 3. GET /accounts - List all linked auth provider accounts
authConsoleRouter.get('/accounts', (req: Request, res: Response) => {
  try {
    const tenantId = getConsoleTenantScope(req);
    const accounts = sqliteDb.prepare(`
      SELECT 
        a.id, 
        a.accountId, 
        a.providerId, 
        a.userId, 
        a.createdAt, 
        a.updatedAt,
        CASE WHEN a.password IS NOT NULL THEN 1 ELSE 0 END as hasPassword,
        u.name as userName,
        u.email as userEmail,
        u.role as userRole
      FROM account a
      LEFT JOIN user u ON a.userId = u.id
      LEFT JOIN member scopedMember ON scopedMember.userId = a.userId
      WHERE (? IS NULL OR scopedMember.organizationId = ?)
      ORDER BY a.createdAt DESC
    `).all(tenantId, tenantId);

    return res.json({
      success: true,
      accounts: accounts.map((a: any) => ({
        ...a,
        hasPassword: Boolean(a.hasPassword),
      })),
    });
  } catch (err: any) {
    console.error('Error listing accounts:', err);
    return res.status(500).json({ error: err.message || 'Failed to list accounts' });
  }
});

// 4. GET /sessions - List active sessions
authConsoleRouter.get('/sessions', (req: Request, res: Response) => {
  try {
    const sessions = sqliteDb.prepare(`
      SELECT 
        s.id, 
        s.token, 
        s.createdAt, 
        s.updatedAt, 
        s.expiresAt, 
        s.ipAddress, 
        s.userAgent, 
        s.userId,
        s.impersonatedBy,
        s.activeOrganizationId,
        u.name as userName,
        u.email as userEmail,
        u.role as userRole
      FROM session s
      LEFT JOIN user u ON s.userId = u.id
      ORDER BY s.createdAt DESC
    `).all();

    const now = new Date();
    return res.json({
      success: true,
      sessions: sessions.map((s: any) => ({
        ...s,
        tokenPreview: s.token ? `${s.token.slice(0, 10)}...${s.token.slice(-6)}` : '',
        isExpired: s.expiresAt ? new Date(s.expiresAt) < now : false,
      })),
    });
  } catch (err: any) {
    console.error('Error listing sessions:', err);
    return res.status(500).json({ error: err.message || 'Failed to list sessions' });
  }
});

// DELETE /sessions/:id - Revoke single session
authConsoleRouter.delete('/sessions/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare('DELETE FROM session WHERE id = ? OR token = ?').run(id, id);
    return res.json({ success: true, message: 'Session revoked successfully' });
  } catch (err: any) {
    console.error('Error revoking session:', err);
    return res.status(500).json({ error: err.message || 'Failed to revoke session' });
  }
});

// POST /sessions/revoke-user - Revoke all sessions for a user
authConsoleRouter.post('/sessions/revoke-user', (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    sqliteDb.prepare('DELETE FROM session WHERE userId = ?').run(userId);
    return res.json({ success: true, message: `All sessions revoked for user ${userId}` });
  } catch (err: any) {
    console.error('Error revoking user sessions:', err);
    return res.status(500).json({ error: err.message || 'Failed to revoke user sessions' });
  }
});

// POST /sessions/revoke-all/:userId - Param-based alias for revoking all sessions of a user
authConsoleRouter.post('/sessions/revoke-all/:userId', (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    sqliteDb.prepare('DELETE FROM session WHERE userId = ?').run(userId);
    return res.json({ success: true, message: `All sessions revoked for user ${userId}` });
  } catch (err: any) {
    console.error('Error revoking user sessions:', err);
    return res.status(500).json({ error: err.message || 'Failed to revoke user sessions' });
  }
});

// 5. GET /organizations - List all organizations
authConsoleRouter.get('/organizations', (req: Request, res: Response) => {
  try {
    const tenantId = getConsoleTenantScope(req);
    const orgs = sqliteDb.prepare(`
      SELECT 
        o.id, 
        o.name, 
        o.slug, 
        o.logo, 
        o.createdAt, 
        o.metadata,
        (SELECT COUNT(*) FROM member WHERE organizationId = o.id) as memberCount,
        (SELECT COUNT(*) FROM team WHERE organizationId = o.id) as teamCount
      FROM organization o
      WHERE (? IS NULL OR o.id = ?)
      ORDER BY o.createdAt ASC
    `).all(tenantId, tenantId);

    return res.json({
      success: true,
      organizations: orgs.map((o: any) => {
        let parsedMetadata = {};
        try {
          if (o.metadata) parsedMetadata = JSON.parse(o.metadata);
        } catch (e) {}
        return {
          ...o,
          metadata: parsedMetadata,
        };
      }),
    });
  } catch (err: any) {
    console.error('Error listing organizations:', err);
    return res.status(500).json({ error: err.message || 'Failed to list organizations' });
  }
});

// Keep the app's tenant projection in the same SQLite-backed store as auth.
function syncTenantsToDataStore(): void {
  try {
    const orgRows = sqliteDb.prepare('SELECT * FROM organization ORDER BY createdAt ASC').all() as any[];
    if (orgRows && orgRows.length > 0 && globalDbRef) {
      const updatedTenants = orgRows.map((org: any) => {
        let meta: any = {};
        try {
          if (org.metadata) {
            meta = typeof org.metadata === 'string' ? JSON.parse(org.metadata) : org.metadata;
          }
        } catch {}

        const existing = (globalDbRef.tenants || []).find((t: any) => t.id === org.id || t.domainSlug === org.slug);
        const settings = resolveTenantSettings({ settings: existing?.settings || meta.settings, currency: existing?.currency || meta.currency });
        const isDefault = Boolean(existing?.isDefault);
        const spreadsheetId = existing?.spreadsheetId || meta.spreadsheetId || (isDefault ? globalDbRef.googleConfig?.spreadsheetId : undefined);
        const driveFolderId = existing?.driveFolderId || meta.driveFolderId || (isDefault ? globalDbRef.googleConfig?.driveFolderId : undefined);
        return {
          id: org.id,
          name: org.name,
          legalEntity: existing?.legalEntity || meta.legalEntity || '',
          brandName: org.name,
          tagline: meta.tagline || existing?.tagline || 'Contract Lifecycle Management',
          logoUrl: org.logo || existing?.logoUrl || '/favicon.png',
          primaryColor: meta.primaryColor || existing?.primaryColor || '#06C755',
          currency: settings.defaultCurrency,
          settings,
          domainSlug: org.slug,
          isDefault,
          spreadsheetId,
          spreadsheetUrl: existing?.spreadsheetUrl || meta.spreadsheetUrl || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : undefined),
          driveFolderId,
          driveFolderLink: existing?.driveFolderLink || meta.driveFolderLink || (driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : undefined),
        };
      });

      globalDbRef.tenants = updatedTenants;
      if (!globalDbRef.tenants.some((t: any) => t.id === globalDbRef.activeTenantId)) {
        globalDbRef.activeTenantId = globalDbRef.tenants[0]?.id || getDefaultTenantId();
      }
      if (saveDbFnRef) saveDbFnRef();
    }
  } catch (err) {
    console.warn('Error syncing tenant projection to SQLite:', err);
  }
}

// POST /organizations - Create organization
authConsoleRouter.post('/organizations', (req: Request, res: Response) => {
  try {
    const { name, slug, logo, metadata } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const orgId = `org_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const generatedSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-')).toLowerCase();
    const now = new Date().toISOString();

    sqliteDb.prepare(`
      INSERT INTO organization (id, name, slug, logo, createdAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      orgId,
      name,
      generatedSlug,
      logo || '/favicon.png',
      now,
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {})
    );

    // Create default teams for this organization
    sqliteDb.prepare(`
      INSERT INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
      VALUES (?, 'General', 0, ?, ?, ?)
    `).run(`team_${Date.now()}_gen`, orgId, now, now);

    
    syncTenantsToDataStore();

    return res.json({
      success: true,
      organization: {
        id: orgId,
        name,
        slug: generatedSlug,
        logo: logo || '/favicon.png',
        createdAt: now,
        metadata,
      },
    });
  } catch (err: any) {
    console.error('Error creating organization:', err);
    return res.status(500).json({ error: err.message || 'Failed to create organization' });
  }
});

// PUT /organizations/:id - Update organization
authConsoleRouter.put('/organizations/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, logo, metadata } = req.body;

    const org = sqliteDb.prepare('SELECT * FROM organization WHERE id = ?').get(id) as any;
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push('slug = ?');
      values.push(slug);
    }
    if (logo !== undefined) {
      updates.push('logo = ?');
      values.push(logo);
    }
    if (metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    }

    if (updates.length > 0) {
      values.push(id);
      sqliteDb.prepare(`UPDATE organization SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      
      syncTenantsToDataStore();
    }

    return res.json({ success: true, message: 'Organization updated' });
  } catch (err: any) {
    console.error('Error updating organization:', err);
    return res.status(500).json({ error: err.message || 'Failed to update organization' });
  }
});

// POST /organizations/:id/set-active - Set active organization for the current session
authConsoleRouter.post('/organizations/:id/set-active', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (globalDbRef) {
      globalDbRef.activeTenantId = id;
      if (saveDbFnRef) {
        try {
          saveDbFnRef();
        } catch {}
      }
    }

    // Find the session using token from auth header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      sqliteDb.prepare('UPDATE session SET activeOrganizationId = ?, updatedAt = ? WHERE token = ?')
        .run(id, new Date().toISOString(), token);
    }

    return res.json({ success: true, message: `Active organization set to ${id}`, activeTenantId: id });
  } catch (err: any) {
    console.error('Error setting active organization:', err);
    return res.status(500).json({ error: err.message || 'Failed to set active organization' });
  }
});

// DELETE /organizations/:id - Delete organization
authConsoleRouter.delete('/organizations/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Prevent deleting the default organization if it's the only one
    const count = (sqliteDb.prepare('SELECT COUNT(*) as count FROM organization').get() as any)?.count || 0;
    if (count <= 1) {
      return res.status(400).json({ error: 'Tidak dapat menghapus satu-satunya organisasi yang tersisa' });
    }

    const isDefaultTenant = Boolean((globalDbRef?.tenants || []).find((t: any) => t.id === id)?.isDefault);
    if (isDefaultTenant) {
      return res.status(400).json({ error: 'Organisasi default sistem tidak dapat dihapus' });
    }

    sqliteDb.prepare('DELETE FROM member WHERE organizationId = ?').run(id);
    sqliteDb.prepare('DELETE FROM team WHERE organizationId = ?').run(id);
    sqliteDb.prepare('DELETE FROM invitation WHERE organizationId = ?').run(id);
    sqliteDb.prepare('DELETE FROM organization WHERE id = ?').run(id);

    syncTenantsToDataStore();
    return res.json({ success: true, message: 'Organization deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting organization:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete organization' });
  }
});

// 6. GET /teams - List teams for active org
authConsoleRouter.get('/teams', (req: Request, res: Response) => {
  try {
    // System Admin (superuser) sees departments across every organization —
    // getConsoleTenantScope returns null for superuser, matching /users and
    // /invitations. Only the seeding fallback below needs one concrete org.
    const tenantScope = getConsoleTenantScope(req);
    let teams = sqliteDb.prepare(`
      SELECT
        t.id,
        t.name,
        t.organizationId,
        t.createdAt,
        t.updatedAt,
        (SELECT COUNT(*) FROM teamMember WHERE teamId = t.id) as memberCount,
        o.name as organizationName
      FROM team t
      LEFT JOIN organization o ON t.organizationId = o.id
      WHERE (? IS NULL OR t.organizationId = ?)
      ORDER BY t.createdAt ASC
    `).all(tenantScope, tenantScope);

    // If SQLite has no teams for this org, check if globalDbRef.departments has any to populate.
    // Seeding always needs one concrete organization id — a department can't be filed under "ALL".
    if (teams.length === 0 && globalDbRef && globalDbRef.departments && globalDbRef.departments.length > 0) {
      const seedOrgId = getActiveOrgId(req);
      const now = new Date().toISOString();
      for (const dept of globalDbRef.departments) {
        // Only trust dept.organizationId when it's an org that actually exists — legacy
        // records have been seen with the department's own name stored in this field.
        const deptOrgIsValid = dept.organizationId
          && (sqliteDb.prepare('SELECT 1 FROM organization WHERE id = ?').get(dept.organizationId) as any);
        const dOrgId = deptOrgIsValid ? dept.organizationId : seedOrgId;
        if (tenantScope === null || dOrgId === tenantScope) {
          try {
            sqliteDb.prepare(`
              INSERT OR IGNORE INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
              VALUES (?, ?, 0, ?, ?, ?)
            `).run(dept.id || `team_${Date.now()}`, dept.name, dOrgId, dept.created_at || now, dept.updated_at || now);
          } catch (e) {}
        }
      }
      teams = sqliteDb.prepare(`
        SELECT
          t.id,
          t.name,
          t.organizationId,
          t.createdAt,
          t.updatedAt,
          (SELECT COUNT(*) FROM teamMember WHERE teamId = t.id) as memberCount,
          o.name as organizationName
        FROM team t
        LEFT JOIN organization o ON t.organizationId = o.id
        WHERE (? IS NULL OR t.organizationId = ?)
        ORDER BY t.createdAt ASC
      `).all(tenantScope, tenantScope);
    }

    // Fetch members for each team
    const teamsWithMembers = teams.map((team: any) => {
      const members = sqliteDb.prepare(`
        SELECT tm.id as membershipId, tm.userId, tm.createdAt as joinedAt, u.name, u.email, u.role
        FROM teamMember tm
        JOIN user u ON tm.userId = u.id
        WHERE tm.teamId = ?
      `).all(team.id);

      return {
        ...team,
        members,
      };
    });

    return res.json({ success: true, teams: teamsWithMembers });
  } catch (err: any) {
    console.error('Error listing teams:', err);
    return res.status(500).json({ error: err.message || 'Failed to list teams' });
  }
});

// POST /teams - Create team / department
authConsoleRouter.post('/teams', (req: Request, res: Response) => {
  try {
    const { name, organizationId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama tim / departemen wajib diisi' });
    }

    const trimmedName = name.trim();
    const orgId = organizationId || getActiveOrgId(req);
    const teamId = `team_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    // 1. Insert into SQLite team table
    sqliteDb.prepare(`
      INSERT INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
      VALUES (?, ?, 0, ?, ?, ?)
    `).run(teamId, trimmedName, orgId, now, now);

    // 2. Sync to in-memory db.departments for Master Google Sheet
    if (globalDbRef) {
      if (!globalDbRef.departments) globalDbRef.departments = [];
      const exists = globalDbRef.departments.some(
        (d: any) => d.id === teamId || (d.name.toLowerCase() === trimmedName.toLowerCase() && (d.organizationId === orgId || !d.organizationId))
      );
      if (!exists) {
        globalDbRef.departments.push({
          id: teamId,
          organizationId: orgId,
          name: trimmedName,
          code: trimmedName.substring(0, 3).toUpperCase(),
          description: '',
          created_at: now,
          updated_at: now,
        });
      }
      if (saveDbFnRef) saveDbFnRef();
    }

    return res.json({
      success: true,
      team: {
        id: teamId,
        name: trimmedName,
        organizationId: orgId,
        memberCount: 0,
        createdAt: now,
      },
    });
  } catch (err: any) {
    console.error('Error creating team:', err);
    return res.status(500).json({ error: err.message || 'Failed to create team' });
  }
});

// PUT /teams/:id - Update team / department name
authConsoleRouter.put('/teams/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nama tim / departemen wajib diisi.' });
    }
    const trimmedName = name.trim();
    const existing = sqliteDb.prepare('SELECT * FROM team WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Tim / departemen tidak ditemukan.' });
    }

    const oldName = existing.name;
    sqliteDb.prepare('UPDATE team SET name = ? WHERE id = ?').run(trimmedName, id);

    // Update in-memory db.departments & users if needed
    if (globalDbRef && globalDbRef.departments) {
      const idx = globalDbRef.departments.findIndex((d: any) => d.id === id || d.name === oldName);
      if (idx !== -1) {
        globalDbRef.departments[idx].name = trimmedName;
      }
      if (globalDbRef.users) {
        globalDbRef.users.forEach((u: any) => {
          if (u.department === oldName) u.department = trimmedName;
        });
      }
      if (saveDbFnRef) saveDbFnRef();
    }

    return res.json({ success: true, team: { ...existing, name: trimmedName } });
  } catch (err: any) {
    console.error('Error updating team:', err);
    return res.status(500).json({ error: err.message || 'Gagal memperbarui departemen' });
  }
});

// DELETE /teams/:id - Delete team / department
authConsoleRouter.delete('/teams/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare('DELETE FROM teamMember WHERE teamId = ?').run(id);
    sqliteDb.prepare('DELETE FROM team WHERE id = ?').run(id);

    // Update in-memory db.departments & save
    if (globalDbRef && globalDbRef.departments) {
      globalDbRef.departments = globalDbRef.departments.filter(
        (d: any) => d.id !== id && d.name !== id
      );
      if (saveDbFnRef) saveDbFnRef();
    }

    return res.json({ success: true, message: 'Team deleted' });
  } catch (err: any) {
    console.error('Error deleting team:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete team' });
  }
});

// POST /teams/:id/members - Add user to team
authConsoleRouter.post('/teams/:id/members', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const memId = `tm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    sqliteDb.prepare(`
      INSERT OR REPLACE INTO teamMember (id, teamId, userId, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(memId, id, userId, now);

    // Update member count
    const count = (sqliteDb.prepare('SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?').get(id) as any)?.count || 0;
    sqliteDb.prepare('UPDATE team SET memberCount = ?, updatedAt = ? WHERE id = ?').run(count, now, id);

    return res.json({ success: true, message: 'Member added to team' });
  } catch (err: any) {
    console.error('Error adding team member:', err);
    return res.status(500).json({ error: err.message || 'Failed to add team member' });
  }
});

// DELETE /teams/:id/members/:userId - Remove member from team
authConsoleRouter.delete('/teams/:id/members/:userId', (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    sqliteDb.prepare('DELETE FROM teamMember WHERE teamId = ? AND userId = ?').run(id, userId);

    const now = new Date().toISOString();
    const count = (sqliteDb.prepare('SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?').get(id) as any)?.count || 0;
    sqliteDb.prepare('UPDATE team SET memberCount = ?, updatedAt = ? WHERE id = ?').run(count, now, id);

    return res.json({ success: true, message: 'Member removed from team' });
  } catch (err: any) {
    console.error('Error removing team member:', err);
    return res.status(500).json({ error: err.message || 'Failed to remove team member' });
  }
});

// 7. GET /invitations - List invitations
authConsoleRouter.get('/invitations', (req: Request, res: Response) => {
  try {
    const orgId = getActiveOrgId(req);
    const invitations = sqliteDb.prepare(`
      SELECT 
        i.id, 
        i.organizationId, 
        i.email, 
        i.role, 
        i.teamId, 
        i.status, 
        i.expiresAt, 
        i.createdAt, 
        i.inviterId,
        o.name as organizationName,
        t.name as teamName,
        u.name as inviterName
      FROM invitation i
      LEFT JOIN organization o ON i.organizationId = o.id
      LEFT JOIN team t ON i.teamId = t.id
      LEFT JOIN user u ON i.inviterId = u.id
      WHERE (? IS NULL OR i.organizationId = ?)
      ORDER BY i.createdAt DESC
    `).all(getConsoleTenantScope(req), getConsoleTenantScope(req));

    return res.json({ success: true, invitations });
  } catch (err: any) {
    console.error('Error listing invitations:', err);
    return res.status(500).json({ error: err.message || 'Failed to list invitations' });
  }
});

// Helper: Dispatch Invitation Email via SMTP Relay if configured
async function dispatchInvitationEmail(
  inv: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    inviterName?: string;
    expiresAt: string;
  },
  req: Request
): Promise<{ sent: boolean; message: string; inviteUrl: string; smtpActive: boolean }> {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
  const baseUrl = `${protocol}://${host}`;
  const inviteUrl = `${baseUrl}/?accept_invite=${inv.id}&email=${encodeURIComponent(inv.email)}`;

  let orgName = 'Silegal';
  if (inv.organizationId) {
    try {
      const org = sqliteDb.prepare('SELECT name FROM organization WHERE id = ?').get(inv.organizationId) as any;
      if (org?.name) orgName = org.name;
    } catch (_) {}
  }

  const smtpConfig = globalDbRef?.googleConfig;
  const isSmtpEnabled = Boolean(smtpConfig && smtpConfig.smtpEnabled && smtpConfig.smtpHost && smtpConfig.smtpUser);

  if (isSmtpEnabled) {
    try {
      const port = Number(smtpConfig.smtpPort) || (smtpConfig.smtpSecure ? 465 : 587);
      const transporter = nodemailer.createTransport({
        host: smtpConfig.smtpHost,
        port,
        secure: smtpConfig.smtpSecure ?? port === 465,
        auth: { user: smtpConfig.smtpUser, pass: smtpConfig.smtpPassword || '' },
        tls: { rejectUnauthorized: false },
      });

      const fromAddress = smtpConfig.smtpFromEmail || smtpConfig.smtpUser;
      const fromName = smtpConfig.smtpFromName || `${orgName} Admin Console`;
      const inviter = inv.inviterName || 'Administrator';

      const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
      const role = esc(String(inv.role || '').toUpperCase());
      const subject = `Invitation to join ${orgName} on Silegal (${String(inv.role || '').toUpperCase()})`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #06C755;">
            <h2 style="color: #0f172a; margin: 0; font-size: 20px;">You're invited</h2>
            <p style="color: #475569; font-size: 13px; margin-top: 4px;">${esc(orgName)}</p>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hello,</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            <strong>${esc(inviter)}</strong> invited you to join <strong>${esc(orgName)}</strong> as <strong>${role}</strong> on Silegal.
          </p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;">
            <p style="margin: 0; font-size: 13px; color: #475569;"><strong>E-mail:</strong> ${esc(inv.email)}</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;"><strong>Role:</strong> ${role}</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;"><strong>Valid until:</strong> ${esc(new Date(inv.expiresAt).toISOString().slice(0, 10))}</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${esc(inviteUrl)}" style="background-color: #06C755; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
              Accept invitation
            </a>
          </div>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px; text-align: center;">
            Or copy this link into your browser:<br>
            <a href="${esc(inviteUrl)}" style="color: #0284c7; word-break: break-all;">${esc(inviteUrl)}</a>
          </p>
        </div>
      `;

      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: inv.email,
        subject,
        html,
      });

      return {
        sent: true,
        smtpActive: true,
        message: `Email undangan resmi telah sukses dikirim langsung ke inbox ${inv.email} via SMTP Relay (${fromAddress}).`,
        inviteUrl,
      };
    } catch (err: any) {
      console.warn('[Invitation Email SMTP Error]', err?.message);
      return {
        sent: false,
        smtpActive: true,
        message: `Undangan tersimpan, namun pengiriman email via SMTP Relay gagal: ${err?.message || 'Error SMTP'}. Gunakan tombol Salin Link Undangan sebagai alternatif.`,
        inviteUrl,
      };
    }
  }

  return {
    sent: false,
    smtpActive: false,
    message: `Undangan berhasil dicatat resmi di sistem. (Catatan: Aktifkan 'SMTP Relay Server' di menu Settings agar email otomatis langsung terkirim ke inbox ${inv.email}).`,
    inviteUrl,
  };
}

// POST /invitations - Create invitation
authConsoleRouter.post('/invitations', async (req: Request, res: Response) => {
  try {
    const { email, role = 'staff', teamId, organizationId } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const orgId = organizationId || getActiveOrgId(req);
    const invId = `inv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    sqliteDb.prepare(`
      INSERT INTO invitation (id, organizationId, email, role, teamId, status, expiresAt, createdAt, inviterId)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 'admin')
    `).run(invId, orgId, email, role, teamId || null, expires.toISOString(), now.toISOString());

    const invData = {
      id: invId,
      email,
      role,
      organizationId: orgId,
      teamId,
      status: 'pending',
      expiresAt: expires.toISOString(),
      inviterName: 'Admin',
    };

    const emailRes = await dispatchInvitationEmail(invData, req);

    return res.json({
      success: true,
      message: emailRes.message,
      inviteUrl: emailRes.inviteUrl,
      sentViaSmtp: emailRes.sent,
      smtpActive: emailRes.smtpActive,
      invitation: {
        ...invData,
        inviteUrl: emailRes.inviteUrl,
      },
    });
  } catch (err: any) {
    console.error('Error creating invitation:', err);
    return res.status(500).json({ error: err.message || 'Failed to create invitation' });
  }
});

// POST /invitations/:id/resend - Resend invitation
authConsoleRouter.post('/invitations/:id/resend', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    sqliteDb.prepare('UPDATE invitation SET expiresAt = ?, status = ? WHERE id = ?').run(expires.toISOString(), 'pending', id);

    const inv = sqliteDb.prepare('SELECT * FROM invitation WHERE id = ?').get(id) as any;
    let emailRes: any = null;
    if (inv) {
      emailRes = await dispatchInvitationEmail({
        id: inv.id,
        email: inv.email,
        role: inv.role || 'staff',
        organizationId: inv.organizationId,
        inviterName: 'Admin',
        expiresAt: expires.toISOString(),
      }, req);
    }

    return res.json({
      success: true,
      message: emailRes?.message || 'Undangan berhasil diperbarui dan dikirim ulang.',
      inviteUrl: emailRes?.inviteUrl,
      sentViaSmtp: emailRes?.sent || false,
    });
  } catch (err: any) {
    console.error('Error resending invitation:', err);
    return res.status(500).json({ error: err.message || 'Failed to resend invitation' });
  }
});

// GET /invitations/verify - Verify invitation code
authConsoleRouter.get('/invitations/verify', (req: Request, res: Response) => {
  try {
    const code = (req.query.code || req.query.accept_invite) as string;
    if (!code) {
      return res.status(400).json({ error: 'Kode undangan wajib diisi' });
    }
    const inv = sqliteDb.prepare(`
      SELECT i.*, o.name as organizationName
      FROM invitation i
      LEFT JOIN organization o ON i.organizationId = o.id
      WHERE i.id = ?
    `).get(code) as any;

    if (!inv) {
      return res.status(404).json({ error: 'Kode undangan tidak ditemukan' });
    }
    const isExpired = new Date(inv.expiresAt) < new Date();
    if (isExpired || inv.status === 'expired') {
      return res.status(400).json({ error: 'Undangan telah kadaluarsa', invitation: inv });
    }
    if (inv.status === 'accepted') {
      return res.status(400).json({ error: 'Undangan ini sudah pernah diterima sebelumnya', invitation: inv });
    }

    return res.json({ success: true, invitation: inv });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gagal memverifikasi undangan' });
  }
});

// POST /invitations/accept - Accept invitation
authConsoleRouter.post('/invitations/accept', (req: Request, res: Response) => {
  try {
    const { code, name } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Kode undangan wajib diisi' });
    }
    const inv = sqliteDb.prepare('SELECT * FROM invitation WHERE id = ?').get(code) as any;
    if (!inv) {
      return res.status(404).json({ error: 'Undangan tidak ditemukan' });
    }
    if (inv.status === 'accepted') {
      return res.status(400).json({ error: 'Undangan ini sudah diterima' });
    }
    if (new Date(inv.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Undangan telah kadaluarsa' });
    }

    // 1. Find or create user
    let user = sqliteDb.prepare('SELECT id, email, name FROM user WHERE email = ?').get(inv.email) as any;
    const now = new Date().toISOString();
    let userId = user?.id;

    if (!user) {
      userId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const userName = name || inv.email.split('@')[0];
      sqliteDb.prepare(`
        INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, ?, ?, ?)
      `).run(userId, userName, inv.email, inv.role || 'staff', now, now);
    }

    // 2. Add to member table
    const existingMember = sqliteDb.prepare('SELECT id FROM member WHERE organizationId = ? AND userId = ?').get(inv.organizationId, userId);
    if (!existingMember) {
      const memberId = `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      sqliteDb.prepare(`
        INSERT INTO member (id, organizationId, userId, role, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(memberId, inv.organizationId, userId, inv.role || 'staff', now);
    }

    // 3. Mark invitation accepted
    sqliteDb.prepare('UPDATE invitation SET status = ? WHERE id = ?').run('accepted', code);

    return res.json({
      success: true,
      message: `Selamat! Anda telah resmi bergabung ke organisasi sebagai ${inv.role || 'staff'}.`,
      user: { id: userId, email: inv.email },
    });
  } catch (err: any) {
    console.error('Error accepting invitation:', err);
    return res.status(500).json({ error: err.message || 'Gagal menerima undangan' });
  }
});

// DELETE /invitations/:id - Cancel invitation
authConsoleRouter.delete('/invitations/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare('DELETE FROM invitation WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Invitation canceled' });
  } catch (err: any) {
    console.error('Error canceling invitation:', err);
    return res.status(500).json({ error: err.message || 'Failed to cancel invitation' });
  }
});

// 8. GET /api-keys - List API Keys
authConsoleRouter.get('/api-keys', (req: Request, res: Response) => {
  try {
    const keys = sqliteDb.prepare(`
      SELECT id, name, keyPreview, scopes, createdAt, expiresAt, status
      FROM apikey
      ORDER BY createdAt DESC
    `).all();

    return res.json({
      success: true,
      apiKeys: keys.map((k: any) => ({
        ...k,
        scopes: k.scopes ? k.scopes.split(',').map((s: string) => s.trim()) : [],
      })),
    });
  } catch (err: any) {
    console.error('Error listing API keys:', err);
    return res.status(500).json({ error: err.message || 'Failed to list API keys' });
  }
});

// POST /api-keys - Generate new enterprise API key
authConsoleRouter.post('/api-keys', (req: Request, res: Response) => {
  try {
    const { name, scopes = ['contract:read'], expiresInDays = 90 } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'API Key name is required' });
    }

    const keyId = `key_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const rawSecret = `ba_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyPreview = `${rawSecret.slice(0, 11)}...${rawSecret.slice(-4)}`;
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const now = new Date();
    const expires = expiresInDays ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000) : null;
    const scopeString = Array.isArray(scopes) ? scopes.join(',') : String(scopes);

    sqliteDb.prepare(`
      INSERT INTO apikey (id, name, keyPreview, keyHash, scopes, createdAt, expiresAt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(keyId, name, keyPreview, keyHash, scopeString, now.toISOString(), expires ? expires.toISOString() : null);

    // Return the rawSecret ONCE so user can copy it
    return res.json({
      success: true,
      apiKey: {
        id: keyId,
        name,
        keyPreview,
        rawSecret, // ONLY SHOWN ONCE
        secret: rawSecret,
        scopes: Array.isArray(scopes) ? scopes : [scopes],
        createdAt: now.toISOString(),
        expiresAt: expires ? expires.toISOString() : null,
      },
    });
  } catch (err: any) {
    console.error('Error generating API key:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate API key' });
  }
});

// POST /api-keys/:id/revoke - Revoke API key (set status = 'revoked')
authConsoleRouter.post('/api-keys/:id/revoke', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare('UPDATE apikey SET status = ? WHERE id = ?').run('revoked', id);
    return res.json({ success: true, message: 'API key revoked successfully' });
  } catch (err: any) {
    console.error('Error revoking API key:', err);
    return res.status(500).json({ error: err.message || 'Failed to revoke API key' });
  }
});

// DELETE /api-keys/:id - Delete API key permanently or revoke if active
authConsoleRouter.delete('/api-keys/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare('DELETE FROM apikey WHERE id = ?').run(id);
    return res.json({ success: true, message: 'API key deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting API key:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete API key' });
  }
});

// 9. GET /rbac-matrix - Comprehensive matrix of Access Control definitions
authConsoleRouter.get('/rbac-matrix', (req: Request, res: Response) => {
  try {
    const matrix = {
      statement,
      roles: {
        superuser: {
          name: 'Superuser',
          scope: 'System Level',
          description: 'Akses tertinggi: Kelola akun pengguna, peran (role), audit sistem, konfigurasi enterprise, serta memiliki seluruh kontrol dan approval dokumen operasional (seperti Admin) secara global.',
          permissions: {
            user: ['create', 'list', 'set-role', 'ban', 'delete', 'set-password', 'set-email', 'get', 'update', 'read'],
            session: ['list', 'revoke', 'delete'],
            organization: ['create', 'read', 'update', 'delete', 'set-active'],
            team: ['create', 'read', 'update', 'delete'],
            settings: ['read', 'update'],
            audit: ['view'],
            contract: ['create', 'read', 'update', 'delete', 'approve', 'archive'],
            partner: ['create', 'read', 'update', 'delete'],
            report: ['view', 'export'],
          },
        },
        admin: {
          name: 'Admin',
          scope: 'Global Level',
          description: 'Tinjau, edit, dan berikan persetujuan akhir (final approval) seluruh dokumen perusahaan di semua departemen.',
          permissions: {
            user: ['read', 'list'],
            session: ['list'],
            organization: ['read'],
            team: ['read'],
            contract: ['create', 'read', 'update', 'delete', 'approve', 'archive'],
            partner: ['create', 'read', 'update', 'delete'],
            report: ['view', 'export'],
            audit: ['view'],
            settings: ['read'],
          },
        },
        manager: {
          name: 'Manager',
          scope: 'Group / Dept Level',
          description: 'Persetujuan internal tingkat departemen sebelum dokumen diajukan ke Approver final.',
          permissions: {
            user: ['read'],
            session: [],
            organization: ['read'],
            team: ['read'],
            contract: ['create', 'read', 'update', 'approve-internal'],
            partner: ['create', 'read', 'update'],
            report: ['view'],
            settings: [],
          },
        },
        editor: {
          name: 'Editor',
          scope: 'Group / Dept Level',
          description: 'Buat, unggah, dan revisi draf dokumen mitra dan kontrak di lingkup departemennya.',
          permissions: {
            user: ['read'],
            session: [],
            organization: ['read'],
            team: ['read'],
            contract: ['create', 'read', 'update'],
            partner: ['create', 'read', 'update'],
            report: ['view'],
            settings: [],
          },
        },
        viewer: {
          name: 'Viewer',
          scope: 'Restricted / Read-Only',
          description: 'Hanya membaca dan melihat dokumen yang sudah berstatus final/aktif pada departemennya.',
          permissions: {
            user: ['read'],
            session: [],
            organization: ['read'],
            team: ['read'],
            contract: ['read'],
            partner: ['read'],
            report: ['view'],
            settings: [],
          },
        },
        // Legacy roles for backwards compatibility
        legal: {
          name: 'Legal Counsel (Legacy)',
          scope: 'Group Level',
          description: 'Penyusunan & peninjauan kontrak, addendum, due diligence vendor, dan kepatuhan hukum.',
          permissions: {
            user: ['read'],
            session: [],
            organization: ['read'],
            team: ['read'],
            contract: ['create', 'read', 'update'],
            partner: ['create', 'read', 'update'],
            report: ['view'],
            settings: [],
          },
        },
        finance: {
          name: 'Finance & Accounting (Legacy)',
          scope: 'Group Level',
          description: 'Pengelolaan nilai transaksi, insertion order (IO), invoice, pengeluaran, dan ekspor laporan.',
          permissions: {
            user: ['read'],
            session: [],
            organization: ['read'],
            team: ['read'],
            contract: ['read'],
            partner: ['read'],
            report: ['view', 'export'],
            settings: [],
          },
        },
        staff: {
          name: 'General Staff (Legacy)',
          scope: 'Read-Only',
          description: 'Akses lihat dokumen aktif dan direktori mitra.',
          permissions: {
            user: ['read'],
            session: [],
            organization: ['read'],
            team: ['read'],
            contract: ['read'],
            partner: ['read'],
            report: ['view'],
            settings: [],
          },
        },
      },
    };

    return res.json({ success: true, matrix });
  } catch (err: any) {
    console.error('Error fetching RBAC matrix:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch RBAC matrix' });
  }
});

// 10. SQLite Database Status & Metrics
authConsoleRouter.get('/sqlite/status', (req: Request, res: Response) => {
  try {
    const dbPath = path.join(process.cwd(), 'auth.db');
    let fileSizeBytes = 0;
    let modifiedAt: string | null = null;
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      fileSizeBytes = stat.size;
      modifiedAt = stat.mtime.toISOString();
    }

    const journalModeRow = sqliteDb.prepare('PRAGMA journal_mode').get() as any;
    const versionRow = sqliteDb.prepare('SELECT sqlite_version() as version').get() as any;
    const pageCountRow = sqliteDb.prepare('PRAGMA page_count').get() as any;
    const pageSizeRow = sqliteDb.prepare('PRAGMA page_size').get() as any;

    const tables = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];

    const tableSummaries: Record<string, number> = {};
    let totalRecords = 0;
    for (const t of tables) {
      try {
        const countRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any;
        const count = countRow?.count || 0;
        tableSummaries[t.name] = count;
        totalRecords += count;
      } catch (e) {
        tableSummaries[t.name] = 0;
      }
    }

    return res.json({
      success: true,
      status: 'active',
      journalMode: journalModeRow?.journal_mode || 'wal',
      version: versionRow?.version || '3.x',
      fileSizeBytes,
      pageCount: pageCountRow?.page_count || 0,
      pageSize: pageSizeRow?.page_size || 4096,
      modifiedAt,
      tablesCount: tables.length,
      totalRecords,
      tableSummaries,
    });
  } catch (err: any) {
    console.error('Error fetching SQLite status:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch SQLite status' });
  }
});

// 11. SQLite Database Tables List
authConsoleRouter.get('/sqlite/tables', (req: Request, res: Response) => {
  try {
    const tables = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];

    const result = tables.map((t) => {
      let count = 0;
      let columnsCount = 0;
      try {
        const countRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any;
        count = countRow?.count || 0;
        const cols = sqliteDb.prepare(`PRAGMA table_info("${t.name}")`).all() as any[];
        columnsCount = cols.length;
      } catch (e) {}
      return {
        name: t.name,
        count,
        columnsCount,
      };
    });

    return res.json({ success: true, tables: result });
  } catch (err: any) {
    console.error('Error fetching SQLite tables:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch SQLite tables' });
  }
});

// Columns that hold live credentials rather than ordinary application data —
// masked in the raw-row browser below even for Superuser, so this debugging
// tool can't be used to lift a working session token or a password hash out
// of the database (QA/QC audit finding L1).
const SQLITE_BROWSER_REDACTED_COLUMNS: Record<string, string[]> = {
  session: ['token'],
  account: ['password', 'accessToken', 'refreshToken', 'idToken'],
  verification: ['value'],
  apikey: ['keyHash'],
};
function redactSensitiveColumns(tableName: string, rows: any[]): any[] {
  const columnsToRedact = SQLITE_BROWSER_REDACTED_COLUMNS[tableName];
  if (!columnsToRedact || columnsToRedact.length === 0) return rows;
  return rows.map((row) => {
    const redacted = { ...row };
    for (const col of columnsToRedact) {
      if (redacted[col] != null && redacted[col] !== '') redacted[col] = '[redacted]';
    }
    return redacted;
  });
}

// 12. SQLite Database Table Data & Records Browser
authConsoleRouter.get('/sqlite/table-data', (req: Request, res: Response) => {
  try {
    const tableName = String(req.query.table || '').trim();
    if (!tableName || !/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const tableExists = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
    if (!tableExists) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    const search = String(req.query.search || '').trim();

    const columns = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }[];

    let rows: any[] = [];
    let total = 0;

    if (search && columns.length > 0) {
      const searchConditions = columns.map((c) => `CAST("${c.name}" AS TEXT) LIKE ?`).join(' OR ');
      const searchParam = `%${search}%`;
      const searchParams = columns.map(() => searchParam);

      const totalRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}" WHERE ${searchConditions}`).get(...searchParams) as any;
      total = totalRow?.count || 0;

      rows = sqliteDb
        .prepare(`SELECT * FROM "${tableName}" WHERE ${searchConditions} LIMIT ? OFFSET ?`)
        .all(...searchParams, limit, offset);
    } else {
      const totalRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as any;
      total = totalRow?.count || 0;

      rows = sqliteDb.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(limit, offset);
    }

    return res.json({
      success: true,
      table: tableName,
      columns,
      rows: redactSensitiveColumns(tableName, rows),
      total,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('Error fetching SQLite table data:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch SQLite table data' });
  }
});

// 13. SQLite DB Maintenance (Optimize / PRAGMA optimize)
authConsoleRouter.post('/sqlite/optimize', (req: Request, res: Response) => {
  try {
    sqliteDb.prepare('PRAGMA optimize').run();
    return res.json({ success: true, message: 'Database optimized successfully' });
  } catch (err: any) {
    console.error('Error optimizing SQLite:', err);
    return res.status(500).json({ error: err.message || 'Failed to optimize SQLite database' });
  }
});
