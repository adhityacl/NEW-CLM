var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  getFreshGoogleAccessToken: () => getFreshGoogleAccessToken,
  isMatchingOrg: () => isMatchingOrg,
  rbacAuthMiddleware: () => rbacAuthMiddleware,
  requireTenantRole: () => requireTenantRole,
  resolveActiveGoogleToken: () => resolveActiveGoogleToken
});
module.exports = __toCommonJS(server_exports);
var dotenv = __toESM(require("dotenv"), 1);
var import_express3 = __toESM(require("express"), 1);
var import_path4 = __toESM(require("path"), 1);
var import_fs4 = __toESM(require("fs"), 1);
var import_crypto4 = __toESM(require("crypto"), 1);
var import_nodemailer2 = __toESM(require("nodemailer"), 1);
var import_vite = require("vite");

// server/rbacRoutes.ts
var import_express = require("express");

// server/rbac.ts
var ROLE_LEVEL = {
  superuser: 1,
  admin: 2,
  manager: 3,
  editor: 4,
  viewer: 5
};
var ROLES = [
  { code: "superuser", name: "Superuser", level: 1, scope: "Global", description: "Global owner with access to all tenants" },
  { code: "admin", name: "Admin", level: 2, scope: "Tenant", description: "Tenant administrator" },
  { code: "manager", name: "Manager", level: 3, scope: "Tenant + Department", description: "Department-level supervisor" },
  { code: "editor", name: "Editor", level: 4, scope: "Tenant + Department", description: "Operational user with write access" },
  { code: "viewer", name: "Viewer", level: 5, scope: "Tenant + Department", description: "Read-only user" }
];
var LEGACY_ROLE_MAP = {
  owner: "superuser",
  "super admin": "superuser",
  super_admin: "superuser",
  legal: "manager",
  finance: "editor",
  staff: "viewer",
  member: "viewer"
};
function normalizeRole(role) {
  const r = (role ?? "").toString().toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (r in ROLE_LEVEL) return r;
  const spaced = (role ?? "").toString().toLowerCase().trim();
  if (spaced in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[spaced];
  if (r in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[r];
  return "viewer";
}
function def(code, description = "") {
  const [resource, action] = code.split(".");
  return { code, resource, action, description };
}
var PERMISSIONS = [
  // User Management (PRD §10)
  def("user.view"),
  def("user.create"),
  def("user.edit"),
  def("user.delete"),
  def("user.invite"),
  def("user.role.assign"),
  def("user.status.update"),
  // Document Management
  def("document.view"),
  def("document.create"),
  def("document.edit"),
  def("document.delete"),
  def("document.export"),
  def("document.download"),
  // Tenant Management
  def("tenant.view"),
  def("tenant.create"),
  def("tenant.edit"),
  def("tenant.delete"),
  // Department Management
  def("department.view"),
  def("department.create"),
  def("department.edit"),
  def("department.delete"),
  // Workspace
  def("workspace.view"),
  def("workspace.switch"),
  // Export
  def("export.csv"),
  def("export.document"),
  // Administration
  def("admin.access"),
  def("admin.user.manage"),
  def("admin.role.manage"),
  def("admin.tenant.manage"),
  def("admin.department.manage"),
  def("admin.configuration.manage"),
  // Audit (PRD §27)
  def("audit.view")
];
var PERMISSION_CODES = PERMISSIONS.map((p) => p.code);
var EDITOR_CAN_DELETE_DOCUMENT = true;
var ROLE_PERMISSIONS = {
  superuser: "*",
  admin: [
    "user.view",
    "user.create",
    "user.edit",
    "user.delete",
    "user.invite",
    "user.role.assign",
    "user.status.update",
    "document.view",
    "document.create",
    "document.edit",
    "document.delete",
    "document.export",
    "document.download",
    "department.view",
    "department.create",
    "department.edit",
    "export.csv",
    "export.document",
    "admin.access",
    "admin.user.manage",
    "admin.department.manage",
    "tenant.view"
  ],
  manager: [
    "user.view",
    "user.create",
    "user.edit",
    "user.invite",
    "user.role.assign",
    "user.status.update",
    "document.view",
    "document.create",
    "document.edit",
    "document.delete",
    "document.export",
    "document.download",
    "department.view",
    "export.csv",
    "export.document",
    "admin.access",
    "admin.user.manage"
  ],
  editor: [
    "document.view",
    "document.create",
    "document.edit",
    ...EDITOR_CAN_DELETE_DOCUMENT ? ["document.delete"] : [],
    "document.download"
  ],
  viewer: ["document.view"]
};
var ROLE_DENYLIST = {
  superuser: [],
  admin: ["workspace.switch", "tenant.create", "tenant.delete", "admin.configuration.manage"],
  manager: [
    "workspace.switch",
    "tenant.create",
    "tenant.delete",
    "admin.role.manage",
    "admin.department.manage",
    "admin.configuration.manage",
    "user.delete"
  ],
  editor: [
    "user.invite",
    "user.role.assign",
    "user.delete",
    "admin.access",
    "export.csv",
    "export.document",
    "workspace.switch",
    "audit.view"
  ],
  viewer: [
    "document.create",
    "document.edit",
    "document.delete",
    "document.export",
    "document.download",
    "user.invite",
    "admin.access",
    "export.csv",
    "export.document",
    "workspace.switch",
    "audit.view"
  ]
};
function permissionsFor(role) {
  const base = ROLE_PERMISSIONS[role];
  const deny = new Set(ROLE_DENYLIST[role]);
  const list = base === "*" ? PERMISSION_CODES.slice() : base.slice();
  return list.filter((p) => !deny.has(p));
}
function hasPermission(role, permission) {
  const r = normalizeRole(typeof role === "string" ? role : role);
  const deny = new Set(ROLE_DENYLIST[r]);
  if (deny.has(permission)) return false;
  const base = ROLE_PERMISSIONS[r];
  if (base === "*") return true;
  return base.includes(permission);
}
function maxScopeForActor(actor) {
  const r = normalizeRole(actor.role);
  if (r === "superuser") return "global";
  if (r === "admin") return "tenant";
  return actor.departmentId ? "department" : "tenant";
}
var SCOPE_WIDTH = { department: 0, tenant: 1, global: 2 };
function checkScope(actor, resource, scope = "department") {
  const role = normalizeRole(actor.role);
  if (role === "superuser") return { allowed: true };
  const max = maxScopeForActor(actor);
  const eff = SCOPE_WIDTH[scope] <= SCOPE_WIDTH[max] ? scope : max;
  if (resource.tenantId && resource.tenantId !== actor.tenantId) {
    return { allowed: false, error: "TENANT_SCOPE_VIOLATION" };
  }
  if (role === "admin") {
    if (eff === "global") return { allowed: false, error: "TENANT_SCOPE_VIOLATION" };
    return { allowed: true };
  }
  if (eff !== "department") return { allowed: true };
  if (resource.departmentId == null) {
    return { allowed: false, error: "DEPARTMENT_SCOPE_VIOLATION" };
  }
  if (resource.departmentId !== actor.departmentId) {
    return { allowed: false, error: "DEPARTMENT_SCOPE_VIOLATION" };
  }
  return { allowed: true };
}
function resolveTrustedScope(actor, clientSupplied) {
  const role = normalizeRole(actor.role);
  if (role === "superuser") {
    return { tenantId: clientSupplied?.tenantId ?? null, departmentId: clientSupplied?.departmentId ?? null };
  }
  if (role === "admin") {
    return { tenantId: actor.tenantId ?? null, departmentId: clientSupplied?.departmentId ?? null };
  }
  return { tenantId: actor.tenantId ?? null, departmentId: actor.departmentId ?? null };
}
function canInvite(actor, targetRole, target) {
  const actorRole = normalizeRole(actor.role);
  const tRole = normalizeRole(targetRole);
  if (!hasPermission(actorRole, "user.invite")) {
    return { allowed: false, error: "INSUFFICIENT_PERMISSION" };
  }
  if (ROLE_LEVEL[tRole] <= ROLE_LEVEL[actorRole]) {
    return { allowed: false, error: "INVALID_ROLE_ASSIGNMENT" };
  }
  if (actorRole === "superuser") return { allowed: true };
  if (target?.tenantId == null || target.tenantId !== actor.tenantId) {
    return { allowed: false, error: "TENANT_SCOPE_VIOLATION" };
  }
  if (actorRole === "admin") return { allowed: true };
  if (target?.departmentId == null || target.departmentId !== actor.departmentId) {
    return { allowed: false, error: "DEPARTMENT_SCOPE_VIOLATION" };
  }
  return { allowed: true };
}
function canChangeRole(actor, targetUser, newRole) {
  const actorRole = normalizeRole(actor.role);
  const nRole = normalizeRole(newRole);
  if (targetUser.id === actor.id) return { allowed: false, error: "SELF_ROLE_CHANGE_FORBIDDEN" };
  if (actorRole === "superuser") return { allowed: true };
  if (!hasPermission(actorRole, "user.role.assign")) {
    return { allowed: false, error: "INSUFFICIENT_PERMISSION" };
  }
  if (ROLE_LEVEL[nRole] <= ROLE_LEVEL[actorRole]) {
    return { allowed: false, error: "INVALID_ROLE_ASSIGNMENT" };
  }
  if (targetUser.tenantId == null || targetUser.tenantId !== actor.tenantId) {
    return { allowed: false, error: "TENANT_SCOPE_VIOLATION" };
  }
  if (actorRole === "manager" && (targetUser.departmentId == null || targetUser.departmentId !== actor.departmentId)) {
    return { allowed: false, error: "DEPARTMENT_SCOPE_VIOLATION" };
  }
  return { allowed: true };
}
var AUTHZ_ERRORS = {
  UNAUTHENTICATED: { status: 401, error: "UNAUTHENTICATED", message: "Authentication is required." },
  INSUFFICIENT_PERMISSION: { status: 403, error: "INSUFFICIENT_PERMISSION", message: "You do not have permission to perform this action." },
  INVALID_ROLE_ASSIGNMENT: { status: 403, error: "INVALID_ROLE_ASSIGNMENT", message: "You cannot assign a role equal to or higher than your own." },
  TENANT_SCOPE_VIOLATION: { status: 403, error: "TENANT_SCOPE_VIOLATION", message: "The resource is outside your assigned tenant." },
  DEPARTMENT_SCOPE_VIOLATION: { status: 403, error: "DEPARTMENT_SCOPE_VIOLATION", message: "The resource is outside your assigned department." },
  RESOURCE_SCOPE_VIOLATION: { status: 403, error: "RESOURCE_SCOPE_VIOLATION", message: "The resource is outside your permitted scope." },
  RESOURCE_NOT_FOUND: { status: 404, error: "RESOURCE_NOT_FOUND", message: "Resource not found." },
  SELF_ROLE_CHANGE_FORBIDDEN: { status: 403, error: "INVALID_ROLE_ASSIGNMENT", message: "You cannot change your own role." }
};
function authzError(code) {
  return AUTHZ_ERRORS[code] ?? AUTHZ_ERRORS.INSUFFICIENT_PERMISSION;
}
function decide({ actor, permission, resource, scope = "department" }) {
  if (!actor) return { allow: false, error: authzError("UNAUTHENTICATED") };
  if (!hasPermission(actor.role, permission)) {
    return { allow: false, error: authzError("INSUFFICIENT_PERMISSION") };
  }
  if (!resource) return { allow: true };
  const scoped = checkScope(actor, resource, scope);
  if (!scoped.allowed) return { allow: false, error: authzError(scoped.error) };
  return { allow: true };
}
function buildMatrix() {
  const matrix = {};
  for (const r of ROLES) matrix[r.code] = permissionsFor(r.code);
  return { roles: ROLES, permissions: PERMISSIONS, matrix };
}

// server/rbacRoutes.ts
function createRbacRouter(opts) {
  const router = (0, import_express.Router)();
  const attach = async (req, _res, next) => {
    try {
      req.actor = await opts.resolveActor(req);
    } catch {
      req.actor = null;
    }
    next();
  };
  router.use(attach);
  router.get("/matrix", (_req, res) => {
    res.json({ ok: true, ...buildMatrix() });
  });
  router.get("/roles", (_req, res) => {
    res.json({ ok: true, roles: buildMatrix().roles });
  });
  router.get("/me", (req, res) => {
    const actor = req.actor;
    if (!actor) return res.status(401).json(authzError("UNAUTHENTICATED"));
    const { matrix } = buildMatrix();
    const role = String(actor.role).toLowerCase();
    res.json({
      ok: true,
      actor: { id: actor.id, role, tenantId: actor.tenantId ?? null, departmentId: actor.departmentId ?? null },
      permissions: matrix[role] ?? []
    });
  });
  router.post("/check", (req, res) => {
    const actor = req.actor;
    const { permission, resource, scope } = req.body ?? {};
    if (typeof permission !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "permission wajib diisi." });
    }
    const decision = decide({
      actor,
      permission,
      resource: resource ?? void 0,
      scope: scope ?? "department"
    });
    if (decision.allow) return res.json({ ok: true, allow: true });
    return res.status(decision.error.status).json({ ok: false, allow: false, ...decision.error });
  });
  router.post("/simulate/invite", (req, res) => {
    const actor = req.actor;
    if (!actor) return res.status(401).json(authzError("UNAUTHENTICATED"));
    const { targetRole, tenantId, departmentId } = req.body ?? {};
    const r = canInvite(actor, targetRole, { tenantId, departmentId });
    if (r.allowed) return res.json({ ok: true, allowed: true });
    return res.status(403).json({ ok: false, ...authzError(r.error) });
  });
  router.post("/simulate/role-change", (req, res) => {
    const actor = req.actor;
    if (!actor) return res.status(401).json(authzError("UNAUTHENTICATED"));
    const { targetId, targetTenantId, targetDepartmentId, newRole } = req.body ?? {};
    const r = canChangeRole(actor, {
      id: String(targetId),
      tenantId: targetTenantId,
      departmentId: targetDepartmentId
    }, newRole);
    if (r.allowed) return res.json({ ok: true, allowed: true });
    return res.status(403).json({ ok: false, ...authzError(r.error) });
  });
  return router;
}
function requirePermission(permission, scope = "department") {
  return (req, res, next) => {
    const actor = req.actor;
    const requested = {
      tenantId: req.params?.tenantId || (req.body?.tenantId ?? req.query?.tenantId),
      departmentId: req.params?.departmentId || (req.body?.departmentId ?? req.query?.departmentId)
    };
    const resource = actor ? resolveTrustedScope(actor, requested) : requested;
    const decision = decide({ actor, permission, resource, scope });
    if (decision.allow) return next();
    return res.status(decision.error.status).json(decision.error);
  };
}

// server.ts
var import_genai = require("@google/genai");
var import_google_auth_library = require("google-auth-library");
var import_node = require("better-auth/node");
var import_crypto5 = require("better-auth/crypto");

// src/lib/auth.ts
var import_better_auth = require("better-auth");
var import_plugins = require("better-auth/plugins");
var import_infra = require("@better-auth/infra");
var import_access = require("better-auth/plugins/access");
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var defaultGoogleClientId = process.env.GOOGLE_CLIENT_ID || "";
if (!defaultGoogleClientId) {
  try {
    const cfgPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
    if (import_fs.default.existsSync(cfgPath)) {
      const cfg = JSON.parse(import_fs.default.readFileSync(cfgPath, "utf-8"));
      defaultGoogleClientId = cfg.oAuthClientId || "";
    }
  } catch (_) {
  }
}
var statement = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
    "read"
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
  report: ["view", "export"]
};
var ac = (0, import_access.createAccessControl)(statement);
var roles = {
  superuser: ac.newRole({
    user: [
      "create",
      "list",
      "set-role",
      "ban",
      "impersonate",
      "delete",
      "set-password",
      "set-email",
      "get",
      "update",
      "read"
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
    report: ["view", "export"]
  }),
  admin: ac.newRole({
    user: [
      "read",
      "list"
    ],
    session: [
      "list"
    ],
    organization: [
      "read"
    ],
    team: [
      "read"
    ],
    contract: ["create", "read", "update", "delete"],
    partner: ["create", "read", "update", "delete"],
    report: ["view", "export"]
  }),
  manager: ac.newRole({
    organization: ["read"],
    team: ["read"],
    contract: ["create", "read", "update"],
    partner: ["create", "read", "update"],
    report: ["view"]
  }),
  editor: ac.newRole({
    organization: ["read"],
    team: ["read"],
    contract: ["create", "read", "update"],
    partner: ["create", "read", "update"],
    report: ["view"]
  }),
  viewer: ac.newRole({
    contract: ["read"],
    partner: ["read"],
    report: ["view"]
  }),
  // Legacy backward compatibility
  legal: ac.newRole({
    contract: ["create", "read", "update"],
    partner: ["create", "read", "update"],
    report: ["view"]
  }),
  finance: ac.newRole({
    contract: ["read"],
    partner: ["read"],
    report: ["view", "export"]
  }),
  staff: ac.newRole({
    contract: ["read"],
    partner: ["read"],
    report: ["view"]
  })
};
var dbPath = import_path.default.join(process.cwd(), "auth.db");
var sqliteDb = new import_better_sqlite3.default(dbPath);
sqliteDb.pragma("journal_mode = WAL");
sqliteDb.pragma("synchronous = NORMAL");
sqliteDb.pragma("busy_timeout = 5000");
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
try {
  const sessionCols = sqliteDb.prepare("PRAGMA table_info(session)").all().map((c) => c.name);
  if (!sessionCols.includes("activeOrganizationId")) {
    sqliteDb.exec("ALTER TABLE session ADD COLUMN activeOrganizationId TEXT");
  }
  if (!sessionCols.includes("activeTeamId")) {
    sqliteDb.exec("ALTER TABLE session ADD COLUMN activeTeamId TEXT");
  }
} catch (err) {
}
try {
  const accountColumns = sqliteDb.prepare("PRAGMA table_info(account)").all();
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
try {
  const orgCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM organization").get()?.count || 0;
  if (orgCount === 0) {
    const insertOrg = sqliteDb.prepare(`
      INSERT OR IGNORE INTO organization (id, name, slug, logo, createdAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    insertOrg.run(
      "org_1789542306289_b3a4f3",
      "Adapundi",
      "adapundi",
      "/favicon.png",
      now,
      JSON.stringify({
        currency: "IDR",
        brandName: "Adapundi",
        legalEntity: "PT",
        tagline: "Legal & Commercial Contract Management",
        primaryColor: "#06C755",
        driveFolderId: "1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY",
        driveFolderLink: "https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY"
      })
    );
    const teamCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM team").get()?.count || 0;
    if (teamCount === 0) {
      const insertTeam = sqliteDb.prepare(`
        INSERT OR IGNORE INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertTeam.run("team-commercial", "Commercial & Marketing", 4, "org_1789542306289_b3a4f3", now, now);
      insertTeam.run("team-legal", "Legal & Compliance", 3, "org_1789542306289_b3a4f3", now, now);
      insertTeam.run("team-procurement", "Procurement & Operations", 3, "org_1789542306289_b3a4f3", now, now);
    }
  }
} catch (err) {
  console.warn("Could not seed default organizations:", err);
}
var auth = (0, import_better_auth.betterAuth)({
  baseURL: {
    allowedHosts: [
      "localhost:3000",
      "localhost:5173",
      "silegal.ai.studio",
      "*.ai.studio",
      "*.run.app",
      "*.vercel.app"
    ],
    protocol: process.env.NODE_ENV === "development" ? "http" : "https"
  },
  database: sqliteDb,
  emailAndPassword: {
    enabled: true
  },
  socialProviders: {
    google: {
      clientId: defaultGoogleClientId || process.env.GOOGLE_CLIENT_ID || "259981060417-4p303aonqodjom27jbd7pk8bnk3s3nfi.apps.googleusercontent.com",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock_google_secret"
    }
  },
  plugins: [
    (0, import_plugins.admin)({
      ac,
      roles,
      defaultRole: "viewer",
      adminRoles: ["superuser", "admin"]
    }),
    (0, import_plugins.organization)({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      teams: { enabled: true }
    }),
    ...process.env.BETTER_AUTH_ENABLE_INFRA === "true" && process.env.BETTER_AUTH_API_KEY && process.env.BETTER_AUTH_API_KEY !== "ba_vk0v6kcwjqk2dwfl7d2alxgec6wi9r3r" ? [
      (0, import_infra.dash)({
        apiKey: process.env.BETTER_AUTH_API_KEY
      }),
      (0, import_infra.sentinel)({
        apiKey: process.env.BETTER_AUTH_API_KEY
      })
    ] : []
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          console.log("[AUTH HOOK] Creating user (before):", user.email);
          try {
            const count = sqliteDb.prepare("SELECT COUNT(*) as cnt FROM user").get();
            if (!count || count.cnt === 0) {
              return {
                data: {
                  ...user,
                  role: "admin",
                  banned: false,
                  banReason: null
                }
              };
            }
          } catch (e) {
          }
          try {
            const fs5 = await import("fs");
            const dataStorePath = import_path.default.join(process.cwd(), "data_store.json");
            if (fs5.existsSync(dataStorePath)) {
              const dataStore = JSON.parse(fs5.readFileSync(dataStorePath, "utf8"));
              const isAllowed = dataStore.allowedUsers?.find(
                (u) => u.email.toLowerCase() === user.email.toLowerCase()
              );
              if (isAllowed) {
                if (isAllowed.status === "Active") {
                  return {
                    data: {
                      ...user,
                      role: isAllowed.role.toLowerCase(),
                      banned: false,
                      banReason: null
                    }
                  };
                }
              }
            }
          } catch (e) {
            console.error("Error checking whitelist during registration:", e);
          }
          return {
            data: {
              ...user,
              banned: false,
              banReason: "PENDING_APPROVAL"
            }
          };
        },
        after: async (user) => {
          console.log("[AUTH HOOK] User created (after):", user.email);
          try {
            const isFirst = user.role === "admin";
            let isWhitelisted = false;
            try {
              const fs5 = await import("fs");
              const dataStorePath = import_path.default.join(process.cwd(), "data_store.json");
              if (fs5.existsSync(dataStorePath)) {
                const dataStore = JSON.parse(fs5.readFileSync(dataStorePath, "utf8"));
                const isAllowed = dataStore.allowedUsers?.find(
                  (u) => u.email.toLowerCase() === user.email.toLowerCase()
                );
                if (isAllowed && isAllowed.status === "Active") {
                  isWhitelisted = true;
                }
              }
            } catch (e) {
            }
            if (!isFirst && !isWhitelisted) {
              console.log("[AUTH HOOK] Auto-banning user for pending approval:", user.email);
              sqliteDb.prepare("UPDATE user SET banned = 1, banReason = 'PENDING_APPROVAL' WHERE id = ?").run(user.id);
            }
          } catch (err) {
            console.error("Error auto-banning in after hook:", err);
          }
        }
      }
    }
  },
  trustedOrigins: [
    ...process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.run.app",
    "https://*.google.com",
    "https://*",
    "http://*"
  ],
  secret: process.env.BETTER_AUTH_SECRET || "development_secret_key_1234567890"
});

// src/server/authConsoleRoutes.ts
var import_express2 = require("express");
var import_crypto = require("better-auth/crypto");
var import_crypto2 = __toESM(require("crypto"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_nodemailer = __toESM(require("nodemailer"), 1);
var authConsoleRouter = (0, import_express2.Router)();
var _adminAreaRoles = /* @__PURE__ */ new Set(["superuser", "admin", "manager"]);
authConsoleRouter.use(["/sessions", "/organizations", "/teams", "/invitations", "/api-keys", "/rbac-matrix"], (req, res, next) => {
  try {
    const token = ((req.headers["authorization"] || "").toString().replace(/^Bearer\s+/i, "") || (req.headers["x-session-token"] || "").toString()).trim();
    if (!token || !sqliteDb) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
    const session = sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(token);
    if (!session?.userId) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
    const user = sqliteDb.prepare("SELECT role, banned FROM user WHERE id = ?").get(session.userId);
    if (!user || user.banned === 1) {
      return res.status(403).json({ error: "INSUFFICIENT_PERMISSION", message: "You do not have permission to access this area." });
    }
    const role = String(user.role || "").toLowerCase().trim();
    if (!_adminAreaRoles.has(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_PERMISSION", message: "You do not have permission to access this area." });
    }
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
  }
});
var globalDbRef = null;
var saveDbFnRef = null;
function setConsoleDbReference(dbStore, saveFn) {
  globalDbRef = dbStore;
  saveDbFnRef = saveFn;
  if (globalDbRef) {
    hydrateAuthConsoleFromDataStore(globalDbRef);
    ensureUserAccountsExist();
  }
}
async function ensureUserAccountsExist(defaultPassword = "123456789") {
  try {
    const users = sqliteDb.prepare("SELECT id, email FROM user").all();
    if (!users || users.length === 0) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let hashedDef = null;
    for (const u of users) {
      const existing = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").get(u.id);
      if (!existing) {
        if (!hashedDef) {
          hashedDef = await (0, import_crypto.hashPassword)(defaultPassword);
        }
        const accountId = "acc_" + u.id;
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
          VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
        `).run(accountId, u.id, u.id, hashedDef, now, now, "local:credential");
      }
    }
  } catch (err) {
    console.warn("Error ensuring user accounts:", err);
  }
}
function hydrateAuthConsoleFromDataStore(dbStore) {
  ensureUserAccountsExist();
  if (!dbStore) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (Array.isArray(dbStore.tenants)) {
    for (const t of dbStore.tenants) {
      try {
        const slug = t.domainSlug || (t.name ? t.name.toLowerCase().replace(/[^a-z0-9]/g, "-") : "org");
        const metadata = JSON.stringify({
          legalEntity: t.legalEntity || "PT",
          brandName: t.brandName || t.name,
          primaryColor: t.primaryColor || "#06C755",
          currency: t.currency || "IDR",
          spreadsheetId: t.spreadsheetId,
          spreadsheetUrl: t.spreadsheetUrl,
          driveFolderId: t.driveFolderId,
          driveFolderLink: t.driveFolderLink
        });
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO organization (id, name, slug, logo, createdAt, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(t.id || `org_${Date.now()}`, t.name, slug, t.logoUrl || "/favicon.png", t.created_at || now, metadata);
      } catch (e) {
      }
    }
  }
  if (Array.isArray(dbStore.departments)) {
    for (const dept of dbStore.departments) {
      try {
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
          VALUES (?, ?, 0, ?, ?, ?)
        `).run(dept.id || `team_${Date.now()}`, dept.name, dept.organizationId || "org-adapundi", dept.created_at || now, dept.updated_at || now);
      } catch (e) {
      }
    }
  }
  if (Array.isArray(dbStore.allowedUsers)) {
    for (const u of dbStore.allowedUsers) {
      if (!u.email) continue;
      try {
        const userId = u.id || `usr_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
        const finalRole = (u.role || "staff").toLowerCase();
        const banned = u.status === "Inactive" || u.status === "Banned" ? 1 : 0;
        const orgId = u.organizationId || "org-adapundi";
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        `).run(userId, u.name || "User", u.email.toLowerCase(), finalRole, banned, u.createdAt || now, now);
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${userId}`, orgId, userId, finalRole, u.createdAt || now);
        if (u.department) {
          const deptName = u.department.trim();
          let teamRow = sqliteDb.prepare("SELECT id FROM team WHERE LOWER(name) = LOWER(?)").get(deptName);
          if (!teamRow) {
            const teamId = `team_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
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
      } catch (e) {
      }
    }
  }
}
function syncUsersToDataStoreAndSheet() {
  try {
    const users = sqliteDb.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.banned, u.createdAt, u.updatedAt,
             m.organizationId,
             t.name as departmentName
      FROM user u
      LEFT JOIN member m ON u.id = m.userId
      LEFT JOIN teamMember tm ON u.id = tm.userId
      LEFT JOIN team t ON tm.teamId = t.id
    `).all();
    if (globalDbRef) {
      const allowed = users.map((u) => ({
        id: u.id,
        organizationId: u.organizationId || "org-adapundi",
        email: u.email ? u.email.toLowerCase() : "",
        name: u.name || "User",
        role: u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : "Staff",
        department: u.departmentName || "Umum",
        status: u.banned ? "Inactive" : "Active",
        addedBy: "Admin",
        createdAt: u.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      }));
      globalDbRef.allowedUsers = allowed;
      if (saveDbFnRef) saveDbFnRef();
    }
  } catch (err) {
    console.warn("Error syncing users to data store:", err);
  }
}
function getActiveOrgId(req) {
  const headerOrg = req.headers["x-organization-id"];
  if (headerOrg) return headerOrg;
  try {
    const firstOrg = sqliteDb.prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1").get();
    return firstOrg?.id || "org-adapundi";
  } catch (err) {
    return "org-adapundi";
  }
}
authConsoleRouter.get("/overview", (req, res) => {
  try {
    const totalUsers = sqliteDb.prepare("SELECT COUNT(*) as count FROM user").get()?.count || 0;
    const activeUsers = sqliteDb.prepare("SELECT COUNT(*) as count FROM user WHERE banned = 0 OR banned IS NULL").get()?.count || 0;
    const bannedUsers = sqliteDb.prepare("SELECT COUNT(*) as count FROM user WHERE banned = 1").get()?.count || 0;
    const verifiedUsers = sqliteDb.prepare("SELECT COUNT(*) as count FROM user WHERE emailVerified = 1").get()?.count || 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const activeSessions = sqliteDb.prepare("SELECT COUNT(*) as count FROM session WHERE expiresAt > ?").get(now)?.count || 0;
    const totalAccounts = sqliteDb.prepare("SELECT COUNT(*) as count FROM account").get()?.count || 0;
    const credentialAccounts = sqliteDb.prepare("SELECT COUNT(*) as count FROM account WHERE providerId = 'credential'").get()?.count || 0;
    const googleAccounts = sqliteDb.prepare("SELECT COUNT(*) as count FROM account WHERE providerId = 'google'").get()?.count || 0;
    const totalOrgs = sqliteDb.prepare("SELECT COUNT(*) as count FROM organization").get()?.count || 0;
    const totalTeams = sqliteDb.prepare("SELECT COUNT(*) as count FROM team").get()?.count || 0;
    const pendingInvitations = sqliteDb.prepare("SELECT COUNT(*) as count FROM invitation WHERE status = 'pending'").get()?.count || 0;
    const totalApiKeys = sqliteDb.prepare("SELECT COUNT(*) as count FROM apikey WHERE status = 'active'").get()?.count || 0;
    const roleRows = sqliteDb.prepare("SELECT role, COUNT(*) as count FROM user GROUP BY role").all();
    const roleDistribution = {
      superuser: 0,
      admin: 0,
      manager: 0,
      editor: 0,
      viewer: 0,
      legal: 0,
      finance: 0,
      staff: 0
    };
    roleRows.forEach((r) => {
      const roleKey = (r.role || "viewer").toLowerCase();
      roleDistribution[roleKey] = (roleDistribution[roleKey] || 0) + Number(r.count);
    });
    const recentUsers = sqliteDb.prepare("SELECT id, name, email, role, banned, createdAt FROM user ORDER BY createdAt DESC LIMIT 5").all();
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
          id: "production",
          name: "Production (Adapundi Enterprise)",
          env: "production",
          adapter: "Better-Auth Native (SQLite)",
          plugins: ["admin", "organization", "teams", "accessControl"]
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
          totalApiKeys
        },
        roleDistribution,
        providerDistribution: {
          credential: credentialAccounts,
          google: googleAccounts,
          other: Math.max(0, totalAccounts - credentialAccounts - googleAccounts)
        },
        recentUsers,
        recentSessions
      }
    });
  } catch (err) {
    console.error("Error fetching console overview:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch console overview" });
  }
});
authConsoleRouter.get("/users", (req, res) => {
  try {
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
      ORDER BY u.createdAt DESC
    `).all();
    return res.json({
      success: true,
      users: users.map((u) => ({
        ...u,
        banned: Boolean(u.banned),
        emailVerified: Boolean(u.emailVerified)
      }))
    });
  } catch (err) {
    console.error("Error listing users:", err);
    return res.status(500).json({ error: err.message || "Failed to list users" });
  }
});
authConsoleRouter.post("/users", async (req, res) => {
  try {
    const { name, email, role = "staff", password, department, organizationId } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: "Name and email are required" });
    }
    const normRole = String(role).toLowerCase();
    if (normRole !== "superuser" && normRole !== "admin" && !organizationId) {
      return res.status(400).json({
        error: "Organisasi/Tenant wajib dipilih untuk peran di bawah Superuser dan Admin."
      });
    }
    const existing = sqliteDb.prepare("SELECT id FROM user WHERE LOWER(email) = LOWER(?)").get(email);
    if (existing) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    const userId = `usr_${Date.now()}_${import_crypto2.default.randomBytes(4).toString("hex")}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const finalRole = normRole;
    sqliteDb.prepare(`
      INSERT INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, 0, ?, ?)
    `).run(userId, name, email, finalRole, now, now);
    if (password) {
      const hashed = await (0, import_crypto.hashPassword)(password);
      const accountId = `acc_${Date.now()}_${import_crypto2.default.randomBytes(4).toString("hex")}`;
      sqliteDb.prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
      `).run(accountId, userId, userId, hashed, now, now, "local:credential");
    }
    const targetOrgId = finalRole === "superuser" ? null : organizationId || (finalRole === "admin" ? null : getActiveOrgId(req) || "org-adapundi");
    if (targetOrgId) {
      const memberId = `mem_${Date.now()}_${import_crypto2.default.randomBytes(4).toString("hex")}`;
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO member (id, organizationId, userId, role, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(memberId, targetOrgId, userId, finalRole, now);
    }
    if (department && department.trim()) {
      const deptName = department.trim();
      const teamOrgId = targetOrgId || getActiveOrgId(req) || "org-adapundi";
      let teamRow = sqliteDb.prepare("SELECT id FROM team WHERE LOWER(name) = LOWER(?) AND organizationId = ?").get(deptName, teamOrgId);
      if (!teamRow) {
        teamRow = sqliteDb.prepare("SELECT id FROM team WHERE LOWER(name) = LOWER(?)").get(deptName);
      }
      if (!teamRow) {
        const teamId = `team_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
        sqliteDb.prepare(`
          INSERT INTO team (id, name, organizationId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(teamId, deptName, teamOrgId, now, now);
        teamRow = { id: teamId };
      }
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO teamMember (id, teamId, userId, createdAt)
        VALUES (?, ?, ?, ?)
      `).run(`tm_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`, teamRow.id, userId, now);
    }
    syncUsersToDataStoreAndSheet();
    return res.json({
      success: true,
      user: {
        id: userId,
        name,
        email,
        role: finalRole,
        organizationId: targetOrgId || void 0,
        banned: false,
        createdAt: now
      }
    });
  } catch (err) {
    console.error("Error creating user:", err);
    return res.status(500).json({ error: err.message || "Failed to create user" });
  }
});
authConsoleRouter.put("/users/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, banned, banReason } = req.body;
    const user = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const updates = [];
    const values = [];
    if (name !== void 0) {
      updates.push("name = ?");
      values.push(name);
    }
    if (role !== void 0) {
      updates.push("role = ?");
      values.push(String(role).toLowerCase());
    }
    if (banned !== void 0) {
      updates.push("banned = ?");
      values.push(banned ? 1 : 0);
      updates.push("banReason = ?");
      values.push(banned ? banReason || "Banned by admin" : null);
    }
    updates.push("updatedAt = ?");
    values.push((/* @__PURE__ */ new Date()).toISOString());
    values.push(id);
    sqliteDb.prepare(`UPDATE user SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    syncUsersToDataStoreAndSheet();
    const updatedUser = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    return res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Error updating user:", err);
    return res.status(500).json({ error: err.message || "Failed to update user" });
  }
});
authConsoleRouter.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const user = sqliteDb.prepare("SELECT id, email FROM user WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const hashed = await (0, import_crypto.hashPassword)(password);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existingAccount = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").get(id);
    if (existingAccount) {
      sqliteDb.prepare("UPDATE account SET password = ?, updatedAt = ? WHERE id = ?").run(hashed, now, existingAccount.id);
    } else {
      const accountId = `acc_${Date.now()}_${import_crypto2.default.randomBytes(4).toString("hex")}`;
      sqliteDb.prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
      `).run(accountId, id, id, hashed, now, now, "local:credential");
    }
    return res.json({ success: true, message: `Password reset successful for ${user.email}` });
  } catch (err) {
    console.error("Error resetting password:", err);
    return res.status(500).json({ error: err.message || "Failed to reset password" });
  }
});
authConsoleRouter.put("/users/:id/password", async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const user = sqliteDb.prepare("SELECT id, email FROM user WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const hashed = await (0, import_crypto.hashPassword)(password);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existingAccount = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").get(id);
    if (existingAccount) {
      sqliteDb.prepare("UPDATE account SET password = ?, updatedAt = ? WHERE id = ?").run(hashed, now, existingAccount.id);
    } else {
      const accountId = `acc_${Date.now()}_${import_crypto2.default.randomBytes(4).toString("hex")}`;
      sqliteDb.prepare(`
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, ?)
      `).run(accountId, id, id, hashed, now, now, "local:credential");
    }
    return res.json({ success: true, message: `Password updated for ${user.email}` });
  } catch (err) {
    console.error("Error updating password:", err);
    return res.status(500).json({ error: err.message || "Failed to update password" });
  }
});
authConsoleRouter.put("/users/:id/role", (req, res) => {
  try {
    const { id } = req.params;
    const { role, organizationId, department, name, email } = req.body;
    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }
    const user = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (name) {
      sqliteDb.prepare("UPDATE user SET name = ? WHERE id = ?").run(String(name).trim(), id);
    }
    if (email) {
      const emailTrim = String(email).trim().toLowerCase();
      const duplicate = sqliteDb.prepare("SELECT id FROM user WHERE LOWER(email) = ? AND id != ?").get(emailTrim, id);
      if (duplicate) {
        return res.status(400).json({ error: "Email address is already in use by another user" });
      }
      sqliteDb.prepare("UPDATE user SET email = ? WHERE id = ?").run(emailTrim, id);
    }
    const normRole = String(role).toLowerCase();
    if (normRole !== "superuser" && normRole !== "admin") {
      const existingMember = sqliteDb.prepare("SELECT organizationId FROM member WHERE userId = ?").get(id);
      if (!organizationId && !existingMember?.organizationId) {
        return res.status(400).json({ error: "Organisasi/Tenant wajib dipilih untuk peran di bawah Superuser dan Admin." });
      }
    }
    sqliteDb.prepare("UPDATE user SET role = ?, updatedAt = ? WHERE id = ?").run(normRole, (/* @__PURE__ */ new Date()).toISOString(), id);
    if (normRole === "superuser") {
      sqliteDb.prepare("DELETE FROM member WHERE userId = ?").run(id);
    } else if (organizationId) {
      const existingMember = sqliteDb.prepare("SELECT id FROM member WHERE userId = ?").get(id);
      if (existingMember) {
        sqliteDb.prepare("UPDATE member SET organizationId = ?, role = ? WHERE userId = ?").run(organizationId, normRole, id);
      } else {
        sqliteDb.prepare(`
          INSERT INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`, organizationId, id, normRole, (/* @__PURE__ */ new Date()).toISOString());
      }
    } else {
      sqliteDb.prepare("UPDATE member SET role = ? WHERE userId = ?").run(normRole, id);
    }
    if (department !== void 0) {
      const activeOrgId = organizationId || getActiveOrgId(req) || "org-adapundi";
      const deptName = String(department).trim();
      if (deptName) {
        let teamRow = sqliteDb.prepare("SELECT id FROM team WHERE LOWER(name) = LOWER(?)").get(deptName);
        if (!teamRow) {
          const teamId = `team_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
          sqliteDb.prepare(`
            INSERT INTO team (id, name, organizationId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(teamId, deptName, activeOrgId, (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString());
          teamRow = { id: teamId };
        }
        sqliteDb.prepare("DELETE FROM teamMember WHERE userId = ?").run(id);
        sqliteDb.prepare(`
          INSERT INTO teamMember (id, teamId, userId, createdAt)
          VALUES (?, ?, ?, ?)
        `).run(`tm_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`, teamRow.id, id, (/* @__PURE__ */ new Date()).toISOString());
      }
    }
    try {
      const dataStorePath = import_path2.default.join(process.cwd(), "data_store.json");
      if (import_fs2.default.existsSync(dataStorePath)) {
        const raw = import_fs2.default.readFileSync(dataStorePath, "utf-8");
        const ds = JSON.parse(raw);
        if (Array.isArray(ds.allowedUsers)) {
          const target = ds.allowedUsers.find(
            (u) => u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()
          );
          if (target) {
            target.role = normRole.charAt(0).toUpperCase() + normRole.slice(1);
            if (department !== void 0 && String(department).trim()) {
              target.department = String(department).trim();
            }
            import_fs2.default.writeFileSync(dataStorePath, JSON.stringify(ds, null, 2), "utf-8");
          }
        }
      }
    } catch (dsErr) {
      console.warn("Could not sync data_store.json from authConsole:", dsErr);
    }
    syncUsersToDataStoreAndSheet();
    const updatedUser = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    return res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Error updating user role:", err);
    return res.status(500).json({ error: err.message || "Failed to update user role" });
  }
});
authConsoleRouter.post("/users/:id/ban", (req, res) => {
  try {
    const { id } = req.params;
    const { banned, banReason } = req.body;
    const user = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isBanned = Boolean(banned);
    const reason = isBanned ? banReason || "Dicekal oleh admin sistem" : null;
    sqliteDb.prepare("UPDATE user SET banned = ?, banReason = ?, updatedAt = ? WHERE id = ?").run(isBanned ? 1 : 0, reason, (/* @__PURE__ */ new Date()).toISOString(), id);
    if (isBanned) {
      sqliteDb.prepare("DELETE FROM session WHERE userId = ?").run(id);
    }
    syncUsersToDataStoreAndSheet();
    const updatedUser = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    return res.json({ success: true, user: updatedUser, message: isBanned ? "Pengguna berhasil dicekal" : "Status cekal pengguna telah dicabut" });
  } catch (err) {
    console.error("Error updating ban status:", err);
    return res.status(500).json({ error: err.message || "Failed to update ban status" });
  }
});
authConsoleRouter.post("/users/:id/impersonate", (req, res) => {
  try {
    const { id } = req.params;
    const user = sqliteDb.prepare("SELECT * FROM user WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const token = `imp_${import_crypto2.default.randomBytes(24).toString("hex")}`;
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1e3);
    const sessionId = `sess_${Date.now()}_${import_crypto2.default.randomBytes(4).toString("hex")}`;
    sqliteDb.prepare(`
      INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId, activeOrganizationId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, expiresAt.toISOString(), token, now.toISOString(), now.toISOString(), req.ip || "127.0.0.1", "Impersonated by Enterprise Superadmin", id, null);
    return res.json({
      success: true,
      message: `Berhasil login sebagai ${user.name} (${user.email})`,
      sessionToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Error impersonating user:", err);
    return res.status(500).json({ error: err.message || "Failed to impersonate user" });
  }
});
authConsoleRouter.delete("/users/:id", (req, res) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare("DELETE FROM session WHERE userId = ?").run(id);
    sqliteDb.prepare("DELETE FROM account WHERE userId = ?").run(id);
    sqliteDb.prepare("DELETE FROM member WHERE userId = ?").run(id);
    sqliteDb.prepare("DELETE FROM teamMember WHERE userId = ?").run(id);
    sqliteDb.prepare("DELETE FROM user WHERE id = ?").run(id);
    syncUsersToDataStoreAndSheet();
    return res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    return res.status(500).json({ error: err.message || "Failed to delete user" });
  }
});
authConsoleRouter.post("/users/bulk-action", (req, res) => {
  try {
    const { action, userIds } = req.body;
    if (!action || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "Action and non-empty userIds array are required" });
    }
    if (action === "ban") {
      const stmt = sqliteDb.prepare("UPDATE user SET banned = 1, banReason = ?, updatedAt = ? WHERE id = ?");
      const deleteSessionStmt = sqliteDb.prepare("DELETE FROM session WHERE userId = ?");
      const transaction = sqliteDb.transaction((ids) => {
        for (const id of ids) {
          stmt.run("Dicekal secara massal oleh admin", (/* @__PURE__ */ new Date()).toISOString(), id);
          deleteSessionStmt.run(id);
        }
      });
      transaction(userIds);
      syncUsersToDataStoreAndSheet();
      return res.json({ success: true, message: `${userIds.length} pengguna berhasil dicekal secara massal` });
    }
    if (action === "unban") {
      const stmt = sqliteDb.prepare("UPDATE user SET banned = 0, banReason = NULL, updatedAt = ? WHERE id = ?");
      const transaction = sqliteDb.transaction((ids) => {
        for (const id of ids) {
          stmt.run((/* @__PURE__ */ new Date()).toISOString(), id);
        }
      });
      transaction(userIds);
      syncUsersToDataStoreAndSheet();
      return res.json({ success: true, message: `Status cekal ${userIds.length} pengguna berhasil dicabut` });
    }
    if (action === "delete") {
      const deleteSession = sqliteDb.prepare("DELETE FROM session WHERE userId = ?");
      const deleteAccount = sqliteDb.prepare("DELETE FROM account WHERE userId = ?");
      const deleteMember = sqliteDb.prepare("DELETE FROM member WHERE userId = ?");
      const deleteTeamMember = sqliteDb.prepare("DELETE FROM teamMember WHERE userId = ?");
      const deleteUser = sqliteDb.prepare("DELETE FROM user WHERE id = ?");
      const transaction = sqliteDb.transaction((ids) => {
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
    return res.status(400).json({ error: "Invalid bulk action" });
  } catch (err) {
    console.error("Error executing bulk action:", err);
    return res.status(500).json({ error: err.message || "Failed to execute bulk action" });
  }
});
authConsoleRouter.get("/accounts", (req, res) => {
  try {
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
      ORDER BY a.createdAt DESC
    `).all();
    return res.json({
      success: true,
      accounts: accounts.map((a) => ({
        ...a,
        hasPassword: Boolean(a.hasPassword)
      }))
    });
  } catch (err) {
    console.error("Error listing accounts:", err);
    return res.status(500).json({ error: err.message || "Failed to list accounts" });
  }
});
authConsoleRouter.get("/sessions", (req, res) => {
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
    const now = /* @__PURE__ */ new Date();
    return res.json({
      success: true,
      sessions: sessions.map((s) => ({
        ...s,
        tokenPreview: s.token ? `${s.token.slice(0, 10)}...${s.token.slice(-6)}` : "",
        isExpired: s.expiresAt ? new Date(s.expiresAt) < now : false
      }))
    });
  } catch (err) {
    console.error("Error listing sessions:", err);
    return res.status(500).json({ error: err.message || "Failed to list sessions" });
  }
});
authConsoleRouter.delete("/sessions/:id", (req, res) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare("DELETE FROM session WHERE id = ? OR token = ?").run(id, id);
    return res.json({ success: true, message: "Session revoked successfully" });
  } catch (err) {
    console.error("Error revoking session:", err);
    return res.status(500).json({ error: err.message || "Failed to revoke session" });
  }
});
authConsoleRouter.post("/sessions/revoke-user", (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    sqliteDb.prepare("DELETE FROM session WHERE userId = ?").run(userId);
    return res.json({ success: true, message: `All sessions revoked for user ${userId}` });
  } catch (err) {
    console.error("Error revoking user sessions:", err);
    return res.status(500).json({ error: err.message || "Failed to revoke user sessions" });
  }
});
authConsoleRouter.post("/sessions/revoke-all/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    sqliteDb.prepare("DELETE FROM session WHERE userId = ?").run(userId);
    return res.json({ success: true, message: `All sessions revoked for user ${userId}` });
  } catch (err) {
    console.error("Error revoking user sessions:", err);
    return res.status(500).json({ error: err.message || "Failed to revoke user sessions" });
  }
});
authConsoleRouter.get("/organizations", (req, res) => {
  try {
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
      ORDER BY o.createdAt ASC
    `).all();
    return res.json({
      success: true,
      organizations: orgs.map((o) => {
        let parsedMetadata = {};
        try {
          if (o.metadata) parsedMetadata = JSON.parse(o.metadata);
        } catch (e) {
        }
        return {
          ...o,
          metadata: parsedMetadata
        };
      })
    });
  } catch (err) {
    console.error("Error listing organizations:", err);
    return res.status(500).json({ error: err.message || "Failed to list organizations" });
  }
});
function syncTenantsToDataStore() {
  try {
    const dataStorePath = import_path2.default.join(process.cwd(), "data_store.json");
    if (!import_fs2.default.existsSync(dataStorePath)) return;
    const raw = import_fs2.default.readFileSync(dataStorePath, "utf-8");
    const ds = JSON.parse(raw);
    const orgRows = sqliteDb.prepare("SELECT * FROM organization ORDER BY createdAt ASC").all();
    if (orgRows && orgRows.length > 0) {
      const updatedTenants = orgRows.map((org) => {
        let meta = {};
        try {
          if (org.metadata) {
            meta = typeof org.metadata === "string" ? JSON.parse(org.metadata) : org.metadata;
          }
        } catch {
        }
        const existing = (ds.tenants || []).find((t) => t.id === org.id || t.domainSlug === org.slug);
        return {
          id: org.id,
          name: org.name,
          legalEntity: existing?.legalEntity || meta.legalEntity || "PT",
          brandName: org.name,
          tagline: meta.tagline || existing?.tagline || "Legal & Commercial Contract Management",
          logoUrl: org.logo || existing?.logoUrl || "/favicon.png",
          primaryColor: meta.primaryColor || existing?.primaryColor || "#06C755",
          currency: meta.currency || existing?.currency || "IDR",
          domainSlug: org.slug,
          isDefault: org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" || Boolean(existing?.isDefault),
          spreadsheetId: existing?.spreadsheetId || meta.spreadsheetId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? ds.googleConfig?.spreadsheetId : void 0),
          spreadsheetUrl: existing?.spreadsheetUrl || meta.spreadsheetUrl || (existing?.spreadsheetId || meta.spreadsheetId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? ds.googleConfig?.spreadsheetId : void 0) ? `https://docs.google.com/spreadsheets/d/${existing?.spreadsheetId || meta.spreadsheetId || ds.googleConfig?.spreadsheetId}/edit` : void 0),
          driveFolderId: existing?.driveFolderId || meta.driveFolderId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? ds.googleConfig?.driveFolderId : void 0),
          driveFolderLink: existing?.driveFolderLink || meta.driveFolderLink || (existing?.driveFolderId || meta.driveFolderId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? ds.googleConfig?.driveFolderId : void 0) ? `https://drive.google.com/drive/folders/${existing?.driveFolderId || meta.driveFolderId || ds.googleConfig?.driveFolderId}` : void 0)
        };
      });
      ds.tenants = updatedTenants;
      if (!ds.tenants.some((t) => t.id === ds.activeTenantId)) {
        ds.activeTenantId = ds.tenants[0]?.id || "org_1789542306289_b3a4f3";
      }
      import_fs2.default.writeFileSync(dataStorePath, JSON.stringify(ds, null, 2), "utf-8");
    }
  } catch (err) {
    console.warn("Error syncing tenants to data_store.json:", err);
  }
}
authConsoleRouter.post("/organizations", (req, res) => {
  try {
    const { name, slug, logo, metadata } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Organization name is required" });
    }
    const orgId = `org_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
    const generatedSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]/g, "-")).toLowerCase();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    sqliteDb.prepare(`
      INSERT INTO organization (id, name, slug, logo, createdAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      orgId,
      name,
      generatedSlug,
      logo || "/favicon.png",
      now,
      typeof metadata === "string" ? metadata : JSON.stringify(metadata || {})
    );
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
        logo: logo || "/favicon.png",
        createdAt: now,
        metadata
      }
    });
  } catch (err) {
    console.error("Error creating organization:", err);
    return res.status(500).json({ error: err.message || "Failed to create organization" });
  }
});
authConsoleRouter.put("/organizations/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, logo, metadata } = req.body;
    const org = sqliteDb.prepare("SELECT * FROM organization WHERE id = ?").get(id);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const updates = [];
    const values = [];
    if (name !== void 0) {
      updates.push("name = ?");
      values.push(name);
    }
    if (slug !== void 0) {
      updates.push("slug = ?");
      values.push(slug);
    }
    if (logo !== void 0) {
      updates.push("logo = ?");
      values.push(logo);
    }
    if (metadata !== void 0) {
      updates.push("metadata = ?");
      values.push(typeof metadata === "string" ? metadata : JSON.stringify(metadata));
    }
    if (updates.length > 0) {
      values.push(id);
      sqliteDb.prepare(`UPDATE organization SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      syncTenantsToDataStore();
    }
    return res.json({ success: true, message: "Organization updated" });
  } catch (err) {
    console.error("Error updating organization:", err);
    return res.status(500).json({ error: err.message || "Failed to update organization" });
  }
});
authConsoleRouter.post("/organizations/:id/set-active", (req, res) => {
  try {
    const { id } = req.params;
    if (globalDbRef) {
      globalDbRef.activeTenantId = id;
      if (saveDbFnRef) {
        try {
          saveDbFnRef();
        } catch {
        }
      }
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      sqliteDb.prepare("UPDATE session SET activeOrganizationId = ?, updatedAt = ? WHERE token = ?").run(id, (/* @__PURE__ */ new Date()).toISOString(), token);
    }
    return res.json({ success: true, message: `Active organization set to ${id}`, activeTenantId: id });
  } catch (err) {
    console.error("Error setting active organization:", err);
    return res.status(500).json({ error: err.message || "Failed to set active organization" });
  }
});
authConsoleRouter.delete("/organizations/:id", (req, res) => {
  try {
    const { id } = req.params;
    const count = sqliteDb.prepare("SELECT COUNT(*) as count FROM organization").get()?.count || 0;
    if (count <= 1) {
      return res.status(400).json({ error: "Tidak dapat menghapus satu-satunya organisasi yang tersisa" });
    }
    const org = sqliteDb.prepare("SELECT * FROM organization WHERE id = ?").get(id);
    if (org?.slug === "adapundi") {
      return res.status(400).json({ error: "Organisasi default sistem tidak dapat dihapus" });
    }
    sqliteDb.prepare("DELETE FROM member WHERE organizationId = ?").run(id);
    sqliteDb.prepare("DELETE FROM team WHERE organizationId = ?").run(id);
    sqliteDb.prepare("DELETE FROM invitation WHERE organizationId = ?").run(id);
    sqliteDb.prepare("DELETE FROM organization WHERE id = ?").run(id);
    try {
      const dataFilePath2 = import_path2.default.join(process.cwd(), "data_store.json");
      if (import_fs2.default.existsSync(dataFilePath2)) {
        const fileData = JSON.parse(import_fs2.default.readFileSync(dataFilePath2, "utf-8"));
        if (fileData.tenants && Array.isArray(fileData.tenants)) {
          fileData.tenants = fileData.tenants.filter((t) => t.id !== id && t.domainSlug !== org?.slug);
          if (fileData.activeTenantId === id) {
            fileData.activeTenantId = fileData.tenants[0]?.id || "tenant-adapundi";
          }
          import_fs2.default.writeFileSync(dataFilePath2, JSON.stringify(fileData, null, 2));
        }
      }
    } catch (e) {
    }
    return res.json({ success: true, message: "Organization deleted successfully" });
  } catch (err) {
    console.error("Error deleting organization:", err);
    return res.status(500).json({ error: err.message || "Failed to delete organization" });
  }
});
authConsoleRouter.get("/teams", (req, res) => {
  try {
    const orgId = getActiveOrgId(req);
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
      WHERE t.organizationId = ? OR ? = 'ALL'
      ORDER BY t.createdAt ASC
    `).all(orgId, orgId);
    if (teams.length === 0 && globalDbRef && globalDbRef.departments && globalDbRef.departments.length > 0) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      for (const dept of globalDbRef.departments) {
        const dOrgId = dept.organizationId || orgId;
        if (dOrgId === orgId || orgId === "ALL") {
          try {
            sqliteDb.prepare(`
              INSERT OR IGNORE INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
              VALUES (?, ?, 0, ?, ?, ?)
            `).run(dept.id || `team_${Date.now()}`, dept.name, dOrgId, dept.created_at || now, dept.updated_at || now);
          } catch (e) {
          }
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
        WHERE t.organizationId = ? OR ? = 'ALL'
        ORDER BY t.createdAt ASC
      `).all(orgId, orgId);
    }
    const teamsWithMembers = teams.map((team) => {
      const members = sqliteDb.prepare(`
        SELECT tm.id as membershipId, tm.userId, tm.createdAt as joinedAt, u.name, u.email, u.role
        FROM teamMember tm
        JOIN user u ON tm.userId = u.id
        WHERE tm.teamId = ?
      `).all(team.id);
      return {
        ...team,
        members
      };
    });
    return res.json({ success: true, teams: teamsWithMembers });
  } catch (err) {
    console.error("Error listing teams:", err);
    return res.status(500).json({ error: err.message || "Failed to list teams" });
  }
});
authConsoleRouter.post("/teams", (req, res) => {
  try {
    const { name, organizationId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Nama tim / departemen wajib diisi" });
    }
    const trimmedName = name.trim();
    const orgId = organizationId || getActiveOrgId(req);
    const teamId = `team_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    sqliteDb.prepare(`
      INSERT INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
      VALUES (?, ?, 0, ?, ?, ?)
    `).run(teamId, trimmedName, orgId, now, now);
    if (globalDbRef) {
      if (!globalDbRef.departments) globalDbRef.departments = [];
      const exists = globalDbRef.departments.some(
        (d) => d.id === teamId || d.name.toLowerCase() === trimmedName.toLowerCase() && (d.organizationId === orgId || !d.organizationId)
      );
      if (!exists) {
        globalDbRef.departments.push({
          id: teamId,
          organizationId: orgId,
          name: trimmedName,
          code: trimmedName.substring(0, 3).toUpperCase(),
          description: "",
          created_at: now,
          updated_at: now
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
        createdAt: now
      }
    });
  } catch (err) {
    console.error("Error creating team:", err);
    return res.status(500).json({ error: err.message || "Failed to create team" });
  }
});
authConsoleRouter.put("/teams/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Nama tim / departemen wajib diisi." });
    }
    const trimmedName = name.trim();
    const existing = sqliteDb.prepare("SELECT * FROM team WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Tim / departemen tidak ditemukan." });
    }
    const oldName = existing.name;
    sqliteDb.prepare("UPDATE team SET name = ? WHERE id = ?").run(trimmedName, id);
    if (globalDbRef && globalDbRef.departments) {
      const idx = globalDbRef.departments.findIndex((d) => d.id === id || d.name === oldName);
      if (idx !== -1) {
        globalDbRef.departments[idx].name = trimmedName;
      }
      if (globalDbRef.users) {
        globalDbRef.users.forEach((u) => {
          if (u.department === oldName) u.department = trimmedName;
        });
      }
      if (saveDbFnRef) saveDbFnRef();
    }
    return res.json({ success: true, team: { ...existing, name: trimmedName } });
  } catch (err) {
    console.error("Error updating team:", err);
    return res.status(500).json({ error: err.message || "Gagal memperbarui departemen" });
  }
});
authConsoleRouter.delete("/teams/:id", (req, res) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare("DELETE FROM teamMember WHERE teamId = ?").run(id);
    sqliteDb.prepare("DELETE FROM team WHERE id = ?").run(id);
    if (globalDbRef && globalDbRef.departments) {
      globalDbRef.departments = globalDbRef.departments.filter(
        (d) => d.id !== id && d.name !== id
      );
      if (saveDbFnRef) saveDbFnRef();
    }
    return res.json({ success: true, message: "Team deleted" });
  } catch (err) {
    console.error("Error deleting team:", err);
    return res.status(500).json({ error: err.message || "Failed to delete team" });
  }
});
authConsoleRouter.post("/teams/:id/members", (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const memId = `tm_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    sqliteDb.prepare(`
      INSERT OR REPLACE INTO teamMember (id, teamId, userId, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(memId, id, userId, now);
    const count = sqliteDb.prepare("SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?").get(id)?.count || 0;
    sqliteDb.prepare("UPDATE team SET memberCount = ?, updatedAt = ? WHERE id = ?").run(count, now, id);
    return res.json({ success: true, message: "Member added to team" });
  } catch (err) {
    console.error("Error adding team member:", err);
    return res.status(500).json({ error: err.message || "Failed to add team member" });
  }
});
authConsoleRouter.delete("/teams/:id/members/:userId", (req, res) => {
  try {
    const { id, userId } = req.params;
    sqliteDb.prepare("DELETE FROM teamMember WHERE teamId = ? AND userId = ?").run(id, userId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const count = sqliteDb.prepare("SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?").get(id)?.count || 0;
    sqliteDb.prepare("UPDATE team SET memberCount = ?, updatedAt = ? WHERE id = ?").run(count, now, id);
    return res.json({ success: true, message: "Member removed from team" });
  } catch (err) {
    console.error("Error removing team member:", err);
    return res.status(500).json({ error: err.message || "Failed to remove team member" });
  }
});
authConsoleRouter.get("/invitations", (req, res) => {
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
      ORDER BY i.createdAt DESC
    `).all();
    return res.json({ success: true, invitations });
  } catch (err) {
    console.error("Error listing invitations:", err);
    return res.status(500).json({ error: err.message || "Failed to list invitations" });
  }
});
async function dispatchInvitationEmail(inv, req) {
  const host = req.get("host") || "localhost:3000";
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const baseUrl = `${protocol}://${host}`;
  const inviteUrl = `${baseUrl}/?accept_invite=${inv.id}&email=${encodeURIComponent(inv.email)}`;
  let orgName = "Adapundi Legal System";
  if (inv.organizationId) {
    try {
      const org = sqliteDb.prepare("SELECT name FROM organization WHERE id = ?").get(inv.organizationId);
      if (org?.name) orgName = org.name;
    } catch (_) {
    }
  }
  const smtpConfig = globalDbRef?.googleConfig;
  const isSmtpEnabled = Boolean(smtpConfig && smtpConfig.smtpEnabled && smtpConfig.smtpHost && smtpConfig.smtpUser);
  if (isSmtpEnabled) {
    try {
      const port = Number(smtpConfig.smtpPort) || (smtpConfig.smtpSecure ? 465 : 587);
      const transporter = import_nodemailer.default.createTransport({
        host: smtpConfig.smtpHost,
        port,
        secure: smtpConfig.smtpSecure ?? port === 465,
        auth: { user: smtpConfig.smtpUser, pass: smtpConfig.smtpPassword || "" },
        tls: { rejectUnauthorized: false }
      });
      const fromAddress = smtpConfig.smtpFromEmail || smtpConfig.smtpUser;
      const fromName = smtpConfig.smtpFromName || `${orgName} Admin Console`;
      const inviter = inv.inviterName || "Administrator";
      const subject = `[Undangan Resmi] Anda Diundang Bergabung ke ${orgName} (${inv.role.toUpperCase()})`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #06C755;">
            <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Undangan Anggota Organisasi</h2>
            <p style="color: #64748b; font-size: 13px; margin-top: 4px;">${orgName}</p>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">Halo,</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            <strong>${inviter}</strong> telah mengundang Anda untuk bergabung dengan <strong>${orgName}</strong> sebagai <strong>${inv.role.toUpperCase()}</strong> di platform Adapundi Legal & Operations Console.
          </p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;">
            <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Email Tujuan:</strong> ${inv.email}</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;"><strong>Peran / Akses:</strong> ${inv.role.toUpperCase()}</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;"><strong>Masa Berlaku:</strong> s.d ${new Date(inv.expiresAt).toLocaleDateString("id-ID")}</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteUrl}" style="background-color: #06C755; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
              Konfirmasi & Terima Undangan
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; text-align: center;">
            Atau salin tautan berikut ke browser Anda:<br>
            <a href="${inviteUrl}" style="color: #0284c7; word-break: break-all;">${inviteUrl}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;">
          <p style="color: #cbd5e1; font-size: 11px; text-align: center;">
            Email ini dikirim otomatis oleh Sistem Undangan ${orgName} via SMTP Relay (${fromAddress}).
          </p>
        </div>
      `;
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: inv.email,
        subject,
        html
      });
      return {
        sent: true,
        smtpActive: true,
        message: `Email undangan resmi telah sukses dikirim langsung ke inbox ${inv.email} via SMTP Relay (${fromAddress}).`,
        inviteUrl
      };
    } catch (err) {
      console.warn("[Invitation Email SMTP Error]", err?.message);
      return {
        sent: false,
        smtpActive: true,
        message: `Undangan tersimpan, namun pengiriman email via SMTP Relay gagal: ${err?.message || "Error SMTP"}. Gunakan tombol Salin Link Undangan sebagai alternatif.`,
        inviteUrl
      };
    }
  }
  return {
    sent: false,
    smtpActive: false,
    message: `Undangan berhasil dicatat resmi di sistem. (Catatan: Aktifkan 'SMTP Relay Server' di menu Settings agar email otomatis langsung terkirim ke inbox ${inv.email}).`,
    inviteUrl
  };
}
authConsoleRouter.post("/invitations", async (req, res) => {
  try {
    const { email, role = "staff", teamId, organizationId } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const orgId = organizationId || getActiveOrgId(req);
    const invId = `inv_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
    const now = /* @__PURE__ */ new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3);
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
      status: "pending",
      expiresAt: expires.toISOString(),
      inviterName: "Admin"
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
        inviteUrl: emailRes.inviteUrl
      }
    });
  } catch (err) {
    console.error("Error creating invitation:", err);
    return res.status(500).json({ error: err.message || "Failed to create invitation" });
  }
});
authConsoleRouter.post("/invitations/:id/resend", async (req, res) => {
  try {
    const { id } = req.params;
    const now = /* @__PURE__ */ new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3);
    sqliteDb.prepare("UPDATE invitation SET expiresAt = ?, status = ? WHERE id = ?").run(expires.toISOString(), "pending", id);
    const inv = sqliteDb.prepare("SELECT * FROM invitation WHERE id = ?").get(id);
    let emailRes = null;
    if (inv) {
      emailRes = await dispatchInvitationEmail({
        id: inv.id,
        email: inv.email,
        role: inv.role || "staff",
        organizationId: inv.organizationId,
        inviterName: "Admin",
        expiresAt: expires.toISOString()
      }, req);
    }
    return res.json({
      success: true,
      message: emailRes?.message || "Undangan berhasil diperbarui dan dikirim ulang.",
      inviteUrl: emailRes?.inviteUrl,
      sentViaSmtp: emailRes?.sent || false
    });
  } catch (err) {
    console.error("Error resending invitation:", err);
    return res.status(500).json({ error: err.message || "Failed to resend invitation" });
  }
});
authConsoleRouter.get("/invitations/verify", (req, res) => {
  try {
    const code = req.query.code || req.query.accept_invite;
    if (!code) {
      return res.status(400).json({ error: "Kode undangan wajib diisi" });
    }
    const inv = sqliteDb.prepare(`
      SELECT i.*, o.name as organizationName
      FROM invitation i
      LEFT JOIN organization o ON i.organizationId = o.id
      WHERE i.id = ?
    `).get(code);
    if (!inv) {
      return res.status(404).json({ error: "Kode undangan tidak ditemukan" });
    }
    const isExpired = new Date(inv.expiresAt) < /* @__PURE__ */ new Date();
    if (isExpired || inv.status === "expired") {
      return res.status(400).json({ error: "Undangan telah kadaluarsa", invitation: inv });
    }
    if (inv.status === "accepted") {
      return res.status(400).json({ error: "Undangan ini sudah pernah diterima sebelumnya", invitation: inv });
    }
    return res.json({ success: true, invitation: inv });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Gagal memverifikasi undangan" });
  }
});
authConsoleRouter.post("/invitations/accept", (req, res) => {
  try {
    const { code, name } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Kode undangan wajib diisi" });
    }
    const inv = sqliteDb.prepare("SELECT * FROM invitation WHERE id = ?").get(code);
    if (!inv) {
      return res.status(404).json({ error: "Undangan tidak ditemukan" });
    }
    if (inv.status === "accepted") {
      return res.status(400).json({ error: "Undangan ini sudah diterima" });
    }
    if (new Date(inv.expiresAt) < /* @__PURE__ */ new Date()) {
      return res.status(400).json({ error: "Undangan telah kadaluarsa" });
    }
    let user = sqliteDb.prepare("SELECT id, email, name FROM user WHERE email = ?").get(inv.email);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let userId = user?.id;
    if (!user) {
      userId = `usr_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
      const userName = name || inv.email.split("@")[0];
      sqliteDb.prepare(`
        INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, ?, ?, ?)
      `).run(userId, userName, inv.email, inv.role || "staff", now, now);
    }
    const existingMember = sqliteDb.prepare("SELECT id FROM member WHERE organizationId = ? AND userId = ?").get(inv.organizationId, userId);
    if (!existingMember) {
      const memberId = `mem_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
      sqliteDb.prepare(`
        INSERT INTO member (id, organizationId, userId, role, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(memberId, inv.organizationId, userId, inv.role || "staff", now);
    }
    sqliteDb.prepare("UPDATE invitation SET status = ? WHERE id = ?").run("accepted", code);
    return res.json({
      success: true,
      message: `Selamat! Anda telah resmi bergabung ke organisasi sebagai ${inv.role || "staff"}.`,
      user: { id: userId, email: inv.email }
    });
  } catch (err) {
    console.error("Error accepting invitation:", err);
    return res.status(500).json({ error: err.message || "Gagal menerima undangan" });
  }
});
authConsoleRouter.delete("/invitations/:id", (req, res) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare("DELETE FROM invitation WHERE id = ?").run(id);
    return res.json({ success: true, message: "Invitation canceled" });
  } catch (err) {
    console.error("Error canceling invitation:", err);
    return res.status(500).json({ error: err.message || "Failed to cancel invitation" });
  }
});
authConsoleRouter.get("/api-keys", (req, res) => {
  try {
    const keys = sqliteDb.prepare(`
      SELECT id, name, keyPreview, scopes, createdAt, expiresAt, status
      FROM apikey
      ORDER BY createdAt DESC
    `).all();
    return res.json({
      success: true,
      apiKeys: keys.map((k) => ({
        ...k,
        scopes: k.scopes ? k.scopes.split(",").map((s) => s.trim()) : []
      }))
    });
  } catch (err) {
    console.error("Error listing API keys:", err);
    return res.status(500).json({ error: err.message || "Failed to list API keys" });
  }
});
authConsoleRouter.post("/api-keys", (req, res) => {
  try {
    const { name, scopes = ["contract:read"], expiresInDays = 90 } = req.body;
    if (!name) {
      return res.status(400).json({ error: "API Key name is required" });
    }
    const keyId = `key_${Date.now()}_${import_crypto2.default.randomBytes(3).toString("hex")}`;
    const rawSecret = `ba_live_${import_crypto2.default.randomBytes(24).toString("hex")}`;
    const keyPreview = `${rawSecret.slice(0, 11)}...${rawSecret.slice(-4)}`;
    const keyHash = import_crypto2.default.createHash("sha256").update(rawSecret).digest("hex");
    const now = /* @__PURE__ */ new Date();
    const expires = expiresInDays ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1e3) : null;
    const scopeString = Array.isArray(scopes) ? scopes.join(",") : String(scopes);
    sqliteDb.prepare(`
      INSERT INTO apikey (id, name, keyPreview, keyHash, scopes, createdAt, expiresAt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(keyId, name, keyPreview, keyHash, scopeString, now.toISOString(), expires ? expires.toISOString() : null);
    return res.json({
      success: true,
      apiKey: {
        id: keyId,
        name,
        keyPreview,
        rawSecret,
        // ONLY SHOWN ONCE
        secret: rawSecret,
        scopes: Array.isArray(scopes) ? scopes : [scopes],
        createdAt: now.toISOString(),
        expiresAt: expires ? expires.toISOString() : null
      }
    });
  } catch (err) {
    console.error("Error generating API key:", err);
    return res.status(500).json({ error: err.message || "Failed to generate API key" });
  }
});
authConsoleRouter.post("/api-keys/:id/revoke", (req, res) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare("UPDATE apikey SET status = ? WHERE id = ?").run("revoked", id);
    return res.json({ success: true, message: "API key revoked successfully" });
  } catch (err) {
    console.error("Error revoking API key:", err);
    return res.status(500).json({ error: err.message || "Failed to revoke API key" });
  }
});
authConsoleRouter.delete("/api-keys/:id", (req, res) => {
  try {
    const { id } = req.params;
    sqliteDb.prepare("DELETE FROM apikey WHERE id = ?").run(id);
    return res.json({ success: true, message: "API key deleted successfully" });
  } catch (err) {
    console.error("Error deleting API key:", err);
    return res.status(500).json({ error: err.message || "Failed to delete API key" });
  }
});
authConsoleRouter.get("/rbac-matrix", (req, res) => {
  try {
    const matrix = {
      statement,
      roles: {
        superuser: {
          name: "Superuser",
          scope: "System Level",
          description: "Akses tertinggi: Kelola akun pengguna, peran (role), audit sistem, konfigurasi enterprise, serta memiliki seluruh kontrol dan approval dokumen operasional (seperti Admin) secara global.",
          permissions: {
            user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "set-email", "get", "update", "read"],
            session: ["list", "revoke", "delete"],
            organization: ["create", "read", "update", "delete", "set-active"],
            team: ["create", "read", "update", "delete"],
            settings: ["read", "update"],
            audit: ["view"],
            contract: ["create", "read", "update", "delete", "approve", "archive"],
            partner: ["create", "read", "update", "delete"],
            report: ["view", "export"]
          }
        },
        admin: {
          name: "Admin",
          scope: "Global Level",
          description: "Tinjau, edit, dan berikan persetujuan akhir (final approval) seluruh dokumen perusahaan di semua departemen.",
          permissions: {
            user: ["read", "list"],
            session: ["list"],
            organization: ["read"],
            team: ["read"],
            contract: ["create", "read", "update", "delete", "approve", "archive"],
            partner: ["create", "read", "update", "delete"],
            report: ["view", "export"],
            audit: ["view"],
            settings: ["read"]
          }
        },
        manager: {
          name: "Manager",
          scope: "Group / Dept Level",
          description: "Persetujuan internal tingkat departemen sebelum dokumen diajukan ke Approver final.",
          permissions: {
            user: ["read"],
            session: [],
            organization: ["read"],
            team: ["read"],
            contract: ["create", "read", "update", "approve-internal"],
            partner: ["create", "read", "update"],
            report: ["view"],
            settings: []
          }
        },
        editor: {
          name: "Editor",
          scope: "Group / Dept Level",
          description: "Buat, unggah, dan revisi draf dokumen mitra dan kontrak di lingkup departemennya.",
          permissions: {
            user: ["read"],
            session: [],
            organization: ["read"],
            team: ["read"],
            contract: ["create", "read", "update"],
            partner: ["create", "read", "update"],
            report: ["view"],
            settings: []
          }
        },
        viewer: {
          name: "Viewer",
          scope: "Restricted / Read-Only",
          description: "Hanya membaca dan melihat dokumen yang sudah berstatus final/aktif pada departemennya.",
          permissions: {
            user: ["read"],
            session: [],
            organization: ["read"],
            team: ["read"],
            contract: ["read"],
            partner: ["read"],
            report: ["view"],
            settings: []
          }
        },
        // Legacy roles for backwards compatibility
        legal: {
          name: "Legal Counsel (Legacy)",
          scope: "Group Level",
          description: "Penyusunan & peninjauan kontrak, addendum, due diligence vendor, dan kepatuhan hukum.",
          permissions: {
            user: ["read"],
            session: [],
            organization: ["read"],
            team: ["read"],
            contract: ["create", "read", "update"],
            partner: ["create", "read", "update"],
            report: ["view"],
            settings: []
          }
        },
        finance: {
          name: "Finance & Accounting (Legacy)",
          scope: "Group Level",
          description: "Pengelolaan nilai transaksi, insertion order (IO), invoice, pengeluaran, dan ekspor laporan.",
          permissions: {
            user: ["read"],
            session: [],
            organization: ["read"],
            team: ["read"],
            contract: ["read"],
            partner: ["read"],
            report: ["view", "export"],
            settings: []
          }
        },
        staff: {
          name: "General Staff (Legacy)",
          scope: "Read-Only",
          description: "Akses lihat dokumen aktif dan direktori mitra.",
          permissions: {
            user: ["read"],
            session: [],
            organization: ["read"],
            team: ["read"],
            contract: ["read"],
            partner: ["read"],
            report: ["view"],
            settings: []
          }
        }
      }
    };
    return res.json({ success: true, matrix });
  } catch (err) {
    console.error("Error fetching RBAC matrix:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch RBAC matrix" });
  }
});
authConsoleRouter.get("/sqlite/status", (req, res) => {
  try {
    const dbPath2 = import_path2.default.join(process.cwd(), "auth.db");
    let fileSizeBytes = 0;
    let modifiedAt = null;
    if (import_fs2.default.existsSync(dbPath2)) {
      const stat = import_fs2.default.statSync(dbPath2);
      fileSizeBytes = stat.size;
      modifiedAt = stat.mtime.toISOString();
    }
    const journalModeRow = sqliteDb.prepare("PRAGMA journal_mode").get();
    const versionRow = sqliteDb.prepare("SELECT sqlite_version() as version").get();
    const pageCountRow = sqliteDb.prepare("PRAGMA page_count").get();
    const pageSizeRow = sqliteDb.prepare("PRAGMA page_size").get();
    const tables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tableSummaries = {};
    let totalRecords = 0;
    for (const t of tables) {
      try {
        const countRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
        const count = countRow?.count || 0;
        tableSummaries[t.name] = count;
        totalRecords += count;
      } catch (e) {
        tableSummaries[t.name] = 0;
      }
    }
    return res.json({
      success: true,
      status: "active",
      journalMode: journalModeRow?.journal_mode || "wal",
      version: versionRow?.version || "3.x",
      fileSizeBytes,
      pageCount: pageCountRow?.page_count || 0,
      pageSize: pageSizeRow?.page_size || 4096,
      modifiedAt,
      tablesCount: tables.length,
      totalRecords,
      tableSummaries
    });
  } catch (err) {
    console.error("Error fetching SQLite status:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch SQLite status" });
  }
});
authConsoleRouter.get("/sqlite/tables", (req, res) => {
  try {
    const tables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const result = tables.map((t) => {
      let count = 0;
      let columnsCount = 0;
      try {
        const countRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
        count = countRow?.count || 0;
        const cols = sqliteDb.prepare(`PRAGMA table_info("${t.name}")`).all();
        columnsCount = cols.length;
      } catch (e) {
      }
      return {
        name: t.name,
        count,
        columnsCount
      };
    });
    return res.json({ success: true, tables: result });
  } catch (err) {
    console.error("Error fetching SQLite tables:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch SQLite tables" });
  }
});
authConsoleRouter.get("/sqlite/table-data", (req, res) => {
  try {
    const tableName = String(req.query.table || "").trim();
    if (!tableName || !/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const tableExists = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
    if (!tableExists) {
      return res.status(404).json({ error: "Table not found" });
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
    const search = String(req.query.search || "").trim();
    const columns = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all();
    let rows = [];
    let total = 0;
    if (search && columns.length > 0) {
      const searchConditions = columns.map((c) => `CAST("${c.name}" AS TEXT) LIKE ?`).join(" OR ");
      const searchParam = `%${search}%`;
      const searchParams = columns.map(() => searchParam);
      const totalRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}" WHERE ${searchConditions}`).get(...searchParams);
      total = totalRow?.count || 0;
      rows = sqliteDb.prepare(`SELECT * FROM "${tableName}" WHERE ${searchConditions} LIMIT ? OFFSET ?`).all(...searchParams, limit, offset);
    } else {
      const totalRow = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get();
      total = totalRow?.count || 0;
      rows = sqliteDb.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(limit, offset);
    }
    return res.json({
      success: true,
      table: tableName,
      columns,
      rows,
      total,
      limit,
      offset
    });
  } catch (err) {
    console.error("Error fetching SQLite table data:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch SQLite table data" });
  }
});
authConsoleRouter.post("/sqlite/optimize", (req, res) => {
  try {
    sqliteDb.prepare("PRAGMA optimize").run();
    return res.json({ success: true, message: "Database optimized successfully" });
  } catch (err) {
    console.error("Error optimizing SQLite:", err);
    return res.status(500).json({ error: err.message || "Failed to optimize SQLite database" });
  }
});

// server.ts
var import_better_sqlite32 = __toESM(require("better-sqlite3"), 1);

// src/data/initialData.ts
var INITIAL_ALLOWED_USERS = [
  {
    id: "usr-1",
    organizationId: "org-adapundi",
    email: "adhitcl@gmail.com",
    name: "Aditya Pratama",
    role: "Superuser",
    department: "Legal & Compliance",
    status: "Active",
    addedBy: "System Core",
    createdAt: "2026-01-01T08:00:00.000Z",
    lastLoginAt: "2026-09-15T21:00:00.000Z"
  }
];
var INITIAL_PARTNERS = [
  {
    partner_id: "PRT-001",
    organizationId: "org-adapundi",
    nama_partner: "PT Media Nusantara Digital",
    jenis_partner: "Media Partner",
    pic_partner: "Andi Wijaya (andi@mnd.co.id / 081234567890)",
    nama_pic: "Andi Wijaya",
    email_pic: "andi@mnd.co.id",
    telepon_pic: "081234567890",
    pic_internal: "Commercial & Marketing",
    badan_hukum: "BHI",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-mnd",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00123.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Ada", nomorDokumen: "9120001234567" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "01.234.567.8-012.000" },
      { nama: "KTP Direksi & PIC", wajib: true, status: "Ada", nomorDokumen: "3171012345678901" }
    ],
    catatan: "Partner media prioritas untuk campaign digital Q1-Q4.",
    tags: ["Media", "Digital", "Priority"],
    created_at: "2026-01-05T08:00:00.000Z",
    updated_at: "2026-09-15T10:00:00.000Z"
  },
  {
    partner_id: "PRT-002",
    organizationId: "org-adapundi",
    nama_partner: "PT Cloud Teknologi Indonesia",
    jenis_partner: "Vendor",
    pic_partner: "Rina Marlina (rina@cloudtek.co.id / 081987654321)",
    nama_pic: "Rina Marlina",
    email_pic: "rina@cloudtek.co.id",
    telepon_pic: "081987654321",
    pic_internal: "Procurement & Operations",
    badan_hukum: "BHI",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-cloudtek",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00456.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Ada", nomorDokumen: "9120007654321" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "02.345.678.9-023.000" },
      { nama: "Sertifikasi ISO 27001", wajib: false, status: "Ada", nomorDokumen: "ISO-27001-2026" }
    ],
    catatan: "Penyedia infrastruktur server & cloud storage utama.",
    tags: ["Infrastructure", "Cloud", "Core"],
    created_at: "2026-01-10T09:00:00.000Z",
    updated_at: "2026-09-14T11:30:00.000Z"
  },
  {
    partner_id: "PRT-003",
    organizationId: "org-adapundi",
    nama_partner: "PT Global Logistics Utama",
    jenis_partner: "Supplier",
    pic_partner: "Bambang Suryo (bambang@globallogistics.co.id / 081311223344)",
    nama_pic: "Bambang Suryo",
    email_pic: "bambang@globallogistics.co.id",
    telepon_pic: "081311223344",
    pic_internal: "Procurement & Operations",
    badan_hukum: "BHI",
    status_dd: "Belum Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-glu",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00789.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Ada", nomorDokumen: "9120008899001" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Belum" }
    ],
    catatan: "Menunggu pembaruan dokumen NPWP terbaru dari partner.",
    tags: ["Logistics", "Courier"],
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-09-10T15:20:00.000Z"
  },
  {
    partner_id: "PRT-004",
    organizationId: "org-adapundi",
    nama_partner: "PT Solusi Cyber Global",
    jenis_partner: "Vendor",
    pic_partner: "Denny Sumargo (denny@cybersec.co.id / 081566778899)",
    nama_pic: "Denny Sumargo",
    email_pic: "denny@cybersec.co.id",
    telepon_pic: "081566778899",
    pic_internal: "Legal & Compliance",
    badan_hukum: "BHI",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-cybersec",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00999.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Ada", nomorDokumen: "9120009988776" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "04.567.890.1-045.000" }
    ],
    catatan: "Vendor audit penetrasi sistem & konsultasi keamanan IT.",
    tags: ["Security", "Audit"],
    created_at: "2026-02-01T11:00:00.000Z",
    updated_at: "2026-09-12T16:00:00.000Z"
  },
  {
    partner_id: "PRT-005",
    organizationId: "org-adapundi",
    nama_partner: "PT Creative Agency Asia",
    jenis_partner: "Klien",
    pic_partner: "Erika Carlina (erika@creativeasia.com / 081722334455)",
    nama_pic: "Erika Carlina",
    email_pic: "erika@creativeasia.com",
    telepon_pic: "081722334455",
    pic_internal: "Commercial & Marketing",
    badan_hukum: "BHI",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-creative",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00111.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Ada", nomorDokumen: "9120001122334" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "05.678.901.2-056.000" }
    ],
    catatan: "Agensi produksi konten video & materi promosi.",
    tags: ["Creative", "Agency"],
    created_at: "2026-02-10T14:00:00.000Z",
    updated_at: "2026-09-15T09:30:00.000Z"
  },
  {
    partner_id: "PRT-006",
    organizationId: "org-adapundi",
    nama_partner: "Global Ad Networks Inc.",
    jenis_partner: "Media Partner",
    pic_partner: "John Smith (jsmith@globalad.com / +1-415-555-0199)",
    nama_pic: "John Smith",
    email_pic: "jsmith@globalad.com",
    telepon_pic: "+1-415-555-0199",
    pic_internal: "Commercial & Marketing",
    badan_hukum: "BHA",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-globalad",
    daftar_dokumen_dd: [
      { nama: "Certificate of Incorporation", wajib: true, status: "Ada", nomorDokumen: "US-DEL-987654" },
      { nama: "Tax Form W-8BEN-E", wajib: true, status: "Ada", nomorDokumen: "W8BEN-2026-GAN" }
    ],
    catatan: "Mitra jaringan iklan internasional terintegrasi programmatic.",
    tags: ["Global", "AdNetwork"],
    created_at: "2026-02-20T09:00:00.000Z",
    updated_at: "2026-09-11T13:45:00.000Z"
  },
  {
    partner_id: "PRT-007",
    organizationId: "org-adapundi",
    nama_partner: "PT Telekomunikasi Digital Mandiri",
    jenis_partner: "Vendor",
    pic_partner: "Fitri Handayani (fitri@telkodigital.co.id / 081899001122)",
    nama_pic: "Fitri Handayani",
    email_pic: "fitri@telkodigital.co.id",
    telepon_pic: "081899001122",
    pic_internal: "Procurement & Operations",
    badan_hukum: "BHI",
    status_dd: "Belum Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-telko",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00222.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Belum" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "07.890.123.4-078.000" }
    ],
    catatan: "Penyedia jaringan serat optik dedicated kantor & DC.",
    tags: ["Telco", "Network"],
    created_at: "2026-03-01T10:30:00.000Z",
    updated_at: "2026-09-08T10:00:00.000Z"
  },
  {
    partner_id: "PRT-008",
    organizationId: "org-adapundi",
    nama_partner: "PT Prisma Konsultan Legal",
    jenis_partner: "Vendor",
    pic_partner: "Haryo Poerwanto (haryo@prismalegal.co.id / 081244556677)",
    nama_pic: "Haryo Poerwanto",
    email_pic: "haryo@prismalegal.co.id",
    telepon_pic: "081244556677",
    pic_internal: "Legal & Compliance",
    badan_hukum: "BHI",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-prisma",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00333.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Ada", nomorDokumen: "9120003344556" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "08.901.234.5-089.000" },
      { nama: "Izin Advokat / PERADI", wajib: false, status: "Ada", nomorDokumen: "PERADI-2025-08" }
    ],
    catatan: "Konsultan hukum eksternal retainer corporate legal & compliance.",
    tags: ["Legal", "Consultant"],
    created_at: "2026-03-15T11:00:00.000Z",
    updated_at: "2026-09-14T17:10:00.000Z"
  },
  {
    partner_id: "PRT-009",
    organizationId: "org-adapundi",
    nama_partner: "Southeast Asia Reseller Ltd",
    jenis_partner: "Reseller",
    pic_partner: "Michael Tan (mtan@seareseller.sg / +65-6789-0123)",
    nama_pic: "Michael Tan",
    email_pic: "mtan@seareseller.sg",
    telepon_pic: "+65-6789-0123",
    pic_internal: "Commercial & Marketing",
    badan_hukum: "BHA",
    status_dd: "Lengkap",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-sea",
    daftar_dokumen_dd: [
      { nama: "Certificate of Incorporation", wajib: true, status: "Ada", nomorDokumen: "SG-2020-12345K" },
      { nama: "Tax Certificate", wajib: true, status: "Ada", nomorDokumen: "SG-TAX-2026" }
    ],
    catatan: "Reseller resmi produk aplikasi kawasan Asia Tenggara.",
    tags: ["Reseller", "Regional"],
    created_at: "2026-04-01T13:00:00.000Z",
    updated_at: "2026-09-13T12:00:00.000Z"
  },
  {
    partner_id: "PRT-010",
    organizationId: "org-adapundi",
    nama_partner: "PT Infrastruktur Data Prima",
    jenis_partner: "Supplier",
    pic_partner: "Irwan Mussry (irwan@dataprima.co.id / 081155667788)",
    nama_pic: "Irwan Mussry",
    email_pic: "irwan@dataprima.co.id",
    telepon_pic: "081155667788",
    pic_internal: "Procurement & Operations",
    badan_hukum: "BHI",
    status_dd: "Kadaluarsa",
    link_folder_dd: "https://drive.google.com/drive/folders/dummy-dataprima",
    daftar_dokumen_dd: [
      { nama: "Akta Pendirian & Perubahan", wajib: true, status: "Ada", nomorDokumen: "AHU-00444.AH.01.01" },
      { nama: "NIB & Izin Usaha", wajib: true, status: "Kadaluarsa", tanggalKadaluarsa: "2026-08-01" },
      { nama: "NPWP Perusahaan", wajib: true, status: "Ada", nomorDokumen: "10.123.456.7-101.000" }
    ],
    catatan: "Sertifikat NIB telah kadaluarsa, perlu pengunggahan dokumen pembaruan.",
    tags: ["Infrastructure", "ExpiredDD"],
    created_at: "2026-04-20T09:30:00.000Z",
    updated_at: "2026-09-01T14:15:00.000Z"
  }
];
var INITIAL_CONTRACTS = [
  {
    contract_id: "CTR-001",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "001/LEG/MND/2026",
    judul_kontrak: "Perjanjian Kerjasama Media Placement Digital 2026",
    partner_id: "PRT-001",
    partner_nama: "PT Media Nusantara Digital",
    kategori_kerjasama: ["Advertising", "Media Placement"],
    tanggal_mulai: "2026-01-01",
    tanggal_berakhir: "2026-12-31",
    currency: "IDR",
    nilai_kontrak: 45e7,
    auto_renewal: true,
    notice_period_hari: 60,
    notice_type_required: "Termination",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Commercial & Marketing",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-001/view",
    fileName: "Kontrak_001_LEG_MND_2026.pdf",
    internal_notes: "Kerjasama mencakup banner placement & artikel sponsor.",
    created_at: "2026-01-05T09:00:00.000Z",
    updated_at: "2026-09-15T10:00:00.000Z"
  },
  {
    contract_id: "CTR-002",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "002/LEG/CTI/2026",
    judul_kontrak: "Master Service Agreement Cloud Infrastructure & Storage",
    partner_id: "PRT-002",
    partner_nama: "PT Cloud Teknologi Indonesia",
    kategori_kerjasama: ["Infrastructure", "SaaS & Cloud"],
    tanggal_mulai: "2026-01-15",
    tanggal_berakhir: "2027-01-14",
    currency: "IDR",
    nilai_kontrak: 12e8,
    auto_renewal: true,
    notice_period_hari: 60,
    notice_type_required: "Both",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Procurement & Operations",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-002/view",
    fileName: "Kontrak_002_LEG_CTI_2026.pdf",
    internal_notes: "Termasuk SLA ketersediaan 99.99% dan garansi recovery 2 jam.",
    created_at: "2026-01-10T10:00:00.000Z",
    updated_at: "2026-09-14T11:30:00.000Z"
  },
  {
    contract_id: "CTR-003",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "003/LEG/GLU/2026",
    judul_kontrak: "Perjanjian Jasa Pengiriman & Logistik Nasional",
    partner_id: "PRT-003",
    partner_nama: "PT Global Logistics Utama",
    kategori_kerjasama: ["Logistik", "Supplier"],
    tanggal_mulai: "2025-10-15",
    tanggal_berakhir: "2026-10-14",
    currency: "IDR",
    nilai_kontrak: 32e7,
    auto_renewal: false,
    notice_period_hari: 30,
    notice_type_required: "Termination",
    status: "Akan Berakhir",
    status_approval: "Signed",
    pic_internal: "Procurement & Operations",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-003/view",
    fileName: "Kontrak_003_LEG_GLU_2026.pdf",
    internal_notes: "Mendekati periode berakhir (H-30), perlu opsi adendum / negosiasi ulang.",
    created_at: "2025-10-15T11:00:00.000Z",
    updated_at: "2026-09-15T08:00:00.000Z"
  },
  {
    contract_id: "CTR-004",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "004/LEG/SCG/2026",
    judul_kontrak: "Perjanjian Pemeliharaan Keamanan Siber & Penetration Test",
    partner_id: "PRT-004",
    partner_nama: "PT Solusi Cyber Global",
    kategori_kerjasama: ["Keamanan IT", "Consulting"],
    tanggal_mulai: "2026-02-01",
    tanggal_berakhir: "2027-01-31",
    currency: "IDR",
    nilai_kontrak: 18e7,
    auto_renewal: false,
    notice_period_hari: 30,
    notice_type_required: "Extension",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Legal & Compliance",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-004/view",
    fileName: "Kontrak_004_LEG_SCG_2026.pdf",
    internal_notes: "Jadwal pen-test dilakukan 2x setahun (Q2 & Q4).",
    created_at: "2026-02-01T12:00:00.000Z",
    updated_at: "2026-09-12T16:00:00.000Z"
  },
  {
    contract_id: "CTR-005",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "005/LEG/CAA/2026",
    judul_kontrak: "Kontrak Branding & Production Campaign Q1-Q4",
    partner_id: "PRT-005",
    partner_nama: "PT Creative Agency Asia",
    kategori_kerjasama: ["Creative Production", "Marketing"],
    tanggal_mulai: "2026-02-15",
    tanggal_berakhir: "2026-12-31",
    currency: "IDR",
    nilai_kontrak: 85e7,
    auto_renewal: false,
    notice_period_hari: 90,
    notice_type_required: "Both",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Commercial & Marketing",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-005/view",
    fileName: "Kontrak_005_LEG_CAA_2026.pdf",
    internal_notes: "Termasuk paket video commercial & visual design asset.",
    created_at: "2026-02-10T15:00:00.000Z",
    updated_at: "2026-09-15T09:30:00.000Z"
  },
  {
    contract_id: "CTR-006",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "006/LEG/GAN/2026",
    judul_kontrak: "International Programmatic Ad Serving Agreement",
    partner_id: "PRT-006",
    partner_nama: "Global Ad Networks Inc.",
    kategori_kerjasama: ["Advertising", "AdTech"],
    tanggal_mulai: "2026-03-01",
    tanggal_berakhir: "2027-02-28",
    currency: "USD",
    nilai_kontrak: 6e4,
    nilai_kontrak_usd: 6e4,
    auto_renewal: true,
    notice_period_hari: 60,
    notice_type_required: "Termination",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Commercial & Marketing",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-006/view",
    fileName: "Kontrak_006_LEG_GAN_2026.pdf",
    internal_notes: "Pembayaran dilakukan via transfer valas USD secara triwulanan.",
    created_at: "2026-02-20T10:00:00.000Z",
    updated_at: "2026-09-11T13:45:00.000Z"
  },
  {
    contract_id: "CTR-007",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "007/LEG/TDM/2026",
    judul_kontrak: "Sewa Bandwidth & Dedicated Fibre Optic Line",
    partner_id: "PRT-007",
    partner_nama: "PT Telekomunikasi Digital Mandiri",
    kategori_kerjasama: ["Telekomunikasi", "Infrastructure"],
    tanggal_mulai: "2025-11-01",
    tanggal_berakhir: "2026-10-31",
    currency: "IDR",
    nilai_kontrak: 24e7,
    auto_renewal: true,
    notice_period_hari: 60,
    notice_type_required: "Termination",
    status: "Akan Berakhir",
    status_approval: "Signed",
    pic_internal: "Procurement & Operations",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-007/view",
    fileName: "Kontrak_007_LEG_TDM_2026.pdf",
    internal_notes: "Akan dilakukan koordinasi peningkatan kapasitas jaringan ke 1Gbps.",
    created_at: "2025-11-01T11:00:00.000Z",
    updated_at: "2026-09-10T11:00:00.000Z"
  },
  {
    contract_id: "CTR-008",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "008/LEG/PKL/2026",
    judul_kontrak: "Perjanjian Retainer Konsultasi Hukum Corporate",
    partner_id: "PRT-008",
    partner_nama: "PT Prisma Konsultan Legal",
    kategori_kerjasama: ["Legal Advice", "Consulting"],
    tanggal_mulai: "2026-04-01",
    tanggal_berakhir: "2027-03-31",
    currency: "IDR",
    nilai_kontrak: 15e7,
    auto_renewal: false,
    notice_period_hari: 30,
    notice_type_required: "Extension",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Legal & Compliance",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-008/view",
    fileName: "Kontrak_008_LEG_PKL_2026.pdf",
    internal_notes: "Mencakup alokasi 20 jam konsultasi hukum per bulan.",
    created_at: "2026-03-15T12:00:00.000Z",
    updated_at: "2026-09-14T17:10:00.000Z"
  },
  {
    contract_id: "CTR-009",
    organizationId: "org-adapundi",
    jenis_dokumen: "Master Agreement",
    nomor_kontrak: "009/LEG/SAR/2026",
    judul_kontrak: "Regional Software Distribution & Reseller Agreement",
    partner_id: "PRT-009",
    partner_nama: "Southeast Asia Reseller Ltd",
    kategori_kerjasama: ["Distribution", "Software"],
    tanggal_mulai: "2026-04-15",
    tanggal_berakhir: "2027-04-14",
    currency: "USD",
    nilai_kontrak: 45e3,
    nilai_kontrak_usd: 45e3,
    auto_renewal: true,
    notice_period_hari: 60,
    notice_type_required: "Termination",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Commercial & Marketing",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-009/view",
    fileName: "Kontrak_009_LEG_SAR_2026.pdf",
    internal_notes: "Hak distribusi eksklusif untuk wilayah Singapura & Malaysia.",
    created_at: "2026-04-01T14:00:00.000Z",
    updated_at: "2026-09-13T12:00:00.000Z"
  },
  {
    contract_id: "CTR-010",
    organizationId: "org-adapundi",
    jenis_dokumen: "Agreement Addendum",
    parent_contract_id: "CTR-002",
    parent_contract_nomor: "002/LEG/CTI/2026",
    nomor_kontrak: "010/ADD/CTI/2026",
    judul_kontrak: "Addendum 01 - Penambahan Node Server Datacenter",
    partner_id: "PRT-002",
    partner_nama: "PT Cloud Teknologi Indonesia",
    kategori_kerjasama: ["Infrastructure", "Addendum"],
    tanggal_mulai: "2026-05-01",
    tanggal_berakhir: "2027-01-14",
    currency: "IDR",
    nilai_kontrak: 25e7,
    auto_renewal: false,
    notice_period_hari: 30,
    notice_type_required: "None",
    status: "Aktif",
    status_approval: "Signed",
    pic_internal: "Procurement & Operations",
    link_file_kontrak: "https://drive.google.com/file/d/dummy-ctr-010/view",
    fileName: "Addendum_010_ADD_CTI_2026.pdf",
    internal_notes: "Penambahan 4 unit node server GPU untuk pemrosesan AI.",
    created_at: "2026-04-25T10:00:00.000Z",
    updated_at: "2026-09-15T09:00:00.000Z"
  }
];
var INITIAL_IOS = [
  {
    io_id: "IO-2026-001",
    organizationId: "org-adapundi",
    contract_id: "CTR-001",
    contract_nomor: "001/LEG/MND/2026",
    nomor_io: "IO/2026/01/001",
    judul_io: "Campaign Banner Ads Main Homepage Q1",
    partner_id: "PRT-001",
    partner_nama: "PT Media Nusantara Digital",
    kanal_media: "News Portal Homepage",
    tanggal_mulai: "2026-01-15",
    tanggal_berakhir: "2026-03-31",
    pricing_model: "CPM",
    charging_type: "Postpaid",
    currency: "IDR",
    nilai_io: 75e6,
    deliverables: "1,500,000 Impressions Banner 970x90 & Native Ads",
    notice_period_hari: 14,
    notice_type_required: "Termination",
    status: "Aktif",
    internal_notes: "Laporan tayang diserahkan mingguan.",
    created_at: "2026-01-12T09:00:00.000Z",
    updated_at: "2026-09-15T10:00:00.000Z"
  },
  {
    io_id: "IO-2026-002",
    organizationId: "org-adapundi",
    contract_id: "CTR-002",
    contract_nomor: "002/LEG/CTI/2026",
    nomor_io: "IO/2026/01/002",
    judul_io: "Cloud Migration Phase 1 Deployment",
    partner_id: "PRT-002",
    partner_nama: "PT Cloud Teknologi Indonesia",
    kanal_media: "AWS/GCP Infrastructure",
    tanggal_mulai: "2026-01-20",
    tanggal_berakhir: "2026-04-20",
    pricing_model: "Fixed Package",
    charging_type: "Milestone-based",
    currency: "IDR",
    nilai_io: 3e8,
    deliverables: "Migrasi 12 Microservices & Setup Kubernetes Cluster",
    notice_period_hari: 15,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Termin 1 (30%), Termin 2 (40%), Termin 3 (30%).",
    created_at: "2026-01-18T10:00:00.000Z",
    updated_at: "2026-09-14T11:30:00.000Z"
  },
  {
    io_id: "IO-2026-003",
    organizationId: "org-adapundi",
    contract_id: "CTR-003",
    contract_nomor: "003/LEG/GLU/2026",
    nomor_io: "IO/2026/02/003",
    judul_io: "Logistik Kurir Ekspres Jabodetabek Q1",
    partner_id: "PRT-003",
    partner_nama: "PT Global Logistics Utama",
    kanal_media: "Fleet Cargo Delivery",
    tanggal_mulai: "2026-02-01",
    tanggal_berakhir: "2026-04-30",
    pricing_model: "Flat Fee",
    charging_type: "Postpaid",
    currency: "IDR",
    nilai_io: 5e7,
    deliverables: "Pengiriman dokumen fisik & perangkat kerja 500 resi",
    notice_period_hari: 7,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Rekapitulasi resi dikirim tanggal 25 tiap bulan.",
    created_at: "2026-01-28T11:00:00.000Z",
    updated_at: "2026-09-10T15:20:00.000Z"
  },
  {
    io_id: "IO-2026-004",
    organizationId: "org-adapundi",
    contract_id: "CTR-004",
    contract_nomor: "004/LEG/SCG/2026",
    nomor_io: "IO/2026/02/004",
    judul_io: "Security Audit App Mobile Q1",
    partner_id: "PRT-004",
    partner_nama: "PT Solusi Cyber Global",
    kanal_media: "Mobile App Pen-Test",
    tanggal_mulai: "2026-02-15",
    tanggal_berakhir: "2026-03-31",
    pricing_model: "Fixed Package",
    charging_type: "Milestone-based",
    currency: "IDR",
    nilai_io: 45e6,
    deliverables: "Laporan Pen-Test iOS & Android + Remediation Verification",
    notice_period_hari: 10,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Laporan draft diselesaikan 15 Maret 2026.",
    created_at: "2026-02-10T14:00:00.000Z",
    updated_at: "2026-09-12T16:00:00.000Z"
  },
  {
    io_id: "IO-2026-005",
    organizationId: "org-adapundi",
    contract_id: "CTR-005",
    contract_nomor: "005/LEG/CAA/2026",
    nomor_io: "IO/2026/03/005",
    judul_io: "Video Commercial Production & Talent Fee",
    partner_id: "PRT-005",
    partner_nama: "PT Creative Agency Asia",
    kanal_media: "Digital Video Commercial",
    tanggal_mulai: "2026-03-01",
    tanggal_berakhir: "2026-05-31",
    pricing_model: "Flat Fee",
    charging_type: "Milestone-based",
    currency: "IDR",
    nilai_io: 12e7,
    deliverables: "3 Video Commercial 30 Detik + 10 Visual Assets Instagram",
    notice_period_hari: 14,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Shooting dilakukan di Jakarta & Bali.",
    created_at: "2026-02-25T15:00:00.000Z",
    updated_at: "2026-09-15T09:30:00.000Z"
  },
  {
    io_id: "IO-2026-006",
    organizationId: "org-adapundi",
    contract_id: "CTR-006",
    contract_nomor: "006/LEG/GAN/2026",
    nomor_io: "IO/2026/03/006",
    judul_io: "Global Mobile Push Ad Impressions",
    partner_id: "PRT-006",
    partner_nama: "Global Ad Networks Inc.",
    kanal_media: "Mobile In-App Network",
    tanggal_mulai: "2026-03-15",
    tanggal_berakhir: "2026-06-15",
    pricing_model: "CPM",
    charging_type: "Prepaid",
    currency: "USD",
    nilai_io: 12e3,
    deliverables: "5,000,000 Global Push Impressions (US & SEA)",
    notice_period_hari: 14,
    notice_type_required: "Termination",
    status: "Aktif",
    internal_notes: "Deposit saldo prepaid awal $12,000 USD.",
    created_at: "2026-03-05T10:00:00.000Z",
    updated_at: "2026-09-11T13:45:00.000Z"
  },
  {
    io_id: "IO-2026-007",
    organizationId: "org-adapundi",
    contract_id: "CTR-007",
    contract_nomor: "007/LEG/TDM/2026",
    nomor_io: "IO/2026/04/007",
    judul_io: "Upgrading Bandwidth Core Datacenter",
    partner_id: "PRT-007",
    partner_nama: "PT Telekomunikasi Digital Mandiri",
    kanal_media: "Fibre Optic Link 500Mbps",
    tanggal_mulai: "2026-04-01",
    tanggal_berakhir: "2026-09-30",
    pricing_model: "Flat Fee",
    charging_type: "Postpaid",
    currency: "IDR",
    nilai_io: 6e7,
    deliverables: "Penyediaan link dedicated internet 500Mbps tanpa quota",
    notice_period_hari: 30,
    notice_type_required: "Termination",
    status: "Akan Berakhir",
    internal_notes: "Mendekati akhir masa IO September 2026.",
    created_at: "2026-03-25T11:00:00.000Z",
    updated_at: "2026-09-10T11:00:00.000Z"
  },
  {
    io_id: "IO-2026-008",
    organizationId: "org-adapundi",
    contract_id: "CTR-008",
    contract_nomor: "008/LEG/PKL/2026",
    nomor_io: "IO/2026/04/008",
    judul_io: "Legal Due Diligence Audit Vendor Baru",
    partner_id: "PRT-008",
    partner_nama: "PT Prisma Konsultan Legal",
    kanal_media: "Legal Audit Services",
    tanggal_mulai: "2026-04-10",
    tanggal_berakhir: "2026-06-10",
    pricing_model: "Fixed Package",
    charging_type: "Postpaid",
    currency: "IDR",
    nilai_io: 35e6,
    deliverables: "Pemeriksaan kepatuhan hukum 5 calon vendor utama",
    notice_period_hari: 7,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Dokumen pendapat hukum diserahkan akhir Mei.",
    created_at: "2026-04-05T12:00:00.000Z",
    updated_at: "2026-09-14T17:10:00.000Z"
  },
  {
    io_id: "IO-2026-009",
    organizationId: "org-adapundi",
    contract_id: "CTR-009",
    contract_nomor: "009/LEG/SAR/2026",
    nomor_io: "IO/2026/05/009",
    judul_io: "Reseller License Volume 500 Unit",
    partner_id: "PRT-009",
    partner_nama: "Southeast Asia Reseller Ltd",
    kanal_media: "SaaS Software License",
    tanggal_mulai: "2026-05-01",
    tanggal_berakhir: "2026-11-01",
    pricing_model: "Fixed Package",
    charging_type: "Prepaid",
    currency: "USD",
    nilai_io: 15e3,
    deliverables: "Alokasi 500 lisensi software versi Enterprise",
    notice_period_hari: 14,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Lisensi otomatis diaktifkan di portal admin.",
    created_at: "2026-04-20T14:00:00.000Z",
    updated_at: "2026-09-13T12:00:00.000Z"
  },
  {
    io_id: "IO-2026-010",
    organizationId: "org-adapundi",
    contract_id: "CTR-010",
    contract_nomor: "010/ADD/CTI/2026",
    nomor_io: "IO/2026/05/010",
    judul_io: "Emergency Disaster Recovery Server Setup",
    partner_id: "PRT-002",
    partner_nama: "PT Cloud Teknologi Indonesia",
    kanal_media: "DR Datacenter Rack",
    tanggal_mulai: "2026-05-15",
    tanggal_berakhir: "2026-08-15",
    pricing_model: "Fixed Package",
    charging_type: "Postpaid",
    currency: "IDR",
    nilai_io: 85e6,
    deliverables: "Setup Server Backup Cadangan di Datacenter Bali",
    notice_period_hari: 7,
    notice_type_required: "None",
    status: "Aktif",
    internal_notes: "Pengujian failover otomatis disimulasikan setiap 2 bulan.",
    created_at: "2026-05-10T10:00:00.000Z",
    updated_at: "2026-09-15T09:00:00.000Z"
  }
];
var INITIAL_NOTIFICATIONS = [
  {
    notif_id: "NOTIF-001",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-003",
    parent_nomor: "003/LEG/GLU/2026",
    parent_judul: "Perjanjian Jasa Pengiriman & Logistik Nasional",
    jenis_notifikasi: "Reminder H-30",
    tanggal_terkirim: "2026-09-14T08:00:00.000Z",
    status_terkirim: true,
    penerima: "legal.head@perusahaan.co.id",
    pesan: "Peringatan: Kontrak 003/LEG/GLU/2026 akan berakhir dalam 30 hari pada 14 Oktober 2026.",
    is_read: false
  },
  {
    notif_id: "NOTIF-002",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-007",
    parent_nomor: "007/LEG/TDM/2026",
    parent_judul: "Sewa Bandwidth & Dedicated Fibre Optic Line",
    jenis_notifikasi: "Reminder H-60",
    tanggal_terkirim: "2026-09-01T08:00:00.000Z",
    status_terkirim: true,
    penerima: "procurement@perusahaan.co.id",
    pesan: "Peringatan H-60: Masa pengajuan notice perpanjangan untuk Kontrak 007/LEG/TDM/2026 telah dibuka.",
    is_read: false
  },
  {
    notif_id: "NOTIF-003",
    organizationId: "org-adapundi",
    parent_type: "IO",
    parent_id: "IO-2026-007",
    parent_nomor: "IO/2026/04/007",
    parent_judul: "Upgrading Bandwidth Core Datacenter",
    jenis_notifikasi: "Reminder H-30",
    tanggal_terkirim: "2026-09-01T09:00:00.000Z",
    status_terkirim: true,
    penerima: "citra.dewi@perusahaan.co.id",
    pesan: "Insertion Order IO/2026/04/007 akan selesai pada 30 September 2026. Mohon cek rekapitulasi deliverable.",
    is_read: true
  },
  {
    notif_id: "NOTIF-004",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-001",
    parent_nomor: "001/LEG/MND/2026",
    parent_judul: "Perjanjian Kerjasama Media Placement Digital 2026",
    jenis_notifikasi: "Status Change",
    tanggal_terkirim: "2026-08-15T10:00:00.000Z",
    status_terkirim: true,
    penerima: "adhitcl@gmail.com",
    pesan: "Status Kontrak 001/LEG/MND/2026 telah diperbarui menjadi Signed & Aktif.",
    is_read: true
  },
  {
    notif_id: "NOTIF-005",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-010",
    parent_nomor: "010/ADD/CTI/2026",
    parent_judul: "Addendum 01 - Penambahan Node Server Datacenter",
    jenis_notifikasi: "Manual",
    tanggal_terkirim: "2026-09-10T11:30:00.000Z",
    status_terkirim: true,
    penerima: "budi.santoso@perusahaan.co.id",
    pesan: "Pengingat manual: Mohon selesaikan proses penandatanganan addendum 010/ADD/CTI/2026.",
    is_read: false
  },
  {
    notif_id: "NOTIF-006",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-005",
    parent_nomor: "005/LEG/CAA/2026",
    parent_judul: "Kontrak Branding & Production Campaign Q1-Q4",
    jenis_notifikasi: "Reminder H-90",
    tanggal_terkirim: "2026-09-02T14:00:00.000Z",
    status_terkirim: true,
    penerima: "eka.putri@perusahaan.co.id",
    pesan: "Peringatan H-90: Kontrak 005/LEG/CAA/2026 akan berakhir pada 31 Desember 2026.",
    is_read: true
  },
  {
    notif_id: "NOTIF-007",
    organizationId: "org-adapundi",
    parent_type: "IO",
    parent_id: "IO-2026-002",
    parent_nomor: "IO/2026/01/002",
    parent_judul: "Cloud Migration Phase 1 Deployment",
    jenis_notifikasi: "Status Change",
    tanggal_terkirim: "2026-08-20T16:00:00.000Z",
    status_terkirim: true,
    penerima: "dwi.hadi@perusahaan.co.id",
    pesan: "Milestone 2 Cloud Migration telah diverifikasi dan disetujui pembayaran.",
    is_read: true
  },
  {
    notif_id: "NOTIF-008",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-008",
    parent_nomor: "008/LEG/PKL/2026",
    parent_judul: "Perjanjian Retainer Konsultasi Hukum Corporate",
    jenis_notifikasi: "Manual",
    tanggal_terkirim: "2026-09-12T13:00:00.000Z",
    status_terkirim: true,
    penerima: "fajar.nugroho@perusahaan.co.id",
    pesan: "Laporan evaluasi retainer bulan Agustus telah diterbitkan.",
    is_read: false
  },
  {
    notif_id: "NOTIF-009",
    organizationId: "org-adapundi",
    parent_type: "IO",
    parent_id: "IO-2026-006",
    parent_nomor: "IO/2026/03/006",
    parent_judul: "Global Mobile Push Ad Impressions",
    jenis_notifikasi: "Reminder H-30",
    tanggal_terkirim: "2026-09-05T09:15:00.000Z",
    status_terkirim: true,
    penerima: "finance.team@perusahaan.co.id",
    pesan: "Saldo prepaid IO/2026/03/006 tersisa 15%. Harap jadwalkan pengisian top-up.",
    is_read: true
  },
  {
    notif_id: "NOTIF-010",
    organizationId: "org-adapundi",
    parent_type: "Contract",
    parent_id: "CTR-002",
    parent_nomor: "002/LEG/CTI/2026",
    parent_judul: "Master Service Agreement Cloud Infrastructure & Storage",
    jenis_notifikasi: "Status Change",
    tanggal_terkirim: "2026-09-15T07:30:00.000Z",
    status_terkirim: true,
    penerima: "adhitcl@gmail.com",
    pesan: "Penambahan addendum 010/ADD/CTI/2026 berhasil ditautkan ke Kontrak 002/LEG/CTI/2026.",
    is_read: false
  }
];
var INITIAL_ACTIVITY_LOGS = [
  {
    id: "LOG-001",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T21:10:00.000Z",
    userEmail: "adhitcl@gmail.com",
    userName: "Aditya Pratama",
    role: "Superuser",
    actionType: "LOGIN",
    module: "AUTH",
    description: "User adhitcl@gmail.com berhasil masuk ke portal manajemen legal.",
    ipAddress: "180.252.12.44"
  },
  {
    id: "LOG-002",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T20:45:00.000Z",
    userEmail: "budi.santoso@perusahaan.co.id",
    userName: "Budi Santoso",
    role: "Admin",
    actionType: "CREATE",
    module: "PARTNER",
    description: "Menambahkan partner baru: PT Media Nusantara Digital (PRT-001).",
    ipAddress: "180.252.12.45"
  },
  {
    id: "LOG-003",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T20:15:00.000Z",
    userEmail: "citra.dewi@perusahaan.co.id",
    userName: "Citra Dewi",
    role: "Legal",
    actionType: "CREATE",
    module: "CONTRACT",
    description: "Menerbitkan draft kontrak baru 001/LEG/MND/2026 untuk PT Media Nusantara Digital.",
    ipAddress: "180.252.12.46"
  },
  {
    id: "LOG-004",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T19:30:00.000Z",
    userEmail: "fajar.nugroho@perusahaan.co.id",
    userName: "Fajar Nugroho",
    role: "Editor",
    actionType: "DD_UPDATE",
    module: "PARTNER",
    description: "Memperbarui berkas Due Diligence NIB & NPWP untuk PT Cloud Teknologi Indonesia.",
    ipAddress: "180.252.12.47"
  },
  {
    id: "LOG-005",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T18:50:00.000Z",
    userEmail: "eka.putri@perusahaan.co.id",
    userName: "Eka Putri",
    role: "Manager",
    actionType: "CREATE",
    module: "IO",
    description: "Menerbitkan Insertion Order baru: IO/2026/01/001 (Banner Placement Q1).",
    ipAddress: "180.252.12.48"
  },
  {
    id: "LOG-006",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T18:00:00.000Z",
    userEmail: "citra.dewi@perusahaan.co.id",
    userName: "Citra Dewi",
    role: "Legal",
    actionType: "UPLOAD_SUCCESS",
    module: "CONTRACT",
    description: "Mengunggah berkas salinan Kontrak 002/LEG/CTI/2026 ke Google Drive terintegrasi.",
    ipAddress: "180.252.12.46"
  },
  {
    id: "LOG-007",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T17:15:00.000Z",
    userEmail: "dwi.hadi@perusahaan.co.id",
    userName: "Dwi Hadi",
    role: "Finance",
    actionType: "UPDATE",
    module: "CONTRACT",
    description: "Memperbarui status Kontrak CTR-003 dari Draft menjadi Akan Berakhir.",
    ipAddress: "180.252.12.49"
  },
  {
    id: "LOG-008",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T16:00:00.000Z",
    userEmail: "adhitcl@gmail.com",
    userName: "Aditya Pratama",
    role: "Superuser",
    actionType: "ADD_USER",
    module: "ADMIN",
    description: "Menambahkan pengguna baru: citra.dewi@perusahaan.co.id ke divisi Legal & Compliance.",
    ipAddress: "180.252.12.44"
  },
  {
    id: "LOG-009",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T15:30:00.000Z",
    userEmail: "system@perusahaan.co.id",
    userName: "System Bot",
    role: "Admin",
    actionType: "NOTIF_SENT",
    module: "SYSTEM",
    description: "Pengiriman otomatis notifikasi reminder H-30 untuk Kontrak CTR-003.",
    ipAddress: "127.0.0.1"
  },
  {
    id: "LOG-010",
    organizationId: "org-adapundi",
    timestamp: "2026-09-15T14:20:00.000Z",
    userEmail: "adhitcl@gmail.com",
    userName: "Aditya Pratama",
    role: "Superuser",
    actionType: "UPDATE",
    module: "SYSTEM",
    description: "Melakukan pembaruan foto logo organisasi & konfigurasi divisi Default Org.",
    ipAddress: "180.252.12.44"
  }
];
var INITIAL_EVALUATIONS = [
  {
    id: "EVAL-001",
    organizationId: "org-adapundi",
    review_date: "2026-08-15",
    year: 2026,
    partner_id: "PRT-001",
    supplier_name: "PT Media Nusantara Digital",
    type_of_work: "Media Placement Digital",
    sla_score: 95,
    obligation_target: "Sangat baik",
    incident_frequency: "Never",
    communication: "Sangat baik",
    pricing: "Moderate",
    final_evaluation: "Recommended",
    notes: "Kinerja penayangan iklan sangat memuaskan, perpanjangan kontrak disarankan.",
    calculated_score: 95,
    evaluator_email: "eka.putri@perusahaan.co.id",
    evaluator_name: "Eka Putri",
    created_at: "2026-08-15T10:00:00.000Z",
    updated_at: "2026-08-15T10:00:00.000Z"
  },
  {
    id: "EVAL-002",
    organizationId: "org-adapundi",
    review_date: "2026-08-18",
    year: 2026,
    partner_id: "PRT-002",
    supplier_name: "PT Cloud Teknologi Indonesia",
    type_of_work: "Cloud Infrastructure & Storage",
    sla_score: 98,
    obligation_target: "Sangat baik",
    incident_frequency: "Never",
    communication: "Sangat baik",
    pricing: "Moderate",
    final_evaluation: "Recommended",
    notes: "Infrastruktur cloud sangat stabil dengan jaminan uptime 99.99%.",
    calculated_score: 98,
    evaluator_email: "dwi.hadi@perusahaan.co.id",
    evaluator_name: "Dwi Hadi",
    created_at: "2026-08-18T11:00:00.000Z",
    updated_at: "2026-08-18T11:00:00.000Z"
  },
  {
    id: "EVAL-003",
    organizationId: "org-adapundi",
    review_date: "2026-08-20",
    year: 2026,
    partner_id: "PRT-003",
    supplier_name: "PT Global Logistics Utama",
    type_of_work: "Jasa Pengiriman Logistik",
    sla_score: 78,
    obligation_target: "Kurang baik",
    incident_frequency: "Frequent",
    communication: "Baik",
    pricing: "Cheap",
    final_evaluation: "Recommended with notes",
    notes: "Harga sangat kompetitif namun kerap terjadi keterlambatan pengiriman pada akhir bulan.",
    calculated_score: 78,
    evaluator_email: "gita.gutawa@perusahaan.co.id",
    evaluator_name: "Gita Gutawa",
    created_at: "2026-08-20T14:00:00.000Z",
    updated_at: "2026-08-20T14:00:00.000Z"
  },
  {
    id: "EVAL-004",
    organizationId: "org-adapundi",
    review_date: "2026-08-22",
    year: 2026,
    partner_id: "PRT-004",
    supplier_name: "PT Solusi Cyber Global",
    type_of_work: "Cyber Security Audit",
    sla_score: 92,
    obligation_target: "Baik",
    incident_frequency: "Never",
    communication: "Sangat baik",
    pricing: "Moderate",
    final_evaluation: "Recommended",
    notes: "Tim spesialis pen-test sangat responsif dan rekomendasi perbaikan sangat jelas.",
    calculated_score: 92,
    evaluator_email: "citra.dewi@perusahaan.co.id",
    evaluator_name: "Citra Dewi",
    created_at: "2026-08-22T09:30:00.000Z",
    updated_at: "2026-08-22T09:30:00.000Z"
  },
  {
    id: "EVAL-005",
    organizationId: "org-adapundi",
    review_date: "2026-08-25",
    year: 2026,
    partner_id: "PRT-005",
    supplier_name: "PT Creative Agency Asia",
    type_of_work: "Branding & Video Production",
    sla_score: 88,
    obligation_target: "Baik",
    incident_frequency: "Rare",
    communication: "Baik",
    pricing: "Moderate",
    final_evaluation: "Recommended",
    notes: "Kualitas hasil video komersial tinggi dan penyelesaian revisi tepat waktu.",
    calculated_score: 88,
    evaluator_email: "hendra.setiawan@perusahaan.co.id",
    evaluator_name: "Hendra Setiawan",
    created_at: "2026-08-25T13:00:00.000Z",
    updated_at: "2026-08-25T13:00:00.000Z"
  },
  {
    id: "EVAL-006",
    organizationId: "org-adapundi",
    review_date: "2026-08-28",
    year: 2026,
    partner_id: "PRT-006",
    supplier_name: "Global Ad Networks Inc.",
    type_of_work: "Programmatic Ad Serving",
    sla_score: 90,
    obligation_target: "Baik",
    incident_frequency: "Never",
    communication: "Good",
    pricing: "Moderate",
    final_evaluation: "Recommended",
    notes: "Jaringan iklan global bereputasi baik dengan pengisian impresi konsisten.",
    calculated_score: 90,
    evaluator_email: "eka.putri@perusahaan.co.id",
    evaluator_name: "Eka Putri",
    created_at: "2026-08-28T15:20:00.000Z",
    updated_at: "2026-08-28T15:20:00.000Z"
  },
  {
    id: "EVAL-007",
    organizationId: "org-adapundi",
    review_date: "2026-09-01",
    year: 2026,
    partner_id: "PRT-007",
    supplier_name: "PT Telekomunikasi Digital Mandiri",
    type_of_work: "Dedicated Fibre Optic Line",
    sla_score: 82,
    obligation_target: "Baik",
    incident_frequency: "Rare",
    communication: "Kurang baik",
    pricing: "Expensive",
    final_evaluation: "Recommended with notes",
    notes: "Koneksi jaringan stabil namun respon penanganan tiket troubleshooting relatif lambat.",
    calculated_score: 82,
    evaluator_email: "dwi.hadi@perusahaan.co.id",
    evaluator_name: "Dwi Hadi",
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z"
  },
  {
    id: "EVAL-008",
    organizationId: "org-adapundi",
    review_date: "2026-09-05",
    year: 2026,
    partner_id: "PRT-008",
    supplier_name: "PT Prisma Konsultan Legal",
    type_of_work: "Retainer Konsultasi Hukum",
    sla_score: 96,
    obligation_target: "Sangat baik",
    incident_frequency: "Never",
    communication: "Sangat baik",
    pricing: "Moderate",
    final_evaluation: "Recommended",
    notes: "Analisis pendapat hukum sangat komprehensif dan responsif.",
    calculated_score: 96,
    evaluator_email: "citra.dewi@perusahaan.co.id",
    evaluator_name: "Citra Dewi",
    created_at: "2026-09-05T11:45:00.000Z",
    updated_at: "2026-09-05T11:45:00.000Z"
  },
  {
    id: "EVAL-009",
    organizationId: "org-adapundi",
    review_date: "2026-09-08",
    year: 2026,
    partner_id: "PRT-009",
    supplier_name: "Southeast Asia Reseller Ltd",
    type_of_work: "Software Distribution",
    sla_score: 87,
    obligation_target: "Baik",
    incident_frequency: "Never",
    communication: "Good",
    pricing: "Cheap",
    final_evaluation: "Recommended",
    notes: "Sangat akomodatif dalam pengaturan kuota lisensi SaaS.",
    calculated_score: 87,
    evaluator_email: "budi.santoso@perusahaan.co.id",
    evaluator_name: "Budi Santoso",
    created_at: "2026-09-08T14:10:00.000Z",
    updated_at: "2026-09-08T14:10:00.000Z"
  },
  {
    id: "EVAL-010",
    organizationId: "org-adapundi",
    review_date: "2026-09-10",
    year: 2026,
    partner_id: "PRT-010",
    supplier_name: "PT Infrastruktur Data Prima",
    type_of_work: "Hardware Datacenter Supply",
    sla_score: 65,
    obligation_target: "Not met",
    incident_frequency: "Frequent",
    communication: "Poor/Needs Improvement",
    pricing: "Expensive",
    final_evaluation: "Not recommended",
    notes: "Keterlambatan supply suku cadang dan gagal memenuhi ketentuan SLA.",
    calculated_score: 65,
    evaluator_email: "fajar.nugroho@perusahaan.co.id",
    evaluator_name: "Fajar Nugroho",
    created_at: "2026-09-10T16:00:00.000Z",
    updated_at: "2026-09-10T16:00:00.000Z"
  }
];
var INITIAL_SPENDINGS = [
  {
    id: "SPD-001",
    organizationId: "org-adapundi",
    vendor_id: "PRT-001",
    vendor_name: "PT Media Nusantara Digital",
    invoice_number: "INV-2026-MND-01",
    invoice_date: "2026-01-15",
    invoice_month: ["012026"],
    invoice_description: "Pembayaran Penayangan Banner Ads Digital Januari 2026",
    currency: "IDR",
    total_amount: 75e6,
    payment_status: "Lunas",
    bank_name: "BCA",
    bank_account_number: "1234567890",
    bank_account_holder_name: "PT Media Nusantara Digital",
    created_at: "2026-01-15T10:00:00.000Z"
  },
  {
    id: "SPD-002",
    organizationId: "org-adapundi",
    vendor_id: "PRT-002",
    vendor_name: "PT Cloud Teknologi Indonesia",
    invoice_number: "INV-2026-CTI-01",
    invoice_date: "2026-01-20",
    invoice_month: ["012026"],
    invoice_description: "Termin 1 Pembayaran Migrasi Cloud Infrastructure",
    currency: "IDR",
    total_amount: 3e8,
    payment_status: "Lunas",
    bank_name: "Bank Mandiri",
    bank_account_number: "0987654321",
    bank_account_holder_name: "PT Cloud Teknologi Indonesia",
    created_at: "2026-01-20T11:00:00.000Z"
  },
  {
    id: "SPD-003",
    organizationId: "org-adapundi",
    vendor_id: "PRT-003",
    vendor_name: "PT Global Logistics Utama",
    invoice_number: "INV-2026-GLU-02",
    invoice_date: "2026-02-10",
    invoice_month: ["022026"],
    invoice_description: "Tagihan Biaya Pengiriman Logistik Kurir Februari 2026",
    currency: "IDR",
    total_amount: 5e7,
    payment_status: "Lunas",
    bank_name: "BNI",
    bank_account_number: "1122334455",
    bank_account_holder_name: "PT Global Logistics Utama",
    created_at: "2026-02-10T14:00:00.000Z"
  },
  {
    id: "SPD-004",
    organizationId: "org-adapundi",
    vendor_id: "PRT-004",
    vendor_name: "PT Solusi Cyber Global",
    invoice_number: "INV-2026-SCG-02",
    invoice_date: "2026-02-18",
    invoice_month: ["022026"],
    invoice_description: "Tagihan Jasa Audit Penetrasi Sistem Mobile App Q1",
    currency: "IDR",
    total_amount: 45e6,
    payment_status: "Pending",
    bank_name: "BCA",
    bank_account_number: "5544332211",
    bank_account_holder_name: "PT Solusi Cyber Global",
    created_at: "2026-02-18T09:30:00.000Z"
  },
  {
    id: "SPD-005",
    organizationId: "org-adapundi",
    vendor_id: "PRT-005",
    vendor_name: "PT Creative Agency Asia",
    invoice_number: "INV-2026-CAA-03",
    invoice_date: "2026-03-05",
    invoice_month: ["032026"],
    invoice_description: "Termin 1 Produksi Video Komersial 30 Detik",
    currency: "IDR",
    total_amount: 12e7,
    payment_status: "Lunas",
    bank_name: "Bank Permata",
    bank_account_number: "9988776655",
    bank_account_holder_name: "PT Creative Agency Asia",
    created_at: "2026-03-05T13:00:00.000Z"
  },
  {
    id: "SPD-006",
    organizationId: "org-adapundi",
    vendor_id: "PRT-006",
    vendor_name: "Global Ad Networks Inc.",
    invoice_number: "INV-2026-GAN-03",
    invoice_date: "2026-03-12",
    invoice_month: ["032026"],
    invoice_description: "Prepaid Top Up Deposit Ad Serving USD",
    currency: "USD",
    total_amount: 12e3,
    total_amount_usd: 12e3,
    payment_status: "Lunas",
    bank_name: "Citibank N.A.",
    bank_account_number: "8877665544",
    bank_account_holder_name: "Global Ad Networks Inc",
    created_at: "2026-03-12T15:20:00.000Z"
  },
  {
    id: "SPD-007",
    organizationId: "org-adapundi",
    vendor_id: "PRT-007",
    vendor_name: "PT Telekomunikasi Digital Mandiri",
    invoice_number: "INV-2026-TDM-04",
    invoice_date: "2026-04-01",
    invoice_month: ["042026"],
    invoice_description: "Sewa Jaringan Dedicated Fibre Optic April 2026",
    currency: "IDR",
    total_amount: 6e7,
    payment_status: "Pending",
    bank_name: "BRI",
    bank_account_number: "3344556677",
    bank_account_holder_name: "PT Telekomunikasi Digital Mandiri",
    created_at: "2026-04-01T10:00:00.000Z"
  },
  {
    id: "SPD-008",
    organizationId: "org-adapundi",
    vendor_id: "PRT-008",
    vendor_name: "PT Prisma Konsultan Legal",
    invoice_number: "INV-2026-PKL-04",
    invoice_date: "2026-04-14",
    invoice_month: ["042026"],
    invoice_description: "Jasa Audit Due Diligence Hukum 5 Calon Vendor Utama",
    currency: "IDR",
    total_amount: 35e6,
    payment_status: "Lunas",
    bank_name: "BCA",
    bank_account_number: "4433221100",
    bank_account_holder_name: "PT Prisma Konsultan Legal",
    created_at: "2026-04-14T11:45:00.000Z"
  },
  {
    id: "SPD-009",
    organizationId: "org-adapundi",
    vendor_id: "PRT-009",
    vendor_name: "Southeast Asia Reseller Ltd",
    invoice_number: "INV-2026-SAR-05",
    invoice_date: "2026-05-02",
    invoice_month: ["052026"],
    invoice_description: "Pembelian 500 Unit Lisensi SaaS Enterprise",
    currency: "USD",
    total_amount: 15e3,
    total_amount_usd: 15e3,
    payment_status: "Lunas",
    bank_name: "DBS Bank Singapore",
    bank_account_number: "6655443322",
    bank_account_holder_name: "Southeast Asia Reseller Ltd",
    created_at: "2026-05-02T14:10:00.000Z"
  },
  {
    id: "SPD-010",
    organizationId: "org-adapundi",
    vendor_id: "PRT-002",
    vendor_name: "PT Cloud Teknologi Indonesia",
    invoice_number: "INV-2026-CTI-05",
    invoice_date: "2026-05-19",
    invoice_month: ["052026"],
    invoice_description: "Biaya Setup Disaster Recovery Datacenter Cadangan",
    currency: "IDR",
    total_amount: 85e6,
    payment_status: "Lunas",
    bank_name: "Bank Mandiri",
    bank_account_number: "0987654321",
    bank_account_holder_name: "PT Cloud Teknologi Indonesia",
    created_at: "2026-05-19T16:00:00.000Z"
  }
];

// src/lib/fileNaming.ts
function sanitizeFilePart(val, fallback = "") {
  if (!val) return fallback;
  const sanitized = String(val).trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
  return sanitized || fallback;
}
function getFileExtension(fileNameOrExt, defaultExt = ".pdf") {
  if (!fileNameOrExt) return defaultExt;
  const match = fileNameOrExt.match(/\.[0-9a-z]+$/i);
  if (match) return match[0];
  if (fileNameOrExt.startsWith(".")) return fileNameOrExt;
  return `.${fileNameOrExt}`;
}
function formatToYYYYMMDD(dateVal, fallback = "") {
  if (!dateVal) {
    if (fallback) return fallback;
    const now = /* @__PURE__ */ new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return fallback || "20260101";
    return `${dateVal.getFullYear()}${String(dateVal.getMonth() + 1).padStart(2, "0")}${String(dateVal.getDate()).padStart(2, "0")}`;
  }
  const str = String(dateVal).trim();
  if (/^\d{8}$/.test(str)) return str;
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}${ymdMatch[2].padStart(2, "0")}${ymdMatch[3].padStart(2, "0")}`;
  }
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}${dmyMatch[2].padStart(2, "0")}${dmyMatch[1].padStart(2, "0")}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }
  const digits = str.replace(/[^0-9]/g, "");
  if (digits.length >= 8) return digits.slice(0, 8);
  return digits || fallback || "20260101";
}
function formatToYYYYMM(periodVal, fallback = "") {
  if (!periodVal) {
    if (fallback) return fallback;
    const now = /* @__PURE__ */ new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  if (Array.isArray(periodVal)) {
    const valid = periodVal.map((p) => formatToYYYYMM(p)).filter(Boolean);
    return valid[0] || fallback || "202601";
  }
  const str = String(periodVal).trim();
  if (/^\d{6}$/.test(str)) return str;
  const ymMatch = str.match(/^(\d{4})[-/.](\d{1,2})/);
  if (ymMatch) {
    return `${ymMatch[1]}${ymMatch[2].padStart(2, "0")}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const digits = str.replace(/[^0-9]/g, "");
  if (digits.length >= 6) return digits.slice(0, 6);
  return digits || fallback || "202601";
}
function standardizeDDDocName(docName) {
  if (!docName) return "Business License";
  const lower = docName.toLowerCase().trim();
  if (lower.includes("nda") || lower.includes("non-disclosure") || lower.includes("kerahasiaan")) return "NDA";
  if (lower.includes("akta") || lower.includes("deed") || lower.includes("pendirian") || lower.includes("anggaran dasar")) return "Deed of Establishment";
  if (lower.includes("nib") || lower.includes("nomor induk berusaha") || lower.includes("license") || lower.includes("izin usaha")) return "Business License";
  if (lower.includes("npwp") || lower.includes("skt") || lower.includes("pajak") || lower.includes("tax")) return "Tax ID";
  if (lower.includes("ktp") || lower.includes("passport") || lower.includes("direksi") || lower.includes("id card")) return "Director ID";
  if (lower.includes("rekening") || lower.includes("bank") || lower.includes("koran") || lower.includes("statement")) return "Bank Statement";
  if (lower.includes("sppkp") || lower.includes("vat") || lower.includes("pkp")) return "VAT Registration";
  if (lower.includes("form") || lower.includes("due diligence") || lower.includes("dd")) return "Due Diligence Form";
  return sanitizeFilePart(docName, "Business License");
}
function formatContractFileName(params) {
  const ext = getFileExtension(params.rawFileName, ".pdf");
  const partner = sanitizeFilePart(params.partnerName, "Partner");
  const isAddendum = params.documentType?.toLowerCase().includes("addendum");
  const docType = isAddendum ? "Agreement Addendum" : sanitizeFilePart(params.documentType, "Master Agreement");
  const sDate = formatToYYYYMMDD(params.startDate);
  const ctrNo = sanitizeFilePart(params.contractNumber, isAddendum ? "ADD-001" : "01A_ITS_I_2023");
  return `Contract-${partner}-${docType}-${sDate}-${ctrNo}${ext}`;
}
function formatIOFileName(params) {
  const ext = getFileExtension(params.rawFileName, ".pdf");
  const partner = sanitizeFilePart(params.partnerName, "Partner");
  const channel = sanitizeFilePart(params.mediaChannel, "Google Ads");
  const sDate = formatToYYYYMMDD(params.startDate);
  const ioNo = sanitizeFilePart(params.ioNumber, "IO-001");
  return `IO-${partner}-${channel}-${sDate}-${ioNo}${ext}`;
}
function formatInvoiceFileName(params) {
  const ext = getFileExtension(params.rawFileName, ".pdf");
  const vendor = sanitizeFilePart(params.partnerName, "Vendor");
  const period = formatToYYYYMM(params.period || params.invoiceMonth);
  const invDate = formatToYYYYMMDD(params.invoiceDate);
  const invNo = sanitizeFilePart(params.invoiceNumber, "INV-001");
  return `Invoice-${vendor}-${period}-${invDate}-${invNo}${ext}`;
}
function formatBillingFileName(params) {
  const ext = getFileExtension(params.rawFileName, ".pdf");
  const vendor = sanitizeFilePart(params.partnerName, "Vendor");
  const period = formatToYYYYMM(params.period || params.invoiceMonth);
  const invDate = formatToYYYYMMDD(params.invoiceDate);
  const invNo = sanitizeFilePart(params.invoiceNumber, "INV-001");
  return `Billing-${vendor}-${period}-${invDate}-${invNo}${ext}`;
}
function formatDueDiligenceFileName(params) {
  const ext = getFileExtension(params.rawFileName, ".pdf");
  const vendor = sanitizeFilePart(params.vendorName, "Vendor");
  const docName = standardizeDDDocName(params.documentName);
  const docDate = formatToYYYYMMDD(params.documentDate);
  const seqNum = typeof params.sequence === "number" ? String(params.sequence).padStart(2, "0") : params.sequence ? String(params.sequence).padStart(2, "0") : "01";
  return `DD-${vendor}-${docName}-${docDate}-${seqNum}${ext}`;
}

// src/lib/currencyRates.ts
var globalRatesCache = {};
var lastGlobalRatesFetch = 0;
async function fetchRealRates() {
  if (Date.now() - lastGlobalRatesFetch < 36e5 && Object.keys(globalRatesCache).length > 0) {
    return globalRatesCache;
  }
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (res.ok) {
      const data = await res.json();
      globalRatesCache = data.rates || {};
      lastGlobalRatesFetch = Date.now();
    }
  } catch (e) {
    console.warn("Failed to fetch real-time exchange rates, using defaults", e);
  }
  return globalRatesCache;
}
async function getHistoricalExchangeRatesBatch(_spreadsheetId, _token, items) {
  const map = {};
  const rates = await fetchRealRates();
  for (const item of items) {
    const cur = (item.currency || "IDR").toUpperCase();
    if (cur === "USD") {
      map[`USD_${item.invoice_date || ""}`] = 1;
      continue;
    }
    let rate = cur === "IDR" ? 62e-6 : 1;
    if (rates[cur]) {
      rate = 1 / rates[cur];
    }
    map[`${cur}_${item.invoice_date || ""}`] = rate;
  }
  return map;
}
async function getHistoricalExchangeRate(spreadsheetId, token, currency, invoiceDateStr) {
  const map = await getHistoricalExchangeRatesBatch(spreadsheetId, token, [{ currency, invoice_date: invoiceDateStr }]);
  return map[`${(currency || "IDR").toUpperCase()}_${invoiceDateStr || ""}`] || ((currency || "IDR").toUpperCase() === "IDR" ? 62e-6 : 1);
}
async function getExchangeRates(_spreadsheetId, _token, currencies) {
  const targetCurrencies = Array.from(new Set(currencies.filter((c) => c && c !== "USD")));
  if (targetCurrencies.length === 0) return {};
  const rates = await fetchRealRates();
  const result = {};
  targetCurrencies.forEach((cur) => {
    if (rates[cur]) {
      result[cur] = 1 / rates[cur];
    } else {
      result[cur] = cur === "IDR" ? 62e-6 : 1;
    }
  });
  return result;
}

// src/lib/googleServiceAccountAuth.ts
var import_googleapis = require("googleapis");
var import_fs3 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var DEFAULT_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive"
];
function parseServiceAccountString(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return null;
  let str = rawInput.trim();
  if (!str) return null;
  if ((str.startsWith("/") || str.startsWith("./") || str.endsWith(".json")) && import_fs3.default.existsSync(str)) {
    try {
      const content = import_fs3.default.readFileSync(str, "utf-8");
      const parsedFromFile = parseServiceAccountString(content);
      if (parsedFromFile) return parsedFromFile;
    } catch (_) {
    }
  }
  if (str.startsWith("'") && str.endsWith("'") || str.startsWith('"') && str.endsWith('"') || str.startsWith("`") && str.endsWith("`")) {
    str = str.slice(1, -1).trim();
  }
  const validateObj = (obj) => {
    if (!obj) return null;
    if (typeof obj === "string") {
      return parseServiceAccountString(obj);
    }
    if (typeof obj === "object" && !Array.isArray(obj)) {
      if (obj.client_email || obj.private_key || obj.project_id || obj.type === "service_account") {
        return {
          ...obj,
          private_key: typeof obj.private_key === "string" ? obj.private_key.replace(/\\n/g, "\n") : obj.private_key
        };
      }
    }
    return null;
  };
  try {
    const parsed = JSON.parse(str);
    const valid = validateObj(parsed);
    if (valid) return valid;
  } catch (_) {
  }
  try {
    const decoded = Buffer.from(str, "base64").toString("utf-8").trim();
    if (decoded && decoded !== str) {
      try {
        const parsed = JSON.parse(decoded);
        const valid = validateObj(parsed);
        if (valid) return valid;
      } catch (_) {
      }
    }
  } catch (_) {
  }
  try {
    const unescaped = str.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const parsed = JSON.parse(unescaped);
    const valid = validateObj(parsed);
    if (valid) return valid;
  } catch (_) {
  }
  const firstBrace = str.indexOf("{");
  const lastBrace = str.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const subStr = str.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(subStr);
      const valid = validateObj(parsed);
      if (valid) return valid;
    } catch (_) {
    }
  }
  return null;
}
function loadServiceAccountCredentials(param, throwOnError = true) {
  let actualParam;
  let shouldThrow = throwOnError;
  if (typeof param === "boolean") {
    shouldThrow = param;
    actualParam = void 0;
  } else {
    actualParam = param;
  }
  if (typeof actualParam === "object" && actualParam !== null) {
    if (actualParam.client_email && actualParam.private_key) {
      return {
        ...actualParam,
        private_key: actualParam.private_key.replace(/\\n/g, "\n")
      };
    }
  }
  if (typeof actualParam === "string" && actualParam.trim()) {
    const parsed = parseServiceAccountString(actualParam);
    if (parsed) return parsed;
  }
  const defaultCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || import_path3.default.join(process.cwd(), "credentials.json");
  if (import_fs3.default.existsSync(defaultCredentialsPath)) {
    try {
      const raw = import_fs3.default.readFileSync(defaultCredentialsPath, "utf-8");
      const parsed = parseServiceAccountString(raw);
      if (parsed) return parsed;
    } catch (_) {
    }
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const parsed = parseServiceAccountString(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    if (parsed) return parsed;
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID || "default-project",
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    };
  }
  if (shouldThrow) {
    throw new Error(
      "Konfigurasi Service Account tidak ditemukan! Harap sediakan credentials.json atau set environment variables (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY)."
    );
  }
  return null;
}
function hasServiceAccountCredentials() {
  return loadServiceAccountCredentials(void 0, false) !== null;
}
function getGoogleAuthClient(credentialsInput, scopes = DEFAULT_SHEETS_SCOPES) {
  const creds = loadServiceAccountCredentials(credentialsInput);
  if (!creds.client_email || !creds.private_key) {
    throw new Error("Konfigurasi Service Account tidak memiliki client_email atau private_key yang valid.");
  }
  const jwtClient = new import_googleapis.google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes
  });
  return jwtClient;
}
function getGoogleSheetsClient(credentialsInput, scopes = DEFAULT_SHEETS_SCOPES) {
  const auth2 = getGoogleAuthClient(credentialsInput, scopes);
  return import_googleapis.google.sheets({ version: "v4", auth: auth2 });
}
function getGoogleDriveClient(credentialsInput, scopes = DEFAULT_SHEETS_SCOPES) {
  const auth2 = getGoogleAuthClient(credentialsInput, scopes);
  return import_googleapis.google.drive({ version: "v3", auth: auth2 });
}

// src/lib/googleDriveSync.ts
var import_googleapis2 = require("googleapis");
var import_stream = require("stream");
var onInvalidTokenCb = null;
function setInvalidTokenCallback(cb) {
  onInvalidTokenCb = cb;
}
var refreshTokenGetter = null;
function setRefreshTokenGetter(getter) {
  refreshTokenGetter = getter;
}
function handleTokenAuthError(token, err) {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.code || 0;
  if (status === 401 || msg.includes("invalid authentication credentials") || msg.includes("invalid_token") || msg.includes("auth error") || msg.includes("login cookie")) {
    console.warn("[GoogleDrive] Token Google OAuth kedaluwarsa / tidak valid. Meminta sistem membersihkan token mati.");
    if (onInvalidTokenCb) {
      try {
        onInvalidTokenCb(token);
      } catch (cbErr) {
        console.warn("Error in invalid token callback:", cbErr);
      }
    }
  }
}
function sanitizeParentFolderId(id) {
  if (!id) return void 0;
  const trimmed = id.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed === "-" || trimmed === "undefined" || trimmed === "null" || trimmed.startsWith("Folder_") || trimmed.startsWith("org-") || trimmed.startsWith("org_") || trimmed.startsWith("tenant-")) {
    return void 0;
  }
  if (trimmed === "root" || /^[a-zA-Z0-9_-]{15,}$/.test(trimmed) && !trimmed.startsWith("org-") && !trimmed.startsWith("tenant-")) {
    return trimmed;
  }
  return void 0;
}
function extractFolderIdFromLink(link) {
  if (!link) return void 0;
  if (link.includes("/folders/")) {
    const parts = link.split("/folders/");
    const folderId = parts[1]?.split("?")[0]?.trim();
    return sanitizeParentFolderId(folderId);
  }
  return void 0;
}
async function createDriveFolder(folderName, parentFolderId, token) {
  const result = await getOrCreateDriveFolder(folderName, parentFolderId, token);
  return result.webViewLink;
}
async function createNewDriveFolderInParent(folderName, parentFolderId, token) {
  let activeToken = token && token.trim() !== "" ? token.trim() : void 0;
  if (!activeToken && refreshTokenGetter) {
    try {
      const fresh = await refreshTokenGetter();
      if (fresh) activeToken = fresh.trim();
    } catch (_) {
    }
  }
  const cleanParentId = sanitizeParentFolderId(parentFolderId);
  if (activeToken) {
    try {
      const oauth2Client = new import_googleapis2.google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: activeToken });
      const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
      try {
        const createRes = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: cleanParentId ? [cleanParentId] : void 0
          },
          supportsAllDrives: true,
          fields: "id,webViewLink"
        });
        if (createRes.data.id) {
          return {
            id: createRes.data.id,
            webViewLink: createRes.data.webViewLink || `https://drive.google.com/drive/folders/${createRes.data.id}`
          };
        }
      } catch (err) {
        handleTokenAuthError(activeToken, err);
        if (cleanParentId && (err?.message?.includes("File not found") || err?.status === 404 || err?.code === 404)) {
          const rootCreate = await drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: "application/vnd.google-apps.folder"
            },
            supportsAllDrives: true,
            fields: "id,webViewLink"
          });
          if (rootCreate.data.id) {
            return {
              id: rootCreate.data.id,
              webViewLink: rootCreate.data.webViewLink || `https://drive.google.com/drive/folders/${rootCreate.data.id}`
            };
          }
        } else {
          console.warn("createNewDriveFolderInParent OAuth failed:", err?.message);
        }
      }
    } catch (oauthErr) {
      console.warn("createNewDriveFolderInParent OAuth client error:", oauthErr?.message);
    }
  }
  try {
    const drive = getGoogleDriveClient();
    if (drive) {
      try {
        const createRes = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: cleanParentId ? [cleanParentId] : void 0
          },
          supportsAllDrives: true,
          fields: "id,webViewLink"
        });
        if (createRes.data.id) {
          return {
            id: createRes.data.id,
            webViewLink: createRes.data.webViewLink || `https://drive.google.com/drive/folders/${createRes.data.id}`
          };
        }
      } catch (saErr) {
        if (cleanParentId && (saErr?.message?.includes("File not found") || saErr?.status === 404 || saErr?.code === 404)) {
          const rootCreate = await drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: "application/vnd.google-apps.folder"
            },
            supportsAllDrives: true,
            fields: "id,webViewLink"
          });
          if (rootCreate.data.id) {
            return {
              id: rootCreate.data.id,
              webViewLink: rootCreate.data.webViewLink || `https://drive.google.com/drive/folders/${rootCreate.data.id}`
            };
          }
        } else {
          console.warn("createNewDriveFolderInParent Service Account failed:", saErr?.message);
        }
      }
    }
  } catch (saErr) {
    console.warn("createNewDriveFolderInParent SA error:", saErr?.message);
  }
  return getOrCreateDriveFolder(folderName, parentFolderId, token);
}
async function getOrCreateDriveFolder(folderName, parentFolderId, token) {
  const cleanParentId = sanitizeParentFolderId(parentFolderId);
  const escapedName = folderName.replace(/'/g, "\\'");
  const executeFolderOperation = async (driveClient, parentId) => {
    const q = parentId ? `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false` : `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const listRes = await driveClient.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id,webViewLink)"
    });
    if (listRes.data.files && listRes.data.files.length > 0) {
      const file = listRes.data.files[0];
      return {
        id: file.id,
        webViewLink: file.webViewLink || `https://drive.google.com/drive/folders/${file.id}`
      };
    }
    const createRes = await driveClient.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : void 0
      },
      supportsAllDrives: true,
      fields: "id,webViewLink"
    });
    if (createRes.data.id) {
      return {
        id: createRes.data.id,
        webViewLink: createRes.data.webViewLink || `https://drive.google.com/drive/folders/${createRes.data.id}`
      };
    }
    return null;
  };
  let activeToken = token && token.trim() !== "" ? token.trim() : void 0;
  if (!activeToken && refreshTokenGetter) {
    try {
      const fresh = await refreshTokenGetter();
      if (fresh) activeToken = fresh.trim();
    } catch (_) {
    }
  }
  if (activeToken && activeToken !== "") {
    try {
      const oauth2Client = new import_googleapis2.google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: activeToken });
      const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
      try {
        const res = await executeFolderOperation(drive, cleanParentId);
        if (res) return res;
      } catch (err) {
        handleTokenAuthError(activeToken, err);
        if (cleanParentId && (err?.message?.includes("File not found") || err?.status === 404 || err?.code === 404)) {
          try {
            const rootRes = await executeFolderOperation(drive, void 0);
            if (rootRes) return rootRes;
          } catch (_) {
          }
        } else {
          console.warn("OAuth Drive Folder creation/search warning:", err?.message);
        }
        if (refreshTokenGetter) {
          try {
            const fresh = await refreshTokenGetter();
            if (fresh && fresh.trim() !== "" && fresh.trim() !== activeToken) {
              activeToken = fresh.trim();
              const retryOauth = new import_googleapis2.google.auth.OAuth2();
              retryOauth.setCredentials({ access_token: activeToken });
              const retryDrive = import_googleapis2.google.drive({ version: "v3", auth: retryOauth });
              const retryRes = await executeFolderOperation(retryDrive, cleanParentId) || await executeFolderOperation(retryDrive, void 0);
              if (retryRes) return retryRes;
            }
          } catch (retryErr) {
            console.warn("[GoogleDrive] Folder retry with refreshed token failed:", retryErr?.message);
          }
        }
      }
    } catch (clientErr) {
      console.warn("OAuth drive client setup failed:", clientErr?.message);
    }
  }
  try {
    const drive = getGoogleDriveClient();
    if (drive) {
      try {
        const saRes = await executeFolderOperation(drive, cleanParentId);
        if (saRes) return saRes;
      } catch (err) {
        if (cleanParentId && (err?.message?.includes("File not found") || err?.status === 404 || err?.code === 404)) {
          try {
            const saRootRes = await executeFolderOperation(drive, void 0);
            if (saRootRes) return saRootRes;
          } catch (_) {
          }
        } else {
          console.warn("Service Account Drive Folder creation/search warning:", err?.message);
        }
      }
    }
  } catch (saErr) {
    console.warn("Service Account execution error:", saErr?.message);
  }
  return {
    id: `Folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    webViewLink: `https://drive.google.com/`
  };
}
async function uploadFileToDrive(fileName, base64Data, mimeType = "application/pdf", parentFolderId, token) {
  const cleanBase64 = base64Data.includes("base64,") ? base64Data.split("base64,")[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, "base64");
  const cleanParentId = sanitizeParentFolderId(parentFolderId);
  let activeToken = token && token.trim() !== "" ? token.trim() : void 0;
  if (!activeToken && refreshTokenGetter) {
    try {
      const fresh = await refreshTokenGetter();
      if (fresh) activeToken = fresh.trim();
    } catch (_) {
    }
  }
  if (activeToken && activeToken !== "") {
    try {
      const oauth2Client = new import_googleapis2.google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: activeToken });
      const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: cleanParentId ? [cleanParentId] : void 0
        },
        media: {
          mimeType: mimeType || "application/pdf",
          body: import_stream.Readable.from(buffer)
        },
        supportsAllDrives: true,
        fields: "id,webViewLink"
      });
      if (res.data.id) {
        console.log(`[GoogleDrive] File '${fileName}' successfully uploaded via OAuth token. ID: ${res.data.id}`);
        return res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
      }
    } catch (tokenErr) {
      handleTokenAuthError(activeToken, tokenErr);
      console.warn("[GoogleDrive] OAuth token upload error:", tokenErr.message);
      if (refreshTokenGetter) {
        try {
          const refreshedToken = await refreshTokenGetter();
          if (refreshedToken && refreshedToken.trim() !== "" && refreshedToken.trim() !== activeToken) {
            console.log("[GoogleDrive] Auto-retrying upload with refreshed OAuth access token...");
            activeToken = refreshedToken.trim();
            const retryOauth = new import_googleapis2.google.auth.OAuth2();
            retryOauth.setCredentials({ access_token: activeToken });
            const retryDrive = import_googleapis2.google.drive({ version: "v3", auth: retryOauth });
            const retryRes = await retryDrive.files.create({
              requestBody: {
                name: fileName,
                parents: cleanParentId ? [cleanParentId] : void 0
              },
              media: {
                mimeType: mimeType || "application/pdf",
                body: import_stream.Readable.from(buffer)
              },
              supportsAllDrives: true,
              fields: "id,webViewLink"
            });
            if (retryRes.data.id) {
              console.log(`[GoogleDrive] File '${fileName}' successfully uploaded via refreshed OAuth token. ID: ${retryRes.data.id}`);
              return retryRes.data.webViewLink || `https://drive.google.com/file/d/${retryRes.data.id}/view`;
            }
          }
        } catch (retryErr) {
          console.warn("[GoogleDrive] Retry with refreshed token failed:", retryErr?.message);
        }
      }
      if (cleanParentId && (tokenErr.message?.includes("File not found") || tokenErr.status === 404)) {
        try {
          const oauth2Client = new import_googleapis2.google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: activeToken });
          const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
          const fallbackRes = await drive.files.create({
            requestBody: { name: fileName },
            media: { mimeType: mimeType || "application/pdf", body: import_stream.Readable.from(buffer) },
            supportsAllDrives: true,
            fields: "id,webViewLink"
          });
          if (fallbackRes.data.id) {
            return fallbackRes.data.webViewLink || `https://drive.google.com/file/d/${fallbackRes.data.id}/view`;
          }
        } catch (_) {
        }
      }
    }
  }
  try {
    const drive = getGoogleDriveClient();
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: cleanParentId ? [cleanParentId] : void 0
      },
      media: {
        mimeType: mimeType || "application/pdf",
        body: import_stream.Readable.from(buffer)
      },
      supportsAllDrives: true,
      fields: "id,webViewLink"
    });
    if (res.data.id) {
      console.log(`[GoogleDrive] File '${fileName}' successfully uploaded via Service Account. ID: ${res.data.id}`);
      return res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
    }
  } catch (saErr) {
    if (cleanParentId && (saErr.message?.includes("File not found") || saErr.status === 404)) {
      try {
        const drive = getGoogleDriveClient();
        const fallbackRes = await drive.files.create({
          requestBody: {
            name: fileName
          },
          media: {
            mimeType: mimeType || "application/pdf",
            body: import_stream.Readable.from(buffer)
          },
          supportsAllDrives: true,
          fields: "id,webViewLink"
        });
        if (fallbackRes.data.id) {
          console.log(`[GoogleDrive] File '${fileName}' uploaded via Service Account (root fallback). ID: ${fallbackRes.data.id}`);
          return fallbackRes.data.webViewLink || `https://drive.google.com/file/d/${fallbackRes.data.id}/view`;
        }
      } catch (_) {
      }
    } else {
      console.warn("[GoogleDrive] Service Account upload warning:", saErr.message);
    }
  }
  return null;
}
async function createSpreadsheetInFolder(title, folderId, token) {
  let activeToken = token && token.trim() !== "" ? token.trim() : void 0;
  if (!activeToken && refreshTokenGetter) {
    try {
      const fresh = await refreshTokenGetter();
      if (fresh) activeToken = fresh.trim();
    } catch (_) {
    }
  }
  const cleanParentId = sanitizeParentFolderId(folderId);
  if (activeToken) {
    try {
      const oauth2Client = new import_googleapis2.google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: activeToken });
      const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
      const createRes = await drive.files.create({
        requestBody: {
          name: title,
          mimeType: "application/vnd.google-apps.spreadsheet",
          parents: cleanParentId ? [cleanParentId] : void 0
        },
        supportsAllDrives: true,
        fields: "id,webViewLink"
      });
      if (createRes.data.id) {
        return {
          id: createRes.data.id,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${createRes.data.id}/edit`
        };
      }
    } catch (err) {
      if (cleanParentId && (err?.message?.includes("File not found") || err?.status === 404 || err?.code === 404)) {
        try {
          const oauth2Client = new import_googleapis2.google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: activeToken });
          const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
          const fallbackRes = await drive.files.create({
            requestBody: {
              name: title,
              mimeType: "application/vnd.google-apps.spreadsheet"
            },
            supportsAllDrives: true,
            fields: "id,webViewLink"
          });
          if (fallbackRes.data.id) {
            return {
              id: fallbackRes.data.id,
              spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${fallbackRes.data.id}/edit`
            };
          }
        } catch (_) {
        }
      } else {
        console.warn("OAuth createSpreadsheetInFolder failed:", err.message);
      }
    }
  }
  try {
    const drive = getGoogleDriveClient();
    const createRes = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: cleanParentId ? [cleanParentId] : void 0
      },
      supportsAllDrives: true,
      fields: "id,webViewLink"
    });
    if (createRes.data.id) {
      return {
        id: createRes.data.id,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${createRes.data.id}/edit`
      };
    }
  } catch (saErr) {
    if (cleanParentId && (saErr.message?.includes("File not found") || saErr.status === 404)) {
      try {
        const drive = getGoogleDriveClient();
        const fallbackRes = await drive.files.create({
          requestBody: {
            name: title,
            mimeType: "application/vnd.google-apps.spreadsheet"
          },
          supportsAllDrives: true,
          fields: "id,webViewLink"
        });
        if (fallbackRes.data.id) {
          return {
            id: fallbackRes.data.id,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${fallbackRes.data.id}/edit`
          };
        }
      } catch (_) {
      }
    } else {
      console.warn("Service Account createSpreadsheetInFolder failed:", saErr.message);
    }
  }
  throw new Error(`Failed to create spreadsheet '${title}' in folder ${folderId}`);
}
async function createGoogleDocInFolder(title, htmlContent, folderId, token) {
  let activeToken = token && token.trim() !== "" ? token.trim() : void 0;
  if (!activeToken && refreshTokenGetter) {
    try {
      const fresh = await refreshTokenGetter();
      if (fresh) activeToken = fresh.trim();
    } catch (_) {
    }
  }
  const cleanParentId = sanitizeParentFolderId(folderId);
  if (activeToken) {
    try {
      const oauth2Client = new import_googleapis2.google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: activeToken });
      const drive = import_googleapis2.google.drive({ version: "v3", auth: oauth2Client });
      const mediaStream = new import_stream.Readable();
      mediaStream.push(htmlContent);
      mediaStream.push(null);
      const createRes = await drive.files.create({
        requestBody: {
          name: title,
          mimeType: "application/vnd.google-apps.document",
          parents: cleanParentId ? [cleanParentId] : void 0
        },
        media: {
          mimeType: "text/html",
          body: mediaStream
        },
        supportsAllDrives: true,
        fields: "id,webViewLink"
      });
      if (createRes.data.id) {
        return {
          id: createRes.data.id,
          webViewLink: createRes.data.webViewLink || `https://docs.google.com/document/d/${createRes.data.id}/edit`,
          documentUrl: `https://docs.google.com/document/d/${createRes.data.id}/edit`
        };
      }
    } catch (err) {
      console.warn("[createGoogleDocInFolder] OAuth error, trying fallback:", err?.message);
    }
  }
  try {
    const drive = getGoogleDriveClient();
    const mediaStream = new import_stream.Readable();
    mediaStream.push(htmlContent);
    mediaStream.push(null);
    const createRes = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.document",
        parents: cleanParentId ? [cleanParentId] : void 0
      },
      media: {
        mimeType: "text/html",
        body: mediaStream
      },
      supportsAllDrives: true,
      fields: "id,webViewLink"
    });
    if (createRes.data.id) {
      return {
        id: createRes.data.id,
        webViewLink: createRes.data.webViewLink || `https://docs.google.com/document/d/${createRes.data.id}/edit`,
        documentUrl: `https://docs.google.com/document/d/${createRes.data.id}/edit`
      };
    }
  } catch (saErr) {
    console.warn("[createGoogleDocInFolder] Service account error:", saErr?.message);
  }
  throw new Error(`Gagal membuat dokumen Google Docs '${title}'`);
}

// server.ts
var import_multer = __toESM(require("multer"), 1);

// src/lib/cheapOcrPipeline.ts
var import_pdf_lib = require("pdf-lib");
var import_pdf_parse = require("pdf-parse");
var import_crypto3 = __toESM(require("crypto"), 1);
function computeBufferSha256(buffer) {
  return import_crypto3.default.createHash("sha256").update(buffer).digest("hex");
}
function computeInputSha256(input) {
  if (Buffer.isBuffer(input)) {
    return computeBufferSha256(input);
  }
  const clean = input.includes("base64,") ? input.split("base64,")[1] : input;
  return computeBufferSha256(Buffer.from(clean, "base64"));
}
var OcrMemoryCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.maxEntries = 300;
    this.ttlMs = 24 * 60 * 60 * 1e3;
  }
  // 24 hours
  makeKey(hash, taskType) {
    return `${taskType}:${hash}`;
  }
  get(hash, taskType) {
    if (!hash) return null;
    const key = this.makeKey(hash, taskType);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }
  set(hash, taskType, data) {
    if (!hash || !data) return;
    const key = this.makeKey(hash, taskType);
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hash,
      taskType
    });
  }
  clear() {
    this.cache.clear();
  }
  size() {
    return this.cache.size;
  }
};
var globalOcrCache = new OcrMemoryCache();
var LEGAL_KEYWORD_TAXONOMY = [
  // A. Identitas Para Pihak & Pembukaan (Parties & Recitals)
  {
    name: "parties_recitals",
    weight: 25,
    terms: [
      "para pihak",
      "pihak pertama",
      "pihak kedua",
      "yang bertandatangan",
      "menerangkan bahwa",
      "komparisi",
      "selanjutnya disebut",
      "kedudukan hukum",
      "akta pendirian",
      "berkedudukan di",
      "selaku direktur",
      "kuasa hukum",
      "by and between",
      "parties",
      "first party",
      "second party",
      "recitals",
      "witnesseth",
      "hereinafter referred to",
      "duly represented by"
    ],
    regexPatterns: [
      /pihak\s+(?:pertama|kesatu|kedua|ketiga)/i,
      /first\s+party|second\s+party/i
    ]
  },
  // B. Jangka Waktu, Masa Berlaku & Periode (Duration & Term)
  {
    name: "duration_term",
    weight: 35,
    terms: [
      "jangka waktu",
      "masa berlaku",
      "periode perjanjian",
      "waktu pelaksanaan",
      "mulai berlaku",
      "tanggal efektif",
      "berakhir pada",
      "kedaluwarsa",
      "perpanjangan otomatis",
      "masa sewa",
      "tenggang waktu",
      "durasi kontrak",
      "berlaku efektif",
      "perpanjangan berkala",
      "sampai pengakhiran",
      "term and termination",
      "validity period",
      "effective date",
      "commencement date",
      "expiration date",
      "duration of agreement",
      "auto renewal",
      "extended period",
      "tacit renewal",
      "renewal period",
      "initial term"
    ],
    regexPatterns: [
      /(?:jangka\s+waktu|masa\s+berlaku|effective\s+date|term\s+of\s+agreement)/i,
      /\d+\s*(?:hari|bulan|tahun|days|months|years)/i
    ]
  },
  // C. Nilai Kontrak, Harga, Biaya & Komersial (Commercial & Pricing)
  {
    name: "commercial_pricing",
    weight: 40,
    terms: [
      "nilai kontrak",
      "nilai perjanjian",
      "harga sewa",
      "harga pekerjaan",
      "biaya jasa",
      "biaya platform",
      "skema pembayaran",
      "termin pembayaran",
      "imbalan",
      "tata cara pembayaran",
      "kompensasi",
      "invoice",
      "faktur",
      "uang muka",
      "pajak pertambahan nilai",
      "ppn",
      "pph",
      "rekening bank",
      "nominal",
      "sebesar rp",
      "tarif",
      "komisi",
      "rekening penampung",
      "contract value",
      "fee",
      "pricing",
      "cost of service",
      "platform fee",
      "payment terms",
      "invoicing",
      "consideration",
      "commercial terms",
      "schedule of rates",
      "compensation",
      "service fee",
      "monthly recurring"
    ],
    regexPatterns: [
      /(?:rp|idr|\$)\s*[\d\.,]+/i,
      /(?:nilai\s+kontrak|biaya\s+layanan|payment\s+terms|harga\s+total)/i
    ]
  },
  // D. Pengakhiran, Pemutusan & Pemberitahuan (Termination & Notice Period)
  {
    name: "termination_notice",
    weight: 30,
    terms: [
      "pemutusan perjanjian",
      "pengakhiran kerjasama",
      "pembatalan",
      "surat peringatan",
      "pemberitahuan tertulis",
      "masa tenggang",
      "pemberitahuan pengakhiran",
      "notice period",
      "hari kalender",
      "hari kerja sebelum berakhir",
      "pengakhiran sepihak",
      "termination",
      "termination for convenience",
      "termination for cause",
      "written notice",
      "prior notice",
      "notice period",
      "days prior notice",
      "events of default",
      "early termination"
    ],
    regexPatterns: [
      /(?:notice\s+period|pemberitahuan\s+tertulis|pengakhiran\s+perjanjian)/i,
      /(?:30|14|60|90)\s*(?:hari|days)/i
    ]
  },
  // E. Denda, Penalti, Ganti Rugi & Sanksi (Penalties & Liabilities)
  {
    name: "penalties_liability",
    weight: 20,
    terms: [
      "denda keterlambatan",
      "sanksi",
      "ganti rugi",
      "penalti",
      "kelalaian",
      "wanprestasi",
      "tanggung jawab ganti rugi",
      "pembatasan tanggung jawab",
      "liquidated damages",
      "late payment penalty",
      "indemnity",
      "indemnification",
      "limitation of liability",
      "breach of contract",
      "default penalty"
    ]
  },
  // F. Lampiran, Rincian Biaya & Scope of Work (Attachments & Schedules)
  {
    name: "attachments_sow",
    weight: 25,
    terms: [
      "lampiran",
      "jadwal pelaksanaan",
      "rincian biaya",
      "spesifikasi teknis",
      "tabel harga",
      "addendum",
      "amandemen",
      "perubahan perjanjian",
      "ketentuan khusus",
      "daftar harga",
      "ketentuan komersial",
      "appendix",
      "attachment",
      "schedule",
      "annexure",
      "exhibit",
      "statement of work",
      "sow",
      "scope of services",
      "pricing matrix"
    ],
    regexPatterns: [
      /(?:lampiran\s+[a-z0-9]|schedule\s+[a-z0-9]|appendix\s+[a-z0-9]|annexure\s+[a-z0-9])/i
    ]
  },
  // G. Eksekusi, Tanda Tangan & Meterai (Execution & Signatures)
  {
    name: "execution_signatures",
    weight: 35,
    terms: [
      "demikian perjanjian ini dibuat",
      "tanda tangan",
      "meterai",
      "materai",
      "ditandatangani oleh",
      "selaku direktur",
      "kuasa hukum",
      "stempel perusahaan",
      "cap basah",
      "rangkap 2",
      "bermeterai cukup",
      "in witness whereof",
      "signed and executed",
      "signatures",
      "authorized signatory",
      "stamp & seal",
      "duly authorized",
      "executed as an agreement"
    ],
    regexPatterns: [
      /(?:tanda\s+tangan|meterai|materai|in\s+witness\s+whereof|signatures)/i
    ]
  }
];
function scoreLegalText(text) {
  if (!text) return { score: 0, matchedCategories: [] };
  const lower = text.toLowerCase();
  let totalScore = 0;
  const matchedCategories = [];
  for (const cat of LEGAL_KEYWORD_TAXONOMY) {
    let catMatched = false;
    for (const term of cat.terms) {
      if (lower.includes(term.toLowerCase())) {
        catMatched = true;
        totalScore += cat.weight;
        break;
      }
    }
    if (!catMatched && cat.regexPatterns) {
      for (const pattern of cat.regexPatterns) {
        if (pattern.test(text)) {
          catMatched = true;
          totalScore += Math.round(cat.weight * 0.8);
          break;
        }
      }
    }
    if (catMatched) {
      matchedCategories.push(cat.name);
    }
  }
  return { score: totalScore, matchedCategories };
}
async function inspectPdfDocument(buffer) {
  const startMs = Date.now();
  let rawText = "";
  let pageCount = 1;
  const pagesText = [];
  try {
    const parser = new import_pdf_parse.PDFParse({ data: buffer });
    const result = await parser.getText();
    if (typeof parser.destroy === "function") {
      try {
        await parser.destroy();
      } catch {
      }
    }
    rawText = (result?.text || "").trim();
    if (result?.total) {
      pageCount = result.total;
    }
    if (Array.isArray(result?.pages)) {
      result.pages.forEach((p, idx) => {
        pagesText.push({
          num: p.num || idx + 1,
          text: p.text || ""
        });
      });
    }
  } catch {
    rawText = "";
  }
  const inspectionTimeMs = Date.now() - startMs;
  const textLength = rawText.length;
  const characterDensity = pageCount > 0 ? textLength / pageCount : textLength;
  const hasDigitalText = textLength >= 100 && characterDensity >= 40;
  const isScanned = !hasDigitalText;
  let classification = "scanned_image";
  if (hasDigitalText) {
    classification = characterDensity > 300 ? "digital_text" : "hybrid";
  }
  const report = {
    isScanned,
    classification,
    textLength,
    characterDensity: Math.round(characterDensity),
    inspectionTimeMs,
    pageCount,
    hasDigitalText
  };
  return { report, rawText, pagesText };
}
async function optimizePdfForCheapOcr(pdfInput) {
  let buffer;
  if (typeof pdfInput === "string") {
    const cleanBase64 = pdfInput.includes("base64,") ? pdfInput.split("base64,")[1] : pdfInput;
    buffer = Buffer.from(cleanBase64, "base64");
  } else {
    buffer = pdfInput;
  }
  const originalSizeBytes = buffer.length;
  const fileHash = computeBufferSha256(buffer);
  const { report, rawText: extractedText, pagesText } = await inspectPdfDocument(buffer);
  try {
    const pdfDoc = await import_pdf_lib.PDFDocument.load(buffer, { ignoreEncryption: true });
    const originalPageCount = pdfDoc.getPageCount();
    report.pageCount = originalPageCount;
    if (originalPageCount <= 15) {
      const allPages = Array.from({ length: originalPageCount }, (_, i) => i + 1);
      return {
        optimizedBase64: buffer.toString("base64"),
        originalPageCount,
        processedPageCount: originalPageCount,
        pagesIncluded: allPages,
        originalSizeBytes,
        optimizedSizeBytes: originalSizeBytes,
        mimeType: "application/pdf",
        extractedText,
        hasDigitalText: report.hasDigitalText,
        inspectionReport: report,
        fileHash
      };
    }
    const selectedIndicesSet = /* @__PURE__ */ new Set();
    const pageScores = [];
    for (let i = 0; i < Math.min(3, originalPageCount); i++) {
      selectedIndicesSet.add(i);
    }
    if (originalPageCount > 3) {
      selectedIndicesSet.add(originalPageCount - 2);
      selectedIndicesSet.add(originalPageCount - 1);
    }
    const middleCandidateScores = [];
    if (pagesText && pagesText.length > 0) {
      pagesText.forEach((pt) => {
        const pageIdx = pt.num - 1;
        if (pageIdx >= 0 && pageIdx < originalPageCount) {
          const { score, matchedCategories } = scoreLegalText(pt.text);
          pageScores.push({ page: pt.num, score, categories: matchedCategories });
          if (!selectedIndicesSet.has(pageIdx)) {
            middleCandidateScores.push({ index: pageIdx, score, categories: matchedCategories });
          }
        }
      });
    }
    middleCandidateScores.sort((a, b) => b.score - a.score);
    const maxTargetPages = Math.min(18, originalPageCount);
    const slotsAvailable = maxTargetPages - selectedIndicesSet.size;
    if (middleCandidateScores.length > 0 && slotsAvailable > 0) {
      const topPicks = middleCandidateScores.slice(0, slotsAvailable);
      topPicks.forEach((pick) => selectedIndicesSet.add(pick.index));
    } else if (selectedIndicesSet.size < maxTargetPages) {
      for (let i = 3; i < Math.min(10, originalPageCount); i++) {
        selectedIndicesSet.add(i);
      }
      for (let i = Math.max(0, originalPageCount - 6); i < originalPageCount; i++) {
        selectedIndicesSet.add(i);
      }
    }
    const selectedIndices = Array.from(selectedIndicesSet).filter((idx) => idx >= 0 && idx < originalPageCount).sort((a, b) => a - b);
    const slimDoc = await import_pdf_lib.PDFDocument.create();
    const copiedPages = await slimDoc.copyPages(pdfDoc, selectedIndices);
    copiedPages.forEach((page) => slimDoc.addPage(page));
    const optimizedBytes = await slimDoc.save();
    const optimizedBuffer = Buffer.from(optimizedBytes);
    return {
      optimizedBase64: optimizedBuffer.toString("base64"),
      originalPageCount,
      processedPageCount: selectedIndices.length,
      pagesIncluded: selectedIndices.map((i) => i + 1),
      originalSizeBytes,
      optimizedSizeBytes: optimizedBuffer.length,
      mimeType: "application/pdf",
      extractedText,
      hasDigitalText: report.hasDigitalText,
      inspectionReport: report,
      pageScores,
      fileHash
    };
  } catch {
    return {
      optimizedBase64: buffer.toString("base64"),
      originalPageCount: report.pageCount || 1,
      processedPageCount: report.pageCount || 1,
      pagesIncluded: [1],
      originalSizeBytes,
      optimizedSizeBytes: originalSizeBytes,
      mimeType: "application/pdf",
      extractedText,
      hasDigitalText: report.hasDigitalText,
      inspectionReport: report,
      fileHash
    };
  }
}
function cleanExtractedTextForLLM(rawText) {
  if (!rawText) return "";
  const cleaned = rawText.replace(/[\r\v\f]/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length > 6e4) {
    const head = cleaned.slice(0, 45e3);
    const tail = cleaned.slice(-15e3);
    return `${head}

... [BAGIAN TENGAH DOKUMEN DISINGKAT OLEH FAST-TRACK OCR] ...

${tail}`;
  }
  return cleaned;
}
async function buildCheapOcrContents(rawInput, systemPrompt, options) {
  const isString = typeof rawInput === "string";
  const isPDF = isString ? rawInput.startsWith("JVBERi0") || rawInput.includes("application/pdf") || rawInput.startsWith("data:application/pdf") : true;
  if (isPDF) {
    const opt = await optimizePdfForCheapOcr(rawInput);
    const originalKb = Math.round(opt.originalSizeBytes / 1024);
    const optimizedKb = Math.round(opt.optimizedSizeBytes / 1024);
    const report = opt.inspectionReport;
    const fileHash2 = opt.fileHash || computeInputSha256(rawInput);
    if (opt.hasDigitalText && opt.extractedText && !options?.forceVision) {
      const cleanedText = cleanExtractedTextForLLM(opt.extractedText);
      const formattedContent = `${systemPrompt}

=== DOKUMEN DIGITAL (PDF-INSPECTOR FAST-TRACK / TEKS ASLI DOKUMEN) ===
${cleanedText}`;
      return {
        contents: [{ text: formattedContent }],
        ocrStats: {
          mode: "text",
          originalPages: opt.originalPageCount,
          processedPages: opt.processedPageCount,
          originalKb,
          optimizedKb,
          hasDigitalText: true,
          inspectionMs: report.inspectionTimeMs,
          classification: report.classification,
          fileHash: fileHash2
        }
      };
    }
    return {
      contents: [
        {
          inlineData: {
            data: opt.optimizedBase64,
            mimeType: "application/pdf"
          }
        },
        {
          text: systemPrompt
        }
      ],
      ocrStats: {
        mode: "vision",
        originalPages: opt.originalPageCount,
        processedPages: opt.processedPageCount,
        originalKb,
        optimizedKb,
        hasDigitalText: opt.hasDigitalText,
        inspectionMs: report.inspectionTimeMs,
        classification: report.classification,
        fileHash: fileHash2
      }
    };
  }
  const isPNG = isString && (rawInput.includes("image/png") || rawInput.startsWith("data:image/png"));
  const mimeType = isPNG ? "image/png" : "image/jpeg";
  const cleanData = isString ? rawInput.split(",")[1] || rawInput : Buffer.from(rawInput).toString("base64");
  const buffer = Buffer.from(cleanData, "base64");
  const kbSize = Math.round(cleanData.length * 0.75 / 1024);
  const fileHash = computeBufferSha256(buffer);
  return {
    contents: [
      {
        inlineData: {
          data: cleanData,
          mimeType
        }
      },
      {
        text: systemPrompt
      }
    ],
    ocrStats: {
      mode: "vision",
      originalPages: 1,
      processedPages: 1,
      originalKb: kbSize,
      optimizedKb: kbSize,
      hasDigitalText: false,
      inspectionMs: 0,
      classification: "image",
      fileHash
    }
  };
}

// server.ts
var __defProp2 = Object.defineProperty;
var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
dotenv.config();
var app = (0, import_express3.default)();
var PORT = 3e3;
var upload = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});
app.use(import_express3.default.json({ limit: "25mb" }));
app.use(import_express3.default.urlencoded({ extended: true, limit: "25mb" }));
app.all(["/api/auth", "/api/auth/*"], (req, res, next) => {
  if (req.path.startsWith("/api/auth/google")) {
    return next();
  }
  return (0, import_node.toNodeHandler)(auth)(req, res);
});
var rbacAuthMiddleware = (req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path === "/api/auth" || req.path.startsWith("/api/auth/") || req.path === "/api/health" || req.path === "/api/exchange-rates" || req.path === "/api/exchange-rate-historical" || req.path.endsWith("/parse") || req.path === "/api/chat" || req.path === "/api/partners/generate-dd-notes" || req.path.endsWith("/redline-analysis") || req.path === "/api/google/test-connection" || req.path === "/api/export-csv" || req.path === "/api/templates" || req.path.startsWith("/api/templates/") || req.path === "/api/translate-template" || req.path === "/api/audit-logs") {
    return next();
  }
  let userEmail = (req.headers["x-user-email"] || req.headers["x-google-user-email"] || req.query?.userEmail || "").toString().toLowerCase().trim();
  let detectedRole = null;
  let isBanned = false;
  const authHeader = req.headers["authorization"] || req.headers["x-session-token"];
  if (authHeader && sqliteDb) {
    try {
      const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : String(authHeader).trim();
      const sessionRow = sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(token);
      if (sessionRow?.userId) {
        const userRow = sqliteDb.prepare("SELECT email, role, banned FROM user WHERE id = ?").get(sessionRow.userId);
        if (userRow) {
          if (!userEmail && userRow.email) {
            userEmail = userRow.email.toLowerCase().trim();
          }
          if (userRow.banned === 1) {
            isBanned = true;
          }
          if (userRow.role) {
            detectedRole = userRow.role;
          }
        }
      }
    } catch {
    }
  }
  if (userEmail && !detectedRole && sqliteDb) {
    try {
      const userRow = sqliteDb.prepare("SELECT role, banned FROM user WHERE LOWER(email) = LOWER(?)").get(userEmail);
      if (userRow) {
        if (userRow.banned === 1) {
          isBanned = true;
        }
        if (userRow.role) {
          detectedRole = userRow.role;
        }
      }
    } catch {
    }
  }
  if (userEmail) {
    const allowed = (db.allowedUsers || []).find(
      (u) => (u.email || "").toLowerCase() === userEmail
    );
    if (allowed) {
      if (allowed.status === "Inactive" || allowed.status === "Banned") {
        isBanned = true;
      }
      if (!detectedRole && allowed.role) {
        detectedRole = allowed.role;
      }
    }
  }
  if (isBanned) {
    return res.status(403).json({
      error: "Forbidden: Account Banned",
      message: "Akun Anda telah dinonaktifkan/banned oleh Administrator. Silakan hubungi tim IT/Admin.",
      email: userEmail
    });
  }
  {
    let strictSessionOk = false;
    if (authHeader && sqliteDb) {
      try {
        const t = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : String(authHeader).trim();
        strictSessionOk = !!sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(t);
      } catch {
        strictSessionOk = false;
      }
    }
    if (!strictSessionOk) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
  }
  const rawRole = (detectedRole || "").toString().toLowerCase().trim();
  let role = "Viewer";
  if (/admin|superuser|owner|super admin/i.test(rawRole)) {
    role = "Admin";
  } else if (/editor|manager|legal|finance/i.test(rawRole)) {
    role = "Editor";
  } else if (/viewer|guest|readonly|read/i.test(rawRole)) {
    role = "Viewer";
  } else {
    role = "Viewer";
  }
  req.rbacRole = role;
  const method = req.method.toUpperCase();
  if (role === "Viewer" && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return res.status(403).json({
      error: "Forbidden: Viewer role is view-only.",
      message: "Peran Viewer hanya memiliki izin baca (view-only). Tindakan perubahan data ditolak.",
      role: "Viewer",
      attemptedMethod: method
    });
  }
  next();
};
app.use(rbacAuthMiddleware);
var resolveRbacActor = async (req) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user?.id) {
      const u = sqliteDb.prepare("SELECT role FROM user WHERE id = ?").get(session.user.id);
      const m = sqliteDb.prepare("SELECT organizationId, role FROM member WHERE userId = ? LIMIT 1").get(session.user.id);
      const raw = m?.role === "owner" ? "superuser" : u?.role || m?.role || "viewer";
      return { id: session.user.id, role: String(raw).toLowerCase(), tenantId: m?.organizationId ?? null, departmentId: null };
    }
  } catch {
  }
  try {
    const authHeader = req.headers["authorization"] || req.headers["x-session-token"];
    if (authHeader && sqliteDb) {
      const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : String(authHeader).trim();
      const s = sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(token);
      if (s?.userId) {
        const u = sqliteDb.prepare("SELECT role FROM user WHERE id = ?").get(s.userId);
        return { id: s.userId, role: String(u?.role || "viewer").toLowerCase(), tenantId: null, departmentId: null };
      }
    }
  } catch {
  }
  return null;
};
var attachRbacActor = async (req, _res, next) => {
  req.actor = await resolveRbacActor(req);
  next();
};
app.use(attachRbacActor);
app.use("/api/rbac", createRbacRouter({ resolveActor: (req) => req.actor ?? null }));
app.use("/api/auth-console/users", requirePermission("admin.user.manage", "tenant"));
app.use("/api/auth-console/sessions", requirePermission("admin.access", "tenant"));
app.use("/api/activity-logs", requirePermission("admin.access", "tenant"));
app.post("/api/tenants/switch", requirePermission("workspace.switch", "global"));
app.use("/api/tenants/switch", requirePermission("workspace.switch", "global"));
var requireTenantRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({
        headers: req.headers
      });
      if (!session) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const activeOrgId = req.headers["x-organization-id"] || req.headers["x-tenant-id"] || req.query.organizationId;
      if (!activeOrgId) {
        return res.status(400).json({ message: "Organization ID header is missing" });
      }
      try {
        const member = await auth.api.getActiveMember({
          headers: req.headers,
          query: { organizationId: activeOrgId }
        });
        if (!member || requiredRole === "admin" && member.role !== "admin" && member.role !== "owner") {
          return res.status(403).json({ message: "Forbidden: Insufficient permissions for this tenant" });
        }
      } catch {
        const row = sqliteDb.prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?").get(activeOrgId, session.user.id);
        if (!row || requiredRole === "admin" && row.role !== "admin" && row.role !== "owner") {
          return res.status(403).json({ message: "Forbidden: Insufficient permissions for this tenant" });
        }
      }
      req.user = session.user;
      next();
    } catch (err) {
      return res.status(500).json({ message: "Internal server error", error: err.message });
    }
  };
};
app.get("/api/tenant-data", requireTenantRole("admin"), (req, res) => {
  res.json({ message: "Rahasia Tenant: Hanya untuk Admin/Owner organisasi ini." });
});
async function getOrgFolderId(tenantInput, token) {
  const masterRootId = sanitizeParentFolderId(db.googleConfig?.driveFolderId);
  if (!masterRootId) {
    return { id: "" };
  }
  let tenant;
  if (typeof tenantInput === "string") {
    tenant = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === tenantInput);
  } else {
    tenant = tenantInput;
  }
  if (!tenant) {
    const activeId = db.activeTenantId || "org-adapundi";
    tenant = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === activeId) || DEFAULT_TENANTS[0];
  }
  if (!tenant) {
    return { id: masterRootId };
  }
  if (tenant.driveFolderId && !tenant.driveFolderId.startsWith("Folder_")) {
    return { id: tenant.driveFolderId, webViewLink: tenant.driveFolderLink };
  }
  const activeToken = await resolveActiveGoogleToken(token);
  const orgFolderName = tenant.name || tenant.brandName || "Organisasi";
  try {
    const orgFolder = await getOrCreateDriveFolder(
      orgFolderName,
      masterRootId,
      activeToken
    );
    if (orgFolder.id) {
      tenant.driveFolderId = orgFolder.id;
      tenant.driveFolderLink = orgFolder.webViewLink;
      saveDb();
      return orgFolder;
    }
  } catch (err) {
    console.warn(
      `[Drive Hierarchical] Error creating org folder '${orgFolderName}':`,
      err?.message || err
    );
  }
  return {
    id: masterRootId,
    webViewLink: `https://drive.google.com/drive/folders/${masterRootId}`
  };
}
async function autoEnsureTenantGoogleResources(token, forceNew = false) {
  const masterRootId = sanitizeParentFolderId(db.googleConfig?.driveFolderId);
  if (!masterRootId) return { success: false, updatedCount: 0 };
  const activeToken = await resolveActiveGoogleToken(token);
  if (!activeToken && !hasServiceAccountCredentials())
    return { success: false, updatedCount: 0 };
  let updatedCount = 0;
  if (!db.tenants || !Array.isArray(db.tenants) || db.tenants.length === 0) {
    db.tenants = [...DEFAULT_TENANTS];
  }
  for (const tenant of db.tenants) {
    let tenantChanged = false;
    const needFolder = !tenant.driveFolderId || tenant.driveFolderId === masterRootId || tenant.driveFolderId.startsWith("Folder_") || tenant.driveFolderId === "-" || forceNew;
    if (needFolder) {
      try {
        const orgFolderName = tenant.name || tenant.brandName || "Organisasi";
        let orgFolder = null;
        if (forceNew) {
          try {
            orgFolder = await createNewDriveFolderInParent(
              orgFolderName,
              masterRootId,
              activeToken
            );
          } catch (createErr) {
            console.warn(
              `[AutoProvision] createNewDriveFolderInParent failed, falling back to getOrCreateDriveFolder:`,
              createErr?.message
            );
          }
        }
        if (!orgFolder || !orgFolder.id) {
          orgFolder = await getOrCreateDriveFolder(
            orgFolderName,
            masterRootId,
            activeToken
          );
        }
        if (orgFolder && orgFolder.id && orgFolder.id !== masterRootId) {
          tenant.driveFolderId = orgFolder.id;
          tenant.driveFolderLink = orgFolder.webViewLink || `https://drive.google.com/drive/folders/${orgFolder.id}`;
          tenantChanged = true;
          console.log(
            `[AutoProvision] Created/Resolved org folder '${orgFolderName}' (${orgFolder.id}) inside Master Root (${masterRootId})`
          );
        }
      } catch (err) {
        console.warn(
          `[AutoProvision] Failed to create folder for tenant '${tenant.name}':`,
          err?.message || err
        );
      }
    }
    if (tenantChanged) {
      tenant.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      updatedCount++;
      try {
        const orgsDb = new import_better_sqlite32.default(import_path4.default.join(process.cwd(), "auth.db"));
        if (orgsDb) {
          const row = orgsDb.prepare("SELECT * FROM organization WHERE id = ? OR slug = ?").get(tenant.id, tenant.domainSlug || tenant.id);
          if (row) {
            let meta = {};
            try {
              if (row.metadata)
                meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
            } catch {
            }
            if (tenant.driveFolderId) meta.driveFolderId = tenant.driveFolderId;
            orgsDb.prepare(
              "UPDATE organization SET metadata = ? WHERE id = ? OR slug = ?"
            ).run(
              JSON.stringify(meta),
              tenant.id,
              tenant.domainSlug || tenant.id
            );
          }
        }
      } catch (e) {
        console.warn(
          `Could not sync sqlite organization metadata for ${tenant.name}:`,
          e?.message
        );
      }
    }
  }
  if (updatedCount > 0) {
    saveDb();
  }
  return { success: true, updatedCount };
}
async function getPartnerFolderId(partner, token, orgId) {
  if (!partner) {
    const orgFolder2 = await getOrgFolderId(orgId, token);
    return orgFolder2.id || db.googleConfig.driveFolderId;
  }
  const targetOrgId = orgId || partner.organizationId || db.activeTenantId || "org-adapundi";
  const orgFolder = await getOrgFolderId(targetOrgId, token);
  const parentFolderId = orgFolder.id || db.googleConfig.driveFolderId;
  const extractedId = extractFolderIdFromLink(partner.link_folder_dd);
  if (extractedId) {
    return extractedId;
  }
  const activeToken = await resolveActiveGoogleToken(token);
  if (activeToken || hasServiceAccountCredentials()) {
    try {
      const folderRes = await getOrCreateDriveFolder(
        partner.nama_partner,
        parentFolderId,
        activeToken
      );
      partner.link_folder_dd = folderRes.webViewLink;
      if (!partner.organizationId) {
        partner.organizationId = targetOrgId;
      }
      saveDb();
      return folderRes.id;
    } catch (err) {
      console.warn(
        `[Drive Hierarchical] Failed creating partner folder for '${partner.nama_partner}':`,
        err
      );
    }
  }
  return parentFolderId;
}
async function getPartnerCategoryFolderId(partner, category, token, orgId) {
  const vendorFolderId = await getPartnerFolderId(partner, token, orgId);
  if (!vendorFolderId) return db.googleConfig.driveFolderId;
  const activeToken = await resolveActiveGoogleToken(token);
  if (!activeToken && !hasServiceAccountCredentials()) return vendorFolderId;
  try {
    const categoryFolder = await getOrCreateDriveFolder(
      category,
      vendorFolderId,
      activeToken
    );
    return categoryFolder.id;
  } catch (err) {
    console.error(`Error getting/creating category folder '${category}':`, err);
    return vendorFolderId;
  }
}
var uploadsDir = import_path4.default.join(process.cwd(), "uploads");
if (!import_fs4.default.existsSync(uploadsDir)) {
  import_fs4.default.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", import_express3.default.static(uploadsDir));
function saveLocalFile(partnerName, category, safeFileName, base64Data, orgName) {
  try {
    const cleanOrg = (orgName || "PT Info Tekno Siaga").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const cleanVendor = (partnerName || "Vendor").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const subDir = import_path4.default.join(uploadsDir, cleanOrg, cleanVendor, category);
    if (!import_fs4.default.existsSync(subDir)) {
      import_fs4.default.mkdirSync(subDir, { recursive: true });
    }
    const filePath = import_path4.default.join(subDir, safeFileName);
    const cleanContent = base64Data.includes("base64,") ? base64Data.split("base64,")[1] : base64Data;
    import_fs4.default.writeFileSync(filePath, Buffer.from(cleanContent, "base64"));
    return `/uploads/${encodeURIComponent(cleanOrg)}/${encodeURIComponent(cleanVendor)}/${encodeURIComponent(category)}/${safeFileName}`;
  } catch (err) {
    console.error("Error saving local file in hierarchical subfolder:", err);
    const rootPath = import_path4.default.join(uploadsDir, safeFileName);
    const cleanContent = base64Data.includes("base64,") ? base64Data.split("base64,")[1] : base64Data;
    import_fs4.default.writeFileSync(rootPath, Buffer.from(cleanContent, "base64"));
    return `/uploads/${safeFileName}`;
  }
}
function getMimeType(fileName) {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "csv") return "text/csv";
  return "application/pdf";
}
async function migrateLocalFilesToGoogleDrive(token) {
  const activeToken = await resolveActiveGoogleToken(token);
  if (!activeToken) return { migratedCount: 0 };
  let migratedCount = 0;
  const getDiskPath = __name((url) => {
    if (!url || typeof url !== "string" || !url.includes("/uploads/"))
      return null;
    try {
      const rawRel = url.substring(
        url.indexOf("/uploads/") + "/uploads/".length
      );
      const decodedRel = decodeURIComponent(rawRel);
      const fullPath = import_path4.default.join(uploadsDir, decodedRel);
      if (import_fs4.default.existsSync(fullPath)) return fullPath;
    } catch (e) {
      console.error("Error resolving disk path for upload URL:", url, e);
    }
    return null;
  }, "getDiskPath");
  const getMimeType2 = __name((fileName) => {
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "docx")
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "xlsx")
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return "application/pdf";
  }, "getMimeType");
  for (const c of db.contracts || []) {
    const diskPath = getDiskPath(c.link_file_kontrak);
    if (diskPath) {
      try {
        const partner = db.partners.find((p) => p.partner_id === c.partner_id);
        const fileName = c.fileName || import_path4.default.basename(diskPath);
        const base64 = import_fs4.default.readFileSync(diskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Contract",
          activeToken
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          c.link_file_kontrak = driveUrl;
          try {
            import_fs4.default.unlinkSync(diskPath);
          } catch (_) {
          }
          migratedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to migrate contract file ${c.contract_id} to Drive:`,
          err
        );
      }
    }
  }
  for (const io of db.ios || []) {
    const partner = db.partners.find((p) => p.partner_id === io.partner_id);
    const ioDiskPath = getDiskPath(io.link_file_io);
    if (ioDiskPath) {
      try {
        const fileName = io.fileName || import_path4.default.basename(ioDiskPath);
        const base64 = import_fs4.default.readFileSync(ioDiskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder IO",
          activeToken
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          io.link_file_io = driveUrl;
          try {
            import_fs4.default.unlinkSync(ioDiskPath);
          } catch (_) {
          }
          migratedCount++;
        }
      } catch (err) {
        console.error(`Failed to migrate IO file ${io.io_id} to Drive:`, err);
      }
    }
  }
  for (const partner of db.partners || []) {
    for (const doc of partner.daftar_dokumen_dd || []) {
      const diskPath = getDiskPath(doc.linkDrive);
      if (diskPath) {
        try {
          const fileName = import_path4.default.basename(diskPath);
          const base64 = import_fs4.default.readFileSync(diskPath).toString("base64");
          const catFolderId = await getPartnerCategoryFolderId(
            partner,
            "Folder DD",
            activeToken
          );
          const driveUrl = await uploadFileToDrive(
            fileName,
            base64,
            getMimeType2(fileName),
            catFolderId,
            activeToken
          );
          if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
            doc.linkDrive = driveUrl;
            try {
              import_fs4.default.unlinkSync(diskPath);
            } catch (_) {
            }
            migratedCount++;
          }
        } catch (err) {
          console.error(
            `Failed to migrate DD doc ${doc.nama} for partner ${partner.nama_partner} to Drive:`,
            err
          );
        }
      }
    }
  }
  for (const sp of db.spendings || []) {
    const partner = db.partners.find(
      (p) => p.nama_partner?.toLowerCase() === sp.vendor_name?.toLowerCase()
    );
    const invDiskPath = getDiskPath(sp.invoice_file_url);
    if (invDiskPath) {
      try {
        const fileName = sp.invoice_file_name || import_path4.default.basename(invDiskPath);
        const base64 = import_fs4.default.readFileSync(invDiskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          activeToken
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          sp.invoice_file_url = driveUrl;
          try {
            import_fs4.default.unlinkSync(invDiskPath);
          } catch (_) {
          }
          migratedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to migrate spending invoice file ${sp.id} to Drive:`,
          err
        );
      }
    }
    const billDiskPath = getDiskPath(sp.billing_file_url);
    if (billDiskPath) {
      try {
        const fileName = sp.billing_file_name || import_path4.default.basename(billDiskPath);
        const base64 = import_fs4.default.readFileSync(billDiskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          activeToken
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          sp.billing_file_url = driveUrl;
          try {
            import_fs4.default.unlinkSync(billDiskPath);
          } catch (_) {
          }
          migratedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to migrate spending billing file ${sp.id} to Drive:`,
          err
        );
      }
    }
  }
  if (migratedCount > 0) {
    saveDb();
    console.log(
      `[Drive Migration] Successfully migrated ${migratedCount} temporary local files to Google Drive.`
    );
  }
  return { migratedCount };
}
function isMatchingOrg(entityOrgId, targetTenantId) {
  if (!targetTenantId) return true;
  if (entityOrgId === targetTenantId) return true;
  const defaultTenant = (db.tenants || []).find((t) => t.isDefault) || db.tenants?.[0];
  const isDefaultTarget = targetTenantId === "org-adapundi" || defaultTenant && targetTenantId === defaultTenant.id;
  const isDefaultEntity = !entityOrgId || entityOrgId === "org-adapundi" || defaultTenant && entityOrgId === defaultTenant.id;
  return Boolean(isDefaultTarget && isDefaultEntity);
}
async function ensureAllPartnersFolders(token, targetTenantId) {
  let localFoldersCreated = 0;
  let driveFoldersCreated = 0;
  const activeToken = await resolveActiveGoogleToken(token);
  const partnersToProcess = targetTenantId ? (db.partners || []).filter(
    (p) => isMatchingOrg(p.organizationId, targetTenantId)
  ) : db.partners || [];
  for (const partner of partnersToProcess) {
    if (!partner.nama_partner) continue;
    const orgId = partner.organizationId || targetTenantId || db.activeTenantId || "org-adapundi";
    const tenant = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === orgId) || DEFAULT_TENANTS[0];
    const cleanOrg = (tenant?.name || "PT Info Tekno Siaga").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const cleanVendor = partner.nama_partner.replace(/[/\\?%*:|"<>]/g, "_").trim();
    const categories = [
      "Folder Contract",
      "Folder Invoice & Billing",
      "Folder IO",
      "Folder DD"
    ];
    for (const cat of categories) {
      const dirPath = import_path4.default.join(uploadsDir, cleanOrg, cleanVendor, cat);
      if (!import_fs4.default.existsSync(dirPath)) {
        import_fs4.default.mkdirSync(dirPath, { recursive: true });
        localFoldersCreated++;
      }
    }
    if (activeToken || hasServiceAccountCredentials()) {
      try {
        const vendorFolderId = await getPartnerFolderId(
          partner,
          activeToken,
          orgId
        );
        if (vendorFolderId) {
          await getOrCreateDriveFolder(
            "Folder Contract",
            vendorFolderId,
            activeToken
          );
          await getOrCreateDriveFolder(
            "Folder Invoice & Billing",
            vendorFolderId,
            activeToken
          );
          await getOrCreateDriveFolder(
            "Folder IO",
            vendorFolderId,
            activeToken
          );
          await getOrCreateDriveFolder(
            "Folder DD",
            vendorFolderId,
            activeToken
          );
          driveFoldersCreated++;
        }
      } catch (err) {
        console.error(
          `Error provisioning Drive folders for partner ${partner.nama_partner} (${cleanOrg}):`,
          err?.message || err
        );
        if (err.message && err.message.includes("Service Account tidak memiliki akses")) {
          throw err;
        }
      }
    }
  }
  if (activeToken) {
    await migrateLocalFilesToGoogleDrive(activeToken);
  }
  return { localFoldersCreated, driveFoldersCreated };
}
var dataFilePath = import_path4.default.join(process.cwd(), "data_store.json");
var DEFAULT_BRANDING = {
  appName: "LMS - Legal Management System",
  logoUrl: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=250&auto=format&fit=crop&q=80",
  primaryColor: "#06C755",
  footerText: "\xA9 2026 PT Info Tekno Siaga (Adapundi). All rights reserved.",
  loginHeadline: "Portal Manajemen Kontrak, Vendor & Insertion Order"
};
var DEFAULT_TENANTS = [
  {
    id: "org_1789542306289_b3a4f3",
    name: "Adapundi",
    legalEntity: "PT",
    brandName: "Adapundi",
    tagline: "Legal & Commercial Contract Management",
    logoUrl: "/favicon.png",
    primaryColor: "#06C755",
    currency: "IDR",
    domainSlug: "adapundi",
    isDefault: true,
    driveFolderId: "1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY",
    driveFolderLink: "https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY"
  }
];
var db = {
  allowedUsers: INITIAL_ALLOWED_USERS,
  partners: INITIAL_PARTNERS,
  contracts: INITIAL_CONTRACTS,
  ios: INITIAL_IOS,
  notifications: INITIAL_NOTIFICATIONS,
  activityLogs: INITIAL_ACTIVITY_LOGS,
  evaluations: INITIAL_EVALUATIONS || [],
  spendings: INITIAL_SPENDINGS || [],
  tenants: DEFAULT_TENANTS,
  departments: [],
  activeTenantId: "org_1789542306289_b3a4f3",
  branding: DEFAULT_BRANDING,
  googleConfig: {
    spreadsheetId: "178lap6p6jwuVlbrVp7jmrgvgpAPLYRgpPDkJvgc_EgM",
    driveFolderId: "1xiFIvgWdDtYEzL7IoqVD9d-NaS7XcfYp",
    isConnected: true,
    lastSyncTime: (/* @__PURE__ */ new Date()).toISOString(),
    autoSync: true,
    isLocked: true,
    notificationEmails: "legal.head@perusahaan.co.id, finance.team@perusahaan.co.id",
    legalNotificationEmail: "legal.head@perusahaan.co.id",
    financeNotificationEmail: "finance.team@perusahaan.co.id",
    aiModel: "gemini-3.8-flash",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    refreshToken: ""
  }
};
setInvalidTokenCallback((badToken) => {
  if (db.googleConfig && db.googleConfig.accessToken === badToken) {
    console.warn(
      "[Server] Membersihkan Google accessToken yang kedaluwarsa dari database."
    );
    db.googleConfig.accessToken = "";
    saveDb();
  }
});
setConsoleDbReference(db, saveDb);
ensureUserAccountsExist();
async function getFreshGoogleAccessToken() {
  const currentToken = db.googleConfig?.accessToken;
  const refreshToken = db.googleConfig?.refreshToken;
  if (!refreshToken) {
    return currentToken || null;
  }
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const oauth2Client = new import_google_auth_library.OAuth2Client(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: currentToken
    });
    let freshToken = null;
    try {
      const refreshResult = await oauth2Client.refreshAccessToken();
      freshToken = refreshResult.credentials.access_token || null;
    } catch (directRefreshErr) {
      const tokenResponse = await oauth2Client.getAccessToken();
      freshToken = tokenResponse.token || currentToken || null;
    }
    if (freshToken && freshToken !== currentToken) {
      db.googleConfig.accessToken = freshToken;
      db.googleConfig.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
      saveDb();
      console.log(
        "[Google Auth] Access Token berhasil di-refresh otomatis menggunakan Refresh Token."
      );
    }
    return freshToken || currentToken || null;
  } catch (err) {
    console.error(
      "[Google Auth] Gagal me-refresh Google Access Token:",
      err.message || err
    );
    if (err?.message?.includes("invalid_grant")) {
      console.warn(
        "[Google Auth] Refresh token tidak lagi valid (invalid_grant). Menghapus kredensial."
      );
      db.googleConfig.refreshToken = "";
      db.googleConfig.accessToken = "";
      saveDb();
      return null;
    }
    return currentToken || null;
  }
}
setRefreshTokenGetter(async () => {
  return await getFreshGoogleAccessToken();
});
async function resolveActiveGoogleToken(reqToken) {
  try {
    const freshToken = await getFreshGoogleAccessToken();
    if (freshToken && freshToken.trim() !== "") {
      return freshToken.trim();
    }
  } catch (_) {
  }
  if (reqToken && typeof reqToken === "string" && reqToken.trim() !== "") {
    return reqToken.trim();
  }
  return db.googleConfig?.accessToken || "";
}
function getEffectiveGeminiApiKey() {
  return (db.googleConfig?.geminiApiKey || process.env.GEMINI_API_KEY || "").trim();
}
function getGenAIClient(apiKey) {
  const effectiveKey = (apiKey || getEffectiveGeminiApiKey()).trim();
  if (!effectiveKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser."
    );
  }
  return new import_genai.GoogleGenAI({
    apiKey: effectiveKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
  });
}
function getValidAiModel(requestedModel) {
  const allowed = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash"
  ];
  if (requestedModel === "gemini-2.0-flash" || requestedModel === "gemini-1.5-flash") return "gemini-3.8-flash";
  if (requestedModel === "gemini-3.5-flash-lite") return "gemini-3.5-flash";
  if (requestedModel && allowed.includes(requestedModel)) {
    return requestedModel;
  }
  if (db.googleConfig?.aiModel && allowed.includes(db.googleConfig.aiModel)) {
    return db.googleConfig.aiModel;
  }
  return "gemini-3.8-flash";
}
async function generateContentWithRetryAndFallback(params) {
  const apiKey = getEffectiveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser."
    );
  }
  const aiClient = getGenAIClient(apiKey);
  const primaryModel = getValidAiModel(params.model);
  const candidateFallbacks = [
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash"
  ];
  const fallbackModels = candidateFallbacks.filter((m) => m !== primaryModel);
  const modelQueue = [primaryModel, ...fallbackModels];
  let lastError = null;
  const PER_ATTEMPT_TIMEOUT_MS = 35e3;
  for (const model of modelQueue) {
    try {
      console.log(`[Gemini API] Processing request with model=${model}...`);
      const response = await Promise.race([
        aiClient.models.generateContent({ ...params, model }),
        new Promise(
          (_, reject) => setTimeout(
            () => reject(
              new Error(
                `Timeout: model ${model} took longer than ${PER_ATTEMPT_TIMEOUT_MS / 1e3}s`
              )
            ),
            PER_ATTEMPT_TIMEOUT_MS
          )
        )
      ]);
      console.log(`[Gemini API] Success with model=${model}`);
      return response;
    } catch (err) {
      lastError = err;
      const errMsg = (err?.message || err?.toString() || "").toLowerCase();
      console.warn(`[Gemini API] Model ${model} encountered an issue (${errMsg.slice(0, 120)}), trying fallback...`);
    }
  }
  const lastErrMsg = (lastError?.message || "").toLowerCase();
  if (lastErrMsg.includes("resource_exhausted") || lastErrMsg.includes("quota") || lastErrMsg.includes("exceeded your current quota") || lastErrMsg.includes("429")) {
    throw new Error(
      "Batas kuota Gemini API Key Anda telah terlampaui (Quota Exceeded / Rate Limit). Silakan periksa akun Google AI Studio atau perbarui API Key di menu Settings > AI Model & Parser."
    );
  }
  if (lastErrMsg.includes("api_key_invalid") || lastErrMsg.includes("invalid api key")) {
    throw new Error(
      "Gemini API Key tidak valid. Silakan periksa kembali API Key Anda di menu Settings > AI Model & Parser."
    );
  }
  throw lastError || new Error(
    "Google AI Gemini model sedang sibuk atau tidak merespons. Silakan coba lagi beberapa saat lagi."
  );
}
__name(
  generateContentWithRetryAndFallback,
  "generateContentWithRetryAndFallback"
);
function normalizeParsedDate(str) {
  if (!str || typeof str !== "string") return "";
  const trimmed = str.trim();
  if (trimmed === "-" || trimmed === "N/A" || trimmed === "n/a" || trimmed === "")
    return "";
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const ymd = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, "0");
    const day = ymd[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const monthsMap = {
    januari: "01",
    january: "01",
    jan: "01",
    februari: "02",
    february: "02",
    feb: "02",
    maret: "03",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    mei: "05",
    may: "05",
    juni: "06",
    june: "06",
    jun: "06",
    juli: "07",
    july: "07",
    jul: "07",
    agustus: "08",
    august: "08",
    agu: "08",
    aug: "08",
    september: "09",
    sep: "09",
    sept: "09",
    oktober: "10",
    october: "10",
    okt: "10",
    oct: "10",
    november: "11",
    nov: "11",
    desember: "12",
    december: "12",
    des: "12",
    dec: "12"
  };
  const cleanedStr = trimmed.replace(/(st|nd|rd|th),?/gi, "").replace(/,/g, " ");
  const words = cleanedStr.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    const day1 = parseInt(words[0], 10);
    const mKey1 = words[1].toLowerCase();
    const year1 = parseInt(words[2], 10);
    if (!isNaN(day1) && monthsMap[mKey1] && !isNaN(year1) && year1 > 1900) {
      return `${year1}-${monthsMap[mKey1]}-${String(day1).padStart(2, "0")}`;
    }
    const mKey2 = words[0].toLowerCase();
    const day2 = parseInt(words[1], 10);
    const year2 = parseInt(words[2], 10);
    if (monthsMap[mKey2] && !isNaN(day2) && !isNaN(year2) && year2 > 1900) {
      return `${year2}-${monthsMap[mKey2]}-${String(day2).padStart(2, "0")}`;
    }
  }
  const timestamp = Date.parse(trimmed);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}
function computeContractEndDateFromDuration(startDateYMD, durationOrClause, autoRenewNextYear) {
  if (!startDateYMD || !durationOrClause) return null;
  const parts = startDateYMD.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2]))
    return null;
  const [year, month, day] = parts;
  const text = durationOrClause.toLowerCase();
  if (/sampai pengakhiran|until terminated|salah satu pihak mengakhiri|terus menerus|tanpa batas|unlimited|perpetual|tacit renewal|selamanya/i.test(
    text
  )) {
    const prevDay = new Date(year, month - 1, day);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevMonth = String(prevDay.getMonth() + 1).padStart(2, "0");
    const prevDate = String(prevDay.getDate()).padStart(2, "0");
    return { endDate: `9999-${prevMonth}-${prevDate}`, isAutoRenewal: true };
  }
  let yearsToAdd = 0;
  let monthsToAdd = 0;
  let daysToAdd = 0;
  const yearMatch = text.match(/(\d+)\s*(tahun|thn|year|yr|years)/i);
  if (yearMatch) {
    yearsToAdd = parseInt(yearMatch[1], 10);
  }
  const monthMatch = text.match(/(\d+)\s*(bulan|bln|month|months|mo)/i);
  if (monthMatch) {
    monthsToAdd = parseInt(monthMatch[1], 10);
  }
  const dayMatch = text.match(/(\d+)\s*(hari|day|days)/i);
  if (dayMatch && !monthMatch && !yearMatch) {
    daysToAdd = parseInt(dayMatch[1], 10);
  }
  if (yearsToAdd === 0 && monthsToAdd === 0 && daysToAdd === 0) {
    if (/satu\s*tahun|1\s*\(satu\)\s*tahun|one\s*year|1\s*\(one\)\s*year|setahun/i.test(
      text
    )) {
      yearsToAdd = 1;
    } else if (/dua\s*tahun|2\s*\(dua\)\s*tahun|two\s*years|2\s*\(two\)\s*years/i.test(
      text
    )) {
      yearsToAdd = 2;
    } else if (/tiga\s*tahun|3\s*\(tiga\)\s*tahun|three\s*years/i.test(text)) {
      yearsToAdd = 3;
    } else if (/lima\s*tahun|5\s*\(lima\)\s*tahun|five\s*years/i.test(text)) {
      yearsToAdd = 5;
    } else if (/enam\s*bulan|6\s*\(enam\)\s*bulan|six\s*months/i.test(text)) {
      monthsToAdd = 6;
    } else if (/tiga\s*bulan|3\s*\(tiga\)\s*bulan|three\s*months/i.test(text)) {
      monthsToAdd = 3;
    } else if (/satu\s*bulan|1\s*\(satu\)\s*bulan|one\s*month|sebulan/i.test(text)) {
      monthsToAdd = 1;
    } else if (/dua\s*belas\s*bulan|12\s*\(dua\s*belas\)\s*bulan|twelve\s*months/i.test(
      text
    )) {
      yearsToAdd = 1;
    } else if (/dua\s*puluh\s*empat\s*bulan|24\s*bulan/i.test(text)) {
      yearsToAdd = 2;
    }
  }
  const hasAutoRenewalClause = autoRenewNextYear || /perpanjangan otomatis|auto[\s\-]renewal|automatically renew|diperpanjang otomatis/i.test(
    text
  );
  if (hasAutoRenewalClause && /1\s*tahun berikutnya|satu tahun berikutnya|another 1 year|one additional year/i.test(
    text
  )) {
    yearsToAdd += 1;
  }
  if (yearsToAdd === 0 && monthsToAdd === 0 && daysToAdd === 0) return null;
  const targetDate = new Date(
    year + yearsToAdd,
    month - 1 + monthsToAdd,
    day + daysToAdd
  );
  targetDate.setDate(targetDate.getDate() - 1);
  const resYear = targetDate.getFullYear();
  const resMonth = String(targetDate.getMonth() + 1).padStart(2, "0");
  const resDay = String(targetDate.getDate()).padStart(2, "0");
  return {
    endDate: `${resYear}-${resMonth}-${resDay}`,
    isAutoRenewal: hasAutoRenewalClause
  };
}
__name(
  computeContractEndDateFromDuration,
  "computeContractEndDateFromDuration"
);
var STANDARD_DD_DOCUMENTS = [
  { nama: "NDA", wajib: true, status: "Belum" },
  { nama: "COR", wajib: false, status: "Belum" },
  { nama: "DGT", wajib: false, status: "Belum" },
  { nama: "Termination notice", wajib: false, status: "Belum" },
  { nama: "Vendor assessment form", wajib: false, status: "Belum" },
  { nama: "Placement Documentation", wajib: false, status: "Belum" },
  { nama: "NIB/SIUP", wajib: false, status: "Belum" },
  { nama: "Business license", wajib: false, status: "Belum" },
  { nama: "NPWP", wajib: false, status: "Belum" },
  { nama: "Akta Pendirian", wajib: false, status: "Belum" }
];
function normalizePartnerDDDocs(docs) {
  const existingDocs = (docs || []).filter(
    (d) => !d.nama.toLowerCase().includes("invoice") && !d.nama.toLowerCase().includes("billing")
  );
  return STANDARD_DD_DOCUMENTS.map((def2) => {
    const isNDA = def2.nama.toLowerCase() === "nda";
    const matched = existingDocs.find(
      (d) => d.nama.toLowerCase() === def2.nama.toLowerCase() || def2.nama === "COR" && d.nama.includes("COR") || def2.nama === "DGT" && d.nama.includes("DGT") || def2.nama === "NIB/SIUP" && (d.nama.includes("NIB") || d.nama.includes("SIUP")) || def2.nama === "NPWP" && d.nama.includes("NPWP") || def2.nama === "Akta Pendirian" && d.nama.includes("Akta")
    );
    if (matched) {
      let files = matched.files || [];
      if (files.length === 0 && matched.linkDrive) {
        files = [
          {
            id: "legacy_" + Math.random().toString(36).substring(2, 9),
            fileName: `${matched.nama}.pdf`,
            linkDrive: matched.linkDrive,
            uploadedAt: matched.uploadedAt || (/* @__PURE__ */ new Date()).toISOString(),
            tanggalKadaluarsa: matched.tanggalKadaluarsa,
            year: matched.uploadedAt ? new Date(matched.uploadedAt).getFullYear().toString() : (/* @__PURE__ */ new Date()).getFullYear().toString()
          }
        ];
      }
      return { ...matched, nama: def2.nama, wajib: isNDA ? true : false, files };
    }
    return { ...def2, wajib: isNDA ? true : false, files: [] };
  });
}
if (import_fs4.default.existsSync(dataFilePath)) {
  try {
    const raw = import_fs4.default.readFileSync(dataFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    db = { ...db, ...parsed };
    if (Array.isArray(db.partners)) {
      db.partners.forEach((p) => {
        if (!p.organizationId) p.organizationId = "org-adapundi";
        p.daftar_dokumen_dd = normalizePartnerDDDocs(p.daftar_dokumen_dd);
        const wajibItems = p.daftar_dokumen_dd.filter((d) => d.wajib);
        const adaWajib = wajibItems.filter((d) => d.status === "Ada");
        if (wajibItems.length > 0) {
          p.status_dd = adaWajib.length === wajibItems.length ? "Lengkap" : "Belum Lengkap";
        }
      });
    }
    const defaultTenant = (db.tenants || []).find((t) => t.isDefault) || db.tenants?.[0];
    const defaultTenantId = defaultTenant?.id || "org-adapundi";
    if (Array.isArray(db.partners)) {
      db.partners.forEach((p) => {
        if (!p.organizationId) p.organizationId = defaultTenantId;
      });
    }
    if (Array.isArray(db.contracts)) {
      db.contracts.forEach((c) => {
        if (!c.organizationId) c.organizationId = defaultTenantId;
      });
    }
    if (Array.isArray(db.ios)) {
      db.ios.forEach((io) => {
        if (!io.organizationId) io.organizationId = defaultTenantId;
      });
    }
    if (Array.isArray(db.spendings)) {
      db.spendings.forEach((sp) => {
        if (!sp.organizationId) sp.organizationId = defaultTenantId;
      });
    }
    if (Array.isArray(db.evaluations)) {
      db.evaluations.forEach((ev) => {
        if (!ev.organizationId) ev.organizationId = defaultTenantId;
      });
    }
    if (!db.tenants || db.tenants.length === 0) {
      db.tenants = [...DEFAULT_TENANTS];
    }
    if (!db.templates) {
      db.templates = [];
    }
    const defaultOrg = db.tenants.find(
      (t) => t.id === "org-adapundi" || t.isDefault
    );
    if (defaultOrg) {
      if (!defaultOrg.spreadsheetId && db.googleConfig?.spreadsheetId) {
        defaultOrg.spreadsheetId = db.googleConfig.spreadsheetId;
        defaultOrg.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${db.googleConfig.spreadsheetId}/edit`;
      }
      if (!defaultOrg.driveFolderId && db.googleConfig?.driveFolderId) {
        defaultOrg.driveFolderId = db.googleConfig.driveFolderId;
        defaultOrg.driveFolderLink = `https://drive.google.com/drive/folders/${db.googleConfig.driveFolderId}`;
      }
    }
    saveDb();
    console.log(
      "Database loaded successfully from data_store.json with multi-tenant partitioning."
    );
  } catch (err) {
    console.error("Error reading data_store.json, using seed defaults", err);
  }
} else {
  const defaultOrg = db.tenants?.find(
    (t) => t.id === "org-adapundi" || t.isDefault
  );
  if (defaultOrg) {
    defaultOrg.spreadsheetId = db.googleConfig.spreadsheetId;
    defaultOrg.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${db.googleConfig.spreadsheetId}/edit`;
    defaultOrg.driveFolderId = db.googleConfig.driveFolderId;
    defaultOrg.driveFolderLink = `https://drive.google.com/drive/folders/${db.googleConfig.driveFolderId}`;
  }
  saveDb();
}
ensureAllPartnersFolders().catch(
  (err) => console.error("Startup category folder provisioning error:", err)
);
if (db.spendings && db.spendings.length > 0) {
  let legacyCounter = 1;
  let changed = false;
  for (const sp of db.spendings) {
    if (!sp.id || sp.id.startsWith("spd-")) {
      sp.id = `SP${String(legacyCounter).padStart(4, "0")}`;
      legacyCounter++;
      changed = true;
    }
  }
  if (changed) {
    saveDb();
  }
}
function generateNextPartnerId() {
  let maxNum = 0;
  for (const p of db.partners || []) {
    if (!p.partner_id) continue;
    const match = p.partner_id.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num < 1e6) {
        if (num > maxNum) maxNum = num;
      }
    }
  }
  if (maxNum === 0 && db.partners && db.partners.length > 0) {
    maxNum = db.partners.length;
  }
  const nextNum = maxNum + 1;
  return `P${String(nextNum).padStart(4, "0")}`;
}
function generateNextContractId() {
  let maxNum = 0;
  for (const c of db.contracts || []) {
    if (!c.contract_id) continue;
    const match = c.contract_id.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num < 1e6) {
        if (num > maxNum) maxNum = num;
      }
    }
  }
  if (maxNum === 0 && db.contracts && db.contracts.length > 0) {
    maxNum = db.contracts.length;
  }
  const nextNum = maxNum + 1;
  return `C${String(nextNum).padStart(4, "0")}`;
}
function generateNextIOId() {
  let maxNum = 0;
  for (const io of db.ios || []) {
    if (!io.io_id) continue;
    const match = io.io_id.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num < 1e6) {
        if (num > maxNum) maxNum = num;
      }
    }
  }
  if (maxNum === 0 && db.ios && db.ios.length > 0) {
    maxNum = db.ios.length;
  }
  const nextNum = maxNum + 1;
  return `IO${String(nextNum).padStart(4, "0")}`;
}
function generateNextSpendingId() {
  let maxNum = 0;
  for (const s of db.spendings || []) {
    if (!s.id) continue;
    const match = s.id.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num < 1e6) {
        if (num > maxNum) maxNum = num;
      }
    }
  }
  if (maxNum === 0 && db.spendings && db.spendings.length > 0) {
    maxNum = db.spendings.length;
  }
  const nextNum = maxNum + 1;
  return `SP${String(nextNum).padStart(4, "0")}`;
}
function sanitizePartnerTags(tags) {
  if (!tags) return ["Advertising"];
  let list = [];
  if (Array.isArray(tags)) {
    list = tags.map((t) => String(t).trim());
  } else if (typeof tags === "string") {
    const trimmed = tags.trim();
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) list = arr.map((t) => String(t).trim());
      } catch (e) {
        list = trimmed.split(/[,|;]/).map((s) => s.trim());
      }
    } else {
      list = trimmed.split(/[,|;]/).map((s) => s.trim());
    }
  }
  const valid = list.filter((item) => {
    if (!item) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(item)) return false;
    return true;
  });
  return valid.length > 0 ? valid : ["Advertising"];
}
if (db.partners && Array.isArray(db.partners)) {
  db.partners = db.partners.map((p) => ({
    ...p,
    badan_hukum: p.badan_hukum === "BHA" ? "BHA" : "BHI",
    daftar_dokumen_dd: normalizePartnerDDDocs(p.daftar_dokumen_dd),
    tags: sanitizePartnerTags(p.tags)
  }));
  saveDb();
}
function saveDb() {
  try {
    const tempPath = `${dataFilePath}.tmp`;
    import_fs4.default.writeFileSync(tempPath, JSON.stringify(db, null, 2), "utf-8");
    import_fs4.default.renameSync(tempPath, dataFilePath);
  } catch (err) {
    console.error("Failed to save db to disk", err);
  }
}
function triggerAutoPushToGoogleSheet(_req, _options) {
  return Promise.resolve();
}
function syncAdderNames() {
  db.allowedUsers.forEach((u) => {
    if (u.name && (u.name.includes("Adhitia") || u.name.includes("Super Admin"))) {
      u.name = "Admin";
    }
  });
  const userByEmail = /* @__PURE__ */ new Map();
  db.allowedUsers.forEach((u) => {
    if (u.email) {
      userByEmail.set(u.email.trim().toLowerCase(), u);
    }
  });
  db.allowedUsers.forEach((u) => {
    if (u.addedByEmail && userByEmail.has(u.addedByEmail.trim().toLowerCase())) {
      const creator = userByEmail.get(u.addedByEmail.trim().toLowerCase());
      u.addedBy = creator.name;
    } else if (u.addedBy && u.addedBy !== "System Core" && u.addedBy !== "System") {
      for (const creator of db.allowedUsers) {
        const creatorEmail = creator.email.trim().toLowerCase();
        const creatorName = creator.name.trim().toLowerCase();
        const currentAddedBy = u.addedBy.trim().toLowerCase();
        if (currentAddedBy === creatorEmail || currentAddedBy === creatorName || creatorEmail === "adhitcl@gmail.com" && (currentAddedBy.includes("adhitia") || currentAddedBy.includes("adhit"))) {
          u.addedByEmail = creator.email;
          u.addedBy = creator.name;
          break;
        }
      }
    }
  });
  db.activityLogs.forEach((log) => {
    if (log.userEmail) {
      const matchedUser = userByEmail.get(log.userEmail.trim().toLowerCase());
      if (matchedUser) {
        log.userName = matchedUser.name;
      }
    }
  });
}
syncAdderNames();
saveDb();
async function sendSmtpEmail({
  to,
  subject,
  html,
  text
}) {
  const config2 = db.googleConfig;
  if (!config2.smtpEnabled || !config2.smtpHost || !config2.smtpUser) {
    return {
      success: false,
      error: "SMTP Relay belum diaktifkan atau belum dikonfigurasi."
    };
  }
  try {
    const port = Number(config2.smtpPort) || (config2.smtpSecure ? 465 : 587);
    const transporter = import_nodemailer2.default.createTransport({
      host: config2.smtpHost,
      port,
      secure: config2.smtpSecure ?? port === 465,
      auth: { user: config2.smtpUser, pass: config2.smtpPassword || "" },
      tls: { rejectUnauthorized: false }
    });
    const fromAddress = config2.smtpFromEmail || config2.smtpUser;
    const fromName = config2.smtpFromName || "Sistem Notifikasi Kontrak & IO";
    const from = `"${fromName}" <${fromAddress}>`;
    const recipients = Array.isArray(to) ? to.join(", ") : to;
    const info = await transporter.sendMail({
      from,
      to: recipients,
      subject,
      text: text || html.replace(/<[^>]*>/g, ""),
      html
    });
    console.log(
      `[SMTP Relay] Email successfully sent to ${recipients} (MessageId: ${info.messageId})`
    );
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("[SMTP Relay Error]", err);
    return { success: false, error: err.message || String(err) };
  }
}
function recalculateStatuses() {
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  let newNotifsCount = 0;
  db.contracts = db.contracts.map((contract) => {
    if (contract.status === "Terminated") {
      return contract;
    }
    if (contract.auto_renewal && contract.tanggal_mulai && contract.tanggal_berakhir) {
      let currentEnd = new Date(contract.tanggal_berakhir);
      currentEnd.setHours(0, 0, 0, 0);
      const startDate = new Date(contract.tanggal_mulai);
      let durationYears = 1;
      if (!isNaN(startDate.getTime()) && !isNaN(currentEnd.getTime())) {
        const diffYears = currentEnd.getFullYear() - startDate.getFullYear();
        durationYears = Math.max(1, diffYears || 1);
      }
      while (currentEnd.getTime() < today.getTime()) {
        currentEnd.setFullYear(currentEnd.getFullYear() + durationYears);
      }
      const extendedEndDateStr = `${currentEnd.getFullYear()}-${String(currentEnd.getMonth() + 1).padStart(2, "0")}-${String(currentEnd.getDate()).padStart(2, "0")}`;
      if (contract.tanggal_berakhir !== extendedEndDateStr) {
        contract.tanggal_berakhir = extendedEndDateStr;
      }
    }
    const endDate = new Date(contract.tanggal_berakhir);
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const sisaHari = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
    let status = contract.status;
    if (sisaHari < 0) {
      status = contract.auto_renewal ? "Aktif" : "Expired";
    } else if (sisaHari <= 90) {
      status = "Akan Berakhir";
    } else {
      status = "Aktif";
    }
    contract.status = status;
    contract.sisa_hari = sisaHari;
    if (sisaHari === 90 || sisaHari === 60 || sisaHari === 30 || sisaHari === 14) {
      const notifJenis = `Reminder H-${sisaHari}`;
      const existingNotif = db.notifications.find(
        (n) => n.parent_id === contract.contract_id && n.jenis_notifikasi === notifJenis
      );
      if (!existingNotif) {
        const legalEmails = db.googleConfig.legalNotificationEmail || db.googleConfig.notificationEmails || "legal.head@perusahaan.co.id";
        const notif = {
          notif_id: `notif-ctr-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
          parent_type: "Contract",
          parent_id: contract.contract_id,
          parent_nomor: contract.nomor_kontrak,
          parent_judul: contract.judul_kontrak,
          jenis_notifikasi: notifJenis,
          tanggal_terkirim: (/* @__PURE__ */ new Date()).toISOString(),
          status_terkirim: true,
          penerima: `${contract.pic_internal}, ${legalEmails}`,
          pesan: `REMINDER: Kontrak ${contract.nomor_kontrak} (${contract.judul_kontrak}) sisa masa berlaku ${sisaHari} hari. Perlukan Notice of ${contract.notice_type_required}.`
        };
        db.notifications.unshift(notif);
        newNotifsCount++;
        if (db.googleConfig.smtpEnabled) {
          const emailSubject = `[NOTICE PERIOD REMINDER H-${sisaHari}] Kontrak: ${contract.nomor_kontrak} - ${contract.judul_kontrak}`;
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #06C755; color: #FFFFFF; padding: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 18px;">Pemberitahuan Notice Period Kontrak</h2>
                <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.95;">Sisa Masa Berlaku: <strong>${sisaHari} Hari</strong></p>
              </div>
              <div style="padding: 20px; color: #1E293B; font-size: 13px; line-height: 1.6;">
                <p>Halo Tim Legal & PIC Internal,</p>
                <p>Sistem mendeteksi bahwa kontrak berikut mendekati batas akhir notice period:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B; width: 35%;">Nomor Kontrak</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">${contract.nomor_kontrak}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Judul Kontrak</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">${contract.judul_kontrak}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Partner / Vendor</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9;">${contract.partner_nama || "-"}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Tanggal Berakhir</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #DC2626; font-weight: bold;">${contract.tanggal_berakhir}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Ketentuan Notice</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9;">Notice of <strong>${contract.notice_type_required || "Termination / Extension"}</strong> (${contract.notice_period_hari || 30} hari sebelumnya)</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">PIC Internal</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9;">${contract.pic_internal || "-"}</td></tr>
                </table>
                <p style="color: #475569; font-size: 12px;">Harap segera tindak lanjuti sebelum batas waktu notice period berakhir untuk perpanjangan (extension) atau pengakhiran (termination).</p>
              </div>
              <div style="background-color: #F8FAFC; padding: 10px 20px; text-align: center; color: #94A3B8; font-size: 11px; border-top: 1px solid #E2E8F0;">
                Email otomatis dikirim oleh Sistem Pengelola Kontrak & Insertion Order
              </div>
            </div>
          `;
          const validRecipients = notif.penerima.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
          if (validRecipients.length > 0) {
            sendSmtpEmail({
              to: validRecipients,
              subject: emailSubject,
              html: emailHtml
            });
          }
        }
      }
    }
    return {
      ...contract,
      status,
      sisa_hari: sisaHari,
      updated_at: contract.updated_at || (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  db.ios = db.ios.map((io) => {
    if (io.status === "Terminated") return io;
    const endDate = new Date(io.tanggal_berakhir);
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const sisaHari = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
    let status = io.status;
    if (sisaHari < 0) {
      status = "Expired";
    } else if (sisaHari <= 90) {
      status = "Akan Berakhir";
    } else {
      status = "Aktif";
    }
    if (sisaHari === 90 || sisaHari === 60 || sisaHari === 30 || sisaHari === 14) {
      const notifJenis = `Reminder H-${sisaHari}`;
      const existingNotif = db.notifications.find(
        (n) => n.parent_id === io.io_id && n.jenis_notifikasi === notifJenis
      );
      if (!existingNotif) {
        const financeEmails = db.googleConfig.financeNotificationEmail || db.googleConfig.notificationEmails || "finance.team@perusahaan.co.id";
        const notif = {
          notif_id: `notif-io-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
          parent_type: "IO",
          parent_id: io.io_id,
          parent_nomor: io.nomor_io,
          parent_judul: io.judul_io,
          jenis_notifikasi: notifJenis,
          tanggal_terkirim: (/* @__PURE__ */ new Date()).toISOString(),
          status_terkirim: true,
          penerima: `PIC Marketing / BizDev, ${financeEmails}`,
          pesan: `REMINDER: Insertion Order ${io.nomor_io} (${io.judul_io}) sisa masa berlaku ${sisaHari} hari. Cek deliverable & penagihan.`
        };
        db.notifications.unshift(notif);
        newNotifsCount++;
        if (db.googleConfig.smtpEnabled) {
          const emailSubject = `[IO REMINDER H-${sisaHari}] Insertion Order: ${io.nomor_io} - ${io.judul_io}`;
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #3B82F6; color: #FFFFFF; padding: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 18px;">Pemberitahuan Insertion Order (IO)</h2>
                <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.95;">Sisa Masa Berlaku: <strong>${sisaHari} Hari</strong></p>
              </div>
              <div style="padding: 20px; color: #1E293B; font-size: 13px; line-height: 1.6;">
                <p>Halo Tim Finance & Marketing,</p>
                <p>Sistem mendeteksi bahwa Insertion Order (IO) berikut mendekati batas akhir periode:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B; width: 35%;">Nomor IO</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">${io.nomor_io}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Judul IO</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">${io.judul_io}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Tanggal Berakhir</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #DC2626; font-weight: bold;">${io.tanggal_berakhir}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Nilai IO</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9;">${io.currency || "IDR"} ${Number(io.nilai_io || 0).toLocaleString("id-ID")}</td></tr>
                  <tr><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Pricing Model</td><td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9;">${io.pricing_model || "-"} (${io.charging_type || "-"})</td></tr>
                </table>
                <p style="color: #475569; font-size: 12px;">Harap pastikan deliverables telah tercapai dan proses penagihan/rekonsiliasi invoice berjalan lancar.</p>
              </div>
              <div style="background-color: #F8FAFC; padding: 10px 20px; text-align: center; color: #94A3B8; font-size: 11px; border-top: 1px solid #E2E8F0;">
                Email otomatis dikirim oleh Sistem Pengelola Kontrak & Insertion Order
              </div>
            </div>
          `;
          const validRecipients = notif.penerima.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
          if (validRecipients.length > 0) {
            sendSmtpEmail({
              to: validRecipients,
              subject: emailSubject,
              html: emailHtml
            });
          }
        }
      }
    }
    return {
      ...io,
      status,
      sisa_hari: sisaHari,
      updated_at: io.updated_at || (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  saveDb();
  return newNotifsCount;
}
recalculateStatuses();
function addActivityLog(userEmail, userName, role, actionType, moduleName, description, req) {
  const log = {
    id: `act-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    userEmail,
    userName,
    role,
    actionType,
    module: moduleName,
    description,
    ipAddress: req?.ip || req?.headers["x-forwarded-for"] || "127.0.0.1",
    userAgent: req?.headers["user-agent"] || "Browser Client"
  };
  db.activityLogs.unshift(log);
  if (db.activityLogs.length > 500) {
    db.activityLogs = db.activityLogs.slice(0, 500);
  }
  saveDb();
  return log;
}
async function getBetterAuthSession(req) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers
    });
    if (session?.user) {
      return session;
    }
  } catch (err) {
  }
  try {
    let token = "";
    const authHeader = req.headers["authorization"] || req.headers["x-session-token"];
    if (authHeader) {
      token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : authHeader.trim();
    }
    if (!token && req.headers["cookie"]) {
      const match = req.headers["cookie"].match(
        /better-auth\.session_token=([^;]+)/
      );
      if (match) {
        token = decodeURIComponent(match[1]).split(".")[0];
      }
    }
    if (token) {
      const authDb = new import_better_sqlite32.default(import_path4.default.join(process.cwd(), "auth.db"));
      const sessionRow = authDb.prepare("SELECT * FROM session WHERE token = ? OR token LIKE ?").get(token, `${token}%`);
      if (sessionRow && new Date(sessionRow.expiresAt) > /* @__PURE__ */ new Date()) {
        const userRow = authDb.prepare("SELECT * FROM user WHERE id = ?").get(sessionRow.userId);
        if (userRow) {
          return {
            user: {
              id: userRow.id,
              email: userRow.email,
              name: userRow.name,
              role: userRow.role,
              banned: Boolean(userRow.banned)
            },
            session: sessionRow
          };
        }
      }
    }
  } catch (e) {
    console.error("Session lookup fallback error:", e);
  }
  return null;
}
async function getClerkUserEmail(req) {
  try {
    const session = await getBetterAuthSession(req);
    return session?.user?.email?.toLowerCase() || null;
  } catch (err) {
    console.error("Failed to get user email:", err);
    return null;
  }
}
app.get("/api/user/my-role", async (req, res) => {
  const email = await getClerkUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Tidak terautentikasi." });
  }
  let allowed = db.allowedUsers.find((u) => u.email.toLowerCase() === email);
  if (!allowed) {
    const isFirstUser = db.allowedUsers.length === 0;
    const session = await getBetterAuthSession(req);
    const userName = session?.user?.name || email.split("@")[0];
    const newUser = {
      id: `user_${Date.now()}`,
      email,
      name: userName,
      role: isFirstUser ? "Admin" : "Staff",
      department: "Commercial & Marketing",
      status: "Active",
      addedBy: "System (Auto)",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.allowedUsers.push(newUser);
    saveDb();
    allowed = newUser;
  }
  if (allowed.status !== "Active") {
    return res.status(403).json({
      error: "Akses Ditolak",
      message: `Email '${email}' telah dinonaktifkan. Hubungi Tim Administrator.`
    });
  }
  try {
    const userRow = sqliteDb.prepare(
      "SELECT u.id, u.name, u.role FROM user u WHERE LOWER(u.email) = LOWER(?)"
    ).get(email);
    if (userRow) {
      if (userRow.name && !allowed.name) {
        allowed.name = userRow.name;
      }
      if (userRow.role) {
        const rawRole = String(userRow.role).toLowerCase();
        if (rawRole === "superuser") allowed.role = "Superuser";
        else if (rawRole === "admin") allowed.role = "Admin";
        else if (rawRole === "manager") allowed.role = "Manager";
        else if (rawRole === "editor") allowed.role = "Editor";
        else if (rawRole === "viewer") allowed.role = "Viewer";
        else if (rawRole === "legal") allowed.role = "Manager";
        else if (rawRole === "finance") allowed.role = "Editor";
        else if (rawRole === "staff") allowed.role = "Viewer";
      }
      const teamRow = sqliteDb.prepare(
        `
        SELECT t.name FROM team t
        JOIN teamMember tm ON tm.teamId = t.id
        WHERE tm.userId = ?
        LIMIT 1
      `
      ).get(userRow.id);
      if (teamRow?.name) {
        allowed.department = teamRow.name;
      }
    }
  } catch (err) {
  }
  allowed.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  res.json({
    email: allowed.email,
    name: allowed.name,
    role: allowed.role,
    department: allowed.department || "Commercial & Marketing",
    loginTime: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/departments", async (req, res) => {
  try {
    let tenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId;
    if (!tenantId || tenantId === "org-adapundi") {
      const email = await getClerkUserEmail(req);
      if (email) {
        const user = sqliteDb.prepare("SELECT id FROM user WHERE email = ?").get(email);
        if (user) {
          const session = sqliteDb.prepare(
            "SELECT activeOrganizationId FROM session WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1"
          ).get(user.id);
          if (session && session.activeOrganizationId) {
            tenantId = session.activeOrganizationId;
          }
        }
      }
    }
    if (!tenantId || tenantId === "org-adapundi") {
      const firstOrg = sqliteDb.prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1").get();
      tenantId = db.activeTenantId || firstOrg?.id || "org-1";
    }
    let teams = sqliteDb.prepare(
      "SELECT name FROM team WHERE organizationId = ? ORDER BY createdAt ASC"
    ).all(tenantId) || [];
    if (teams.length === 0) {
      const firstOrg = sqliteDb.prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1").get();
      if (firstOrg && firstOrg.id !== tenantId) {
        teams = sqliteDb.prepare(
          "SELECT name FROM team WHERE organizationId = ? ORDER BY createdAt ASC"
        ).all(firstOrg.id) || [];
      }
    }
    const departments = teams.map((t) => t.name);
    if (departments.length === 0) {
      departments.push("Marketing");
    }
    res.json({ success: true, departments });
  } catch (err) {
    console.error("Failed to fetch departments:", err);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});
app.post("/api/user/log-activity", async (req, res) => {
  const {
    actionType,
    module: moduleName,
    description,
    userEmail,
    userName,
    userRole
  } = req.body;
  const email = await getClerkUserEmail(req);
  let finalEmail = userEmail || "user@app";
  let finalName = userName || "User";
  let finalRole = userRole || "Legal";
  if (email) {
    const allowed = db.allowedUsers.find(
      (u) => u.email.toLowerCase() === email
    );
    if (allowed) {
      finalEmail = allowed.email;
      finalName = allowed.name;
      finalRole = allowed.role;
    }
  }
  addActivityLog(
    finalEmail,
    finalName,
    finalRole,
    actionType || "LOGIN",
    moduleName || "AUTH",
    description || `${actionType === "LOGOUT" ? "Keluar dari" : "Masuk ke"} aplikasi via Clerk Auth`,
    req
  );
  res.json({ success: true });
});
async function checkIsAdmin(req, fallbackEmail, fallbackName) {
  const session = await getBetterAuthSession(req);
  const email = (session?.user?.email || fallbackEmail || req.headers["x-user-email"] || req.headers["x-google-user-email"] || req.body?.adminEmail || req.query?.adminEmail || "").toLowerCase().trim();
  const name = session?.user?.name || fallbackName || req.headers["x-user-name"] || req.body?.adminName || req.query?.adminName || "User";
  if (!email) {
    return {
      isAdmin: false,
      adminEmail: "",
      adminName: ""
    };
  }
  try {
    const userRow = sqliteDb.prepare("SELECT id, role, banned FROM user WHERE LOWER(email) = LOWER(?)").get(email);
    if (userRow) {
      if (userRow.banned === 1) {
        return {
          isAdmin: false,
          adminEmail: email,
          adminName: name
        };
      }
      const uRole = (userRow.role || "").toLowerCase();
      if (["admin", "superuser", "owner", "super admin"].includes(uRole)) {
        return {
          isAdmin: true,
          adminEmail: email,
          adminName: userRow.name || name
        };
      }
    }
  } catch (_) {
  }
  const allowed = (db.allowedUsers || []).find(
    (u) => (u.email || "").toLowerCase() === email
  );
  if (allowed) {
    if (allowed.status === "Inactive" || allowed.status === "Banned") {
      return {
        isAdmin: false,
        adminEmail: email,
        adminName: name
      };
    }
    const aRole = (allowed.role || "").toLowerCase();
    if (["admin", "superuser", "owner", "super admin"].includes(aRole)) {
      return {
        isAdmin: true,
        adminEmail: email,
        adminName: allowed.name || name
      };
    }
  }
  const sRole = (session?.user?.role || "").toLowerCase();
  if (["admin", "superuser", "owner", "super admin"].includes(sRole)) {
    return {
      isAdmin: true,
      adminEmail: email,
      adminName: session?.user?.name || name
    };
  }
  if (email === "adhitcl@gmail.com") {
    return {
      isAdmin: true,
      adminEmail: email,
      adminName: allowed?.name || name || "Administrator"
    };
  }
  return {
    isAdmin: false,
    adminEmail: email,
    adminName: allowed?.name || name
  };
}
app.get("/api/user/allowed-users", (req, res) => {
  syncAdderNames();
  res.json(db.allowedUsers);
});
app.post("/api/user/allowed-users", async (req, res) => {
  const { email, name, role, department, adminEmail, adminName } = req.body;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only Admins can manage whitelist." });
  }
  if (!email || !name || !role) {
    return res.status(400).json({ error: "Email, Nama, dan Role wajib diisi." });
  }
  const exists = db.allowedUsers.some(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ error: `Email '${email}' sudah ada dalam daftar whitelist.` });
  }
  const newUser = {
    id: `usr-${Date.now()}`,
    email: email.trim().toLowerCase(),
    name,
    role,
    department: department || "Umum",
    status: "Active",
    addedBy: adminCheck.adminName || "Admin",
    addedByEmail: adminCheck.adminEmail,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.allowedUsers.unshift(newUser);
  syncAdderNames();
  saveDb();
  addActivityLog(
    adminCheck.adminEmail || "admin@app",
    adminCheck.adminName || "Admin",
    "Admin",
    "ADD_USER",
    "ADMIN",
    `Menambahkan email '${email}' (${name} - ${role}) ke whitelist akses`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, user: newUser });
});
app.put("/api/user/allowed-users/:id", async (req, res) => {
  const { id } = req.params;
  const { role, department, status, name, adminEmail, adminName } = req.body;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only Admins can manage whitelist." });
  }
  const user = db.allowedUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  }
  if (user.role === "Admin" && role && role !== "Admin") {
    const adminCount = db.allowedUsers.filter((u) => u.role === "Admin").length;
    if (adminCount <= 1) {
      return res.status(400).json({
        error: "Sistem membutuhkan minimal 1 akun Admin aktif. Buat Admin lain terlebih dahulu sebelum mengubah role akun ini."
      });
    }
  }
  if (role) user.role = role;
  if (department) user.department = department;
  if (status) user.status = status;
  if (name) user.name = name;
  syncAdderNames();
  saveDb();
  addActivityLog(
    adminCheck.adminEmail || "admin@app",
    adminCheck.adminName || "Admin",
    "Admin",
    "UPDATE",
    "ADMIN",
    `Memperbarui hak akses/role pengguna '${user.email}' (${user.name}) menjadi '${user.role}'`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, user });
});
app.delete("/api/user/allowed-users/:id", async (req, res) => {
  const { id } = req.params;
  const { adminEmail, adminName } = req.query;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only Admins can manage whitelist." });
  }
  const user = db.allowedUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  }
  if (adminCheck.adminEmail && user.email.toLowerCase() === adminCheck.adminEmail.toLowerCase()) {
    return res.status(400).json({
      error: "Anda tidak dapat menghapus akun Anda sendiri saat sedang login."
    });
  }
  if (user.role === "Admin") {
    const adminCount = db.allowedUsers.filter((u) => u.role === "Admin").length;
    if (adminCount <= 1) {
      return res.status(400).json({
        error: "Tidak dapat menghapus satu-satunya akun Admin yang tersisa di sistem."
      });
    }
  }
  db.allowedUsers = db.allowedUsers.filter((u) => u.id !== id);
  saveDb();
  addActivityLog(
    adminCheck.adminEmail || "admin@app",
    adminCheck.adminName || "Admin",
    "Admin",
    "REMOVE_USER",
    "ADMIN",
    `Mencabut akses email '${user.email}' (${user.name}) dari whitelist`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.post("/api/user/reset-password", async (req, res) => {
  const { email, newPassword, adminEmail, adminName } = req.body;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({
      error: "Forbidden: Hanya Admin yang dapat mereset password pengguna."
    });
  }
  if (!email || !newPassword) {
    return res.status(400).json({ error: "Email dan Password Baru wajib diisi." });
  }
  if (newPassword.trim().length < 6) {
    return res.status(400).json({ error: "Password minimal 6 karakter." });
  }
  try {
    const authDb = new import_better_sqlite32.default(import_path4.default.join(process.cwd(), "auth.db"));
    const trimmedEmail = email.trim().toLowerCase();
    let targetUser = authDb.prepare("SELECT id, name, email FROM user WHERE LOWER(email) = ?").get(trimmedEmail);
    const hashedPassword = await (0, import_crypto5.hashPassword)(newPassword.trim());
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (!targetUser) {
      const allowedUser = db.allowedUsers.find(
        (u) => u.email.toLowerCase() === trimmedEmail
      );
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const userName = allowedUser?.name || email.split("@")[0];
      const userRole = (allowedUser?.role || "Staff").toLowerCase();
      authDb.prepare(
        `
        INSERT INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, ?, 0, ?, ?)
      `
      ).run(userId, userName, trimmedEmail, userRole, nowIso, nowIso);
      const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      authDb.prepare(
        `
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, 'local:credential')
      `
      ).run(accountId, userId, userId, hashedPassword, nowIso, nowIso);
      targetUser = { id: userId, name: userName, email: trimmedEmail };
    } else {
      const existingAccount = authDb.prepare(
        "SELECT id FROM account WHERE userId = ? AND providerId = 'credential'"
      ).get(targetUser.id);
      if (existingAccount) {
        authDb.prepare(
          "UPDATE account SET password = ?, updatedAt = ? WHERE id = ?"
        ).run(hashedPassword, nowIso, existingAccount.id);
      } else {
        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        authDb.prepare(
          `
          INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
          VALUES (?, ?, 'credential', ?, ?, ?, ?, 'local:credential')
        `
        ).run(
          accountId,
          targetUser.id,
          targetUser.id,
          hashedPassword,
          nowIso,
          nowIso
        );
      }
      authDb.prepare(
        "UPDATE user SET banned = 0, banReason = NULL, updatedAt = ? WHERE id = ?"
      ).run(nowIso, targetUser.id);
    }
    addActivityLog(
      adminCheck.adminEmail || "admin@app",
      adminCheck.adminName || "Admin",
      "Admin",
      "UPDATE",
      "ADMIN",
      `Mereset password untuk pengguna '${email}'`,
      req
    );
    res.json({
      success: true,
      message: `Password untuk '${email}' berhasil direset!`
    });
  } catch (err) {
    console.error("Server error resetting password:", err);
    res.status(500).json({
      error: err.message || "Terjadi kesalahan saat mereset password."
    });
  }
});
app.get("/api/activity-logs", (req, res) => {
  res.json(db.activityLogs);
});
app.get("/api/partners", (req, res) => {
  const activeTenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || db.activeTenantId || "org-adapundi";
  const filterTenant = req.query.all !== "true";
  const partnerList = filterTenant ? (db.partners || []).filter(
    (p) => isMatchingOrg(p.organizationId, activeTenantId)
  ) : db.partners || [];
  const normalizedPartners = partnerList.map((p) => ({
    ...p,
    tags: sanitizePartnerTags(p.tags)
  }));
  res.json(normalizedPartners);
});
app.post("/api/partners/parse", upload.single("file"), async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(401).json({
      error: "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio."
    });
  }
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }
    const inputHash = computeInputSha256(inputData);
    const cached = globalOcrCache.get(inputHash, "partners");
    if (cached) {
      console.log(`[OCR Cache HIT] Returned cached partner parse result for hash ${inputHash.slice(0, 10)}...`);
      return res.json({
        ...cached,
        cached: true
      });
    }
    const prompt = `You are an expert legal document assistant. Extract the following information about the partner/vendor from this contract or agreement document to register them into the partner management system:

1. Nama Legal Partner (Key: "nama_partner"): Ekstrak nama legal lengkap perusahaan rekanan / lawan transaksi (selain PT Info Tekno Siaga / Adapundi) yang tertera di bagian pembuka dokumen. Jangan singkat bentuk badan hukumnya (contoh: "PT FLIPTECH LENTERA INSPIRASI PERTIWI").
2. Jenis Badan Hukum (Key: "badan_hukum"): Kembalikan "BHI" jika partner berbadan hukum Indonesia (misal: PT atau CV yang didirikan berdasarkan hukum Indonesia), atau "BHA" jika entitas asing.
3. Nama PIC Partner (Key: "nama_pic"): Ekstrak nama individu atau tim/divisi representatif partner dari bagian Korespondensi/Pemberitahuan/Notices. Jika tidak ada nama individu, ambil nama tim/divisi yang tertera (contoh: "Business development team"). Kembalikan "-" jika tidak ditemukan.
4. Email PIC Partner (Key: "email_pic"): Ekstrak alamat email resmi korespondensi partner (bagian PIC/Attention/cc partner). Jika ada lebih dari satu, ambil email utama. Kembalikan "-" jika tidak ada (contoh: "bizdev@flip.id").
5. Telepon PIC (Key: "telepon_pic"): Ekstrak nomor telepon/fax/WhatsApp resmi kontak partner dari bagian korespondensi. Kembalikan "-" jika tidak tercantum nomor telepon pada dokumen.
6. Alamat Partner (Key: "alamat_pic"): Ekstrak alamat lengkap domisili/kantor partner dari bagian korespondensi atau pembukaan perjanjian (contoh: "Arkadia Green Office Tower F - Lantai 3, Jl. T.B. Simatupang Kav. 88, Kebagusan, Pasar Minggu, Jakarta Selatan 12510"). Kembalikan "-" jika tidak ditemukan.
7. Due Diligence / Internal Notes (Key: "notes"): Bertindaklah sebagai Senior Due Diligence & Vendor Risk Analyst. Rangkum profil operasional dan legalitas partner/vendor ke dalam SATU paragraf naratif komprehensif, padat, dan profesional (bahasa Indonesia) berbasis data dokumen. Paragraf wajib mencakup 4 pilar secara mengalir: (1) Core Business & Spesialisasi (model bisnis utama), (2) Media Network & Publisher Tier (partner media global utama), (3) Proprietary Tech / Platform AI (teknologi internal yang digunakan), dan (4) Strategic Function & Location Context (fungsi strategis yurisdiksi entitas). Tepat 1 paragraf, tanpa bullet points, tanpa heading, langsung mulai dengan nama entitas.

Return the result strictly as a valid JSON object matching the requested schema.`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt
    );
    console.log(
      `[PDF-Inspector Partner Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            nama_partner: { type: import_genai.Type.STRING },
            badan_hukum: { type: import_genai.Type.STRING },
            nama_pic: { type: import_genai.Type.STRING },
            email_pic: { type: import_genai.Type.STRING },
            telepon_pic: { type: import_genai.Type.STRING },
            alamat_pic: { type: import_genai.Type.STRING },
            notes: { type: import_genai.Type.STRING }
          }
        }
      }
    });
    const parsedData = JSON.parse(response.text);
    const responsePayload = { success: true, data: parsedData, ocrStats };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, "partners", responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing partner:", error);
    res.status(500).json({
      error: error?.message || "Failed to parse document. Google AI model is currently busy, please try again."
    });
  }
});
app.post("/api/partners/generate-dd-notes", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(401).json({
      error: "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio."
    });
  }
  try {
    const { nama_partner, badan_hukum, tags, model, pdfBase64 } = req.body;
    if (!nama_partner) {
      return res.status(400).json({ error: "Nama Partner / Entitas wajib diisi." });
    }
    const selectedModel = getValidAiModel(model);
    const contents = [];
    if (pdfBase64 && typeof pdfBase64 === "string") {
      contents.push({
        inlineData: {
          data: pdfBase64.includes("base64,") ? pdfBase64.split("base64,")[1] : pdfBase64,
          mimeType: "application/pdf"
        }
      });
    }
    const prompt = `Bertindaklah sebagai Senior Due Diligence & Vendor Risk Analyst. 

Tugasmu adalah menganalisis dan merangkum profil operasional vendor digital/ad-tech ke dalam SATU paragraf naratif komprehensif, padat, dan profesional (bahasa Indonesia) berdasarkan data entitas resminya.

Input Vendor: "${nama_partner}" ${badan_hukum ? `(Status Badan Hukum: ${badan_hukum === "BHA" ? "BHA - Badan Hukum Asing" : "BHI - Badan Hukum Indonesia"})` : ""} ${tags && tags.length > 0 ? `(Kategori Kerjasama: ${tags.join(", ")})` : ""}

Struktur paragraf wajib mencakup 4 pilar informasi berikut secara mengalir:
1. Core Business & Spesialisasi: Model bisnis utama (misal: programmatic, cross-border UA, creative assets, ad aggregator).
2. Media Network & Publisher Tier: Partner media global utama yang dikelola (misal: Meta, Google, TikTok, Snapchat, Kwai).
3. Proprietary Tech / Platform AI: Teknologi/alat internal yang digunakan (misal: platform bidding ML/AI, sistem prediksi CTR).
4. Strategic Function & Location Context: Fungsi strategis entitas/yurisdiksi tempatnya didaftarkan (misal: tax incentive hub, transaksi lintas batas, remitansi).

Ketentuan Output:
- Format: Tepat 1 paragraf, tanpa bullet points, tanpa heading.
- Gaya bahasa: Formal, teknis periklanan digital (pertahankan istilah industri relevan dalam cetak miring/tanda kurung), to the point.
- Hindari kalimat pembuka atau penutup basa-basi (langsung mulai dengan nama subjek/entitas).`;
    contents.push({ text: prompt });
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents
    });
    const notesText = (response.text || "").trim();
    res.json({ success: true, notes: notesText });
  } catch (error) {
    console.error("Error generating DD notes:", error);
    res.status(500).json({
      error: error?.message || "Gagal menghasilkan ringkasan Due Diligence AI."
    });
  }
});
app.post("/api/partners", async (req, res) => {
  const {
    nama_partner,
    codename,
    badan_hukum,
    jenis_partner,
    pic_partner,
    nama_pic,
    email_pic,
    telepon_pic,
    alamat_pic,
    kontak_pic,
    pic_internal,
    catatan,
    tags,
    userEmail,
    userName,
    userRole
  } = req.body;
  if (!nama_partner) {
    return res.status(400).json({ error: "Nama Partner wajib diisi." });
  }
  const targetOrgId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.body.organizationId || db.activeTenantId || "org-adapundi";
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken || db.googleConfig.accessToken
  );
  let driveFolderLink = `https://drive.google.com/drive/folders/Folder_${nama_partner.replace(/\s+/g, "_")}`;
  if (token || hasServiceAccountCredentials()) {
    try {
      const orgFolder = await getOrgFolderId(targetOrgId, token);
      const parentFolderId = orgFolder.id || db.googleConfig.driveFolderId;
      const vendorFolder = await getOrCreateDriveFolder(
        nama_partner,
        parentFolderId,
        token
      );
      driveFolderLink = vendorFolder.webViewLink || `https://drive.google.com/drive/folders/${vendorFolder.id}`;
      if (vendorFolder.id) {
        await getOrCreateDriveFolder("Folder Contract", vendorFolder.id, token);
        await getOrCreateDriveFolder(
          "Folder Invoice & Billing",
          vendorFolder.id,
          token
        );
        await getOrCreateDriveFolder("Folder IO", vendorFolder.id, token);
        await getOrCreateDriveFolder("Folder DD", vendorFolder.id, token);
      }
    } catch (err) {
      console.warn(
        `[Drive Hierarchical] Error creating folders for partner '${nama_partner}':`,
        err?.message || err
      );
    }
  }
  const defaultDD = STANDARD_DD_DOCUMENTS.map((d) => ({ ...d }));
  const computedPicPartner = pic_partner || (nama_pic ? `${nama_pic} (${email_pic || ""} | ${telepon_pic || ""})` : "-");
  const newPartner = {
    partner_id: generateNextPartnerId(),
    organizationId: targetOrgId,
    nama_partner,
    codename: codename || "",
    badan_hukum: badan_hukum === "BHA" ? "BHA" : "BHI",
    jenis_partner: jenis_partner || "Vendor",
    pic_partner: computedPicPartner,
    nama_pic: nama_pic || "",
    email_pic: email_pic || "",
    telepon_pic: telepon_pic || "",
    alamat_pic: alamat_pic || "",
    kontak_pic: kontak_pic || (email_pic && telepon_pic ? `${email_pic} / ${telepon_pic}` : ""),
    pic_internal: pic_internal || "",
    status_dd: "Belum Lengkap",
    link_folder_dd: driveFolderLink,
    daftar_dokumen_dd: defaultDD,
    catatan: catatan || "",
    tags: sanitizePartnerTags(tags),
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.partners.unshift(newPartner);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Business Owner",
    "CREATE",
    "PARTNER",
    `Menambahkan Partner baru: ${nama_partner} (${newPartner.badan_hukum})`,
    req
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, partner: newPartner });
});
app.put("/api/partners/:id", async (req, res) => {
  const { id } = req.params;
  const {
    nama_partner,
    codename,
    badan_hukum,
    jenis_partner,
    pic_partner,
    nama_pic,
    email_pic,
    telepon_pic,
    alamat_pic,
    kontak_pic,
    pic_internal,
    catatan,
    tags,
    daftar_dokumen_dd,
    userEmail,
    userName,
    userRole
  } = req.body;
  const partnerIndex = db.partners.findIndex((p) => p.partner_id === id);
  if (partnerIndex === -1) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const existing = db.partners[partnerIndex];
  let status_dd = existing.status_dd;
  if (daftar_dokumen_dd && Array.isArray(daftar_dokumen_dd)) {
    const wajibItems = daftar_dokumen_dd.filter((d) => d.wajib);
    const adaWajib = wajibItems.filter((d) => d.status === "Ada");
    const totalItems = daftar_dokumen_dd.length;
    const adaTotal = daftar_dokumen_dd.filter((d) => d.status === "Ada").length;
    const adaKadaluarsa = daftar_dokumen_dd.some(
      (d) => d.status === "Kadaluarsa"
    );
    if (adaKadaluarsa) {
      status_dd = "Kadaluarsa";
    } else if (wajibItems.length > 0) {
      status_dd = adaWajib.length === wajibItems.length ? "Lengkap" : "Belum Lengkap";
    } else {
      status_dd = adaTotal === totalItems && totalItems > 0 ? "Lengkap" : "Belum Lengkap";
    }
  }
  const updatedPartner = {
    ...existing,
    nama_partner: nama_partner || existing.nama_partner,
    codename: codename !== void 0 ? codename : existing.codename,
    badan_hukum: badan_hukum !== void 0 ? badan_hukum === "BHA" ? "BHA" : "BHI" : existing.badan_hukum,
    jenis_partner: jenis_partner || existing.jenis_partner || "Vendor",
    pic_partner: pic_partner !== void 0 ? pic_partner : existing.pic_partner,
    nama_pic: nama_pic !== void 0 ? nama_pic : existing.nama_pic,
    email_pic: email_pic !== void 0 ? email_pic : existing.email_pic,
    telepon_pic: telepon_pic !== void 0 ? telepon_pic : existing.telepon_pic,
    alamat_pic: alamat_pic !== void 0 ? alamat_pic : existing.alamat_pic,
    kontak_pic: kontak_pic !== void 0 ? kontak_pic : existing.kontak_pic,
    pic_internal: pic_internal !== void 0 ? pic_internal : existing.pic_internal,
    catatan: catatan !== void 0 ? catatan : existing.catatan,
    tags: tags !== void 0 ? sanitizePartnerTags(tags) : sanitizePartnerTags(existing.tags),
    daftar_dokumen_dd: daftar_dokumen_dd || existing.daftar_dokumen_dd,
    status_dd,
    tanggal_dd_diverifikasi: status_dd === "Lengkap" ? (/* @__PURE__ */ new Date()).toISOString().split("T")[0] : existing.tanggal_dd_diverifikasi,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.partners[partnerIndex] = updatedPartner;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DD_UPDATE",
    "PARTNER",
    `Memperbarui profil & status DD Partner ${updatedPartner.nama_partner} menjadi '${status_dd}'`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, partner: updatedPartner });
});
app.delete("/api/partners/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const partnerIndex = db.partners.findIndex((p) => p.partner_id === id);
  if (partnerIndex === -1) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const partner = db.partners[partnerIndex];
  const partnerContracts = db.contracts.filter((c) => c.partner_id === id);
  const contractIds = partnerContracts.map((c) => c.contract_id);
  const partnerIOs = db.ios.filter(
    (io) => io.partner_id === id || contractIds.includes(io.contract_id)
  );
  const ioIds = partnerIOs.map((io) => io.io_id);
  db.notifications = db.notifications.filter(
    (n) => !contractIds.includes(n.parent_id) && !ioIds.includes(n.parent_id)
  );
  db.ios = db.ios.filter(
    (io) => io.partner_id !== id && !contractIds.includes(io.contract_id)
  );
  db.contracts = db.contracts.filter((c) => c.partner_id !== id);
  db.partners.splice(partnerIndex, 1);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DELETE",
    "PARTNER",
    `Menghapus Partner '${partner.nama_partner}' beserta ${partnerContracts.length} Kontrak dan ${partnerIOs.length} Insertion Order pendukung.`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({
    success: true,
    deletedContractsCount: partnerContracts.length,
    deletedIosCount: partnerIOs.length
  });
});
function computeEvaluationScore(obligationTarget, incidentFreq, comm, pricing) {
  let targetScore = 10;
  if (obligationTarget === "Sangat baik" || obligationTarget === "Met")
    targetScore = 30;
  else if (obligationTarget === "Baik") targetScore = 20;
  else if (obligationTarget === "Kurang baik" || obligationTarget === "Not met")
    targetScore = 10;
  let incidentScore = 10;
  if (incidentFreq === "Never") incidentScore = 20;
  else if (incidentFreq === "Rare") incidentScore = 15;
  else if (incidentFreq === "Frequent") incidentScore = 10;
  let commScore = 10;
  if (comm === "Sangat baik" || comm === "Good") commScore = 20;
  else if (comm === "Baik") commScore = 15;
  else if (comm === "Kurang baik" || comm === "Poor/Needs Improvement")
    commScore = 10;
  let pricingScore = 10;
  if (pricing === "Cheap") pricingScore = 30;
  else if (pricing === "Moderate") pricingScore = 20;
  else if (pricing === "Expensive") pricingScore = 10;
  return targetScore + incidentScore + commScore + pricingScore;
}
app.get("/api/partner-evaluations", (req, res) => {
  const activeTenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || db.activeTenantId || "org-adapundi";
  const filterTenant = req.query.all !== "true";
  const list = filterTenant ? (db.evaluations || []).filter(
    (e) => isMatchingOrg(e.organizationId, activeTenantId)
  ) : db.evaluations || [];
  res.json(list);
});
app.post("/api/partner-evaluations", async (req, res) => {
  const {
    review_date,
    partner_id,
    supplier_name,
    type_of_work,
    sla_score,
    obligation_target,
    incident_frequency,
    communication,
    pricing,
    final_evaluation,
    notes,
    userEmail,
    userName,
    userRole
  } = req.body;
  if (!supplier_name || !review_date || !obligation_target || !incident_frequency || !communication || !pricing || !final_evaluation) {
    return res.status(400).json({
      error: "Harap lengkapi semua bidang isian formulir evaluasi yang wajib."
    });
  }
  const targetOrgId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.body.organizationId || db.activeTenantId || "org-adapundi";
  const calculated_score = computeEvaluationScore(
    obligation_target,
    incident_frequency,
    communication,
    pricing
  );
  const newEval = {
    id: `EVAL-${(/* @__PURE__ */ new Date()).getFullYear()}-${String((db.evaluations?.length || 0) + 1).padStart(3, "0")}`,
    organizationId: targetOrgId,
    review_date,
    partner_id,
    supplier_name: supplier_name.trim(),
    type_of_work: (type_of_work || "General Service").trim(),
    sla_score: Number(sla_score) || 60,
    obligation_target,
    incident_frequency,
    communication,
    pricing,
    final_evaluation,
    notes: (notes || "").trim(),
    calculated_score,
    evaluator_email: userEmail || "user@app",
    evaluator_name: userName || "User",
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!db.evaluations) db.evaluations = [];
  db.evaluations.unshift(newEval);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "CREATE",
    "PARTNER",
    `Membuat Evaluasi Tahunan Vendor untuk '${newEval.supplier_name}' dengan hasil '${newEval.final_evaluation}' (Skor: ${calculated_score}/100)`,
    req
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, evaluation: newEval });
});
app.put("/api/partner-evaluations/:id", async (req, res) => {
  const { id } = req.params;
  const {
    review_date,
    partner_id,
    supplier_name,
    type_of_work,
    sla_score,
    obligation_target,
    incident_frequency,
    communication,
    pricing,
    final_evaluation,
    notes,
    userEmail,
    userName,
    userRole
  } = req.body;
  const evalIndex = (db.evaluations || []).findIndex((e) => e.id === id);
  if (evalIndex === -1) {
    return res.status(404).json({ error: "Data evaluasi tidak ditemukan." });
  }
  const existing = db.evaluations[evalIndex];
  const calculated_score = computeEvaluationScore(
    obligation_target || existing.obligation_target,
    incident_frequency || existing.incident_frequency,
    communication || existing.communication,
    pricing || existing.pricing
  );
  const updatedEval = {
    ...existing,
    review_date: review_date || existing.review_date,
    partner_id: partner_id !== void 0 ? partner_id : existing.partner_id,
    supplier_name: supplier_name || existing.supplier_name,
    type_of_work: type_of_work || existing.type_of_work,
    sla_score: sla_score !== void 0 ? Number(sla_score) : existing.sla_score,
    obligation_target: obligation_target || existing.obligation_target,
    incident_frequency: incident_frequency || existing.incident_frequency,
    communication: communication || existing.communication,
    pricing: pricing || existing.pricing,
    final_evaluation: final_evaluation || existing.final_evaluation,
    notes: notes !== void 0 ? notes : existing.notes,
    calculated_score,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.evaluations[evalIndex] = updatedEval;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "UPDATE",
    "PARTNER",
    `Perbarui Evaluasi Tahunan Vendor '${updatedEval.supplier_name}' (${updatedEval.id})`,
    req
  );
  res.json({ success: true, evaluation: updatedEval });
});
app.delete("/api/partner-evaluations/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const evalIndex = (db.evaluations || []).findIndex((e) => e.id === id);
  if (evalIndex === -1) {
    return res.status(404).json({ error: "Data evaluasi tidak ditemukan." });
  }
  const removed = db.evaluations[evalIndex];
  db.evaluations.splice(evalIndex, 1);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DELETE",
    "PARTNER",
    `Menghapus Evaluasi Tahunan Vendor '${removed.supplier_name}' (${removed.id})`,
    req
  );
  res.json({ success: true });
});
app.get("/api/exchange-rates", async (req, res) => {
  try {
    const token = (req.headers["x-google-access-token"] || db.googleConfig.accessToken || "").toString();
    const spreadsheetId = db.googleConfig.spreadsheetId;
    if (!spreadsheetId) {
      return res.json({ USD: 1 });
    }
    const currencies = Array.from(
      /* @__PURE__ */ new Set([
        ...(db.spendings || []).map((s) => s.currency || "IDR"),
        ...(db.contracts || []).map((c) => c.currency || "IDR"),
        ...(db.ios || []).map((i) => i.currency || "IDR")
      ])
    );
    const rates = await getExchangeRates(spreadsheetId, token, currencies);
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/exchange-rate-historical", async (req, res) => {
  try {
    const currency = String(req.query.currency || "IDR").toUpperCase();
    const date = String(req.query.date || "");
    if (currency === "USD") {
      return res.json({ currency: "USD", date, rate: 1, isFallback: false });
    }
    const token = (req.headers["x-google-access-token"] || db.googleConfig.accessToken || "").toString();
    const spreadsheetId = db.googleConfig.spreadsheetId;
    let rate = currency === "IDR" ? 62e-6 : 1;
    let isFallback = true;
    try {
      rate = await getHistoricalExchangeRate(
        spreadsheetId,
        token,
        currency,
        date
      );
      isFallback = false;
    } catch (e) {
      console.error("Error fetching historical exchange rate:", e);
    }
    res.json({ currency, date, rate, isFallback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/partner-spendings", (req, res) => {
  const activeTenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || db.activeTenantId || "org-adapundi";
  const filterTenant = req.query.all !== "true";
  const spendingsList = filterTenant ? (db.spendings || []).filter(
    (s) => isMatchingOrg(s.organizationId, activeTenantId)
  ) : db.spendings || [];
  const list = spendingsList.map((s) => {
    if (s.total_amount_usd === void 0 || s.total_amount_usd === null) {
      const amt = Number(s.total_amount) || 0;
      const cur = s.currency || "IDR";
      const usdVal = cur === "USD" ? amt : Math.round(amt * (cur === "IDR" ? 62e-6 : 1) * 100) / 100;
      return { ...s, total_amount_usd: usdVal };
    }
    return s;
  });
  res.json(list);
});
app.post("/api/spendings/parse", upload.single("file"), async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(401).json({
      error: "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio."
    });
  }
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }
    const inputHash = computeInputSha256(inputData);
    const cached = globalOcrCache.get(inputHash, "spendings");
    if (cached) {
      console.log(`[OCR Cache HIT] Returned cached spending parse result for hash ${inputHash.slice(0, 10)}...`);
      return res.json({
        ...cached,
        cached: true
      });
    }
    const prompt = `You are an expert OCR and data extraction assistant processing a B2B business invoice or spending document. Extract the following information accurately:

1. Nomor Invoice (Key: "invoice_number"): Ekstrak nomor invoice/tagihan resmi yang tertera pada bagian "INVOICE NO.". Kembalikan nilai string persis sesuai yang tertulis pada dokumen (contoh: "ADAPUNDI-2604-1").
2. Tanggal Invoice (Key: "invoice_date"): Ekstrak tanggal penerbitan invoice ("ISSUE DATE") dan konversikan formatnya menjadi "DD/MM/YYYY" (contoh: 2026/4/13 menjadi "13/04/2026").
3. Bulan Tagihan (Key: "invoice_month"): Tentukan periode bulan penagihan berdasarkan tanggal penerbitan invoice (ISSUE DATE) dalam format "[Nama Bulan dalam Bahasa Indonesia] [YYYY]" (contoh: "April 2026", "Mei 2026", "Agustus 2026").
4. Deskripsi Tagihan (Key: "invoice_description"): Ekstrak seluruh baris rincian item jasa/barang dari kolom "Description" pada tabel tagihan. Gabungkan setiap baris dengan pemisah baris baru (newline / "\\n") secara persis sesuai teks pada dokumen (contoh: "2026.3 Meta5\\n2026.3 Tik Tok3\\n2025 Q4 TikTok Rebate").
5. Mata Uang (Key: "currency"): Ekstrak kode 3 huruf mata uang tagihan (misal: "USD", "IDR", "SGD", "EUR") yang tertera pada header kolom tabel ("Amount in USD") atau simbol mata uang.
6. Total Nilai Tagihan (Key: "total_amount"): Ekstrak nilai total akhir tagihan ("TOTAL") dalam bentuk angka murni (number / float) tanpa menyertakan simbol mata uang ($) maupun teks tambahan (contoh: 399259.38).
7. Nama Bank Pembayaran (Key: "bank_name"): Ekstrak nama bank penerima pembayaran yang tertera pada baris "Bank Name:". Kembalikan hanya nama bank (contoh: "HSBC", "BCA", "Bank Mandiri").
8. Nomor Rekening (Key: "account_number"): Ekstrak nomor rekening bank penerima pembayaran yang tertera pada baris "Account number:". Pertahankan tanda hubung (-) persis sesuai dokumen (contoh: "809-600703-838").
9. Nama Pemilik Rekening (Key: "account_holder"): Ekstrak nama lengkap pemilik rekening resmi (beneficiary) yang tertera pada baris "Account Name:". Jangan menyingkat atau mengubah teks (contoh: "BLUEFOCUS INTERNATIONAL LIMITED").

Return the result strictly as a valid JSON object matching the requested schema. If any string field is not found, return empty string "".`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt
    );
    console.log(
      `[PDF-Inspector Spending Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            invoice_number: { type: import_genai.Type.STRING },
            invoice_date: { type: import_genai.Type.STRING },
            invoice_month: { type: import_genai.Type.STRING },
            invoice_description: { type: import_genai.Type.STRING },
            currency: { type: import_genai.Type.STRING },
            total_amount: { type: import_genai.Type.NUMBER },
            bank_name: { type: import_genai.Type.STRING },
            account_number: { type: import_genai.Type.STRING },
            account_holder: { type: import_genai.Type.STRING }
          }
        }
      }
    });
    const parsedData = JSON.parse(response.text);
    if (parsedData.invoice_date) {
      parsedData.invoice_date = normalizeParsedDate(parsedData.invoice_date);
    }
    const responsePayload = { success: true, data: parsedData, ocrStats };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, "spendings", responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing Spending:", error);
    res.status(500).json({
      error: error?.message || "Failed to parse Spending document. Google AI model is currently busy, please try again."
    });
  }
});
var getEndOfMonthDate = __name((year, month) => {
  const y = typeof year === "string" ? parseInt(year, 10) : year;
  const m = typeof month === "string" ? parseInt(month, 10) : month;
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return "";
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}, "getEndOfMonthDate");
var normalizeSpendingMonths = __name((input) => {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [];
  const result = [];
  rawList.forEach((raw) => {
    const tokens = raw.split(/\s+/).filter(Boolean);
    tokens.forEach((t) => {
      const trimmed = t.trim();
      if (!trimmed) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        result.push(trimmed);
      } else if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const [y, m] = trimmed.split("-");
        result.push(getEndOfMonthDate(y, m));
      } else if (/^\d{2}-\d{4}$/.test(trimmed)) {
        const [m, y] = trimmed.split("-");
        result.push(getEndOfMonthDate(y, m));
      } else if (/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(trimmed)) {
        result.push(
          getEndOfMonthDate(trimmed.slice(0, 4), trimmed.slice(4, 6))
        );
      } else if (/^(0[1-9]|1[0-2])(19|20)\d{2}$/.test(trimmed)) {
        result.push(getEndOfMonthDate(trimmed.slice(2), trimmed.slice(0, 2)));
      } else {
        result.push(trimmed);
      }
    });
  });
  return Array.from(new Set(result));
}, "normalizeSpendingMonths");
app.post("/api/partner-spendings", async (req, res) => {
  const {
    vendor_id,
    vendor_name,
    invoice_number,
    invoice_date,
    invoice_month,
    invoice_description,
    currency,
    total_amount,
    total_amount_usd: req_usd,
    bank_name,
    bank_account_number,
    bank_account_holder_name,
    invoice_file,
    billing_file,
    userEmail,
    userName,
    userRole
  } = req.body;
  if (!vendor_name || !invoice_number || total_amount === void 0) {
    return res.status(400).json({
      error: "Vendor Name, Invoice Number, and Total Amount are required."
    });
  }
  const targetOrgId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.body.organizationId || db.activeTenantId || "org-adapundi";
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId
  );
  const monthsArray = normalizeSpendingMonths(invoice_month);
  const formattedMonthStr = monthsArray.length > 0 ? monthsArray.join("_") : "Month";
  const cleanVendorName = vendor_name.replace(/[/\\?%*:|"<>]/g, "").trim();
  let invoice_file_url = "";
  let invoice_file_name = "";
  let billing_file_url = "";
  let billing_file_name = "";
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken
  );
  let total_amount_usd = req_usd;
  if (total_amount_usd === void 0 || total_amount_usd === null || isNaN(Number(total_amount_usd))) {
    const cur = currency || "IDR";
    const amt = Number(total_amount) || 0;
    if (cur === "USD") {
      total_amount_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
      try {
        const sheetId = targetTenant?.spreadsheetId || db.googleConfig?.spreadsheetId;
        rate = await getHistoricalExchangeRate(
          sheetId,
          token,
          cur,
          invoice_date
        );
      } catch (e) {
      }
      total_amount_usd = Math.round(amt * rate * 100) / 100;
    }
  } else {
    total_amount_usd = Number(total_amount_usd);
  }
  const partner = db.partners.find(
    (p) => p.partner_id === vendor_id || p.nama_partner.toLowerCase() === vendor_name.toLowerCase()
  );
  if (invoice_file && invoice_file.fileData) {
    const targetInvoiceName = formatInvoiceFileName({
      partnerName: partner?.nama_partner || vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: invoice_number,
      invoiceDate: invoice_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      rawFileName: invoice_file.fileName
    });
    invoice_file_name = targetInvoiceName;
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token,
          targetOrgId
        );
        const driveUrl = await uploadFileToDrive(
          targetInvoiceName,
          invoice_file.fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          invoice_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah file Invoice '${targetInvoiceName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload invoice error:", err?.message);
      }
    }
    if (!invoice_file_url) {
      invoice_file_url = saveLocalFile(
        partner?.nama_partner || vendor_name,
        "Folder Invoice & Billing",
        targetInvoiceName,
        invoice_file.fileData,
        targetTenant?.name
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Invoice '${targetInvoiceName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
  }
  if (billing_file && billing_file.fileData) {
    const targetBillingName = formatBillingFileName({
      partnerName: partner?.nama_partner || vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: invoice_number,
      invoiceDate: invoice_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      rawFileName: billing_file.fileName
    });
    billing_file_name = targetBillingName;
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token,
          targetOrgId
        );
        const driveUrl = await uploadFileToDrive(
          targetBillingName,
          billing_file.fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          billing_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah file Billing '${targetBillingName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload billing error:", err?.message);
      }
    }
    if (!billing_file_url) {
      billing_file_url = saveLocalFile(
        partner?.nama_partner || vendor_name,
        "Folder Invoice & Billing",
        targetBillingName,
        billing_file.fileData,
        targetTenant?.name
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Billing '${targetBillingName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
  }
  const newSpending = {
    id: req.body.id || generateNextSpendingId(),
    organizationId: targetOrgId,
    vendor_id: partner ? partner.partner_id : vendor_id || void 0,
    vendor_name,
    invoice_number,
    invoice_date: invoice_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    invoice_month: monthsArray,
    invoice_description: invoice_description || "",
    currency: currency || "IDR",
    total_amount: Number(total_amount) || 0,
    total_amount_usd,
    bank_name: bank_name || "",
    bank_account_number: bank_account_number || "",
    bank_account_holder_name: bank_account_holder_name || "",
    invoice_file_url,
    invoice_file_name,
    billing_file_url,
    billing_file_name,
    folder_link: partner ? partner.link_folder_dd : void 0,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.spendings = db.spendings || [];
  db.spendings.unshift(newSpending);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Finance",
    "CREATE",
    "PARTNER",
    `Menambahkan Catatan Partner Spending untuk '${vendor_name}' (Invoice #${invoice_number}) senilai ${currency || "IDR"} ${Number(total_amount).toLocaleString("id-ID")}`,
    req
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, spending: newSpending });
});
app.put("/api/partner-spendings/:id", async (req, res) => {
  const { id } = req.params;
  const {
    userEmail,
    userName,
    userRole,
    invoice_file,
    billing_file,
    ...updates
  } = req.body;
  const idx = (db.spendings || []).findIndex((s) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Data spending tidak ditemukan." });
  }
  const existing = db.spendings[idx];
  if (updates.total_amount_usd === void 0 || updates.total_amount_usd === null) {
    const cur = updates.currency || existing.currency || "IDR";
    const amt = Number(
      updates.total_amount !== void 0 ? updates.total_amount : existing.total_amount
    ) || 0;
    const invDate = updates.invoice_date || existing.invoice_date;
    if (cur === "USD") {
      updates.total_amount_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
      try {
        const token2 = await resolveActiveGoogleToken(
          req.headers["x-google-access-token"]
        );
        rate = await getHistoricalExchangeRate(
          db.googleConfig.spreadsheetId,
          token2,
          cur,
          invDate
        );
      } catch (e) {
      }
      updates.total_amount_usd = Math.round(amt * rate * 100) / 100;
    }
  } else {
    updates.total_amount_usd = Number(updates.total_amount_usd);
  }
  const updated = {
    ...existing,
    ...updates,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const partner = db.partners.find(
    (p) => p.partner_id === updated.vendor_id || p.nama_partner.toLowerCase() === updated.vendor_name.toLowerCase()
  );
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken
  );
  if (updated.invoice_month) {
    updated.invoice_month = normalizeSpendingMonths(updated.invoice_month);
  }
  const monthsArray = normalizeSpendingMonths(updated.invoice_month);
  if (invoice_file && invoice_file.fileData) {
    const targetInvoiceName = formatInvoiceFileName({
      partnerName: partner?.nama_partner || updated.vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: updated.invoice_number,
      invoiceDate: updated.invoice_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      rawFileName: invoice_file.fileName
    });
    updated.invoice_file_name = targetInvoiceName;
    let invoice_file_url = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token
        );
        const driveUrl = await uploadFileToDrive(
          targetInvoiceName,
          invoice_file.fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          invoice_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah ulang file Invoice '${targetInvoiceName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload invoice edit error:", err?.message);
      }
    }
    if (!invoice_file_url) {
      invoice_file_url = saveLocalFile(
        partner?.nama_partner || updated.vendor_name,
        "Folder Invoice & Billing",
        targetInvoiceName,
        invoice_file.fileData
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Invoice '${targetInvoiceName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
    updated.invoice_file_url = invoice_file_url;
  }
  if (billing_file && billing_file.fileData) {
    const targetBillingName = formatBillingFileName({
      partnerName: partner?.nama_partner || updated.vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: updated.invoice_number,
      invoiceDate: updated.invoice_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      rawFileName: billing_file.fileName
    });
    updated.billing_file_name = targetBillingName;
    let billing_file_url = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token
        );
        const driveUrl = await uploadFileToDrive(
          targetBillingName,
          billing_file.fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          billing_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah ulang file Billing '${targetBillingName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload billing edit error:", err?.message);
      }
    }
    if (!billing_file_url) {
      billing_file_url = saveLocalFile(
        partner?.nama_partner || updated.vendor_name,
        "Folder Invoice & Billing",
        targetBillingName,
        billing_file.fileData
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Billing '${targetBillingName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
    updated.billing_file_url = billing_file_url;
  }
  db.spendings[idx] = updated;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Finance",
    "UPDATE",
    "PARTNER",
    `Memperbarui Catatan Partner Spending untuk '${updated.vendor_name}' (Invoice #${updated.invoice_number})`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, spending: updated });
});
app.delete("/api/partner-spendings/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const idx = (db.spendings || []).findIndex((s) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Data spending tidak ditemukan." });
  }
  const removed = db.spendings[idx];
  db.spendings.splice(idx, 1);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Finance",
    "DELETE",
    "PARTNER",
    `Menghapus Catatan Partner Spending '${removed.vendor_name}' (Invoice #${removed.invoice_number})`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.post("/api/partners/:id/upload-dd", async (req, res) => {
  const { id } = req.params;
  const {
    docName,
    fileName,
    fileData,
    nomorDokumen,
    tanggalKadaluarsa,
    userEmail,
    userName,
    userRole
  } = req.body;
  const partner = db.partners.find((p) => p.partner_id === id);
  if (!partner) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken
  );
  const docObj = partner.daftar_dokumen_dd.find((d) => d.nama === docName);
  const currentFilesCount = (docObj?.files || []).length;
  const finalFileName = fileName || formatDueDiligenceFileName({
    vendorName: partner.nama_partner,
    documentName: docName,
    documentDate: tanggalKadaluarsa || (/* @__PURE__ */ new Date()).toISOString(),
    sequence: currentFilesCount + 1,
    rawFileName: "document.pdf"
  });
  let driveLink = "";
  if (fileData && typeof fileData === "string" && fileData.includes("base64,")) {
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder DD",
          token
        );
        const mimeType = getMimeType(finalFileName);
        const driveUrl = await uploadFileToDrive(
          finalFileName,
          fileData,
          mimeType,
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          driveLink = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah dokumen DD '${finalFileName}' untuk vendor '${partner.nama_partner}' ke Google Drive`,
            req
          );
        } else {
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_FAILED",
            "PARTNER",
            `Gagal mengunggah dokumen DD '${finalFileName}' untuk vendor '${partner.nama_partner}' ke Google Drive: Respon URL Drive tidak valid`,
            req
          );
        }
      } catch (err) {
        console.error("Drive upload DD doc error:", err);
        addActivityLog(
          userEmail || "user@app",
          userName || "User",
          userRole || "Legal",
          "UPLOAD_FAILED",
          "PARTNER",
          `Gagal mengunggah dokumen DD '${finalFileName}' untuk vendor '${partner.nama_partner}' ke Google Drive: ${err?.message || "Error koneksi Google Drive"}`,
          req
        );
      }
    } else {
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Legal",
        "UPLOAD_FAILED",
        "PARTNER",
        `Gagal mengunggah dokumen DD '${finalFileName}' untuk vendor '${partner.nama_partner}' ke Google Drive: Token Google Drive tidak ditemukan (Sesi belum terhubung)`,
        req
      );
    }
  }
  partner.daftar_dokumen_dd = partner.daftar_dokumen_dd.map((doc) => {
    if (doc.nama === docName) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const newFileItem = driveLink ? {
        id: "dd_file_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        fileName: finalFileName,
        linkDrive: driveLink,
        uploadedAt: nowIso,
        year: (/* @__PURE__ */ new Date()).getFullYear().toString(),
        tanggalKadaluarsa: tanggalKadaluarsa || ""
      } : null;
      const existingFiles = doc.files || [];
      if (existingFiles.length === 0 && doc.linkDrive && doc.linkDrive !== driveLink && doc.linkDrive.includes("drive.google.com")) {
        existingFiles.push({
          id: "dd_file_prev_" + Date.now(),
          fileName: `${doc.nama} (Versi Sebelumnya).pdf`,
          linkDrive: doc.linkDrive,
          uploadedAt: doc.uploadedAt || nowIso,
          year: doc.uploadedAt ? new Date(doc.uploadedAt).getFullYear().toString() : "",
          tanggalKadaluarsa: doc.tanggalKadaluarsa || ""
        });
      }
      const updatedFiles = newFileItem ? [
        newFileItem,
        ...existingFiles.filter((f) => f.linkDrive !== driveLink)
      ] : existingFiles;
      return {
        ...doc,
        status: updatedFiles.length > 0 ? "Ada" : "Belum",
        nomorDokumen: nomorDokumen || doc.nomorDokumen || "",
        tanggalKadaluarsa: tanggalKadaluarsa || doc.tanggalKadaluarsa,
        linkDrive: driveLink || doc.linkDrive || "",
        uploadedAt: driveLink ? nowIso : doc.uploadedAt,
        files: updatedFiles
      };
    }
    return doc;
  });
  const wajibItems = partner.daftar_dokumen_dd.filter((d) => d.wajib);
  const adaWajib = wajibItems.filter((d) => d.status === "Ada");
  if (wajibItems.length > 0 && adaWajib.length === wajibItems.length) {
    partner.status_dd = "Lengkap";
    partner.tanggal_dd_diverifikasi = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  } else {
    partner.status_dd = "Belum Lengkap";
  }
  partner.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DD_UPDATE",
    "PARTNER",
    `Mengunggah dokumen DD '${docName}' untuk partner ${partner.nama_partner}`,
    req
  );
  triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, partner });
});
app.delete("/api/partners/:id/dd-file", async (req, res) => {
  const { id } = req.params;
  const { docName, fileId, userEmail, userName, userRole } = req.body;
  const partner = db.partners.find((p) => p.partner_id === id);
  if (!partner) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  partner.daftar_dokumen_dd = partner.daftar_dokumen_dd.map((doc) => {
    if (doc.nama === docName) {
      const remainingFiles = (doc.files || []).filter((f) => f.id !== fileId);
      const hasFiles = remainingFiles.length > 0;
      return {
        ...doc,
        files: remainingFiles,
        status: hasFiles ? "Ada" : "Belum",
        linkDrive: hasFiles ? remainingFiles[0].linkDrive : void 0,
        uploadedAt: hasFiles ? remainingFiles[0].uploadedAt : void 0
      };
    }
    return doc;
  });
  const wajibItems = partner.daftar_dokumen_dd.filter((d) => d.wajib);
  const adaWajib = wajibItems.filter((d) => d.status === "Ada");
  if (wajibItems.length > 0 && adaWajib.length === wajibItems.length) {
    partner.status_dd = "Lengkap";
    partner.tanggal_dd_diverifikasi = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  } else {
    partner.status_dd = "Belum Lengkap";
  }
  partner.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DELETE",
    "PARTNER",
    `Menghapus file dari dokumen DD '${docName}' partner ${partner.nama_partner}`,
    req
  );
  res.json({ success: true, partner });
});
app.post("/api/contracts/export-google-docs", async (req, res) => {
  try {
    const title = req.body.title || req.body.docTitle || "Partnership Agreement";
    const contentHtml = req.body.contentHtml || req.body.htmlContent || req.body.html;
    const partnerName = req.body.partnerName || req.body.partner_nama || req.body.partnerId;
    if (!title || !contentHtml) {
      return res.status(400).json({ error: "Title dan contentHtml wajib diisi." });
    }
    const token = await resolveActiveGoogleToken(
      req.headers["x-google-access-token"] || req.body.accessToken || db.googleConfig?.accessToken
    );
    const targetOrgId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.body.organizationId || db.activeTenantId || "org-adapundi";
    let targetFolderId = db.googleConfig?.driveFolderId;
    if (partnerName) {
      try {
        const partner = (db.partners || []).find(
          (p) => p.nama_partner?.toLowerCase() === String(partnerName).toLowerCase() || p.partner_id === partnerName
        );
        if (partner) {
          targetFolderId = await getPartnerCategoryFolderId(
            partner,
            "Folder Kontrak",
            token,
            targetOrgId
          );
        }
      } catch (fErr) {
        console.warn("Folder resolve fallback:", fErr);
      }
    }
    const docResult = await createGoogleDocInFolder(
      title,
      contentHtml,
      targetFolderId,
      token
    );
    res.json({
      success: true,
      documentId: docResult.id,
      documentUrl: docResult.documentUrl,
      webViewLink: docResult.documentUrl,
      data: {
        documentId: docResult.id,
        documentUrl: docResult.documentUrl,
        webViewLink: docResult.documentUrl
      }
    });
  } catch (error) {
    console.error("Error creating Google Doc:", error);
    res.status(500).json({
      error: error?.message || "Gagal membuat dokumen Google Docs."
    });
  }
});
app.get("/api/init-data", (req, res) => {
  const activeTenantId = (req.headers["x-organization-id"] || req.headers["x-tenant-id"] || req.query.tenantId || db.activeTenantId || "org-adapundi").toString();
  const filterTenant = req.query.all !== "true";
  const contracts = filterTenant ? (db.contracts || []).filter((c) => isMatchingOrg(c.organizationId, activeTenantId)) : db.contracts || [];
  const ios = filterTenant ? (db.ios || []).filter((i) => isMatchingOrg(i.organizationId, activeTenantId)) : db.ios || [];
  const partners = filterTenant ? (db.partners || []).filter((p) => isMatchingOrg(p.organizationId, activeTenantId)) : db.partners || [];
  const notifications = filterTenant ? (db.notifications || []).filter((n) => isMatchingOrg(n.organizationId, activeTenantId)) : db.notifications || [];
  const evaluations = filterTenant ? (db.evaluations || []).filter((e) => isMatchingOrg(e.organizationId, activeTenantId)) : db.evaluations || [];
  const spendings = filterTenant ? (db.spendings || []).filter((s) => isMatchingOrg(s.organizationId, activeTenantId)) : db.spendings || [];
  res.setHeader("Cache-Control", "no-store");
  res.json({
    contracts,
    ios,
    partners,
    notifications,
    googleConfig: db.googleConfig,
    evaluations,
    spendings,
    tenants: db.tenants || [],
    activeTenantId,
    timestamp: Date.now()
  });
});
app.get("/api/contracts", (req, res) => {
  const activeTenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || db.activeTenantId || "org-adapundi";
  const filterTenant = req.query.all !== "true";
  const contractsList = filterTenant ? (db.contracts || []).filter(
    (c) => isMatchingOrg(c.organizationId, activeTenantId)
  ) : db.contracts || [];
  const result = contractsList.map((c) => {
    const p = db.partners.find((part) => part.partner_id === c.partner_id);
    const cur = c.currency || "IDR";
    const amt = Number(c.nilai_kontrak) || 0;
    const usdVal = c.nilai_kontrak_usd !== void 0 && c.nilai_kontrak_usd !== null ? c.nilai_kontrak_usd : cur === "USD" ? amt : Math.round(amt * (cur === "IDR" ? 62e-6 : 1) * 100) / 100;
    return {
      ...c,
      currency: cur,
      nilai_kontrak_usd: usdVal,
      partner_nama: p ? p.nama_partner : c.partner_nama || "Partner N/A"
    };
  });
  res.json(result);
});
app.post("/api/contracts/parse", upload.single("file"), async (req, res) => {
  if (!getEffectiveGeminiApiKey()) {
    return res.status(400).json({
      error: "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser."
    });
  }
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }
    const inputHash = computeInputSha256(inputData);
    const cached = globalOcrCache.get(inputHash, "contracts");
    if (cached) {
      console.log(`[OCR Cache HIT] Returned cached contract parse result for hash ${inputHash.slice(0, 10)}...`);
      return res.json({
        ...cached,
        cached: true
      });
    }
    const startTime = Date.now();
    const prompt = `You are an expert legal contract analyst specializing in Indonesian and International corporate agreements, Master Service Agreements (PKS/MSA), and Addendums for PT Info Tekno Siaga (ITS / Adapundi).
Extract the following information from this contract document to fill out the contract registration form with maximum legal precision:

1. Jenis Dokumen (Key: "jenis_dokumen"): Tentukan apakah dokumen ini adalah "Agreement Addendum" (jika merupakan addendum/amandemen/perubahan/perpanjangan) atau "Master Agreement" (perjanjian induk/kerjasama standar).
2. Judul Kontrak (Key: "judul_kontrak"): Ekstrak judul lengkap resmi perjanjian (contoh: "Addendum of Advertising Agreement" atau "Perjanjian Kerjasama Periklanan").
3. Nama Partner / Vendor (Key: "nama_partner"): Ekstrak nama lengkap entitas partner/vendor pihak kedua (selain Adapundi / PT Info Tekno Siaga), contoh: "Hainan AdTiger Information Technology Co., Limited".
4. Nomor Kontrak (Key: "nomor_kontrak"): Ekstrak nomor registrasi resmi kontrak dari PT Info Tekno Siaga (ITS / Adapundi).
   === ATURAN EKSTRAKSI NOMOR KONTRAK ITS / ADAPUNDI ===
   Nomor kontrak ITS/Adapundi umumnya memiliki format baku:
   - Format PKS / Perjanjian Induk: "xx/PKS-ITS/xx/xxxx" atau "xx/PKS-ITS-[DIVISI]/xx/xxxx" (contoh: "01/PKS-ITS/XI/2024", "52/PKS-ITS/VII/2025", "24A/PKS-ITS/X/2022")
   - Format Addendum / Amandemen: "xx/ADD-ITS/xx/xxxx" atau "xx/ADD-ITS-[DIVISI]/xx/xxxx" (contoh: "01/ADD-ITS/XI/2024", "01A/ADD-ITS/I/2023", "02/ADD-ITS/XI/2024")
   PENTING: Di dalam dokumen sering terdapat 2 (dua) nomor kontrak yang berbeda (satu nomor dari pihak Adapundi/ITS dan satu nomor dari pihak Vendor/Partner). Anda WAJIB memprioritaskan dan memilih nomor kontrak resmi dari pihak ITS/Adapundi yang memuat unsur "PKS-ITS", "ADD-ITS", atau "ITS".
5. Nomor Kontrak Induk (Key: "nomor_kontrak_induk"): Jika dokumen ini adalah Addendum/Amandemen, ekstrak nomor perjanjian induk (Master Agreement) ITS yang diubah (contoh: "24A/PKS-ITS/X/2022"). Jika bukan addendum, isi dengan "".
6. Tanggal Mulai (Key: "tanggal_mulai"): Ekstrak tanggal efektif awal berlakunya perjanjian atau tanggal penandatanganan dokumen dalam format DD/MM/YYYY (contoh: "04/11/2024").
7. Tanggal Berakhir (Key: "tanggal_berakhir"): Ekstrak atau hitung tanggal berakhirnya perjanjian dalam format DD/MM/YYYY dengan PRESISI TINGGI.
   === ATURAN PRESISI PENETAPAN TANGGAL BERAKHIR PERJANJIAN ===
   a. KASUS A (Tanggal Akhir Tertulis Eksplisit): Jika dokumen secara tertulis menyebutkan tanggal berakhir secara spesifik tanpa perpanjangan otomatis tahun berikutnya, gunakan tanggal tersebut.
      - CONTOH: Tanggal awal adalah 4 November 2024 (04/11/2024), tertulis berakhir pada 3 November 2026 -> input end date: "03/11/2026".
   b. KASUS B (Durasi Relatif dari Awal Perjanjian): Jika dokumen menyebutkan durasi masa berlaku (misal: "berlaku untuk 1 (satu) tahun terhitung sejak tanggal mulai"), rumusnya adalah:
      Tanggal Berakhir = (Tanggal Mulai + Jangka Waktu Periode) - 1 Hari.
      - CONTOH: Tanggal awal adalah 4 November 2024 (04/11/2024) dan berlaku 1 tahun setelah awal perjanjian -> input end date: "03/11/2025".
      - CONTOH: Tanggal awal adalah 04/11/2024 dan berlaku 2 tahun -> input end date: "03/11/2026".
      - CONTOH: Tanggal awal adalah 04/11/2024 dan berlaku 6 bulan -> input end date: "03/05/2025".
   c. KASUS C (Berakhir pada Tanggal Tertentu + Perpanjangan Otomatis 1 Tahun): Jika dokumen tertulis berakhir pada tanggal tertentu dan berlaku perpanjangan otomatis 1 tahun berikutnya:
      - CONTOH: Tanggal awal 04/11/2024, tertulis berakhir pada 3 November 2026 dan berlaku perpanjangan otomatis 1 tahun berikutnya -> input end date: "03/11/2027", dan auto_renewal WAJIB true.
   d. KASUS D (Perpanjangan Otomatis Sampai Pengakhiran dari Salah Satu Pihak): Jika dokumen menyatakan diperpanjang otomatis secara terus-menerus sampai ada pengakhiran dari salah satu pihak (tacit renewal / until terminated by either party):
      - CONTOH: Tanggal awal 04/11/2024 dan diperpanjang otomatis sampai pengakhiran dari salah satu pihak -> input end date: "03/11/9999" (yaitu hari sebelum tanggal mulai pada tahun 9999), dan auto_renewal WAJIB true.
   e. Jika dokumen berupa Addendum Perpanjangan Waktu, hitung tanggal akhir baru dari tanggal akhir periode sebelumnya.
8. Klausul Jangka Waktu (Key: "klausul_jangka_waktu"): Kutip kalimat lengkap dari dokumen terkait pasal jangka waktu, periode masa berlaku, dan perpanjangan perjanjian (contoh: "Perjanjian ini berlaku untuk jangka waktu 1 (satu) tahun terhitung sejak tanggal 04 November 2024 dan akan otomatis diperpanjang...").
9. Durasi Perjanjian (Key: "durasi_perjanjian"): Ekstrak teks durasi masa berlaku perjanjian (contoh: "1 tahun", "6 bulan", "2 tahun", "3 bulan", "Sampai Pengakhiran").
10. Nilai Kontrak (Key: "nilai_kontrak"): Ekstrak nominal total komitmen kontrak jika disebutkan angka pasti (contoh: 50000000). Jika berbasis komisi berjalan/tarif variabel atau tidak tercantum angka pasti, kembalikan 0.
11. Mata Uang (Key: "currency"): "IDR" atau "USD".
12. Auto Renewal (Key: "auto_renewal"): Boolean true jika terdapat klausul perpanjangan otomatis tahunan/berkala atau berlaku sampai pengakhiran oleh salah satu pihak, atau false jika tidak ada.
13. Notice Period Hari (Key: "notice_period_hari"): Ekstrak batas waktu hari pemberitahuan awal untuk pengakhiran/perpanjangan (contoh: 30 atau 14). Default 30 jika tidak disebutkan spesifik.
14. Ringkasan Perubahan (Key: "ringkasan_perubahan"): Jika dokumen ini Addendum, buat ringkasan jelas pasal mana saja yang diubah dan isi perubahannya.
15. Field Yang Berubah (Key: "field_yang_berubah"): Array of string elemen/field yang diubah jika Addendum (pilih di antara: "Nilai Kontrak / IO", "Jangka Waktu Periode", "Ketentuan Komersial / Pembayaran", "Scope of Work / Deliverables", "Rekening Bank / Perpajakan", "Lainnya").
16. Internal Notes (Key: "internal_notes"):
Anda adalah seorang Ahli Hukum dan Legal Analyst senior. Tugas Anda adalah membaca dan menganalisis dokumen perjanjian/kontrak yang diberikan, lalu membuat ringkasan terstruktur dalam format Markdown.

PETUNJUK FORMAT DAN BATASAN KETAT:
1. ATURAN BEBAS TANDA KOMA (SANGAT PENTING):
   - DILARANG GUNAKAN TANDA KOMA (,) DI MANA PUN DALAM SELURUH TEKS OUTPUT INTERNAL NOTES.
   - Ganti fungsi tanda koma dengan kata hubung (seperti: dan, serta, atau), spasi, tanda kurung (), atau tanda hubung (-).
   - Aturan ini wajib dipatuhi agar hasil output tidak merusak struktur saat diimpor/dikonversi ke format CSV atau dimasukkan ke 1 sel Excel.

2. STRUKTUR DAN FORMAT OUTPUT:
   Gunakan struktur hirarki Markdown berikut secara eksak tanpa mengubah nama section/judul:

# RINGKASAN PERJANJIAN PEMANFAATAN APLIKASI [NAMA_APLIKASI/MITRA]

- Judul Perjanjian: [Judul Resmi Perjanjian]
- Nomor Perjanjian Pihak Pertama: [Nomor Surat/PKS Pihak Pertama]
- Nomor Perjanjian Pihak Kedua: [Nomor Surat/PKS Pihak Kedua]
- Tanggal Mulai Efektif: [Tanggal Efektif Perjanjian Berlaku]
- Tanggal Berakhir Efektif: [Tanggal Efektif Perjanjian Berakhir]
- Jangka Waktu Perjanjian: [Durasi Masa Berlaku Perjanjian]

## PARA PIHAK
1. Pihak Pertama ([Nama Singkat Pihak Pertama]): [Nama Legal PT Pihak Pertama]
   - Alamat: [Alamat Lengkap Tanpa Koma]
   - Perwakilan / Penandatangan: [Nama Penandatangan dan Jabatan]
   - Email Korespondensi: [Email Contact Person]

2. Pihak Kedua ([Nama Singkat Pihak Kedua]): [Nama Legal PT Pihak Kedua]
   - Alamat: [Alamat Lengkap Tanpa Koma]
   - Perwakilan / Penandatangan: [Nama Penandatangan dan Jabatan]
   - Email Korespondensi: [Email Contact Person]

## RUANG LINGKUP DAN TUJUAN KERJA SAMA
- [Poin 1: Inti tujuan kerja sama dan integrasi]
- [Poin 2: Peran teknis dan batasan fungsi masing-masing pihak]
- [Poin 3: Pembagian tanggung jawab operasional dan layanan pelanggan/CS]
- [Poin 4: Batasan tanggung jawab atas risiko hukum/pendanaan]

## KETENTUAN KOMERSIAL DAN SKEMA BIAYA ([KOMISI / BIAYA PLATFORM])
- [Poin rincian biaya / komisi untuk pengguna baru atau produk A]
- [Poin rincian biaya / komisi untuk pengguna berulang atau produk B]
- [Ketentuan Pembayaran: Tanggal jatuh tempo skema rekonsiliasi mata uang dan nomor rekening bank]
- [Ketentuan Pajak: PPN PPh dan tanggungan pajak masing-masing pihak]

## KETENTUAN EKSKLUSIVITAS DAN NON-KOMPETISI
- [Jelaskan klausul eksklusivitas atau non-kompetisi jika ada. Jika tidak ada tuliskan: Tidak diatur klausul eksklusivitas khusus dalam batang tubuh Perjanjian utama]

## KERAHASIAAN DAN PERLINDUNGAN DATA PRIBADI ([PASAL KERAHASIAAN])
- [Poin rincian acuan NDA jika ada]
- [Kewajiban menjaga Informasi Rahasia dan kepatuhan terhadap UU Pelindungan Data Pribadi]
- [Prosedur laporan Kegagalan Pelindungan Data dan penunjukan DPO/Audit Trail]

## HUKUM YANG BERLAKU DAN PENYELESAIAN SENGKETA ([PASAL SENGKETA])
- Hukum yang Berlaku: [Hukum Negara/Wilayah]
- Penyelesaian Sengketa: [Jelaskan tahapan musyawarah durasi hari dan lembaga arbitrase/pengadilan yang ditunjuk]

Return the result strictly as a valid JSON object matching the requested schema. If any string field is not found in the document, return an empty string "".`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt
    );
    console.log(
      `[PDF-Inspector Contract Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            jenis_dokumen: { type: import_genai.Type.STRING },
            judul_kontrak: { type: import_genai.Type.STRING },
            nama_partner: { type: import_genai.Type.STRING },
            nomor_kontrak: { type: import_genai.Type.STRING },
            nomor_kontrak_induk: { type: import_genai.Type.STRING },
            tanggal_mulai: { type: import_genai.Type.STRING },
            tanggal_berakhir: { type: import_genai.Type.STRING },
            klausul_jangka_waktu: { type: import_genai.Type.STRING },
            durasi_perjanjian: { type: import_genai.Type.STRING },
            nilai_kontrak: { type: import_genai.Type.NUMBER },
            currency: { type: import_genai.Type.STRING },
            auto_renewal: { type: import_genai.Type.BOOLEAN },
            notice_period_hari: { type: import_genai.Type.NUMBER },
            ringkasan_perubahan: { type: import_genai.Type.STRING },
            field_yang_berubah: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING }
            },
            internal_notes: { type: import_genai.Type.STRING }
          },
          required: ["internal_notes"]
        }
      }
    });
    const parsedData = JSON.parse(response.text);
    if (parsedData.tanggal_mulai) {
      parsedData.tanggal_mulai = normalizeParsedDate(parsedData.tanggal_mulai);
    }
    if (parsedData.tanggal_berakhir) {
      parsedData.tanggal_berakhir = normalizeParsedDate(
        parsedData.tanggal_berakhir
      );
    }
    const clauseText = `${parsedData.durasi_perjanjian || ""} ${parsedData.klausul_jangka_waktu || ""}`;
    const isPerpetualClause = /sampai pengakhiran|until terminated|salah satu pihak mengakhiri|terus menerus|tanpa batas|unlimited|perpetual/i.test(
      clauseText
    );
    if (isPerpetualClause && parsedData.tanggal_mulai) {
      parsedData.auto_renewal = true;
      const parts = parsedData.tanggal_mulai.split("-").map(Number);
      if (parts.length === 3) {
        const prevDay = new Date(parts[0], parts[1] - 1, parts[2]);
        prevDay.setDate(prevDay.getDate() - 1);
        const prevMonth = String(prevDay.getMonth() + 1).padStart(2, "0");
        const prevDate = String(prevDay.getDate()).padStart(2, "0");
        parsedData.tanggal_berakhir = `9999-${prevMonth}-${prevDate}`;
      }
    } else if (parsedData.tanggal_mulai && (!parsedData.tanggal_berakhir || parsedData.tanggal_berakhir === parsedData.tanggal_mulai || new Date(parsedData.tanggal_berakhir) <= new Date(parsedData.tanggal_mulai))) {
      const computedResult = computeContractEndDateFromDuration(
        parsedData.tanggal_mulai,
        clauseText || (parsedData.auto_renewal ? "1 tahun" : ""),
        Boolean(parsedData.auto_renewal)
      );
      if (computedResult) {
        parsedData.tanggal_berakhir = computedResult.endDate;
        if (computedResult.isAutoRenewal) {
          parsedData.auto_renewal = true;
        }
      }
    }
    if (parsedData.internal_notes) {
      parsedData.internal_notes = String(parsedData.internal_notes).replace(/,/g, " ").trim();
    }
    const durationMs = Date.now() - startTime;
    const responsePayload = {
      success: true,
      data: parsedData,
      performance: { durationMs, ...ocrStats }
    };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, "contracts", responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing contract:", error);
    res.status(500).json({
      error: error?.message || "Failed to parse contract document. Google AI model is currently busy, please try again."
    });
  }
});
app.get("/api/contracts/:id/redline-analysis", (req, res) => {
  const { id } = req.params;
  const contract = db.contracts.find((c) => c.contract_id === id);
  if (!contract) {
    return res.status(404).json({ error: "Kontrak tidak ditemukan." });
  }
  res.json({
    success: true,
    hasAnalysis: Boolean(contract.redline_analysis),
    analysis: contract.redline_analysis || null,
    analyzed_at: contract.redline_analyzed_at || null
  });
});
app.post("/api/contracts/:id/redline-analysis", async (req, res) => {
  const { id } = req.params;
  const contract = db.contracts.find((c) => c.contract_id === id);
  if (!contract) {
    return res.status(404).json({ error: "Kontrak tidak ditemukan." });
  }
  const force = Boolean(req.body.force);
  const hasCustomClause = Boolean(
    req.body.customClauseText && req.body.customClauseText.trim()
  );
  if (!force && !hasCustomClause && contract.redline_analysis) {
    return res.json({
      success: true,
      cached: true,
      analysis: contract.redline_analysis,
      analyzed_at: contract.redline_analyzed_at || contract.updated_at
    });
  }
  if (!getEffectiveGeminiApiKey()) {
    return res.status(400).json({
      error: "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser."
    });
  }
  const partner = db.partners.find((p) => p.partner_id === contract.partner_id);
  try {
    const selectedModel = getValidAiModel(req.body.model);
    const prompt = `Anda adalah seorang Senior Corporate Legal Counsel dan AI Contract Reviewer terkemuka.
Tugas Anda adalah melakukan analisis risiko mendalam (Risk & Compliance Analysis) serta memberikan rekomendasi revisi/redline (Contract Redlining) untuk kontrak komersial berikut:

=== INFORMASI KONTRAK ===
Nomor Kontrak: ${contract.nomor_kontrak}
Judul Kontrak: ${contract.judul_kontrak}
Jenis Dokumen: ${contract.jenis_dokumen || "Master Agreement"}
Partner / Vendor: ${contract.partner_nama || partner?.nama_partner || "-"}
Kategori Kerjasama: ${(contract.kategori_kerjasama || []).join(", ") || "-"}
Nilai Kontrak: ${contract.currency || "IDR"} ${Number(contract.nilai_kontrak || 0).toLocaleString("id-ID")}
Masa Berlaku: ${contract.tanggal_mulai} s/d ${contract.tanggal_berakhir} (Sisa: ${contract.sisa_hari ?? "-"} hari)
Perpanjangan Otomatis (Auto-Renewal): ${contract.auto_renewal ? "Ya (Aktif)" : "Tidak"}
Notice Period: ${contract.notice_period_hari || 30} hari (${contract.notice_type_required || "Notice of Termination/Extension"})
Catatan Internal / Ringkasan Klausul: ${contract.internal_notes || contract.ringkasan_perubahan || "Kontrak standar penyediaan jasa / kerjasama komersial B2B."}
Status Due Diligence Partner: ${partner?.status_dd || "Verified"}
${req.body.customClauseText ? `
Teks Tambahan / Draf Klausul Khusus:
${req.body.customClauseText}` : ""}

=== INSTRUKSI ANALISIS REDLINING ===
Lakukan penilaian kepatuhan hukum mendalam, risiko liabilitas, klausul pengakhiran (termination), ganti rugi (indemnification), kerahasiaan data (NDA/PDP), dan yurisdiksi penyelesaian sengketa berdasarkan hukum bisnis Indonesia, standar industri B2B, serta **Regulasi & Standar Kepatuhan Otoritas Jasa Keuangan (OJK)** (termasuk POJK Tata Kelola TI, POJK Kerja Sama Pihak Ketiga/Vendor Alih Daya, POJK Perlindungan Konsumen Sektor Jasa Keuangan, dan Hak Audit Regulator OJK).

Kembalikan hasil analisis dalam format JSON terstruktur dengan skema persis:
1. overallRiskScore: angka integer 0-100 (0-25: Sangat Aman/Rendah, 26-55: Sedang/Wajar, 56-75: Tinggi/Perlu Penyesuaian, 76-100: Kritis/Wajib Negosiasi Ulang).
2. riskLevel: string salah satu dari "LOW", "MEDIUM", "HIGH", "CRITICAL".
3. executiveSummary: string penjelasan menyeluruh posisi tawar hukum, kepatuhan regulasi OJK, dan ringkasan risiko kontrak (2-3 paragraf ringkas).
4. keyFindings: array string yang berisi 3-5 poin temuan paling krusial / klausul berisiko hukum maupun kepatuhan OJK.
5. analyzedClauses: array of objects yang menganalisis klausul-klausul utama, masing-masing berisi:
   - clauseTitle: string (misal: "Klausul Hak Audit & Pengawasan Regulator OJK", "Klausul Pembatasan Tanggung Jawab (Limitation of Liability)", "Klausul Terminasi & Notice Period", "Klausul Perlindungan Data Finansial (POJK & UU PDP)", "Klausul Ganti Rugi Sepihak (Indemnity)", "Klausul Keberlangsungan Layanan (SLA & BCP)")
   - riskCategory: string (misal: "Kepatuhan OJK", "Liabilitas", "Terminasi", "Keamanan Data", "Finansial", "Hukum Perdata")
   - severity: string ("LOW", "MEDIUM", "HIGH", "CRITICAL")
   - originalTextOrIssue: string (bunyi isu klausul yang berisiko atau klausul yang memberatkan)
   - identifiedRisk: string (penjelasan detail dampak hukum / risiko sanksi OJK / kerugian operasional bagi perusahaan)
   - recommendedRedline: string (draf usulan revisi/redlining klausul yang seimbang, profesional, dan memenuhi standar kepatuhan regulasi OJK)
   - legalRationale: string (dasar hukum POJK / UU atau argumen negosiasi yang dapat disampaikan ke mitra)
6. complianceChecklist: array of objects minimal 5-6 item mencakup aspek OJK:
   - item: string (wajib mencakup: "Kepatuhan Regulasi OJK (POJK Kerja Sama Pihak Ketiga & Tata Kelola IT)", "Klausul Hak Audit & Pemeriksaan Regulator OJK", "Kepatuhan Perlindungan Data & Kerahasiaan Finansial (POJK / UU PDP)", "Kejelasan Mekanisme Notice Period & Auto-Renewal", "Kepatuhan Hukum Indonesia (UU ITE & KUHPerdata)", "Klausul Penyelesaian Sengketa (BANI / Pengadilan Indonesia)")
   - status: string ("COMPLIANT", "NEEDS_REVIEW", "NON_COMPLIANT")
   - notes: string (penjelasan detail hasil telaah kesesuaian klausul kontrak terhadap aturan OJK dan hukum positif)
`;
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            overallRiskScore: { type: import_genai.Type.INTEGER },
            riskLevel: { type: import_genai.Type.STRING },
            executiveSummary: { type: import_genai.Type.STRING },
            keyFindings: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING } },
            analyzedClauses: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  clauseTitle: { type: import_genai.Type.STRING },
                  riskCategory: { type: import_genai.Type.STRING },
                  severity: { type: import_genai.Type.STRING },
                  originalTextOrIssue: { type: import_genai.Type.STRING },
                  identifiedRisk: { type: import_genai.Type.STRING },
                  recommendedRedline: { type: import_genai.Type.STRING },
                  legalRationale: { type: import_genai.Type.STRING }
                },
                required: [
                  "clauseTitle",
                  "severity",
                  "originalTextOrIssue",
                  "identifiedRisk",
                  "recommendedRedline",
                  "legalRationale"
                ]
              }
            },
            complianceChecklist: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  item: { type: import_genai.Type.STRING },
                  status: { type: import_genai.Type.STRING },
                  notes: { type: import_genai.Type.STRING }
                },
                required: ["item", "status", "notes"]
              }
            }
          },
          required: [
            "overallRiskScore",
            "riskLevel",
            "executiveSummary",
            "keyFindings",
            "analyzedClauses",
            "complianceChecklist"
          ]
        }
      }
    });
    const parsed = JSON.parse(response.text);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    parsed.analyzed_at = nowIso;
    contract.redline_analysis = parsed;
    contract.redline_analyzed_at = nowIso;
    contract.updated_at = nowIso;
    saveDb();
    res.json({
      success: true,
      cached: false,
      analysis: parsed,
      analyzed_at: nowIso
    });
  } catch (error) {
    console.error("Error during redline analysis:", error);
    res.status(500).json({
      error: error?.message || "Gagal melakukan analisis redline AI. Silakan coba kembali."
    });
  }
});
app.get("/api/templates", (req, res) => {
  try {
    res.json(db.templates || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/templates", (req, res) => {
  try {
    const { id, name, contentId } = req.body;
    if (!name || !contentId) {
      return res.status(400).json({ error: "Name and content are required." });
    }
    const templateId = id || `tpl-${Date.now()}`;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (!db.templates) {
      db.templates = [];
    }
    const existingIndex = db.templates.findIndex((t) => t.id === templateId);
    const templateData = {
      id: templateId,
      name,
      contentId,
      createdAt: existingIndex >= 0 ? db.templates[existingIndex].createdAt : nowIso,
      updatedAt: nowIso
    };
    if (existingIndex >= 0) {
      db.templates[existingIndex] = templateData;
    } else {
      db.templates.push(templateData);
    }
    saveDb();
    res.json({ success: true, template: templateData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/templates/:id", (req, res) => {
  try {
    const { id } = req.params;
    if (!db.templates) {
      db.templates = [];
    }
    const index = db.templates.findIndex((t) => t.id === id);
    if (index >= 0) {
      db.templates.splice(index, 1);
      saveDb();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Template not found." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/translate-template", async (req, res) => {
  try {
    const { contentId } = req.body;
    if (!contentId) {
      return res.status(400).json({ error: "Content to translate is required." });
    }
    const client = getGenAIClient();
    const model = "gemini-3.8-flash";
    const prompt = `You are an expert bilingual legal counsel and professional legal translator specializing in Indonesian and English commercial contracts.

Translate the following Indonesian contract HTML content into professional, precise English.

CRITICAL INSTRUCTIONS:
1. You MUST preserve all HTML tags and structures exactly as they are.
2. Specifically, you MUST preserve all elements with class 'fillable-slot' (e.g., <span class="fillable-slot" data-slot-key="..." ...><span class="slot-text">...</span></span>) exactly as they are in the translated HTML.
3. Do NOT translate or modify any attributes of HTML tags (like data-slot-key, data-slot-type, contenteditable, style, class, id, etc.). Keep them exactly identical.
4. Keep the inner content of <span class="slot-text">...</span> untouched so that the form variables map perfectly.
5. Translate the rest of the surrounding Indonesian legal text into formal English suitable for a side-by-side bilingual commercial agreement.
6. Return ONLY the translated HTML content. Do NOT wrap the output in markdown code blocks like \`\`\`html or \`\`\`. Do NOT include any introductory or concluding remarks. Just output the clean HTML string.

Indonesian HTML to translate:
${contentId}`;
    const response = await client.models.generateContent({
      model,
      contents: prompt
    });
    let translatedHtml = response.text || "";
    if (translatedHtml.includes("```html")) {
      translatedHtml = translatedHtml.split("```html")[1].split("```")[0];
    } else if (translatedHtml.includes("```")) {
      translatedHtml = translatedHtml.split("```")[1].split("```")[0];
    }
    res.json({ success: true, translatedHtml: translatedHtml.trim() });
  } catch (err) {
    console.error("Translation error:", err);
    res.status(500).json({ error: err?.message || "Gagal menerjemahkan template menggunakan AI." });
  }
});
app.post("/api/contracts", async (req, res) => {
  const {
    nomor_kontrak,
    judul_kontrak,
    partner_id,
    jenis_dokumen,
    parent_contract_id,
    parent_contract_nomor,
    kategori_kerjasama,
    tanggal_mulai,
    tanggal_berakhir,
    currency,
    nilai_kontrak,
    nilai_kontrak_usd: req_usd,
    auto_renewal,
    notice_period_hari,
    notice_type_required,
    status_approval,
    status,
    pic_internal,
    internal_notes,
    field_yang_berubah,
    ringkasan_perubahan,
    fileName,
    fileData,
    userEmail,
    userName,
    userRole
  } = req.body;
  if (!nomor_kontrak || !judul_kontrak || !partner_id || !tanggal_mulai || !tanggal_berakhir) {
    return res.status(400).json({
      error: "Nomor Kontrak, Judul, Partner, dan Tanggal Mula/Selesai wajib diisi."
    });
  }
  if (new Date(tanggal_berakhir) <= new Date(tanggal_mulai)) {
    return res.status(400).json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  const existingContractDup = db.contracts.find(
    (c) => c.nomor_kontrak.trim().toLowerCase() === nomor_kontrak.trim().toLowerCase()
  );
  if (existingContractDup) {
    return res.status(400).json({
      error: `Nomor Kontrak '${nomor_kontrak}' sudah terdaftar dalam sistem.`
    });
  }
  const targetOrgId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.body.organizationId || db.activeTenantId || "org-adapundi";
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId
  );
  const partner = db.partners.find((p) => p.partner_id === partner_id);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken
  );
  const cur = (currency || "IDR").toUpperCase();
  const amt = Number(nilai_kontrak) || 0;
  let total_usd = req_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
      try {
        const sheetId = targetTenant?.spreadsheetId || db.googleConfig?.spreadsheetId;
        rate = await getHistoricalExchangeRate(
          sheetId,
          token,
          cur,
          tanggal_mulai
        );
      } catch (e) {
        console.error("Failed fetching historical rate for contract:", e);
      }
      total_usd = Math.round(amt * rate * 100) / 100;
    }
  }
  const targetFileName = formatContractFileName({
    partnerName: partner?.nama_partner,
    documentType: jenis_dokumen || "Master Agreement",
    contractNumber: nomor_kontrak,
    startDate: tanggal_mulai,
    rawFileName: fileName || `${nomor_kontrak}.pdf`
  });
  let link_file_kontrak = "";
  if (fileData && typeof fileData === "string" && fileData.includes("base64,")) {
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Contract",
          token,
          targetOrgId
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          link_file_kontrak = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_SUCCESS",
            "CONTRACT",
            `Berhasil mengunggah file Kontrak '${targetFileName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload contract error:", err?.message);
      }
    }
    if (!link_file_kontrak) {
      link_file_kontrak = saveLocalFile(
        partner?.nama_partner,
        "Folder Contract",
        targetFileName,
        fileData,
        targetTenant?.name
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Legal",
        "UPLOAD_SUCCESS",
        "CONTRACT",
        `File Kontrak '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
  }
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  let finalTanggalBerakhir = tanggal_berakhir;
  const isAutoRenew = Boolean(auto_renewal);
  if (isAutoRenew && tanggal_mulai && finalTanggalBerakhir && status !== "Terminated") {
    let currentEnd = new Date(finalTanggalBerakhir);
    currentEnd.setHours(0, 0, 0, 0);
    const startDate = new Date(tanggal_mulai);
    let durationYears = 1;
    if (!isNaN(startDate.getTime()) && !isNaN(currentEnd.getTime())) {
      const diffYears = currentEnd.getFullYear() - startDate.getFullYear();
      durationYears = Math.max(1, diffYears || 1);
    }
    while (currentEnd.getTime() < today.getTime()) {
      currentEnd.setFullYear(currentEnd.getFullYear() + durationYears);
    }
    finalTanggalBerakhir = `${currentEnd.getFullYear()}-${String(currentEnd.getMonth() + 1).padStart(2, "0")}-${String(currentEnd.getDate()).padStart(2, "0")}`;
  }
  const end = new Date(finalTanggalBerakhir);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24)
  );
  let finalStatus = status === "Terminated" ? "Terminated" : "Aktif";
  if (finalStatus !== "Terminated") {
    if (diffDays < 0) {
      finalStatus = isAutoRenew ? "Aktif" : "Expired";
    } else if (diffDays <= 90) {
      finalStatus = "Akan Berakhir";
    } else {
      finalStatus = "Aktif";
    }
  }
  const newContract = {
    contract_id: generateNextContractId(),
    organizationId: targetOrgId,
    jenis_dokumen: jenis_dokumen || "Master Agreement",
    parent_contract_id: jenis_dokumen === "Agreement Addendum" ? parent_contract_id : void 0,
    parent_contract_nomor: jenis_dokumen === "Agreement Addendum" ? parent_contract_nomor : void 0,
    nomor_kontrak,
    judul_kontrak,
    partner_id,
    partner_nama: partner ? partner.nama_partner : "Partner",
    kategori_kerjasama: Array.isArray(kategori_kerjasama) ? kategori_kerjasama : ["Umum"],
    tanggal_mulai,
    tanggal_berakhir: finalTanggalBerakhir,
    currency: cur,
    nilai_kontrak: amt,
    nilai_kontrak_usd: Number(total_usd),
    auto_renewal: isAutoRenew,
    notice_period_hari: Number(notice_period_hari) || 30,
    notice_type_required: notice_type_required || "Termination",
    status: finalStatus,
    status_approval: status_approval || "Aktif",
    pic_internal: pic_internal || "Legal Team",
    internal_notes: internal_notes ? String(internal_notes).trim() : void 0,
    link_file_kontrak,
    fileName: targetFileName,
    field_yang_berubah: Array.isArray(field_yang_berubah) ? field_yang_berubah : void 0,
    ringkasan_perubahan: ringkasan_perubahan || void 0,
    sisa_hari: diffDays,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.contracts.unshift(newContract);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "CREATE",
    "CONTRACT",
    `Membuat Kontrak Baru '${nomor_kontrak}' (${judul_kontrak}) senilai Rp ${Number(nilai_kontrak).toLocaleString("id-ID")}`,
    req
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, contract: newContract });
});
app.put("/api/contracts/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole, fileData, fileName, ...updates } = req.body;
  const idx = db.contracts.findIndex((c) => c.contract_id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Kontrak tidak ditemukan." });
  }
  const existing = db.contracts[idx];
  const updated = {
    ...existing,
    ...updates,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const cur = (updated.currency || existing.currency || "IDR").toUpperCase();
  const amt = Number(updated.nilai_kontrak) || 0;
  let total_usd = updates.nilai_kontrak_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
      try {
        const token = await resolveActiveGoogleToken(
          req.headers["x-google-access-token"] || req.body.accessToken
        );
        const startDate = updated.tanggal_mulai || existing.tanggal_mulai;
        rate = await getHistoricalExchangeRate(
          db.googleConfig.spreadsheetId,
          token,
          cur,
          startDate
        );
      } catch (e) {
        console.error("Failed fetching rate for edit contract:", e);
      }
      total_usd = Math.round(amt * rate * 100) / 100;
    }
  }
  updated.currency = cur;
  updated.nilai_kontrak = amt;
  updated.nilai_kontrak_usd = Number(total_usd);
  if (updated.tanggal_mulai && updated.tanggal_berakhir && new Date(updated.tanggal_berakhir) <= new Date(updated.tanggal_mulai)) {
    return res.status(400).json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  if (updated.nomor_kontrak) {
    const dup = db.contracts.find(
      (c) => c.nomor_kontrak.trim().toLowerCase() === updated.nomor_kontrak.trim().toLowerCase() && c.contract_id !== id
    );
    if (dup) {
      return res.status(400).json({
        error: `Nomor Kontrak '${updated.nomor_kontrak}' sudah digunakan oleh kontrak lain.`
      });
    }
  }
  if (fileData && typeof fileData === "string" && fileData.includes("base64,")) {
    const partner = db.partners.find(
      (p) => p.partner_id === updated.partner_id
    );
    const targetFileName = formatContractFileName({
      partnerName: partner?.nama_partner,
      documentType: updated.jenis_dokumen || "Master Agreement",
      contractNumber: updated.nomor_kontrak,
      startDate: updated.tanggal_mulai,
      rawFileName: fileName || updated.fileName || `${updated.nomor_kontrak}.pdf`
    });
    const token = await resolveActiveGoogleToken(
      req.headers["x-google-access-token"] || req.body.accessToken
    );
    let link_file_kontrak = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Contract",
          token
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          link_file_kontrak = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_SUCCESS",
            "CONTRACT",
            `Berhasil mengunggah ulang file Kontrak '${targetFileName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload contract edit error:", err?.message);
      }
    }
    if (!link_file_kontrak) {
      link_file_kontrak = saveLocalFile(
        partner?.nama_partner,
        "Folder Contract",
        targetFileName,
        fileData
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Legal",
        "UPLOAD_SUCCESS",
        "CONTRACT",
        `File Kontrak '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
    updated.link_file_kontrak = link_file_kontrak;
    updated.fileName = targetFileName;
  }
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  if (updated.auto_renewal && updated.tanggal_mulai && updated.tanggal_berakhir && updated.status !== "Terminated") {
    let currentEnd = new Date(updated.tanggal_berakhir);
    currentEnd.setHours(0, 0, 0, 0);
    const startDate = new Date(updated.tanggal_mulai);
    let durationYears = 1;
    if (!isNaN(startDate.getTime()) && !isNaN(currentEnd.getTime())) {
      const diffYears = currentEnd.getFullYear() - startDate.getFullYear();
      durationYears = Math.max(1, diffYears || 1);
    }
    while (currentEnd.getTime() < today.getTime()) {
      currentEnd.setFullYear(currentEnd.getFullYear() + durationYears);
    }
    updated.tanggal_berakhir = `${currentEnd.getFullYear()}-${String(currentEnd.getMonth() + 1).padStart(2, "0")}-${String(currentEnd.getDate()).padStart(2, "0")}`;
  }
  const end = new Date(updated.tanggal_berakhir);
  end.setHours(0, 0, 0, 0);
  updated.sisa_hari = Math.ceil(
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24)
  );
  if (updated.status !== "Terminated") {
    if (updated.sisa_hari < 0)
      updated.status = updated.auto_renewal ? "Aktif" : "Expired";
    else if (updated.sisa_hari <= 90) updated.status = "Akan Berakhir";
    else updated.status = "Aktif";
  }
  db.contracts[idx] = updated;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "UPDATE",
    "CONTRACT",
    `Memperbarui data Kontrak '${updated.nomor_kontrak}'`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, contract: updated });
});
app.delete("/api/contracts/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const ctr = db.contracts.find((c) => c.contract_id === id);
  if (!ctr) return res.status(404).json({ error: "Kontrak tidak ditemukan." });
  db.contracts = db.contracts.filter((c) => c.contract_id !== id);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Admin",
    "DELETE",
    "CONTRACT",
    `Menghapus Kontrak '${ctr.nomor_kontrak}' (${ctr.judul_kontrak})`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.get("/api/ios", (req, res) => {
  const activeTenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || db.activeTenantId || "org-adapundi";
  const filterTenant = req.query.all !== "true";
  const iosList = filterTenant ? (db.ios || []).filter(
    (i) => isMatchingOrg(i.organizationId, activeTenantId)
  ) : db.ios || [];
  const result = iosList.map((io) => {
    const p = db.partners.find((part) => part.partner_id === io.partner_id);
    const c = db.contracts.find((ctr) => ctr.contract_id === io.contract_id);
    const cur = io.currency || "IDR";
    const amt = Number(io.nilai_io) || 0;
    const usdVal = io.nilai_io_usd !== void 0 && io.nilai_io_usd !== null ? io.nilai_io_usd : cur === "USD" ? amt : Math.round(amt * (cur === "IDR" ? 62e-6 : 1) * 100) / 100;
    return {
      ...io,
      currency: cur,
      nilai_io_usd: usdVal,
      partner_nama: p ? p.nama_partner : io.partner_nama || "Partner",
      contract_nomor: c ? c.nomor_kontrak : io.contract_nomor || "-"
    };
  });
  res.json(result);
});
app.post("/api/ios/parse", upload.single("file"), async (req, res) => {
  if (!getEffectiveGeminiApiKey()) {
    return res.status(400).json({
      error: "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser."
    });
  }
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }
    const inputHash = computeInputSha256(inputData);
    const cached = globalOcrCache.get(inputHash, "ios");
    if (cached) {
      console.log(`[OCR Cache HIT] Returned cached IO parse result for hash ${inputHash.slice(0, 10)}...`);
      return res.json({
        ...cached,
        cached: true
      });
    }
    const startTime = Date.now();
    const prompt = `You are an expert advertising and media Insertion Order (IO) / agreement analyst. Extract the following information from this Insertion Order (IO) or agreement document:

1. Nomor IO (Key: "nomor_io"): Ekstrak nomor dokumen Insertion Order (IO) jika dokumen merupakan IO. Jika dokumen berupa PKS/Perjanjian Kerjasama tanpa lembar IO terpisah, kembalikan "-".
2. Judul Campaign / IO (Key: "judul_io"): Ekstrak judul campaign/kegiatan atau nama order IO.
3. Nama Partner / Vendor (Key: "nama_partner"): Ekstrak nama entitas media vendor / partner publisher yang ditunjuk.
4. Nomor Kontrak Terkait (Key: "contract_nomor"): Ekstrak nomor PKS/kontrak induk yang dirujuk jika ada.
5. Kanal Media (Key: "kanal_media"): Ekstrak platform, aplikasi, atau kanal media tempat layanan/iklan diintegrasikan atau ditampilkan (contoh: "Aplikasi Flip"). Kembalikan "-" jika tidak disebutkan.
6. Model Harga (Key: "pricing_model"): Tentukan model komersial/harga dari klausul Biaya dan Komisi. Pilih salah satu dari: "Commission Fee", "CPM", "CPC", "Flat Fee", "Revenue Share", atau "Fixed Package".
7. Detail Harga (Key: "pricing_detail"): Ekstrak rincian tarif komisi/biaya per unit/kategori yang disepakati secara lengkap beserta nominalnya (contoh: "Rp165.000 per pinjaman Penerima Dana Baru\\nRp50.000 per pinjaman Penerima Dana Berulang").
8. Tanggal Mulai IO (Key: "tanggal_mulai"): Ekstrak tanggal mulai periode kampanye spesifik pada IO jika ada dalam format DD/MM/YYYY. Jika tidak tertera terpisah dari kontrak utama, kembalikan "-".
9. Tanggal Selesai IO (Key: "tanggal_berakhir"): Ekstrak atau hitung tanggal selesai periode kampanye spesifik pada IO dalam format DD/MM/YYYY.
   - Jika tertulis tanggal selesai eksplisit (contoh: "31/12/2024"), kembalikan tanggal tersebut.
   - Jika tertulis durasi (misal: "berlaku selama 1 bulan sejak 01/06/2023" atau "jangka waktu 3 bulan"), hitung Tanggal Selesai = (Tanggal Mulai + Durasi) - 1 Hari (contoh: 30/06/2023 atau 31/08/2023).
   - Jika tidak tertera, kembalikan "-".
10. Durasi Campaign (Key: "durasi_campaign"): Ekstrak durasi periode penayangan/kampanye IO (contoh: "1 bulan", "3 bulan", "14 hari", "1 tahun").
11. Total Nilai IO (Key: "nilai_io"): Ekstrak total nilai pemesanan IO dalam bentuk angka murni tanpa simbol mata uang/pemisah ribuan. Jika berbasis komisi berjalan / variabel (tidak ada nominal pasti/cap), kembalikan null atau 0.
12. Deliverables / KPI / Structured Deliverables Details (Key: "deliverables"):
Anda adalah seorang Digital Marketing & Legal Operation Specialist. Tugas Anda adalah membaca dokumen Insertion Order (IO) / Media Order / Perintah Penyisipan Periklanan yang diberikan, lalu mengekstrak informasinya menjadi ringkasan terstruktur dalam format Markdown.

PETUNJUK FORMAT DAN BATASAN KETAT:
1. ATURAN BEBAS TANDA KOMA (SANGAT PENTING):
   - DILARANG MENGGUNAKAN TANDA KOMA (,) DI MANA PUN DALAM SELURUH TEKS OUTPUT.
   - Ganti fungsi tanda koma dengan kata hubung (seperti: dan, serta, atau), spasi, tanda kurung (), atau tanda hubung (-).
   - Aturan ini wajib dipatuhi agar hasil output tidak merusak struktur saat diimpor/dikonversi ke format CSV atau dimasukkan ke 1 sel Excel.

2. ATURAN BEBAS SITASI:
   - DILARANG MENAMBAHKAN PENANDA SITASI ATAU CITATION DI DALAM HASIL OUTPUT.

3. STRUKTUR DAN FORMAT OUTPUT:
   Gunakan struktur hirarki Markdown berikut secara eksak tanpa mengubah nama section/judul:

# RINGKASAN INSERTION ORDER (IO) PERIKLANAN

- Nama Dokumen: [Nama Resmi Dokumen / Insertion Order]
- Nomor Annex / IO: [Nomor IO atau Nomor Referensi Dokumen]
- Perjanjian Induk: [Nama Perjanjian Induk beserta Tanggal Perjanjian/Addendum jika ada]
- Tanggal Mulai (Start Date): [Tanggal Mulai Kampanye/IO]
- Tanggal Berakhir (End Date): [Tanggal Berakhir Kampanye/IO]

## PARA PIHAK
1. Penyedia Layanan (Service Provider / Vendor): [Nama Perusahaan Vendor]
   - Kontak Person: [Nama Kontak dan Jabatan]
   - Email Korespondensi: [Email Contact Person Vendor]

2. Klien / Pemilik Kampanye: [Nama Perusahaan Klien]
   - Perwakilan / Penandatangan: [Nama Penandatangan dan Jabatan]
   - Email Korespondensi: [Email Contact Person Klien]
   - Alamat Faktur: [Alamat Pengiriman Invoice Klien Tanpa Koma]

## RINCIAN KAMPANYE DAN MODEL BISNIS
- Wilayah Target (Geographic): [Wilayah Target Kampanye]
- Jenis Layanan: [Jenis Layanan Periklanan]
- Platform: [Platform yang digunaan misal: Meta TikTok Google atau Dikonfirmasi via email]
- Mata Uang: [Mata Uang Transaksi]
- Model Bisnis (Business Model): [CPA / CPM / CPC / N/A]
- Jenis Pengenaan (Charging Type): [Detail Jenis Pengenaan / N/A]
- Definisi Alur Konversi CPA: [Jelaskan urutan alur konversi dari angka 1 hingga selesai jika ada model CPA. Jika tidak ada tuliskan: N/A]

## SKEMA HARGA DAN KETENTUAN KOMERSIAL (UNIT PRICE / BIAYA LAYANAN & REBATE)
- Anggaran Media (Media Budget): [Total Anggaran Media / Terbuka (Open) / N/A]
- Harga Satuan / Tiered Pricing: [Rincian Harga Satuan per tier volume jika ada / N/A]
- Biaya Layanan (Service Fee): [Rincian persentase atau biaya layanan per platform jika ada / N/A]
- Kebijakan Potongan Harga (Rebate Policy): [Rincian syarat dan persentase rebate per platform jika ada / N/A]
- Catatan Pembayaran: [Kondisi atau pemicu pembayaran / N/A]

## KETENTUAN PEMBAYARAN DAN FAKTUR (PAYMENT TERMS)
- Tipe Pembayaran: [Pasca-bayar (Post-payment) / Pra-bayar (Pre-payment)]
- Metode Pembayaran: [Tenggat waktu pembayaran sejak invoice diterima beserta syarat faktur valid]
- Catatan Tambahan: [Catatan khusus mengenai faktur atau penagihan / N/A]

---

PROSES DOKUMEN IO DENGAN KETENTUAN DI ATAS DAN BERIKAN OUTPUT HANYA TEKS MARKDOWN TERSEBUT.

Return the result strictly as a valid JSON object matching the requested schema.`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt
    );
    console.log(
      `[PDF-Inspector IO Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            nomor_io: { type: import_genai.Type.STRING },
            judul_io: { type: import_genai.Type.STRING },
            nama_partner: { type: import_genai.Type.STRING },
            contract_nomor: { type: import_genai.Type.STRING },
            kanal_media: { type: import_genai.Type.STRING },
            pricing_model: { type: import_genai.Type.STRING },
            tanggal_mulai: { type: import_genai.Type.STRING },
            tanggal_berakhir: { type: import_genai.Type.STRING },
            durasi_campaign: { type: import_genai.Type.STRING },
            nilai_io: { type: import_genai.Type.NUMBER },
            deliverables: { type: import_genai.Type.STRING }
          }
        }
      }
    });
    const parsedData = JSON.parse(response.text);
    if (parsedData.tanggal_mulai) {
      parsedData.tanggal_mulai = normalizeParsedDate(parsedData.tanggal_mulai);
    }
    if (parsedData.tanggal_berakhir) {
      parsedData.tanggal_berakhir = normalizeParsedDate(
        parsedData.tanggal_berakhir
      );
    }
    if (parsedData.tanggal_mulai && (!parsedData.tanggal_berakhir || parsedData.tanggal_berakhir === parsedData.tanggal_mulai || new Date(parsedData.tanggal_berakhir) <= new Date(parsedData.tanggal_mulai))) {
      const computedEnd = computeContractEndDateFromDuration(
        parsedData.tanggal_mulai,
        parsedData.durasi_campaign || ""
      );
      if (computedEnd) {
        parsedData.tanggal_berakhir = computedEnd;
      }
    }
    if (parsedData.nilai_io === null || parsedData.nilai_io === void 0 || isNaN(parsedData.nilai_io)) {
      parsedData.nilai_io = 0;
    }
    if (parsedData.deliverables) {
      parsedData.deliverables = String(parsedData.deliverables).replace(/,/g, " ").trim();
    }
    const durationMs = Date.now() - startTime;
    const responsePayload = {
      success: true,
      data: parsedData,
      performance: { durationMs, ...ocrStats }
    };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, "ios", responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing IO:", error);
    res.status(500).json({
      error: error?.message || "Failed to parse IO document. Google AI model is currently busy, please try again."
    });
  }
});
app.post("/api/ios", async (req, res) => {
  const {
    contract_id,
    nomor_io,
    judul_io,
    partner_id,
    kanal_media,
    tanggal_mulai,
    tanggal_berakhir,
    pricing_model,
    charging_type,
    currency,
    nilai_io,
    nilai_io_usd: req_usd,
    deliverables,
    notice_period_hari,
    notice_type_required,
    fileName,
    fileData,
    userEmail,
    userName,
    userRole
  } = req.body;
  if (!nomor_io || !judul_io || !partner_id || !tanggal_mulai || !tanggal_berakhir || !pricing_model || !charging_type) {
    return res.status(400).json({
      error: "Nomor IO, Judul, Partner, Tanggal, Pricing Model, & Charging Type wajib diisi."
    });
  }
  if (new Date(tanggal_berakhir) <= new Date(tanggal_mulai)) {
    return res.status(400).json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  const existingIODup = db.ios.find(
    (i) => i.nomor_io.trim().toLowerCase() === nomor_io.trim().toLowerCase()
  );
  if (existingIODup) {
    return res.status(400).json({ error: `Nomor IO '${nomor_io}' sudah terdaftar dalam sistem.` });
  }
  const targetOrgId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.body.organizationId || db.activeTenantId || "org-adapundi";
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId
  );
  const partner = db.partners.find((p) => p.partner_id === partner_id);
  const contract = db.contracts.find((c) => c.contract_id === contract_id);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken
  );
  const cur = (currency || "IDR").toUpperCase();
  const amt = Number(nilai_io) || 0;
  let total_usd = req_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
      try {
        const sheetId = targetTenant?.spreadsheetId || db.googleConfig?.spreadsheetId;
        rate = await getHistoricalExchangeRate(
          sheetId,
          token,
          cur,
          tanggal_mulai
        );
      } catch (e) {
        console.error("Failed fetching historical rate for IO:", e);
      }
      total_usd = Math.round(amt * rate * 100) / 100;
    }
  }
  const targetFileName = formatIOFileName({
    partnerName: partner?.nama_partner,
    mediaChannel: kanal_media || "Digital Channel",
    ioNumber: nomor_io,
    startDate: tanggal_mulai,
    rawFileName: fileName || `${nomor_io}.pdf`
  });
  let link_file_io = "";
  if (fileData && typeof fileData === "string" && fileData.includes("base64,")) {
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder IO",
          token,
          targetOrgId
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          link_file_io = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Business Owner",
            "UPLOAD_SUCCESS",
            "IO",
            `Berhasil mengunggah file IO '${targetFileName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload IO error:", err?.message);
      }
    }
    if (!link_file_io) {
      link_file_io = saveLocalFile(
        partner?.nama_partner,
        "Folder IO",
        targetFileName,
        fileData,
        targetTenant?.name
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Business Owner",
        "UPLOAD_SUCCESS",
        "IO",
        `File IO '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
  }
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(tanggal_berakhir);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24)
  );
  let status = "Aktif";
  if (diffDays < 0) status = "Expired";
  else if (diffDays <= 90) status = "Akan Berakhir";
  const newIO = {
    io_id: generateNextIOId(),
    organizationId: targetOrgId,
    contract_id: contract_id || void 0,
    contract_nomor: contract ? contract.nomor_kontrak : "-",
    nomor_io,
    judul_io,
    partner_id,
    partner_nama: partner ? partner.nama_partner : "Partner",
    kanal_media: kanal_media || "Digital Channel",
    tanggal_mulai,
    tanggal_berakhir,
    pricing_model,
    charging_type,
    currency: cur,
    nilai_io: amt,
    nilai_io_usd: Number(total_usd),
    deliverables: deliverables || "-",
    notice_period_hari: Number(notice_period_hari) || 14,
    notice_type_required: notice_type_required || "Termination",
    status,
    link_file_io,
    fileName: targetFileName,
    sisa_hari: diffDays,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.ios.unshift(newIO);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Business Owner",
    "CREATE",
    "IO",
    `Membuat Insertion Order Baru '${nomor_io}' (${judul_io}) senilai Rp ${Number(nilai_io).toLocaleString("id-ID")}`,
    req
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, io: newIO });
});
app.put("/api/ios/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole, ...updates } = req.body;
  const idx = db.ios.findIndex((i) => i.io_id === id);
  if (idx === -1) return res.status(404).json({ error: "IO tidak ditemukan." });
  const existing = db.ios[idx];
  const updated = {
    ...existing,
    ...updates,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const cur = (updated.currency || existing.currency || "IDR").toUpperCase();
  const amt = Number(updated.nilai_io) || 0;
  let total_usd = updates.nilai_io_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
      try {
        const token = await resolveActiveGoogleToken(
          req.headers["x-google-access-token"] || req.body.accessToken
        );
        const startDate = updated.tanggal_mulai || existing.tanggal_mulai;
        rate = await getHistoricalExchangeRate(
          db.googleConfig.spreadsheetId,
          token,
          cur,
          startDate
        );
      } catch (e) {
        console.error("Failed fetching rate for edit IO:", e);
      }
      total_usd = Math.round(amt * rate * 100) / 100;
    }
  }
  updated.currency = cur;
  updated.nilai_io = amt;
  updated.nilai_io_usd = Number(total_usd);
  if (updates.fileData && typeof updates.fileData === "string" && updates.fileData.includes("base64,")) {
    const fileData = updates.fileData;
    delete updated.fileData;
    const partner = db.partners.find(
      (p) => p.partner_id === updated.partner_id
    );
    const targetFileName = formatIOFileName({
      partnerName: partner?.nama_partner,
      mediaChannel: updated.kanal_media || "Digital Channel",
      ioNumber: updated.nomor_io,
      startDate: updated.tanggal_mulai,
      rawFileName: updates.fileName || updated.fileName || `${updated.nomor_io}.pdf`
    });
    const token = await resolveActiveGoogleToken(
      req.headers["x-google-access-token"] || req.body.accessToken
    );
    let link_file_io = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder IO",
          token
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token
        );
        if (driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("google.com"))) {
          link_file_io = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Business Owner",
            "UPLOAD_SUCCESS",
            "IO",
            `Berhasil mengunggah ulang file IO '${targetFileName}' ke Google Drive`,
            req
          );
        }
      } catch (err) {
        console.warn("Drive upload IO edit error:", err?.message);
      }
    }
    if (!link_file_io) {
      link_file_io = saveLocalFile(
        partner?.nama_partner,
        "Folder IO",
        targetFileName,
        fileData
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Business Owner",
        "UPLOAD_SUCCESS",
        "IO",
        `File IO '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req
      );
    }
    updated.link_file_io = link_file_io;
    updated.fileName = targetFileName;
  }
  if (updated.tanggal_mulai && updated.tanggal_berakhir && new Date(updated.tanggal_berakhir) <= new Date(updated.tanggal_mulai)) {
    return res.status(400).json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  if (updated.nomor_io) {
    const dup = db.ios.find(
      (i) => i.nomor_io.trim().toLowerCase() === updated.nomor_io.trim().toLowerCase() && i.io_id !== id
    );
    if (dup) {
      return res.status(400).json({
        error: `Nomor IO '${updated.nomor_io}' sudah digunakan oleh IO lain.`
      });
    }
  }
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(updated.tanggal_berakhir);
  end.setHours(0, 0, 0, 0);
  updated.sisa_hari = Math.ceil(
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24)
  );
  if (updated.status !== "Terminated") {
    if (updated.sisa_hari < 0) updated.status = "Expired";
    else if (updated.sisa_hari <= 90) updated.status = "Akan Berakhir";
    else updated.status = "Aktif";
  }
  db.ios[idx] = updated;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Business Owner",
    "UPDATE",
    "IO",
    `Memperbarui data Insertion Order '${updated.nomor_io}'`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, io: updated });
});
app.delete("/api/ios/:id", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const item = db.ios.find((i) => i.io_id === id);
  if (!item) return res.status(404).json({ error: "IO tidak ditemukan." });
  db.ios = db.ios.filter((i) => i.io_id !== id);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Admin",
    "DELETE",
    "IO",
    `Menghapus Insertion Order '${item.nomor_io}' (${item.judul_io})`,
    req
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.get("/api/notification-logs", (req, res) => {
  res.json(db.notifications);
});
app.post("/api/notification-logs/mark-read", (req, res) => {
  const { notif_id, markAll } = req.body;
  if (markAll) {
    db.notifications = db.notifications.map((n) => ({ ...n, is_read: true }));
  } else if (notif_id) {
    db.notifications = db.notifications.map(
      (n) => n.notif_id === notif_id ? { ...n, is_read: true } : n
    );
  }
  saveDb();
  res.json({ success: true, notifications: db.notifications });
});
app.post("/api/notification-logs/delete", (req, res) => {
  const { notif_id, notif_ids, deleteAll } = req.body;
  if (deleteAll) {
    db.notifications = [];
  } else if (Array.isArray(notif_ids) && notif_ids.length > 0) {
    db.notifications = db.notifications.filter(
      (n) => !notif_ids.includes(n.notif_id)
    );
  } else if (notif_id) {
    db.notifications = db.notifications.filter((n) => n.notif_id !== notif_id);
  }
  saveDb();
  res.json({ success: true, notifications: db.notifications });
});
app.post("/api/cron/trigger-check", (req, res) => {
  const count = recalculateStatuses();
  res.json({ success: true, newNotificationsGenerated: count });
});
app.get(
  ["/api/auth/google/client-id", "/api/google-auth/client-id"],
  (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
    res.json({ clientId });
  }
);
app.post(
  ["/api/auth/google/exchange-code", "/api/google-auth/exchange-code"],
  async (req, res) => {
    try {
      const { code, redirect_uri } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
      }
      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId) {
        return res.status(500).json({
          error: "GOOGLE_CLIENT_ID belum dikonfigurasi di environment server."
        });
      }
      const oauth2Client = new import_google_auth_library.OAuth2Client(
        clientId,
        clientSecret,
        redirect_uri || "postmessage"
      );
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens || !tokens.access_token) {
        return res.status(400).json({
          error: "Gagal mendapatkan Access Token dari Google OAuth server."
        });
      }
      db.googleConfig.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        db.googleConfig.refreshToken = tokens.refresh_token;
      }
      db.googleConfig.isConnected = true;
      db.googleConfig.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
      saveDb();
      migrateLocalFilesToGoogleDrive(tokens.access_token).catch((mErr) => {
        console.warn(
          "[Google Auth] Background migration error:",
          mErr?.message
        );
      });
      let profile = { email: "Google User", name: "Pengguna Google" };
      try {
        const userInfoRes = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          profile = {
            email: userInfo.email || "Google User",
            name: userInfo.name || userInfo.email || "Pengguna Google",
            photoURL: userInfo.picture || void 0
          };
        }
      } catch (profileErr) {
        console.warn(
          "Gagal memuat profil pengguna di exchange-code:",
          profileErr
        );
      }
      res.json({
        success: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || db.googleConfig.refreshToken,
        expiresAt: tokens.expiry_date,
        profile
      });
    } catch (err) {
      console.error("Error exchanging Google OAuth code:", err);
      res.status(500).json({
        error: err.message || "Gagal menukarkan Google Authorization Code."
      });
    }
  }
);
app.get(
  ["/api/auth/google/token", "/api/google-auth/token"],
  async (req, res) => {
    try {
      const freshToken = await getFreshGoogleAccessToken();
      const activeToken = freshToken || db.googleConfig?.accessToken || null;
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({
        success: true,
        accessToken: activeToken,
        isConnected: Boolean(
          db.googleConfig?.isConnected && (activeToken || db.googleConfig?.refreshToken)
        ),
        lastSyncTime: db.googleConfig?.lastSyncTime || null
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err?.message || "Gagal memeriksa token Google."
      });
    }
  }
);
app.post(
  ["/api/auth/google/refresh-token", "/api/google-auth/refresh-token"],
  async (req, res) => {
    try {
      const freshToken = await getFreshGoogleAccessToken();
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({ success: true, accessToken: freshToken });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err?.message || "Gagal me-refresh token Google."
      });
    }
  }
);
app.post(
  ["/api/auth/google/sync-session", "/api/google-auth/sync-session"],
  async (req, res) => {
    try {
      const { email, name, photoURL, idToken, accessToken, refreshToken } = req.body || {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, error: "Email diperlukan untuk sinkronisasi akun." });
      }
      const cleanEmail = email.toLowerCase().trim();
      const userName = name || cleanEmail.split("@")[0];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      let allowedUser = (db.allowedUsers || []).find((u) => (u.email || "").toLowerCase() === cleanEmail);
      if (!allowedUser) {
        const isFirstUser = !db.allowedUsers || db.allowedUsers.length === 0;
        allowedUser = {
          id: `user_${Date.now()}_${import_crypto4.default.randomBytes(3).toString("hex")}`,
          email: cleanEmail,
          name: userName,
          role: isFirstUser ? "Admin" : "Staff",
          department: "Commercial & Marketing",
          status: "Active",
          addedBy: "Google Auth (Firebase: safeforwork-47.firebaseapp.com)",
          createdAt: now,
          lastLoginAt: now
        };
        if (!db.allowedUsers) db.allowedUsers = [];
        db.allowedUsers.push(allowedUser);
        saveDb();
      } else {
        allowedUser.lastLoginAt = now;
        if (!allowedUser.name || allowedUser.name === "User") {
          allowedUser.name = userName;
        }
        saveDb();
      }
      if (allowedUser.status === "Inactive" || allowedUser.status === "Banned") {
        return res.status(403).json({
          success: false,
          error: "Akun Anda telah dinonaktifkan oleh Administrator."
        });
      }
      const userRole = (allowedUser.role || "staff").toLowerCase();
      let existingUser = null;
      try {
        existingUser = sqliteDb.prepare("SELECT * FROM user WHERE LOWER(email) = LOWER(?)").get(cleanEmail);
      } catch (e) {
      }
      let userId = existingUser?.id;
      if (!existingUser) {
        userId = allowedUser.id || `usr_${Date.now()}_${import_crypto4.default.randomBytes(3).toString("hex")}`;
        try {
          sqliteDb.prepare(`
            INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, role, banned, createdAt, updatedAt)
            VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?)
          `).run(userId, userName, cleanEmail, photoURL || null, userRole, now, now);
        } catch (e) {
          console.warn("Could not insert user to sqlite:", e);
        }
      } else {
        try {
          sqliteDb.prepare(`
            UPDATE user SET name = COALESCE(?, name), image = COALESCE(?, image), updatedAt = ?
            WHERE id = ?
          `).run(userName, photoURL || null, now, userId);
        } catch (e) {
        }
      }
      try {
        const existingAcc = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'google'").get(userId);
        if (!existingAcc) {
          const accId = `acc_${Date.now()}_${import_crypto4.default.randomBytes(3).toString("hex")}`;
          sqliteDb.prepare(`
            INSERT OR REPLACE INTO account (id, accountId, providerId, userId, accessToken, idToken, createdAt, updatedAt)
            VALUES (?, ?, 'google', ?, ?, ?, ?, ?)
          `).run(accId, cleanEmail, userId, accessToken || null, idToken || null, now, now);
        } else {
          sqliteDb.prepare(`
            UPDATE account SET accessToken = COALESCE(?, accessToken), idToken = COALESCE(?, idToken), updatedAt = ?
            WHERE id = ?
          `).run(accessToken || null, idToken || null, now, existingAcc.id);
        }
      } catch (e) {
      }
      try {
        const orgId2 = allowedUser.organizationId || "org_1789542306289_b3a4f3";
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${userId}`, orgId2, userId, userRole, now);
      } catch (e) {
      }
      const sessionToken = import_crypto4.default.randomBytes(32).toString("hex");
      const sessionId = `sess_${Date.now()}_${import_crypto4.default.randomBytes(4).toString("hex")}`;
      const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
      const ipAddress = req.headers["x-forwarded-for"] || req.ip || "127.0.0.1";
      const userAgent = req.headers["user-agent"] || "Browser Client";
      const orgId = allowedUser.organizationId || "org_1789542306289_b3a4f3";
      try {
        sqliteDb.prepare(`
          INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId, activeOrganizationId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, sessionExpiry, sessionToken, now, now, ipAddress, userAgent, userId, orgId);
      } catch (sessErr) {
        console.warn("Could not insert session into Better Auth session table:", sessErr);
      }
      if (accessToken) {
        db.googleConfig.accessToken = accessToken;
        if (refreshToken) {
          db.googleConfig.refreshToken = refreshToken;
        }
        db.googleConfig.isConnected = true;
        db.googleConfig.lastSyncTime = now;
        saveDb();
      }
      res.cookie("better-auth.session_token", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1e3
      });
      if (Array.isArray(db.activities)) {
        db.activities.unshift({
          id: `act_${Date.now()}_${import_crypto4.default.randomBytes(3).toString("hex")}`,
          user: userName,
          email: cleanEmail,
          role: allowedUser.role,
          action: "LOGIN",
          module: "Autentikasi",
          description: "Login berhasil menggunakan Google Sign-In (safeforwork-47.firebaseapp.com)",
          timestamp: now,
          ip: req.headers["x-forwarded-for"] || req.ip || "127.0.0.1"
        });
        if (db.activities.length > 500) db.activities = db.activities.slice(0, 500);
        saveDb();
      }
      return res.json({
        success: true,
        sessionToken,
        user: {
          id: userId,
          email: cleanEmail,
          name: userName,
          role: allowedUser.role,
          department: allowedUser.department,
          photoURL: photoURL || null
        }
      });
    } catch (err) {
      console.error("Error in /api/auth/google/sync-session:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Gagal menyinkronkan sesi Google ke Better Auth."
      });
    }
  }
);
app.post(
  ["/api/google-integration/connect", "/api/auth/google/connect"],
  async (req, res) => {
    try {
      const { accessToken, refreshToken } = req.body || {};
      const token = accessToken || req.headers["x-google-access-token"];
      if (!token && !refreshToken) {
        return res.status(400).json({
          success: false,
          error: "Access token atau Refresh token Google diperlukan."
        });
      }
      if (token) db.googleConfig.accessToken = token;
      if (refreshToken) db.googleConfig.refreshToken = refreshToken;
      db.googleConfig.isConnected = true;
      db.googleConfig.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
      saveDb();
      if (token) {
        migrateLocalFilesToGoogleDrive(token).catch((e) => {
          console.warn(
            "[Google Auth] Background migration error on connect:",
            e?.message
          );
        });
      }
      res.json({
        success: true,
        isConnected: true,
        lastSyncTime: db.googleConfig.lastSyncTime,
        config: db.googleConfig
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err?.message || "Gagal menyinkronkan status koneksi Google."
      });
    }
  }
);
app.post(
  ["/api/google-integration/disconnect", "/api/auth/google/disconnect"],
  async (req, res) => {
    try {
      db.googleConfig.accessToken = "";
      db.googleConfig.refreshToken = "";
      db.googleConfig.isConnected = false;
      db.googleConfig.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
      saveDb();
      res.json({
        success: true,
        isConnected: false,
        message: "Akun Google berhasil diputuskan dari konfigurasi server."
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err?.message || "Gagal memutuskan akun Google di server."
      });
    }
  }
);
app.get("/api/google-integration", async (req, res) => {
  const session = await getBetterAuthSession(req);
  const adminCheck = await checkIsAdmin(req);
  if (!session && !adminCheck.isAdmin) {
    return res.status(401).json({ error: "Unauthorized: Harap login terlebih dahulu." });
  }
  await getFreshGoogleAccessToken();
  const isAdmin = adminCheck.isAdmin;
  if (!isAdmin) {
    const { smtpPassword, geminiApiKey, refreshToken, ...safeConfig } = db.googleConfig;
    return res.json({
      ...safeConfig,
      geminiApiKey: geminiApiKey ? "********" : ""
    });
  }
  res.json(db.googleConfig);
});
app.post("/api/google-integration", async (req, res) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only Admins can modify settings." });
  }
  const oldConfig = { ...db.googleConfig };
  const {
    spreadsheetId,
    masterSpreadsheetId,
    masterSpreadsheetUrl,
    driveFolderId,
    autoSync,
    accessToken,
    refreshToken,
    isLocked,
    notificationEmails,
    legalNotificationEmail,
    financeNotificationEmail,
    aiModel,
    geminiApiKey,
    smtpEnabled,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFromEmail,
    smtpFromName
  } = req.body;
  if (masterSpreadsheetId !== void 0)
    db.googleConfig.masterSpreadsheetId = masterSpreadsheetId;
  if (masterSpreadsheetUrl !== void 0)
    db.googleConfig.masterSpreadsheetUrl = masterSpreadsheetUrl;
  const token = accessToken || req.headers["x-google-access-token"] || db.googleConfig.accessToken;
  const effectiveRefreshToken = refreshToken !== void 0 ? refreshToken : db.googleConfig.refreshToken;
  const effectiveApiKey = geminiApiKey !== void 0 ? String(geminiApiKey).trim() : db.googleConfig.geminiApiKey || "";
  if (geminiApiKey !== void 0) {
    process.env.GEMINI_API_KEY = effectiveApiKey;
  }
  db.googleConfig = {
    ...db.googleConfig,
    spreadsheetId: spreadsheetId !== void 0 ? spreadsheetId : db.googleConfig.spreadsheetId,
    masterSpreadsheetId: masterSpreadsheetId !== void 0 ? masterSpreadsheetId : db.googleConfig.masterSpreadsheetId,
    masterSpreadsheetUrl: masterSpreadsheetUrl !== void 0 ? masterSpreadsheetUrl : db.googleConfig.masterSpreadsheetUrl,
    driveFolderId: driveFolderId !== void 0 ? driveFolderId : db.googleConfig.driveFolderId,
    autoSync: autoSync !== void 0 ? autoSync : db.googleConfig.autoSync,
    accessToken: accessToken !== void 0 ? accessToken : token || db.googleConfig.accessToken,
    refreshToken: effectiveRefreshToken || "",
    isLocked: true,
    notificationEmails: notificationEmails !== void 0 ? notificationEmails : db.googleConfig.notificationEmails,
    legalNotificationEmail: legalNotificationEmail !== void 0 ? legalNotificationEmail : db.googleConfig.legalNotificationEmail,
    financeNotificationEmail: financeNotificationEmail !== void 0 ? financeNotificationEmail : db.googleConfig.financeNotificationEmail,
    aiModel: aiModel !== void 0 ? aiModel : db.googleConfig.aiModel || "gemini-3.8-flash",
    geminiApiKey: effectiveApiKey,
    smtpEnabled: smtpEnabled !== void 0 ? Boolean(smtpEnabled) : db.googleConfig.smtpEnabled,
    smtpHost: smtpHost !== void 0 ? smtpHost : db.googleConfig.smtpHost,
    smtpPort: smtpPort !== void 0 ? Number(smtpPort) : db.googleConfig.smtpPort,
    smtpSecure: smtpSecure !== void 0 ? Boolean(smtpSecure) : db.googleConfig.smtpSecure,
    smtpUser: smtpUser !== void 0 ? smtpUser : db.googleConfig.smtpUser,
    smtpPassword: smtpPassword !== void 0 ? smtpPassword : db.googleConfig.smtpPassword,
    smtpFromEmail: smtpFromEmail !== void 0 ? smtpFromEmail : db.googleConfig.smtpFromEmail,
    smtpFromName: smtpFromName !== void 0 ? smtpFromName : db.googleConfig.smtpFromName,
    isConnected: accessToken === "" || !token && !db.googleConfig.accessToken ? false : true,
    lastSyncTime: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveDb();
  if (db.googleConfig.accessToken) {
    migrateLocalFilesToGoogleDrive(db.googleConfig.accessToken).catch((e) => {
      console.warn(
        "[Google Auth] Migration error in google-integration:",
        e?.message
      );
    });
  }
  let syncWarning;
  const isSheetChanged = spreadsheetId !== void 0 && spreadsheetId !== oldConfig.spreadsheetId;
  const isFolderChanged = driveFolderId !== void 0 && driveFolderId !== oldConfig.driveFolderId;
  if (isFolderChanged && token) {
    try {
      const validToken = await getFreshGoogleAccessToken() || token;
      if (validToken) {
        await ensureAllPartnersFolders(validToken);
      }
    } catch (err) {
      console.warn(
        "Folder check warning on saving google integration config:",
        err?.message
      );
    }
  }
  if (isSheetChanged && db.googleConfig.spreadsheetId) {
    const defaultOrg = (db.tenants || []).find(
      (t) => t.id === "org-adapundi" || t.isDefault
    );
    if (defaultOrg) {
      defaultOrg.spreadsheetId = db.googleConfig.spreadsheetId;
      defaultOrg.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${db.googleConfig.spreadsheetId}/edit`;
      try {
        const orgsDb = new import_better_sqlite32.default(import_path4.default.join(process.cwd(), "auth.db"));
        if (orgsDb) {
          const row = orgsDb.prepare("SELECT * FROM organization WHERE id = ? OR slug = ?").get("org-adapundi", "adapundi");
          if (row) {
            let meta = {};
            try {
              if (row.metadata)
                meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
            } catch {
            }
            meta.spreadsheetId = db.googleConfig.spreadsheetId;
            orgsDb.prepare(
              "UPDATE organization SET metadata = ? WHERE id = ? OR slug = ?"
            ).run(JSON.stringify(meta), "org-adapundi", "adapundi");
          }
        }
      } catch (e) {
        console.warn(
          "Could not sync sqlite organization metadata on google sheet change:",
          e?.message
        );
      }
      saveDb();
    }
  }
  if (db.googleConfig.driveFolderId) {
    try {
      const shouldForceNew = Boolean(
        req.body.forceNew || req.body.forceNewOrgResources || req.body.provisionOrgResources || isFolderChanged
      );
      await autoEnsureTenantGoogleResources(token, shouldForceNew);
    } catch (orgErr) {
      console.warn(
        "[Google Integration Save] Auto-ensure tenant folders warning:",
        orgErr?.message
      );
    }
  }
  syncTenantsWithSqlite();
  res.json({
    success: true,
    config: db.googleConfig,
    tenants: db.tenants,
    syncWarning
  });
});
app.post("/api/smtp/test", async (req, res) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only Admins can test SMTP settings." });
  }
  const {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFromEmail,
    smtpFromName,
    testRecipient
  } = req.body;
  const host = (smtpHost || db.googleConfig.smtpHost || "").trim();
  const user = (smtpUser || db.googleConfig.smtpUser || "").trim();
  const pass = smtpPassword !== void 0 ? smtpPassword : db.googleConfig.smtpPassword || "";
  const recipient = (testRecipient || "").trim();
  if (!host || !user || !recipient) {
    return res.status(400).json({
      error: "SMTP Host, Username, dan Email Penerima Uji Coba wajib diisi."
    });
  }
  try {
    const port = Number(smtpPort) || (smtpSecure ? 465 : 587);
    const transporter = import_nodemailer2.default.createTransport({
      host,
      port,
      secure: smtpSecure ?? port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
    await transporter.verify();
    const fromAddress = (smtpFromEmail || db.googleConfig.smtpFromEmail || user).trim();
    const fromName = (smtpFromName || db.googleConfig.smtpFromName || "Sistem Notifikasi Kontrak & IO").trim();
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: recipient,
      subject: "\u2705 [TEST] Konfigurasi SMTP Relay Berhasil Terhubung!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #10B981; border-radius: 12px; background: #F0FDF4;">
          <h3 style="color: #047857; margin-top: 0;">Koneksi SMTP Relay Berhasil!</h3>
          <p style="font-size: 13px; color: #065F46; line-height: 1.5;">
            Email ini membuktikan bahwa konfigurasi SMTP Relay pada sistem <strong>Pengelola Kontrak & Insertion Order</strong> telah berhasil terhubung dan dapat mengirimkan email nyata ke inbox Anda.
          </p>
          <div style="background: #FFFFFF; border: 1px solid #A7F3D0; border-radius: 8px; padding: 12px; font-size: 12px; color: #047857; margin-top: 12px;">
            <p style="margin: 4px 0;"><strong>SMTP Server:</strong> ${host}:${port}</p>
            <p style="margin: 4px 0;"><strong>Email Pengirim:</strong> ${fromAddress}</p>
            <p style="margin: 4px 0;"><strong>Waktu Pengujian:</strong> ${(/* @__PURE__ */ new Date()).toLocaleString("id-ID")}</p>
          </div>
        </div>
      `
    });
    res.json({
      success: true,
      message: `Email uji coba berhasil dikirim ke '${recipient}'! (Message ID: ${info.messageId})`
    });
  } catch (err) {
    console.error("SMTP Test Error:", err);
    res.status(400).json({
      error: `Gagal mengirim email via SMTP Relay: ${err.message || String(err)}`
    });
  }
});
app.post("/api/ai/test-key", async (req, res) => {
  const { apiKey, model } = req.body;
  const keyToTest = (apiKey || getEffectiveGeminiApiKey()).trim();
  if (!keyToTest) {
    return res.status(400).json({
      error: "API Key belum diisi. Masukkan Gemini API Key terlebih dahulu."
    });
  }
  try {
    const testClient = new import_genai.GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
    const modelsToTry = [
      model ? getValidAiModel(model) : "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite"
    ];
    const uniqueModels = [...new Set(modelsToTry)];
    let lastErr = null;
    for (const targetModel of uniqueModels) {
      try {
        const response = await testClient.models.generateContent({
          model: targetModel,
          contents: "Say OK"
        });
        if (response && response.text) {
          return res.json({
            success: true,
            message: `Koneksi ke Google Gemini API berhasil! (Model aktif: ${targetModel})`,
            model: targetModel
          });
        }
      } catch (err) {
        lastErr = err;
        console.warn(
          `[Test API Key] Model ${targetModel} attempt failed:`,
          err?.message || err
        );
      }
    }
    throw lastErr || new Error("Tidak ada respon dari Gemini API.");
  } catch (err) {
    console.error("Test API Key error:", err);
    return res.status(400).json({
      error: err?.message || "Gagal terhubung ke Google Gemini API. Pastikan API Key valid."
    });
  }
});
app.post("/api/google-integration/sync", (req, res) => {
  db.googleConfig.isConnected = true;
  db.googleConfig.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
  saveDb();
  return res.json({
    success: true,
    message: "Data tersinkronisasi dan tersimpan penuh di database SQLite (Single Source of Truth).",
    config: db.googleConfig,
    counts: {
      partners: (db.partners || []).length,
      contracts: (db.contracts || []).length,
      ios: (db.ios || []).length
    }
  });
});
app.get("/api/google-integration/sync-status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    active: false,
    queueLength: 0,
    status: "sqlite-native",
    message: "SQLite WAL aktif sebagai single source of truth."
  });
});
app.post("/api/google-integration/sync-flush", (req, res) => {
  res.json({
    success: true,
    message: "Sinkronisasi antrean bersih. SQLite WAL aktif."
  });
});
app.post("/api/google-integration/auto-provision-master", async (req, res) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({
      error: "Forbidden: Hanya Admin/Superuser yang berhak membuat Master Root."
    });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken
  );
  if (!token && !hasServiceAccountCredentials()) {
    return res.status(400).json({
      error: "Koneksi Google belum aktif. Hubungkan akun Google terlebih dahulu."
    });
  }
  try {
    const rootFolderLink = await createDriveFolder(
      "Master Google Drive Storage (LMS)",
      void 0,
      token
    );
    const rootFolderId = extractFolderIdFromLink(rootFolderLink) || rootFolderLink;
    let spreadsheetId = "";
    const sheet = await createSpreadsheetInFolder(
      "Master Spreadsheet Database (LMS)",
      rootFolderId,
      token
    );
    if (sheet && sheet.id) {
      spreadsheetId = sheet.id;
    }
    if (!spreadsheetId) {
      throw new Error("Gagal membuat Spreadsheet Database di dalam folder.");
    }
    db.googleConfig.driveFolderId = rootFolderId;
    db.googleConfig.spreadsheetId = spreadsheetId;
    if (token) {
      db.googleConfig.accessToken = token;
    }
    try {
      await autoEnsureTenantGoogleResources(token, true);
    } catch (orgErr) {
      console.warn(
        "[AutoProvision] Warning auto-ensuring org folders:",
        orgErr?.message
      );
    }
    saveDb();
    return res.json({
      success: true,
      message: "Master Root Folder, Spreadsheet Database, serta Folder Organisasi dan Sheet Database Organisasi berhasil dibuat otomatis di Google Drive.",
      driveFolderId: rootFolderId,
      masterSpreadsheetId: spreadsheetId,
      spreadsheetId,
      tenants: db.tenants
    });
  } catch (err) {
    console.error("Auto provision master root error:", err);
    return res.status(500).json({
      error: err.message || "Gagal membuat Master Root secara otomatis."
    });
  }
});
app.post("/api/tenants/auto-provision-folders", async (req, res) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({
      error: "Forbidden: Hanya Admin/Superuser yang berhak menyinkronkan folder organisasi."
    });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken
  );
  if (!token && !hasServiceAccountCredentials()) {
    return res.status(400).json({
      error: "Koneksi Google belum aktif. Hubungkan akun Google terlebih dahulu."
    });
  }
  try {
    const result = await autoEnsureTenantGoogleResources(token);
    return res.json({
      success: true,
      message: `Berhasil menyinkronkan folder organisasi ke Master Root (${result.updatedCount} organisasi disinkronkan).`,
      tenants: db.tenants
    });
  } catch (err) {
    console.error("Auto provision tenant folders error:", err);
    return res.status(500).json({
      error: err.message || "Gagal menyinkronkan folder organisasi ke Master Root."
    });
  }
});
var provisionFoldersHandler = __name(async (req, res) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only Admins can provision folders." });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken
  );
  try {
    const stats = await ensureAllPartnersFolders(token);
    saveDb();
    return res.json({
      success: true,
      message: `4 Subfolder Kategori (Folder Contract, Folder Invoice & Billing, Folder IO, Folder DD) berhasil dibuat/diperbarui untuk ${db.partners.length} partner.`,
      stats
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Gagal membuat folder kategori." });
  }
}, "provisionFoldersHandler");
app.post("/api/google-integration/provision-folders", provisionFoldersHandler);
app.post("/api/partners/provision-folders", provisionFoldersHandler);
app.post("/api/admin/reset-database", async (req, res) => {
  const { userEmail, userName, userRole, accessToken, confirmKeyword } = req.body;
  if (confirmKeyword !== "RESET NOW") {
    return res.status(400).json({
      error: 'Konfirmasi tidak valid. Harap ketik "RESET NOW" untuk mereset database.'
    });
  }
  db.partners = [];
  db.contracts = [];
  db.ios = [];
  db.spendings = [];
  db.evaluations = [];
  db.notifications = [];
  db.activityLogs = [];
  db.departments = [];
  db.googleConfig.spreadsheetId = "";
  db.googleConfig.driveFolderId = "";
  db.googleConfig.masterSpreadsheetId = "";
  db.googleConfig.masterSpreadsheetUrl = "";
  db.googleConfig.isConnected = false;
  if (accessToken) db.googleConfig.accessToken = accessToken;
  db.googleConfig.autoSync = true;
  db.googleConfig.isLocked = true;
  db.googleConfig.notificationEmails = "legal.head@perusahaan.co.id, finance.team@perusahaan.co.id";
  db.googleConfig.legalNotificationEmail = "legal.head@perusahaan.co.id";
  db.googleConfig.financeNotificationEmail = "finance.team@perusahaan.co.id";
  db.googleConfig.aiModel = "gemini-3.8-flash";
  db.branding = { ...DEFAULT_BRANDING };
  if (db.customTranslations) {
    db.customTranslations = {};
  }
  const defaultOrgId = "org_1789542306289_b3a4f3";
  const defaultOrgName = "Adapundi";
  const defaultOrgSlug = "adapundi";
  const defaultOrgLogo = "/favicon.png";
  const defaultMetadata = JSON.stringify({
    currency: "IDR",
    brandName: "Adapundi",
    legalEntity: "PT",
    tagline: "Legal & Commercial Contract Management",
    primaryColor: "#06C755",
    driveFolderId: "1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY",
    driveFolderLink: "https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY"
  });
  try {
    if (sqliteDb) {
      sqliteDb.prepare("DELETE FROM invitation").run();
      sqliteDb.prepare("DELETE FROM apikey").run();
      sqliteDb.prepare("DELETE FROM teamMember").run();
      sqliteDb.prepare("DELETE FROM team").run();
      sqliteDb.prepare("DELETE FROM organization").run();
      sqliteDb.prepare(
        `
        INSERT INTO organization (id, name, slug, logo, createdAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        defaultOrgId,
        defaultOrgName,
        defaultOrgSlug,
        defaultOrgLogo,
        (/* @__PURE__ */ new Date()).toISOString(),
        defaultMetadata
      );
      sqliteDb.prepare("DELETE FROM team").run();
      db.departments = [];
      sqliteDb.prepare("DELETE FROM member").run();
      const existingUsers = sqliteDb.prepare("SELECT id, name, email, role FROM user").all() || [];
      for (const u of existingUsers) {
        const memberRole = u.role === "superuser" ? "admin" : u.role || "admin";
        sqliteDb.prepare(
          `
          INSERT INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `
        ).run(
          `mem_${Date.now()}_${import_crypto4.default.randomBytes(3).toString("hex")}`,
          defaultOrgId,
          u.id,
          memberRole,
          (/* @__PURE__ */ new Date()).toISOString()
        );
        sqliteDb.prepare(
          `
          INSERT INTO teamMember (id, teamId, userId, createdAt)
          VALUES (?, ?, ?, ?)
        `
        ).run(
          `tm_${Date.now()}_${import_crypto4.default.randomBytes(3).toString("hex")}`,
          "team-legal",
          u.id,
          (/* @__PURE__ */ new Date()).toISOString()
        );
      }
      const allTeams = sqliteDb.prepare("SELECT id FROM team").all() || [];
      for (const tm of allTeams) {
        const count = sqliteDb.prepare(
          "SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?"
        ).get(tm.id)?.count || 0;
        sqliteDb.prepare(
          "UPDATE team SET memberCount = ?, updatedAt = ? WHERE id = ?"
        ).run(count, (/* @__PURE__ */ new Date()).toISOString(), tm.id);
      }
      sqliteDb.prepare(
        "UPDATE session SET activeOrganizationId = ?, activeTeamId = ?"
      ).run(defaultOrgId, "team-legal");
    }
  } catch (err) {
    console.error("Error resetting sqlite auth tables:", err);
  }
  const defaultTenant = {
    id: defaultOrgId,
    name: defaultOrgName,
    legalEntity: "PT",
    brandName: defaultOrgName,
    tagline: "Legal & Commercial Contract Management",
    logoUrl: defaultOrgLogo,
    primaryColor: "#06C755",
    currency: "IDR",
    domainSlug: defaultOrgSlug,
    isDefault: true,
    spreadsheetId: "",
    spreadsheetUrl: void 0,
    driveFolderId: "",
    driveFolderLink: void 0,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.tenants = [defaultTenant];
  db.activeTenantId = defaultTenant.id;
  const activeUserEmail = (userEmail || "adhitcl@gmail.com").toLowerCase();
  const activeUserName = userName || "Aditya Pratama";
  const existingUser = db.allowedUsers.find(
    (u) => u.email.toLowerCase() === activeUserEmail
  );
  db.allowedUsers = [
    {
      id: existingUser?.id || "usr-1",
      organizationId: defaultOrgId,
      email: activeUserEmail,
      name: existingUser?.name || activeUserName,
      role: "Superuser",
      department: existingUser?.department || "Legal & Compliance",
      status: "Active",
      addedBy: "System Core",
      createdAt: existingUser?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  if (import_fs4.default.existsSync(uploadsDir)) {
    try {
      const items = import_fs4.default.readdirSync(uploadsDir);
      for (const item of items) {
        const itemPath = import_path4.default.join(uploadsDir, item);
        if (import_fs4.default.lstatSync(itemPath).isDirectory()) {
          import_fs4.default.rmSync(itemPath, { recursive: true, force: true });
        } else {
          import_fs4.default.unlinkSync(itemPath);
        }
      }
    } catch (e) {
      console.error("Error cleaning uploads during reset:", e);
    }
  }
  saveDb();
  addActivityLog(
    userEmail || "admin@app",
    userName || "Admin",
    userRole || "Admin",
    "RESET",
    "SYSTEM",
    "Mereset seluruh pengaturan sistem (Manage Admin Access, Organisasi, Departemen, AI, Notifikasi, Storage & Database) dan seluruh data transaksi ke kondisi awal kosong.",
    req
  );
  res.json({
    success: true,
    message: "Seluruh pengaturan sistem (Manage Admin Access, Organisasi, Departemen, AI, Notifikasi, Storage & Database) dan seluruh data transaksi berhasil direset ke kondisi awal kosong. Akun pengguna terdaftar tetap dipertahankan.",
    defaultOrgId
  });
});
app.get("/api/google-service-account/status", async (req, res) => {
  try {
    const creds = loadServiceAccountCredentials();
    const sheets = getGoogleSheetsClient(creds);
    res.json({
      success: true,
      serviceAccount: {
        client_email: creds.client_email,
        project_id: creds.project_id,
        type: creds.type || "service_account"
      },
      message: "Otentikasi Google Service Account untuk Google Sheets API berhasil dikonfigurasi."
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});
app.get("/api/auth/google/client-id", (req, res) => {
  try {
    let clientId = process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      const configPath = import_path4.default.join(process.cwd(), "firebase-applet-config.json");
      if (import_fs4.default.existsSync(configPath)) {
        const raw = JSON.parse(import_fs4.default.readFileSync(configPath, "utf-8"));
        clientId = raw.oAuthClientId || "";
      }
    }
    return res.json({ clientId });
  } catch (err) {
    return res.json({ clientId: "" });
  }
});
app.post("/api/bulk-import", async (req, res) => {
  const {
    type,
    rows,
    userEmail,
    userName,
    userRole,
    defaultDepartment,
    overrideDepartment
  } = req.body;
  if (!type || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Tipe data dan baris tidak boleh kosong." });
  }
  const succeeded = [];
  const skipped = [];
  const failed = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const defDept = typeof defaultDepartment === "string" ? defaultDepartment.trim() : "";
  const forceDept = Boolean(overrideDepartment) && Boolean(defDept);
  if (type === "partners") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;
      const name = (row.nama_partner || "").trim();
      if (!name) {
        failed.push({
          rowIndex,
          identifier: `Baris ${rowIndex}`,
          message: "Kolom nama_partner wajib diisi."
        });
        continue;
      }
      const exists = db.partners.find(
        (p) => p.nama_partner?.toLowerCase() === name.toLowerCase()
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier: name,
          message: `Partner dengan nama "${name}" sudah ada (ID: ${exists.partner_id}).`
        });
        continue;
      }
      try {
        const partnerChannel = (row.partner_channel || row.codename || row.channel || row.nama_channel || "").trim();
        let internalPic = (row.internal_pic || row.pic_internal || row.picInternal || "").trim();
        if (forceDept) {
          internalPic = defDept;
        } else if (!internalPic && defDept) {
          internalPic = defDept;
        }
        const fullPicPartner = row.pic_partner || (row.nama_pic ? `${row.nama_pic.trim()} (${(row.email_pic || "").trim()} | ${(row.telepon_pic || "").trim()})` : "");
        const fullKontakPic = row.kontak_pic || (row.email_pic || row.telepon_pic ? `${(row.email_pic || "").trim()} / ${(row.telepon_pic || "").trim()}` : "");
        const newPartner = {
          partner_id: generateNextPartnerId(),
          nama_partner: name,
          codename: partnerChannel,
          partner_channel: partnerChannel,
          pic_internal: internalPic,
          internal_pic: internalPic,
          jenis_partner: row.jenis_partner || "Vendor",
          pic_partner: fullPicPartner,
          nama_pic: row.nama_pic || "",
          email_pic: row.email_pic || "",
          telepon_pic: row.telepon_pic || "",
          alamat_pic: row.alamat_pic || "",
          kontak_pic: fullKontakPic,
          badan_hukum: row.badan_hukum === "BHA" ? "BHA" : "BHI",
          status_dd: "Belum Lengkap",
          catatan: row.catatan || "",
          tags: sanitizePartnerTags(row.tags),
          daftar_dokumen_dd: normalizePartnerDDDocs([]),
          created_at: now,
          updated_at: now
        };
        db.partners.push(newPartner);
        succeeded.push({
          rowIndex,
          identifier: name,
          message: `Partner berhasil dibuat (ID: ${newPartner.partner_id}).`
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier: name,
          message: err.message || "Gagal membuat partner."
        });
      }
    }
  } else if (type === "contracts") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;
      const nomor = (row.nomor_kontrak || "").trim();
      if (!nomor) {
        failed.push({
          rowIndex,
          identifier: `Baris ${rowIndex}`,
          message: "Kolom nomor_kontrak wajib diisi."
        });
        continue;
      }
      const exists = db.contracts.find(
        (c) => c.nomor_kontrak?.toLowerCase() === nomor.toLowerCase()
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier: nomor,
          message: `Kontrak "${nomor}" sudah ada (ID: ${exists.contract_id}).`
        });
        continue;
      }
      const partnerNama = (row.partner_nama || "").trim();
      const partner = db.partners.find(
        (p) => p.nama_partner?.toLowerCase() === partnerNama.toLowerCase()
      );
      try {
        const kategori = row.kategori_kerjasama ? row.kategori_kerjasama.split(",").map((s) => s.trim()).filter(Boolean) : ["Advertising"];
        let contractPic = (row.pic_internal || row.internal_pic || "").trim();
        if (forceDept) {
          contractPic = defDept;
        } else if (!contractPic && defDept) {
          contractPic = defDept;
        } else if (!contractPic && partner?.pic_internal) {
          contractPic = partner.pic_internal;
        }
        const newContract = {
          contract_id: generateNextContractId(),
          nomor_kontrak: nomor,
          judul_kontrak: row.judul_kontrak || nomor,
          partner_id: partner?.partner_id || "",
          jenis_dokumen: row.jenis_dokumen || "Master Agreement",
          kategori_kerjasama: kategori,
          tanggal_mulai: row.tanggal_mulai || "",
          tanggal_berakhir: row.tanggal_berakhir || "",
          currency: row.currency || "IDR",
          nilai_kontrak: parseFloat(row.nilai_kontrak) || 0,
          auto_renewal: false,
          notice_period_hari: parseInt(row.notice_period_hari) || 30,
          notice_type_required: row.notice_type_required || "Both",
          pic_internal: contractPic,
          internal_notes: row.internal_notes || "",
          status: "Aktif",
          status_approval: "Signed",
          created_at: now,
          updated_at: now
        };
        recalculateStatuses();
        db.contracts.push(newContract);
        succeeded.push({
          rowIndex,
          identifier: nomor,
          message: `Kontrak berhasil dibuat (ID: ${newContract.contract_id}).`
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier: nomor,
          message: err.message || "Gagal membuat kontrak."
        });
      }
    }
  } else if (type === "ios") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;
      const nomor = (row.nomor_io || "").trim();
      if (!nomor) {
        failed.push({
          rowIndex,
          identifier: `Baris ${rowIndex}`,
          message: "Kolom nomor_io wajib diisi."
        });
        continue;
      }
      const exists = db.ios.find(
        (io) => io.nomor_io?.toLowerCase() === nomor.toLowerCase()
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier: nomor,
          message: `IO "${nomor}" sudah ada (ID: ${exists.io_id}).`
        });
        continue;
      }
      const partnerNama = (row.partner_nama || "").trim();
      const partner = db.partners.find(
        (p) => p.nama_partner?.toLowerCase() === partnerNama.toLowerCase()
      );
      const contractNomor = (row.contract_nomor || "").trim();
      const contract = db.contracts.find(
        (c) => c.nomor_kontrak?.toLowerCase() === contractNomor.toLowerCase()
      );
      try {
        const newIO = {
          io_id: generateNextIOId(),
          nomor_io: nomor,
          judul_io: row.judul_io || nomor,
          partner_id: partner?.partner_id || "",
          contract_id: contract?.contract_id || "",
          kanal_media: row.kanal_media || "",
          tanggal_mulai: row.tanggal_mulai || "",
          tanggal_berakhir: row.tanggal_berakhir || "",
          pricing_model: row.pricing_model || "Flat Fee",
          charging_type: row.charging_type || "Prepaid",
          currency: row.currency || "IDR",
          nilai_io: parseFloat(row.nilai_io) || 0,
          deliverables: row.deliverables || "",
          notice_period_hari: parseInt(row.notice_period_hari) || 14,
          notice_type_required: row.notice_type_required || "Termination",
          internal_notes: row.internal_notes || "",
          status: "Aktif",
          created_at: now,
          updated_at: now
        };
        db.ios.push(newIO);
        succeeded.push({
          rowIndex,
          identifier: nomor,
          message: `IO berhasil dibuat (ID: ${newIO.io_id}).`
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier: nomor,
          message: err.message || "Gagal membuat IO."
        });
      }
    }
  } else if (type === "evaluations") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;
      const supplierName = (row.supplier_name || "").trim();
      const reviewDate = (row.review_date || "").trim();
      if (!supplierName || !reviewDate) {
        failed.push({
          rowIndex,
          identifier: `Baris ${rowIndex}`,
          message: "Kolom supplier_name dan review_date wajib diisi."
        });
        continue;
      }
      const identifier = `${supplierName} \u2014 ${reviewDate}`;
      const exists = db.evaluations.find(
        (e) => e.supplier_name?.toLowerCase() === supplierName.toLowerCase() && e.review_date === reviewDate
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier,
          message: `Evaluasi untuk "${supplierName}" pada ${reviewDate} sudah ada.`
        });
        continue;
      }
      const partner = db.partners.find(
        (p) => p.nama_partner?.toLowerCase() === supplierName.toLowerCase()
      );
      try {
        const newEval = {
          id: `EV${String(db.evaluations.length + 1).padStart(4, "0")}`,
          review_date: reviewDate,
          partner_id: partner?.partner_id || "",
          supplier_name: supplierName,
          type_of_work: row.type_of_work || "",
          sla_score: parseFloat(row.sla_score) || 0,
          obligation_target: row.obligation_target || "",
          incident_frequency: row.incident_frequency || "",
          communication: row.communication || "",
          pricing: row.pricing || "",
          final_evaluation: row.final_evaluation || "",
          notes: row.notes || ""
        };
        db.evaluations.push(newEval);
        succeeded.push({
          rowIndex,
          identifier,
          message: `Evaluasi berhasil dibuat (ID: ${newEval.id}).`
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier,
          message: err.message || "Gagal membuat evaluasi."
        });
      }
    }
  } else if (type === "spendings") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;
      const invoiceNumber = (row.invoice_number || "").trim();
      const vendorName = (row.vendor_name || "").trim();
      if (!invoiceNumber || !vendorName) {
        failed.push({
          rowIndex,
          identifier: `Baris ${rowIndex}`,
          message: "Kolom invoice_number dan vendor_name wajib diisi."
        });
        continue;
      }
      const identifier = `${vendorName} \u2014 ${invoiceNumber}`;
      const exists = db.spendings.find(
        (s) => s.invoice_number?.toLowerCase() === invoiceNumber.toLowerCase() && s.vendor_name?.toLowerCase() === vendorName.toLowerCase()
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier,
          message: `Invoice "${invoiceNumber}" untuk "${vendorName}" sudah ada (ID: ${exists.id}).`
        });
        continue;
      }
      const partner = db.partners.find(
        (p) => p.nama_partner?.toLowerCase() === vendorName.toLowerCase()
      );
      try {
        const invoiceMonth = normalizeSpendingMonths(row.invoice_month);
        const totalAmount = parseFloat(row.total_amount) || 0;
        const currency = (row.currency || "IDR").toUpperCase();
        const newSpending = {
          id: generateNextSpendingId(),
          vendor_id: partner?.partner_id || "",
          vendor_name: vendorName,
          invoice_number: invoiceNumber,
          invoice_date: row.invoice_date || "",
          invoice_month: invoiceMonth,
          invoice_description: row.invoice_description || "",
          currency,
          total_amount: totalAmount,
          total_amount_usd: currency === "USD" ? totalAmount : 0,
          bank_name: row.bank_name || "",
          bank_account_number: row.bank_account_number || "",
          bank_account_holder_name: row.bank_account_holder_name || ""
        };
        db.spendings.push(newSpending);
        succeeded.push({
          rowIndex,
          identifier,
          message: `Spending berhasil dibuat (ID: ${newSpending.id}).`
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier,
          message: err.message || "Gagal membuat spending."
        });
      }
    }
  } else {
    return res.status(400).json({ error: `Tipe import tidak dikenal: ${type}` });
  }
  saveDb();
  const totalSucceeded = succeeded.length;
  if (totalSucceeded > 0) {
    const logEntry = {
      id: `log-${Date.now()}`,
      timestamp: now,
      userEmail: userEmail || "system",
      userName: userName || "System",
      userRole: userRole || "Admin",
      action: "BULK_IMPORT",
      entity: type.toUpperCase(),
      entityId: "BULK",
      details: `Bulk import ${type}: ${totalSucceeded} berhasil, ${skipped.length} dilewati, ${failed.length} gagal.`
    };
    db.activityLogs.unshift(logEntry);
    saveDb();
  }
  return res.json({ succeeded, skipped, failed });
});
function syncTenantsWithSqlite() {
  try {
    if (sqliteDb) {
      const orgRows = sqliteDb.prepare("SELECT * FROM organization ORDER BY createdAt ASC").all();
      if (orgRows && orgRows.length > 0) {
        const orgIds = new Set(orgRows.map((o) => o.id));
        const orgSlugs = new Set(orgRows.map((o) => o.slug));
        const updatedTenants = [];
        orgRows.forEach((org) => {
          let meta = {};
          try {
            if (org.metadata) {
              meta = typeof org.metadata === "string" ? JSON.parse(org.metadata) : org.metadata;
            }
          } catch {
          }
          const existing = (db.tenants || []).find(
            (t) => t.id === org.id || t.domainSlug === org.slug
          );
          const tenantObj = {
            id: org.id,
            name: org.name,
            legalEntity: existing?.legalEntity || "PT",
            brandName: org.name,
            tagline: meta.tagline || existing?.tagline || "Legal & Commercial Contract Management",
            logoUrl: org.logo || existing?.logoUrl || "/favicon.png",
            primaryColor: meta.primaryColor || existing?.primaryColor || "#06C755",
            currency: meta.currency || existing?.currency || "IDR",
            domainSlug: org.slug,
            isDefault: org.slug === "adapundi" || Boolean(existing?.isDefault),
            spreadsheetId: existing?.spreadsheetId || meta.spreadsheetId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? db.googleConfig?.spreadsheetId : void 0),
            spreadsheetUrl: existing?.spreadsheetUrl || meta.spreadsheetUrl || (existing?.spreadsheetId || meta.spreadsheetId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? db.googleConfig?.spreadsheetId : void 0) ? `https://docs.google.com/spreadsheets/d/${existing?.spreadsheetId || meta.spreadsheetId || db.googleConfig?.spreadsheetId}/edit` : void 0),
            driveFolderId: existing?.driveFolderId || meta.driveFolderId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? db.googleConfig?.driveFolderId : void 0),
            driveFolderLink: existing?.driveFolderLink || meta.driveFolderLink || (existing?.driveFolderId || meta.driveFolderId || (org.slug === "adapundi" || org.id === "org-adapundi" || org.id === "org_1789542306289_b3a4f3" ? db.googleConfig?.driveFolderId : void 0) ? `https://drive.google.com/drive/folders/${existing?.driveFolderId || meta.driveFolderId || db.googleConfig?.driveFolderId}` : void 0)
          };
          updatedTenants.push(tenantObj);
        });
        db.tenants = updatedTenants;
        if (!db.tenants.some((t) => t.id === db.activeTenantId)) {
          db.activeTenantId = db.tenants[0]?.id || "org_1789542306289_b3a4f3";
        }
        saveDb();
      }
    }
  } catch (err) {
    console.warn(
      "Error reading sqlite organization table in syncTenantsWithSqlite:",
      err
    );
  }
}
app.get("/api/tenants", async (req, res) => {
  syncTenantsWithSqlite();
  if (!db.tenants || !Array.isArray(db.tenants) || db.tenants.length === 0) {
    db.tenants = [DEFAULT_TENANTS[0]];
  }
  if (sanitizeParentFolderId(db.googleConfig?.driveFolderId) && db.tenants.some(
    (t) => !t.driveFolderId || t.driveFolderId.startsWith("Folder_")
  )) {
    try {
      const token = req.headers["x-google-access-token"] || db.googleConfig?.accessToken;
      await autoEnsureTenantGoogleResources(token);
    } catch (e) {
      console.warn(
        "[GET /api/tenants] autoEnsureTenantGoogleResources warning:",
        e?.message
      );
    }
  }
  const clientTenantId = req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || req.query.activeTenantId;
  if (clientTenantId && db.tenants.some((t) => t.id === clientTenantId || t.domainSlug === clientTenantId)) {
    const matched = db.tenants.find((t) => t.id === clientTenantId || t.domainSlug === clientTenantId);
    if (matched) {
      db.activeTenantId = matched.id;
      saveDb();
    }
  } else if (!db.activeTenantId || !db.tenants.some((t) => t.id === db.activeTenantId)) {
    db.activeTenantId = db.tenants[0]?.id || "org_1789542306289_b3a4f3";
    saveDb();
  }
  return res.json({
    success: true,
    tenants: db.tenants,
    activeTenantId: db.activeTenantId
  });
});
app.post("/api/tenants/switch", (req, res) => {
  const { tenantId } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: "tenantId is required." });
  }
  syncTenantsWithSqlite();
  let exists = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === tenantId || t.domainSlug === tenantId);
  if (!exists) {
    try {
      if (sqliteDb) {
        const orgInSqlite = sqliteDb.prepare("SELECT * FROM organization WHERE id = ? OR slug = ?").get(tenantId, tenantId);
        if (orgInSqlite) {
          syncTenantsWithSqlite();
          exists = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === orgInSqlite.id || t.domainSlug === orgInSqlite.slug);
        }
      }
    } catch {
    }
  }
  if (!exists) {
    return res.status(404).json({ error: "Tenant not found." });
  }
  const targetId = exists.id;
  db.activeTenantId = targetId;
  saveDb();
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ") && sqliteDb) {
      const token = authHeader.substring(7);
      sqliteDb.prepare("UPDATE session SET activeOrganizationId = ?, updatedAt = ? WHERE token = ?").run(targetId, (/* @__PURE__ */ new Date()).toISOString(), token);
    }
  } catch (err) {
    console.warn("Failed to update activeOrganizationId in sqlite session:", err);
  }
  return res.json({ success: true, activeTenantId: targetId });
});
app.post("/api/tenants", (req, res) => {
  const tenantData = req.body;
  if (!tenantData.name) {
    return res.status(400).json({ error: "Tenant name is required." });
  }
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const newTenant = {
    id: `tenant-${Date.now()}`,
    name: tenantData.name,
    legalEntity: tenantData.legalEntity || "PT",
    brandName: tenantData.brandName || tenantData.name,
    tagline: tenantData.tagline || "",
    logoUrl: tenantData.logoUrl || "/favicon.png",
    primaryColor: tenantData.primaryColor || "#06C755",
    currency: tenantData.currency || "IDR",
    domainSlug: tenantData.domainSlug || tenantData.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    isDefault: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.tenants.push(newTenant);
  saveDb();
  return res.json({ success: true, tenants: db.tenants, newTenant });
});
app.put("/api/tenants/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const index = db.tenants.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Tenant not found." });
  }
  db.tenants[index] = {
    ...db.tenants[index],
    ...updates,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveDb();
  return res.json({ success: true, tenants: db.tenants });
});
app.delete("/api/tenants/:id", (req, res) => {
  const { id } = req.params;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const target = db.tenants.find((t) => t.id === id);
  if (target?.isDefault || target?.domainSlug === "adapundi") {
    return res.status(400).json({ error: "Default tenant cannot be deleted." });
  }
  db.tenants = db.tenants.filter(
    (t) => t.id !== id && t.domainSlug !== target?.domainSlug
  );
  if (db.activeTenantId === id) {
    db.activeTenantId = db.tenants[0]?.id || "tenant-adapundi";
  }
  try {
    if (sqliteDb) {
      sqliteDb.prepare("DELETE FROM member WHERE organizationId = ?").run(id);
      sqliteDb.prepare("DELETE FROM team WHERE organizationId = ?").run(id);
      sqliteDb.prepare("DELETE FROM invitation WHERE organizationId = ?").run(id);
      sqliteDb.prepare("DELETE FROM organization WHERE id = ? OR slug = ?").run(id, target?.domainSlug || "");
    }
  } catch (err) {
    console.warn(
      "Could not delete sqlite organization record in /api/tenants/:id:",
      err
    );
  }
  saveDb();
  return res.json({
    success: true,
    tenants: db.tenants,
    activeTenantId: db.activeTenantId
  });
});
app.post("/api/tenants/:id/setup-google", async (req, res) => {
  const { id } = req.params;
  const {
    driveFolderId,
    spreadsheetId,
    createNewFolder,
    createNewSheet,
    userEmail,
    userName,
    userRole
  } = req.body;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const tenant = db.tenants.find((t) => t.id === id);
  if (!tenant) {
    return res.status(404).json({ error: "Organisasi tidak ditemukan." });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken
  );
  if (!token && !hasServiceAccountCredentials()) {
    return res.status(400).json({
      error: "Koneksi Google belum aktif. Hubungkan sesi Google Drive / Service Account terlebih dahulu."
    });
  }
  try {
    let finalFolderId = driveFolderId || tenant.driveFolderId;
    let finalFolderLink = tenant.driveFolderLink;
    if (createNewFolder || !finalFolderId) {
      const orgFolder = await getOrgFolderId(tenant, token);
      finalFolderId = orgFolder.id;
      finalFolderLink = orgFolder.webViewLink || `https://drive.google.com/drive/folders/${orgFolder.id}`;
    } else if (finalFolderId && !finalFolderLink) {
      finalFolderLink = `https://drive.google.com/drive/folders/${finalFolderId}`;
    }
    tenant.driveFolderId = finalFolderId || void 0;
    tenant.driveFolderLink = finalFolderLink || void 0;
    tenant.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    saveDb();
    addActivityLog(
      userEmail || "user@app",
      userName || "User",
      userRole || "Admin",
      "UPDATE",
      "TENANT",
      `Konfigurasi Google Drive Folder Organisasi '${tenant.name}' berhasil diperbarui`,
      req
    );
    return res.json({
      success: true,
      tenant,
      message: `Berhasil mengonfigurasi folder Google Drive untuk ${tenant.name}.`
    });
  } catch (err) {
    console.error(
      `Error setting up Google Drive for tenant ${tenant.name}:`,
      err
    );
    return res.status(500).json({
      error: err.message || "Gagal mengatur Google Drive untuk organisasi."
    });
  }
});
app.post("/api/tenants/:id/sync-google", async (req, res) => {
  const { id } = req.params;
  const tenant = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === id);
  if (!tenant) {
    return res.status(404).json({ error: "Organisasi tidak ditemukan." });
  }
  return res.json({
    success: true,
    message: `Data organisasi '${tenant.name}' tersimpan aman & tersinkronisasi di database SQLite.`
  });
});
app.get("/api/branding", (req, res) => {
  if (!db.branding) {
    db.branding = DEFAULT_BRANDING;
  }
  return res.json({ success: true, branding: db.branding });
});
app.post("/api/branding", (req, res) => {
  const brandingData = req.body;
  db.branding = { ...db.branding || DEFAULT_BRANDING, ...brandingData };
  saveDb();
  return res.json({ success: true, branding: db.branding });
});
app.post("/api/chat", async (req, res) => {
  try {
    const { query, history } = req.body;
    if (!query && (!history || history.length === 0)) {
      return res.status(400).json({ error: "Query is required" });
    }
    const ai = getGenAIClient();
    const dbContext = {
      partners: (db.partners || []).map((p) => ({
        partner_id: p.partner_id || p.id,
        nama_partner: p.nama_partner,
        codename_channel: p.codename || p.partner_channel || p.media_network || "",
        jenis_partner: p.jenis_partner || "Vendor",
        badan_hukum: p.badan_hukum || "BHI",
        status_dd: p.status_dd || "Belum Lengkap",
        tanggal_dd_diverifikasi: p.tanggal_dd_diverifikasi || "",
        pic_internal: p.pic_internal || p.internal_pic || "",
        pic_partner: p.pic_partner || p.nama_pic || p.kontak_pic || "",
        email_pic: p.email_pic || "",
        telepon_pic: p.telepon_pic || "",
        alamat_pic: p.alamat_pic || "",
        tags_kategori: p.tags || [],
        internal_notes_partner: p.catatan || p.internal_notes || p.notes || "",
        daftar_dokumen_dd: Array.isArray(p.daftar_dokumen_dd) ? p.daftar_dokumen_dd.map((d) => ({
          nama: d.nama,
          status: d.status,
          wajib: d.wajib,
          nomorDokumen: d.nomorDokumen || "",
          tanggalKadaluarsa: d.tanggalKadaluarsa || ""
        })) : []
      })),
      contracts: (db.contracts || []).map((c) => ({
        contract_id: c.contract_id || c.id,
        nomor_kontrak: c.nomor_kontrak,
        judul_kontrak: c.judul_kontrak,
        partner_nama: c.partner_nama || c.nama_partner || "",
        partner_id: c.partner_id || "",
        jenis_dokumen: c.jenis_dokumen || "Master Agreement",
        parent_contract_nomor: c.parent_contract_nomor || c.parent_nomor || "",
        kategori_kerjasama: c.kategori_kerjasama || [],
        tanggal_mulai: c.tanggal_mulai,
        tanggal_berakhir: c.tanggal_berakhir,
        currency: c.currency || c.mata_uang || "IDR",
        nilai_kontrak: c.nilai_kontrak || 0,
        nilai_kontrak_usd: c.nilai_kontrak_usd || 0,
        auto_renewal: Boolean(c.auto_renewal),
        notice_period_hari: c.notice_period_hari || c.notice_period_days || 30,
        notice_type_required: c.notice_type_required || "Termination",
        status: c.status || c.status_kontrak || "Aktif",
        status_approval: c.status_approval || "Aktif",
        pic_internal: c.pic_internal || "",
        internal_notes_kontrak: c.internal_notes || c.notes || c.catatan || c.ringkasan_kontrak || "",
        ringkasan_perubahan: c.ringkasan_perubahan || "",
        field_yang_berubah: c.field_yang_berubah || [],
        sisa_hari: c.sisa_hari
      })),
      ios: (db.ios || []).map((i) => {
        const endDateStr = i.tanggal_berakhir || i.tanggal_selesai || i.period_end || "";
        let sisaHari = i.sisa_hari;
        let computedStatus = i.status || "Aktif";
        if (endDateStr) {
          const today = /* @__PURE__ */ new Date();
          today.setHours(0, 0, 0, 0);
          const endDate = new Date(endDateStr);
          if (!isNaN(endDate.getTime())) {
            endDate.setHours(0, 0, 0, 0);
            sisaHari = Math.ceil(
              (endDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24)
            );
            if (computedStatus !== "Terminated") {
              if (sisaHari < 0) computedStatus = "Expired";
              else if (sisaHari <= 90) computedStatus = "Akan Berakhir";
              else computedStatus = "Aktif";
            }
          }
        }
        return {
          io_id: i.io_id || i.id,
          nomor_io: i.nomor_io,
          judul_io: i.judul_io,
          partner_nama: i.partner_nama || i.nama_partner || "",
          partner_id: i.partner_id || "",
          contract_nomor: i.contract_nomor || "",
          kanal_media: i.kanal_media || i.channel || "",
          tanggal_mulai: i.tanggal_mulai || i.period_start || "",
          tanggal_berakhir: endDateStr,
          tanggal_selesai: endDateStr,
          pricing_model: i.pricing_model || "Flat Fee",
          charging_type: i.charging_type || "Prepaid",
          skema_pembayaran: i.skema_pembayaran || i.model_pembayaran || "",
          currency: i.currency || i.mata_uang || "IDR",
          nilai_io: i.nilai_io || i.total_nominal || 0,
          nilai_io_usd: i.nilai_io_usd || 0,
          deliverables: i.deliverables || "",
          notice_period_hari: i.notice_period_hari || i.notice_period_days || 14,
          notice_type_required: i.notice_type_required || "Termination",
          status: computedStatus,
          internal_notes_io: i.internal_notes || i.notes || i.catatan || "",
          sisa_hari: sisaHari
        };
      }),
      spendings_and_invoices: (db.spendings || []).map((s) => ({
        spending_id: s.id,
        vendor_name: s.vendor_name || s.partner_name || "",
        vendor_id: s.vendor_id || s.partner_id || "",
        invoice_number: s.invoice_number || "",
        invoice_date: s.invoice_date || "",
        invoice_month: s.invoice_month || s.month || "",
        currency: s.currency || "IDR",
        total_amount: s.total_amount || s.amount || 0,
        total_amount_usd: s.total_amount_usd || s.amount_usd || 0,
        invoice_description: s.invoice_description || s.description || "",
        internal_notes_invoice: s.internal_notes || s.notes || s.catatan || s.invoice_description || "",
        payment_status: s.payment_status || "Paid",
        bank_info: [
          s.bank_name,
          s.bank_account_number,
          s.bank_account_holder_name
        ].filter(Boolean).join(" - ")
      })),
      evaluations: (db.evaluations || []).map((e) => ({
        evaluation_id: e.id,
        supplier_name: e.supplier_name,
        review_date: e.review_date,
        type_of_work: e.type_of_work,
        sla_score: e.sla_score,
        obligation_target: e.obligation_target,
        communication: e.communication,
        pricing: e.pricing,
        calculated_score: e.calculated_score,
        final_evaluation: e.final_evaluation,
        internal_notes_evaluasi: e.notes || e.catatan || "",
        evaluator_name: e.evaluator_name || ""
      }))
    };
    const systemInstruction = `You are a highly capable, context-aware AI Legal, Commercial & Business Assistant integrated into the SiLegal Dashboard (Contract, Partner, Insertion Order, Invoice Spending, and Vendor Evaluation Management System).
Your job is to answer the user's questions based strictly and comprehensively on the provided sheet database JSON and the ongoing multi-turn conversation session context.

You have full, transparent access to ALL data fields from the sheet database, including:
- **Partners**: Nama, status DD, dokumen legalitas, kontak PIC, dan **Internal Notes Partner** (\`internal_notes_partner\`).
- **Contracts**: Nomor kontrak, judul, jenis dokumen, nilai komersial, tanggal mulai & selesai, notice period, auto-renewal, dan **Internal Notes Kontrak** (\`internal_notes_kontrak\` / rangkuman khusus).
- **Insertion Orders (IO)**: Nomor IO, kanal media, pricing model, deliverables, skema pembayaran, dan **Internal Notes IO** (\`internal_notes_io\`).
- **Spendings & Invoices**: Nomor invoice, tanggal, deskripsi penagihan, rekening bank, nilai pengeluaran, dan **Internal Notes Invoice / Penagihan** (\`internal_notes_invoice\`).
- **Evaluasi Vendor**: Skor SLA, status rekomendasi, dan **Internal Notes Evaluasi** (\`internal_notes_evaluasi\`).

Current Database JSON:
${JSON.stringify(dbContext, null, 2)}

Context & Retrieval Guidelines:
1. Thorough Inspection: When asked about any notes, remarks, legal comments, or summaries, check the relevant \`internal_notes_*\` fields across partners, contracts, IOs, spendings, and evaluations.
2. Maintain Session Context: Remember and understand prior questions and answers in this conversation. If the user asks follow-up questions referencing a previously discussed item (e.g., "dia", "kontrak itu", "notes-nya apa", "yang tadi"), resolve the reference seamlessly.
3. Be concise, direct, professional, and accurate.
4. For calculations (sums, totals, active counts, currency breakdowns), calculate strictly from the JSON.
5. If a specific note or item is blank or not found in the records, state so clearly and politely.
6. FORMAT ATURAN WAJIB (SANGAT PENTING - BEBAS TABEL):
   - DILARANG menggunakan atau menghasilkan respon dalam bentuk TABEL Markdown (| col1 | col2 |) untuk perbandingan atau data apa pun karena tabel tidak dapat dimuat sempurna di lebar chat widget.
   - Sebagai alternatif, SELALU gunakan format BULLET LIST / POIN-POIN TERSTRUKTUR (bullet points dan sub-bullet berinden) dengan judul/nama entitas dan kategori ditebalkan (bold).
   Contoh format perbandingan yang rapi:
   * **[Item / Kontrak / Partner A]**:
     - Status / Nilai: ...
     - Klausul / Detail: ...
   * **[Item / Kontrak / Partner B]**:
     - Status / Nilai: ...
     - Klausul / Detail: ...
   * **Kesimpulan / Rekomendasi**: Ringkasan singkat poin pembeda
7. Answer in Indonesian unless requested otherwise.`;
    const contents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history) {
        if (msg && typeof msg.text === "string" && msg.text.trim()) {
          const role = msg.role === "ai" || msg.role === "model" ? "model" : "user";
          contents.push({ role, parts: [{ text: msg.text.trim() }] });
        }
      }
    }
    if (query && typeof query === "string" && query.trim()) {
      const lastMsg = contents[contents.length - 1];
      if (!lastMsg || lastMsg.role !== "user" || lastMsg.parts[0]?.text !== query.trim()) {
        contents.push({ role: "user", parts: [{ text: query.trim() }] });
      }
    }
    const modelToUse = getValidAiModel(db.googleConfig?.aiModel || "gemini-3.8-flash");
    const response = await generateContentWithRetryAndFallback({
      model: modelToUse,
      contents,
      config: { systemInstruction, temperature: 0.2 }
    });
    res.json({ success: true, reply: response.text });
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: error?.message || "Failed to process AI request" });
  }
});
app.use("/api/auth-console", authConsoleRouter);
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});
app.use((err, req, res, next) => {
  console.error("[API Unhandled Error]", err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith("/api/")) {
    return res.status(err.status || 500).json({
      error: err.message || "Terjadi kesalahan internal server.",
      status: err.status || 500
    });
  }
  next(err);
});
async function startServer() {
  let viteServer;
  if (process.env.NODE_ENV !== "production") {
    viteServer = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = import_path4.default.join(process.cwd(), "dist");
    app.use(import_express3.default.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(import_path4.default.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Pengelola Kontrak & IO Server running on http://0.0.0.0:${PORT}`
    );
  });
  const shutdown = __name(async () => {
    console.log("Shutting down server...");
    if (viteServer) {
      await viteServer.close();
    }
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forcing shutdown after 3s");
      process.exit(1);
    }, 3e3).unref();
  }, "shutdown");
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
startServer();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getFreshGoogleAccessToken,
  isMatchingOrg,
  rbacAuthMiddleware,
  requireTenantRole,
  resolveActiveGoogleToken
});
//# sourceMappingURL=server.cjs.map
