const fs = require('fs');
const path = require('path');

const code = fs.readFileSync('server.ts', 'utf8');
const lines = code.split('\n');

const routes = {
  users: { start: 1770, end: 2297 },
  partners: { start: 2298, end: 2930 },
  spendings: { start: 2931, end: 3762 },
  contracts: { start: 3763, end: 4632 },
  ios: { start: 4633, end: 5230 },
  notifications: { start: 5231, end: 5263 },
  google: { start: 5264, end: 6112 },
  admin: { start: 6113, end: 6345 },
  bulkImport: { start: 6346, end: 6846 },
  tenants: { start: 6847, end: 7065 },
  ai: { start: 7066, end: 7500 }, 
};

let aiEnd = lines.findIndex(line => line.includes('viteServer = await createViteServer') || line.includes('function startServer()'));
if (aiEnd === -1) aiEnd = lines.length;
routes.ai.end = aiEnd - 1;
// wait, the routes ai end might include app.use("/api/auth-console",authConsoleRouter) etc.
// Let's find exactly where app.use("/api/auth-console") is, that is around line 7320.
let endOfRoutes = lines.findIndex(line => line.includes('app.use("/api/auth-console"'));
if (endOfRoutes !== -1) {
  routes.ai.end = endOfRoutes - 1;
}

fs.mkdirSync('src/server/routes', { recursive: true });

// Identify exported symbols for db.ts
// We'll just export everything that looks like a global var or function
const helpersLines = lines.slice(0, 1769);
const dynamicExports = new Set();
for (let line of helpersLines) {
  let m = line.match(/^(?:async )?function ([a-zA-Z0-9_]+)\s*\(/);
  if (m) dynamicExports.add(m[1]);
  let m2 = line.match(/^(?:const|let|var) ([a-zA-Z0-9_]+)\s*[:=]/);
  if (m2 && m2[1] !== 'app' && m2[1] !== 'PORT') dynamicExports.add(m2[1]);
}
['db', 'saveDb', 'resolveActiveGoogleToken', 'getTenantConfig', 'isMatchingOrg', 'ensureDirectoryExists', 'safeDeleteFile', 'dataFilePath'].forEach(x => dynamicExports.add(x));

const exportList = Array.from(dynamicExports);

// 1. Create db.ts
let dbTsContent = [];
// Top imports
for (let i = 0; i < 60; i++) {
  if (lines[i].startsWith('const app = express()') || lines[i].startsWith('var app = express()')) break;
  dbTsContent.push(lines[i]);
}

for (let i = 0; i < 1769; i++) {
  let line = lines[i];
  if (line.startsWith('const app = ') || line.startsWith('var app =') || line.startsWith('const PORT =') || line.startsWith('var PORT =') || line.startsWith('app.') || line.startsWith('  if (req.path.startsWith') || line.startsWith('  return toNodeHandler') || line.startsWith('    return next()')) {
    continue;
  }
  if (line.startsWith('// Better Auth handler') || line === '});' || line === '  }') {
    // Only skip if it's the specific express blocks
    if (i < 150) continue;
  }
  
  // Inject export
  for (let sym of exportList) {
    if (line.startsWith(`function ${sym}(`) || line.startsWith(`async function ${sym}(`)) {
      line = 'export ' + line;
      break;
    }
    if (line.startsWith(`const ${sym} =`) || line.startsWith(`const ${sym}:`) || line.startsWith(`let ${sym} =`) || line.startsWith(`let ${sym}:`) || line.startsWith(`var ${sym} =`)) {
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
    // Replace 'app.' with 'router.'
    line = line.replace(/^app\.(get|post|put|delete|patch)\(/, 'router.$1(');
    routeContent.push(line);
  }
  routeContent.push('\nexport default router;');
  fs.writeFileSync(`src/server/routes/${name}.ts`, routeContent.join('\n'));
}

// 3. Rewrite server.ts
let serverTsContent = [];
// Top imports
for (let i = 0; i < 60; i++) {
  if (lines[i].startsWith('const app = express()') || lines[i].startsWith('var app = express()')) break;
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
for (let i = 0; i < 1769; i++) {
  let line = lines[i];
  if (line.startsWith('const app = ') || line.startsWith('var app =') || line.startsWith('const PORT =') || line.startsWith('var PORT =') || line.startsWith('app.') || line.startsWith('  if (req.path.startsWith') || line.startsWith('  return toNodeHandler') || line.startsWith('    return next()') || line.startsWith('// Better Auth handler') || (line === '});' && i < 150) || (line === '  }' && i < 150)) {
    serverTsContent.push(line);
  }
}

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
