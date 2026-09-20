var __defProp = Object.defineProperty;
var __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });
import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
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
  syncToGoogleSheet,
  pullFromGoogleSheet,
  getExchangeRates,
  getHistoricalExchangeRate,
} from "./src/lib/googleSheetsSync";
import { googleSheetsQueue } from "./src/lib/googleSheetsQueue";
import {
  createDriveFolder,
  createNewDriveFolderInParent,
  getOrCreateDriveFolder,
  uploadFileToDrive,
  extractFolderIdFromLink,
  setInvalidTokenCallback,
  setRefreshTokenGetter,
  createSpreadsheetInFolder,
} from "./src/lib/googleDriveSync";
import {
  loadServiceAccountCredentials,
  getGoogleSheetsClient,
} from "./src/lib/googleServiceAccountAuth";
import { buildCheapOcrContents } from "./src/lib/cheapOcrPipeline";
const app = express();
const PORT = 3e3;
app.all(["/api/auth", "/api/auth/*"], (req, res, next) => {
  if (req.path.startsWith("/api/auth/google")) {
    return next();
  }
  return toNodeHandler(betterAuthInstance)(req, res);
});
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
async function getOrgFolderId(tenantInput, token) {
  const masterRootId = db.googleConfig?.driveFolderId;
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
__name(getOrgFolderId, "getOrgFolderId");
async function autoEnsureTenantGoogleResources(token, forceNew = false) {
  const masterRootId = db.googleConfig?.driveFolderId;
  if (!masterRootId) return { success: false, updatedCount: 0 };
  const activeToken = await resolveActiveGoogleToken(token);
  if (!activeToken && !loadServiceAccountCredentials())
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
          const row = orgsDb
            .prepare("SELECT * FROM organization WHERE id = ? OR slug = ?")
            .get(tenant.id, tenant.domainSlug || tenant.id);
          if (row) {
            let meta = {};
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
__name(autoEnsureTenantGoogleResources, "autoEnsureTenantGoogleResources");
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
  if (activeToken || loadServiceAccountCredentials()) {
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
__name(getPartnerFolderId, "getPartnerFolderId");
async function getPartnerCategoryFolderId(partner, category, token, orgId) {
  const vendorFolderId = await getPartnerFolderId(partner, token, orgId);
  if (!vendorFolderId) return db.googleConfig.driveFolderId;
  const activeToken = await resolveActiveGoogleToken(token);
  if (!activeToken && !loadServiceAccountCredentials()) return vendorFolderId;
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
__name(getPartnerCategoryFolderId, "getPartnerCategoryFolderId");
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
function saveLocalFile(
  partnerName,
  category,
  safeFileName,
  base64Data,
  orgName,
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
__name(saveLocalFile, "saveLocalFile");
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
__name(deleteLocalFileFromUrl, "deleteLocalFileFromUrl");
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
__name(getMimeType, "getMimeType");
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
__name(migrateLocalFilesToGoogleDrive, "migrateLocalFilesToGoogleDrive");
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
__name(isMatchingOrg, "isMatchingOrg");
async function ensureAllPartnersFolders(token, targetTenantId) {
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
    if (activeToken || loadServiceAccountCredentials()) {
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
__name(ensureAllPartnersFolders, "ensureAllPartnersFolders");
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
let db = {
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
    aiModel: "gemini-3.6-flash",
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
__name(getFreshGoogleAccessToken, "getFreshGoogleAccessToken");
setRefreshTokenGetter(async () => {
  return await getFreshGoogleAccessToken();
});
googleSheetsQueue.setFreshTokenGetter(async () => {
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
__name(resolveActiveGoogleToken, "resolveActiveGoogleToken");
function getEffectiveGeminiApiKey() {
  return (
    db.googleConfig?.geminiApiKey ||
    process.env.GEMINI_API_KEY ||
    ""
  ).trim();
}
__name(getEffectiveGeminiApiKey, "getEffectiveGeminiApiKey");
function getGenAIClient(apiKey) {
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
__name(getGenAIClient, "getGenAIClient");
function getValidAiModel(requestedModel) {
  const allowed = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.1-pro-preview",
  ];
  if (requestedModel && allowed.includes(requestedModel)) {
    return requestedModel;
  }
  if (db.googleConfig?.aiModel && allowed.includes(db.googleConfig.aiModel)) {
    return db.googleConfig.aiModel;
  }
  return "gemini-3.6-flash";
}
__name(getValidAiModel, "getValidAiModel");
async function generateContentWithRetryAndFallback(params) {
  const apiKey = getEffectiveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
    );
  }
  const aiClient = getGenAIClient(apiKey);
  const primaryModel = params.model;
  const fallbackModels = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
  ].filter((m) => m !== primaryModel);
  const modelQueue = [primaryModel, ...fallbackModels];
  let lastError = null;
  const PER_ATTEMPT_TIMEOUT_MS = 3e4;
  for (const model of modelQueue) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(
          `[Gemini API] Attempting model=${model} attempt=${attempt + 1}...`,
        );
        const response = await Promise.race([
          aiClient.models.generateContent({ ...params, model }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Timeout: model ${model} took longer than ${PER_ATTEMPT_TIMEOUT_MS / 1e3}s`,
                  ),
                ),
              PER_ATTEMPT_TIMEOUT_MS,
            ),
          ),
        ]);
        console.log(`[Gemini API] Success with model=${model}`);
        return response;
      } catch (err) {
        lastError = err;
        const errMsg = (err?.message || err?.toString() || "").toLowerCase();
        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("high demand") ||
          errMsg.includes("429") ||
          errMsg.includes("resource_exhausted") ||
          errMsg.includes("quota") ||
          errMsg.includes("overloaded") ||
          errMsg.includes("timeout");
        console.warn(
          `[Gemini API] Call failed on model ${model} (attempt ${attempt + 1}):`,
          err?.message || err,
        );
        if (isTransient) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1e3 * (attempt + 1)),
          );
        } else {
          break;
        }
      }
    }
  }
  throw (
    lastError ||
    new Error(
      "Google AI Gemini model is temporarily busy. Please try again in a few moments.",
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
__name(normalizeParsedDate, "normalizeParsedDate");
function computeContractEndDateFromDuration(
  startDateYMD,
  durationOrClause,
  autoRenewNextYear,
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
__name(normalizePartnerDDDocs, "normalizePartnerDDDocs");
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
__name(generateNextPartnerId, "generateNextPartnerId");
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
__name(generateNextContractId, "generateNextContractId");
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
__name(generateNextIOId, "generateNextIOId");
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
__name(generateNextSpendingId, "generateNextSpendingId");
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
__name(sanitizePartnerTags, "sanitizePartnerTags");
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
__name(saveDb, "saveDb");
function triggerAutoPushToGoogleSheet(_req, _options) {
  return;
}
__name(triggerAutoPushToGoogleSheet, "triggerAutoPushToGoogleSheet");
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
__name(syncAdderNames, "syncAdderNames");
syncAdderNames();
saveDb();
async function sendSmtpEmail({ to, subject, html, text }) {
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
__name(sendSmtpEmail, "sendSmtpEmail");
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
__name(recalculateStatuses, "recalculateStatuses");
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
__name(addActivityLog, "addActivityLog");
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
      const sessionRow = authDb
        .prepare("SELECT * FROM session WHERE token = ? OR token LIKE ?")
        .get(token, `${token}%`);
      if (sessionRow && new Date(sessionRow.expiresAt) > new Date()) {
        const userRow = authDb
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
__name(getBetterAuthSession, "getBetterAuthSession");
async function getClerkUserEmail(req) {
  try {
    const session = await getBetterAuthSession(req);
    return session?.user?.email?.toLowerCase() || null;
  } catch (err) {
    console.error("Failed to get user email:", err);
    return null;
  }
}
__name(getClerkUserEmail, "getClerkUserEmail");
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
    const userRow = sqliteDb
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
      const teamRow = sqliteDb
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
app.get("/api/departments", async (req, res) => {
  try {
    let tenantId =
      req.headers["x-tenant-id"] ||
      req.headers["x-organization-id"] ||
      req.query.tenantId;
    if (!tenantId || tenantId === "org-adapundi") {
      const email = await getClerkUserEmail(req);
      if (email) {
        const user = sqliteDb
          .prepare("SELECT id FROM user WHERE email = ?")
          .get(email);
        if (user) {
          const session = sqliteDb
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
      const firstOrg = sqliteDb
        .prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1")
        .get();
      tenantId = db.activeTenantId || firstOrg?.id || "org-1";
    }
    let teams = sqliteDb
      .prepare(
        "SELECT name FROM team WHERE organizationId = ? ORDER BY createdAt ASC",
      )
      .all(tenantId);
    if (teams.length === 0) {
      const firstOrg = sqliteDb
        .prepare("SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1")
        .get();
      if (firstOrg && firstOrg.id !== tenantId) {
        teams = sqliteDb
          .prepare(
            "SELECT name FROM team WHERE organizationId = ? ORDER BY createdAt ASC",
          )
          .all(firstOrg.id);
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
async function checkIsAdmin(req, fallbackEmail, fallbackName) {
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
    "Admin";
  const defaultAdmin = db.allowedUsers.find((u) => {
    const r = u.role?.toLowerCase();
    return (
      r === "superuser" || r === "admin" || r === "super admin" || r === "owner"
    );
  });
  if (!email) {
    if (defaultAdmin) {
      return {
        isAdmin: true,
        adminEmail: defaultAdmin.email,
        adminName: defaultAdmin.name || name,
      };
    }
    return {
      isAdmin: true,
      adminEmail: "adhitcl@gmail.com",
      adminName: "Admin",
    };
  }
  const allowed = db.allowedUsers.find((u) => u.email.toLowerCase() === email);
  const sRole = session?.user?.role?.toLowerCase();
  const isSuperOrAdmin =
    sRole === "admin" || sRole === "superuser" || sRole === "owner";
  let isMemberAdmin = false;
  if (session?.user?.id) {
    try {
      const member = sqliteDb
        .prepare("SELECT role FROM member WHERE userId = ?")
        .get(session.user.id);
      if (
        member &&
        (member.role?.toLowerCase() === "admin" ||
          member.role?.toLowerCase() === "owner" ||
          member.role?.toLowerCase() === "superuser")
      ) {
        isMemberAdmin = true;
      }
    } catch (_) {}
  }
  try {
    const userRow = sqliteDb
      .prepare("SELECT id, role FROM user WHERE LOWER(email) = LOWER(?)")
      .get(email);
    if (userRow) {
      const uRole = userRow.role?.toLowerCase();
      if (uRole === "admin" || uRole === "superuser" || uRole === "owner") {
        isMemberAdmin = true;
      }
      const memRow = sqliteDb
        .prepare("SELECT role FROM member WHERE userId = ?")
        .get(userRow.id);
      if (memRow) {
        const mRole = memRow.role?.toLowerCase();
        if (mRole === "admin" || mRole === "owner" || mRole === "superuser") {
          isMemberAdmin = true;
        }
      }
    }
  } catch (_) {}
  const aRole = allowed?.role?.toLowerCase();
  const isAllowedAdmin =
    aRole === "admin" ||
    aRole === "superuser" ||
    aRole === "super admin" ||
    aRole === "owner";
  const isMatchedDefault =
    defaultAdmin && defaultAdmin.email.toLowerCase() === email;
  const isPrimaryEmail = email === "adhitcl@gmail.com";
  const isAdmin =
    isSuperOrAdmin ||
    isMemberAdmin ||
    isAllowedAdmin ||
    isMatchedDefault ||
    isPrimaryEmail ||
    (db.allowedUsers.length === 1 &&
      db.allowedUsers[0].email.toLowerCase() === email);
  return {
    isAdmin: Boolean(isAdmin),
    adminEmail: email,
    adminName: allowed?.name || name,
  };
}
__name(checkIsAdmin, "checkIsAdmin");
app.get("/api/user/allowed-users", (req, res) => {
  syncAdderNames();
  res.json(db.allowedUsers);
});
app.post("/api/user/allowed-users", async (req, res) => {
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
app.put("/api/user/allowed-users/:id", async (req, res) => {
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
app.delete("/api/user/allowed-users/:id", async (req, res) => {
  const { id } = req.params;
  const { adminEmail, adminName } = req.query;
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
app.post("/api/user/reset-password", async (req, res) => {
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
    let targetUser = authDb
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
      const existingAccount = authDb
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
app.get("/api/activity-logs", (req, res) => {
  res.json(db.activityLogs);
});
app.get("/api/partners", (req, res) => {
  const activeTenantId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi";
  const filterTenant = req.query.all !== "true";
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
app.post("/api/partners/parse", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(401)
      .json({
        error:
          "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio.",
      });
  }
  try {
    const { pdfBase64, model } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "PDF data is required" });
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
      pdfBase64,
      prompt,
    );
    console.log(
      `[PDF-Inspector Partner Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}`,
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
    const parsedData = JSON.parse(response.text);
    res.json({ success: true, data: parsedData });
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
app.post("/api/partners/generate-dd-notes", async (req, res) => {
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
    const notesText = (response.text || "").trim();
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
  if (token || loadServiceAccountCredentials()) {
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
__name(computeEvaluationScore, "computeEvaluationScore");
app.get("/api/partner-evaluations", (req, res) => {
  const activeTenantId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi";
  const filterTenant = req.query.all !== "true";
  const list = filterTenant
    ? (db.evaluations || []).filter((e) =>
        isMatchingOrg(e.organizationId, activeTenantId),
      )
    : db.evaluations || [];
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
    req,
  );
  res.json({ success: true });
});
app.get("/api/exchange-rates", async (req, res) => {
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
app.get("/api/exchange-rate-historical", async (req, res) => {
  try {
    const currency = (req.query.currency || "IDR").toUpperCase();
    const date = req.query.date || "";
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
app.get("/api/partner-spendings", (req, res) => {
  const activeTenantId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi";
  const filterTenant = req.query.all !== "true";
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
app.post("/api/spendings/parse", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(401)
      .json({
        error:
          "Missing GEMINI_API_KEY. Please add it via the Settings menu in AI Studio.",
      });
  }
  try {
    const { pdfBase64, model } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "PDF or Image data is required" });
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
      pdfBase64,
      prompt,
    );
    console.log(
      `[PDF-Inspector Spending Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}`,
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
    const parsedData = JSON.parse(response.text);
    if (parsedData.invoice_date) {
      parsedData.invoice_date = normalizeParsedDate(parsedData.invoice_date);
    }
    res.json({ success: true, data: parsedData });
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
    req,
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
app.get("/api/contracts", (req, res) => {
  const activeTenantId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi";
  const filterTenant = req.query.all !== "true";
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
app.post("/api/contracts/parse", async (req, res) => {
  if (!getEffectiveGeminiApiKey()) {
    return res
      .status(400)
      .json({
        error:
          "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
      });
  }
  try {
    const { pdfBase64, model } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "PDF data is required" });
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
      pdfBase64,
      prompt,
    );
    console.log(
      `[PDF-Inspector Contract Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}`,
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
    const parsedData = JSON.parse(response.text);
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
    res.json({
      success: true,
      data: parsedData,
      performance: { durationMs, ...ocrStats },
    });
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
    analyzed_at: contract.redline_analyzed_at || null,
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
    const parsed = JSON.parse(response.text);
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
app.put("/api/contracts/:id", async (req, res) => {
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
    req,
  );
  await triggerAutoPushToGoogleSheet(req);
  res.json({ success: true });
});
app.get("/api/ios", (req, res) => {
  const activeTenantId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi";
  const filterTenant = req.query.all !== "true";
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
app.post("/api/ios/parse", async (req, res) => {
  if (!getEffectiveGeminiApiKey()) {
    return res
      .status(400)
      .json({
        error:
          "Missing GEMINI_API_KEY. Silakan masukkan Gemini API Key di menu Pengaturan (Settings) > Model AI & Parser.",
      });
  }
  try {
    const { pdfBase64, model } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "PDF data is required" });
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
      pdfBase64,
      prompt,
    );
    console.log(
      `[PDF-Inspector IO Parser] Mode: ${ocrStats.mode.toUpperCase()} (${ocrStats.classification}), Inspected in ${ocrStats.inspectionMs}ms, Pages: ${ocrStats.originalPages} (${ocrStats.originalKb}KB) -> ${ocrStats.processedPages} (${ocrStats.optimizedKb}KB), DigitalText: ${ocrStats.hasDigitalText}`,
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
    const parsedData = JSON.parse(response.text);
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
    res.json({
      success: true,
      data: parsedData,
      performance: { durationMs, ...ocrStats },
    });
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
app.put("/api/ios/:id", async (req, res) => {
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
    req,
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
    db.notifications = db.notifications.map((n) =>
      n.notif_id === notif_id ? { ...n, is_read: true } : n,
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
      (n) => !notif_ids.includes(n.notif_id),
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
    const clientId =
      process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
    res.json({ clientId });
  },
);
app.post(
  ["/api/auth/google/exchange-code", "/api/google-auth/exchange-code"],
  async (req, res) => {
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
      let profile = { email: "Google User", name: "Pengguna Google" };
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
  async (req, res) => {
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
  async (req, res) => {
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
  ["/api/google-integration/connect", "/api/auth/google/connect"],
  async (req, res) => {
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
  async (req, res) => {
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
app.get("/api/google-integration", async (req, res) => {
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
app.post("/api/google-integration", async (req, res) => {
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
        : db.googleConfig.aiModel || "gemini-3.6-flash",
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
          const row = orgsDb
            .prepare("SELECT * FROM organization WHERE id = ? OR slug = ?")
            .get("org-adapundi", "adapundi");
          if (row) {
            let meta = {};
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
app.post("/api/smtp/test", async (req, res) => {
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
app.post("/api/ai/test-key", async (req, res) => {
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
      model ? getValidAiModel(model) : "gemini-3.6-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
    ];
    const uniqueModels = [...new Set(modelsToTry)];
    let lastErr = null;
    for (const targetModel of uniqueModels) {
      try {
        const response = await testClient.models.generateContent({
          model: targetModel,
          contents: "Say OK",
        });
        if (response && response.text) {
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
app.post("/api/google-integration/sync", async (req, res) => {
  const session = await getBetterAuthSession(req);
  const adminCheck = await checkIsAdmin(req);
  if (!session && !adminCheck.isAdmin) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Harap login terlebih dahulu." });
  }
  const { spreadsheetId, driveFolderId, accessToken, mode } = req.body;
  const tenantId =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    db.activeTenantId ||
    "org-adapundi";
  const isPullMode = mode === "fetch" || mode === "pull";
  const isAdmin = adminCheck.isAdmin;
  if (!isAdmin && !isPullMode) {
    return res
      .status(403)
      .json({
        error:
          "Forbidden: Hanya Admin yang dapat melakukan push/penulisan ke Google Sheet.",
      });
  }
  const token = await resolveActiveGoogleToken(
    accessToken || req.headers["x-google-access-token"],
  );
  const targetSheetId =
    spreadsheetId ||
    db.googleConfig.masterSpreadsheetId ||
    db.googleConfig.spreadsheetId;
  if (isAdmin) {
    if (spreadsheetId) {
      db.googleConfig.masterSpreadsheetId = spreadsheetId;
      db.googleConfig.masterSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      db.googleConfig.spreadsheetId = spreadsheetId;
    }
    if (driveFolderId) db.googleConfig.driveFolderId = driveFolderId;
    if (token) db.googleConfig.accessToken = token;
  }
  if (!targetSheetId) {
    return res.status(400).json({ error: "Spreadsheet ID wajib diisi." });
  }
  let hasServiceAccount = false;
  try {
    loadServiceAccountCredentials();
    hasServiceAccount = true;
  } catch (err) {
    hasServiceAccount = false;
  }
  if (!token && !hasServiceAccount) {
    return res
      .status(400)
      .json({
        error:
          "Access Token Google dibutuhkan untuk sinkronisasi. Silakan Login dengan Akun Google di Pengaturan terlebih dahulu.",
      });
  }
  try {
    if (mode === "push") {
      await syncToGoogleSheet(targetSheetId, token, db, tenantId);
      if (db.googleConfig?.masterSpreadsheetId)
        await import("./src/lib/googleSheetsSync")
          .then((s) => {
            const e = "default";
            return s[e] && typeof s[e] == "object" && "__esModule" in s[e]
              ? s[e]
              : s;
          })
          .then((m) =>
            m.syncMasterSystemSheet(
              db.googleConfig.masterSpreadsheetId,
              token,
              db,
            ),
          );
      db.googleConfig.isConnected = true;
      db.googleConfig.lastSyncTime = new Date().toISOString();
      saveDb();
      return res.json({
        success: true,
        message:
          "Data aplikasi berhasil didorong dan disimpan ke Google Sheet!",
        config: db.googleConfig,
      });
    } else {
      await pullFromGoogleSheet(targetSheetId, token, db);
      hydrateAuthConsoleFromDataStore(db);
      let folderStats = { localFoldersCreated: 0, driveFoldersCreated: 0 };
      try {
        folderStats = await ensureAllPartnersFolders(token);
      } catch (fErr) {
        console.warn("Subfolders creation during sync warning:", fErr);
      }
      db.googleConfig.isConnected = true;
      db.googleConfig.lastSyncTime = new Date().toISOString();
      saveDb();
      return res.json({
        success: true,
        message: `Berhasil menarik data dari Google Sheet! (${db.partners.length} Partner, ${db.contracts.length} Kontrak, ${db.ios.length} IO).`,
        config: db.googleConfig,
        counts: {
          partners: db.partners.length,
          contracts: db.contracts.length,
          ios: db.ios.length,
        },
        folderStats,
      });
    }
  } catch (err) {
    console.error("Google Sync API Error:", err);
    const errMsg = err?.message || String(err);
    if (errMsg.includes("401")) {
      db.googleConfig.isConnected = false;
      saveDb();
      return res
        .status(401)
        .json({
          error:
            'Sesi / Token Google OAuth telah kadaluarsa (401 Unauthorized). Silakan klik "Login dengan Google" pada halaman Pengaturan untuk memperbarui akses token Anda.',
          details: errMsg,
        });
    }
    return res
      .status(500)
      .json({
        error: `Gagal melakukan sinkronisasi dengan Google Sheet: ${errMsg}`,
      });
  }
});
app.get("/api/google-integration/sync-status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(googleSheetsQueue.getStatus(db));
});
app.post("/api/google-integration/sync-flush", async (req, res) => {
  const token = await resolveActiveGoogleToken(
    req.headers["x-google-access-token"] || req.body?.accessToken,
  );
  await googleSheetsQueue.flushNow(db, token);
  res.json(googleSheetsQueue.getStatus(db));
});
app.post("/api/google-integration/auto-provision-master", async (req, res) => {
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
  if (!token && !loadServiceAccountCredentials()) {
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
    try {
      await import("./src/lib/googleSheetsSync")
        .then((s) => {
          const e = "default";
          return s[e] && typeof s[e] == "object" && "__esModule" in s[e]
            ? s[e]
            : s;
        })
        .then((m) => m.ensureMasterSheetTabs(spreadsheetId, token));
    } catch (tabsErr) {
      console.warn(
        "[AutoProvision] Warning ensuring sheet tabs:",
        tabsErr?.message,
      );
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
app.post("/api/tenants/auto-provision-folders", async (req, res) => {
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
  if (!token && !loadServiceAccountCredentials()) {
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
const provisionFoldersHandler = __name(async (req, res) => {
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
app.post("/api/admin/reset-database", async (req, res) => {
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
  db.googleConfig.aiModel = "gemini-3.6-flash";
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
      const existingUsers = sqliteDb
        .prepare("SELECT id, name, email, role FROM user")
        .all();
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
      const allTeams = sqliteDb.prepare("SELECT id FROM team").all();
      for (const tm of allTeams) {
        const count =
          sqliteDb
            .prepare(
              "SELECT COUNT(*) as count FROM teamMember WHERE teamId = ?",
            )
            .get(tm.id)?.count || 0;
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
  if (db.googleConfig.spreadsheetId) {
    try {
      const token =
        req.headers["x-google-access-token"] ||
        accessToken ||
        db.googleConfig.accessToken;
      await googleSheetsQueue.flushNow(db, token);
    } catch (sheetErr) {
      console.warn("Google Sheet sync during reset warning:", sheetErr);
    }
  }
  res.json({
    success: true,
    message:
      "Seluruh pengaturan sistem (Manage Admin Access, Organisasi, Departemen, AI, Notifikasi, Storage & Database) dan seluruh data transaksi berhasil direset ke kondisi awal kosong. Akun pengguna terdaftar tetap dipertahankan.",
    defaultOrgId,
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
        type: creds.type || "service_account",
      },
      message:
        "Otentikasi Google Service Account untuk Google Sheets API berhasil dikonfigurasi.",
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, error: err?.message || String(err) });
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
        .all();
      if (orgRows && orgRows.length > 0) {
        const orgIds = new Set(orgRows.map((o) => o.id));
        const orgSlugs = new Set(orgRows.map((o) => o.slug));
        const updatedTenants = [];
        orgRows.forEach((org) => {
          let meta = {};
          try {
            if (org.metadata) {
              meta =
                typeof org.metadata === "string"
                  ? JSON.parse(org.metadata)
                  : org.metadata;
            }
          } catch {}
          const existing = (db.tenants || []).find(
            (t) => t.id === org.id || t.domainSlug === org.slug,
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
__name(syncTenantsWithSqlite, "syncTenantsWithSqlite");
app.get("/api/tenants", async (req, res) => {
  syncTenantsWithSqlite();
  if (!db.tenants || !Array.isArray(db.tenants) || db.tenants.length === 0) {
    db.tenants = [DEFAULT_TENANTS[0]];
  }
  if (
    db.googleConfig?.driveFolderId &&
    db.tenants.some(
      (t) => !t.driveFolderId || t.driveFolderId.startsWith("Folder_"),
    )
  ) {
    try {
      const token =
        req.headers["x-google-access-token"] || db.googleConfig?.accessToken;
      await autoEnsureTenantGoogleResources(token);
    } catch (e) {
      console.warn(
        "[GET /api/tenants] autoEnsureTenantGoogleResources warning:",
        e?.message,
      );
    }
  }
  if (
    !db.activeTenantId ||
    !db.tenants.some((t) => t.id === db.activeTenantId)
  ) {
    db.activeTenantId = db.tenants[0]?.id || "org_1789542306289_b3a4f3";
    saveDb();
  }
  return res.json({
    success: true,
    tenants: db.tenants,
    activeTenantId: db.activeTenantId,
  });
});
app.post("/api/tenants/switch", (req, res) => {
  const { tenantId } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: "tenantId is required." });
  }
  const exists = (db.tenants || DEFAULT_TENANTS).find((t) => t.id === tenantId);
  if (!exists) {
    return res.status(404).json({ error: "Tenant not found." });
  }
  db.activeTenantId = tenantId;
  saveDb();
  return res.json({ success: true, activeTenantId: tenantId });
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
    domainSlug:
      tenantData.domainSlug ||
      tenantData.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    isDefault: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    updated_at: new Date().toISOString(),
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
app.post("/api/tenants/:id/setup-google", async (req, res) => {
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
  if (!token && !loadServiceAccountCredentials()) {
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
    tenant.updated_at = new Date().toISOString();
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
app.post("/api/tenants/:id/sync-google", async (req, res) => {
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
app.get("/api/branding", (req, res) => {
  if (!db.branding) {
    db.branding = DEFAULT_BRANDING;
  }
  return res.json({ success: true, branding: db.branding });
});
app.post("/api/branding", (req, res) => {
  const brandingData = req.body;
  db.branding = { ...(db.branding || DEFAULT_BRANDING), ...brandingData };
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
          ? p.daftar_dokumen_dd.map((d) => ({
              nama: d.nama,
              status: d.status,
              wajib: d.wajib,
              nomorDokumen: d.nomorDokumen || "",
              tanggalKadaluarsa: d.tanggalKadaluarsa || "",
            }))
          : [],
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
        internal_notes_kontrak:
          c.internal_notes || c.notes || c.catatan || c.ringkasan_kontrak || "",
        ringkasan_perubahan: c.ringkasan_perubahan || "",
        field_yang_berubah: c.field_yang_berubah || [],
        sisa_hari: c.sisa_hari,
      })),
      ios: (db.ios || []).map((i) => {
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
    const modelToUse = db.googleConfig?.aiModel || "gemini-3.6-flash";
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents,
      config: { systemInstruction, temperature: 0.2 },
    });
    res.json({ success: true, reply: response.text });
  } catch (error) {
    console.error("AI Chat Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to process AI request" });
  }
});
app.use("/api/auth-console", authConsoleRouter);
app.all("/api/*", (req, res) => {
  res
    .status(404)
    .json({ error: `API route not found: ${req.method} ${req.path}` });
});
app.use((err, req, res, next) => {
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
    app.get("*all", (req, res) => {
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
__name(startServer, "startServer");
startServer();
export { getFreshGoogleAccessToken, isMatchingOrg, resolveActiveGoogleToken };

//# sourceMappingURL=data:application/json;base64,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QUFLLE1BQVEsQ0FDOUIsSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLENBQUUsTUFBTyx3QkFBd0IsSUFBSSxNQUFNLElBQUksSUFBSSxJQUFJLEVBQUcsQ0FBQyxDQUNsRixDQUFDLEVBR0QsSUFBSSxJQUFJLENBQUMsSUFBVSxJQUFzQixJQUF1QixPQUErQixDQUM3RixRQUFRLE1BQU0sd0JBQXlCLEdBQUcsRUFDMUMsR0FBSSxJQUFJLFlBQWEsQ0FDbkIsT0FBTyxLQUFLLEdBQUcsQ0FDakIsQ0FDQSxHQUFJLElBQUksS0FBSyxXQUFXLE9BQU8sRUFBRyxDQUNoQyxPQUFPLElBQUksT0FBTyxJQUFJLFFBQVUsR0FBRyxFQUFFLEtBQUssQ0FDeEMsTUFBTyxJQUFJLFNBQVcscUNBQ3RCLE9BQVEsSUFBSSxRQUFVLEdBQ3hCLENBQUMsQ0FDSCxDQUNBLEtBQUssR0FBRyxDQUNWLENBQUMsRUFHRCxlQUFlLGFBQWMsQ0FDM0IsSUFBSSxXQUNKLEdBQUksUUFBUSxJQUFJLFdBQWEsYUFBYyxDQUN6QyxXQUFhLE1BQU0saUJBQWlCLENBQ2xDLE9BQVEsQ0FBRSxlQUFnQixJQUFLLEVBQy9CLFFBQVMsS0FDWCxDQUFDLEVBQ0QsSUFBSSxJQUFJLFdBQVcsV0FBVyxDQUNoQyxLQUFPLENBQ0wsTUFBTSxTQUFXLEtBQUssS0FBSyxRQUFRLElBQUksRUFBRyxNQUFNLEVBQ2hELElBQUksSUFBSSxRQUFRLE9BQU8sUUFBUSxDQUFDLEVBQ2hDLElBQUksSUFBSSxPQUFRLENBQUMsSUFBSyxNQUFRLENBQzVCLElBQUksU0FBUyxLQUFLLEtBQUssU0FBVSxZQUFZLENBQUMsQ0FDaEQsQ0FBQyxDQUNILENBRUEsTUFBTSxPQUFTLElBQUksT0FBTyxLQUFNLFVBQVcsSUFBTSxDQUMvQyxRQUFRLElBQUksMkRBQTJELElBQUksRUFBRSxDQUMvRSxDQUFDLEVBRUQsTUFBTSxTQUFXLGdCQUFZLENBQzNCLFFBQVEsSUFBSSx5QkFBeUIsRUFDckMsR0FBSSxXQUFZLENBQ2QsTUFBTSxXQUFXLE1BQU0sQ0FDekIsQ0FDQSxPQUFPLE1BQU0sSUFBTSxDQUNqQixRQUFRLElBQUksZUFBZSxFQUMzQixRQUFRLEtBQUssQ0FBQyxDQUNoQixDQUFDLEVBR0QsV0FBVyxJQUFNLENBQ2YsUUFBUSxNQUFNLDJCQUEyQixFQUN6QyxRQUFRLEtBQUssQ0FBQyxDQUNoQixFQUFHLEdBQUksRUFBRSxNQUFNLENBQ2pCLEVBZmlCLFlBaUJqQixRQUFRLEdBQUcsVUFBVyxRQUFRLEVBQzlCLFFBQVEsR0FBRyxTQUFVLFFBQVEsQ0FDL0IsQ0F2Q2Usa0NBeUNmLFlBQVkiLCJuYW1lcyI6WyJvcmdGb2xkZXIiLCJnZXRNaW1lVHlwZSIsInRva2VuIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIi9hcHAvYXBwbGV0L3NlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6W251bGxdfQ==
