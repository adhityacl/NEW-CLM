const fs = require('fs');
let content = fs.readFileSync('src/components/SyncNotificationBanner.tsx', 'utf8');

content = content.replace(
  'const isConfigured = Boolean(googleConfig.spreadsheetId);',
  'const isConfigured = Boolean(googleConfig.spreadsheetId || googleConfig.masterSpreadsheetId);'
);

fs.writeFileSync('src/components/SyncNotificationBanner.tsx', content, 'utf8');
