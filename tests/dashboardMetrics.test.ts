import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpendingSeries, contractTotalInCurrency } from '../src/lib/dashboardMetrics';
import { formatBusinessDate } from '../src/lib/displayDate';
import type { Contract, PartnerSpending } from '../src/types';
const row = (id: string, months: string[], amount: number) => ({ vendor_id: id, vendor_name: id, invoice_month: months, total_amount: amount }) as PartnerSpending;
const chart = (rows: PartnerSpending[], year = 'ALL') => buildSpendingSeries(rows, year, 'ALL', () => [], r => r.total_amount, 'Other');

test('mixed-currency totals use stored USD amounts rather than adding raw nominal amounts', () => {
  const contracts = [
    { currency: 'USD', nilai_kontrak: 100 },
    { currency: 'IDR', nilai_kontrak: 1600000, nilai_kontrak_usd: 100 },
  ] as Contract[];
  assert.equal(contractTotalInCurrency(contracts, 'USD'), 200);
});
test('all years combines matching months and always returns January through December', () => {
  const result = chart([row('a', ['2025-01-31'], 100), row('a', ['2026-01-31'], 200)]);
  assert.equal(result.data.length, 12);
  assert.equal(result.data[0].month, '01');
  assert.equal(result.data[11].month, '12');
  assert.equal(result.data[0]['vendor:a'], 300);
  assert.equal(result.data[1]['vendor:a'], 0);
});
test('year filters allocate multi-period invoices without moving the full amount into one year', () => {
  const result = chart([row('a', ['2025-12-31', '2026-01-31'], 100)], '2026');
  assert.equal(result.total, 50);
  assert.equal(result.data[0]['vendor:a'], 50);
});
test('vendor colors survive changes in ranking and top-five aggregation preserves totals', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => row(id, ['2026-01-31'], (index + 1) * 10));
  const original = chart(rows);
  const changed = chart([row('f', ['2026-01-31'], 1), row('e', ['2026-01-31'], 99)]);
  assert.equal(original.series.find(s => s.key === 'vendor:f')?.color, changed.series.find(s => s.key === 'vendor:f')?.color);
  assert.equal(original.data[0].other, 10);
  assert.equal(original.total, 210);
});
test('invalid periods are excluded rather than fabricated as January', () => {
  const result = chart([row('a', [], 100)]);
  assert.equal(result.skipped, 1);
  assert.equal(result.total, 0);
});
test('date-only formatting is consistent and missing review dates stay empty', () => {
  assert.equal(formatBusinessDate('2026-07-31', 'en-GB'), formatBusinessDate('31/07/2026', 'en-GB'));
  assert.equal(formatBusinessDate('2026'), '—');
  assert.equal(formatBusinessDate('2026-02-30'), '—');
});
