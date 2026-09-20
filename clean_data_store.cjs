const fs = require('fs');

let ds = JSON.parse(fs.readFileSync('data_store.json', 'utf8'));
ds.departments = [];
if (Array.isArray(ds.allowedUsers)) {
  ds.allowedUsers = ds.allowedUsers.map(u => ({
    ...u,
    organizationId: u.organizationId || 'org-adapundi'
  }));
}
fs.writeFileSync('data_store.json', JSON.stringify(ds, null, 2), 'utf8');
console.log('Cleaned data_store.json');
