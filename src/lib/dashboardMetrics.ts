import { parseAllMonths, parseMonthStr } from './monthUtils';
import { convertToUsdWithFallback, getDefaultUsdRate } from './currencyUtils';
import type { Contract, PartnerSpending } from '../types';

export function contractTotalInCurrency(contracts: Contract[], currency: string): number {
  return contracts.reduce((sum, contract) => {
    const source = contract.currency || currency;
    if (source === currency) return sum + Number(contract.nilai_kontrak || 0);
    const usd = contract.nilai_kontrak_usd ?? convertToUsdWithFallback(contract.nilai_kontrak, source);
    return sum + usd / (getDefaultUsdRate(currency) || 1);
  }, 0);
}

export function vendorColor(id: string): string {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const palette = ['#047857', '#2563eb', '#b45309', '#7c3aed', '#be185d', '#0e7490', '#c2410c', '#475569'];
  return palette[(hash >>> 0) % palette.length];
}

export function buildSpendingSeries(rows: PartnerSpending[], year: string, category: string,
  categories: (row: PartnerSpending) => string[], amount: (row: PartnerSpending) => number,
  otherLabel: string) {
  const values: { period: string; id: string; name: string; value: number }[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (category !== 'ALL' && !categories(row).some(c => c.toLowerCase() === category.toLowerCase())) continue;
    let months = (row.invoice_month || []).flatMap(parseAllMonths);
    if (!months.length) { const month = parseMonthStr(row.invoice_date || ''); if (month) months = [month]; }
    const periods = [...new Set(months.map(m => `${m.year}-${m.month}`))];
    if (!periods.length) { skipped++; continue; }
    const value = amount(row) / periods.length;
    for (const period of periods.filter(p => year === 'ALL' || p.startsWith(year + '-'))) {
      values.push({ period, id: row.vendor_id || row.vendor_name || 'unknown', name: row.vendor_name || otherLabel, value });
    }
  }
  const totals = new Map<string, { name: string; total: number }>();
  for (const row of values) {
    const previous = totals.get(row.id);
    totals.set(row.id, { name: row.name, total: (previous?.total || 0) + row.value });
  }
  const top = [...totals].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const series = top.map(([id, item]) => ({ key: `vendor:${id}`, name: item.name, color: vendorColor(id) }));
  if (totals.size > 5) series.push({ key: 'other', name: otherLabel, color: '#64748b' });
  const topIds = new Set(top.map(([id]) => id));
  const buckets = new Map<string, Record<string, number>>();
  for (const row of values) {
    const period = year === 'ALL' ? row.period.slice(5) : row.period;
    const bucket = buckets.get(period) || {};
    const key = topIds.has(row.id) ? `vendor:${row.id}` : 'other';
    bucket[key] = (bucket[key] || 0) + row.value;
    buckets.set(period, bucket);
  }
  const data = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const period = year === 'ALL' ? month : `${year}-${month}`;
    return { month: period, ...Object.fromEntries(series.map(s => [s.key, buckets.get(period)?.[s.key] || 0])) };
  });
  return { data, series, total: values.reduce((sum, row) => sum + row.value, 0), skipped };
}
