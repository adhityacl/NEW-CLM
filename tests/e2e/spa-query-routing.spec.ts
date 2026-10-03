/**
 * The workspace is a single page at /app; the active page is the `tab` query
 * parameter (NavigationContext.tsx). These checks cover the contract that
 * makes that useful: the URL follows navigation, a deep link survives a
 * reload, back/forward walk the tabs, and the permission/module guards in
 * App.tsx still apply to tabs that arrive through the URL.
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

async function openAs(page: Page, role: SeededRole['role'], path: string) {
  const entry = seeded.find((s) => s.role === role);
  if (!entry) throw new Error(`No seeded session for role "${role}"`);
  await page.addInitScript((token) => {
    window.localStorage.setItem('auth_session_token', token);
  }, entry.token);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

const tabOf = (page: Page) => new URL(page.url()).searchParams.get('tab');

test.describe('SPA routing via ?tab= query parameter', () => {
  test('root URL is canonicalized to /app?tab=dashboard', async ({ page }) => {
    await openAs(page, 'admin', '/');
    await expect(page).toHaveURL(/\/app\?tab=dashboard$/);
  });

  test('deep link opens the requested tab and survives a reload', async ({ page }) => {
    await openAs(page, 'admin', '/app?tab=contracts');
    expect(tabOf(page)).toBe('contracts');
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(tabOf(page)).toBe('contracts');
  });

  test('back/forward walk through visited tabs', async ({ page }) => {
    await openAs(page, 'admin', '/app?tab=dashboard');
    await page.evaluate(() => {
      // Navigate the same way the sidebar does: pushState + popstate-free update.
      window.history.pushState({ tab: 'contracts' }, '', '/app?tab=contracts');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(tabOf(page)).toBe('contracts');
    await page.goBack();
    await expect.poll(() => tabOf(page)).toBe('dashboard');
    await page.goForward();
    await expect.poll(() => tabOf(page)).toBe('contracts');
  });

  test('unknown tab falls back to the dashboard', async ({ page }) => {
    await openAs(page, 'admin', '/app?tab=does-not-exist');
    await expect.poll(() => tabOf(page)).toBe('dashboard');
  });

  // Regression: right after sign-in PermissionProvider briefly exposed the
  // signed-out value (loading: false, viewer permissions), so guards bounced
  // permitted deep links — e.g. every admin-system-* tab landed on
  // admin-organization-users and create-contract on the dashboard.
  for (const tab of ['admin-system-rbac', 'create-contract', 'activity-logs']) {
    test(`superuser deep link to ${tab} is not bounced by stale permissions`, async ({ page }) => {
      await openAs(page, 'superuser', `/app?tab=${tab}`);
      await page.waitForTimeout(500);
      expect(tabOf(page)).toBe(tab);
    });
  }

  test('tab the role cannot open is replaced, not pushed', async ({ page }) => {
    await openAs(page, 'viewer', '/app?tab=settings');
    await expect.poll(() => tabOf(page)).toBe('dashboard');
    // The guard used replaceState, so there is no settings entry to go back to.
    const historyLength = await page.evaluate(() => window.history.length);
    expect(historyLength).toBeLessThanOrEqual(2);
  });
});
