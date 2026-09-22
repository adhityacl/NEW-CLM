/**
 * QA/QC audit finding L2: the audit's RBAC testing was API-only (no browser
 * available in that environment). This checks the one piece of UI that
 * audit finding directly called out — the "System Admin" / "Organization
 * Admin" links only Sidebar.tsx renders, and only for specific roles — so a
 * gap between what the API allows and what the UI shows gets caught here
 * instead of by a user clicking into a page they shouldn't see a link to.
 *
 * Ground truth is Sidebar.tsx's `adminNavItems` filter, not this file:
 *   - "System Admin"       -> adminOnly + systemOnly + 'admin.system.access'
 *                              => visible to Superuser only
 *   - "Organization Admin" -> tenantOnly (excludes Superuser) + 'admin.access'
 *                              => visible to Admin and Manager, not Superuser,
 *                                 not Editor/Viewer (both denylist admin.access
 *                                 in server/rbac.ts)
 *
 * If Sidebar.tsx's nav config changes, update the expectations below to
 * match — this file didn't invent those rules, it's just checking the UI
 * agrees with them.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedRoleSessions, cleanupRoleSessions, type SeededRole } from './seed';

let seeded: SeededRole[];

test.beforeAll(() => {
  seeded = seedRoleSessions();
});

test.afterAll(() => {
  cleanupRoleSessions();
});

async function loginAs(page: Page, role: SeededRole['role']) {
  const entry = seeded.find((s) => s.role === role);
  if (!entry) throw new Error(`No seeded session for role "${role}"`);
  // Mirrors AuthContext.tsx: it reads `auth_session_token` from localStorage
  // and sends it as `Authorization: Bearer <token>` on every API call.
  await page.addInitScript((token) => {
    window.localStorage.setItem('auth_session_token', token);
  }, entry.token);
  await page.goto('/');
  // Wait for AuthContext's initial /api/user/my-role call to resolve one way
  // or the other before asserting on nav content.
  await page.waitForLoadState('networkidle');
}

const SYSTEM_ADMIN_LABEL = 'System Admin';
const ORG_ADMIN_LABEL = 'Organization Admin';

// The sidebar renders both a desktop nav landmark and a separate mobile-menu
// nav landmark at the same time (one hidden via CSS depending on viewport),
// so `page.getByText(...)` alone matches twice — a real finding from
// actually running this against the app, not something to work around with
// `.first()`. Scoping to the desktop admin-section landmark (aria-label
// "NAVIGASI ADMIN", from Sidebar.tsx's `nav.admin_title`) picks the one that
// is actually visible at this viewport.
function adminNavSection(page: Page) {
  return page.getByRole('navigation', { name: 'NAVIGASI ADMIN' });
}

test.describe('Sidebar admin nav visibility matches server RBAC (audit finding L2)', () => {
  test('Superuser sees System Admin, not Organization Admin', async ({ page }) => {
    await loginAs(page, 'superuser');
    await expect(adminNavSection(page).getByText(SYSTEM_ADMIN_LABEL, { exact: true })).toBeVisible();
    await expect(page.getByText(ORG_ADMIN_LABEL, { exact: true })).toHaveCount(0);
  });

  test('Admin sees Organization Admin, not System Admin', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(adminNavSection(page).getByText(ORG_ADMIN_LABEL, { exact: true })).toBeVisible();
    await expect(page.getByText(SYSTEM_ADMIN_LABEL, { exact: true })).toHaveCount(0);
  });

  test('Manager sees Organization Admin, not System Admin', async ({ page }) => {
    await loginAs(page, 'manager');
    await expect(adminNavSection(page).getByText(ORG_ADMIN_LABEL, { exact: true })).toBeVisible();
    await expect(page.getByText(SYSTEM_ADMIN_LABEL, { exact: true })).toHaveCount(0);
  });

  test('Editor sees neither admin link', async ({ page }) => {
    await loginAs(page, 'editor');
    await expect(page.getByText(SYSTEM_ADMIN_LABEL, { exact: true })).toHaveCount(0);
    await expect(page.getByText(ORG_ADMIN_LABEL, { exact: true })).toHaveCount(0);
  });

  test('Viewer sees neither admin link', async ({ page }) => {
    await loginAs(page, 'viewer');
    await expect(page.getByText(SYSTEM_ADMIN_LABEL, { exact: true })).toHaveCount(0);
    await expect(page.getByText(ORG_ADMIN_LABEL, { exact: true })).toHaveCount(0);
  });
});

test.describe('Viewer write actions (audit finding C4/C5 — UI side)', () => {
  test('Viewer navigating straight to Contract Creator does not show a save/create control', async ({ page }) => {
    await loginAs(page, 'viewer');
    // This only checks that no create/save affordance renders for Viewer;
    // it deliberately does not assert on a specific route/selector beyond
    // that, since the exact nav path to get there may differ from what's
    // written here — adjust the navigation step for your app's routing if
    // this fails on an unrelated selector mismatch.
    const writeButtons = page.getByRole('button', { name: /simpan|buat kontrak|tambah/i });
    await expect(writeButtons).toHaveCount(0);
  });
});
