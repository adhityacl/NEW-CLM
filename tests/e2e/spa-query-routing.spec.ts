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

  // PRD §6.2: unrecognized IDs are rejected with a generic denial, not silently remapped.
  test('unknown tab shows access denied with a permitted destination', async ({ page }) => {
    await openAs(page, 'admin', '/app?tab=does-not-exist');
    await expect(page.getByRole('heading', { name: 'You do not have access to this page' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to an allowed page', exact: true }).click();
    await expect.poll(() => tabOf(page)).toBe('dashboard');
  });

  // Regression: right after sign-in a stale or signed-out permission state
  // bounced permitted deep links. Platform tabs need no organization.
  for (const tab of ['admin-system-rbac', 'admin-system-settings']) {
    test(`superuser deep link to ${tab} is not bounced by stale permissions`, async ({ page }) => {
      await openAs(page, 'superuser', `/app?tab=${tab}`);
      await page.waitForTimeout(500);
      expect(tabOf(page)).toBe(tab);
    });
  }

  test('admin deep link to a permitted tab is not bounced while capabilities load', async ({ page }) => {
    await openAs(page, 'admin', '/app?tab=create-contract');
    await page.waitForTimeout(500);
    expect(tabOf(page)).toBe('create-contract');
    await expect(page.getByRole('button', { name: 'New Document', exact: true })).toBeVisible();
  });

  test('legacy alias is replaced, not pushed', async ({ page }) => {
    await openAs(page, 'admin', '/app?tab=settings-region');
    await expect.poll(() => tabOf(page)).toBe('settings-organization');
    // The alias used replaceState, so there is no old entry to go back to.
    const historyLength = await page.evaluate(() => window.history.length);
    expect(historyLength).toBeLessThanOrEqual(2);
  });

  test('tab the role cannot open is denied before any Settings content mounts', async ({ page }) => {
    await openAs(page, 'viewer', '/app?tab=settings');
    await expect(page.getByRole('heading', { name: 'You do not have access to this page' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toHaveCount(0);
  });
});
