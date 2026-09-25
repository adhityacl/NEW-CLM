import "dotenv/config";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
/* RBAC-INTEGRATION-V1 */
import { createRbacRouter, requirePermission } from "./server/rbacRoutes";
import { hasPermission as rbacHasPermission, normalizeRole as rbacNormalizeRole } from "./server/rbac";
import { GoogleGenAI, Type } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { toNodeHandler } from "better-auth/node";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  auth as betterAuthInstance,
  sqliteDb,
  hydrateCoreDataFromJson,
  syncDbToSqlite,
  loadCoreDataFromSqlite,
} from "./src/lib/auth";
import {
  authConsoleRouter,
  setConsoleDbReference,
  hydrateAuthConsoleFromDataStore,
  ensureUserAccountsExist,
} from "./src/server/authConsoleRoutes";
import Database from "better-sqlite3";
import {
  formatContractFileName,
  formatIOFileName,
  formatInvoiceFileName,
  formatBillingFileName,
  formatDueDiligenceFileName,
} from "./src/lib/fileNaming";
import {
  getExchangeRates,
  getHistoricalExchangeRate,
  getUsdRate,
} from "./src/lib/currencyRates";
import {
  createDriveFolder,
  createNewDriveFolderInParent,
  getOrCreateDriveFolder,
  uploadFileToDrive,
  extractFolderIdFromLink,
  sanitizeParentFolderId,
  setInvalidTokenCallback,
  setRefreshTokenGetter,
  createSpreadsheetInFolder,
  createGoogleDocInFolder,
} from "./src/lib/googleDriveSync";
import {
  loadServiceAccountCredentials,
  hasServiceAccountCredentials,
  getGoogleSheetsClient,
} from "./src/lib/googleServiceAccountAuth";
import multer from "multer";
import {
  bindTenantStore,
  getDefaultTenantId,
  getTenantSettings,
  tenantDefaultCurrency,
  tenantDisplayName,
  computeLifecycle,
  normalizePartnerDocuments,
  computeDueDiligenceStatus,
  aiPolicyContext,
  findTenant,
  isLegacyDefaultAlias,
} from "./server/tenantPolicy";
import {
  resolveTenantSettings,
  todayInTimezone,
  listCountryPacks,
  listIndustryPacks,
  buildDueDiligenceChecklist,
  getCountryPack,
  getIndustryPack,
  localize,
} from "./src/lib/policy";
import {
  normalizeContractStatus,
  normalizeApprovalStatus,
  normalizeDueDiligenceStatus,
  normalizeDocumentStatus,
} from "./src/lib/domainStatus";
import {
  convertToUsdWithFallback,
  getDefaultUsdRate,
  normalizeCurrencyCode,
} from "./src/lib/currencyUtils";
import { buildDemoDataset, DEMO_TENANTS } from "./src/data/demoDataset";
import {
  buildCheapOcrContents,
  globalOcrCache,
  computeInputSha256,
} from "./src/lib/cheapOcrPipeline";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.all(["/api/auth", "/api/auth/*"], (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith("/api/auth/google")) {
    return next();
  }
  return toNodeHandler(betterAuthInstance)(req, res);
});

// Strict RBAC Middleware with 1-word roles: Admin, Editor, Viewer
// Viewer is strictly view-only: permits GET / HEAD / OPTIONS, rejects database write mutations (POST/PUT/DELETE/PATCH) on resource entities with 403.
/** Session token from the Better Auth cookie (`<token>.<signature>`), if any. */
function readSessionCookieToken(req: express.Request): string {
  const cookie = String(req.headers.cookie || "");
  const match = cookie.match(/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]).split(".")[0];
  } catch {
    return "";
  }
}
export const rbacAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Only authentication itself, health checks, public reference data and the
  // unauthenticated first-run status probe are reachable without a session.
  // Every data or AI endpoint requires one (PRD §5.2, §6.3).
  if (
    !req.path.startsWith("/api/") ||
    req.path === "/api/auth" || req.path.startsWith("/api/auth/") ||
    req.path === "/api/health" ||
    req.path === "/api/system/public-status" ||
    req.path === "/api/exchange-rates" ||
    req.path === "/api/exchange-rate-historical"
  ) {
    return next();
  }

  // 1. Resolve user email and token
  let userEmail = (
    req.headers["x-user-email"] ||
    req.headers["x-google-user-email"] ||
    req.query?.userEmail ||
    ""
  ).toString().toLowerCase().trim();

  let detectedRole: string | null = null;
  let isBanned = false;

  // Check session token in SQLite auth database (Bearer header, or the
  // Better Auth session cookie for plain browser requests).
  const authHeader = req.headers["authorization"] || req.headers["x-session-token"] || readSessionCookieToken(req);
  if (authHeader && sqliteDb) {
    try {
      const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7).trim()
        : String(authHeader).trim();
      const sessionRow: any = sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(token);
      if (sessionRow?.userId) {
        const userRow: any = sqliteDb.prepare("SELECT email, role, banned FROM user WHERE id = ?").get(sessionRow.userId);
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
    } catch {}
  }

  // Look up in SQLite user table by email
  if (userEmail && !detectedRole && sqliteDb) {
    try {
      const userRow: any = sqliteDb.prepare("SELECT role, banned FROM user WHERE LOWER(email) = LOWER(?)").get(userEmail);
      if (userRow) {
        if (userRow.banned === 1) {
          isBanned = true;
        }
        if (userRow.role) {
          detectedRole = userRow.role;
        }
      }
    } catch {}
  }

  // Look up in db.allowedUsers
  if (userEmail) {
    const allowed = (db.allowedUsers || []).find(
      (u: any) => (u.email || "").toLowerCase() === userEmail,
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
      email: userEmail,
    });
  }

  /* RBAC-INTEGRATION-V1-STRICT */
  // Identitas WAJIB berasal dari sesi terverifikasi (token di tabel session).
  // Menutup kebocoran: request anonim sebelumnya diperlakukan sebagai Viewer.
  {
    let strictSessionOk = false;
    if (authHeader && sqliteDb) {
      try {
        const t = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : String(authHeader).trim();
        strictSessionOk = !!sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(t);
      } catch { strictSessionOk = false; }
    }
    if (!strictSessionOk) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
  }

  // Determine role based on verified DB/Session role.
  //
  // This used to collapse the app's 5 roles into 3 ad-hoc buckets by regex
  // ("admin|superuser|owner" -> Admin, "editor|manager|legal|finance" ->
  // Editor, everything else -> Viewer) and only ever blocked the Viewer
  // bucket from write methods — meaning Editor and Manager were completely
  // undifferentiated here, as were Admin and Superuser, and any endpoint
  // that relied solely on this gate (most of them; see QA/QC audit finding
  // C5) enforced nothing beyond "not a Viewer". `normalizeRole`/
  // `hasPermission` are the same functions the rest of the RBAC engine
  // (`server/rbac.ts`) is built on, so this floor now tracks the real
  // permission matrix instead of a parallel, driftable regex classifier.
  const rawRole = (detectedRole || "").toString().toLowerCase().trim();
  const role = rbacNormalizeRole(rawRole);
  (req as any).rbacRole = role;

  const method = req.method.toUpperCase();
  // POST endpoints that only read data (AI Q&A over the viewer's own tenant).
  const READ_ONLY_POSTS = new Set(["/api/chat"]);
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method) && !READ_ONLY_POSTS.has(req.path)) {
    const requiredPermission =
      method === "DELETE" ? "document.delete" : method === "POST" ? "document.create" : "document.edit";
    if (!rbacHasPermission(role, requiredPermission)) {
      return res.status(403).json({
        error: "INSUFFICIENT_PERMISSION",
        message: `Peran ${role} tidak memiliki izin untuk melakukan perubahan data (${method}).`,
        role,
        attemptedMethod: method,
      });
    }
  }

  next();
};

app.use(rbacAuthMiddleware);

/* RBAC-INTEGRATION-V1 */
// Actor RBAC diambil dari sesi terverifikasi (better-auth / token sesi), bukan header yang bisa dipalsukan.
/**
 * Resolve the tenant-scoped actor for a verified user.
 *
 * A non-superuser always operates inside one of THEIR memberships: the
 * session's active organization first, then the client-requested one, then
 * their first membership. A requested organization they do not belong to is
 * ignored (never trusted), so headers cannot widen tenant scope.
 */
function resolveMembershipActor(userId: string, globalRole: string, sessionActiveOrgId: string, requestedOrgId: string, token: string) {
  if (globalRole === "superuser") {
    return { id: userId, role: "superuser", tenantId: requestedOrgId || sessionActiveOrgId || null, departmentId: null };
  }
  const memberships: any[] = sqliteDb.prepare(
    "SELECT organizationId, role FROM member WHERE userId = ? ORDER BY createdAt ASC",
  ).all(userId);
  if (memberships.length === 0) return null;
  const m =
    memberships.find((r) => sessionActiveOrgId && r.organizationId === sessionActiveOrgId) ||
    memberships.find((r) => requestedOrgId && r.organizationId === requestedOrgId) ||
    memberships[0];
  if (token && m.organizationId !== sessionActiveOrgId) {
    try {
      sqliteDb.prepare("UPDATE session SET activeOrganizationId = ?, updatedAt = ? WHERE token = ?")
        .run(m.organizationId, new Date().toISOString(), token);
    } catch { /* best effort */ }
  }
  // All of this org's teams the user belongs to, so Managers/Editors/Viewers
  // covering several departments are scoped to all of them.
  const tms: any[] = sqliteDb.prepare(`
    SELECT t.id
    FROM teamMember tm
    JOIN team t ON t.id = tm.teamId
    WHERE tm.userId = ? AND t.organizationId = ?
    ORDER BY tm.createdAt ASC
  `).all(userId, m.organizationId);
  const departmentIds = tms.map((r: any) => r.id);
  const memberRole = String(m.role || "").toLowerCase().trim();
  const raw = memberRole === "owner" ? "admin" : (memberRole || globalRole || "viewer");
  return {
    id: userId,
    role: String(raw).toLowerCase(),
    tenantId: m.organizationId,
    departmentId: departmentIds[0] ?? null,
    departmentIds,
  };
}

const resolveRbacActor = async (req: any) => {
  const requestedOrgId = String(req.headers["x-organization-id"] || req.headers["x-tenant-id"] || "").trim();
  const rawToken = req.headers["authorization"] || req.headers["x-session-token"] || readSessionCookieToken(req);
  const token = typeof rawToken === "string" && rawToken.startsWith("Bearer ") ? rawToken.substring(7).trim() : String(rawToken || "").trim();
  try {
    const session = await betterAuthInstance.api.getSession({ headers: req.headers as any });
    if (session?.user?.id) {
      const u: any = sqliteDb.prepare("SELECT role, banned FROM user WHERE id = ?").get(session.user.id);
      if (u?.banned === 1) return null;
      const sessionData = (session as any).session || {};
      return resolveMembershipActor(
        session.user.id,
        String(u?.role || "").toLowerCase().trim(),
        String(sessionData.activeOrganizationId || "").trim(),
        requestedOrgId,
        token,
      );
    }
  } catch { /* fall back to the raw session table */ }
  try {
    if (token && sqliteDb) {
      const s: any = sqliteDb.prepare("SELECT userId, activeOrganizationId, expiresAt FROM session WHERE token = ?").get(token);
      if (s?.userId && (!s.expiresAt || new Date(s.expiresAt).getTime() > Date.now())) {
        const u: any = sqliteDb.prepare("SELECT role, banned FROM user WHERE id = ?").get(s.userId);
        if (u?.banned === 1) return null;
        return resolveMembershipActor(
          s.userId,
          String(u?.role || "").toLowerCase().trim(),
          String(s.activeOrganizationId || "").trim(),
          requestedOrgId,
          token,
        );
      }
    }
  } catch { /* no actor */ }
  return null;
};
const attachRbacActor = async (req: any, _res: any, next: any) => {
  req.actor = await resolveRbacActor(req);
  next();
};
app.use(attachRbacActor);
app.use("/api/rbac", createRbacRouter({ resolveActor: (req: any) => req.actor ?? null }));

/* RBAC-INTEGRATION-V1-SECURE */
// Guard izin bertarget (jangan blanket — endpoint publik seperti invitations/accept harus tetap jalan).
app.use("/api/auth-console/users", requirePermission("admin.user.manage", "tenant"));
app.use("/api/auth-console/sessions", requirePermission("admin.access", "tenant"));
app.use("/api/activity-logs", requirePermission("admin.access", "tenant"));
app.post("/api/tenants/switch", requirePermission("workspace.switch", "global"));
app.use("/api/tenants/switch", requirePermission("workspace.switch", "global"));

// Middleware proteksi route berdasarkan Tenant & Role (Better Auth Organization Plugin)
export const requireTenantRole = (requiredRole: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const session = await betterAuthInstance.api.getSession({
        headers: req.headers as any,
      });

      if (!session) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Ambil orgId dari request header atau query
      const activeOrgId = (req.headers["x-organization-id"] || req.headers["x-tenant-id"] || req.query.organizationId) as string;

      if (!activeOrgId) {
        return res.status(400).json({ message: "Organization ID header is missing" });
      }

      // Verifikasi peran user di dalam tenant tersebut
      try {
        const member = await betterAuthInstance.api.getActiveMember({
          headers: req.headers as any,
          query: { organizationId: activeOrgId },
        });

        if (!member || (requiredRole === "admin" && member.role !== "admin" && member.role !== "owner")) {
          return res.status(403).json({ message: "Forbidden: Insufficient permissions for this tenant" });
        }
      } catch {
        // Fallback SQLite check
        const row = sqliteDb.prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?").get(activeOrgId, session.user.id) as any;
        if (!row || (requiredRole === "admin" && row.role !== "admin" && row.role !== "owner")) {
          return res.status(403).json({ message: "Forbidden: Insufficient permissions for this tenant" });
        }
      }

      (req as any).user = session.user;
      next();
    } catch (err: any) {
      return res.status(500).json({ message: "Internal server error", error: err.message });
    }
  };
};

// Protected API Endpoint untuk Better Auth Multi-Tenant
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
    const activeId = db.activeTenantId || getDefaultTenantId();
    tenant =
      (db.tenants || DEFAULT_TENANTS).find((t) => t.id === activeId) ||
      DEFAULT_TENANTS[0];
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
      activeToken,
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
      err?.message || err,
    );
  }
  return {
    id: masterRootId,
    webViewLink: `https://drive.google.com/drive/folders/${masterRootId}`,
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
    const needFolder =
      !tenant.driveFolderId ||
      tenant.driveFolderId === masterRootId ||
      tenant.driveFolderId.startsWith("Folder_") ||
      tenant.driveFolderId === "-" ||
      forceNew;
    if (needFolder) {
      try {
        const orgFolderName = tenant.name || tenant.brandName || "Organisasi";
        let orgFolder = null;
        if (forceNew) {
          try {
            orgFolder = await createNewDriveFolderInParent(
              orgFolderName,
              masterRootId,
              activeToken,
            );
          } catch (createErr) {
            console.warn(
              `[AutoProvision] createNewDriveFolderInParent failed, falling back to getOrCreateDriveFolder:`,
              createErr?.message,
            );
          }
        }
        if (!orgFolder || !orgFolder.id) {
          orgFolder = await getOrCreateDriveFolder(
            orgFolderName,
            masterRootId,
            activeToken,
          );
        }
        if (orgFolder && orgFolder.id && orgFolder.id !== masterRootId) {
          tenant.driveFolderId = orgFolder.id;
          tenant.driveFolderLink =
            orgFolder.webViewLink ||
            `https://drive.google.com/drive/folders/${orgFolder.id}`;
          tenantChanged = true;
          console.log(
            `[AutoProvision] Created/Resolved org folder '${orgFolderName}' (${orgFolder.id}) inside Master Root (${masterRootId})`,
          );
        }
      } catch (err) {
        console.warn(
          `[AutoProvision] Failed to create folder for tenant '${tenant.name}':`,
          err?.message || err,
        );
      }
    }
    if (tenantChanged) {
      tenant.updated_at = new Date().toISOString();
      updatedCount++;
      try {
        const orgsDb = new Database(path.join(process.cwd(), "auth.db"));
        if (orgsDb) {
          const row: any = orgsDb
            .prepare("SELECT * FROM organization WHERE id = ? OR slug = ?")
            .get(tenant.id, tenant.domainSlug || tenant.id);
          if (row) {
            let meta: any = {};
            try {
              if (row.metadata)
                meta =
                  typeof row.metadata === "string"
                    ? JSON.parse(row.metadata)
                    : row.metadata;
            } catch {}
            if (tenant.driveFolderId) meta.driveFolderId = tenant.driveFolderId;
            orgsDb
              .prepare(
                "UPDATE organization SET metadata = ? WHERE id = ? OR slug = ?",
              )
              .run(
                JSON.stringify(meta),
                tenant.id,
                tenant.domainSlug || tenant.id,
              );
          }
        }
      } catch (e) {
        console.warn(
          `Could not sync sqlite organization metadata for ${tenant.name}:`,
          e?.message,
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
  const targetOrgId =
    orgId || partner.organizationId || db.activeTenantId || getDefaultTenantId();
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
        activeToken,
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
        err,
      );
    }
  }
  return parentFolderId;
}
async function getPartnerCategoryFolderId(partner: any, category: string, token?: string, orgId?: string) {
  const vendorFolderId = await getPartnerFolderId(partner, token, orgId);
  if (!vendorFolderId) return db.googleConfig.driveFolderId;
  const activeToken = await resolveActiveGoogleToken(token);
  if (!activeToken && !hasServiceAccountCredentials()) return vendorFolderId;
  try {
    const categoryFolder = await getOrCreateDriveFolder(
      category,
      vendorFolderId,
      activeToken,
    );
    return categoryFolder.id;
  } catch (err) {
    console.error(`Error getting/creating category folder '${category}':`, err);
    return vendorFolderId;
  }
}
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
/** Folder name used for a tenant under uploads/ (mirrors saveLocalFile). */
function tenantUploadFolderName(tenant: any): string {
  return String(tenant?.name || "Organization").replace(/[/\\?%*:|"<>]/g, "_").trim();
}
/*
 * Uploaded evidence (identity documents, contracts, invoices) is private:
 * a session is required, non-superusers may only read their own tenant's
 * folder, and files are served with headers that stop the browser from
 * executing uploaded content (PRD §5.2 upload hardening).
 */
app.use("/uploads", (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const actor = (req as any).actor;
  if (!actor) {
    return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  if (actor.role === "superuser") return next();
  let firstSegment = "";
  try {
    firstSegment = decodeURIComponent(req.path.replace(/^\/+/, "").split("/")[0] || "");
  } catch {
    return res.status(400).end();
  }
  const ownTenant = findTenant(actor.tenantId);
  const ownsFolder = ownTenant && tenantUploadFolderName(ownTenant) === firstSegment;
  const isRootFile = !req.path.replace(/^\/+/, "").includes("/");
  if (ownsFolder || (isRootFile && ["admin"].includes(String(actor.role)))) return next();
  return res.status(404).end();
}, express.static(uploadsDir, { dotfiles: "deny", index: false }));
function saveLocalFile(
  partnerName: any,
  category: string,
  safeFileName: string,
  base64Data: string,
  orgName?: string,
) {
  try {
    const cleanOrg = (orgName || tenantDisplayName(getDefaultTenantId()))
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim();
    const cleanVendor = (partnerName || "Vendor")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim();
    const subDir = path.join(uploadsDir, cleanOrg, cleanVendor, category);
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }
    const filePath = path.join(subDir, safeFileName);
    const cleanContent = base64Data.includes("base64,")
      ? base64Data.split("base64,")[1]
      : base64Data;
    fs.writeFileSync(filePath, Buffer.from(cleanContent, "base64"));
    return `/uploads/${encodeURIComponent(cleanOrg)}/${encodeURIComponent(cleanVendor)}/${encodeURIComponent(category)}/${safeFileName}`;
  } catch (err) {
    console.error("Error saving local file in hierarchical subfolder:", err);
    const rootPath = path.join(uploadsDir, safeFileName);
    const cleanContent = base64Data.includes("base64,")
      ? base64Data.split("base64,")[1]
      : base64Data;
    fs.writeFileSync(rootPath, Buffer.from(cleanContent, "base64"));
    return `/uploads/${safeFileName}`;
  }
}
function deleteLocalFileFromUrl(url) {
  if (!url || typeof url !== "string" || !url.includes("/uploads/")) return;
  try {
    const rawRel = url.substring(url.indexOf("/uploads/") + "/uploads/".length);
    const decodedRel = decodeURIComponent(rawRel);
    const fullPath = path.join(uploadsDir, decodedRel);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error("Error deleting temporary local file:", url, err);
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
        url.indexOf("/uploads/") + "/uploads/".length,
      );
      const decodedRel = decodeURIComponent(rawRel);
      const fullPath = path.join(uploadsDir, decodedRel);
      if (fs.existsSync(fullPath)) return fullPath;
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
        const fileName = c.fileName || path.basename(diskPath);
        const base64 = fs.readFileSync(diskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Contract",
          activeToken,
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          c.link_file_kontrak = driveUrl;
          try {
            fs.unlinkSync(diskPath);
          } catch (_) {}
          migratedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to migrate contract file ${c.contract_id} to Drive:`,
          err,
        );
      }
    }
  }
  for (const io of db.ios || []) {
    const partner = db.partners.find((p) => p.partner_id === io.partner_id);
    const ioDiskPath = getDiskPath(io.link_file_io);
    if (ioDiskPath) {
      try {
        const fileName = io.fileName || path.basename(ioDiskPath);
        const base64 = fs.readFileSync(ioDiskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder IO",
          activeToken,
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          io.link_file_io = driveUrl;
          try {
            fs.unlinkSync(ioDiskPath);
          } catch (_) {}
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
          const fileName = path.basename(diskPath);
          const base64 = fs.readFileSync(diskPath).toString("base64");
          const catFolderId = await getPartnerCategoryFolderId(
            partner,
            "Folder DD",
            activeToken,
          );
          const driveUrl = await uploadFileToDrive(
            fileName,
            base64,
            getMimeType2(fileName),
            catFolderId,
            activeToken,
          );
          if (
            driveUrl &&
            (driveUrl.includes("drive.google.com") ||
              driveUrl.includes("google.com"))
          ) {
            doc.linkDrive = driveUrl;
            try {
              fs.unlinkSync(diskPath);
            } catch (_) {}
            migratedCount++;
          }
        } catch (err) {
          console.error(
            `Failed to migrate DD doc ${doc.nama} for partner ${partner.nama_partner} to Drive:`,
            err,
          );
        }
      }
    }
  }
  for (const sp of db.spendings || []) {
    const partner = db.partners.find(
      (p) => p.nama_partner?.toLowerCase() === sp.vendor_name?.toLowerCase(),
    );
    const invDiskPath = getDiskPath(sp.invoice_file_url);
    if (invDiskPath) {
      try {
        const fileName = sp.invoice_file_name || path.basename(invDiskPath);
        const base64 = fs.readFileSync(invDiskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          activeToken,
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          sp.invoice_file_url = driveUrl;
          try {
            fs.unlinkSync(invDiskPath);
          } catch (_) {}
          migratedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to migrate spending invoice file ${sp.id} to Drive:`,
          err,
        );
      }
    }
    const billDiskPath = getDiskPath(sp.billing_file_url);
    if (billDiskPath) {
      try {
        const fileName = sp.billing_file_name || path.basename(billDiskPath);
        const base64 = fs.readFileSync(billDiskPath).toString("base64");
        const catFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          activeToken,
        );
        const driveUrl = await uploadFileToDrive(
          fileName,
          base64,
          getMimeType2(fileName),
          catFolderId,
          activeToken,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          sp.billing_file_url = driveUrl;
          try {
            fs.unlinkSync(billDiskPath);
          } catch (_) {}
          migratedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to migrate spending billing file ${sp.id} to Drive:`,
          err,
        );
      }
    }
  }
  if (migratedCount > 0) {
    saveDb();
    console.log(
      `[Drive Migration] Successfully migrated ${migratedCount} temporary local files to Google Drive.`,
    );
  }
  return { migratedCount };
}
function isMatchingOrg(entityOrgId, targetTenantId) {
  if (!targetTenantId) return true;
  if (entityOrgId === targetTenantId) return true;
  // Records without an organization (or carrying a pre-OSS alias) belong to
  // the default tenant.
  const defaultId = getDefaultTenantId();
  const isDefaultTarget = targetTenantId === defaultId || isLegacyDefaultAlias(targetTenantId);
  const isDefaultEntity = !entityOrgId || entityOrgId === defaultId || isLegacyDefaultAlias(entityOrgId);
  return Boolean(isDefaultTarget && isDefaultEntity);
}
/**
 * PUT/DELETE on contracts/partners/ios previously had no tenant check at all,
 * letting any non-Viewer role edit or delete another tenant's records by ID
 * (see QA/QC audit finding C4). GET already scopes reads via `isMatchingOrg`;
 * this mirrors that same tolerant comparison for writes. Superuser bypasses.
 * Returns null when the write may proceed, or a `{status, body}` pair to send
 * as-is when it may not — mismatches come back as 404 (not 403) so a caller
 * probing IDs can't use the response to confirm another tenant's resource
 * exists (PRD §29 anti-enumeration, mirrored from server/rbac.ts).
 */
function assertTenantWriteAccess(
  req: express.Request,
  entityOrgId: string | null | undefined,
): { status: number; body: { error: string; message: string } } | null {
  const actor = (req as any).actor;
  if (!actor) {
    return { status: 401, body: { error: "UNAUTHENTICATED", message: "Authentication is required." } };
  }
  if (actor.role === "superuser") return null;
  if (isMatchingOrg(entityOrgId, actor.tenantId)) return null;
  return {
    status: 404,
    body: { error: "RESOURCE_NOT_FOUND", message: "Resource not found." },
  };
}
/**
 * Tenant a request operates on. Non-superusers are pinned to the tenant of
 * their verified membership — client headers/body can never widen that
 * (PRD §4.4). Superusers may target any existing tenant explicitly.
 */
function getRequestTenantId(req: express.Request): string {
  const actor = (req as any).actor;
  if (!actor) return "__no_tenant__";
  if (actor.role !== "superuser") return actor.tenantId || "__no_tenant__";
  const requested = String(
    req.headers["x-organization-id"] ||
    req.headers["x-tenant-id"] ||
    req.query.tenantId ||
    (req.body && typeof req.body === "object" ? req.body.organizationId : "") ||
    "",
  ).trim();
  if (requested && findTenant(requested)) return findTenant(requested).id;
  return db.activeTenantId || getDefaultTenantId();
}
function canReadAllTenants(req: express.Request): boolean {
  return (req as any).actor?.role === "superuser" && req.query.all === "true";
}
async function ensureAllPartnersFolders(token?: string, targetTenantId?: string) {
  let localFoldersCreated = 0;
  let driveFoldersCreated = 0;
  const activeToken = await resolveActiveGoogleToken(token);
  const partnersToProcess = targetTenantId
    ? (db.partners || []).filter((p) =>
        isMatchingOrg(p.organizationId, targetTenantId),
      )
    : db.partners || [];
  for (const partner of partnersToProcess) {
    if (!partner.nama_partner) continue;
    const orgId =
      partner.organizationId ||
      targetTenantId ||
      db.activeTenantId ||
      getDefaultTenantId();
    const tenant =
      (db.tenants || DEFAULT_TENANTS).find((t) => t.id === orgId) ||
      DEFAULT_TENANTS[0];
    const cleanOrg = (tenant?.name || "Organization")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim();
    const cleanVendor = partner.nama_partner
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim();
    const categories = [
      "Folder Contract",
      "Folder Invoice & Billing",
      "Folder IO",
      "Folder DD",
    ];
    for (const cat of categories) {
      const dirPath = path.join(uploadsDir, cleanOrg, cleanVendor, cat);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        localFoldersCreated++;
      }
    }
    if (activeToken || hasServiceAccountCredentials()) {
      try {
        const vendorFolderId = await getPartnerFolderId(
          partner,
          activeToken,
          orgId,
        );
        if (vendorFolderId) {
          await getOrCreateDriveFolder(
            "Folder Contract",
            vendorFolderId,
            activeToken,
          );
          await getOrCreateDriveFolder(
            "Folder Invoice & Billing",
            vendorFolderId,
            activeToken,
          );
          await getOrCreateDriveFolder(
            "Folder IO",
            vendorFolderId,
            activeToken,
          );
          await getOrCreateDriveFolder(
            "Folder DD",
            vendorFolderId,
            activeToken,
          );
          driveFoldersCreated++;
        }
      } catch (err) {
        console.error(
          `Error provisioning Drive folders for partner ${partner.nama_partner} (${cleanOrg}):`,
          err?.message || err,
        );
        if (
          err.message &&
          err.message.includes("Service Account tidak memiliki akses")
        ) {
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
const dataFilePath = path.join(process.cwd(), "data_store.json");
const DEFAULT_BRANDING = {
  appName: "Silegal CLM",
  logoUrl: "/favicon.png",
  primaryColor: "#06C755",
  footerText: "Silegal — open-source contract lifecycle management.",
  loginHeadline: "Contract, partner and commercial document management",
};
// Only used when the store has no tenants at all (e.g. a store emptied by
// hand). A fresh install is seeded from the demo dataset instead.
const DEFAULT_TENANTS = [DEMO_TENANTS[0]];
/*
 * First-run bootstrap account. It exists so a fresh clone is usable
 * immediately; the UI warns while the default password is still active.
 * Disable with SEED_DEMO_ADMIN=false, or override the credentials.
 */
const DEFAULT_ADMIN_EMAIL = "admin@silegal.com";
const DEFAULT_ADMIN_PASSWORD = "123456789";
const demoAdminEmail = (process.env.DEMO_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const shouldSeedDemoAdmin = process.env.SEED_DEMO_ADMIN !== "false";
const demoData = buildDemoDataset();
let db: any = {
  allowedUsers: demoData.allowedUsers,
  partners: demoData.partners,
  contracts: demoData.contracts,
  ios: demoData.ios,
  notifications: demoData.notifications,
  activityLogs: demoData.activityLogs,
  evaluations: demoData.evaluations,
  spendings: demoData.spendings,
  tenants: demoData.tenants,
  departments: demoData.departments,
  newsTicker: { items: [] as string[], lastGeneratedAt: null as string | null },
  activeTenantId: demoData.tenants[0].id,
  branding: DEFAULT_BRANDING,
  googleConfig: {
    spreadsheetId: "",
    driveFolderId: "",
    isConnected: false,
    lastSyncTime: "",
    autoSync: false,
    isLocked: false,
    notificationEmails: "",
    legalNotificationEmail: "",
    financeNotificationEmail: "",
    aiModel: "gemini-3.8-flash",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    refreshToken: "",
  },
};
bindTenantStore(() => db);

function seedDemoAdminAccount() {
  if (!shouldSeedDemoAdmin || !demoAdminEmail || !demoAdminPassword) return;
  const allowedUsers = Array.isArray(db.allowedUsers) ? db.allowedUsers : [];
  const existingUser = allowedUsers.find(
    (user: any) => String(user.email || "").trim().toLowerCase() === demoAdminEmail,
  );
  if (existingUser) return;

  allowedUsers.push({
    id: "demo-admin",
    organizationId: getDefaultTenantId(),
    email: demoAdminEmail,
    name: "Silegal Admin",
    role: "Superuser",
    department: null,
    status: "Active",
    addedBy: "System bootstrap",
    createdAt: new Date().toISOString(),
  });
  db.allowedUsers = allowedUsers;
  console.log(`Seeded bootstrap superuser: ${demoAdminEmail}`);
}
setInvalidTokenCallback((badToken) => {
  if (db.googleConfig && db.googleConfig.accessToken === badToken) {
    console.warn(
      "[Server] Membersihkan Google accessToken yang kedaluwarsa dari database.",
    );
    db.googleConfig.accessToken = "";
    saveDb();
  }
});
async function getFreshGoogleAccessToken() {
  const currentToken = db.googleConfig?.accessToken;
  const refreshToken = db.googleConfig?.refreshToken;
  if (!refreshToken) {
    return currentToken || null;
  }
  try {
    const clientId =
      process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const oauth2Client = new OAuth2Client(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: currentToken,
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
      db.googleConfig.lastSyncTime = new Date().toISOString();
      saveDb();
      console.log(
        "[Google Auth] Access Token berhasil di-refresh otomatis menggunakan Refresh Token.",
      );
    }
    return freshToken || currentToken || null;
  } catch (err) {
    console.error(
      "[Google Auth] Gagal me-refresh Google Access Token:",
      err.message || err,
    );
    if (err?.message?.includes("invalid_grant")) {
      console.warn(
        "[Google Auth] Refresh token tidak lagi valid (invalid_grant). Menghapus kredensial.",
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
  } catch (_) {}
  if (reqToken && typeof reqToken === "string" && reqToken.trim() !== "") {
    return reqToken.trim();
  }
  return db.googleConfig?.accessToken || "";
}
function getEffectiveGeminiApiKey() {
  return (
    db.googleConfig?.geminiApiKey ||
    process.env.GEMINI_API_KEY ||
    ""
  ).trim();
}
function getGenAIClient(apiKey?: string) {
  const effectiveKey = (apiKey || getEffectiveGeminiApiKey()).trim();
  if (!effectiveKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
    );
  }
  return new GoogleGenAI({
    apiKey: effectiveKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
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
    "gemini-2.5-flash",
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
async function generateContentWithRetryAndFallback(params: any) {
  const apiKey = getEffectiveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
    );
  }
  const aiClient = getGenAIClient(apiKey);
  const primaryModel = getValidAiModel(params.model);
  const candidateFallbacks = [
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ];
  const fallbackModels = candidateFallbacks.filter((m) => m !== primaryModel);
  const modelQueue = [primaryModel, ...fallbackModels];
  let lastError: any = null;
  const PER_ATTEMPT_TIMEOUT_MS = 35000;

  for (const model of modelQueue) {
    try {
      console.log(`[Gemini API] Processing request with model=${model}...`);
      const response = await Promise.race([
        aiClient.models.generateContent({ ...params, model }),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timeout: model ${model} took longer than ${PER_ATTEMPT_TIMEOUT_MS / 1000}s`,
                ),
              ),
            PER_ATTEMPT_TIMEOUT_MS,
          ),
        ),
      ]);
      console.log(`[Gemini API] Success with model=${model}`);
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = (err?.message || err?.toString() || "").toLowerCase();
      console.warn(`[Gemini API] Model ${model} encountered an issue (${errMsg.slice(0, 120)}), trying fallback...`);
    }
  }

  const lastErrMsg = (lastError?.message || "").toLowerCase();
  if (
    lastErrMsg.includes("resource_exhausted") ||
    lastErrMsg.includes("quota") ||
    lastErrMsg.includes("exceeded your current quota") ||
    lastErrMsg.includes("429")
  ) {
    throw new Error(
      "Batas kuota Gemini API Key Anda telah terlampaui (Quota Exceeded / Rate Limit). Silakan periksa akun Google AI Studio atau perbarui API Key di menu Settings > AI Model & Parser.",
    );
  }
  if (lastErrMsg.includes("api_key_invalid") || lastErrMsg.includes("invalid api key")) {
    throw new Error(
      "Gemini API Key tidak valid. Silakan periksa kembali API Key Anda di menu Settings > AI Model & Parser.",
    );
  }

  throw (
    lastError ||
    new Error(
      "Google AI Gemini model sedang sibuk atau tidak merespons. Silakan coba lagi beberapa saat lagi.",
    )
  );
}
__name(
  generateContentWithRetryAndFallback,
  "generateContentWithRetryAndFallback",
);
function normalizeParsedDate(str) {
  if (!str || typeof str !== "string") return "";
  const trimmed = str.trim();
  if (
    trimmed === "-" ||
    trimmed === "N/A" ||
    trimmed === "n/a" ||
    trimmed === ""
  )
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
    dec: "12",
  };
  const cleanedStr = trimmed
    .replace(/(st|nd|rd|th),?/gi, "")
    .replace(/,/g, " ");
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
function computeContractEndDateFromDuration(
  startDateYMD: string,
  durationOrClause: string,
  autoRenewNextYear?: boolean,
) {
  if (!startDateYMD || !durationOrClause) return null;
  const parts = startDateYMD.split("-").map(Number);
  if (
    parts.length !== 3 ||
    isNaN(parts[0]) ||
    isNaN(parts[1]) ||
    isNaN(parts[2])
  )
    return null;
  const [year, month, day] = parts;
  const text = durationOrClause.toLowerCase();
  if (
    /sampai pengakhiran|until terminated|salah satu pihak mengakhiri|terus menerus|tanpa batas|unlimited|perpetual|tacit renewal|selamanya/i.test(
      text,
    )
  ) {
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
    if (
      /satu\s*tahun|1\s*\(satu\)\s*tahun|one\s*year|1\s*\(one\)\s*year|setahun/i.test(
        text,
      )
    ) {
      yearsToAdd = 1;
    } else if (
      /dua\s*tahun|2\s*\(dua\)\s*tahun|two\s*years|2\s*\(two\)\s*years/i.test(
        text,
      )
    ) {
      yearsToAdd = 2;
    } else if (/tiga\s*tahun|3\s*\(tiga\)\s*tahun|three\s*years/i.test(text)) {
      yearsToAdd = 3;
    } else if (/lima\s*tahun|5\s*\(lima\)\s*tahun|five\s*years/i.test(text)) {
      yearsToAdd = 5;
    } else if (/enam\s*bulan|6\s*\(enam\)\s*bulan|six\s*months/i.test(text)) {
      monthsToAdd = 6;
    } else if (/tiga\s*bulan|3\s*\(tiga\)\s*bulan|three\s*months/i.test(text)) {
      monthsToAdd = 3;
    } else if (
      /satu\s*bulan|1\s*\(satu\)\s*bulan|one\s*month|sebulan/i.test(text)
    ) {
      monthsToAdd = 1;
    } else if (
      /dua\s*belas\s*bulan|12\s*\(dua\s*belas\)\s*bulan|twelve\s*months/i.test(
        text,
      )
    ) {
      yearsToAdd = 1;
    } else if (/dua\s*puluh\s*empat\s*bulan|24\s*bulan/i.test(text)) {
      yearsToAdd = 2;
    }
  }
  const hasAutoRenewalClause =
    autoRenewNextYear ||
    /perpanjangan otomatis|auto[\s\-]renewal|automatically renew|diperpanjang otomatis/i.test(
      text,
    );
  if (
    hasAutoRenewalClause &&
    /1\s*tahun berikutnya|satu tahun berikutnya|another 1 year|one additional year/i.test(
      text,
    )
  ) {
    yearsToAdd += 1;
  }
  if (yearsToAdd === 0 && monthsToAdd === 0 && daysToAdd === 0) return null;
  const targetDate = new Date(
    year + yearsToAdd,
    month - 1 + monthsToAdd,
    day + daysToAdd,
  );
  targetDate.setDate(targetDate.getDate() - 1);
  const resYear = targetDate.getFullYear();
  const resMonth = String(targetDate.getMonth() + 1).padStart(2, "0");
  const resDay = String(targetDate.getDate()).padStart(2, "0");
  return {
    endDate: `${resYear}-${resMonth}-${resDay}`,
    isAutoRenewal: hasAutoRenewalClause,
  };
}
__name(
  computeContractEndDateFromDuration,
  "computeContractEndDateFromDuration",
);
const sqliteInitialData = loadCoreDataFromSqlite();
const sqliteHasCoreData = Object.values(sqliteInitialData).some((value) =>
  Array.isArray(value) ? value.length > 0 : Boolean(value),
);

if (sqliteHasCoreData) {
  db = { ...db, ...sqliteInitialData };
  console.log("Database loaded from SQLite as the source of truth.");
} else if (fs.existsSync(dataFilePath)) {
  try {
    const raw = fs.readFileSync(dataFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    db = { ...db, ...parsed };
    hydrateCoreDataFromJson(db);
    console.log("Imported legacy data_store.json into SQLite.");
  } catch (err) {
    console.error("Error importing data_store.json, using seed defaults", err);
  }
} else {
  console.log("SQLite is empty; using seed defaults for the first initialization.");
}

seedDemoAdminAccount();
migrateLegacyRecords();
/**
 * Bring records written by earlier releases in line with the current model:
 * - organization-less / legacy-alias records belong to the default tenant;
 * - Indonesian status labels become stable codes (see src/lib/domainStatus);
 * - due-diligence checklists are rebuilt from the tenant's policy packs,
 *   keeping every document that was already uploaded.
 * Idempotent: running it on migrated data changes nothing.
 */
function migrateLegacyRecords() {
  if (!Array.isArray(db.tenants) || db.tenants.length === 0) db.tenants = [...DEFAULT_TENANTS];
  if (!db.tenants.some((t: any) => t.isDefault)) db.tenants[0].isDefault = true;
  for (const tenant of db.tenants) {
    if (!tenant.settings) {
      // Pre-OSS tenants were Indonesian by construction; keep that behaviour
      // for them, everything else starts jurisdiction-neutral.
      const legacyIndonesian = tenant.currency === "IDR" || tenant.legalEntity === "PT";
      tenant.settings = resolveTenantSettings({
        settings: { countryCode: legacyIndonesian ? "ID" : "INTL" },
        currency: tenant.currency,
      });
    }
  }
  const defaultId = getDefaultTenantId();
  const fixOrg = (row: any) => {
    if (row && (!row.organizationId || isLegacyDefaultAlias(row.organizationId))) row.organizationId = defaultId;
  };
  for (const collection of [db.partners, db.contracts, db.ios, db.spendings, db.evaluations, db.notifications, db.templates, db.departments, db.allowedUsers]) {
    if (Array.isArray(collection)) collection.forEach(fixOrg);
  }
  if (!db.templates) db.templates = [];
  if (isLegacyDefaultAlias(db.activeTenantId) || !db.tenants.some((t: any) => t.id === db.activeTenantId)) {
    db.activeTenantId = defaultId;
  }
  (db.partners || []).forEach((p: any) => {
    if (p.country === undefined && p.badan_hukum) {
      // BHI = "Badan Hukum Indonesia"; BHA = foreign entity of unknown country.
      p.country = p.badan_hukum === "BHI" ? "ID" : "";
    }
    p.daftar_dokumen_dd = normalizePartnerDocuments(p);
    p.status_dd = computeDueDiligenceStatus(p.daftar_dokumen_dd);
  });
  (db.contracts || []).forEach((c: any) => {
    c.status = normalizeContractStatus(c.status);
    c.status_approval = normalizeApprovalStatus(c.status_approval);
    c.currency = normalizeCurrencyCode(c.currency || c.mata_uang, tenantDefaultCurrency(c.organizationId));
  });
  (db.ios || []).forEach((io: any) => {
    io.status = normalizeContractStatus(io.status);
    io.currency = normalizeCurrencyCode(io.currency || io.mata_uang, tenantDefaultCurrency(io.organizationId));
    io.mata_uang = io.currency;
  });
  (db.spendings || []).forEach((sp: any) => {
    sp.currency = normalizeCurrencyCode(sp.currency, tenantDefaultCurrency(sp.organizationId));
  });
}
const defaultOrg = db.tenants.find((t) => t.isDefault);
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
// Hydrate the Better Auth SQLite tables (user/organization/team/member) from
// the SQLite-backed `db` projection after startup normalization. This keeps
// auth-console records aligned with the same source of truth as app data.
setConsoleDbReference(db, saveDb);
ensureUserAccountsExist();
ensureAllPartnersFolders().catch((err) =>
  console.error("Startup category folder provisioning error:", err),
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
  if (!tags) return [];
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
  return valid;
}
/** ISO 3166-1 alpha-2 code or empty string (unknown). */
function sanitizeCountryCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}
/**
 * Partner identifiers (PRD §3.2.2): `{ scheme, value, country }`. Values are
 * kept as entered — format checks are advisory only and done client-side.
 */
function sanitizeIdentifiers(value: unknown): Array<{ scheme: string; value: string; country: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: any) => item && typeof item === "object" && String(item.value || "").trim())
    .slice(0, 20)
    .map((item: any) => ({
      scheme: String(item.scheme || "other").slice(0, 64),
      value: String(item.value).trim().slice(0, 128),
      country: sanitizeCountryCode(item.country),
    }));
}
if (db.partners && Array.isArray(db.partners)) {
  db.partners = db.partners.map((p) => ({
    ...p,
    tags: sanitizePartnerTags(p.tags),
  }));
  saveDb();
}
function saveDb() {
  try {
    syncDbToSqlite(db);
  } catch (err) {
    console.error("Failed to save core data to SQLite", err);
  }
}
function triggerAutoPushToGoogleSheet(_req?: any, _options?: any): Promise<void> {
  return Promise.resolve();
}
function syncAdderNames() {
  const userByEmail = new Map();
  db.allowedUsers.forEach((u) => {
    if (u.email) {
      userByEmail.set(u.email.trim().toLowerCase(), u);
    }
  });
  db.allowedUsers.forEach((u) => {
    if (
      u.addedByEmail &&
      userByEmail.has(u.addedByEmail.trim().toLowerCase())
    ) {
      const creator = userByEmail.get(u.addedByEmail.trim().toLowerCase());
      u.addedBy = creator.name;
    } else if (
      u.addedBy &&
      u.addedBy !== "System Core" &&
      u.addedBy !== "System"
    ) {
      for (const creator of db.allowedUsers) {
        const creatorEmail = creator.email.trim().toLowerCase();
        const creatorName = creator.name.trim().toLowerCase();
        const currentAddedBy = u.addedBy.trim().toLowerCase();
        if (
          currentAddedBy === creatorEmail ||
          currentAddedBy === creatorName
        ) {
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
  text,
}: {
  to: any;
  subject: any;
  html?: any;
  text?: any;
}) {
  const config = db.googleConfig;
  if (!config.smtpEnabled || !config.smtpHost || !config.smtpUser) {
    return {
      success: false,
      error: "SMTP Relay belum diaktifkan atau belum dikonfigurasi.",
    };
  }
  try {
    const port = Number(config.smtpPort) || (config.smtpSecure ? 465 : 587);
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port,
      secure: config.smtpSecure ?? port === 465,
      auth: { user: config.smtpUser, pass: config.smtpPassword || "" },
      tls: { rejectUnauthorized: false },
    });
    const fromAddress = config.smtpFromEmail || config.smtpUser;
    const fromName = config.smtpFromName || "Sistem Notifikasi Kontrak & IO";
    const from = `"${fromName}" <${fromAddress}>`;
    const recipients = Array.isArray(to) ? to.join(", ") : to;
    const info = await transporter.sendMail({
      from,
      to: recipients,
      subject,
      text: text || html.replace(/<[^>]*>/g, ""),
      html,
    });
    console.log(
      `[SMTP Relay] Email successfully sent to ${recipients} (MessageId: ${info.messageId})`,
    );
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("[SMTP Relay Error]", err);
    return { success: false, error: err.message || String(err) };
  }
}
function daysUntilForTenant(tenantId: string | null | undefined, date: string): number | null {
  return computeLifecycle(tenantId, date, "Active").daysRemaining;
}
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function formatAmountForTenant(amount: unknown, currency: string, tenantId?: string | null): string {
  const settings = getTenantSettings(tenantId);
  const locale = settings.language === "ID" ? "id-ID" : getCountryPack(settings.countryCode).formattingLocale;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: normalizeCurrencyCode(currency, settings.defaultCurrency) }).format(Number(amount) || 0);
  } catch {
    return `${currency} ${Number(amount) || 0}`;
  }
}
/** Reminder e-mail in the tenant's language, with its own name and colour. */
function buildReminderEmail(params: {
  tenantId: string;
  kind: "contract" | "commercial";
  reference: string;
  title: string;
  endDate: string;
  daysRemaining: number;
  rows: Array<[string, string]>;
}): { subject: string; html: string } {
  const settings = getTenantSettings(params.tenantId);
  const tenant = findTenant(params.tenantId);
  const brandColor = /^#[0-9a-f]{6}$/i.test(tenant?.primaryColor || "") ? tenant.primaryColor : DEFAULT_BRANDING.primaryColor;
  const orgName = tenantDisplayName(params.tenantId);
  const docLabel = params.kind === "contract"
    ? (settings.language === "ID" ? "Kontrak" : "Contract")
    : getIndustryPack(settings.industry).commercialDocument.label;
  const ID = settings.language === "ID";
  const subject = ID
    ? `[Pengingat ${params.daysRemaining} hari] ${docLabel} ${params.reference} — ${params.title}`
    : `[${params.daysRemaining}-day reminder] ${docLabel} ${params.reference} — ${params.title}`;
  const heading = ID ? `${docLabel} akan berakhir` : `${docLabel} approaching expiry`;
  const intro = ID
    ? `${docLabel} berikut akan berakhir dalam ${params.daysRemaining} hari. Mohon tinjau kebutuhan pemberitahuan, perpanjangan, atau pengakhiran.`
    : `The following ${docLabel.toLowerCase()} expires in ${params.daysRemaining} days. Please review any notice, renewal or termination action required.`;
  const tableRows = [
    [ID ? "Nomor" : "Reference", params.reference],
    [ID ? "Judul" : "Title", params.title],
    [ID ? "Tanggal berakhir" : "End date", params.endDate],
    ...params.rows,
  ]
    .map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #F1F5F9;color:#475569;width:35%;">${escapeHtml(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #F1F5F9;font-weight:600;">${escapeHtml(v)}</td></tr>`)
    .join("");
  const footer = ID
    ? `E-mail otomatis dari Silegal untuk ${orgName}.`
    : `Automated e-mail from Silegal for ${orgName}.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
      <div style="background-color:${brandColor};color:#FFFFFF;padding:20px;text-align:center;">
        <h2 style="margin:0;font-size:18px;">${escapeHtml(heading)}</h2>
      </div>
      <div style="padding:20px;color:#1E293B;font-size:14px;line-height:1.6;">
        <p>${escapeHtml(intro)}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">${tableRows}</table>
      </div>
      <div style="background-color:#F8FAFC;padding:10px 20px;text-align:center;color:#64748B;font-size:12px;border-top:1px solid #E2E8F0;">${escapeHtml(footer)}</div>
    </div>`;
  return { subject, html };
}
/** Roll an auto-renewing contract's end date forward past "today" (tenant timezone). */
function rollForwardAutoRenewal(contract: any): void {
  if (!contract.auto_renewal || !contract.tanggal_mulai || !contract.tanggal_berakhir) return;
  const settings = getTenantSettings(contract.organizationId);
  const today = todayInTimezone(settings.timezone);
  const start = String(contract.tanggal_mulai).slice(0, 10);
  let end = String(contract.tanggal_berakhir).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end >= today) return;
  const years = Math.max(1, Number(end.slice(0, 4)) - Number(start.slice(0, 4)) || 1);
  let guard = 0;
  while (end < today && guard++ < 200) {
    end = `${Number(end.slice(0, 4)) + years}${end.slice(4)}`;
  }
  contract.tanggal_berakhir = end;
}
function reminderRecipients(tenantId: string, kind: "contract" | "commercial", owner?: string): string {
  const cfg = db.googleConfig || {};
  const configured = kind === "contract"
    ? cfg.legalNotificationEmail || cfg.notificationEmails
    : cfg.financeNotificationEmail || cfg.notificationEmails;
  const tenantAdmins = (db.allowedUsers || [])
    .filter((u: any) => isMatchingOrg(u.organizationId, tenantId) && ["admin", "manager"].includes(String(u.role).toLowerCase()) && u.status !== "Inactive")
    .map((u: any) => u.email);
  return [owner, configured, ...tenantAdmins].filter(Boolean).join(", ");
}
/**
 * Recompute lifecycle status for contracts and commercial documents and emit
 * reminders at the tenant's configured offsets (default 90/60/30/14 days).
 */
function recalculateStatuses() {
  let newNotifsCount = 0;
  const emitReminder = (kind: "contract" | "commercial", record: any, daysRemaining: number) => {
    const tenantId = record.organizationId || getDefaultTenantId();
    const settings = getTenantSettings(tenantId);
    if (!settings.reminderOffsetsDays.includes(daysRemaining)) return;
    const parentId = kind === "contract" ? record.contract_id : record.io_id;
    const jenis = `Reminder ${daysRemaining}d`;
    const legacyJenis = `Reminder H-${daysRemaining}`;
    const exists = (db.notifications || []).some(
      (n: any) => n.parent_id === parentId && (n.jenis_notifikasi === jenis || n.jenis_notifikasi === legacyJenis),
    );
    if (exists) return;
    const reference = kind === "contract" ? record.nomor_kontrak : record.nomor_io;
    const title = kind === "contract" ? record.judul_kontrak : record.judul_io;
    const amount = kind === "contract" ? record.nilai_kontrak : record.nilai_io;
    const recipients = reminderRecipients(tenantId, kind, record.pic_internal && String(record.pic_internal).includes("@") ? record.pic_internal : "");
    const ID = settings.language === "ID";
    const notif = {
      notif_id: `notif-${kind === "contract" ? "ctr" : "doc"}-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      organizationId: tenantId,
      parent_type: kind === "contract" ? "Contract" : "IO",
      parent_id: parentId,
      parent_nomor: reference,
      parent_judul: title,
      jenis_notifikasi: jenis,
      tanggal_terkirim: new Date().toISOString(),
      status_terkirim: true,
      penerima: recipients,
      pesan: ID
        ? `${reference} (${title}) berakhir dalam ${daysRemaining} hari.${kind === "contract" ? ` Pemberitahuan ${record.notice_type_required || "Termination"} diperlukan ${record.notice_period_hari || 30} hari sebelumnya.` : ""}`
        : `${reference} (${title}) expires in ${daysRemaining} days.${kind === "contract" ? ` ${record.notice_type_required || "Termination"} notice is due ${record.notice_period_hari || 30} days before expiry.` : ""}`,
      is_read: false,
    };
    db.notifications.unshift(notif);
    newNotifsCount++;
    if (db.googleConfig?.smtpEnabled) {
      const rows: Array<[string, string]> = [
        [ID ? "Nilai" : "Value", formatAmountForTenant(amount, record.currency, tenantId)],
      ];
      if (kind === "contract") {
        rows.push([ID ? "Periode pemberitahuan" : "Notice period", `${record.notice_period_hari || 30} ${ID ? "hari" : "days"} (${record.notice_type_required || "Termination"})`]);
        rows.push([ID ? "Perpanjangan otomatis" : "Auto-renewal", record.auto_renewal ? (ID ? "Ya" : "Yes") : (ID ? "Tidak" : "No")]);
      } else {
        rows.push([ID ? "Model harga" : "Pricing model", record.pricing_model || "-"]);
      }
      const { subject, html } = buildReminderEmail({
        tenantId, kind, reference, title, endDate: record.tanggal_berakhir, daysRemaining, rows,
      });
      const validRecipients = recipients.split(",").map((s: string) => s.trim()).filter((s: string) => s.includes("@"));
      if (validRecipients.length > 0) {
        sendSmtpEmail({ to: validRecipients, subject, html });
      }
    }
  };

  db.contracts = (db.contracts || []).map((contract) => {
    if (normalizeContractStatus(contract.status) === "Terminated") {
      return { ...contract, status: "Terminated" };
    }
    rollForwardAutoRenewal(contract);
    const { daysRemaining, status } = computeLifecycle(
      contract.organizationId, contract.tanggal_berakhir, contract.status, contract.auto_renewal,
    );
    if (daysRemaining !== null) emitReminder("contract", contract, daysRemaining);
    return {
      ...contract,
      status,
      sisa_hari: daysRemaining ?? contract.sisa_hari,
      updated_at: contract.updated_at || new Date().toISOString(),
    };
  });
  db.ios = (db.ios || []).map((io) => {
    if (normalizeContractStatus(io.status) === "Terminated") return { ...io, status: "Terminated" };
    const { daysRemaining, status } = computeLifecycle(io.organizationId, io.tanggal_berakhir, io.status, false);
    if (daysRemaining !== null) emitReminder("commercial", io, daysRemaining);
    return {
      ...io,
      status,
      sisa_hari: daysRemaining ?? io.sisa_hari,
      updated_at: io.updated_at || new Date().toISOString(),
    };
  });
  saveDb();
  return newNotifsCount;
}
recalculateStatuses();
function addActivityLog(
  userEmail,
  userName,
  role,
  actionType,
  moduleName,
  description,
  req,
) {
  // `userEmail`/`userName`/`role` used to come straight from whatever the
  // caller passed in, which for several routes was itself lifted verbatim
  // from the request body/query — any caller could dictate who the audit
  // log says performed the action (QA/QC audit finding H2). Prefer the
  // identity of the actually-authenticated actor when one is attached to
  // the request; the passed-in values remain only as a fallback for the
  // rare call site made before `attachRbacActor` has run.
  const actorId = req?.actor?.id;
  if (actorId && sqliteDb) {
    try {
      const actorUser: any = sqliteDb
        .prepare("SELECT name, email FROM user WHERE id = ?")
        .get(actorId);
      if (actorUser) {
        userEmail = actorUser.email || userEmail;
        userName = actorUser.name || userName;
      }
      if (req.actor.role) {
        role = String(req.actor.role).replace(/^./, (c: string) => c.toUpperCase());
      }
    } catch { /* keep caller-supplied values */ }
  }
  const log = {
    id: `act-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
    timestamp: new Date().toISOString(),
    userEmail,
    userName,
    role,
    actionType,
    module: moduleName,
    description,
    ipAddress: req?.ip || req?.headers["x-forwarded-for"] || "127.0.0.1",
    userAgent: req?.headers["user-agent"] || "Browser Client",
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
    const session = await betterAuthInstance.api.getSession({
      headers: req.headers,
    });
    if (session?.user) {
      return session;
    }
  } catch (err) {}
  try {
    let token = "";
    const authHeader =
      req.headers["authorization"] || req.headers["x-session-token"];
    if (authHeader) {
      token = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7).trim()
        : authHeader.trim();
    }
    if (!token && req.headers["cookie"]) {
      const match = req.headers["cookie"].match(
        /better-auth\.session_token=([^;]+)/,
      );
      if (match) {
        token = decodeURIComponent(match[1]).split(".")[0];
      }
    }
    if (token) {
      const authDb = new Database(path.join(process.cwd(), "auth.db"));
      const sessionRow: any = authDb
        .prepare("SELECT * FROM session WHERE token = ? OR token LIKE ?")
        .get(token, `${token}%`);
      if (sessionRow && new Date(sessionRow.expiresAt) > new Date()) {
        const userRow: any = authDb
          .prepare("SELECT * FROM user WHERE id = ?")
          .get(sessionRow.userId);
        if (userRow) {
          return {
            user: {
              id: userRow.id,
              email: userRow.email,
              name: userRow.name,
              role: userRow.role,
              banned: Boolean(userRow.banned),
            },
            session: sessionRow,
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
app.get("/api/user/my-role", async (req: express.Request, res: express.Response) => {
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
      // Superuser/Admin are never tied to a single department (RBAC scope is
      // Global/Tenant, not Tenant+Department); a real department, when one
      // applies, is filled in below from the user's team membership. No
      // hardcoded placeholder here — see QA/QC audit finding H1.
      department: null,
      status: "Active",
      addedBy: "System (Auto)",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    db.allowedUsers.push(newUser);
    saveDb();
    allowed = newUser;
  }
  if (allowed.status !== "Active") {
    return res
      .status(403)
      .json({
        error: "Akses Ditolak",
        message: `Email '${email}' telah dinonaktifkan. Hubungi Tim Administrator.`,
      });
  }
  try {
    const userRow: any = sqliteDb
      .prepare(
        "SELECT u.id, u.name, u.role FROM user u WHERE LOWER(u.email) = LOWER(?)",
      )
      .get(email);
    if (userRow) {
      if (userRow.name) {
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
      const isGlobalRole = allowed.role === "Superuser" || allowed.role === "Admin";
      if (isGlobalRole) {
        // Never let a stray teamMember row (legacy data, or a role change that
        // left one behind) put a department back on a Superuser/Admin profile.
        allowed.department = null;
      } else {
        const teamRow: any = sqliteDb
          .prepare(
            `
          SELECT t.name FROM team t
          JOIN teamMember tm ON tm.teamId = t.id
          WHERE tm.userId = ?
          LIMIT 1
        `,
          )
          .get(userRow.id);
        if (teamRow?.name) {
          allowed.department = teamRow.name;
        }
      }
    }
  } catch (err) {}
  allowed.lastLoginAt = new Date().toISOString();
  saveDb();
  const isGlobalRole = allowed.role === "Superuser" || allowed.role === "Admin";
  res.json({
    email: allowed.email,
    name: allowed.name,
    role: allowed.role,
    department: isGlobalRole ? "Semua Departemen (Akses Global)" : (allowed.department || null),
    loginTime: new Date().toISOString(),
  });
});
// Dashboard news ticker (optional module, off by default): 5 short
// regulatory headlines for the tenant's industry and country, refreshed via
// the AI provider at most once every 7 days and cached per tenant.
const NEWS_TICKER_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
function newsTickerPrompt(tenantId: string, grounded: boolean): string {
  const settings = getTenantSettings(tenantId);
  const ctx = aiPolicyContext(tenantId);
  const topic = getIndustryPack(settings.industry).newsTopic;
  const regulators = ctx.regulators.length > 0 ? ` Prioritise updates from: ${ctx.regulators.join(", ")}.` : "";
  return `You are a regulatory research assistant. ${grounded ? "Use Google Search to find" : "From your knowledge, describe"} RECENT developments (last few months) in ${topic} relevant to organizations operating in ${ctx.countryName}.${regulators}

Write EXACTLY 5 short news-ticker headlines (at most about 20 words each) in ${ctx.responseLanguage}.

Output format: ONLY the 5 headlines separated by " | " (space-pipe-space), no numbering, no markdown, no introduction or closing.

${grounded ? "Every headline must be supported by the search results." : "Speak in general terms."} Never invent regulation numbers or dates you are not certain of.`;
}

async function generateNewsTickerText(tenantId: string): Promise<string> {
  try {
    const response = await generateContentWithRetryAndFallback({
      contents: newsTickerPrompt(tenantId, true),
      config: { tools: [{ googleSearch: {} }] },
    });
    return String((response as any).text || "").trim();
  } catch (groundedErr: any) {
    // The search-grounding tool has a much stricter quota than plain
    // generation; fall back to an un-grounded call rather than failing.
    console.warn(
      `[News Ticker] Grounded generation failed (${(groundedErr?.message || "").slice(0, 160)}), falling back to plain generation...`,
    );
    const response = await generateContentWithRetryAndFallback({
      contents: newsTickerPrompt(tenantId, false),
    });
    return String((response as any).text || "").trim();
  }
}

app.get("/api/dashboard/news-ticker", async (req: express.Request, res: express.Response) => {
  const tenantId = getRequestTenantId(req);
  const settings = getTenantSettings(tenantId);
  if (!settings.modules.newsTicker || !settings.modules.aiAssistant) {
    return res.json({ items: [], disabled: true });
  }
  if (!db.newsTicker || typeof db.newsTicker !== "object" || !db.newsTicker.byTenant) {
    db.newsTicker = { byTenant: {} };
  }
  const ticker = db.newsTicker.byTenant[tenantId] || { items: [], lastGeneratedAt: null };
  const isStale =
    !ticker.lastGeneratedAt ||
    !Array.isArray(ticker.items) ||
    ticker.items.length === 0 ||
    Date.now() - new Date(ticker.lastGeneratedAt).getTime() > NEWS_TICKER_REFRESH_MS;

  if (!isStale) {
    return res.json({ items: ticker.items, lastGeneratedAt: ticker.lastGeneratedAt, cached: true });
  }
  if (!getEffectiveGeminiApiKey()) {
    return res.json({ items: [], disabled: true });
  }

  try {
    const rawText = await generateNewsTickerText(tenantId);
    const items = rawText
      .split("|")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (items.length === 0) {
      throw new Error("The AI provider returned no headlines.");
    }

    const entry = { items, lastGeneratedAt: new Date().toISOString() };
    db.newsTicker.byTenant[tenantId] = entry;
    saveDb();
    res.json({ ...entry, cached: false });
  } catch (err: any) {
    console.error("Error generating news ticker:", err);
    if (Array.isArray(ticker.items) && ticker.items.length > 0) {
      return res.json({ items: ticker.items, lastGeneratedAt: ticker.lastGeneratedAt, cached: true, stale: true });
    }
    res.status(500).json({ error: err?.message || "Failed to load the news ticker." });
  }
});

app.get("/api/departments", async (req: express.Request, res: express.Response) => {
  try {
    let tenantId =
      req.headers["x-tenant-id"] ||
      req.headers["x-organization-id"] ||
      req.query.tenantId;
    if (!tenantId || isLegacyDefaultAlias(tenantId)) {
      const email = await getClerkUserEmail(req);
      if (email) {
        const user: any = sqliteDb
          .prepare("SELECT id FROM user WHERE email = ?")
          .get(email);
        if (user) {
          const session: any = sqliteDb
            .prepare(
              "SELECT activeOrganizationId FROM session WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1",
            )
            .get(user.id);
          if (session && session.activeOrganizationId) {
            tenantId = session.activeOrganizationId;
          }
        }
      }
    }
    if (!tenantId || isLegacyDefaultAlias(tenantId)) {
      const firstOrg: any = sqliteDb
        .prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1")
        .get();
      tenantId = db.activeTenantId || firstOrg?.id || "org-1";
    }
    let teams: any[] = (sqliteDb
      .prepare(
        "SELECT name FROM team WHERE organizationId = ? ORDER BY createdAt ASC",
      )
      .all(tenantId) || []) as any[];
    if (teams.length === 0) {
      const firstOrg: any = sqliteDb
        .prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1")
        .get();
      if (firstOrg && firstOrg.id !== tenantId) {
        teams = (sqliteDb
          .prepare(
            "SELECT name FROM team WHERE organizationId = ? ORDER BY createdAt ASC",
          )
          .all(firstOrg.id) || []) as any[];
      }
    }
    const departments = teams.map((t: any) => t.name);
    if (departments.length === 0) {
      departments.push("Marketing");
    }
    res.json({ success: true, departments });
  } catch (err) {
    console.error("Failed to fetch departments:", err);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});
app.post("/api/user/log-activity", async (req: express.Request, res: express.Response) => {
  const {
    actionType,
    module: moduleName,
    description,
    userEmail,
    userName,
    userRole,
  } = req.body;
  const email = await getClerkUserEmail(req);
  let finalEmail = userEmail || "user@app";
  let finalName = userName || "User";
  let finalRole = userRole || "Legal";
  if (email) {
    const allowed = db.allowedUsers.find(
      (u) => u.email.toLowerCase() === email,
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
    description ||
      `${actionType === "LOGOUT" ? "Keluar dari" : "Masuk ke"} aplikasi via Clerk Auth`,
    req,
  );
  res.json({ success: true });
});
/**
 * Resolve the verified e-mail behind a Google OAuth access token using
 * Google's userinfo endpoint. Returns null when the token is invalid or the
 * e-mail is not verified.
 */
async function verifyGoogleAccessTokenEmail(accessToken: unknown): Promise<string | null> {
  if (!accessToken || typeof accessToken !== "string") return null;
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const info: any = await response.json();
    if (!info?.email || info.email_verified === false) return null;
    return String(info.email).toLowerCase().trim();
  } catch {
    return null;
  }
}
/*
 * Provider secrets never leave the server (PRD §5.1). Clients receive a
 * masked hint; a masked value posted back means "keep the stored secret".
 */
const SECRET_MASK_CHAR = "•";
function maskSecret(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return "";
  return `${SECRET_MASK_CHAR.repeat(8)}${text.length > 8 ? text.slice(-4) : ""}`;
}
function isMaskedSecret(value: unknown): boolean {
  const text = String(value ?? "");
  return text.includes(SECRET_MASK_CHAR) || /^\*{4,}$/.test(text);
}
function redactProviderConfig(config: any) {
  const { accessToken, refreshToken, smtpPassword, geminiApiKey, ...rest } = config || {};
  return {
    ...rest,
    geminiApiKey: maskSecret(geminiApiKey),
    hasGeminiApiKey: Boolean(geminiApiKey),
    smtpPassword: maskSecret(smtpPassword),
    hasSmtpPassword: Boolean(smtpPassword),
    hasGoogleSession: Boolean(accessToken || refreshToken),
  };
}
/**
 * Admin check based ONLY on the verified session identity. Earlier versions
 * also trusted e-mail addresses supplied in headers, body or query string;
 * the unused `_fallback*` parameters are kept for call-site compatibility.
 */
async function checkIsAdmin(req: express.Request, _fallbackEmail?: string, _fallbackName?: string) {
  const session = await getBetterAuthSession(req);
  const email = String(session?.user?.email || "").toLowerCase().trim();
  const name = session?.user?.name || "User";
  if (!email) {
    return { isAdmin: false, adminEmail: "", adminName: "" };
  }
  try {
    const userRow: any = sqliteDb
      .prepare("SELECT id, name, role, banned FROM user WHERE LOWER(email) = LOWER(?)")
      .get(email);
    if (userRow?.banned === 1) {
      return { isAdmin: false, adminEmail: email, adminName: name };
    }
  } catch (_) {}
  const allowed = (db.allowedUsers || []).find(
    (u: any) => (u.email || "").toLowerCase() === email,
  );
  if (allowed && (allowed.status === "Inactive" || allowed.status === "Banned")) {
    return { isAdmin: false, adminEmail: email, adminName: name };
  }
  const actorRole = String((req as any).actor?.role || session?.user?.role || "").toLowerCase();
  return {
    isAdmin: ["admin", "superuser", "owner"].includes(actorRole),
    adminEmail: email,
    adminName: allowed?.name || name,
  };
}
app.get("/api/user/allowed-users", (req: express.Request, res: express.Response) => {
  syncAdderNames();
  res.json(db.allowedUsers);
});
app.post("/api/user/allowed-users", async (req: express.Request, res: express.Response) => {
  const { email, name, role, department, adminEmail, adminName } = req.body;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Only Admins can manage whitelist." });
  }
  if (!email || !name || !role) {
    return res
      .status(400)
      .json({ error: "Email, Nama, dan Role wajib diisi." });
  }
  const exists = db.allowedUsers.some(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (exists) {
    return res
      .status(400)
      .json({ error: `Email '${email}' sudah ada dalam daftar whitelist.` });
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
    createdAt: new Date().toISOString(),
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, user: newUser });
});
app.put("/api/user/allowed-users/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { role, department, status, name, adminEmail, adminName } = req.body;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Only Admins can manage whitelist." });
  }
  const user = db.allowedUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  }
  if (user.role === "Admin" && role && role !== "Admin") {
    const adminCount = db.allowedUsers.filter((u) => u.role === "Admin").length;
    if (adminCount <= 1) {
      return res
        .status(400)
        .json({
          error:
            "Sistem membutuhkan minimal 1 akun Admin aktif. Buat Admin lain terlebih dahulu sebelum mengubah role akun ini.",
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, user });
});
app.delete("/api/user/allowed-users/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { adminEmail, adminName } = req.query;
  const adminCheck = await checkIsAdmin(req, adminEmail as string, adminName as string);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Only Admins can manage whitelist." });
  }
  const user = db.allowedUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  }
  if (
    adminCheck.adminEmail &&
    user.email.toLowerCase() === adminCheck.adminEmail.toLowerCase()
  ) {
    return res
      .status(400)
      .json({
        error:
          "Anda tidak dapat menghapus akun Anda sendiri saat sedang login.",
      });
  }
  if (user.role === "Admin") {
    const adminCount = db.allowedUsers.filter((u) => u.role === "Admin").length;
    if (adminCount <= 1) {
      return res
        .status(400)
        .json({
          error:
            "Tidak dapat menghapus satu-satunya akun Admin yang tersisa di sistem.",
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.post("/api/user/reset-password", async (req: express.Request, res: express.Response) => {
  const { email, newPassword, adminEmail, adminName } = req.body;
  const adminCheck = await checkIsAdmin(req, adminEmail, adminName);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({
        error: "Forbidden: Hanya Admin yang dapat mereset password pengguna.",
      });
  }
  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email dan Password Baru wajib diisi." });
  }
  if (newPassword.trim().length < 6) {
    return res.status(400).json({ error: "Password minimal 6 karakter." });
  }
  try {
    const authDb = new Database(path.join(process.cwd(), "auth.db"));
    const trimmedEmail = email.trim().toLowerCase();
    let targetUser: any = authDb
      .prepare("SELECT id, name, email FROM user WHERE LOWER(email) = ?")
      .get(trimmedEmail);
    const hashedPassword = await hashPassword(newPassword.trim());
    const nowIso = new Date().toISOString();
    if (!targetUser) {
      const allowedUser = db.allowedUsers.find(
        (u) => u.email.toLowerCase() === trimmedEmail,
      );
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const userName = allowedUser?.name || email.split("@")[0];
      const userRole = (allowedUser?.role || "Staff").toLowerCase();
      authDb
        .prepare(
          `
        INSERT INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, ?, 0, ?, ?)
      `,
        )
        .run(userId, userName, trimmedEmail, userRole, nowIso, nowIso);
      const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      authDb
        .prepare(
          `
        INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
        VALUES (?, ?, 'credential', ?, ?, ?, ?, 'local:credential')
      `,
        )
        .run(accountId, userId, userId, hashedPassword, nowIso, nowIso);
      targetUser = { id: userId, name: userName, email: trimmedEmail };
    } else {
      const existingAccount: any = authDb
        .prepare(
          "SELECT id FROM account WHERE userId = ? AND providerId = 'credential'",
        )
        .get(targetUser.id);
      if (existingAccount) {
        authDb
          .prepare(
            "UPDATE account SET password = ?, updatedAt = ? WHERE id = ?",
          )
          .run(hashedPassword, nowIso, existingAccount.id);
      } else {
        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        authDb
          .prepare(
            `
          INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt, issuer)
          VALUES (?, ?, 'credential', ?, ?, ?, ?, 'local:credential')
        `,
          )
          .run(
            accountId,
            targetUser.id,
            targetUser.id,
            hashedPassword,
            nowIso,
            nowIso,
          );
      }
      authDb
        .prepare(
          "UPDATE user SET banned = 0, banReason = NULL, updatedAt = ? WHERE id = ?",
        )
        .run(nowIso, targetUser.id);
    }
    addActivityLog(
      adminCheck.adminEmail || "admin@app",
      adminCheck.adminName || "Admin",
      "Admin",
      "UPDATE",
      "ADMIN",
      `Mereset password untuk pengguna '${email}'`,
      req,
    );
    res.json({
      success: true,
      message: `Password untuk '${email}' berhasil direset!`,
    });
  } catch (err) {
    console.error("Server error resetting password:", err);
    res
      .status(500)
      .json({
        error: err.message || "Terjadi kesalahan saat mereset password.",
      });
  }
});
app.get("/api/activity-logs", (req: express.Request, res: express.Response) => {
  res.json(db.activityLogs);
});
app.get("/api/partners", (req: express.Request, res: express.Response) => {
  const activeTenantId = getRequestTenantId(req);
  const filterTenant = !canReadAllTenants(req);
  const partnerList = filterTenant
    ? (db.partners || []).filter((p) =>
        isMatchingOrg(p.organizationId, activeTenantId),
      )
    : db.partners || [];
  const normalizedPartners = partnerList.map((p) => ({
    ...p,
    tags: sanitizePartnerTags(p.tags),
  }));
  res.json(normalizedPartners);
});
/**
 * AI is an optional, per-tenant capability (PRD §4.1, §5.1): it needs a
 * configured provider key AND the tenant's `aiAssistant` module switched on.
 */
function ensureAiAvailable(req: express.Request, res: express.Response): boolean {
  const settings = getTenantSettings(getRequestTenantId(req));
  if (!settings.modules.aiAssistant) {
    res.status(403).json({ error: "AI_DISABLED", message: "AI features are disabled for this organization." });
    return false;
  }
  if (!getEffectiveGeminiApiKey()) {
    res.status(400).json({ error: "AI_NOT_CONFIGURED", message: "No AI provider key is configured. Add one under Settings > AI." });
    return false;
  }
  return true;
}
app.post("/api/partners/parse", upload.single("file") as any, async (req: express.Request, res: express.Response) => {
  if (!ensureAiAvailable(req, res)) return;
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }

    const tenantId = getRequestTenantId(req);
    const inputHash = computeInputSha256(inputData);
    const cacheScope = `partners:${tenantId}`;
    const cached = globalOcrCache.get(inputHash, cacheScope);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    const ctx = aiPolicyContext(tenantId);
    const prompt = `You are an expert legal document assistant. Extract the following information about the counterparty (partner/vendor/customer) from this contract or agreement so it can be registered in a contract management system. Our own organization is "${ctx.organizationName}" — never return our organization as the counterparty.

1. "nama_partner": the counterparty's full legal name exactly as written, including its legal form (e.g. "Pte. Ltd.", "Sdn. Bhd.", "PT", "Co., Ltd."). Do not abbreviate.
2. "country": ISO 3166-1 alpha-2 code of the counterparty's country of incorporation (e.g. "SG", "ID", "IN", "JP"). Return "" if it cannot be determined.
3. "entity_type": the counterparty's legal form as written (e.g. "Private Limited", "Sendirian Berhad", "Perseroan Terbatas"). Return "" if unknown.
4. "nama_pic": the counterparty's contact person or team named in the notices/correspondence clause. Return "-" if absent.
5. "email_pic": the counterparty's main notice e-mail address. Return "-" if absent.
6. "telepon_pic": the counterparty's phone number in international format (E.164, e.g. "+6591234567") when possible. Return "-" if absent.
7. "alamat_pic": the counterparty's registered or correspondence address. Return "-" if absent.
8. "notes": acting as a senior due-diligence and vendor-risk analyst, write ONE concise narrative paragraph in ${ctx.responseLanguage} describing the counterparty's core business, the services relevant to this agreement, notable technology or assets, and its jurisdictional context. No bullet points or headings; start directly with the entity name. Do not include personal identification numbers.

Return strictly one valid JSON object matching the schema.`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt,
    );
    console.log(
      `[PDF-Inspector Partner Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`,
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nama_partner: { type: Type.STRING },
            country: { type: Type.STRING },
            entity_type: { type: Type.STRING },
            nama_pic: { type: Type.STRING },
            email_pic: { type: Type.STRING },
            telepon_pic: { type: Type.STRING },
            alamat_pic: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
    });
    const parsedData = JSON.parse((response as any).text);
    const responsePayload = { success: true, data: parsedData, ocrStats };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, cacheScope, responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing partner:", error);
    res
      .status(500)
      .json({
        error:
          error?.message ||
          "Failed to parse document. Google AI model is currently busy, please try again.",
      });
  }
});
app.post("/api/partners/generate-dd-notes", async (req: express.Request, res: express.Response) => {
  if (!ensureAiAvailable(req, res)) return;
  try {
    const { nama_partner, country, entity_type, tags, model, pdfBase64 } = req.body;
    if (!nama_partner) {
      return res
        .status(400)
        .json({ error: "Partner name is required." });
    }
    const selectedModel = getValidAiModel(model);
    const contents = [];
    if (pdfBase64 && typeof pdfBase64 === "string") {
      contents.push({
        inlineData: {
          data: pdfBase64.includes("base64,")
            ? pdfBase64.split("base64,")[1]
            : pdfBase64,
          mimeType: "application/pdf",
        },
      });
    }
    const ctx = aiPolicyContext(getRequestTenantId(req));
    const countryName = country ? getCountryPack(String(country)).name : "";
    const prompt = `Act as a senior due-diligence and vendor-risk analyst for ${ctx.organizationName}, an organization in the ${ctx.industryName} industry operating in ${ctx.countryName}.

Summarise the counterparty below in ONE comprehensive, professional paragraph written in ${ctx.responseLanguage}.

Counterparty: "${String(nama_partner).slice(0, 200)}"${countryName ? ` (incorporated in ${countryName})` : ""}${entity_type ? ` — legal form: ${String(entity_type).slice(0, 120)}` : ""}${Array.isArray(tags) && tags.length > 0 ? ` — relationship categories: ${tags.slice(0, 10).join(", ")}` : ""}

The paragraph must flow through: (1) core business and specialisation, (2) the products or services relevant to this relationship, (3) notable technology, assets or certifications, and (4) jurisdictional and risk context relevant to ${ctx.industryName} (for example: ${ctx.reviewFocus.slice(0, 3).join(", ")}).

Output rules: exactly one paragraph, no bullet points or headings, no opening or closing pleasantries, start with the entity name, and never invent registration or identification numbers.`;
    contents.push({ text: prompt });
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents,
    });
    const notesText = ((response as any).text || "").trim();
    res.json({ success: true, notes: notesText });
  } catch (error) {
    console.error("Error generating DD notes:", error);
    res
      .status(500)
      .json({
        error:
          error?.message || "Gagal menghasilkan ringkasan Due Diligence AI.",
      });
  }
});
app.post("/api/partners", async (req: express.Request, res: express.Response) => {
  const {
    nama_partner,
    codename,
    country,
    entity_type,
    identifiers,
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
    userRole,
  } = req.body;
  if (!nama_partner) {
    return res.status(400).json({ error: "Nama Partner wajib diisi." });
  }
  const targetOrgId = getRequestTenantId(req);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] ||
      req.body.accessToken ||
      db.googleConfig.accessToken,
  );
  let driveFolderLink = `https://drive.google.com/drive/folders/Folder_${nama_partner.replace(/\s+/g, "_")}`;
  if (token || hasServiceAccountCredentials()) {
    try {
      const orgFolder = await getOrgFolderId(targetOrgId, token);
      const parentFolderId = orgFolder.id || db.googleConfig.driveFolderId;
      const vendorFolder = await getOrCreateDriveFolder(
        nama_partner,
        parentFolderId,
        token,
      );
      driveFolderLink =
        vendorFolder.webViewLink ||
        `https://drive.google.com/drive/folders/${vendorFolder.id}`;
      if (vendorFolder.id) {
        await getOrCreateDriveFolder("Folder Contract", vendorFolder.id, token);
        await getOrCreateDriveFolder(
          "Folder Invoice & Billing",
          vendorFolder.id,
          token,
        );
        await getOrCreateDriveFolder("Folder IO", vendorFolder.id, token);
        await getOrCreateDriveFolder("Folder DD", vendorFolder.id, token);
      }
    } catch (err) {
      console.warn(
        `[Drive Hierarchical] Error creating folders for partner '${nama_partner}':`,
        err?.message || err,
      );
    }
  }
  const partnerCountry = sanitizeCountryCode(country);
  const defaultDD = normalizePartnerDocuments({ organizationId: targetOrgId, country: partnerCountry, daftar_dokumen_dd: [] });
  const computedPicPartner =
    pic_partner ||
    (nama_pic
      ? `${nama_pic} (${email_pic || ""} | ${telepon_pic || ""})`
      : "-");
  const newPartner = {
    partner_id: generateNextPartnerId(),
    organizationId: targetOrgId,
    nama_partner,
    codename: codename || "",
    country: partnerCountry,
    entity_type: String(entity_type || "").slice(0, 120),
    identifiers: sanitizeIdentifiers(identifiers),
    jenis_partner: jenis_partner || "Vendor",
    pic_partner: computedPicPartner,
    nama_pic: nama_pic || "",
    email_pic: email_pic || "",
    telepon_pic: telepon_pic || "",
    alamat_pic: alamat_pic || "",
    kontak_pic:
      kontak_pic ||
      (email_pic && telepon_pic ? `${email_pic} / ${telepon_pic}` : ""),
    pic_internal: pic_internal || "",
    status_dd: computeDueDiligenceStatus(defaultDD),
    link_folder_dd: driveFolderLink,
    daftar_dokumen_dd: defaultDD,
    catatan: catatan || "",
    tags: sanitizePartnerTags(tags),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.partners.unshift(newPartner);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Business Owner",
    "CREATE",
    "PARTNER",
    `Menambahkan Partner baru: ${nama_partner}${partnerCountry ? ` (${partnerCountry})` : ""}`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, partner: newPartner });
});
app.put("/api/partners/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const {
    nama_partner,
    codename,
    country,
    entity_type,
    identifiers,
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
    userRole,
  } = req.body;
  const partnerIndex = db.partners.findIndex((p) => p.partner_id === id);
  if (partnerIndex === -1) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const existing = db.partners[partnerIndex];
  const tenantDenial = assertTenantWriteAccess(req, existing.organizationId);
  if (tenantDenial) return res.status(tenantDenial.status).json(tenantDenial.body);
  const nextCountry = country !== void 0 ? sanitizeCountryCode(country) : existing.country || "";
  const nextDocuments = normalizePartnerDocuments({
    organizationId: existing.organizationId,
    country: nextCountry,
    daftar_dokumen_dd: Array.isArray(daftar_dokumen_dd) ? daftar_dokumen_dd : existing.daftar_dokumen_dd,
  });
  const status_dd = computeDueDiligenceStatus(nextDocuments);
  const updatedPartner = {
    ...existing,
    nama_partner: nama_partner || existing.nama_partner,
    codename: codename !== void 0 ? codename : existing.codename,
    country: nextCountry,
    entity_type: entity_type !== void 0 ? String(entity_type).slice(0, 120) : existing.entity_type || "",
    identifiers: identifiers !== void 0 ? sanitizeIdentifiers(identifiers) : existing.identifiers || [],
    jenis_partner: jenis_partner || existing.jenis_partner || "Vendor",
    pic_partner: pic_partner !== void 0 ? pic_partner : existing.pic_partner,
    nama_pic: nama_pic !== void 0 ? nama_pic : existing.nama_pic,
    email_pic: email_pic !== void 0 ? email_pic : existing.email_pic,
    telepon_pic: telepon_pic !== void 0 ? telepon_pic : existing.telepon_pic,
    alamat_pic: alamat_pic !== void 0 ? alamat_pic : existing.alamat_pic,
    kontak_pic: kontak_pic !== void 0 ? kontak_pic : existing.kontak_pic,
    pic_internal:
      pic_internal !== void 0 ? pic_internal : existing.pic_internal,
    catatan: catatan !== void 0 ? catatan : existing.catatan,
    tags:
      tags !== void 0
        ? sanitizePartnerTags(tags)
        : sanitizePartnerTags(existing.tags),
    daftar_dokumen_dd: nextDocuments,
    status_dd,
    tanggal_dd_diverifikasi:
      status_dd === "Complete" && existing.status_dd !== "Complete"
        ? new Date().toISOString().split("T")[0]
        : existing.tanggal_dd_diverifikasi,
    updated_at: new Date().toISOString(),
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, partner: updatedPartner });
});
app.delete("/api/partners/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const partnerIndex = db.partners.findIndex((p) => p.partner_id === id);
  if (partnerIndex === -1) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const partner = db.partners[partnerIndex];
  const tenantDenial = assertTenantWriteAccess(req, partner.organizationId);
  if (tenantDenial) return res.status(tenantDenial.status).json(tenantDenial.body);
  const partnerContracts = db.contracts.filter((c) => c.partner_id === id);
  const contractIds = partnerContracts.map((c) => c.contract_id);
  const partnerIOs = db.ios.filter(
    (io) => io.partner_id === id || contractIds.includes(io.contract_id),
  );
  const ioIds = partnerIOs.map((io) => io.io_id);
  db.notifications = db.notifications.filter(
    (n) => !contractIds.includes(n.parent_id) && !ioIds.includes(n.parent_id),
  );
  db.ios = db.ios.filter(
    (io) => io.partner_id !== id && !contractIds.includes(io.contract_id),
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({
    success: true,
    deletedContractsCount: partnerContracts.length,
    deletedIosCount: partnerIOs.length,
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
app.get("/api/partner-evaluations", (req: express.Request, res: express.Response) => {
  const activeTenantId = getRequestTenantId(req);
  const filterTenant = !canReadAllTenants(req);
  const list = filterTenant
    ? (db.evaluations || []).filter((e) =>
        isMatchingOrg(e.organizationId, activeTenantId),
      )
    : db.evaluations || [];
  res.json(list);
});
app.post("/api/partner-evaluations", async (req: express.Request, res: express.Response) => {
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
    userRole,
  } = req.body;
  if (
    !supplier_name ||
    !review_date ||
    !obligation_target ||
    !incident_frequency ||
    !communication ||
    !pricing ||
    !final_evaluation
  ) {
    return res
      .status(400)
      .json({
        error:
          "Harap lengkapi semua bidang isian formulir evaluasi yang wajib.",
      });
  }
  const targetOrgId = getRequestTenantId(req);
  const calculated_score = computeEvaluationScore(
    obligation_target,
    incident_frequency,
    communication,
    pricing,
  );
  const newEval = {
    id: `EVAL-${new Date().getFullYear()}-${String((db.evaluations?.length || 0) + 1).padStart(3, "0")}`,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, evaluation: newEval });
});
app.put("/api/partner-evaluations/:id", async (req: express.Request, res: express.Response) => {
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
    userRole,
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
    pricing || existing.pricing,
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
    updated_at: new Date().toISOString(),
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
    req,
  );
  res.json({ success: true, evaluation: updatedEval });
});
app.delete("/api/partner-evaluations/:id", async (req: express.Request, res: express.Response) => {
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
    req,
  );
  res.json({ success: true });
});
app.get("/api/exchange-rates", async (req: express.Request, res: express.Response) => {
  try {
    const currencies = Array.from(
      new Set([
        ...(db.spendings || []).map((s) => s.currency),
        ...(db.contracts || []).map((c) => c.currency),
        ...(db.ios || []).map((i) => i.currency),
      ].filter(Boolean).map((c) => normalizeCurrencyCode(c))),
    );
    const rates = await getExchangeRates("", "", currencies);
    res.json({ USD: 1, ...rates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/exchange-rate-historical", async (req: express.Request, res: express.Response) => {
  try {
    const currency = normalizeCurrencyCode(req.query.currency, "USD");
    const date = String(req.query.date || "");
    const { rate, isFallback } = await getUsdRate(currency);
    res.json({ currency, date, rate, isFallback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/partner-spendings", (req: express.Request, res: express.Response) => {
  const activeTenantId = getRequestTenantId(req);
  const filterTenant = !canReadAllTenants(req);
  const spendingsList = filterTenant
    ? (db.spendings || []).filter((s) =>
        isMatchingOrg(s.organizationId, activeTenantId),
      )
    : db.spendings || [];
  const list = spendingsList.map((s) => {
    if (s.total_amount_usd === void 0 || s.total_amount_usd === null) {
      const amt = Number(s.total_amount) || 0;
      const cur = normalizeCurrencyCode(s.currency, tenantDefaultCurrency(s.organizationId));
      const usdVal =
        cur === "USD"
          ? amt
          : convertToUsdWithFallback(amt, cur);
      return { ...s, total_amount_usd: usdVal };
    }
    return s;
  });
  res.json(list);
});
app.post("/api/spendings/parse", upload.single("file") as any, async (req: express.Request, res: express.Response) => {
  if (!ensureAiAvailable(req, res)) return;
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }

    const tenantId = getRequestTenantId(req);
    const inputHash = computeInputSha256(inputData);
    const cacheScope = `spendings:${tenantId}`;
    const cached = globalOcrCache.get(inputHash, cacheScope);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    const ctx = aiPolicyContext(tenantId);
    const prompt = `You are an expert OCR and data-extraction assistant processing a B2B invoice or billing document received by ${ctx.organizationName}. Extract:

1. "invoice_number": the official invoice number exactly as printed.
2. "invoice_date": the issue date, converted to ISO 8601 "YYYY-MM-DD".
3. "invoice_month": the billing period month as "YYYY-MM" (use the issue date's month when no separate period is printed).
4. "invoice_description": every line-item description from the invoice table, joined with newline characters ("\n"), verbatim.
5. "currency": the ISO 4217 three-letter currency code of the invoice total (e.g. "USD", "SGD", "INR", "JPY"). If only a symbol is shown, infer the code from the issuer's country; default to "${ctx.defaultCurrency}" when still unclear.
6. "total_amount": the final invoice total as a plain number, without symbols or thousands separators.
7. "bank_name": the beneficiary bank name only.
8. "account_number": the beneficiary account number or IBAN exactly as printed, keeping separators.
9. "account_holder": the beneficiary account name exactly as printed.

Return strictly one valid JSON object matching the schema. Use an empty string "" for any text field that is not present.`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt,
    );
    console.log(
      `[PDF-Inspector Spending Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`,
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            invoice_number: { type: Type.STRING },
            invoice_date: { type: Type.STRING },
            invoice_month: { type: Type.STRING },
            invoice_description: { type: Type.STRING },
            currency: { type: Type.STRING },
            total_amount: { type: Type.NUMBER },
            bank_name: { type: Type.STRING },
            account_number: { type: Type.STRING },
            account_holder: { type: Type.STRING },
          },
        },
      },
    });
    const parsedData = JSON.parse((response as any).text);
    if (parsedData.invoice_date) {
      parsedData.invoice_date = normalizeParsedDate(parsedData.invoice_date);
    }
    const responsePayload = { success: true, data: parsedData, ocrStats };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, cacheScope, responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing Spending:", error);
    res
      .status(500)
      .json({
        error:
          error?.message ||
          "Failed to parse Spending document. Google AI model is currently busy, please try again.",
      });
  }
});
const getEndOfMonthDate = __name((year, month) => {
  const y = typeof year === "string" ? parseInt(year, 10) : year;
  const m = typeof month === "string" ? parseInt(month, 10) : month;
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return "";
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}, "getEndOfMonthDate");
const normalizeSpendingMonths = __name((input) => {
  if (!input) return [];
  const rawList = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
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
          getEndOfMonthDate(trimmed.slice(0, 4), trimmed.slice(4, 6)),
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
app.post("/api/partner-spendings", async (req: express.Request, res: express.Response) => {
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
    userRole,
  } = req.body;
  if (!vendor_name || !invoice_number || total_amount === void 0) {
    return res
      .status(400)
      .json({
        error: "Vendor Name, Invoice Number, and Total Amount are required.",
      });
  }
  const targetOrgId = getRequestTenantId(req);
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId,
  );
  const monthsArray = normalizeSpendingMonths(invoice_month);
  const formattedMonthStr =
    monthsArray.length > 0 ? monthsArray.join("_") : "Month";
  const cleanVendorName = vendor_name.replace(/[/\\?%*:|"<>]/g, "").trim();
  let invoice_file_url = "";
  let invoice_file_name = "";
  let billing_file_url = "";
  let billing_file_name = "";
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
  );
  let total_amount_usd = req_usd;
  if (
    total_amount_usd === void 0 ||
    total_amount_usd === null ||
    isNaN(Number(total_amount_usd))
  ) {
    const cur = normalizeCurrencyCode(currency, tenantDefaultCurrency(targetOrgId));
    const amt = Number(total_amount) || 0;
    if (cur === "USD") {
      total_amount_usd = amt;
    } else {
      let rate = getDefaultUsdRate(cur);
      try {
        const sheetId =
          targetTenant?.spreadsheetId || db.googleConfig?.spreadsheetId;
        rate = await getHistoricalExchangeRate(
          sheetId,
          token,
          cur,
          invoice_date,
        );
      } catch (e) {}
      total_amount_usd = Math.round(amt * rate * 100) / 100;
    }
  } else {
    total_amount_usd = Number(total_amount_usd);
  }
  const partner = db.partners.find(
    (p) =>
      p.partner_id === vendor_id ||
      p.nama_partner.toLowerCase() === vendor_name.toLowerCase(),
  );
  if (invoice_file && invoice_file.fileData) {
    const targetInvoiceName = formatInvoiceFileName({
      partnerName: partner?.nama_partner || vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: invoice_number,
      invoiceDate: invoice_date || new Date().toISOString().split("T")[0],
      rawFileName: invoice_file.fileName,
    });
    invoice_file_name = targetInvoiceName;
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token,
          targetOrgId,
        );
        const driveUrl = await uploadFileToDrive(
          targetInvoiceName,
          invoice_file.fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          invoice_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah file Invoice '${targetInvoiceName}' ke Google Drive`,
            req,
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
        targetTenant?.name,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Invoice '${targetInvoiceName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
  }
  if (billing_file && billing_file.fileData) {
    const targetBillingName = formatBillingFileName({
      partnerName: partner?.nama_partner || vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: invoice_number,
      invoiceDate: invoice_date || new Date().toISOString().split("T")[0],
      rawFileName: billing_file.fileName,
    });
    billing_file_name = targetBillingName;
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token,
          targetOrgId,
        );
        const driveUrl = await uploadFileToDrive(
          targetBillingName,
          billing_file.fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          billing_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah file Billing '${targetBillingName}' ke Google Drive`,
            req,
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
        targetTenant?.name,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Billing '${targetBillingName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
  }
  const newSpending = {
    id: req.body.id || generateNextSpendingId(),
    organizationId: targetOrgId,
    vendor_id: partner ? partner.partner_id : vendor_id || void 0,
    vendor_name,
    invoice_number,
    invoice_date: invoice_date || new Date().toISOString().split("T")[0],
    invoice_month: monthsArray,
    invoice_description: invoice_description || "",
    currency: normalizeCurrencyCode(currency, tenantDefaultCurrency(targetOrgId)),
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    `Menambahkan Catatan Partner Spending untuk '${vendor_name}' (Invoice #${invoice_number}) senilai ${formatAmountForTenant(total_amount, normalizeCurrencyCode(currency, tenantDefaultCurrency(targetOrgId)), targetOrgId)}`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, spending: newSpending });
});
app.put("/api/partner-spendings/:id", async (req: express.Request, res: express.Response) => {
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
  if (
    updates.total_amount_usd === void 0 ||
    updates.total_amount_usd === null
  ) {
    const cur = normalizeCurrencyCode(updates.currency || existing.currency, tenantDefaultCurrency(existing.organizationId));
    const amt =
      Number(
        updates.total_amount !== void 0
          ? updates.total_amount
          : existing.total_amount,
      ) || 0;
    const invDate = updates.invoice_date || existing.invoice_date;
    if (cur === "USD") {
      updates.total_amount_usd = amt;
    } else {
      let rate = getDefaultUsdRate(cur);
      try {
        const token2 = await resolveActiveGoogleToken(
          req.headers["x-google-access-token"],
        );
        rate = await getHistoricalExchangeRate(
          db.googleConfig.spreadsheetId,
          token2,
          cur,
          invDate,
        );
      } catch (e) {}
      updates.total_amount_usd = Math.round(amt * rate * 100) / 100;
    }
  } else {
    updates.total_amount_usd = Number(updates.total_amount_usd);
  }
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const partner = db.partners.find(
    (p) =>
      p.partner_id === updated.vendor_id ||
      p.nama_partner.toLowerCase() === updated.vendor_name.toLowerCase(),
  );
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
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
      invoiceDate:
        updated.invoice_date || new Date().toISOString().split("T")[0],
      rawFileName: invoice_file.fileName,
    });
    updated.invoice_file_name = targetInvoiceName;
    let invoice_file_url = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token,
        );
        const driveUrl = await uploadFileToDrive(
          targetInvoiceName,
          invoice_file.fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          invoice_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah ulang file Invoice '${targetInvoiceName}' ke Google Drive`,
            req,
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
        invoice_file.fileData,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Invoice '${targetInvoiceName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
    updated.invoice_file_url = invoice_file_url;
  }
  if (billing_file && billing_file.fileData) {
    const targetBillingName = formatBillingFileName({
      partnerName: partner?.nama_partner || updated.vendor_name,
      invoiceMonth: monthsArray,
      invoiceNumber: updated.invoice_number,
      invoiceDate:
        updated.invoice_date || new Date().toISOString().split("T")[0],
      rawFileName: billing_file.fileName,
    });
    updated.billing_file_name = targetBillingName;
    let billing_file_url = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Invoice & Billing",
          token,
        );
        const driveUrl = await uploadFileToDrive(
          targetBillingName,
          billing_file.fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          billing_file_url = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Finance",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah ulang file Billing '${targetBillingName}' ke Google Drive`,
            req,
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
        billing_file.fileData,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Finance",
        "UPLOAD_SUCCESS",
        "PARTNER",
        `File Billing '${targetBillingName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, spending: updated });
});
app.delete("/api/partner-spendings/:id", async (req: express.Request, res: express.Response) => {
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.post("/api/partners/:id/upload-dd", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const {
    docName,
    fileName,
    fileData,
    nomorDokumen,
    tanggalKadaluarsa,
    userEmail,
    userName,
    userRole,
  } = req.body;
  const partner = db.partners.find((p) => p.partner_id === id);
  if (!partner) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const uploadDenial = assertTenantWriteAccess(req, partner.organizationId);
  if (uploadDenial) return res.status(uploadDenial.status).json(uploadDenial.body);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
  );
  const docObj = partner.daftar_dokumen_dd.find((d) => d.nama === docName);
  const currentFilesCount = (docObj?.files || []).length;
  const finalFileName =
    fileName ||
    formatDueDiligenceFileName({
      vendorName: partner.nama_partner,
      documentName: docName,
      documentDate: tanggalKadaluarsa || new Date().toISOString(),
      sequence: currentFilesCount + 1,
      rawFileName: "document.pdf",
    });
  let driveLink = "";
  if (
    fileData &&
    typeof fileData === "string" &&
    fileData.includes("base64,")
  ) {
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder DD",
          token,
        );
        const mimeType = getMimeType(finalFileName);
        const driveUrl = await uploadFileToDrive(
          finalFileName,
          fileData,
          mimeType,
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          driveLink = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_SUCCESS",
            "PARTNER",
            `Berhasil mengunggah dokumen DD '${finalFileName}' untuk vendor '${partner.nama_partner}' ke Google Drive`,
            req,
          );
        } else {
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_FAILED",
            "PARTNER",
            `Gagal mengunggah dokumen DD '${finalFileName}' untuk vendor '${partner.nama_partner}' ke Google Drive: Respon URL Drive tidak valid`,
            req,
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
          req,
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
        req,
      );
    }
  }
  partner.daftar_dokumen_dd = partner.daftar_dokumen_dd.map((doc) => {
    if (doc.nama === docName) {
      const nowIso = new Date().toISOString();
      const newFileItem = driveLink
        ? {
            id:
              "dd_file_" +
              Date.now() +
              "_" +
              Math.random().toString(36).substring(2, 7),
            fileName: finalFileName,
            linkDrive: driveLink,
            uploadedAt: nowIso,
            year: new Date().getFullYear().toString(),
            tanggalKadaluarsa: tanggalKadaluarsa || "",
          }
        : null;
      const existingFiles = doc.files || [];
      if (
        existingFiles.length === 0 &&
        doc.linkDrive &&
        doc.linkDrive !== driveLink &&
        doc.linkDrive.includes("drive.google.com")
      ) {
        existingFiles.push({
          id: "dd_file_prev_" + Date.now(),
          fileName: `${doc.nama} (Versi Sebelumnya).pdf`,
          linkDrive: doc.linkDrive,
          uploadedAt: doc.uploadedAt || nowIso,
          year: doc.uploadedAt
            ? new Date(doc.uploadedAt).getFullYear().toString()
            : "",
          tanggalKadaluarsa: doc.tanggalKadaluarsa || "",
        });
      }
      const updatedFiles = newFileItem
        ? [
            newFileItem,
            ...existingFiles.filter((f) => f.linkDrive !== driveLink),
          ]
        : existingFiles;
      const expiry = tanggalKadaluarsa || doc.tanggalKadaluarsa;
      const expiryDays = expiry ? daysUntilForTenant(partner.organizationId, expiry) : null;
      return {
        ...doc,
        status: updatedFiles.length === 0 ? "Missing" : expiryDays !== null && expiryDays < 0 ? "Expired" : "Available",
        nomorDokumen: nomorDokumen || doc.nomorDokumen || "",
        tanggalKadaluarsa: tanggalKadaluarsa || doc.tanggalKadaluarsa,
        linkDrive: driveLink || doc.linkDrive || "",
        uploadedAt: driveLink ? nowIso : doc.uploadedAt,
        files: updatedFiles,
      };
    }
    return doc;
  });
  const previousDdStatus = partner.status_dd;
  partner.status_dd = computeDueDiligenceStatus(partner.daftar_dokumen_dd);
  if (partner.status_dd === "Complete" && previousDdStatus !== "Complete") {
    partner.tanggal_dd_diverifikasi = new Date().toISOString().split("T")[0];
  }
  partner.updated_at = new Date().toISOString();
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DD_UPDATE",
    "PARTNER",
    `Mengunggah dokumen DD '${docName}' untuk partner ${partner.nama_partner}`,
    req,
  );
  triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, partner });
});
app.delete("/api/partners/:id/dd-file", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { docName, fileId, userEmail, userName, userRole } = req.body;
  const partner = db.partners.find((p) => p.partner_id === id);
  if (!partner) {
    return res.status(404).json({ error: "Partner tidak ditemukan." });
  }
  const deleteDenial = assertTenantWriteAccess(req, partner.organizationId);
  if (deleteDenial) return res.status(deleteDenial.status).json(deleteDenial.body);
  partner.daftar_dokumen_dd = partner.daftar_dokumen_dd.map((doc) => {
    if (doc.nama === docName) {
      const remainingFiles = (doc.files || []).filter((f) => f.id !== fileId);
      const hasFiles = remainingFiles.length > 0;
      return {
        ...doc,
        files: remainingFiles,
        status: hasFiles ? "Available" : "Missing",
        linkDrive: hasFiles ? remainingFiles[0].linkDrive : void 0,
        uploadedAt: hasFiles ? remainingFiles[0].uploadedAt : void 0,
      };
    }
    return doc;
  });
  const previousDdStatus = partner.status_dd;
  partner.status_dd = computeDueDiligenceStatus(partner.daftar_dokumen_dd);
  if (partner.status_dd === "Complete" && previousDdStatus !== "Complete") {
    partner.tanggal_dd_diverifikasi = new Date().toISOString().split("T")[0];
  }
  partner.updated_at = new Date().toISOString();
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "DELETE",
    "PARTNER",
    `Menghapus file dari dokumen DD '${docName}' partner ${partner.nama_partner}`,
    req,
  );
  res.json({ success: true, partner });
});

app.post("/api/contracts/export-google-docs", async (req: express.Request, res: express.Response) => {
  try {
    const title = req.body.title || req.body.docTitle || "Partnership Agreement";
    const contentHtml = req.body.contentHtml || req.body.htmlContent || req.body.html;
    const partnerName = req.body.partnerName || req.body.partner_nama || req.body.partnerId;

    if (!title || !contentHtml) {
      return res.status(400).json({ error: "Title dan contentHtml wajib diisi." });
    }
    const token = await resolveActiveGoogleToken(
      req.headers["x-google-access-token"] ||
      req.body.accessToken ||
      db.googleConfig?.accessToken
    );
    const targetOrgId = getRequestTenantId(req);

    let targetFolderId = db.googleConfig?.driveFolderId;
    if (partnerName) {
      try {
        const partner = (db.partners || []).find(
          (p: any) => p.nama_partner?.toLowerCase() === String(partnerName).toLowerCase() || p.partner_id === partnerName
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
        webViewLink: docResult.documentUrl,
      },
    });
  } catch (error: any) {
    console.error("Error creating Google Doc:", error);
    res.status(500).json({
      error: error?.message || "Gagal membuat dokumen Google Docs.",
    });
  }
});

// Aggregation Endpoint for Fast Initial Data Load (replaces multi-endpoint polling)
app.get("/api/init-data", (req: express.Request, res: express.Response) => {
  const activeTenantId = getRequestTenantId(req);
  const filterTenant = !canReadAllTenants(req);

  const contracts = filterTenant
    ? (db.contracts || []).filter((c: any) => isMatchingOrg(c.organizationId, activeTenantId))
    : db.contracts || [];

  const ios = filterTenant
    ? (db.ios || []).filter((i: any) => isMatchingOrg(i.organizationId, activeTenantId))
    : db.ios || [];

  const partners = filterTenant
    ? (db.partners || []).filter((p: any) => isMatchingOrg(p.organizationId, activeTenantId))
    : db.partners || [];

  const notifications = filterTenant
    ? (db.notifications || []).filter((n: any) => isMatchingOrg(n.organizationId, activeTenantId))
    : db.notifications || [];

  const evaluations = filterTenant
    ? (db.evaluations || []).filter((e: any) => isMatchingOrg(e.organizationId, activeTenantId))
    : db.evaluations || [];

  const spendings = filterTenant
    ? (db.spendings || []).filter((s: any) => isMatchingOrg(s.organizationId, activeTenantId))
    : db.spendings || [];

  res.setHeader("Cache-Control", "no-store");
  res.json({
    contracts,
    ios,
    partners,
    notifications,
    googleConfig: redactProviderConfig(db.googleConfig),
    evaluations,
    spendings,
    tenants: db.tenants || [],
    activeTenantId,
    timestamp: Date.now(),
  });
});

app.get("/api/contracts", (req: express.Request, res: express.Response) => {
  const activeTenantId = getRequestTenantId(req);
  const filterTenant = !canReadAllTenants(req);
  const contractsList = filterTenant
    ? (db.contracts || []).filter((c) =>
        isMatchingOrg(c.organizationId, activeTenantId),
      )
    : db.contracts || [];
  const result = contractsList.map((c) => {
    const p = db.partners.find((part) => part.partner_id === c.partner_id);
    const cur = normalizeCurrencyCode(c.currency, tenantDefaultCurrency(c.organizationId));
    const amt = Number(c.nilai_kontrak) || 0;
    const usdVal =
      c.nilai_kontrak_usd !== void 0 && c.nilai_kontrak_usd !== null
        ? c.nilai_kontrak_usd
        : cur === "USD"
          ? amt
          : convertToUsdWithFallback(amt, cur);
    return {
      ...c,
      currency: cur,
      nilai_kontrak_usd: usdVal,
      partner_nama: p ? p.nama_partner : c.partner_nama || "Partner N/A",
    };
  });
  res.json(result);
});
app.post("/api/contracts/parse", upload.single("file") as any, async (req: express.Request, res: express.Response) => {
  if (!ensureAiAvailable(req, res)) return;
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }

    const tenantId = getRequestTenantId(req);
    const inputHash = computeInputSha256(inputData);
    const cacheScope = `contracts:${tenantId}`;
    const cached = globalOcrCache.get(inputHash, cacheScope);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    const ctx = aiPolicyContext(tenantId);
    const startTime = Date.now();
    const prompt = `You are an expert legal contract analyst. Our organization is "${ctx.organizationName}" (${ctx.industryName}, primary jurisdiction: ${ctx.countryName}). Extract the following from this contract so it can be registered in our contract repository. The contract may be written in any language and governed by any jurisdiction.

1. "jenis_dokumen": "Agreement Addendum" if this is an amendment, addendum, variation or extension; otherwise "Master Agreement".
2. "judul_kontrak": the full official title of the agreement.
3. "nama_partner": the full legal name of the counterparty — the party that is NOT ${ctx.organizationName}.
4. "nomor_kontrak": the contract reference number issued by ${ctx.organizationName}. When the document carries two reference numbers (ours and the counterparty's), prefer the one issued by ${ctx.organizationName}; if ours cannot be identified, return the first reference number shown.
5. "nomor_kontrak_induk": for an addendum, the reference number of the master agreement it amends; otherwise "".
6. "tanggal_mulai": the effective (or signing) date as ISO 8601 "YYYY-MM-DD".
7. "tanggal_berakhir": the expiry date as "YYYY-MM-DD", computed precisely:
   a. An explicit end date without automatic renewal: use it as written.
   b. A relative term ("valid for 1 year from the start date"): end date = start date + term − 1 day (e.g. start 2024-11-04, 1 year → 2025-11-03; 6 months → 2025-05-03).
   c. A fixed end date plus automatic renewal for another period: add one renewal period to the written end date and set auto_renewal to true.
   d. Evergreen / renews until terminated by either party: return the day before the start date in year 9999 (start 2024-11-04 → "9999-11-03") and set auto_renewal to true.
   e. An extension addendum: compute the new end date from the previous term's end date.
8. "klausul_jangka_waktu": quote verbatim the term/renewal clause.
9. "durasi_perjanjian": the term as short text (e.g. "1 year", "6 months", "Until terminated").
10. "nilai_kontrak": the total committed contract value as a number, or 0 when the value is variable, commission-based, or not stated.
11. "currency": the ISO 4217 code of the contract value (e.g. "USD", "SGD", "IDR", "INR", "JPY"); "${ctx.defaultCurrency}" if no currency is stated.
12. "auto_renewal": true when the contract renews automatically or runs until terminated; otherwise false.
13. "notice_period_hari": the notice period in days for termination or non-renewal (default 30 when not specified).
14. "ringkasan_perubahan": for an addendum, a clear summary of which clauses changed and how; otherwise "".
15. "field_yang_berubah": for an addendum, an array containing any of exactly these codes: "Nilai Kontrak / IO", "Jangka Waktu Periode", "Ruang Lingkup / Deliverables", "Syarat Pembayaran", "Pihak Berwenang". Otherwise [].
16. "internal_notes": a structured Markdown summary written in ${ctx.responseLanguage}, acting as a senior legal analyst.
   STRICT RULE: do not use the comma character (,) anywhere in internal_notes — use "and", "or", parentheses or hyphens instead — so the text can be exported to CSV safely.
   Use exactly these sections (translate the headings into ${ctx.responseLanguage}):
   # AGREEMENT SUMMARY — [counterparty or product name]
   - Title / our reference / counterparty reference / effective date / expiry date / term
   ## PARTIES — for each party: legal name / address / signatory and title / notice e-mail
   ## SCOPE AND PURPOSE — 3 to 4 bullets on purpose / responsibilities / limits of liability
   ## COMMERCIAL TERMS — fees or commissions / payment terms and currency / taxes (${ctx.indirectTaxName} and withholding)
   ## EXCLUSIVITY AND NON-COMPETE — or state that none is provided
   ## CONFIDENTIALITY AND DATA PROTECTION — NDA reference / confidentiality duties / data-breach notification / reference to ${ctx.dataProtectionLaw} or the law actually cited
   ## GOVERNING LAW AND DISPUTES — governing law as written / dispute resolution steps and forum

Return strictly one valid JSON object matching the schema. Use "" for any text field not found in the document.`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt,
    );
    console.log(
      `[PDF-Inspector Contract Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`,
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jenis_dokumen: { type: Type.STRING },
            judul_kontrak: { type: Type.STRING },
            nama_partner: { type: Type.STRING },
            nomor_kontrak: { type: Type.STRING },
            nomor_kontrak_induk: { type: Type.STRING },
            tanggal_mulai: { type: Type.STRING },
            tanggal_berakhir: { type: Type.STRING },
            klausul_jangka_waktu: { type: Type.STRING },
            durasi_perjanjian: { type: Type.STRING },
            nilai_kontrak: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            auto_renewal: { type: Type.BOOLEAN },
            notice_period_hari: { type: Type.NUMBER },
            ringkasan_perubahan: { type: Type.STRING },
            field_yang_berubah: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            internal_notes: { type: Type.STRING },
          },
          required: ["internal_notes"],
        },
      },
    });
    const parsedData = JSON.parse((response as any).text);
    if (parsedData.tanggal_mulai) {
      parsedData.tanggal_mulai = normalizeParsedDate(parsedData.tanggal_mulai);
    }
    if (parsedData.tanggal_berakhir) {
      parsedData.tanggal_berakhir = normalizeParsedDate(
        parsedData.tanggal_berakhir,
      );
    }
    const clauseText = `${parsedData.durasi_perjanjian || ""} ${parsedData.klausul_jangka_waktu || ""}`;
    const isPerpetualClause =
      /sampai pengakhiran|until terminated|salah satu pihak mengakhiri|terus menerus|tanpa batas|unlimited|perpetual/i.test(
        clauseText,
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
    } else if (
      parsedData.tanggal_mulai &&
      (!parsedData.tanggal_berakhir ||
        parsedData.tanggal_berakhir === parsedData.tanggal_mulai ||
        new Date(parsedData.tanggal_berakhir) <=
          new Date(parsedData.tanggal_mulai))
    ) {
      const computedResult = computeContractEndDateFromDuration(
        parsedData.tanggal_mulai,
        clauseText || (parsedData.auto_renewal ? "1 tahun" : ""),
        Boolean(parsedData.auto_renewal),
      );
      if (computedResult) {
        parsedData.tanggal_berakhir = computedResult.endDate;
        if (computedResult.isAutoRenewal) {
          parsedData.auto_renewal = true;
        }
      }
    }
    if (parsedData.internal_notes) {
      parsedData.internal_notes = String(parsedData.internal_notes)
        .replace(/,/g, " ")
        .trim();
    }
    const durationMs = Date.now() - startTime;
    const responsePayload = {
      success: true,
      data: parsedData,
      performance: { durationMs, ...ocrStats },
    };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, cacheScope, responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing contract:", error);
    res
      .status(500)
      .json({
        error:
          error?.message ||
          "Failed to parse contract document. Google AI model is currently busy, please try again.",
      });
  }
});
app.get("/api/contracts/:id/redline-analysis", (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const contract = db.contracts.find((c) => c.contract_id === id);
  if (!contract || !isMatchingOrg(contract.organizationId, getRequestTenantId(req))) {
    return res.status(404).json({ error: "Contract not found." });
  }
  res.json({
    success: true,
    hasAnalysis: Boolean(contract.redline_analysis),
    analysis: contract.redline_analysis || null,
    analyzed_at: contract.redline_analyzed_at || null,
  });
});
app.post("/api/contracts/:id/redline-analysis", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const contract = db.contracts.find((c) => c.contract_id === id);
  if (!contract || !isMatchingOrg(contract.organizationId, getRequestTenantId(req))) {
    return res.status(404).json({ error: "Contract not found." });
  }
  const force = Boolean(req.body.force);
  const hasCustomClause = Boolean(
    req.body.customClauseText && req.body.customClauseText.trim(),
  );
  if (!force && !hasCustomClause && contract.redline_analysis) {
    return res.json({
      success: true,
      cached: true,
      analysis: contract.redline_analysis,
      analyzed_at: contract.redline_analyzed_at || contract.updated_at,
    });
  }
  if (!ensureAiAvailable(req, res)) return;
  const partner = db.partners.find((p) => p.partner_id === contract.partner_id);
  try {
    const selectedModel = getValidAiModel(req.body.model);
    const ctx = aiPolicyContext(contract.organizationId);
    const regulatorLine = ctx.regulators.length > 0
      ? `Regulators relevant to our industry in ${ctx.countryName}: ${ctx.regulators.join(", ")}. Assess outsourcing, audit-right and reporting expectations they typically impose.`
      : "No specific sector regulator is configured; assess against general commercial law and good practice.";
    const prompt = `You are a senior corporate legal counsel and AI contract reviewer acting for ${ctx.organizationName}, a ${ctx.industryName} organization whose primary jurisdiction is ${ctx.countryName}.
Perform a risk and compliance analysis of the commercial contract below and propose balanced redlines. Write every narrative field in ${ctx.responseLanguage}.

=== CONTRACT ===
Reference: ${contract.nomor_kontrak}
Title: ${contract.judul_kontrak}
Document type: ${contract.jenis_dokumen || "Master Agreement"}
Counterparty: ${contract.partner_nama || partner?.nama_partner || "-"}${partner?.country ? ` (${getCountryPack(partner.country).name})` : ""}
Categories: ${(contract.kategori_kerjasama || []).join(", ") || "-"}
Value: ${normalizeCurrencyCode(contract.currency, ctx.defaultCurrency)} ${Number(contract.nilai_kontrak || 0)}
Term: ${contract.tanggal_mulai} to ${contract.tanggal_berakhir} (days remaining: ${contract.sisa_hari ?? "-"})
Auto-renewal: ${contract.auto_renewal ? "yes" : "no"}
Notice period: ${contract.notice_period_hari || 30} days (${contract.notice_type_required || "termination/extension"})
Internal notes / clause summary: ${contract.internal_notes || contract.ringkasan_perubahan || "Standard B2B commercial services agreement."}
Counterparty due-diligence status: ${partner?.status_dd || "unknown"}
${req.body.customClauseText ? `
Additional clause text to review:
${String(req.body.customClauseText).slice(0, 20000)}` : ""}

=== REVIEW INSTRUCTIONS ===
Assess liability, termination, indemnities, confidentiality and data protection (reference ${ctx.dataProtectionLaw} where our own processing is concerned), governing law and dispute resolution (our default position: ${ctx.governingLaw}), and these industry focus areas: ${ctx.reviewFocus.join("; ")}.
${regulatorLine}
Do not invent statute or regulation numbers — cite them only when you are certain; otherwise describe the requirement in general terms.

Return JSON with exactly:
1. overallRiskScore: integer 0-100 (0-25 low, 26-55 moderate, 56-75 high, 76-100 critical).
2. riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL".
3. executiveSummary: 2-3 short paragraphs on negotiating position, regulatory fit and key risks.
4. keyFindings: 3-5 of the most important issues.
5. analyzedClauses: the main clauses, each with clauseTitle, riskCategory, severity ("LOW"|"MEDIUM"|"HIGH"|"CRITICAL"), originalTextOrIssue, identifiedRisk, recommendedRedline (balanced replacement wording) and legalRationale (legal basis or negotiation argument).
6. complianceChecklist: 5-6 items, each with item, status ("COMPLIANT" | "NEEDS_REVIEW" | "NON_COMPLIANT") and notes. Cover: data protection, audit and regulator access (if a regulator applies), notice period and auto-renewal clarity, governing law and dispute forum, and the industry focus areas above.
`;
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallRiskScore: { type: Type.INTEGER },
            riskLevel: { type: Type.STRING },
            executiveSummary: { type: Type.STRING },
            keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
            analyzedClauses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clauseTitle: { type: Type.STRING },
                  riskCategory: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  originalTextOrIssue: { type: Type.STRING },
                  identifiedRisk: { type: Type.STRING },
                  recommendedRedline: { type: Type.STRING },
                  legalRationale: { type: Type.STRING },
                },
                required: [
                  "clauseTitle",
                  "severity",
                  "originalTextOrIssue",
                  "identifiedRisk",
                  "recommendedRedline",
                  "legalRationale",
                ],
              },
            },
            complianceChecklist: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING },
                  status: { type: Type.STRING },
                  notes: { type: Type.STRING },
                },
                required: ["item", "status", "notes"],
              },
            },
          },
          required: [
            "overallRiskScore",
            "riskLevel",
            "executiveSummary",
            "keyFindings",
            "analyzedClauses",
            "complianceChecklist",
          ],
        },
      },
    });
    const parsed = JSON.parse((response as any).text);
    const nowIso = new Date().toISOString();
    parsed.analyzed_at = nowIso;
    contract.redline_analysis = parsed;
    contract.redline_analyzed_at = nowIso;
    contract.updated_at = nowIso;
    saveDb();
    res.json({
      success: true,
      cached: false,
      analysis: parsed,
      analyzed_at: nowIso,
    });
  } catch (error) {
    console.error("Error during redline analysis:", error);
    res
      .status(500)
      .json({
        error:
          error?.message ||
          "Gagal melakukan analisis redline AI. Silakan coba kembali.",
      });
  }
});

// Custom Template & Translation Endpoints
// Contract templates are tenant-scoped (PRD §3.3.3, §3.4.1).
app.get("/api/templates", (req, res) => {
  const tenantId = getRequestTenantId(req);
  res.json((db.templates || []).filter((t: any) => isMatchingOrg(t.organizationId, tenantId)));
});

app.post("/api/templates", (req, res) => {
  try {
    const { id, name, contentId, customFields } = req.body;
    if (!name || !contentId) {
      return res.status(400).json({ error: "Name and content are required." });
    }
    const tenantId = getRequestTenantId(req);
    const templateId = id || `tpl-${Date.now()}`;
    const nowIso = new Date().toISOString();

    if (!db.templates) {
      db.templates = [];
    }

    const existingIndex = db.templates.findIndex((t: any) => t.id === templateId);
    if (existingIndex >= 0 && !isMatchingOrg(db.templates[existingIndex].organizationId, tenantId)) {
      return res.status(404).json({ error: "Template not found." });
    }
    const previous = existingIndex >= 0 ? db.templates[existingIndex] : null;
    const templateData = {
      id: templateId,
      organizationId: previous?.organizationId || tenantId,
      name: String(name).slice(0, 200),
      contentId,
      customFields: Array.isArray(customFields) ? customFields : [],
      version: (Number(previous?.version) || 0) + 1,
      createdAt: previous?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (existingIndex >= 0) {
      db.templates[existingIndex] = templateData;
    } else {
      db.templates.push(templateData);
    }

    saveDb();
    res.json({ success: true, template: templateData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/templates/:id", (req, res) => {
  const tenantId = getRequestTenantId(req);
  const index = (db.templates || []).findIndex(
    (t: any) => t.id === req.params.id && isMatchingOrg(t.organizationId, tenantId),
  );
  if (index < 0) {
    return res.status(404).json({ error: "Template not found." });
  }
  db.templates.splice(index, 1);
  saveDb();
  res.json({ success: true });
});

app.post("/api/contracts", async (req: express.Request, res: express.Response) => {
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
    userRole,
  } = req.body;
  if (
    !nomor_kontrak ||
    !judul_kontrak ||
    !partner_id ||
    !tanggal_mulai ||
    !tanggal_berakhir
  ) {
    return res
      .status(400)
      .json({
        error:
          "Nomor Kontrak, Judul, Partner, dan Tanggal Mula/Selesai wajib diisi.",
      });
  }
  if (new Date(tanggal_berakhir) <= new Date(tanggal_mulai)) {
    return res
      .status(400)
      .json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  const requestTenantId = getRequestTenantId(req);
  const existingContractDup = db.contracts.find(
    (c) =>
      isMatchingOrg(c.organizationId, requestTenantId) &&
      String(c.nomor_kontrak || "").trim().toLowerCase() ===
      nomor_kontrak.trim().toLowerCase(),
  );
  if (existingContractDup) {
    return res
      .status(400)
      .json({
        error: `Nomor Kontrak '${nomor_kontrak}' sudah terdaftar dalam sistem.`,
      });
  }
  const targetOrgId = getRequestTenantId(req);
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId,
  );
  const partner = db.partners.find((p) => p.partner_id === partner_id);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
  );
  const cur = normalizeCurrencyCode(currency, tenantDefaultCurrency(targetOrgId));
  const amt = Number(nilai_kontrak) || 0;
  let total_usd = req_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = getDefaultUsdRate(cur);
      try {
        const sheetId =
          targetTenant?.spreadsheetId || db.googleConfig?.spreadsheetId;
        rate = await getHistoricalExchangeRate(
          sheetId,
          token,
          cur,
          tanggal_mulai,
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
    rawFileName: fileName || `${nomor_kontrak}.pdf`,
  });
  let link_file_kontrak = "";
  if (
    fileData &&
    typeof fileData === "string" &&
    fileData.includes("base64,")
  ) {
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Contract",
          token,
          targetOrgId,
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          link_file_kontrak = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_SUCCESS",
            "CONTRACT",
            `Berhasil mengunggah file Kontrak '${targetFileName}' ke Google Drive`,
            req,
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
        targetTenant?.name,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Legal",
        "UPLOAD_SUCCESS",
        "CONTRACT",
        `File Kontrak '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
  }
  const lifecycleDraft: any = {
    organizationId: targetOrgId,
    tanggal_mulai,
    tanggal_berakhir,
    auto_renewal: Boolean(auto_renewal),
  };
  if (normalizeContractStatus(status) !== "Terminated") rollForwardAutoRenewal(lifecycleDraft);
  const finalTanggalBerakhir = lifecycleDraft.tanggal_berakhir;
  const { status: finalStatus, daysRemaining: diffDays } = computeLifecycle(
    targetOrgId,
    finalTanggalBerakhir,
    normalizeContractStatus(status) === "Terminated" ? "Terminated" : "Active",
    Boolean(auto_renewal),
  );
  const newContract = {
    contract_id: generateNextContractId(),
    organizationId: targetOrgId,
    jenis_dokumen: jenis_dokumen || "Master Agreement",
    parent_contract_id:
      jenis_dokumen === "Agreement Addendum" ? parent_contract_id : void 0,
    parent_contract_nomor:
      jenis_dokumen === "Agreement Addendum" ? parent_contract_nomor : void 0,
    nomor_kontrak,
    judul_kontrak,
    partner_id,
    partner_nama: partner ? partner.nama_partner : "Partner",
    kategori_kerjasama: Array.isArray(kategori_kerjasama)
      ? kategori_kerjasama
      : ["Umum"],
    tanggal_mulai,
    tanggal_berakhir: finalTanggalBerakhir,
    currency: cur,
    nilai_kontrak: amt,
    nilai_kontrak_usd: Number(total_usd),
    auto_renewal: Boolean(auto_renewal),
    notice_period_hari: Number(notice_period_hari) || 30,
    notice_type_required: notice_type_required || "Termination",
    status: finalStatus,
    status_approval: normalizeApprovalStatus(status_approval),
    pic_internal: pic_internal || "Legal Team",
    internal_notes: internal_notes ? String(internal_notes).trim() : void 0,
    link_file_kontrak,
    fileName: targetFileName,
    field_yang_berubah: Array.isArray(field_yang_berubah)
      ? field_yang_berubah
      : void 0,
    ringkasan_perubahan: ringkasan_perubahan || void 0,
    sisa_hari: diffDays,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.contracts.unshift(newContract);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "CREATE",
    "CONTRACT",
    `Membuat Kontrak Baru '${nomor_kontrak}' (${judul_kontrak}) senilai ${formatAmountForTenant(amt, cur, targetOrgId)}`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, contract: newContract });
});
app.put("/api/contracts/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { userEmail, userName, userRole, fileData, fileName, ...updates } =
    req.body;
  const idx = db.contracts.findIndex((c) => c.contract_id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Kontrak tidak ditemukan." });
  }
  const existing = db.contracts[idx];
  const tenantDenial = assertTenantWriteAccess(req, existing.organizationId);
  if (tenantDenial) return res.status(tenantDenial.status).json(tenantDenial.body);
  if ((req as any).actor?.role !== "superuser") delete (updates as any).organizationId;
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const cur = normalizeCurrencyCode(updated.currency || existing.currency, tenantDefaultCurrency(existing.organizationId));
  updated.currency = cur;
  const amt = Number(updated.nilai_kontrak) || 0;
  let total_usd = updates.nilai_kontrak_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = getDefaultUsdRate(cur);
      try {
        const token = await resolveActiveGoogleToken(
          req.headers["x-google-access-token"] || req.body.accessToken,
        );
        const startDate = updated.tanggal_mulai || existing.tanggal_mulai;
        rate = await getHistoricalExchangeRate(
          db.googleConfig.spreadsheetId,
          token,
          cur,
          startDate,
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
  if (
    updated.tanggal_mulai &&
    updated.tanggal_berakhir &&
    new Date(updated.tanggal_berakhir) <= new Date(updated.tanggal_mulai)
  ) {
    return res
      .status(400)
      .json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  if (updated.nomor_kontrak) {
    const dup = db.contracts.find(
      (c) =>
        c.nomor_kontrak.trim().toLowerCase() ===
          updated.nomor_kontrak.trim().toLowerCase() && c.contract_id !== id,
    );
    if (dup) {
      return res
        .status(400)
        .json({
          error: `Nomor Kontrak '${updated.nomor_kontrak}' sudah digunakan oleh kontrak lain.`,
        });
    }
  }
  if (
    fileData &&
    typeof fileData === "string" &&
    fileData.includes("base64,")
  ) {
    const partner = db.partners.find(
      (p) => p.partner_id === updated.partner_id,
    );
    const targetFileName = formatContractFileName({
      partnerName: partner?.nama_partner,
      documentType: updated.jenis_dokumen || "Master Agreement",
      contractNumber: updated.nomor_kontrak,
      startDate: updated.tanggal_mulai,
      rawFileName:
        fileName || updated.fileName || `${updated.nomor_kontrak}.pdf`,
    });
    const token = await resolveActiveGoogleToken(
      req.headers["x-google-access-token"] || req.body.accessToken,
    );
    let link_file_kontrak = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder Contract",
          token,
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          link_file_kontrak = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Legal",
            "UPLOAD_SUCCESS",
            "CONTRACT",
            `Berhasil mengunggah ulang file Kontrak '${targetFileName}' ke Google Drive`,
            req,
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
        fileData,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Legal",
        "UPLOAD_SUCCESS",
        "CONTRACT",
        `File Kontrak '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
    updated.link_file_kontrak = link_file_kontrak;
    updated.fileName = targetFileName;
  }
  updated.status = normalizeContractStatus(updated.status);
  updated.status_approval = normalizeApprovalStatus(updated.status_approval);
  if (updated.status !== "Terminated") rollForwardAutoRenewal(updated);
  const lifecycle = computeLifecycle(updated.organizationId, updated.tanggal_berakhir, updated.status, updated.auto_renewal);
  updated.sisa_hari = lifecycle.daysRemaining ?? updated.sisa_hari;
  updated.status = lifecycle.status;
  db.contracts[idx] = updated;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Legal",
    "UPDATE",
    "CONTRACT",
    `Memperbarui data Kontrak '${updated.nomor_kontrak}'`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, contract: updated });
});
app.delete("/api/contracts/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const ctr = db.contracts.find((c) => c.contract_id === id);
  if (!ctr) return res.status(404).json({ error: "Kontrak tidak ditemukan." });
  const tenantDenial = assertTenantWriteAccess(req, ctr.organizationId);
  if (tenantDenial) return res.status(tenantDenial.status).json(tenantDenial.body);
  db.contracts = db.contracts.filter((c) => c.contract_id !== id);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Admin",
    "DELETE",
    "CONTRACT",
    `Menghapus Kontrak '${ctr.nomor_kontrak}' (${ctr.judul_kontrak})`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.get("/api/ios", (req: express.Request, res: express.Response) => {
  const activeTenantId = getRequestTenantId(req);
  const filterTenant = !canReadAllTenants(req);
  const iosList = filterTenant
    ? (db.ios || []).filter((i) =>
        isMatchingOrg(i.organizationId, activeTenantId),
      )
    : db.ios || [];
  const result = iosList.map((io) => {
    const p = db.partners.find((part) => part.partner_id === io.partner_id);
    const c = db.contracts.find((ctr) => ctr.contract_id === io.contract_id);
    const cur = normalizeCurrencyCode(io.currency || io.mata_uang, tenantDefaultCurrency(io.organizationId));
    const amt = Number(io.nilai_io) || 0;
    const usdVal =
      io.nilai_io_usd !== void 0 && io.nilai_io_usd !== null
        ? io.nilai_io_usd
        : cur === "USD"
          ? amt
          : convertToUsdWithFallback(amt, cur);
    return {
      ...io,
      currency: cur,
      nilai_io_usd: usdVal,
      partner_nama: p ? p.nama_partner : io.partner_nama || "Partner",
      contract_nomor: c ? c.nomor_kontrak : io.contract_nomor || "-",
    };
  });
  res.json(result);
});
app.post("/api/ios/parse", upload.single("file") as any, async (req: express.Request, res: express.Response) => {
  if (!ensureAiAvailable(req, res)) return;
  try {
    const inputData = req.file?.buffer || req.body?.pdfBase64 || req.body?.fileBase64;
    const model = req.body?.model;
    if (!inputData) {
      return res.status(400).json({ error: "File (binary or base64) is required" });
    }

    const tenantId = getRequestTenantId(req);
    const inputHash = computeInputSha256(inputData);
    const cacheScope = `ios:${tenantId}`;
    const cached = globalOcrCache.get(inputHash, cacheScope);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    const ctx = aiPolicyContext(tenantId);
    const profile = getIndustryPack(getTenantSettings(tenantId).industry).commercialDocument;
    const startTime = Date.now();
    const prompt = `You are an expert commercial-document analyst for ${ctx.organizationName} (${ctx.industryName}). The document is a ${profile.label} or a similar order/schedule issued under a master agreement (it may also be a purchase order, order form, statement of work, insertion order or service order). Extract:

1. "nomor_io": the document's reference number; "-" if it has none.
2. "judul_io": the order, campaign, project or engagement title.
3. "nama_partner": the counterparty's full legal name (not ${ctx.organizationName}).
4. "contract_nomor": the reference number of the master agreement it refers to, if any.
5. "kanal_media": the ${profile.channelLabel.toLowerCase()} this document covers (e.g. ${profile.channelPlaceholder.replace(/^e\.g\. /, "")}); "-" if not stated.
6. "pricing_model": one of ${profile.pricingModels.map((m) => `"${m}"`).join(", ")} — or the closest short label used in the document.
7. "tanggal_mulai": the start date as ISO 8601 "YYYY-MM-DD"; "-" if not separately stated.
8. "tanggal_berakhir": the end date as "YYYY-MM-DD". If only a duration is given, end date = start date + duration − 1 day. "-" if unknown.
9. "durasi_campaign": the duration as short text (e.g. "3 months", "14 days").
10. "nilai_io": the total committed value as a plain number; 0 when the value is variable or uncapped.
11. "currency": the ISO 4217 code of the value; "${ctx.defaultCurrency}" if none is stated.
12. "deliverables": a structured Markdown summary in ${ctx.responseLanguage}. STRICT RULES: never use the comma character (,) — use "and", "or", parentheses or hyphens — and do not add citation markers. Use these sections (translate headings into ${ctx.responseLanguage}):
   # ${profile.label.toUpperCase()} SUMMARY
   - Document name / reference / master agreement / start date / end date
   ## PARTIES — provider (contact and e-mail) and customer (signatory and billing address)
   ## SCOPE AND DELIVERABLES — region / service or goods / ${profile.channelLabel.toLowerCase()} / KPIs or acceptance criteria
   ## PRICING — model / unit prices or tiers / fees / discounts or rebates / budget or cap
   ## PAYMENT AND INVOICING — prepaid or postpaid / payment term from invoice / invoice requirements

Return strictly one valid JSON object matching the schema.`;
    const { contents: ocrContents, ocrStats } = await buildCheapOcrContents(
      inputData,
      prompt,
    );
    console.log(
      `[PDF-Inspector IO Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}, Hash: ${ocrStats.fileHash.slice(0, 8)}`,
    );
    const selectedModel = getValidAiModel(model);
    const response = await generateContentWithRetryAndFallback({
      model: selectedModel,
      contents: ocrContents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nomor_io: { type: Type.STRING },
            judul_io: { type: Type.STRING },
            nama_partner: { type: Type.STRING },
            contract_nomor: { type: Type.STRING },
            kanal_media: { type: Type.STRING },
            pricing_model: { type: Type.STRING },
            tanggal_mulai: { type: Type.STRING },
            tanggal_berakhir: { type: Type.STRING },
            durasi_campaign: { type: Type.STRING },
            nilai_io: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            deliverables: { type: Type.STRING },
          },
        },
      },
    });
    const parsedData = JSON.parse((response as any).text);
    if (parsedData.tanggal_mulai) {
      parsedData.tanggal_mulai = normalizeParsedDate(parsedData.tanggal_mulai);
    }
    if (parsedData.tanggal_berakhir) {
      parsedData.tanggal_berakhir = normalizeParsedDate(
        parsedData.tanggal_berakhir,
      );
    }
    if (
      parsedData.tanggal_mulai &&
      (!parsedData.tanggal_berakhir ||
        parsedData.tanggal_berakhir === parsedData.tanggal_mulai ||
        new Date(parsedData.tanggal_berakhir) <=
          new Date(parsedData.tanggal_mulai))
    ) {
      const computedEnd = computeContractEndDateFromDuration(
        parsedData.tanggal_mulai,
        parsedData.durasi_campaign || "",
      );
      if (computedEnd) {
        parsedData.tanggal_berakhir = computedEnd;
      }
    }
    if (
      parsedData.nilai_io === null ||
      parsedData.nilai_io === void 0 ||
      isNaN(parsedData.nilai_io)
    ) {
      parsedData.nilai_io = 0;
    }
    if (parsedData.deliverables) {
      parsedData.deliverables = String(parsedData.deliverables)
        .replace(/,/g, " ")
        .trim();
    }
    const durationMs = Date.now() - startTime;
    const responsePayload = {
      success: true,
      data: parsedData,
      performance: { durationMs, ...ocrStats },
    };
    if (ocrStats.fileHash) {
      globalOcrCache.set(ocrStats.fileHash, cacheScope, responsePayload);
    }
    res.json(responsePayload);
  } catch (error) {
    console.error("Error parsing IO:", error);
    res
      .status(500)
      .json({
        error:
          error?.message ||
          "Failed to parse IO document. Google AI model is currently busy, please try again.",
      });
  }
});
app.post("/api/ios", async (req: express.Request, res: express.Response) => {
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
    userRole,
  } = req.body;
  if (
    !nomor_io ||
    !judul_io ||
    !partner_id ||
    !tanggal_mulai ||
    !tanggal_berakhir ||
    !pricing_model ||
    !charging_type
  ) {
    return res
      .status(400)
      .json({
        error:
          "Nomor IO, Judul, Partner, Tanggal, Pricing Model, & Charging Type wajib diisi.",
      });
  }
  if (new Date(tanggal_berakhir) <= new Date(tanggal_mulai)) {
    return res
      .status(400)
      .json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  const ioTenantId = getRequestTenantId(req);
  const existingIODup = db.ios.find(
    (i) => isMatchingOrg(i.organizationId, ioTenantId) && String(i.nomor_io || "").trim().toLowerCase() === nomor_io.trim().toLowerCase(),
  );
  if (existingIODup) {
    return res
      .status(400)
      .json({ error: `Nomor IO '${nomor_io}' sudah terdaftar dalam sistem.` });
  }
  const targetOrgId = getRequestTenantId(req);
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId,
  );
  const partner = db.partners.find((p) => p.partner_id === partner_id);
  const contract = db.contracts.find((c) => c.contract_id === contract_id);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
  );
  const cur = normalizeCurrencyCode(currency, tenantDefaultCurrency(targetOrgId));
  const amt = Number(nilai_io) || 0;
  let total_usd = req_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = getDefaultUsdRate(cur);
      try {
        const sheetId =
          targetTenant?.spreadsheetId || db.googleConfig?.spreadsheetId;
        rate = await getHistoricalExchangeRate(
          sheetId,
          token,
          cur,
          tanggal_mulai,
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
    rawFileName: fileName || `${nomor_io}.pdf`,
  });
  let link_file_io = "";
  if (
    fileData &&
    typeof fileData === "string" &&
    fileData.includes("base64,")
  ) {
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder IO",
          token,
          targetOrgId,
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          link_file_io = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Business Owner",
            "UPLOAD_SUCCESS",
            "IO",
            `Berhasil mengunggah file IO '${targetFileName}' ke Google Drive`,
            req,
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
        targetTenant?.name,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Business Owner",
        "UPLOAD_SUCCESS",
        "IO",
        `File IO '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
  }
  const { status, daysRemaining: diffDays } = computeLifecycle(targetOrgId, tanggal_berakhir, "Active", false);
  const newIO = {
    io_id: generateNextIOId(),
    organizationId: targetOrgId,
    contract_id: contract_id || void 0,
    contract_nomor: contract ? contract.nomor_kontrak : "-",
    nomor_io,
    judul_io,
    partner_id,
    partner_nama: partner ? partner.nama_partner : "Partner",
    kanal_media: kanal_media || "",
    tanggal_mulai,
    tanggal_berakhir,
    pricing_model,
    charging_type,
    currency: cur,
    mata_uang: cur,
    nilai_io: amt,
    nilai_io_usd: Number(total_usd),
    deliverables: deliverables || "-",
    notice_period_hari: Number(notice_period_hari) || 14,
    notice_type_required: notice_type_required || "Termination",
    status,
    link_file_io,
    fileName: targetFileName,
    sisa_hari: diffDays,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.ios.unshift(newIO);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Business Owner",
    "CREATE",
    "IO",
    `Membuat dokumen komersial baru '${nomor_io}' (${judul_io}) senilai ${formatAmountForTenant(amt, cur, targetOrgId)}`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req, { tenantId: targetOrgId });
  res.json({ success: true, io: newIO });
});
app.put("/api/ios/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { userEmail, userName, userRole, ...updates } = req.body;
  const idx = db.ios.findIndex((i) => i.io_id === id);
  if (idx === -1) return res.status(404).json({ error: "IO tidak ditemukan." });
  const existing = db.ios[idx];
  const tenantDenial = assertTenantWriteAccess(req, existing.organizationId);
  if (tenantDenial) return res.status(tenantDenial.status).json(tenantDenial.body);
  if ((req as any).actor?.role !== "superuser") delete (updates as any).organizationId;
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const cur = normalizeCurrencyCode(updated.currency || existing.currency, tenantDefaultCurrency(existing.organizationId));
  updated.currency = cur;
  updated.mata_uang = cur;
  const amt = Number(updated.nilai_io) || 0;
  let total_usd = updates.nilai_io_usd;
  if (total_usd === void 0 || total_usd === null || isNaN(Number(total_usd))) {
    if (cur === "USD") {
      total_usd = amt;
    } else {
      let rate = getDefaultUsdRate(cur);
      try {
        const token = await resolveActiveGoogleToken(
          req.headers["x-google-access-token"] || req.body.accessToken,
        );
        const startDate = updated.tanggal_mulai || existing.tanggal_mulai;
        rate = await getHistoricalExchangeRate(
          db.googleConfig.spreadsheetId,
          token,
          cur,
          startDate,
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
  if (
    updates.fileData &&
    typeof updates.fileData === "string" &&
    updates.fileData.includes("base64,")
  ) {
    const fileData = updates.fileData;
    delete updated.fileData;
    const partner = db.partners.find(
      (p) => p.partner_id === updated.partner_id,
    );
    const targetFileName = formatIOFileName({
      partnerName: partner?.nama_partner,
      mediaChannel: updated.kanal_media || "Digital Channel",
      ioNumber: updated.nomor_io,
      startDate: updated.tanggal_mulai,
      rawFileName:
        updates.fileName || updated.fileName || `${updated.nomor_io}.pdf`,
    });
    const token = await resolveActiveGoogleToken(
      req.headers["x-google-access-token"] || req.body.accessToken,
    );
    let link_file_io = "";
    if (token) {
      try {
        const categoryFolderId = await getPartnerCategoryFolderId(
          partner,
          "Folder IO",
          token,
        );
        const driveUrl = await uploadFileToDrive(
          targetFileName,
          fileData,
          "application/pdf",
          categoryFolderId,
          token,
        );
        if (
          driveUrl &&
          (driveUrl.includes("drive.google.com") ||
            driveUrl.includes("google.com"))
        ) {
          link_file_io = driveUrl;
          addActivityLog(
            userEmail || "user@app",
            userName || "User",
            userRole || "Business Owner",
            "UPLOAD_SUCCESS",
            "IO",
            `Berhasil mengunggah ulang file IO '${targetFileName}' ke Google Drive`,
            req,
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
        fileData,
      );
      addActivityLog(
        userEmail || "user@app",
        userName || "User",
        userRole || "Business Owner",
        "UPLOAD_SUCCESS",
        "IO",
        `File IO '${targetFileName}' disimpan di server lokal aplikasi (menunggu sesi Google Drive terhubung untuk auto-sync)`,
        req,
      );
    }
    updated.link_file_io = link_file_io;
    updated.fileName = targetFileName;
  }
  if (
    updated.tanggal_mulai &&
    updated.tanggal_berakhir &&
    new Date(updated.tanggal_berakhir) <= new Date(updated.tanggal_mulai)
  ) {
    return res
      .status(400)
      .json({ error: "Tanggal Berakhir harus setelah Tanggal Mulai." });
  }
  if (updated.nomor_io) {
    const dup = db.ios.find(
      (i) =>
        isMatchingOrg(i.organizationId, updated.organizationId) &&
        String(i.nomor_io || "").trim().toLowerCase() ===
          updated.nomor_io.trim().toLowerCase() && i.io_id !== id,
    );
    if (dup) {
      return res
        .status(400)
        .json({
          error: `Nomor IO '${updated.nomor_io}' sudah digunakan oleh IO lain.`,
        });
    }
  }
  const ioLifecycle = computeLifecycle(updated.organizationId, updated.tanggal_berakhir, updated.status, false);
  updated.sisa_hari = ioLifecycle.daysRemaining ?? updated.sisa_hari;
  updated.status = ioLifecycle.status;
  db.ios[idx] = updated;
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Business Owner",
    "UPDATE",
    "IO",
    `Memperbarui data Insertion Order '${updated.nomor_io}'`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true, io: updated });
});
app.delete("/api/ios/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { userEmail, userName, userRole } = req.query;
  const item = db.ios.find((i) => i.io_id === id);
  if (!item) return res.status(404).json({ error: "IO tidak ditemukan." });
  const tenantDenial = assertTenantWriteAccess(req, item.organizationId);
  if (tenantDenial) return res.status(tenantDenial.status).json(tenantDenial.body);
  db.ios = db.ios.filter((i) => i.io_id !== id);
  saveDb();
  addActivityLog(
    userEmail || "user@app",
    userName || "User",
    userRole || "Admin",
    "DELETE",
    "IO",
    `Menghapus Insertion Order '${item.nomor_io}' (${item.judul_io})`,
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.get("/api/notification-logs", (req: express.Request, res: express.Response) => {
  res.json(db.notifications);
});
app.post("/api/notification-logs/mark-read", (req: express.Request, res: express.Response) => {
  const { notif_id, markAll } = req.body;
  if (markAll) {
    db.notifications = db.notifications.map((n) => ({ ...n, is_read: true }));
  } else if (notif_id) {
    db.notifications = db.notifications.map((n) =>
      n.notif_id === notif_id ? { ...n, is_read: true } : n,
    );
  }
  saveDb();
  res.json({ success: true, notifications: db.notifications });
});
app.post("/api/notification-logs/delete", (req: express.Request, res: express.Response) => {
  const { notif_id, notif_ids, deleteAll } = req.body;
  if (deleteAll) {
    db.notifications = [];
  } else if (Array.isArray(notif_ids) && notif_ids.length > 0) {
    db.notifications = db.notifications.filter(
      (n) => !notif_ids.includes(n.notif_id),
    );
  } else if (notif_id) {
    db.notifications = db.notifications.filter((n) => n.notif_id !== notif_id);
  }
  saveDb();
  res.json({ success: true, notifications: db.notifications });
});
app.post("/api/cron/trigger-check", (req: express.Request, res: express.Response) => {
  const count = recalculateStatuses();
  res.json({ success: true, newNotificationsGenerated: count });
});
app.get(
  ["/api/auth/google/client-id", "/api/google-auth/client-id"],
  (req: express.Request, res: express.Response) => {
    const clientId =
      process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
    res.json({ clientId });
  },
);
app.post(
  ["/api/auth/google/exchange-code", "/api/google-auth/exchange-code"],
  async (req: express.Request, res: express.Response) => {
    try {
      const { code, redirect_uri } = req.body;
      if (!code) {
        return res
          .status(400)
          .json({ error: "Authorization code is required" });
      }
      const clientId =
        process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId) {
        return res
          .status(500)
          .json({
            error:
              "GOOGLE_CLIENT_ID belum dikonfigurasi di environment server.",
          });
      }
      const oauth2Client = new OAuth2Client(
        clientId,
        clientSecret,
        redirect_uri || "postmessage",
      );
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens || !tokens.access_token) {
        return res
          .status(400)
          .json({
            error: "Gagal mendapatkan Access Token dari Google OAuth server.",
          });
      }
      db.googleConfig.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        db.googleConfig.refreshToken = tokens.refresh_token;
      }
      db.googleConfig.isConnected = true;
      db.googleConfig.lastSyncTime = new Date().toISOString();
      saveDb();
      migrateLocalFilesToGoogleDrive(tokens.access_token).catch((mErr) => {
        console.warn(
          "[Google Auth] Background migration error:",
          mErr?.message,
        );
      });
      let profile: any = { email: "Google User", name: "Pengguna Google" };
      try {
        const userInfoRes = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          profile = {
            email: userInfo.email || "Google User",
            name: userInfo.name || userInfo.email || "Pengguna Google",
            photoURL: userInfo.picture || void 0,
          };
        }
      } catch (profileErr) {
        console.warn(
          "Gagal memuat profil pengguna di exchange-code:",
          profileErr,
        );
      }
      res.json({
        success: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || db.googleConfig.refreshToken,
        expiresAt: tokens.expiry_date,
        profile,
      });
    } catch (err) {
      console.error("Error exchanging Google OAuth code:", err);
      res
        .status(500)
        .json({
          error: err.message || "Gagal menukarkan Google Authorization Code.",
        });
    }
  },
);
app.get(
  ["/api/auth/google/token", "/api/google-auth/token"],
  async (req: express.Request, res: express.Response) => {
    if (!(req as any).actor) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
    try {
      const freshToken = await getFreshGoogleAccessToken();
      const activeToken = freshToken || db.googleConfig?.accessToken || null;
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({
        success: true,
        accessToken: activeToken,
        isConnected: Boolean(
          db.googleConfig?.isConnected &&
          (activeToken || db.googleConfig?.refreshToken),
        ),
        lastSyncTime: db.googleConfig?.lastSyncTime || null,
      });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err?.message || "Gagal memeriksa token Google.",
        });
    }
  },
);
app.post(
  ["/api/auth/google/refresh-token", "/api/google-auth/refresh-token"],
  async (req: express.Request, res: express.Response) => {
    if (!(req as any).actor) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication is required." });
    }
    try {
      const freshToken = await getFreshGoogleAccessToken();
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({ success: true, accessToken: freshToken });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err?.message || "Gagal me-refresh token Google.",
        });
    }
  },
);
app.post(
  ["/api/auth/google/sync-session", "/api/google-auth/sync-session"],
  async (req: express.Request, res: express.Response) => {
    try {
      const { email, name, photoURL, idToken, accessToken, refreshToken } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, error: "Email diperlukan untuk sinkronisasi akun." });
      }

      const cleanEmail = email.toLowerCase().trim();
      const userName = name || cleanEmail.split("@")[0];
      const now = new Date().toISOString();

      // The e-mail in the request body is untrusted: prove it with Google.
      const verifiedEmail = await verifyGoogleAccessTokenEmail(accessToken);
      if (!verifiedEmail || verifiedEmail !== cleanEmail) {
        return res.status(401).json({
          success: false,
          error: "GOOGLE_IDENTITY_NOT_VERIFIED",
          message: "The Google sign-in could not be verified. Please sign in again.",
        });
      }

      // 1. Sync to db.allowedUsers
      let allowedUser = (db.allowedUsers || []).find((u: any) => (u.email || "").toLowerCase() === cleanEmail);
      if (!allowedUser) {
        // Self-service sign-up is off unless explicitly enabled; otherwise an
        // administrator must invite the user first.
        if (process.env.ALLOW_GOOGLE_SELF_SIGNUP !== "true") {
          return res.status(403).json({
            success: false,
            error: "NOT_INVITED",
            message: "This Google account has not been invited. Ask an administrator to add you.",
          });
        }
        allowedUser = {
          id: `user_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          organizationId: getDefaultTenantId(),
          email: cleanEmail,
          name: userName,
          role: "Viewer",
          department: "",
          status: "Active",
          addedBy: "Google sign-in (self sign-up)",
          createdAt: now,
          lastLoginAt: now,
        };
        if (!db.allowedUsers) db.allowedUsers = [];
        db.allowedUsers.push(allowedUser);
        saveDb();
      } else {
        allowedUser.lastLoginAt = now;
        if (!allowedUser.name || allowedUser.name === 'User') {
          allowedUser.name = userName;
        }
        saveDb();
      }

      if (allowedUser.status === 'Inactive' || allowedUser.status === 'Banned') {
        return res.status(403).json({
          success: false,
          error: "Akun Anda telah dinonaktifkan oleh Administrator.",
        });
      }

      // 2. Sync to Better Auth SQLite (user, account, session, member)
      const userRole = (allowedUser.role || 'staff').toLowerCase();
      let existingUser: any = null;
      try {
        existingUser = sqliteDb.prepare("SELECT * FROM user WHERE LOWER(email) = LOWER(?)").get(cleanEmail);
      } catch (e) {}

      let userId = existingUser?.id;
      if (!existingUser) {
        userId = allowedUser.id || `usr_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
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
          // Never overwrite an existing account's name from the Google profile here —
          // the display name may have been customized via the admin "Edit User" flow,
          // and every Google sign-in/re-auth must not silently revert it.
          sqliteDb.prepare(`
            UPDATE user SET image = COALESCE(?, image), updatedAt = ?
            WHERE id = ?
          `).run(photoURL || null, now, userId);
        } catch (e) {}
      }

      // Upsert account for google provider
      try {
        const existingAcc: any = sqliteDb.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'google'").get(userId);
        if (!existingAcc) {
          const accId = `acc_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
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
      } catch (e) {}

      // Ensure membership in organization
      try {
        const orgId = allowedUser.organizationId || getDefaultTenantId();
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${userId}`, orgId, userId, userRole, now);
      } catch (e) {}

      // 3. Create a fresh session in Better Auth SQLite table
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1";
      const userAgent = req.headers["user-agent"] || "Browser Client";
      const orgId = allowedUser.organizationId || getDefaultTenantId();

      try {
        sqliteDb.prepare(`
          INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId, activeOrganizationId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, sessionExpiry, sessionToken, now, now, ipAddress, userAgent, userId, orgId);
      } catch (sessErr) {
        console.warn("Could not insert session into Better Auth session table:", sessErr);
      }

      // 4. Update Google Workspace tokens in server state if provided
      if (accessToken) {
        db.googleConfig.accessToken = accessToken;
        if (refreshToken) {
          db.googleConfig.refreshToken = refreshToken;
        }
        db.googleConfig.isConnected = true;
        db.googleConfig.lastSyncTime = now;
        saveDb();
      }

      // 5. Set session cookie
      res.cookie("better-auth.session_token", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      // 6. Record activity log
      if (Array.isArray(db.activities)) {
        db.activities.unshift({
          id: `act_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          user: userName,
          email: cleanEmail,
          role: allowedUser.role,
          action: "LOGIN",
          module: "Autentikasi",
          description: "Signed in with Google",
          timestamp: now,
          ip: (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1",
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
          photoURL: photoURL || null,
        },
      });
    } catch (err: any) {
      console.error("Error in /api/auth/google/sync-session:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Gagal menyinkronkan sesi Google ke Better Auth.",
      });
    }
  }
);
app.post(
  ["/api/google-integration/connect", "/api/auth/google/connect"],
  async (req: express.Request, res: express.Response) => {
    if (!(await checkIsAdmin(req)).isAdmin) {
      return res.status(403).json({ error: "Forbidden: only administrators can change the Google integration." });
    }
    try {
      const { accessToken, refreshToken } = req.body || {};
      const token = accessToken || req.headers["x-google-access-token"];
      if (!token && !refreshToken) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Access token atau Refresh token Google diperlukan.",
          });
      }
      if (token) db.googleConfig.accessToken = token;
      if (refreshToken) db.googleConfig.refreshToken = refreshToken;
      db.googleConfig.isConnected = true;
      db.googleConfig.lastSyncTime = new Date().toISOString();
      saveDb();
      if (token) {
        migrateLocalFilesToGoogleDrive(token).catch((e) => {
          console.warn(
            "[Google Auth] Background migration error on connect:",
            e?.message,
          );
        });
      }
      res.json({
        success: true,
        isConnected: true,
        lastSyncTime: db.googleConfig.lastSyncTime,
        config: redactProviderConfig(db.googleConfig),
      });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err?.message || "Gagal menyinkronkan status koneksi Google.",
        });
    }
  },
);
app.post(
  ["/api/google-integration/disconnect", "/api/auth/google/disconnect"],
  async (req: express.Request, res: express.Response) => {
    if (!(await checkIsAdmin(req)).isAdmin) {
      return res.status(403).json({ error: "Forbidden: only administrators can change the Google integration." });
    }
    try {
      db.googleConfig.accessToken = "";
      db.googleConfig.refreshToken = "";
      db.googleConfig.isConnected = false;
      db.googleConfig.lastSyncTime = new Date().toISOString();
      saveDb();
      res.json({
        success: true,
        isConnected: false,
        message: "Akun Google berhasil diputuskan dari konfigurasi server.",
      });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err?.message || "Gagal memutuskan akun Google di server.",
        });
    }
  },
);
app.get("/api/google-integration", async (req: express.Request, res: express.Response) => {
  const session = await getBetterAuthSession(req);
  const adminCheck = await checkIsAdmin(req);
  if (!session && !adminCheck.isAdmin) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Harap login terlebih dahulu." });
  }
  await getFreshGoogleAccessToken();
  res.json(redactProviderConfig(db.googleConfig));
});
app.post("/api/google-integration", async (req: express.Request, res: express.Response) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Only Admins can modify settings." });
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
    smtpFromName,
  } = req.body;
  if (masterSpreadsheetId !== void 0)
    db.googleConfig.masterSpreadsheetId = masterSpreadsheetId;
  if (masterSpreadsheetUrl !== void 0)
    db.googleConfig.masterSpreadsheetUrl = masterSpreadsheetUrl;
  const token =
    accessToken ||
    req.headers["x-google-access-token"] ||
    db.googleConfig.accessToken;
  const effectiveRefreshToken =
    refreshToken !== void 0 ? refreshToken : db.googleConfig.refreshToken;
  const keepStoredKey = geminiApiKey === void 0 || isMaskedSecret(geminiApiKey);
  const effectiveApiKey = keepStoredKey
    ? db.googleConfig.geminiApiKey || ""
    : String(geminiApiKey).trim();
  if (!keepStoredKey) {
    process.env.GEMINI_API_KEY = effectiveApiKey;
  }
  db.googleConfig = {
    ...db.googleConfig,
    spreadsheetId:
      spreadsheetId !== void 0 ? spreadsheetId : db.googleConfig.spreadsheetId,
    masterSpreadsheetId:
      masterSpreadsheetId !== void 0
        ? masterSpreadsheetId
        : db.googleConfig.masterSpreadsheetId,
    masterSpreadsheetUrl:
      masterSpreadsheetUrl !== void 0
        ? masterSpreadsheetUrl
        : db.googleConfig.masterSpreadsheetUrl,
    driveFolderId:
      driveFolderId !== void 0 ? driveFolderId : db.googleConfig.driveFolderId,
    autoSync: autoSync !== void 0 ? autoSync : db.googleConfig.autoSync,
    accessToken:
      accessToken !== void 0
        ? accessToken
        : token || db.googleConfig.accessToken,
    refreshToken: effectiveRefreshToken || "",
    isLocked: true,
    notificationEmails:
      notificationEmails !== void 0
        ? notificationEmails
        : db.googleConfig.notificationEmails,
    legalNotificationEmail:
      legalNotificationEmail !== void 0
        ? legalNotificationEmail
        : db.googleConfig.legalNotificationEmail,
    financeNotificationEmail:
      financeNotificationEmail !== void 0
        ? financeNotificationEmail
        : db.googleConfig.financeNotificationEmail,
    aiModel:
      aiModel !== void 0
        ? aiModel
        : db.googleConfig.aiModel || "gemini-3.8-flash",
    geminiApiKey: effectiveApiKey,
    smtpEnabled:
      smtpEnabled !== void 0
        ? Boolean(smtpEnabled)
        : db.googleConfig.smtpEnabled,
    smtpHost: smtpHost !== void 0 ? smtpHost : db.googleConfig.smtpHost,
    smtpPort: smtpPort !== void 0 ? Number(smtpPort) : db.googleConfig.smtpPort,
    smtpSecure:
      smtpSecure !== void 0 ? Boolean(smtpSecure) : db.googleConfig.smtpSecure,
    smtpUser: smtpUser !== void 0 ? smtpUser : db.googleConfig.smtpUser,
    smtpPassword:
      smtpPassword !== void 0 && smtpPassword !== "" && !isMaskedSecret(smtpPassword)
        ? smtpPassword
        : db.googleConfig.smtpPassword,
    smtpFromEmail:
      smtpFromEmail !== void 0 ? smtpFromEmail : db.googleConfig.smtpFromEmail,
    smtpFromName:
      smtpFromName !== void 0 ? smtpFromName : db.googleConfig.smtpFromName,
    isConnected:
      accessToken === "" || (!token && !db.googleConfig.accessToken)
        ? false
        : true,
    lastSyncTime: new Date().toISOString(),
  };
  saveDb();
  if (db.googleConfig.accessToken) {
    migrateLocalFilesToGoogleDrive(db.googleConfig.accessToken).catch((e) => {
      console.warn(
        "[Google Auth] Migration error in google-integration:",
        e?.message,
      );
    });
  }
  let syncWarning;
  const isSheetChanged =
    spreadsheetId !== void 0 && spreadsheetId !== oldConfig.spreadsheetId;
  const isFolderChanged =
    driveFolderId !== void 0 && driveFolderId !== oldConfig.driveFolderId;
  if (isFolderChanged && token) {
    try {
      const validToken = (await getFreshGoogleAccessToken()) || token;
      if (validToken) {
        await ensureAllPartnersFolders(validToken);
      }
    } catch (err) {
      console.warn(
        "Folder check warning on saving google integration config:",
        err?.message,
      );
    }
  }
  if (isSheetChanged && db.googleConfig.spreadsheetId) {
    const defaultOrg = (db.tenants || []).find(
      (t) => t.isDefault,
    );
    if (defaultOrg) {
      defaultOrg.spreadsheetId = db.googleConfig.spreadsheetId;
      defaultOrg.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${db.googleConfig.spreadsheetId}/edit`;
      try {
        const orgsDb = new Database(path.join(process.cwd(), "auth.db"));
        if (orgsDb) {
          const row: any = orgsDb
            .prepare("SELECT * FROM organization WHERE id = ? OR slug = ?")
            .get(defaultOrg.id, defaultOrg.domainSlug || defaultOrg.id);
          if (row) {
            let meta: any = {};
            try {
              if (row.metadata)
                meta =
                  typeof row.metadata === "string"
                    ? JSON.parse(row.metadata)
                    : row.metadata;
            } catch {}
            meta.spreadsheetId = db.googleConfig.spreadsheetId;
            orgsDb
              .prepare(
                "UPDATE organization SET metadata = ? WHERE id = ? OR slug = ?",
              )
              .run(JSON.stringify(meta), defaultOrg.id, defaultOrg.domainSlug || defaultOrg.id);
          }
        }
      } catch (e) {
        console.warn(
          "Could not sync sqlite organization metadata on google sheet change:",
          e?.message,
        );
      }
      saveDb();
    }
  }
  if (db.googleConfig.driveFolderId) {
    try {
      const shouldForceNew = Boolean(
        req.body.forceNew ||
        req.body.forceNewOrgResources ||
        req.body.provisionOrgResources ||
        isFolderChanged,
      );
      await autoEnsureTenantGoogleResources(token, shouldForceNew);
    } catch (orgErr) {
      console.warn(
        "[Google Integration Save] Auto-ensure tenant folders warning:",
        orgErr?.message,
      );
    }
  }
  syncTenantsWithSqlite();
  res.json({
    success: true,
    config: redactProviderConfig(db.googleConfig),
    tenants: db.tenants,
    syncWarning,
  });
});
app.post("/api/smtp/test", async (req: express.Request, res: express.Response) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Only Admins can test SMTP settings." });
  }
  const {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFromEmail,
    smtpFromName,
    testRecipient,
  } = req.body;
  const host = (smtpHost || db.googleConfig.smtpHost || "").trim();
  const user = (smtpUser || db.googleConfig.smtpUser || "").trim();
  const pass =
    smtpPassword && !isMaskedSecret(smtpPassword) ? smtpPassword : db.googleConfig.smtpPassword || "";
  const recipient = (testRecipient || "").trim();
  if (!host || !user || !recipient) {
    return res
      .status(400)
      .json({
        error: "SMTP Host, Username, dan Email Penerima Uji Coba wajib diisi.",
      });
  }
  try {
    const port = Number(smtpPort) || (smtpSecure ? 465 : 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: smtpSecure ?? port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    const fromAddress = (
      smtpFromEmail ||
      db.googleConfig.smtpFromEmail ||
      user
    ).trim();
    const fromName = (
      smtpFromName ||
      db.googleConfig.smtpFromName ||
      "Sistem Notifikasi Kontrak & IO"
    ).trim();
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
            <p style="margin: 4px 0;"><strong>Waktu Pengujian:</strong> ${new Date().toISOString()}</p>
          </div>
        </div>
      `,
    });
    res.json({
      success: true,
      message: `Email uji coba berhasil dikirim ke '${recipient}'! (Message ID: ${info.messageId})`,
    });
  } catch (err) {
    console.error("SMTP Test Error:", err);
    res
      .status(400)
      .json({
        error: `Gagal mengirim email via SMTP Relay: ${err.message || String(err)}`,
      });
  }
});
app.post("/api/ai/test-key", async (req: express.Request, res: express.Response) => {
  const { apiKey, model } = req.body;
  const keyToTest = (apiKey && !isMaskedSecret(apiKey) ? String(apiKey) : getEffectiveGeminiApiKey()).trim();
  if (!keyToTest) {
    return res
      .status(400)
      .json({
        error: "API Key belum diisi. Masukkan Gemini API Key terlebih dahulu.",
      });
  }
  try {
    const testClient = new GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const modelsToTry = [
      model ? getValidAiModel(model) : "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
    ];
    const uniqueModels = [...new Set(modelsToTry)];
    let lastErr = null;
    for (const targetModel of uniqueModels) {
      try {
        const response = await testClient.models.generateContent({
          model: targetModel,
          contents: "Say OK",
        });
        if (response && (response as any).text) {
          return res.json({
            success: true,
            message: `Koneksi ke Google Gemini API berhasil! (Model aktif: ${targetModel})`,
            model: targetModel,
          });
        }
      } catch (err) {
        lastErr = err;
        console.warn(
          `[Test API Key] Model ${targetModel} attempt failed:`,
          err?.message || err,
        );
      }
    }
    throw lastErr || new Error("Tidak ada respon dari Gemini API.");
  } catch (err) {
    console.error("Test API Key error:", err);
    return res
      .status(400)
      .json({
        error:
          err?.message ||
          "Gagal terhubung ke Google Gemini API. Pastikan API Key valid.",
      });
  }
});
app.post("/api/google-integration/sync", (req: express.Request, res: express.Response) => {
  db.googleConfig.isConnected = true;
  db.googleConfig.lastSyncTime = new Date().toISOString();
  saveDb();
  return res.json({
    success: true,
    message: "Data tersinkronisasi dan tersimpan penuh di database SQLite (Single Source of Truth).",
    config: redactProviderConfig(db.googleConfig),
    counts: {
      partners: (db.partners || []).length,
      contracts: (db.contracts || []).length,
      ios: (db.ios || []).length,
    },
  });
});
app.get("/api/google-integration/sync-status", (req: express.Request, res: express.Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    active: false,
    queueLength: 0,
    status: "sqlite-native",
    message: "SQLite WAL aktif sebagai single source of truth.",
  });
});
app.post("/api/google-integration/sync-flush", (req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    message: "Sinkronisasi antrean bersih. SQLite WAL aktif.",
  });
});
app.post("/api/google-integration/auto-provision-master", async (req: express.Request, res: express.Response) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({
        error:
          "Forbidden: Hanya Admin/Superuser yang berhak membuat Master Root.",
      });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken,
  );
  if (!token && !hasServiceAccountCredentials()) {
    return res
      .status(400)
      .json({
        error:
          "Koneksi Google belum aktif. Hubungkan akun Google terlebih dahulu.",
      });
  }
  try {
    const rootFolderLink = await createDriveFolder(
      "Master Google Drive Storage (LMS)",
      void 0,
      token,
    );
    const rootFolderId =
      extractFolderIdFromLink(rootFolderLink) || rootFolderLink;
    let spreadsheetId = "";
    const sheet = await createSpreadsheetInFolder(
      "Master Spreadsheet Database (LMS)",
      rootFolderId,
      token,
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
        orgErr?.message,
      );
    }
    saveDb();
    return res.json({
      success: true,
      message:
        "Master Root Folder, Spreadsheet Database, serta Folder Organisasi dan Sheet Database Organisasi berhasil dibuat otomatis di Google Drive.",
      driveFolderId: rootFolderId,
      masterSpreadsheetId: spreadsheetId,
      spreadsheetId,
      tenants: db.tenants,
    });
  } catch (err) {
    console.error("Auto provision master root error:", err);
    return res
      .status(500)
      .json({
        error: err.message || "Gagal membuat Master Root secara otomatis.",
      });
  }
});
app.post("/api/tenants/auto-provision-folders", async (req: express.Request, res: express.Response) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({
        error:
          "Forbidden: Hanya Admin/Superuser yang berhak menyinkronkan folder organisasi.",
      });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken,
  );
  if (!token && !hasServiceAccountCredentials()) {
    return res
      .status(400)
      .json({
        error:
          "Koneksi Google belum aktif. Hubungkan akun Google terlebih dahulu.",
      });
  }
  try {
    const result = await autoEnsureTenantGoogleResources(token);
    return res.json({
      success: true,
      message: `Berhasil menyinkronkan folder organisasi ke Master Root (${result.updatedCount} organisasi disinkronkan).`,
      tenants: db.tenants,
    });
  } catch (err) {
    console.error("Auto provision tenant folders error:", err);
    return res
      .status(500)
      .json({
        error:
          err.message ||
          "Gagal menyinkronkan folder organisasi ke Master Root.",
      });
  }
});
const provisionFoldersHandler = __name(async (req: express.Request, res: express.Response) => {
  const adminCheck = await checkIsAdmin(req);
  if (!adminCheck.isAdmin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Only Admins can provision folders." });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken,
  );
  try {
    const stats = await ensureAllPartnersFolders(token);
    saveDb();
    return res.json({
      success: true,
      message: `4 Subfolder Kategori (Folder Contract, Folder Invoice & Billing, Folder IO, Folder DD) berhasil dibuat/diperbarui untuk ${db.partners.length} partner.`,
      stats,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err.message || "Gagal membuat folder kategori." });
  }
}, "provisionFoldersHandler");
app.post("/api/google-integration/provision-folders", provisionFoldersHandler);
app.post("/api/partners/provision-folders", provisionFoldersHandler);
/**
 * Reset & organization setup (superuser only).
 *
 * mode "empty": wipes all business data and creates ONE organization from the
 *               supplied profile (name, country, industry, currency, ...),
 *               whose policy packs drive checklists, currency and dates.
 * mode "demo":  wipes all business data and reloads the multi-country demo
 *               dataset, so the product can be explored again.
 *
 * Registered login accounts are kept and re-attached to the (first) new
 * organization; AI and SMTP provider credentials are kept because they are
 * deployment configuration, not organization data.
 */
app.post("/api/admin/reset-database", async (req: express.Request, res: express.Response) => {
  const actor = (req as any).actor;
  if (actor?.role !== "superuser") {
    return res.status(403).json({
      error: "INSUFFICIENT_PERMISSION",
      message: "Only a superuser can reset the application.",
    });
  }
  const { confirmKeyword, mode = "empty", organization = {} } = req.body || {};
  if (confirmKeyword !== "RESET NOW") {
    return res.status(400).json({ error: 'Invalid confirmation. Type "RESET NOW" to reset the application.' });
  }
  if (mode !== "empty" && mode !== "demo") {
    return res.status(400).json({ error: 'mode must be "empty" or "demo".' });
  }

  const nowIso = new Date().toISOString();
  let dataset: ReturnType<typeof buildDemoDataset>;
  if (mode === "demo") {
    dataset = buildDemoDataset();
  } else {
    const orgName = String(organization.name || "").trim().slice(0, 120) || "My Organization";
    const settings = resolveTenantSettings({
      settings: {
        countryCode: organization.countryCode,
        industry: organization.industry,
        defaultCurrency: organization.defaultCurrency,
        reportingCurrency: organization.reportingCurrency,
        timezone: organization.timezone,
        language: organization.language,
      },
    });
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "organization";
    dataset = {
      tenants: [{
        id: `org_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
        name: orgName,
        legalEntity: String(organization.legalEntity || "").slice(0, 120),
        brandName: orgName,
        tagline: "Contract Lifecycle Management",
        logoUrl: "/favicon.png",
        primaryColor: DEFAULT_BRANDING.primaryColor,
        currency: settings.defaultCurrency,
        settings,
        domainSlug: slug,
        isDefault: true,
        spreadsheetId: "",
        driveFolderId: "",
        created_at: nowIso,
        updated_at: nowIso,
      }],
      departments: [], allowedUsers: [], partners: [], contracts: [], ios: [],
      spendings: [], evaluations: [], notifications: [], activityLogs: [],
    };
  }
  const primaryTenantId = dataset.tenants[0].id;

  // Keep every registered login account and attach it to the primary tenant.
  const authUsers: any[] = (() => {
    try {
      return sqliteDb.prepare("SELECT id, name, email, role, banned, createdAt FROM user").all() as any[];
    } catch {
      return [];
    }
  })();
  const demoEmails = new Set(dataset.allowedUsers.map((u: any) => String(u.email).toLowerCase()));
  const preservedUsers = authUsers
    .filter((u) => u.email && !demoEmails.has(String(u.email).toLowerCase()))
    .map((u) => ({
      id: u.id,
      organizationId: primaryTenantId,
      email: String(u.email).toLowerCase(),
      name: u.name || "User",
      role: u.id === actor.id || String(u.role).toLowerCase() === "superuser"
        ? "Superuser"
        : String(u.role || "viewer").replace(/^./, (c: string) => c.toUpperCase()),
      department: null,
      status: u.banned ? "Inactive" : "Active",
      addedBy: "System reset",
      createdAt: u.createdAt || nowIso,
    }));

  try {
    sqliteDb.transaction(() => {
      for (const table of ["invitation", "apikey", "teamMember", "team", "member", "organization"]) {
        sqliteDb.prepare(`DELETE FROM ${table}`).run();
      }
      for (const tenant of dataset.tenants) {
        sqliteDb.prepare(`
          INSERT INTO organization (id, name, slug, logo, createdAt, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(tenant.id, tenant.name, tenant.domainSlug, tenant.logoUrl, nowIso, JSON.stringify({
          legalEntity: tenant.legalEntity,
          brandName: tenant.brandName,
          tagline: tenant.tagline,
          primaryColor: tenant.primaryColor,
          currency: tenant.currency,
          settings: tenant.settings,
        }));
      }
      for (const u of preservedUsers) {
        sqliteDb.prepare(`
          INSERT INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`mem_${u.id}`, primaryTenantId, u.id, u.role === "Superuser" ? "admin" : u.role.toLowerCase(), nowIso);
      }
      sqliteDb.prepare("UPDATE session SET activeOrganizationId = ?, activeTeamId = NULL").run(primaryTenantId);
    })();
  } catch (err) {
    console.error("Error resetting auth organization tables:", err);
    return res.status(500).json({ error: "Failed to reset organization tables." });
  }

  // Mutate `db` in place: the auth console holds a reference to this object.
  const provider = db.googleConfig || {};
  Object.assign(db, {
    tenants: dataset.tenants,
    activeTenantId: primaryTenantId,
    departments: dataset.departments,
    allowedUsers: [...preservedUsers, ...dataset.allowedUsers],
    partners: dataset.partners,
    contracts: dataset.contracts,
    ios: dataset.ios,
    spendings: dataset.spendings,
    evaluations: dataset.evaluations,
    notifications: dataset.notifications,
    activityLogs: dataset.activityLogs,
    templates: [],
    newsTicker: { byTenant: {} },
    branding: { ...DEFAULT_BRANDING },
    customTranslations: {},
    googleConfig: {
      spreadsheetId: "",
      driveFolderId: "",
      masterSpreadsheetId: "",
      masterSpreadsheetUrl: "",
      isConnected: false,
      autoSync: false,
      isLocked: false,
      notificationEmails: "",
      legalNotificationEmail: "",
      financeNotificationEmail: "",
      aiModel: provider.aiModel || "gemini-3.8-flash",
      geminiApiKey: provider.geminiApiKey || "",
      smtpEnabled: Boolean(provider.smtpEnabled),
      smtpHost: provider.smtpHost || "",
      smtpPort: provider.smtpPort,
      smtpSecure: provider.smtpSecure,
      smtpUser: provider.smtpUser || "",
      smtpPassword: provider.smtpPassword || "",
      smtpFromEmail: provider.smtpFromEmail || "",
      smtpFromName: provider.smtpFromName || "",
      refreshToken: "",
      accessToken: "",
    },
  });

  if (fs.existsSync(uploadsDir)) {
    try {
      for (const item of fs.readdirSync(uploadsDir)) {
        fs.rmSync(path.join(uploadsDir, item), { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Error cleaning uploads during reset:", e);
    }
  }

  migrateLegacyRecords();
  recalculateStatuses();
  saveDb();
  // Recreate demo users/teams/memberships in the auth tables. Demo accounts
  // get the bootstrap password (DEMO_ADMIN_PASSWORD) so they can be tried.
  hydrateAuthConsoleFromDataStore(db);
  await ensureUserAccountsExist();
  addActivityLog(
    "", "", "Superuser", "RESET", "SYSTEM",
    mode === "demo"
      ? "Reset the application and reloaded the demo dataset."
      : `Reset the application and set up organization "${dataset.tenants[0].name}" (${dataset.tenants[0].settings.countryCode}, ${dataset.tenants[0].settings.industry}).`,
    req,
  );
  res.json({
    success: true,
    mode,
    message: mode === "demo"
      ? "The application was reset and the demo dataset was loaded."
      : `The application was reset. Organization "${dataset.tenants[0].name}" is ready to use.`,
    defaultOrgId: primaryTenantId,
  });
});
app.get("/api/google-service-account/status", async (req: express.Request, res: express.Response) => {
  try {
    const creds = loadServiceAccountCredentials();
    const sheets = getGoogleSheetsClient(creds);
    res.json({
      success: true,
      serviceAccount: {
        client_email: creds.client_email,
        project_id: creds.project_id,
        type: creds.type || "service_account",
      },
      message:
        "Otentikasi Google Service Account untuk Google Sheets API berhasil dikonfigurasi.",
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, error: err?.message || String(err) });
  }
});
app.get("/api/auth/google/client-id", (req: express.Request, res: express.Response) => {
  try {
    let clientId = process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        clientId = raw.oAuthClientId || "";
      }
    }
    return res.json({ clientId });
  } catch (err: any) {
    return res.json({ clientId: "" });
  }
});
app.post("/api/bulk-import", async (req: express.Request, res: express.Response) => {
  const {
    type,
    rows,
    userEmail,
    userName,
    userRole,
    defaultDepartment,
    overrideDepartment,
  } = req.body;
  if (!type || !Array.isArray(rows) || rows.length === 0) {
    return res
      .status(400)
      .json({ error: "Tipe data dan baris tidak boleh kosong." });
  }
  const tenantId = getRequestTenantId(req);
  const tenantCurrency = tenantDefaultCurrency(tenantId);
  const inTenant = (row: any) => isMatchingOrg(row?.organizationId, tenantId);
  const succeeded = [];
  const skipped = [];
  const failed = [];
  const now = new Date().toISOString();
  const defDept =
    typeof defaultDepartment === "string" ? defaultDepartment.trim() : "";
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
          message: "Kolom nama_partner wajib diisi.",
        });
        continue;
      }
      const exists = db.partners.find(
        (p) => inTenant(p) && inTenant(p) && p.nama_partner?.toLowerCase() === name.toLowerCase(),
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier: name,
          message: `Partner dengan nama "${name}" sudah ada (ID: ${exists.partner_id}).`,
        });
        continue;
      }
      try {
        const partnerChannel = (
          row.partner_channel ||
          row.codename ||
          row.channel ||
          row.nama_channel ||
          ""
        ).trim();
        let internalPic = (
          row.internal_pic ||
          row.pic_internal ||
          row.picInternal ||
          ""
        ).trim();
        if (forceDept) {
          internalPic = defDept;
        } else if (!internalPic && defDept) {
          internalPic = defDept;
        }
        const fullPicPartner =
          row.pic_partner ||
          (row.nama_pic
            ? `${row.nama_pic.trim()} (${(row.email_pic || "").trim()} | ${(row.telepon_pic || "").trim()})`
            : "");
        const fullKontakPic =
          row.kontak_pic ||
          (row.email_pic || row.telepon_pic
            ? `${(row.email_pic || "").trim()} / ${(row.telepon_pic || "").trim()}`
            : "");
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
          organizationId: tenantId,
          country: sanitizeCountryCode(row.country) || (row.badan_hukum === "BHI" ? "ID" : ""),
          entity_type: String(row.entity_type || "").slice(0, 120),
          identifiers: [],
          status_dd: "Incomplete",
          catatan: row.catatan || "",
          tags: sanitizePartnerTags(row.tags),
          daftar_dokumen_dd: [],
          created_at: now,
          updated_at: now,
        };
        newPartner.daftar_dokumen_dd = normalizePartnerDocuments(newPartner);
        newPartner.status_dd = computeDueDiligenceStatus(newPartner.daftar_dokumen_dd);
        db.partners.push(newPartner);
        succeeded.push({
          rowIndex,
          identifier: name,
          message: `Partner berhasil dibuat (ID: ${newPartner.partner_id}).`,
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier: name,
          message: err.message || "Gagal membuat partner.",
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
          message: "Kolom nomor_kontrak wajib diisi.",
        });
        continue;
      }
      const exists = db.contracts.find(
        (c) => inTenant(c) && c.nomor_kontrak?.toLowerCase() === nomor.toLowerCase(),
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier: nomor,
          message: `Kontrak "${nomor}" sudah ada (ID: ${exists.contract_id}).`,
        });
        continue;
      }
      const partnerNama = (row.partner_nama || "").trim();
      const partner = db.partners.find(
        (p) => inTenant(p) && p.nama_partner?.toLowerCase() === partnerNama.toLowerCase(),
      );
      try {
        const kategori = row.kategori_kerjasama
          ? row.kategori_kerjasama
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : ["Advertising"];
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
          organizationId: tenantId,
          nomor_kontrak: nomor,
          judul_kontrak: row.judul_kontrak || nomor,
          partner_id: partner?.partner_id || "",
          jenis_dokumen: row.jenis_dokumen || "Master Agreement",
          kategori_kerjasama: kategori,
          tanggal_mulai: row.tanggal_mulai || "",
          tanggal_berakhir: row.tanggal_berakhir || "",
          currency: normalizeCurrencyCode(row.currency, tenantCurrency),
          nilai_kontrak: parseFloat(row.nilai_kontrak) || 0,
          auto_renewal: false,
          notice_period_hari: parseInt(row.notice_period_hari) || 30,
          notice_type_required: row.notice_type_required || "Both",
          pic_internal: contractPic,
          internal_notes: row.internal_notes || "",
          status: "Active",
          status_approval: "Signed",
          created_at: now,
          updated_at: now,
        };
        recalculateStatuses();
        db.contracts.push(newContract);
        succeeded.push({
          rowIndex,
          identifier: nomor,
          message: `Kontrak berhasil dibuat (ID: ${newContract.contract_id}).`,
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier: nomor,
          message: err.message || "Gagal membuat kontrak.",
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
          message: "Kolom nomor_io wajib diisi.",
        });
        continue;
      }
      const exists = db.ios.find(
        (io) => io.nomor_io?.toLowerCase() === nomor.toLowerCase(),
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier: nomor,
          message: `IO "${nomor}" sudah ada (ID: ${exists.io_id}).`,
        });
        continue;
      }
      const partnerNama = (row.partner_nama || "").trim();
      const partner = db.partners.find(
        (p) => inTenant(p) && p.nama_partner?.toLowerCase() === partnerNama.toLowerCase(),
      );
      const contractNomor = (row.contract_nomor || "").trim();
      const contract = db.contracts.find(
        (c) => inTenant(c) && c.nomor_kontrak?.toLowerCase() === contractNomor.toLowerCase(),
      );
      try {
        const newIO = {
          io_id: generateNextIOId(),
          organizationId: tenantId,
          nomor_io: nomor,
          judul_io: row.judul_io || nomor,
          partner_id: partner?.partner_id || "",
          contract_id: contract?.contract_id || "",
          kanal_media: row.kanal_media || "",
          tanggal_mulai: row.tanggal_mulai || "",
          tanggal_berakhir: row.tanggal_berakhir || "",
          pricing_model: row.pricing_model || "Flat Fee",
          charging_type: row.charging_type || "Prepaid",
          currency: normalizeCurrencyCode(row.currency, tenantCurrency),
          nilai_io: parseFloat(row.nilai_io) || 0,
          deliverables: row.deliverables || "",
          notice_period_hari: parseInt(row.notice_period_hari) || 14,
          notice_type_required: row.notice_type_required || "Termination",
          internal_notes: row.internal_notes || "",
          status: "Active",
          created_at: now,
          updated_at: now,
        };
        db.ios.push(newIO);
        succeeded.push({
          rowIndex,
          identifier: nomor,
          message: `IO berhasil dibuat (ID: ${newIO.io_id}).`,
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier: nomor,
          message: err.message || "Gagal membuat IO.",
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
          message: "Kolom supplier_name dan review_date wajib diisi.",
        });
        continue;
      }
      const identifier = `${supplierName} \u2014 ${reviewDate}`;
      const exists = db.evaluations.find(
        (e) =>
          e.supplier_name?.toLowerCase() === supplierName.toLowerCase() &&
          e.review_date === reviewDate,
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier,
          message: `Evaluasi untuk "${supplierName}" pada ${reviewDate} sudah ada.`,
        });
        continue;
      }
      const partner = db.partners.find(
        (p) => inTenant(p) && p.nama_partner?.toLowerCase() === supplierName.toLowerCase(),
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
          notes: row.notes || "",
        };
        db.evaluations.push(newEval);
        succeeded.push({
          rowIndex,
          identifier,
          message: `Evaluasi berhasil dibuat (ID: ${newEval.id}).`,
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier,
          message: err.message || "Gagal membuat evaluasi.",
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
          message: "Kolom invoice_number dan vendor_name wajib diisi.",
        });
        continue;
      }
      const identifier = `${vendorName} \u2014 ${invoiceNumber}`;
      const exists = db.spendings.find(
        (s) => inTenant(s) &&
          s.invoice_number?.toLowerCase() === invoiceNumber.toLowerCase() &&
          s.vendor_name?.toLowerCase() === vendorName.toLowerCase(),
      );
      if (exists) {
        skipped.push({
          rowIndex,
          identifier,
          message: `Invoice "${invoiceNumber}" untuk "${vendorName}" sudah ada (ID: ${exists.id}).`,
        });
        continue;
      }
      const partner = db.partners.find(
        (p) => inTenant(p) && p.nama_partner?.toLowerCase() === vendorName.toLowerCase(),
      );
      try {
        const invoiceMonth = normalizeSpendingMonths(row.invoice_month);
        const totalAmount = parseFloat(row.total_amount) || 0;
        const currency = normalizeCurrencyCode(row.currency, tenantCurrency);
        const newSpending = {
          id: generateNextSpendingId(),
          organizationId: tenantId,
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
          bank_account_holder_name: row.bank_account_holder_name || "",
        };
        db.spendings.push(newSpending);
        succeeded.push({
          rowIndex,
          identifier,
          message: `Spending berhasil dibuat (ID: ${newSpending.id}).`,
        });
      } catch (err) {
        failed.push({
          rowIndex,
          identifier,
          message: err.message || "Gagal membuat spending.",
        });
      }
    }
  } else {
    return res
      .status(400)
      .json({ error: `Tipe import tidak dikenal: ${type}` });
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
      details: `Bulk import ${type}: ${totalSucceeded} berhasil, ${skipped.length} dilewati, ${failed.length} gagal.`,
    };
    db.activityLogs.unshift(logEntry);
    saveDb();
  }
  return res.json({ succeeded, skipped, failed });
});
function syncTenantsWithSqlite() {
  try {
    if (sqliteDb) {
      const orgRows = sqliteDb
        .prepare("SELECT * FROM organization ORDER BY createdAt ASC")
        .all() as any[];
      if (orgRows && orgRows.length > 0) {
        const orgIds = new Set(orgRows.map((o: any) => o.id));
        const orgSlugs = new Set(orgRows.map((o: any) => o.slug));
        const updatedTenants = [];
        orgRows.forEach((org: any) => {
          let meta: any = {};
          try {
            if (org.metadata) {
              meta =
                typeof org.metadata === "string"
                  ? JSON.parse(org.metadata)
                  : org.metadata;
            }
          } catch {}
          const existing: any = (db.tenants || []).find(
            (t: any) => t.id === org.id || t.domainSlug === org.slug,
          );
          const tenantSettings = resolveTenantSettings({
            settings: existing?.settings || meta.settings,
            currency: existing?.currency || meta.currency,
          });
          const tenantObj = {
            id: org.id,
            name: org.name,
            legalEntity: existing?.legalEntity || meta.legalEntity || "",
            brandName: org.name,
            tagline:
              meta.tagline ||
              existing?.tagline ||
              "Contract Lifecycle Management",
            logoUrl: org.logo || existing?.logoUrl || "/favicon.png",
            primaryColor:
              meta.primaryColor || existing?.primaryColor || DEFAULT_BRANDING.primaryColor,
            currency: tenantSettings.defaultCurrency,
            settings: tenantSettings,
            domainSlug: org.slug,
            isDefault: Boolean(existing?.isDefault),
            spreadsheetId:
              existing?.spreadsheetId ||
              meta.spreadsheetId ||
              (existing?.isDefault
                ? db.googleConfig?.spreadsheetId
                : void 0),
            spreadsheetUrl:
              existing?.spreadsheetUrl ||
              meta.spreadsheetUrl ||
              (existing?.spreadsheetId ||
              meta.spreadsheetId ||
              (existing?.isDefault
                ? db.googleConfig?.spreadsheetId
                : void 0)
                ? `https://docs.google.com/spreadsheets/d/${existing?.spreadsheetId || meta.spreadsheetId || db.googleConfig?.spreadsheetId}/edit`
                : void 0),
            driveFolderId:
              existing?.driveFolderId ||
              meta.driveFolderId ||
              (existing?.isDefault
                ? db.googleConfig?.driveFolderId
                : void 0),
            driveFolderLink:
              existing?.driveFolderLink ||
              meta.driveFolderLink ||
              (existing?.driveFolderId ||
              meta.driveFolderId ||
              (existing?.isDefault
                ? db.googleConfig?.driveFolderId
                : void 0)
                ? `https://drive.google.com/drive/folders/${existing?.driveFolderId || meta.driveFolderId || db.googleConfig?.driveFolderId}`
                : void 0),
          };
          updatedTenants.push(tenantObj);
        });
        db.tenants = updatedTenants;
        if (!db.tenants.some((t) => t.id === db.activeTenantId)) {
          db.activeTenantId = db.tenants[0]?.id || getDefaultTenantId();
        }
        saveDb();
      }
    }
  } catch (err) {
    console.warn(
      "Error reading sqlite organization table in syncTenantsWithSqlite:",
      err,
    );
  }
}
app.get("/api/tenants", requirePermission("workspace.view", "tenant"), async (req: express.Request, res: express.Response) => {
  syncTenantsWithSqlite();
  if (!db.tenants || !Array.isArray(db.tenants) || db.tenants.length === 0) {
    db.tenants = [DEFAULT_TENANTS[0]];
  }
  if (
    sanitizeParentFolderId(db.googleConfig?.driveFolderId) &&
    db.tenants.some(
      (t) => !t.driveFolderId || t.driveFolderId.startsWith("Folder_"),
    )
  ) {
    try {
      const token =
        req.headers["x-google-access-token"] || (db.googleConfig as any)?.accessToken;
      await autoEnsureTenantGoogleResources(token);
    } catch (e) {
      console.warn(
        "[GET /api/tenants] autoEnsureTenantGoogleResources warning:",
        e?.message,
      );
    }
  }
  const clientTenantId = (req.headers["x-tenant-id"] || req.headers["x-organization-id"] || req.query.tenantId || req.query.activeTenantId) as string;
  if (clientTenantId && db.tenants.some((t) => t.id === clientTenantId || t.domainSlug === clientTenantId)) {
    const matched = db.tenants.find((t) => t.id === clientTenantId || t.domainSlug === clientTenantId);
    if (matched) {
      db.activeTenantId = matched.id;
      saveDb();
    }
  } else if (
    !db.activeTenantId ||
    !db.tenants.some((t) => t.id === db.activeTenantId)
  ) {
    db.activeTenantId = db.tenants[0]?.id || getDefaultTenantId();
    saveDb();
  }
  const actor = (req as any).actor;
  const visibleTenants = actor?.role === "superuser"
    ? db.tenants
    : db.tenants.filter((tenant) => tenant.id === actor?.tenantId);
  return res.json({
    success: true,
    tenants: visibleTenants,
    activeTenantId: visibleTenants.some((tenant) => tenant.id === db.activeTenantId)
      ? db.activeTenantId
      : visibleTenants[0]?.id || null,
  });
});
app.post("/api/tenants/switch", (req: express.Request, res: express.Response) => {
  const { tenantId } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: "tenantId is required." });
  }
  syncTenantsWithSqlite();
  let exists = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === tenantId || t.domainSlug === tenantId);
  if (!exists) {
    try {
      if (sqliteDb) {
        const orgInSqlite = sqliteDb.prepare("SELECT * FROM organization WHERE id = ? OR slug = ?").get(tenantId, tenantId) as any;
        if (orgInSqlite) {
          syncTenantsWithSqlite();
          exists = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === orgInSqlite.id || t.domainSlug === orgInSqlite.slug);
        }
      }
    } catch {}
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
      sqliteDb.prepare("UPDATE session SET activeOrganizationId = ?, updatedAt = ? WHERE token = ?")
        .run(targetId, new Date().toISOString(), token);
    }
  } catch (err) {
    console.warn("Failed to update activeOrganizationId in sqlite session:", err);
  }

  return res.json({ success: true, activeTenantId: targetId });
});
app.post("/api/tenants", requirePermission("tenant.create", "global"), (req: express.Request, res: express.Response) => {
  const tenantData = req.body;
  if (!tenantData.name) {
    return res.status(400).json({ error: "Tenant name is required." });
  }
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const settings = resolveTenantSettings({
    settings: {
      ...(tenantData.settings || {}),
      ...(tenantData.countryCode ? { countryCode: tenantData.countryCode } : {}),
      ...(tenantData.industry ? { industry: tenantData.industry } : {}),
    },
    currency: tenantData.currency,
  });
  const newTenant = {
    id: `tenant-${Date.now()}`,
    name: tenantData.name,
    legalEntity: tenantData.legalEntity || "",
    brandName: tenantData.brandName || tenantData.name,
    tagline: tenantData.tagline || "",
    logoUrl: tenantData.logoUrl || "/favicon.png",
    primaryColor: tenantData.primaryColor || DEFAULT_BRANDING.primaryColor,
    currency: settings.defaultCurrency,
    settings,
    domainSlug:
      tenantData.domainSlug ||
      tenantData.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    isDefault: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.tenants.push(newTenant as any);
  saveDb();
  return res.json({ success: true, tenants: db.tenants, newTenant });
});
app.put("/api/tenants/:id", requirePermission("tenant.edit", "global"), (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const updates = req.body;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const index = db.tenants.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Tenant not found." });
  }
  const { id: _ignoredId, isDefault: _ignoredDefault, settings: incomingSettings, ...safeUpdates } = updates || {};
  const merged = { ...db.tenants[index], ...safeUpdates };
  merged.settings = resolveTenantSettings({
    settings: { ...(db.tenants[index].settings || {}), ...(incomingSettings || {}) },
    currency: safeUpdates.currency || db.tenants[index].currency,
  });
  if (safeUpdates.currency) merged.settings.defaultCurrency = normalizeCurrencyCode(safeUpdates.currency, merged.settings.defaultCurrency);
  merged.currency = merged.settings.defaultCurrency;
  merged.updated_at = new Date().toISOString();
  db.tenants[index] = merged;
  saveDb();
  return res.json({ success: true, tenants: db.tenants });
});
app.delete("/api/tenants/:id", requirePermission("tenant.delete", "global"), (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const target = db.tenants.find((t) => t.id === id);
  if (target?.isDefault) {
    return res.status(400).json({ error: "Default tenant cannot be deleted." });
  }
  db.tenants = db.tenants.filter(
    (t) => t.id !== id && t.domainSlug !== target?.domainSlug,
  );
  if (db.activeTenantId === id) {
    db.activeTenantId = db.tenants[0]?.id || getDefaultTenantId();
  }
  try {
    if (sqliteDb) {
      sqliteDb.prepare("DELETE FROM member WHERE organizationId = ?").run(id);
      sqliteDb.prepare("DELETE FROM team WHERE organizationId = ?").run(id);
      sqliteDb
        .prepare("DELETE FROM invitation WHERE organizationId = ?")
        .run(id);
      sqliteDb
        .prepare("DELETE FROM organization WHERE id = ? OR slug = ?")
        .run(id, target?.domainSlug || "");
    }
  } catch (err) {
    console.warn(
      "Could not delete sqlite organization record in /api/tenants/:id:",
      err,
    );
  }
  saveDb();
  return res.json({
    success: true,
    tenants: db.tenants,
    activeTenantId: db.activeTenantId,
  });
});
app.post("/api/tenants/:id/setup-google", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const {
    driveFolderId,
    spreadsheetId,
    createNewFolder,
    createNewSheet,
    userEmail,
    userName,
    userRole,
  } = req.body;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const tenant = db.tenants.find((t) => t.id === id);
  if (!tenant) {
    return res.status(404).json({ error: "Organisasi tidak ditemukan." });
  }
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
  );
  if (!token && !hasServiceAccountCredentials()) {
    return res
      .status(400)
      .json({
        error:
          "Koneksi Google belum aktif. Hubungkan sesi Google Drive / Service Account terlebih dahulu.",
      });
  }
  try {
    let finalFolderId = driveFolderId || tenant.driveFolderId;
    let finalFolderLink = tenant.driveFolderLink;
    if (createNewFolder || !finalFolderId) {
      const orgFolder = await getOrgFolderId(tenant, token);
      finalFolderId = orgFolder.id;
      finalFolderLink =
        orgFolder.webViewLink ||
        `https://drive.google.com/drive/folders/${orgFolder.id}`;
    } else if (finalFolderId && !finalFolderLink) {
      finalFolderLink = `https://drive.google.com/drive/folders/${finalFolderId}`;
    }
    tenant.driveFolderId = finalFolderId || void 0;
    tenant.driveFolderLink = finalFolderLink || void 0;
    (tenant as any).updated_at = new Date().toISOString();
    saveDb();
    addActivityLog(
      userEmail || "user@app",
      userName || "User",
      userRole || "Admin",
      "UPDATE",
      "TENANT",
      `Konfigurasi Google Drive Folder Organisasi '${tenant.name}' berhasil diperbarui`,
      req,
    );
    return res.json({
      success: true,
      tenant,
      message: `Berhasil mengonfigurasi folder Google Drive untuk ${tenant.name}.`,
    });
  } catch (err) {
    console.error(
      `Error setting up Google Drive for tenant ${tenant.name}:`,
      err,
    );
    return res
      .status(500)
      .json({
        error: err.message || "Gagal mengatur Google Drive untuk organisasi.",
      });
  }
});
app.post("/api/tenants/:id/sync-google", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const tenant = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === id);
  if (!tenant) {
    return res.status(404).json({ error: "Organisasi tidak ditemukan." });
  }
  return res.json({
    success: true,
    message: `Data organisasi '${tenant.name}' tersimpan aman & tersinkronisasi di database SQLite.`,
  });
});
app.get("/api/branding", (req: express.Request, res: express.Response) => {
  if (!db.branding) {
    db.branding = DEFAULT_BRANDING;
  }
  return res.json({ success: true, branding: db.branding });
});
app.post("/api/branding", (req: express.Request, res: express.Response) => {
  const brandingData = req.body;
  db.branding = { ...(db.branding || DEFAULT_BRANDING), ...brandingData };
  saveDb();
  return res.json({ success: true, branding: db.branding });
});
/** Mask all but the last `keep` characters, e.g. bank account numbers. */
function maskTail(value: unknown, keep = 4): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length <= keep ? "•".repeat(text.length) : `${"•".repeat(Math.min(6, text.length - keep))}${text.slice(-keep)}`;
}
app.post("/api/chat", async (req: express.Request, res: express.Response) => {
  if (!ensureAiAvailable(req, res)) return;
  try {
    const { query, history } = req.body;
    if (!query && (!history || history.length === 0)) {
      return res.status(400).json({ error: "Query is required" });
    }
    const tenantId = getRequestTenantId(req);
    const settings = getTenantSettings(tenantId);
    const ctx = aiPolicyContext(tenantId);
    const inTenant = (row: any) => isMatchingOrg(row?.organizationId, tenantId);
    /*
     * Privacy by design (PRD §3.4.1, §5.1): only the active tenant's records
     * are sent, and direct identifiers — phone numbers, e-mail addresses,
     * postal addresses, identity/tax numbers and bank account numbers — are
     * stripped or masked before anything leaves this server.
     */
    const dbContext = {
      organization: { name: ctx.organizationName, country: ctx.countryName, industry: ctx.industryName },
      partners: (db.partners || []).filter(inTenant).map((p: any) => ({
        partner_id: p.partner_id || p.id,
        name: p.nama_partner,
        codename: p.codename || p.partner_channel || "",
        type: p.jenis_partner || "Vendor",
        country: p.country || "",
        entity_type: p.entity_type || "",
        dd_status: p.status_dd,
        dd_verified_at: p.tanggal_dd_diverifikasi || "",
        internal_owner: p.pic_internal || p.internal_pic || "",
        contact_name: p.nama_pic || "",
        categories: p.tags || [],
        internal_notes: p.catatan || p.internal_notes || p.notes || "",
        dd_documents: Array.isArray(p.daftar_dokumen_dd)
          ? p.daftar_dokumen_dd.map((d: any) => ({
              name: d.nama,
              status: d.status,
              required: d.wajib,
              expires_at: d.tanggalKadaluarsa || "",
            }))
          : [],
      })),
      contracts: (db.contracts || []).filter(inTenant).map((c: any) => ({
        contract_id: c.contract_id || c.id,
        reference: c.nomor_kontrak,
        title: c.judul_kontrak,
        counterparty: c.partner_nama || c.nama_partner || "",
        partner_id: c.partner_id || "",
        document_type: c.jenis_dokumen || "Master Agreement",
        parent_reference: c.parent_contract_nomor || c.parent_nomor || "",
        categories: c.kategori_kerjasama || [],
        start_date: c.tanggal_mulai,
        end_date: c.tanggal_berakhir,
        currency: c.currency,
        value: c.nilai_kontrak || 0,
        value_usd: c.nilai_kontrak_usd || 0,
        auto_renewal: Boolean(c.auto_renewal),
        notice_period_days: c.notice_period_hari || c.notice_period_days || 30,
        notice_type: c.notice_type_required || "Termination",
        status: c.status,
        approval_status: c.status_approval,
        internal_owner: c.pic_internal || "",
        internal_notes: c.internal_notes || c.notes || c.catatan || "",
        change_summary: c.ringkasan_perubahan || "",
        changed_fields: c.field_yang_berubah || [],
        days_remaining: c.sisa_hari,
      })),
      commercial_documents: (db.ios || []).filter(inTenant).map((i: any) => {
        const endDateStr = i.tanggal_berakhir || i.tanggal_selesai || i.period_end || "";
        const lifecycle = computeLifecycle(i.organizationId, endDateStr, i.status);
        return {
          id: i.io_id || i.id,
          reference: i.nomor_io,
          title: i.judul_io,
          counterparty: i.partner_nama || i.nama_partner || "",
          partner_id: i.partner_id || "",
          contract_reference: i.contract_nomor || "",
          scope: i.kanal_media || i.channel || "",
          start_date: i.tanggal_mulai || i.period_start || "",
          end_date: endDateStr,
          pricing_model: i.pricing_model || "",
          charging_type: i.charging_type || "",
          payment_scheme: i.skema_pembayaran || i.model_pembayaran || "",
          currency: i.currency,
          value: i.nilai_io || i.total_nominal || 0,
          value_usd: i.nilai_io_usd || 0,
          deliverables: i.deliverables || "",
          notice_period_days: i.notice_period_hari || i.notice_period_days || 14,
          status: lifecycle.status,
          internal_notes: i.internal_notes || i.notes || i.catatan || "",
          days_remaining: lifecycle.daysRemaining,
        };
      }),
      spendings_and_invoices: (db.spendings || []).filter(inTenant).map((s: any) => ({
        spending_id: s.id,
        vendor_name: s.vendor_name || s.partner_name || "",
        vendor_id: s.vendor_id || s.partner_id || "",
        invoice_number: s.invoice_number || "",
        invoice_date: s.invoice_date || "",
        invoice_month: s.invoice_month || s.month || "",
        currency: s.currency,
        total_amount: s.total_amount || s.amount || 0,
        total_amount_usd: s.total_amount_usd || s.amount_usd || 0,
        description: s.invoice_description || s.description || "",
        payment_status: s.payment_status || "",
        bank: [s.bank_name, maskTail(s.bank_account_number)].filter(Boolean).join(" "),
      })),
      evaluations: (db.evaluations || []).filter(inTenant).map((e: any) => ({
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
        internal_notes: e.notes || e.catatan || "",
      })),
    };
    const moduleNote = settings.modules.commercialDocuments
      ? `"commercial_documents" are ${ctx.commercialDocumentLabel}s issued under master agreements.`
      : "";
    const systemInstruction = `You are a context-aware legal, commercial and business assistant embedded in the Silegal contract lifecycle management workspace of ${ctx.organizationName}.
Answer strictly from the workspace JSON below and the ongoing conversation. ${moduleNote}
Contact details, identity/tax numbers and full bank account numbers are intentionally withheld for privacy; if asked for them, say they are not available to the assistant.

Workspace JSON:
${JSON.stringify(dbContext, null, 2)}

Guidelines:
1. When asked about notes, remarks or summaries, check every "internal_notes" field.
2. Keep conversational context; resolve follow-up references ("that contract", "its notes") to previously discussed items.
3. Be concise, direct, professional and accurate. Compute sums, counts and currency breakdowns strictly from the JSON and state the currency of every amount.
4. If a record or note is missing, say so clearly.
5. Never answer with Markdown tables (the chat widget is narrow). Use bullet lists with bold entity names and indented sub-bullets instead.
6. Answer in ${ctx.responseLanguage} unless the user writes in, or asks for, another language.`;
    const contents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history) {
        if (msg && typeof msg.text === "string" && msg.text.trim()) {
          const role =
            msg.role === "ai" || msg.role === "model" ? "model" : "user";
          contents.push({ role, parts: [{ text: msg.text.trim() }] });
        }
      }
    }
    if (query && typeof query === "string" && query.trim()) {
      const lastMsg = contents[contents.length - 1];
      if (
        !lastMsg ||
        lastMsg.role !== "user" ||
        lastMsg.parts[0]?.text !== query.trim()
      ) {
        contents.push({ role: "user", parts: [{ text: query.trim() }] });
      }
    }
    const modelToUse = getValidAiModel(db.googleConfig?.aiModel || "gemini-3.8-flash");
    const response = await generateContentWithRetryAndFallback({
      model: modelToUse,
      contents,
      config: { systemInstruction, temperature: 0.2 },
    });
    res.json({ success: true, reply: (response as any).text });
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    res
      .status(500)
      .json({ error: error?.message || "Failed to process AI request" });
  }
});
/* ------------------------------------------------------------------ */
/* Health, first-run status, policy packs and tenant settings          */
/* ------------------------------------------------------------------ */
app.get("/api/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/** True while the bootstrap superuser still uses the documented password. */
async function isBootstrapPasswordActive(): Promise<boolean> {
  try {
    const row: any = sqliteDb.prepare(`
      SELECT a.password FROM account a JOIN user u ON u.id = a.userId
      WHERE LOWER(u.email) = LOWER(?) AND a.providerId = 'credential' LIMIT 1
    `).get(demoAdminEmail);
    if (!row?.password) return false;
    return await verifyPassword({ hash: row.password, password: DEFAULT_ADMIN_PASSWORD });
  } catch {
    return false;
  }
}

// Unauthenticated: lets the sign-in page show the first-run login hint
// only while the documented default credentials still work.
app.get("/api/system/public-status", async (_req: express.Request, res: express.Response) => {
  const defaultCredentialsActive = shouldSeedDemoAdmin && demoAdminEmail === DEFAULT_ADMIN_EMAIL && (await isBootstrapPasswordActive());
  res.json({
    appName: db.branding?.appName || DEFAULT_BRANDING.appName,
    defaultCredentialsActive,
    defaultAdminEmail: defaultCredentialsActive ? DEFAULT_ADMIN_EMAIL : undefined,
  });
});

app.get("/api/system/status", async (req: express.Request, res: express.Response) => {
  const actor = (req as any).actor;
  const isSuperuser = actor?.role === "superuser";
  res.json({
    isSuperuser,
    defaultAdminPasswordActive: isSuperuser ? await isBootstrapPasswordActive() : false,
    tenantCount: (db.tenants || []).length,
  });
});

app.get("/api/policy-packs", (_req: express.Request, res: express.Response) => {
  res.json({
    countries: listCountryPacks().map((c) => ({
      code: c.code,
      name: c.name,
      region: c.region,
      defaultCurrency: c.defaultCurrency,
      timezone: c.timezone,
      legalForms: c.legalForms,
      identifierSchemes: c.identifierSchemes,
      dataProtectionLaw: c.dataProtectionLaw,
      governingLaw: c.governingLaw,
      disputeVenue: c.disputeVenue,
    })),
    industries: listIndustryPacks().map((i) => ({
      key: i.key,
      name: i.name,
      partnerCategories: i.partnerCategories,
      commercialDocument: i.commercialDocument,
    })),
  });
});

function tenantSettingsPayload(tenantId: string) {
  const tenant = findTenant(tenantId);
  const settings = resolveTenantSettings(tenant);
  const country = getCountryPack(settings.countryCode);
  const industry = getIndustryPack(settings.industry);
  return {
    tenantId: tenant?.id || tenantId,
    tenantName: tenant?.name || "",
    settings,
    country: {
      code: country.code,
      name: country.name,
      legalForms: country.legalForms,
      identifierSchemes: country.identifierSchemes,
      governingLaw: country.governingLaw,
      disputeVenue: country.disputeVenue,
      dataProtectionLaw: country.dataProtectionLaw,
      indirectTaxName: country.indirectTaxName,
      stampDutyConvention: country.stampDutyConvention || null,
      weekend: country.weekend,
      callingCode: country.callingCode,
      formattingLocale: country.formattingLocale,
    },
    industry: {
      key: industry.key,
      name: industry.name,
      partnerCategories: industry.partnerCategories,
      commercialDocument: industry.commercialDocument,
    },
    dueDiligenceChecklist: buildDueDiligenceChecklist(settings, { includeDisabled: true }),
  };
}

app.get("/api/tenant-settings", (req: express.Request, res: express.Response) => {
  res.json(tenantSettingsPayload(getRequestTenantId(req)));
});

app.put("/api/tenant-settings", (req: express.Request, res: express.Response) => {
  const actor = (req as any).actor;
  if (!actor || !["admin", "superuser"].includes(String(actor.role))) {
    return res.status(403).json({ error: "INSUFFICIENT_PERMISSION", message: "Only administrators can change organization settings." });
  }
  const tenantId = getRequestTenantId(req);
  const tenant = findTenant(tenantId);
  if (!tenant) return res.status(404).json({ error: "Organization not found." });
  const incoming = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : {};
  const merged = resolveTenantSettings({
    settings: { ...(tenant.settings || {}), ...incoming },
    currency: tenant.currency,
  });
  const previous = resolveTenantSettings(tenant);
  tenant.settings = merged;
  tenant.currency = merged.defaultCurrency;
  if (typeof req.body?.legalEntity === "string") tenant.legalEntity = req.body.legalEntity.slice(0, 120);
  tenant.updated_at = new Date().toISOString();
  // Policy changes re-derive checklists and lifecycle statuses immediately.
  (db.partners || []).forEach((p: any) => {
    if (!isMatchingOrg(p.organizationId, tenant.id)) return;
    p.daftar_dokumen_dd = normalizePartnerDocuments(p);
    p.status_dd = computeDueDiligenceStatus(p.daftar_dokumen_dd);
  });
  recalculateStatuses();
  saveDb();
  try {
    const row: any = sqliteDb.prepare("SELECT metadata FROM organization WHERE id = ?").get(tenant.id);
    if (row) {
      let meta: any = {};
      try { meta = row.metadata ? JSON.parse(row.metadata) : {}; } catch { meta = {}; }
      meta.settings = merged;
      meta.currency = merged.defaultCurrency;
      if (tenant.legalEntity !== undefined) meta.legalEntity = tenant.legalEntity;
      sqliteDb.prepare("UPDATE organization SET metadata = ? WHERE id = ?").run(JSON.stringify(meta), tenant.id);
    }
  } catch (err) {
    console.warn("Could not persist tenant settings to organization metadata:", err);
  }
  addActivityLog(
    "", "", actor.role, "UPDATE", "ADMIN",
    `Updated organization settings for ${tenant.name}: country ${previous.countryCode} → ${merged.countryCode}, industry ${previous.industry} → ${merged.industry}, currency ${merged.defaultCurrency}, timezone ${merged.timezone}.`,
    req,
  );
  res.json({ success: true, ...tenantSettingsPayload(tenant.id) });
});

app.use("/api/auth-console", authConsoleRouter);
app.all("/api/*", (req: express.Request, res: express.Response) => {
  res
    .status(404)
    .json({ error: `API route not found: ${req.method} ${req.path}` });
});
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[API Unhandled Error]", err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith("/api/")) {
    return res
      .status(err.status || 500)
      .json({
        error: err.message || "Terjadi kesalahan internal server.",
        status: err.status || 500,
      });
  }
  next(err);
});
async function startServer() {
  let viteServer;
  if (process.env.NODE_ENV !== "production") {
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Pengelola Kontrak & IO Server running on http://0.0.0.0:${PORT}`,
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
export { getFreshGoogleAccessToken, isMatchingOrg, resolveActiveGoogleToken };
