/**
 * Seeds one SQLite session token per RBAC role directly in `auth.db`, the
 * same way the QA/QC audit's manual testing did (see the audit report) —
 * no real login flow needed, just a session row the app's own auth
 * middleware will accept. Requires `auth.db` to already have at least one
 * organization and one team (this project's dev seed data has both).
 *
 * Run standalone to inspect what it seeds:
 *   npx tsx tests/e2e/seed.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json declares "type": "module", so this file has no `__dirname`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'auth.db');

export interface SeededRole {
  role: 'superuser' | 'admin' | 'manager' | 'editor' | 'viewer';
  token: string;
  userId: string;
}

const TOKEN_PREFIX = 'pw_e2e_';

export function seedRoleSessions(): SeededRole[] {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const org = db.prepare('SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1').get() as { id: string } | undefined;
  if (!org) {
    db.close();
    throw new Error('No organization found in auth.db — seed at least one before running the RBAC UI e2e tests.');
  }
  const team = db.prepare('SELECT id FROM team WHERE organizationId = ? ORDER BY createdAt ASC LIMIT 1').get(org.id) as { id: string } | undefined;

  const existingSuperuser = db.prepare("SELECT id FROM user WHERE role = 'superuser' LIMIT 1").get() as { id: string } | undefined;

  const roles: SeededRole[] = [];

  function upsertUser(id: string, email: string, name: string, role: string) {
    db.prepare(
      `INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, role, banned, banReason, banExpires)
       VALUES (?, ?, ?, 1, NULL, ?, ?, ?, 0, NULL, NULL)
       ON CONFLICT(id) DO UPDATE SET role = excluded.role`,
    ).run(id, name, email, now, now, role);
  }
  function upsertMember(id: string, orgId: string, userId: string, role: string) {
    db.prepare(
      `INSERT OR REPLACE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, orgId, userId, role, now);
  }
  function upsertTeamMember(id: string, teamId: string, userId: string) {
    db.prepare(
      `INSERT OR REPLACE INTO teamMember (id, teamId, userId, membershipKey, createdAt) VALUES (?, ?, ?, NULL, ?)`,
    ).run(id, teamId, userId, now);
  }
  function upsertSession(id: string, userId: string, token: string, activeOrgId: string | null) {
    db.prepare(
      `INSERT OR REPLACE INTO session (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId, impersonatedBy, activeOrganizationId, activeTeamId)
       VALUES (?, ?, ?, ?, ?, NULL, 'playwright', ?, NULL, ?, NULL)`,
    ).run(id, expires, token, now, now, userId, activeOrgId);
  }

  // Superuser: reuse an existing one if the dev DB already has one (its
  // department/name stay untouched), otherwise create a dedicated e2e user.
  const superuserId = existingSuperuser?.id || 'pw_e2e_superuser';
  if (!existingSuperuser) upsertUser(superuserId, 'pw.e2e.superuser@example.test', 'PW E2E Superuser', 'superuser');
  const superuserToken = `${TOKEN_PREFIX}superuser`;
  upsertSession('sess_pw_e2e_superuser', superuserId, superuserToken, null);
  roles.push({ role: 'superuser', token: superuserToken, userId: superuserId });

  const rolesToCreate: Array<{ role: SeededRole['role']; dbRole: string; needsTeam: boolean }> = [
    { role: 'admin', dbRole: 'admin', needsTeam: false },
    { role: 'manager', dbRole: 'manager', needsTeam: true },
    { role: 'editor', dbRole: 'editor', needsTeam: true },
    { role: 'viewer', dbRole: 'viewer', needsTeam: true },
  ];
  for (const { role, dbRole, needsTeam } of rolesToCreate) {
    const userId = `pw_e2e_${role}`;
    upsertUser(userId, `pw.e2e.${role}@example.test`, `PW E2E ${role}`, dbRole);
    upsertMember(`mem_pw_e2e_${role}`, org.id, userId, dbRole);
    if (needsTeam && team) {
      upsertTeamMember(`tm_pw_e2e_${role}`, team.id, userId);
    }
    const token = `${TOKEN_PREFIX}${role}`;
    upsertSession(`sess_pw_e2e_${role}`, userId, token, org.id);
    roles.push({ role, token, userId });
  }

  db.close();
  return roles;
}

/** Removes every session this file seeds. Leaves the e2e user/member/teamMember rows in place (cheap to re-seed, and other specs may still reference them by id) — delete those by hand if you want a fully clean auth.db. */
export function cleanupRoleSessions(): void {
  const db = new Database(DB_PATH);
  db.prepare(`DELETE FROM session WHERE token LIKE '${TOKEN_PREFIX}%'`).run();
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeded = seedRoleSessions();
  console.log('Seeded role sessions:', seeded);
}
