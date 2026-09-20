const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

// 1. Add departments to DataStore interface in server.ts
serverCode = serverCode.replace(
  "  tenants: Tenant[];\n  activeTenantId",
  "  tenants: Tenant[];\n  departments?: any[];\n  activeTenantId"
);

// 2. Add departments to db object
serverCode = serverCode.replace(
  "  tenants: DEFAULT_TENANTS,\n  activeTenantId",
  "  tenants: DEFAULT_TENANTS,\n  departments: [],\n  activeTenantId"
);

// 3. Clear departments / teams in reset endpoint
const oldTeamsReset = `      // Recreate default departments / teams
      const defaultTeams = [
        { id: 'team-commercial', name: 'Commercial & Marketing' },
        { id: 'team-legal', name: 'Legal & Compliance' },
        { id: 'team-procurement', name: 'Procurement & Operations' },
        { id: 'team-general', name: 'General' },
      ];

      for (const tm of defaultTeams) {
        sqliteDb.prepare(\`
          INSERT INTO team (id, name, memberCount, organizationId, createdAt, updatedAt)
          VALUES (?, ?, 0, ?, ?, ?)
        \`).run(tm.id, tm.name, defaultOrgId, new Date().toISOString(), new Date().toISOString());
      }`;

const newTeamsReset = `      // Clear all teams / departments
      sqliteDb.prepare('DELETE FROM team').run();
      db.departments = [];`;

serverCode = serverCode.replace(oldTeamsReset, newTeamsReset);

// Also add db.departments = []; under transaction data reset in reset endpoint
serverCode = serverCode.replace(
  "  db.activityLogs = [];",
  "  db.activityLogs = [];\n  db.departments = [];"
);

fs.writeFileSync('server.ts', serverCode, 'utf8');
console.log('Successfully updated server.ts for Department & Audit');
