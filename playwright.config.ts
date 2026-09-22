import { defineConfig, devices } from '@playwright/test';

/**
 * Covers the QA/QC audit's P3-3 follow-up: the audit's RBAC pass only
 * tested the API layer (no browser was available in that environment), so
 * this checks that the UI actually hides/shows the same things the API
 * enforces — starting with the System Admin / Organization Admin sidebar
 * links (Sidebar.tsx), which should only ever appear for the roles that can
 * actually reach those areas at the API level.
 *
 * Requires the dev server's data: at least one organization and one team
 * already seeded in `auth.db` (this project's normal dev setup has both).
 *
 * Run:
 *   npx playwright install        # one-time, downloads browser binaries
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // tests share auth.db session rows; keep sequential
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
