import { test, expect } from '@playwright/test';
import { defaultTenantSettings, getCountryPack, getIndustryPack } from '../../src/lib/policy';

// These checks never use real sessions or mutate workspace data.
test.beforeEach(async ({ page }) => {
  const settings = defaultTenantSettings();
  await page.addInitScript(() => localStorage.setItem('auth_session_token', 'ui-fixture'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/user/my-role': { email: 'audit@example.com', name: 'UI Audit', role: 'Admin', organizationId: 'audit', allowedTenantIds: ['audit'] },
      '/api/rbac/me': { actor: { role: 'admin', tenantId: 'audit' }, permissions: ['*'] },
      '/api/tenants': { success: true, activeTenantId: 'audit', tenants: [{ id: 'audit', name: 'Audit Workspace' }] },
      '/api/tenant-settings': { tenantId: 'audit', tenantName: 'Audit Workspace', settings, country: getCountryPack(settings.countryCode), industry: getIndustryPack(settings.industry), dueDiligenceChecklist: [] },
      '/api/policy-packs': { countries: [], industries: [] },
      '/api/init-data': { contracts: [], ios: [], partners: [{ partner_id: 'p1', nama_partner: 'Demo Partner', jenis_partner: 'Vendor' }], notifications: [], evaluations: [], spendings: [] },
      '/api/departments': { success: true, departments: [] },
      '/api/documents': { documents: [], total: 0 },
      '/api/dashboard/news-ticker': { items: ['UI news one', 'UI news two'] },
      '/api/auth-console/users': { success: true, users: [] },
      '/api/auth-console/organizations': { success: true, organizations: [{ id: 'audit', name: 'Audit Workspace', slug: 'audit' }] },
      '/api/auth-console/teams': { success: true, teams: [] },
      '/api/auth-console/invitations': { success: true, invitations: [] },
    };
    await route.fulfill({ json: responses[path] ?? {} });
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Latest Regulatory Updates' }).getByRole('listitem').filter({ hasText: 'UI news one' })).toBeVisible();
});

test('admin modal names its fields, traps focus and restores the trigger on desktop and mobile', async ({ page }) => {
  await page.getByRole('button', { name: /^(Organization Admin|Admin Organisasi)$/ }).click();
  const trigger = page.getByRole('button', { name: /^(Add New User|Tambah Pengguna Baru)$/ });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName(/.+/);
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    for (const field of await dialog.locator('input:visible, select:visible, textarea:visible').all()) {
      await expect(field).toHaveAccessibleName(/.+/);
    }
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await expect(page.locator('h1')).toHaveCount(1);
});

test('UI text editor traps keyboard focus and restores focus when closed', async ({ page }) => {
  await page.getByRole('button', { name: /^(Settings|Pengaturan)$/ }).first().click();
  await page.getByRole('button', { name: /^(Open Submenu|Buka Submenu)$/ }).last().click();
  await page.getByRole('button', { name: /^(UI Text & Localization|Teks UI & Lokalisasi)$/ }).first().click();
  const trigger = page.getByRole('button', { name: /^(Open UI Text Editor|Buka Editor Teks UI)$/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(/.+/);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('mobile controls fit, drawer traps focus and restores its trigger', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const controls = page.locator('header button:visible, header select:visible');
    for (const control of await controls.all()) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.getByTitle(/Open.*AI|Buka Asisten AI/i).click();
    const chat = page.locator('[class*="origin-bottom-right"]');
    await expect(chat).toBeVisible();
    const box = await chat.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.getByTitle(/Close AI|Tutup AI/i).last().click();
  }
  await expect(page.getByRole('region', { name: /Latest Regulatory Updates|Info Regulasi Terkini/i })).toContainText('UI news two');
  const trigger = page.locator('header button').first();
  await trigger.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('contract form supports labels, keyboard focus, Escape and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = page.locator('main button').filter({ hasText: /^ACTIVE CONTRACTS/i });
  await card.focus();
  await page.keyboard.press('Enter');
  const add = page.getByRole('button', { name: /^(Add Contract|Tambah Kontrak)$/ });
  await add.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const contractNumber = dialog.locator('input[required][type="text"]').first();
  expect(await contractNumber.evaluate((el: HTMLInputElement) => el.labels?.length)).toBeGreaterThan(0);
  const first = dialog.getByRole('button').first();
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(contractNumber).toHaveCSS('font-size', '16px');
  const categoryInput = dialog.locator('input[list]');
  const categoryRow = categoryInput.locator('..');
  expect(await categoryRow.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await dialog.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
});
