import { rmSync } from 'node:fs';
for (const path of ['dist', 'apps/frontend/dist', 'apps/backend/dist', 'apps/system-console/dist', 'apps/frontend/.vite', '.turbo']) {
  rmSync(new URL(`../${path}`, import.meta.url), { recursive: true, force: true });
}
