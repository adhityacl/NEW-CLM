import { test, expect } from '@playwright/test';
import { buildDemoDataset } from '../../src/data/demoDataset';
import { getCountryPack, getIndustryPack } from '../../src/lib/policy';
import type { Locator } from '@playwright/test';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function expectReadableAction(button: Locator, height: number) {
  await expect(button).toBeVisible();
  const layout = await button.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textFits = true;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || node.parentElement?.closest('.sr-only')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        textFits &&= rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
          && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
      }
    }
    return { height: bounds.height, width: bounds.width, textFits };
  });
  expect(layout.height).toBe(height);
  expect(layout.width).toBeGreaterThan(height);
  expect(layout.textFits).toBe(true);
}

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
  await expect(page.getByText('Test news').first()).toBeVisible();
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
  await page.getByRole('button', { name: 'My Documents', exact: true }).click();
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

test('header controls align, desktop checkboxes stay 14px and dropdowns share Contracts styling', async ({ page }) => {
  // Selects use transition-colors; without this the dark-mode comparison can
  // sample a color mid-transition and compare unequal intermediate values.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const controls = page.locator('.app-header-control:visible');
  for (const control of await controls.all()) {
    const bounds = await control.boundingBox();
    expect(bounds!.width).toBe(44);
    expect(bounds!.height).toBe(44);
  }
  expect((await page.locator('.app-header-languages').boundingBox())!.height).toBe(44);
  for (const icon of await page.locator('.app-header-control > svg:visible').all()) {
    expect((await icon.boundingBox())!.height).toBe(18);
  }
  await page.getByRole('button', { name: /^Contracts(?: \d+)?$/ }).click();
  for (const checkbox of await page.locator('input[type="checkbox"]:visible').all()) {
    expect((await checkbox.boundingBox())!.width).toBe(14);
    expect((await checkbox.boundingBox())!.height).toBe(14);
  }
  const dropdownStyle = (select: ReturnType<typeof page.getByRole>) => select.evaluate(element => {
    const css = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, radius: css.borderRadius, border: css.borderColor, background: css.backgroundColor, color: css.color, fontSize: css.fontSize, fontWeight: css.fontWeight, arrow: css.backgroundImage, arrowSize: css.backgroundSize, padding: css.padding };
  });
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await page.getByRole('button', { name: /^Contracts(?: \d+)?$/ }).click();
    const reference = await dropdownStyle(page.getByRole('combobox').first());
    expect(reference.height).toBe(44);
    for (const select of await page.locator('select:visible').all()) expect(await dropdownStyle(select)).toEqual(reference);
    await page.getByRole('button', { name: 'My Documents', exact: true }).click();
    for (const select of await page.locator('select:visible').all()) expect(await dropdownStyle(select)).toEqual(reference);
    await page.getByRole('button', { name: /^Contracts(?: \d+)?$/ }).click();
    await page.getByRole('button', { name: 'Add Contract', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const select of await page.getByRole('dialog').locator('select:visible').all()) expect(await dropdownStyle(select)).toEqual(reference);
    await page.getByRole('dialog').getByRole('button', { name: /close/i }).first().focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    for (const submenu of await page.getByRole('button', { name: /^(Open|Close) Submenu$/ }).all()) {
      await submenu.hover();
      await expect(submenu).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  }
  await page.screenshot({ path: test.info().outputPath('controls-desktop-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of await controls.all()) expect((await control.boundingBox())!.height).toBe(44);
  for (const select of await page.locator('select:visible').all()) expect((await select.boundingBox())!.height).toBe(44);
  await page.screenshot({ path: test.info().outputPath('controls-mobile-dark.png'), fullPage: true });
});

test('single-line inputs and selects share one height and font size across core forms', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fieldSelector = [
    'input:visible:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
    'select:visible:not([multiple])',
    'button[role="combobox"]:visible',
  ].join(', ');

  const checkDialog = async () => {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const fields = dialog.locator(fieldSelector);
    expect(await fields.count()).toBeGreaterThan(1);
    const fontSizes = new Set<string>();
    for (const field of await fields.all()) {
      expect((await field.boundingBox())!.height).toBe(44);
      fontSizes.add(await field.evaluate(element => getComputedStyle(element).fontSize));
    }
    expect([...fontSizes]).toEqual(['14px']);
    await dialog.getByRole('button', { name: /close/i }).first().click();
    await expect(dialog).toBeHidden();
  };

  await page.getByRole('button', { name: /^Contracts(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Add Contract', exact: true }).click();
  await checkDialog();

  await page.getByRole('button', { name: 'Partners', exact: true }).click();
  await page.getByRole('button', { name: 'Add Partner', exact: true }).click();
  await checkDialog();

  await page.getByRole('button', { name: 'Partner Spending', exact: true }).click();
  await page.getByRole('button', { name: 'Add Spending', exact: true }).click();
  await checkDialog();
});

test('New Document matches primary action styling on desktop and mobile in both themes', async ({ page }) => {
  const style = (button: ReturnType<typeof page.getByRole>) => button.evaluate(element => {
    const css = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, radius: css.borderRadius, fontSize: css.fontSize, fontWeight: css.fontWeight, background: css.backgroundColor, color: css.color };
  });
  const navigate = async (name: string | RegExp) => {
    const link = page.getByRole('button', { name, exact: true }).first();
    if (!await link.isVisible()) await page.getByRole('button', { name: 'Open Navigation Menu', exact: true }).click();
    await link.click();
  };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await navigate(/^Contracts(?: \d+)?$/);
      const reference = await style(page.getByRole('button', { name: 'Add Contract', exact: true }));
      await navigate('My Documents');
      const newDocument = page.getByRole('button', { name: 'New Document', exact: true });
      await expect(newDocument).toBeVisible();
      expect(await style(newDocument)).toEqual(reference);
      expect((await newDocument.boundingBox())!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 36);
    }
  }
});

test('large, medium and small actions keep icon-and-text labels inside their buttons', async ({ page }) => {
  test.setTimeout(90_000);
  for (const width of [1440, 390]) {
    const navigate = async (name: string | RegExp) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name, exact: true }).first().click();
      await page.setViewportSize({ width, height: 1000 });
    };
    await navigate('Main Dashboard');
    const currencies = page.getByRole('group', { name: 'Reporting currency', exact: true });
    await expectReadableAction(currencies.getByRole('button', { name: 'USD', exact: true }), 28);

    await page.setViewportSize({ width: 1440, height: 1000 });
    const regionLink = page.getByRole('button', { name: 'Organization & region', exact: true });
    if (!await regionLink.isVisible()) {
      await page.getByRole('button', { name: 'Settings', exact: true }).locator('..')
        .getByRole('button', { name: 'Open Submenu', exact: true }).click();
    }
    await regionLink.click();
    await page.setViewportSize({ width, height: 1000 });
    await expectReadableAction(page.getByRole('button', { name: 'Save organization settings', exact: true }), 44);
    await expectReadableAction(page.getByRole('button', { name: 'Add checklist item', exact: true }), 36);

    await navigate('Partners');
    await expectReadableAction(page.getByRole('button', { name: 'Add Partner', exact: true }), 44);
    await page.getByRole('button', { name: 'Add Partner', exact: true }).click();
    await expectReadableAction(page.getByRole('dialog').getByRole('button', { name: 'Add identifier', exact: true }), 36);
    await page.keyboard.press('Escape');

    await navigate('Partner Spending');
    await page.getByRole('button', { name: 'Add Spending', exact: true }).click();
    await expectReadableAction(page.getByRole('dialog').getByRole('button', { name: 'Add Month', exact: true }), 36);
    await page.keyboard.press('Escape');

    await navigate(/^(Explorer|Explore|Document Structure)$/);
    await page.getByRole('tab', { name: 'Structure Audit', exact: true }).click();
    for (const button of await page.locator('main .mobile-page-actions:not([role="tablist"]) button').all()) {
      await expectReadableAction(button, 36);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});

test('draft history small actions retain readable text on desktop and mobile', async ({ page }) => {
  test.setTimeout(60_000);
  const now = new Date().toISOString();
  const document = {
    id: 'button-history', organization_id: buildDemoDataset().tenants[0].id,
    name: 'Button history fixture', content: '<p>Saved draft</p>', type: 'contract', status: 'draft',
    file_size: 40, current_version: 2, draft_count: 2, created_by: 'audit@example.com',
    created_by_name: 'UI Audit', modified_by: null, modified_by_name: null, created_at: now, modified_at: now,
  };
  await page.route('**/api/documents**', route => {
    const path = new URL(route.request().url()).pathname;
    const response = path.endsWith('/drafts') ? [2, 1].map(version_number => ({
      version_number, draft_name: null, labels: [], file_size: 40, save_kind: 'manual',
      restored_from: null, saved_by: 'audit@example.com', saved_by_name: 'UI Audit', saved_at: now,
    })) : path === '/api/documents' ? { documents: [document], total: 1, page: 1, limit: 25, creators: [] } : document;
    return route.fulfill({ json: response });
  });
  await page.getByRole('button', { name: 'My Documents', exact: true }).click();
  await page.getByRole('button', { name: document.name, exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  const panel = page.locator('.editor-panel-content');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width < 1024) {
      const toggle = page.getByTitle(/Toggle.*Panel|Open.*Panel|Form.*Clause|Buka.*Panel/i);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    await expect(panel).toBeVisible();
    for (const action of ['View', 'Compare', 'Restore', 'Name']) {
      await expectReadableAction(panel.getByRole('button', { name: action, exact: true }).first(), 28);
    }
    await page.screenshot({ path: test.info().outputPath(`history-buttons-${width}.png`), fullPage: true });
  }
});

test('mobile editor keeps a usable canvas and opens its panel as a dismissible overlay', async ({ page }) => {
  await page.getByRole('button', { name: 'My Documents', exact: true }).click();
  await page.getByRole('button', { name: 'New Document', exact: true }).first().click();
  await page.getByRole('button', { name: 'Blank document', exact: true }).click();
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

test('table actions support keyboard dismissal; mobile identity scrolls without freezing', async ({ page }) => {
  await page.getByRole('button', { name: /^Contracts(?: \d+)?$/ }).click();
  await expect(page.getByRole('button', { name: 'Add Contract', exact: true })).toBeVisible();
  const originalRowCount = await page.locator('tbody tr').count();
  const trigger = page.getByRole('button', { name: 'Actions', exact: true }).first();
  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('no matching result');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(originalRowCount);
  await page.setViewportSize({ width: 390, height: 844 });
  const scroller = page.locator('.data-table-scroll');
  await scroller.evaluate(el => { el.scrollLeft = 500; });
  const identity = page.locator('tbody tr').first().locator('td').nth(1);
  const rect = await identity.boundingBox();
  expect(rect!.x).toBeLessThan(0);
  await expect(identity).toHaveCSS('position', 'static');
  await expect(page.getByRole('combobox', { name: 'Document type' })).toBeVisible();
});

test('Contracts mobile layout is justified without a visible breadcrumb, scroll hint or frozen identity', async ({ page }) => {
  await page.getByRole('button', { name: /^Contracts(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Add Contract', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const actions = page.locator('.contracts-mobile-actions');
  const filters = page.locator('.contracts-mobile-filters');
  const desktop = await actions.evaluate(element => {
    const css = getComputedStyle(element);
    return { display: css.display, width: element.getBoundingClientRect().width, gap: css.gap };
  });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      const language = page.locator('header select:visible');
      await expect(language).toHaveValue('EN');
      expect(await language.evaluate(element => {
        const css = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        context.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
        return element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) > context.measureText('EN').width;
      })).toBe(true);
      await expect(page.locator('.app-header > div:first-child > div')).toHaveCSS('clip-path', 'inset(50%)');
      const buttons = await actions.locator('button').all();
      const first = (await buttons[0].boundingBox())!;
      const second = (await buttons[1].boundingBox())!;
      expect(first.y).toBe(second.y);
      expect(first.width).toBeCloseTo(second.width, 0);
      const fields = await filters.locator(':scope > *').all();
      const search = (await fields[0].boundingBox())!;
      expect(search.width).toBeCloseTo((await filters.boundingBox())!.width, 0);
      for (const [left, right] of [[1, 2], [3, 4]]) {
        const a = (await fields[left].boundingBox())!;
        const b = (await fields[right].boundingBox())!;
        expect(a.y).toBe(b.y);
        expect(a.width).toBeCloseTo(b.width, 0);
      }
      await expect(page.locator('.mobile-table-hint')).toBeHidden();
      await expect(page.locator('tbody tr').first().locator('td').nth(1)).toHaveCSS('position', 'static');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      if (width === 390 && dark) await page.screenshot({ path: test.info().outputPath('contracts-mobile-justified.png'), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => actions.evaluate(element => {
    const css = getComputedStyle(element);
    return { display: css.display, width: element.getBoundingClientRect().width, gap: css.gap };
  })).toEqual(desktop);
  await expect(page.locator('.app-header h1')).toBeVisible();
  await expect(filters).toHaveCSS('display', 'flex');
});

for (const section of ['Main Dashboard', 'Partners', 'Order Forms', 'Partner Spending', 'Partner Evaluation', 'Notifications', 'My Documents', 'Activity Logs', 'Import Data', 'Explorer']) {
  test(`${section} shares justified mobile controls and scrollable tables`, async ({ page }) => {
    if (section.startsWith('Partner ')) await page.getByRole('button', { name: 'Partners', exact: true }).click();
    const navigation = section === 'Order Forms' ? /^(Order Forms|Service Orders)(?: \d+)?$/
      : section === 'Notifications' ? /^Notifications(?: \d+)?$/
      : section === 'Activity Logs' ? /^(Session )?Activity Logs$/
      : section === 'Explorer' ? /^(Explorer|Explore|Document Structure)$/ : section;
    await page.getByRole('button', { name: navigation, exact: true }).click();
    await expect(page.locator('main')).toBeVisible();
    if (section === 'Explorer') await page.getByRole('tab', { name: 'Structure Audit', exact: true }).click();
    if (section === 'Import Data') {
      await page.locator('main input[type="file"]').setInputFiles({ name: 'mobile-preview.csv', mimeType: 'text/csv', buffer: Buffer.from('nama_partner,partner_channel,country\nFixture Partner,Procurement,ID\n') });
      await expect(page.locator('main table')).toContainText('Fixture Partner');
    }
    const controls = page.locator('main .mobile-page-actions, main .mobile-filter-grid');
    await expect(controls.first()).toBeVisible();
    const desktop = await controls.evaluateAll(elements => elements.map(element => getComputedStyle(element).display));
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
        for (const control of await controls.all()) {
          await expect(control).toHaveCSS('display', 'grid');
          const box = (await control.boundingBox())!;
          for (const field of await control.locator(':scope > :visible:not(.sr-only)').all()) {
            const bounds = (await field.boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(box.x - 1);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width + 1);
          }
        }
        for (const table of await page.locator('main table:visible').all()) {
          expect(await table.evaluate(element => getComputedStyle(element.parentElement!).overflowX)).toMatch(/auto|scroll/);
          for (const cell of await table.locator('tbody tr:first-child > td:nth-child(-n+2)').all()) {
            await expect(cell).not.toHaveCSS('position', 'sticky');
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      }
    }
    await page.screenshot({ path: test.info().outputPath(`${section.replaceAll(' ', '-')}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    expect(await controls.evaluateAll(elements => elements.map(element => getComputedStyle(element).display))).toEqual(desktop);
  });
}

test('all admin tabs keep mobile controls contained and tables scrollable', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/api/user/my-role*', route => route.fulfill({ json: { email: 'audit@example.com', name: 'UI Audit', role: 'Superuser' } }));
  await page.route('**/api/rbac/me', route => route.fulfill({ json: { actor: { role: 'superuser' }, permissions: ['*'] } }));
  await page.reload();
  await page.getByRole('button', { name: 'System Admin', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'System Admin' })).toBeVisible();
  for (const tab of ['Dashboard', 'Users', 'Sessions', 'Organizations', 'Departments', 'Invitations', 'API Keys', 'RBAC Matrix']) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('tab', { name: new RegExp(`^${tab}(?: \\d+)?$`) }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const control of await panel.locator('.mobile-controls-bar').all()) {
        const box = (await control.boundingBox())!;
        for (const field of await control.locator(':scope > :visible').all()) {
          const bounds = (await field.boundingBox())!;
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width + 1);
        }
      }
      for (const table of await panel.locator('table:visible').all()) {
        expect(await table.evaluate(element => getComputedStyle(element.parentElement!).overflowX)).toMatch(/auto|scroll/);
        await expect(table.locator('th').first()).not.toHaveCSS('position', 'sticky');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    }
    await page.screenshot({ path: test.info().outputPath(`admin-${tab.replaceAll(' ', '-')}-mobile.png`), fullPage: true });
  }
});

test('all settings pages and UI text modal keep mobile controls contained', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/api/auth-console/sqlite/**', route => {
    const path = new URL(route.request().url()).pathname;
    const fixtures: Record<string, unknown> = {
      '/api/auth-console/sqlite/status': { success: true, status: 'healthy', journalMode: 'wal', version: '3.50.0', fileSizeBytes: 4096, pageCount: 1, pageSize: 4096, modifiedAt: null, tablesCount: 1, totalRecords: 1, tableSummaries: { contracts: 1 } },
      '/api/auth-console/sqlite/tables': { success: true, tables: [{ name: 'contracts', count: 1, columnsCount: 2 }] },
      '/api/auth-console/sqlite/table-data': { success: true, table: 'contracts', columns: [{ cid: 0, name: 'id', type: 'TEXT', pk: 1 }, { cid: 1, name: 'title', type: 'TEXT', pk: 0 }], rows: [{ id: 'fixture-1', title: 'Fixture contract' }], total: 1, limit: 15, offset: 0 },
    };
    return route.fulfill({ json: fixtures[path] ?? {} });
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).locator('..').getByRole('button', { name: 'Open Submenu', exact: true }).click();
  for (const label of ['Organization & region', 'Google & Database', 'AI Model & Parser', 'Notification Recipients', 'UI Text & Localization', 'Security & Maintenance']) {
    await page.setViewportSize({ width: 1280, height: 720 });
    const link = page.getByRole('button', { name: label, exact: true });
    await link.click();
    await expect(page.locator('main')).toContainText(label);
    if (label === 'Google & Database') await expect(page.locator('main table')).toContainText('Fixture contract');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      if (label === 'Google & Database') {
        const search = page.locator('.mobile-search-form');
        await expect(search.getByRole('textbox')).toBeVisible();
        expect((await search.getByRole('textbox').boundingBox())!.width).toBeGreaterThan(80);
        expect(await page.locator('main table').evaluate(element => getComputedStyle(element.parentElement!).overflowX)).toBe('auto');
      }
    }
    if (label === 'UI Text & Localization') {
      await page.getByRole('button', { name: 'Open UI Text Editor', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.mobile-page-actions')).toHaveCSS('display', 'grid');
      expect(await dialog.locator('table').evaluate(element => getComputedStyle(element.parentElement!).overflowX)).toBe('auto');
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await page.screenshot({ path: test.info().outputPath('ui-text-mobile.png'), fullPage: true });
      await page.keyboard.press('Escape');
    }
  }
});

for (const [section, add] of [['Partners', 'Add Partner'], ['Order Forms', 'Add Order Form'], ['Partner Spending', 'Add Spending'], ['Partner Evaluation', 'Add Evaluation']]) {
  test(`${section} form uses a labelled dialog with focus restoration`, async ({ page }) => {
    if (section.startsWith('Partner ')) await page.getByRole('button', { name: 'Partners', exact: true }).click();
    await page.getByRole('button', { name: section === 'Order Forms' ? /^(Order Forms|Service Orders)(?: \d+)?$/ : section, exact: true }).click();
    const trigger = page.getByRole('button', { name: add === 'Add Order Form' ? /^Add (Order Form|Service Order)$/ : add, exact: true });
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
  expect(Math.abs(controlBoxes[0]!.y - controlBoxes[1]!.y)).toBeLessThan(2);
  expect(controlBoxes[0]!.width).toBeCloseTo(controlBoxes[1]!.width, 0);
  expect(controlBoxes[2]!.y).toBeGreaterThan(controlBoxes[0]!.y + controlBoxes[0]!.height);
  expect(controlBoxes[2]!.width).toBeCloseTo((await page.locator('main .mobile-filter-grid').boundingBox())!.width, 0);
  const chart = page.locator('.recharts-responsive-container');
  const chartBox = await chart.boundingBox();
  expect(chartBox!.width).toBeLessThanOrEqual(358);
  expect(chartBox!.width).toBeGreaterThan(280);
  expect(chartBox!.height).toBeGreaterThanOrEqual(220);
});

for (const width of [1440, 390]) {
  test(`document editor panels stay usable at ${width}px in both themes`, async ({ page }) => {
    await page.route('**/api/metadata-fields', route => route.fulfill({ json: [] }));
    await page.route('**/api/templates*', route => route.fulfill({ json: [] }));
    await page.getByRole('button', { name: 'My Documents', exact: true }).click();
    await page.getByRole('button', { name: 'New Document', exact: true }).first().click();
    await page.getByRole('button', { name: 'Blank document', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    if (width < 1024) {
      await page.getByTitle(/Toggle.*Panel|Open.*Panel|Form.*Clause|Buka.*Panel/i).click();
    }
    const tabs = page.locator('.editor-panel-nav [role="tab"]');
    await expect(tabs).toHaveCount(7);
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      for (const tab of await tabs.all()) {
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        const panel = page.locator('.editor-panel-content');
        await expect(panel).toBeVisible();
        expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        for (const button of await panel.locator('button:visible').all()) {
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(width < 1024 ? 44 : 36);
        }
      }
      await expect(page.getByText('Select text in the document, then choose Comment or Suggest Change.', { exact: false })).toHaveCount(0);
      await expect(page.getByText('AI reviews the whole document against', { exact: false })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'AI Redlining', exact: true })).toBeVisible();
    }
    await tabs.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(3).click();
    const slots = page.locator('.tiptap.ProseMirror [data-slot-key]');
    const previousSlots = await slots.count();
    const insert = page.getByRole('button', { name: /^Insert field:/ }).first();
    await insert.focus();
    await page.keyboard.press('Enter');
    await expect(slots).toHaveCount(previousSlots + 1);
    await tabs.last().click();
    await page.screenshot({ path: `/tmp/editor-panels-${width}.png` });
  });
}

test('Parties panel selects a registered partner and edits both agreement parties', async ({ page }) => {
  await page.route('**/api/templates*', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'My Documents', exact: true }).click();
  await page.getByRole('button', { name: 'New Document', exact: true }).first().click();
  await page.getByRole('button', { name: 'Blank document', exact: true }).click();
  await page.getByRole('tab', { name: 'Parties', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Parties', exact: true })).toBeVisible();
  const partnerSelect = page.getByRole('combobox', { name: 'Select Existing Partner', exact: true });
  expect(await partnerSelect.evaluate(element => element.closest('details')?.textContent?.includes('Second Party'))).toBe(true);
  await partnerSelect.selectOption({ index: 1 });

  const secondPartyName = page.getByRole('textbox', { name: 'Second Party Company Name', exact: true });
  const firstPartyName = page.getByRole('textbox', { name: 'First Party Company Name', exact: true });
  await expect(secondPartyName).toHaveValue(/PT Mitra Nusantara/);
  await expect(firstPartyName).not.toHaveValue('');

  await secondPartyName.fill('Edited Second Party Ltd.');
  await firstPartyName.fill('Edited First Party Ltd.');
  const editor = page.locator('.tiptap.ProseMirror:visible');
  await expect(editor).toContainText('Edited Second Party Ltd.');
  await expect(editor).toContainText('Edited First Party Ltd.');

  const secondPartySection = page.locator('details').filter({ hasText: 'Second Party' }).first();
  await secondPartySection.locator('summary').click();
  await expect(secondPartyName).toBeHidden();
  await secondPartySection.locator('summary').click();
  await expect(secondPartyName).toBeVisible();
  await page.locator('.editor-panel-content').evaluate(element => element.scrollTo({ top: 0 }));
  await page.screenshot({ path: '/tmp/document-editor-parties-1440.png' });

  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const dialog = page.getByRole('dialog');
    if (!(await dialog.isVisible())) {
      await page.getByTitle(/Toggle.*Panel|Open.*Panel|Form.*Clause|Buka.*Panel/i).click();
    }
    await expect(dialog.getByRole('heading', { name: 'Parties', exact: true })).toBeVisible();
    const panel = dialog.locator('.editor-panel-content');
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await panel.evaluate(element => element.scrollTo({ top: 0 }));
    await page.screenshot({ path: `/tmp/document-editor-parties-${width}.png` });
  }
});
