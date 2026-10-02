import { test, expect } from '@playwright/test';
import { buildDemoDataset } from '../../src/data/demoDataset';
import { getCountryPack, getIndustryPack } from '../../src/lib/policy';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

test.beforeEach(async ({ page }) => {
  const data = buildDemoDataset();
  data.contracts[0].status = 'Expiring';
  data.contracts[0].sisa_hari = 65;
  data.contracts[0].created_at = daysAgo(10);
  data.ios[0].status = 'Expiring';
  data.ios[0].sisa_hari = 20;
  data.ios[0].created_at = daysAgo(5);
  const tenant = data.tenants[0];
  const settings = { ...tenant.settings, modules: { ...tenant.settings.modules, newsTicker: true } };
  await page.addInitScript(() => {
    localStorage.setItem('auth_session_token', 'ui-demo');
    localStorage.setItem('app_language', 'EN');
  });
  await page.route('**/api/**', async route => {
    const fixtures: Record<string, unknown> = {
      '/api/user/my-role': { email: 'audit@example.com', name: 'UI Audit', role: 'Admin', organizationId: tenant.id },
      '/api/rbac/me': { actor: { role: 'admin', tenantId: tenant.id }, permissions: ['*'] },
      '/api/tenants': { success: true, activeTenantId: tenant.id, tenants: [tenant] },
      '/api/tenant-settings': { settings, tenantId: tenant.id, country: getCountryPack(settings.countryCode), industry: getIndustryPack(settings.industry), dueDiligenceChecklist: [] },
      '/api/policy-packs': { countries: [], industries: [] },
      '/api/init-data': Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.filter((row: any) => !row.organizationId || row.organizationId === tenant.id)])),
      '/api/departments': { success: true, departments: ['Legal', 'Finance'] },
      '/api/documents': { documents: [], total: 0 },
      '/api/dashboard/news-ticker': { items: ['Test news'] },
    };
    await route.fulfill({ json: fixtures[new URL(route.request().url()).pathname] ?? {} });
  });
  await page.goto('/');
  await expect(page.getByText('Test news')).toBeVisible();
});

test('requiring action table combines contracts and order forms', async ({ page }) => {
  const section = page.getByRole('region', { name: 'Expiring Documents', exact: true }).first();
  const headers = section.locator('thead th');
  await expect(headers.nth(1)).toHaveText('Document Name');
  await expect(headers.nth(2)).toHaveText('Type');
  await expect(section.locator('tbody tr')).toHaveCount(2);
  await expect(section.locator('tbody')).toContainText('Master Services Agreement PT Mitra Nusantara 01');
  await expect(section.locator('tbody')).toContainText('2026 Service Order PT Mitra Nusantara 01');
  const latestHeaders = page.getByRole('region', { name: 'Latest Documents', exact: true }).first().locator('thead th');
  const expiringColumns = await headers.evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().x)));
  const latestColumns = await latestHeaders.evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().x)));
  expect(latestColumns).toEqual(expiringColumns);
});

test('latest records combine contracts and order forms in creation order', async ({ page }) => {
  const data = buildDemoDataset();
  data.contracts[0].created_at = daysAgo(10);
  data.ios[0].created_at = daysAgo(5);
  const tenantId = data.tenants[0].id;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const records = [
    ...data.contracts.filter(record => !record.organizationId || record.organizationId === tenantId).map(record => ({ title: record.judul_kontrak, createdAt: record.created_at })),
    ...data.ios.filter(record => !record.organizationId || record.organizationId === tenantId).map(record => ({ title: record.judul_io, createdAt: record.created_at })),
  ].filter(record => Date.parse(record.createdAt) >= cutoff.getTime()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const section = page.getByRole('region', { name: 'Latest Documents', exact: true }).first();
  await expect(section.locator('tbody tr')).toHaveCount(records.length);
  await expect(section.locator('tbody tr').first()).toContainText(records[0].title);
  const checkboxes = section.locator('input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(records.length + 1);
  for (const checkbox of await checkboxes.all()) await expect(checkbox).toBeDisabled();
  await section.getByRole('button', { name: `Open ${records[0].title}` }).click();
  await expect(section).toBeHidden();
});

test('create document toolbar exposes the four standard filters', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Document', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search Document', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Document Status', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Document Type', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Created By', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveCount(0);
  for (const column of ['Name', 'Type', 'Status', 'Modified', 'Created by', 'Action']) {
    await expect(page.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('columnheader', { name: 'Created', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Size', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Created', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Created', exact: true }).check();
  await expect(page.getByRole('columnheader', { name: 'Created', exact: true })).toBeVisible();
});

test('mobile editor keeps a usable canvas and opens its panel as a dismissible overlay', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Document', exact: true }).click();
  await page.getByRole('button', { name: 'New Document', exact: true }).first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = page.locator('.tiptap.ProseMirror:visible');
  await expect.poll(async () => (await editor.boundingBox())!.width).toBeGreaterThan(200);
  await editor.fill('A draft that remains editable on mobile.');
  const toggle = page.getByTitle(/Toggle.*Panel|Open.*Panel|Form.*Clause|Buka.*Panel/i);
  await toggle.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(editor).toContainText('A draft that remains editable on mobile.');
});

test('table actions support keyboard dismissal; identity remains visible while scrolling', async ({ page }) => {
  await page.getByRole('button', { name: 'Contracts', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Actions', exact: true }).first();
  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('no matching result');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  const scroller = page.locator('.data-table-scroll');
  await scroller.evaluate(el => { el.scrollLeft = 500; });
  const identity = page.locator('tbody tr').first().locator('td').nth(1);
  const rect = await identity.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('combobox', { name: 'Document type' })).toBeVisible();
});

for (const [section, add] of [['Partners', 'Add Partner'], ['Order Forms', 'Add Order Form'], ['Partner Spending', 'Add Spending'], ['Partner Evaluation', 'Add Evaluation']]) {
  test(`${section} form uses a labelled dialog with focus restoration`, async ({ page }) => {
    if (section.startsWith('Partner ')) await page.getByRole('button', { name: 'Partners', exact: true }).click();
    await page.getByRole('button', { name: section, exact: true }).click();
    const trigger = page.getByRole('button', { name: add, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/.+/);
    await page.setViewportSize({ width: 320, height: 740 });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('chart exposes every month, has theme colors and keeps dashboard checkboxes disabled', async ({ page }) => {
  await expect(page.getByRole('combobox', { name: 'Year', exact: true })).toHaveValue(String(new Date().getFullYear()));
  await expect(page.locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(12);
  await expect(page.locator('.recharts-cartesian-grid')).toBeVisible();
  for (const checkbox of await page.locator('.dashboard-data-table input[type="checkbox"]').all()) await expect(checkbox).toBeDisabled();
  await page.getByRole('button', { name: /Switch to Dark Mode/i }).click();
  expect(await page.locator('.recharts-wrapper').evaluate(el => getComputedStyle(el).getPropertyValue('--chart-grid').trim())).toBe('#334155');
  await page.setViewportSize({ width: 390, height: 844 });
  const chartControls = [
    page.getByRole('combobox', { name: 'Year', exact: true }),
    page.getByRole('combobox', { name: 'Category', exact: true }),
    page.getByRole('group', { name: 'Reporting currency', exact: true }),
  ];
  const controlBoxes = await Promise.all(chartControls.map(control => control.boundingBox()));
  expect(Math.max(...controlBoxes.map(box => box!.y)) - Math.min(...controlBoxes.map(box => box!.y))).toBeLessThan(2);
  expect(Math.max(...controlBoxes.map(box => box!.height)) - Math.min(...controlBoxes.map(box => box!.height))).toBeLessThan(2);
  const chart = page.locator('.recharts-responsive-container');
  const chartBox = await chart.boundingBox();
  expect(chartBox!.width).toBeLessThanOrEqual(358);
  expect(chartBox!.width).toBeGreaterThan(280);
  expect(chartBox!.height).toBeGreaterThanOrEqual(220);
});
