const fs = require('fs');

let ds = JSON.parse(fs.readFileSync('data_store.json', 'utf8'));
const defaultTenant = (ds.tenants && ds.tenants[0]) || {};
const tenantSheetId = defaultTenant.spreadsheetId || '1pKyuUSMrGAie0szRhBrasZ9qoVyZqvjzjQ7HtLVB0aQ';
const masterSheetId = ds.googleConfig?.masterSpreadsheetId || '1edLIQGLtbGP08K6CXi3XMtRfpXGPh03hVnVWCXiasdw';

if (!ds.googleConfig) ds.googleConfig = {};
ds.googleConfig.masterSpreadsheetId = masterSheetId;
ds.googleConfig.masterSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${masterSheetId}/edit`;

// If spreadsheetId was pointing to master, fix it to point to tenant sheet!
if (ds.googleConfig.spreadsheetId === masterSheetId || !ds.googleConfig.spreadsheetId) {
  ds.googleConfig.spreadsheetId = tenantSheetId;
  ds.googleConfig.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${tenantSheetId}/edit`;
}

fs.writeFileSync('data_store.json', JSON.stringify(ds, null, 2), 'utf8');
console.log('Fixed googleConfig spreadsheetId in data_store.json:', {
  masterSpreadsheetId: ds.googleConfig.masterSpreadsheetId,
  tenantSpreadsheetId: ds.googleConfig.spreadsheetId
});
