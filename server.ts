var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
/* RBAC-INTEGRATION-V1 */
import { createRbacRouter, requirePermission } from "./server/rbacRoutes";
import { GoogleGenAI, Type } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { toNodeHandler } from "better-auth/node";
import { hashPassword } from "better-auth/crypto";
import { auth as betterAuthInstance, sqliteDb } from "./src/lib/auth";
import {
  authConsoleRouter,
  setConsoleDbReference,
  hydrateAuthConsoleFromDataStore,
  ensureUserAccountsExist,
} from "./src/server/authConsoleRoutes";
import Database from "better-sqlite3";
import {
  INITIAL_ALLOWED_USERS,
  INITIAL_PARTNERS,
  INITIAL_CONTRACTS,
  INITIAL_IOS,
  INITIAL_NOTIFICATIONS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_EVALUATIONS,
  INITIAL_SPENDINGS,
} from "./src/data/initialData";
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
  buildCheapOcrContents,
  globalOcrCache,
  computeInputSha256,
} from "./src/lib/cheapOcrPipeline";

const app = express();
const PORT = 3e3;
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
export const rbacAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    !req.path.startsWith("/api/") ||
    req.path === "/api/auth" || req.path.startsWith("/api/auth/") ||
    req.path === "/api/health" ||
    req.path === "/api/exchange-rates" ||
    req.path === "/api/exchange-rate-historical" ||
    req.path.endsWith("/parse") ||
    req.path === "/api/chat" ||
    req.path === "/api/partners/generate-dd-notes" ||
    req.path.endsWith("/redline-analysis") ||
    req.path === "/api/google/test-connection" ||
    req.path === "/api/export-csv" ||
    req.path === "/api/templates" ||
    req.path.startsWith("/api/templates/") ||
    req.path === "/api/translate-template" ||
    req.path === "/api/audit-logs"
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

  // Check session token in SQLite auth database
  const authHeader = req.headers["authorization"] || req.headers["x-session-token"];
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

  // Determine role based on verified DB/Session role
  const rawRole = (detectedRole || "").toString().toLowerCase().trim();

  let role: "Admin" | "Editor" | "Viewer" = "Viewer";
  if (/admin|superuser|owner|super admin/i.test(rawRole)) {
    role = "Admin";
  } else if (/editor|manager|legal|finance/i.test(rawRole)) {
    role = "Editor";
  } else if (/viewer|guest|readonly|read/i.test(rawRole)) {
    role = "Viewer";
  } else {
    role = "Viewer";
  }

  (req as any).rbacRole = role;

  const method = req.method.toUpperCase();
  if (role === "Viewer" && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return res.status(403).json({
      error: "Forbidden: Viewer role is view-only.",
      message: "Peran Viewer hanya memiliki izin baca (view-only). Tindakan perubahan data ditolak.",
      role: "Viewer",
      attemptedMethod: method,
    });
  }

  next();
};

app.use(rbacAuthMiddleware);

/* RBAC-INTEGRATION-V1 */
// Actor RBAC diambil dari sesi terverifikasi (better-auth / token sesi), bukan header yang bisa dipalsukan.
const resolveRbacActor = async (req: any) => {
  try {
    const session = await betterAuthInstance.api.getSession({ headers: req.headers as any });
    if (session?.user?.id) {
      const u: any = sqliteDb.prepare("SELECT role FROM user WHERE id = ?").get(session.user.id);
      const m: any = sqliteDb.prepare("SELECT organizationId, role FROM member WHERE userId = ? LIMIT 1").get(session.user.id);
      const raw = (m?.role === "owner" ? "superuser" : (u?.role || m?.role || "viewer"));
      return { id: session.user.id, role: String(raw).toLowerCase(), tenantId: m?.organizationId ?? null, departmentId: null };
    }
  } catch { /* lanjut ke fallback */ }
  try {
    const authHeader = req.headers["authorization"] || req.headers["x-session-token"];
    if (authHeader && sqliteDb) {
      const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : String(authHeader).trim();
      const s: any = sqliteDb.prepare("SELECT userId FROM session WHERE token = ?").get(token);
      if (s?.userId) {
        const u: any = sqliteDb.prepare("SELECT role FROM user WHERE id = ?").get(s.userId);
        const m: any = sqliteDb.prepare("SELECT organizationId, role FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1").get(s.userId);
        const tm: any = sqliteDb.prepare(`
          SELECT t.id
          FROM teamMember tm
          JOIN team t ON t.id = tm.teamId
          WHERE tm.userId = ?
          ORDER BY tm.createdAt ASC
          LIMIT 1
        `).get(s.userId);
        const rawRole = m?.role === "owner" ? "superuser" : (u?.role || m?.role || "viewer");
        return {
          id: s.userId,
          role: String(rawRole).toLowerCase(),
          tenantId: m?.organizationId ?? null,
          departmentId: tm?.id ?? null,
        };
      }
    }
  } catch { /* tanpa actor */ }
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
    const activeId = db.activeTenantId || "org-adapundi";
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
    orgId || partner.organizationId || db.activeTenantId || "org-adapundi";
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
app.use("/uploads", express.static(uploadsDir));
function saveLocalFile(
  partnerName: any,
  category: string,
  safeFileName: string,
  base64Data: string,
  orgName?: string,
) {
  try {
    const cleanOrg = (orgName || "PT Info Tekno Siaga")
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
  const defaultTenant =
    (db.tenants || []).find((t) => t.isDefault) || db.tenants?.[0];
  const isDefaultTarget =
    targetTenantId === "org-adapundi" ||
    (defaultTenant && targetTenantId === defaultTenant.id);
  const isDefaultEntity =
    !entityOrgId ||
    entityOrgId === "org-adapundi" ||
    (defaultTenant && entityOrgId === defaultTenant.id);
  return Boolean(isDefaultTarget && isDefaultEntity);
}
function getRequestTenantId(req: express.Request): string {
  const actor = (req as any).actor;
  if (actor?.role !== "superuser" && actor?.tenantId) return actor.tenantId;
  return String(
    req.headers["x-organization-id"] ||
    req.headers["x-tenant-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi"
  );
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
      "org-adapundi";
    const tenant =
      (db.tenants || DEFAULT_TENANTS).find((t) => t.id === orgId) ||
      DEFAULT_TENANTS[0];
    const cleanOrg = (tenant?.name || "PT Info Tekno Siaga")
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
  appName: "LMS - Legal Management System",
  logoUrl:
    "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=250&auto=format&fit=crop&q=80",
  primaryColor: "#06C755",
  footerText: "\xA9 2026 PT Info Tekno Siaga (Adapundi). All rights reserved.",
  loginHeadline: "Portal Manajemen Kontrak, Vendor & Insertion Order",
};
const DEFAULT_TENANTS = [
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
    driveFolderLink:
      "https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY",
  },
];
let db: any = {
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
    lastSyncTime: new Date().toISOString(),
    autoSync: true,
    isLocked: true,
    notificationEmails:
      "legal.head@perusahaan.co.id, finance.team@perusahaan.co.id",
    legalNotificationEmail: "legal.head@perusahaan.co.id",
    financeNotificationEmail: "finance.team@perusahaan.co.id",
    aiModel: "gemini-3.8-flash",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    refreshToken: "",
  },
};
setInvalidTokenCallback((badToken) => {
  if (db.googleConfig && db.googleConfig.accessToken === badToken) {
    console.warn(
      "[Server] Membersihkan Google accessToken yang kedaluwarsa dari database.",
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
const STANDARD_DD_DOCUMENTS = [
  { nama: "NDA", wajib: true, status: "Belum" },
  { nama: "COR", wajib: false, status: "Belum" },
  { nama: "DGT", wajib: false, status: "Belum" },
  { nama: "Termination notice", wajib: false, status: "Belum" },
  { nama: "Vendor assessment form", wajib: false, status: "Belum" },
  { nama: "Placement Documentation", wajib: false, status: "Belum" },
  { nama: "NIB/SIUP", wajib: false, status: "Belum" },
  { nama: "Business license", wajib: false, status: "Belum" },
  { nama: "NPWP", wajib: false, status: "Belum" },
  { nama: "Akta Pendirian", wajib: false, status: "Belum" },
];
function normalizePartnerDDDocs(docs) {
  const existingDocs = (docs || []).filter(
    (d) =>
      !d.nama.toLowerCase().includes("invoice") &&
      !d.nama.toLowerCase().includes("billing"),
  );
  return STANDARD_DD_DOCUMENTS.map((def) => {
    const isNDA = def.nama.toLowerCase() === "nda";
    const matched = existingDocs.find(
      (d) =>
        d.nama.toLowerCase() === def.nama.toLowerCase() ||
        (def.nama === "COR" && d.nama.includes("COR")) ||
        (def.nama === "DGT" && d.nama.includes("DGT")) ||
        (def.nama === "NIB/SIUP" &&
          (d.nama.includes("NIB") || d.nama.includes("SIUP"))) ||
        (def.nama === "NPWP" && d.nama.includes("NPWP")) ||
        (def.nama === "Akta Pendirian" && d.nama.includes("Akta")),
    );
    if (matched) {
      let files = matched.files || [];
      if (files.length === 0 && matched.linkDrive) {
        files = [
          {
            id: "legacy_" + Math.random().toString(36).substring(2, 9),
            fileName: `${matched.nama}.pdf`,
            linkDrive: matched.linkDrive,
            uploadedAt: matched.uploadedAt || new Date().toISOString(),
            tanggalKadaluarsa: matched.tanggalKadaluarsa,
            year: matched.uploadedAt
              ? new Date(matched.uploadedAt).getFullYear().toString()
              : new Date().getFullYear().toString(),
          },
        ];
      }
      return { ...matched, nama: def.nama, wajib: isNDA ? true : false, files };
    }
    return { ...def, wajib: isNDA ? true : false, files: [] };
  });
}
if (fs.existsSync(dataFilePath)) {
  try {
    const raw = fs.readFileSync(dataFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    db = { ...db, ...parsed };
    if (Array.isArray(db.partners)) {
      db.partners.forEach((p) => {
        if (!p.organizationId) p.organizationId = "org-adapundi";
        p.daftar_dokumen_dd = normalizePartnerDDDocs(p.daftar_dokumen_dd);
        const wajibItems = p.daftar_dokumen_dd.filter((d) => d.wajib);
        const adaWajib = wajibItems.filter((d) => d.status === "Ada");
        if (wajibItems.length > 0) {
          p.status_dd =
            adaWajib.length === wajibItems.length ? "Lengkap" : "Belum Lengkap";
        }
      });
    }
    const defaultTenant =
      (db.tenants || []).find((t) => t.isDefault) || db.tenants?.[0];
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
      (t) => t.id === "org-adapundi" || t.isDefault,
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
      "Database loaded successfully from data_store.json with multi-tenant partitioning.",
    );
  } catch (err) {
    console.error("Error reading data_store.json, using seed defaults", err);
  }
} else {
  const defaultOrg = db.tenants?.find(
    (t) => t.id === "org-adapundi" || t.isDefault,
  );
  if (defaultOrg) {
    defaultOrg.spreadsheetId = db.googleConfig.spreadsheetId;
    defaultOrg.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${db.googleConfig.spreadsheetId}/edit`;
    defaultOrg.driveFolderId = db.googleConfig.driveFolderId;
    defaultOrg.driveFolderLink = `https://drive.google.com/drive/folders/${db.googleConfig.driveFolderId}`;
  }
  saveDb();
}
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
    tags: sanitizePartnerTags(p.tags),
  }));
  saveDb();
}
function saveDb() {
  try {
    const tempPath = `${dataFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tempPath, dataFilePath);
  } catch (err) {
    console.error("Failed to save db to disk", err);
  }
}
function triggerAutoPushToGoogleSheet(_req?: any, _options?: any): Promise<void> {
  return Promise.resolve();
}
function syncAdderNames() {
  db.allowedUsers.forEach((u) => {
    if (
      u.name &&
      (u.name.includes("Adhitia") || u.name.includes("Super Admin"))
    ) {
      u.name = "Admin";
    }
  });
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
          currentAddedBy === creatorName ||
          (creatorEmail === "adhitcl@gmail.com" &&
            (currentAddedBy.includes("adhitia") ||
              currentAddedBy.includes("adhit")))
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
function recalculateStatuses() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let newNotifsCount = 0;
  db.contracts = db.contracts.map((contract) => {
    if (contract.status === "Terminated") {
      return contract;
    }
    if (
      contract.auto_renewal &&
      contract.tanggal_mulai &&
      contract.tanggal_berakhir
    ) {
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
    if (
      sisaHari === 90 ||
      sisaHari === 60 ||
      sisaHari === 30 ||
      sisaHari === 14
    ) {
      const notifJenis = `Reminder H-${sisaHari}`;
      const existingNotif = db.notifications.find(
        (n) =>
          n.parent_id === contract.contract_id &&
          n.jenis_notifikasi === notifJenis,
      );
      if (!existingNotif) {
        const legalEmails =
          db.googleConfig.legalNotificationEmail ||
          db.googleConfig.notificationEmails ||
          "legal.head@perusahaan.co.id";
        const notif = {
          notif_id: `notif-ctr-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
          parent_type: "Contract",
          parent_id: contract.contract_id,
          parent_nomor: contract.nomor_kontrak,
          parent_judul: contract.judul_kontrak,
          jenis_notifikasi: notifJenis,
          tanggal_terkirim: new Date().toISOString(),
          status_terkirim: true,
          penerima: `${contract.pic_internal}, ${legalEmails}`,
          pesan: `REMINDER: Kontrak ${contract.nomor_kontrak} (${contract.judul_kontrak}) sisa masa berlaku ${sisaHari} hari. Perlukan Notice of ${contract.notice_type_required}.`,
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
          const validRecipients = notif.penerima
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.includes("@"));
          if (validRecipients.length > 0) {
            sendSmtpEmail({
              to: validRecipients,
              subject: emailSubject,
              html: emailHtml,
            });
          }
        }
      }
    }
    return {
      ...contract,
      status,
      sisa_hari: sisaHari,
      updated_at: contract.updated_at || new Date().toISOString(),
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
    if (
      sisaHari === 90 ||
      sisaHari === 60 ||
      sisaHari === 30 ||
      sisaHari === 14
    ) {
      const notifJenis = `Reminder H-${sisaHari}`;
      const existingNotif = db.notifications.find(
        (n) => n.parent_id === io.io_id && n.jenis_notifikasi === notifJenis,
      );
      if (!existingNotif) {
        const financeEmails =
          db.googleConfig.financeNotificationEmail ||
          db.googleConfig.notificationEmails ||
          "finance.team@perusahaan.co.id";
        const notif = {
          notif_id: `notif-io-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
          parent_type: "IO",
          parent_id: io.io_id,
          parent_nomor: io.nomor_io,
          parent_judul: io.judul_io,
          jenis_notifikasi: notifJenis,
          tanggal_terkirim: new Date().toISOString(),
          status_terkirim: true,
          penerima: `PIC Marketing / BizDev, ${financeEmails}`,
          pesan: `REMINDER: Insertion Order ${io.nomor_io} (${io.judul_io}) sisa masa berlaku ${sisaHari} hari. Cek deliverable & penagihan.`,
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
          const validRecipients = notif.penerima
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.includes("@"));
          if (validRecipients.length > 0) {
            sendSmtpEmail({
              to: validRecipients,
              subject: emailSubject,
              html: emailHtml,
            });
          }
        }
      }
    }
    return {
      ...io,
      status,
      sisa_hari: sisaHari,
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
      department: "Commercial & Marketing",
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
  } catch (err) {}
  allowed.lastLoginAt = new Date().toISOString();
  saveDb();
  res.json({
    email: allowed.email,
    name: allowed.name,
    role: allowed.role,
    department: allowed.department || "Commercial & Marketing",
    loginTime: new Date().toISOString(),
  });
});
app.get("/api/departments", async (req: express.Request, res: express.Response) => {
  try {
    let tenantId =
      req.headers["x-tenant-id"] ||
      req.headers["x-organization-id"] ||
      req.query.tenantId;
    if (!tenantId || tenantId === "org-adapundi") {
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
    if (!tenantId || tenantId === "org-adapundi") {
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
async function checkIsAdmin(req: express.Request, fallbackEmail?: string, fallbackName?: string) {
  const session = await getBetterAuthSession(req);
  const email = (
    session?.user?.email ||
    fallbackEmail ||
    req.headers["x-user-email"] ||
    req.headers["x-google-user-email"] ||
    req.body?.adminEmail ||
    req.query?.adminEmail ||
    ""
  )
    .toLowerCase()
    .trim();

  const name =
    session?.user?.name ||
    fallbackName ||
    req.headers["x-user-name"] ||
    req.body?.adminName ||
    req.query?.adminName ||
    "User";

  // SECURE FIX: Unauthenticated requests without email MUST NOT gain admin access
  if (!email) {
    return {
      isAdmin: false,
      adminEmail: "",
      adminName: "",
    };
  }

  // Check if user is banned in SQLite user table
  try {
    const userRow: any = sqliteDb
      .prepare("SELECT id, role, banned FROM user WHERE LOWER(email) = LOWER(?)")
      .get(email);
    if (userRow) {
      if (userRow.banned === 1) {
        return {
          isAdmin: false,
          adminEmail: email,
          adminName: name,
        };
      }
      const uRole = (userRow.role || "").toLowerCase();
      if (["admin", "superuser", "owner", "super admin"].includes(uRole)) {
        return {
          isAdmin: true,
          adminEmail: email,
          adminName: userRow.name || name,
        };
      }
    }
  } catch (_) {}

  // Check in db.allowedUsers
  const allowed = (db.allowedUsers || []).find(
    (u: any) => (u.email || "").toLowerCase() === email
  );
  if (allowed) {
    if (allowed.status === "Inactive" || allowed.status === "Banned") {
      return {
        isAdmin: false,
        adminEmail: email,
        adminName: name,
      };
    }
    const aRole = (allowed.role || "").toLowerCase();
    if (["admin", "superuser", "owner", "super admin"].includes(aRole)) {
      return {
        isAdmin: true,
        adminEmail: email,
        adminName: allowed.name || name,
      };
    }
  }

  // Check session role
  const sRole = (session?.user?.role || "").toLowerCase();
  if (["admin", "superuser", "owner", "super admin"].includes(sRole)) {
    return {
      isAdmin: true,
      adminEmail: email,
      adminName: session?.user?.name || name,
    };
  }

  // Primary superadmin default email
  if (email === "adhitcl@gmail.com") {
    return {
      isAdmin: true,
      adminEmail: email,
      adminName: allowed?.name || name || "Administrator",
    };
  }

  return {
    isAdmin: false,
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
app.post("/api/partners/parse", upload.single("file") as any, async (req: express.Request, res: express.Response) => {
  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(401)
      .json({
        error:
          "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio.",
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
        cached: true,
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
            badan_hukum: { type: Type.STRING },
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
      globalOcrCache.set(ocrStats.fileHash, "partners", responsePayload);
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
  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(401)
      .json({
        error:
          "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio.",
      });
  }
  try {
    const { nama_partner, badan_hukum, tags, model, pdfBase64 } = req.body;
    if (!nama_partner) {
      return res
        .status(400)
        .json({ error: "Nama Partner / Entitas wajib diisi." });
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
    userRole,
  } = req.body;
  if (!nama_partner) {
    return res.status(400).json({ error: "Nama Partner wajib diisi." });
  }
  const targetOrgId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.body.organizationId ||
    db.activeTenantId ||
    "org-adapundi";
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
  const defaultDD = STANDARD_DD_DOCUMENTS.map((d) => ({ ...d }));
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
    badan_hukum: badan_hukum === "BHA" ? "BHA" : "BHI",
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
    status_dd: "Belum Lengkap",
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
    `Menambahkan Partner baru: ${nama_partner} (${newPartner.badan_hukum})`,
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
    userRole,
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
      (d) => d.status === "Kadaluarsa",
    );
    if (adaKadaluarsa) {
      status_dd = "Kadaluarsa";
    } else if (wajibItems.length > 0) {
      status_dd =
        adaWajib.length === wajibItems.length ? "Lengkap" : "Belum Lengkap";
    } else {
      status_dd =
        adaTotal === totalItems && totalItems > 0 ? "Lengkap" : "Belum Lengkap";
    }
  }
  const updatedPartner = {
    ...existing,
    nama_partner: nama_partner || existing.nama_partner,
    codename: codename !== void 0 ? codename : existing.codename,
    badan_hukum:
      badan_hukum !== void 0
        ? badan_hukum === "BHA"
          ? "BHA"
          : "BHI"
        : existing.badan_hukum,
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
    daftar_dokumen_dd: daftar_dokumen_dd || existing.daftar_dokumen_dd,
    status_dd,
    tanggal_dd_diverifikasi:
      status_dd === "Lengkap"
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
  const targetOrgId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.body.organizationId ||
    db.activeTenantId ||
    "org-adapundi";
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
    const token = (
      req.headers["x-google-access-token"] ||
      db.googleConfig.accessToken ||
      ""
    ).toString();
    const spreadsheetId = db.googleConfig.spreadsheetId;
    if (!spreadsheetId) {
      return res.json({ USD: 1 });
    }
    const currencies = Array.from(
      new Set([
        ...(db.spendings || []).map((s) => s.currency || "IDR"),
        ...(db.contracts || []).map((c) => c.currency || "IDR"),
        ...(db.ios || []).map((i) => i.currency || "IDR"),
      ]),
    );
    const rates = await getExchangeRates(spreadsheetId, token, currencies);
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/exchange-rate-historical", async (req: express.Request, res: express.Response) => {
  try {
    const currency = String(req.query.currency || "IDR").toUpperCase();
    const date = String(req.query.date || "");
    if (currency === "USD") {
      return res.json({ currency: "USD", date, rate: 1, isFallback: false });
    }
    const token = (
      req.headers["x-google-access-token"] ||
      db.googleConfig.accessToken ||
      ""
    ).toString();
    const spreadsheetId = db.googleConfig.spreadsheetId;
    let rate = currency === "IDR" ? 62e-6 : 1;
    let isFallback = true;
    try {
      rate = await getHistoricalExchangeRate(
        spreadsheetId,
        token,
        currency,
        date,
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
      const cur = s.currency || "IDR";
      const usdVal =
        cur === "USD"
          ? amt
          : Math.round(amt * (cur === "IDR" ? 62e-6 : 1) * 100) / 100;
      return { ...s, total_amount_usd: usdVal };
    }
    return s;
  });
  res.json(list);
});
app.post("/api/spendings/parse", upload.single("file") as any, async (req: express.Request, res: express.Response) => {
  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(401)
      .json({
        error:
          "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio.",
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
        cached: true,
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
      globalOcrCache.set(ocrStats.fileHash, "spendings", responsePayload);
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
  const targetOrgId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.body.organizationId ||
    db.activeTenantId ||
    "org-adapundi";
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
    const cur = currency || "IDR";
    const amt = Number(total_amount) || 0;
    if (cur === "USD") {
      total_amount_usd = amt;
    } else {
      let rate = cur === "IDR" ? 62e-6 : 1;
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
    `Menambahkan Catatan Partner Spending untuk '${vendor_name}' (Invoice #${invoice_number}) senilai ${currency || "IDR"} ${Number(total_amount).toLocaleString("id-ID")}`,
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
    const cur = updates.currency || existing.currency || "IDR";
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
      let rate = cur === "IDR" ? 62e-6 : 1;
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
      return {
        ...doc,
        status: updatedFiles.length > 0 ? "Ada" : "Belum",
        nomorDokumen: nomorDokumen || doc.nomorDokumen || "",
        tanggalKadaluarsa: tanggalKadaluarsa || doc.tanggalKadaluarsa,
        linkDrive: driveLink || doc.linkDrive || "",
        uploadedAt: driveLink ? nowIso : doc.uploadedAt,
        files: updatedFiles,
      };
    }
    return doc;
  });
  const wajibItems = partner.daftar_dokumen_dd.filter((d) => d.wajib);
  const adaWajib = wajibItems.filter((d) => d.status === "Ada");
  if (wajibItems.length > 0 && adaWajib.length === wajibItems.length) {
    partner.status_dd = "Lengkap";
    partner.tanggal_dd_diverifikasi = new Date().toISOString().split("T")[0];
  } else {
    partner.status_dd = "Belum Lengkap";
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
  partner.daftar_dokumen_dd = partner.daftar_dokumen_dd.map((doc) => {
    if (doc.nama === docName) {
      const remainingFiles = (doc.files || []).filter((f) => f.id !== fileId);
      const hasFiles = remainingFiles.length > 0;
      return {
        ...doc,
        files: remainingFiles,
        status: hasFiles ? "Ada" : "Belum",
        linkDrive: hasFiles ? remainingFiles[0].linkDrive : void 0,
        uploadedAt: hasFiles ? remainingFiles[0].uploadedAt : void 0,
      };
    }
    return doc;
  });
  const wajibItems = partner.daftar_dokumen_dd.filter((d) => d.wajib);
  const adaWajib = wajibItems.filter((d) => d.status === "Ada");
  if (wajibItems.length > 0 && adaWajib.length === wajibItems.length) {
    partner.status_dd = "Lengkap";
    partner.tanggal_dd_diverifikasi = new Date().toISOString().split("T")[0];
  } else {
    partner.status_dd = "Belum Lengkap";
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
    const targetOrgId =
      req.headers["x-tenant-id"] ||
      req.headers["x-organization-id"] ||
      req.body.organizationId ||
      db.activeTenantId ||
      "org-adapundi";

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
    googleConfig: db.googleConfig,
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
    const cur = c.currency || "IDR";
    const amt = Number(c.nilai_kontrak) || 0;
    const usdVal =
      c.nilai_kontrak_usd !== void 0 && c.nilai_kontrak_usd !== null
        ? c.nilai_kontrak_usd
        : cur === "USD"
          ? amt
          : Math.round(amt * (cur === "IDR" ? 62e-6 : 1) * 100) / 100;
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
  if (!getEffectiveGeminiApiKey()) {
    return res
      .status(400)
      .json({
        error:
          "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
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
        cached: true,
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
      globalOcrCache.set(ocrStats.fileHash, "contracts", responsePayload);
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
  if (!contract) {
    return res.status(404).json({ error: "Kontrak tidak ditemukan." });
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
  if (!contract) {
    return res.status(404).json({ error: "Kontrak tidak ditemukan." });
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
  if (!getEffectiveGeminiApiKey()) {
    return res
      .status(400)
      .json({
        error:
          "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
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
${
  req.body.customClauseText
    ? `
Teks Tambahan / Draf Klausul Khusus:
${req.body.customClauseText}`
    : ""
}

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
app.get("/api/templates", (req, res) => {
  try {
    res.json(db.templates || []);
  } catch (err: any) {
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
    const nowIso = new Date().toISOString();

    if (!db.templates) {
      db.templates = [];
    }

    const existingIndex = db.templates.findIndex((t: any) => t.id === templateId);
    const templateData = {
      id: templateId,
      name,
      contentId,
      createdAt: existingIndex >= 0 ? db.templates[existingIndex].createdAt : nowIso,
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
  try {
    const { id } = req.params;
    if (!db.templates) {
      db.templates = [];
    }

    const index = db.templates.findIndex((t: any) => t.id === id);
    if (index >= 0) {
      db.templates.splice(index, 1);
      saveDb();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Template not found." });
    }
  } catch (err: any) {
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
      contents: prompt,
    });

    let translatedHtml = response.text || "";

    // Clean up any markdown code blocks if the model ignored instructions
    if (translatedHtml.includes("```html")) {
      translatedHtml = translatedHtml.split("```html")[1].split("```")[0];
    } else if (translatedHtml.includes("```")) {
      translatedHtml = translatedHtml.split("```")[1].split("```")[0];
    }

    res.json({ success: true, translatedHtml: translatedHtml.trim() });
  } catch (err: any) {
    console.error("Translation error:", err);
    res.status(500).json({ error: err?.message || "Gagal menerjemahkan template menggunakan AI." });
  }
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
  const existingContractDup = db.contracts.find(
    (c) =>
      c.nomor_kontrak.trim().toLowerCase() ===
      nomor_kontrak.trim().toLowerCase(),
  );
  if (existingContractDup) {
    return res
      .status(400)
      .json({
        error: `Nomor Kontrak '${nomor_kontrak}' sudah terdaftar dalam sistem.`,
      });
  }
  const targetOrgId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.body.organizationId ||
    db.activeTenantId ||
    "org-adapundi";
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId,
  );
  const partner = db.partners.find((p) => p.partner_id === partner_id);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let finalTanggalBerakhir = tanggal_berakhir;
  const isAutoRenew = Boolean(auto_renewal);
  if (
    isAutoRenew &&
    tanggal_mulai &&
    finalTanggalBerakhir &&
    status !== "Terminated"
  ) {
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
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24),
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
    auto_renewal: isAutoRenew,
    notice_period_hari: Number(notice_period_hari) || 30,
    notice_type_required: notice_type_required || "Termination",
    status: finalStatus,
    status_approval: status_approval || "Aktif",
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
    `Membuat Kontrak Baru '${nomor_kontrak}' (${judul_kontrak}) senilai Rp ${Number(nilai_kontrak).toLocaleString("id-ID")}`,
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
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (
    updated.auto_renewal &&
    updated.tanggal_mulai &&
    updated.tanggal_berakhir &&
    updated.status !== "Terminated"
  ) {
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
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24),
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
    const cur = io.currency || "IDR";
    const amt = Number(io.nilai_io) || 0;
    const usdVal =
      io.nilai_io_usd !== void 0 && io.nilai_io_usd !== null
        ? io.nilai_io_usd
        : cur === "USD"
          ? amt
          : Math.round(amt * (cur === "IDR" ? 62e-6 : 1) * 100) / 100;
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
  if (!getEffectiveGeminiApiKey()) {
    return res
      .status(400)
      .json({
        error:
          "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
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
        cached: true,
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
      globalOcrCache.set(ocrStats.fileHash, "ios", responsePayload);
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
  const existingIODup = db.ios.find(
    (i) => i.nomor_io.trim().toLowerCase() === nomor_io.trim().toLowerCase(),
  );
  if (existingIODup) {
    return res
      .status(400)
      .json({ error: `Nomor IO '${nomor_io}' sudah terdaftar dalam sistem.` });
  }
  const targetOrgId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.body.organizationId ||
    db.activeTenantId ||
    "org-adapundi";
  const targetTenant = (db.tenants || DEFAULT_TENANTS).find(
    (t) => t.id === targetOrgId,
  );
  const partner = db.partners.find((p) => p.partner_id === partner_id);
  const contract = db.contracts.find((c) => c.contract_id === contract_id);
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body.accessToken,
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(tanggal_berakhir);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24),
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
    `Membuat Insertion Order Baru '${nomor_io}' (${judul_io}) senilai Rp ${Number(nilai_io).toLocaleString("id-ID")}`,
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
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
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
        i.nomor_io.trim().toLowerCase() ===
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(updated.tanggal_berakhir);
  end.setHours(0, 0, 0, 0);
  updated.sisa_hari = Math.ceil(
    (end.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24),
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

      // 1. Sync to db.allowedUsers
      let allowedUser = (db.allowedUsers || []).find((u: any) => (u.email || "").toLowerCase() === cleanEmail);
      if (!allowedUser) {
        const isFirstUser = !db.allowedUsers || db.allowedUsers.length === 0;
        allowedUser = {
          id: `user_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          email: cleanEmail,
          name: userName,
          role: isFirstUser ? "Admin" : "Staff",
          department: "Commercial & Marketing",
          status: "Active",
          addedBy: "Google Auth (Firebase: safeforwork-47.firebaseapp.com)",
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
          sqliteDb.prepare(`
            UPDATE user SET name = COALESCE(?, name), image = COALESCE(?, image), updatedAt = ?
            WHERE id = ?
          `).run(userName, photoURL || null, now, userId);
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
        const orgId = allowedUser.organizationId || 'org_1789542306289_b3a4f3';
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
      const orgId = allowedUser.organizationId || 'org_1789542306289_b3a4f3';

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
          description: "Login berhasil menggunakan Google Sign-In (safeforwork-47.firebaseapp.com)",
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
        config: db.googleConfig,
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
  const isAdmin = adminCheck.isAdmin;
  if (!isAdmin) {
    const { smtpPassword, geminiApiKey, refreshToken, ...safeConfig } =
      db.googleConfig;
    return res.json({
      ...safeConfig,
      geminiApiKey: geminiApiKey ? "********" : "",
    });
  }
  res.json(db.googleConfig);
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
  const effectiveApiKey =
    geminiApiKey !== void 0
      ? String(geminiApiKey).trim()
      : db.googleConfig.geminiApiKey || "";
  if (geminiApiKey !== void 0) {
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
      smtpPassword !== void 0 ? smtpPassword : db.googleConfig.smtpPassword,
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
      (t) => t.id === "org-adapundi" || t.isDefault,
    );
    if (defaultOrg) {
      defaultOrg.spreadsheetId = db.googleConfig.spreadsheetId;
      defaultOrg.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${db.googleConfig.spreadsheetId}/edit`;
      try {
        const orgsDb = new Database(path.join(process.cwd(), "auth.db"));
        if (orgsDb) {
          const row: any = orgsDb
            .prepare("SELECT * FROM organization WHERE id = ? OR slug = ?")
            .get("org-adapundi", "adapundi");
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
              .run(JSON.stringify(meta), "org-adapundi", "adapundi");
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
    config: db.googleConfig,
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
    smtpPassword !== void 0 ? smtpPassword : db.googleConfig.smtpPassword || "";
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
            <p style="margin: 4px 0;"><strong>Waktu Pengujian:</strong> ${new Date().toLocaleString("id-ID")}</p>
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
  const keyToTest = (apiKey || getEffectiveGeminiApiKey()).trim();
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
    config: db.googleConfig,
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
app.post("/api/admin/reset-database", async (req: express.Request, res: express.Response) => {
  const { userEmail, userName, userRole, accessToken, confirmKeyword } =
    req.body;
  if (confirmKeyword !== "RESET NOW") {
    return res
      .status(400)
      .json({
        error:
          'Konfirmasi tidak valid. Harap ketik "RESET NOW" untuk mereset database.',
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
  db.googleConfig.notificationEmails =
    "legal.head@perusahaan.co.id, finance.team@perusahaan.co.id";
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
    driveFolderLink:
      "https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY",
  });
  try {
    if (sqliteDb) {
      sqliteDb.prepare("DELETE FROM invitation").run();
      sqliteDb.prepare("DELETE FROM apikey").run();
      sqliteDb.prepare("DELETE FROM teamMember").run();
      sqliteDb.prepare("DELETE FROM team").run();
      sqliteDb.prepare("DELETE FROM organization").run();
      sqliteDb
        .prepare(
          `
        INSERT INTO organization (id, name, slug, logo, createdAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          defaultOrgId,
          defaultOrgName,
          defaultOrgSlug,
          defaultOrgLogo,
          new Date().toISOString(),
          defaultMetadata,
        );
      sqliteDb.prepare("DELETE FROM team").run();
      db.departments = [];
      sqliteDb.prepare("DELETE FROM member").run();
      const existingUsers = (sqliteDb
        .prepare("SELECT id, name, email, role FROM user")
        .all() || []) as any[];
      for (const u of existingUsers) {
        const memberRole = u.role === "superuser" ? "admin" : u.role || "admin";
        sqliteDb
          .prepare(
            `
          INSERT INTO member (id, organizationId, userId, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `,
          )
          .run(
            `mem_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
            defaultOrgId,
            u.id,
            memberRole,
            new Date().toISOString(),
          );
        sqliteDb
          .prepare(
            `
          INSERT INTO teamMember (id, teamId, userId, createdAt)
          VALUES (?, ?, ?, ?)
        `,
          )
          .run(
            `tm_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
            "team-legal",
            u.id,
            new Date().toISOString(),
          );
      }
      const allTeams = (sqliteDb.prepare("SELECT id FROM team").all() || []) as any[];
      for (const tm of allTeams) {
        const count =
          (sqliteDb
            .prepare(
              "SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?",
            )
            .get(tm.id) as any)?.count || 0;
        sqliteDb
          .prepare(
            "UPDATE team SET memberCount = ?, updatedAt = ? WHERE id = ?",
          )
          .run(count, new Date().toISOString(), tm.id);
      }
      sqliteDb
        .prepare(
          "UPDATE session SET activeOrganizationId = ?, activeTeamId = ?",
        )
        .run(defaultOrgId, "team-legal");
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.tenants = [defaultTenant];
  db.activeTenantId = defaultTenant.id;
  const activeUserEmail = (userEmail || "adhitcl@gmail.com").toLowerCase();
  const activeUserName = userName || "Aditya Pratama";
  const existingUser = db.allowedUsers.find(
    (u) => u.email.toLowerCase() === activeUserEmail,
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
      createdAt: existingUser?.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  ];
  if (fs.existsSync(uploadsDir)) {
    try {
      const items = fs.readdirSync(uploadsDir);
      for (const item of items) {
        const itemPath = path.join(uploadsDir, item);
        if (fs.lstatSync(itemPath).isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
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
    req,
  );
  res.json({
    success: true,
    message:
      "Seluruh pengaturan sistem (Manage Admin Access, Organisasi, Departemen, AI, Notifikasi, Storage & Database) dan seluruh data transaksi berhasil direset ke kondisi awal kosong. Akun pengguna terdaftar tetap dipertahankan.",
    defaultOrgId,
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
        (p) => p.nama_partner?.toLowerCase() === name.toLowerCase(),
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
          badan_hukum: row.badan_hukum === "BHA" ? "BHA" : "BHI",
          status_dd: "Belum Lengkap",
          catatan: row.catatan || "",
          tags: sanitizePartnerTags(row.tags),
          daftar_dokumen_dd: normalizePartnerDDDocs([]),
          created_at: now,
          updated_at: now,
        };
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
        (c) => c.nomor_kontrak?.toLowerCase() === nomor.toLowerCase(),
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
        (p) => p.nama_partner?.toLowerCase() === partnerNama.toLowerCase(),
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
        (p) => p.nama_partner?.toLowerCase() === partnerNama.toLowerCase(),
      );
      const contractNomor = (row.contract_nomor || "").trim();
      const contract = db.contracts.find(
        (c) => c.nomor_kontrak?.toLowerCase() === contractNomor.toLowerCase(),
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
        (p) => p.nama_partner?.toLowerCase() === supplierName.toLowerCase(),
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
        (s) =>
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
        (p) => p.nama_partner?.toLowerCase() === vendorName.toLowerCase(),
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
          const tenantObj = {
            id: org.id,
            name: org.name,
            legalEntity: existing?.legalEntity || "PT",
            brandName: org.name,
            tagline:
              meta.tagline ||
              existing?.tagline ||
              "Legal & Commercial Contract Management",
            logoUrl: org.logo || existing?.logoUrl || "/favicon.png",
            primaryColor:
              meta.primaryColor || existing?.primaryColor || "#06C755",
            currency: meta.currency || existing?.currency || "IDR",
            domainSlug: org.slug,
            isDefault: org.slug === "adapundi" || Boolean(existing?.isDefault),
            spreadsheetId:
              existing?.spreadsheetId ||
              meta.spreadsheetId ||
              (org.slug === "adapundi" ||
              org.id === "org-adapundi" ||
              org.id === "org_1789542306289_b3a4f3"
                ? db.googleConfig?.spreadsheetId
                : void 0),
            spreadsheetUrl:
              existing?.spreadsheetUrl ||
              meta.spreadsheetUrl ||
              (existing?.spreadsheetId ||
              meta.spreadsheetId ||
              (org.slug === "adapundi" ||
              org.id === "org-adapundi" ||
              org.id === "org_1789542306289_b3a4f3"
                ? db.googleConfig?.spreadsheetId
                : void 0)
                ? `https://docs.google.com/spreadsheets/d/${existing?.spreadsheetId || meta.spreadsheetId || db.googleConfig?.spreadsheetId}/edit`
                : void 0),
            driveFolderId:
              existing?.driveFolderId ||
              meta.driveFolderId ||
              (org.slug === "adapundi" ||
              org.id === "org-adapundi" ||
              org.id === "org_1789542306289_b3a4f3"
                ? db.googleConfig?.driveFolderId
                : void 0),
            driveFolderLink:
              existing?.driveFolderLink ||
              meta.driveFolderLink ||
              (existing?.driveFolderId ||
              meta.driveFolderId ||
              (org.slug === "adapundi" ||
              org.id === "org-adapundi" ||
              org.id === "org_1789542306289_b3a4f3"
                ? db.googleConfig?.driveFolderId
                : void 0)
                ? `https://drive.google.com/drive/folders/${existing?.driveFolderId || meta.driveFolderId || db.googleConfig?.driveFolderId}`
                : void 0),
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
    db.activeTenantId = db.tenants[0]?.id || "org_1789542306289_b3a4f3";
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
  const newTenant = {
    id: `tenant-${Date.now()}`,
    name: tenantData.name,
    legalEntity: tenantData.legalEntity || "PT",
    brandName: tenantData.brandName || tenantData.name,
    tagline: tenantData.tagline || "",
    logoUrl: tenantData.logoUrl || "/favicon.png",
    primaryColor: tenantData.primaryColor || "#06C755",
    currency: tenantData.currency || "IDR",
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
  db.tenants[index] = {
    ...db.tenants[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  saveDb();
  return res.json({ success: true, tenants: db.tenants });
});
app.delete("/api/tenants/:id", requirePermission("tenant.delete", "global"), (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!db.tenants) db.tenants = [...DEFAULT_TENANTS];
  const target = db.tenants.find((t) => t.id === id);
  if (target?.isDefault || target?.domainSlug === "adapundi") {
    return res.status(400).json({ error: "Default tenant cannot be deleted." });
  }
  db.tenants = db.tenants.filter(
    (t) => t.id !== id && t.domainSlug !== target?.domainSlug,
  );
  if (db.activeTenantId === id) {
    db.activeTenantId = db.tenants[0]?.id || "tenant-adapundi";
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
app.post("/api/chat", async (req: express.Request, res: express.Response) => {
  try {
    const { query, history } = req.body;
    if (!query && (!history || history.length === 0)) {
      return res.status(400).json({ error: "Query is required" });
    }
    const ai = getGenAIClient();
    const dbContext = {
      partners: (db.partners || []).map((p: any) => ({
        partner_id: p.partner_id || p.id,
        nama_partner: p.nama_partner,
        codename_channel:
          p.codename || p.partner_channel || p.media_network || "",
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
        daftar_dokumen_dd: Array.isArray(p.daftar_dokumen_dd)
          ? p.daftar_dokumen_dd.map((d: any) => ({
              nama: d.nama,
              status: d.status,
              wajib: d.wajib,
              nomorDokumen: d.nomorDokumen || "",
              tanggalKadaluarsa: d.tanggalKadaluarsa || "",
            }))
          : [],
      })),
      contracts: (db.contracts || []).map((c: any) => ({
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
        internal_notes_kontrak:
          c.internal_notes || c.notes || c.catatan || c.ringkasan_kontrak || "",
        ringkasan_perubahan: c.ringkasan_perubahan || "",
        field_yang_berubah: c.field_yang_berubah || [],
        sisa_hari: c.sisa_hari,
      })),
      ios: (db.ios || []).map((i: any) => {
        const endDateStr =
          i.tanggal_berakhir || i.tanggal_selesai || i.period_end || "";
        let sisaHari = i.sisa_hari;
        let computedStatus = i.status || "Aktif";
        if (endDateStr) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const endDate = new Date(endDateStr);
          if (!isNaN(endDate.getTime())) {
            endDate.setHours(0, 0, 0, 0);
            sisaHari = Math.ceil(
              (endDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24),
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
          notice_period_hari:
            i.notice_period_hari || i.notice_period_days || 14,
          notice_type_required: i.notice_type_required || "Termination",
          status: computedStatus,
          internal_notes_io: i.internal_notes || i.notes || i.catatan || "",
          sisa_hari: sisaHari,
        };
      }),
      spendings_and_invoices: (db.spendings || []).map((s: any) => ({
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
        internal_notes_invoice:
          s.internal_notes ||
          s.notes ||
          s.catatan ||
          s.invoice_description ||
          "",
        payment_status: s.payment_status || "Paid",
        bank_info: [
          s.bank_name,
          s.bank_account_number,
          s.bank_account_holder_name,
        ]
          .filter(Boolean)
          .join(" - "),
      })),
      evaluations: (db.evaluations || []).map((e: any) => ({
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
        evaluator_name: e.evaluator_name || "",
      })),
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
