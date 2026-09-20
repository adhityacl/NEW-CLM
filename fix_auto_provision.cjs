const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'await ensureOrgSheetTabs(spreadsheetId, token);',
  'await import("./src/lib/googleSheetsSync").then(m => m.ensureMasterSheetTabs(spreadsheetId, token));'
);

content = content.replace(
  'db.googleConfig.spreadsheetId = spreadsheetId;',
  'db.googleConfig.masterSpreadsheetId = spreadsheetId;\n    db.googleConfig.masterSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;\n    db.googleConfig.spreadsheetId = spreadsheetId; // For legacy compatibility if needed'
);

fs.writeFileSync('server.ts', content, 'utf8');
