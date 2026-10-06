import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function affectedApps(paths) {
  // ponytail: two-app path map; use Turborepo --affected when more apps are added.
  const apps = new Set();
  for (const path of paths) {
    if (path.startsWith('apps/frontend/') || path.startsWith('packages/ui-components/')) apps.add('frontend');
    else if (path.startsWith('apps/backend/')) apps.add('backend');
    else if (!path.startsWith('docs/') && !path.startsWith('.agents/') && !path.endsWith('.md')) {
      apps.add('frontend');
      apps.add('backend');
    }
  }
  return ['frontend', 'backend'].filter((app) => apps.has(app));
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(affectedApps(readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean))));
}
