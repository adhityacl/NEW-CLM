import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { dash, sentinel } from "@better-auth/infra";
import { createAccessControl } from "better-auth/plugins/access";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const googleClientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

/*
 * Deployment URL configuration (PRD §5.4). BETTER_AUTH_URL / TRUSTED_ORIGINS
 * are optional overrides for pinning or widening the allowed origins (e.g. a
 * separate front-end domain). Left unset, `trustedOrigins` below trusts
 * whatever host/scheme the request actually arrived on instead — `server.ts`'s
 * toNodeHandler call builds every `/api/auth/*` request's URL from its real
 * `Host`/`X-Forwarded-Proto` headers (see better-call's node adapter), and the
 * documented nginx config forwards those unchanged. This is exactly the
 * origin the browser is talking to, so it's as safe as a fixed allowlist — a
 * cross-site page's forged request still carries *its own* Origin, which
 * never matches — and it means there's nothing to "capture" at build/deploy
 * time: a fresh clone logs in correctly on whatever domain it's reached at.
 */
const isProduction = process.env.NODE_ENV === "production";
const publicBaseUrl = (process.env.BETTER_AUTH_URL || "").trim().replace(/\/$/, "");
const extraOrigins = (process.env.TRUSTED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
/**
 * Trusts the request's own Origin header, but only once it's confirmed to
 * actually be this request's origin: its host must match the Host header of
 * the same request. Comparing hosts (not reconstructing a URL and guessing
 * the scheme from `X-Forwarded-Proto`/`NODE_ENV`) sidesteps a real failure
 * seen behind tunnels that terminate TLS without forwarding that header
 * (e.g. GitHub Codespaces' port forwarding): guessing "http" there caused a
 * same-origin `https://` request to be rejected as a scheme mismatch. A
 * cross-site request still carries the attacker's own Origin, whose host
 * never matches, so this stays exactly as safe as a fixed allowlist.
 */
function selfOrigin(request?: Request): string[] {
  const host = request?.headers.get("host");
  const origin = request?.headers.get("origin");
  if (!host || !origin) return [];
  try {
    return new URL(origin).host === host ? [origin] : [];
  } catch {
    return [];
  }
}
const authSecret = process.env.BETTER_AUTH_SECRET || "";
if (!authSecret && isProduction) {
  throw new Error("BETTER_AUTH_SECRET must be set in production (use a long random value).");
}
if (!authSecret) {
  console.warn("[auth] BETTER_AUTH_SECRET is not set — using an insecure development secret.");
}

// --- Access Control ---
export const statement = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
    "read",
  ],
  session: [
    "list",
    "revoke",
    "delete"
  ],
  organization: [
    "create",
    "read",
    "update",
    "delete",
    "set-active"
  ],
  team: [
    "create",
    "read",
    "update",
    "delete"
  ],
  contract: ["create", "read", "update", "delete"],
  partner: ["create", "read", "update", "delete"],
  report: ["view", "export"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  superuser: ac.newRole({
    user: [
      "create",
      "list",
      "set-role",
      "ban",
      "delete",
      "set-password",
      "set-email",
      "get",
      "update",
      "read",
    ],
    session: [
      "list",
      "revoke",
      "delete",
    ],
    organization: [
      "create",
      "read",
      "update",
      "delete",
      "set-active",
    ],
    team: [
      "create",
      "read",
      "update",
      "delete",
    ],
    contract: ["create", "read", "update", "delete"],
    partner: ["create", "read", "update", "delete"],
    report: ["view", "export"],
  }),
  admin: ac.newRole({
    user: [
      "read",
      "list",
    ],
    session: [
      "list",
    ],
    organization: [
      "read",
    ],
    team: [
      "read",
    ],
    contract: ["create", "read", "update", "delete"],
    partner: ["create", "read", "update", "delete"],
    report: ["view", "export"],
  }),
  manager: ac.newRole({
    organization: ["read"],
    team: ["read"],
    contract: ["create", "read", "update"],
    partner: ["create", "read", "update"],
    report: ["view"],
  }),
  editor: ac.newRole({
    organization: ["read"],
    team: ["read"],
    contract: ["create", "read", "update"],
    partner: ["create", "read", "update"],
    report: ["view"],
  }),
  viewer: ac.newRole({
    contract: ["read"],
    partner: ["read"],
    report: ["view"],
  }),
  // Legacy backward compatibility
  legal: ac.newRole({
    contract: ["create", "read", "update"],
    partner: ["create", "read", "update"],
    report: ["view"],
  }),
  finance: ac.newRole({
    contract: ["read"],
    partner: ["read"],
    report: ["view", "export"],
  }),
  staff: ac.newRole({
    contract: ["read"],
    partner: ["read"],
    report: ["view"],
  }),
};

// --- Database & Schema Initialization ---
const dbPath = path.join(process.cwd(), "auth.db");
export const sqliteDb = new Database(dbPath);
sqliteDb.pragma("journal_mode = WAL");
sqliteDb.pragma("synchronous = NORMAL");
sqliteDb.pragma("busy_timeout = 5000");

// Initialize Better Auth & Organization / Console tables if not exist.
// The core Better Auth tables (user/session/account/verification) are created
// here too, so a fresh clone boots without running `npm run auth:migrate`
// first — Better Auth refuses to start on a schema mismatch.
sqliteDb.exec(`
CREATE TABLE IF NOT EXISTS "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "role" text, "banned" integer, "banReason" text, "banExpires" date);
CREATE TABLE IF NOT EXISTS "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade, "impersonatedBy" text, "activeOrganizationId" text, "activeTeamId" text);
CREATE TABLE IF NOT EXISTS "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null, "issuer" text);
CREATE TABLE IF NOT EXISTS "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
CREATE INDEX IF NOT EXISTS "session_userId_idx" on "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" on "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" on "verification" ("identifier");
CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo TEXT,
  createdAt date,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  memberCount INTEGER DEFAULT 0,
  organizationId TEXT NOT NULL,
  createdAt date,
  updatedAt date
);
CREATE TABLE IF NOT EXISTS teamMember (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL,
  userId TEXT NOT NULL,
  membershipKey TEXT,
  createdAt date
);
CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT NOT NULL,
  createdAt date
);
CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  teamId TEXT,
  status TEXT NOT NULL,
  expiresAt date,
  createdAt date,
  inviterId TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apikey (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  keyPreview TEXT NOT NULL,
  keyHash TEXT NOT NULL,
  scopes TEXT NOT NULL,
  createdAt date,
  expiresAt date,
  status TEXT DEFAULT 'active'
);
`);

function normalizeSqliteId(row: any, fallback: string) {
  if (row?.id) return String(row.id);
  if (row?.contract_id) return String(row.contract_id);
  if (row?.partner_id) return String(row.partner_id);
  if (row?.io_id) return String(row.io_id);
  if (row?.email) return String(row.email);
  if (row?.templateId) return String(row.templateId);
  if (row?.tenantId) return String(row.tenantId);
  if (row?.name) return String(row.name);
  return fallback;
}

export function initializeCoreDataSchema() {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS allowed_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      role TEXT,
      status TEXT,
      organizationId TEXT,
      payload TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      partner_id TEXT,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      contract_id TEXT,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS insertion_orders (
      id TEXT PRIMARY KEY,
      io_id TEXT,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS spendings (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      organizationId TEXT,
      payload TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS branding (
      id TEXT PRIMARY KEY CHECK(id = 'branding'),
      organizationId TEXT,
      payload TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY CHECK(id IN ('app_settings', 'google_config')),
      organizationId TEXT,
      payload TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS news_ticker (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_allowed_users_org ON allowed_users (organizationId);
    CREATE INDEX IF NOT EXISTS idx_partners_org ON partners (organizationId);
    CREATE INDEX IF NOT EXISTS idx_contracts_org ON contracts (organizationId);
    CREATE INDEX IF NOT EXISTS idx_ios_org ON insertion_orders (organizationId);
    CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications (organizationId);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_org ON activity_logs (organizationId);
    CREATE INDEX IF NOT EXISTS idx_evaluations_org ON evaluations (organizationId);
    CREATE INDEX IF NOT EXISTS idx_spendings_org ON spendings (organizationId);
    CREATE INDEX IF NOT EXISTS idx_tenants_org ON tenants (organizationId);
    CREATE INDEX IF NOT EXISTS idx_departments_org ON departments (organizationId);
    CREATE INDEX IF NOT EXISTS idx_templates_org ON templates (organizationId);
    CREATE INDEX IF NOT EXISTS idx_partners_partner_id ON partners (partner_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_contract_id ON contracts (contract_id);
    CREATE INDEX IF NOT EXISTS idx_ios_io_id ON insertion_orders (io_id);
  `);
}

function isValidAllowedUserRow(row: any) {
  if (!row || typeof row !== 'object') return false;
  const email = String(row.email || row.emailAddress || row.userEmail || '').trim();
  return email.length > 0;
}

export function hydrateCoreDataFromJson(data: any) {
  if (!data || typeof data !== 'object') return;

  const tableConfigs = [
    { table: 'allowed_users', rows: Array.isArray(data.allowedUsers) ? data.allowedUsers.filter(isValidAllowedUserRow) : [] },
    { table: 'partners', rows: Array.isArray(data.partners) ? data.partners : [] },
    { table: 'contracts', rows: Array.isArray(data.contracts) ? data.contracts : [] },
    { table: 'insertion_orders', rows: Array.isArray(data.ios) ? data.ios : [] },
    { table: 'notifications', rows: Array.isArray(data.notifications) ? data.notifications : [] },
    { table: 'activity_logs', rows: Array.isArray(data.activityLogs) ? data.activityLogs : [] },
    { table: 'evaluations', rows: Array.isArray(data.evaluations) ? data.evaluations : [] },
    { table: 'spendings', rows: Array.isArray(data.spendings) ? data.spendings : [] },
    { table: 'tenants', rows: Array.isArray(data.tenants) ? data.tenants : [] },
    { table: 'departments', rows: Array.isArray(data.departments) ? data.departments : [] },
    { table: 'templates', rows: Array.isArray(data.templates) ? data.templates : [] },
  ];

  for (const config of tableConfigs) {
    const rows = config.rows;
    if (!rows.length) {
      sqliteDb.prepare(`DELETE FROM ${config.table}`).run();
      continue;
    }

    sqliteDb.transaction(() => {
      sqliteDb.prepare(`DELETE FROM ${config.table}`).run();
      for (const row of rows) {
        if (config.table === 'allowed_users') {
          const email = String(row.email || row.emailAddress || row.userEmail || '').trim();
          const rowId = normalizeSqliteId(row, `row-${Math.random().toString(36).slice(2, 10)}`);
          sqliteDb.prepare(`
            INSERT INTO allowed_users (id, email, name, role, status, organizationId, payload, createdAt, updatedAt)
            VALUES (@id, @email, @name, @role, @status, @organizationId, @payload, @createdAt, @updatedAt)
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              name = excluded.name,
              role = excluded.role,
              status = excluded.status,
              organizationId = excluded.organizationId,
              payload = excluded.payload,
              createdAt = excluded.createdAt,
              updatedAt = excluded.updatedAt
          `).run({
            id: String(rowId),
            email,
            name: row.name ?? row.fullName ?? null,
            role: row.role ?? null,
            status: row.status ?? null,
            organizationId: row.organizationId ?? null,
            payload: JSON.stringify(row),
            createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
            updatedAt: row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
          });
          continue;
        }

        const insertStmt = sqliteDb.prepare(`
          INSERT INTO ${config.table} (id, organizationId, payload, createdAt, updatedAt)
          VALUES (@id, @organizationId, @payload, @createdAt, @updatedAt)
          ON CONFLICT(id) DO UPDATE SET
            organizationId = excluded.organizationId,
            payload = excluded.payload,
            createdAt = excluded.createdAt,
            updatedAt = excluded.updatedAt
        `);
        const rowId = normalizeSqliteId(row, `row-${Math.random().toString(36).slice(2, 10)}`);
        insertStmt.run({
          id: String(rowId),
          organizationId: row?.organizationId ?? null,
          payload: JSON.stringify(row),
          createdAt: row?.createdAt ?? row?.created_at ?? new Date().toISOString(),
          updatedAt: row?.updatedAt ?? row?.updated_at ?? new Date().toISOString(),
        });
      }
    })();
  }

  if (data.branding) {
    sqliteDb.prepare(`
      INSERT INTO branding (id, organizationId, payload, updatedAt)
      VALUES (@id, @organizationId, @payload, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        organizationId = excluded.organizationId,
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `).run({
      id: 'branding',
      organizationId: data.branding.organizationId ?? null,
      payload: JSON.stringify(data.branding),
      updatedAt: new Date().toISOString(),
    });
  }

  if (data.googleConfig || data.appSettings) {
    const payload = data.googleConfig ?? data.appSettings ?? {};
    sqliteDb.prepare(`
      INSERT INTO app_settings (id, organizationId, payload, updatedAt)
      VALUES (@id, @organizationId, @payload, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        organizationId = excluded.organizationId,
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `).run({
      id: 'google_config',
      organizationId: payload.organizationId ?? null,
      payload: JSON.stringify(payload),
      updatedAt: new Date().toISOString(),
    });
  }

  if (data.newsTicker) {
    sqliteDb.prepare(`
      INSERT INTO news_ticker (id, payload, updatedAt)
      VALUES (@id, @payload, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `).run({
      id: 'default',
      payload: JSON.stringify(data.newsTicker),
      updatedAt: new Date().toISOString(),
    });
  }
}

export function loadCoreDataFromSqlite() {
  const rows = {
    allowedUsers: sqliteDb.prepare(`SELECT payload FROM allowed_users`).all().map((r: any) => JSON.parse(r.payload)),
    partners: sqliteDb.prepare(`SELECT payload FROM partners`).all().map((r: any) => JSON.parse(r.payload)),
    contracts: sqliteDb.prepare(`SELECT payload FROM contracts`).all().map((r: any) => JSON.parse(r.payload)),
    ios: sqliteDb.prepare(`SELECT payload FROM insertion_orders`).all().map((r: any) => JSON.parse(r.payload)),
    notifications: sqliteDb.prepare(`SELECT payload FROM notifications`).all().map((r: any) => JSON.parse(r.payload)),
    activityLogs: sqliteDb.prepare(`SELECT payload FROM activity_logs`).all().map((r: any) => JSON.parse(r.payload)),
    evaluations: sqliteDb.prepare(`SELECT payload FROM evaluations`).all().map((r: any) => JSON.parse(r.payload)),
    spendings: sqliteDb.prepare(`SELECT payload FROM spendings`).all().map((r: any) => JSON.parse(r.payload)),
    tenants: sqliteDb.prepare(`SELECT payload FROM tenants`).all().map((r: any) => JSON.parse(r.payload)),
    departments: sqliteDb.prepare(`SELECT payload FROM departments`).all().map((r: any) => JSON.parse(r.payload)),
    templates: sqliteDb.prepare(`SELECT payload FROM templates`).all().map((r: any) => JSON.parse(r.payload)),
    branding: (() => {
      const row = sqliteDb.prepare(`SELECT payload FROM branding WHERE id = 'branding'`).get() as any;
      return row ? JSON.parse(row.payload) : null;
    })(),
    googleConfig: (() => {
      const row = sqliteDb.prepare(`SELECT payload FROM app_settings WHERE id = 'google_config'`).get() as any;
      return row ? JSON.parse(row.payload) : null;
    })(),
    newsTicker: (() => {
      const row = sqliteDb.prepare(`SELECT payload FROM news_ticker WHERE id = 'default'`).get() as any;
      return row ? JSON.parse(row.payload) : null;
    })(),
  };
  return rows;
}

export function syncDbToSqlite(data: any) {
  if (!data || typeof data !== 'object') return;

  const syncTable = (table: string, rows: any[] = []) => {
    sqliteDb.transaction(() => {
      sqliteDb.prepare(`DELETE FROM ${table}`).run();
      if (!Array.isArray(rows) || rows.length === 0) return;
      for (const row of rows) {
        if (table === 'allowed_users' && !isValidAllowedUserRow(row)) {
          continue;
        }
        if (table === 'allowed_users') {
          const email = String(row.email || row.emailAddress || row.userEmail || '').trim();
          const rowId = normalizeSqliteId(row, `${table}-${Math.random().toString(36).slice(2, 10)}`);
          sqliteDb.prepare(`
            INSERT INTO allowed_users (id, email, name, role, status, organizationId, payload, createdAt, updatedAt)
            VALUES (@id, @email, @name, @role, @status, @organizationId, @payload, @createdAt, @updatedAt)
          `).run({
            id: String(rowId),
            email,
            name: row.name ?? row.fullName ?? null,
            role: row.role ?? null,
            status: row.status ?? null,
            organizationId: row.organizationId ?? null,
            payload: JSON.stringify(row),
            createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
            updatedAt: row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
          });
          continue;
        }

        const stmt = sqliteDb.prepare(`
          INSERT INTO ${table} (id, organizationId, payload, createdAt, updatedAt)
          VALUES (@id, @organizationId, @payload, @createdAt, @updatedAt)
        `);
        const rowId = normalizeSqliteId(row, `${table}-${Math.random().toString(36).slice(2, 10)}`);
        stmt.run({
          id: String(rowId),
          organizationId: row?.organizationId ?? null,
          payload: JSON.stringify(row),
          createdAt: row?.createdAt ?? row?.created_at ?? new Date().toISOString(),
          updatedAt: row?.updatedAt ?? row?.updated_at ?? new Date().toISOString(),
        });
      }
    })();
  };

  syncTable('allowed_users', Array.isArray(data.allowedUsers) ? data.allowedUsers.filter(isValidAllowedUserRow) : []);
  syncTable('partners', Array.isArray(data.partners) ? data.partners : []);
  syncTable('contracts', Array.isArray(data.contracts) ? data.contracts : []);
  syncTable('insertion_orders', Array.isArray(data.ios) ? data.ios : []);
  syncTable('notifications', Array.isArray(data.notifications) ? data.notifications : []);
  syncTable('activity_logs', Array.isArray(data.activityLogs) ? data.activityLogs : []);
  syncTable('evaluations', Array.isArray(data.evaluations) ? data.evaluations : []);
  syncTable('spendings', Array.isArray(data.spendings) ? data.spendings : []);
  syncTable('tenants', Array.isArray(data.tenants) ? data.tenants : []);
  syncTable('departments', Array.isArray(data.departments) ? data.departments : []);
  syncTable('templates', Array.isArray(data.templates) ? data.templates : []);

  if (data.branding) {
    sqliteDb.prepare(`
      INSERT INTO branding (id, organizationId, payload, updatedAt)
      VALUES (@id, @organizationId, @payload, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        organizationId = excluded.organizationId,
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `).run({
      id: 'branding',
      organizationId: data.branding.organizationId ?? null,
      payload: JSON.stringify(data.branding),
      updatedAt: new Date().toISOString(),
    });
  }

  const googleConfigPayload = data.googleConfig ?? data.appSettings ?? null;
  if (googleConfigPayload) {
    sqliteDb.prepare(`
      INSERT INTO app_settings (id, organizationId, payload, updatedAt)
      VALUES (@id, @organizationId, @payload, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        organizationId = excluded.organizationId,
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `).run({
      id: 'google_config',
      organizationId: googleConfigPayload.organizationId ?? null,
      payload: JSON.stringify(googleConfigPayload),
      updatedAt: new Date().toISOString(),
    });
  }

  if (data.newsTicker) {
    sqliteDb.prepare(`
      INSERT INTO news_ticker (id, payload, updatedAt)
      VALUES (@id, @payload, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `).run({
      id: 'default',
      payload: JSON.stringify(data.newsTicker),
      updatedAt: new Date().toISOString(),
    });
  }
}

// Ensure session table has activeOrganizationId and activeTeamId columns
try {
  const sessionCols = sqliteDb.prepare("PRAGMA table_info(session)").all().map((c: any) => c.name);
  if (!sessionCols.includes('activeOrganizationId')) {
    sqliteDb.exec("ALTER TABLE session ADD COLUMN activeOrganizationId TEXT");
  }
  if (!sessionCols.includes('activeTeamId')) {
    sqliteDb.exec("ALTER TABLE session ADD COLUMN activeTeamId TEXT");
  }
} catch (err) {
  // Session table may not exist yet if fresh
}

initializeCoreDataSchema();

// Better Auth 1.7.3 no longer writes account.issuer for every provider.
// Keep older databases compatible by making the legacy column nullable.
try {
  const accountColumns = sqliteDb.prepare("PRAGMA table_info(account)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  const issuerColumn = accountColumns.find((column) => column.name === "issuer");

  // `npm run auth:migrate` on Better Auth 1.7.x creates account without issuer,
  // but ensureUserAccountsExist() still writes it — add it back as nullable.
  if (!issuerColumn) {
    sqliteDb.exec("ALTER TABLE account ADD COLUMN issuer TEXT");
  } else if (issuerColumn.notnull === 1) {
    sqliteDb.transaction(() => {
      sqliteDb.exec(`
        ALTER TABLE account RENAME TO account_legacy_schema;
        CREATE TABLE account (
          id TEXT NOT NULL PRIMARY KEY,
          accountId TEXT NOT NULL,
          providerId TEXT NOT NULL,
          userId TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
          accessToken TEXT,
          refreshToken TEXT,
          idToken TEXT,
          accessTokenExpiresAt date,
          refreshTokenExpiresAt date,
          scope TEXT,
          password TEXT,
          createdAt date NOT NULL,
          updatedAt date NOT NULL,
          issuer TEXT
        );
        INSERT INTO account (
          id, accountId, providerId, userId, accessToken, refreshToken, idToken,
          accessTokenExpiresAt, refreshTokenExpiresAt, scope, password,
          createdAt, updatedAt, issuer
        )
        SELECT
          id, accountId, providerId, userId, accessToken, refreshToken, idToken,
          accessTokenExpiresAt, refreshTokenExpiresAt, scope, password,
          createdAt, updatedAt, issuer
        FROM account_legacy_schema;
        DROP TABLE account_legacy_schema;
        CREATE INDEX account_userId_idx ON account (userId);
        CREATE UNIQUE INDEX account_issuer_accountId_uidx
          ON account (issuer, accountId);
      `);
    })();
  }
} catch (err) {
  console.error("Could not migrate the Better Auth account schema:", err);
  throw err;
}

// Organizations are not seeded here: server startup hydrates them from the
// tenant list (the demo dataset on first run, or the admin's own setup).

// --- Better Auth Instance ---
export const auth = betterAuth({
  // Unset: Better Auth derives the base URL per request from its real
  // Host/X-Forwarded-Proto headers (see the comment above) instead of a
  // fixed host baked in at startup.
  baseURL: publicBaseUrl || undefined,
  database: sqliteDb,
  emailAndPassword: {
    enabled: true,
  },
  // Google sign-in is optional and only enabled when credentials exist.
  socialProviders: googleClientId && googleClientSecret
    ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
    : {},
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "viewer",
      adminRoles: ["superuser", "admin"],
    }),
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      teams: { enabled: true },
    }),
    ...(process.env.BETTER_AUTH_ENABLE_INFRA === 'true' && process.env.BETTER_AUTH_API_KEY && true
      ? [
          dash({
            apiKey: process.env.BETTER_AUTH_API_KEY,
          }),
          sentinel({
            apiKey: process.env.BETTER_AUTH_API_KEY,
          }),
        ]
      : []),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          console.log('[AUTH HOOK] Creating user (before):', user.email);
          // Check if this is the very first user, make them admin, don't ban
          try {
            const count = sqliteDb.prepare("SELECT COUNT(*) as cnt FROM user").get() as any;
            if (!count || count.cnt === 0) {
              return {
                data: {
                  ...user,
                  role: "admin",
                  banned: false,
                  banReason: null,
                },
              };
            }
          } catch (e) {
            // Table might not exist yet during migration, allow through
          }

          // Read the SQLite whitelist before applying pending approval.
          try {
            const isAllowed = sqliteDb.prepare(
              'SELECT role, status FROM allowed_users WHERE LOWER(email) = LOWER(?)',
            ).get(user.email) as any;
            if (isAllowed?.status === 'Active') {
              return {
                data: {
                  ...user,
                  role: String(isAllowed.role || 'staff').toLowerCase(),
                  banned: false,
                  banReason: null,
                },
              };
              }
          } catch (e) {
            console.error('Error checking whitelist during registration:', e);
          }

          // Return banned: false initially in before hook so Better Auth saves the user!
          return {
            data: {
              ...user,
              banned: false,
              banReason: "PENDING_APPROVAL",
            },
          };
        },
        after: async (user) => {
          console.log('[AUTH HOOK] User created (after):', user.email);
          // If this is NOT the first user and NOT whitelisted, we update the DB to ban them!
          try {
            const isFirst = user.role === 'admin';
            
            const isAllowed = sqliteDb.prepare(
              'SELECT status FROM allowed_users WHERE LOWER(email) = LOWER(?)',
            ).get(user.email) as any;
            const isWhitelisted = isAllowed?.status === 'Active';

            if (!isFirst && !isWhitelisted) {
              console.log('[AUTH HOOK] Auto-banning user for pending approval:', user.email);
              sqliteDb.prepare("UPDATE user SET banned = 1, banReason = 'PENDING_APPROVAL' WHERE id = ?").run(user.id);
            }
          } catch (err) {
            console.error('Error auto-banning in after hook:', err);
          }
        }
      },
    },
  },
  // A function, not a static array, so Better Auth re-evaluates it per
  // request instead of once at startup — see selfOrigin() above.
  trustedOrigins: async (request?: Request) => [...extraOrigins, ...selfOrigin(request)],
  secret: authSecret || "insecure-development-secret-change-me",
});
