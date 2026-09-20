/**
 * Menghasilkan dokumen matriks peran-permission LANGSUNG dari engine
 * (`server/rbac.ts`) sehingga dokumen tidak mungkin menyimpang dari kode.
 *
 * Jalankan: npx tsx tools/gen-rbac-matrix.ts <outputDir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, PERMISSIONS, permissionsFor, ROLE_LEVEL } from '../server/rbac';

const outDir = process.argv[2] ?? 'qc-output';
mkdirSync(outDir, { recursive: true });

const roles = ROLES.map((r) => r.code);
const matrix = Object.fromEntries(roles.map((r) => [r, new Set(permissionsFor(r))])) as Record<string, Set<string>>;

/* ---------- Markdown ---------- */
const md: string[] = [];
md.push('# Matriks Peran � Permission (dihasilkan otomatis dari `server/rbac.ts`)');
md.push('');
md.push(`Dihasilkan: ${new Date().toISOString()}`);
md.push('');
md.push('Hierarki: ' + ROLES.map((r) => `${r.code}(${r.level})`).join(' > '));
md.push('');
md.push('| Permission | Resource | ' + roles.map((r) => r.toUpperCase()).join(' | ') + ' |');
md.push('|---|---|' + roles.map(() => '---:').join('|') + '|');
for (const p of PERMISSIONS) {
  md.push(`| \`${p.code}\` | ${p.resource} | ` + roles.map((r) => (matrix[r].has(p.code) ? '?' : '-')).join(' | ') + ' |');
}
md.push('');
md.push('## Ringkasan jumlah permission per peran');
md.push('');
md.push('| Peran | Level | Scope | Jumlah permission |');
md.push('|---|---:|---|---:|');
for (const r of ROLES) md.push(`| ${r.code} | ${r.level} | ${r.scope} | ${matrix[r.code].size} |`);
writeFileSync(join(outDir, 'RBAC-Role-Permission-Matrix.md'), md.join('\n'));

/* ---------- CSV ---------- */
const csv = ['permission,resource,action,' + roles.join(',')];
for (const p of PERMISSIONS) {
  csv.push([`"${p.code}"`, p.resource, p.action, ...roles.map((r) => (matrix[r].has(p.code) ? 'allow' : 'deny'))].join(','));
}
csv.push('');
csv.push('role,level,scope,permission_count');
for (const r of ROLES) csv.push([r.code, r.level, `"${r.scope}"`, matrix[r.code].size].join(','));
writeFileSync(join(outDir, 'RBAC-Role-Permission-Matrix.csv'), csv.join('\n'));

/* ---------- JSON (untuk UI/otomasi) ---------- */
writeFileSync(join(outDir, 'rbac-matrix.generated.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  hierarchy: ROLES.map((r) => ({ code: r.code, level: ROLE_LEVEL[r.code], scope: r.scope })),
  permissions: PERMISSIONS.map((p) => ({ code: p.code, resource: p.resource, action: p.action })),
  matrix: Object.fromEntries(roles.map((r) => [r, [...matrix[r]].sort()])),
}, null, 2));

console.log(`OK: ${PERMISSIONS.length} permission � ${roles.length} peran ? ${outDir}`);
