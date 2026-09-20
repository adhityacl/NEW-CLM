const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

content = content.replace(
  'setSpreadsheetId(item.id);',
  'setSpreadsheetId(item.id);\n      setMasterSpreadsheetId(item.id);'
);

fs.writeFileSync('src/components/SettingsView.tsx', content, 'utf8');
