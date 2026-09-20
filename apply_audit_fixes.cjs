const fs = require('fs');

// 1. Update src/types.ts
let typesCode = fs.readFileSync('src/types.ts', 'utf8');
if (!typesCode.includes('export interface Department')) {
  typesCode = typesCode.replace(
    'export interface AllowedUser {',
    `export interface Department {
  id: string;
  organizationId?: string;
  name: string;
  code?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AllowedUser {`
  );
  fs.writeFileSync('src/types.ts', typesCode, 'utf8');
  console.log('Updated src/types.ts with Department interface');
}

// 2. Update src/lib/googleSheetsSync.ts
let syncCode = fs.readFileSync('src/lib/googleSheetsSync.ts', 'utf8');

// Update imports
syncCode = syncCode.replace(
  "  AllowedUser,\n  PartnerEvaluation,",
  "  AllowedUser,\n  Department,\n  PartnerEvaluation,"
);

// Update DataStore interface
syncCode = syncCode.replace(
  "  tenants?: Tenant[];\n  googleConfig: any;",
  "  tenants?: Tenant[];\n  departments?: Department[];\n  googleConfig: any;"
);

// Update USER_HEADERS
const oldUserHeaders = `const USER_HEADERS = [
  'user_id',
  'email',
  'name',
  'role',
  'department',
  'status',
  'added_by',
  'added_by_email',
  'created_at',
  'last_login_at',
];`;

const newUserHeaders = `const USER_HEADERS = [
  'user_id',
  'organization_id',
  'organization_name',
  'email',
  'name',
  'role',
  'department',
  'status',
  'added_by',
  'added_by_email',
  'created_at',
  'last_login_at',
];

export const DEPARTMENT_HEADERS = [
  'department_id',
  'organization_id',
  'name',
  'code',
  'description',
  'created_at',
  'updated_at',
];`;

syncCode = syncCode.replace(oldUserHeaders, newUserHeaders);

// Update ACTIVITY_HEADERS
const oldActHeaders = `const ACTIVITY_HEADERS = [
  'log_id',
  'timestamp',
  'user_email',
  'user_name',
  'role',
  'action_type',
  'module',
  'description',
  'ip_address',
  'user_agent',
];`;

const newActHeaders = `const ACTIVITY_HEADERS = [
  'log_id',
  'organization_id',
  'timestamp',
  'user_email',
  'user_name',
  'role',
  'action_type',
  'module',
  'description',
  'ip_address',
  'user_agent',
];`;

syncCode = syncCode.replace(oldActHeaders, newActHeaders);

// Update syncMasterSystemSheet logic
const oldMasterSync = `export async function syncMasterSystemSheet(
  spreadsheetId: string,
  token: string,
  db: DataStore
): Promise<void> {
  await ensureMasterSheetTabs(spreadsheetId, token);

  // 1. Organization
  const orgValues = [
    ORGANIZATION_HEADERS,
    ...(db.tenants || []).map((t) => [
      t.id,
      t.name,
      t.legal_entity || 'PT',
      t.brand_name || t.name,
      t.driveFolderId || '',
      t.driveFolderLink || '',
      t.spreadsheetId || '',
      t.spreadsheetUrl || '',
      t.branding?.primaryColor || '#06C755',
      t.currency || 'IDR',
      t.slug || '',
      t.is_default ? 'TRUE' : 'FALSE',
      t.created_at || new Date().toISOString(),
      t.updated_at || new Date().toISOString(),
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Organization', orgValues);

  // 2. Allowed Users
  const userValues = [
    USER_HEADERS,
    ...db.allowedUsers.map((u) => [
      u.id,
      u.email,
      u.name,
      u.role,
      u.department || 'Umum',
      u.status,
      u.addedBy || 'System',
      u.addedByEmail || '',
      u.createdAt || '',
      u.lastLoginAt || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Allowed_User', userValues);

  // 3. System Log (Activity Logs)
  const logValues = [
    ACTIVITY_HEADERS,
    ...db.activityLogs.slice(0, 500).map((l) => [
      l.id,
      l.timestamp,
      l.userEmail,
      l.userName,
      l.role,
      l.actionType,
      l.module,
      l.description,
      l.ipAddress || '',
      l.userAgent || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'System_Log', logValues);

  // 4. Department
  const deptValues = [
    ['id', 'name', 'code', 'description', 'created_at', 'updated_at'],
    ...[
      ['team-commercial', 'Commercial & Marketing', 'COM', '', new Date().toISOString(), new Date().toISOString()],
      ['team-legal', 'Legal & Compliance', 'LEG', '', new Date().toISOString(), new Date().toISOString()],
      ['team-procurement', 'Procurement & Operations', 'PRO', '', new Date().toISOString(), new Date().toISOString()],
      ['team-general', 'General', 'GEN', '', new Date().toISOString(), new Date().toISOString()]
    ]
  ];
  await writeTabValues(spreadsheetId, token, 'Department', deptValues);
}`;

const newMasterSync = `export async function syncMasterSystemSheet(
  spreadsheetId: string,
  token: string,
  db: DataStore
): Promise<void> {
  await ensureMasterSheetTabs(spreadsheetId, token);

  const tenantMap = new Map<string, string>();
  (db.tenants || []).forEach((t) => {
    if (t.id) tenantMap.set(t.id, t.name || t.brandName || t.id);
  });

  // 1. Organization
  const orgValues = [
    ORGANIZATION_HEADERS,
    ...(db.tenants || []).map((t) => [
      t.id,
      t.name,
      t.legal_entity || 'PT',
      t.brand_name || t.name,
      t.driveFolderId || '',
      t.driveFolderLink || '',
      t.spreadsheetId || '',
      t.spreadsheetUrl || '',
      t.branding?.primaryColor || '#06C755',
      t.currency || 'IDR',
      t.slug || '',
      t.is_default ? 'TRUE' : 'FALSE',
      t.created_at || new Date().toISOString(),
      t.updated_at || new Date().toISOString(),
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Organization', orgValues);

  // 2. Allowed Users
  const userValues = [
    USER_HEADERS,
    ...db.allowedUsers.map((u) => [
      u.id,
      u.organizationId || 'org-adapundi',
      tenantMap.get(u.organizationId || 'org-adapundi') || 'Info Tekno Siaga',
      u.email,
      u.name,
      u.role,
      u.department || 'Umum',
      u.status,
      u.addedBy || 'System',
      u.addedByEmail || '',
      u.createdAt || '',
      u.lastLoginAt || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'Allowed_User', userValues);

  // 3. System Log (Activity Logs)
  const logValues = [
    ACTIVITY_HEADERS,
    ...db.activityLogs.slice(0, 500).map((l) => [
      l.id,
      l.organizationId || '',
      l.timestamp,
      l.userEmail,
      l.userName,
      l.role,
      l.actionType,
      l.module,
      l.description,
      l.ipAddress || '',
      l.userAgent || '',
    ]),
  ];
  await writeTabValues(spreadsheetId, token, 'System_Log', logValues);

  // 4. Department (No hardcoded sample rows; cleared or dynamic DB departments only)
  const deptValues = [
    DEPARTMENT_HEADERS,
    ...((db.departments || []).map((d) => [
      d.id,
      d.organizationId || '',
      d.name,
      d.code || '',
      d.description || '',
      d.created_at || new Date().toISOString(),
      d.updated_at || new Date().toISOString(),
    ]))
  ];
  await writeTabValues(spreadsheetId, token, 'Department', deptValues);
}`;

syncCode = syncCode.replace(oldMasterSync, newMasterSync);

// Update reading allowedUsers in syncFromGoogleSheet
const oldReadUser = `      return {
        id: rawId || \`usr-\${Date.now()}-\${idx}\`,
        email: rawEmail.toLowerCase(),
        name: getCellVal(r, uMap, ['name', 'nama', 'user_name'], 2) || 'User',
        role: (getCellVal(r, uMap, ['role', 'peran'], 3) as any) || 'Legal',
        department: getCellVal(r, uMap, ['department', 'departemen'], 4) || 'Umum',
        status: (getCellVal(r, uMap, ['status'], 5) as any) || 'Active',
        addedBy: getCellVal(r, uMap, ['added_by', 'addedby'], 6) || 'System',
        addedByEmail: getCellVal(r, uMap, ['added_by_email', 'addedbyemail'], 7) || '',
        createdAt: getCellVal(r, uMap, ['created_at', 'createdat'], 8) || new Date().toISOString(),
        lastLoginAt: getCellVal(r, uMap, ['last_login_at', 'lastloginat'], 9) || undefined,
      };`;

const newReadUser = `      return {
        id: rawId || \`usr-\${Date.now()}-\${idx}\`,
        organizationId: getCellVal(r, uMap, ['organization_id', 'organizationid', 'org_id', 'orgid'], 1) || 'org-adapundi',
        email: rawEmail.toLowerCase(),
        name: getCellVal(r, uMap, ['name', 'nama', 'user_name'], 3) || 'User',
        role: (getCellVal(r, uMap, ['role', 'peran'], 4) as any) || 'Legal',
        department: getCellVal(r, uMap, ['department', 'departemen'], 5) || 'Umum',
        status: (getCellVal(r, uMap, ['status'], 6) as any) || 'Active',
        addedBy: getCellVal(r, uMap, ['added_by', 'addedby'], 7) || 'System',
        addedByEmail: getCellVal(r, uMap, ['added_by_email', 'addedbyemail'], 8) || '',
        createdAt: getCellVal(r, uMap, ['created_at', 'createdat'], 9) || new Date().toISOString(),
        lastLoginAt: getCellVal(r, uMap, ['last_login_at', 'lastloginat'], 10) || undefined,
      };`;

syncCode = syncCode.replace(oldReadUser, newReadUser);

fs.writeFileSync('src/lib/googleSheetsSync.ts', syncCode, 'utf8');
console.log('Successfully updated src/lib/googleSheetsSync.ts');
