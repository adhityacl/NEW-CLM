const fs = require('fs');

// 1. Update src/lib/googleSheetsSync.ts
let syncCode = fs.readFileSync('src/lib/googleSheetsSync.ts', 'utf8');

// Update ensureOrgSheetTabs signature & master check
syncCode = syncCode.replace(
  'export async function ensureOrgSheetTabs(spreadsheetId: string, token: string): Promise<void> {',
  `export async function ensureOrgSheetTabs(spreadsheetId: string, token: string, masterSheetId?: string): Promise<void> {
  if (masterSheetId && spreadsheetId === masterSheetId) {
    console.log('[ensureOrgSheetTabs] Blocked attempt to create operational tabs on Master Sheet:', spreadsheetId);
    return;
  }`
);

// Update ensureMasterSheetTabs to delete ALL non-master tabs (including conflict tabs)
const oldEnsureMaster = `export async function ensureMasterSheetTabs(spreadsheetId: string, token: string): Promise<void> {
  const REQUIRED_TABS = [
    'Organization', 'Department', 'Allowed_User', 'System_Log'
  ];
  const TABS_TO_DELETE = [
    'Partner', 'Contract', 'Insertion_Order',
    'Notification_Log', 'Activity_Log',
    'Partner_Evaluation', 'Partner_Spending', 'Sheet1'
  ];`;

const newEnsureMaster = `export async function ensureMasterSheetTabs(spreadsheetId: string, token: string): Promise<void> {
  const REQUIRED_TABS = [
    'Organization', 'Department', 'Allowed_User', 'System_Log'
  ];`;

syncCode = syncCode.replace(oldEnsureMaster, newEnsureMaster);

// Replace deletion checks in ensureMasterSheetTabs
syncCode = syncCode.replace(
  `        if (title && TABS_TO_DELETE.includes(title)) {`,
  `        if (title && !REQUIRED_TABS.includes(title)) {`
);

syncCode = syncCode.replace(
  `        if (title && TABS_TO_DELETE.includes(title)) {`,
  `        if (title && !REQUIRED_TABS.includes(title)) {`
);

// Update syncFromGoogleSheet to skip org tabs if master sheet
syncCode = syncCode.replace(
  'export async function syncFromGoogleSheet(\n  spreadsheetId: string,\n  token: string\n): Promise<Partial<DataStore>> {',
  'export async function syncFromGoogleSheet(\n  spreadsheetId: string,\n  token: string,\n  masterSheetId?: string\n): Promise<Partial<DataStore>> {'
);

syncCode = syncCode.replace(
  'await ensureOrgSheetTabs(spreadsheetId, token);',
  'if (!masterSheetId || spreadsheetId !== masterSheetId) {\n    await ensureOrgSheetTabs(spreadsheetId, token, masterSheetId);\n  }'
);

fs.writeFileSync('src/lib/googleSheetsSync.ts', syncCode, 'utf8');
console.log('Successfully updated src/lib/googleSheetsSync.ts to prevent master sheet tab creation and delete conflict tabs');
