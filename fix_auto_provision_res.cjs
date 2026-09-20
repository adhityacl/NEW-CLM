const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'driveFolderId: rootFolderId,',
  'driveFolderId: rootFolderId,\n      masterSpreadsheetId: spreadsheetId,'
);

fs.writeFileSync('server.ts', content, 'utf8');
