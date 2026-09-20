const fs = require('fs');
const path = require('path');

const code = fs.readFileSync('server.ts', 'utf8');
const lines = code.split('\n');

const routes = {
  users: { start: 1666, end: 2142 },
  partners: { start: 2143, end: 2673 },
  spendings: { start: 2674, end: 3435 },
  contracts: { start: 3436, end: 4206 },
  ios: { start: 4207, end: 4724 },
  notifications: { start: 4725, end: 4758 },
  google: { start: 4759, end: 5441 },
  admin: { start: 5442, end: 5663 },
  bulkImport: { start: 5664, end: 6042 },
  tenants: { start: 6043, end: 6269 },
  ai: { start: 6270, end: 6500 }, 
};

let aiEnd = lines.findIndex(line => line.includes('Vite middleware for development') || line.includes('function syncTenantsWithSqlite()'));
if (aiEnd === -1) aiEnd = lines.length;
routes.ai.end = aiEnd - 1;

fs.mkdirSync('src/server/routes', { recursive: true });

// Identify exported symbols for db.ts
const exportSymbols = [
  'db', 'saveDb', 'getOrgFolderId', 'autoEnsureTenantGoogleResources', 
  'getPartnerFolderId', 'getPartnerCategoryFolderId', 'saveLocalFile',
  'deleteLocalFileFromUrl', 'getMimeType', 'migrateLocalFilesToGoogleDrive',
  'ensureAllPartnersFolders', 'getEffectiveGeminiApiKey', 'getGenAIClient',
  'getValidAiModel', 'generateContentWithRetryAndFallback', 'normalizeParsedDate',
  'computeContractEndDateFromDuration', 'normalizePartnerDDDocs', 'generateNextPartnerId',
  'generateNextContractId', 'generateNextIOId', 'generateNextSpendingId',
  'sanitizePartnerTags', 'triggerAutoPushToGoogleSheet', 'syncAdderNames',
  'sendSmtpEmail', 'recalculateStatuses', 'addActivityLog', 'getBetterAuthSession',
  'getClerkUserEmail', 'checkIsAdmin', 'computeEvaluationScore', 'getEndOfMonthDate',
  'normalizeSpendingMonths', 'syncTenantsWithSqlite', 'uploadsDir', 'dataFilePath',
  'resolveActiveGoogleToken', 'getTenantConfig', 'isMatchingOrg', 'provisionFoldersHandler'
];

// Wait, let's extract symbols dynamically!
const helpersLines = lines.slice(0, 1665);
const dynamicExports = new Set();
for (let line of helpersLines) {
  let m = line.match(/^(?:async )?function ([a-zA-Z0-9_]+)\s*\(/);
  if (m) dynamicExports.add(m[1]);
  let m2 = line.match(/^(?:const|let) ([a-zA-Z0-9_]+)\s*[:=]/);
  if (m2 && m2[1] !== 'app' && m2[1] !== 'PORT') dynamicExports.add(m2[1]);
}
// Add manually some things just in case
dynamicExports.add('db');
dynamicExports.add('saveDb');
dynamicExports.add('resolveActiveGoogleToken');
dynamicExports.add('getTenantConfig');
dynamicExports.add('isMatchingOrg');
dynamicExports.add('ensureDirectoryExists');
dynamicExports.add('safeDeleteFile');

const exportList = Array.from(dynamicExports);

// 1. Create db.ts
let dbTsContent = [];
// Top imports
for (let i = 0; i < 70; i++) { // copy all imports from top of server.ts
  if (lines[i].startsWith('const app = express()')) break;
  dbTsContent.push(lines[i]);
}

// Add the helpers body, injecting 'export ' where needed
let inHelpers = false;
for (let i = 0; i < 1665; i++) {
  let line = lines[i];
  if (line.startsWith('const app = express()') || line.startsWith('const PORT =') || line.startsWith('app.') || line.startsWith('  if (req.path.startsWith') || line.startsWith('  return toNodeHandler') || line.startsWith('    return next()')) {
    continue;
  }
  if (line.startsWith('// Better Auth handler') || line.startsWith('});')) {
    continue;
  }
  
  // Inject export
  for (let sym of exportList) {
    if (line.startsWith(`function ${sym}(`) || line.startsWith(`async function ${sym}(`)) {
      line = 'export ' + line;
      break;
    }
    if (line.startsWith(`const ${sym} =`) || line.startsWith(`const ${sym}:`) || line.startsWith(`let ${sym} =`) || line.startsWith(`let ${sym}:`)) {
      line = 'export ' + line;
      break;
    }
  }
  
  dbTsContent.push(line);
}
fs.writeFileSync('src/server/db.ts', dbTsContent.join('\n'));

// 2. Create route files
const commonImports = `import express from 'express';
import Database from "better-sqlite3";
import path from 'path';
import fs from 'fs';
import { Type } from '@google/genai';
import { 
  ${exportList.join(',\n  ')}
} from '../db';
import {
  AllowedUser, Partner, Contract, InsertionOrder, NotificationLog, ActivityLog,
  PartnerEvaluation, PartnerSpending, GoogleSheetsConfig, Tenant, TenantBranding,
  UserRole, Department
} from '../../types';
import {
  formatContractFileName, formatIOFileName, formatInvoiceFileName,
  formatBillingFileName, formatDueDiligenceFileName, sanitizeFilePart
} from '../../lib/fileNaming';
import { 
  syncFromGoogleSheet, syncToGoogleSheet, twoWaySyncGoogleSheet, pullFromGoogleSheet, 
  mergeRecords, getExchangeRates, getHistoricalExchangeRate, ensureOrgSheetTabs 
} from '../../lib/googleSheetsSync';
import { googleSheetsQueue } from '../../lib/googleSheetsQueue';
import { 
  createDriveFolder, createNewDriveFolderInParent, getOrCreateDriveFolder, 
  uploadFileToDrive, extractFolderIdFromLink, setInvalidTokenCallback, 
  setRefreshTokenGetter, createSpreadsheetInFolder 
} from '../../lib/googleDriveSync';
import { loadServiceAccountCredentials, getGoogleSheetsClient } from '../../lib/googleServiceAccountAuth';
import { optimizePdfForCheapOcr, buildCheapOcrContents } from '../../lib/cheapOcrPipeline';
import { auth as betterAuthInstance } from "../../lib/auth";

const router = express.Router();
`;

for (let [name, bounds] of Object.entries(routes)) {
  let routeContent = [commonImports];
  for (let i = bounds.start - 1; i <= bounds.end; i++) {
    let line = lines[i];
    // Replace 'app.' with 'router.' ONLY if it's at the start or follows whitespace/comments
    line = line.replace(/^app\.(get|post|put|delete|patch)\(/, 'router.$1(');
    routeContent.push(line);
  }
  routeContent.push('\nexport default router;');
  fs.writeFileSync(`src/server/routes/${name}.ts`, routeContent.join('\n'));
}

// 3. Rewrite server.ts
let serverTsContent = [];
// Top imports
for (let i = 0; i < 70; i++) {
  if (lines[i].startsWith('const app = express()')) break;
  serverTsContent.push(lines[i]);
}

serverTsContent.push(`import { 
  ${exportList.join(',\n  ')}
} from './src/server/db';`);

serverTsContent.push(`import usersRoutes from './src/server/routes/users';`);
serverTsContent.push(`import partnersRoutes from './src/server/routes/partners';`);
serverTsContent.push(`import spendingsRoutes from './src/server/routes/spendings';`);
serverTsContent.push(`import contractsRoutes from './src/server/routes/contracts';`);
serverTsContent.push(`import iosRoutes from './src/server/routes/ios';`);
serverTsContent.push(`import notificationsRoutes from './src/server/routes/notifications';`);
serverTsContent.push(`import googleRoutes from './src/server/routes/google';`);
serverTsContent.push(`import adminRoutes from './src/server/routes/admin';`);
serverTsContent.push(`import bulkImportRoutes from './src/server/routes/bulkImport';`);
serverTsContent.push(`import tenantsRoutes from './src/server/routes/tenants';`);
serverTsContent.push(`import aiRoutes from './src/server/routes/ai';`);

// Include the express setup up to the helpers
for (let i = 0; i < 1665; i++) {
  let line = lines[i];
  if (line.startsWith('const app = express()') || line.startsWith('const PORT =') || line.startsWith('app.') || line.startsWith('  if (req.path.startsWith') || line.startsWith('  return toNodeHandler') || line.startsWith('    return next()') || line.startsWith('// Better Auth handler') || line.startsWith('});')) {
    serverTsContent.push(line);
  }
}

// Mount the routes
serverTsContent.push(`
app.use('/', usersRoutes);
app.use('/', partnersRoutes);
app.use('/', spendingsRoutes);
app.use('/', contractsRoutes);
app.use('/', iosRoutes);
app.use('/', notificationsRoutes);
app.use('/', googleRoutes);
app.use('/', adminRoutes);
app.use('/', bulkImportRoutes);
app.use('/', tenantsRoutes);
app.use('/', aiRoutes);
`);

// Add the bottom part (Vite and startServer)
for (let i = routes.ai.end + 1; i < lines.length; i++) {
  serverTsContent.push(lines[i]);
}

fs.writeFileSync('server.ts', serverTsContent.join('\n'));

console.log('Done!');
