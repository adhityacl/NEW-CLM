import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { dash, sentinel } from "@better-auth/infra";
import { createAccessControl } from "better-auth/plugins/access";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let defaultGoogleClientId = process.env.GOOGLE_CLIENT_ID || "";
if (!defaultGoogleClientId) {
  try {
    const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      defaultGoogleClientId = cfg.oAuthClientId || "";
    }
  } catch (_) {}
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

// Initialize Better Auth & Organization / Console tables if not exist
sqliteDb.exec(`
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

// Better Auth 1.7.3 no longer writes account.issuer for every provider.
// Keep older databases compatible by making the legacy column nullable.
try {
  const accountColumns = sqliteDb.prepare("PRAGMA table_info(account)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  const issuerColumn = accountColumns.find((column) => column.name === "issuer");

  if (issuerColumn?.notnull === 1) {
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

// Seed default organization only if table is completely empty
try {
  const orgCount = (sqliteDb.prepare('SELECT COUNT(*) as count FROM organization').get() as any)?.count || 0;
  if (orgCount === 0) {
    const insertOrg = sqliteDb.prepare(`
      INSERT OR IGNORE INTO organization (id, name, slug, logo, createdAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();

    insertOrg.run(
      'org_1789542306289_b3a4f3',
      'Adapundi',
      'adapundi',
      '/favicon.png',
      now,
      JSON.stringify({
        currency: 'IDR',
        brandName: 'Adapundi',
        legalEntity: 'PT',
        tagline: 'Legal & Commercial Contract Management',
        primaryColor: '#06C755',
        driveFolderId: '1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY',
        driveFolderLink: 'https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY',
      })
    );

    // Also seed default teams if team table is empty
    const teamCount = (sqliteDb.prepare('SELECT COUNT(*) as count FROM team').get() as any)?.count || 0;
    if (teamCount === 0) {
      const insertTeam = sqliteDb.prepare(`
        INSERT OR IGNORE INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertTeam.run('team-commercial', 'Commercial & Marketing', 4, 'org_1789542306289_b3a4f3', now, now);
      insertTeam.run('team-legal', 'Legal & Compliance', 3, 'org_1789542306289_b3a4f3', now, now);
      insertTeam.run('team-procurement', 'Procurement & Operations', 3, 'org_1789542306289_b3a4f3', now, now);
    }
  }
} catch (err) {
  console.warn("Could not seed default organizations:", err);
}

// --- Better Auth Instance ---
export const auth = betterAuth({
  baseURL: {
    allowedHosts: [
      "localhost:3000",
      "localhost:5173",
      "silegal.ai.studio",
      "*.ai.studio",
      "*.run.app",
      "*.vercel.app",
    ],
    protocol: process.env.NODE_ENV === "development" ? "http" : "https",
  },
  database: sqliteDb,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: defaultGoogleClientId || process.env.GOOGLE_CLIENT_ID || "259981060417-4p303aonqodjom27jbd7pk8bnk3s3nfi.apps.googleusercontent.com",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock_google_secret",
    },
  },
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
    ...(process.env.BETTER_AUTH_ENABLE_INFRA === 'true' && process.env.BETTER_AUTH_API_KEY && process.env.BETTER_AUTH_API_KEY !== 'ba_vk0v6kcwjqk2dwfl7d2alxgec6wi9r3r'
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

          // Read data_store.json to see if user is already whitelisted by admin
          try {
            const fs = await import('fs');
            const dataStorePath = path.join(process.cwd(), 'data_store.json');
            if (fs.existsSync(dataStorePath)) {
              const dataStore = JSON.parse(fs.readFileSync(dataStorePath, 'utf8'));
              const isAllowed = dataStore.allowedUsers?.find(
                (u: any) => u.email.toLowerCase() === user.email.toLowerCase()
              );
              
              if (isAllowed) {
                // If they are in the whitelist and Active, do NOT ban them
                if (isAllowed.status === 'Active') {
                  return {
                    data: {
                      ...user,
                      role: isAllowed.role.toLowerCase(),
                      banned: false,
                      banReason: null,
                    },
                  };
                }
              }
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
            
            // Check whitelist
            let isWhitelisted = false;
            try {
              const fs = await import('fs');
              const dataStorePath = path.join(process.cwd(), 'data_store.json');
              if (fs.existsSync(dataStorePath)) {
                const dataStore = JSON.parse(fs.readFileSync(dataStorePath, 'utf8'));
                const isAllowed = dataStore.allowedUsers?.find(
                  (u: any) => u.email.toLowerCase() === user.email.toLowerCase()
                );
                if (isAllowed && isAllowed.status === 'Active') {
                  isWhitelisted = true;
                }
              }
            } catch (e) {}

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
  trustedOrigins: [
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.run.app",
    "https://*.google.com",
    "https://*",
    "http://*",
  ],
  secret: process.env.BETTER_AUTH_SECRET || "development_secret_key_1234567890",
});
