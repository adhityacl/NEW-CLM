const fs = require('fs');

const path = 'src/components/SettingsView.tsx';
let content = fs.readFileSync(path, 'utf8');

// Inject state
content = content.replace(
  'const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId || \'\');',
  'const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId || \'\');\n  const [masterSpreadsheetId, setMasterSpreadsheetId] = useState(config.masterSpreadsheetId || \'\');'
);

// Sync internal states
content = content.replace(
  'if (config.spreadsheetId !== undefined) setSpreadsheetId(config.spreadsheetId);',
  'if (config.spreadsheetId !== undefined) setSpreadsheetId(config.spreadsheetId);\n    if (config.masterSpreadsheetId !== undefined) setMasterSpreadsheetId(config.masterSpreadsheetId);'
);

// Manual save payload
content = content.replace(
  'const targetFolderId = driveFolderId || config.driveFolderId || \'\';',
  'const targetFolderId = driveFolderId || config.driveFolderId || \'\';\n    const targetMasterSheetId = masterSpreadsheetId || config.masterSpreadsheetId || \'\';'
);

content = content.replace(
  'forceNewOrgResources: true,',
  'forceNewOrgResources: true,\n        masterSpreadsheetId: targetMasterSheetId,'
);

// Cancel edit
content = content.replace(
  'setSpreadsheetId(config.spreadsheetId || \'\');',
  'setSpreadsheetId(config.spreadsheetId || \'\');\n                                      setMasterSpreadsheetId(config.masterSpreadsheetId || \'\');'
);

fs.writeFileSync(path, content, 'utf8');
