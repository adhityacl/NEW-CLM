import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoDataset } from '../src/data/demoDataset';

test('demo dataset matches the requested organization structure', () => {
  const data = buildDemoDataset();
  assert.deepEqual(data.tenants.map((tenant) => tenant.settings.countryCode), ['ID', 'MY', 'PH']);
  assert.equal(new Set(data.tenants.map((tenant) => tenant.settings.industry)).size, 3);

  const expected = [
    ['org-demo-id', 10, 10, 10, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']],
    ['org-demo-my', 5, 5, 5, ['2026-01', '2026-02', '2026-03']],
    ['org-demo-ph', 0, 0, 0, []],
  ] as const;

  for (const [organizationId, partnerCount, contractCount, ioCount, months] of expected) {
    assert.equal(data.partners.filter((row) => row.organizationId === organizationId).length, partnerCount);
    assert.equal(data.contracts.filter((row) => row.organizationId === organizationId).length, contractCount);
    assert.equal(data.ios.filter((row) => row.organizationId === organizationId).length, ioCount);
    assert.deepEqual(
      [...new Set(data.spendings.filter((row) => row.organizationId === organizationId).flatMap((row) => row.invoice_month.map((value: string) => value.slice(0, 7))))].sort(),
      months,
    );
    const users = data.allowedUsers.filter((row) => row.organizationId === organizationId);
    assert.equal(users.length, 1);
    assert.equal(users[0].role, 'Admin');
  }
});
