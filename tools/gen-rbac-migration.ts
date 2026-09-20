/**
 * Menghasilkan migrasi SQL untuk skema RBAC LANGSUNG dari engine
 * (`server/rbac.ts`) sehingga skema tidak mungkin menyimpang dari matriks izin.
 *
 * Jalankan: npx tsx tools/gen-rbac-migration.ts <outputFile>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ROLES, PERMISSIONS, permissionsFor } from '../server/rbac';

const outFile = process.argv[2] ?? 'server/migrations/001_rbac_alignment.sql';
mkdirSync(dirname(outFile), { recursive: true });

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

const lines: string[] = [];
lines.push('-- ============================================================================');
lines.push('-- 001_rbac_alignment.sql');
lines.push('-- DIHASILKAN OTOMATIS oleh tools/gen-rbac-migration.ts dari server/rbac.ts.');
lines.push('-- JANGAN diedit manual — ubah engine lalu regenerasi.');
lines.push(`-- Dihasilkan: ${new Date().toISOString()}`);
lines.push('--');
lines.push('-- Sifat: ADITIF dan IDEMPOTEN (aman dijalankan berulang).');
lines.push('-- Tidak menyentuh tabel better-auth yang sudah ada (user/session/member/...).');
lines.push('-- ============================================================================');
lines.push('');
lines.push('PRAGMA foreign_keys = ON;');
lines.push('');

/* roles */
lines.push('CREATE TABLE IF NOT EXISTS rbac_roles (');
lines.push('  id          TEXT PRIMARY KEY,');
lines.push('  code        TEXT UNIQUE NOT NULL,');
lines.push('  name        TEXT NOT NULL,');
lines.push('  level       INTEGER NOT NULL,');
lines.push('  scope       TEXT NOT NULL,');
lines.push('  description TEXT,');
lines.push('  is_active   INTEGER NOT NULL DEFAULT 1,');
lines.push('  created_at  TEXT NOT NULL DEFAULT (datetime(\'now\')),');
lines.push('  updated_at  TEXT NOT NULL DEFAULT (datetime(\'now\'))');
lines.push(');');
lines.push('');
for (const r of ROLES) {
  lines.push(
    `INSERT OR IGNORE INTO rbac_roles (id, code, name, level, scope, description) VALUES (` +
    `${q('role-' + r.code)}, ${q(r.code)}, ${q(r.name)}, ${r.level}, ${q(r.scope)}, ${q(r.description)});`,
  );
}
lines.push('');

/* permissions */
lines.push('CREATE TABLE IF NOT EXISTS rbac_permissions (');
lines.push('  id         TEXT PRIMARY KEY,');
lines.push('  code       TEXT UNIQUE NOT NULL,');
lines.push('  name       TEXT NOT NULL,');
lines.push('  resource   TEXT NOT NULL,');
lines.push('  action     TEXT NOT NULL,');
lines.push('  description TEXT,');
lines.push('  created_at TEXT NOT NULL DEFAULT (datetime(\'now\'))');
lines.push(');');
lines.push('');
for (const p of PERMISSIONS) {
  lines.push(
    `INSERT OR IGNORE INTO rbac_permissions (id, code, name, resource, action, description) VALUES (` +
    `${q('perm-' + p.code)}, ${q(p.code)}, ${q(p.code)}, ${q(p.resource)}, ${q(p.action)}, ${q(p.description)});`,
  );
}
lines.push('');

/* role_permissions */
lines.push('CREATE TABLE IF NOT EXISTS rbac_role_permissions (');
lines.push('  role_code       TEXT NOT NULL,');
lines.push('  permission_code TEXT NOT NULL,');
lines.push('  PRIMARY KEY (role_code, permission_code),');
lines.push('  FOREIGN KEY (role_code) REFERENCES rbac_roles(code),');
lines.push('  FOREIGN KEY (permission_code) REFERENCES rbac_permissions(code)');
lines.push(');');
lines.push('');
for (const r of ROLES) {
  for (const code of permissionsFor(r.code).slice().sort()) {
    lines.push(`INSERT OR IGNORE INTO rbac_role_permissions (role_code, permission_code) VALUES (${q(r.code)}, ${q(code)});`);
  }
}
lines.push('');

/* departments */
lines.push('CREATE TABLE IF NOT EXISTS rbac_departments (');
lines.push('  id         TEXT PRIMARY KEY,');
lines.push('  tenant_id  TEXT NOT NULL,');
lines.push('  code       TEXT NOT NULL,');
lines.push('  name       TEXT NOT NULL,');
lines.push('  created_at TEXT NOT NULL DEFAULT (datetime(\'now\')),');
lines.push('  UNIQUE (tenant_id, code)');
lines.push(');');
lines.push('');
lines.push('CREATE INDEX IF NOT EXISTS idx_rbac_departments_tenant ON rbac_departments(tenant_id);');
lines.push('');

/* user -> role/scope mapping (additive; tidak mengubah tabel user better-auth) */
lines.push('CREATE TABLE IF NOT EXISTS rbac_user_roles (');
lines.push('  user_id       TEXT PRIMARY KEY,');
lines.push('  role_code     TEXT NOT NULL,');
lines.push('  tenant_id     TEXT,');
lines.push('  department_id TEXT,');
lines.push('  updated_at    TEXT NOT NULL DEFAULT (datetime(\'now\')),');
lines.push('  FOREIGN KEY (role_code) REFERENCES rbac_roles(code)');
lines.push(');');
lines.push('');
lines.push('CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_tenant ON rbac_user_roles(tenant_id);');
lines.push('CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_department ON rbac_user_roles(department_id);');
lines.push('');

/* audit log (PRD §27) */
lines.push('CREATE TABLE IF NOT EXISTS audit_log (');
lines.push('  id            TEXT PRIMARY KEY,');
lines.push('  actor_id      TEXT NOT NULL,');
lines.push('  action        TEXT NOT NULL,');
lines.push('  target_type   TEXT NOT NULL,');
lines.push('  target_id     TEXT NOT NULL,');
lines.push('  tenant_id     TEXT,');
lines.push('  department_id TEXT,');
lines.push('  impersonated_by TEXT,');
lines.push('  metadata      TEXT,');
lines.push('  created_at    TEXT NOT NULL DEFAULT (datetime(\'now\'))');
lines.push(');');
lines.push('');
lines.push('CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON audit_log(actor_id);');
lines.push('CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);');
lines.push('CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);');
lines.push('');

writeFileSync(outFile, lines.join('\n'));
console.log(`OK: migrasi ditulis ke ${outFile} (${ROLES.length} role, ${PERMISSIONS.length} permission, ${ROLES.reduce((n, r) => n + permissionsFor(r.code).length, 0)} baris role_permission)`);
