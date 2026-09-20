const fs = require('fs');
const path = 'server.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'const {',
  'const {\n    masterSpreadsheetId,\n    masterSpreadsheetUrl,'
);

content = content.replace(
  'const token = accessToken ||',
  'if (masterSpreadsheetId !== undefined) db.googleConfig.masterSpreadsheetId = masterSpreadsheetId;\n  if (masterSpreadsheetUrl !== undefined) db.googleConfig.masterSpreadsheetUrl = masterSpreadsheetUrl;\n  const token = accessToken ||'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed server.ts google-integration API');
